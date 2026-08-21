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
