# Verification Layer — AI runtime eyes + human approval gates

> Design doc of record for the verification-layer build (2026-07-18). Follows the
> M3/M4 design-doc convention. Audited baseline: 0.8.0.
> Two audits inform this doc: the AI-eyes inventory and the human-input-surface
> inventory (both summarized inline — file:line refs are load-bearing).

## 0. Goal

Close the two halves of "a human and an AI verification layer":

- **AI half (eyes → runtime):** the agent's eyes today see UI structure only
  (semantics tree, tokens, screenshots-as-paths). Extend them to *behavior*:
  crashes, logs, DB state, and runtime constraints — as structured data, never
  panes. Network follows when a real HTTP client exists.
- **Human half (approvals):** the human today approves things conversationally
  (cmp-new interview, spec-clause confirmation, per-command consent) but nothing
  *gates* on approval. Introduce ordered, hash-bound approval of the governing
  artifacts — design system, architecture/structure, exemplar feature, exemplar
  specs, feature specs — enforced by the verify lane and the Stop hook, and
  eventually managed from a visual console on the existing preview gallery.

Design principle (unchanged): **pixels flow to the human; structure flows to the
AI.** The console is not an IDE — humans never author code there; they *see* and
*sign*. Everything here ships free in the studio.

## 1. The intended user flow (the ordered approval walk)

Order is load-bearing: each artifact is expressed in the vocabulary of the ones
before it. Approving out of order forces re-approval churn.

| # | Artifact | What the human sees | Why this position |
|---|---|---|---|
| 1 | **Design system** (`<Prefix>Colors` in `presentation/theme/Theme.kt`, `<Prefix>Tokens` in `presentation/theme/Tokens.kt`) | Swatch/dimen grid rendered from the machine catalog (`/inspect/design-system` shape) | The vocabulary everything else uses |
| 2 | **Architecture + structure** (`specs/app-base.spec.md` ARCH-01..05 + SHELL-01..05) | The clauses rendered readably + the project file tree | The shape, expressed in no one's vocabulary but its own |
| 3 | **Exemplar feature** (`home` — the 11-file set the stamper clones) | The home screen preview + its file list | Highest-leverage approval in the system: the stamper literally clones `home`, so approving the exemplar pre-approves the default shape of every future feature |
| 4 | **Exemplar spec** (`specs/home.spec.md`) | The clause list with coverage status | Fixes the contract grammar all feature specs inherit |
| 5 | **Per-feature: spec + design** (`specs/<feature>.spec.md`, per feature, ongoing) | Clause list + the feature's preview | Inherits 1–4; approved individually as features are added |

Flow in practice: scaffold → (later: cmp-new's final step opens the console) →
human walks 1→4 once → per-feature approvals (5) happen as features land. The
agent can *block on* an approval decision the same way it blocks on a render
(`waitForRender` → `waitForDecision`).

## 2. Approval mechanics (step 3 — the data model)

Reuses ADR-0005 (evidence binding by inputs hash) exactly — no new philosophy.

- **`qa/approvals.json`** (in the generated project, committed): per governed
  artifact: `{ artifact, status, hash, approvedAt }`. Status:
  `unreviewed | approved`.
- **Governed-artifact registry** in `qa/lib/approvals.mjs`: artifact id → file
  list (from the table above; the exemplar-feature list mirrors the stamper's
  copied-file set in `qa/scaffold-feature.mjs:209-221`). Hash = sha256 over the
  sorted file contents (same style as `computeInputsHash`, `qa/verify.mjs:440`).
- **CLI first, console later:** `node qa/approve.mjs <artifact>` records an
  approval (recomputes hash, stamps time); `node qa/approve.mjs --status` lists
  all artifacts + states. The console (step 4) calls the same library — the CLI
  is the API.
- **Verify-lane gate `approvals`** (in `qa/verify.mjs`, all profiles):
  - `unreviewed` → **SKIP** with a warning line (non-breaking for existing
    projects and fresh scaffolds — nothing fails until the human opts into the
    flow).
  - `approved` + hash matches → **PASS**.
  - `approved` + hash mismatch → **FAIL**: the artifact changed after sign-off
    and needs re-approval. Approval invalidation is mechanical, like goldens.
- **Stop hook:** free by composition — the existing `qa/receipt-check.mjs` Stop
  hook already refuses "done" when the receipt verdict isn't PASS; an approvals
  FAIL fails the lane, so the agent cannot claim done over an un-re-approved
  change. No new hook required, only the gate.
- **Stamper integration:** `add-feature` seeds the new feature's spec as
  `unreviewed` and prints the approval reminder. v1 does NOT refuse to stamp —
  warn-then-enforce-at-verify is the honest default; the console flow may
  tighten this later.
- Scaffold seeds `approvals.json` with every artifact `unreviewed`. The
  template's defaults are deliberately NOT pre-blessed — the whole point is that
  the human signs.

## 3. Runtime eyes (steps 1–2 — the AI half)

Everything attaches at one seam, per the audit: a route in
`template/composeApp/src/androidDebug/kotlin/com/example/app/inspector/InspectorHttpServer.kt`
(dispatch `:119-136`) → a fetcher in `inspector/mcp/src/lib/live.mjs` → a tool in
`inspector/mcp/bin/server.mjs` → (where warranted) a verify-lane step → the
receipt. Release builds stay structurally clean via the existing no-op-twin
pattern (`androidRelease/…/InspectorInit.kt`).

### 3.1 Eyes hardening (step 1)

- **Nav state as a first-class object.** Today navigation is only inferable from
  which testTags appear. Add `GET /inspect/nav` → `{ currentRoute, backStack }`.
  Constraint: `AppNavHost` is commonMain and must not reference debug-only
  classes; use a tiny common hook object (no-op unless something registers — the
  debug init registers) or an equivalent minimal seam. Release behavior must be
  unchanged; a test pins it. `navigate_and_inspect` gains route-level
  before/after alongside tag heuristics.
- **Contrast in `audit_a11y`.** The resolved color values are already in the
  tree (`designToken.resolved`). Where a node exposes both fg and bg resolved
  colors, compute the WCAG contrast ratio and flag < 4.5:1. Only fire when both
  values are genuinely known — no false positives from missing data.
- **ANR: report, don't hide.** `qa/verify.mjs:376` currently sets
  `hide_error_dialogs 1` for the e2e step — the eyes actively look away. Detect
  and surface ANR/crash dialogs during e2e as a reported failure line in the
  receipt instead of suppressing them.

### 3.2 Runtime feedback: crashes + logs (step 2, M1a/M1b desktop-and-adb-first)

- **Crash capture must survive the process.** An in-memory ring buffer dies with
  the crash. The uncaught-exception handler (installed in `startInspector()`,
  `InspectorInit.kt:13` — MUST chain to the previous handler, never swallow)
  writes crash JSON (`{ timestamp, exception, message, frames[] }`) to
  `filesDir/inspector/crashes/`; `GET /inspect/crashes` serves them (current
  boot + previous). 
- **Logs pragmatically:** no on-device log interception needed for v1 — the MCP
  `runtime_logs` tool shells `adb logcat --pid=<app pid> -d` with since/level
  filters and returns structured JSON entries (never a firehose; cap + tail).
- **Crash-to-cause attribution (the M1b differentiator):** the MCP side
  intersects crash stack frames with recently-edited files (the preview service
  already tracks source changes; git status/diff is the fallback) → verdict:
  `"your edit to X likely caused this"` with the frame↔edit intersection as
  evidence. Tests pin the attribution contract on fixtures.
- New MCP tools: `runtime_crashes { since }`, `runtime_logs { since, level, limit }`.

### 3.3 DB state (step 2, M5-DB)

- `AppDatabase`/`ItemDao` are already Koin singles reachable from androidDebug.
  `GET /inspect/db` (schema: tables via `sqlite_master`) and
  `GET /inspect/db?table=<name>&limit=<n>` (rows) — queried off the main thread
  via the underlying `SupportSQLiteDatabase`.
- **Injection-safe by construction:** the route accepts a validated table
  identifier only — never raw SQL from the wire. Read-only.
- New MCP tools: `db_schema {}`, `db_query { table, limit }` — answers "what's
  actually in the DB after this flow?" without a device screen.

### 3.4 Deferred (documented, not built)

- **Network interceptor:** no `HttpClient` is instantiated anywhere yet (ktor is
  declared but unused; Firebase is the real remote). The seam is documented —
  ring-buffer interceptor at client creation + `/inspect/network` — and waits
  for a real client. Do not build speculative plumbing.
- **Perf receipts (M4):** heap/frame stats on `/inspect/health` and an opt-in
  perf gate with committed baselines — later phase.

## 4. The console (step 4) and onboarding (step 5)

- **The console is new tabs on the existing resident preview service**
  (`inspector/mcp/src/lib/preview-service.mjs`, port 9600, SSE reload — all
  already there). Tabs: **Screens** (existing gallery), **Design System**
  (swatch/dimen grid from the catalog), **Approvals** (governed artifacts +
  status + Approve buttons), **Specs** (clauses + coverage from the latest
  receipt). Approve button → `POST /api/approve { artifact }` → same
  `qa/lib/approvals.mjs` library → SSE refresh.
- **Agent primitive:** new MCP tool `approval_status { waitForDecision }` —
  identical blocking pattern to `preview_status { waitForRender }`. The agent
  proposes, tells the human to look at the console, and blocks on the decision.
- **Rejected alternatives** (recorded so they aren't relitigated): Claude Code
  plugin panels (don't exist — plugins are skills/commands/MCP only), MCP
  widget/apps UIs (host support not reliable in the CLI today), a hosted web app
  (violates local-first), raw .md approvals as the UX (it's the storage layer,
  not the interface).
- **Onboarding (step 5):** cmp-new gains a final step — start the preview
  service, open the console, walk approvals in the §1 order. The generated
  project's CLAUDE.md documents the approval contract for any in-project agent.

## 5. Build plan: waves, ownership, integration seams

| Wave | Agent | Scope | Owns (files) | Must NOT touch |
|---|---|---|---|---|
| 1 | **A — runtime-eyes** | §3.1 + §3.2 + §3.3 | `template/composeApp/src/androidDebug/**`, common nav hook, `inspector/mcp/**` | `template/qa/verify.mjs`, `template/qa/receipt-check.mjs` (report needed edits instead) |
| 1 | **B — approvals** | §2 | `template/qa/**` (incl. `verify.mjs`, `approve.mjs`, `lib/approvals.mjs`), `template/specs`/CLAUDE.md touches, engine tests | `inspector/mcp/**`, `androidDebug/**` |
| 2 | **C — console** | §4 console + `approval_status` | `inspector/mcp/**` (preview-service, server.mjs) | `template/qa` logic (call it, don't fork it) |
| 2/3 | **D — onboarding** | §4 onboarding + docs sweep | `skills/cmp-new/SKILL.md`, template CLAUDE.md, README/docs | engine internals |
| — | Orchestrator | A's verify.mjs integration (ANR line + any receipt step) after wave 1; commits per wave; suite green; scaffold smoke; PR | — | — |

Rules: agents edit files, never commit (orchestrator commits per wave on the
feature branch). Repo-root `node --test` green is every agent's exit criterion;
new behavior lands with tests that pin the contract (project style: tests cite
the seam they pin). All work on one branch, PR to main at the end.

## 6. Definition of done (per step)

1. **Hardening:** `/inspect/nav` returns live route; contrast findings appear in
   `audit_a11y` on a seeded low-contrast fixture; e2e ANR is reported not
   hidden; release build provably unaffected (test).
2. **Runtime eyes:** deliberate NPE demo — agent receives the attributed crash
   via `runtime_crashes` (fixture-level test acceptable pre-device);
   `db_schema`/`db_query` answer against the template's Room DB; tools appear in
   server.mjs with schemas + tests.
3. **Approvals:** fresh scaffold → all `unreviewed` → lane SKIP-warns; approve
   via CLI → PASS; edit a governed file → FAIL → re-approve → PASS; Stop hook
   refuses over the FAIL (existing mechanism, test proves composition).
4. **Console:** approvals visible + clickable in the browser; `POST /api/approve`
   writes the same file the CLI writes; `approval_status { waitForDecision }`
   blocks and returns the decision; SSE refresh works.
5. **Onboarding:** cmp-new walks the §1 order; generated CLAUDE.md documents the
   contract; docs updated (README feature list, docs/USAGE.md).

## 7. VL-7 — the console becomes two-way (architecture view, components, comments)

Three gaps surfaced by first real console use (user feedback, 2026-07-19):
the architecture artifact has no screen (humans sign step 2 without *seeing*
it), the design system shows tokens but not the common components built from
them, and the console only talks one way — humans can approve but cannot
*comment*, so review feedback has no path back into plans/specs.

### 7.1 Architecture tab (see what you sign)

New tab between **Design System** and **Approvals** (tab order now mirrors the
§1 walk: screens → design-system(1) → architecture(2) → approvals → specs).
Content, all derived — never fabricated:

- **Layer map:** pure HTML/CSS boxes (no CDN) — `presentation` → `domain` →
  `data`, with `di` and `navigation` as cross-cutting rails. Package/file lists
  under each box come from a real walk of
  `composeApp/src/commonMain/kotlin/**`, grouped by top-level package. Missing
  dirs render an honest empty state.
- **The governed contract:** `specs/app-base.spec.md` clauses rendered via the
  existing `specs.mjs` parser (reuse, don't fork).
- **Feature shape:** the exemplar 11-file layout shown as a tree (from the real
  `home` feature's files), labeled as the shape `add-feature` stamps.

### 7.2 Design System tab: common components section

A **Components** section under the token grids, from a Node-side static scan
(no Kotlin/harness changes — component *preview* rendering is deferred,
documented): scan `presentation/components/*.kt` for `@Composable fun`
signatures; for each component show name, file, parameter list, and a
used-in list (grep of call sites across `presentation/**`). This is the
"common identified components" registry — structural truth, not screenshots.

### 7.3 Comments (the console talks back)

**Principle extension:** pixels flow to the human; structure flows to the AI;
*judgment flows back through comments.* Approvals stay binding; comments are
advisory input the agent must read, act on, and close.

- **Ledger (project-side, like approvals):** `qa/comments.json`
  (`{schema:"cmp-comments/1", comments:[]}`) + `qa/lib/comments.mjs` +
  `qa/comment.mjs` CLI (`--list [--open]`, `--resolve <id> --note "..."`).
- **Library contract (the bridge seam — binding for both agents):**
  - `listComments(root, {status?}) -> {schema, comments: Comment[]}`
  - `addComment(root, {target, text, author}) -> {ok:true, comment} | {ok:false, reason}`
    — refuses empty/whitespace text and unknown target types.
  - `resolveComment(root, id, {note, author}) -> {ok:true, comment} | {ok:false, reason}`
    — refuses unknown ids and double-resolve.
  - `Comment = {id, target, text, author, createdAt, status: "open"|"resolved",
    resolvedAt?, resolvedBy?, resolutionNote?}`; ids `c1, c2, …` monotonic.
  - `target.type ∈ screen | element | spec-line | design-system | architecture |
    general` with fields: `{screen}`, `{screen, testTag}`, `{file, clauseId}`,
    `{token}`, `{path}`, `{}` respectively.
- **Console affordances:** a 💬 control on every screen card (with optional
  testTag field for element-level), every spec clause row, every
  swatch/dimen/component card, and every architecture tree node; plus a new
  **Comments** tab — the full ledger with status, resolution notes, and an
  open-count badge in the tab bar. `POST /api/comment { target, text }` →
  project's own `qa/lib/comments.mjs` via a dynamic bridge
  (`comments-bridge.mjs`, same degrade-honestly pattern as
  `approvals-bridge.mjs`) → SSE `comment` event → in-place panel refresh
  (VL-6 pattern — no full-page reload).
- **Agent primitives (server.mjs, 23 → 25 tools):**
  - `review_comments { status?, waitForComment?, timeoutMs? }` — snapshot of
    the ledger; with `waitForComment` blocks until a new comment lands
    (mirrors `approval_status { waitForDecision }`).
  - `resolve_comment { id, note }` — the agent closes the loop *after* acting
    (updating the spec/plan/code), recording what it did.
- **Loop of record:** human comments in console → agent observes
  (`review_comments`) → agent updates the plan/spec/code → agent resolves with
  a note → console shows `resolved` + note. Humans add/see; agents resolve —
  the console never edits code, per §4's principle.
- **Deferred (documented, not built):** comment threads/replies, a verify-lane
  open-comments warning, human-side resolve/withdraw buttons, component
  isolated previews.

### 7.4 Ownership & DoD

| Agent | Owns | Must NOT touch |
|---|---|---|
| **E — console** | `inspector/mcp/**` (architecture.mjs, components.mjs, comments-bridge.mjs, console-tabs.mjs, preview-service.mjs, bin/server.mjs, tests) | `template/qa/**` (call via bridge, never fork) |
| **F — template** | `template/qa/lib/comments.mjs`, `template/qa/comment.mjs`, `template/qa/comments.json`, `template/CLAUDE.md`, engine tests, docs sweep (README/llms.txt/docs/USAGE.md: tool count 23→25, comments + architecture tab) | `inspector/mcp/**`, `template/qa/verify.mjs` |

DoD: repo `node --test` green; architecture tab renders real tree + clauses on
the showcase; components section lists BaseScreen with real signature + call
sites; a comment added in the browser lands in `qa/comments.json`, is observed
by a blocked `review_comments { waitForComment }`, and `resolve_comment` writes
the resolution the console then shows; older scaffolds (no comments lib)
degrade to an honest empty state, never an error.
