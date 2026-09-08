// THE EVIDENCE LADDER HAS TWO SPELLINGS AND ONE READER.
//
// The defect this file exists to keep closed (NORTH-STAR.md §9.2, found
// 2026-09-08 by scripts/stage2-gate.mjs):
//
//   `harness init` seeds a commented `export const ladder` as THE way an
//   adopter declares their rungs — "A pack with no ladder earns no rung".
//   qa/verify.mjs read `evidenceLadder` off the object `steps(ctx)` returns.
//   qa/receipt-check.mjs read the top-level `profile.ladder`.
//
// Nothing resolved between them, and the one real profile exports BOTH out of
// the same frozen constant, so from inside it the split could not be seen. A
// foreign author who did exactly what the skeleton says got a green lane, no
// rung, and no explanation — a silently wrong verdict of the class §9.1
// catalogues eight of, and found the same way all eight were: by running in an
// ecosystem the code had never met.
//
// WHAT IS PINNED HERE, in the order it is argued:
//   1. the resolver answers the same question the same way for two unlike
//      profiles (Stage 0's differential rule — it is a profile-dependent,
//      verdict-bearing core function and is covered here, not in a ledger)
//   2. the field set it compares is DERIVED from the grader's own source, so
//      the two cannot drift apart
//   3. THE GATE, end to end: an adopter who declares the ladder only the way
//      the skeleton seeds it earns the rung it declared. This is the assertion
//      that was red before the fix; the harness's own suite could not have been
//      red, because `cmp` declares both spellings.
//   4. PLANTED (GATE-RULES Rule 1): two declarations that DISAGREE make the
//      real lane refuse, by name, minting no receipt — then they are made to
//      agree and the same tree goes green again. The refusal is a gate, so it
//      is watched failing rather than assumed to work.
//   5. every surface that shows a rung shows the pack (NORTH-STAR §6.5, §8.9).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evidenceLadderFor, GRADED_FIELDS } from "../packages/harness/src/lib/evidence-ladder.mjs";
import { evidenceLevel } from "../packages/harness/src/lib/evidence-level.mjs";
import { renderEvidenceBadge } from "../packages/harness/src/lib/evidence-badge.mjs";
import * as cmpProfile from "../packages/harness/src/lib/profiles/cmp/index.mjs";
import { createCmpSteps } from "../packages/harness/src/lib/profiles/cmp/steps-cmp.mjs";
import * as alienProfile from "./fixtures/profiles/py-alien/index.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Plant material, stated where a fixture profile ships none.
 *
 * A rung has had a PRECONDITION as well as a derivation since 2026-09-08: a
 * profile whose `plants` the Rule 0 instrument cannot plant from earns no rung
 * at all (NORTH-STAR §8.9; qa/lib/plant-calibration.mjs). Cases below that are
 * about the LADDER state it, so that a null rung in a ladder test can only ever
 * mean the ladder.
 */
const STATED_PLANTS = {
  testFileBasename: "planted_citation.txt",
  unboundCitationSource: (clause) => `# SPEC: ${clause}\nclass Planted:\n    pass\n`,
  tierUnmetCitationSource: (clause) => `# SPEC: ${clause}\ndef test_planted():\n    assert True\n`,
  unmeetableTier: "integration",
};
const CLI = path.join(REPO_ROOT, "bin", "create-cmp.mjs");

/** A cmp pack, built the way test/receipt-pack.test.mjs builds one: no Gradle runs. */
function cmpPack() {
  return createCmpSteps({
    ROOT: REPO_ROOT, HERE: REPO_ROOT, GRADLEW: "./gradlew", RERUN: "", fast: true, determinism: false,
    profile: "smoke", mode: "full", sh: () => ({ ok: true, out: "" }), shGradle: () => ({ ok: true, out: "" }),
    tryGit: () => "", tryGitLines: () => [], DEGRADED_PATHS: [],
  });
}

// ── 1. The same question, two unlike profiles ───────────────────────────────

test("DIFFERENTIAL: the resolver answers for cmp and for the alien pack, and the lane's answer equals the no-lane reader's", () => {
  // cmp declares BOTH spellings, from one frozen constant. That is legal and it
  // is why the split was invisible: both readers were right.
  const withPack = evidenceLadderFor(cmpProfile, cmpPack());
  const noPack = evidenceLadderFor(cmpProfile);
  assert.equal(withPack.ok, true);
  assert.equal(withPack.source, "both");
  assert.equal(noPack.source, "profile");
  assert.equal(
    withPack.ladder,
    noPack.ladder,
    "the lane and a reader that must not start one must grade from the same bytes — that identity IS the fix",
  );
  assert.equal(withPack.ladder, cmpProfile.ladder);

  // py-alien declares the ladder ONLY on its pack. The lane sees it; a reader
  // holding nothing but the project root cannot, and says so by returning none
  // rather than inventing a fallback.
  const alienPack = alienProfile.steps();
  const alienWith = evidenceLadderFor(alienProfile, alienPack);
  assert.equal(alienWith.ok, true);
  assert.equal(alienWith.source, "pack");
  assert.equal(alienWith.ladder, alienPack.evidenceLadder);

  const alienNoPack = evidenceLadderFor(alienProfile);
  assert.deepEqual(
    { ok: alienNoPack.ok, ladder: alienNoPack.ladder, source: alienNoPack.source },
    { ok: true, ladder: null, source: "none" },
    "a pack-only ladder is invisible to a reader that cannot start a lane, and the honest answer is none",
  );

  // Neither profile's rung moves because of the resolution — the same ladder
  // reaches the grader either way.
  const cmpSteps = [{ name: "build", verdict: "PASS" }, { name: "unitTests", verdict: "PASS" }];
  assert.equal(evidenceLevel(cmpSteps, "local", { ladder: withPack.ladder, plants: cmpProfile.plants })?.rung, "L0");
  const alienSteps = [{ name: "harness_integrity", verdict: "PASS" }];
  // py-alien ships NO `plants` — its own header says so, deliberately — so the
  // badge floor gives it no rung at all, whichever spelling the ladder was
  // resolved from (NORTH-STAR §8.9; the floor itself is proved in
  // test/badge-floor.test.mjs). The claim THIS test makes is about resolution,
  // so it is made twice: once as the profile really is, and once with plant
  // material stated, where the resolved ladder grades the rung its author
  // declared. Anything else and the two facts would be entangled.
  assert.equal(evidenceLevel(alienSteps, "local", { ladder: alienWith.ladder, plants: alienProfile.plants }), null);
  assert.equal(evidenceLevel(alienSteps, "local", { ladder: alienWith.ladder, plants: STATED_PLANTS })?.rung, "L0");
});

test("THE REGRESSION, at unit level: a profile declaring ONLY the seeded top-level spelling is graded", () => {
  // Before the fix this returned nothing, because only `evidenceLadder` on the
  // pack was ever read. The profile below is the shape `harness init` seeds:
  // a top-level `ladder`, and a pack that says nothing about rungs.
  const profile = {
    id: "svc",
    ladder: { names: { L0: "compiled", L1: "proven" }, l0Required: ["a"], l1Required: ["a", "b"] },
  };
  const pack = { id: "svc", stepsForProfile: {} };
  const resolved = evidenceLadderFor(profile, pack);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.source, "profile");
  const level = evidenceLevel([{ name: "a", verdict: "PASS" }, { name: "b", verdict: "PASS" }], "local", { ladder: resolved.ladder, plants: STATED_PLANTS });
  assert.deepEqual({ rung: level.rung, name: level.name }, { rung: "L1", name: "proven" });
});

test("two declarations that DISAGREE are refused, naming both spellings and the field", () => {
  const ladder = { names: { L1: "proven" }, l0Required: ["a"], l1Required: ["a", "b"] };
  const refused = evidenceLadderFor(
    { id: "svc", ladder },
    { evidenceLadder: { ...ladder, l1Required: ["a"] } },
  );
  assert.equal(refused.ok, false);
  assert.equal(refused.source, "both");
  assert.match(refused.reason, /profile "svc"/);
  assert.match(refused.reason, /l1Required/, "the refusal names the field that disagrees");
  assert.match(refused.reason, /export const ladder/, "and the first spelling");
  assert.match(refused.reason, /evidenceLadder/, "and the second");
});

test("two declarations that AGREE by value — not by identity — are accepted, and the top-level one is what is returned", () => {
  // The comparison must be structural: an author who writes the same ladder out
  // twice has not contradicted themselves, and refusing them would be a gate
  // with no wrong verdict behind it.
  const ladder = { names: { L0: "x" }, l0Required: ["a"], deviceExecution: [], release: null };
  const resolved = evidenceLadderFor({ id: "svc", ladder }, { evidenceLadder: JSON.parse(JSON.stringify(ladder)) });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.source, "both");
  assert.equal(resolved.ladder, ladder, "the top-level declaration is the one every reader can see, so it is the one returned");

  // A difference OUTSIDE the graded fields cannot change a rung, so it is not a
  // contradiction and is not refused.
  const annotated = { ...ladder, note: "the pack's copy carries a comment field" };
  assert.equal(evidenceLadderFor({ id: "svc", ladder }, { evidenceLadder: annotated }).ok, true);
});

test("present-but-not-a-ladder is refused, never silently graded as no ladder at all", () => {
  for (const bad of ["L1", 3, ["a"]]) {
    const r = evidenceLadderFor({ id: "svc", ladder: bad });
    assert.equal(r.ok, false, `${JSON.stringify(bad)} was accepted`);
    assert.match(r.reason, /not an evidence ladder/);
  }
  // Absent and explicit-null both mean "declared nothing", which is honest.
  for (const none of [undefined, null]) {
    assert.deepEqual(evidenceLadderFor({ id: "svc", ladder: none }).ladder, null);
  }
});

// ── 2. The compared fields are the graded fields ────────────────────────────

test("THE KEPT PLANT: `release` as a LIST is refused by name — the shape a real second-stack author reached for", () => {
  // Rule 1 says a gate is not wired until a KEPT plant makes it fail by name.
  // This is that plant, and the shape planted is not invented: it is verbatim
  // what the ktor-backend author wrote from the contract alone
  // (test/fixtures/profiles/ktor-backend/index.mjs, where the prose records it).
  // Every other ladder field is a list, so a list is the shape an author
  // reaches for; the grader reads this one as a single step NAME, so the list
  // matched nothing and L3 was unreachable in silence. The fixture is corrected
  // and the mistake lives HERE instead, because a plant is watched failing and
  // a corrected fixture proves nothing forever after.
  const ladder = {
    names: { L0: "L0", L1: "L1", L2: "L2", L3: "L3" },
    l0Required: ["harnessIntegrity"],
    l1Required: ["harnessIntegrity", "specCoverage", "unitTests"],
    deviceExecution: ["integrationTests"],
    release: ["distribution"],
  };

  // First: the wrong verdict itself, executed rather than described. The SAME
  // green lane grades L2 as a list and L3 as a string — that gap is the defect.
  const rows = ["harnessIntegrity", "specCoverage", "unitTests", "integrationTests", "distribution"].map((name) => ({ name, verdict: "PASS" }));
  assert.equal(evidenceLevel(rows, "local", { mode: "full", ladder, plants: STATED_PLANTS }).rung, "L2", "as a list, the release step earns nothing");
  assert.equal(evidenceLevel(rows, "local", { mode: "full", ladder: { ...ladder, release: "distribution" }, plants: STATED_PLANTS }).rung, "L3", "as a string, the same rows earn L3");

  // Then: the refusal that closes it, and it must NAME the field and the fix
  // rather than merely failing — an author who cannot see what to write is
  // being refused by an oracle.
  const refused = evidenceLadderFor({ id: "ktor-backend", ladder }, null);
  assert.equal(refused.ok, false, "a release that names no step is refused, not graded");
  assert.match(refused.reason, /release/, "the refusal names the field");
  assert.match(refused.reason, /ktor-backend/, "and the profile");
  assert.match(refused.reason, /release: "distribution"/, "and shows the author exactly what to write instead");

  // And the honest neighbours are untouched: a string still grades, an absent
  // one still earns no L3. A refusal that also moved a working grade would be
  // changing what a receipt claims, which is not what this is.
  assert.equal(evidenceLadderFor({ id: "x", ladder: { ...ladder, release: "distribution" } }, null).ok, true);
  assert.equal(evidenceLadderFor({ id: "x", ladder: { ...ladder, release: null } }, null).ok, true);
});

test("the fields the resolver compares are DERIVED from the grader's source, so the pair cannot drift", () => {
  // evidence-level.mjs reads its ladder through a local alias `L`. Every field
  // it touches must be a field a disagreement can be detected in — otherwise
  // two declarations could differ in something that changes the rung and be
  // waved through.
  const grader = fs.readFileSync(path.join(REPO_ROOT, "packages", "harness", "src", "lib", "evidence-level.mjs"), "utf8");
  const code = grader.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  const read = [...new Set([...code.matchAll(/\bL\.(\w+)/g)].map((m) => m[1]))].sort();
  assert.ok(read.length >= 5, `expected the grader's ladder reads to be found, saw ${JSON.stringify(read)}`);
  assert.deepEqual(
    read.filter((f) => !GRADED_FIELDS.includes(f)),
    [],
    "evidence-level.mjs reads a ladder field the resolver does not compare — add it to GRADED_FIELDS",
  );
});

// ── 3 & 4. The lane, end to end: the gate and its plant ─────────────────────

function git(cwd, args) {
  return spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd, encoding: "utf8" });
}
function node(cwd, args) {
  return spawnSync(process.execPath, args, { cwd, encoding: "utf8", timeout: 180_000, maxBuffer: 16 * 1024 * 1024 });
}

/** A Python service: no Compose, no create-cmp, nothing of ours. */
function foreignRepo() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-ladder-"));
  const dir = path.join(base, "svc");
  for (const [rel, body] of Object.entries({
    "app/cart.py": "class Cart:\n    def __init__(self, items=None):\n        self.items = items or []\n\n    def total(self):\n        return sum(self.items)\n",
    "t/test_cart.py": "from app.cart import Cart\n\n\n# SPEC: CART-01\ndef test_total():\n    assert Cart([1, 2]).total() == 3\n",
    "specs/cart.spec.md": "# Cart\n\n- **CART-01** the cart totals its line items\n",
  })) {
    fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  }
  git(dir, ["init", "-q", "."]);
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "cold"]);
  return dir;
}

/**
 * Do to the seeded profile exactly what its own commented block tells an author
 * to do: uncomment the ladder and fill in the step names. Nothing is added to
 * the object `steps()` returns, so the ladder exists in ONE place — the place
 * the skeleton seeds and, before the fix, the place the lane never looked.
 */
function uncommentTheLadder(src) {
  const lines = src.split("\n");
  const start = lines.findIndex((l) => l.trim() === "// export const ladder = {");
  assert.ok(start >= 0, "the seeded skeleton must still carry a commented ladder block");
  let end = start;
  while (end < lines.length && lines[end].trim() !== "// };") end += 1;
  assert.ok(end < lines.length, "the commented ladder block must close");
  const block = lines
    .slice(start, end + 1)
    .map((l) => l.replace(/^\/\/ ?/, ""))
    .filter((l) => !/^\s*\/\//.test(l))
    .map((l) =>
      l
        .replace(/names: \{[^}]*\}/, 'names: { L0: "locked", L1: "every promise bound", L2: "unreachable here", L3: "unreachable here" }')
        .replace(/l0Required: \[\]/, 'l0Required: ["harnessIntegrity"]')
        .replace(/l1Required: \[\]/, 'l1Required: ["harnessIntegrity", "specCoverage"]'),
    );
  return [...lines.slice(0, start), ...block, ...lines.slice(end + 1)].join("\n");
}

/**
 * Do the OTHER thing the seeded skeleton tells an author to do, because since
 * 2026-09-08 a rung needs both: declare plant material, or the badge floor
 * refuses the rung however well the ladder is declared (NORTH-STAR §8.9;
 * qa/lib/plant-calibration.mjs). Written out rather than uncommented, because
 * the skeleton's placeholders are prose — an author who leaves them would have
 * a structurally valid declaration whose plants bite nothing, and this file
 * should model what a real adopter writes, not the shortcut the floor cannot
 * see. Python, because that is what `foreignRepo` above is written in.
 */
function alsoDeclarePlants(src) {
  return `${src}
export const plants = {
  testFileBasename: "test_framework_check_planted.py",
  unboundCitationSource: (clause) => "# SPEC: " + clause + "\\nclass PlantedType:\\n    pass\\n",
  tierUnmetCitationSource: (clause) => "# SPEC: " + clause + "\\ndef test_planted():\\n    assert True\\n",
};
`;
}

/** Add a SECOND declaration, on the object steps() returns. */
function alsoOnThePack(src, ladderLiteral) {
  assert.match(src, /releaseLease: \(\) => \{\},/, "the seeded pack must still carry releaseLease");
  return src.replace(/releaseLease: \(\) => \{\},/, `releaseLease: () => {},\n    evidenceLadder: ${ladderLiteral},`);
}

test("THE GATE: an adopter who declares the ladder the way `harness init` seeds it earns the rung — and the PLANTED contradiction is refused by name", { timeout: 300_000 }, () => {
  const dir = foreignRepo();
  const entry = path.join(dir, "qa", "lib", "profiles", "svc", "index.mjs");
  const receiptPath = path.join(dir, "qa", "evidence", "latest.json");
  const relockAndCommit = () => {
    const relock = node(dir, [CLI, "harness", "relock", "--target-dir", dir]);
    assert.equal(relock.status, 0, `relock refused the adopter's own profile:\n${relock.stdout}${relock.stderr}`);
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-qm", "declare"]);
  };
  try {
    assert.equal(node(dir, [CLI, "harness", "init", "--profile", "svc", "--target-dir", dir]).status, 0);
    const seeded = fs.readFileSync(entry, "utf8");

    // ── The gate: ONE declaration, the seeded spelling ────────────────────
    // The ladder AND the plants: the skeleton seeds both, and a rung needs both
    // (the badge floor — NORTH-STAR §8.9). The subject of this test is still the
    // ladder's spelling; the plants are the precondition it is asserted under,
    // exactly as a real adopter would have to write them.
    fs.writeFileSync(entry, alsoDeclarePlants(uncommentTheLadder(seeded)));
    relockAndCommit();
    const lane = node(dir, [path.join(dir, "qa", "verify.mjs")]);
    assert.equal(lane.status, 0, `the lane must be green:\n${lane.stdout}${lane.stderr}`);
    const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
    assert.deepEqual(
      { rung: receipt.evidenceLevel?.rung, name: receipt.evidenceLevel?.name },
      { rung: "L1", name: "every promise bound" },
      "a ladder declared where the skeleton says to declare it must GRADE — earning no rung here is the silently wrong verdict this test exists for",
    );

    // ── The surface: the done-gate CLI shows the pack beside the rung ─────
    const check = node(dir, [path.join(dir, "qa", "receipt-check.mjs")]);
    assert.equal(check.status, 0, check.stdout + check.stderr);
    assert.match(check.stdout, /L1/, "the rung is shown");
    assert.match(check.stdout, /pack svc/, "and never without the pack that graded it (NORTH-STAR §6.5)");

    // ── PLANTED: a second declaration that DISAGREES ──────────────────────
    // The pack's copy would grade this same green lane at L0 instead of L1, so
    // before the refusal existed the rung on the receipt depended on which
    // reader ran. Watched failing by name, per GATE-RULES Rule 1.
    const before = fs.readFileSync(receiptPath, "utf8");
    fs.writeFileSync(
      entry,
      alsoOnThePack(alsoDeclarePlants(uncommentTheLadder(seeded)), '{ names: { L0: "locked", L1: "every promise bound" }, l0Required: ["harnessIntegrity"], l1Required: ["harnessIntegrity", "specCoverage", "aStepThisLaneDoesNotHave"], deviceExecution: [], release: null }'),
    );
    relockAndCommit();
    const planted = node(dir, [path.join(dir, "qa", "verify.mjs")]);
    const said = (planted.stderr ?? "") + (planted.stdout ?? "");
    assert.notEqual(planted.status, 0, `the lane must REFUSE a self-contradictory ladder:\n${said}`);
    assert.match(said, /profile "svc" declares its evidence ladder TWICE/, "the refusal names the profile and the contradiction");
    assert.match(said, /l1Required/, "and the field they disagree in");
    assert.equal(fs.readFileSync(receiptPath, "utf8"), before, "a run that refused to grade must mint no receipt");

    // ── Reverted: the same two declarations, made to agree ────────────────
    fs.writeFileSync(
      entry,
      alsoOnThePack(alsoDeclarePlants(uncommentTheLadder(seeded)), '{ names: { L0: "locked", L1: "every promise bound", L2: "unreachable here", L3: "unreachable here" }, l0Required: ["harnessIntegrity"], l1Required: ["harnessIntegrity", "specCoverage"], deviceExecution: [], release: null }'),
    );
    relockAndCommit();
    const recovered = node(dir, [path.join(dir, "qa", "verify.mjs")]);
    assert.equal(recovered.status, 0, `the lane must recover once the two agree:\n${recovered.stdout}${recovered.stderr}`);
    assert.equal(JSON.parse(fs.readFileSync(receiptPath, "utf8")).evidenceLevel?.rung, "L1");
  } finally {
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  }
});

// ── 5. Every surface that shows a rung shows the pack ───────────────────────

const receipt = (over = {}) => ({
  verdict: "PASS",
  mode: "full",
  commit: { sha: "2ac67a8deadbeef", dirty: [] },
  generatedAt: "2026-09-08T10:00:00.000Z",
  pack: { id: "py-alien", version: null },
  evidenceLevel: { rung: "L2", name: "proven against a real database", satisfiedBy: ["unitTests"] },
  ...over,
});

test("the README badge names the pack beside the rung, in text a reader can actually read", () => {
  const out = renderEvidenceBadge(receipt());
  assert.match(out, /L2/);
  // VERBATIM, not only inside the shields URL: shieldEscape rewrites `-` to
  // `--`, so a pack id that appeared only in the image link would read
  // "py--alien" to every human and every grep.
  assert.match(out, /py-alien/, "the pack id appears unescaped, beside the rung");
  assert.match(out, /different claims/, "and says why it is there — one pack's L2 is not another's");
});

test("a receipt that names no pack SAYS so — a rung comparable to nothing is not rendered as though it were", () => {
  const out = renderEvidenceBadge(receipt({ pack: undefined }));
  assert.match(out, /L2/, "the rung is still shown — the receipt earned it");
  assert.match(out, /pack unnamed|names no pack/i);
  assert.match(out, /cannot be compared/);
  for (const blank of [{}, { id: "" }, { id: "   " }, { id: 7 }]) {
    assert.match(renderEvidenceBadge(receipt({ pack: blank })).toLowerCase(), /pack unnamed|names no pack/, JSON.stringify(blank));
  }
});

// ── 6. …AND THE CONSOLE IS A SURFACE. ───────────────────────────────────────
//
// NORTH-STAR.md §9.2 closed the evidence path on 2026-09-08 and left the
// console open in writing: "Five console surfaces still render a bare rung —
// console-shell.mjs:280, console-overview.mjs:69, console-tabs.mjs (three), and
// preview-service.mjs:339 — named here rather than left silent, since §6.5 says
// *every* surface and a list that stops where the last commit stopped is the
// instance-fix again."
//
// The prose says five, the list holds six, and the scan finds SEVEN. The miss
// is the plan trail's recent-requests rows (console-overview.mjs
// chainHistoryHtml), where the rung OUTLIVES the run that earned it and so is
// the one place nothing later can attribute it. And none of the six could have
// been fixed as listed: every one is fed by inspector/mcp's receipt bridge or
// its digest, and neither carried `pack` off the receipt — so the pack was
// never in the console's hands to render, and a renderer-only fix would have
// printed "pack unnamed" over a receipt that names one. That producer is the
// eighth site and the reason the listed fix would have been cosmetic.
//
// So the assertions below run in two layers, because either alone is a lie:
//   - the PRODUCER, end to end from a receipt on disk (the console renders what
//     the bridge gives it; a renderer proved on a hand-built object proves
//     nothing about the page a human opens);
//   - the RENDERERS, each surface, both ways — a pack named, and no pack named.
// Then the CLASS: a console module may not spell a rung any other way, so a
// surface written tomorrow is covered the day it is written rather than the day
// someone remembers this file.

import {
  railReceiptHtml,
  receiptGlyph as shellReceiptGlyph,
} from "../packages/harness/src/console/console-shell.mjs";
import { driveChainHtml, overviewStatusHtml } from "../packages/harness/src/console/console-overview.mjs";
import { digestTabHtml, evidenceBodyHtml } from "../packages/harness/src/console/console-tabs.mjs";
import { galleryHtml } from "../packages/harness/src/console/preview-service.mjs";
import { getLastReceipt } from "../inspector/mcp/src/lib/receipt-bridge.mjs";

const CONSOLE_DIR = path.join(REPO_ROOT, "packages", "harness", "src", "console");

/** A bridge-shaped receipt, as getLastReceipt() returns one. */
const bridged = (over = {}) => ({
  available: true,
  relPath: "qa/evidence/latest.json",
  verdict: "PASS",
  profile: "local",
  commitSha: "2ac67a8deadbeef",
  generatedAt: "2026-09-08T10:00:00.000Z",
  ageMs: 60_000,
  stale: false,
  steps: [{ name: "unitTests", verdict: "PASS" }],
  evidenceLevel: { rung: "L2", name: "proven against a real database", satisfiedBy: ["unitTests"] },
  packId: "py-alien",
  ...over,
});

/**
 * Every console surface that shows a rung, as a callable that returns HTML.
 * Keyed by the file:line the defect was recorded at, so a red row names the
 * place rather than the test.
 */
function consoleSurfaces(r) {
  const history = {
    available: true,
    receipts: [
      {
        file: "qa/evidence/latest.json@2ac67a8",
        commitSha: "2ac67a8deadbeef",
        author: "K",
        committedAt: "2026-09-08T09:00:00.000Z",
        ageMs: 3_600_000,
        verdict: r.verdict,
        profile: r.profile,
        evidenceLevel: r.evidenceLevel,
        packId: r.packId,
        generatedAt: r.generatedAt,
      },
    ],
  };
  const digest = {
    available: true,
    since: "2026-09-01",
    commits: [],
    approvalEvents: [],
    openComments: null,
    laneRuns: [
      {
        sha: "2ac67a8",
        when: "2026-09-08",
        verdict: r.verdict,
        strength: "on-device: e2eSmoke",
        rung: `${r.evidenceLevel.rung} ${r.evidenceLevel.name}`,
        packId: r.packId,
      },
    ],
  };
  const chain = {
    request: { text: "add login" },
    plan: { title: "add login", steps: [] },
    history: [
      {
        at: "2026-09-08T09:00:00.000Z",
        title: "add login",
        steps: ["build"],
        durationMs: 1000,
        receipt: { verdict: r.verdict, rung: r.evidenceLevel.rung, pack: r.packId },
      },
    ],
  };
  return {
    "console-shell.mjs railReceiptHtml (the rail foot, on every page)": () => railReceiptHtml(r),
    "console-overview.mjs overviewStatusHtml (the front door's standing line)": () =>
      overviewStatusHtml({ receipt: r, statuses: [], receiptGlyph: shellReceiptGlyph, formatAge: () => "1m ago" }),
    "console-overview.mjs chainHistoryHtml (recent requests — the rows that outlive the run)": () =>
      driveChainHtml(chain),
    "console-tabs.mjs evidenceBodyHtml headline chip": () => evidenceBodyHtml(r, { available: false }),
    "console-tabs.mjs timelineRowHtml (the committed-receipt audit trail)": () =>
      evidenceBodyHtml(r, history),
    "console-tabs.mjs digestTabHtml (the front door's lane-run table)": () => digestTabHtml(digest),
    "preview-service.mjs galleryHtml (the Evidence section's status line)": () =>
      galleryHtml({ appName: "A", viewport: { width: 411, height: 891 }, version: 1, cards: [], lastReceipt: r }),
  };
}

test("THE PRODUCER: the console's receipt bridge carries the pack off the receipt, so a rung reaches the page attributable", async () => {
  // Proved from a receipt ON DISK rather than a hand-built object, because the
  // defect was not in any renderer: getLastReceipt built a fixed shape and
  // `pack` was not in it, so every surface downstream was structurally unable
  // to obey §6.5 no matter how it was written.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "console-pack-"));
  try {
    fs.mkdirSync(path.join(root, "qa", "evidence"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "qa", "evidence", "latest.json"),
      JSON.stringify({
        schema: "cmp-evidence/1",
        profile: "local",
        verdict: "PASS",
        commit: { sha: "abc123", dirty: [] },
        inputs: { hash: "deadbeef", fileCount: 3 },
        steps: [{ name: "unitTests", verdict: "PASS" }],
        evidenceLevel: { rung: "L2", name: "proven against a real database", satisfiedBy: ["unitTests"] },
        pack: { id: "py-alien", version: null },
        generatedAt: new Date().toISOString(),
      }),
    );
    const got = await getLastReceipt(root);
    assert.equal(got.available, true, JSON.stringify(got));
    assert.equal(got.packId, "py-alien", "the bridge must carry the pack beside the rung it already carries");
    // End to end: the bridge's own output, rendered by the surface a human sees.
    assert.match(railReceiptHtml(got), /py-alien/, "and the rail foot renders what the bridge gave it");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/**
 * What a HUMAN sees: tags stripped, which takes every attribute with them.
 *
 * The distinction is the whole assertion. `scripts/stage2-gate.mjs` names its
 * own weakness in criterion J — "this asks for a MENTION, not a placement — a
 * pack id in a footnote under a rung in a headline would pass" — and a test
 * that grepped raw HTML would be weaker still: a `title=` tooltip nobody hovers
 * would satisfy it. §6.5 says BESIDE the rung, so the pack is looked for in the
 * rendered words, within reach of the grade.
 */
const visible = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

test("every console surface that shows a rung shows the pack (NORTH-STAR §6.5)", () => {
  const r = bridged();
  for (const [where, render] of Object.entries(consoleSurfaces(r))) {
    const html = render();
    const text = visible(html);
    assert.match(text, /L2/, `${where}: rendered no rung at all — the fixture is wrong, not the code`);
    // BESIDE, not merely present: the pack must follow the grade within one
    // clause. A pack id elsewhere on the page is a mention, and §6.5 asks for a
    // placement — the reader meeting the rung must meet the pack in the same
    // glance, without hovering and without scrolling.
    assert.match(
      text,
      /L2[^·]{0,60}· pack py-alien/,
      `${where}: the rung is not beside its pack in the rendered TEXT — a tooltip or a footnote is a mention, not a placement (§6.5). Rendered: ${text.slice(0, 300)}`,
    );
    assert.match(
      html,
      /different claims/,
      `${where}: names the pack but never says why it is there — §8.9 is the reason a reader needs it`,
    );
  }
});

test("a console rung with NO pack SAYS so — never a bare rung the reader could compare with anything", () => {
  // The other half, and the one that makes the first half honest: a surface
  // that only appends a pack when it happens to have one degrades to exactly
  // the bare rung this rule forbids. The wording matches the README badge and
  // the done-gate CLI on purpose — one vocabulary across the surfaces.
  for (const missing of [null, undefined, "", "   "]) {
    const r = bridged({ packId: missing });
    for (const [where, render] of Object.entries(consoleSurfaces(r))) {
      const html = render();
      const text = visible(html);
      assert.match(text, /L2/, `${where}: the rung is still shown — the receipt earned it`);
      assert.match(
        text,
        /L2[^·]{0,60}· pack unnamed/,
        `${where}: pack ${JSON.stringify(missing)} rendered as a bare rung. Rendered: ${text.slice(0, 300)}`,
      );
      assert.match(
        html,
        /comparable to nothing/,
        `${where}: an unattributed rung must say what it is worth, in the words the other surfaces use`,
      );
    }
  }
});

test("THE CLASS: no console module spells a rung any way but the shared one", () => {
  // §9.2's own lesson, applied to itself: "a fix applied to the instances
  // rather than to the class comes back", a cost that section records this
  // repository paying twice in one file. The seven surfaces above are instances.
  // THIS is the class — deny-by-default over the whole console directory, the
  // same inversion test/agnostic-lint.test.mjs uses, so the seventh surface is
  // covered the day it is written and by nobody remembering to come here.
  //
  // The rule, stated as the DEFECT rather than as a naming convention: reading
  // a `rung` FIELD — `x.rung`, `x["rung"]`, `const {rung} = x` — is what every
  // one of the six sites did before interpolating the grade into its own
  // markup, so outside console-evidence.mjs that read is legal only where the
  // value is being handed to the shared derivation. A local variable may still
  // be called `rung`; what it may not be is a grade this file pulled off a
  // receipt itself. The narrower spelling matters: a rule about the word would
  // be satisfied by renaming, and a rule satisfied by renaming is not a rule.
  const files = fs
    .readdirSync(CONSOLE_DIR)
    .filter((f) => f.endsWith(".mjs") && f !== "console-evidence.mjs")
    .sort();
  assert.ok(files.length >= 5, `expected the whole console to be scanned, saw ${files.length} modules`);
  const offenders = [];
  for (const f of files) {
    // LINE comments before block comments — the other order lets a `/*` inside
    // a `//` line swallow everything to the next `*/` (the bug scripts/
    // stage05-gate.mjs records hitting while writing its own scanner).
    const src = fs
      .readFileSync(path.join(CONSOLE_DIR, f), "utf8")
      .replace(/^[ \t]*\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    src.split("\n").forEach((line, i) => {
      const readsRungField = /\.\s*rung\b/.test(line) || /\[\s*["']rung["']\s*\]/.test(line) || /\{[^}]*\brung\b[^}]*\}\s*=/.test(line);
      if (!readsRungField) return;
      if (line.includes("rungWithPack(") || line.includes("rungPackNote(")) return;
      offenders.push(`${f}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(
    offenders,
    [],
    `a console module reads a rung outside console-evidence.mjs — route it through rungWithPack so it cannot be rendered without its pack (§6.5):\n  ${offenders.join("\n  ")}`,
  );
});
