# @create-cmp/receipts

Validate [create-cmp](https://github.com/kvdm-co-pilot/create-cmp) evidence
receipts. Plain ESM, zero dependencies, Node ≥ 18, fully offline.

## The idea

When an AI coding agent (or a person) claims a change is verified, that claim
is usually just text. A create-cmp project makes it a checkable artifact: its
verify lane writes `qa/evidence/latest.json` — the verdict, every step's
PASS/FAIL/SKIP with durations, and an `inputs.hash`: **a sha256 over the
content of every file that could have changed the verdict.** The surface is
fixed and public (`VERIFIED_SURFACE`): the app sources, the specs, the lane
itself, and the Gradle build files.

Binding to content instead of a commit SHA buys two properties at once:

- **Robust where it's honest.** Rebase, squash, or merge without touching a
  verified byte and the receipt still attests the tree — history moved, the
  content didn't.
- **Fragile where it's forged.** Change one verified byte and the recomputed
  hash stops matching. Hand-edit the receipt's verdict and the same thing
  happens — the receipt is inside its own attested world.

This package is the predicate for that check, published standalone so
anything — a CI job, a bot reviewing a PR, a script over a cloned repo — can
validate a receipt with the *same* logic the project itself uses.

## Install

```sh
npm install @create-cmp/receipts
```

Generated projects don't install it: they carry byte-identical vendored
copies of these two modules in `qa/lib/`, so `node qa/receipt-check.mjs` runs
air-gapped with no dependencies. This package is the source of truth those
copies are synced from (parity is test-pinned in the create-cmp repo).

## Use

```js
import {
  readReceipt,
  computeInputsHash,
  evaluateReceipt,
  validateReceiptForTree,
} from "@create-cmp/receipts";

// The local predicate — what a generated project's Stop hook and CI run:
const receipt = readReceipt(projectRoot); // qa/evidence/latest.json, or null
const result = evaluateReceipt(receipt, () => computeInputsHash(projectRoot));
// { valid: true,  reason: "receipt is valid — PASS, attesting profile: local", ... }
// After editing a source file without re-running the lane:
// { valid: false, reason: "source changed since the receipt — re-run the lane (attesting profile: local)" }

// The hosted composite — the same predicate plus service-grade checks, for a
// receipt fetched from somewhere other than your own working tree:
const hosted = validateReceiptForTree({ root: projectRoot });
// hosted.status: "valid" | "invalid" | "missing"
```

What each layer checks:

- **`evaluateReceipt`** — binding present, verdict not FAIL, recomputed hash
  matches, verdict is PASS. Its `reason` strings are the exact refusals a
  generated project prints. This is deliberately all a project checks against
  itself: a receipt you just generated is definitionally fresh.
- **`validateReceiptForTree`** adds the hosted-only checks:
  - **freshness** — `generatedAt` within a window (default 30 days;
    `checkFreshness`);
  - **execution plausibility** — executed steps must report real durations
    summing above a floor (default 5 s; `checkExecutionPlausibility`). A
    "PASS" that took 0 ms is the tell for a replayed cache or a hand-written
    verdict.
  - A tree with no receipt returns `status: "missing"`, distinct from
    `"invalid"` — not carrying the harness is not a failure.
- **`listSkippedSteps`** — every SKIP with its verbatim reason. SKIPs are
  surfaced, never hidden and never punished: green-with-gaps must stay
  visible.
- **`DEFAULT_POLICY`** (`{ maxAgeMs, minExecutedMs }`) is overridable per
  call: `validateReceiptForTree({ root, policy: { maxAgeMs } })`.

Full export list (also importable from the two submodules,
`@create-cmp/receipts/inputs-hash` and `@create-cmp/receipts/receipt-validate`):
`computeInputsHash`, `VERIFIED_SURFACE`, `RECEIPT_REL_PATH`, `readReceipt`,
`evaluateReceipt`, `DEFAULT_POLICY`, `checkFreshness`,
`checkExecutionPlausibility`, `listSkippedSteps`, `validateReceiptForTree`.

## What this does NOT do

- **Generate receipts.** Only the verify lane produces them — see
  [`@create-cmp/harness`](https://www.npmjs.com/package/@create-cmp/harness),
  vendored into every generated project as `qa/`.
- **Validate arbitrary JSON envelopes.** `VERIFIED_SURFACE` is create-cmp's
  project shape (`composeApp/`, `specs/`, `qa/`, the root Gradle files). This
  validates create-cmp receipts specifically.
- **Touch the network or git.** Every function takes a `root` already on disk
  and reads synchronously. Getting the right tree onto disk (say, a PR's head
  commit) is the caller's job.
- **Prove correctness.** A valid receipt is tamper-evident evidence that the
  lane executed and passed on exactly these bytes — strong, checkable, and
  still not a formal proof that the software is right.

The receipt format is open and this validator is MIT so anyone can check any
receipt offline. Why binding is by content hash rather than commit SHA:
[ADR-0005](https://github.com/kvdm-co-pilot/create-cmp/blob/main/docs/adr/0005-evidence-binding-by-inputs-hash.md).
