// A SHIPPED AGENT OR SKILL POINTS AT A FILE ONLY CREATE-CMP HAS (KD-231).
//
// The plugin ships `agents/cmp-orchestrator.md` and the skills `plugin.json` lists,
// and the template ships its own skills into every app. They are read by an agent
// working in an ADOPTER's repository. The orchestrator told that agent to hand off
// "at the budget point the user-level instructions set (`~/.claude/CLAUDE.md`)" — a
// section only the maintainer's machine has — and to leave a decision to "Karel", and
// it pointed at `docs/NORTH-STAR.md`, `docs/PRINCIPLES.md`, ADR-0015, `scripts/*.mjs`
// and `docs/KNOWN-DEFECTS.md` as if the adopter's tree carried them. Where the file
// already said "In create-cmp", the reference was honest: it tells the reader whose
// file it is. Where it did not, the reader goes looking for a file that is not there.
//
// THE INVARIANT: a paragraph that names one of create-cmp's own files, programs or
// people says "create-cmp" — and the maintainer's name and private file are named
// nowhere. The unit is the paragraph because that is how the file marks it today
// ("In create-cmp, `node scripts/…`").
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** What an adopter's agent reads: the plugin's agents and skills, and the template's skills. */
function shipped() {
  const plugin = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude-plugin", "plugin.json"), "utf8"));
  const files = [
    ...plugin.agents.map((a) => path.normalize(a)),
    ...plugin.skills.map((s) => path.join(path.normalize(s), "SKILL.md")),
  ];
  const templateSkills = path.join(ROOT, "template", ".claude", "skills");
  for (const d of fs.readdirSync(templateSkills)) files.push(path.join("template", ".claude", "skills", d, "SKILL.md"));
  return files.map((f) => f.split(path.sep).join("/"));
}

/** Named nowhere an adopter's agent reads. */
const PRIVATE = [/\bKarel\b/, /~\/\.claude\/CLAUDE\.md/];

/** create-cmp's own files and programs: named only where the paragraph says whose they are. */
const CREATE_CMP_ONLY = [
  /\bscripts\/[\w.-]+\.mjs\b/,
  /\bNORTH-STAR\.md\b/,
  /\bPRINCIPLES\.md\b/,
  /\bKNOWN-DEFECTS/,
  /\bGATE-RULES\b/,
  /\bADR-\d{4}\b/,
  /\.claude\/agents\//,
];

test("a shipped agent or skill names create-cmp's own files only where it says they are create-cmp's", () => {
  const files = shipped();
  assert.ok(files.length >= 10, `scanned ${files.length} shipped files — this test has lost its subject`);
  assert.ok(files.includes("agents/cmp-orchestrator.md"), "the shipped orchestrator is not among the scanned files");

  const offenders = [];
  for (const rel of files) {
    const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
    for (const re of PRIVATE) {
      const m = text.match(re);
      if (m) offenders.push(`${rel}: names ${JSON.stringify(m[0])}, which no adopter has`);
    }
    for (const para of text.split(/\n\s*\n/)) {
      // `create-cmp:executor` is the plugin's namespace, not a statement of whose file a thing is (KD-250).
      if (/create-cmp/.test(para.replace(/create-cmp:[\w-]+/g, ""))) continue;
      for (const re of CREATE_CMP_ONLY) {
        const m = para.match(re);
        if (m) offenders.push(`${rel}: names ${JSON.stringify(m[0])} in a paragraph that never says it is create-cmp's:\n      ${para.trim().split("\n")[0].slice(0, 140)}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `an agent in an adopter's repo is pointed at something only create-cmp has:\n  ${offenders.join("\n  ")}\n` +
      '  Mark it the way the orchestrator does ("In create-cmp, …"), or say it without the pointer.'
  );
});

test("the orchestrator's own hand-off point names no number and no maintainer's file", () => {
  const text = fs.readFileSync(path.join(ROOT, "agents", "cmp-orchestrator.md"), "utf8");
  const para = text.split(/\n\s*\n/).find((p) => p.includes("Your own session is a helper too"));
  assert.ok(para, "the orchestrator no longer says when to hand its own session off");
  assert.doesNotMatch(para, /\d/, `the hand-off rule carries a number of its own:\n${para}`);
  assert.match(para, /costs less/, "the rule no longer says what the hand-off is weighed against");
  assert.match(para, /budget point/, "a budget point the adopter's own instructions set is no longer honoured");
});
