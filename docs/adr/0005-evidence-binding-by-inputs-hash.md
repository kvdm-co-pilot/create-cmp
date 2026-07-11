# ADR-0005: Evidence is bound to the verified inputs by content hash, not by parent SHA

- **Status:** accepted
- **Date:** 2026-07-06

## Context

The verify lane writes an evidence receipt (`qa/evidence/latest.json`) that attests a PASS/FAIL
verdict for a change, and the contract (`CLAUDE.md`) says a change is not done until that receipt
is committed. For the receipt to *mean* anything, two enforcement points need a reliable answer to
one question: **does this committed receipt actually attest the tree it was committed with, or is
it stale / hand-forged / left over from an earlier state?**

- A **Stop hook** (local, M4-A) wants to block "done" when source has changed but no fresh PASS
  receipt exists — cheaply, on every turn-end, without paying for a Gradle build.
- **CI** (M4-C) wants to reject a push whose committed receipt does not attest the checked-out
  tree, so a stale or edited receipt cannot pass as proof.

The receipt already records `commit.sha` — the *parent* HEAD at run time. Binding validity to that
SHA was explicitly rejected during M2 (roadmap: *"naive SHA check breaks on rebase/merge — needs
the M4 evidence-binding design"*): rebasing, squashing, or merging rewrites parent SHAs without
changing a single line of the verified source, which would invalidate a perfectly good receipt and
force a needless re-run. Binding to the *commit* SHA the receipt lands in is impossible — you
cannot know a commit's SHA before you make it.

## Decision

Bind the receipt to a **content hash of the verified inputs**, recorded in the receipt as
`inputs.hash`, and make receipt validity a pure recompute-and-compare:

> A receipt validly attests a working tree **iff** `receipt.verdict === "PASS"` **and**
> `receipt.inputs.hash === recompute(tree)`.

`recompute(tree)` is a sha256 over the sorted `(path, sha256(content))` list of the to-be-committed
files on the **verified surface** — the files whose content can change the lane's verdict:
`composeApp/`, `specs/`, `qa/` (excluding lane *outputs*: `qa/evidence/` and `qa-artifacts/`),
`gradle/libs.versions.toml`, and the root Gradle build/settings files. Docs, README, and other
non-verdict-affecting files are deliberately outside the surface, so a doc-only edit does not
invalidate evidence and force a rebuild (enforcement must be transparent, not hostile).

One predicate — `qa/receipt-check.mjs` — computes this, and both enforcement points call it:
locally in milliseconds (hashing, no Gradle) for the Stop hook, and in CI against the checked-out
tree for the receipt-matches-HEAD gate.

## Consequences

- **Robust to history rewrites.** Rebase/squash/merge change parent SHAs but not tree *content*,
  so the hash still matches and the receipt stays valid — no spurious re-runs.
- **Tamper-evident.** Editing the receipt's verdict without re-running, or committing a receipt
  from an earlier tree, changes neither the recorded `inputs.hash` nor the code — recompute
  mismatches and CI fails. You cannot hand-forge a green receipt.
- **Cheap enough to run on every stop.** The predicate is file hashing only; the Stop hook nags
  exactly when the verified surface changed without a fresh PASS receipt, and stays silent for
  conversational turns and doc-only edits.
- **The surface is an explicit, auditable constant.** Under- or over-scoping it is a one-line
  change with a stated principle ("every tracked file whose content can change the verdict, minus
  lane outputs"). Getting it wrong fails safe in CI, where the lane is independently re-run anyway.
- **`commit.sha` / `commit.dirty` stay in the receipt** as human-facing provenance, but they are
  no longer the validity key — the hash is.

## Alternatives considered

- **Parent-SHA equality** — rejected: breaks on every rebase/merge (the original M2 blocker).
- **Hash of `git status` / dirty-path list** — rejected: records *that* files differ, not their
  content, so it cannot detect a re-edit back to a different state and is noisier than needed.
- **All-tracked-files hash** — rejected: a README typo would invalidate the receipt and force a
  lane re-run, which is the "hostile enforcement" the design explicitly avoids.

## Related

- `docs/M4-ENFORCEMENT-DESIGN.md` — the buildable M4 contract this ADR underpins.
- `template/qa/verify.mjs` — records `inputs.hash`; `template/qa/receipt-check.mjs` — the predicate.
- `docs/adr/0001-the-contract-lives-in-the-generated-project.md` — why the hook + check ship in the
  generated project, not the plugin.
