// grill-me (docs/features/grill-me.md): the grill step is a WORKFLOW change, so it
// must be stated identically on every surface an agent enters through — otherwise
// one entry point grills and another starts on unsettled ground. These tests pin
// the surfaces to agreement; the skill's own text carries the mechanics.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

test("the skill exists, is declared, and names itself", () => {
  const skill = read("skills/grill-me/SKILL.md");
  assert.match(skill, /^---\nname: grill-me\n/, "frontmatter name is the invocation name");
  const declared = JSON.parse(read(".claude-plugin/plugin.json")).skills;
  assert.ok(declared.includes("./skills/grill-me"), "a skill on disk but undeclared never loads");
});

test("the skill carries the load-bearing rules, not just the trigger words", () => {
  const skill = read("skills/grill-me/SKILL.md");
  assert.match(skill, /at most five/i, "rounds are bounded");
  assert.match(skill, /recommended answer/i, "every question carries a recommendation");
  assert.match(skill, /signed decision is closed/i, "settled decisions are never re-asked (G3)");
  assert.match(skill, /Direct lane[^\n]*\| No\./, "the direct lane is not grilled (G2)");
  assert.match(skill, /Open decisions/, "answers land in the brief's own sections (G5)");
  assert.match(skill, /gates nothing/, "the grill is not a gate (G1)");
});

test("every entry surface states the grill step (G2 — same rule, every door)", () => {
  const surfaces = {
    "docs/CHANGE-FLOW-DESIGN.md": /grill-me/,
    "docs/GENESIS-FLOW-DESIGN.md": /grill-me/,
    "template/CLAUDE.md": /Grill before the brief/,
    "skills/cmp-new/SKILL.md": /Grill the idea first/,
  };
  for (const [rel, re] of Object.entries(surfaces)) {
    assert.match(read(rel), re, `${rel} must state the grill step`);
  }
});

test("the generated contract carries the rule without the plugin", () => {
  const contract = read("template/CLAUDE.md");
  assert.match(contract, /the rule holds without the plugin/, "generated apps grill even when the plugin is absent");
  assert.match(contract, /CLOSED decision: cite it, never re-ask it/, "signed-is-closed reaches the app's own contract");
  assert.match(contract, /direct lane is not grilled/, "the direct-lane exclusion reaches the app's own contract");
});
