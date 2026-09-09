// "What would earn the next rung?" — the ladder read forward.
//
// docs/proposals/LIVE-CONSOLE.md Phase C, §4's second gap: "the profile's unmet
// requirement is DERIVED and NAMED, not summarised". The rules, and each one is
// a way this row could lie:
//
//   1. IT IS NOT A SECOND OPINION ABOUT A RUNG. The mark comes from the rung
//      the RECEIPT records. Pinned by the case that separates the two: a
//      receipt whose steps would grade higher than the rung it carries.
//   2. THE REQUIREMENT IS THE DECLARATION'S OWN STEP NAME — not prose about
//      what a rung means, which stops being true in the first pack that spells
//      its steps differently.
//   3. WHICH RUNGS EXIST is derived too: a ladder that names no device step has
//      no L2, and drawing one forever dark would promise a rung the profile
//      cannot mint.
//   4. THE PACK TRAVELS WITH THE RUNGS (§6.5, §8.9) — the same four marks under
//      another pack are four other claims.
//   5. ONE SPELLING: no console module reads the ladder declaration itself.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { evidenceLevel, ladderStanding } from "../packages/harness/src/lib/evidence-level.mjs";
import { GRADED_FIELDS, evidenceLadderFor } from "../packages/harness/src/lib/evidence-ladder.mjs";
import { buildFrameworkRecord, trustState, trustLine } from "../packages/harness/src/lib/framework-record.mjs";
import { CMP_LADDER } from "../packages/harness/src/lib/profiles/cmp/ladder.mjs";
import * as cmpProfile from "../packages/harness/src/lib/profiles/cmp/index.mjs";
import * as ktorProfile from "./fixtures/profiles/ktor-backend/index.mjs";
import { ladderRowHtml } from "../packages/harness/src/console/console-ladder.mjs";
import { galleryHtml } from "../packages/harness/src/console/preview-service.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONSOLE_DIR = path.join(ROOT, "packages/harness/src/console");

/** Every step cmp's ladder needs for L2, PASSed. */
const L2_STEPS = ["build", "unitTests", "releaseBuild", "conformance", "goldenTrees", "a11y", "e2eSmoke"];

test("the mark is the RECEIPT'S rung, never a second grading of the same steps", () => {
  // The separating case: steps that WOULD grade L2 under this ladder, on a
  // receipt that records L1. Whatever the reason (a ladder that has changed
  // since, the badge floor refusing to grade at all), the page must show what
  // the receipt shows — a console that re-graded would silently disagree with
  // the artifact it is displaying, which is NORTH-STAR §9.2's defect drawn as a
  // picture.
  const wouldGrade = evidenceLevel(
    L2_STEPS.map((name) => ({ name, verdict: "PASS" })),
    "local",
    { ladder: CMP_LADDER, plants: { testFileBasename: "x.kt", unboundCitationSource: () => "", tierUnmetCitationSource: () => "", unmeetableTier: "e2e" } },
  );
  assert.equal(wouldGrade.rung, "L2", "the control: these steps do earn L2 from the one grader");

  const stand = ladderStanding(CMP_LADDER, { earned: "L1", passed: L2_STEPS });
  assert.deepEqual(
    stand.rungs.map((r) => [r.id, r.earned]),
    [["L0", true], ["L1", true], ["L2", false], ["L3", false]],
    "the receipt said L1, so the row says L1",
  );
  const html = ladderRowHtml(stand, { pack: "cmp" });
  assert.match(html, /L2 &#9675;/, "L2 is drawn OPEN even though its steps passed");
});

test("the unmet requirement is the ladder's own step name, and an `any` rung says so", () => {
  const atL1 = ladderStanding(CMP_LADDER, { earned: "L1", passed: L2_STEPS.filter((s) => s !== "e2eSmoke") });
  assert.deepEqual(atL1.next.id, "L2");
  assert.deepEqual(atL1.next.requires, ["e2eSmoke", "tokenDrift", "androidChecks"], "read from the declaration, verbatim");
  assert.equal(atL1.next.mode, "any", "one on-device execution step earns L2 — the grader's own rule");
  const html = ladderRowHtml(atL1, { pack: "cmp" });
  assert.match(html, /L2 needs <code>e2eSmoke<\/code> or <code>tokenDrift<\/code> or <code>androidChecks<\/code>/);

  const atL2 = ladderStanding(CMP_LADDER, { earned: "L2", passed: L2_STEPS });
  assert.deepEqual(atL2.next.unmet, ["releaseSmoke"], "only what is still outstanding is named");
  assert.match(ladderRowHtml(atL2, { pack: "cmp" }), /L3 needs <code>releaseSmoke<\/code>/);

  // No prose about what a rung MEANS. "a release build on device" is cmp's
  // story about `releaseSmoke`, and it is not this row's to tell.
  const text = ladderRowHtml(atL2, { pack: "cmp" }).replace(/<[^>]+>/g, " ");
  assert.equal(/release build on device|install|APK/i.test(text), false, "the row names the step, it does not describe it");
});

test("which rungs exist is the declaration's answer — a ladder with no device step has no L2", () => {
  const twoRung = { l0Required: ["test"], l1Required: ["lint"], names: { L0: "green", L1: "static" } };
  const stand = ladderStanding(twoRung, { earned: "L0", passed: ["test"] });
  assert.deepEqual(stand.rungs.map((r) => r.id), ["L0", "L1"], "two rungs, because two are declared");
  const html = ladderRowHtml(stand, { pack: "svc" });
  assert.equal(/L2|L3/.test(html), false, "no rung is drawn that this profile could never mint");
  assert.match(html, /L1 needs <code>lint<\/code>/);

  // The top rung says it is the top, rather than leaving a reader waiting for
  // a fifth mark that is never coming.
  const top = ladderStanding(twoRung, { earned: "L1", passed: ["test", "lint"] });
  assert.equal(top.atTop, true);
  assert.match(ladderRowHtml(top, { pack: "svc" }), /L1 is the top rung this pack declares/);
});

test("a profile with no ladder, and a receipt with no rung, are two different absences and both are stated", () => {
  const none = ladderStanding(null);
  assert.equal(none.available, false);
  assert.match(ladderRowHtml(none), /declares no `ladder`/);
  assert.match(ladderRowHtml(none), /ladder-absent/);

  // A tree that has earned nothing yet still gets its ladder drawn — every mark
  // open, and the floor rung named as what would come first.
  const nothing = ladderStanding(CMP_LADDER, { earned: null, passed: [] });
  assert.equal(nothing.rungs.every((r) => !r.earned), true);
  assert.match(ladderRowHtml(nothing, { pack: "cmp" }), /L0 needs <code>build<\/code> &middot; <code>unitTests<\/code>/);

  // A receipt naming a rung this ladder does not declare is reported as the
  // pair it is, rather than as a tree that earned nothing.
  const orphan = ladderStanding({ l0Required: ["t"], l1Required: [] }, { earned: "L3", passed: ["t"] });
  assert.equal(orphan.orphanRung, true);
  assert.match(ladderRowHtml(orphan, { pack: "svc" }), /records L3, which this profile's ladder does not declare/);
});

test("the rungs are never shown without the pack that owns them (§6.5, §8.9)", () => {
  const stand = ladderStanding(CMP_LADDER, { earned: "L2", passed: L2_STEPS });
  const named = ladderRowHtml(stand, { pack: { id: "cmp" } });
  assert.match(named, /pack cmp/);
  assert.match(named, /a cmp L2 and another pack's L2 are different claims/, "and why it matters, in the words the other rung surfaces use");

  const unattributed = ladderRowHtml(stand, { pack: null });
  assert.match(unattributed, /pack unnamed/, "a receipt that names no pack SAYS so — an unattributed ladder is comparable to nothing");

  // §7's refusals: no percentage of a ladder climbed, no green for an unearned
  // rung, no bar.
  for (const banned of [/\d+%/, /progress/i, /\d+ of \d+ rungs/]) {
    assert.equal(banned.test(named), false, `the ladder row refuses ${banned}`);
  }
});

test("the front door renders the row, and a caller that supplies no state renders no row", () => {
  const base = { appName: "Acme", viewport: { width: 411, height: 891 }, version: 1, cards: [] };
  const withLadder = galleryHtml({
    ...base,
    ladder: ladderStanding(CMP_LADDER, { earned: "L2", passed: L2_STEPS }),
    lastReceipt: { available: true, verdict: "PASS", evidenceLevel: { rung: "L2", name: "device", satisfiedBy: [] }, packId: "cmp", steps: [] },
  });
  assert.match(withLadder, /<h3 class="fd-h">Ladder<\/h3>/);
  assert.match(withLadder, /id="ladder"/);
  assert.match(withLadder, /L3 needs <code>releaseSmoke<\/code>/);
  assert.match(withLadder, /pack cmp/, "the pack comes from the receipt beside the rung it graded");

  assert.equal(/id="ladder"/.test(galleryHtml(base)), false, "no state supplied means no row");
});

// ── The differential: the same question, two unlike ladders ─────────────────

test("DIFFERENTIAL: the row answers for cmp and for a Kotlin/Ktor pack, each in ITS OWN vocabulary", () => {
  // NORTH-STAR §9's Stage 0 criterion, applied to the three functions this
  // slice adds: a profile-dependent answer is proved by EXECUTION against two
  // unlike profiles, never by reading. `cmp` drives a phone; `ktor-backend`
  // reaches L2 by starting a container, and the two share no step name.
  const cmpLadder = evidenceLadderFor(cmpProfile).ladder;
  const ktorResolved = evidenceLadderFor(ktorProfile, ktorProfile.steps());
  assert.equal(ktorResolved.ok, true, ktorResolved.reason);
  const ktorLadder = ktorResolved.ladder;
  assert.equal(cmpLadder === ktorLadder, false, "the control: two different ladders");

  // THE SAME LOGICAL INPUT — "this tree stands at L1" — under both.
  const atL1 = (ladder, passed) => ladderStanding(ladder, { earned: "L1", passed });
  const cmpAt = atL1(cmpLadder, ["build", "unitTests", "releaseBuild", "conformance", "goldenTrees", "a11y"]);
  const ktorAt = atL1(ktorLadder, ["harnessIntegrity", "specCoverage", "unitTests"]);

  // The same SHAPE of answer: four declared rungs, two earned, the next one
  // named. What differs is only what each profile calls things.
  for (const [who, stand] of [["cmp", cmpAt], ["ktor-backend", ktorAt]]) {
    assert.equal(stand.available, true, who);
    assert.deepEqual(stand.rungs.map((r) => [r.id, r.earned]), [["L0", true], ["L1", true], ["L2", false], ["L3", false]], who);
    assert.equal(stand.next.id, "L2", who);
    assert.equal(stand.next.mode, "any", `${who}: one execution step earns L2 under both`);
  }
  assert.deepEqual(cmpAt.next.unmet, ["e2eSmoke", "tokenDrift", "androidChecks"]);
  assert.deepEqual(ktorAt.next.unmet, ["integrationTests"]);
  // The rung LABELS are each pack's own — a `cmp` L2 and a ktor L2 are
  // different claims and the row is where a reader can see that (§8.9).
  assert.equal(cmpAt.rungs[2].name, "device");
  assert.match(ktorAt.rungs[2].name, /proven against a real database/);

  const cmpHtml = ladderRowHtml(cmpAt, { pack: "cmp" });
  const ktorHtml = ladderRowHtml(ktorAt, { pack: "ktor-backend" });
  assert.match(cmpHtml, /L2 needs <code>e2eSmoke<\/code>/);
  assert.match(ktorHtml, /L2 needs <code>integrationTests<\/code>/);
  // NO SPELLING LEAKS EITHER WAY. A cmp step name appearing in a row that has
  // nothing to do with cmp is the failure mode the agnostic suites exist for.
  for (const cmpWord of ["e2eSmoke", "androidChecks", "releaseSmoke", "goldenTrees"]) {
    assert.equal(ktorHtml.includes(cmpWord), false, `no cmp spelling may appear in a ktor row: ${cmpWord}`);
  }
  for (const ktorWord of ["integrationTests", "distribution"]) {
    assert.equal(cmpHtml.includes(ktorWord), false, `no ktor spelling may appear in a cmp row: ${ktorWord}`);
  }
  assert.match(cmpHtml, /pack cmp/);
  assert.match(ktorHtml, /pack ktor-backend/);

  // And the Rule 0 record, built for each profile in turn: it carries the STEP
  // that refused, which is the pack's own name for its gate. A record builder
  // that normalised those into one vocabulary would make two packs' Rule 0
  // results look comparable when they are not.
  const recordFor = (label, step, names) =>
    buildFrameworkRecord({
      verdict: "PASS",
      plants: [{ kind: "unbound-citation", label, step, observed: step, names, failedByName: true, durationMs: 7 }],
      treeIdentical: true,
      generatedAt: "2026-09-09T12:00:00.000Z",
    });
  const cmpRecord = recordFor("unbound citation", "specCoverage", ["HOME-99"]);
  const ktorRecord = recordFor("unbound citation", "spec_coverage", ["CART-01"]);
  assert.equal(cmpRecord.plants[0].observed, "specCoverage");
  assert.equal(ktorRecord.plants[0].observed, "spec_coverage", "the pack's own spelling, verbatim");
  // The SENTENCE is the same for both, because "one plant failed by name" is a
  // fact about the instrument and not about the stack.
  assert.equal(trustLine(trustState({ ok: true, record: cmpRecord })), trustLine(trustState({ ok: true, record: ktorRecord })));
});

test("THE CLASS: no console module reads the ladder DECLARATION — only what the grader derived from it", () => {
  // The defect: a console module deciding for itself which steps earn which
  // rung. Its observable spelling is reading the ladder's requirement lists,
  // and the list of those is DERIVED from the resolver's own GRADED_FIELDS so a
  // field added there is scanned for the day it is added.
  const AMBIGUOUS = ["names", "release"];
  const scanned = GRADED_FIELDS.filter((f) => !AMBIGUOUS.includes(f));
  // `names` and `release` are ordinary English and collide with fields this
  // console legitimately holds (a plant's `names`, a release date); the four
  // that remain cannot be read by accident, and no grader can work without at
  // least one of them. If GRADED_FIELDS ever loses one of the four, this count
  // fails rather than quietly scanning less.
  assert.equal(scanned.length, GRADED_FIELDS.length - 2, "exactly two graded fields are excluded, and deliberately");
  assert.ok(scanned.length >= 4, `expected the ladder's requirement fields to be scanned, saw ${JSON.stringify(scanned)}`);
  const probe = new RegExp(`\\.\\s*(${scanned.join("|")})\\b|\\bevidenceLadder\\b`);

  const files = fs.readdirSync(CONSOLE_DIR).filter((f) => f.endsWith(".mjs")).sort();
  assert.ok(files.length >= 5, `expected the whole console to be scanned, saw ${files.length} modules`);
  const offenders = [];
  for (const f of files) {
    const src = fs
      .readFileSync(path.join(CONSOLE_DIR, f), "utf8")
      .replace(/^[ \t]*\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    src.split("\n").forEach((line, i) => {
      if (probe.test(line)) offenders.push(`${f}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(
    offenders,
    [],
    `a console module reads the evidence ladder itself — route it through qa/lib/evidence-level.mjs's ladderStanding, which is TOLD the rung rather than deriving one:\n  ${offenders.join("\n  ")}`,
  );
});
