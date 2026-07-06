# The AI CMP Harness — product definition & plan

> **This document is the product definition.** It supersedes the "scaffolder" framing everywhere
> it conflicts with older docs. Date: 2026-07-06.
>
> **One-liner:** `create-cmp` is a **complete AI delivery harness for Kotlin/Compose
> Multiplatform** — industry best practices at every layer, encoded as executable patterns,
> conformance gates, and generation tools, with Claude Code mechanically bound to them. A
> scaffolder is merely how the harness arrives.

---

## 1. The reframe

`create-cmp` started as "scaffold a green-building CMP app fast." That is still true, but it is
the delivery vehicle, not the product. The product is:

**An AI-ready project base where the architecture, best practices, testing strategy, and
verification workflow are machine-enforceable from commit #1 — and where the AI (Claude Code)
is given both the tools to extend the project correctly and the gates that refuse "done"
without proof.**

The core insight that dictates the architecture:

> **At scaffold time we have maximal certainty** — frozen version set, known architecture, known
> patterns — **and zero knowledge of the user's future features.** So we cannot ship the user's
> tests. We *can* ship the thing that is actually scarce: a machine-enforceable definition of
> "correct," plus tools that make new work arrive already conforming, plus test infrastructure
> that is green from creation and grows with the code.

This is a **verification layer for AI-driven delivery, scoped to one stack**. AI agents can
modify the project faster than a human can review the combined output; the harness independently
verifies structure, conformance, and behavior — with evidence — before "done" is allowed.

## 2. The five layers

### Layer 1 — Exemplars: "what right looks like," as running code

The template's example feature is the canonical pattern: one feature implemented through every
architectural layer — Screen → ViewModel → UseCase → Repository → fake/desktop DI — **with its
tests at every layer, green at creation**. Not documentation of the pattern; a running instance
of it. AI learns the pattern by reading the exemplar; conformance (Layer 2) is measured against
it.

Ships in the template today (example feature + tab generation). Gap: the per-layer test
exemplars must be complete — every layer of the example feature needs a visible, idiomatic test
so "copy the pattern" includes copying the test.

### Layer 2 — Conformance gates: best practices as executable checks

Architecture rules become tests that run in the verify lane and are **green on day one**:

- **Dependency direction** — UI never imports the data layer; domain depends on nothing
  (Konsist architecture tests, run as plain unit tests).
- **Layer naming & placement** — ViewModels/UseCases/Repositories live where the pattern says,
  named how the pattern says.
- **Every Screen** has a `testTag`ged root and a committed golden semantics tree.
- **Every ViewModel** has a test file.
- **No hardcoded design values** — colors/spacing/typography resolve from the token catalog
  (`find_drift` already checks this structurally at runtime; the conformance test checks it
  statically).

**Admission rule: a best practice that is not mechanically checkable stays out of the contract.**
Prose guidance drifts silently under AI-speed change; only executable rules hold.

### Layer 3 — Generation tools: right-by-construction, shipped INTO the project

Skills the template installs into the generated repo's own `.claude/skills/` (they travel with
the project, independent of our plugin):

- `add-feature` — stamps the full exemplar pattern for a new feature: all layers, DI wiring,
  navigation, **test skeletons at every layer**, and a golden-tree baseline.
- `add-screen`, `add-repository` — the smaller cuts of the same pattern.

This resolves the "we can't write their tests" problem: we don't write their tests — we make
every unit of new work arrive with its test scaffold attached and green, and `cmp-test` derives
the behavioral suite from the *observed running UI* afterward.

### Layer 4 — Enforcement: binding Claude Code to the contract

- **Generated `CLAUDE.md`** — the contract: the patterns, the definition of done, how features
  are added (use the skills), and the rule that *"you are not done until the verify lane passes
  and produces a receipt."*
- **Generated `.claude/settings.json` hooks** — a Stop hook that runs (or demands) the verify
  lane, so "no done without verdict" is mechanical, not honor-system.
- **The verify lane** — one command in the generated repo (`qa/verify.mjs`, surfaced as
  `npm run verify` / a Gradle task) aggregating: build green → unit tests → conformance tests
  (Layer 2) → golden-tree snapshot diffs → token drift → a11y audit → (device present) Appium
  smoke — into a single **typed PASS/FAIL verdict + evidence-pack JSON** (what changed, what was
  checked, each verdict). The evidence pack is the harness's receipt artifact.
- **Committed golden baselines from scaffold time**, so drift is detectable from commit #1.

### Layer 5 — Observability: cmp-inspector (shipped)

The AI's instrument for verifying **structure, not appearance**: hierarchy, geometry, resolved
design tokens as JSON — file, live-on-device, and uiautomator tiers; `prove_change` as the
verified dev loop. Already built and verified.

## 3. The key architectural decision

**The contract lives in the generated project, not in the plugin.** Our plugin (8 skills +
`cmp-inspector` MCP) is the toolchain for operating the machinery; the template-embedded
CLAUDE.md + hooks + in-project skills + conformance tests are the product. They work for any
Claude Code user who scaffolds an app — zero plugin required — and keep working whichever agent
is doing the modifying. The verification layer sits *in the system being modified*, independent
of the agent. (This is deliberately the shape of system-level verification thinking in
miniature.)

## 4. Phases (each independently shippable)

### Phase 1 — Codify the contract *(cheapest, highest leverage)*

- Write the generated-`CLAUDE.md` template: patterns, definition of done, feature-addition
  workflow, verify-lane rule.
- Build the verify-lane orchestrator (`template/qa/verify.mjs` or equivalent): unify the
  existing pieces (green build, unit tests, snapshot diff, token drift, a11y) into one command →
  typed verdict + evidence-pack JSON.
- Engine: `create` stamps both; `verify` subcommand grows an `--evidence` output.

### Phase 2 — Conformance gates

- Add Konsist to the template's version catalog (dev/test only) + the architecture rule tests.
- Add the structural conformance tests (testTag roots, golden-tree presence, ViewModel-test
  presence, no-hardcoded-token static check).
- All green at scaffold time; wired into the verify lane and the shipped CI workflow.

### Phase 3 — In-project generation skills

- `template/.claude/skills/add-feature` (+ `add-screen`, `add-repository`): stamp pattern +
  per-layer test skeletons + golden baseline; end by running the verify lane.
- Feature-toggle aware (skills must respect the flags the project was stamped with).

### Phase 4 — Mechanical enforcement + evidence packs

- Generated `.claude/settings.json` Stop-hook wiring (consent-noted in the generated README).
- Evidence-pack format finalized (JSON schema, stored under `qa/evidence/`, referenced from CI).
- `prove_change` verdicts embedded into the evidence pack when the live tier is available.

Ordering rationale: enforcement (4) is only trustworthy once 1–3 make "verify" meaningful. If
work is interrupted after Phase 2, the product is still coherent: *"scaffolds with an
enforceable architecture contract and a one-command verify lane."*

## 5. Explicitly parked (unchanged)

Recipes, the release lane, brownfield `add shared-module`, and the upgrade-bot subscription
remain parked behind the harness. They revive only when demand is proven externally.

## 6. Relation to other docs

- [`ROADMAP.md`](./ROADMAP.md) — public roadmap, reorganized around the harness.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — the engine's deterministic-stamp design (unchanged).
- [`INSPECTOR-PLAN.md`](./INSPECTOR-PLAN.md) / [`LIVE-VIEW-PLAN.md`](./LIVE-VIEW-PLAN.md) —
  Layer 5 detail.
- [`USAGE.md`](./USAGE.md) — the single usage entry point.
