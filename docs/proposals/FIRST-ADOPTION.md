# The first external adoption — payment-blueprint, prepared

- **Status:** preparation only — nothing in `payment-blueprint` has been touched, by decision
  (Karel, 2026-09-09: *"just prep payment blueprint it will be a few more days in dev"*).
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

1. payment-blueprint reaches a state worth verifying (its own call — *"a few more days in dev"*).
2. Branch there; install from the registry; `framework-check` must refuse and recover.
3. Author the profile with its plants; run the lane; it earns a rung or it does not.
4. Karel reads it and writes the attestation, or declines to and says why.
5. `node scripts/stage2-gate.mjs` here — 8/10 becomes 10/10, or names what is still missing.

Step 4 is a gate no amount of engineering removes, and it is the point.

## 8. What this changes in this repo today

Nothing executable. This is a plan, and the road's own count is unmoved: Stage 2 stays **8/10** until
a real profile and a real signature exist. Recording the plan is not progress against the gate, and
the gate will keep saying so.

## 9. `fleet.json` — why it is NOT written here

Karel asked (2026-09-09) for the fleet manifest to be declared as plumbing, explicitly accepting it
would not exit Stage 3. Checked against the gate and against the tree, **there is nothing true to
declare yet**, so it is not written:

| repo | carries a prooflane lane? |
|---|---|
| `create-cmp` | **no** — it *ships* `template/qa`; it has no `qa/` of its own |
| `payment-blueprint` | **no** — its `qa/` is a different system (§3) |

`scripts/stage3-gate.mjs` criterion A wants *"a manifest the human wrote names each repo"*, and C
wants *"every repo carries a lane its own lock describes"*. A manifest naming these two would turn A
green by naming repos that C then refuses — buying a green criterion with a declaration that is not
yet true. The gate already refuses an absent manifest rather than counting it as a fleet of none, and
that refusal is currently the **accurate** report.

So Stage 3 stays 0/7 and keeps saying why. The manifest becomes writable the moment one repo actually
carries a lane — which is step 2 of §7, not a separate piece of work. This is the one instruction in
this session's plan that was not carried out as literally stated, and the reason is recorded here
rather than resolved by writing the file anyway.
