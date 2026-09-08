// THE PROGRAM AT THE DECISION POINT — the hook that makes Rule 4 run.
//
// The 2026-09-08 audit found scripts/proof-plan.mjs existed and nothing invoked
// it: no .claude/settings.json in this repo, no git hooks, every `--open` in
// prose. A rule made executable and left for the reader to remember is the
// defect one layer up. These tests pin the two halves of the fix: what the
// gate matches (an INVOCATION, never a mention — its first live run refused
// an echo, then refused the edit that would have fixed it) and what it decides.
//
// The decision is tested pure, with obligation states handed in, because the
// live tree's state is whatever the current branch happens to owe. The spawn
// tests cover the protocol: silent and cheap when unmatched, JSON when not.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { classify, decide } from "../scripts/hooks/proof-gate.mjs";
import { TIERS } from "../scripts/proof-plan.mjs";

const HOOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts/hooks/proof-gate.mjs");
const FC = "scripts/fleet-check.mjs";

test("classify: an INVOCATION matches; a mention never does", () => {
  const cases = [
    [`CMP_AVD=Medium_Phone_API_35 node ${FC} --min-level L2`, "device"],
    [`cd /x && nohup node ${FC} > log 2>&1 &`, "device"],
    [`CMP_AVD=X nohup node ${FC} &`, "device"],
    [`caffeinate -i env CMP_AVD=X node ./${FC}`, "device"],
    [`sh -c "node ${FC}"`, "device"],
    [`echo $(node ${FC})`, "device"],
    ["gh pr merge 85 --rebase --delete-branch", "merge"],
    ["git push -u origin HEAD && gh pr create --title x --body y", "create"],
    ["npm publish --access public", "publish"],
    ["cd packages/harness && npm publish", "publish"],
    // Mentions. The first two are how this file's own author got refused.
    [`echo '{"command":"node ${FC}"}'`, null],
    [`python3 - <<'EOF'\nold = "node ${FC}"\nEOF`, null],
    [`cat ${FC}`, null],
    [`grep -n "node ${FC}" docs/X.md`, null],
    ['git commit -m "then gh pr merge"', null],
    ['echo "npm publish is step 4"', null],
    ["npm test", null],
    ["", null],
  ];
  for (const [cmd, want] of cases) assert.equal(classify(cmd), want, JSON.stringify(cmd));
});

const o = (state, over = {}) => ({
  state,
  need: { required: state !== "none", reason: "1 changed path(s) are not declared irrelevant to fleet L2: packages/harness/src/x.mjs", obliging: [] },
  plan: state === "discharged" || state === "reopened" ? { discharged: { at: "2026-09-08T10:30:00.000Z", verdict: "PASS", rung: "L2" } } : null,
  ...over,
});

test("device run: refused when nothing is owed, already discharged, or undeclared; allowed while owed", () => {
  // The three refusals are the three ways a device run is wasted: it proves
  // nothing the slice needs, it proves what was already proved for these
  // exact bytes (the 2026-09-08 defect), or it could discharge nothing because
  // no slice exists to discharge into.
  assert.equal(decide("device", o("none"), TIERS).action, "deny");
  assert.equal(decide("device", o("discharged"), TIERS).action, "deny");
  assert.equal(decide("device", o("undeclared"), TIERS).action, "deny");
  assert.match(decide("device", o("discharged"), TIERS).reason, /2026-09-08T10:30/, "names the run it already has");
  assert.match(decide("device", o("undeclared"), TIERS).reason, /--open/, "says what to do instead");

  for (const s of ["owed", "reopened"]) {
    const d = decide("device", o(s), TIERS);
    assert.equal(d.action, "allow", `${s} allows the run`);
    assert.match(d.reason, /LAST gate/, "and says it is the last one");
  }
  assert.equal(decide("device", o("something-new"), TIERS).action, "deny", "an unknown state refuses rather than guesses");

  // The one exception: nothing owed because this IS trunk. A docs-only branch
  // owes nothing and is refused as waste; a clean main owes nothing per slice
  // and the only reason to run there is a release proof, which is allowed.
  const trunk = decide("device", o("none", { trunk: true }), TIERS);
  assert.equal(trunk.action, "allow");
  assert.match(trunk.reason, /RELEASE/);
});

test("npm publish: the publish skill's first two steps as a program — clean trunk, and a PASS L2 record on THIS tree", () => {
  const now = "c".repeat(40);
  const rec = (over = {}) => ({ observedHash: now, verdict: "PASS", rung: "L2", ranAt: "2026-09-08T08:06:34.401Z", ...over });
  const onTrunk = o("none", { trunk: true, branch: "main" });

  assert.match(decide("publish", o("none", { branch: "feat/x" }), TIERS, { record: rec(), now }).reason, /clean main/, "not trunk");
  assert.match(decide("publish", o("owed", { branch: "feat/x" }), TIERS, { record: rec(), now }).reason, /OWED/, "and says what the branch still owes");
  assert.equal(decide("publish", onTrunk, TIERS, { record: null, now }).action, "deny", "no record");
  assert.match(decide("publish", onTrunk, TIERS, { record: rec({ observedHash: "d".repeat(40) }), now }).reason, /another tree/);
  assert.match(decide("publish", onTrunk, TIERS, { record: rec({ verdict: "FAIL" }), now }).reason, /FAIL, not PASS/);
  assert.match(decide("publish", onTrunk, TIERS, { record: rec({ rung: "L1" }), now }).reason, /requires L2/);
  assert.match(decide("publish", onTrunk, TIERS, { record: rec({ rung: null }), now }).reason, /rung none/);

  const ok = decide("publish", onTrunk, TIERS, { record: rec(), now });
  assert.equal(ok.action, "allow");
  assert.match(ok.reason, /PASS at L2/);
  assert.equal(decide("publish", onTrunk, TIERS, { record: rec({ rung: "L3" }), now }).action, "allow", "a higher rung is not a lower one");
});

test("gh pr merge: refused while the tier is owed — the slice closes here, so this is where it is collected", () => {
  for (const s of ["owed", "reopened", "undeclared"]) {
    const d = decide("merge", o(s), TIERS);
    assert.equal(d.action, "deny", `${s} blocks the merge`);
    assert.match(d.reason, /discharge|Declare/);
  }
  assert.equal(decide("merge", o("none"), TIERS).action, "silent");
  assert.equal(decide("merge", o("discharged"), TIERS).action, "silent");
  assert.match(decide("merge", o("owed"), TIERS).reason, new RegExp(TIERS.device.cmd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "quotes the exact command");
});

test("gh pr create: reminded, never blocked — the PR is the review surface, the merge is the close", () => {
  assert.equal(decide("create", o("owed"), TIERS).action, "allow");
  assert.match(decide("create", o("owed"), TIERS).reason, /merge will refuse/);
  assert.equal(decide("create", o("none"), TIERS).action, "silent");
  assert.equal(decide("create", o("discharged"), TIERS).action, "silent");
});

test("no decision ever says REQUIRED — that is the word an agent acted on three times", () => {
  for (const kind of ["device", "merge", "create", "publish"]) {
    for (const s of ["none", "undeclared", "owed", "discharged", "reopened"]) {
      const d = decide(kind, o(s), TIERS, { record: null, now: "x" });
      assert.ok(!/REQUIRED/.test(d.reason ?? ""), `${kind}/${s}: ${d.reason}`);
    }
  }
});

const run = (payload) => spawnSync(process.execPath, [HOOK], { input: payload, encoding: "utf8", timeout: 15000 });

test("protocol: unmatched and malformed input are silent, exit 0, and cheap — nothing is imported before a match", () => {
  const t0 = Date.now();
  const r = run(JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "npm test" } }));
  const ms = Date.now() - t0;
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "", "an ordinary Bash call gets no opinion");
  assert.ok(ms < 3000, `unmatched must be cheap; took ${ms}ms`);

  const g = run("not json at all");
  assert.equal(g.status, 0, "garbage stdin must never block a Bash call");
  assert.equal(g.stdout, "");

  const other = run(JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: FC } }));
  assert.equal(other.stdout, "", "only Bash is watched");
});

test("protocol: PostToolUse after a merge closes the slice's plan, and is otherwise silent", () => {
  // No plan is open on the live tree during the suite (these tests never write
  // one), so the observable here is the protocol: exit 0, nothing on stdout,
  // and no complaint — a failed close leaves the plan for the next session to
  // name as stale, never blocks.
  const post = (command) => run(JSON.stringify({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command }, tool_response: { stdout: "" } }));
  const merged = post("gh pr merge 86 --rebase --delete-branch");
  assert.equal(merged.status, 0, merged.stderr);
  assert.equal(merged.stdout, "");
  assert.equal(post("npm test").stdout, "");
});

test("protocol: a matched command answers in Claude Code's PreToolUse shape, from the live tree", () => {
  // The verdict depends on what the current branch owes, so only the shape is
  // pinned here; the decision table above pins the verdicts.
  const r = run(JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: `CMP_AVD=X node ${FC} --min-level L2` } }));
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, "PreToolUse");
  assert.ok(["allow", "deny"].includes(out.permissionDecision), out.permissionDecision);
  assert.ok(out.permissionDecisionReason.length > 40);
});

test("protocol: SessionStart puts the schedule in front of the session, and names what enforces it", () => {
  const r = run(JSON.stringify({ hook_event_name: "SessionStart" }));
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, "SessionStart");
  assert.match(out.additionalContext, /proof plan — what this slice owes/);
  assert.match(out.additionalContext, /enforced by scripts\/hooks\/proof-gate\.mjs/, "a reader learns the hook exists, not just the rule");
  assert.ok(!/REQUIRED/.test(out.additionalContext));
});
