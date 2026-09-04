# Packages, profiles and scaffolders — the split

**Status:** proposal · drafted 2026-09-04 · not signed
**Owner:** Karel
**Supersedes nothing.** Extends [AGNOSTIC-HARNESS-ARCHITECTURE.md](AGNOSTIC-HARNESS-ARCHITECTURE.md) §10 (Distribution) and §11 (Migration); requires an amendment to [NORTH-STAR.md](../NORTH-STAR.md) §3 and §9 (§8 below).
**Evidence:** `fuelled-api` harness adoption report, 2026-09-04 (sibling repo, `docs/HARNESS-ADOPTION-REPORT.md`) — the first foreign stack ever to load through the seam, adopted with zero core edits.

---

## 0. What this document is

> Governed by [`docs/NORTH-STAR.md`](../NORTH-STAR.md) (2026-09-04). Goals, guarantees and
> the fit test are NORTH-STAR's. This document holds authority over one thing: **how the
> product is packaged, and how a stack arrives.** The profile protocol itself stays with
> AGNOSTIC-HARNESS-ARCHITECTURE §5.

Stage 0 inverted the dependency: nothing in the core imports a profile by name. That work is
done and it was validated by a second stack on 2026-09-04 with **zero core edits**.

It also proved the seam is not the bottleneck any more. **The packaging is.** A Kotlin
backend that wants the lane must install a Compose scaffolder, and then the only documented
way to declare its stack is a command that refuses it by design. This document is the fix,
and it is deliberately larger than that fix, because the same boundary decides how the
second, third and fourth stacks arrive.

---

## 1. What we have, measured

Measured 2026-09-04 at `ddfa634`.

| Fact | Value |
|---|---|
| Published CLI | `create-cmp-cli@0.24.0` (2026-09-04T02:20Z) |
| Published core | `@create-cmp/harness@0.15.0` — **local tree is 0.19.0** |
| Published reader | `@create-cmp/receipts@0.1.0` |
| Front door | `create-mobile@0.1.0`, claimed 2026-07-15 |
| **`create-cmp` on npm** | **owned by `termosa`, published 2022-04-27, version 0.0.0 — not ours** |
| npm workspaces | none — `packages/` is directories, not a workspace |
| Scaffolder | `src/` — 34 files, 6,711 lines |
| Core + profile | `packages/` — 83 files, 17,723 lines |
| Golden tree | `template/` — 254 files, 16,427 lines of `.mjs` |
| Vendored copy | `template/qa/lib` is **byte-identical** to `packages/harness/src/lib` |
| Skills | 11, of which 10 are named `cmp-*` |

Four consequences follow from that table without any argument.

**`npm create cmp` runs a stranger's package.** We do not own the name. The natural
invocation for our own front door resolves to a 2022 placeholder belonging to someone else.
Every naming decision below inherits this constraint.

**The published core is four versions behind the tree**, and the adoption report's
assumption 11 records the consequence: an adopter has no way to know which version to stamp
in their lock, so `harness.version` on the receipt — the field §8 of NORTH-STAR says makes
evidence portable — is currently decoration.

**The scope is a stack name.** Every package we add inherits `@create-cmp/`, so a Ktor
team's dependency tree says `cmp` in it forever.

**The golden tree and the core are the same bytes in two places** with nothing checking that
they stay so. It happens to hold today. Nothing makes it hold tomorrow.

---

## 2. The inversion — the profile is the unit, the scaffolder is a consumer

The tempting move is to put each profile inside its scaffolder: `create-cmp` ships the `cmp`
profile, `create-ktor` ships the `ktor` profile. **That is backwards**, for three reasons.

**Most repos already exist.** fuelled-api is the proof, and it cost us a session to buy:
no scaffolder was involved, the profile *was* the entire adoption. If profiles ship inside
scaffolders, adopting the harness into an existing repo means installing a scaffolder you
will never run. That is the audience G3 exists for, and it is the larger one.

**The lifecycles are opposite.** A scaffold is one-shot, at genesis, and then it is
somebody's git history. A profile is forever and must track the harness protocol. Fuse them
and a protocol bump requires re-releasing every scaffolder, and a repo stamped a year ago
upgrades its profile by reinstalling a scaffolder it already ran. That makes Stage 3 — one
command upgrades a pinned fleet — unsolvable by construction.

**The golden tree is the mirror of the layout declaration.** A profile already declares
`layout`, `tiers` and its architecture rules. A golden tree is that same knowledge in
concrete form. In one package the check is *derivable*: the tree must satisfy the layout its
own profile declares. In two packages they can disagree with nothing watching — the
spec-mirror-drift failure this product refuses everywhere else.

**Therefore: one package per stack, holding the profile, its golden tree, and its providers.
Two entry points into the same artifact.**

```
harness init  --profile ktor    an existing repo. Manifest + profile. No tree.
harness new   --profile ktor    a fresh repo. Manifest + profile + the golden tree.
```

`create-cmp` and `create-ktor` become preselected aliases of one machine. That is the
"slot in" property: it falls out of the decomposition rather than being engineered.

---

## 3. The package map

```
@prooflane/harness       the core. profile loader, runner, journal, inputs-hash,
                     receipt, lock, Stop hook, liveness, spec-citation binding,
                     hash-bound approvals, the walk, grill-me, Rule 0/1/2
                     instruments, the console, the neutral MCP server.
                     Knows no stack. THIS IS THE PRODUCT.

@prooflane/cli           the verbs: init | new | attach | doctor | upgrade.
                     Resolves and installs profiles. Owns no stack knowledge.

@prooflane/profile-cmp   layout, tiers, steps, ladder, plants, artifacts, governable,
                     affected-map, architecture rules — and the CMP golden tree.

@prooflane/studio-cmp    the eyes: preview registry, headless render, live inspector,
                     drift, runtime, data. Providers behind the console's
                     interfaces. OPTIONAL — a Compose repo may want the lane and
                     not the emulator.

@prooflane/profile-ktor  the ktor profile and its golden tree.

@prooflane/receipts      the standalone reader/validator. Exists, published, unchanged.

create-cmp-cli       thin shim → cli --profile cmp     (the name we own)
create-ktor          thin shim → cli --profile ktor
create-mobile        thin shim, behind the existing fit check (unchanged intent)
```

**Arrows still point down.** `cli` depends on `harness`; a profile depends on `harness`;
`studio-cmp` depends on `profile-cmp`; nothing depends upward and nothing imports a profile
by name.

---

## 4. The gate that makes "golden path" mean something

Each scaffolder is meant to lay down that stack's clean architecture — clean arch for `cmp`,
the equivalent idiom for each other stack. **A golden tree that claims clean architecture and
is not checked is exactly what this product exists to refuse.** So the claim needs a mechanism,
and it is available for free once the tree lives beside its profile:

> **Every profile's golden tree must stamp, run its own lane, and reach at least L1 —
> including that profile's declared architecture-conformance rules — inside this repo's
> suite. A profile whose tree cannot do that does not ship.**

Not a document asserting the template is clean. A test that stamps it, runs its lane and
fails the build when it is not. We already do this for `cmp`; generalising it is what stops
profile four from shipping a nice README over an empty spine. This is G1 applied to
scaffolding, and it is the single most load-bearing rule in this document.

---

## 5. Naming — decided

Open decision O1 (name the harness) could be deferred while everything lived in one package.
It could not be once the split was on the table: every package in §3 needs a scope, and the
receipt format rename (D3) must land on the final name rather than being renamed twice. It is
settled below.

Measured on npm, 2026-09-04. Taken: `lane`, `vouch`, `attest`, `provenance`, `derive`,
`greenlane`. Free unscoped: `attestly`, `prooflane`, `lanekit`, `evidently`. Scope
availability is **not** confirmed — an E404 on a probe package does not prove a scope is
unclaimed, and that check must happen before we commit.

**Taken: `prooflane`.** It is free; it keeps the noun the codebase already uses everywhere
(`lane-runner`, "the verify lane", "the lane returns"); it reads correctly in all three
positions that matter — `npx prooflane init`, `@prooflane/harness`, `prooflane-evidence/1`;
and it describes what the thing does without claiming to be a notary, which is Gatekeeper's
role.

Claim `prooflane`, the `@prooflane` scope, and `create-ktor` in one pass. **`create-cmp` is
treated as permanently lost and nothing is designed around it** — `cmp` is one scaffold among
many into the harness, not the product's name.

> **Owed before Phase C:** the `@prooflane` scope is used throughout this document on the
> strength of an unscoped-name check only. Confirm the scope is claimable before the first
> package is published.

---

## 6. Distribution and resolution

A profile resolves in this order, first hit wins:

1. `qa/lib/profiles/<id>/` — vendored in the repo. **Always preferred.**
2. `node_modules/@prooflane/profile-<id>/`
3. the registry
4. a git URL

**Steps 3 and 4 run at `init` and `new` time only, and then vendor.** Never at lane time.
NORTH-STAR G6 says a receipt is checkable air-gapped, and the harness's own "never" list says
it does not depend on a network to validate one. Fetching at genesis is fine — you are online
when you create a project. Fetching to run a gate is not, ever.

Step 4 is the enterprise story arriving early: a platform team publishes
`github.com/acme/profile-acme-spring`, and every repo in the company runs
`harness init --profile git+https://…`. That is Stage 2's "profiles as artifacts" reachable
from Stage 1's plumbing, and it is worth building the resolver with it in mind even though
it ships later.

---

## 7. The plan

### Phase A — fix the findings, take the exit measurement
*No naming needed. Nothing breaking. Ships value immediately.*

**A1–A4 landed 2026-09-04.** A repo with JS sources, a spec and a test reached a green
lane and a PASSing Rule 0 (3 plants, 781 ms, tree restored byte-for-byte) from one command,
with nothing hand-edited. Three defects in the instrument itself surfaced on the way and are
fixed: the Stop-hook check that could not fail for its own reason, the plant skip that named
a language and a falsehood, and the integrity refusal that hid the paths it refused over.

| # | Step | Gate |
|---|---|---|
| A1 ✅ | `harness init [--profile <id>]` writes manifest, profile skeleton (5 required exports stubbed, 4 optional present and commented with real field names), seeded `verified-surface.json`, lock — then runs framework-check and prints the result. Manifest refusal repointed at it. | suite + framework-check; a fixture repo goes from empty to green lane |
| A2 ✅ | README: delete the step that instructs editing `verify.mjs`; fix step 1 breaking `harnessIntegrity`; correct the spine list. | link-check + the adoption walkthrough runs clean |
| A3 ✅ | The §8.6 leaks (landed as ONE PR — they are one change, and per-fix ceremony is what the standing rule forbids): profile-supplied strength label; `laneStepForTestClass` → profile, `determinism.mjs` → the lint; `?? "e2e"`; the Compose default surface; the false "no Kotlin test source directory"; the pre-manifest "no spec files" lie. | agnostic-lint grows a module per PR; fleet L2 |
| A4 ✅ | Bring the fuelled-api profile in as a **second profile in the suite** (as a conformance fixture — it belongs in neither `template/` nor the shipped profiles). | every seam test and the agnostic lint now run against two stacks |
| A5 | **Cold re-run:** a fresh agent authors a profile from `harness init` output + README only, forbidden from opening core source. | **This is Stage 0's exit measurement.** |

### Phase B — claim the name
O1 is decided (`prooflane`, §5). Confirm the `@prooflane` scope is claimable, then claim
`prooflane`, `@prooflane` and `create-ktor`. Blocks everything below.

### Phase C — the split
`@prooflane/harness` (core only) → `profile-cmp` (golden tree moves in) → `studio-cmp` →
`@prooflane/cli` → `create-cmp-cli` becomes a shim. `studio-cmp` is sequenced LAST inside Phase C
but must land **before Stage 0.5 opens** — it is not allowed to slip into the next stage. The
receipt format rename lands here, because this is the first moment the new name exists. Vendoring becomes a derived, checked copy
rather than a coincidence.

### Phase D — the second scaffolder
`profile-ktor` gains a golden tree; `create-ktor` shim; the §4 gate goes into CI covering
both profiles.

### Phase E — resolution
The four-step resolver, fetch bounded to `init` and `new`.

**Ordering is not negotiable in one respect: A before C.** Splitting packages first means
carefully refactoring code that still contains every bug in the adoption report, and drawing
a package boundary before there is a second profile to draw it against.

---

## 8. What changes in NORTH-STAR

NORTH-STAR is the governing document, so it moves as part of this work, not after it.

- **§3, product table.** "create-cmp — … Also the on-ramp: `attach` for existing Compose
  repos" stops being true when the CLI owns `init`. The on-ramp is the CLI's.
- **§3.** Stack Profiles gain a golden tree and become a distributable artifact, not only a
  vendored directory.
- **§9, stages.** Distribution work moves earlier; part of Stage 2 (profiles as artifacts) is
  reachable from Stage 1's resolver.
- **§9, Stage 0 exit.** The de-fork count against the blueprint is retired. The blueprint is
  a separate track and is not re-vendoring until this work is finished. The replacement is
  A5: *a profile authored from `harness init` output and the README, without opening core
  source.*
- **§11, O1.** Moves from open to **blocking**.

---

## 9. Risks, and what would make this wrong

**The split could ossify one stack's shape into the package boundary.** Mitigated by A4:
two profiles exist in the suite before any boundary is drawn.

**Five packages is more release surface than one.** Real cost, accepted deliberately: the
alternative is a Ktor team installing a Compose scaffolder, which is the defect this fixes.
Independent versioning of `@prooflane/harness` is what makes `harness.version` on a receipt mean
something, and that field is load-bearing for Gatekeeper.

**A golden tree per profile is a maintenance burden that grows linearly with stacks.** The §4
gate makes it self-policing, but it is honest to say that profile four costs a template
somebody keeps green.

**This would be wrong if** most adoption turns out to be greenfield rather than existing
repos. Then the scaffolder really is the entrance and the profile really should ride inside
it. The evidence today points the other way — one data point, fuelled-api, an existing repo
that needed no tree — and one data point is not many. Revisit at profile four.

---

## 10. Decisions

All eleven decisions below were settled in one grill (`skills/grill-me`) on 2026-09-04, on the
evidence of the fuelled-api adoption report. They are closed: a change of mind is a **named
reopening**, never a fresh question.

### Taken 2026-09-04

| # | Decision |
|---|---|
| D1 | A new `harness init [--profile <id>]` verb. `attach` stays the Compose advisor and is not widened; its own header says it does not write a lane. |
| D2 | The generated profile skeleton is normative; a short protocol doc covers only the five required exports. Exit criterion becomes "authored from init output + README, without opening core source". |
| D3 | The receipt format is renamed now, reader accepting both: neutral `$id`, `schema` becomes an enum accepting `cmp-evidence/1` and the new name, writers emit the new one. |
| D4 | The strength label is profile-supplied. The core prints what it is handed and prints nothing when handed nothing — never `desktop-only`. |
| D5 | `laneStepForTestClass` moves to the profile; `compareOutcomes` stays in core taking an attribution function; `determinism.mjs` joins the agnostic lint. |
| D6 | The profile is the unit of distribution; a scaffolder is a consumer of a profile (§2). |
| D7 | **One repo, real npm workspaces** — not separate repos. The §4 golden-tree gate is a loop in one repo and a cross-repo CI problem in many. Polyrepo earns its cost only when different people own different packages, and an external profile author is external by definition. |
| D8 | **The name is `prooflane`** (§5). `create-cmp` is permanently lost and nothing is designed around it; `cmp` becomes one scaffold among many. |
| D9 | **`profile-cmp` takes the app tree, not `template/qa`.** The vendored harness copy stops being stored and is written by `harness init` from `@prooflane/harness` at stamp time — which retires §1's two-copies-nothing-checks problem as a side effect. |
| D10 | **Independent semver per package**, with the profile's `protocol` export carrying compatibility. Lockstep would make `harness.version` a synonym for the CLI's release number, which is the decoration being fixed. |
| D11 | **`studio-cmp` is a separate package**, sequenced last inside Phase C and landing **before Stage 0.5 opens**. If the provider interface proves premature it folds back into `profile-cmp` without having blocked anything. |

| D12 | **Phase A ends in a `0.25.0` publish under the current name.** Measured 2026-09-04: `create-cmp-cli` took 1,844 downloads in a month and `@create-cmp/harness` 265 — discounting CI and crawlers, the scoped package is hard to explain as noise, so real adopters are walking into the entrance defects now. The rename churn is bounded and half-designed for already (D3's reader accepts both names; `create-cmp-cli` stays published as a deprecated shim). The dead end's cost is not bounded. |

### Open

Nothing. Every question this plan rests on is settled above.

---
