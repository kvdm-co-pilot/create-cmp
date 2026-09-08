// THE PHRASES THAT RESTATED THE WRONG CADENCE, PINNED SO THEY CANNOT GROW BACK.
//
// On 2026-09-08 the device-tier policy was found restated in twenty-eight files.
// Most were mentions — history, launch prose, the adopter lane's own contract —
// and were left alone. The ones that stated a CADENCE ("fleet L2 green per PR",
// "per commit") were cut and replaced with a citation of the home: NORTH-STAR
// §7 and GATE-RULES Rule 4, which now say "every other document cites it rather
// than restating it". This test is what makes that sentence stay true.
//
// HONEST SCOPE. This catches the phrasings that were found, not novel ones — a
// restatement worded differently walks past it, and a lint that claimed
// otherwise would be the "grammar half hides" defect (NORTH-STAR §10 Q4) in
// prose. The policy is held by scripts/hooks/proof-gate.mjs at the moment of
// decision; this only stops the sweep from silently undoing itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// No allowlist. The homes were exempted at first, and the second audit found the
// exemption hiding the exact phrase the lint hunts, in §11's table of SETTLED
// decisions. An allowlist rots silently; a rule that applies to its own home does
// not. The homes quote the episode inside backticks — a quotation, not a rule —
// and the phrases below are written to pass a backtick-quoted line.

export const CADENCE_PHRASES = Object.freeze([
  [/(?:fleet L2|min-level L2)`?[^.;\n]{0,12}\b(?:green\s+)?(?:\*\*)?(?:once\s+)?per (?:PR|commit)/i, "the per-PR / per-commit fleet cadence"],
  [/\b(?:device|emulator|fleet L2)[^.;\n]{0,40}\b(?:per|every|each) (?:commit|PR|step)\b/i, "a device run keyed to commits, PRs or steps"],
  [/\b(?:per|every|each) (?:commit|PR|step)\b[^.;\n]{0,40}\b(?:device (?:run|tier|proof)|fleet L2)/i, "a device run keyed to commits, PRs or steps"],
  [/(?<!`)fleet L2\s+REQUIRED/, "the line an agent acted on three times"],
]);

export function restatements(text) {
  const out = [];
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    // One hit per line: a line is a restatement or it is not, however many phrasings it trips.
    for (const [re, what] of CADENCE_PHRASES) {
      if (re.test(line)) {
        out.push({ line: i + 1, what, text: line.trim() });
        break;
      }
    }
  });
  return out;
}

/** Tracked markdown only — a gitignored ledger is not a document anyone is pointed at. */
function trackedDocs() {
  return execSync("git ls-files -- '*.md' docs agents skills .claude template/CLAUDE.md", { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((f) => f.endsWith(".md"));
}

test("the plant: the phrasings that were cut are recognised, and the home's own wording is not", () => {
  assert.equal(restatements("All seven steps landed, one PR each, fleet L2 green per PR.").length, 1);
  assert.equal(restatements("`scripts/fleet-check.mjs --min-level L2` green **once per PR**").length, 1);
  assert.equal(restatements("gated as §11.1: fleet L2 per PR, suite + framework-check per commit").length, 1);
  assert.equal(restatements("the device tier runs after every commit that touches the harness").length, 1);
  assert.equal(restatements("   fleet L2          REQUIRED — 1 changed path").length, 1);
  // What the home says, and what history is allowed to say.
  assert.equal(restatements("the device tier runs once, at the end of that slice — never per commit").length, 0, "the rule itself names the wrong cadence to forbid it; that is not a restatement");
  assert.equal(restatements("suite + framework-check per commit").length, 0, "the cheap tiers ARE per commit");
  assert.equal(restatements("gated once at the end: full suite 698/698").length, 0);
  assert.equal(restatements("`fit-test.mjs` printed `fleet L2 REQUIRED` on any commit touching the harness").length, 0, "a backtick-quoted line is the episode, not the rule");
  assert.equal(restatements("the first all-steps-real on-device evidence pack").length, 0);
});

test("no tracked document — the homes included — states the device tier's cadence", () => {
  const hits = [];
  for (const f of trackedDocs()) {
    for (const h of restatements(fs.readFileSync(path.join(ROOT, f), "utf8"))) hits.push(`${f}:${h.line}  (${h.what})  ${h.text.slice(0, 100)}`);
  }
  assert.deepEqual(hits, [], `cadence restatements — cite NORTH-STAR §7 / GATE-RULES Rule 4 instead:\n${hits.join("\n")}`);
});
