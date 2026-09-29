// Every skill's `description` fits the Agent Skills spec and leads with its trigger.
//
// The spec caps `description` at 1,024 characters (https://agentskills.io/specification); a
// longer one fails a spec-strict upload. Claude Code's listing cuts `description` + `when_to_use`
// at 1,536 characters and drops whole entries when the listing overflows its budget, so the key
// use case goes in the FIRST sentence (docs/reference/anthropic-agentic-engineering-2026-09-27/
// notes/04-agent-skills-and-claude-md.md, "Implications"). Trim by cutting process prose — the
// body carries the process; never raise the cap. Whether a trimmed description still triggers is
// the plugin eval suite's question (evals/README.md), not this test's.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX = 1024;

// The plugin's skills (the adopter's listing) and this repository's own.
const SKILL_FILES = ["skills", ".claude/skills"].flatMap((dir) =>
  fs
    .readdirSync(path.join(ROOT, dir))
    .filter((d) => fs.existsSync(path.join(ROOT, dir, d, "SKILL.md")))
    .map((d) => `${dir}/${d}/SKILL.md`)
);

// The user's words each first sentence must carry — the key use case, not provenance or process.
const TRIGGER = {
  "cmp-audit": /audit/i,
  "cmp-dev-client": /Hot Reload/,
  "cmp-doctor": /toolchain/,
  "cmp-firebase-connect": /Firebase/,
  "cmp-inspect": /Inspect/,
  "cmp-new": /create a mobile app/,
  "cmp-preview": /UI feedback loop/,
  "cmp-qa-prep": /E2E/,
  "cmp-test": /regression test/,
  "cmp-upgrade": /version set/,
  "grill-me": /questions/,
  "npm-publish": /Publish/,
  "plugin-refresh": /Refresh the installed Claude Code plugin/,
};

/** `name` and the folded (`>-`) `description` scalar every SKILL.md here uses. */
function frontmatter(rel) {
  const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(fm, `${rel}: no --- frontmatter --- block`);
  const name = /^name: ([\w-]+)$/m.exec(fm[1])?.[1];
  const block = /^description: >-\n((?:[ \t]+.*(?:\n|$))+)/m.exec(fm[1]);
  assert.ok(name && block, `${rel}: expected \`name:\` and a folded \`description: >-\` — this reader knows no other form`);
  return { name, description: block[1].split("\n").map((l) => l.trim()).filter(Boolean).join(" ") };
}

const firstSentence = (d) => d.split(/(?<=[.!?])\s/)[0];

test("every skill description is within the spec's 1,024 characters", (t) => {
  assert.ok(SKILL_FILES.length >= 11, `found ${SKILL_FILES.length} skills — this test has lost its subject`);
  const over = [];
  let plugin = 0;
  for (const rel of SKILL_FILES) {
    const { description } = frontmatter(rel);
    if (rel.startsWith("skills/")) plugin += description.length;
    if (description.length > MAX) over.push(`${rel}: ${description.length} characters (${description.length - MAX} over)`);
  }
  t.diagnostic(`plugin skill listing: ${plugin} description characters across ${SKILL_FILES.filter((f) => f.startsWith("skills/")).length} skills`);
  assert.deepEqual(over, [], `trim the process prose, keep the trigger phrases:\n  ${over.join("\n  ")}`);
});

test("every skill description names its trigger in the first sentence", () => {
  const missing = [];
  for (const rel of SKILL_FILES) {
    const { name, description } = frontmatter(rel);
    const re = TRIGGER[name];
    if (!re) missing.push(`${rel}: no TRIGGER entry — add the words a user says for "${name}"`);
    else if (!re.test(firstSentence(description))) missing.push(`${rel}: first sentence lacks ${re}: "${firstSentence(description)}"`);
  }
  assert.deepEqual(missing, [], missing.join("\n"));
});
