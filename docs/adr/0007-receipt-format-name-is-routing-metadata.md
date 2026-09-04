# ADR-0007: The receipt format name is routing metadata, not part of the claim — rename it, read both

- **Status:** proposed
- **Date:** 2026-09-05

## Context

The receipt is the artefact we tell people is open and auditable (NORTH-STAR §8.4), and it is
named after one stack. `template/qa/evidence/schema.json:3` declares `"$id": "cmp-evidence/1"`,
line 18 pins the receipt's own `schema` field to a `const` of the same string, and one writer
emits it: `packages/harness/src/verify.mjs:516` and its byte-identical vendored twin
`template/qa/verify.mjs:516`. The harness is no longer a Compose thing — a Kotlin backend
adopted it with **zero core edits** (PACKAGE-SPLIT §0) and a Python service is in progress — so
a Ktor team's evidence currently says `cmp` on it. PACKAGE-SPLIT D3 settled the fix (rename now,
reader accepting both) and D8 settled the name; `prooflane@0.0.1` was claimed on npm 2026-09-05
(PACKAGE-SPLIT §5), and the packages are renaming under unscoped `prooflane-*` names as this is
written (`prooflane-harness@0.19.0`, `prooflane-receipts@0.1.0`) while the format itself is
deliberately untouched — `schema.json` and both `verify.mjs` copies are unmodified. What was
never settled, and is why NORTH-STAR §11 O4 blocks the format rename, is what an old receipt
means once the new name exists.

That question has a mechanical answer already sitting in the tree, and it should be stated
rather than assumed. **Nothing reads `receipt.schema`.** `evaluateReceipt` — the whole local
predicate, `packages/harness/src/lib/receipt-validate.mjs:93-139` — reads `inputs.hash`,
`verdict`, `profile` and `steps`, and never the format name; nor does any other module under
`packages/harness/src/lib/`, `template/qa/` or `inspector/mcp/src/`. The one reader that already
handles two receipt formats dispatches on field *shape* and says so in a comment:
`inspector/mcp/src/lib/receipt-bridge.mjs:49-70` reads `inputs.hash` or `inputsHash`,
`commit.sha` or `gitSha`, because a spine adopter's own writer emits `pb-evidence/1` with the
same facts spelled flat. The contrast is one file away — the *manifest's* name is load-bearing,
and `packages/harness/src/lib/harness-manifest.mjs:80-81` refuses anything that is not
`harness-manifest/<n>`.

## Decision

Rename the format to **`prooflane-evidence/1`** in one PR in Phase C: `$id` and both writers
move, and `properties.schema` becomes an `enum` of `["cmp-evidence/1", "prooflane-evidence/1"]`.
The format name is chosen independently of how the packages are published — it must not encode a
scope, or it renames a second time if the `prooflane` npm organisation later exists. The rule
that makes a rename, rather than a version bump, the honest move:

> The receipt's `schema` field is **routing metadata**: it names the document that defines the
> rest of the file. The claim is `verdict` + `inputs.hash` + `steps[]` + `harness` + `pack`.
> Renaming the label changes no assertion any receipt has ever made.

**A `cmp-evidence/1` receipt therefore asserts exactly what it asserted the day it was written,
forever, and the rename gives it no expiry.** It expires the way it always did and by no new
rule: it stops attesting a tree the moment a verified byte moves (`receipt-validate.mjs:114`),
and a hosted validator refuses it past the 30-day freshness window
(`receipt-validate.mjs:147`). The old name stays readable for the life of `/1`. It would stop
being accepted only at `/2` — a different decision, about a changed shape, needing its own ADR.

**The three readers.** The in-repo Stop hook (`template/qa/receipt-check.mjs`, through the
vendored `evaluateReceipt`) changes in no way, because both names already validate identically
today; the enum documents behaviour that exists rather than enabling new behaviour. The
standalone reader — `prooflane-receipts@0.1.0`, renamed from `@create-cmp/receipts` by the
package work already in the tree — is the same predicate and equally silent on the field; what
the *format* rename changes there is prose only, including the one stack-named refusal string it
still prints (`receipt-validate.mjs:250`). Gatekeeper is not running:
its hosted deployment is deferred until real user traction (NORTH-STAR §9) and its service lives
in a repo that is not this one (GATEKEEPER-PRODUCT.md §4.2), so this ADR states the rule it
inherits rather than describing a live system. It consumes the same library (§4.2 item 1),
accepts both names, and must never treat the format name as a trust signal — a receipt is not
more or less attestable for the name on its envelope. `pack` is what makes two rungs
incomparable; `schema` is not.

**The lock and the doc markers do not move with it.** `LOCK_SCHEMA = "cmp-harness-lock/1"`
(`harness-lock.mjs:36`) is the same defect at the same low cost — `checkHarnessIntegrity`
(`harness-lock.mjs:97-127`) never reads it either — but the lock is a different file with a
different writer, rewritten only at stamp time and by `upgrade --harness`. The split is already
observable in the tree: the package rename has moved the lock's sibling field `name` to
`prooflane-harness` (`harness-lock.mjs:64`) while `LOCK_SCHEMA` sits untouched at
`cmp-harness-lock/1` (`harness-lock.mjs:36`). The lock's schema string finishes that journey with
the package work, not in this PR — a lock is bound to the package that wrote it, and a receipt is
not. The architecture document's `<!-- cmp:generated … -->` markers
do not move at all yet. `MARKER_BLOCK_RE` (`arch-doc.mjs:371`) is a fixed regex with no
alternation, and the markers are inside the architecture artifact's hash basis — `approvals.mjs:335`
states that adding, removing or reordering one changes the hash. Renaming them would re-ask a
signature in every adopting repo for a change containing no decision, which is exactly the
ceremony NORTH-STAR §4 calls a defect. They move only on a change that already rewrites that
doc's authored bytes.

## Consequences

- **Adopters do nothing, and no receipt is rewritten or re-earned.** One who never upgrades keeps
  writing `cmp-evidence/1` and every reader keeps accepting it; one who upgrades emits the new
  name at the next lane run. The old name stops being *written* the moment the Phase C PR lands —
  there is one writer, at one line, in two byte-identical copies — and never stops being *read*.
- **The rename adds no lane run of its own.** `qa/verify.mjs` is on the verified surface, so any
  harness upgrade already invalidates the standing receipt and costs one re-run; `qa/evidence/`
  is excluded (`inputs-hash.mjs:109`), so editing the schema file moves no hash at all.
- **The cost is that two names mean one thing for the life of `/1`**, and every reader, README and
  evidence pack must keep saying so. A permanent explanatory tax, paid to avoid a version bump
  that nobody's bytes justify.
- **The rename is gated by a test that already exists.** `test/receipt-schema-drift.test.mjs`
  runs a real lane and holds every key and enum value in the emitted receipt against
  `schema.json`; a writer and a schema that disagree fail there in the same second. No new gate,
  which is the presumption NORTH-STAR §8.8 demands.
- **`prooflane-evidence/1` becomes a promise about shape that nothing enforces.** Because readers
  route on fields, a writer emitting the new name with a different shape would be invisible to
  the predicate and would silently break the equivalence asserted here. The enum is honest only
  while both names describe one document.

## Alternatives considered

- **`cmp-evidence/2` — bump the version instead of renaming.** Rejected: a version bump asserts
  the shape changed, and no field moves. It would make every existing receipt re-earn the right
  to say the same thing.
- **Leave the name alone and treat it as historical.** Rejected: the format is what we invite a
  stranger to read (NORTH-STAR §8.4), and a Ktor team's audit artefact naming a mobile stack is a
  falsehood in the one place we promised there would be none.
- **Rename receipt, lock and `cmp:generated` markers in one sweep.** Rejected: the markers sit
  inside a signed artifact's hash basis, so tidiness alone would re-ask signatures that no human
  decision moved.
- **Drop the `schema` field entirely.** Rejected: it is the only field telling an unfamiliar
  reader which document defines the rest, and `qa/evidence/schema.json` is that document.

## What would make this wrong

One condition, and it is nameable: **a consumer that routes on the name** — that decides what a
receipt *means* from its `schema` string rather than from its fields. `pb-evidence/1`
(`receipt-bridge.mjs:49`) is the live near-miss: same facts, different spelling, different
writer. Once two formats share a namespace and differ in semantics, a reader that trusts the
label cannot tell "renamed" from "different", and an enum accepting two names for one meaning is
the hazard rather than the accommodation. Concretely: this is wrong if any writer emits
`prooflane-evidence/1` with a shape `cmp-evidence/1` does not describe, or if Gatekeeper, once
deployed, must report *which* format a receipt used as part of what an auditor is shown —
because then the name was part of the claim after all. Either fact reopens this as
`prooflane-evidence/2`: one name per version, old receipts read by their own.

## Related

- `docs/NORTH-STAR.md` §11 O4 — the open decision this closes; §9 — Gatekeeper's deployment is
  deferred; §8.4 — the format is open.
- `docs/proposals/PACKAGE-SPLIT.md` D3 (the decision), §5 and D8 (the name, claimed 2026-09-05),
  Phase C (where the rename lands).
- `docs/adr/0005-evidence-binding-by-inputs-hash.md` — what a receipt actually claims, and why
  the claim is the hash and not the header.
- `template/qa/evidence/schema.json` (the format), `packages/harness/src/verify.mjs` (the
  writer), `packages/harness/src/lib/receipt-validate.mjs` (the reader),
  `test/receipt-schema-drift.test.mjs` (the gate that keeps them agreeing).
