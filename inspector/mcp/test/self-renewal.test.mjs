// studio-self-renewal (docs/features/studio-self-renewal.md) — the console
// adopts new code without a human restarting it.
//
// What is proven here is the POLICY, not the plumbing: which exit code respawns
// and which does not, that a storm is budgeted, that the project-freeing gap is
// waited out rather than reported as "no console", and that the page can tell it
// is looking at output from a build that is no longer serving it.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { sourceRoots } from "../src/lib/build-id.mjs";
import { consoleRegistryPath, findLiveConsole, renewalDecision } from "../src/lib/preview-service.mjs";
import { renderShellPage } from "../src/lib/console-shell.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONSOLE_BIN = path.join(HERE, "..", "bin", "console.mjs");

function tmpProject(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `cmp-renewal-${name}-`));
}

/**
 * Run the supervisor against a stub worker. The stub writes one line per boot to
 * `logPath` and exits with the code named for that boot, so the test reads the
 * supervisor's decisions off the log rather than off timing.
 */
function runSupervisor(projectDir, exitCodes, { timeoutMs = 10_000 } = {}) {
  const stub = path.join(projectDir, "stub-worker.mjs");
  const logPath = path.join(projectDir, "boots.log");
  fs.writeFileSync(
    stub,
    `import fs from "node:fs";
const codes = ${JSON.stringify(exitCodes)};
const log = ${JSON.stringify(logPath)};
let n = 0;
try { n = fs.readFileSync(log, "utf8").trim().split("\\n").filter(Boolean).length; } catch {}
fs.appendFileSync(log, "boot " + n + " argv=" + process.argv.slice(2).join(",") + "\\n");
console.log(JSON.stringify({ url: "http://127.0.0.1:9612/", pid: process.pid, reused: false }));
process.exit(codes[n] ?? 0);
`,
  );
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CONSOLE_BIN, projectDir], {
      env: { ...process.env, CMP_CONSOLE_WORKER_ENTRY: stub },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (b) => (stderr += b.toString()));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("exit", (code) => {
      clearTimeout(timer);
      let boots = [];
      try {
        boots = fs.readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean);
      } catch {}
      resolve({ code, boots, stderr });
    });
  });
}

test("the supervisor respawns on EX_RENEW and mirrors the worker's exit otherwise", async () => {
  const dir = tmpProject("renew");
  // boot 0 renews, boot 1 exits 0 — the supervisor follows it out.
  const { code, boots } = await runSupervisor(dir, [75, 0]);
  assert.equal(boots.length, 2, "one renewal means exactly two boots");
  assert.equal(code, 0, "a clean worker exit is the supervisor's exit");
});

test("a crash is never turned into a restart loop", async () => {
  const dir = tmpProject("crash");
  const { code, boots } = await runSupervisor(dir, [1, 1, 1]);
  assert.equal(boots.length, 1, "a non-EX_RENEW exit respawns nothing");
  assert.equal(code, 1, "and the crash code is passed through, not swallowed");
});

test("the renewal budget stops a storm instead of spinning", async () => {
  const dir = tmpProject("storm");
  // Every boot asks to renew; the budget is 5 in 60s, so the supervisor gives up.
  const { code, boots, stderr } = await runSupervisor(dir, Array(20).fill(75));
  assert.ok(boots.length <= 7, `bounded by the budget, got ${boots.length} boots`);
  assert.ok(boots.length >= 6, `the budget is spent before giving up, got ${boots.length}`);
  assert.equal(code, 1, "giving up is a failure exit, not a silent stop");
  assert.match(stderr, /not respawning again/, "and it says why, with the command to start again");
});

test("the respawned worker is told it may take over — the supervisor watched the old one die", async () => {
  const dir = tmpProject("takeover");
  const { boots } = await runSupervisor(dir, [75, 0]);
  assert.ok(!boots[0].includes("--renewed"), "the first boot is not a renewal");
  assert.ok(boots[1].includes("--renewed"), "the respawn is, so it skips the one-console guard");
});

test("the port the worker bound is passed back, so the human's URL survives a renewal", async () => {
  const dir = tmpProject("port");
  const { boots } = await runSupervisor(dir, [75, 0]);
  assert.ok(boots[1].includes("9612"), `the respawn reuses the bound port, got: ${boots[1]}`);
});

test("findLiveConsole waits out a declared renewal instead of reporting no console", async () => {
  const dir = tmpProject("rejoin");
  const rec = consoleRegistryPath(dir);
  // The handoff a renewing worker leaves: owned by the (live) supervisor pid.
  fs.writeFileSync(
    rec,
    JSON.stringify({
      pid: process.pid,
      port: 9613,
      url: "http://127.0.0.1:9613/",
      projectDir: dir,
      startedAt: new Date().toISOString(),
      renewing: true,
      renewingAt: new Date().toISOString(),
    }),
  );
  // The respawned worker lands shortly after; the probe answers only for it.
  setTimeout(() => {
    fs.writeFileSync(
      rec,
      JSON.stringify({ pid: process.pid, port: 9613, url: "http://127.0.0.1:9613/", projectDir: dir, startedAt: new Date().toISOString() }),
    );
  }, 400);
  const found = await findLiveConsole(dir, { probe: (r) => Promise.resolve(r.renewing !== true) });
  assert.ok(found, "the console coming back is found, not declared gone");
  assert.equal(found.port, 9613, "and it is the same port the human's tab is on");
});

test("a renewal that never lands is still reported as gone", async () => {
  const dir = tmpProject("norejoin");
  fs.writeFileSync(
    consoleRegistryPath(dir),
    JSON.stringify({
      pid: process.pid,
      port: 9614,
      url: "http://127.0.0.1:9614/",
      projectDir: dir,
      startedAt: new Date().toISOString(),
      renewing: true,
      // older than the rejoin window — this is not a renewal in progress
      renewingAt: new Date(Date.now() - 60_000).toISOString(),
    }),
  );
  const found = await findLiveConsole(dir, { probe: () => Promise.resolve(false) });
  assert.equal(found, null, "a stale handoff must not read as a live console");
});

test("the page carries the build that drew it, so it can tell when it is behind", () => {
  const html = renderShellPage({
    appName: "app",
    railItems: [],
    railFootHtml: "",
    sections: [],
    bodyScript: "/* body */",
    build: { id: "abc123def456", mode: "source", stale: false, diskId: "abc123def456" },
  });
  assert.match(html, /const CMP_CONSOLE_BUILD = "abc123def456";/);
});

test("a page with no build handshake claims none — an unknown never renders as a known id", () => {
  const html = renderShellPage({ appName: "app", railItems: [], railFootHtml: "", sections: [], bodyScript: "" });
  assert.match(html, /const CMP_CONSOLE_BUILD = null;/);
});

test("sourceRoots covers what the build hash is computed over", () => {
  const roots = sourceRoots();
  assert.ok(roots.some((r) => r.endsWith(path.join("mcp", "src"))), "src is watched");
  assert.ok(roots.some((r) => r.endsWith(path.join("mcp", "bin"))), "bin is watched");
  for (const r of roots) assert.ok(fs.statSync(r).isDirectory(), `${r} exists`);
});

// The policy, stated as a rule rather than inferred from callback order.
test("renewalDecision: nothing to adopt is nothing to do", () => {
  assert.equal(renewalDecision({ diskId: "a", loadedId: "a", armed: false, blockedBy: null }), "none");
});

test("renewalDecision: new code with nothing in flight renews", () => {
  assert.equal(renewalDecision({ diskId: "b", loadedId: "a", armed: true, blockedBy: null }), "renew");
});

test("renewalDecision: a render or a lane defers it — a renewal never interrupts one", () => {
  assert.equal(renewalDecision({ diskId: "b", loadedId: "a", armed: true, blockedBy: "a render is in flight" }), "defer");
  assert.equal(renewalDecision({ diskId: "b", loadedId: "a", armed: true, blockedBy: "a verify lane is running" }), "defer");
});

test("renewalDecision: an undone edit stands the renewal down instead of restarting for nothing", () => {
  assert.equal(renewalDecision({ diskId: "a", loadedId: "a", armed: true, blockedBy: null }), "stand-down");
  // and while blocked, too — the reason is gone either way
  assert.equal(renewalDecision({ diskId: "a", loadedId: "a", armed: true, blockedBy: "a render is in flight" }), "stand-down");
});

test("renewalDecision: an unknown hash is never evidence of change", () => {
  // Same stance buildStatus takes with stale:null — refusal over fabrication.
  assert.equal(renewalDecision({ diskId: null, loadedId: "a", armed: false, blockedBy: null }), "none");
  assert.equal(renewalDecision({ diskId: "a", loadedId: null, armed: false, blockedBy: null }), "none");
  assert.equal(renewalDecision({ diskId: null, loadedId: null, armed: true, blockedBy: null }), "stand-down");
});
