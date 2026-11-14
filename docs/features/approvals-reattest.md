# A signature costs what a signature costs: approvals-only re-attest

Status: **commissioned 2026-11-14 by the Consignly session, after Karel delegated sign-off of
Consignly's design system and the signature forced a full lane re-run. The decisions below are
the building agent's. Karel has not yet signed them.** R2 is the one he is most likely to want
to change.

```json cmp:feature
{ "touches": [], "screens": false }
```

## The problem

`node qa/approve.mjs <artifact> --as …` rewrites `qa/approvals.json`. The ledger is part of the
verified surface — the `approvals` step reads it — so the signature changed the receipt's
`inputs.hash`, the receipt went INVALID, and the only way back was the whole lane. In Consignly
on 14 Nov 2026 that was 247 s cold and 96 s with the Gradle cache warm: an Android release
build, a web build and an emulator, to re-prove code that had not moved a byte.

A second gap sat beside it. The `approvals` step SKIPped whenever any governed artifact was
still unreviewed. The stale-signature check always ran first, so a drifted signature was never
missed — but the row said SKIP, and a SKIP reads as "not checked" everywhere a receipt is read.
Consignly had 3 of 35 artifacts signed, and every receipt said those signatures had not been
verified when they had.

## Decisions

**R1. Prove "only the ledger changed" by hash, never assume it.** A full run now records
`inputs.hashWithoutApprovals` beside `inputs.hash`: the same digest with `qa/approvals.json`
left out, built in the same pass (`packages/receipts/src/inputs-hash.mjs`). A re-attest
recomputes it. Equal digests mean every other attested file is byte-identical to what the full
run saw. A receipt written before this field cannot be re-attested; it needs one full run, which
an `upgrade --harness` needs anyway because the lane's own code changed.

**R2. A flag, not automatic detection: `node qa/verify.mjs --reattest-approvals`.** `node
qa/verify.mjs` keeps meaning one thing — every step, now — which CI, the docs and every habit
already assume. A lane that silently ran two steps instead of twenty when it judged a change
small would make "I ran the lane" ambiguous, and an ambiguous checkpoint is what this harness
exists to remove. The discovery cost of a flag is paid by the two surfaces that know the
answer: `qa/approve.mjs` after a signature, and the Stop hook's refusal, both name the command
when — and only when — the ledger is the only change (`onlyApprovalsChanged`).

**R3. What re-runs is declared, not guessed.** The pack declares `approvalsLedgerReaders` — the
steps whose verdict can move when only the ledger changes. The cmp pack derives it from the read
surface its step cache already declares (`MEMOIZED_STEP_INPUTS`), which lists the ledger as an
input of `approvals` and nothing else. The lane's self-vouching row (the one carrying a
`harness` object) re-runs too, so the receipt is vouched for by the lane that issued it. A pack
that declares nothing gets a refusal.

**R4. Carried rows are marked, and the receipt names where they came from.** Every carried row
wears `carriedForward: true`. The receipt's `reattest` block lists `rerun`, `carriedForward`,
`from` (the ORIGINAL full run — its inputs hash, its hash without the ledger, when it ran, its
commit — kept across a chain of re-attests) and `replaced` (the receipt this one replaced). The
artifacts and on-device strength are the carried run's. `mode` stays `"full"`: what the rows
attest is a full run, and an older receipt-check reading the new receipt needs no change.

**R5. Never up.** The rung written is the lower of what the merged rows grade to and what the
carried receipt held. A stale signature FAILs the re-attest and the receipt then has no rung at
all. Freshness, for the hosted notary, is judged by `reattest.from.generatedAt`, so re-attesting
never makes old build evidence look new.

**R6. Refusals, each by name, each leaving the receipt untouched** (`planReattest`): another
file changed; the receipt is not a full, PASSing, done-evidence receipt (fast, smoke, nightly, a
FAIL, an environment SKIP — carrying it would launder it); it predates the digest; the lane's own
code differs from the lane that issued it; `--profile` differs from the profile it ran; no row for
a declared reader; and **CI** (`CI=true`), which never re-attests — it runs its own checks. Combined with
`--fast` or `--determinism` it is refused before anything runs.

**R7. Every reader accepts it, and holds it to its own account.** `checkReattest`
(`packages/receipts/src/receipt-validate.mjs`) refuses a `reattest` block that does not hold
together — a row in neither list or both, a carried row not marked, a marked row listed as
re-run, a `from` that names no run, or `inputs.hashWithoutApprovals` differing from
`from.hashWithoutApprovals`. `checkDoneEvidence` calls it, so `qa/receipt-check.mjs`, the Stop
hook, the pre-push hook and the hosted notary all refuse what it refuses and accept the rest.

**R8. The approvals step PASSes over the signatures it verified.** When at least one artifact is
approved and every approved one still matches its signed hash, the step PASSes; the unreviewed
and reopened ones are named in its reason and counted in its note, and `details.verified` lists
the verified ids. It SKIPs only when nothing is signed — there was nothing to verify. The rung
does not move: no ladder rung requires the `approvals` step.

## Proof

`test/reattest-approvals.test.mjs` runs the clean path on a stamped project (sign → refusal names
the re-attest → re-attest → receipt-check, Stop hook and done-evidence library accept) and every
refusal above as a planted violation, each asserting the receipt was left untouched. The
end-to-end proof over a real lane run on a freshly stamped app is in the PR.

## How an app picks it up

`npx create-cmp-cli upgrade --harness --yes`, then one full `node qa/verify.mjs` — the lane's code
changed, so the old receipt cannot be carried, and the new receipt is the first that records
`inputs.hashWithoutApprovals`.
