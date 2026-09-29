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

/** What an adopter's agent reads: the plugin's agents, skills and their references, and the template's skills. */
function shipped() {
  const plugin = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude-plugin", "plugin.json"), "utf8"));
  const files = [
    ...plugin.agents.map((a) => path.normalize(a)),
    ...plugin.skills.map((s) => path.join(path.normalize(s), "SKILL.md")),
  ];
  // A skill's references/ are read on demand in the same adopter session as its SKILL.md.
  for (const s of plugin.skills) {
    const refs = path.join(ROOT, path.normalize(s), "references");
    if (fs.existsSync(refs)) for (const f of fs.readdirSync(refs)) if (f.endsWith(".md")) files.push(path.join(path.normalize(s), "references", f));
  }
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

// Any FILE at create-cmp's repo root that `template/` does not ship — `docs/WHY-CMP.md`,
// `bin/create-cmp.mjs`, `src/…`, `inspector/…` — derived from the tree, not listed, so a new
// top-level directory is covered the day it lands. An adopter's working directory is the
// stamped app, so a plugin file is reachable only as `${CLAUDE_PLUGIN_ROOT}/…` — the lookbehind
// passes that form (and `template/…`, `/absolute/…`). Directories are not matched: `docs/features/`
// is create-cmp's and every app's.
const ROOT_DIRS = fs
  .readdirSync(ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory() && ![".git", "node_modules", "template"].includes(d.name))
  .map((d) => d.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
const ROOT_PATH = new RegExp(`(?<![\\w.$}/~<>-])(?:${ROOT_DIRS.join("|")})/[\\w./-]+`, "g");
function unshippedRootFiles(para) {
  return [...para.matchAll(ROOT_PATH)]
    .map((m) => m[0].replace(/[.,:;)]+$/, ""))
    .filter((p) => {
      const at = path.join(ROOT, p);
      return fs.existsSync(at) && fs.statSync(at).isFile() && !fs.existsSync(path.join(ROOT, "template", p));
    });
}

/** A placeholder the model has to guess a path for; `${CLAUDE_PLUGIN_ROOT}` is substituted inline. */
const PLACEHOLDER = /<(?:repo|plugin-root)>/;

test("a shipped agent or skill names create-cmp's own files only where it says they are create-cmp's", () => {
  const files = shipped();
  assert.ok(files.length >= 10, `scanned ${files.length} shipped files — this test has lost its subject`);
  assert.ok(files.includes("agents/cmp-orchestrator.md"), "the shipped orchestrator is not among the scanned files");

  const offenders = [];
  for (const rel of files) {
    const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
    const placeholder = text.match(PLACEHOLDER);
    if (placeholder) offenders.push(`${rel}: names ${JSON.stringify(placeholder[0])} — write \${CLAUDE_PLUGIN_ROOT}/… instead`);
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
      for (const p of unshippedRootFiles(para)) {
        offenders.push(`${rel}: names ${JSON.stringify(p)}, which the template does not ship, in a paragraph that never says it is create-cmp's:\n      ${para.trim().split("\n")[0].slice(0, 140)}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `an agent in an adopter's repo is pointed at something only create-cmp has:\n  ${offenders.join("\n  ")}\n` +
      '  Mark it the way the orchestrator does ("In create-cmp, …"), reach a plugin file as ${CLAUDE_PLUGIN_ROOT}/…, or say it without the pointer.'
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
