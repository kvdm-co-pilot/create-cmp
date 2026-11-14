// Approvals-only re-attest — `node qa/verify.mjs --reattest-approvals`.
//
// THE PROBLEM (measured in Consignly, 2026-11-14). Signing a governed artifact
// (`node qa/approve.mjs <id> --as …`) rewrites qa/approvals.json. The ledger is
// part of the verified surface — it has to be, the approvals step reads it — so
// the signature changed the receipt's inputs hash and the receipt went INVALID.
// The only way back was the whole lane: an Android release build, a web build
// and an emulator, 247 s cold and 96 s warm, to re-prove code that had not
// moved a byte. A signature should cost what a signature costs.
//
// THE MOVE. A full run records two digests of the surface: `inputs.hash`, as
// always, and `inputs.hashWithoutApprovals` — the same lines with the ledger
// left out (qa/lib/inputs-hash.mjs). A later re-attest recomputes both. When
// the second is IDENTICAL, every file the full run attested other than the
// ledger is byte-for-byte what it attested, so every step that does not read
// the ledger would return what it returned. Those rows are carried forward,
// each marked `carriedForward: true`; the steps that DO read the ledger — the
// pack declares which, `approvalsLedgerReaders` — re-run now, together with the
// lane's self-vouching row, and the receipt says which is which (`reattest`).
//
// WHAT IT REFUSES, so that it can never attest more than the full run did:
//   - anything else changed (the digests differ) → run the full lane;
//   - the receipt to carry from is not a full, PASSing, done-evidence receipt
//     (fast, smoke, nightly, a FAIL, an environment SKIP) — carrying it forward
//     would launder it;
//   - that receipt predates `hashWithoutApprovals` — there is no proof to check;
//   - the lane's own code differs from the lane that issued the carried rows;
//   - the pack does not declare which steps read the ledger — the core will not
//     guess which verdicts a signature can move;
//   - CI — CI runs its own checks and never carries a row forward; this is a
//     local convenience.
// And the rung is CAPPED at the carried receipt's: a re-attest can lose a rung
// (a stale signature FAILs it) and can never gain one.
//
// WHY A FLAG AND NOT AUTOMATIC DETECTION. `node qa/verify.mjs` keeps meaning
// exactly one thing — every step, now — which is what CI, the docs and every
// habit already assume. A lane that silently ran two steps instead of twenty
// when it decided the change was small would make "I ran the lane" ambiguous,
// and an ambiguous checkpoint is the thing this harness exists to remove. The
// discovery cost of a flag is paid by the surfaces that know the answer: a
// signature (qa/approve.mjs) and the Stop hook's refusal (qa/receipt-check.mjs)
// both name the command when — and only when — the ledger is the only change.
//
// Stack-agnostic: no step name below is a stack's. The re-run set is the row
// that vouches for the lane (the row carrying a `harness` object, the same key
// checkLaneVouching reads) plus whatever the pack declares.

import { checkDoneEvidence } from "./receipt-validate.mjs";

/** The rung order every ladder shares (the receipt schema's enum). */
const RUNG_ORDER = ["L0", "L1", "L2", "L3"];

export const REATTEST_FLAG = "--reattest-approvals";

/**
 * The row on a receipt that vouches for the lane — the one carrying the
 * integrity check's own `harness` object, else the legacy name.
 * @param {Array<object>} steps
 * @returns {object|null}
 */
export function vouchingRow(steps) {
  const list = Array.isArray(steps) ? steps : [];
  return list.find((s) => s && s.harness && typeof s.harness === "object") ?? list.find((s) => s && s.name === "harnessIntegrity") ?? null;
}

/**
 * Decide whether an approvals-only re-attest is honest for this tree.
 *
 * @param {object} args
 * @param {object|null} args.previous the receipt on disk (qa/evidence/latest.json)
 * @param {{hash: string, hashWithoutApprovals?: string}} args.current the tree's digests now
 * @param {string|null} args.harnessSha the lane region's sha256 now (checkHarnessIntegrity)
 * @param {string[]|undefined} args.ledgerReaders the pack's `approvalsLedgerReaders`
 * @param {string|null} [args.requestedProfile] `--profile` if one was passed
 * @param {boolean} [args.ci] running under CI
 * @param {string} [args.laneCommand]
 * @param {object|null} [args.legacySkips] handed to checkDoneEvidence
 * @returns {{ok: true, rerun: string[], carried: string[], from: object, profile: string}
 *   | {ok: false, noop?: boolean, reason: string}}
 */
export function planReattest({ previous, current, harnessSha, ledgerReaders, requestedProfile = null, ci = false, laneCommand = "node qa/verify.mjs", legacySkips = null }) {
  const full = `run the full lane (\`${laneCommand}\`)`;
  const no = (reason) => ({ ok: false, reason });
  if (ci) {
    return no(`refused under CI — CI runs its own checks, and a carried-forward row never stands in for one there; ${full}`);
  }
  if (!Array.isArray(ledgerReaders) || ledgerReaders.length === 0 || !ledgerReaders.every((n) => typeof n === "string" && n)) {
    return no(
      `this project's step pack does not declare \`approvalsLedgerReaders\` — which steps read qa/approvals.json is the pack's to say, ` +
        `and the lane will not guess which verdicts a signature can move; ${full}`,
    );
  }
  if (!previous || typeof previous !== "object") return no(`there is no receipt to carry forward; ${full}`);
  if (previous.verdict !== "PASS") return no(`the receipt on disk is a ${previous.verdict ?? "verdict-less"} — only a PASS can be carried forward; ${full}`);
  if (previous.mode && previous.mode !== "full") {
    return no(`the receipt on disk is mode "${previous.mode}" — only a full run can be carried forward; ${full}`);
  }
  const done = checkDoneEvidence(previous, { laneCommand, legacySkips });
  if (!done.ok) return no(`the receipt on disk is not done-evidence itself (${done.detail}) — carrying it forward would launder it`);
  if (requestedProfile && requestedProfile !== previous.profile) {
    return no(`--profile ${requestedProfile} differs from the receipt's profile "${previous.profile}" — a re-attest re-runs nothing else, so it can only re-issue the profile that ran; ${full} with --profile ${requestedProfile}`);
  }
  const prevInputs = previous.inputs ?? {};
  if (typeof prevInputs.hash !== "string") return no(`the receipt on disk predates evidence binding; ${full}`);
  if (typeof prevInputs.hashWithoutApprovals !== "string") {
    return no(
      `the receipt on disk predates \`inputs.hashWithoutApprovals\`, so nothing on it can prove that only qa/approvals.json changed; ` +
        `${full} once — every receipt after it can be re-attested`,
    );
  }
  if (current.hash === prevInputs.hash) {
    return { ok: false, noop: true, reason: "the receipt on disk already attests this tree — nothing to re-attest" };
  }
  if (current.hashWithoutApprovals !== prevInputs.hashWithoutApprovals) {
    return no(`files other than qa/approvals.json changed since the receipt was written — only the full lane can attest them; ${full}`);
  }
  const prevHarnessSha = previous.harness?.sha256 ?? null;
  if (!prevHarnessSha || !harnessSha || prevHarnessSha !== harnessSha) {
    return no(`the lane's own code differs from the lane that issued the receipt (${String(prevHarnessSha).slice(0, 12)} → ${String(harnessSha).slice(0, 12)}); ${full}`);
  }
  const steps = Array.isArray(previous.steps) ? previous.steps : [];
  const vouch = vouchingRow(steps);
  if (!vouch) return no(`no row on the receipt vouches for the lane; ${full}`);
  const missing = ledgerReaders.filter((n) => !steps.some((s) => s?.name === n));
  if (missing.length) {
    return no(`the receipt has no row for ${missing.join(", ")} (declared as reading qa/approvals.json) — there is nothing to re-run it against; ${full}`);
  }
  const rerun = [...new Set([vouch.name, ...ledgerReaders])];
  const carried = steps.map((s) => s.name).filter((n) => !rerun.includes(n));
  // A re-attest of a re-attest carries from the ORIGINAL full run: the carried
  // rows are that run's, and `from` must keep naming where they were earned.
  const origin = previous.reattest?.from ?? {
    inputsHash: prevInputs.hash,
    hashWithoutApprovals: prevInputs.hashWithoutApprovals,
    generatedAt: previous.generatedAt,
    commit: previous.commit?.sha ?? null,
  };
  return { ok: true, rerun, carried, from: origin, profile: previous.profile };
}

/**
 * The lower of two rungs — a re-attest may lose a rung, never gain one.
 * @param {object|null} fresh the rung graded over the merged rows
 * @param {object|null} carried the carried receipt's rung
 * @returns {object|null}
 */
export function capLevel(fresh, carried) {
  if (!fresh || !carried) return null;
  const a = RUNG_ORDER.indexOf(fresh.rung);
  const b = RUNG_ORDER.indexOf(carried.rung);
  if (a < 0 || b < 0) return null;
  return a > b ? carried : fresh;
}

/**
 * The merged step rows: fresh rows where the step re-ran, the carried
 * receipt's rows (marked) everywhere else, in the carried receipt's order.
 * @param {Array<object>} previousSteps
 * @param {Array<object>} freshRows rows from the steps that re-ran now
 * @param {string[]} rerun
 * @returns {Array<object>}
 */
export function mergeRows(previousSteps, freshRows, rerun) {
  const fresh = new Map(freshRows.map((r) => [r.name, r]));
  return previousSteps.map((row) => {
    if (rerun.includes(row.name)) {
      const f = fresh.get(row.name);
      if (f) return f;
      // A declared re-run step that produced no row could not be checked now.
      return { name: row.name, verdict: "ERROR", reason: "re-attest: this step was due to re-run and produced no row", durationMs: 0 };
    }
    const { carriedForward: _ignored, ...rest } = row;
    return { ...rest, carriedForward: true };
  });
}

/**
 * Is the receipt on disk invalid ONLY because qa/approvals.json changed?
 * The one question the surfaces that name `--reattest-approvals` ask, so the
 * command is offered when — and only when — it would be accepted on that
 * ground. (It can still refuse on others — the lane's code changed, the
 * receipt is not done-evidence — and says so by name when run.)
 * @param {object|null} receipt
 * @param {{hash: string, hashWithoutApprovals?: string}} current
 * @returns {boolean}
 */
export function onlyApprovalsChanged(receipt, current) {
  const inputs = receipt?.inputs;
  return Boolean(
    receipt?.verdict === "PASS" &&
      inputs &&
      typeof inputs.hashWithoutApprovals === "string" &&
      inputs.hash !== current?.hash &&
      inputs.hashWithoutApprovals === current?.hashWithoutApprovals,
  );
}

/** The sentence both surfaces print, one spelling. */
export const REATTEST_HINT =
  "only qa/approvals.json changed since the last full run — re-attest in seconds instead of re-running the whole lane: node qa/verify.mjs --reattest-approvals";
