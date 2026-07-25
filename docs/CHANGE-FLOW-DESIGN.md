# The Change Flow — every way work enters a create-cmp app

Status: **doc of record** for the post-genesis delivery flow (supersedes the
checks/deliver design shipped in `394e4f1`, reworked by decision 2026-07-25).
Genesis itself is specified in [GENESIS-FLOW-DESIGN.md](./GENESIS-FLOW-DESIGN.md);
this document is the umbrella above it: **every entry point, one loop.**

Why this document exists: the first feature-flow implementation bolted a second
verification mechanism (agent-authored checks, an agent `--deliver` claim) onto
a product whose entire thesis is that agent claims are worthless until proven.
Karel's review named it correctly — clunky, an afterthought. The rework below
is what replaced it, and this page is written so the reasoning can never be
lost and the mistake never rebuilt.

---

## 1. The one loop

Everything that ever happens to a create-cmp app is the same loop:

> **Decide → Contract → Build → Prove → Sign**

| Stage | What it is | Where it lives |
|---|---|---|
| Decide | why this change, which options were rejected, what it will disturb | feature brief (`docs/features/<name>.md`) — only when there is something to decide |
| Contract | precisely what, testably | clauses in `specs/*.spec.md`; structural promises in governed artifacts |
| Build | code, tests, stories, goldens | the tree |
| Prove | mechanical verification | the lane (`qa/verify.mjs`) → receipt hash-bound to the tree |
| Sign | human judgment | approvals (`qa/approvals.json`), hash-bound; invalidated mechanically by drift |

**Genesis is this loop run for the first time over everything**, in the
definition order — and briefs are part of it (Karel, 2026-07-25): **intent →
feature brief(s) → architecture → exemplar spec → exemplar → design system →
components**. Once intent is signed, the interview's "first screens" answer
becomes the first feature's brief — `docs/features/<exemplar>.md`, `proposed`
in the console — so the app's FIRST feature gets the decide step every later
feature gets, and the Features section has content from day one. The brief
sits directly after intent because it speaks intent's vocabulary (purpose,
audience, domain nouns); only the *spec* needs architecture's vocabulary.
Two boundaries: the express lane stays light (no fabricated brief prose —
the Features section shows its honest empty state), and placeholder tabs
earn a brief only when they become real. Every later change is the same
loop over a subset. There is no second flow. Anything that proposes a second
flow is wrong by construction — that is the lesson of the first
implementation.

### The roles — who may do what

- **The harness proves.** Coverage both directions, conformance, goldens,
  tests, receipt. Nothing a machine can compute is ever asserted by anyone.
- **The agent produces.** Research, brief drafts, clauses proposals, code,
  tests, lane runs. **The agent holds no signing verb.** There is no
  `--deliver`, no self-declared done, no state only an agent's word supports.
- **The human judges.** Four signatures, each answering a question only a
  human can: the brief (*is this the right thing to build?*), the spec
  (*are these the right promises?*), the visual artifacts (*does it look
  right?* — judged on rendered screens, never descriptions), and acceptance
  (*is the proven thing what I wanted?*).

### The chain — why nothing can slip through

Doneness, coverage, approvals, and evidence are one chain read at four points,
not four mechanisms that must agree:

```
drift anywhere → approvals gate FAIL → lane FAIL → no PASS receipt attesting
the tree → provenDone false everywhere → nothing acceptable
```

A feature cannot be accepted while ANY governed artifact — declared in its
blast radius or not — is in unresolved drift.

---

## 2. The primitives

| Primitive | File | Governed? | Meaning |
|---|---|---|---|
| Clause | `specs/<surface>.spec.md` | via `feature-spec:<surface>` | one testable behavioral promise; cited by tests (`// SPEC: ID`) |
| Governed artifact | `qa/approvals.json` registry | yes | human signature over content bytes; drift invalidates |
| Receipt | `qa/evidence/latest.json` | — | the lane's verdict, hash-bound to the tree (`inputs.hash`) |
| Feature brief | `docs/features/<name>.md` | `feature-brief:<name>` | the *why*: decisions + rationale + declared blast radius. **Location is the opt-in** — every doc in `docs/features/` is governed; harness design standards stay in `docs/proposals/` |
| `touches` | ```json cmp:feature``` block in the brief | declaration only | the artifacts this change expects to invalidate; hashes enforce, declaration lets the console tell *as-planned* from *undeclared blast* |
| Comment | `qa/comments.json` | advisory | human feedback with a defined path back into plan/spec/code |

**Doneness is derived, never claimed.** A feature is provably done iff:

```
live clauses exist ∧ every one cited by a test ∧ latest receipt PASS
∧ receipt inputs.hash attests the tree AS IT STANDS
```

Each conjunct closes a hole: no clauses = nothing promised (vacuous); uncited =
promise without proof; no PASS = proof failed; stale hash = proof of a
different tree. Implementation: `qa/lib/feature-brief.mjs` (`deriveFeatureStatus`),
reading the SAME scan the lane's `specCoverage` gate runs
(`qa/lib/spec-coverage.mjs`) — one definition of "clause" and "cited",
so the Features view and the lane cannot disagree.

---

## 3. Entry points — the router

Every incoming request is triaged FIRST, before any work — and the triage is
**always visible**: the agent's first reply restates the change in one or two
plain sentences, names the lane, and says why, before any tool runs. The human
can overrule in a word; a silent route is a routing error even when the lane
was right. This rule is carried operationally by the generated project's
`CLAUDE.md` (§"After genesis") and by each stamper skill's step 0, so every
surface an agent enters through says it. The rule:

> **Brief lane** iff the change carries *decisions a future contributor could
> plausibly unmake* OR *blast radius into contracts already signed*.
> **Direct lane** otherwise.

| Entry point | Lane | Decide | Contract | Sign |
|---|---|---|---|---|
| **New app** | genesis walk | intent brief (`specs/intent.md`) | app-base + exemplar spec | the six genesis approvals ([GENESIS-FLOW-DESIGN.md](./GENESIS-FLOW-DESIGN.md)); express lane available |
| **New feature** (new surface, e.g. meal logging) | brief | `docs/features/<name>.md` | new `specs/<name>.spec.md`, clauses confirmed before code | brief → spec → (touched artifacts) → accept |
| **Change to an existing feature** (amends signed behavior) | brief | brief declares `touches: [feature-spec:<surface>, …]` | **reopen** the touched spec(s), amend/add clauses, re-approve | brief → re-approved specs → (touched artifacts) → accept |
| **Behavior tweak** (one clause's worth, no decisions) | direct | chat confirmation | reopen spec → amend clause → re-approve | spec re-approval |
| **Bug fix** (spec right, code wrong) | direct | — | untouched — the clause already says the correct behavior | none; receipt is the record |
| **Copy/content edit** | direct | — | clause edit only if the copy is specified; else none | spec re-approval if touched |
| **Visual redesign** (tokens, look) | direct (or brief if decision-heavy) | — | reopen `design-system`, candidates loop, pick on rendered screens | `design-system` (+ `components`, + exemplar if its look changed) |
| **Component add/reshape** | direct | — | registry is law: change invalidates `components` | `components` re-approval + story entry |
| **Architecture change** (layer rules, policies) | brief (almost always decision-heavy) | brief + ADR | authored prose in `docs/ARCHITECTURE.md` + `app-base` clauses | `architecture` re-approval |
| **Version upgrade** | direct | — | version set moves as one (proven-green) | none; lane + receipt |
| **Spike / experiment** | ungoverned | — | none — exploration is free; governance starts at signature | becomes one of the above, or is deleted |
| **Emergency fix** | direct, immediately | — | never blocked by pending briefs or open walks | after the fact if a contract was touched |

Rules that keep the router honest:

- **Legacy features never get retro-briefs.** Governance is not archaeology.
- **A spike needs nothing.** The moment it becomes real, it enters through
  the row it belongs to.
- **The direct lane is not a loophole** — the standing gates (drift,
  coverage, goldens, conformance, receipt) cover every row equally. The brief
  is *additional decision-recording*, not additional enforcement.

---

## 4. The brief lane, step by step

What happens when the human describes a decision-carrying change
("I want to add meals, schedule them, keep history…"):

1. **Restate + triage.** The agent plays the change back and names the lane.
   The description is *input to a draft, not a work order*.
2. **Draft the brief.** Research as needed. `docs/features/<name>.md` holds:
   the problem in the human's words, what the industry does (sourced), a
   recommendation per decision, and an explicit **Open decisions** section for
   every call that is genuinely the human's. It appears in the console as
   `proposed` the moment the file exists.
3. **Close the decisions.** The human answers (chat or console comments). The
   agent rewrites each open question as a **decision with its why and date**.
   A brief is not signable while it still contains open questions.
4. **Sign the brief** (console Approve, or
   `node qa/approve.mjs feature-brief:<name>`). Hash-frozen from this click:
   the reasoning cannot shift under the feature while it is built. `via` is
   recorded (`console`/`cli`) for audit.
5. **Contract.** Reopen every signed spec the brief declares it will amend
   (`--reopen feature-spec:<surface>` — sanctioned redesign, never drift).
   Write the new clauses where the behavior lives: new surface → new spec;
   changed surface → that surface's spec. The human signs the spec(s).
   *Spec-first is preserved: the contract changes before the code does.*
6. **Build.** Slices land through the stamper/preview loop. Declared blast
   arrives as planned: touched artifact hashes break, the lane FAILs naming
   them, the Features card shows *"as declared — re-approve when shaped"*.
   Undeclared drift surfaces in the **Undeclared blast** banner as plan-drift.
   The human re-approves visual artifacts on rendered output.
7. **Prove.** Nothing to do — the card's tally climbs as citing tests land,
   and `provenDone` flips when the receipt attests the finished tree.
8. **Accept.** The button enables only at provenDone. Acceptance means the one
   thing only the human can say: *the proven thing is what I wanted.* The card
   closes into history as the feature's doc-of-record.

Two signatures (brief, spec) rather than one mega-approval, because they catch
different failures — building the wrong thing vs. building the thing wrong —
and a signature nobody can actually judge in one click is a rubber stamp.

---

## 5. The direct lane, step by step

1. Restate the change; confirm in chat (no ceremony).
2. If a signed contract is touched: reopen → amend clause → re-approve.
   If not (pure bug fix): skip — the clause already states the truth.
3. Build; inner loop (preview, `desktopTest`); lane once at done; commit the
   receipt. The Stop hook / pre-push / CI enforce the receipt as always.

---

## 6. Console mapping

| Flow moment | Console surface |
|---|---|
| brief appears / drafted | **Features** — card `proposed`, prose + open decisions readable |
| sign the brief | Features card → **Approve** |
| clauses confirmed | **Specs** RTM (per-clause: citing tests, gate, last receipt) + Approvals |
| declared drift during build | Features card touches list — *as declared*; Approvals shows re-approve |
| undeclared drift | Features **Undeclared blast** banner + Approvals FAIL detail |
| visual re-approval | Design language / Components sections (rendered stories, candidates strip) |
| doneness | Features card: `n/n clauses cited · receipt PASS · attests this tree` |
| accept | Features card → **Accept** (enabled only at provenDone) |
| the audit trail | Evidence (receipt history from git log) |

The Features section is the **per-feature view** — a feature's brief, its slice
of the RTM, its screens, its blast radius, its lifecycle — not a governance
board. Section = signed doc + derived truth + drift surface, like every other
console section (the spec-mirror-drift standard).

**Rail order mirrors the loop** (Karel, 2026-07-25): Intent → **Features** →
Architecture → Specs → Screens → Design language → Components → Evidence.
Features sits directly after Intent — the decide layer before the contract
layer — so the rail reads as the walk actually runs, at genesis and ever
after.

**The rail-truth rule** (Karel, 2026-07-25): *a neutral glyph means truly
nothing pending here.* The working baseline is all-green; the moment a change
lands, every affected tab turns colour — the rail IS the human's work queue.
Any state waiting on a human is colour from the moment it exists, and every
waiting-state has a **distinct colour** — grey is reserved for truly-nothing:

| State | Glyph | Colour |
|---|---|---|
| unsigned brief (`proposed`) / unreviewed spec or artifact | ○ | **accent blue** — your signature is the next step |
| proven — acceptance pending | ● | **accent blue** — your acceptance is the next step |
| drifted (changed-since-approval) | ⚠ | red — an accident to review |
| reopened for redesign | ◐ | amber — sanctioned, never rendered as drift |
| everything signed, nothing pending | ● | green |
| section has no data at all | · | neutral grey |

Roll-up rules: Features and Specs aggregate their families, worst state wins
(drift > reopened > unsigned > acceptance-pending > all-signed); **reopen is
never collapsed into drift** — the asymmetry is the product. Approvals — the
work queue itself — counts every decision waiting on the human **including
pending acceptances** (a ledger field, not an artifact status), so Features
and Approvals can never tell different stories. **Ungoverned sections never
go green**: Screens has no signature to show — its one honest colour is red,
when the last render/compile failed and the gallery may be stale; Walkthrough,
Comments, Digest, and Live device stay neutral by design.

**The change surface — what changed vs. what is still approved** (Karel,
2026-07-25). A red chip alone says *something* changed; the console must say
*what*, and what the signature still covers. Every drifted artifact renders
ONE panel — at the top of **its own section** (spec-mirror-drift: each section
is its own drift surface) and inside the Approvals table:

- the per-file split against the **signed bytes**: which files changed
  (modified / added / deleted) and which are **still exactly as signed** —
  "9 of 11 files still exactly as signed · 2 changed", never one
  undifferentiated alarm;
- the full diff, anchored to the commit whose tree hashes to the *stored
  approval hash* (located, never guessed — if no commit matches, the panel
  says exactly that instead of showing a diff against "roughly then");
- the **Re-approve** button in place — re-approval happens where the drift is
  read, not on another tab.

Implementation: `inspector/mcp/src/lib/approval-diff.mjs` (anchor + per-file
split) + `driftPanelHtml` in `console-tabs.mjs` (the one renderer).

---

## 7. Command reference

| Command | Actor | What |
|---|---|---|
| `node qa/approve.mjs --status` | either | every artifact + every feature's derived doneness |
| `node qa/approve.mjs feature-brief:<name>` | human | sign a brief |
| `node qa/approve.mjs feature-spec:<surface>` | human | sign a contract |
| `node qa/approve.mjs --reopen <artifact>` | human (or agent on the human's word) | sanctioned redesign — never drift |
| `node qa/approve.mjs --accept <name>` | human | accept a provenDone feature; refused otherwise |
| `node qa/verify.mjs` | agent | the prove step; writes the receipt |

Deliberately absent: `--deliver` (removed — an agent signing verb),
`cmp:intent-checks` (removed — a grep-shadow of the clause↔test↔receipt chain).

---

## 8. Deliberately ungoverned

- **Brief prose quality.** The harness binds bytes and checks declarations; it
  cannot check that a *why* is well-reasoned. That is what the human's
  signature is for.
- **Spikes.** Exploration is free until it asks to become real.
- **The emergency path.** A production fix is never hostage to an open walk.
- **Small-change judgment.** The triage rule is a rule of thumb the agent
  applies out loud and the human can overrule — not a gate.

## 9. Known limits (accepted, not hidden)

- **Doneness attribution is per-spec by filename.** `meal`'s card derives from
  `specs/meal.spec.md`; amendments it caused in `today.spec.md` are proven by
  the same receipt but attributed to Today. Safe (the §1 chain blocks
  acceptance while anything drifts) but attribution is convention. Revisit
  only if it bites.
- **Starting a change is N reopen commands, not one.** A `--reopen-feature`
  keyed off the brief's touches would collapse it. Nicety; not built.

## 10. Implementation index

| Piece | File |
|---|---|
| clause/citation scan (single definition) | `template/qa/lib/spec-coverage.mjs` |
| briefs + derived doneness | `template/qa/lib/feature-brief.mjs` |
| registry, signatures, reopen, accept | `template/qa/lib/approvals.mjs` |
| the lane | `template/qa/verify.mjs` (no feature-specific step — see §2) |
| CLI | `template/qa/approve.mjs` |
| console per-feature view | `inspector/mcp/src/lib/console-tabs.mjs` + `preview-service.mjs` |
| operational contract for agents | `template/CLAUDE.md` §Approvals / §Feature walk |
