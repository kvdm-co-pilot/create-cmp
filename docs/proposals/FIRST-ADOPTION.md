# The first external adoption — payment-blueprint, prepared

- **Status:** preparation only — nothing in `payment-blueprint` has been touched, by decision
  (Karel, 2026-09-09: *"just prep payment blueprint it will be a few more days in dev"*).
  **SUPERSEDED IN ORDER, 2026-09-09:** `fuelled-api` goes first (Karel, in session:
  *"fuelled-api first yes"*). It already carries a hand-written profile with real plants for a
  stack this project never shaped, and it needs no product decision about a foreign `qa/` before
  work can start. payment-blueprint remains the runbook's subject and becomes the **second**
  adoption; everything below still applies to it, and §3's occupied-`qa/` unknown is now first
  answered in `fuelled-api`.
- **What this is:** the runbook for adopting `prooflane` in a repo this project does not own the
  code of, and the honest account of which parts an agent may do and which are Karel's alone.
- **What this is not:** an attestation. `docs/attestations/stage2-external-profile.json` is not
  written here and must never be written by an agent — see §6.

## 1. Why payment-blueprint counts, and the part that is genuinely thin

Stage 2's trigger is *"a genuinely external adopter, or the pinned port-demand issue"*, and criterion
A asks for **a profile authored OUTSIDE this project**. payment-blueprint qualifies on the axis that
matters to the gate and is thin on another, and both should be said plainly:

**It qualifies because** the profile would be authored *in that repo*, against the **published**
package from the registry, by whoever works in that tree — describing a stack this project has never
seen. The gate's checkable refusal is that the attested profile id must not be one this repo ships
nor a fixture under `test/fixtures/profiles/`; a payment-blueprint profile is neither. That is the
one shortcut the gate can close, and adopting there does not take it.

**It is thin because** the author is the same human. The gate says so about itself — *"nothing inside
this repository can check that a person exists"* — and what it asks for instead is a claim a reader
can falsify: a named organisation, a named contact, where the artifact lives, and a human who signed
for it. A same-owner adoption is a **real** first adoption and a **weak** independence claim, and the
attestation should say which it is rather than dressing one as the other. The strongest honest
version names Karel as both author and attester and lets a reader judge the distance.

## 2. What an agent may do there, and what it may not

| may | may not |
|---|---|
| install `prooflane` from the registry on a branch | merge that branch |
| author `qa/lib/profiles/<id>/index.mjs` in that tree | write the attestation |
| run the lane and `framework-check` there | claim independence it does not have |

Karel's answer on 2026-09-09 was **"Not yet — prepare only"**, so today none of the left column has
happened either. This document is the whole of the work so far.

## 3. It is a MIGRATION, not a greenfield install — checked, not assumed

Read-only inspection of `payment-blueprint` on 2026-09-09 (nothing written):

```
qa/harness-source.json     absent          -> not a prooflane installation
qa/lib/profiles/           absent          -> no profile of any kind
qa/harness-manifest.json   present, but a DIFFERENT shape:
  { "receipt": "qa/evidence/receipt.json", "architectureDoc": "ARCHITECTURE.md",
    "specs": "specs", "citationRoots": ["backend", "qa/test"], "packs": ["blueprint"] }
```

So that repo already has a `qa/` directory, its own manifest conventions, and a pack it calls
`blueprint`. This is **better** for the adoption claim and **harder** for the install:

- **Better**, because the stack and its conventions genuinely predate this project and were not
  shaped by it. That is closer to what criterion A is reaching for than a greenfield repo would be.
- **Harder**, because `prooflane init` writes into `qa/` and there is already something there.
  Nothing has been run to find out how it behaves against an occupied `qa/`; assume it needs a
  `--target-dir`, a migration of the existing manifest, or a deliberate merge, and **find out on a
  branch** rather than in place.

The first real task, then, is not "install" — it is deciding whether the existing `qa/` is replaced,
merged, or left beside a prooflane lane, and that is a product decision about payment-blueprint, not
a mechanical step.

## 4. The install, when the time comes

The front door is proved and needs no local checkout of this repo:

```bash
npm init -y                      # if the repo has no package.json
npm i -D prooflane --prefer-online
./node_modules/.bin/prooflane init
git add -A && git commit -m "install the verify lane"
node qa/framework-check.mjs      # Rule 0 — it must refuse, then recover
```

`prooflane init` detects the language, seeds a grammar, and writes `qa/harness-source.json` recording
`"source": "registry"` — which is the provenance ADR-0008 wants and the thing that makes this an
adoption rather than a copy. A lane you have not seen refuse is a lane you have not seen: the
`framework-check` step is not optional.

## 5. Authoring the profile — what the protocol actually requires

A profile is data the core resolves, not code that reaches into the core. Minimum surface (protocol
2, `packages/harness/src/lib/profile-loader.mjs`):

- `id` and `protocol` — identity, never inherited
- `grammar` — **required, no fallback**; how this stack's citations bind
- `layout` — where sources, specs and tests live, with `layout.ignore` honouring `.gitignore`
- `steps` — the lane's steps per tier
- `ladder` — what each rung means **for this pack**, since an `L2` here and an `L2` under `cmp` are
  different claims (§8.9)
- `plants` — the failures Rule 0 plants and expects to be refused **by name**

`extends` is available (ADR-0012) if the stack is close to an existing base, and inheritance is
resolved by the core from a declared base id — never by importing a base module, which the gate
explicitly refuses as a false green.

**The badge floor is the trap worth naming in advance:** a profile that ships **no plants earns no
rung**. A lane can be green over a plantless profile and record nothing, and that is deliberate — the
rung is a claim about a calibrated instrument, not about a quiet run.

## 6. The attestation — Karel's, and only Karel's

`docs/attestations/stage2-external-profile.json`, shape fixed by `scripts/stage2-gate.mjs`:

```json
{
  "schema": "prooflane-attestation/1",
  "claim": "stage2-external-profile",
  "date": "…",
  "attestedBy": { "name": "…", "role": "…" },
  "profile":    { "id": "…" },
  "authoredBy": { "organisation": "…", "team": "…", "contact": "…",
                  "relationship": "how they came to write it" },
  "artifact":   { "kind": "repo|tarball|path", "location": "…" },
  "receipt":    "docs/attestations/<id>-receipt.json"
}
```

**An agent must never write this file.** It is a human's signature that a named party outside this
project authored the profile; an agent writing it manufactures the evidence the criterion exists to
demand, and the gate reporting *"cannot derive"* is the gate being right rather than incomplete.
`relationship` is where the same-owner thinness from §1 gets stated, not hidden.

Criterion **B** then checks the receipt with the half a notary can run without the tree:
`checkLaneVouching` over the rows, a PASS verdict, and `pack.id` equal to the attested profile id.
The inputs-hash half is deliberately **not** checked — a notary recomputes that from their own
tarball, and we do not have it.

## 7. Order of work

Re-ordered 2026-09-09. Three repos, in this order, and **the first two are treated differently on
purpose** — see §7.1, which is the part a reader is most likely to undo by accident.

1. **`fuelled-api` — PORT the existing profile.** Branch; install from the registry so the tree
   carries `qa/harness-source.json`; port the hand-written profile from protocol 1 to 2; give the
   pack its **own** version in place of the borrowed `0.19.0`; run the lane until it earns a rung on
   a fresh receipt. `framework-check` must refuse and recover.
2. **`pantry-api` — REGENERATE the profile with the agent.** Same install, but the profile is
   authored by the agent under ADR-0013 rather than ported. This is the first real exercise of that
   decision's central claim.
3. **`payment-blueprint`** reaches a state worth verifying (its own call — *"a few more days in
   dev"*), then §3's replace/merge/beside decision, then install and author.
4. Karel reads whichever profile he means to stand behind and writes the attestation, or declines to
   and says why.
5. `node scripts/stage2-gate.mjs` here — 8/10 becomes 10/10, or names what is still missing.

Step 4 is a gate no amount of engineering removes, and it is the point.

### 7.1 Why `fuelled-api` is ported and `pantry-api` is regenerated

**Decision — Karel, 2026-09-09, in session:** *"split the difference port fuelled-api, regenerate
pantry-api"*.

ADR-0013 says agents author profiles, and read alone it invites regenerating every profile it meets.
That would be a mistake here, and the reason is worth stating where the work happens rather than only
in the ADR:

- **`fuelled-api`'s profile is an asset, not just a file.** A human wrote those 310 lines, in that
  repo, for a stack this codebase never shaped — which is exactly what Stage 2 criterion A measures.
  Regenerating it moves authorship to an agent driven from inside `create-cmp`. That would not make
  an attestation false — `authoredBy.relationship` exists to say such things plainly — but it would
  spend the strongest independence claim available in order to exercise a code path. So it is ported:
  protocol and versioning move, authorship does not.
- **`pantry-api` is where the claim gets tested.** ADR-0013 rests on an agent being able to author a
  correct profile into an occupied tree, and a decision that is never exercised is a decision that is
  merely assumed. Its Python profile is spent deliberately, so the claim meets evidence early and in
  a repo where being wrong is cheap.

The two together give both things: an independence claim with human authorship intact, and a real
first run of agent authorship. Neither would be had by treating both repos the same way.

**What would make this wrong:** if the ported `fuelled-api` profile turns out to need so much
rewriting to reach protocol 2 that the human authorship is notional by the end. If that happens, say
so in the attestation's `relationship` rather than continuing to claim a provenance the file no
longer has.

## 8. What this changes in this repo today

Nothing executable. This is a plan, and the road's own count is unmoved: Stage 2 stays **8/10** until
a real profile and a real signature exist. Recording the plan is not progress against the gate, and
the gate will keep saying so.

## 9. `fleet.json` — WRITTEN 2026-09-09, and what changed

> **This section's verdict reversed on 2026-09-09, and the reason it reversed is the point.** It
> argued that a manifest naming repos which carry no lane would turn criterion A green by declaring
> something C then refuses — buying a green criterion with a declaration that is not yet true. That
> reasoning was correct and it still is. What changed is the fact under it: `fuelled-api` and
> `pantry-api` now carry real lanes with `"source": "registry"` provenance, so a manifest naming
> them is **true**. The manifest was written, and the gate moved from 7/7 unmet to 3/7 — with A, B,
> C and F green **because the declaration is accurate**, not because the bar moved to meet it.
>
> The bar did also move, separately and deliberately: Karel lowered §9's count from ten repos to two
> (*"2 is enought for this phase"*, 2026-09-09). That is recorded in `docs/NORTH-STAR.md` because
> the count is read out of the road rather than kept as a constant — lowering it means editing the
> road, in public, which is the design working as intended.
>
> **What stays red is worth reading**: D and E want ONE command that upgrades the whole fleet, and
> `upgrade --fleet` exits 2 — it does not exist. G wants rungs compared within a pack, and a
> two-repo fleet holding two different packs has nothing to compare; the gate calls that *"a red,
> not a vacuous green"*, which is the correct refusal. Converging `create-cmp-showcase` and
> `brat-o-meter` — both `cmp` — is what would give G something real to say.

### The original reasoning, kept because it was right

Karel asked (2026-09-09) for the fleet manifest to be declared as plumbing, explicitly accepting it
would not exit Stage 3. Checked against the gate and against the tree, **there is nothing true to
declare yet**, so it is not written:

| repo | carries a prooflane lane? |
|---|---|
| `create-cmp` | **no** — it *ships* `template/qa`; it has no `qa/` of its own |
| `payment-blueprint` | **no** — its `qa/` is a different system (§3) |
| `fuelled-api` | **a copy, not an adoption** — real profile + plants, but vendored from a local `template/qa` at 0.19.0; no `qa/harness-source.json` |
| `pantry-api` | **a copy** — own Python profile, harness 0.19.0, same missing provenance |
| `create-cmp-showcase` | **a copy** — lane at 0.21.0, no profile of its own |
| `brat-o-meter` | **a copy, and RED** — harness 0.14.1, last receipt FAIL |

**Corrected 2026-09-09.** The first version of this table listed two repos and concluded no repo
carries a lane. Four more do, and the conclusion survives for a sharper reason than the one first
given: by ADR-0008's provenance test, a tree with no `qa/harness-source.json` was **copied**, not
adopted. Four copies at four harness versions are not a fleet — they are the convergence corpus
ADR-0013 names. The manifest becomes writable when one of them carries `"source": "registry"`.

`scripts/stage3-gate.mjs` criterion A wants *"a manifest the human wrote names each repo"*, and C
wants *"every repo carries a lane its own lock describes"*. A manifest naming these two would turn A
green by naming repos that C then refuses — buying a green criterion with a declaration that is not
yet true. The gate already refuses an absent manifest rather than counting it as a fleet of none, and
that refusal is currently the **accurate** report.

So Stage 3 stays 0/7 and keeps saying why. The manifest becomes writable the moment one repo actually
carries a lane — which is step 2 of §7, not a separate piece of work. This is the one instruction in
this session's plan that was not carried out as literally stated, and the reason is recorded here
rather than resolved by writing the file anyway.
