// The evidence ladder — the receipt's COARSE grade, derived, never declared.
//
// Receipts already grade themselves in fine print ("PASS (desktop-only)",
// "PASS (on-device: e2eSmoke+androidChecks)"). This module names the rungs so
// every surface that shows a receipt can say the same thing in one word:
//
//   L0 "scaffold" — the scaffold profile's checks passed (stamp-time green
//                   build: build + unit tests + the pure-Node gates).
//   L1 "desktop"  — full static + JVM evidence: everything L0 proves PLUS
//                   conformance, golden trees, a11y, and the release COMPILE
//                   (releaseBuild) — a green lane with no on-device step run.
//   L2 "device"   — L1 plus at least one on-device EXECUTION step PASSed
//                   (e2eSmoke, androidChecks, or the live tokenDrift tier).
//   L3 "release"  — L2 plus releaseSmoke PASSed (the release APK installed
//                   and driven on a device).
//
// HONESTY RULES — the rung must be honest to a fault, it is the vocabulary
// evidence is sold in:
//   - A rung is DERIVED from which steps actually ran and PASSED. It is never
//     declared: the `profile` argument is deliberately NOT part of the
//     derivation — a requested profile can never buy a rung its steps did not
//     earn (it is accepted so callers state what was asked for vs. earned).
//   - A SKIP never upgrades. A SKIPped device step does not count toward L2;
//     a SKIPped releaseSmoke (e.g. unsigned keystore) is NOT L3. The label
//     can never overclaim.
//   - A FAILED lane has no rung: the rung is only computed for a PASS
//     verdict; the receipt of a FAIL records evidenceLevel null.
//   - A FAST-MODE lane has no rung either — not even L0. `verify --fast` is
//     the inner loop, a signal rather than evidence, so a fast receipt must
//     never be silently reused as if it were a full-lane result: pass the
//     run's mode and "fast" derives null, always.
//   - A PROFILE THAT SHIPS NO PLANTS EARNS NO RUNG — the badge floor. A ladder
//     names rungs; plants are what prove the steps under them still bite. A
//     profile with the second and not the first is a vocabulary nobody
//     calibrated, and grading it says something about a lane that nothing
//     checked. See "the badge floor" below for the episode and the argument.
//   - The rung is COARSE by design. The per-step list (and the existing
//     strength string) stays the fine print alongside it — steps that may
//     SKIP for honest configuration absence (approvals unreviewed, no
//     exported schemas) are visible there; only the always-run steps gate
//     the desktop rungs, and only executed PASSes gate the device rungs.

// The Compose ladder that used to live here is qa/lib/profiles/cmp/ladder.mjs
// (Stage 0 PR 3). This module derives a rung from WHATEVER ladder it is handed;
// it carries no step names of its own and defaults to none — a profile that
// declares no ladder earns no rung. The rung vocabulary above is one profile's
// example, kept because it is the clearest statement of what a rung is for.
//
// WHERE THAT LADDER COMES FROM IS NOT THIS MODULE'S QUESTION, and saying it was
// is how a defect hid: this comment used to name one of the two spellings a
// profile may use (`evidenceLadder`, on the pack), which is the one the runner
// happened to read while the Stop hook read the other. Resolving between them
// is qa/lib/evidence-ladder.mjs's single job, and every caller goes through it.
// The fields read below are the fields that resolution compares — the pairing
// is derived from this source by test/evidence-ladder.test.mjs so the two
// cannot drift.

// ── THE BADGE FLOOR, AND WHY THE GRADER IS WHERE IT LIVES ───────────────────
//
// Until 2026-09-08 this module derived a rung from the ladder alone. Two
// scratch adopters built by scripts/stage2-gate.mjs, differing in EXACTLY one
// export — one shipping `plants`, one shipping none — ran the real lane and
// both earned `L1 · every promise bound`. The twin that could calibrate nothing
// was graded identically to the twin that could, against a guarantee that was
// already binding (NORTH-STAR.md §8.9, §6.7, and §3's third *never*).
//
// The floor could have been enforced one layer out, in the lane runner, leaving
// this function a pure ladder→rung derivation. It is here instead, because a
// grader that can be called without the floor is a grader that WILL be: the
// ladder's own two-spellings defect (§9.2) happened precisely because two
// readers reached the same question by different routes and only one of them
// was right. There is one grader, it takes the profile's plant declaration, and
// a caller that does not pass one gets NO RUNG rather than an ungrounded one —
// forgetting fails CLOSED, which is the only direction a floor may fail in.
//
// WHAT COUNTS AS PLANTS is deliberately not decided here. It is the
// instrument's judgement, and asking qa/lib/plant-calibration.mjs is how the
// grader and the instrument are kept from holding two definitions of the same
// word — the `flowCitation`/`scanCitations` failure, which cost a gate nobody
// was calibrating. That file also carries the argument for WHICH reading of
// "calibrated" is implemented (structurally usable, not merely declared, and
// not the observed reading, which no lane run can derive).
import { plantCalibration } from "./plant-calibration.mjs";

/**
 * Derive the receipt's evidence rung AND the sentence explaining an absent one.
 *
 * TWO RETURNS, ONE DECISION. `evidenceLevel` below is this function's `.level`
 * and nothing else — there is no second copy of the derivation — because the
 * rung and the reason it is missing must never be able to disagree. The reason
 * exists because "no rung, no explanation" is itself a defect this project has
 * already paid for: a foreign author who declared their ladder in the seeded
 * spelling got a green lane, no rung and not one word about why, and it took a
 * gate written in another ecosystem to find it (NORTH-STAR.md §9.2).
 *
 * The `why` is NOT written to the receipt. A receipt records what was earned;
 * this is a sentence for a human reading a lane, and putting it on the receipt
 * would change the receipt's schema, which is a decision for an ADR rather than
 * for this fix (fit-test question 5).
 *
 * @param {Array<{name: string, verdict: string}>} stepResults the lane's steps
 * @param {string} [profile] the profile that was REQUESTED (scaffold | local |
 *   ci | …) — recorded context only, never part of the derivation, and
 *   deliberately never quoted in `why`: it names the RUN, not the pack, and a
 *   message that confused the two would send a reader to the wrong file
 * @param {{mode?: string, ladder?: object|null, plants?: object|null}} [opts]
 * @returns {{level: {rung: string, name: string, satisfiedBy: string[]}|null, why: string|null}}
 *   `why` is null exactly when `level` is not.
 */
export function gradeEvidence(stepResults, profile, { mode, ladder, plants } = {}) { // eslint-disable-line no-unused-vars
  const none = (why) => ({ level: null, why });
  if (mode === "fast") return none("no evidence rung: this run was `--fast`, the inner loop — a signal, never evidence");

  // THE BADGE FLOOR IS ASKED FIRST, before the ladder, because it decides
  // whether this profile may be graded AT ALL: a ladder over uncalibrated
  // plants is a vocabulary for a claim nobody checked, so the ladder question
  // is moot until this one is answered. Both absences are reported together
  // when both apply — an author who fixes one and comes back for the other has
  // been charged two round trips by a message that knew both answers.
  const calibrated = plantCalibration(plants);
  if (!calibrated.ok) {
    const alsoNoLadder = !ladder || typeof ladder !== "object";
    return none(
      `no evidence rung: ${calibrated.reason}. A profile ships plants its Rule 0 instrument can run — ` +
        "`node qa/framework-check.mjs` — or it ships without a badge (NORTH-STAR.md §6.7, §8.9)" +
        (alsoNoLadder ? ", and this profile declares no `ladder` either, which alone earns no rung" : ""),
    );
  }

  // No ladder → no rung. There is no default: a rung is a claim in a
  // profile's own vocabulary, and the spine has none to lend. `null` and
  // `undefined` mean the same thing here — the pack declared nothing.
  if (!ladder || typeof ladder !== "object") {
    return none("no evidence rung: this profile declares no `ladder`, so there are no rungs to earn — which is the honest grade, not a failure");
  }
  const level = rungFor(stepResults, ladder);
  if (level) return { level, why: null };
  const steps = Array.isArray(stepResults) ? stepResults.filter((s) => s && typeof s.name === "string") : [];
  const red = steps.filter((s) => s.verdict === "FAIL" || s.verdict === "ERROR");
  if (red.length) {
    return none(
      `no evidence rung: ${red.map((s) => `${s.name} ${s.verdict}`).join(", ")} — a lane that failed, or that could not check, has no rung`,
    );
  }
  const floor = (ladder.l0Required ?? []).filter((name) => !steps.some((s) => s.name === name && s.verdict === "PASS"));
  return none(
    `no evidence rung: this ladder's floor rung needs ${(ladder.l0Required ?? []).join(", ") || "(nothing)"} to PASS and ` +
      `${floor.join(", ")} did not — a SKIP never earns a rung`,
  );
}

/**
 * Derive the receipt's evidence rung from the lane's step results.
 *
 * THE ONE GRADER. Everything that shows a rung derives it here or reads one a
 * run of this function wrote onto a receipt; nothing recomputes it its own way.
 *
 * @param {Array<{name: string, verdict: string}>} stepResults the lane's steps
 *   as recorded on the receipt (verdict PASS | FAIL | SKIP per step)
 * @param {string} [profile] the profile that was REQUESTED — recorded context
 *   only, never part of the derivation (see honesty rules above)
 * @param {{mode?: string, ladder?: object|null, plants?: object|null}} [opts]
 *   the run's mode ("full" | "fast"), the PROFILE's resolved ladder
 *   (qa/lib/evidence-ladder.mjs) and the PROFILE's `plants` declaration.
 *   "fast" derives null unconditionally — the inner loop earns no rung.
 *   Absent/other values for mode mean full; an absent `plants` means no rung,
 *   because the badge floor fails closed (see above).
 * @returns {{rung: "L0"|"L1"|"L2"|"L3", name: string, satisfiedBy: string[]}|null}
 *   null when the profile ships no usable plants (the badge floor), when it
 *   declares no ladder, when any step FAILed (a failed lane has no rung), when
 *   the run was fast-mode (the inner loop is never evidence), or when even the
 *   L0 floor was not earned. `satisfiedBy` lists the PASSed steps the rung
 *   counts as its evidence, in lane order. A caller that wants the SENTENCE for
 *   an absent rung calls `gradeEvidence` and reads `.why` — same decision, one
 *   implementation.
 */
export function evidenceLevel(stepResults, profile, opts = {}) {
  return gradeEvidence(stepResults, profile, opts).level;
}

/**
 * The ladder half of the derivation, once the badge floor has been cleared:
 * which rung THESE steps earn under THIS ladder, and nothing about whether the
 * profile was entitled to be graded. Private on purpose — `gradeEvidence` is
 * the only caller, so the floor cannot be walked around from inside this file
 * any more than it can from outside it.
 *
 * @param {Array<{name: string, verdict: string}>} stepResults
 * @param {object} ladder
 * @returns {{rung: string, name: string, satisfiedBy: string[]}|null}
 */
function rungFor(stepResults, ladder) {
  const L = ladder;
  const SCAFFOLD_CORE = L.scaffoldCore ?? [];
  const L0_REQUIRED = L.l0Required ?? [];
  const L1_REQUIRED = L.l1Required ?? [];
  const DEVICE_EXECUTION = L.deviceExecution ?? [];
  const RELEASE_EXECUTION = L.release ?? null;
  // A ladder without labels still grades — the rung id is its own label.
  const RUNG_NAMES = L.names ?? { L0: "L0", L1: "L1", L2: "L2", L3: "L3" };
  const steps = Array.isArray(stepResults) ? stepResults.filter((s) => s && typeof s.name === "string") : [];
  // A failed lane has no rung — and a lane with a step that could not run
  // (ERROR) has none either: a rung is evidence, and "could not check" is not.
  if (steps.some((s) => s.verdict === "FAIL" || s.verdict === "ERROR")) return null;
  const passed = new Set(steps.filter((s) => s.verdict === "PASS").map((s) => s.name));

  if (!L0_REQUIRED.every((name) => passed.has(name))) return null; // not even a stamp-time green build

  const inLaneOrder = (names) => steps.filter((s) => names.has(s.name) && passed.has(s.name)).map((s) => s.name);

  let rung = "L0";
  const counted = new Set(SCAFFOLD_CORE);

  if (L1_REQUIRED.every((name) => passed.has(name))) {
    rung = "L1";
    for (const name of L1_REQUIRED) counted.add(name);

    // Only an EXECUTED (PASSed) device step lifts to L2 — a SKIP never does.
    const deviceRan = DEVICE_EXECUTION.some((name) => passed.has(name));
    if (deviceRan) {
      rung = "L2";
      for (const name of DEVICE_EXECUTION) counted.add(name);

      // Only a PASSed releaseSmoke lifts to L3 — a SKIP (unsigned keystore,
      // no device) never does.
      if (RELEASE_EXECUTION && passed.has(RELEASE_EXECUTION)) {
        rung = "L3";
        counted.add(RELEASE_EXECUTION);
      }
    }
  }

  return { rung, name: RUNG_NAMES[rung], satisfiedBy: inLaneOrder(counted) };
}
