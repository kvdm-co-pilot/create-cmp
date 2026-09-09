# ADR-0010: An intact region must contain engine code — the vacuous self-vouch has a floor

- **Status:** accepted — 2026-09-09, Karel van der Merwe (signed by his instruction in session — "get fixes for these as the product owner, have them fixed"; drafted by the architect)
- **Implementation:** landed with this ADR — `isEngineModule` and `engineFiles` (`harness-region.mjs`), `vacuous` on the integrity result and the refusal in `describeIntegrity` (`harness-lock.mjs`, the reachable half), a FAIL in the vouching step (`profiles/cmp/steps-cmp.mjs`, correct and currently unreachable), and an out-of-tree kept plant in `packages/harness/src/framework-check.mjs` that watches the sentence a human reads.
- **Date:** 2026-09-09

## Context

ADR-0008 named this hole and deliberately did not close it: *"A named, unfixed hole: an empty region
reads `intact`. The probe above is a vacuous self-vouch, and it is not a missing `status` value — it
is a missing floor (a region with no engine file is not an intact lane). It is a gate, so it needs a
kept plant and a measured cost (§8.8) and it is not smuggled into this ADR."*

The probe still reproduces, and the provenance record that same ADR introduced made it one file
worse. Measured 2026-09-09 on a scratch tree holding two declarations and `qa/harness-source.json`
and nothing else:

```
region files: [qa/harness-manifest.json, qa/harness-source.json, qa/verified-surface.json]
status: intact | fileCount: 3
```

Three files, zero of them engine code, and the lane's own self-vouching step reports PASS.

**The question that decides where the floor goes: who can actually SEE this state?** The first answer
drafted here was wrong, and correcting it moved the fix, so it is recorded rather than quietly
replaced.

The draft said the floor fires when a lane runs *from outside the region* — `node
node_modules/prooflane-harness/src/verify.mjs` over a project whose `qa/` holds only declarations.
**That mode cannot occur.** `verify.mjs` and `receipt-check.mjs` both derive their root from their
own file location (`path.resolve(HERE, "..")`), so a lane always attests the tree it lives in, and
its own module is always in that tree's region. A running lane can never observe a vacuous region.

What can, and does today, is **every caller that checks a tree it does not live in**:

- `create-cmp upgrade --harness` and `harden` print
  `describeIntegrity(checkHarnessIntegrity(projectDir))` over an arbitrary project directory;
- `prooflane upgrade` reads the adopter's root;
- a hosted checker reads a repo it fetched;
- ADR-0008's own probe, which is how the hole was found.

For all of them the result renders as `"prooflane-harness 0.20.0 (region 8f3a…) — 3 files verified"`
over a lane containing no lane. That sentence is the defect: not a missing gate somewhere deep, but
a **false statement in the shared voice every caller speaks with**.

## Decision

> **An `intact` region must contain engine code.** `checkHarnessIntegrity` reports `engineFiles` —
> region members that are machine-owned modules, excluding the declarations, the generated
> provenance record and the adopter's own profile. A region with **zero** is VACUOUS, and the step
> that vouches for the lane FAILs on it, naming what it found. Nothing else changes.

**It is not a fourth `status` value**, for the reason ADR-0008 gave when refusing one for provenance:
`intact | modified | unlocked` answers a single question — *is my lane unmodified since it was
installed* — and vacuity is a different question. A region of three declarations genuinely is
unmodified since it was locked. It is simply not a lane. Making one field answer two questions is the
failure mode this project refuses everywhere else.

**`describeIntegrity` is where the fix lands, because it is the reachable one.** It is the single
sentence `upgrade --harness`, `harden`, `prooflane upgrade` and any hosted checker render, and it now
refuses to say "N files verified" about a region with no engine in it. The vouching step FAILs on the
same flag — that is the correct verdict, and it is honestly **unreachable through today's entry
points**, since a lane derives its root from its own location. It is kept anyway because it costs ten
lines and becomes reachable the moment any caller passes a foreign root (a `--root` flag, a hosted
runner reusing the step), and a gate that is right and unreachable is cheaper than one that has to be
remembered later.

**The receipt carries `engineFiles`, and no predicate refuses on it.** The integrity result is
already attached whole to the step row (`steps-cmp.mjs::stepHarnessIntegrity`, `harness: r`), so the
count reaches the receipt additively, absent meaning unrecorded exactly as `harness.source` does. A
notary comparing two lanes should be able to see one that held nothing. But nothing gates on it
remotely, and that is deliberate: a forger who can write the field can write any number in it. A
remote check over a self-reported count would be mechanism that looks like a gate and is not — worse
than no check, because it would be quoted as one.

**The kept plant is OUT-OF-TREE, and the exception is bounded by its reason.** §8.8 requires a plant
watched failing by name. Every other plant edits live content in the real tree, on the argument that
*"planting garbage proves a gate rejects garbage; editing something live proves it was READING"*.
This gate cannot be planted that way: its violation is the absence of the engine, so planting it in
the tree deletes the instrument mid-run — the lane would fail to START rather than fail by name, and
the plant would prove nothing. So `framework-check` builds the region in a scratch directory, locks
it, watches the refusal name the vacuity, and reports its cost beside every other plant.

The exception is granted for one reason and holds only while that reason does: **this is the only
gate whose violation removes the instrument that would observe it.** Any future gate wanting an
out-of-tree plant must show the same property, not cite this precedent.

## Consequences

- **No existing lane changes verdict.** Every tree that can run the lane has engine files in its
  region by construction, so the floor is unreachable there. Nothing is re-earned, no receipt is
  invalidated, and no adopter re-runs anything.
- **Four commands stop making a false statement.** `upgrade --harness`, `harden`, `prooflane upgrade`
  and any hosted checker rendered "N files verified" over a region with no engine code; they now say
  it is not a lane. That is the whole reachable value of this ADR, and it is worth more than the
  unreachable step branch beside it.
- **`engineFiles` is one more additive receipt field**, against §8.8's presumption. What it buys is
  that a reader can tell a lane that vouched for itself from one that had nothing to vouch with —
  a distinction that was, until now, invisible on every receipt ever written.
- **The plant costs a scratch directory and a lock, not a lane run**, so `framework-check`'s bound is
  unaffected: measured in single-digit milliseconds against the ~200 ms of a planted lane direction.
  It watches `describeIntegrity` — the sentence a human reads — rather than the boolean, because a
  flag nobody prints is a gate nobody sees.
- **The floor counts modules, so a region could still be thin without being empty.** One engine file
  passes it. A minimum above one would be a number nobody can derive, and this ADR declines to invent
  one: the claim being made is "this region contains the engine", not "this region contains enough
  of it".

## Alternatives considered

- **A fourth `status` value, `vacuous`.** Rejected for ADR-0008's own reason: `status` answers one
  question and this is a different one. The step's verdict is where a refusal belongs.
- **Refuse in `checkLaneVouching` as well, on the reported count.** Rejected: it reads as a remote
  gate and is not one. The count is self-reported by the same lane whose honesty is in question, so a
  forger writes whatever passes. Offering it as a check would be the overclaim §3 forbids.
- **An in-tree plant that deletes the engine and restores it.** Rejected: it cannot work. The
  instrument runs from the files it would delete, so the run does not fail by name — it fails to
  start, which proves the tree was broken, not that the gate was reading. This is also what proved
  the draft rationale wrong: trying to build the plant is what showed the state was unobservable from
  inside a running lane at all.
- **Leave it open until a second profile exists.** Rejected: the hole is not profile-shaped. It is in
  the core's own integrity check, and every adopter of every stack inherits it.

## What would make this wrong

**A legitimate lane whose region holds no module.** If a stack's lane were ever expressed as
something other than `.mjs` under `qa/` — a compiled binary, a shell entry point — its region could
be honestly engine-free and this floor would refuse a working lane. Nothing in the tree tests that
boundary; every lane so far is JavaScript copied into `qa/`, which is the same assumption ADR-0008
recorded under its own "what would make this wrong". If that assumption breaks, both ADRs reopen
together.

## Related

- `docs/adr/0008-a-resolved-harness-is-still-a-vendored-one.md` — named this hole, measured the
  probe, and deferred it to exactly this ADR.
- `docs/NORTH-STAR.md` §8.8 (no new gate without a kept plant and a measured cost — the bar this
  meets and the exception it argues), §8.9 (strongest-true-case honesty), §9.2's defect list.
- `packages/harness/src/lib/harness-region.mjs` (what the region is and which members are engine),
  `harness-lock.mjs` (`checkHarnessIntegrity`), `profiles/cmp/steps-cmp.mjs` (the vouching step),
  `scripts/framework-check.mjs` (the kept plant).
