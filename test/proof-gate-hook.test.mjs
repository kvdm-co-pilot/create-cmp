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
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { classify, decide, releaseContext } from "../scripts/hooks/proof-gate.mjs";
import { observedTreeHash, REVIEW_TIER_TRIGGERS, REVIEW_SKIP } from "../scripts/observed-tree.mjs";
import { stampedOutput, STAMPED_OUTPUT_RULE } from "../scripts/stamped-output.mjs";
import { TIERS, currentBranch, recordMeetsTier } from "../scripts/proof-plan.mjs";

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
  const rec = (over = {}) => ({ stampedOutputHash: now, stampedOutputRule: STAMPED_OUTPUT_RULE, verdict: "PASS", rung: "L2", ranAt: "2026-09-08T08:06:34.401Z", ...over });
  const onTrunk = o("none", { trunk: true, branch: "main" });
  // THE CONTEXT IS BUILT THE WAY THE GATE BUILDS IT: `releaseContext` puts the
  // record to `recordMeetsTier` — the one reading the schedule, the discharge
  // and this gate now share — and hands `decide` the answer. Fixtures that
  // spelled the comparison themselves are what let this gate ask for a rung
  // while the schedule asked for none.
  const ctx = (record) => ({ record, now, meets: recordMeetsTier(record, TIERS.device, now) });

  assert.match(decide("publish", o("none", { branch: "feat/x" }), TIERS, ctx(rec())).reason, /clean main/, "not trunk");
  assert.match(decide("publish", o("owed", { branch: "feat/x" }), TIERS, ctx(rec())).reason, /OWED/, "and says what the branch still owes");
  assert.equal(decide("publish", onTrunk, TIERS, ctx(null)).action, "deny", "no record");
  assert.match(decide("publish", onTrunk, TIERS, ctx(rec({ stampedOutputHash: "d".repeat(40) }))).reason, /another app/);
  // A record from before the tier was bound to the stamped app says nothing
  // about it, and is refused IN THOSE WORDS rather than through the comparison
  // above, which would have printed "undefine → ccccccc".
  const legacy = decide("publish", onTrunk, TIERS, ctx({ verdict: "PASS", rung: "L2", ranAt: "2026-09-08T08:06:34.401Z", observedHash: now }));
  assert.equal(legacy.action, "deny");
  assert.match(legacy.reason, /no stampedOutputHash/);
  assert.match(decide("publish", onTrunk, TIERS, ctx(rec({ verdict: "FAIL" }))).reason, /FAIL, not PASS/);
  assert.match(decide("publish", onTrunk, TIERS, ctx(rec({ rung: "L1" }))).reason, /requires L2/);
  assert.match(decide("publish", onTrunk, TIERS, ctx(rec({ rung: null }))).reason, /rung none/);
  // A run that never reached a device is PASS at L1: the rung is the whole
  // difference between a release proof and a desktop one, and this gate was the
  // only reader that ever asked for it.
  assert.equal(decide("publish", onTrunk, TIERS, ctx(rec({ rung: "L1", avd: null }))).action, "deny");

  const ok = decide("publish", onTrunk, TIERS, ctx(rec()));
  assert.equal(ok.action, "allow");
  assert.match(ok.reason, /PASS at L2/);
  assert.equal(decide("publish", onTrunk, TIERS, ctx(rec({ rung: "L3" }))).action, "allow", "a higher rung is not a lower one");

  // AND A GATE THAT COULD NOT PUT THE QUESTION MUST NOT PASS SILENTLY: a ctx
  // with a record and no reading of it is refused, never read by hand here.
  const unchecked = decide("publish", onTrunk, TIERS, { record: rec(), now });
  assert.equal(unchecked.action, "deny", "no `meets` means the comparison never ran — allowing would be a release published on an unread record");
  assert.match(unchecked.reason, /could not put the fleet record/);
});

test("npm publish: the gate hashes THIS tree exactly as the release proof records it", async () => {
  // The test above injects `now`, so it could never see the gate and the recorder disagree —
  // and they did: the gate hashed without DEVICE_SKIP, every passing proof was refused, and a
  // release had to be published by hand (a proof recorded 3ed5e09, the gate computed eb734f5).
  // This calls the gate's real context builder, and compares it against an INDEPENDENT stamp of
  // this tree — the same thing `fleet-check` hashes out of the app it is about to run a lane in.
  // Two stamps that disagree is the same defect wearing the new key.
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const { now } = await releaseContext();
  assert.match(now, /^[0-9a-f]{64}$/, "the gate produced a digest at all");
  assert.equal(now, stampedOutput(ROOT).hash, "the publish gate and fleet-check's record describe the same stamped app, or no passing run can satisfy the gate");
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

test("the wiring: .claude/settings.json registers all three events on this hook — a handler nobody calls is prose", () => {
  // The audit of 2026-09-08 found the PostToolUse handler below written, tested
  // with a synthetic payload, and registered nowhere — the same defect as the
  // rule it exists to enforce, one layer up. So the wiring is pinned here.
  const settings = JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.claude/settings.json"), "utf8"));
  for (const event of ["SessionStart", "PreToolUse", "PostToolUse"]) {
    const entries = settings.hooks?.[event] ?? [];
    const cmds = entries.flatMap((e) => e.hooks.map((h) => h.command));
    assert.ok(cmds.some((c) => c.includes("scripts/hooks/proof-gate.mjs")), `${event} must run the proof gate; found ${JSON.stringify(cmds)}`);
    if (event !== "SessionStart") assert.ok(entries.every((e) => e.matcher === "Bash"), `${event} watches Bash`);
  }
});

test("a running verify lane refuses an OWED device run — the memory's 'pgrep first' is now checked", () => {
  const d = decide("device", o("owed"), TIERS, { runningLane: { pid: 12345, args: "node qa/verify.mjs", project: null, marker: null } });
  assert.equal(d.action, "deny");
  assert.match(d.reason, /already running/);
  assert.equal(decide("device", o("owed"), TIERS, { runningLane: null }).action, "allow");
});

test("protocol: PostToolUse after a merge closes the slice's plan, and is otherwise silent", () => {
  // THIS TEST USED TO EAT THE SESSION'S PROOF PLAN. Its first version said "no
  // plan is open on the live tree during the suite (these tests never write
  // one)" — and that assumption is false in exactly the situation Rule 4
  // creates. A slice IS open on the live tree while someone works on it, the
  // suite runs while it is open (per commit, as the rule then said; TIERS in
  // scripts/proof-plan.mjs has said once, at close, since 2026-09-24 — and a
  // slice still runs it before the merge), and `close()` removes a plan only
  // when it is settled. So the deletion landed at the worst possible moment:
  // after the device run was paid for and discharged, right before the merge.
  // The state then read "OWED — no slice declared", the merge hook refused, and
  // an agent reading OWED would buy a second emulator run — the exact waste
  // Rule 4 exists to prevent, caused by the tier that runs most often.
  // Measured 2026-09-08 by following the workflow: discharge, `npm test`, gone.
  //
  // So the live plan is saved and restored, and the destructive branch is
  // exercised against a plan this test WRITES — which also means the removal is
  // asserted rather than merely assumed to be harmless.
  // The same lesson one file over (KD-59): close() now KEEPS what it removes, so the
  // plan this test writes would land in this repo's own history as a closed slice on
  // every trunk run of the suite. The hook subprocess is pointed at a scratch
  // history, and the real one is asserted untouched.
  const scratchHistory = fs.mkdtempSync(path.join(os.tmpdir(), "hook-history-"));
  const realHistory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../qa-artifacts/proof-plan-history.jsonl");
  const historyBefore = fs.existsSync(realHistory) ? fs.readFileSync(realHistory, "utf8") : null;
  const post = (command) =>
    spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command }, tool_response: { stdout: "" } }),
      encoding: "utf8",
      timeout: 15000,
      env: { ...process.env, PROOFLANE_HISTORY_DIR: scratchHistory },
    });
  const planPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../qa-artifacts/proof-plan.json");
  const saved = fs.existsSync(planPath) ? fs.readFileSync(planPath) : null;
  try {
    // A settled plan on this branch: both tiers discharged against the live tree's
    // own hashes, so close() settles it wherever the suite runs — trunk, a docs
    // branch, or a slice mid-flight. (It used to carry `treeHash: "n/a"`, which
    // settled only on trunk; that is the state KD-59 was measured in.)
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    // The READER's spelling of the current branch, not a second one: on a detached
    // checkout (every GitHub Actions pull_request) `rev-parse --abbrev-ref HEAD`
    // says "HEAD" where proof-plan says "", and the fixture stopped being this
    // branch's plan (test/the-current-branch-is-read-two-ways.test.mjs).
    const branch = currentBranch();
    const at = new Date().toISOString();
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(
      planPath,
      `${JSON.stringify({
        schema: "prooflane-proof-plan/1",
        slice: "a plan this test wrote",
        branch,
        openedAt: at,
        declared: { device: "at-close", review: "at-close" },
        discharged: { at, stampedHash: stampedOutput(repoRoot).hash, stampedFiles: {}, stampedRule: STAMPED_OUTPUT_RULE, verdict: "PASS", rung: "L2" },
        reviewDischarged: { at, treeHash: observedTreeHash(repoRoot, REVIEW_TIER_TRIGGERS, { skip: REVIEW_SKIP }), tests: [], decisions: [], nothingFound: true },
      }, null, 2)}\n`,
    );

    const merged = post("gh pr merge 86 --rebase --delete-branch");
    assert.equal(merged.status, 0, merged.stderr);
    assert.equal(merged.stdout, "", "the close is silent — a merge is not the place for a lecture");

    assert.equal(post("npm test").stdout, "", "an unmatched command closes nothing");
    const kept = fs.existsSync(path.join(scratchHistory, "proof-plan-history.jsonl"))
      ? fs.readFileSync(path.join(scratchHistory, "proof-plan-history.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
      : [];
    assert.deepEqual(kept.map((r) => r.plan.slice), ["a plan this test wrote"], "the merge hook keeps the plan it closes — in the history it was pointed at");
    const historyAfter = fs.existsSync(realHistory) ? fs.readFileSync(realHistory, "utf8") : null;
    assert.equal(historyAfter, historyBefore, "a fixture plan must never become a closed slice in this repo's own history");
  } finally {
    if (saved === null) fs.rmSync(planPath, { force: true });
    else fs.writeFileSync(planPath, saved);
    fs.rmSync(scratchHistory, { recursive: true, force: true });
  }
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

// ─────────────────────────────────────────────────────────────────────────────
// THE REVIEW HALF (ADR-0014). `gh pr merge` is where a slice closes, so it is
// where BOTH at-close obligations are collected. The device half above is
// unchanged; these pin the second one, and the shape of its refusal.
// ─────────────────────────────────────────────────────────────────────────────

/** An obligation with a review block — the shape obligation() always returns now. */
const withReview = (deviceState, reviewState) => ({
  ...o(deviceState),
  review: { state: reviewState, need: { required: reviewState !== "none", reason: "1 changed path(s) are not declared irrelevant to a review: scripts/proof-plan.mjs", obliging: [] } },
});

test("gh pr merge: refused while a REVIEW is owed — the device tier can be settled and the merge still refused", () => {
  // The bootstrap case, and the common one: a change to scripts/ or test/
  // cannot reach a phone (device NONE) and is exactly what wants a reader.
  for (const s of ["owed", "reopened"]) {
    const d = decide("merge", withReview("none", s), TIERS);
    assert.equal(d.action, "deny", `review ${s} blocks the merge`);
    assert.match(d.reason, /a review is (OWED|REOPENED)/);
    assert.match(d.reason, new RegExp(TIERS.review.cmd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "quotes the exact command that fixes it");
  }
  assert.equal(decide("merge", withReview("none", "none"), TIERS).action, "silent", "nothing owed, nothing said");
  assert.equal(decide("merge", withReview("discharged", "discharged"), TIERS).action, "silent");
  assert.equal(decide("merge", withReview("none", "undeclared"), TIERS).action, "deny");
  assert.match(decide("merge", withReview("none", "undeclared"), TIERS).reason, /Declare/);
});

test("the merge refusal says the gate never reads what a review FOUND — existence, never content", () => {
  // The reader of this string is the agent about to decide what to put in the
  // record. If the program at that moment implies findings are graded, an
  // honest "nothing found" starts looking like a failing answer, and the record
  // stops being honest. ADR-0014's accepted weakness only stays honest if the
  // refusal says out loud that it is one.
  const d = decide("merge", withReview("none", "owed"), TIERS);
  assert.match(d.reason, /never reads what it found/);
  assert.match(d.reason, /"nothing found" is a valid record/);
  assert.match(d.reason, /ADR-0014/);
});

test("both at-close tiers refuse in ONE answer — an agent is not sent round the loop twice", () => {
  const d = decide("merge", withReview("owed", "owed"), TIERS);
  assert.equal(d.action, "deny");
  assert.match(d.reason, /the L2 run is OWED/);
  assert.match(d.reason, /a review is OWED/);
  // And an undeclared slice is told once, not twice: both tiers are undeclared
  // for the same reason — there is no plan — so one instruction covers them.
  const u = decide("merge", withReview("undeclared", "undeclared"), TIERS);
  assert.equal(u.reason.match(/Declare/g).length, 1);
});

test("gh pr create: the reminder names the review too — the PR is opened knowing what will refuse it", () => {
  const d = decide("create", withReview("none", "owed"), TIERS);
  assert.equal(d.action, "allow", "never blocked");
  assert.match(d.reason, /a review is OWED/);
  assert.match(d.reason, /merge will refuse/);
  assert.equal(decide("create", withReview("none", "none"), TIERS).action, "silent");
});

test("no review decision says REQUIRED either — the word stays gone from every state", () => {
  for (const kind of ["merge", "create"]) {
    for (const dev of ["none", "undeclared", "owed", "discharged", "reopened"]) {
      for (const rev of ["none", "undeclared", "owed", "discharged", "reopened"]) {
        const d = decide(kind, withReview(dev, rev), TIERS);
        assert.ok(!/REQUIRED/.test(d.reason ?? ""), `${kind}/${dev}/${rev}: ${d.reason}`);
      }
    }
  }
});

test("an obligation with no review block is not a licence to merge — the live one always has it", async () => {
  // decide() is pure and takes what it is given; the only caller hands it
  // obligation(), which is asserted in test/proof-plan.test.mjs to always carry
  // a review block. Pinned here from the hook's side so a future refactor that
  // drops the field is caught where the refusal lives.
  const { obligation } = await import("../scripts/proof-plan.mjs");
  assert.ok(obligation().review, "the live obligation carries a review block");
});
