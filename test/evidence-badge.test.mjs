// The README evidence badge (template/qa/lib/evidence-badge.mjs) — roadmap §10
// item 2's "render the rung … in the README badge".
//
// The contract under test is an HONESTY contract, not a formatting one. The
// README travels further than any other surface this harness writes, so the
// badge must never state more than the receipt does:
//   - no receipt / unreadable receipt → says so, never a rung
//   - FAIL → says so, never a rung
//   - --fast → says so, never a rung (and never borrows the last full run's)
//   - PASS with a rung → states the rung AND the commit it was attested at,
//     so the sentence stays true after the tree moves on
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  renderEvidenceBadge,
  updateReadmeBadge,
  README_REL_PATH,
  BADGE_SECTION_ID,
} from "../template/qa/lib/evidence-badge.mjs";
import { VERIFIED_SURFACE } from "../template/qa/lib/inputs-hash.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "evidence-badge-"));

function receipt(over = {}) {
  return {
    verdict: "PASS",
    mode: "full",
    commit: { sha: "2ac67a8deadbeef", dirty: [] },
    generatedAt: "2026-08-19T10:00:00.000Z",
    evidenceLevel: { rung: "L2", name: "device", satisfiedBy: ["build", "unitTests", "e2eSmoke"] },
    ...over,
  };
}

const RUNGS = /\bL[0-3]\b/;

test("a PASS receipt renders its rung, the attesting commit, and the date", () => {
  const out = renderEvidenceBadge(receipt());
  assert.match(out, /L2/);
  assert.match(out, /device/);
  assert.match(out, /2ac67a8/, "names the commit it attests");
  assert.match(out, /2026-08-19/, "names the date");
  assert.match(out, /says nothing about changes made since/, "scopes the claim to that run");
});

test("no receipt never renders a rung", () => {
  for (const input of [null, undefined, "", 0]) {
    const out = renderEvidenceBadge(input);
    assert.doesNotMatch(out, RUNGS, `rung leaked for ${JSON.stringify(input)}`);
    assert.match(out, /no verify receipt yet/);
  }
});

test("a FAILed lane never renders a rung, even if the receipt carries one", () => {
  // Defensive: evidenceLevel is null on FAIL by construction, but the badge
  // must not depend on that being true.
  const out = renderEvidenceBadge(receipt({ verdict: "FAIL", evidenceLevel: { rung: "L3", name: "release", satisfiedBy: [] } }));
  assert.doesNotMatch(out, RUNGS);
  assert.match(out, /did not pass/);
});

test("a --fast run never renders a rung, and never borrows one", () => {
  const out = renderEvidenceBadge(receipt({ mode: "fast", evidenceLevel: { rung: "L3", name: "release", satisfiedBy: [] } }));
  assert.doesNotMatch(out, RUNGS);
  assert.match(out, /--fast/);
  assert.match(out, /earns no rung/);
});

test("a PASS whose receipt records no rung says exactly that", () => {
  for (const level of [null, undefined, {}, { rung: "L2" }, { rung: 2, name: "device" }]) {
    const out = renderEvidenceBadge(receipt({ evidenceLevel: level }));
    assert.match(out, /rung unrecorded|records no evidence rung/, `bad shape rendered a rung: ${JSON.stringify(level)}`);
  }
});

test("an uncommitted tree at attestation is disclosed, not hidden", () => {
  const out = renderEvidenceBadge(receipt({ commit: { sha: "2ac67a8deadbeef", dirty: ["a.kt", "b.kt"] } }));
  assert.match(out, /2 uncommitted files/);
  assert.match(out, /describes that run, not that commit/);
});

test("each rung gets its own colour, and L3 is the only green one", () => {
  const colorOf = (rung) => renderEvidenceBadge(receipt({ evidenceLevel: { rung, name: "x", satisfiedBy: [] } }))
    .match(/badge\/[^)]*-([0-9A-F]{6})\)/)[1];
  const colors = ["L0", "L1", "L2", "L3"].map(colorOf);
  assert.equal(new Set(colors).size, 4, "rungs must be distinguishable at a glance");
  assert.equal(colorOf("L3"), "43A047");
});

test("updateReadmeBadge rewrites only the marker block, idempotently", () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, "qa", "evidence"), { recursive: true });
  fs.writeFileSync(path.join(root, "qa", "evidence", "latest.json"), JSON.stringify(receipt()));
  const before = `# App\n\n<!-- cmp:generated ${BADGE_SECTION_ID} -->\nold body\n<!-- /cmp:generated -->\n\nHand-written prose that must survive.\n`;
  fs.writeFileSync(path.join(root, README_REL_PATH), before);

  assert.equal(updateReadmeBadge(root).changed, true);
  const after = fs.readFileSync(path.join(root, README_REL_PATH), "utf8");
  assert.match(after, /L2/);
  assert.doesNotMatch(after, /old body/);
  assert.match(after, /Hand-written prose that must survive\./);
  assert.match(after, /^# App$/m);

  // Second run over the same receipt is a no-op — the badge never churns the diff.
  assert.equal(updateReadmeBadge(root).changed, false);
  assert.equal(fs.readFileSync(path.join(root, README_REL_PATH), "utf8"), after);
});

test("a --fast run never touches the README — the inner loop must not churn it", () => {
  // qa/watch.mjs runs the fast lane on every save. A writer that fired there
  // would leave README.md permanently dirty in the inner loop, and would
  // overwrite a true statement about a real full-lane run with "no rung".
  const root = tmp();
  fs.mkdirSync(path.join(root, "qa", "evidence"), { recursive: true });
  fs.writeFileSync(path.join(root, "qa", "evidence", "latest.json"), JSON.stringify(receipt()));
  fs.writeFileSync(path.join(root, README_REL_PATH), `<!-- cmp:generated ${BADGE_SECTION_ID} -->\n<!-- /cmp:generated -->\n`);
  updateReadmeBadge(root);
  const afterFull = fs.readFileSync(path.join(root, README_REL_PATH), "utf8");
  assert.match(afterFull, /L2/, "the full lane wrote its rung");

  // Now a fast run lands. The badge must stand.
  fs.writeFileSync(
    path.join(root, "qa", "evidence", "latest.json"),
    JSON.stringify(receipt({ mode: "fast", evidenceLevel: null, commit: { sha: "ffffffff", dirty: [] } }))
  );
  const res = updateReadmeBadge(root);
  assert.equal(res.changed, false);
  assert.match(res.reason, /fast run/);
  assert.equal(fs.readFileSync(path.join(root, README_REL_PATH), "utf8"), afterFull, "README untouched by the inner loop");
});

test("a project that removed the block has opted out — never re-created", () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, README_REL_PATH), "# App\n\nNo markers here.\n");
  const res = updateReadmeBadge(root);
  assert.equal(res.changed, false);
  assert.match(res.reason, /no cmp:generated/);
  assert.equal(fs.readFileSync(path.join(root, README_REL_PATH), "utf8"), "# App\n\nNo markers here.\n");
});

test("an unreadable receipt degrades to 'none yet', never to a stale rung", () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, "qa", "evidence"), { recursive: true });
  fs.writeFileSync(path.join(root, "qa", "evidence", "latest.json"), "{ not json");
  fs.writeFileSync(path.join(root, README_REL_PATH), `<!-- cmp:generated ${BADGE_SECTION_ID} -->\n<!-- /cmp:generated -->\n`);
  updateReadmeBadge(root);
  const after = fs.readFileSync(path.join(root, README_REL_PATH), "utf8");
  assert.match(after, /no verify receipt yet/);
  assert.doesNotMatch(after, RUNGS);
});

test("a missing README is not an error — the lane must never fail over a badge", () => {
  const res = updateReadmeBadge(tmp());
  assert.equal(res.changed, false);
  assert.match(res.reason, /not found/);
});

test("README.md is outside the verified surface, so writing the badge cannot invalidate the receipt", () => {
  // The badge is written AFTER the receipt's inputs hash is computed. If
  // README.md were part of the hashed surface, every lane run would leave a
  // receipt that no longer attests its own tree.
  const covered = VERIFIED_SURFACE.some((s) => README_REL_PATH === s || README_REL_PATH.startsWith(`${s}/`));
  assert.equal(covered, false);
});

test("the template ships the marker block, so a stamped app gets the badge", () => {
  const readme = fs.readFileSync(new URL("../template/README.md", import.meta.url), "utf8");
  assert.match(readme, new RegExp(`<!-- cmp:generated ${BADGE_SECTION_ID} -->[\\s\\S]*?<!-- /cmp:generated -->`));
  // The seeded body must be the honest pre-lane state, not a fabricated rung.
  const seeded = readme.match(new RegExp(`<!-- cmp:generated ${BADGE_SECTION_ID} -->\\n([\\s\\S]*?)<!-- /cmp:generated -->`))[1];
  assert.doesNotMatch(seeded, RUNGS);
  assert.match(seeded, /no verify receipt yet/);
});
