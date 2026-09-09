# ADR-0008: A resolved harness is still a vendored one — pinning is how the bytes arrive, not how they are trusted

- **Status:** accepted — 2026-09-08, Karel van der Merwe (signed by his instruction in session — "sign the adrs"; drafted by the architect)
- **Implementation:** `pack.version` is the profile's own or null since 2026-09-08 (`packages/harness/src/verify.mjs::pack`, pinned by `test/audit-fixes.test.mjs`). `harness.source` provenance landed 2026-09-08: `qa/harness-source.json` (`packages/harness/src/lib/harness-source.mjs`), written by `prooflane init`/`upgrade`, inside the locked region and NOT adopter-owned, reported on the receipt and read by no verdict. The empty-region self-vouch floor is CLOSED by ADR-0010 (2026-09-09), which corrected this ADR's own framing on the way: a running lane can never observe a vacuous region (it derives its root from its own location), so the reachable defect was a false sentence in `describeIntegrity`, not a missing gate in the lane.
- **Date:** 2026-09-05

## Context

Stage 1's row says the resolver goes `local → node_modules → registry → git URL`, fetching at
`init`/`new` only (`docs/NORTH-STAR.md:334`), and §11 O2 asks the question that blocks it: what a
pinned receipt means beside a vendored one (`NORTH-STAR.md:445`). `npm view prooflane-harness
version` returns `0.19.0`, so the version a receipt names is fetchable for the first time — which is
what makes the question live rather than theoretical.

**Today there is one mode and it is vendored.** `harness init` copies the spine out of the harness
package (`src/commands/harness-init.mjs:17-19`, `:61`), deliberately omitting four Compose-profile
tools a foreign repo would not run (`:63-70`), and takes the lock LAST so every vendored byte is
inside it (`:605-613`) — recording the version it read from a local `package.json` (`:610-611`).
`upgrade --harness` re-locks from the same local file (`src/commands/upgrade.mjs:57-72`, `:410-413`).
Nothing resolves anything from outside the repo: `locateProfile` looks only at
`qa/lib/profiles/<id>/index.mjs` (`profile-loader.mjs:44`, `:102-122`), and the only registry fetch
in the tree packs `create-cmp-cli@<v>` as an upgrade's merge base (`upgrade.mjs:164-186`).

Three facts about the existing fields decide this, and each is in the tree rather than in the plan.

**The lane is inside what the receipt binds.** The stamped surface declares `qa`
(`template/qa/verified-surface.json`) and `harness init` forces `qa` into every seeded one
(`harness-init.mjs:215-219`), so `inputs.hash` — `computeInputsHash` over that surface, less the
lane's own outputs in `EXCLUDED_PREFIXES` (`packages/harness/src/lib/inputs-hash.mjs`) — covers the
lane's own source. A vendored receipt binds the code that produced the verdict to the verdict.

**`harness.sha256` is not, and cannot be, a package digest.** `hashHarnessRegion` digests
project-relative paths beside per-file content (`harness-region.mjs:206-216`, `:213`) over a set that
includes two per-project declarations (`:90`) and the adopter's own profile directory (`:77`,
`:122-127`), while the package's image is `src/` and `src/lib/` mapped one level onto `qa/` and
`qa/lib/` (`scripts/sync-harness.mjs:43-46`, `:55`). Region and tarball are the same bytes at
different paths, plus files the registry never carried. What *is* comparable to a registry artifact
is the lock's per-file map (`harness-lock.mjs:69-76`) — which is why that module's header promises a
remote authenticity check (`:11-15`) that no code in this repo performs.

**A region can read `intact` while holding no engine code.** Instrumented probe (scratch tree, two
declaration files, nothing else): `writeHarnessLock` then `checkHarnessIntegrity` returns
`status: "intact"`, `fileCount: 2`. The cmp pack turns that into a PASS row
(`profiles/cmp/steps-cmp.mjs:336-349`) and `checkLaneVouching` (`receipt-validate.mjs:64`) accepts
it. That is precisely the residue a non-vendored lane leaves behind.

## Decision

> **The harness is always vendored, always inside `inputs.hash`, always inside the lock. Pinning is
> how the bytes ARRIVE — resolved by name at `init`/`new` and then written into `qa/` — never how
> they are trusted. There is one kind of receipt. What resolution adds to it is PROVENANCE:
> `harness.source ∈ {local, registry, git}`, recorded because the resolver knows it, and never
> counted as a check by anything.**

This is PACKAGE-SPLIT D9 (`docs/proposals/PACKAGE-SPLIT.md:319`) and §6's fetch-at-genesis rule
(`:199-209`) taken to their conclusion rather than a new position. O2's "whether Gatekeeper accepts
both" dissolves: there is no second kind to accept.

**Is one strictly stronger? Yes, and it is the vendored one.** A receipt from a lane running out of
`node_modules` would claim strictly less: the lane's bytes leave the verified surface, so
`inputs.hash` stops covering the code that produced the verdict; the vouching row degenerates to the
empty-region PASS above; and `qa/receipt-check.mjs`, which imports `./lib/*` (`template/qa/receipt-check.mjs:22-27`),
is not there to be run. The only thing pinning buys — a `version` that resolves — is available
without giving any of that up, because the fetch happens once, at genesis, and the bytes stay.

**`harness.sha256` keeps its exact present meaning and gains none.** It is this project's region
digest: an IDENTITY ("which lane, precisely, in this repo"), not a provenance fact. It is neither the
tarball's integrity hash nor absent, because the region still exists in every mode. Registry
comparison is a lock-level operation over `lock.files`, performed by whoever has a network, and the
receipt's job is to name what to compare — `name` + `version` + `source` — not to carry a digest that
looks comparable and is not. A present-but-different-meaning field is the failure mode this refuses.

**`status` gets no fourth value.** `intact | modified | unlocked` answers one question — is my lane
unmodified since it was installed (`harness-lock.mjs:87-96`) — and provenance is a different
question. A `pinned` value would make one field answer two, and `unlocked` already covers the honest
"nothing is known to be wrong and nothing is proven".

**`pack.version` must become null, not inherited.** It is currently the harness lock's version
(`packages/harness/src/verify.mjs:555`), which was honest while one artifact shipped both. Under
independent semver (PACKAGE-SPLIT D10, `:320`) a registry-resolved harness beside a repo-authored
profile — already the normal foreign-adopter shape (`harness-region.mjs:96-107`) — makes that number
a falsehood about the pack. The schema already permits null (`template/qa/evidence/schema.json:189-194`);
an honest absence beats a borrowed number until the profile declares its own.

**The same rule binds the profile, and §6 is ambiguous about it.** A profile is inside the region
(`harness-region.mjs:77`) and therefore inside the lock and `inputs.hash`. §6's resolution order
bounds fetch-then-vendor to steps 3 and 4 (`PACKAGE-SPLIT.md:206`) and says nothing about step 2, so
`node_modules/prooflane-profile-<id>` reads as a possible LOAD path. It is not one: a pack loaded
from `node_modules` would decide what "done" means from bytes outside both the lock and the hash —
the same defect one layer down, and Rule 2's exact case. Read step 2 as a resolution source that
vendors like the others; today's loader cannot do otherwise (`profile-loader.mjs:102-122`).

**What Gatekeeper inherits.** It is not running — hosted deployment is deferred until real user
traction (`NORTH-STAR.md:372`) and its service lives in another repo (GATEKEEPER-PRODUCT.md §4.2)
— so this is the rule, not a description. It accepts every receipt this harness mints and reads
`source` in no acceptance test: checking is free forever (`NORTH-STAR.md:294`) and must never become
conditional on where an adopter got their bytes. It SHOWS the difference in one place and one shape:
provenance as fine print beside the lane's name and version (`registry` renders the version as a
resolvable package, `git` and `local` as plain text, absent as "not recorded" — never as `local`,
which would be inventing provenance for every receipt written before the field). If it performs the
lock-versus-registry comparison, that is ITS finding, in its own row, dated and named — never
rendered as a property of the receipt, because notarisation is not examination
(`NORTH-STAR.md:309-310`).

## Consequences

- **Every existing receipt is unaffected and nothing is re-earned.** `source` is a new optional
  field; absent means unrecorded. No writer changes, no predicate changes, no lane runs again.
- **Stage 1 shrinks to what it should be.** The resolver changes where `init` READS bytes and
  nothing about the lane, the lock, the receipt, the predicate, or the offline check. That is a
  bounded piece of work with a single blast radius, which is the point of deciding this before
  building it.
- **G4 survives untouched, and this is the reason vendoring stays the default rather than a
  footnote.** A stranger, offline, holding the repo, still has the receipt, the tree it binds, the
  lane whose bytes are in that binding, and the predicate that checks it — with no network, which is
  guarantee §8.2 (`NORTH-STAR.md:291-292`) stated as an outcome instead of a hope.
- **The harness can never become a runtime dependency, and that costs something real.** A core fix
  reaches a repo as a file rewrite plus a re-lock (`upgrade --harness`), never as a version bump
  someone's package manager applies. Stage 1's exit criterion — "a core fix reaches it by version
  bump" (`NORTH-STAR.md:334`) — is met by a command, and that wording should be read that way or
  amended; it is the one place this ADR bends a sentence already written.
  **AMENDED 2026-09-08.** The sentence now reads that a core fix reaches the adopter by one command
  and that the proof is the adopter's TREE — vendored bytes and lock digests moving — rather than a
  manifest number. Worth recording how it was caught: not by anyone re-reading the ADR, but by
  trying to write the criterion as a command (`scripts/stage1-gate.mjs`). A contradiction between
  two documents can sit unnoticed indefinitely; a contradiction between a document and a program
  surfaces the first time the program runs.
- **One field is added, against the presumption.** §8.8 presumes against new mechanism, and the
  answer is that `source` prevents a specific falsehood already measured: the published core has sat
  versions behind the tree (`PACKAGE-SPLIT.md:52-55`), so receipts today name versions that were not
  on the registry when they were minted, and no reader can tell that from one that was. It is
  exactly as forgeable as the `version` beside it and is offered as no kind of check; what it buys is
  that a checker with a network knows WHICH artifact to fetch — and whether fetching one is
  meaningful at all — before comparing it to `lock.files`.
- **A named, unfixed hole: an empty region reads `intact`.** The probe above is a vacuous
  self-vouch, and it is not a missing `status` value — it is a missing floor (a region with no
  engine file is not an intact lane). It is a gate, so it needs a kept plant and a measured cost
  (`NORTH-STAR.md:304-306`) and it is not smuggled into this ADR.

## Alternatives considered

- **True pinning: run the lane from `node_modules`.** Rejected: it breaks guarantee §8.2 and G4 in
  the same move, and the receipt stops binding the code that issued the verdict.
- **Pin the lane, vendor only the predicate.** Rejected: the predicate would still run, and would
  still say PASS, over a receipt whose `inputs.hash` no longer covers the lane — attesting the tree
  while saying nothing about what judged it. It buys a smaller `qa/` and pays with the one claim
  receipts exist to make.
- **Redefine `harness.sha256` as the tarball's integrity hash when resolved.** Rejected: one field
  with two meanings and nothing on the receipt to say which, and the meaning it would gain is
  already better served by the lock's per-file map.
- **A fourth `status` value, `pinned`.** Rejected: it answers a question `status` was not asked.
- **Leave O2 to be settled in code during Stage 1.** Rejected: this changes what a receipt claims,
  and fit-test question 5 (`NORTH-STAR.md:402-403`) requires the ADR first. That is what O2 is.

## What would make this wrong

**A lane that cannot be vendored.** Everything here rests on the bytes being copyable text: a stack
whose lane needs a compiled binary, a platform-specific toolchain, or a tree too large for adopters
to keep in review, cannot take this deal, and the mode split returns as a genuine question rather
than a convenience. Nothing in the tree tests that boundary — one JS spine, copied into every
adopter so far — so it is an assumption, not a finding.

**The sharper one: a notary that accepts a receipt whose lane it could not obtain.** Under this
decision it always can, because the lane is in the repo. The day a receipt is accepted with its lane
behind a private registry, "checkable from the repo alone" has become "checkable if you have
credentials", and nothing on the receipt shows the difference — unless `source` is there. That is
the field's justification, and if provenance is ever dropped as noise, this ADR should be reopened
rather than quietly kept.

## Related

- `docs/NORTH-STAR.md` §11 O2 (the decision this closes); §9 Stage 1 (what it unblocks, and the
  exit-criterion wording it bends); §8.2, §8.3, §8.9 (the guarantees it is measured against); G4.
- `docs/proposals/PACKAGE-SPLIT.md` §6 (resolution order, fetch bounded to genesis), D9 (init writes
  the vendored copy), D10 (independent semver), D12 (the measured adopters already on the vendored
  path, for whom this decision changes nothing).
- `docs/adr/0005-evidence-binding-by-inputs-hash.md` — what a receipt binds, and why the binding is
  the claim.
- `docs/adr/0007-receipt-format-name-is-routing-metadata.md` — the companion: the name on the
  envelope is not the claim, and neither is where the bytes were fetched from.
- `packages/harness/src/lib/harness-lock.mjs` (the lock and its `status`),
  `harness-region.mjs` (what the region is), `packages/harness/src/verify.mjs` (the writer of
  `harness` and `pack`), `template/qa/evidence/schema.json` (the fields this constrains),
  `packages/harness/install/init.mjs` (where resolution will land — the installer moved into the
  harness package on 2026-09-08 so it could be reached without create-cmp; the paths cited in
  Context above are as they stood when this was decided).
