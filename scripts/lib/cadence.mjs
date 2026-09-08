// THE PHRASES THAT RESTATED THE DEVICE TIER'S CADENCE, AS A MODULE.
//
// One home, two readers: test/policy-home.test.mjs scans every tracked
// document, and scripts/hooks/proof-gate.mjs scans the session's MEMORY files
// at SessionStart — the one surface git cannot see and the 2026-09-08 audit
// counted among the twenty-eight restaters. A lint that lived in a test file
// could not be imported by a hook without running the tests.
//
// HONEST SCOPE. These are the phrasings that were found, not every phrasing
// possible; a restatement worded afresh walks past. The policy is held by the
// hook at the moment of decision; this only stops the sweep undoing itself.
export const CADENCE_PHRASES = Object.freeze([
  [/(?:fleet L2|min-level L2)`?[^.;\n]{0,12}\b(?:green\s+)?(?:\*\*)?(?:once\s+)?per (?:PR|commit)/i, "the per-PR / per-commit fleet cadence"],
  [/\b(?:device|emulator|fleet L2)[^.;\n]{0,40}\b(?:per|every|each) (?:commit|PR|step)\b/i, "a device run keyed to commits, PRs or steps"],
  [/\b(?:per|every|each) (?:commit|PR|step)\b[^.;\n]{0,40}\b(?:device (?:run|tier|proof)|fleet L2)/i, "a device run keyed to commits, PRs or steps"],
  [/(?<!`)fleet L2\s+REQUIRED/, "the line an agent acted on three times"],
]);

/** One hit per line: a line is a restatement or it is not, however many phrasings it trips. */
export function restatements(text) {
  const out = [];
  text.split("\n").forEach((line, i) => {
    for (const [re, what] of CADENCE_PHRASES) {
      if (re.test(line)) {
        out.push({ line: i + 1, what, text: line.trim() });
        break;
      }
    }
  });
  return out;
}
