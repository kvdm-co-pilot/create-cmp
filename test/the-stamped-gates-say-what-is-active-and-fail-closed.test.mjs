// The stamped app's gates, as a session meets them (FIX-PLAN slice 8, B-L-1/B-L-3/B-L-4).
//
// qa/gates-status.mjs derives one line — which gates are active — from the tree, and
// an unanswered question stays "unknown", never a pass. qa/hooks/fail-closed.sh runs
// the Stop gate so that a gate which cannot run refuses: Claude Code blocks on exit 2
// alone, so a crash or a missing node would otherwise end the session ungated.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { gatesLine, requiredFromRules, stopHookWired } from "../template/qa/gates-status.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LAUNCHER = path.join(ROOT, "template", "qa", "hooks", "fail-closed.sh");

test("gatesLine: every gate named with its derived state, in one line", () => {
  assert.equal(
    gatesLine({ stopHook: true, prePush: true, workflow: true, required: "unknown" }),
    "Gates active: Stop (receipt-check) · pre-push (.githooks: on) · CI Verify (workflow present; required: unknown locally)"
  );
  assert.equal(
    gatesLine({ stopHook: false, prePush: false, workflow: false, required: "unknown" }),
    "Gates active: Stop (not wired) · pre-push (.githooks: off) · CI Verify (no workflow)"
  );
  assert.match(gatesLine({ stopHook: true, prePush: true, workflow: true, required: "yes" }), /required: yes, by a ruleset\)$/);
  assert.match(gatesLine({ stopHook: true, prePush: true, workflow: true, required: "no" }), /required: no ruleset requires it\)$/);
});

test("gatesLine: an unknown is never rendered as a pass, whatever the value", () => {
  for (const required of ["unknown", undefined, null, "", "PASS", true]) {
    const line = gatesLine({ stopHook: true, prePush: true, workflow: true, required });
    assert.match(line, /required: unknown locally/, `required=${JSON.stringify(required)} rendered as: ${line}`);
    assert.ok(!/PASS/.test(line));
    assert.ok(!line.includes("\n") && line.length < 10_000);
  }
});

test("requiredFromRules: yes only when an active rule requires the Verify check; unreadable is unknown", () => {
  const rule = (...contexts) => ({
    type: "required_status_checks",
    parameters: { required_status_checks: contexts.map((context) => ({ context })) },
  });
  assert.equal(requiredFromRules([rule("Verify")]), "yes");
  assert.equal(requiredFromRules([{ type: "deletion" }, rule("android")]), "yes");
  assert.equal(requiredFromRules([rule("lint")]), "no");
  assert.equal(requiredFromRules([]), "no");
  assert.equal(requiredFromRules(null), "unknown");
  assert.equal(requiredFromRules({ message: "Not Found" }), "unknown");
});

test("stopHookWired reads the Stop event's commands, not the file's text", () => {
  const s = (event, command) => ({ hooks: { [event]: [{ matcher: "", hooks: [{ type: "command", command }] }] } });
  assert.equal(stopHookWired(s("Stop", 'sh "x/qa/hooks/fail-closed.sh" "x/qa/receipt-check.mjs" --hook')), true);
  assert.equal(stopHookWired(s("SessionStart", "node qa/receipt-check.mjs --hook")), false);
  assert.equal(stopHookWired(null), false);
});

// ── the launcher, executed ────────────────────────────────────────────────────

function gate(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-fail-closed-"));
  const file = path.join(dir, "gate.mjs");
  fs.writeFileSync(file, body);
  return { dir, file };
}

function launch(file, payload, env = {}) {
  return spawnSync("/bin/sh", [LAUNCHER, file, "--hook"], {
    input: payload,
    encoding: "utf8",
    env: { ...process.env, ...env },
    timeout: 30_000,
  });
}

test("the launcher passes 0 and 2 through with the gate's stdout, and hands it the payload and args", () => {
  const { dir, file } = gate(
    `let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{process.stdout.write("got "+s+" "+process.argv[2]);` +
      `if(s.includes("block")){process.stderr.write("stale receipt");process.exit(2)}});`
  );
  try {
    const ok = launch(file, '{"x":1}');
    assert.equal(ok.status, 0);
    assert.equal(ok.stdout, 'got {"x":1} --hook');
    const blocked = launch(file, '{"block":true}');
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr, /stale receipt/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a gate that crashes, or is missing, refuses with a named reason — once", () => {
  const { dir, file } = gate(`throw new Error("boom");`);
  try {
    const crashed = launch(file, "{}");
    assert.equal(crashed.status, 2);
    assert.match(crashed.stderr, /gate could not run \(rc=1\) — refusing/);
    const missing = launch(path.join(dir, "absent.mjs"), "{}");
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /gate could not run \(rc=\d+\)/);
    // The session is already continuing because of a Stop hook: the gate nags at most once.
    const again = launch(file, '{"session_id":"s","stop_hook_active": true}');
    assert.equal(again.status, 0, again.stderr);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a gate that hangs is killed at the launcher's own deadline and refuses", () => {
  const { dir, file } = gate(`setTimeout(() => {}, 60_000);`);
  try {
    const started = Date.now();
    const r = launch(file, "{}", { CMP_GATE_DEADLINE_S: "1" });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /did not finish within 1s/);
    assert.ok(Date.now() - started < 15_000, "the launcher waited out more than its deadline");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
