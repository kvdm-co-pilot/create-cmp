// A SLOW PROCESS TABLE TURNS THIS GATE'S REFUSAL INTO A PASS.
//
// .claude/settings.json gives the PreToolUse hook a timeout. Past it the hook is
// killed and its decision is never delivered — and a PreToolUse decision that is
// never delivered is not a refusal, it is a permitted command. So the gate's
// budget is not a performance nicety: it is the boundary between "refused" and
// "allowed", and every subprocess the gate runs inside that budget has to be
// bounded by something smaller than it.
//
// None of them is. `shell()` calls execSync with no `timeout`, and the device
// path now runs up to four of these — pgrep, ps, ps, and (new here) `lsof -a -p
// <pid> -d cwd -Fn`, the one command in the set with a long history of blocking
// on a wedged mount or a stuck fd. Measured on this tree (2026-09-17) with an
// lsof that takes 20s: the hook answered after 22.2s, holding a `deny` that had
// NOTHING to do with lane detection ("nothing is owed — every changed path is
// declared unable to affect fleet L2"). Twelve seconds earlier the hook was dead
// and the device run went ahead.
//
// The invariant: whatever the process table costs, the gate answers inside the
// budget its own wiring declares for it. This is checked end-to-end, through the
// real hook with the real settings.json number, because the two halves of it —
// the declared timeout and the unbounded execSync — live in different files and
// neither one alone looks wrong.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOOK = path.join(ROOT, "scripts", "hooks", "proof-gate.mjs");

/** The budget this hook's own wiring gives it, in ms. */
function declaredBudgetMs() {
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude", "settings.json"), "utf8"));
  const entry = (settings.hooks?.PreToolUse ?? []).flatMap((e) => e.hooks ?? []).find((h) => String(h.command ?? "").includes("scripts/hooks/proof-gate.mjs"));
  assert.ok(entry, "the PreToolUse wiring must name this hook");
  // Claude Code's default when a hook declares none is 60s.
  return (typeof entry.timeout === "number" ? entry.timeout : 60) * 1000;
}

test("the device gate answers inside its declared timeout even when the process table is slow", { skip: process.platform === "win32" ? "POSIX process table" : false }, () => {
  const budgetMs = declaredBudgetMs();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slow-process-table-"));
  const bin = path.join(tmp, "bin");
  fs.mkdirSync(bin, { recursive: true });
  const write = (name, body) => {
    const p = path.join(bin, name);
    fs.writeFileSync(p, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  };
  // A lane is found, it is node, and its argv carries no absolute project — so
  // the gate must ask the process for its cwd, and that is the call that stalls.
  write("pgrep", "echo 4194303");
  write("ps", 'case "$*" in *comm=*) echo node ;; *) echo "node qa/verify.mjs" ;; esac');
  write("lsof", `sleep ${Math.ceil(budgetMs / 1000) + 2}\necho p4194303\necho n/tmp/whatever`);

  const started = Date.now();
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "node scripts/fleet-check.mjs --min-level L2" } }),
    encoding: "utf8",
    timeout: budgetMs + 2500,
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      // Nothing of this repo's real state is read or written by the run.
      PROOFLANE_HISTORY_DIR: path.join(tmp, "history"),
      PROOFLANE_SUITE_ROOT: path.join(tmp, "suite"),
    },
  });
  const elapsed = Date.now() - started;
  fs.rmSync(tmp, { recursive: true, force: true });

  assert.equal(r.signal, null, `the hook had to be killed after ${elapsed}ms — past its ${budgetMs}ms budget, the decision it was holding is never delivered and the command it would have refused runs`);
  assert.ok(
    elapsed < budgetMs,
    `the hook answered in ${elapsed}ms, past the ${budgetMs}ms its own .claude/settings.json allows it. A decision delivered late is not delivered: bound every subprocess the gate runs (execSync takes a timeout) to something smaller than the budget.`,
  );
});
