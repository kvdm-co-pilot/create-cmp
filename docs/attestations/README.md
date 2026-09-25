# Attestations — the part of the evidence a program may not derive

`stage2-external-profile.json` is the one file in this repository that a human writes and an
agent may not. `scripts/stage2-gate.mjs:13-17` says so about itself — *"A human writes that
file; this gate may not"* — and `:226` repeats it: *"The one thing it reads out of the repo
that a human owns is the attestation, and it never writes that."* Criterion A is a
**provenance** question, and no program run inside this repository can establish who wrote a
file. An agent filling those fields would manufacture exactly the evidence the criterion
exists to demand.

So the file was written with every derivable field filled from a measurement and the fields
that carry a human's claim **empty on purpose**, and the gate read it and reported NOT MET.
That refusal was the design working, not a defect.

**Karel signed it on 2026-09-18** (21e723f): criterion A passes on the attestation, criterion B
is reached and passes on `fuelled-api-receipt.json`, and Stage 2 exited. What follows is the
brief he signed against, kept as it was written that morning (9728527); what his signature says about
independence is in the attestation's own `authoredBy.relationship`, not here.

## What Karel is being asked to attest

One sentence: **that `fuelled-api`'s profile was authored outside this project, by a named
party a reader could go and ask.** Everything else on the criterion is already measured and
recorded below.

**And the thing to be clear-eyed about first: the profile is Karel's own, written in another
of his own repositories.** So what is on offer is an attestation that a person signs about a
file that same person wrote. `docs/proposals/FIRST-ADOPTION.md` §1 calls this exactly what it
is — *"a **real** first adoption and a **weak** independence claim"* — and says the strongest
honest version *"names Karel as both author and attester and lets a reader judge the
distance."* That distance is short. Nothing here should be read as a reason to sign;
FIRST-ADOPTION §7 step 4 makes declining an outcome of equal standing — *"writes the
attestation, **or declines to and says why**"* — and a recorded refusal with its reason is a
better artifact than a signature someone was talked into.

**The four fields, worded by the gate rather than paraphrased.** `node scripts/stage2-gate.mjs`
prints these as criterion A's problems, and this list is the whole of what is left:

1. `attestedBy.name is missing — an attestation nobody signed is a note`
2. `date must be YYYY-MM-DD`
3. `authoredBy.organisation is missing`
4. `authoredBy.contact is missing — an unfalsifiable claim is not evidence`

Three more fields are in the shape and checked by nothing: `attestedBy.role`,
`authoredBy.team`, and `authoredBy.relationship`. **`relationship` is the one that matters
most and the one no program will ever ask for** — it is where the same-author distance above
gets written down. FIRST-ADOPTION §6: it *"is where the same-owner thinness gets stated, not
hidden."*

## What is already proven, by running it rather than asserting it

Measured in `/Users/test/dev/fuelled-api` on 2026-09-17 (nothing there was committed):

- **The profile is not one of ours.** `profile.id` is `fuelled-api`; the ids this repository
  authors are `cmp` (shipped) and `ktor-backend`, `py-alien` (fixtures). The one shortcut
  criterion A can check — attesting a profile from our own tree — is not taken.
- **Who wrote it — including the part that complicates the claim.** The pack's header reads
  *"Written from the contract … not derived from another profile."* Its three commits are
  `2026-09-04 the fuelled-api stack profile, authored from the contract`, `2026-09-04 the
  profile's Rule 0 plants`, and `2026-09-09 … port the profile to protocol 2`. All three name
  `Karel van der Merwe <karelvdmmisc@gmail.com>` as author — **and all three also carry
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.** That trailer is the first thing
  to weigh, because §9's bar is specifically *"Our own agents authoring one no longer counts —
  two have"*, and nothing in this repository reads that trailer or can decide what it means
  here. It is not the same as `pantry-api`, whose header declares agent authorship outright;
  it is also not the clean human authorship the first draft of this document claimed before a
  reviewer checked the trailers. **Whether a co-authored profile clears §9's bar is an open
  question for the signer, and it is the reason this bullet reports rather than concludes.**
  Separately, the protocol port moved the handshake and the pack's version without rewriting
  the authorship into something notional — the failure FIRST-ADOPTION §7.1 said to watch for.
- **It was adopted, not copied.** `qa/harness-source.json` records
  `prooflane-harness 0.21.1`, `"source": "registry"` — the provenance ADR-0008 asks for.
- **The pack carries its own version.** `pack.version` is `0.1.0`, not the harness's borrowed
  `0.19.0` that made an `L2` from this pack indistinguishable from any other pack's.
- **The lane returns, and its instrument is calibrated.** `node qa/verify.mjs` → PASS,
  `mode: "full"`, rung **L1**, at commit `89a0a4e` with a clean tree (`unitTests` 15974 ms —
  a real run, not a replayed cache). `node qa/framework-check.mjs` → PASS, exit 0: five
  plants, each refused **by name** — `specCoverage` failing on `LOG-01`, `LOG-99` and
  `LOG-98`, `harnessIntegrity` failing on `qa/verified-surface.json` and on `modified` — plus
  the badge floor (its ladder grades L1 with plants and nothing without them), and
  `revert → PASS`. A lane nobody has watched refuse is a lane nobody has seen.
- **Criterion B's half already holds.** The vendored predicate a notary would run,
  `checkLaneVouching` from `packages/harness/src/lib/receipt-validate.mjs`, returns
  `ok: true` — *"lane vouched for itself (harnessIntegrity PASS, no failing rows)"* — over
  `fuelled-api-receipt.json`, whose `verdict` is `PASS` and whose `pack.id` is `fuelled-api`.
  The gate will print B as *"not reached"* until A passes, because B is sequenced behind A;
  its inputs are verified and waiting. The inputs-hash half is deliberately not checked — a
  notary recomputes that from their own tarball, and we do not have it.
- **Those four fields are the entire remaining distance — derived, not assumed.** Because B is
  sequenced behind A, neither B nor the stage's own total can be read out of the gate's
  printed output while A is red. They can still be derived without writing anything into the
  file an agent may not write: apply a signature's values to an **in-memory** copy of the
  record, and `attestationProblems` returns an empty list, after which criterion B answers on
  the vendored receipt with `vouch: true`, `verdict: PASS`, and a `pack.id` equal to
  `profile.id` — green. So the signature is the whole of what is left, and a completed one
  closes both unmet rows rather than only the first.

  What the same derivation shows about the gate's limits: it accepts any non-empty string as
  an organisation and a signatory, exactly as its own caveat says it must — *"this gate
  checked the document, not the people."* Nothing in this repository stands between a false
  attestation and a green stage except the judgement of whoever signs, which is why this file
  is one person's to write and no agent's.

## What signing would claim, and what it would not

**Would claim:** that a profile this project does not ship, for a Kotlin/Ktor/Gradle/Postgres
stack this project never shaped, was authored in that repo by the named party, and that its
lane mints a receipt the vendored predicate accepts.

**Would not claim — and the attestation should not be read as claiming:**

1. **Independence.** The author and the attester are the same person — and every commit of the
   profile also carries `Co-Authored-By: Claude Opus 5`, so the author is not purely a human
   either. FIRST-ADOPTION §1 calls this *"a **real** first adoption and a **weak** independence
   claim"*, and says the honest version *"names Karel as both author and attester and lets a
   reader judge the distance."* That distance is short in both directions, and the file should
   say so rather than dress it up. `authoredBy.relationship` is the field where it gets said.
2. **That the named party exists.** The gate prints this caveat itself: *"this gate checked
   the document, not the people."* Nothing in this repository can check otherwise.
3. **That the stack's user-visible surface was proven.** The receipt is **L1 — proven on the
   host**. `integrationTests` SKIPped for want of a container runtime (no `docker` on this
   machine), and the lane volunteered that this tier *"skipped in all 4 recorded full runs —
   a promise that only this tier could observe has never been checked here."* L2 on this pack
   means *proven against a real database*, and it has not been reached anywhere yet.
4. **That a reader can reach the artifact.** `fuelled-api` has **no git remote**;
   `artifact.location` is therefore an absolute path on one machine, and `artifact.kind` is
   `"path"` rather than `"repo"` for that reason. A claim a reader cannot go and check is
   weaker than criterion A is reaching for. Pushing that repo somewhere reachable and
   replacing `location` with its URL is the cheapest available strengthening — worth doing
   before signing rather than after.

## What is deliberately not here

No agent-written signature, and no second candidate. `pantry-api` ships the richer pack and
is **not** the candidate: its own header reads *"AUTHORED BY AN AGENT, 2026-09-09, under
ADR-0013"*, and `scripts/stage2-gate.mjs:3-6` quotes §9 — *"Our own agents authoring one no
longer counts — two have."* Richness is an acceptance signal; criterion A is a provenance
question, and on provenance `pantry-api` has nothing to offer.
