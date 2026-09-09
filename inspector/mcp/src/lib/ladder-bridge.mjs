// ladder-bridge.mjs — the console's link to the PROFILE'S OWN ladder.
//
// docs/proposals/LIVE-CONSOLE.md's fifth question ("what would earn the next
// rung?") is answered from two artifacts and no opinions: the profile's ladder
// declaration, and the rung the RECEIPT records. This file fetches both and
// hands them to qa/lib/evidence-level.mjs's `ladderStanding`, which is the
// grader's own file and the only place either is interpreted.
//
// THE RUNG IS NOT RE-DERIVED HERE, and that is the rule this bridge exists to
// keep. It would be one line to grade the receipt's steps against the ladder
// and draw the marks from that — and then a page could disagree with the
// receipt it is displaying, which is NORTH-STAR.md §9.2's defect wearing a new
// hat. The receipt's `evidenceLevel` is read verbatim, the way
// receipt-bridge.mjs already reads it, and the ladder only ever says what the
// NEXT rung would want.
//
// WHAT THIS DOES NOT DO IS NOTICE A PROFILE CHANGING. `loadProfileSync`
// requires the module, and require caches by absolute path for the life of the
// process — so a ladder ADDED while the console is running shows up on the next
// restart, not the next page load. That is the console's existing behaviour for
// profile data (preview-service.mjs loads the profile once, for its copy), it
// is stated here rather than hidden, and it is stated in
// test/trust-ladder-bridge.test.mjs rather than assumed away. The receipt, the
// step stream and the Rule 0 record are all re-READ on every page load; only
// the profile module is not.
//
// TWO SPELLINGS, ONE RESOLVER. A profile may declare its ladder at the top
// level or on the object `steps(ctx)` returns, and `evidenceLadderFor` resolves
// between them. This bridge passes NO pack — deliberately: it is the "reader
// that must not start a lane" the resolver's own header describes, and calling
// `steps(ctx)` to draw a row would be a console that runs a lane to render.

import { evidenceLadderFor } from "prooflane-harness/lib/evidence-ladder.mjs";
import { ladderStanding } from "prooflane-harness/lib/evidence-level.mjs";
import { resolveHarnessManifest } from "prooflane-harness/lib/harness-manifest.mjs";
import { loadProfileSync } from "prooflane-harness/lib/profile-loader.mjs";

/**
 * The ladder this project declares, against the rung its receipt records.
 *
 * @param {string} root project root
 * @param {{evidenceLevel?: {rung: string}|null, steps?: Array<{name: string, verdict: string}>}|null} receipt
 *   getLastReceipt()'s result. Its `evidenceLevel` is the lane's own grade and
 *   is never recomputed; its steps say which of the next rung's named
 *   requirements that same run already met.
 * @returns {object} ladderStanding()'s result — always shaped, never thrown
 */
export function readLadderStanding(root, receipt = null) {
  // THE MANIFEST NAMES THE PROFILE, and asking the loader without that name
  // gets a refusal about `undefined` rather than about this project — the
  // failure this bridge hit on its first real page load. project-layout.mjs's
  // rule, one door along: where a project keeps a thing is the manifest's
  // answer, never a guess.
  let loaded;
  try {
    const manifest = resolveHarnessManifest(root);
    loaded = manifest.ok
      ? loadProfileSync(root, manifest.manifest.profile)
      : { ok: false, reason: manifest.reason };
  } catch (err) {
    loaded = { ok: false, reason: `the profile could not be loaded (${err && err.message ? err.message : String(err)})` };
  }
  if (!loaded || !loaded.ok) {
    return { available: false, reason: loaded && loaded.reason ? loaded.reason : "this project declares no loadable profile, so it declares no ladder" };
  }
  const resolved = evidenceLadderFor(loaded.profile);
  // A profile that declares its ladder TWICE and disagrees with itself is
  // REFUSED by the resolver rather than picked between. The row says so in the
  // resolver's own words: a rung derived from a contradiction would be a claim
  // nobody made, and that is true on a page as much as on a receipt.
  if (!resolved.ok) return { available: false, reason: resolved.reason };
  const level = receipt && receipt.available !== false ? receipt.evidenceLevel : null;
  const earned = level && typeof level.rung === "string" ? level.rung : null;
  const passed = (receipt && Array.isArray(receipt.steps) ? receipt.steps : [])
    .filter((s) => s && s.verdict === "PASS" && typeof s.name === "string")
    .map((s) => s.name);
  return ladderStanding(resolved.ladder, { earned, passed });
}
