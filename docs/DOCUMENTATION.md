# Documentation Charter

> **What this is.** The holistic map of every document in create-cmp: what exists, what each
> is for, how they interlock, which industry standards they implement (and where we
> deviated), and the rules for adding new docs so the pattern stays coherent as the project
> grows. If you are wondering "where does this content go?" or "which doc is authoritative
> for X?" — the answer is here.

Status: living · Owner: harness maintainers · Established: 2026-07-06

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

### Product & vision

| Doc | Purpose | Lifecycle |
|---|---|---|
| [HARNESS-PLAN.md](./HARNESS-PLAN.md) | **Authoritative product definition** — the AI delivery harness, its five layers, the decision that the contract lives in the generated project. | living |
| [DESIGN.md](./DESIGN.md) | Original design doc — core problem, deterministic-vs-generative principle. **Superseded on product vision by HARNESS-PLAN.md** (flagged in its own header); still valid for scaffold-engine design. | frozen/reference |
| [ROADMAP.md](./ROADMAP.md) | **Public** roadmap — seven pillars, the "what and why" for users/contributors. | plan/roadmap |
| [HARNESS-ROADMAP.md](./HARNESS-ROADMAP.md) | **Internal** execution tracker — milestones M0–M5 + SD1–SD4, acceptance criteria, session protocol. The "who and when" behind ROADMAP.md. | plan/roadmap |
| [GROWTH-STRATEGY.md](./GROWTH-STRATEGY.md) | Internal (gitignored) frank companion to ROADMAP.md — distribution/monetization *why*. Review whenever ROADMAP.md changes. | frozen/reference |

### Engineering reference

| Doc | Purpose | Lifecycle |
|---|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | How create-cmp itself works — template / engine / front doors, tokens, feature toggles. | living |
| [CONTRACT.md](./CONTRACT.md) | Integration contract between template, engine, and plugin — layout ownership, token definitions, manifest schema. | frozen/reference |
| [TESTING-ARCHITECTURE.md](./TESTING-ARCHITECTURE.md) | **Normative** test-pyramid specification every generated project implements (frameworks, patterns, evidence packs, spec-driven workflow). Sister of `template/docs/TESTING.md`. | living |
| [USAGE.md](./USAGE.md) | End-to-end usage guide — setup, engine CLI, skills, inspector tools, verified dev loop. | living |
| [M3-ADD-FEATURE-DESIGN.md](./M3-ADD-FEATURE-DESIGN.md) | Buildable spec for the `add-feature` generator (the in-project stamper) — rename contract, anchor injection, spec-first flow, C5 gate. | plan/spec |
| [INSPECTOR-PLAN.md](./INSPECTOR-PLAN.md) | Plan of record for the AI-native inspector (phases 0–2). Overview; PHASE2-DESIGN is the buildable spec. | living |
| [INSPECTOR-PHASE2-DESIGN.md](./INSPECTOR-PHASE2-DESIGN.md) | Detailed build spec for the live on-device inspector. | living |
| [LIVE-VIEW-PLAN.md](./LIVE-VIEW-PLAN.md) | Plan of record for live-view tracks A/B/C (pixels → human, structure → AI). | living |

### Process & history

| Doc | Purpose | Lifecycle |
|---|---|---|
| [adr/](./adr/) | The harness repo's own decision records (MADR-trimmed): 0001 contract-in-generated-project · 0002 Maestro-over-Appium · 0003 jvm("desktop")-as-infrastructure · 0004 no-Konsist. | append-only |
| [SESSION-STATE.md](./SESSION-STATE.md) | Dated cross-session log — read first when resuming work. Internal (gitignored). | session-log |
| [TEST-DRIVE.md](./TEST-DRIVE.md) | Founder pre-publication test-drive checklist (UX validation, not correctness). | frozen/reference |
| [research/](./research/) | Internal product audits and market research memos. | frozen/reference |
| `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `CODE_OF_CONDUCT.md` (repo root) | Standard OSS front door: intro/quick-start, contributor ground rules, Keep-a-Changelog history, Contributor Covenant. | living |
| **DOCUMENTATION.md** (this file) | The charter — doc map, standards ledger, extension rules. | living |

### Disambiguation (docs that could be confused)

- **HARNESS-PLAN vs DESIGN** → PLAN owns product vision; DESIGN owns engine-design history.
- **ROADMAP vs HARNESS-ROADMAP** → public pillars vs internal execution tracker.
- **TESTING-ARCHITECTURE vs template/docs/TESTING** → normative standard vs in-app guide.
- **INSPECTOR-PLAN vs INSPECTOR-PHASE2-DESIGN** → overview/status vs buildable spec.
- **HARNESS-PLAN vs template/CLAUDE.md** → product definition vs the contract an AI signs
  inside a generated app.

---

## 3. Document map — generated project (`template/`)

| Doc | Purpose | Lifecycle |
|---|---|---|
| [CLAUDE.md](../template/CLAUDE.md) | **The AI delivery contract** — definition of done (verify lane PASS + receipt), spec-first workflow, architecture and testing rules. The harness's enforcement layer in doc form. | living |
| [README.md](../template/README.md) | App quick-start — build commands, structure, doc pointers. | living |
| [CONTRIBUTING.md](../template/CONTRIBUTING.md) | Contribution workflow + definition of done for the app team. | living |
| [CHANGELOG.md](../template/CHANGELOG.md) | Keep-a-Changelog template seeded with the scaffold baseline. | living |
| [docs/ARCHITECTURE.md](../template/docs/ARCHITECTURE.md) | Clean Architecture in *this* app; `home` as the exemplar to mirror. | living |
| [docs/TESTING.md](../template/docs/TESTING.md) | The test pyramid applied in *this* app (applied sister of the normative repo doc). | living |
| [docs/dev-client.md](../template/docs/dev-client.md) | Desktop dev-client: hot reload, what's real vs faked on JVM. | living |
| [docs/adr/](../template/docs/adr/) | Architecture Decision Records — MADR-style `template.md` + ADR-0001 (adopt harness conventions). | append-only |
| [specs/README.md](../template/specs/README.md) | The behavior-spec workflow — clause grammar, id stability, test-binding convention. | living |
| [specs/app-base.spec.md](../template/specs/app-base.spec.md) | Base architecture/shell clauses (ARCH-01..05, SHELL-01..04). | living, append-only ids |
| [specs/home.spec.md](../template/specs/home.spec.md) | Exemplar feature spec (HOME-01..06) every new feature mirrors. | living, append-only ids |

---

## 4. Artifact types and their rules

Every document is one of five types. New content goes into an existing doc of the right
type, or a new doc of the right type — never a new *type* without amending this charter.

| Type | Records | Grammar / format | Never contains |
|---|---|---|---|
| **Spec** (`specs/*.spec.md`) | *Behavior* — what the software must do | Given/When/Then clauses with stable ids (`FEATURE-NN`); one file per feature | Rationale for decisions (→ ADR), implementation detail (→ code) |
| **ADR** (`docs/adr/NNNN-*.md`) | *Decisions* — why we chose X over Y | MADR-trimmed: Status/Date/Context/Decision/Consequences; numbered, append-only | Behavior requirements (→ spec), evolving guidance (→ reference doc) |
| **Plan / roadmap** | *Forward intent* — burns down as work lands | Milestones, checkboxes, acceptance criteria | Durable reference content (move it out when the plan completes) |
| **Reference / architecture** | *Current truth* — updated in place | Prose + diagrams; authoritative for its scope | History ("we used to…" → ADR or changelog), aspirations (→ roadmap) |
| **Log** (SESSION-STATE, CHANGELOG) | *History* — what happened when | Dated entries, newest first, append-only | Forward plans, normative rules |

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
| **Specification by Example / living documentation** (Adzic) | **Adopted** — sequenced as SD4 | Design in [TESTING-ARCHITECTURE.md](./TESTING-ARCHITECTURE.md) §spec-driven; roadmap item SD4 in [HARNESS-ROADMAP.md](./HARNESS-ROADMAP.md) | Implementation pending: today's evidence receipt is a JSON pack; SD4 makes the test report *read as the spec* with pass/fail per clause. Deliberate sequencing, not a rejection. |
| **Requirements traceability matrix** (regulated-industry) | **Adopted, automated** — live as the `specCoverage` lane step | Clause↔test links **are** the RTM (no separate matrix document to rot); enforced first in every lane profile by `template/qa/verify.mjs` (SD2, shipped 2026-07-06) | We deviate from the traditional *document* RTM: a hand-maintained matrix goes stale silently. Ours is derived from source (`// SPEC:` tags) and enforced by the lane — orphan clauses (unverified behavior) and orphan tags (untraceable assertions) both FAIL with two-sided actionable messages; withdrawn clauses exempt. The manual audit prototype found a real untested clause (SHELL-03) on day one — the argument that won automation. |
| **Stable requirement ids, never renumbered** (RFC / aerospace) | **Adopted** | `template/specs/README.md` — "ids are never renumbered or reused; a withdrawn clause is struck through and kept" | None. |
| **AI-era spec-driven development** (GitHub Spec Kit, Kiro-style specs) | **Aligned** — convergent, home-grown | `template/specs/README.md` (AI proposes, human confirms), `template/CLAUDE.md` (new behavior begins as a spec clause), [HARNESS-PLAN.md](./HARNESS-PLAN.md) | Same posture as the emerging standard — markdown, in-repo, machine-parseable, AI-proposes/human-confirms — arrived at independently from our verification thesis. We keep our clause-id grammar rather than adopting a third-party spec format: our ids are load-bearing (gates parse them). |
| **ADRs** (Nygard / MADR) | **Adopted, kept separate from specs** | `template/docs/adr/` — trimmed-MADR template + ADR-0001 | ADRs record *decisions*, specs record *behavior*; different artifacts, both shipped. We trimmed MADR (no options-matrix boilerplate) — a one-page record beats an unfilled template. |

Also load-bearing, recorded for completeness: **Keep a Changelog + SemVer** (both
changelogs), **Contributor Covenant** (CODE_OF_CONDUCT.md), **evidence packs / receipts**
(committed `qa/evidence/latest.json`, schema'd — our own verification-thesis practice).

---

## 6. Known gaps and drift (honest ledger)

Tracked here so the charter never claims more than the repo delivers:

1. **SD4 living-doc report** — receipt exists; spec-organized report (the test report reads
   as the spec, pass/fail per clause) pending, sequenced post-M5.
2. **Feature-key rename `appium` → `e2e`** — the key still carries the legacy name; renaming
   is a breaking CLI change deferred to 0.3.0 (recorded in
   [ADR-0002](./adr/0002-maestro-over-appium-for-e2e.md)). Docs annotate it as legacy.
3. **cmp-test / cmp-qa-prep deep rework** — the skills now correctly frame Maestro as
   current and Appium as legacy, but their step-by-step *mechanics* remain Appium-first;
   teaching them native Maestro flow generation is follow-on skill work (M5+).

Closed (kept one release for the record, then prune):

- ~~Appium → Maestro doc sweep~~ — done 2026-07-06 (all universes; remaining mentions are
  justified historical / legacy-key / mechanics).
- ~~SD2 specCoverage gate~~ — live in `template/qa/verify.mjs`, first step in every
  profile; negative-proven both directions.
- ~~No repo-level ADRs~~ — `docs/adr/` seeded with
  [0001](./adr/0001-the-contract-lives-in-the-generated-project.md)–[0004](./adr/0004-conformance-gates-without-konsist.md).
- ~~Say-it-out-loud sentences~~ — Cucumber-runtime rejection now explicit in
  `template/specs/README.md`; the Spec Kit/Kiro alignment recorded in §5.

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
- **Retiring a doc** → mark superseded in its header with a pointer (the DESIGN.md
  pattern), update this map. Never silently delete an authoritative doc.
