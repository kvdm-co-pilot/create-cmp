# Price the next review round — which one, what it reads, whether it is owed

Status: **decided by Karel, 2026-09-18, in the brief that commissioned this slice; built
overnight into 2026-09-19.** The decisions in the next section are his and are recorded as his. Advisory, like
the program it extends: it refuses nothing.

```json cmp:feature
{ "touches": [], "screens": false }
```

## The problem, as it was measured

`scripts/change-price.mjs` prices which lane a change is on and what ceremony that lane owes.
On the review row it stopped, in its own words: *"this cannot know whether the fixes from round
1 were more than trivial, because nothing records it, and it does not guess"*. Two costs
followed, and only the second is about time.

**Nothing could count rounds.** `recordReview` appends one row per `--record-review`, and
ADR-0014 rebinds a record to the bytes that merge, so a re-record after a rebase was
indistinguishable from a fresh cold read. `change-price.mjs` said so out loud —
*"records are not rounds, so this count is an UPPER BOUND"*. The evidence is in this
repository's own history: the 19:58 row of `qa-artifacts/review-history.jsonl` on 2026-09-18
carries the words *"this is a re-record after a rebase"* **inside its free-text `tests` array**,
because there was no field to put them in. Nothing can count that.

**Nobody was told what round 2 should read.** The rule of record — `docs/KNOWN-DEFECTS.md`'s
header — bounds a later round's reading to the delta rather than a second pass over the whole
diff, and nothing computed that delta for anyone. Measured 2026-09-18 on the
KD-123 slice: round 1 took 6.9 minutes, round 2 took 3.6, and the only reason the second was
cheap is that a human named the bytes by hand.

## Decisions (Karel's, and closed)

**K1 — It is ADVISORY.** It refuses nothing, gates nothing, and exits 0 on every path, exactly
as `change-price.mjs` already does. A refusal here would be a new gate: it would owe
`docs/GATE-RULES.md` Rule 1 a calibrated kept plant and add the mechanism NORTH-STAR §10 Q3
presumes against — over a judgement, which is the uncalibrated instrument in a refusal path
that PRINCIPLES.md §2 forbids.

**K2 — Conservative by construction.** Unlike the lane advisory, whose errors cost extra
paperwork, this one's errors cost a SKIPPED review. So where it cannot tell, it says OWED, and
says that is why. Only one direction of error is recoverable.

**K3 — It extends `scripts/change-price.mjs`; no new program.** That file already reads the
review records, and `CLAUDE.md` already points a reader at it.

**K4 — The falsification is a constraint on the design, not a note.** "Round 1's fixes touched
only review-irrelevant paths, so round 2 is not owed" is WRONG, and the counter-example is a
commit here rather than an argument: `adc947c` is round 1's fix on the KD-123 slice, touching
`agents/cmp-orchestrator.md` and `docs/KNOWN-DEFECTS.md` — both matching `REVIEW_TIER_IRRELEVANT`
— and round 2 then found a **blocking** defect in it (fixed in `06c5aa1`). Two more the same
way: a false justification in a code comment (KD-121) and a wrong count in a test file's header
comment (KD-123 item 3). So neither "comment-only" nor "prose-only" is a proxy for trivial, and
none of the three is implemented. `REVIEW_TIER_IRRELEVANT` answers *"does this DIFF owe a review
at all"* — the same words, a different question.

**K5 — Exactly one NOT-OWED case: the delta since the last round is empty.** Round 1 required no
fixes, so there is nothing for round 2 to read. Every other case is OWED or CANNOT-TELL-SO-OWED,
and says which and why.

**K6 — The rule of record is pointed at, never restated.** `docs/KNOWN-DEFECTS.md`'s header
holds it; `change-price.mjs` already cites it deliberately rather than copying it, and a rule
stated twice drifts in one (`CLAUDE.md`).

## Decisions taken in the build (mine, and why)

**D1 — The schema string does not move.** `reviewDischarge` refuses outright on a schema it
does not recognise, so bumping `prooflane-review/1` to `/2` would refuse every record already on
disk — including one written minutes earlier by a slice in flight — over two fields that are
optional and additive. A schema version exists to stop a reader misreading a field whose
*meaning* changed; nothing here changed meaning.

**D2 — Absent, not null.** `round` and `kind` are written only when the caller says so. A key
present with a null value and a key missing mean the same thing to every reader, and both mean
unknown; only the missing one cannot be mistaken for a recorded answer. No history row is
rewritten — a backfill is a guess recorded as a fact, in the one file this product holds up as
evidence.

**D3 — A malformed `--round`/`--kind` is refused, not written.** This is argument validation on
a command that already refuses `--nothing-found` against findings, and it happens before
anything is written. A row carrying `kind: "rerecrd"` reads as unknown forever while looking
like an answer.

**D4 — The block anchors on the EARLIEST attributed record**, preferring rows that say they are
round 1. An earlier anchor spans more bytes, and every byte it adds is one round 2 was going to
be told to read anyway; a later one could hide round 1's own fixes.

**D5 — An unstated row can only ADD rounds, never subtract one.** So the cap is reported spent
only when a record STATES round 2 or higher, and five unreadable records are never read as a
spent cap. Ending a review on a guess is the one failure this must not have.

**D6 — `changedPaths(since)` rather than a second union.** The delta needs "the range union the
working tree", which `proof-plan.mjs` already spells once, under a refusal. It was generalised
with a default that leaves the no-argument call byte-identical, and that default is pinned by a
test — KD-113 and KD-124 are both one rule spelled twice, and this repository keeps finding
that shape.

**D7 — Two dots for an explicit floor, three for the default.** The range is also PRINTED as the
command to run, so it must be the range that was read. For a commit that is an ancestor of HEAD
the two spellings are one answer; for an orphan left by a rebase, two dots overstate the delta,
and overstating says OWED.

## Surfaces changed

- `scripts/proof-plan.mjs` — `recordReview` takes `round` and `kind`; `--record-review` gains
  `--round <n>` and `--kind round|rerecord`; `REVIEW_KINDS` is the vocabulary; `changedPaths`
  takes an optional floor; the printed `how` tells the reviewer to say which round it is.
- `scripts/change-price.mjs` — PART 4, `nextRound()`, `ROUND_VERDICTS`; `attribute()` returns
  the rows it attributed; the `review` ceremony row points at the new block.
- `.claude/agents/staff-reviewer.md` — the record command, and the instruction to say which
  round it is and never to pick the number itself.
- `agents/cmp-orchestrator.md` — a brief for a review carries the round, because only the
  spawner holds it.
- `docs/GATE-RULES.md` Rule 4's command list.

## Non-goals

- **Judging triviality.** Nothing here reads what round 1's fixes contained. K4 says why.
- **A gate.** K1. There is nothing to wire, and the program never says no.
- **Counting rounds for history.** `--history` and the `spent` block still count RECORDS, which
  is the honest unit for them; the round block is the only thing that reads `round`/`kind`.

## Open decisions (handed up)

- **`change-price.mjs` is now an acting text about the review rule and is not scanned by
  `test/the-review-rule-is-stated-twice.test.mjs`**, whose `actingTexts()` covers
  `.claude/agents/`, `skills/`, `agents/` and the printed `TIERS.review.how`. Logged as KD-129
  rather than fixed: extending that scan is new mechanism outside this slice's brief, and it
  would owe GATE-RULES Rule 1 a kept plant of its own.
- **`plan.reviewDischarged` does not carry `round`/`kind`.** `reviewDischarge` copies named
  fields, and these were not added: the history row is what the round block reads, and the plan
  event is not. Logged as KD-130.
