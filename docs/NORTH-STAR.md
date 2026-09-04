# NORTH STAR — the product we are building

> **Status: the governing document.** Written 2026-09-04 by the product owner and head
> architect, from everything decided, measured and built up to that date. **When any other
> document in this repository — plan, proposal, design, roadmap, principle, memory — conflicts
> with this one, this one wins, and the other one is the bug.** Older documents that this
> supersedes in whole or in part carry a banner saying so; the ones that stay in force are
> listed in §12 with the exact scope they keep.
>
> **How it is used.** Every feature, every PR, every brief answers §10's fit test against this
> document before it is built and names its answer in its description. A change that cannot
> name the goal it serves is not built. A change that serves a goal by breaking a guarantee in
> §8 is not built either. This is not ceremony: it is the only way a one-maintainer product
> with four parts stays one product.
>
> Public and tracked. The business model behind the free/attested line is internal and lives
> in `docs/research/VISION.md` §5; this document states only what the repository already
> states about it.

---

## 0. In one paragraph

**We make "done" something an AI coding agent cannot claim — only earn.** The definition of
done is declared up front, for the stack the team actually runs: what a promise looks like,
which tier of test can observe it, which artifacts a human signs, which rules the architecture
obeys. The harness then refuses "done" until the promise is proven by real execution and
written into a receipt bound to the exact bytes it proves — a receipt anyone can check from the
repo alone, offline, and a notary can attest. Inside that gate the agent moves fast: it sees
what it builds, it is told what it broke by name, it is never left waiting on nothing, and it
never signs anything. Mobile — Kotlin/Compose Multiplatform — is where this was born and
remains the reference product, the place the harness has *eyes* as well as a gate. Everything
is free and lives inside the repository, independent of any agent vendor; organisations that
need accountable, auditor-ready evidence of AI-driven change pay for that attestation.

The whole product in one line of dependency:

```
  spec (declared up front) → agent builds → lane proves by execution → receipt (hash-bound)
        → human signs what only a human can judge → notary attests → evidence
```

---

## 1. What we are trying to achieve — the goals, ranked

Six goals. When two conflict, the lower number wins. Every feature names the ones it serves.

| # | Goal | The sentence that tests it |
|---|---|---|
| **G1** | **Done is derived, never claimed.** | Is there any state in the product that only an agent's word supports? If yes, that state is a defect. |
| **G2** | **Agents move fast and never get stuck.** | Between the prompt and the merged change, where did the wall-clock go — into the change, or into ceremony, stalls and waiting? |
| **G3** | **The architecture and the definition of done are declared up front, per stack, and slot in.** | Can a team on a different stack declare theirs in data and get the same loop, hook, receipts and console — without forking a line of the core? |
| **G4** | **Evidence is portable trust.** | Can a stranger, offline, from the repo alone, check that this receipt attests these bytes — and can a notary attest that check without running our code? |
| **G5** | **Mobile never regresses, and is the reference for every abstraction.** | Does a Compose app stamped today do everything it did yesterday, with the same commands, and is every neutral interface derived from what mobile already does? |
| **G6** | **Ubiquity: free, in-repo, agent-independent.** | Delete the tool, the plugin and the vendor — does the contract still enforce itself in the repository? |

**The tension the product exists to resolve is G1 against G2.** A rule that only adds rigour
grinds the loop to a halt; a rule that only removes friction lets blind gates through. The
essence stated in `docs/PRINCIPLES.md` — *a spec-driven workflow with automated proof, in
which agents move fast and never get stuck* — is exactly this pair, and every mechanism in the
product must do both at once or it is the wrong mechanism. The measured episode that fixed the
ranking: in the week of 2026-09-01 the product was, in the owner's words, unusable — not because
its gates were wrong but because each signature invalidated the receipt, each receipt cost a
lane, and agents stalled between. 21 commits split 7 code / 8 ceremony / 6 docs. A product
that is right and unusable has failed G2 and therefore failed.

---

## 2. The problem, and why now

1. **Agents outrun review.** An agent modifies a repository faster than a human can read the
   combined output. The only review that scales is one the agent cannot argue with: a
   machine-enforced definition of done, embedded in the system being modified.
2. **"Done" is claimed.** Every agent product ends its turn with a sentence. A sentence is not
   evidence. The first implementation of our own feature flow bolted an agent `--deliver`
   claim onto a product whose whole thesis is that agent claims are worthless until proven;
   it was named clunky, an afterthought, and removed. That lesson is structural (§7).
3. **The agent vendor cannot be its own notary.** Google, JetBrains and Anthropic will ship
   agent eyes. They structurally cannot ship *independent* attestation of their own agents'
   changes. Independence has to live in the repository and in a third party.
4. **Every stack rebuilds governance by hand.** When a Kotlin backend adopted the harness in
   2026-09, it forked 11 files of the spine — 4 byte-identical, 6 rewritten, the approvals
   model alone 1,636 lines — because the core knew what a Compose app is. The harness was
   agnostic by nature (receipts, specs, signatures, the loop are not mobile) and mobile by
   construction. That is a dependency-direction defect, not a feature request, and fixing it
   is what makes G3 possible.
5. **Regulation is arriving.** Auditable evidence of AI-driven change is becoming a forced
   purchase. Evidence bound to real execution — not to a claim — is the only kind that will
   survive an auditor's first question.

---

## 3. The products — four parts, one dependency direction

```
┌────────────────────────────────────────────────────────────────────────────┐
│  create-cmp — the mobile product (Kotlin / Compose Multiplatform)          │
│  scaffolder · cmp-doctor · cmp-upgrade · the `cmp` Stack Profile           │
│  the eyes: preview registry + headless render, live inspector, drift,      │
│  runtime, data — as PROVIDERS behind the harness's interfaces              │
└───────────────┬─────────────────────────────────────┬──────────────────────┘
                │ stamps core + profile               │ implements the protocol
                ▼                                     ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  THE HARNESS — stack-agnostic, free, vendored into every repo              │
│  profile loader · runner · journal · inputs-hash · receipt · lock ·        │
│  Stop hook · liveness · spec↔citation binding · hash-bound approvals ·     │
│  the walk · grill-me · orchestrator doctrine · Rule 0/1/2 instruments      │
│  the CONSOLE (neutral section types) · one MCP server (neutral vocabulary) │
└───────────────┬────────────────────────────────────────────────────────────┘
                │ receipts name harness + pack
                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  GATEKEEPER — the notary: re-checks receipts on every PR, attests them      │
└────────────────────────────────────────────────────────────────────────────┘
```

**Arrows point down. The harness never points up.** Nothing in the core imports a profile by
name; nothing in the core knows a path, a tier name or a step name of any stack.

| Product | What it is | Who it is for | Never |
|---|---|---|---|
| **The harness** (working name; naming is open, §11) | The evidence core, the enforced workflow loop, the profile protocol, the console and the MCP server. Copied byte-identical into `qa/` so a receipt is checkable air-gapped. | Every team, every stack, every agent | Knows a stack. Ships a default profile. Adds a gate without a plant. Depends on a network to validate a receipt. |
| **Stack Profiles** | The unit of distribution. One package that answers *what is a stack, to this harness*: layout, artifacts, architecture rules, tiers, steps, ladder, review model, plants, providers — **and the golden tree that stack is scaffolded from**, so the tree and the layout it claims cannot disagree. `cmp` is the first of several. | Platform engineers who own a stack across many repos | Is imported by name. Owns a console tab. Earns a rung without plants. Ships a golden tree its own lane cannot take to L1. |
| **create-cmp** | **One scaffolder among several.** The deterministic stamper of a proven-green Android + iOS app, plus the `cmp` profile and the eyes. The on-ramp is no longer its own: `harness init` (the CLI) owns adoption for every stack, and `attach` stays the Compose-repo advisor. | Mobile teams and the agents working in their repos | Regresses. Is the *home* of the harness rather than its first adopter. Is the name of the product. |
| **Gatekeeper** | The hosted notary: re-checks a PR's receipt with the same library the repo uses, shows the pack beside the rung, attests. Checking is free; accountable attestation is the paid service. | Organisations that must show what their agents changed and how it was proven | Attests a receipt whose pack it cannot vouch for. Becomes a paywall on checking. |

**The studio is not a fifth product.** It is the console (in the harness, neutral) plus the
mobile providers (in the `cmp` profile). Its identity — *every capability an IDE renders as
pixels for a human, served as structure to an agent* — is unchanged. What changed on 2026-09-04
is where the code lives, and that the console can now render a stack that has no screens and say
so honestly.

---

## 4. Who uses it — and what each is promised

| Actor | What they do | What the product promises them |
|---|---|---|
| **The agent** (the primary operator) | Reads the contract, builds, runs the fast tier continuously, runs the lane once at done, holds a liveness claim while working, never signs | It will be told what it broke, by name, in seconds. It will never wait on nothing. It will never be asked to re-prove what did not change. It can refuse an instruction whose proof cost exceeds its value and say so. |
| **The human signer** (developer, product owner) | Answers the questions only a human can: is this the right thing, the right form, the right promises, is the proven thing what I wanted | Nothing generic is ever put in front of them to sign. A signature binds bytes; it is re-asked only when bytes move. Twelve signatures for zero changes is a defect, not diligence. |
| **The profile author** (platform engineer with N repos) | Declares the stack once: layout, tiers, artifacts, rules, steps, ladder, plants | The declaration slots in without forking the core. A core fix reaches every repo by version. Receipts are comparable within the pack. |
| **The organisation** (the evidence buyer) | Needs to show an auditor what its agents changed and how that was proven | Receipts attest execution, not claims. The format is open. The pack is named on every receipt so a mobile L2 and a backend L2 are never confused. |

---

## 5. The workflow we enforce — spec-driven development, one loop

There is exactly one loop, and every change is that loop over a subset. Anything that proposes
a second flow is wrong by construction (the lesson of `docs/CHANGE-FLOW-DESIGN.md`).

> **Decide → Design → Audit → Contract → Build → Prove → Sign**

| Stage | What it is | Core (mechanic) | Profile (model) |
|---|---|---|---|
| Decide | why this, what was rejected, what it disturbs — the *grill* before the first line, the brief in `docs/features/` | grill-me; briefs; settled decisions are closed | which decisions are load-bearing for this stack |
| Design | what it looks like, judged on rendered output, never prose | a signed artifact exists iff the change has a design surface | what the surface is (mobile: screens; backend: the contract diff) |
| Audit | attack it before anyone signs it — the edge cases | a minimum count before signature, in the unsigned round | the section name, the minimum, the question bank |
| Contract | precisely what, testably: clauses `- **ID-NN** [tier: t]? — Given / When / Then` in `specs/*.spec.md` | the clause grammar; citation binding; tier-must-observe; both-direction coverage | where specs live; tier names; which tier observes which |
| Build | code, tests, goldens — the agent's work, proven interim by the fast tier | runner, bounds, cache, affected, liveness | the steps, their cost, which need a device |
| Prove | the lane, once, at done → receipt at the required rung | receipt, hash, validation, freshness, plausibility, ladder derivation | the rungs and what earns them |
| Sign | human judgment on hash-bound artifacts | signature on hash; status derivation; reopen scoped to what moved | which artifacts, in what order |

**Genesis is this loop run for the first time over everything**, in definition order — intent →
first feature brief → architecture → exemplar spec → exemplar → design system → components — so
that *nothing generic ever gets signed*. That is the rule that makes the signature mean consent
and not ceremony.

**The roles are fixed.** The harness proves; the agent produces; the human judges. The agent
holds no signing verb. The one state change an agent may execute against a signed artifact — a
reopen, on the human's word — is mechanically attributed.

**Doneness is derived, at four points from one chain:**

```
drift anywhere → approvals gate FAIL → lane FAIL → no PASS receipt attesting the tree
             → provenDone false everywhere → nothing acceptable
```

**Both directions of coverage, and the tier that can observe.** A live clause with no citation
fails. A citation with no clause fails. A citation that is not bound to a test within the
binding window does not count. A clause that declares the tier it needs — *a JVM test cannot see
a notification channel; a HashMap cannot see a row lock* — must be cited from a tier that can
observe it, or it fails by name. The core knows the rule; the profile knows the tiers.

---

## 6. "Define your architecture for your stack up front, and it slots in" — the mechanism

This is G3 made concrete. A stack is declared, not discovered, and the declaration is data the
core reads through one protocol.

1. **The manifest names the profile.** `qa/harness-manifest.json` carries `profile.id`. An
   absent or malformed manifest is **refused, never defaulted** — a stamped app is told to run
   `upgrade --harness`, a foreign repo is told to run `attach`, which interviews. A harness that
   guessed would be a harness that lied quietly on the second stack it met.
2. **The profile is one vendored directory** — `qa/lib/profiles/<id>/` — exporting `id`,
   `protocol`, `steps(ctx)`, and growing the nine declarations one PR at a time: **layout**
   (where specs, sources, tests, receipt, arch doc are), **artifacts** (what a human signs, in
   what order, hashed how), **architecture** (layers, allowed dependencies, rules as tests),
   **tiers** (names, ordering, which observes which, `forFile`), **steps**, **ladder** (rungs,
   names, what earns them — no ladder means no rung, the honest grade), **review** (what Design
   and Audit are here; the router's stack rows), **plants** (Rule 0/1 violations the instrument
   runs forever), **providers** (the eyes, if the stack has any).
3. **The core loads *the* profile the manifest declares** through the loader and never by name.
   A lint fails the suite on any core import of a profile module.
4. **Architecture rules are tests the lane runs**, and the architecture document's derived
   sections are regenerated from the rules — the doc is simultaneously the signed spec, the
   mirror of the code now, and the drift surface between them. That three-in-one is the
   console's identity for every section: *authored form, derived truth, drift* — never a pretty
   doc beside a dashboard.
5. **Receipts name the builder**: `harness {version, digest}` and `pack {id, version}`.
   Receipts are comparable within a pack and explicitly not across packs; every surface that
   shows a rung shows the pack.
6. **The profile is inside the lock region.** An edited profile cannot certify itself (Rule 2).
7. **Rules 0, 1 and 2 apply to profiles.** A profile ships with plants, run by
   `qa/framework-check.mjs` through the real runner in seconds and restored byte-for-byte, or it
   ships without a badge.

The console follows the same shape: **section types are the core's, providers are the
profile's, and there are no profile-owned tabs.** The test for a section type is whether a
second profile could plausibly implement its provider. Surface gallery, inspector, drift,
runtime, data and goldens pass it (mobile renders screens; a backend renders operations and
traces). One MCP server carries one neutral vocabulary, and a tool is listed only if the
profile provides for it.

The patterns this borrows are named, so nobody reinvents them: Terraform's core/provider rule
and versioned protocol; Nx's generators/executors/inferred config/migrations; Grafana panels
over datasources, Storybook's shell over renderers, VS Code's Outline over a per-language
provider; ArchUnit/Konsist for rules-as-tests; SLSA for levels defined by the framework and
provenance that names the builder; dpkg/npm packlists for a manifest that says exactly what
shipped. What is deliberately *not* borrowed is process isolation and network fetch on the
receipt path: a profile is in-process ESM, because a receipt must be checkable offline from the
repo alone.

---

## 7. How the product is built — the agentic operating model

The product enforces a way of working on its users, and we build it the same way. These are
the rules that came out of measured episodes, each of which cost hours; the full form with
its episode is `docs/PRINCIPLES.md` and `docs/GATE-RULES.md`.

**The seven principles** — derived, never claimed · prove the instrument before you read it ·
the layer you changed cannot certify itself · proof costs what the change costs and never runs
silent · never wait on nothing · a signature binds content, a decision is closed · one record,
read first.

**The three gate rules** — Rule 0: prove the framework returns, both ways, in seconds, before
pointing work at it. Rule 1: a gate is not wired until a *kept* plant makes it fail by name and
its measured cost has chosen its stage. Rule 2: the layer you changed cannot certify itself —
library → full suite; template or harness → a fresh app stamped; environment-sensitive → the
environment.

**The orchestration pattern** — *keep reasoning cheap and reversible; gate the irreversible
work.* Reasoning stays with the orchestrator; execution is delegated to peer-strength agents and
comes back as a claim the orchestrator gates by running the consumers itself. A weaker model is
not used for execution: the tiering is about context separation, not cost.

**Standing to refuse on cost.** An orchestrator may refuse an instruction whose proof would
cost more than the change is worth, and must say so with the number. Rigour written as prose
does not refuse; instruments do (`--budget-ms`). This replaced a blocking brief-field that was a
code smell: the affordance was missing, not the discipline.

**Progress is visible while it happens.** An agent doing long work holds a named, heart-beaten
claim (`plan --hold / --beat / --release`); the Stop hook's *advice* changes when a live hold
explains an absent receipt — its *verdict* never does. Two blind spots — an agent killed while
healthy, and a hook crying wolf mid-build — were one mechanism.

**Ceremony is measured and cut.** Signatures batch: N signatures are one write and one receipt
invalidation; sign *before* the final lane, not after. Re-ask only what moved, by hash. A
reopen walks back only what it amends.

**Trunk-based development.** One piece in flight. A PR merges the moment its gate is green —
rebase, delete the branch, pull — and only then is the next piece branched. Stacks on GitHub are
long-lived branches by another name and auto-close when their base is deleted.

**Release gating.** A release is gated at the device rung (L2) on a real headless emulator on the
debug build; device rows SKIPped is never reported as fleet PASS. The machine is checked for
another lane before a device tier runs. Publishing is unattended through ambient auth; the agent
never handles a token.

---

## 8. Guarantees — what we promise and never break

These are binding on every PR. Breaking one is not a trade-off; it is a bug.

1. **The contract lives in the repository.** Delete the CLI, the plugin, and the vendor's agent:
   the hook, the lane, the receipts and the specs still enforce themselves.
2. **A receipt is checkable offline, from the repo alone, with the vendored library.** Nothing
   on the receipt's validation path may need a network.
3. **Nothing launched free is ever paywalled.** Checking, review, the studio, the harness, every
   profile we ship, the local loop — free, forever.
4. **The receipt format is open.** We monetise a service around the format, never the format.
5. **Mobile never regresses.** Every PR that touches the locked region is gated by a fresh
   Compose app at L2. Every neutral interface is derived from what mobile already does, then
   checked against a second stack on paper before it ships.
6. **Nothing in the core knows a stack.** No profile import by name, no path, no tier name, no
   step name. Linted.
7. **No default profile.** An absent manifest is refused and the user is told exactly how to
   make one.
8. **No new gate without a kept plant and a measured cost.** The product needs less mechanism,
   not more; a step that adds a gate is presumed wrong until its plant fails by name and its
   cost has chosen its stage.
9. **Strongest-true-case honesty, test-pinned.** A SKIPped tier is named, never counted green.
   `ERROR` is a verdict. A profile with no calibrated plants earns no rung. A `cmp` L2 and any
   other pack's L2 are different claims and are shown as such. Notarisation is not examination
   and is never described as it.
10. **The agent holds no signing verb.** Ever. Reopen is attributed with a reason.
11. **Nothing generic gets signed.** Every governed artifact reaches approved through the
    human's own choices or an explicit, recorded "the defaults are fine".
12. **A signature binds bytes and is re-asked only when bytes move.**

And what we never build: a human GUI or IDE; a coding agent; task-level PR review (Sonar and
Qodo's turf); eyes for a stack nobody has asked for (the *slot* exists; the providers are
someone's demand to prove); a profile registry or a docs site before a second external profile
exists; a second workflow beside the one loop.

---

## 9. The road — stages, exit criteria, triggers

Every stage has an exit criterion that is a measurement, and a trigger that is a fact. Nothing
is built before its trigger; the runway owns the calendar. Migration is **by subtraction from
the current tree, never a second harness built beside the first**, with the mobile fleet green
at every PR.

| Stage | What | Exit criterion (measured) | Trigger | State on 2026-09-04 |
|---|---|---|---|---|
| **0 — the lane seam** | `pack` in receipts; manifest v2 + loader; absent manifest refused; Compose glue into `profiles/cmp/`; parameterise `spec-coverage`, `approvals`, `feature-brief`, `arch-doc`, `verify` markers, `inputs-hash`, `receipt-validate`, `affected-tests`, `framework-check` plants | ~~De-fork count 11 → ≤ 3 against the backend's fork~~ **RETIRED 2026-09-04** — payment-blueprint is a separate track and is not re-vendoring until this work is finished, so the criterion named a measurement we had decided not to take. **Replaced by:** a second profile authored from `harness init` output and the README, *without opening core source* (PACKAGE-SPLIT A5). Fleet L2 green per PR. | taken — a dependency-direction fix | PRs 1–3 landed (`f6363c1`, `94905f6`, `647c45d`); PRs 4–7 next |
| **0.5 — the console into the harness** | Provider interface named from the existing tool contracts; backend provider sketched on paper first; console + MCP server move into the harness; section types formalised; tool listing profile-driven; `cmp` providers extracted; neutral skills moved | The console renders a stamped Compose app exactly as today **and** a manifest-only backend fixture with every section present and honest | Stage 0 exit; before Stage 1 so the package boundary is drawn with the console inside | not started |
| **1 — distribution** | The harness as its own package, console included; `create-cmp-cli` depends on it; the lock becomes a stamper-written manifest; pin + fetch + cache as an option, vendored stays default | A backend repo installs the harness without create-cmp; a core fix reaches it by version bump | Stage 0.5 exit **and** an ADR on what a pinned receipt means versus a vendored one | blocked on the ADR and the name |
| **2 — profiles as artifacts** | Profile versioning and protocol handshake; `extends`; per-profile framework-check as the badge floor; Gatekeeper reads `pack`; governance rows in the router from the profile | A second profile authored by someone who is not the maintainer passes framework-check and mints a receipt Gatekeeper accepts | a second external profile, or the pinned port-demand issue | — |
| **3 — fleet** | `fleet-check` / `upgrade --harness` across a pinned fleet; the console as a fleet view | 10 repos upgraded by one command; receipts comparable within pack | first evidence prospect with more than 10 repos | — |

**In parallel, and unchanged in intent:** the mobile studio modules (attach ✓, runtime
feedback, device-as-structure, profiling, data inspectors, release lane) proceed as
*providers* of the `cmp` profile behind the harness's interfaces, each terminating in a receipt.
Gatekeeper's hosted deployment stays deferred until real user traction; its code is complete.
Discovery work (getting found by a cold agent through at least two independent surfaces) runs on
its own plan of record.

**Does this hold at 100 repos?** Only through Stages 1–3: a versioned harness, versioned
profiles with a handshake, a manifest that says exactly what shipped, one command that upgrades
a pinned fleet, and receipts comparable within a pack. Stage 0 alone gives one repo a clean
seam; it does not give a fleet a spine. That is why the stages are ordered as they are and why
none is skipped.

---

## 10. The fit test — what every feature and PR answers

Answer all eight, in the PR description, in one block. A "no" to 4, 5 or 7 stops the PR. A
change that cannot answer 1 is not built.

1. **Goal.** Which of G1–G6 does this serve? Name them. If none — why does it exist?
2. **Derived or claimed.** Does this introduce any state only an agent's word supports? A
   status, a "done", a cost, a verdict that is asserted rather than computed is a defect.
3. **Mechanism.** Does this add a gate, a signature, a step, a file to sign? If it adds a gate:
   where is the kept plant, what did it cost, which stage did the cost choose? The presumption
   is against adding.
4. **Stack knowledge.** Does the core learn a stack fact — a profile import, a path, a tier
   name, a step name? If yes, it belongs in the profile.
5. **Receipt meaning.** Does this change what a receipt claims, its schema, or its
   comparability? If yes, an ADR first.
6. **Proof at altitude.** Suite and `scripts/framework-check.mjs` on every commit. Fleet L2
   (`scripts/fleet-check.mjs --min-level L2`) when the locked region or the template moved. Name
   what consumes the change and say that you ran it.
7. **Mobile.** Does a Compose app stamped from this tree do everything it did before, with the
   same commands? What is the de-fork count before and after?
8. **Loop cost.** What does this do to the wall-clock between prompt and merged change — the
   fast tier, the lane, signatures, waiting? Measured, not estimated.

The one-line form for the PR body:

```
North star: G2 G3 · mechanism −1 · core learns no stack fact · receipt unchanged ·
proof: suite 1402/1402, framework-check 5.2 s, fleet L2 PASS · de-fork 11→9 · loop: −1 lane per signing round
```

---

## 11. Decisions — taken, and open

**Taken (dated; a settled decision is cited, never re-asked):**

| Date | Decision |
|---|---|
| 2026-07-06 | create-cmp is a delivery **harness**, not a scaffolder; the contract lives in the generated project |
| 2026-07-13 | The studio thesis: pixels to the human, structure to the agent; the agent vendor cannot be the notary; free-first, one attested service; strongest-true-case honesty, test-pinned; trigger-gated building |
| 2026-07-19 | Genesis: nothing generic ever gets signed; every console section is authored form / derived truth / drift |
| 2026-07-25 | One loop for all post-genesis work; doneness derived; the agent holds no signing verb; Audit is a stage before signature |
| 2026-09-02 | Evidence economics: the loop is made cheap, visible, honest — `ERROR` verdict, per-step deadlines, stages, reopen scoped to what moved, spine/pack split |
| 2026-09-03 | PRINCIPLES and GATE-RULES adopted; the lock region covers the lane's own tests and the declarations it reads; the evidence ladder is the profile's |
| 2026-09-04 | Rule 0 ships to adopters as an instrument; agent liveness; the orchestrator has standing to refuse on cost; signatures batch |
| 2026-09-04 | **The harness becomes stack-agnostic by inverting one dependency.** (1) Governance is mechanic-in-core, model-in-profile. (2) The `cmp` profile is isolated completely, studio included; the console lives in the harness as neutral section types; no profile-owned tabs. (3) No default profile — absent manifest refused; derived for stamped apps, interviewed for foreign repos. (4) Stage 0 starts, gated: fleet L2 per PR, suite + framework-check per commit, de-fork count in every PR. |
| 2026-09-04 | **The cross-stack rule is amended.** The earlier rule (no cross-stack port without a pinned-issue trigger) is kept for the *eyes*: no renderer or inspector for another stack is written without countable demand. It no longer applies to the *harness*, whose agnosticism is a dependency-direction fix triggered by the in-house second stack. This document is where that amendment is recorded. |
| 2026-09-04 | Trunk-based development: merge each PR the moment its gate is green, before the next is branched |
| 2026-09-04 | **The profile is the unit of distribution; a scaffolder is a consumer of one.** Falsified by the first foreign stack (a Ktor backend, adopted with **zero core edits**), which also showed the packaging — not the seam — is now the bottleneck. Twelve decisions in `docs/proposals/PACKAGE-SPLIT.md`: one repo with workspaces; the harness, the CLI, each profile and each studio split into packages under independent semver with `protocol` carrying compatibility; every profile carries its golden tree, which must reach L1 under its own lane or it does not ship; `harness init` becomes the on-ramp for every stack; the harness is named **`prooflane`**; Phase A ships as 0.25.0 before the rename. |

**Open (each named with what it blocks):**

| # | Decision | Blocks | Owner |
|---|---|---|---|
| ~~O1~~ | ~~Name the harness and its console.~~ **CLOSED 2026-09-04: `prooflane`.** Claim `prooflane`, the `@prooflane` scope and `create-ktor` in one pass; `create-cmp` on npm belongs to someone else and is treated as permanently lost. **`prooflane@0.0.1` and `create-ktor@0.0.1` claimed 2026-09-05.** The `@prooflane` *scope* still needs a free npm organization created at npmjs.com — a web action the CLI cannot perform — and Phase C of PACKAGE-SPLIT is blocked until it exists. | — | — |
| O2 | **The Stage 1 ADR** — what a pinned (fetched) receipt means versus a vendored one; whether Gatekeeper accepts both and how it shows the difference. | Stage 1 | architect drafts, Karel signs |
| ~~O3~~ | ~~The `ktor-backend` profile.~~ **CLOSED 2026-09-04** by the fuelled-api adoption report: a backend profile is ~230 lines and needs no core change. It comes into this repo as the suite's second profile (PACKAGE-SPLIT A4). | — | — |
| O4 | **The receipt-format ADR** — `cmp-evidence/1` is renamed to the `prooflane` name with the reader accepting both (PACKAGE-SPLIT D3). What a receipt in the old format means once the new one exists, and what Gatekeeper does with each. | the rename, in Phase C | architect drafts, Karel signs |

---

## 12. Precedence and the document map

This document governs. The documents below stay in force **for the scope named** and defer to
this one everywhere else. Each carries a banner to that effect.

| Doc | Keeps authority over | Defers on |
|---|---|---|
| `docs/proposals/AGNOSTIC-HARNESS-ARCHITECTURE.md` | the architecture in detail: the nine declarations, the profile protocol, the console's provider interface, the migration order inside Stage 0, the industry-pattern ledger | goals, guarantees, the fit test, the cross-stack rule |
| `docs/proposals/PACKAGE-SPLIT.md` | **packaging and how a stack arrives**: the package map, the profile-is-the-unit inversion, the golden-tree gate, profile resolution, the name, and phases A–E | goals, guarantees, the fit test; the profile protocol itself (AGNOSTIC §5) |
| `docs/CHANGE-FLOW-DESIGN.md` | the one loop, the triage router, the primitives, the roles | which stack facts are the profile's (§5 table) |
| `docs/GENESIS-FLOW-DESIGN.md` | the definition order, the express lane, nothing-generic-signed | the same |
| `docs/PRINCIPLES.md`, `docs/GATE-RULES.md` | the engineering doctrine with its episodes and enforcement | ranking against the goals |
| `docs/HARNESS-PLAN.md` | the mobile product's five layers as built in 2026-07 — historical product definition | product identity (it framed the harness as CMP-only; §3 here replaces that) |
| `docs/ROADMAP.md` | the public pillars for users and contributors | sequencing and triggers (§9 here) |
| `docs/EVIDENCE-ECONOMICS-PLAN.md` | the execution record of the 2026-09 cost work | — |
| `docs/research/VISION.md` *(internal)* | the business model, the money, the launch and consulting priorities | product and architecture identity (its §1 paragraph is superseded by §0 here; its §6 cross-stack rule is amended per §11) |
| `docs/research/GATEKEEPER-PRODUCT.md`, `AGENTIC-MOBILE-STUDIO.md` *(internal)* | the notary's product definition; the mobile studio's module briefs | the layering — the studio is console + providers (§3) |
| `docs/research/launch/discovery-plan.md` *(internal)* | getting found | — |

**Conventions this document follows and expects:** no hand-counted numbers in prose — counts
come from `scripts/ground-truth.mjs`; a claim names the command that proves it; a settled
decision is cited, never re-litigated; the document is updated when a decision changes, not at
the end.

---

## 13. How to read this in one minute

If you only keep six sentences: **Done is earned by execution, never claimed.** **The agent
must move fast and never be stuck, or the product has failed.** **The stack is declared up
front, in a profile, and the core never learns a stack fact.** **A receipt is checkable
offline and names what produced it.** **Mobile is the reference and never regresses.**
**Everything is free and lives in the repo; accountable attestation is the service.**
