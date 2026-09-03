# @create-cmp/harness

The verify lane every [create-cmp](https://github.com/kvdm-co-pilot/create-cmp)
app carries — the machine-owned half of a stamped project, published as the
single source of truth it is vendored from.

## Two kinds of file

A create-cmp project contains app-owned files (screens, specs, golden
baselines, approvals, e2e flows — the app) and machine-owned files (the lane —
engine code, byte-identical in every app ever stamped, carrying no app
content). The boundary is mechanical, with no list to maintain:

```
machine-owned  ==  the .mjs files directly under qa/ and qa/lib/
```

`src/lib/harness-region.mjs` is that rule as code. Three properties hang off it:

- **Copied, never stamped.** The lane goes through no token replacement at
  scaffold time. It used to, and that corrupted it in ways that were hard to
  see — code that needed to *write* a placeholder literal had its own source
  rewritten. Anything app-specific the lane needs, it reads at runtime from
  the project's `create-cmp.json`.
- **Provable.** Because every copy is byte-identical to a known version, a
  project can prove offline that its lane is unmodified (below). Without
  this, a receipt is unfalsifiable in one specific way: edit `qa/verify.mjs`
  to force every step green and the receipt still validates, because the
  edited checker is just part of the hashed surface.
- **Replaced, not merged.** `create-cmp upgrade --harness` swaps the whole
  region. Three-way-merging a derived artifact was the prior failure: engine
  code produced conflict noise in every app while containing nothing
  app-specific to preserve.

## Vendored, not depended on

Generated projects never `npm install` this. The scaffold drops a
byte-identical copy of `src/` into the project's `qa/`, so
`node qa/verify.mjs` runs offline, in CI, and air-gapped, with no install
step and no registry reachable. This package exists so that copy has a
published, citable source of truth — and so the region's integrity mechanism
is installable on its own (below). In the create-cmp repo,
`node scripts/sync-harness.mjs` re-vendors and parity tests pin
byte-equality across package ↔ template ↔ fresh scaffold.

## Install

```sh
npm install @create-cmp/harness
```

## Use — the region hash-lock

The part worth consuming standalone is the machine-owned-region integrity
check — the same check `qa/verify.mjs` runs as its first step in every
profile, as plain functions over a directory tree:

```js
import { isHarnessFile } from "@create-cmp/harness/harness-region";
import {
  writeHarnessLock,
  checkHarnessIntegrity,
  describeIntegrity,
} from "@create-cmp/harness/lib/harness-lock.mjs";

isHarnessFile("qa/verify.mjs");     // true  — machine-owned
isHarnessFile("qa/approvals.json"); // false — app state, never part of the region

writeHarnessLock(projectRoot, { version: "1.0.0" });
describeIntegrity(checkHarnessIntegrity(projectRoot));
// "@create-cmp/harness 1.0.0 — 2 files verified"

// …edit a lane file in place, then check again:
// "@create-cmp/harness 1.0.0 — 1 modified"
```

`checkHarnessIntegrity` returns `{ status: "intact" | "modified" | "unlocked",
name, version, modified, missing, extra, fileCount }` — naming exactly which
files drifted, so an upgrade knows what it is replacing. `hashHarnessRegion(root)`
gives `{ sha256, fileCount, files }` (a per-file digest map) with no lock to
compare against. A corrupt or truncated lock reads as `unlocked`, never as
intact.

## The rest of the package

`src/verify.mjs` is the lane's CLI entry (what a vendored copy runs as
`qa/verify.mjs`), composed from the `src/lib/*.mjs` modules: spec-coverage
scanning, the approvals gate, golden-tree / a11y / conformance wiring, the
device lease, the step cache, the flight recorder, the evidence-receipt
writer. Each is individually importable (`@create-cmp/harness/lib/<name>.mjs`,
extension optional), but they are written to run *inside* a scaffolded
Compose Multiplatform project — they expect `composeApp/`, `specs/`, and
`gradlew` on disk. They are not a general-purpose toolkit.

Two modules are the exception by design: `lib/inputs-hash.mjs` and
`lib/receipt-validate.mjs` are byte-identical vendored copies of
[`@create-cmp/receipts`](https://www.npmjs.com/package/@create-cmp/receipts)
(parity-tested), kept so this package needs no npm dependency either. If you
only want receipt validation, depend on `@create-cmp/receipts` directly.

## Adopting the spine in a repo that is not a Compose app

The lane is two things (evidence-economics S8): a **spine** and a **step pack**.

- **Spine** — `verify.mjs` plus `lib/lane-runner.mjs`, `lib/step-outcomes.mjs`,
  `lib/receipt-validate.mjs`, `lib/inputs-hash.mjs`, `lib/approvals.mjs`, `lib/spec-coverage.mjs`,
  `lib/flight-recorder.mjs`, `lib/evidence-level.mjs`, `lib/walk.mjs`, `lib/plan.mjs`,
  `receipt-check.mjs`, `approve.mjs`, `plan.mjs`, `walk-status.mjs`, `retrospective.mjs`. It
  parses arguments, runs steps under a deadline with a pulse, turns a throw or a timeout into
  one `ERROR` row, derives the verdict and the evidence rung, writes the receipt bound to the
  inputs hash, journals the run, and refuses "done" without a PASS. **It knows nothing about
  Gradle, adb, Maestro or `composeApp/`.**
- **Step pack** — `lib/steps-cmp.mjs`. Every Compose Multiplatform step, behind one factory:
  `createCmpSteps(ctx)` returns `{ stepsForProfile, DEVICE_STEPS, FAST_EXCLUDED_NAMES,
  STEP_FN_BY_NAME, stepDeterminism, releaseLease }`. **It reads no argv and writes no receipt.**

To verify a Kotlin backend, a web service, anything: keep the spine, replace the pack.

1. Vendor the spine files above into `qa/`, then **declare your verified surface** in
   `qa/verified-surface.json` — `{"surface": ["services", "docs", "build-logic", ".github", "qa"]}`.
   Without it the surface defaults to a Compose app's (`composeApp`, `specs`, `qa`, the Gradle
   files) and everything outside it stops being attested. Absent a declaration this is loud, not
   silent: a surface matching no files is refused rather than hashed, and the Stop hook reports
   the refusal with its reason. But a surface matching *some* of your tree — a backend that has
   `qa/` and `specs/` — resolves to a valid, smaller hash, so declare it deliberately rather than
   relying on the guard. The file lives inside the surface, so changing it invalidates receipts,
   which is correct: the coverage changed.
2. Write `qa/lib/steps-<yours>.mjs` exporting `createYourSteps(ctx)` with the same return shape.
   A step is a function returning `{ name, verdict: "PASS"|"FAIL"|"SKIP"|"ERROR", reason?,
   durationMs, details? }`. Borrow `ctx.sh` (it throws `StepTimeout` past the step's deadline —
   never catch that) and push degraded-path notes onto `ctx.DEGRADED_PATHS`. Name each step
   function `step<Name>` — the runner narrates and deadlines by that name.
3. In `verify.mjs`, swap the one composition line:
   `const pack = createYourSteps({ ROOT, HERE, ..., sh, shGradle, tryGit, tryGitLines, DEGRADED_PATHS })`.
   Profiles, `--fast`, the receipt, the hook, the console's Drive/approvals/evidence pages, the
   flight journal and the retrospective all keep working unchanged.

**Worked example — `payment-blueprint`.** Its steps are `compositeBuild`, `gitleaks`,
`linkCheck`, `mutation` (nightly), `legacyPlatform`, `unitTests`, `specCoverage`, `approvals`,
`harnessIntegrity`. Today they live in a hand-written 2,769-line lane that forked the spine
and now receives no upstream fix. The migration is: keep its step bodies, wrap them in
`createBlueprintSteps(ctx)`, delete its copies of the spine, vendor ours. The mutation step
belongs in `stepsForProfile.nightly`, not `local` — that is what S0 decided.

## What this does NOT do

- **Verify an arbitrary project.** The lane is CMP/Gradle-specific and
  resolves its project root from its own file location — running it from
  `node_modules` will not verify the project that installed it. It works
  vendored into a project's `qa/`, which create-cmp does at scaffold and
  upgrade time.
- **Prove authenticity.** The lock is a checksum, not a signature: it answers
  "has this tree's lane changed since it was locked?" — locally, offline,
  every run. "Is this really the published `@create-cmp/harness@X`?" needs a
  comparison against the published package's own digests, which is the
  upgrade flow's job, not the lock's.
- **Publish evidence anywhere.** Receipts land in `qa/evidence/latest.json`
  on disk; committing or hosting them is the project's choice.

## Versioning

This package versions **independently of `create-cmp-cli`**. The lane changes
far more often than the template's app shape; coupling the two forced an
app-shape release for every lane fix. A generated project records both — the
engine version that stamped its shape and the harness version that issues its
verdicts — and can upgrade either without the other.
