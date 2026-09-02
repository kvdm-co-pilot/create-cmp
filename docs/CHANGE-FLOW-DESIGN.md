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

> **Decide → Design → Audit → Contract → Build → Prove → Sign**

| Stage | What it is | Where it lives |
|---|---|---|
| Decide | why this change, which options were rejected, what it will disturb | feature brief (`docs/features/<name>.md`) — only when there is something to decide |
| Design | what it looks like — drafted on stub data, judged on RENDERED screens, never prose (Karel, 2026-07-25: a brief describing "a tray with a running total" is a description; nobody signs a description) | `feature-design:<name>` over `presentation/<name>/*Screen.kt` — **derived: the stage exists iff the change has a UI surface**; a pure-logic change skips it honestly |
| Audit | attack the design before anyone signs it — what does this do on a skipped day, a reordered clock, a denied permission, an empty week? | `## Edge cases` in the brief: one line per case and how it resolves (a decision, a clause, or an explicit "out of scope"). **Derived rung**: while a UI feature records fewer than three, the ladder asks for no signature at all |
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

**Why Audit is a stage and not a habit** (Karel, 2026-07-27). It was always
happening — just last, after the signatures, where every finding reopened a
signed artifact. Measured on `meal-plan`: the brief was signed, designed, signed
again, contracted, signed again, and only then audited; the audit found nine
gaps, three of them defects in clauses already approved. Three signing rounds for
one feature, and none of the work was wasted — it was simply done in an order
that made the human sign the same thing repeatedly. So the ladder now drafts and
audits BEFORE it asks for anything: for a feature with a UI surface the agent
owns `design` then `audit`, and only then does `sign-brief` appear. Findings land
in the signing round instead of causing another one. The gate counts entries; it
cannot judge them, and does not pretend to — what it enforces is that the
adversarial pass happens while everything is still unsigned and cheap to change.

### The roles — who may do what

- **The harness proves.** Coverage both directions, conformance, goldens,
  tests, receipt. Nothing a machine can compute is ever asserted by anyone.
- **The agent produces.** Research, brief drafts, clauses proposals, code,
  tests, lane runs. **The agent holds no signing verb.** There is no
  `--deliver`, no self-declared done, no state only an agent's word supports.
  The one state change an agent may execute against a SIGNED artifact — a
  reopen, on the human's word — is **mechanically attributed**: it refuses to
  run without a `--reason`, and records `via` + `reason` on the ledger row and
  in the journal (2026-07-28 flow audit: two reopens landed with neither, and
  the signer came back to "reopened" with no way to learn what happened).
- **The human judges.** The signatures, each answering a question only a
  human can: the brief (*is this the right thing to build?*), the feature's
  design (*is this the right form?* — `feature-design:<name>`, judged on
  rendered screens, never descriptions, BEFORE the behavior contract), the
  spec (*are these the right promises?*), the shared visual artifacts
  (*does it still look right?* — design system / components on drift), and
  acceptance (*is the proven thing what I wanted?* — which includes its form:
  acceptance refuses past an unsigned or drifted design).

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
| Feature design | `presentation/<name>/*Screen.kt` | `feature-design:<name>` | the *form*: the feature's own screens, signed on rendered output. Derives from **briefs only** (legacy features never sprout retro-governance): exists iff the brief declares `"screens": true` OR screen files exist on disk. Binds `*Screen.kt` only — a ViewModel edit during a legitimate build is never design drift. Undrafted (no files) → unresolvable: not signable, not in the human's queue — the *agent's* work |
| `touches` / `screens` | ```json cmp:feature``` block in the brief | declaration only | `touches`: the artifacts this change expects to invalidate; hashes enforce, declaration lets the console tell *as-planned* from *undeclared blast*. `screens: true`: this feature has a UI surface — holds the design gate before any screen file exists |
| Comment | `qa/comments.json` | advisory | human feedback with a defined path back into plan/spec/code |
| Journal | `qa/approvals.log.jsonl` | history only | **append-only memory** of every approve / reopen / accept: `{at, verb, artifact, via, reason?, feature?}`. The snapshot (`qa/approvals.json`) stays the derived STATE that gates; the journal answers *"what happened while I was away, who did it, and why"* — the question a mutable snapshot structurally cannot (2026-07-28 flow audit, finding 1: every transition overwrote the row; reopen dropped `via`, re-approval dropped `reopenedAt`). Excluded from the verified surface like `qa/comments.json` — no lane step reads it, so recording history never invalidates a receipt. Read it: `node qa/approve.mjs --log`, or the console strip's History |

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
surface an agent enters through says it.

**Then the load-bearing questions are settled before anything is drafted** — the
`grill-me` skill, [docs/features/grill-me.md](./features/grill-me.md) (Karel,
2026-09-02). On the genesis walk and every brief-lane entry, after the triage
restatement and before the brief, the agent reads what the tree already answers
(a signed brief or spec is a *closed* decision — cited, never re-asked), then
asks the **frontier** — the unsettled decisions whose prerequisites are settled
— in numbered rounds of at most five, each question carrying why it matters and
a recommended answer, and waits. It stops when no remaining question would
change the work. The grill owns no artifact and signs nothing: settled answers
become the brief's **Decisions** with their why, the human's own calls its
**Open decisions**, and the brief's signature closes them. The direct lane is
never grilled (one inline question at most, only when the restatement cannot be
made unambiguous); a bug fix, an emergency fix, or a spike, never. The rule:

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

- **A question the tree already answers is a routing error.** Signed briefs and
  specs are closed decisions — the grill cites them, never re-asks them
  (`grill-me` §1). Reopening one is a *named* proposal, not a fresh question.
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
5. **Design** (Karel, 2026-07-25: *"you never showed me the intended design
   changes — I need to approve those first"*). If the feature has a UI surface
   (declared `"screens": true`, or screen files exist), the agent drafts the
   screens against **stub data** — no domain/data wiring — registers them in
   the PreviewRegistry, renders them, and **stops**. The human judges the
   rendered screens in the gallery (candidates via `snapshot_variant` when
   there are directions to choose between) and signs `feature-design:<name>`.
   *Brief → design → spec (Karel-decided): the brief's decisions are enough
   to draw against, and the clauses are then written about a form that
   exists — clauses drafted blind to form are how a tray nobody had seen got
   promised in MEAL-09..12.* A pure-logic change has no design artifact and
   skips this step honestly.
6. **Contract.** Reopen every signed spec the brief declares it will amend
   (`--reopen feature-spec:<surface>` — sanctioned redesign, never drift).
   Write the new clauses where the behavior lives: new surface → new spec;
   changed surface → that surface's spec. The human signs the spec(s).
   *Spec-first is preserved: the contract changes before the code does.*
7. **Build.** Slices land through the stamper/preview loop. Declared blast
   arrives as planned: touched artifact hashes break, the lane FAILs naming
   them, the Features card shows *"as declared — re-approve when shaped"*.
   Undeclared drift surfaces in the **Undeclared blast** banner as plan-drift.
   The human re-approves visual artifacts on rendered output — wiring the
   signed screens from stub to real state drifts `feature-design:<name>` too;
   that re-approval is the "does it still look right" pass, in place.
8. **Prove.** Nothing to do — the card's tally climbs as citing tests land,
   and `provenDone` flips when the receipt attests the finished tree.
9. **Accept.** The button enables only at provenDone AND a signed design.
   Acceptance means the one thing only the human can say: *the proven thing is
   what I wanted* — form included.

Three signatures (brief, design, spec) rather than one mega-approval, because
they catch different failures — building the wrong thing, building it in the
wrong shape, and building the thing wrong — and a signature nobody can
actually judge in one click is a rubber stamp.

**A signature hands off — it never commands** (Karel, 2026-07-25). Every
feature carries a **derived next step** — computed from live state exactly
like `provenDone`, never claimed — naming the step AND its owner:

| Live state | Next step | Owner |
|---|---|---|
| brief unsigned | sign the brief | human |
| brief drifted | re-approve (or revert the edit) | human |
| brief reopened, redesign not yet proven | finish and prove the redesign | agent |
| brief reopened, redesign **provenDone** | re-approve the brief | human |
| UI surface declared, screens undrafted | **design**: draft on stub data, render — signed on what renders | agent drafts → human signs |
| screens rendered, design unsigned / drifted | sign (or re-approve) the design | human |
| design reopened | finish the redesign, then re-approve | agent |
| signed, no spec / no clauses | **contract**: write the clauses — *including reopening & amending every declared `feature-spec:*` still signed* | agent drafts → human signs |
| spec exists, unsigned | sign the contract | human |
| clauses uncited | build & cite | agent |
| cited, receipt missing/stale/red | prove: run the lane | agent |
| provenDone | accept | human |
| accepted | closed | — |

The design rungs sit ABOVE `proven` in the ladder: a feature whose clauses all
cite green but whose design was never signed reads *sign the design*, not
*accept* — and `--accept` refuses with the same reason.

It renders on the Features card, in `--status` (`next → …`), and **in the
approval SSE event** (`{type:"approval", artifact, feature, next}`) — so a
listening agent receives "brief signed → next: contract" and its obligation
is restate-then-draft-then-stop at the next signature, never autonomous
execution. Forward signatures (brief, spec) advance the walk; closing acts
(re-approval after drift, express-lane defaults, acceptance, reopen) enrich
nothing — they close, they do not start work.

**The card shows what is being signed** (Karel, 2026-07-25: a status shell
gives "nothing useful to approve"). The Features card renders the brief's
SUBSTANCE: its decisions section(s) inline (evidence-or-silence — no
/decision/i heading, no invented summary), the full signed document one click
away, and the declared blast stated as what it MEANS for existing features —
`feature-spec:today` reads *"this contract will be reopened & amended"*, not
a bare status.

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
Comments, and Live device stay neutral by design. **Overview** (the front door,
STUDIO-REDESIGN.md §3.7) is the exception that proves the rule: it carries a
glyph because it shows the QUEUE, whose state is exactly "what waits on you" —
green only when the queue is genuinely empty, and no glyph at all on a project
with no ledger to read. Digest is no longer a tab; it renders inside Overview.

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

**The prompt after every decision** (Karel, 2026-07-25 — "the user is prompted
what to do next but still guided through the flow"). Every decision endpoint
(approve / reopen / accept) returns a `whatNext` payload — what just happened,
the walk's derived next step, and everything else still waiting on the human —
and the console renders it as a guided prompt at the moment of the click:

- next step owned by the **agent** → *"Next — build & cite … Do you want to
  ask the agent to proceed?"* The affirmative button records the request **as
  a comment in the ledger** (the human→agent channel of record — auditable,
  the agent resolves it with a note when done), never a hidden side-channel.
- next act is the **human's own** → *"Still waiting on you: Approve
  feature-spec:today (+2 more)"* with **Take me there** — a jump to that
  artifact's signature bar (sign-where-you-read makes every queue item one
  click away).
- nothing pending → *"Nothing else waits on you — everything is green."*

The queue excludes a `reopened` artifact **while its redesign is unproven** (a
redesign in progress waits on the WORK, not the human — prompting a
re-approval would invite signing an unfinished redesign) and unresolvable ones
(a button that could only fail is not guidance). But `reopened` is one stored
state covering two opposite situations (2026-07-28 flow audit, finding 3), and
the queue keys off the DERIVED half: a reopened **brief whose feature derives
provenDone** — the redesign finished, cited, receipt-PASS against this tree —
has become exactly the human's turn, and it enters the queue as "re-approve —
the redesign is proven". One derivation (`deriveHumanQueue`, console-shell)
feeds the queue, the guided prompt, AND the governance strip (below), so no two surfaces
can disagree about whose turn it is — the disagreement between this paragraph
and the next-step table above was the audit's smoking gun. The prompt guides; it never acts on its own — the
human's click is the instruction, and it lands in a ledger like every other
judgment.

**The governance strip — status visible at ALL times** (Karel, 2026-07-28 —
"I should be able to see the status at all times on the current console").
The andon-board answer: a rail-resident block, above the nav so no tab choice
can hide it, carrying (1) one derived counts line — *N signed · M await you ·
K in redesign · J drifted* — (2) the single next human act as a jump button
("take me there" — the same sign-where-you-read jump the guided prompt uses,
fed by the same `deriveHumanQueue`), and (3) **History**: the journal's recent
events, each with verb, artifact, surface (`via`), age, and the reopen's
*reason* — so "what changed while I was away" is read off the strip, not asked
of the agent. It refreshes on the same SSE `approval`/`governance` events as
the panels. Nothing on it is claimed: counts, queue, and history are all
derivations over the ledger + journal (`governanceStripHtml`, console-shell).

**Reopen carries its why, where you click it.** The console's Reopen buttons
prompt for the one-sentence reason and refuse an empty one (the library
refuses too — the prompt just keeps the refusal from being the first thing you
see); a reopened artifact's signature bar, Approvals row, and feature-card
stamp all read the reason back from the ledger row.

**Sign where you read** (Karel, 2026-07-25 — "I see the spec but I have no way
to approve it on the screen itself"). Every governed section carries its OWN
signature control — a bar with the artifact's live status and its
Approve / Re-approve / Reopen buttons: Intent, Architecture, Design language,
Components, each feature card, and **each spec file in the Specs RTM**. The
Approvals tab remains the ledger and the queue; it is no longer the only place
a decision can be made. The human reading the contract is the human who signs
it. Each spec file binds to the **most specific** artifact governing it —
resolved from the project's own registry (id + files), never guessed from a
filename, and never the artifact with the widest file set: the exemplar's spec
binds to `exemplar-spec` (1 file), NOT to `exemplar-feature` (which lists that
same spec among its 11 clone-source files), or a click under the contract
would sign the whole feature.

**The console is live for the whole governed surface** (Karel, 2026-07-25 —
"I had to refresh the page"). The live-truth promise originally held only for
changes the console ITSELF made: SSE events fired from its own POST handlers,
and the file watcher covered `composeApp/src` (the render surface) alone. The
two most common events in this flow — **an agent writing a spec or a brief**,
and **`node qa/approve.mjs` run in a terminal** — left the page stale, which
is exactly the lie this console exists to prevent. Now `specs/`,
`docs/features/`, `qa/approvals.json`, `qa/comments.json`, and the receipt are
watched, and a change broadcasts the same events the in-place swaps listen
for: a ledger write reads as a **decision** (`approval`/`comment` — it also
wakes any blocked `approval_status{waitForDecision}`), everything else as
`governance`. All three refresh every governed panel in place — no reload, no
lost scroll — and the console's own writes suppress their file echo so an
agent listening on the stream is never double-notified for one decision.

---

## 7. Command reference

| Command | Actor | What |
|---|---|---|
| `node qa/approve.mjs --status` | either | every artifact + every feature's derived doneness |
| `node qa/approve.mjs feature-brief:<name>` | human | sign a brief |
| `node qa/approve.mjs feature-spec:<surface>` | human | sign a contract |
| `node qa/approve.mjs --reopen <artifact> --reason "…"` | human (or agent on the human's word) | sanctioned redesign — never drift. `--reason` REQUIRED; `via` + `reason` land on the row and in the journal |
| `node qa/approve.mjs --reopen-feature <name> --reason "…"` | human (or agent on the human's word) | ONE recorded change: reopens the brief + its spec + its design + declared `touches` (each only if approved), one reason, journal events grouped by feature |
| `node qa/approve.mjs --accept <name>` | human | accept a provenDone feature; refused otherwise |
| `node qa/approve.mjs --log` | either | the journal — every approve/reopen/accept with when, which surface, why |
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
- ~~**Starting a change is N reopen commands, not one.**~~ Closed 2026-07-28:
  `--reopen-feature <name> --reason "…"` reopens the brief's whole declared set
  as one recorded change (the audit promoted this from nicety to primary cause
  of "things change all over and I have no idea what the state is").

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
