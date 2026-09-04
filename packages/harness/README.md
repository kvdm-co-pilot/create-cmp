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
  `lib/spec-model.mjs`, `lib/harness-manifest.mjs`, `lib/profile-loader.mjs`,
  `lib/flight-recorder.mjs`, `lib/evidence-level.mjs`, `lib/walk.mjs`, `lib/plan.mjs`,
  `receipt-check.mjs`, `approve.mjs`, `plan.mjs`, `walk-status.mjs`, `retrospective.mjs`. It
  parses arguments, runs steps under a deadline with a pulse, turns a throw or a timeout into
  one `ERROR` row, derives the verdict and the evidence rung, writes the receipt bound to the
  inputs hash, journals the run, and refuses "done" without a PASS. **It knows nothing about
  Gradle, adb, Maestro or `composeApp/`.** What it needs to know about a stack it reads from
  the **profile** the manifest names (`qa/lib/profiles/<id>/index.mjs`): `steps(ctx)` — the
  pack — plus `layout` (where specs, sources, tests and flows live) and `tiers` (which test
  tiers exist, which run host-only, which satisfy a clause's `[tier: …]`), which
  `lib/spec-model.mjs` validates into the scanner's model.
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

4. **Tell the console where things are** — `qa/harness-manifest.json`. The console (the studio,
   `inspector/mcp`) reads the receipt, the architecture document, the spec directory and the
   citation roots; without a manifest it assumes the Compose layout (`qa/evidence/latest.json`,
   `docs/ARCHITECTURE.md`, `specs/`, citations under `composeApp/src` and `qa/e2e`). Declare
   yours field by field — undeclared fields keep the default:

   ```json
   {
     "receipt": "qa/evidence/receipt.json",
     "architectureDoc": "ARCHITECTURE.md",
     "specs": "specs",
     "citationRoots": ["services", "qa/test"],
     "packs": ["blueprint"]
   }
   ```

   Every path is relative to the repo root, `/`-separated, and may not escape it. A manifest
   that is present but malformed is **refused**, not defaulted: every pane it feeds says why,
   and the rail names the file — the console never quietly looks in the wrong place and reports
   an honest-looking absence. When your `qa/lib/spec-coverage.mjs` exports `scanSpecClauses` and
   `scanCitations`, the console's Specs page renders *their* reading (your grammar, your
   binding rule). The lane reads `specs` and `citationRoots` too: they override the profile's
   `layout`, field by field, so a foreign repo attached with its own paths gets the same scan
   from the lane and the console.
5. **Tag your steps with the layer they prove** — `stepCompositeBuild.layer = "backend"`. The
   runner stamps the tag onto the receipt row (`{ name, layer, verdict, … }`; rows without a
   tag are unchanged) and the Evidence page groups steps per layer with a per-layer tally, so a
   lane over a backend, a security scan and the spine reads as one lane with three reports.
   Layer names are free-form strings; the Compose pack uses `spine`, `compose`, `device`.

**Worked example — `payment-blueprint`.** Its steps are `compositeBuild`, `gitleaks`,
`linkCheck`, `legacyPlatform`, `unitTests`, `specCoverage`, `approvals`,
`harnessIntegrity`. Today they live in a hand-written 2,769-line lane that forked the spine
and now receives no upstream fix. The migration is: keep its step bodies, wrap them in
`createBlueprintSteps(ctx)`, delete its copies of the spine, vendor ours. Anything whose cost
scales with the suite rather than the change belongs in `stepsForProfile.nightly`, never
`local` — and a step that has never returned a verdict does not belong in the lane at all.

## The device tier runs itself

The full lane (every profile but `smoke`, `scaffold` and `--fast`) drives a device: tokenDrift,
e2eSmoke (every flow in `qa/e2e/`, debug build), androidChecks (`connectedDebugAndroidTest`).
With nothing attached it boots a headless emulator (`lib/device-provider.mjs`) and shuts it
down when the lane exits. Environment variables:

| Variable | Effect |
|---|---|
| `CMP_AVD=<name>` | the AVD to boot; else the doctor's `cmp_pixel`, else the only AVD; several and no way to choose is a refusal naming them |
| `CMP_KEEP_DEVICE=1` | leave a booted emulator running for the next lane |
| `CMP_DEVICE=none` | the ONE explicit opt-out (CI runners without an emulator). The device rows SKIP with `skipKind: "environment"`, and `receipt-check.mjs` refuses that receipt as done-evidence |

A device that cannot be provisioned within the boot bound is an ERROR row, and the lane FAILs:
a device that never came up is a failure to test, not a gap to record.

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
