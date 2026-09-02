#!/usr/bin/env node
// The studio console, as a STANDALONE process.
//
// Why this exists (2026-07-28): `preview` (the MCP tool) hosts the console
// INSIDE the MCP server process — and that process is a child of the agent
// process, which the Claude Code desktop app respawns routinely (observed:
// three MCP server pids in one working day, each respawn one second after a
// new parent). Every respawn killed the console under the human's cursor:
// the page went "disconnected", then the port stopped answering entirely.
//
// A console is the human's window, not the agent's scratch state. It must
// outlive whatever agent session happened to open it. Run this detached and
// it survives every respawn:
//
//   nohup node inspector/mcp/bin/console.mjs <projectDir> [port] >/tmp/console.log 2>&1 &
//
// The MCP `preview` tool already ADOPTS a console it finds running in another
// process (CMP_CONSOLE_ALREADY_RUNNING -> `reusedExternal: true`), so a
// console started here is picked up by any later agent session rather than
// fought with — one console per project, whoever started it.
//
// Deliberately thin: all behavior lives in ../src/lib/preview-service.mjs,
// the same module the MCP server imports. This file only owns process
// lifetime — which is the entire point of it existing.
//
// SUPERVISOR + WORKER (docs/features/studio-self-renewal.md R2). Process
// lifetime now includes one more duty: adopting new code. A node process
// cannot replace its own module graph, so the console that detects its own
// staleness could only ever ask a human to restart it — and the only human
// who could was the one being asked to interrupt the work they were watching.
// So this file runs twice: once as a supervisor that owns nothing but the
// child, and once (--worker) as the service itself. The worker exits EX_RENEW
// when its sources change and nothing is in flight; the supervisor respawns
// it, and only on that code — a crash must never become a restart loop.
//
// The supervisor imports NOTHING from ../src at module scope (the heavy
// imports below are dynamic, inside the branches that need them), so the
// supervisor's own graph is two builtins wide and effectively never stale.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const positional = argv.filter((a) => !a.startsWith("--"));
const [projectDirArg, portArg] = positional;

if (!projectDirArg || flag("--help") || flag("-h")) {
  console.error(
    "usage: node inspector/mcp/bin/console.mjs <projectDir> [port] [--hot] [--status|--stop]\n" +
      "  (no flag)  start the studio console and serve it until killed\n" +
      "  --status   report the console running for this project: pid, url, and whether\n" +
      "             the build it is running is still the build on disk\n" +
      "  --stop     stop it\n" +
      "  --worker   internal: run the service itself under a supervising parent\n" +
      "  Run it detached (nohup … &) so it outlives the agent session that started it.",
  );
  process.exit(projectDirArg ? 0 : 1);
}

// --status / --stop exist because a DETACHED process without lifecycle verbs is
// litter by construction: an orphaned console ran for a day (pid 86134,
// 2026-07-27) purely because there was no way to see or stop one. Gradle's
// daemon is the precedent — it ships --status and --stop alongside the registry,
// not as an afterthought.
if (flag("--status") || flag("--stop")) {
  const { findLiveConsole } = await import("../src/lib/preview-service.mjs");
  const live = await findLiveConsole(projectDirArg);
  if (!live) {
    console.log(`No console is running for ${projectDirArg}.`);
    process.exit(0);
  }
  if (flag("--stop")) {
    try {
      process.kill(live.pid, "SIGTERM");
      console.log(`Stopped the console for ${projectDirArg} (pid ${live.pid}, was at ${live.url}).`);
      process.exit(0);
    } catch (err) {
      console.error(`Could not stop pid ${live.pid}: ${err.message}`);
      process.exit(1);
    }
  }
  // --status: the build handshake is the point. A console that answers is not
  // necessarily a console running the current code.
  let remote = null;
  try {
    remote = await (await fetch(`${live.url}status`, { signal: AbortSignal.timeout(3000) })).json();
  } catch {
    /* answering the root but not /status is odd but not fatal — report what we have */
  }
  const b = remote && remote.build;
  const freshness =
    !b || b.stale === null
      ? "build unknown"
      : b.stale
        ? `STALE — running ${String(b.id).slice(0, 8)}, disk is ${String(b.diskId).slice(0, 8)}; restart it`
        : `fresh (${String(b.id).slice(0, 8)})`;
  console.log(`Console for ${projectDirArg}: pid ${live.pid} at ${live.url} — ${freshness}`);
  process.exit(0);
}

const port = portArg ? Number.parseInt(portArg, 10) : undefined;
if (portArg && !Number.isInteger(port)) {
  console.error(`error: port must be an integer, got "${portArg}"`);
  process.exit(1);
}

// ── Supervisor ────────────────────────────────────────────────────────────
// Owns the worker's lifetime and nothing else. Respawns ONLY on EX_RENEW, and
// only within a budget: a save storm or a worker that crashes during boot must
// not spin. Every other exit code is the worker's own verdict, mirrored here.
const EX_RENEW = 75;
const RENEW_BUDGET = 5;
const RENEW_WINDOW_MS = 60_000;

if (!flag("--worker")) {
  const SELF = fileURLToPath(import.meta.url);
  let child = null;
  let stopping = false;
  let renewals = [];
  // The port the worker actually bound, learned from its boot line and passed
  // back on every respawn: the human's URL must survive a renewal, or the
  // renewal has traded one broken window for another.
  let knownPort = Number.isInteger(port) ? port : null;

  // Test seam, mirroring preview-service's spawnImpl/probe: the respawn POLICY
  // is the load-bearing new behavior (respawn on EX_RENEW and no other code,
  // inside a budget), and an untested policy here is how a boot crash becomes
  // an infinite loop. Points the supervisor at a stub worker; unset in normal use.
  const WORKER_ENTRY = process.env.CMP_CONSOLE_WORKER_ENTRY || SELF;

  const spawnWorker = (renewed) => {
    const args = [WORKER_ENTRY, projectDirArg];
    if (knownPort) args.push(String(knownPort));
    if (flag("--hot")) args.push("--hot");
    // The supervisor watched the previous worker exit, so it KNOWS the project
    // is free — the takeover guard would otherwise wait out our own handoff
    // record before every respawn.
    if (renewed) args.push("--renewed");
    args.push("--worker");
    child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "inherit"] });
    let seen = "";
    child.stdout.on("data", (b) => {
      process.stdout.write(b); // the launcher's one-JSON-line contract, unchanged
      seen += b.toString();
      const m = seen.match(/"url"\s*:\s*"http:\/\/127\.0\.0\.1:(\d+)\//);
      if (m) knownPort = Number.parseInt(m[1], 10);
    });
    child.on("exit", (code, signal) => {
      child = null;
      if (stopping) {
        process.exit(0);
        return;
      }
      if (code === EX_RENEW) {
        const now = Date.now();
        renewals = renewals.filter((t) => now - t < RENEW_WINDOW_MS);
        renewals.push(now);
        if (renewals.length > RENEW_BUDGET) {
          process.stderr.write(
            `[console] ${renewals.length} renewals inside ${RENEW_WINDOW_MS / 1000}s — not respawning again. ` +
              `Start it once the sources settle: node inspector/mcp/bin/console.mjs ${projectDirArg}\n`,
          );
          process.exit(1);
        }
        process.stderr.write("[console] sources changed — respawning the worker with the new code\n");
        spawnWorker(true);
        return;
      }
      process.exit(code === null ? (signal ? 1 : 0) : code);
    });
  };

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      stopping = true;
      if (child) child.kill(signal);
      else process.exit(0);
    });
  }
  spawnWorker(false);
} else {
  await runWorker();
}

async function runWorker() {
const { createPreviewService } = await import("../src/lib/preview-service.mjs");
const service = createPreviewService({
  projectDir: projectDirArg,
  port,
  hot: flag("--hot"),
  // A respawn from our own supervisor: the previous worker is observed dead, so
  // the one-console guard has nothing left to protect against here.
  takeover: flag("--renewed"),
  log: (m) => process.stderr.write(`[console] ${m}\n`),
});

let status;
try {
  status = await service.start();
} catch (err) {
  // The one-console-per-project guard is a FEATURE, not a failure: say where
  // the existing one is instead of starting a second render loop against the
  // same build directory (the two would disagree).
  if (err && err.code === "CMP_CONSOLE_ALREADY_RUNNING") {
    console.error(
      `A console for this project is already running (pid ${err.existing.pid}) at ${err.existing.url} — using that one.`,
    );
    console.log(JSON.stringify({ url: err.existing.url, pid: err.existing.pid, reused: true }));
    process.exit(0);
  }
  console.error(`error: ${err && err.message ? err.message : String(err)}`);
  process.exit(1);
}

console.log(JSON.stringify({ url: status.url, pid: process.pid, projectDir: projectDirArg, reused: false }));

// Stop cleanly on the signals a human or a supervisor actually sends, so the
// console record on disk never outlives the process holding the port (a stale
// record is what makes the NEXT start refuse for no reason).
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    try {
      service.stop();
    } finally {
      // Exit 0, never EX_RENEW: a deliberate stop must stop the supervisor too.
      process.exit(0);
    }
  });
}
}
