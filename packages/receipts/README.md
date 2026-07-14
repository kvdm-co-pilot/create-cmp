# cmp-receipts

Validation for [create-cmp](https://github.com/kvdm-co-pilot/create-cmp) evidence
receipts (`qa/evidence/latest.json`, schema `cmp-evidence/1`): the inputs-hash
algorithm, the receipt-attests-this-tree predicate, and the service-grade checks
(freshness, execution plausibility, SKIP visibility). Plain ESM, zero dependencies,
Node ≥ 18.

**This package is the single source of truth.** Every project scaffolded by
create-cmp carries byte-identical copies of `src/inputs-hash.mjs` and
`src/receipt-validate.mjs` in its `qa/lib/` — generated projects stay
dependency-free (no npm install ever needed to run their own gates), while any
hosted validator consumes the exact same logic from this package. Parity is
test-pinned in the create-cmp repo (`test/receipts-parity.test.mjs`); after editing
`src/`, run `node scripts/sync-receipts.mjs` from the repo root to re-vendor.

## API

```js
import {
  computeInputsHash,      // (root) → { hash, fileCount } — sha256 of the verified surface
  VERIFIED_SURFACE,       // the surface definition (dirs/files that can change the verdict)
  readReceipt,            // (root) → receipt | null
  evaluateReceipt,        // (receipt, recompute) → { valid, reason, profile } — the local predicate
  validateReceiptForTree, // ({ root, now?, policy? }) → { status, reason, checks, skips } — hosted composite
  checkFreshness,
  checkExecutionPlausibility,
  listSkippedSteps,
  DEFAULT_POLICY,
} from "cmp-receipts";
```

- `evaluateReceipt` is exactly what a generated project's `qa/receipt-check.mjs`
  (its Stop hook and CI) runs: binding present → verdict not FAIL → inputs hash
  matches the tree → verdict is PASS. Reasons are the refusal strings, verbatim.
- `validateReceiptForTree` is the hosted profile: the same predicate plus
  freshness (default 30-day window) and execution plausibility (executed gates
  must report real, non-negative durations summing above a floor — a "PASS" that
  was never lived is the tell for replayed caches and hand-edited verdicts).
  Repos with no receipt return `status: "missing"` — distinct from `"invalid"`,
  because not carrying the harness is not a failure.
- SKIPped gates are listed, never hidden and never punished: green-with-gaps must
  be visible.

The receipt format is open by design; this validator is MIT so anyone can check
any receipt offline. See `docs/adr/0005-evidence-binding-by-inputs-hash.md` in the
create-cmp repo for why binding is by content hash, not commit SHA.
