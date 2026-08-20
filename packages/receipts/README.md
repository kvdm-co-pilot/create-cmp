# @create-cmp/receipts

Validate [create-cmp](https://github.com/kvdm-co-pilot/create-cmp) evidence
receipts (`qa/evidence/latest.json`, schema `cmp-evidence/1`): the inputs-hash
algorithm, the receipt-attests-this-tree predicate, and the service-grade
checks (freshness, execution plausibility, SKIP visibility). Plain ESM, zero
dependencies, Node ≥ 18.

## The one idea

A create-cmp evidence receipt is a verdict **bound to a content hash of every
file that could change it** — not the commit SHA, not a timestamp, the actual
bytes. Recompute that hash over the tree in front of you and compare it to
the hash recorded in the receipt: if they don't match, the receipt does not
attest what you're looking at, full stop. A receipt copied from a green run
onto a tree with one dirty line fails. A receipt someone hand-edited to say
`"verdict": "PASS"` fails, because the edit itself changes the hash. There is
no step where you have to trust the claim — you can check it.

**This package is the single source of truth for that check.** Every project
scaffolded by create-cmp carries byte-identical copies of `src/inputs-hash.mjs`
and `src/receipt-validate.mjs` in its own `qa/lib/` — so a generated project
stays dependency-free and can validate its own receipt completely offline —
while any hosted validator (a bot reviewing a PR, a dashboard, `npx
@create-cmp/receipts` run against a cloned repo) consumes the exact same logic from
this package. Parity between the vendored copy and this package is pinned in
the create-cmp repo by `test/harness-parity.test.mjs`.

## Install

```sh
npm install @create-cmp/receipts
```

## Use

```js
import {
  computeInputsHash, // (root) → { hash, fileCount } — sha256 of the verified surface
  readReceipt, // (root) → receipt | null, from qa/evidence/latest.json
  evaluateReceipt, // (receipt, recompute) → { valid, reason, profile } — the local predicate
  validateReceiptForTree, // ({ root, now?, policy? }) → { status, reason, checks, skips } — hosted composite
} from "@create-cmp/receipts";

// The local predicate — exactly what a generated project's Stop hook and CI run:
const receipt = readReceipt(projectRoot);
const result = evaluateReceipt(receipt, () => computeInputsHash(projectRoot));
console.log(result.valid, result.reason);
// true - receipt is valid — PASS, attesting profile: local

// Edit a source file without re-running the lane, then check again:
// false - source changed since the receipt — re-run the lane (attesting profile: local)

// The hosted composite — the same predicate plus freshness and execution
// plausibility, for validating a receipt fetched from somewhere other than
// the working tree (e.g. a PR's head SHA):
const hosted = validateReceiptForTree({ root: projectRoot });
console.log(hosted.status, hosted.reason);
// "valid" | "invalid" | "missing"
```

- `evaluateReceipt` is the core predicate: binding present → verdict not FAIL
  → recomputed inputs hash matches the receipt's → verdict is PASS. Reasons
  are the exact refusal strings a generated project's `qa/receipt-check.mjs`
  prints.
- `validateReceiptForTree` adds the hosted profile's service-grade checks:
  **freshness** (default 30-day window — `checkFreshness`) and **execution
  plausibility** (executed gates must report real, non-negative durations
  summing above a floor — `checkExecutionPlausibility`; a "PASS" that took
  0ms is the tell for a replayed cache or a hand-written verdict). A repo
  with no receipt at all returns `status: "missing"` — distinct from
  `"invalid"`, because not carrying the harness is not a failure.
- `listSkippedSteps(receipt)` returns every SKIPped step with its reason.
  SKIPs are surfaced, never hidden and never punished — green-with-gaps must
  stay visible.
- `DEFAULT_POLICY` (`{ maxAgeMs, minExecutedMs }`) is overridable per call via
  `validateReceiptForTree({ root, policy: { maxAgeMs: ... } })`.

The full export list (from `@create-cmp/receipts`, or the two submodules directly —
`@create-cmp/receipts/inputs-hash` and `@create-cmp/receipts/receipt-validate`):
`computeInputsHash`, `VERIFIED_SURFACE`, `RECEIPT_REL_PATH`, `readReceipt`,
`evaluateReceipt`, `DEFAULT_POLICY`, `checkFreshness`,
`checkExecutionPlausibility`, `listSkippedSteps`, `validateReceiptForTree`.

## What this does NOT do

- **It does not generate receipts.** This package only validates them. A
  receipt is produced by running the verify lane itself — see
  [`create-cmp-harness`](https://www.npmjs.com/package/create-cmp-harness),
  which every create-cmp app carries as `qa/verify.mjs`.
- **It is not a generic receipt format.** `VERIFIED_SURFACE` (the list of
  paths whose content is hashed) is create-cmp's own project shape —
  `composeApp/`, `specs/`, `qa/`, and the root Gradle files. This validates
  create-cmp evidence receipts specifically, not an arbitrary JSON envelope.
- **It does not check out git history, fetch anything over the network, or
  talk to npm.** Every function here takes a `root` you already have on disk
  and reads/hashes files synchronously. A hosted validator is responsible for
  getting the tree onto disk (e.g. extracting a tarball at a PR's head SHA)
  before calling in.
- **It does not enforce freshness or execution plausibility locally.**
  `evaluateReceipt` (what a generated project runs against itself) checks
  binding + verdict + hash only — "now" is definitionally fresh for a receipt
  you just generated. Those two extra checks are `validateReceiptForTree`'s
  hosted-only additions.

The receipt format is open by design; this validator is MIT-licensed so
anyone can check any receipt offline. See
[`docs/adr/0005-evidence-binding-by-inputs-hash.md`](https://github.com/kvdm-co-pilot/create-cmp/blob/main/docs/adr/0005-evidence-binding-by-inputs-hash.md)
in the [create-cmp](https://github.com/kvdm-co-pilot/create-cmp) repo for why
binding is by content hash, not commit SHA.
