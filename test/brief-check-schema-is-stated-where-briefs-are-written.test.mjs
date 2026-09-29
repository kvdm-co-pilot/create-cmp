// brief-check denies a covered spawn whose brief lacks a labelled field, and its deny reason
// tells the model "the agent's own contract names these fields". A refusal the producer is
// never told about is a refusal that fires on every first attempt: the plugin's brief writer
// (agents/cmp-orchestrator.md — the contract that tells an orchestrator how to brief
// create-cmp:executor and a reviewer) and each covered agent's own contract must state the
// labels brief-check reads, or the claim in the deny reason is false and every
// orchestrator-written spawn is denied once by construction.
//
// Invariant: every label in brief-check's SCHEMAS is written, as a label (`Label:`), in the
// contract of the agent it is required for, and in the contract that writes briefs.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { SCHEMAS } from "../scripts/hooks/brief-check.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACT = {
  "create-cmp:executor": "agents/executor.md",
  executor: "agents/executor.md",
  "create-cmp:cmp-orchestrator": "agents/cmp-orchestrator.md",
  "cmp-orchestrator": "agents/cmp-orchestrator.md",
  "deep-worker": ".claude/agents/deep-worker.md",
  "staff-reviewer": ".claude/agents/staff-reviewer.md",
};
const BRIEF_WRITER = "agents/cmp-orchestrator.md";

const labelled = (text, field) =>
  new RegExp(`(^|[\\s\`*_-])${field.replace(/-/g, "[- ]?")}(\\*\\*|\`)?:`, "i").test(text);

test("every covered agent's contract states, as labels, the fields brief-check denies a spawn for", () => {
  const gaps = [];
  for (const [agent, schema] of Object.entries(SCHEMAS)) {
    const rel = CONTRACT[agent];
    assert.ok(rel, `brief-check covers ${agent}, and this test names no contract for it`);
    const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
    const missing = schema.filter((f) => !labelled(text, f));
    if (missing.length) gaps.push(`${agent} (${rel}) never states ${missing.map((f) => `${f}:`).join(", ")}`);
  }
  assert.deepEqual(gaps, [], `brief-check's deny reason says "the agent's own contract names these fields"; it does not:\n  ${gaps.join("\n  ")}`);
});

test("the plugin's brief writer states every label brief-check reads", () => {
  const text = fs.readFileSync(path.join(ROOT, BRIEF_WRITER), "utf8");
  const all = [...new Set(Object.values(SCHEMAS).flat())];
  const missing = all.filter((f) => !labelled(text, f));
  assert.deepEqual(missing, [], `${BRIEF_WRITER} writes executor and reviewer briefs and never states ${missing.map((f) => `${f}:`).join(", ")} — its every spawn is denied once`);
});
