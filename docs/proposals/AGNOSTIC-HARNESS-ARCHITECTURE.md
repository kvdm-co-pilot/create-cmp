# The stack-agnostic harness — architecture proposal

**Status:** proposal · drafted 2026-09-04 · **decisions 1–4 taken 2026-09-04 (§14)** · not signed
**Owner:** Karel
**Supersedes nothing.** Extends [VISION.md](../research/VISION.md) §4; requires an amendment to §6 (§14).
**Companions:** [CHANGE-FLOW-DESIGN.md](../CHANGE-FLOW-DESIGN.md), [GENESIS-FLOW-DESIGN.md](../GENESIS-FLOW-DESIGN.md), [GATE-RULES.md](../GATE-RULES.md), [features/attach-mode.md](../features/attach-mode.md)

---

## 0. What this document is

> Governed by [`docs/NORTH-STAR.md`](../NORTH-STAR.md) (2026-09-04). This proposal keeps
> authority over the architecture in detail — the nine declarations, the profile protocol,
> the console's provider interface, the migration order inside Stage 0 (§11.3), the
> industry-pattern ledger. Goals, guarantees, the fit test and the stages' triggers are
> NORTH-STAR's; its §14 open decision 6 (amend VISION §6) is resolved there.

create-cmp is three things in one tree: a mobile scaffolder, a mobile studio, and a
verification harness. The first is mobile by definition and stays so. The third is not
mobile by nature — it is auditability, receipts, spec-driven enforcement, and the
workflow loop — but it is mobile by construction, because it was born inside a Compose
app and every stack assumption it carries was the only assumption there was. The
second, the studio, turns out to be two things: a neutral **console** whose every
section is *authored form / derived truth / drift*, and the mobile **providers** that
feed it — and only the second half is Compose.

This document specifies how the harness becomes stack-agnostic **without losing a
single thing the mobile offering does today**, by inverting one dependency: instead of
the harness knowing what Compose is, a **Stack Profile** tells the harness what a stack
is, and create-cmp becomes the first profile rather than the host — *exactly as any
other stack would.*

Four decisions were taken on 2026-09-04 and are baked in below: governance is
mechanic-in-core, model-in-profile (§1.3, §6); the `cmp` profile is isolated completely,
studio included, with the console living in the harness and profile-driven where it
cannot be neutral (§3, §9); a project with no manifest is **refused**, never defaulted,
and told how to make one (§4.1); Stage 0 starts, gated as §11.1 says.

It is written to be executed from. Every claim about the current tree is measured (§1).
Every design choice names the industry pattern it borrows and what it deliberately does
not borrow (§13). The migration (§11) is by subtraction from the current tree with the
mobile fleet-check green at every PR — never a second harness built beside the first.

---

## 1. What we have, measured

### 1.1 Four layers, not three

| Layer | What it is | Coupling | Verdict |
|---|---|---|---|
| **Scaffolder** | pinned CMP build, version catalog, `cmp-new` / `cmp-doctor` / `cmp-upgrade` | mobile, by definition | stays as-is |
| **Studio** | console (timeline, approvals, digest, specs, architecture, gallery, inspector, drift) + the mobile providers behind it (render, live inspect, tokens, device) | console: neutral by principle; providers: Compose | console → harness; providers → `cmp` profile |
| **Governance model** | genesis walk, six signed artifacts, briefs, arch-doc, coverage tiers, review definitions | **Compose-shaped, welded to the core** | this is the problem |
| **Evidence core** | lane runner, journal, inputs-hash, receipt, lock, Stop hook, liveness, the spec↔citation mechanic, the approvals mechanic | **neutral — proven, see §1.3** | this is the business |

The harness as it exists is the third and fourth layers in one directory, with no
boundary between them, and the studio's neutral console fused to its mobile providers
in another. That is why an adopter cannot take one without the other.

### 1.2 The dependency direction is backwards

Six independent measurements, all on `main` at `cef4037`:

1. **The spine imports the CMP pack by name.** `packages/harness/src/verify.mjs:40`:
   `import { createCmpSteps } from "./lib/steps-cmp.mjs"`. The runner cannot start
   without Compose's step pack.
2. **Six studio/device files live inside the harness lib**: `render.mjs`,
   `token-drift.mjs`, `tree.mjs`, `device-lease.mjs`, `device-provider.mjs`,
   `reachability.mjs`. They are Compose or Android and they sit in the "neutral" lib.
3. **`qa/harness-manifest.json` is read by seven console files and zero harness files.**
   The manifest exists (built for the console) and already declares `receipt`,
   `architectureDoc`, `specs`, `citationRoots`, `approvals`, `packs` — but the harness
   itself still hardcodes `composeApp/src` in `spec-coverage.mjs` and `composeApp/build`
   in `verify.mjs`.
4. **Tier names are hardcoded.** `spec-coverage.mjs` `tierForFile()` returns
   `androidInstrumentedTest` / `commonTest` / `desktopTest` / `e2e` / `other` by path
   substring. `TIERS_SATISFYING` is a two-entry map. The *mechanic* — a clause with a
   tier requirement must be cited from a tier that can observe it — is neutral. Its data
   is mobile.
5. **The six genesis artifacts are hardcoded** in `approvals.mjs:316–388`: `intent`,
   `architecture`, `exemplar-spec`, `exemplar-feature`, `design-system`, `components`.
   That list is a description of a Compose app.
6. **The receipt names its harness but not its pack.** `verify.mjs` writes
   `harness: { name, version, sha256, status, intact }` — good — but nothing says which
   step pack produced the rows, and the shipped `qa/evidence/schema.json` bakes the
   mobile ladder into `evidenceLevel`'s description ("L0 scaffold / L1 desktop / L2
   device / L3 release"). A `cmp` L2 and a future `ktor` L2 are indistinguishable on the
   wire.

And at the package level: `create-cmp-cli`'s `package.json` `files` list *contains*
`packages/harness/src` and `packages/receipts/src`. The harness ships inside the mobile
CLI. The CLI does not depend on the harness; it embeds it.

### 1.3 The seam already exists — the fork drew it

payment-blueprint, a Kotlin/Ktor backend, adopted the harness by copying `qa/lib/` and
rewriting what did not fit. Measured against upstream, file by file:

| Spine file | Lines differing | Upstream size | Read |
|---|---|---|---|
| `lane-runner.mjs` | **0** | 180 | byte-identical |
| `flight-recorder.mjs` | **0** | 377 | byte-identical |
| `lane-narrator.mjs` | **0** | 97 | byte-identical |
| `step-outcomes.mjs` | **0** | 227 | byte-identical |
| `inputs-hash.mjs` | 11 | 302 | near-identical |
| `step-cache.mjs` | 162 | 221 | rewritten |
| `affected-tests.mjs` | 255 | 155 | rewritten and extended |
| `harness-lock.mjs` | 261 | 152 | rewritten |
| `receipt-validate.mjs` | 337 | 289 | rewritten |
| `spec-coverage.mjs` | 538 | 263 | fully rewritten |
| `approvals.mjs` | **1636** | 1476 | fully rewritten — replaced with their own model |

The distribution is bimodal. Five files they did not need to touch: the evidence core's
mechanics. Six they had to rewrite: every file that carries a stack assumption. They
wrote their own step pack (`steps-blueprint.mjs`) exactly as the pack pattern intends —
and then forked eleven spine files to be able to use it, because there is no supported
way to consume the spine without copying it.

`approvals.mjs` is the decisive row. They did not adapt our governance; they **replaced**
it. They wanted the receipts, the lock, the hook, the journal, and the mechanic of
"a human signs a hash." They did not want our definition of *what* gets signed. That is
the empirical answer to the question this document turned on, and **decision 1 closed
it: the governance mechanic is the core's; the governance model is the profile's.**

### 1.4 What already exists that the target reuses

- `packages/receipts` — `computeInputsHash`, `evaluateReceipt`, `checkLaneVouching`,
  `checkFreshness`, `checkExecutionPlausibility`, `validateReceiptForTree`. The neutral
  seed, published-shape, dependency-free. Two of the five proven-neutral files already
  live here.
- The de-facto pack protocol, read by `verify.mjs:323–456`: `stepsForProfile`,
  `DEVICE_STEPS`, `FAST_EXCLUDED_NAMES`, `STEP_FN_BY_NAME`, `stepDeterminism()`,
  `releaseLease()`, `evidenceLadder`. Undeclared, but real and load-bearing.
- `receipt.harness` — the receipt already names the lane that issued it, with the region
  digest, so a third party can ask "was this the real published lane?" without the tree.
- `qa/harness-manifest.json` + `inspector/mcp/src/lib/project-layout.mjs` — a
  per-project declaration with a refusal on malformed input. The right file, read by
  the wrong half.
- The console's design principle — every section is *authored form / derived truth /
  drift* (the spec-mirror-drift rule, 2026-07-19). Stack-agnostic in its wording; only
  its providers are mobile.
- `inspector/mcp` tool contracts — `inspect_tree` returns a tree, `render_screen`
  returns structure plus optional pixels. Nearly neutral already, *because* VISION §4.1
  made them return structure rather than screenshots.
- `console-tabs.mjs` — already the composition point for console tabs.
- `scripts/sync-harness.mjs` — derives the vendored file list from package contents,
  reports orphans. Already a manifest-driven vendoring step.
- `create-cmp attach` (M0a shipped) — installs AGENTS.md and advisory hooks into a
  foreign repo with an honesty constraint; M0b (install the lane) is staged.
- `qa/framework-check.mjs` (0.24.0) — Rule 0 in an adopter's own tree, plants derived
  from the tree, refuses over an empty plant list.
- GATE-RULES.md, `grill-me`, the orchestrator contract — already stack-neutral doctrine.

---

## 2. Principles this resolves against

From VISION §4, the ones that bind here:

- **§4.1 Pixels flow to the human; structure flows to the AI.** This is why the console
  can be neutral at all: its sections consume structure, and structure is what a
  provider returns.
- **§4.2 The eyes are the demo; the gate is the business.** The studio is what gets
  copied; the gate is what Gatekeeper attests. A stack-agnostic gate widens the Evidence
  surface without widening the free studio's maintenance surface.
- **§4.3 The billing boundary is the assurance boundary.** Receipts must remain
  checkable from the repo alone, offline. Nothing here may make a receipt depend on a
  network.
- **§4.5 Strongest-true-case honesty.** A receipt from a profile with no calibrated
  gates must not carry the same badge as one from a profile with them. A `cmp` L2 and a
  `ktor` L2 must not read as the same claim.
- **§4.6 Trigger-gated building.** Stages in §11 each carry their trigger.

From GATE-RULES: Rule 0, Rule 1 and Rule 2 apply to *profiles*, not only to the core.
A profile is a set of gates; a gate that has only ever passed is an unread instrument.

Two standing rules of this repo, restated because the migration will tempt violating
them: **extract by subtraction, never build beside** (§11); **no new gates** — the
measured 7-code / 8-ceremony / 6-docs commit ratio in the blueprint's log says the
product needs less mechanism, not more.

---

## 3. Target architecture

### 3.1 The products

| Product | What it is | Depends on | Money |
|---|---|---|---|
| **The harness** *(name TBD, §14)* | evidence core + profile loader + workflow mechanics + **the console and the MCP server** (neutral section types and tools, fed by providers) | nothing | free |
| **Stack Profiles** | `cmp` ships with create-cmp; `ktor-backend` is what the blueprint effectively wrote; others authored, never ported | the harness | free |
| **create-cmp** | scaffolder + the `cmp` profile (steps, tiers, ladder, artifacts, arch rules, review, plants, **providers** — the eyes) | the harness | free |
| **Gatekeeper** | attests receipts, profile-aware | the receipt format | Evidence, paid |

### 3.2 The rules

> **Nothing in the core imports a profile by name.** The core loads *the* profile the
> manifest declares, through a protocol (§5). `import "./steps-cmp.mjs"` anywhere under
> the core is a lint failure.

> **A console section type exists only if its UI is neutral. Anything stack-specific is
> a provider behind an interface the core defines. There are no profile-owned tabs.**
> The test: could a second profile plausibly implement the provider? If not, it is not a
> section type — it is a stack-specific tool and does not belong in the console.

The first is Terraform's core/provider rule and LSP's client/server rule. The second is
Grafana's (panels are core, datasources are plugins), Storybook's (the shell is core,
*renderers* are per framework — that is their word), and VS Code's (the Outline view is
a neutral tree fed by a per-language `DocumentSymbolProvider`).

### 3.3 Layering

```
┌──────────────────────────────────────────────────────────────────────┐
│  create-cmp (the mobile product)                                      │
│  ┌──────────────────┐  ┌────────────────────────────────────────────┐ │
│  │  scaffolder      │  │  cmp profile                               │ │
│  │  (generator)     │  │  steps · tiers · ladder · artifacts        │ │
│  │  cmp-new         │  │  arch rules · review · plants              │ │
│  │  cmp-doctor      │  │  providers (the eyes):                     │ │
│  │  cmp-upgrade     │  │    surfaces  ← PreviewRegistry+renderScreens│ │
│  │  cmp-firebase    │  │    inspect   ← :9500 endpoint              │ │
│  │  cmp-qa-prep     │  │    drift     ← tokens declared vs resolved │ │
│  │  cmp-dev-client  │  │    runtime   ← device stream, logs, crashes│ │
│  │                  │  │    data      ← Room via inspector          │ │
│  └────────┬─────────┘  └──────────────────┬─────────────────────────┘ │
└───────────┼───────────────────────────────┼───────────────────────────┘
            │ stamps core + profile           │ implements the protocol
            ▼                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  the harness (stack-agnostic)                                         │
│                                                                       │
│   profile loader ──▶ Profile protocol (§5)                            │
│   evidence core: runner · journal · inputs-hash · receipt · lock ·    │
│                  Stop hook · liveness · step cache · affected         │
│   mechanics:     spec↔citation binding · signed-hash approvals ·      │
│                  the walk · plan/chain · grill-me · orchestrator      │
│   console:       section types — timeline · approvals · digest ·      │
│                  specs · architecture · liveness · surface gallery ·  │
│                  inspector · drift · runtime · data · goldens         │
│   MCP server:    one vocabulary — render_surface · inspect_tree ·     │
│                  drift · runtime_* · db_query · approval_status …     │
│                  each tool listed only if the profile provides for it │
│   doctrine:      GATE-RULES · framework-check · refusal-demo          │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ receipts (name harness + pack versions)
                               ▼
                      Gatekeeper (notary, Evidence)
```

Dependency arrows point **down**. The harness never points up.

### 3.4 What each half owns

| Concern | Core (mechanic) | Profile (model) |
|---|---|---|
| Specs | clause grammar; citation binding within a window; tier-must-observe; uncited/orphaned → FAIL; specs are signed; doneness derived | where specs live; tier names; which tier observes which; test roots |
| Approvals | artifact = path set + hash; signature on hash; status derivation; reopen/accept; the ledger; projection hashing | **which** artifacts, in what order, how each is hashed |
| The walk | ordered artifacts with derived doneness; Decide→Design→Audit→Build→Prove→Accept | what "Design" and "Audit" *are* for this stack; what a human signs on |
| Architecture | "a rule is a test the lane runs"; the arch-doc's derived sections are regenerated from rules | the layers, the allowed dependencies, the rules |
| Steps | runner, bounds, cache, affected, outcomes, journal rows | the steps themselves; which are expensive; which need a device |
| Evidence ladder | rung derivation from which steps ran and passed; rung ≥ required | the rungs, their names, what earns them |
| Rule 0 / Rule 1 | `framework-check` runner; assessors; refusal over empty plants | the plants |
| Receipt | format; hash binding; validation; freshness; plausibility; vouching | nothing — but the receipt **names** the pack |
| Liveness / hook | agent-hold; lane-in-flight; Stop hook advice | nothing |
| **Console** | the section types and their UI: timeline, approvals, digest, specs, architecture, liveness, surface gallery, inspector, drift, runtime, data, goldens; the *authored / derived / drift* frame | the **providers**: how to enumerate and render a surface, how to read a live tree, which (authored, derived) pairs exist, how to observe the runtime, how to query the store |
| **MCP server** | one neutral tool vocabulary; each tool delegates to a provider; a tool is **listed only if the profile provides for it** | the providers behind the tools |
| Skills | neutral skills for neutral tools (`preview`, `inspect`, `test`, `audit`, `grill-me`), each with a profile-notes slot | scaffolder/toolchain skills (`cmp-new`, `cmp-doctor`, `cmp-upgrade`, `cmp-firebase-connect`, `cmp-qa-prep`, `cmp-dev-client`) and the profile notes |

---

## 4. The Stack Profile

"Define your architecture for your stack up front and it slots in." A profile is the
answer to *what is a stack, to this harness?* It is one vendored directory plus one
manifest entry. It declares nine things. All nine exist today as hardcoded Compose
constants scattered through the core and the studio; §6 maps each to its current
location.

### 4.1 The manifest names the profile — and its absence is refused

`qa/harness-manifest.json` grows one required field and keeps everything it has:

```json
{
  "schema": "harness-manifest/2",
  "profile": { "id": "cmp", "version": "0.19.0" },
  "layout": {
    "receipt": "qa/evidence/latest.json",
    "specs": "specs",
    "citationRoots": ["composeApp/src", "qa/e2e"],
    "testRoots": ["composeApp/src"],
    "architectureDoc": "docs/ARCHITECTURE.md",
    "approvals": "qa/approvals.json"
  }
}
```

**There is no default profile** (decision 3). `cmp` is a profile like any other; a
privileged default would be the coupling this document removes, wearing a different
name. Refusal semantics:

- **Malformed** manifest → refuse, naming the field (unchanged from `project-layout.mjs`).
- **Absent** manifest → refuse, naming the command that makes one:
  - a **stamped** app (`create-cmp.json` present): `create-cmp upgrade --harness` derives
    the manifest from what it already knows — package, name, features — with no
    questions asked, because there is nothing to ask;
  - a **foreign** repo: `<harness> attach` runs the **manifest interview** — which
    profile, where specs, sources and tests live, what the tiers are called — and writes
    it. This is M0b of [attach-mode.md](../features/attach-mode.md), promoted from
    staged to Stage 0 (§11).

The layout fields are a *project* override of the profile's defaults, never the other way
round.

> **As built (PR 2):** the manifest is **flat** — the layout fields sit beside `schema` and
> `profile`, not under a nested `layout` key. The console's reader validates field by field
> and refuses unknown keys, and a stamped app must satisfy both readers with one file until
> Stage 0.5 unifies them. The nested form above is the target shape at schema/3.
> Stage 0 PR 2 also promoted the manifest interview into `attach`; a stamped app needs no
> derivation at all — the manifest ships in the template and flows to upgraded apps as a
> region file, which is the derivation.

### 4.2 The nine declarations

| # | Declaration | What it answers | Today lives in |
|---|---|---|---|
| 1 | **Layout** | where specs, sources, tests, the receipt and the arch doc are | manifest (console only), `spec-coverage.mjs` constants, `verify.mjs` markers |
| 2 | **Artifacts** | what gets signed, in what order (the walk) and how each is hashed | `approvals.mjs:316–388` |
| 3 | **Architecture rules** | layers, allowed dependencies, what the arch-doc derives | `arch-doc.mjs` (Compose layer inventory, expect/actual table) |
| 4 | **Evidence tiers** | tier names, ordering, which tier can observe which clause, `tierForFile` | `spec-coverage.mjs` `tierForFile`, `TIERS_SATISFYING`, `DESKTOP_TIERS` |
| 5 | **Steps** | the pack: what runs, per run profile, with bounds; which are device/expensive | `steps-cmp.mjs` (exists as a pack already) |
| 6 | **Ladder** | rungs, names, what earns each — the definition of done | `evidence-level.mjs` `CMP_LADDER` (already pack-provided) |
| 7 | **Review definition** | what "Design" and "Audit" mean; what the human signs on; the triage router's stack-specific rows | `CHANGE-FLOW-DESIGN.md` router table, `feature-brief.mjs` (`screens: true`, `presentation/*/Screen.kt`) |
| 8 | **Plants** | the profile's own framework-check plants — Rule 1 for the profile | `framework-check.mjs` `selectPlants` (derives CMP plants from the tree) |
| 9 | **Providers** | how the console's section types and the MCP tools see this stack: surfaces, live inspection, drift pairs, runtime, data | `inspector/mcp` (preview service, live connect, token drift), `qa/lib/render.mjs`, `tree.mjs`, `token-drift.mjs`, the Kotlin side (`PreviewRegistry.kt`, `renderScreens`, `:9500`) |

### 4.3 The `cmp` profile, written out

This is not a sketch. It is the current tree's constants, moved. Everything below is
already true of a stamped Compose app.

```js
// qa/lib/profiles/cmp/index.mjs — the mobile profile. Vendored byte-identical.
export const id = "cmp";
export const version = "0.19.0";

export const layout = {
  specs: "specs",
  citationRoots: ["composeApp/src", "qa/e2e"],
  testRoots: ["composeApp/src"],
  receipt: "qa/evidence/latest.json",
  architectureDoc: "docs/ARCHITECTURE.md",
  approvals: "qa/approvals.json",
  buildDir: "composeApp/build",              // lane + render markers live here
};

export const tiers = {
  // The mechanic (a clause tagged [tier: X] must be cited from a tier in
  // satisfying[X]) is the core's. These names are mobile's.
  names: ["commonTest", "desktopTest", "androidInstrumentedTest", "e2e"],
  desktop: ["commonTest", "desktopTest"],
  satisfying: { device: ["androidInstrumentedTest", "e2e"], e2e: ["e2e"] },
  forFile: (rel) => /* the body of today's tierForFile, verbatim */,
};

export const artifacts = [
  // The genesis walk, in definition order. Each: id, label, files(root), hash?
  { id: "intent",           label: "Intent brief",            files: (r) => ["specs/intent.md"] },
  { id: "architecture",     label: "Architecture + structure", files: (r) => [...], hash: hashArchitectureArtifact },
  { id: "exemplar-spec",    label: "Exemplar spec",           files: (r) => [`specs/${exemplar(r)}.spec.md`] },
  { id: "exemplar-feature", label: "Exemplar feature",        files: (r) => kotlinUnder(r, `presentation/${exemplar(r)}`) },
  { id: "design-system",    label: "Design system",           files: (r) => kotlinUnder(r, "presentation/theme") },
  { id: "components",       label: "Components",              files: (r) => kotlinUnder(r, "presentation/components") },
];

export const architecture = {
  // What arch-doc.mjs derives today, as data: the layer inventory and the
  // expect/actual table are generated sections computed from these rules.
  layers: ["presentation", "domain", "data"],
  rules: [
    { from: "domain", mayImport: [] },
    { from: "presentation", mayImport: ["domain"] },
    { from: "data", mayImport: ["domain"] },
  ],
  generatedSections: ["expect-actual-table", "layer-file-inventory", "adr-index"],
};

export const ladder = /* today's CMP_LADDER, verbatim */;

export const review = {
  // What the change flow's Design and Audit stages mean on mobile.
  design: { artifact: "feature-design", signedOn: "rendered screens", derivesFrom: "screens: true OR presentation/<name>/*Screen.kt on disk" },
  audit:  { section: "## Edge cases", minimum: 3 },
  router: [ /* the mobile-specific rows: visual redesign, component add/reshape */ ],
};

export function steps(ctx) {
  // Today's createCmpSteps, unchanged. Returns stepsForProfile, DEVICE_STEPS,
  // FAST_EXCLUDED_NAMES, STEP_FN_BY_NAME, stepDeterminism, releaseLease.
}

export function plants(tree) {
  // Today's selectPlants, minus the region plants (those are the core's).
}

export const providers = {
  // The eyes. Each is today's implementation behind a named interface: the
  // console's section types and the MCP tools call these and nothing else.
  surfaces: {
    list:   (root) => /* PreviewRegistry.kt entries */,
    render: (surface, variant) => /* renderScreens → { tree, png?, a11y } */,
  },
  inspect: {
    live: () => /* connect to :9500 */,
    tree: (target) => /* semantics tree, nav state */,
  },
  drift: [
    { id: "tokens", authored: (root) => /* design-system tokens */, derived: (live) => /* resolved values */ },
  ],
  runtime: { logs, crashes, stream: () => /* device view */ },
  data:    { query: (sql) => /* Room via the inspector */ },
};

// The six glue files move here with it: render, token-drift, tree,
// device-lease, device-provider, reachability. They are this profile's.
```

### 4.4 A backend profile, sketched from what the blueprint already built

The sketch exists to **test the interfaces against a second implementation on paper**
before any of them ship — the guard against designing "surface" abstractly at N=1 and
getting Compose with different names (§12).

```js
export const id = "ktor-backend";
export const layout = { specs: "specs", citationRoots: ["backend"], testRoots: ["backend"],
                        receipt: "qa/evidence/latest.json", architectureDoc: "docs/ARCHITECTURE.md", … };
export const tiers = {
  names: ["unit", "integration", "contract"],
  desktop: ["unit"],
  satisfying: { integration: ["integration", "contract"], contract: ["contract"] },
  forFile: (rel) => /src\/test\//.test(rel) ? "unit" : /src\/integrationTest\//.test(rel) ? "integration" : /contracts\//.test(rel) ? "contract" : "other",
};
export const artifacts = [
  { id: "intent", … }, { id: "architecture", … },
  { id: "context-map", label: "Bounded contexts", files: (r) => ["docs/CONTEXTS.md"] },
  { id: "api-contract", label: "OpenAPI contract", files: (r) => ["api/openapi.yaml"] },
];
export const architecture = { layers: ["contexts/*/domain", "contexts/*/application", "contexts/*/infrastructure"], rules: [ /* onion */ ] };
export const ladder = { rungs: ["L0 compile", "L1 unit", "L2 integration", "L3 contract+deploy-smoke"], … };
export const review = { design: { artifact: "api-contract", signedOn: "the OpenAPI diff" }, audit: { section: "## Failure modes", minimum: 3 } };
export function steps(ctx) { /* what steps-blueprint.mjs does: compositeBuild, spotless(apply), detekt, archTests, unitTests, gitleaks */ }
export function plants(tree) { /* their nine plants */ }
export const providers = {
  surfaces: { list: (r) => /* OpenAPI operations */, render: (op) => /* example request/response, rendered doc */ },
  drift:    [ { id: "schema", authored: (r) => /* migrations */, derived: (live) => /* actual DB schema */ } ],
  runtime:  { logs, crashes },
  data:     { query: (sql) => /* the app's DB */ },
  // no `inspect.live` — there is no running UI tree; the inspector section reads
  // "this profile declares no live tree" and the tool is not listed.
};
```

The point of the sketch is not its content. It is that **nothing in it needed a change
to the core**; that their 1636-line rewrite of `approvals.mjs` becomes a 6-entry
`artifacts` array; and that the same `surfaces` / `drift` interfaces hold for an OpenAPI
operation and a database schema as for a Compose screen and a design token.

### 4.5 Composition

A profile may `extends` another (ESLint flat-config's pattern). `cmp-with-firebase`
extends `cmp` and adds a step and an artifact. The core resolves the chain; a profile
cannot remove a core mechanic, only add to and parameterise it.

---

## 5. The Profile protocol

What the core requires of a profile module, and what it promises back. This is the
boundary Terraform draws with gRPC and LSP with JSON-RPC; here it is an ESM export
surface, because the profile is vendored into the same process and a network boundary
would violate VISION §4.3 (offline receipts).

### 5.1 Required exports

| Export | Type | Core uses it for |
|---|---|---|
| `id` | string | receipt `pack.id`; lock; console labels |
| `version` | semver | receipt `pack.version`; upgrade migrations |
| `layout` | object | every path the core reads; overridden per-project by the manifest |
| `tiers` | `{ names, desktop, satisfying, forFile }` | spec-coverage's tier mechanic |
| `artifacts` | `Artifact[]` in walk order | approvals, the walk, the console board |
| `architecture` | `{ layers, rules, generatedSections }` | arch tests; arch-doc regeneration |
| `ladder` | `{ rungs, earns }` | evidence-level derivation |
| `review` | `{ design, audit, router }` | change flow stages; triage router |
| `steps(ctx)` | function → pack | the runner (today's contract, unchanged) |
| `plants(tree)` | function → `Plant[]` | framework-check |
| `providers` | `{ surfaces?, inspect?, drift?, runtime?, data? }` — **optional, each key optional** | the console's section types; the MCP server's tool list |

### 5.2 What the core promises

- It never reads a path the profile did not declare. (`MEMOIZED_STEP_INPUTS` is the
  declaration of what each step reads; the core refuses a step whose declared inputs
  fall outside `layout` — the "declare your inputs" pattern from §13.)
- It runs the profile's plants through `framework-check` and **refuses to mint a
  receipt at any rung above L0 for a profile with zero passing plants.** A profile is a
  set of gates; a gate that has only ever passed is an unread instrument (GATE-RULES
  Rule 1). This is the quality floor that protects Gatekeeper's badge.
- It writes `pack` into every receipt (§8).
- It locks the profile directory with the core (`qa/lib/profiles/<id>/**` is in the
  harness region), so an edited profile cannot vouch for its own verdicts (Rule 2).
- **It lists an MCP tool only if the profile provides for it.** A backend profile
  without `inspect.live` does not advertise `inspect_tree`. Tool *definitions* are the
  core's; tool *availability* is the profile's. (Anthropic's tool guidance: one
  consistent vocabulary, no bloated tool sets.)
- **A console section whose provider is absent renders as present-and-honest** —
  "this profile declares no renderable surfaces" — never as missing.
- **The providers work with the core present, never with the core running.**
  `preview` as a dev loop and hot-reload are used without ever running the lane, and the
  free studio is the moat (VISION §1). A provider may read the manifest and receipts; it
  may not require `qa/verify.mjs` to have run.

### 5.3 Loading

```js
// verify.mjs — the only place a profile is resolved. Never by name.
const manifest = resolveProjectLayout(ROOT);
if (!manifest.ok) refuse(manifest.reason);          // malformed → named field
                                                    // absent → the command that writes one (§4.1)
const profile = await loadProfile(ROOT, manifest.profile);   // qa/lib/profiles/<id>/index.mjs
const layout = { ...profile.layout, ...manifest.layout };
const pack = profile.steps({ ROOT, layout, sh, … });
```

`loadProfile` refuses: a missing directory, a profile whose `id` does not match the
manifest, a version outside the core's supported range, and a profile lacking any
required export — each by name.

### 5.4 Versioning

The core declares the protocol versions it supports (`PROFILE_PROTOCOL = 1`). A profile
declares the protocol it implements. Mismatch is a refusal with the upgrade command.
This is the Terraform handshake, one integer.

---

## 6. The core, module by module

What stays, what moves, what becomes parameterised. "Neutral now" means the blueprint's
copy differs by ≤11 lines.

| Module | Today | Target | Change |
|---|---|---|---|
| `lane-runner.mjs` | neutral now | core | none |
| `flight-recorder.mjs` | neutral now | core | none |
| `lane-narrator.mjs` | neutral now | core | none |
| `step-outcomes.mjs` | neutral now, but carries `parseMaestroJunit`, `deviceLogIncidents` | core keeps `deriveOutcome` etc.; the two Maestro helpers move to the `cmp` profile | split |
| `inputs-hash.mjs` | near-neutral; `EXCLUDED_PREFIXES` has `qa/` paths | core; excluded prefixes come from `layout` + a fixed lane-output set | parameterise |
| `receipt-validate.mjs` | `RECEIPT_REL_PATH` constant | core; path from `layout.receipt` | parameterise |
| `harness-lock.mjs` / `harness-region.mjs` | inclusion list of dirs | core; region = the shipped manifest (§10.2), which now includes `profiles/<id>/**` | manifest-authoritative |
| `step-cache.mjs` | neutral mechanic; blueprint rewrote 162 lines (why: unknown, investigate in Stage 0) | core | investigate, then parameterise |
| `affected-tests.mjs` | `LANE_OUTPUT_PREFIXES`, source-root assumptions | core; roots from `layout` | parameterise |
| `spec-coverage.mjs` | `composeApp/src`, `qa/e2e`, `tierForFile`, `TIERS_SATISFYING` | core mechanic; `layout.citationRoots`, `profile.tiers` | parameterise |
| `e2e-coverage.mjs` | screen features + Maestro flows | **`cmp` profile** — it is the mobile "every feature has a device journey" rule | move |
| `evidence-level.mjs` | `CMP_LADDER` constant + neutral `evidenceLevel()` | core keeps the derivation; the constant moves to the profile | split |
| `approvals.mjs` | 1476 lines; artifact list hardcoded; hashing per artifact | core keeps: ledger, signature, status derivation, reopen/accept, projection; **artifact list from `profile.artifacts`** | parameterise the list, keep the mechanic |
| `walk.mjs` | 0 Compose strings; walks whatever approvals lists | core | none (it already reads the list) |
| `feature-brief.mjs` | `screens: true`, `presentation/<name>/*Screen.kt` | core keeps briefs, `## Edge cases`, derived doneness; **design derivation from `profile.review.design`** | parameterise |
| `arch-doc.mjs` | Compose layer inventory, expect/actual table | core keeps "regenerate marked sections from data"; sections computed from `profile.architecture` | parameterise |
| `plan.mjs`, `agent-hold.mjs` | neutral | core | none |
| `framework-check.mjs` (lib + runner) | derives CMP plants | core keeps runner, assessors, region plants; **spec/flow plants from `profile.plants`** | parameterise |
| `render.mjs`, `token-drift.mjs`, `tree.mjs`, `reachability.mjs` | in harness lib | **`cmp` profile** — behind `providers.surfaces` / `drift` / `inspect` | move |
| `device-lease.mjs`, `device-provider.mjs` | in harness lib | **`cmp` profile** (Android) | move |
| `steps-cmp.mjs` | pack, imported by name | **`cmp` profile** `steps()` | move |
| `verify.mjs` | imports pack by name; `GRADLEW`; `composeApp/build` markers; `kspCaches` | core; loads profile via manifest; markers under `layout.buildDir`; Gradle/KSP specifics into the profile's `steps()` | parameterise |
| `receipt-check.mjs` | neutral | core | none |
| **`inspector/mcp` — the console** | create-cmp's; neutral sections and mobile sections in one app | **harness** — section types with the *authored / derived / drift* frame; each section calls a provider | move + slot |
| **`inspector/mcp` — the MCP server** | create-cmp's; 15 tools, eyes and governance mixed | **harness** — one server, neutral vocabulary, each tool delegating to a provider, **listed only if provided** | move + slot |
| `preview-service.mjs`, live connect, token drift (console side) | console internals | **`cmp` profile's `providers`** | move |
| `console-tabs.mjs` | composes tabs | core — the slot | keep, formalise |
| Skills `cmp-preview`, `cmp-inspect`, `cmp-test`, `cmp-audit` | create-cmp plugin | **harness plugin**, describing the neutral tools, with a profile-notes slot | move |
| Skills `cmp-new`, `cmp-doctor`, `cmp-upgrade`, `cmp-firebase-connect`, `cmp-qa-prep`, `cmp-dev-client` | create-cmp plugin | create-cmp plugin — scaffolder and toolchain, genuinely mobile | none |
| `PreviewRegistry.kt`, `renderScreens`, the `:9500` endpoint, testTags | the template | the template — the `cmp` provider's *implementation* | none |
| `approve.mjs`, `walk-status.mjs`, `walkthrough.mjs`, `watch.mjs`, `retrospective.mjs`, `record-audit.mjs`, `comment.mjs` | thin CLIs over the above | core | follow their libs |
| `scaffold-feature.mjs`, `preview-gallery.mjs` | Compose | **`cmp` profile** | move |

Net: **the core loses two Gradle constants, six glue files, one pack, and four hardcoded
lists; it gains one loader, one protocol, one provider interface, and the console.** No
mechanic is rewritten. No section type is invented — each is named from what the console
already does.

---

## 7. Enforcement — what the harness insists on, for any stack

### 7.1 Spec-driven engineering

Unchanged in mechanism, parameterised in data:

- A spec is `<layout.specs>/*.spec.md`; a clause is `- **ID-NN** [tier: t]? — Given/When/Then`.
- A citation is `// SPEC: ID` (or `# SPEC:` in flow-shaped files) **bound** to a test
  within `BINDING_WINDOW` lines; a class-level tag with no test under it does not count.
- A clause tagged `[tier: t]` must be cited from a file whose `profile.tiers.forFile`
  returns a tier in `profile.tiers.satisfying[t]`.
- Uncited live clause → `specCoverage` FAIL naming the clause. Orphaned citation →
  FAIL naming the id. Tier unmet → FAIL naming the clause and the tier.
- Specs are signed artifacts (a profile that omits them from `artifacts` still gets the
  coverage gate — the gate does not depend on the signature).
- Feature doneness is **derived**, never claimed: live clauses all cited + latest
  receipt PASS + receipt hash matches the tree now.

What a backend gains from this with no new code: the same discipline the blueprint
rebuilt by hand, with the same refusal messages.

### 7.2 Harness engineering

GATE-RULES applies to profiles:

- **Rule 0** — `qa/framework-check.mjs` runs the profile's plants through the real
  runner, bounded in seconds, restores the tree. A profile ships with its plants or it
  ships without a badge (§5.2).
- **Rule 1** — a profile's gate is not in the lane until a plant makes it FAIL BY NAME.
  The plant lives in `profile.plants`, run by everyone forever, not performed by hand
  once. (0.24.0's Rule 1 text already says this; the profile makes it structural.)
- **Rule 2** — the profile directory is inside the lock region. An edited profile cannot
  certify itself.
- Every step is bounded; the journal records durations; a hang is the enemy.

### 7.3 The workflow loop

The six stages are the core's. What each stage *is* comes from the profile's `review`.

| Stage | Core | Profile |
|---|---|---|
| Decide | grill-me before the first line; brief in `docs/features/`; settled decisions are closed | which decisions are load-bearing for this stack (grill-me's question bank extends) |
| Design | a signed artifact exists iff the change has a design surface; signed on *rendered output*, never prose | what the design surface is (mobile: screens; backend: the API contract diff) |
| Audit | `## Edge cases` (or the profile's section name), a minimum count before signature | the section name, the minimum, the question bank |
| Build | the agent builds; interim proof is the fast lane; liveness held | which steps are fast-lane |
| Prove | the full lane; receipt at the required rung | the rung |
| Accept | a human's bookend on a provenDone feature | — |

The triage router's neutral rows (new feature, change to signed behaviour, bug fix,
emergency fix, spike) are the core's. Its stack-specific rows (visual redesign,
component add/reshape on mobile; migration, contract change on a backend) come from
`profile.review.router`.

### 7.4 Review and testing are the profile's — by design

This is the sentence the whole proposal turns on: **the harness enforces that review
and testing happen at the tier that can observe the claim; the profile says what those
tiers are.** On mobile, "done" means automated e2e on a device, because a JVM test
cannot see a PendingIntent or a notification channel. On a backend, "done" means an
integration test against a real database in a container, because a HashMap cannot see
a row lock. The core does not know either fact. It knows that a clause tagged with a
tier must be proven from that tier, and it refuses otherwise.

---

## 8. Evidence and receipts

### 8.1 Schema changes

The receipt already names its harness. It gains its pack, and the run-profile field
stops colliding with the stack profile:

```json
{
  "schema": "cmp-evidence/1",
  "harness": { "name": "@create-cmp/harness", "version": "0.19.0", "sha256": "…", "status": "intact", "intact": true },
  "pack":    { "id": "cmp", "version": "0.19.0" },
  "evidenceLevel": { "rung": "L2", "name": "device" },
  …
}
```

- `harness` — **exists today** (version + region digest + intact). Kept verbatim.
- `pack` — **new in Stage 0 PR 1**, additive: `{ id, version }`. Until the profile
  loader lands (PR 2) the pack is versioned with the harness, so `version` is the
  lock's. The schema declares it as optional; it becomes **required** at schema/2, once
  every writer emits it. It is named `pack` rather than `profile` because `profile` is
  taken by the run profile (scaffold / local / ci / release); at schema/2 that field
  becomes `runProfile` and `pack` may be renamed `profile`. Not before.
- `evidenceLevel.name` is the profile's rung name; the schema's *description* stops
  enumerating mobile's rungs.

(SLSA: provenance names the builder. `harness` + `pack` is the builder.)

### 8.2 The comparability rule

**Receipts are comparable within a pack and explicitly not across packs.** A `cmp` L2
and a `ktor-backend` L2 are different claims that happen to share a letter. Every
surface that shows a rung shows the pack beside it — the badge, the console, the
Gatekeeper check. This is stated in the format so an auditor is told, rather than left
to discover it.

### 8.3 Gatekeeper

Gatekeeper's check gains: read `pack`; verify the pack is one whose plants pass (a
profile registry entry or the receipt's own `frameworkCheck` summary, Stage 2); show
the pack beside the rung. Its Evidence product gains a *per-profile* controls mapping —
which is where a stack-agnostic gate pays: every profile is a new organisation type
that can buy Evidence.

---

## 9. The studio, decoupled: the console is core, the eyes are providers

The console is not split by who owns the code; it is split by concept. Its design
principle already says what every section is — an authored form, a derived truth, and
the drift between them — and that sentence is stack-agnostic. So the section *types*
are the console's, and the profile supplies the *providers*:

| Section type (core) | `cmp` provider | A backend provider would be… |
|---|---|---|
| **Surface gallery** — enumerate, render headlessly, diff | `PreviewRegistry.kt` + `renderScreens` → semantics tree + PNG | OpenAPI operations; rendered example responses / docs |
| **Inspector** — the running thing as structured data | `:9500` endpoint → semantics tree, nav state | request trace, effective config, schema |
| **Drift** — authored vs derived pairs | design tokens vs resolved values | migrations vs actual schema; declared vs effective config |
| **Runtime** — observe the live process | device stream, logs, crashes | logs, traces, health |
| **Data** — query the app's store | Room via inspector | the app's DB |
| **Goldens** — snapshot + compare | rendered trees | response / schema snapshots |
| Evidence timeline, approvals, digest, specs, architecture, liveness | — (already neutral, manifest-driven) | — |

Every row passes the §3.2 test. The abstraction is not invented; it is named.

**On mobile, the eyes are how the gate sees.** `goldenTrees` renders through the
inspector; `tokenDrift` reads resolved values from the live app; `a11y` reads the
rendered semantics tree. These are *evidence steps* — the profile's proof — and they
call the profile's own providers. That is why the studio is inside the `cmp` profile,
not beside it: the executor uses the eyes.

**One MCP server.** The neutral vocabulary — `render_surface`, `inspect_tree`, `drift`,
`runtime_logs`, `runtime_crashes`, `db_query`, `approval_status`, `review_comments`,
`resolve_comment` — is the harness's. Each tool delegates to a provider and is listed
only if the profile supplies one. The provider interface is **derived from the existing
tool contracts, not designed fresh**: `inspect_tree` already returns a tree,
`render_screen` already returns structure plus optional pixels. We name them.

**The Kotlin side does not move.** `PreviewRegistry.kt`, `renderScreens`, `:9500` and
the testTag conventions are the `cmp` provider's implementation. The core has an
interface; the profile has Gradle.

**The eyes work standalone.** `preview` as a dev loop and hot-reload never ran the lane
and never will need to. Providers require the core *present* (manifest, receipts to
read) and never *running*.

A mobile user's day is identical: `npx create-cmp-cli`, `node qa/verify.mjs`, the
gallery, the Stop hook. They will not notice the layers exist. A backend user's day:
`<harness> attach` → the manifest interview → the same lane, hook, receipts, specs,
briefs and console — with their own tiers, artifacts, steps and whichever providers they
wrote. The gallery says what it honestly can.

**The console gets renamed with the harness** (§14). Today it is "the studio console" —
mobile-branded. Tomorrow it is the harness console with mobile providers.

---

## 10. Distribution

### 10.1 Now: vendored, byte-identical, offline — unchanged

The lane is dependency-free and copied into `qa/` so a receipt is checkable from the
repo alone, air-gapped. That constraint is correct and stays. What changes is that the
*source* of the vendored bytes is the harness package + the profile, and `create-cmp`
is one stamper of them rather than their home.

### 10.2 The lock becomes a manifest, not a heuristic

Today `harness-region.mjs` decides what is locked by directory shape
(`HARNESS_DIRS = ["qa", "qa/lib"]` + `qa/test/**` + two named files). Verified on
`main`: `qa/gates/new-gate.mjs`, `qa/policy.json` and `qa/lib/thresholds.json` are all
outside the lock. The fix is not a better heuristic; it is the dpkg / npm-packlist
pattern: **the stamper writes the manifest of exactly what it vendored, with hashes, and
`harnessIntegrity` verifies against that manifest.** The profile directory is in it. A
file the stamper did not write is not the harness's — and if a gate reads it, §5.2's
declared-inputs rule catches that instead.

### 10.3 Later: pin + fetch + cache (Stage 1)

Every ecosystem that vendored-by-copy at scale abandoned it (Go `vendor/` → modules;
Debian's policy against embedded copies). pre-commit and GitHub Actions pin a version
and fetch into a cache; offline works from the cache. For a fleet of 100 repos — the
shape of one Evidence customer — this is the only model that lets a core fix reach
everyone and lets a receipt say "harness 0.20.0" and mean the *published* 0.20.0 rather
than a self-attested copy. It is a Stage 1 change (§11) and it changes what a receipt
*is*; it needs an ADR you sign.

---

## 11. Migration — by subtraction, never beside

### 11.1 The metric and the gate

**De-fork count: 11 → 0.** Five files already match upstream. Each remaining file is
independently valuable when it lands, and the blueprint is the live test: "does their
copy now match upstream, or is the difference entirely inside their profile?" is a
diff, not an opinion.

**Invariant:** the mobile offering never regresses. Gated as decision 4 says —
`scripts/fleet-check.mjs --min-level L2` green **once per PR**; the full suite and
`scripts/framework-check.mjs` green **on every commit**. De-fork count in every PR
description. Any single step past two days: stop and re-slice.

### 11.2 Stages and triggers

| Stage | Work | Exit criterion | Trigger |
|---|---|---|---|
| **0 — the lane seam** | `pack` in receipts. Manifest v2 with `profile`; `loadProfile`; **absent manifest refused**, `upgrade --harness` derives it for stamped apps, `attach` interviews for foreign repos. Move the six glue files, `steps-cmp`, `e2e-coverage`, `CMP_LADDER`, the Maestro helpers into `profiles/cmp/`. Parameterise `spec-coverage`, `approvals` (artifact list), `feature-brief` (design derivation), `arch-doc` (sections from data), `verify` (markers, pack load), `inputs-hash`, `receipt-validate`, `affected-tests`. Lint: no `steps-cmp` import under core. | De-fork count ≤ 3 with the blueprint on a `ktor-backend` profile authored from their `steps-blueprint.mjs`. Fleet L2 green per PR. | **taken** — a dependency-direction fix, not a port |
| **0.5 — the console into the harness** | Provider interface named from the existing tool contracts; **backend provider sketched on paper as the interface test**; console + MCP server move into the harness; section types formalised behind `console-tabs.mjs`; tool listing profile-driven; `cmp` providers extracted; neutral skills moved. | The console renders a stamped Compose app exactly as today, and renders a manifest-only backend fixture with every section present and honest. | Stage 0 exit — and **before** Stage 1, so the package boundary is drawn with the console inside |
| **1 — distribution** | Harness as its own package (console included); `create-cmp-cli` depends on it. Lock = stamper-written manifest (§10.2). Pin + fetch + cache as an *option*; vendored stays default. | A backend repo installs the harness without create-cmp. A core fix reaches it by version bump. | Stage 0.5 exit; **ADR signed** on what a pinned receipt means (§14) |
| **2 — profiles as artifacts** | Profile versioning + protocol handshake; `extends`; per-profile framework-check as the badge floor; Gatekeeper reads `pack`. Governance rows in the router from the profile. | A second profile authored by someone who is not Karel passes framework-check and mints a receipt Gatekeeper accepts. | a second external profile, **or** the §6 pinned issue |
| **3 — fleet** | `fleet-check` / `upgrade --harness` across a pinned fleet; the console as a fleet view. | 10 repos upgraded by one command; receipts comparable within pack. | first Evidence prospect with >10 repos |

### 11.3 Order of operations inside Stage 0

Smallest blast radius first, so each step is a small PR with the fleet check green:

1. **`pack` in the receipt** — additive; the pack declares its `id`; the version is the
   lock's until PR 2. Schema declares it optional. Old receipts still read.
2. **Manifest v2 + `loadProfile` + lint.** `profiles/cmp/index.mjs` exists but only
   re-exports what `steps-cmp` returns today; `verify.mjs` loads it by manifest.
   **Absent manifest → refuse.** 2a: `upgrade --harness` derives the manifest from
   `create-cmp.json` (stamped apps). 2b: `attach` runs the manifest interview (foreign
   repos) — M0b, promoted. The stamper writes a manifest on every new app. Fleet green.
3. Move the six glue files + `e2e-coverage` + Maestro helpers into `profiles/cmp/`.
   Update imports. Fleet green.
4. ✅ `spec-coverage`: `tierForFile` / `TIERS_SATISFYING` / roots from the profile
   (`profiles/cmp/declarations.mjs` → `spec-model.mjs`; resolved synchronously from a
   root via `loadProfileSync`). Fleet green. **Measured against the blueprint:** their
   `spec-coverage.mjs` diff does *not* go to 0 — they changed the clause grammar itself
   (`### ID — title` + `status:` lines, a phase-1 decision of theirs), which is the core's
   mechanic, not a layout fact. Collapsing that difference would need a grammar declaration
   in the profile — a new mechanism, refused under NORTH-STAR §8.8 until a second stack
   asks for it with a plant. The layout and tier facts they forked are now declarations.
5. ✅ `approvals`: artifact list from the profile (`profiles/cmp/artifacts.mjs`
   `artifacts(root)`, composed from the core's `featureBriefArtifacts` /
   `featureDesignArtifacts` / `featureSpecArtifacts` / `architectureArtifact`; an artifact
   may carry its own `hash(root)`; `governable(root)` guards writes). Fleet green. The
   blueprint's 322-line replacement can now be a profile `artifacts` array over the
   core's mechanic — their adoption, measured when they take it.
6. `feature-brief`, `arch-doc`, `verify` markers, `inputs-hash`, `receipt-validate`,
   `affected-tests`. Fleet green after each. Sliced, because one PR over seven modules is
   the badly-sliced change §12 warns about:
   - **6a ✅ the lane marker + the runner's build tool.** The marker is core state at
     `qa/.lane-in-progress` (`lane-markers.mjs`); the render marker comes from the
     profile's `layout.buildDir`; `GRADLEW`, `--rerun` and the KSP/render coexistence
     wrapper leave `verify.mjs` for the pack. **Residue, named and pinned by
     `test/lane-markers.test.mjs`:** `WATCH_ROOTS` (watch.mjs) and `ACTIVITY_ROOTS`
     (plan.mjs) still hardcode `composeApp/src`; `verify.mjs --help` still prints the
     pack's step names. Those are 6b's.
   - **6b** the source roots and the help text from the profile; `a11y.mjs`,
     `component-stories.mjs` and `androidChecksOutcome` into `profiles/cmp/`.
   - **6c** `arch-doc` sections from data, `feature-brief`'s journey wording,
     `affected-tests`' blast radius, `inputs-hash`' default surface,
     `receipt-check`'s device tier — all from the profile.
7. `framework-check`: plants from the profile. Fleet green; framework-check green in
   both the Compose scratch app and the blueprint.

Each step's PR carries its own plant where it changed a gate (Rule 1), and the de-fork
count in its description.

---

## 12. Risks, non-goals, and what would make this wrong

**Thesis dilution.** "Eyes and a definition of done on mobile" is a sharp product. "A
definition of done for anything" is a policy engine, and pre-commit, Danger, conftest,
Sonar and GitHub rulesets already live there. The agnostic harness is defensible *only*
as "the gate Gatekeeper attests, on any stack." It is not defensible as a harness for
its own sake. Positioning must say the first thing.

**Premature generalisation at N=1.** One profile has providers. An interface designed
against one implementation tends to be that implementation with abstract names.
Mitigation: derive the interface from the existing tool contracts (§9), and **sketch a
backend provider on paper as the test before shipping the interface** (§4.4). If the
sketch needs a different shape, the interface is wrong before it exists.

**The escape hatch becomes the norm.** "Profile-driven where not possible" can turn into
everything hard being tagged profile-driven and the console staying mobile in practice.
The §3.2 rule is the guard: no profile-owned tabs, ever. A section is a neutral type
with a provider, or it is not in the console.

**Non-goal: porting the eyes.** No `ktor` renderer, no backend inspector written by us.
A stack that wants eyes writes providers; that is someone else's demand to prove. What
this document does is make the *slot* exist.

**Non-goal: neutral governance content.** The core does not ship a "default" artifact
model for backends. A profile brings its own or has none. The blueprint's 1636-line
rewrite is the cost of pretending otherwise.

**Non-goal: more gates.** The migration removes hardcoding. It adds one loader, one
protocol, one provider interface, one receipt field. If a step in §11.3 adds a gate, it
is wrong.

**Risk: a bad profile borrows Gatekeeper's credibility.** Mitigated by §5.2 — no plants,
no rung above L0 — and by `pack` on every receipt. Not fully mitigated; a profile with
weak plants still gets a badge. Stage 2's registry is where that gets a floor.

**Risk: the refactor itself.** This week measured what a badly-sliced change costs.
§11.3 is seven small PRs with a green invariant, not one branch. If step 4 takes more
than two days, stop and re-slice. Stage 0.5 is the larger surface and must not block
the lane seam, which is where the blueprint is bleeding now.

**Risk: one maintainer, four products.** A docs site and a profile registry are the
most likely maintenance sinks. §11 trigger-gates them. Do not build a site before a
second profile exists.

---

## 13. Industry patterns — what is borrowed, what is not

| Pattern | Borrowed | Deliberately not |
|---|---|---|
| **Terraform core / provider** — core never knows a cloud; providers implement a protocol; versioned; registry | the one rule (§3.2); the protocol handshake (§5.4); profiles as separately-versioned artifacts | gRPC / process isolation — a profile is in-process ESM, because receipts must be checkable offline from the repo alone |
| **Nx** — core is task graph + caching + affected; plugins contribute generators, executors, inferred tasks, migrations, project-graph data | the five contributions map 1:1: scaffolder = generator, `steps()` = executor, `layout` = inferred config, `harness-upgrade` = migrations, `artifacts`/`architecture` = graph data | Nx's daemon and cloud cache |
| **Grafana** — panel types are core; datasources are plugins; a panel renders whatever the datasource returns | console section types are core; providers are the profile's (§9) | Grafana's plugin marketplace, until Stage 2 |
| **Storybook** — the shell is core; *renderers* per framework (React, Vue, Svelte…); the stories index is the surface registry | the surface gallery as a section type; `providers.surfaces.list/render`; `PreviewRegistry.kt` as the stories index | Storybook's addon system |
| **VS Code / LSP** — neutral client; the Outline view is a neutral tree fed by a per-language `DocumentSymbolProvider`; Problems fed by diagnostics | the inspector as a neutral tree fed by `providers.inspect`; drift as diagnostics-shaped | a language-server process boundary |
| **ArchUnit / dependency-cruiser / Konsist** — architecture rules as executable tests | `profile.architecture.rules` compile to arch tests the lane runs; the arch-doc derives from rules | a rule DSL of our own — the profile may delegate to Konsist/ArchUnit/dependency-cruiser directly as a step |
| **SLSA** — levels defined by the framework; what earns them per builder; provenance names the builder | the ladder split (§4.2 #6); `harness` + `pack` on every receipt (§8.1); comparability rule (§8.2) | SLSA's build-isolation requirements — different threat model |
| **dpkg -V / npm packlist** — a package declares exactly what it shipped, with hashes | the lock as a stamper-written manifest (§10.2) | — |
| **pre-commit / GitHub Actions** — pin + fetch + cache | Stage 1 distribution (§10.3) | making it the *default* before an ADR |
| **ESLint flat config** — declarative preset composition | `extends` (§4.5) | — |
| **MCP** — a host composes servers; tools are listed by the server | one harness server whose tool list is computed from the profile's providers (§5.2) | multiple servers per stack — one vocabulary is the point |
| **Bazel hermetic inputs** — a build reads only what it declared | `MEMOIZED_STEP_INPUTS` becomes enforced against `layout` (§5.2) | full sandboxing |
| **in-toto / Sigstore** | — | rejected this week for lack of countable demand; the manifest gets the same property offline |

---

## 14. Decisions

**Taken 2026-09-04:**

1. **Governance: mechanic in core, model in profile.** §1.3 is the evidence; §6 follows.
2. **The `cmp` profile is isolated completely, studio included.** The console lives in
   the harness as neutral section types; everything Compose is a provider (§3.2, §9).
   No profile-owned tabs.
3. **No default profile.** An absent manifest is refused and the user is told how to
   make one — derived for stamped apps, interviewed for foreign repos (§4.1).
4. **Stage 0 starts**, gated as §11.1: fleet L2 per PR, suite + framework-check per
   commit, de-fork count in every description.

**Open:**

5. **Name the harness.** `packages/harness` under the `create-cmp` name tells a Ktor
   team it is not for them, and the console is renamed with it. Not blocking Stage 0;
   blocking docs and Stage 1.
6. **Amend VISION §6.** It forbids a cross-stack port without a pinned-issue trigger.
   Stage 0 is a dependency-direction fix; Stage 2 is the port. The doc of record should
   say the in-house second stack is the trigger for Stages 0–1, or say it is not.
7. **Stage 1's ADR** — what a pinned receipt means versus a vendored one — before any
   distribution change.
