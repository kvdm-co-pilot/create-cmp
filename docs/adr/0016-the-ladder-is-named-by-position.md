# ADR-0016 — The ladder is named by position, and the open question of its shape

**Status: ACCEPTED**, 2026-09-10.

Both halves are landed: the rename, and the reshape §4 asked for.

**How it was decided, stated plainly because it matters.** §4 was written PROPOSED with a
recommendation. Karel read that recommendation and answered *"you can work autonomously again …
You are the product owner and lead architect."* The reshape was then taken under that delegated
authority — not on his explicit word for this ADR. Anyone auditing this record should read the
decision as the architect's, made inside a standing grant, and weigh it accordingly. The
standing rule this bends is real: ADRs are otherwise accepted only on Karel's instruction in
chat, and if this one should not have been, it is the delegation that needs narrowing, not this
document that needs quietly amending.

**Date:** 2026-09-10
**Supersedes:** nothing. **Amends:** the open question left in `evidence-ladder.mjs`.

---

## 1. Context

The evidence ladder's runtime rungs were declared as `deviceExecution` and `release`. The core
read both. A profile for a stack with no such thing therefore declared a rung named after
hardware it does not have, and the receipt field beside it (`strength.onDeviceSteps`) could only
ever be empty.

That is not cosmetic. `AGNOSTIC-HARNESS-ARCHITECTURE.md` §4.2 lists the ladder as declaration #6
— *"rungs, names, what earns them — the definition of done"* — and NORTH-STAR **G3** asks whether
a team on another stack can declare theirs *in data* without forking a line of the core. A field
named after one stack's runtime fails that question at the name.

It also produced a measured defect. `test/fixtures/profiles/ktor-backend/index.mjs` records it:
the author of the second-stack profile, writing from the contract alone, declared
`release: ["distribution"]` — a list, like every sibling field. The grader reads that one field
as a single step *name*, so the list matched nothing and **L3 was silently unreachable**. A
refusal was added; the shape was left alone, and `evidence-ladder.mjs` recorded why:

> *Whether the ladder should be uniformly list-shaped is the open question, and it belongs in
> that ADR rather than in this fix.*

This is that ADR.

## 2. What the rungs actually mean

Settled with Karel on 2026-09-10, and confirmed against what the `cmp` profile already does
rather than against intuition:

| rung | what distinguishes it |
|---|---|
| **L0** | the artifact assembles |
| **L1** | the code is judged **without being run as the program** — compilation, tests against fakes and in-process calls, static analysis, and the shippable artifact *building* |
| **L2** | the artifact runs **as the program** — assembled, started the way it really starts, driven through its real entry surface |
| **L3** | the same, for the **shippable variant** rather than the development one |

Two axes, neither of them deployment:

- **L1 → L2 is library vs program.**
- **L2 → L3 is development variant vs shippable variant.**

`cmp` confirms both. Its L2 installs the debug artifact on a local runtime instance and drives
it; its L3 runs `assembleRelease` → `installRelease` → the same driver, **on the same local
instance** ([`steps-cmp.mjs`](../../packages/harness/src/lib/profiles/cmp/steps-cmp.mjs), and the
reason L3 exists at all is stated there: the shippable build runs optimisation and release-only
checks a green development build says nothing about).

**Every rung is local and pre-release.** Nothing on this ladder describes a deployment, and
nothing on it should. A receipt is bound to a tree; what a running environment is doing at a
moment cannot be re-derived from its bytes, so deployment confidence could never be hash-bound
the way a rung must be. It is a second kind of evidence, not a fifth rung — and §8.2's
comparability rule is what forbids mixing them on one scale.

## 3. Decision — taken and landed

**`deviceExecution` → `l2Execution`, `release` → `l3Execution`.** Named by position. A positional
name cannot become false when a profile's runtime is not the one the name assumed.

- `PROFILE_PROTOCOL` 2 → 3. The old spellings are **refused by name**, never read as a fallback:
  a profile still using them was written against a different meaning of the rung, and grading it
  anyway would put a rung on a tree whose author never answered the question the new name asks.
  The refusal names the field, the new field, and `prooflane upgrade`.
- The meaning lives in [`profile-contract.mjs`](../../packages/harness/src/lib/profile-contract.mjs),
  not in this document — one frozen object read by the loader (which refuses), the interview
  (which asks), and the author (who declares). A rule stated twice drifts in one.

**The shape landed second, and separately.** The rename shipped with `l3Execution` still a
string and the list-refusal intact, because a rename changes no grade anywhere while a reshape
changes several — §10's question 5, and the reason this document exists. §4 is what changed it.

One unbudgeted benefit, worth recording because it argues for positional naming generally:
`test/console-ladder.test.mjs` excluded `release` from its scan because the word collides with
ordinary English (a release date). `l3Execution` cannot collide, so the console lint now scans
**one more field than it could before**.

## 4. The shape — decided: a list, like every sibling field

**Question: should `l3Execution` become a list?** **Answer: yes.**

**For.** Every other graded field is a list. The seeded skeleton shows a list. A real author
reached for a list and was silently wrong. The refusal that catches it exists *only* because the
field is inconsistent — accept the list and the refusal, its test, and its plant all delete.
Uniformity means the shape can never again be the thing an author gets wrong.

**Against.** It changes what a receipt can claim. A profile currently declaring a list is refused
and cannot run, so no existing receipt moves — but a profile that would have been refused
becomes gradeable, and its L3 becomes reachable. That is a grade appearing where none was, which
is exactly the class §10 Q5 sends here.

**Decided for the list**, with `mode: "all"` — every named step must PASS, unlike L2's `any`,
because a shippable variant proven by some of its steps and skipped by the rest is not proven.
The only profiles the change can affect are ones that **could not run at all**; no tree that has
ever produced a receipt grades differently. Against that, the cost of keeping the asymmetry was
permanent: one field shaped unlike its siblings, guarded by a refusal, sitting in the
declaration an external author writes first and unaided.

**A lone string is still read as a list of one.** That is what makes this safe rather than
merely defensible: `evidence-level.mjs`'s `asList` normalises both shapes, so every existing
ladder grades exactly as before. Blank and non-string entries are dropped rather than carried —
a value that is not a step name can never be in the PASSed set, and keeping it inside an `all`
list would make the rung permanently unreachable, which is this defect re-entering by the back
door.

**Landed:** `evidence-level.mjs` reads both rungs through `asList`; the shape-refusal block is
deleted from `evidence-ladder.mjs`; its kept plant is replaced — not merely removed — by the
property that now holds, because a plant aimed at a deleted gate proves nothing; `cmp` declares
`l3Execution: ["releaseSmoke"]`; and the ktor-backend fixture is restored to what its author
originally wrote, which is now correct.

**Two corrections to this document, made after a review of the commits it describes.** Both are
recorded rather than edited away, because an ADR that quietly becomes true is worth less than
one that shows where it was wrong.

1. *"reads both rungs through `asList`"* **was false when written.** `rungFor` still read
   `l2Execution` raw; only `ladderStanding` normalised it. Two readers of one declaration then
   disagreed — the grader awarded L1 while the console drew an L2 the lane could never mint. It
   is true now, and the rule it cost is worth stating: **two readers of one declaration must
   normalise identically, or they are two declarations.**

2. *`asList` originally DROPPED* blank and non-string entries, on the reasoning that a value
   which is not a step name can never be PASSed anyway. That was wrong in one line:
   `l3Execution: ["ship", null]` dropped the `null`, found every surviving entry passed, and
   awarded L3 with a step the author had declared left unproven. `mode: "all"` exists precisely
   because proven-by-some is not proven, and a dropped entry is skipped under another name — the
   same declaration was **refused** before this ADR. `asList` normalises shape only now, and
   malformed entries are refused in `evidence-ladder.mjs`, derived from `GRADED_FIELDS` so a
   field added there is validated the day it is added.

## 5. Consequences

- A profile written for any stack declares its rungs in vocabulary that is true for it.
- An external profile on the old spelling is refused with the rename and the command, not with a
  confusing downstream failure.
- `strength.onDeviceSteps` in the **receipt** is untouched and still carries the old vocabulary.
  It is a published schema surface with external readers (`scripts/fleet-check.mjs` grades from
  it as a fallback; the MCP digest reads it), so renaming it is a `prooflane-evidence/2`
  conversation and deliberately not this slice's.
- `device` as a bare word is still permitted in the core. Banning it fails ten modules today;
  that sweep is its own slice, and adding the ban before it would mean growing an exception list
  that is asserted to only shrink.
