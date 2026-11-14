# Quick check while a feature is in progress; the full lane once per feature

Status: **decided by Karel on 14 Nov 2026** (Consignly `docs/factory/build-loop.md`, LOOP-23 and
LOOP-30): small changes get "quick check only", and the full lane runs once per feature, where
the definition is "a full feature end 2 end". The mechanism below is the building agent's.

```json cmp:feature
{ "touches": [], "screens": false }
```

## The problem

The Stop hook (`qa/receipt-check.mjs --hook`) demanded the full lane — release builds, a web
build, an emulator; minutes — at the end of every turn that touched the tree. In-progress work
paid the done-gate's price on every stop, which is the opposite of the rule above.

## Decisions

**Q1. During a feature, a quick check lets a session stop — and says it is not done-evidence.**
When the strict answer is INVALID, the Stop hook also accepts a PASS quick receipt that attests
this exact tree: `node qa/verify.mjs --fast` (`qa/evidence/latest-fast.json`) or the
branch-scoped `--profile feature` run (`qa/evidence/latest-feature.json`). It ends the turn with
a `systemMessage` that says "QUICK CHECK … This is NOT done-evidence" and when the full lane is
owed. A smoke or nightly receipt is not a quick check of the change (smoke compiles nothing). With
no quick receipt, the refusal asks for `--fast` (seconds), not the lane. A full receipt, or its
approvals-only re-attest (`docs/features/approvals-reattest.md`), is accepted as before.

**Q2. "Complete" is derived from the walk, never claimed.** `featuresOwingFullLane`
(`packages/harness/src/lib/stop-rule.mjs`) reads the walk (`qa/lib/walk.mjs`): a feature is at
**Prove** when its brief and contract are signed and every clause has a citing test — built end
to end, nothing left but proof. Any feature at Prove makes the Stop hook strict. A declared plan
(`qa/plan.mjs`) can only tighten: a closed chain that names its feature owes the full lane; an
open one loosens nothing. If the walk cannot be derived, the rule fails closed (full lane owed).
Once the full lane passes and attests the tree, the walk moves the feature to Sign-off, so the
full lane is owed exactly once per feature.

**Q3. Before merge, always strict.** The bare `node qa/receipt-check.mjs` is unchanged: it is
what CI runs on a pull request marked ready (the merged feature-scoped CI workflow) and what the
pre-push hook runs for a push to the default branch, together with its "the receipt is committed"
check. A push to any other branch runs `receipt-check --quick`: the Stop hook's rule, outside a
session.

## Proof

`test/stop-rule-quick-check.test.mjs`: a quick receipt lets the hook stop with the not-done
message, and `--quick` accepts it while the bare check refuses it; a stale quick receipt, a smoke
receipt, a feature at Prove (a real stamped app with a signed brief and spec and a cited clause),
a closed plan, and an underivable walk are each refused by name; the pre-push hook passes a
feature branch on a quick check and refuses the default branch without the committed full
receipt.
