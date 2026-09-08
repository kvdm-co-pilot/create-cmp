# create-cmp — the harness's own session map

`docs/NORTH-STAR.md` governs. §12 is the document map, §10 the fit test every PR answers.

The rules that are programs, and which program — ask these, not a document:

- what this slice owes and **when**: `node scripts/proof-plan.mjs` (GATE-RULES Rule 4), enforced by
  `.claude/settings.json` → `scripts/hooks/proof-gate.mjs`. If it refuses you, it is right.
- the lane returns both ways: `node scripts/framework-check.mjs`
- a stage's exit: `node scripts/stage-gate.mjs`
- counts and versions: `node scripts/ground-truth.mjs`, never by hand

Trunk-based: branch → PR → `gh pr merge --rebase --delete-branch` → pull; one piece in flight.
Docs move in the same commit as the change. Nothing here restates a rule — a rule stated twice
drifts in one, and a program at the moment of decision beats prose read at session start.
