// THE BRIEF IS CHECKED AT SPAWN — scripts/hooks/brief-check.mjs (W3, A-4).
//
// The kept plant (GATE-RULES Rule 1) is this batch's own briefs. The complete
// brief below is modelled on the slice-8a executor brief of 2026-09-29, one of
// the eight covered briefs in the local transcripts that already carried every
// field; the incomplete one is the A-4 audit's own shape — an objective and an
// output file, and neither a branch nor a hand-off file. Run over the 216
// covered spawns in those transcripts on 2026-09-29 the hook stayed silent on
// 8 and denied 208 (every deep-worker, staff-reviewer and cmp-orchestrator
// brief, and 19 of 27 executor briefs) — no brief schema was enforced before,
// and the deny carries the whole schema so the model can answer it in one re-send.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { respond, missingFields, coveredAgent, SCHEMAS } from "../scripts/hooks/brief-check.mjs";

const HOOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts/hooks/brief-check.mjs");

const WORKER_BRIEF = [
  "Objective: Implement FIX-PLAN slice 8, part A — the receipt attestation.",
  "Output: one commit on this worktree's branch; hand-off written inside this worktree at docs/research/PATTERN-REVIEW-2026-09-28/handoff/slice-8a.md",
  "Branch: this worktree's branch — report it.",
  "Hand-off: docs/research/PATTERN-REVIEW-2026-09-28/handoff/slice-8a.md",
  "Out of scope: template/.claude/settings.json, the SessionStart line, the launcher (slice 8b).",
  "Proof: node --test test/receipts.test.mjs — the pass line and zero fails.",
].join("\n");

const REVIEWER_BRIEF = [
  "Objective: review round 1 of harness/hooks-never-grant.",
  "Output: docs/research/PATTERN-REVIEW-2026-09-28/handoff/review-round-1.md",
  "Diff: 4ddb940..f085165",
  "Brief: docs/research/PATTERN-REVIEW-2026-09-28/FIX-PLAN.md",
  "Out of scope: fixing what you find — blocking findings land as failing tests only.",
  "Proof: node scripts/proof-plan.mjs --record-review --round 1",
].join("\n");

const spawn = (subagent_type, prompt, tool_name = "Agent") => ({
  hook_event_name: "PreToolUse",
  tool_name,
  tool_input: { subagent_type, description: "a slice", prompt },
});

const without = (brief, label) => brief.split("\n").filter((l) => !l.startsWith(`${label}:`)).join("\n");

test("a brief carrying every field is silent, for every covered worker agent and under both tool names", () => {
  for (const agent of ["create-cmp:executor", "executor", "create-cmp:cmp-orchestrator", "cmp-orchestrator", "deep-worker"]) {
    for (const tool of ["Agent", "Task"]) assert.equal(respond(spawn(agent, WORKER_BRIEF, tool)), null, `${agent} via ${tool}`);
  }
});

test("each missing field is denied, and the reason names it and carries the full schema", () => {
  for (const field of SCHEMAS.executor) {
    const out = respond(spawn("create-cmp:executor", without(WORKER_BRIEF, field)));
    assert.equal(out?.hookSpecificOutput?.permissionDecision, "deny", field);
    assert.equal(out.hookSpecificOutput.hookEventName, "PreToolUse");
    const reason = out.hookSpecificOutput.permissionDecisionReason;
    assert.match(reason, new RegExp(`missing ${field}:`), field);
    for (const f of SCHEMAS.executor) assert.ok(reason.includes(`\n  ${f}: `), `schema line ${f} in the reason for missing ${field}`);
  }
});

test("the A-4 shape — an objective and an output file, no branch, no hand-off — is denied naming exactly what is missing", () => {
  const brief = "Objective: audit the agents and skills against the doc base.\nOutput: docs/research/PATTERN-REVIEW-2026-09-28/A-agents-skills.md";
  assert.deepEqual(missingFields(brief, SCHEMAS["deep-worker"]), ["Branch", "Hand-off", "Out of scope", "Proof"]);
  assert.equal(respond(spawn("deep-worker", brief)).hookSpecificOutput.permissionDecision, "deny");
});

test("Output must name a path — a label with no path in its value is not an output", () => {
  const brief = WORKER_BRIEF.replace(/^Output: .*$/m, "Output: one commit, report back");
  assert.deepEqual(missingFields(brief, SCHEMAS.executor), ["Output (a path)"]);
  assert.deepEqual(missingFields(WORKER_BRIEF.replace(/^Output: .*$/m, "Output:\n  qa-artifacts/audit.md"), SCHEMAS.executor), []);
});

test("labels are read in the forms briefs are written in: bold, list items, case, hand-off spelling", () => {
  const brief = WORKER_BRIEF.replace("Objective:", "**Objective:**").replace("Branch:", "- branch:").replace("Hand-off:", "Handoff:").replace("Out of scope:", "## Out of scope:");
  assert.deepEqual(missingFields(brief, SCHEMAS.executor), []);
  // A label only counts at the start of a line — a mention mid-sentence is not a field.
  assert.deepEqual(missingFields(WORKER_BRIEF.replace(/^Proof: /m, "The Proof: "), SCHEMAS.executor), ["Proof"]);
});

test("the reviewer schema asks for Diff and Brief in place of Branch and Hand-off", () => {
  assert.equal(respond(spawn("staff-reviewer", REVIEWER_BRIEF)), null);
  assert.deepEqual(SCHEMAS["staff-reviewer"], ["Objective", "Output", "Diff", "Brief", "Out of scope", "Proof"]);
  const out = respond(spawn("staff-reviewer", without(REVIEWER_BRIEF, "Diff")));
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /missing Diff:/);
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /\n {2}Brief: /);
  assert.doesNotMatch(out.hookSpecificOutput.permissionDecisionReason, /Hand-off/);
  // A worker brief handed to the reviewer is missing the reviewer's two fields.
  assert.deepEqual(missingFields(WORKER_BRIEF, SCHEMAS["staff-reviewer"]), ["Diff", "Brief"]);
});

test("an agent type outside the covered six is silent, however bare its brief", () => {
  for (const agent of ["general-purpose", "Explore", "claude", "cmp-developer", "claude-code-guide"]) assert.equal(respond(spawn(agent, "do the thing")), null, agent);
  assert.equal(respond({ tool_name: "Bash", tool_input: { command: "ls" } }), null);
});

test("no subagent_type: silent unless the description or first prompt line names a covered agent by its full name", () => {
  assert.equal(coveredAgent({ description: "Implement the executor seam", prompt: "do it" }), null);
  assert.equal(coveredAgent({ description: "staff-reviewer round 2", prompt: "x" }), "staff-reviewer");
  assert.equal(coveredAgent({ prompt: "create-cmp:executor for slice 3\n..." }), "create-cmp:executor");
  assert.equal(respond({ tool_name: "Agent", tool_input: { description: "a general task", prompt: "look around" } }), null);
});

test("the hook binary: malformed JSON, empty stdin and a crash-shaped payload all exit 0 with nothing on stdout", () => {
  for (const input of ["{not json", "", "null", '{"tool_name":"Agent","tool_input":null}', '"a string"']) {
    const r = spawnSync(process.execPath, [HOOK], { input, encoding: "utf8" });
    assert.equal(r.status, 0, JSON.stringify(input));
    assert.equal(r.stdout, "", JSON.stringify(input));
  }
});

test("the hook binary: a covered spawn missing a field prints the deny JSON and exits 0", () => {
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(spawn("deep-worker", without(WORKER_BRIEF, "Proof"), "Task")), encoding: "utf8" });
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.permissionDecision, "deny");
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /deep-worker brief is missing Proof:/);
});

// CX2 — what must survive compaction is re-derived from the plan on disk.
import fs from "node:fs";
import os from "node:os";
import { openPlan, resumeLine } from "../scripts/proof-plan.mjs";

test("CX2: --open records brief, hand-off and round only when told, and the SessionStart line names them", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cx2-"));
  const opts = { planPath: path.join(dir, "plan.json"), historyFile: path.join(dir, "h.jsonl"), now: new Date("2026-09-29T10:00:00Z") };
  const bare = openPlan({ name: "s", branch: "b" }, opts);
  assert.ok(!("brief" in bare) && !("handoff" in bare) && !("round" in bare));
  assert.equal(resumeLine(bare), null);
  const plan = openPlan({ name: "slice 12", branch: "b", brief: "docs/FIX-PLAN.md", handoff: "handoff/slice-12.md", round: 1 }, opts);
  assert.deepEqual(JSON.parse(fs.readFileSync(opts.planPath, "utf8")).handoff, "handoff/slice-12.md");
  assert.equal(resumeLine(plan), 'this slice: brief docs/FIX-PLAN.md; hand-off handoff/slice-12.md; review round 1');
  // A review recorded after the slice opened moves the round; one from before it does not.
  assert.match(resumeLine(plan, { round: 2, ranAt: "2026-09-29T11:00:00Z" }), /review round 2 recorded$/);
  assert.match(resumeLine(plan, { round: 5, ranAt: "2026-09-28T11:00:00Z" }), /review round 1$/);
  // `source` is read defensively: compact and resume say so, anything else or absent adds nothing.
  assert.match(resumeLine(plan, null, "compact"), /\(session compacted — read these again\)/);
  assert.match(resumeLine(plan, null, "resume"), /\(session resumed — read these again\)/);
  assert.equal(resumeLine(plan, null, "startup"), resumeLine(plan));
  assert.equal(resumeLine(plan, null, 42), resumeLine(plan));
  assert.equal(resumeLine(null), null);
  fs.rmSync(dir, { recursive: true, force: true });
});
