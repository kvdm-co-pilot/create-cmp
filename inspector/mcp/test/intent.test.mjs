// intent.mjs — the Intent section's reader (§3.0): specs/intent.md parsed
// into ordered sections, the seed's own "_not yet captured_" marker read as
// the unfilled signal, nothing fabricated for a missing file.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getIntentData, parseIntentMarkdown } from "../src/lib/intent.mjs";

function makeProject(intentMd) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-intent-"));
  if (intentMd !== null) {
    fs.mkdirSync(path.join(root, "specs"), { recursive: true });
    fs.writeFileSync(path.join(root, "specs", "intent.md"), intentMd);
  }
  return root;
}

test("getIntentData: no specs/intent.md -> available:false with the reason, never invented sections", () => {
  const root = makeProject(null);
  try {
    const data = getIntentData(root);
    assert.equal(data.available, false);
    assert.match(data.reason, /specs\/intent\.md not found/);
    assert.equal(data.sections, undefined, "no fabricated sections");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getIntentData: seed-template placeholders read as unfilled, with the seed's own guidance carried verbatim (lead-in stripped)", () => {
  const root = makeProject(`# Intent brief

> The root artifact everything else traces to.

## Purpose

_not yet captured — filled by the cmp-new interview._ What is this app, in one or two
sentences?

## Audience

_not yet captured — filled by the cmp-new interview._ Who uses this app?
`);
  try {
    const data = getIntentData(root);
    assert.equal(data.available, true);
    assert.equal(data.title, "Intent brief");
    assert.match(data.preamble, /root artifact/);
    assert.deepEqual(
      data.sections.map((s) => s.heading),
      ["Purpose", "Audience"],
      "sections in file order",
    );
    for (const s of data.sections) assert.equal(s.filled, false);
    assert.match(data.sections[0].guidance, /^What is this app/);
    assert.doesNotMatch(data.sections[0].guidance, /not yet captured/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getIntentData: a filled brief — real prose is filled:true with no guidance; an empty section is unfilled; the glossary body passes through verbatim", () => {
  const root = makeProject(`# Intent brief

## Purpose

A pocket birding log for weekend birders.

## Audience

## Glossary

- **Sighting** — one observed bird, time-stamped.
- **Trip** — a dated outing containing sightings.
`);
  try {
    const data = getIntentData(root);
    const byHeading = Object.fromEntries(data.sections.map((s) => [s.heading, s]));
    assert.equal(byHeading.Purpose.filled, true);
    assert.equal(byHeading.Purpose.guidance, null);
    assert.match(byHeading.Purpose.body, /pocket birding log/);
    assert.equal(byHeading.Audience.filled, false, "empty section reads unfilled");
    assert.equal(byHeading.Audience.body, "");
    assert.equal(byHeading.Glossary.filled, true);
    assert.match(byHeading.Glossary.body, /\*\*Sighting\*\* — one observed bird/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("parseIntentMarkdown: no title/preamble degrades to null/empty; a lone '# ' heading after a section is body, not the title", () => {
  const parsed = parseIntentMarkdown("## Only\n\ntext\n# not a title\n");
  assert.equal(parsed.title, null);
  assert.equal(parsed.preamble, "");
  assert.equal(parsed.sections.length, 1);
  assert.match(parsed.sections[0].body, /# not a title/);
});
