// When may a session stop on a QUICK check, and when does it owe the FULL lane?
//
// THE RULE (the app owner's, Consignly docs/factory/build-loop.md LOOP-23 and
// LOOP-30, decided 2026-11-14): small changes get a quick check only, and the
// full lane runs ONCE per feature — when the feature is complete end to end —
// and before merge. Until this module the Stop hook demanded the full lane
// (minutes: release builds, a web build, an emulator) at the end of every turn
// that touched the tree, so in-progress work paid the done-gate's price on
// every stop.
//
// THE SPLIT, and where each half is enforced:
//
//   in progress   the Stop hook accepts a PASS quick receipt that attests this
//                 tree — `node qa/verify.mjs --fast` (qa/evidence/latest-fast.json)
//                 or the branch-scoped `--profile feature` run
//                 (qa/evidence/latest-feature.json) — and SAYS it is not
//                 done-evidence. A full receipt that attests the tree (or its
//                 approvals-only re-attest, qa/lib/reattest.mjs) is accepted as
//                 it always was.
//   complete      a feature whose walk has reached Prove — every clause of its
//                 signed contract has a citing test, nothing left to build — owes
//                 the full lane, and the Stop hook refuses anything less.
//   before merge  a push to the default branch (the pre-push hook) and the CI
//                 check on a pull request marked ready both run
//                 `node qa/receipt-check.mjs` WITHOUT --quick: the strict
//                 done-gate, unchanged.
//
// "COMPLETE" IS DERIVED, NEVER CLAIMED. The walk (qa/lib/walk.mjs) puts a
// feature at Prove from signed artifacts and test citations — the same
// derivation the console and the statusline show. A declared plan
// (qa/.plan.json) may only TIGHTEN the rule: a closed chain that names its
// feature owes the full lane even if the walk disagrees; an open one never
// loosens anything. And when the walk cannot be derived, the rule fails
// closed: the full lane is owed, because "I could not tell" is not "in
// progress".

import fs from "node:fs";
import path from "node:path";

import { deriveWalks } from "./walk.mjs";
import { readPlan } from "./plan.mjs";
import { evaluateReceipt } from "./receipt-validate.mjs";

/** The quick receipts, in the order they are preferred. Both gitignored, neither the receipt-of-record. */
export const QUICK_RECEIPTS = [
  { rel: "qa/evidence/latest-fast.json", label: "the fast tier (node qa/verify.mjs --fast)" },
  { rel: "qa/evidence/latest-feature.json", label: "the feature-scoped check (node qa/verify.mjs --profile feature)" },
];

/**
 * Which features are complete end to end and therefore owe the full lane now.
 * @param {string} root
 * @returns {{ok: true, names: string[], why: string[]} | {ok: false, reason: string}}
 *   ok:false means the walk could not be derived — the caller fails closed.
 */
export function featuresOwingFullLane(root) {
  let derived;
  try {
    derived = deriveWalks(root);
  } catch (err) {
    return { ok: false, reason: `the walk could not be derived (${err && err.message ? err.message : String(err)})` };
  }
  if (!derived || derived.available !== true) {
    return { ok: false, reason: `the walk could not be derived (${derived?.reason ?? "unavailable"})` };
  }
  const names = [];
  const why = [];
  for (const w of derived.walks ?? []) {
    if (w.currentStage === "prove") {
      names.push(w.name);
      why.push(`${w.name} is at Prove — every promise in its signed contract has a citing test`);
    }
  }
  // Tighten only: a CLOSED chain that names its feature says the work is done.
  try {
    const plan = readPlan(root);
    const steps = Array.isArray(plan?.steps) ? plan.steps : [];
    if (plan?.feature && steps.length > 0 && steps.every((s) => s && s.done) && !names.includes(plan.feature)) {
      names.push(plan.feature);
      why.push(`the declared plan for ${plan.feature} is closed — every step is marked done`);
    }
  } catch {
    /* no plan, or an unreadable one — it can only tighten, so its absence loosens nothing */
  }
  return { ok: true, names, why };
}

/**
 * Is there a PASS quick receipt that attests this tree right now?
 * @param {string} root
 * @param {() => {hash: string}} recompute the tree's digest (computeInputsHash)
 * @returns {{ok: true, rel: string, label: string, generatedAt: (string|null)} | {ok: false, detail: string}}
 */
export function quickCheckStanding(root, recompute) {
  const seen = [];
  let digest = null;
  const tree = () => (digest ??= recompute());
  for (const q of QUICK_RECEIPTS) {
    let receipt;
    try {
      receipt = JSON.parse(fs.readFileSync(path.join(root, q.rel), "utf8"));
    } catch {
      continue;
    }
    // The framework check and the nightly stage prove the harness, not the
    // change — smoke compiles nothing — so neither is a quick check of it.
    const stage = receipt?.stage ?? receipt?.profile;
    if (stage === "smoke" || stage === "nightly" || receipt?.profile === "smoke" || receipt?.profile === "nightly") {
      seen.push(`${q.rel}: a ${receipt.profile} run checks the harness, not this change`);
      continue;
    }
    let r;
    try {
      r = evaluateReceipt(receipt, tree);
    } catch (err) {
      seen.push(`${q.rel}: ${err && err.message ? err.message : String(err)}`);
      continue;
    }
    if (r.valid) return { ok: true, rel: q.rel, label: q.label, generatedAt: receipt.generatedAt ?? null };
    seen.push(`${q.rel}: ${r.reason}`);
  }
  return { ok: false, detail: seen.length ? seen.join("; ") : "no quick receipt (qa/evidence/latest-fast.json) on disk" };
}

/** The sentence a stop on a quick check carries — one spelling, every surface. */
export function quickStopMessage(quick) {
  return (
    `Stopped on a QUICK CHECK — ${quick.label} PASSed against this exact tree` +
    `${quick.generatedAt ? ` (${quick.generatedAt})` : ""}. ` +
    "This is NOT done-evidence. The full lane (node qa/verify.mjs) runs once per feature: when a feature reaches Prove " +
    "(built end to end), before a push to the default branch, and in CI when the pull request is marked ready."
  );
}
