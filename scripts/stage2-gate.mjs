// STAGE 2's EXIT, AS A COMMAND.
//
// §9 states it as: "a profile authored by a team OUTSIDE this project passes
// framework-check and mints a receipt Gatekeeper accepts. Our own agents
// authoring one no longer counts — two have, and both found defects rather than
// proving absence of them."
//
// That sentence contains two claims of completely different kinds, and
// `scripts/stage-gate.mjs` already names the split rather than pretending
// otherwise: PROVENANCE is not automatable — its whole point is an author this
// project does not control, and no program run inside this repository can
// establish who wrote a file. ACCEPTANCE is, entirely. So this gate has two
// halves and says which is which on every line it prints:
//
//   the provenance half   read a recorded human attestation. Absent ⇒ NOT MET,
//                         with the reason. Never a pass, never "unevaluable so
//                         ignored". A human writes that file; this gate may not.
//   the acceptance half   given a profile this project did not privilege, does
//                         the machinery accept it end to end AND refuse what §8
//                         says it must refuse — evaluated by EXECUTION, in a
//                         scratch adopter built from nothing.
//
//   node scripts/stage2-gate.mjs
//
// Exit 0 when every criterion passes, 1 otherwise. Criteria that cannot be
// reached because an earlier one failed say "not reached — <reason>" rather
// than reporting a pass.
//
// STAGE 2 HAS NOT STARTED, SO THIS IS EXPECTED TO BE RED. A predicate that went
// green the day it was written would be the failure, not the success: it would
// mean it measures what already exists rather than what the stage is for. What
// it must be is red FOR THE RIGHT REASONS, each one nameable at a file and a
// line, which is what the detail strings carry.
//
// ── WHERE THE SUB-CRITERIA COME FROM ────────────────────────────────────────
//
// Stage 2's "What" column reads: "Profile versioning and protocol handshake;
// `extends`; per-profile framework-check as the badge floor; Gatekeeper reads
// `pack`; governance rows from the profile". §6 (the profile protocol and the
// nine declarations), §8 guarantees 6/7/8/9 and §3's four `nevers` for a Stack
// Profile — "Is imported by name. Owns a console tab. Earns a rung without
// plants. Ships a golden tree its own lane cannot take to L1." — are what turn
// that list into things a program can watch fail.
//
// Each criterion below is followed by the CHEAPEST FALSE GREEN I could think of
// (`stage05-gate.mjs` criterion F was `existsSync`, satisfiable by `mkdir`;
// criterion G checked a string, satisfiable by a rename) and how it resists it.
// Where it cannot resist, that is said in the criterion's own detail rather
// than hidden here.
//
// They are lettered in the order they are argued, not the order they print: C
// runs LAST because it is the only destructive one — it breaks the twin
// adopter's profile on purpose, and a refusal is only attributable once that
// same tree has been watched reaching a green lane.
//
// A — AN EXTERNAL PROFILE IS ATTESTED (human-attested; not automatable).
//     Reads docs/attestations/stage2-external-profile.json. The shape:
//
//       {
//         "schema": "prooflane-attestation/1",
//         "claim": "stage2-external-profile",
//         "date": "2026-11-04",
//         "attestedBy": { "name": "…", "role": "…" },
//         "profile":    { "id": "…" },
//         "authoredBy": { "organisation": "…", "team": "…", "contact": "…",
//                         "relationship": "how they came to write it" },
//         "artifact":   { "kind": "repo|tarball|path", "location": "…" },
//         "receipt":    "docs/attestations/<id>-receipt.json"
//       }
//
//     False green: a human writes the file naming a team that does not exist.
//     RESISTS PARTIALLY, AND SAYS SO. Nothing inside this repository can check
//     that a person exists, and a criterion that pretended to would be exactly
//     the claim-not-evidence failure this product refuses. What it CAN do is
//     make the claim falsifiable by a reader — a named organisation, a named
//     contact, a location where the artifact lives, a human who signed for it —
//     and refuse the one shortcut that is checkable: the attested profile id
//     must not be a profile this repository ships (derived from
//     packages/harness/src/lib/profiles/) nor a fixture under
//     test/fixtures/profiles/, because a profile in our tree is by construction
//     one of ours. Attesting `cmp`, `py-alien` or `ktor-backend` is the cheap
//     trick available, and it is the one that is closed.
//
// B — THAT PROFILE'S RECEIPT PASSES WHAT A NOTARY CAN CHECK WITHOUT THE TREE.
//     "Mints a receipt Gatekeeper accepts" cannot be run against Gatekeeper:
//     its hosted deployment stays deferred until real user traction
//     (NORTH-STAR.md:531) and its service lives in another repo. What it would
//     run is the same vendored predicate this repo ships, so that is what runs
//     here, minus the half that needs the adopter's tree: `checkLaneVouching`
//     over the rows, a PASS verdict, and a `pack` that names the attested
//     profile — §3's Gatekeeper never is "attests a receipt whose pack it cannot
//     vouch for" (NORTH-STAR.md:127). The inputs-hash half is explicitly NOT
//     checked and the detail says so — a notary recomputes it from the tarball,
//     and we do not have their tarball.
//
//     False green: attach any old receipt from this repo. Resists: the receipt's
//     `pack.id` must equal the attested profile id, which criterion A has
//     already forced to be a profile this repo does not ship.
//
// C — THE PROTOCOL HANDSHAKE IS REAL, AND REFUSES BY NAME.
//     §6.2 makes `protocol` a required export and §8.7 refuses a defaulted
//     profile one layer up; this is the same rule one layer down. Two
//     directions, both through the REAL LANE rather than the loader's unit
//     surface, because what matters is that nothing runs: a profile declaring a
//     protocol the core does not speak, and a profile declaring none at all.
//     Both must exit non-zero, name the profile, and mint no receipt.
//
//     False green: assert only "exit != 0". Resists: the same tree with the
//     right protocol reaches a green lane in criterion G moments earlier, so a
//     loader that refused everything would take G down with it; and the refusal
//     must NAME both protocol numbers, so a generic "profile failed to load"
//     does not count.
//
// D — `extends` WORKS, AND IS DERIVED BY THE CORE.
//     A profile that extends another inherits the base's declarations and can
//     override one. Proved by loading BOTH and comparing a declaration that
//     differs from one that does not.
//
//     False green: write the heir as `export * from "../base/index.mjs"` plus
//     its own override — ESM re-export, no core support, criterion green, claim
//     false. RESISTS: this gate writes both fixtures itself, and the heir it
//     writes imports nothing. The only way to make it green is for the LOADER
//     to derive the inheritance from the declared base. (The heir declares that
//     base under both spellings a future implementer might choose — `extends`,
//     which is legal as an export NAME though not as a binding, and
//     `extendsProfile` — so this criterion does not prejudge the field name.)
//
// E — framework-check RUNS THE PROFILE'S OWN PLANTS, EACH FAILS BY NAME, AND
//     THE TREE IS BYTE-IDENTICAL AFTERWARDS (Rule 0; §6.7; §8.9).
//     `scripts/framework-check.mjs` already proves this for `cmp` in a stamped
//     app. Nothing proves it for a profile whose plants are written in another
//     language, and that is the per-profile badge floor Stage 2 is named for.
//
//     False green: assert only that `qa/framework-check.mjs` exits 0. That is
//     satisfied TODAY by any adopted repo — a profile with no `plants` export
//     skips the two plants that need one and still prints PASS (the skip is
//     reported, which is the honest part). RESISTS: the two profile-sourced
//     plant kinds must appear in the RUN list and not in the unavailable list.
//     A second false green — declare plants that do not bite — is closed by the
//     instrument itself: `assessPlantRun` fails a plant whose lane stayed green.
//
// F — THE CONTROL: A PROFILE WITH PLANTS EARNS ITS DECLARED RUNG.
//     Criterion G is worthless without it. "No rung" is the trivial outcome:
//     a profile that declares no ladder gets none, a failing lane gets none,
//     a `--fast` run gets none. F establishes that THIS fixture, THIS ladder
//     and THIS lane can produce a rung, so that G's absence means something.
//
// G — THE BADGE FLOOR: ITS PLANTLESS TWIN EARNS NO RUNG (§8.9, §3's third
//     never). The twin differs from F's profile in exactly one export. Today
//     the grader derived
//     the rung from the ladder alone and never asks whether the profile ships
//     plants, so this is expected red and is the sharpest thing on the list.
//
//     False green: give the twin no ladder either. RESISTS: F and G run the
//     same ladder, so a ladder that stopped working would take F red with it.
//
// H — THE RECEIPT NAMES THE PACK, AND THE PREDICATE REFUSES ONE THAT DOES NOT.
//     §6.5 and §8.9: "a `cmp` L2 and any other pack's L2 are different claims".
//     A field that no predicate reads is a field an editor can delete, so
//     "Gatekeeper reads `pack`" means the vendored `evaluateReceipt` reads it.
//     Both directions, over the SAME receipt and the SAME recompute, so the
//     only difference between the accepted and the refused call is the pack.
//
//     False green: add `pack` to template/qa/evidence/schema.json. Resists: the
//     schema is not the predicate; this calls `evaluateReceipt` directly, out of
//     the adopter's own vendored qa/lib/.
//
// I — `pack.version` IS THE PROFILE'S OWN, NEVER THE HARNESS'S BORROWED NUMBER.
//     ADR-0008 decided this ("`pack.version` must become null, not inherited")
//     and Stage 2's row opens with "Profile versioning". The fixture profile
//     DECLARES a version, so the honest answer is that version — null is the
//     ADR's interim, correct only "until the profile declares its own", and this
//     fixture declares one.
//
//     False green: hardcode `null` at the writer. Resists: null ≠ the declared
//     version, so the criterion stays red and names what it wanted.
//
//     A SPELLING THIS GATE HAD TO CHOOSE: nothing in the tree declares a profile
//     version, so the fixture exports it as `version`. An implementer who picks
//     another name should change the FIXTURE, never the assertion — the claim
//     being made is "the number on the receipt came from the profile", and the
//     spelling is incidental to it. (`extends` in D needed two spellings for a
//     harder reason: `extends` is a reserved word, legal as an export name but
//     not as a binding, so a future implementer may well avoid it.)
//
// J — EVERY SURFACE THAT SHOWS A RUNG SHOWS THE PACK (§6.5; and it is what §3
//     already promises Gatekeeper does — "shows the pack beside the rung",
//     NORTH-STAR.md:127).
//     A receipt that names the pack and a badge that hides it leave a reader
//     exactly where §8.9 says they must not be. Two surfaces are executable and
//     are the ones checked: the README badge (`renderEvidenceBadge`, a pure
//     function) and `qa/receipt-check.mjs` (the done-gate CLI). The console is a
//     third and is NOT covered here — its rung rendering sits inside a page
//     renderer whose state shape belongs to Stage 0.5's gate — which is residue,
//     named rather than left silent.
//
//     False green: the criterion asks for a MENTION, and a mention is not a
//     placement — a pack id in a footnote under a rung in a headline would pass.
//     Does not fully resist; said again in the criterion's own detail.
//
// ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────
//
// "A foreign profile reaches a green lane" is Stage 0's exit
// (`scripts/cold-adoption.mjs`), not Stage 2's. It is a PRECONDITION here: the
// scratch adopters this gate builds must reach a green lane before E–J mean
// anything, and when they do not, those criteria say "not reached" and name the
// setup failure rather than re-litigating a stage that is closed.
//
// "Governance rows from the profile", the last item in Stage 2's What column,
// has NO criterion here and that is a choice a reader should be able to attack.
// Half of it is already done: `listGovernedArtifacts`
// (packages/harness/src/lib/approvals.mjs:256-263) reads the profile's own
// `artifacts(root)` and falls back only to the workflow-loop's briefs. The other
// half is §6.2's `review` declaration — "what Design and Audit are here; the
// router's stack rows" — which no profile in this tree exports and which has no
// shape anywhere in the source. A predicate for it would be me inventing the
// declaration rather than measuring it, and inventing a design inside a gate is
// how a gate comes to certify its author's guess. It is the one place this file
// must grow before Stage 2 can honestly exit.
//
// ── THE REPO IS READ-ONLY TO THIS GATE ──────────────────────────────────────
//
// Every tree it writes is under os.tmpdir() and removed in a `finally`. It
// borrows nothing from the repo and edits nothing in it; `git status
// --porcelain` is identical before and after. The one thing it reads out of the
// repo that a human owns is the attestation, and it never writes that.
//
// ONE COUPLING WORTH DECLARING: the scratch adopters are built with
// `create-cmp harness init`, because that is the only on-ramp that exists
// today — which is the very thing Stage 1's predicate reports as unmet (the
// harness package declares no `bin`). When Stage 1 lands, the adoption path in
// `buildAdopter` is what changes here, and nothing else: every criterion below
// is about the profile, not about how the lane arrived.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PROFILE_PROTOCOL, loadProfile } from "../packages/harness/src/lib/profile-loader.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(REPO_ROOT, "bin", "create-cmp.mjs");
const SHIPPED_PROFILES = path.join(REPO_ROOT, "packages", "harness", "src", "lib", "profiles");
const FIXTURE_PROFILES = path.join(REPO_ROOT, "test", "fixtures", "profiles");
const ATTESTATION_REL = "docs/attestations/stage2-external-profile.json";

/** The id and the version the scratch profile declares — both arbitrary, both checked. */
const ALIEN_ID = "alien-py";
const ALIEN_VERSION = "0.3.1";

function run(cmd, args, cwd, opts = {}) {
  return spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 120_000, ...opts });
}

function git(cwd, ...args) {
  return run("git", ["-c", "user.email=stage2@gate", "-c", "user.name=stage2", ...args], cwd);
}

/** The last couple of lines of whatever a command said — enough to name a cause. */
function tail(res, n = 2) {
  return (((res?.stderr ?? "") + (res?.stdout ?? "")).trim().split("\n").slice(-n).join(" ") || "(no output)").slice(0, 400);
}

// ── The scratch adopter ─────────────────────────────────────────────────────

/**
 * A Python service: no Compose, no create-cmp, nothing of ours, and a language
 * whose comment marker, test-declaration form and file convention all disagree
 * with the one profile this repo ships. Two clauses, one of them tier-declaring,
 * because a lane that binds nothing passes exactly as green as one that proves
 * something (`scripts/cold-adoption.mjs` is where that lesson is kept).
 */
const ADOPTER_FILES = {
  "app/cart.py": "class Cart:\n    def __init__(self, items=None):\n        self.items = items or []\n\n    def total(self):\n        return sum(self.items)\n",
  "t/test_cart.py":
    "from app.cart import Cart\n\n\n# SPEC: CART-01\ndef test_total():\n    assert Cart([1, 2]).total() == 3\n\n\n# SPEC: CART-02\ndef test_empty():\n    assert Cart().total() == 0\n",
  "specs/cart.spec.md": "# Cart\n\n- **CART-01** the cart totals its line items\n- **CART-02** [tier: fast] an empty cart totals zero\n",
};

/**
 * The profile the gate writes over the one `harness init` seeds.
 *
 * Why not just use the seeded one: it declares a single tier, so there IS no
 * tier a host test cannot satisfy and the `tier-unmet` plant — the plant that
 * calibrates the gate this whole instrument exists to prove — can never be
 * made. Two tiers is the smallest shape in which the profile's own plants are
 * possible at all, which is criterion E's subject.
 *
 * `String.raw` on purpose: this source is full of regex literals, and inside an
 * ordinary template literal `\s` silently becomes `s`. Nothing below uses a
 * backtick or a template literal for the same reason — string concatenation
 * instead, so the text that lands on disk is the text written here.
 *
 * @param {{withPlants: boolean, protocol?: number, declareProtocol?: boolean}} opts
 */
function alienProfileSource({ withPlants, protocol = PROFILE_PROTOCOL, declareProtocol = true }) {
  const protocolLine = declareProtocol ? `export const protocol = ${protocol};` : "// (no protocol export — deliberately)";
  const plantsBlock = withPlants
    ? String.raw`
/**
 * Rule 0's plant material, in THIS stack's language. Without it the instrument
 * cannot make the unbound-citation or tier-unmet plants and says so per plant.
 */
export const plants = {
  testFileBasename: "test_framework_check_planted.py",
  unboundCitationSource: (clause) => "# SPEC: " + clause + "\nclass PlantedType:\n    pass\n",
  tierUnmetCitationSource: (clause) => "# SPEC: " + clause + "\ndef test_planted():\n    assert True\n",
  unmeetableTier: "slow",
};
`
    : `
// NO \`plants\` EXPORT — deliberately. This is the badge-floor twin: identical
// to its sibling in every other export, so the only thing that can explain a
// difference in the rung it earns is the absence of calibrated plants.
`;
  return (
    String.raw`// The "${ALIEN_ID}" stack profile — written by scripts/stage2-gate.mjs.
//
// Not a real adopter's profile and not pretending to be one: it is held-out
// input, built to disagree with ` +
    "`cmp`" +
    String.raw` on the axes a core function might quietly
// assume — a "#" comment marker, def-form tests, tests in a directory this
// project chose, two tiers where one of them can never be satisfied on the
// host, and no journey tier at all.
import fs from "node:fs";
import path from "node:path";

import { checkHarnessIntegrity, describeIntegrity } from "../../harness-lock.mjs";
import { requireSpecModel } from "../../spec-model.mjs";
import { scanSpecClauses, scanCitations, clauseTierCoverage, citationScanDiagnostic } from "../../spec-coverage.mjs";

export const id = "${ALIEN_ID}";
${protocolLine}

/**
 * THIS PROFILE'S OWN VERSION, moving independently of the harness — the thing
 * Stage 2 calls "profile versioning". A receipt that borrows the harness's
 * number for the pack is asserting something about the pack that nobody
 * measured (ADR-0008).
 */
export const version = "${ALIEN_VERSION}";

export const grammar = {
  citationMarker: /^(?:\/\/|#)\s*SPEC:/,
  lineComment: /^#/,
  blockComment: { open: '"""', close: '"""' },
  testDeclaration: /^\s*(?:async\s+)?def\s+test\w*\s*\(|^\s*class\s+Test\w*\s*[(:]/,
  typeDeclaration: /^\s*class\s+\w+/,
  bindingWindow: 5,
};

export const layout = {
  specs: "specs",
  citationRoots: ["app", "t"],
  citationExts: [".py"],
  flows: null,
  sourceRoots: ["app"],
};

/**
 * Two tiers, and "slow" is NOT host-satisfiable — which is what makes a
 * tier-unmet plant possible at all. cmp's equivalent is a device; here it is
 * simply a tier no file under t/ can ever be on.
 */
export const tiers = {
  names: ["fast", "slow"],
  hostOnly: ["fast"],
  satisfying: { fast: ["fast", "slow"], slow: ["slow"] },
  journey: null,
  forFile: (rel) => {
    if (/(^|\/)slow_[^/]*\.py$/.test(rel)) return "slow";
    if (/(^|\/)test_[^/]*\.py$/.test(rel)) return "fast";
    return null;
  },
};
${plantsBlock}
/** Is this lane the one that was locked? */
function stepHarnessIntegrity(ROOT) {
  const started = Date.now();
  const r = checkHarnessIntegrity(ROOT);
  const verdict = r.status === "intact" ? "PASS" : r.status === "unlocked" ? "SKIP" : "FAIL";
  return {
    name: "harnessIntegrity",
    verdict,
    skipKind: verdict === "SKIP" ? "structure" : undefined,
    reason: verdict === "PASS" ? undefined : describeIntegrity(r),
    durationMs: Date.now() - started,
    layer: "spine",
    harness: r,
  };
}

/** Is every promise cited from a test that can actually observe it? */
function stepSpecCoverage(ROOT) {
  const started = Date.now();
  const model = requireSpecModel(ROOT);
  const specsDir = path.join(ROOT, ...model.specsDir.split("/"));
  if (!fs.existsSync(specsDir)) {
    return {
      name: "specCoverage",
      verdict: "SKIP",
      skipKind: "structure",
      reason: "no " + model.specsDir + "/ directory — this project declares no behaviour yet",
      durationMs: Date.now() - started,
      layer: "spine",
    };
  }
  const clauses = scanSpecClauses(ROOT, model);
  const tags = scanCitations(ROOT, model);
  const cited = new Set(tags.map((t) => t.id));
  const orphanClauses = [...clauses.entries()].filter(([, c]) => !c.withdrawn).filter(([cid]) => !cited.has(cid));
  const orphanTags = tags.filter((t) => !clauses.has(t.id) || clauses.get(t.id).withdrawn);
  const { unmetTier } = clauseTierCoverage(clauses, tags, model);
  const problems = [
    ...orphanClauses.map(([cid, c]) => cid + " is declared but never cited from a test (" + c.file + ")"),
    ...orphanTags.map((t) => t.file + ":" + t.line + " cites " + t.id + ", which no spec declares"),
    ...unmetTier.map(
      (u) =>
        u.id +
        " declares [tier: " +
        u.requiredTier +
        "] but is cited only from " +
        (u.tiers.length ? u.tiers.join(", ") : "nowhere") +
        " — only " +
        (model.tiers.satisfying[u.requiredTier] ?? []).join(" or ") +
        " can observe it (" +
        u.file +
        ")",
    ),
  ];
  const scanNote = citationScanDiagnostic(tags, model);
  if (scanNote) problems.unshift(scanNote);
  return {
    name: "specCoverage",
    verdict: problems.length ? "FAIL" : "PASS",
    reason: problems.length ? problems.join("\n  ") : undefined,
    durationMs: Date.now() - started,
    layer: "spine",
    details: { clauses: [...clauses.values()].filter((c) => !c.withdrawn).length, citations: tags.length },
  };
}

export function steps({ ROOT }) {
  const harnessIntegrity = () => stepHarnessIntegrity(ROOT);
  const specCoverage = () => stepSpecCoverage(ROOT);
  const all = [harnessIntegrity, specCoverage];
  const STEP_FN_BY_NAME = { harnessIntegrity, specCoverage };
  return {
    id,
    stepsForProfile: { smoke: all, scaffold: all, local: all, ci: all, nightly: all, release: all },
    DEVICE_STEPS: [],
    FAST_EXCLUDED_NAMES: [],
    STEP_FN_BY_NAME,
    stepDeterminism: () => null,
    releaseLease: () => {},
    /** The rungs THIS pack means. Nothing here can reach L2: it has no device. */
    evidenceLadder: {
      names: { L0: "L0 — the lane is the locked one", L1: "L1 — every promise bound", L2: "L2 — unreachable here", L3: "L3 — unreachable here" },
      l0Required: ["harnessIntegrity"],
      l1Required: ["harnessIntegrity", "specCoverage"],
      deviceExecution: [],
      release: null,
    },
  };
}
`
  );
}

/**
 * Build a scratch adopter, adopt the harness into it, replace the seeded
 * profile with the alien one, re-take the lock over it, and commit.
 *
 * The relock is not incidental: the profile is inside the lock region
 * (harness-region.mjs), so an adopter's first legitimate edit to the file
 * `harness init` told them was theirs makes `harnessIntegrity` FAIL. Editing it
 * without re-locking would produce a failing lane and every criterion below
 * would be red for that reason instead of its own.
 *
 * @returns {{root: string, ok: boolean, why?: string, detail?: string}}
 */
function buildAdopter(label, { withPlants }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `stage2-${label}-`));
  const fail = (why, detail) => ({ root, ok: false, why, detail });
  for (const [rel, body] of Object.entries(ADOPTER_FILES)) {
    fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  git(root, "init", "-q", ".");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "cold");

  const init = run(process.execPath, [CLI, "harness", "init", "--profile", ALIEN_ID, "--target-dir", root], REPO_ROOT);
  if (init.status !== 0) return fail("harness init failed", tail(init));

  const entry = path.join(root, "qa", "lib", "profiles", ALIEN_ID, "index.mjs");
  if (!fs.existsSync(entry)) return fail("init wrote no profile", `expected ${path.relative(root, entry)}`);
  fs.writeFileSync(entry, alienProfileSource({ withPlants }));

  const relock = run(process.execPath, [CLI, "harness", "relock", "--target-dir", root], REPO_ROOT);
  if (relock.status !== 0) return fail("harness relock refused the adopter's own profile", tail(relock, 4));

  git(root, "add", "-A");
  git(root, "commit", "-qm", "adopt the lane and declare the stack");
  return { root, ok: true };
}

/** The lane, run as an adopter runs it. */
function lane(root, args = []) {
  return run(process.execPath, [path.join(root, "qa", "verify.mjs"), ...args], root);
}

function readReceipt(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, "qa", "evidence", "latest.json"), "utf8"));
  } catch {
    return null;
  }
}

/**
 * A content digest of a whole tree — the same method
 * `scripts/framework-check.mjs` uses, and for the same reason: the scratch tree
 * is not always in a state where `git status` answers the question, and a
 * git-based guard that exits non-zero reads as "nothing changed".
 */
function snapshot(dir) {
  const IGNORED = new Set([".git", "node_modules", "build", "target", "dist"]);
  const h = createHash("sha256");
  const walk = (abs, rel) => {
    for (const ent of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const childAbs = path.join(abs, ent.name);
      const childRel = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        if (IGNORED.has(ent.name)) continue;
        h.update(`D:${childRel}\0`);
        walk(childAbs, childRel);
      } else if (ent.isFile()) {
        h.update(`F:${childRel}\0`).update(fs.readFileSync(childAbs)).update("\0");
      }
    }
  };
  walk(dir, "");
  return h.digest("hex");
}

// ── The provenance half ─────────────────────────────────────────────────────

/** Profile ids this repository authored — shipped or fixture. Derived, never listed. */
function ourProfileIds() {
  const read = (dir) => {
    try {
      return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return [];
    }
  };
  return new Set([...read(SHIPPED_PROFILES), ...read(FIXTURE_PROFILES)]);
}

/**
 * Judge the attestation as a DOCUMENT. Everything checkable is checked; the one
 * thing that is not — whether the named people exist — is returned as a caveat
 * the criterion prints, so a reader is never told this gate proved provenance.
 * @param {object|null} a
 */
function attestationProblems(a) {
  const problems = [];
  const need = (cond, msg) => {
    if (!cond) problems.push(msg);
  };
  need(a && typeof a === "object", "not a JSON object");
  if (!a || typeof a !== "object") return problems;
  need(a.claim === "stage2-external-profile", `claim must be "stage2-external-profile" (got ${JSON.stringify(a.claim)})`);
  need(typeof a.attestedBy?.name === "string" && a.attestedBy.name.trim(), "attestedBy.name is missing — an attestation nobody signed is a note");
  need(/^\d{4}-\d{2}-\d{2}$/.test(String(a.date ?? "")), "date must be YYYY-MM-DD");
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(a.date ?? "")) && Date.parse(a.date) > Date.now()) problems.push(`date ${a.date} is in the future`);
  need(typeof a.profile?.id === "string" && a.profile.id.trim(), "profile.id is missing");
  need(typeof a.authoredBy?.organisation === "string" && a.authoredBy.organisation.trim(), "authoredBy.organisation is missing");
  need(typeof a.authoredBy?.contact === "string" && a.authoredBy.contact.trim(), "authoredBy.contact is missing — an unfalsifiable claim is not evidence");
  need(typeof a.artifact?.location === "string" && a.artifact.location.trim(), "artifact.location is missing — where the profile lives");
  // The one cheap trick that IS checkable: attesting a profile we wrote.
  const ours = ourProfileIds();
  if (typeof a.profile?.id === "string" && ours.has(a.profile.id)) {
    problems.push(`profile "${a.profile.id}" is authored IN THIS REPOSITORY (packages/harness/src/lib/profiles/ or test/fixtures/profiles/) — §9 says our own agents authoring one no longer counts`);
  }
  return problems;
}

// ── The criteria ────────────────────────────────────────────────────────────

async function criteria() {
  const out = [];
  const scratch = [];
  const keep = (root) => {
    scratch.push(root);
    return root;
  };
  try {
    // ── A and B — provenance, and what a notary could check about it ────────
    const attPath = path.join(REPO_ROOT, ...ATTESTATION_REL.split("/"));
    let attestation = null;
    let parseError = null;
    if (fs.existsSync(attPath)) {
      try {
        attestation = JSON.parse(fs.readFileSync(attPath, "utf8"));
      } catch (err) {
        parseError = err.message;
      }
    }
    const attProblems = attestation ? attestationProblems(attestation) : null;
    out.push({
      what: "a profile authored OUTSIDE this project is attested (human-attested — this gate cannot derive it)",
      ok: Boolean(attProblems && attProblems.length === 0),
      detail: !fs.existsSync(attPath)
        ? `no external profile is attested — ${ATTESTATION_REL} does not exist. A human writes it; this gate may not, and reports its absence as NOT MET rather than as unevaluable`
        : parseError
          ? `${ATTESTATION_REL} does not parse: ${parseError}`
          : attProblems.length
            ? `${ATTESTATION_REL}: ${attProblems.join("; ")}`
            : `${attestation.profile.id} by ${attestation.authoredBy.organisation}, attested ${attestation.date} by ${attestation.attestedBy.name} — NOTE: this gate checked the document, not the people. Whether that team exists and wrote it is outside anything this repository can run`,
    });

    if (!attProblems || attProblems.length) {
      out.push({
        what: "that profile's receipt passes what a notary can check without the tree",
        ok: false,
        detail: "not reached — no external profile is attested (criterion A)",
      });
    } else {
      // The predicate a notary runs, minus the half that needs their tree.
      const { checkLaneVouching } = await import(pathToFileURL(path.join(REPO_ROOT, "packages", "harness", "src", "lib", "receipt-validate.mjs")).href);
      const receiptRel = typeof attestation.receipt === "string" ? attestation.receipt : null;
      let external = null;
      let readErr = null;
      if (receiptRel) {
        try {
          external = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, ...receiptRel.split("/")), "utf8"));
        } catch (err) {
          readErr = err.message;
        }
      }
      const vouch = external ? checkLaneVouching(external) : null;
      const packOk = Boolean(external && external.pack && external.pack.id === attestation.profile.id);
      const passOk = Boolean(external && external.verdict === "PASS");
      const ok = Boolean(vouch && vouch.ok && packOk && passOk);
      out.push({
        what: "that profile's receipt passes what a notary can check without the tree",
        ok,
        detail: !receiptRel
          ? `the attestation names no \`receipt\` — record the minted receipt beside it so this half stops being a claim`
          : readErr
            ? `cannot read ${receiptRel}: ${readErr}`
            : ok
              ? `${receiptRel}: PASS, pack ${external.pack.id}, ${vouch.detail}. The inputs-hash half is NOT checked here — a notary recomputes it from their tarball, and we do not have it`
              : `${receiptRel}: ${[!passOk && `verdict ${external?.verdict}`, !packOk && `pack ${JSON.stringify(external?.pack?.id)} ≠ profile ${JSON.stringify(attestation.profile.id)}`, vouch && !vouch.ok && vouch.detail].filter(Boolean).join("; ")}`,
      });
    }

    // ── D — `extends`, on a scratch root with nothing but two profiles ──────
    // Done before the adopters because it needs no lane and no adoption: if the
    // core cannot derive inheritance, it says so in milliseconds.
    {
      const root = keep(fs.mkdtempSync(path.join(os.tmpdir(), "stage2-extends-")));
      const write = (id, source) => {
        const dir = path.join(root, "qa", "lib", "profiles", id);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "index.mjs"), source);
      };
      write(
        "alien-base",
        `export const id = "alien-base";
export const protocol = ${PROFILE_PROTOCOL};
export const layout = { specs: "specs", citationRoots: ["app"], citationExts: [".py"], flows: null, sourceRoots: ["app"] };
export const tiers = { names: ["base-tier"], hostOnly: ["base-tier"], satisfying: { "base-tier": ["base-tier"] }, journey: null, forFile: () => "base-tier" };
export function steps() { return { id, stepsForProfile: {}, STEP_FN_BY_NAME: {}, stepDeterminism: () => null, releaseLease: () => {} }; }
`,
      );
      // THE HEIR IMPORTS NOTHING. It declares its base as DATA and overrides one
      // declaration; everything else must be derived by the loader or it is not
      // `extends`, it is an ESM re-export wearing the word.
      write(
        "alien-heir",
        `const BASE = "alien-base";
export const id = "alien-heir";
export const protocol = ${PROFILE_PROTOCOL};
export { BASE as extends };
export const extendsProfile = BASE;
export const tiers = { names: ["heir-tier"], hostOnly: ["heir-tier"], satisfying: { "heir-tier": ["heir-tier"] }, journey: null, forFile: () => "heir-tier" };
`,
      );
      const base = await loadProfile(root, { id: "alien-base" });
      const heir = await loadProfile(root, { id: "alien-heir" });
      const inherited = Boolean(base.ok && heir.ok && JSON.stringify(heir.profile.layout) === JSON.stringify(base.profile.layout) && typeof heir.profile.steps === "function");
      const overridden = Boolean(heir.ok && heir.profile.tiers?.names?.[0] === "heir-tier");
      out.push({
        what: "`extends`: a profile inherits its base's declarations and overrides one, derived by the core",
        ok: inherited && overridden,
        detail: !base.ok
          ? `the base profile itself did not load: ${base.reason}`
          : heir.ok
            ? inherited && overridden
              ? "layout and steps inherited from alien-base; tiers overridden by alien-heir"
              : `loaded, but ${!inherited ? "nothing was inherited" : "the override did not take"}`
            : `${heir.reason} — the loader has no \`extends\`: profile-loader.mjs REQUIRED_EXPORTS (:51) demands every declaration from every profile, so an heir that declares only what it changes is refused`,
      });
    }

    // ── The scratch adopter, with plants ────────────────────────────────────
    const withPlants = buildAdopter("plants", { withPlants: true });
    keep(withPlants.root);
    const blockedBySetup = (what) =>
      out.push({ what, ok: false, detail: `not reached — the scratch adopter could not be built: ${withPlants.why} (${withPlants.detail})` });
    if (!withPlants.ok) {
      blockedBySetup("framework-check runs the profile's OWN plants, each FAILs by name, and the tree is byte-identical after");
      blockedBySetup("the control: a profile WITH plants earns the rung its ladder declares");
      blockedBySetup("the badge floor: its plantless twin earns NO rung");
      blockedBySetup("the receipt names its pack, and the vendored predicate REFUSES one that does not");
      blockedBySetup("`pack.version` is the profile's own, never the harness's borrowed number");
      blockedBySetup("every surface that shows a rung shows the pack");
      blockedBySetup("the protocol handshake refuses an unsupported protocol BY NAME, and mints no receipt");
      return out;
    }

    // ── E — Rule 0, per profile ─────────────────────────────────────────────
    const before = snapshot(withPlants.root);
    const fc = run(process.execPath, [path.join(withPlants.root, "qa", "framework-check.mjs"), "--json"], withPlants.root);
    const after = snapshot(withPlants.root);
    let report = null;
    try {
      report = JSON.parse(fc.stdout.slice(fc.stdout.indexOf("{")));
    } catch {
      /* named below */
    }
    const PROFILE_SOURCED = ["unbound-citation", "tier-unmet"];
    const ranKinds = new Set((report?.plants ?? []).map((p) => p.kind));
    const missing = PROFILE_SOURCED.filter((k) => !ranKinds.has(k));
    const restored = before === after;
    out.push({
      what: "framework-check runs the profile's OWN plants, each FAILs by name, and the tree is byte-identical after",
      ok: fc.status === 0 && report?.verdict === "PASS" && missing.length === 0 && restored,
      detail:
        fc.status !== 0 || !report
          ? `qa/framework-check.mjs exited ${fc.status}: ${tail(fc, 3)}`
          : missing.length
            ? `${report.plants.length} plants ran but the profile-sourced ones did not: ${missing.map((k) => `${k} — ${(report.unavailable ?? []).find((u) => u.kind === k)?.reason ?? "not reported"}`).join("; ")}`
            : !restored
              ? `${report.plants.length} plants ran, each FAILing by name, but the tree CHANGED (${before.slice(0, 12)} → ${after.slice(0, 12)}) — an instrument that leaves residue is one nobody runs twice`
              : `${report.plants.length} plants, ${report.totalMs}ms, each FAILing by name; ${PROFILE_SOURCED.join(" and ")} came from the profile; tree byte-identical`,
    });

    // ── F — the control ─────────────────────────────────────────────────────
    const laneWith = lane(withPlants.root);
    const receiptWith = readReceipt(withPlants.root);
    const laneGreen = laneWith.status === 0 && /verify lane: PASS/.test(laneWith.stdout ?? "");
    const rung = receiptWith?.evidenceLevel?.rung ?? null;
    out.push({
      what: "the control: a profile WITH plants earns the rung its ladder declares",
      ok: laneGreen && rung === "L1",
      detail: !laneGreen
        ? `the lane did not pass, so nothing below can be attributed: ${tail(laneWith, 3)}`
        : rung === "L1"
          ? `rung ${rung} · ${receiptWith.evidenceLevel.name}, satisfied by ${receiptWith.evidenceLevel.satisfiedBy.join(" + ")}`
          : `the lane passed but earned ${rung === null ? "no rung at all" : rung} — this fixture cannot produce a rung, so the badge floor below would be green for the wrong reason`,
    });

    // ── G — the badge floor ─────────────────────────────────────────────────
    const blockedByControl = (what) => out.push({ what, ok: false, detail: "not reached — the control lane did not earn its rung (criterion F)" });
    if (!laneGreen || rung !== "L1") {
      blockedByControl("the badge floor: its plantless twin earns NO rung");
      blockedByControl("the receipt names its pack, and the vendored predicate REFUSES one that does not");
      blockedByControl("`pack.version` is the profile's own, never the harness's borrowed number");
      blockedByControl("every surface that shows a rung shows the pack");
      blockedByControl("the protocol handshake refuses an unsupported protocol BY NAME, and mints no receipt");
      return out;
    }

    const plantless = buildAdopter("plantless", { withPlants: false });
    keep(plantless.root);
    const lanePlantless = plantless.ok ? lane(plantless.root) : null;
    const receiptPlantless = plantless.ok ? readReceipt(plantless.root) : null;
    const plantlessGreen = Boolean(lanePlantless && lanePlantless.status === 0 && /verify lane: PASS/.test(lanePlantless.stdout ?? ""));
    const plantlessRung = receiptPlantless?.evidenceLevel?.rung ?? null;
    out.push({
      what: "the badge floor: its plantless twin earns NO rung",
      ok: plantlessGreen && plantlessRung === null,
      detail: !plantless.ok
        ? `not reached — the twin could not be built: ${plantless.why} (${plantless.detail})`
        : !plantlessGreen
          ? `the twin's lane did not pass, so its rung says nothing: ${tail(lanePlantless, 3)}`
          : plantlessRung === null
            ? "a lane green over a profile that ships no plants records no rung"
            : `the twin ships NO plants and still earned ${plantlessRung} · ${receiptPlantless.evidenceLevel.name} — §8.9 says a profile with no calibrated plants earns no rung, and §3 makes "earns a rung without plants" one of a Stack Profile's four nevers. the grader is deriving the rung from the ladder alone again — lib/plant-calibration.mjs is the floor it must ask, and lib/evidence-level.mjs is what asks it`,
    });

    // ── H and I — the pack on the receipt ───────────────────────────────────
    const vendored = pathToFileURL(path.join(withPlants.root, "qa", "lib", "receipt-validate.mjs")).href;
    const { evaluateReceipt } = await import(vendored);
    const { computeInputsHash } = await import(pathToFileURL(path.join(withPlants.root, "qa", "lib", "inputs-hash.mjs")).href);
    const recompute = () => computeInputsHash(withPlants.root);
    const accepted = evaluateReceipt(receiptWith, recompute);
    const { pack: _dropped, ...withoutPack } = receiptWith;
    const refusedNoPack = evaluateReceipt(withoutPack, recompute);
    const refusedBlankPack = evaluateReceipt({ ...receiptWith, pack: { id: "", version: null } }, recompute);
    const namesPack = receiptWith?.pack?.id === ALIEN_ID;
    const refusesUnnamed = refusedNoPack.valid === false && refusedBlankPack.valid === false;
    out.push({
      what: "the receipt names its pack, and the vendored predicate REFUSES one that does not",
      ok: namesPack && accepted.valid === true && refusesUnnamed,
      detail: !namesPack
        ? `the receipt's pack is ${JSON.stringify(receiptWith?.pack?.id)}, not the profile's "${ALIEN_ID}"`
        : accepted.valid !== true
          ? `the honest receipt was refused: ${accepted.reason}`
          : refusesUnnamed
            ? "pack named on the receipt; a receipt with no pack, and one whose pack id is empty, are both refused"
            : `the receipt is accepted with its pack REMOVED (${refusedNoPack.reason}) — evaluateReceipt (packages/harness/src/lib/receipt-validate.mjs:104) never reads \`pack\`, so the field that keeps a cmp L2 and this pack's L2 apart is one nothing checks and an editor can delete`,
    });

    const packVersion = receiptWith?.pack?.version ?? null;
    out.push({
      what: "`pack.version` is the profile's own, never the harness's borrowed number",
      ok: packVersion === ALIEN_VERSION,
      detail:
        packVersion === ALIEN_VERSION
          ? `pack ${receiptWith.pack.id}@${packVersion}, declared by the profile and independent of harness ${receiptWith?.harness?.version}`
          : `the profile declares version "${ALIEN_VERSION}" and the receipt records pack.version ${JSON.stringify(packVersion)}${packVersion === receiptWith?.harness?.version ? " — the HARNESS lock's version, inherited" : ""}. packages/harness/src/verify.mjs:568 writes \`pack: { id: pack.id, version: harnessSummary.version }\`; ADR-0008 decided that number "must become null, not inherited", and Stage 2's row asks for the profile's own`,
    });

    // ── J — the rung is never shown without its pack ────────────────────────
    const { renderEvidenceBadge } = await import(pathToFileURL(path.join(withPlants.root, "qa", "lib", "evidence-badge.mjs")).href);
    const badge = renderEvidenceBadge(receiptWith);
    const check = run(process.execPath, [path.join(withPlants.root, "qa", "receipt-check.mjs")], withPlants.root);
    const checkOut = (check.stdout ?? "") + (check.stderr ?? "");
    const badgeShowsPack = badge.includes(ALIEN_ID);
    const cliShowsPack = checkOut.includes(ALIEN_ID);
    const badgeShowsRung = badge.includes(rung);
    const cliShowsRung = checkOut.includes(rung);
    out.push({
      what: "every surface that shows a rung shows the pack",
      ok: badgeShowsPack && cliShowsPack,
      detail:
        badgeShowsPack && cliShowsPack
          ? `the README badge and qa/receipt-check.mjs both name ${ALIEN_ID} beside ${rung}. NOTE: this asks for a mention, not a placement — a pack id in a footnote under a rung in a headline would pass. The console is a third rung-bearing surface and is not covered here`
          : `${[
              badgeShowsRung && !badgeShowsPack && "the README badge renders the rung with no pack (packages/harness/src/lib/evidence-badge.mjs renderEvidenceBadge)",
              cliShowsRung && !cliShowsPack && "qa/receipt-check.mjs prints the rung with no pack (packages/harness/src/receipt-check.mjs:225)",
              !badgeShowsRung && !cliShowsRung && "neither surface rendered a rung at all",
            ]
              .filter(Boolean)
              .join("; ")} — §6.5 says every surface that shows a rung shows the pack, because §8.9 makes a cmp L2 and this pack's L2 different claims`,
    });

    // ── C — the protocol handshake, on the twin, last ───────────────────────
    // Done last and on the PLANTLESS twin because it deliberately breaks that
    // tree: the same tree reached a green lane in criterion G moments ago, so a
    // refusal here is attributable to the protocol and to nothing else.
    if (!plantless.ok || !plantlessGreen) {
      out.push({
        what: "the protocol handshake refuses an unsupported protocol BY NAME, and mints no receipt",
        ok: false,
        detail: "not reached — the twin adopter never reached a green lane, so a refusal here would be unattributable",
      });
    } else {
      const entry = path.join(plantless.root, "qa", "lib", "profiles", ALIEN_ID, "index.mjs");
      const receiptPath = path.join(plantless.root, "qa", "evidence", "latest.json");
      const receiptBefore = fs.existsSync(receiptPath) ? fs.readFileSync(receiptPath, "utf8") : null;

      fs.writeFileSync(entry, alienProfileSource({ withPlants: false, protocol: PROFILE_PROTOCOL + 1 }));
      const mismatched = lane(plantless.root);
      const mismatchOut = (mismatched.stderr ?? "") + (mismatched.stdout ?? "");
      const receiptAfterMismatch = fs.existsSync(receiptPath) ? fs.readFileSync(receiptPath, "utf8") : null;

      fs.writeFileSync(entry, alienProfileSource({ withPlants: false, declareProtocol: false }));
      const absent = lane(plantless.root);
      const absentOut = (absent.stderr ?? "") + (absent.stdout ?? "");
      const receiptAfterAbsent = fs.existsSync(receiptPath) ? fs.readFileSync(receiptPath, "utf8") : null;

      // ON THE REFUSAL'S OWN LINE, AND WORD-BOUNDED. The first draft of this
      // asked whether the whole output `includes("1")` and `includes("2")` —
      // single characters, which almost any output contains, so the assertion
      // would have gone green over a refusal that named neither number. Scoping
      // to the line that names the profile and requiring `\b1\b` / `\b2\b` is
      // what makes "BY NAME" mean the numbers and not the digits.
      const refusalLine = (text) => (text.split("\n").find((l) => l.includes(ALIEN_ID)) ?? "");
      const mismatchLine = refusalLine(mismatchOut);
      const namesBoth =
        Boolean(mismatchLine) &&
        new RegExp(`\\b${PROFILE_PROTOCOL + 1}\\b`).test(mismatchLine) &&
        new RegExp(`\\b${PROFILE_PROTOCOL}\\b`).test(mismatchLine);
      const refusedMismatch = mismatched.status !== 0 && namesBoth;
      const refusedAbsent = absent.status !== 0 && /protocol/.test(refusalLine(absentOut));
      const noReceipt = receiptAfterMismatch === receiptBefore && receiptAfterAbsent === receiptBefore;
      out.push({
        what: "the protocol handshake refuses an unsupported protocol BY NAME, and mints no receipt",
        ok: refusedMismatch && refusedAbsent && noReceipt,
        detail:
          refusedMismatch && refusedAbsent && noReceipt
            ? `a profile declaring protocol ${PROFILE_PROTOCOL + 1} and a profile declaring none are both refused before a step runs (exit ${mismatched.status}/${absent.status}), each naming "${ALIEN_ID}", and the receipt on disk is untouched`
            : `${[
                !refusedMismatch && `protocol ${PROFILE_PROTOCOL + 1}: exit ${mismatched.status}${namesBoth ? "" : ", refusal does not name the profile and both protocol numbers"} — ${tail(mismatched, 1)}`,
                !refusedAbsent && `no protocol export: exit ${absent.status} — ${tail(absent, 1)}`,
                !noReceipt && "a receipt was written by a run that could not load a profile",
              ]
                .filter(Boolean)
                .join("; ")}`,
      });
    }

    return out;
  } finally {
    for (const root of scratch) fs.rmSync(root, { recursive: true, force: true });
  }
}

async function main() {
  process.stdout.write("stage 2 — profiles as artifacts (NORTH-STAR §9)\n\n");
  const results = await criteria();
  for (const c of results) process.stdout.write(`  ${c.ok ? "✓" : "✗"} ${c.what}\n        ${c.detail}\n`);
  const failed = results.filter((c) => !c.ok);
  process.stdout.write(failed.length ? `\nstage 2: NOT EXITED — ${failed.length}/${results.length} criteria unmet\n` : "\nstage 2: EXITED\n");
  process.exit(failed.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
export { criteria, alienProfileSource, attestationProblems, ATTESTATION_REL };
