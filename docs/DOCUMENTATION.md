# Documentation Charter

> **What this is.** The holistic map of every document in create-cmp: what exists, what each
> is for, how they interlock, which industry standards they implement (and where we
> deviated), and the rules for adding new docs so the pattern stays coherent as the project
> grows. If you are wondering "where does this content go?" or "which doc is authoritative
> for X?" — the answer is here.

Status: living · Owner: harness maintainers · Established: 2026-07-06 · Rebuilt: 2026-08-20
(after `docs/history/` was introduced; this doc pins no version numbers — `scripts/ground-truth.mjs` does)

---

## 1. The two documentation universes

create-cmp ships documentation into **two different worlds**, and every doc belongs to
exactly one:

| Universe | Location | Reader | Governing question |
|---|---|---|---|
| **Harness repo** | `/docs`, repo root | People (and AI sessions) building create-cmp itself | "How do we build and evolve the harness?" |
| **Generated project** | `/template/**` — stamped into every scaffolded app | Developers and AI collaborators working *in* a generated app | "How do I extend this app correctly, with proof?" |

**Rule:** content about *the harness as a product* (plans, roadmaps, strategy, engine
internals) lives in the repo universe. Content a generated app's team needs *without ever
having heard of create-cmp* lives in the template universe. When a concept spans both
(e.g. the test pyramid), the repo doc is **normative** (defines the standard) and the
template doc is **applied** (teaches it in-project) — they are sister docs, linked, never
merged.

---

## 2. Document map — harness repo

`docs/` is now **tiered by currency**, not just by topic — three ways a document can sit
here:

1. **Doc of record** (`docs/*.md`, tracked) — current, describes the tree as it stands today.
2. **`docs/history/`** (tracked) — superseded design/plan docs, kept for provenance with a
   banner pointing at whatever replaced them. Never edited going forward except to fix a
   dangling link; never deleted.
3. **`docs/research/`** — **gitignored, internal.** Product/market/strategy memos that never
   ship in the public repo. Not part of this charter's public map; noted here only so nobody
   goes looking for them in a clone. If you're reading this file from a clone of the public
   repo, `docs/research/` won't exist on disk.

### Doc of record — product & vision

| Doc | Purpose | Lifecycle |
|---|---|---|
| [HARNESS-PLAN.md](./HARNESS-PLAN.md) | **Authoritative product definition** — the AI delivery harness, its layers, the decision that the contract lives in the generated project. | living |
| [ROADMAP.md](./ROADMAP.md) | **Public** roadmap — the pillars, the "what and why" for users/contributors. | plan/roadmap |
| [WHY-CMP.md](./WHY-CMP.md) | The honest CMP-vs-React-Native/Flutter case `cmp-new`'s fit check draws on — never claims either alternative is deprecated. | living |
| [VERSIONS.md](./VERSIONS.md) | The proven-green version set(s) — why Kotlin/KSP/Compose MP/Room/AGP move together, not independently. | living |
| [STUDIO-REDESIGN.md](./STUDIO-REDESIGN.md) | Design of record for the console/studio presentation layer. Companion to `GENESIS-FLOW-DESIGN.md` (the walk) and `VERIFICATION-LAYER-DESIGN.md` (the mechanics it presents). | living |

### Doc of record — the change & genesis flow

| Doc | Purpose | Lifecycle |
|---|---|---|
| [CHANGE-FLOW-DESIGN.md](./CHANGE-FLOW-DESIGN.md) | **Doc of record for all post-genesis work** — the one loop (Decide → Design → Audit → Contract → Build → Prove → Sign) every change follows, and the triage router per entry point. | living |
| [GENESIS-FLOW-DESIGN.md](./GENESIS-FLOW-DESIGN.md) | **Doc of record for a new app's birth** — the six-artifact definition order, the express lane vs the guided walk. Companion to `VERIFICATION-LAYER-DESIGN.md`, whose approval mechanics it reuses. | living |
| [VERIFICATION-LAYER-DESIGN.md](./VERIFICATION-LAYER-DESIGN.md) | Design of record for the runtime-eyes + human-approval-gates mechanics still live in every generated project today (`qa/approvals.json`, `qa/approve.mjs`, the console's Approvals/Comments tabs) — the ordered approval walk, the hash-bound data model, crash/log/DB runtime tools. **Not superseded**: `GENESIS-FLOW-DESIGN.md` and `CHANGE-FLOW-DESIGN.md` are built as its companions/consumers, not its replacement. | living |

### Doc of record — engineering reference

| Doc | Purpose | Lifecycle |
|---|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | How create-cmp itself works — template / engine / front doors, tokens, feature toggles. | living |
| [TESTING-ARCHITECTURE.md](./TESTING-ARCHITECTURE.md) | **Normative** test-pyramid specification every generated project implements (frameworks, patterns, evidence packs, spec-driven workflow). Sister of `template/docs/TESTING.md`. | living |
| [USAGE.md](./USAGE.md) | **The deep reference** — setup, the engine CLI (all 5 commands), the 10 skills, the profile-tiered verify lane, the `cmp-inspector` MCP (15 tools), approvals, comments, what a generated project carries, and the workflows that tie it together. | living |
| **DOCUMENTATION.md** (this file) | The charter — doc map, standards ledger, extension rules. | living |
| [AUTONOMY-GAPS.md](./AUTONOMY-GAPS.md) | Findings from real end-to-end governed-change-flow runs — where the agent needed a human that the flow didn't yet ask for. | living log |
| [DOGFOODING-FINDINGS.md](./DOGFOODING-FINDINGS.md) | The harness/plugin fix backlog surfaced by building real apps on top of create-cmp — **not** showcase-app work. | living log |

### `docs/history/` — superseded, kept for provenance

Every file here carries an italic banner at the top naming what replaced it. Nothing here is
authoritative for the current tree; each is linked from its replacement where useful.

| Doc | What it was | Superseded by |
|---|---|---|
| [history/INSPECTOR-PLAN.md](./history/INSPECTOR-PLAN.md) | Plan of record for the inspector's phase 0–2 build (2026-07-03). | `USAGE.md` §5 (current inspector/tool reference) |
| [history/INSPECTOR-PHASE2-DESIGN.md](./history/INSPECTOR-PHASE2-DESIGN.md) | Buildable spec for the live on-device inspector. | `USAGE.md` §5 |
| [history/LIVE-VIEW-PLAN.md](./history/LIVE-VIEW-PLAN.md) | Plan of record for live-view tracks A/B/C (preview, live device view, dev-client) — completed 2026-07-04. | `USAGE.md` §5, §8 (workflows C/D/E) |
| [history/M3-ADD-FEATURE-DESIGN.md](./history/M3-ADD-FEATURE-DESIGN.md) | Buildable spec for the `add-feature` in-project stamper. | `CHANGE-FLOW-DESIGN.md` |
| [history/M4-ENFORCEMENT-DESIGN.md](./history/M4-ENFORCEMENT-DESIGN.md) | Buildable spec for the `inputs.hash` evidence-binding primitive, the Stop hook, the C7 refusal demo. | `CHANGE-FLOW-DESIGN.md` (Prove/Sign stages) and [ADR-0005](./adr/0005-evidence-binding-by-inputs-hash.md) |
| [history/TEST-DRIVE.md](./history/TEST-DRIVE.md) | A one-time founder pre-publish checklist (2026-07-06). | `USAGE.md` (current usage), `DOGFOODING-FINDINGS.md` (current hands-on findings) |

### Process & history

| Doc | Purpose | Lifecycle |
|---|---|---|
| [adr/](./adr/) | The harness repo's own decision records (MADR-trimmed): 0001 contract-in-generated-project · 0002 Maestro-over-Appium · 0003 jvm("desktop")-as-infrastructure · 0004 no-Konsist · 0005 evidence-binding-by-inputs-hash · 0006 package-name-and-harness-positioning. | append-only |
| [errors/](./errors/) | One page per real KMP/CMP build failure `doctor` diagnoses in any Gradle/KMP project — exact error text, why it happens, the manual fix, the automated one-liner. Indexed in `errors/README.md`. | living reference |
| [proposals/](./proposals/) | Not-yet-decided design proposals (each headed `Status: proposal`/`proposed`) — read before deciding, not a description of shipped behavior. Currently: `agent-flow-retrospective.md`, `architecture-document-standard.md`, `component-system-deep-dive.md`, `console-build-handshake.md`, `console-protocol.md`. | proposal (pre-decision) |
| [reference/](./reference/) | Point-in-time reference artifacts (e.g. a dated walkthrough report with screenshots) — evidence, not living guidance. | frozen/reference |
| `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `CODE_OF_CONDUCT.md` (repo root) | Standard OSS front door: intro/quick-start, contributor ground rules, Keep-a-Changelog history, Contributor Covenant. Owned outside this charter's edit scope; `README.md` links here (`USAGE.md`) for the deep reference. | living |

### Internal / gitignored (exist locally, never in the public repo)

Listed for completeness — a session working in this repo may see these files on disk, but
they are absent from a fresh clone and from anything public-facing:

| Doc | Purpose |
|---|---|
| `DESIGN.md` | Original scaffold-engine design doc; superseded on product vision by `HARNESS-PLAN.md` (flagged in its own header), still referenced for engine-design history. |
| `CONTRACT.md` | Internal interface contract between template/engine/plugin. |
| `GROWTH-STRATEGY.md` | Internal companion to `ROADMAP.md` — the non-public reasoning behind each pillar. |
| `HARNESS-ROADMAP.md` | Internal cross-session execution tracker (milestones, acceptance criteria). |
| `SESSION-STATE.md` | Internal dated cross-session log — read first when resuming work. |
| `research/` | Internal product/market audits and strategy memos (see note above). |

### Disambiguation (docs that could be confused)

- **HARNESS-PLAN vs `docs/history/`'s build-track docs** → PLAN owns current product vision;
  the history tier owns *how a since-completed layer got built*.
- **CHANGE-FLOW-DESIGN vs GENESIS-FLOW-DESIGN** → every entry point after an app exists, one
  loop, vs. the app's own birth (six governed artifacts, definition order).
- **TESTING-ARCHITECTURE vs `template/docs/TESTING.md`** → normative standard vs in-app guide.
- **VERIFICATION-LAYER-DESIGN vs GENESIS-FLOW-DESIGN** → VL is the mechanics (approvals,
  comments, runtime eyes); Genesis is the interactive walk built on top of those mechanics —
  companions, not sequels.
- **HARNESS-PLAN vs `template/CLAUDE.md`** → product definition vs the contract an AI signs
  inside a generated app.

---

## 3. Document map — generated project (`template/`)

| Doc | Purpose | Lifecycle |
|---|---|---|
| [AGENTS.md](../template/AGENTS.md) | **The vendor-neutral discovery surface** — symptom → zero-consent command table read by ANY coding agent at session start; points at CLAUDE.md for the full contract. Every cited command is pinned to exist by `test/agents-md.test.mjs`. | living |
| [CLAUDE.md](../template/CLAUDE.md) | **The AI delivery contract** — definition of done (verify lane PASS + receipt), spec-first workflow, architecture and testing rules. The harness's enforcement layer in doc form. | living |
| [README.md](../template/README.md) | App quick-start — build commands, structure, doc pointers. | living |
| [CONTRIBUTING.md](../template/CONTRIBUTING.md) | Contribution workflow + definition of done for the app team. | living |
| [CHANGELOG.md](../template/CHANGELOG.md) | Keep-a-Changelog template seeded with the scaffold baseline. | living |
| [docs/ARCHITECTURE.md](../template/docs/ARCHITECTURE.md) | Clean Architecture in *this* app; `home` as the exemplar to mirror. Its `cmp:generated` sections are tree-derived, never hand-maintained. | living |
| [docs/TESTING.md](../template/docs/TESTING.md) | The test pyramid applied in *this* app (applied sister of the normative repo doc). | living |
| [docs/dev-client.md](../template/docs/dev-client.md) | Desktop dev-client: hot reload, what's real vs faked on JVM. | living |
| [docs/adr/](../template/docs/adr/) | Architecture Decision Records — MADR-style `template.md` + ADR-0001 (adopt harness conventions). | append-only |
| [specs/README.md](../template/specs/README.md) | The behavior-spec workflow — clause grammar, id stability, test-binding convention. | living |
| [specs/intent.md](../template/specs/intent.md) | The genesis walk's intent brief (purpose, audience, platforms, brand feel, first screens). | living |
| [specs/app-base.spec.md](../template/specs/app-base.spec.md) | Base architecture/shell clauses (currently ARCH-01..14, SHELL-01..05 — ids are append-only, so this range only grows). | living, append-only ids |
| [specs/home.spec.md](../template/specs/home.spec.md) | Exemplar feature spec (currently HOME-01..07) every new feature mirrors. | living, append-only ids |

---

## 4. Artifact types and their rules

Every document is one of five types. New content goes into an existing doc of the right
type, or a new doc of the right type — never a new *type* without amending this charter.

| Type | Records | Grammar / format | Never contains |
|---|---|---|---|
| **Spec** (`specs/*.spec.md`) | *Behavior* — what the software must do | Given/When/Then clauses with stable ids (`FEATURE-NN`); one file per feature | Rationale for decisions (→ ADR), implementation detail (→ code) |
| **ADR** (`docs/adr/NNNN-*.md`) | *Decisions* — why we chose X over Y | MADR-trimmed: Status/Date/Context/Decision/Consequences; numbered, append-only | Behavior requirements (→ spec), evolving guidance (→ reference doc) |
| **Plan / roadmap** | *Forward intent* — burns down as work lands | Milestones, checkboxes, acceptance criteria | Durable reference content (move it out when the plan completes) |
| **Reference / architecture** | *Current truth* — updated in place | Prose + diagrams; authoritative for its scope | History ("we used to…" → ADR or history-tier doc), aspirations (→ roadmap) |
| **Log** (SESSION-STATE, CHANGELOG, AUTONOMY-GAPS, DOGFOODING-FINDINGS) | *History* — what happened when | Dated entries, newest first, append-only | Forward plans, normative rules |

**Coupling rules** (how artifacts point at each other):

- Code/tests → specs: by **clause id only** (`// SPEC: HOME-02`, `[ARCH-01]` in failure
  messages). Never by prose description — ids survive rewording.
- Specs ↔ ADRs: a spec clause may cite the ADR that motivated it; an ADR never restates
  clauses.
- Plans → everything: link, don't duplicate. When a roadmap item completes, its durable
  content graduates into a reference doc or spec; the roadmap keeps only the checkbox.

---

## 5. Standards ledger — what we adopted, adapted, rejected

Our official position on the industry practices this documentation system implements.
This table is the record; the cited files are the implementation.

| Practice | Position | Where | Deviation & why |
|---|---|---|---|
| **Gherkin / BDD Given-When-Then** (Cucumber) | **Adopted the grammar, rejected the runtime** | `template/specs/*.spec.md`, grammar defined in `template/specs/README.md` | Cucumber step-definition glue is a maintenance tax: regex-matched step code that drifts from both the spec and the tests. We bind spec↔test by **stable clause id** instead — a comment tag and a failure-message citation are cheaper, grep-able, and machine-checkable. |
| **Specification by Example / living documentation** (Adzic) | **Adopted** | Design in [TESTING-ARCHITECTURE.md](./TESTING-ARCHITECTURE.md) §spec-driven | Today's evidence receipt is a JSON pack keyed by clause id (`specCoverage`, live in every verify-lane profile); a spec-organized human-readable report remains a documented gap (§6). |
| **Requirements traceability matrix** (regulated-industry) | **Adopted, automated** — live as the `specCoverage` lane step, first in every profile | Clause↔test links **are** the RTM (no separate matrix document to rot); enforced by `template/qa/verify.mjs` | We deviate from the traditional *document* RTM: a hand-maintained matrix goes stale silently. Ours is derived from source (`// SPEC:` tags) and enforced by the lane — orphan clauses (unverified behavior) and orphan tags (untraceable assertions) both FAIL with two-sided actionable messages; withdrawn clauses exempt. |
| **Stable requirement ids, never renumbered** (RFC / aerospace) | **Adopted** | `template/specs/README.md` — "ids are never renumbered or reused; a withdrawn clause is struck through and kept" | None. |
| **AI-era spec-driven development** (GitHub Spec Kit, Kiro-style specs) | **Aligned** — convergent, home-grown | `template/specs/README.md` (AI proposes, human confirms), `template/CLAUDE.md`, [HARNESS-PLAN.md](./HARNESS-PLAN.md), [CHANGE-FLOW-DESIGN.md](./CHANGE-FLOW-DESIGN.md) (Decide → Design → Audit → Contract → Build → Prove → Sign) | Same posture as the emerging standard — markdown, in-repo, machine-parseable, AI-proposes/human-confirms — arrived at independently. We keep our clause-id grammar rather than adopting a third-party spec format: our ids are load-bearing (gates parse them). |
| **ADRs** (Nygard / MADR) | **Adopted, kept separate from specs** | `template/docs/adr/` and `docs/adr/` — trimmed-MADR template | ADRs record *decisions*, specs record *behavior*; different artifacts, both shipped. We trimmed MADR (no options-matrix boilerplate) — a one-page record beats an unfilled template. |

Also load-bearing, recorded for completeness: **Keep a Changelog + SemVer** (both
changelogs), **Contributor Covenant** (CODE_OF_CONDUCT.md), **evidence packs / receipts**
(committed `qa/evidence/latest.json`, schema'd — our own verification-thesis practice).

---

## 6. Known gaps and drift (honest ledger)

Tracked here so the charter never claims more than the repo delivers:

1. **SD4 living-doc report** — the evidence receipt exists and is clause-keyed; a
   spec-organized human-readable report (the test report reads as the spec, pass/fail per
   clause) has not shipped as its own artifact.
2. **This charter's own currency** — `docs/DOCUMENTATION.md` drifts whenever a doc is added,
   moved, or superseded without updating this map (§7 exists precisely to prevent that). The
   2026-07-06→2026-08-20 gap that preceded this rebuild is the cautionary example.

Closed (kept one release for the record, then prune):

- ~~`docs/` had no currency signal~~ — `docs/history/` introduced 2026-08-20: superseded
  design/plan docs (inspector phases 0–2, live-view tracks, M3/M4 build specs, the founder
  test-drive checklist) moved there with banners naming what replaced them; this charter's
  §2 now distinguishes doc-of-record from history from gitignored-internal.
- ~~cmp-test / cmp-qa-prep framed Appium as current~~ — the skills now lead with "current
  scaffolds ship Maestro only," gate the Appium mechanics behind an explicit legacy-project
  check, and the harness-repo ADR (0002) records the decision.
- ~~Feature-key rename `appium` → `e2e`~~ — done in 0.3.0 (CLI flag, interview prompt,
  manifest key, and template markers all renamed; `--no-appium` kept as a deprecated alias
  for `--no-e2e`; recorded in [ADR-0002](./adr/0002-maestro-over-appium-for-e2e.md)).
- ~~SD2 specCoverage gate~~ — live in `template/qa/verify.mjs`, first step in every
  profile; negative-proven both directions.
- ~~No repo-level ADRs~~ — `docs/adr/` seeded with
  [0001](./adr/0001-the-contract-lives-in-the-generated-project.md)–[0006](./adr/0006-package-name-and-harness-positioning.md).

---

## 7. How to extend the pattern

- **New behavior** → clause in the feature's spec first (AI proposes, human confirms),
  then tests citing the id, then code. Never the reverse.
- **New significant decision** → ADR (copy `docs/adr/template.md`), numbered next in
  sequence. If it changes behavior, the spec clause cites the ADR.
- **New doc** → pick its universe (§1) and its type (§4), add it to the map in §2/§3 in
  the same PR. A doc not in this charter's map is a doc nobody will find.
- **New industry standard adopted/adapted/rejected** → add a row to §5 with the deviation
  rationale. The ledger is only useful if it stays complete.
- **Completed plan** → graduate durable content to reference docs/specs; log the
  completion; keep the plan as history or delete it (link from CHANGELOG).
- **Retiring a doc** → move it to `docs/history/` with an italic banner at the top naming
  what replaced it (see any file there for the pattern), update this map's §2. Never
  silently delete an authoritative doc, and never keep a superseded doc in the doc-of-record
  tier where it can be mistaken for current.
