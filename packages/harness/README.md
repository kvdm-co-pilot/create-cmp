# create-cmp-harness

The **verify lane** every [create-cmp](https://github.com/kvdm-co-pilot/create-cmp)
app carries — the machine-owned half of a stamped project.

A create-cmp app contains two kinds of file. *App-owned* files are the app:
its screens, specs, goldens, approvals, e2e flows. *Machine-owned* files are
this package: executable harness code that is byte-identical in every app
ever stamped, carrying no app content whatsoever.

```
machine-owned  ==  the .mjs files directly under qa/ and qa/lib/
```

`src/lib/harness-region.mjs` is that rule in code, and three properties
follow from it.

**Never stamped.** The lane is copied, not token-replaced. It used to be
stamped, and that silently corrupted it: `lib/approvals.mjs` had to detect
unresolved tokens by *shape* because writing the literal `__PACKAGE__` in its
own source got rewritten out from under it, and `scaffold-feature.mjs`
shipped an error message meaning to name the unresolved token that instead
named the app's real package. Anything app-specific the lane needs is read at
runtime from `create-cmp.json`.

**Verifiable.** Because every app's copy is byte-identical to a known
version, an app can prove offline that its lane is the real one. Without this
a receipt is unfalsifiable — edit `qa/verify.mjs` to force every step green
and the receipt still validates, since the edited file is simply part of the
hashed surface.

**Replaceable.** `create-cmp upgrade --harness` overwrites the region
wholesale instead of merging it. Merging a derived artifact was the mistake
that made upgrades expensive: a three-way merge over 10k lines of engine code
produced ~1,000 conflicted lines per app with zero app-specific tokens in
them.

## Vendored, not depended on

**The way create-cmp actually uses this package is not `npm install` at
all.** A generated project's `qa/` directory carries a byte-identical *copy*
of this package's `src/`, dropped in at scaffold time — so `node qa/verify.mjs`
runs offline, in CI, and air-gapped with zero install step, and zero
dependency on this package (or any package) ever being reachable. This
package is the single source of truth those copies are vendored from; the
create-cmp repo re-vendors with:

```sh
node scripts/sync-harness.mjs
```

`test/harness-parity.test.mjs` pins package ↔ template ↔ fresh-scaffold
byte-equality, and `test/harness-region.test.mjs` pins the boundary itself.

If you `npm install create-cmp-harness` directly, you're using it as a
**library** — see below — not as the thing that verifies your own project
(`src/verify.mjs` resolves its project root relative to its own file
location, so it only works copied into a project's `qa/`, exactly as
create-cmp vendors it).

## Install

```sh
npm install create-cmp-harness
```

## Use

The one thing worth consuming this package for standalone is the **hash-lock
on the machine-owned region** — the same check `qa/verify.mjs` runs as its
first step in every app, exposed as plain functions over any directory tree:

```js
import { hashHarnessRegion, isHarnessFile } from "create-cmp-harness/harness-region";
import { writeHarnessLock, checkHarnessIntegrity, describeIntegrity } from "create-cmp-harness/lib/harness-lock.mjs";

isHarnessFile("qa/verify.mjs");     // true  — machine-owned
isHarnessFile("qa/approvals.json"); // false — app state, never hashed

// Lock a tree's region — what create-cmp writes at stamp/upgrade time:
writeHarnessLock(projectRoot, { version: "0.14.1" });
console.log(describeIntegrity(checkHarnessIntegrity(projectRoot)));
// create-cmp-harness 0.14.1 — 2 files verified

// Edit a lane file directly (instead of upgrading upstream) and check again:
// create-cmp-harness 0.14.1 — 1 modified
```

`checkHarnessIntegrity` returns `{ status: "intact" | "modified" | "unlocked",
name, version, sha256, modified: string[], missing: string[], extra: string[],
fileCount }` — naming exactly which files drifted, not just that something
did, so an upgrade knows what to preserve. `hashHarnessRegion(root)` alone
gives you `{ sha256, fileCount, files }` (a per-file digest map) without
needing a lock to compare against.

The rest of the package is the lane's implementation — `src/verify.mjs` (the
CLI entry a vendored copy runs as `qa/verify.mjs`) and every `src/lib/*.mjs`
module it composes (spec-coverage scanning, approvals gate evaluation, golden
tree / a11y / conformance test wiring, the device lease, the evidence
receipt writer, and more). Each is exported individually
(`create-cmp-harness/lib/<name>.mjs`) for reuse, but they are written to run
*inside* a scaffolded Compose Multiplatform project (they expect
`composeApp/`, `specs/`, `gradlew`, and friends on disk) — they are not a
general-purpose toolkit for arbitrary trees. `src/lib/inputs-hash.mjs` and
`src/lib/receipt-validate.mjs` are the one exception: they're vendored copies
of [`cmp-receipts`](https://www.npmjs.com/package/cmp-receipts)' own two
files, kept byte-identical (parity-tested) so this package never needs
`cmp-receipts` as an npm dependency either. If you only want receipt
validation, depend on `cmp-receipts` directly instead of reaching into this
package for it.

## What this does NOT do

- **It does not verify an arbitrary project.** `qa/verify.mjs` is CMP/Gradle-
  specific (`assembleDebug`, `desktopTest`, Maestro flows, Android device
  leasing) and resolves its project root from its own file path — running it
  from `node_modules/create-cmp-harness` will not verify the project that
  depends on it. The lane only works vendored into a project's `qa/`, which
  `create-cmp` does for you at scaffold and upgrade time.
- **It is not signed, only hashed.** `checkHarnessIntegrity` is a local,
  offline *integrity* check — "has this tree's lane changed since it was
  locked?" It cannot prove *authenticity* ("is this really the lane
  `create-cmp-harness@X` published?") — that comparison needs the published
  package's own digest, which `create-cmp upgrade --harness` fetches and
  compares against.
- **It does not publish evidence anywhere.** Receipts are written to
  `qa/evidence/latest.json` on disk; committing, hosting, or serving them is
  entirely up to the project.
- **It is not a dependency-light convenience wrapper.** Several `src/lib/*`
  modules are large and specific (e.g. `verify.mjs` itself, `approvals.mjs`,
  `scaffold-feature.mjs`) because they encode this project shape's actual
  rules, not a thin abstraction over them.

See [create-cmp](https://github.com/kvdm-co-pilot/create-cmp) for the engine
that scaffolds the projects this lane runs inside, and
[`cmp-receipts`](https://www.npmjs.com/package/cmp-receipts) for the
receipt-validation half published standalone.

## Versioning

`create-cmp-harness` versions **independently of `create-cmp-cli`**. The lane
changes far more often than the template's app shape, and fusing the two is
what forced an app-shape merge every time a lane fix shipped. An app records
both: the engine version that stamped its shape, and the harness version that
issues its verdicts.
