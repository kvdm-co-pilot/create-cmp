# ADR-0011: `pack` is load-bearing — the additive contract is retired, and a receipt that names no pack is refused

- **Status:** accepted — 2026-09-09, Karel van der Merwe (signed by his instruction in session — "get fixes for these as the product owner, have them fixed"; drafted by the architect)
- **Implementation:** landed with this ADR — `evaluateReceipt` refuses a receipt with no `pack.id`, `pack` joins the schema's `required` list, and `test/receipt-pack.test.mjs` records the retired contract rather than deleting it.
- **Date:** 2026-09-09

## Context

Two programs in this repository contradicted each other, both deliberately, and neither had ever been
run against the other's claim. The contradiction was found on 2026-09-09 by trying to close §9.2's
"`evaluateReceipt` never read `pack`" and recorded in that section (PR #97) rather than settled by
editing whichever came to hand.

**`scripts/stage2-gate.mjs`, criterion H** requires the vendored `evaluateReceipt` to REFUSE a
receipt that names no pack, with its reason stated in the gate: *"A field that no predicate reads is
a field an editor can delete, so 'Gatekeeper reads `pack`' means the vendored `evaluateReceipt` reads
it."* It asserts both directions over the same receipt and the same recompute, so the only difference
between the accepted and the refused call is the pack.

**`test/receipt-pack.test.mjs`** requires the opposite, and says why: *"Additive means two things must
both hold: a fresh receipt carries it, and a receipt that predates it still validates exactly as
before."* It asserts the reason is byte-identical with and without the field, and that the reason
does not mention pack — *"the validator does not know pack exists yet — by design"*.

Both were right when written. `pack` landed on 2026-09-04 (`f6363c1`), and while nothing depended on
it, additive was the correct and careful way to introduce it. What changed is that §8.9's
comparability rule now rests on it entirely — *"a `cmp` L2 and any other pack's L2 are different
claims"* — and §9.2 already lists three defects closed in service of that rule. A field the whole
rule rests on, that no predicate reads, is a field an editor deletes with no reader noticing.

**What the schema says today, which is a third position.** `pack` is not in the top-level `required`
list, so a receipt without it is schema-valid; but `pack.id` carries `minLength: 1`, so a receipt with
an empty one is not. Schema, gate and test have therefore been holding three different views of the
same field.

## Decision

> **`pack` is load-bearing, not additive.** `evaluateReceipt` refuses a receipt with no `pack`, or
> one whose `pack.id` is not a non-empty string, and names the remedy: **re-run the lane**. `pack`
> joins the schema's `required` list so the schema and the predicate stop disagreeing. The additive
> contract is retired, and `test/receipt-pack.test.mjs` records that it was retired rather than being
> quietly deleted.

**Criterion H wins, and the cost of it is small and known.** A pre-`pack` receipt is refused. Every
such receipt was written before 2026-09-04, and to be worth anything at all it must also be over a
tree that has not moved since — because a receipt stops attesting the moment a verified byte changes
(`receipt-validate.mjs`, ADR-0005). The remedy for the survivors is the one the binding check
directly above it already offers for the same class of staleness: *"receipt predates evidence
binding — re-run the lane"*. Seconds to minutes, once.

**The alternative was refusing only a MALFORMED pack, and it fails on the threat model.** The
predicate cannot tell "never had one" from "had one, and it was removed" — nothing in a receipt
records which. So accepting an absent pack accepts deletion, which is the exact attack criterion H
names. Of the two possible errors, accepting tampering is the one a predicate exists to prevent;
refusing a stale receipt whose remedy is a lane re-run is the one it can afford.

**This is not the ADR-0007 case, and the difference is the whole argument.** There, renaming the
format changed no assertion any receipt had ever made, so invalidating old receipts would have been
pure loss — *"the one thing a rename must not do"*. Here the old receipts are genuinely missing the
field that makes their rung mean something. They are not being punished for a label; they are being
asked for a claim they never made.

**`pack.version` is untouched.** ADR-0008 settled it as the profile's own or null, and null is a
legitimate value for a profile that declares none. Only `pack.id` is required to be present and
non-empty.

## Consequences

- **Every live adopter is unaffected.** The writer has emitted `pack` on every receipt since
  2026-09-04, so any lane run in the last five days produces a receipt this accepts. The refusal can
  only be met by a receipt older than that, over an unchanged tree.
- **Stage 2's criterion H goes green**, and it is the first of that gate's rows to close by
  implementing what it asked for rather than by finding a defect in what it measured.
- **The schema, the gate and the predicate now hold one position.** Three views of one field is the
  drift shape this repo hunts everywhere else; it had it in its own receipt contract.
- **`test/receipt-pack.test.mjs` keeps its history.** The retired assertions are rewritten as a
  record of what additive meant and why it ended, not removed. A contract that is deleted looks like
  a contract that never existed, and the next reader deserves to know a decision was taken.
- **One thing gets harder: reading an archived receipt.** Anyone holding evidence from before
  2026-09-04 can no longer validate it with the current predicate. That is the honest price, and it
  is why this needed a decision rather than an edit.

## Alternatives considered

- **Keep the additive contract; amend criterion H to refuse only a malformed pack.** Rejected: it
  leaves the deletion attack open forever, which is the thing H exists to close. The blank-id half
  alone catches a broken writer, not an editor.
- **Refuse an absent pack only for receipts whose `schema` names a version that postdates the
  field.** Rejected: `pack` and the `/1` format share a version, so the receipt carries nothing that
  dates it. Inventing a dating rule to preserve a handful of five-day-old receipts is more mechanism
  than the thing it protects.
- **Report an absent pack as "not comparable" while still validating.** Rejected as the worst of
  both: it neither refuses tampering nor keeps the contract, and it puts a second, softer verdict
  into a predicate whose whole value is that it answers one question.
- **Bump the receipt format to `/2` and require `pack` there.** Rejected: a version bump asserts the
  shape changed, and the shape did not — the field has been written for five days. It would also
  re-open ADR-0007's question for no gain.

## What would make this wrong

**An adopter with valuable archived evidence from before 2026-09-04.** None is known: the field is
five days old, the published CLI is 0.24.0, and no external adopter has been reported holding
receipts that old over unchanged trees. If one appears, the honest fix is a documented one-time
migration that re-runs the lane, never quietly accepting an unnamed pack again.

## Related

- `docs/NORTH-STAR.md` §8.9 (the comparability rule this field carries), §9.2 (where the
  contradiction is recorded, PR #97), §6.5.
- `scripts/stage2-gate.mjs` criterion H (the requirement), `test/receipt-pack.test.mjs` (the retired
  contract), `packages/receipts/src/receipt-validate.mjs` (the predicate),
  `packages/harness/evidence/schema.json` (the contract they must agree on).
- `docs/adr/0007-receipt-format-name-is-routing-metadata.md` — the case this deliberately is NOT:
  there a label moved and no assertion changed, so old receipts kept their meaning.
- `docs/adr/0008-a-resolved-harness-is-still-a-vendored-one.md` — `pack.version` is the profile's
  own or null, which this leaves untouched.
