// A KNOWN-DEFECTS ENTRY CARRIES ANOTHER ENTRY'S BODY, OR A FRAGMENT OF ONE THAT
// MOVED TO THE CLOSED FILE.
//
// THE INSTANCE THAT PROVOKED THIS. A rebase that union-merged `origin/main`'s
// KD-134 into a branch that was itself removing a `## Closed` section spliced the
// file: `### KD-134`'s heading was inserted INSIDE KD-161, so KD-134's section
// runs on into the whole of KD-161's body, and `### KD-161`'s heading was left
// owning one stray paragraph — the closing line of KD-78, an entry the same
// branch had moved out to `KNOWN-DEFECTS-CLOSED.md`. Every check that was run
// against it passed: no conflict markers, no duplicate ids, table-to-entry
// parity 1:1 both ways. Counting HEADINGS cannot see a body under the wrong one.
//
// THE CLASS. Not "KD-134 and KD-161 are spliced" — that goes green the moment
// two headings are swapped and says nothing about the next merge. The invariant
// is that a heading OWNS its body: an entry closes once, and no paragraph of an
// entry that moved to the closed file is still sitting in the open one. Those
// two are the shape a bad union resolution actually takes — text duplicated
// under the wrong owner, and text left behind by a removal — and they are what
// this log's own KD-132/133 recovery was about.
//
// MEASURED BEFORE IT WAS WRITTEN, so neither assertion is a taste call. Across
// the 99 open entries: exactly ONE carries two closing attributions (the spliced
// KD-134), and 47 carry none, which is an ordinary and long-standing shape — so
// the floor is "not more than one", never "exactly one". Across both files:
// exactly ONE substantial paragraph appears verbatim in both, and it is the
// stranded KD-78 line.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OPEN = "docs/KNOWN-DEFECTS.md";
const CLOSED = "docs/KNOWN-DEFECTS-CLOSED.md";

const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");

/** Every `### KD-n` section of a log, as {heading, body}. */
function entries(rel) {
  const parts = read(rel).split(/^(### KD-\d+[^\n]*)$/m);
  const out = [];
  for (let i = 1; i < parts.length; i += 2) out.push({ heading: parts[i], body: parts[i + 1] });
  // The floor catches a split that stopped matching headings, not a short log: the open log was cut
  // to ~20 entries on 2026-09-26 by design, and a broken split finds 0 or 1.
  assert.ok(out.length > 5, `${rel}: only ${out.length} entries found — this scan has lost its subject`);
  return out;
}

/** The italic line an entry signs off with: *Logged …*, *Closed …*, *Re-opened …*. */
const ATTRIBUTION = /^\*(Logged|Closed|Re-?opened)\b/gm;

test("NO ENTRY SIGNS OFF TWICE THE SAME WAY — a second *Logged means a second entry's body is living under this heading", () => {
  const offenders = [];
  for (const rel of [OPEN, CLOSED]) {
    for (const { heading, body } of entries(rel)) {
      // A closed entry legitimately signs off TWICE — *Logged … * when it was
      // found and *Closed … * when it was answered. What no entry does is sign
      // off twice the SAME way, and that is the splice: two `*Logged`s means two
      // entries. Measured across both files: one offender, and it is the splice.
      const kinds = [...body.matchAll(ATTRIBUTION)].map((m) => m[1].toLowerCase().replace("-", ""));
      const repeated = [...new Set(kinds)].filter((k) => kinds.filter((x) => x === k).length > 1);
      if (repeated.length) {
        offenders.push(`${rel} — ${heading.split("—")[0].trim()} signs off as ${repeated.join(", ")} more than once: ${kinds.join(" / ")}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "these entries repeat a closing attribution of the same kind, which is what a body attached to the wrong heading " +
      `looks like — a reader of the heading is handed another entry's measurement as this one's:\n    ${offenders.join("\n    ")}\n  ` +
      "Entries with NO sign-off are ordinary here, and a closed entry signing off *Logged then *Closed is correct; two of one KIND is the tell.",
  );
});

test("NOTHING THAT MOVED TO THE CLOSED FILE IS STILL IN THE OPEN ONE — a removal that left a paragraph behind", () => {
  const paragraphs = (text) =>
    text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 120 && !p.startsWith("|"));
  const inOpen = new Set(paragraphs(read(OPEN)));
  const shared = [...new Set(paragraphs(read(CLOSED)))].filter((p) => inOpen.has(p));
  assert.deepEqual(
    shared.map((p) => `${p.replace(/\s+/g, " ").slice(0, 120)}…`),
    [],
    `these paragraphs are in BOTH ${OPEN} and ${CLOSED}. An entry lives in exactly one of the two files; ` +
      "text in both means a move left a fragment behind, and a reviewer reading the open log is reading a " +
      "defect someone already closed.",
  );
});
