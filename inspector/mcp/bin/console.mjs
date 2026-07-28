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

import { createPreviewService, findLiveConsole } from "../src/lib/preview-service.mjs";
import { buildStatus, loadedBuildId } from "../src/lib/build-id.mjs";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const positional = argv.filter((a) => !a.startsWith("--"));
const [projectDirArg, portArg] = positional;

if (!projectDirArg || flag("--help") || flag("-h")) {
  console.error(
    "usage: node inspector/mcp/bin/console.mjs <projectDir> [port] [--status|--stop]\n" +
      "  (no flag)  start the studio console and serve it until killed\n" +
      "  --status   report the console running for this project: pid, url, and whether\n" +
      "             the build it is running is still the build on disk\n" +
      "  --stop     stop it\n" +
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

const service = createPreviewService({
  projectDir: projectDirArg,
  port,
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
      process.exit(0);
    }
  });
}
