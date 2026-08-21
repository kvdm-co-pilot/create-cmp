# create-cmp — the complete usage guide

> **Read this first.** It is the single entry point to the whole product: setup, the engine CLI,
> the 10 skills, the `cmp-inspector` MCP (15 tools), and the workflows that tie them together. An
> agent that reads this knows how to drive create-cmp end to end. Concise by section, exhaustive in
> total. Companion deep-dives are cross-linked; you rarely need them.

---

## 1. What it is (the mental model)

create-cmp is the **AI delivery harness for Kotlin/Compose Multiplatform**: it makes an
(Android + iOS) app **that builds green**, encodes industry best practices at every layer as
executable patterns and gates, binds Claude Code to them, and stays useful for the whole life of
the project (product definition: [`HARNESS-PLAN.md`](./HARNESS-PLAN.md)). Four ideas explain
everything:

1. **Determinism over generation.** The 90% of a CMP project that's identical every time is a
   **frozen, CI-verified golden template** the engine *stamps* (copy → token-replace → toggle
   features → verify). No LLM in the scaffold hot path. That's why the build is reproducible.
2. **The app is AI-inspectable.** Every generated app can report its *running* UI as structured
   JSON — hierarchy, geometry, resolved design tokens, navigation state — over a debug-only local
   server. The agent reads structure, never screenshots.
3. **Pixels for the human, structure for the AI.** Where a human needs to *see* (previews, the live
   device view), pixels are written to a file the human opens — they never enter model context.
4. **Verification is the contract.** The generated project carries its own definition of done —
   pattern exemplars with tests, executable conformance checks, and a verify lane that produces a
   typed verdict with evidence. An AI working in the project is not done until the lane passes.
   *(The harness layers are being built out — see [`HARNESS-PLAN.md`](./HARNESS-PLAN.md) for what
   ships today vs next.)*

**Two front doors, one engine:** the `create-cmp` CLI (`npx`) and the Claude Code plugin (10 skills +
the MCP). Same deterministic Node engine behind both.

**The frozen version set** (moved as one unit by `upgrade`; never bump a piece in isolation):
the authoritative pins live in [`VERSIONS.md`](./VERSIONS.md) and `src/versions/registry.json` —
Kotlin/KSP in lockstep, Compose MP, Room, AGP, Koin, Ktor, Nav Compose, GitLive Firebase, with
`ksp.useKSP2=true` (the Room-on-iOS/native catch-22). This doc deliberately quotes no numbers.

> **Scope now:** Android + host-JVM are the active targets. iOS template support is intact and
> compiles, but iOS CI is parked (manual dispatch). The inspector/live-view/dev-client features are
> Android + desktop.

### What a generated project carries

Every stamped app is self-contained — the harness's real point (§8-H): a plain Claude Code
session with **no create-cmp plugin installed** can extend it correctly, because the contract
ships inside the repo, not in the tooling that made it.

| Path | What's there |
|---|---|
| `CLAUDE.md` | The AI delivery contract — definition of done, spec-first workflow, architecture/testing rules. |
| `composeApp/` | The shared Kotlin/Compose Multiplatform module — `commonMain` (presentation/domain/data), `androidMain`, `iosMain`, `desktopMain`, plus `androidDebug`'s inspector server. |
| `specs/` | `app-base.spec.md` (architecture/shell clauses), `home.spec.md` (the exemplar feature's clauses), `intent.md` (the genesis-walk intent brief), `README.md` (the clause grammar). |
| `docs/` | `ARCHITECTURE.md` (the app's own architecture, `cmp:generated` sections tree-derived), `TESTING.md` (the test pyramid applied here), `dev-client.md`, `adr/`. |
| `qa/` | The harness: `verify.mjs` (the profile-tiered lane above) · `approve.mjs` + `approvals.json` (governed-artifact sign-off, §6) · `comment.mjs` + `comments.json` (§7) · `scaffold-feature.mjs` (the `add-feature`/`add-screen`/`add-repository` stamper) · `watch.mjs` (inner-loop fast-tier re-runs) · `receipt-check.mjs` (the Stop-hook gate) · `arch-doc.mjs` · `record-audit.mjs` (cmp-audit cadence) · `refusal-demo.mjs` · `preview-gallery.mjs` · `e2e/` (Maestro flows) · `golden/` (golden-tree baselines) · `evidence/latest.json` (the committed receipt). |
| `.claude/skills/` | `add-feature`, `add-screen`, `add-repository` — the in-project stampers, usable with zero plugin. |
| `.github/workflows/verify.yml` | CI re-runs the lane on every push and confirms the committed receipt still attests `HEAD`. |
| `manifest.json` | The scaffold's own record of what was stamped (flags, verify commands) — read by the CLI's standalone `verify` command. |

---

## 2. Setup

**Requirements:** Node ≥ 18 to run the engine. JDK 17, Android SDK + an emulator/AVD, and (for the
inspector's live tier) `adb` for the app itself. macOS only for iOS output. Everything else — the
Android SDK, Appium + drivers (the legacy e2e path), CocoaPods/XcodeGen — the built-in **doctor**
detects and (with consent) installs. The E2E flows themselves run on Maestro, installed separately
with `curl -fsSL https://get.maestro.mobile.dev | bash`.

**Get the tool** — published on npm; no clone, no install:

```bash
npm create kmp@latest my-app                      # the lead invocation (alias → create-cmp-cli)
npx create-cmp-cli@latest --help                  # the engine directly (installs the `create-cmp` command)
```

Working from a checkout of this repo instead: `node bin/create-cmp.mjs --help`.

**Claude Code plugin** (adds the 10 skills + the `cmp-inspector` MCP):

```text
/plugin marketplace add kvdm-co-pilot/create-cmp
/plugin install create-cmp
```

**No `/plugin` command available** (non-interactive/headless sessions — e.g. `claude -p`, CI, or an
agent session that can't open the terminal-dialog UI): `/plugin` is a UI-only command and has no
CLI equivalent. Add both keys directly to `.claude/settings.local.json` (personal) or
`.claude/settings.json` (team-wide) instead:

```json
{
  "extraKnownMarketplaces": {
    "create-cmp": {
      "source": { "source": "github", "repo": "kvdm-co-pilot/create-cmp" }
    }
  },
  "enabledPlugins": {
    "create-cmp@create-cmp": true
  }
}
```

This is not a one-line prompt fix — confirmed by driving it end-to-end. The marketplace clone and
the actual plugin install are two separate steps that happen on Claude Code's startup/config-sync
pass, not the instant the JSON is written: expect a short lag while
`~/.claude/plugins/known_marketplaces.json` (marketplace registered) and then
`~/.claude/plugins/installed_plugins.json` (plugin actually installed, pinned to a resolved
`gitCommitSha`) get populated. Skills only show up in a session that started *after* the install
row exists; MCP tools (`cmp-inspector`) can pick up mid-session once installed, since they're
resolved lazily via tool search rather than baked into the system prompt at session start. If a
session's skill list still looks stale after installedPlugins shows the entry, restart the session.

**Register the MCP standalone** (outside the plugin):

```bash
claude mcp add cmp-inspector -- node /absolute/path/to/inspector/mcp/bin/server.mjs
```

**First move on any machine:** run **`doctor`** — it verifies (and heals) the toolchain, and
diagnoses any KMP project it's pointed at.

---

## 3. The engine CLI

`create-cmp <command>` — the default command is `create` (a bare `create-cmp [dir]` scaffolds).
Every command except `create` works on **any** KMP project, not only ones create-cmp made.

| Command | Purpose | Key flags |
|---|---|---|
| `create [dir]` | Stamp a new app from the frozen template; `--verify` proves a green build before returning. | `--name --package --bundle-id --region --theme-prefix --target-dir <dir>` · `--ios/--no-ios` · `--firebase/--no-firebase --auth <email\|phone\|both\|none>` (sub-toggles, default = `--firebase`'s value: `--firestore/--no-firestore --storage/--no-storage --functions/--no-functions --fcm/--no-fcm`) · `--room/--no-room` · `--e2e/--no-e2e` (the Maestro E2E harness; feature key renamed from `appium` in 0.3.0 — `--appium/--no-appium` still works as a deprecated alias) · `--inspector/--no-inspector` · `--dev-client/--no-dev-client` · `--tabs Home:home,Profile:person` · `--verify/--no-verify` · `--yes` · `--force` |
| `doctor` | Toolchain preflight **+** project diagnosis (kotlin↔ksp lockstep, drift vs the proven set, the KSP2/iOS catch-22, `sdk.dir`, `~/.konan` bloat, disk, and an inspector-stays-debug-only check). See also [docs/errors/](errors/README.md) — one page per build failure `doctor` diagnoses, with the exact error text and the manual fix. | `--fix` (safe heals) · `--yes --no-install --no-ios --target-dir <dir>` |
| `upgrade` | Migrate `gradle/libs.versions.toml` to the next **proven-green** version set: diff table → surgical in-place edits (comments/format preserved) with `.bak-upgrade` backups → optional verify. Lockstep guardrail refuses a broken kotlin↔ksp pairing. | `--target-dir <dir> --set <id> --dry-run --yes --verify` |
| `clean` | Cache & build-output hygiene: stale `~/.konan` toolchains + project `build/`/`.gradle/` (sizes shown, consent-gated); global Gradle caches are size-reported only. | `--target-dir <dir> --dry-run --yes` |
| `verify` | Run the green-build gate (Android; iOS on macOS when `iosApp/` exists) against an existing project. | `--target-dir <dir> --no-ios --dry-run` |

**Determinism rule for agents:** never hand-author Gradle files / the iOS shell / navigation / DI —
that's exactly what makes CMP flaky. Stamp with the engine, then author only per-app screens.

**Full options reference:** [`options.schema.json`](../options.schema.json) is the schema both
front doors (CLI flags, the plugin's interview) build into and the engine validates against —
the authoritative shape when a flag's exact type/default matters.

### The verify lane — profile-tiered, no single gate count

Don't confuse the CLI's standalone `verify` command above (a green-build check you can point
at any project) with the richer lane every generated project carries at `qa/verify.mjs` —
that one is **profile-tiered**: how many steps run depends on `--profile`, so "N gates" is
never a fixed number. Bare `node qa/verify.mjs` (no `--profile`) defaults to `local`.

| Profile | Steps | What it adds over the previous tier |
|---|---|---|
| `scaffold` | 9 | What `create-cmp --verify` proves at stamp time: harness integrity, specCoverage, approvals, componentStories, reachability, archDoc, schemaHistory, build, unitTests. |
| `local` | 16 | The full JVM tier (conformance, goldenTrees, tokenDrift, a11y), the release-build compile check, `androidChecks`, and (device attached) `e2eSmoke` — device-dependent steps SKIP honestly with no device. |
| `ci` | 17 | `local` plus the determinism probe's row (the probe itself stays opt-in behind `--determinism`; the row records whether it ran, so a SKIP is visible rather than absent). |
| `release` | 19 | `ci` plus the audit-cadence report and the release-APK behavior smoke (`releaseSmoke`) — the ship-time profile, run before cutting a release, never per-change. |

`--fast` runs the resolved profile minus the device/release-gated steps — the inner loop
`qa/watch.mjs` re-runs on every save. Every run produces one typed `PASS`/`FAIL`/`SKIP`
verdict plus a schema-validated evidence pack (`qa/evidence/latest.json`); SKIPs are always
named, never silently absent. See §6 for the `approvals` step's own semantics and §8-H for
the lane in the agent's edit loop.

---

## 4. The 10 skills

Skills are the plugin's conversational front door; each shells the same engine or the MCP. Invoke by
intent — the descriptions carry rich triggers.

| Skill | Use it to… | Under the hood |
|---|---|---|
| **cmp-new** | Start a new mobile app (Android + iOS) by interview — fires on framework-undecided "create a mobile app" requests (honest CMP-vs-RN/Flutter fit check first) as well as explicit CMP/KMP asks and comparisons like "React Native vs KMP". | Interviews (incl. intent) → `create --verify` → the genesis walk: express-approve or shape design/architecture/components/exemplar together (§6). |
| **cmp-doctor** | Set up or fix the toolchain / diagnose any KMP build. | `doctor` (+ `--fix`). |
| **cmp-upgrade** | Bump Kotlin/CMP/KSP/Room/AGP safely. | `upgrade` (diff → apply → verify). |
| **cmp-firebase-connect** | Wire a fresh app to its **own** Firebase (the #1 post-scaffold manual step). | Firebase CLI: login → project create/reuse → app register → real `google-services.json` replaces the placeholder → green build proves it. Consent-gated per cloud write. |
| **cmp-dev-client** | Run the shared UI in a desktop window with Compose Hot Reload. | `:composeApp:hotRunDesktop --auto` / `:composeApp:run`. |
| **cmp-inspect** | See/drive a running Compose UI as JSON; check tokens, drift, a11y; the verified dev loop. | The `cmp-inspector` MCP (§5). |
| **cmp-preview** | Live previews of REAL screens, zero commands. | `preview {projectDir}` → live gallery URL; watches sources, re-renders on save; structural summaries for the agent. |
| **cmp-test** | Generate a regression suite by **observing** the app. | Reads the live tree via the MCP → derives a plan → writes Maestro E2E flows + golden-tree snapshots in the shipped harness style. |
| **cmp-qa-prep** | Bring up emulator + Maestro flow run + the bottom-nav smoke (legacy Appium bring-up path also supported). | Emulator + Maestro harness. |
| **cmp-audit** | Adversarial audit of one subsystem against its spec **and** platform semantics — the defect class desktop-tier tests can't see (alarm/notification/PendingIntent identity, reboot, process death, Doze, DST). | Reads spec clauses + every source set (`commonMain` **and** `androidMain`/`iosMain`) + tests → a platform-semantics question bank (identity, lifecycle, cancellation, delivery, state re-ask, permissions, coverage arithmetic) → a refuter pass kills weak findings → survivors land in the change flow as a spec amendment + failing-test-first fix proposal, or a named human decision — never a direct unreviewed fix. `node qa/record-audit.mjs <subsystem>` logs the cadence. |

---

## 5. The `cmp-inspector` MCP (15 tools)

A stdio server that reads a Compose UI as a **single JSON tree contract** and never returns pixel
bytes. Node: `node inspector/mcp/bin/server.mjs`.

### The tree contract (schemaVersion 1)

```
node = { testTag, text, contentDescription, role?, clickable?, disabled?,
         bounds:{x,y,width,height},               // pixels, root-relative
         designToken:{ tokens:string[], resolved:{[k]:string} } | null,
         children: node[] }
tree = { schemaVersion:1, source, root: node }
```

`designToken` is the moat: create-cmp owns the theme + component kit, so components **self-report
their resolved tokens** (padding/radius/color) into the tree. That's what makes it design-system
aware, not just geometry — and it's unavailable via generic tooling.

### Sources — one contract, three tiers (the `source` union)

Every tool takes an optional `source`; the bare `treePath` still works and means `{kind:"file"}`.

```
source? = { kind:"file",        path }                    // tier 0 — headless harness JSON on disk
        | { kind:"live",        host?, port? }            // tier 1 — the RUNNING app (default 127.0.0.1:9500)
        | { kind:"uiautomator", xml? | xmlPath? }         // tier 2 — Appium page-source XML (any app)
```

Resolution: explicit `source` → `treePath` → the `connect_live` session default →
`$CMP_INSPECTOR_LIVE` → `$CMP_INSPECTOR_TREE` → clear error.

- **file (tier 0):** the app's generated harness renders its REAL screens headlessly (no
  emulator) → JSON + PNG. `./gradlew :composeApp:renderScreens [-Pscreen=<id>]` renders every
  `inspector/PreviewRegistry.kt` entry (real DI/theme/data) to `composeApp/build/previews/<id>/
  {tree.json, screen.png}`; `node qa/preview-gallery.mjs` builds a self-contained gallery
  `index.html` from it. Parameters are `-P` properties, never `--args`. Best for the fast inner
  loop and for humans who want previews without running the app.
- **live (tier 1):** the RUNNING app. Each call re-fetches `/inspect/tree` (pull-on-demand: always
  the current screen, real data + nav state). Needs a **debug** build running + `connect_live`.
- **uiautomator (tier 2):** any app, zero instrumentation — but `designToken` is always `null`
  (tokens don't cross the accessibility bridge), so token/drift tools reject it.

### The 15 tools

A deliberately lean surface: two production apps proved that a wide tool catalog gets ignored
while the verify lane and a few daily verbs carry all the flow. Token drift, a11y audits, and
golden regression live in the **lane** (`tokenDrift`, `a11y`, `goldenTrees` steps), not in
interactive twins.

**Read & assert:** `inspect_tree` — the one tree contract: full tree + counts; `testTag` narrows
to one subtree; `format:"wireframe"` returns the deterministic SVG wireframe (tokenized nodes
with resolved-value chips, clickable outlines, optional `a11yOverlay`); `includeLayoutGaps`
adds a computed-spacing report for consecutive tagged siblings.

**Live (tier 1):** `connect_live {port?,serial?,relaunch?}` — self-healing handshake: device
attached → `adb forward` ensured → health poll → app launched if dead (applicationId derived
from the project, never hardcoded) → one adb-server transport reset on `device offline` — every
failure names its stage and the one next command; returns `remoteUrl` and sets the session
default source · `navigate_and_inspect {testTag?|x,y,settleMs?}` — resolves a tap from the live
tree, taps via `POST /inspect/tap`, re-fetches, returns `{before, after, changed}` (structural
navigation, zero pixels).

**Runtime (behavior, not just structure):** `runtime_crashes {since?}` — crash JSON written to
`filesDir/inspector/crashes/` by the uncaught-exception handler (survives the process that
crashed), intersected with recently-edited files for a `"your edit to X likely caused this"`
attribution · `runtime_logs {since?,level?,limit?}` — structured `adb logcat --pid=<app pid>`
entries, capped + tailed, never a firehose · `db_query {table,limit?}` — the app's Room DB,
read-only, table identifier validated (never raw SQL from the wire): assert persisted state
after a flow instead of trusting the UI. (Schema questions: the exported Room schema JSONs are
already in the repo.)

**Render:** `render_screen` — **pixel preview, path-only**: returns
`{path,width,height,sizeBytes,displayHint}` from the PNG header, never bytes. From
`projectDir` (+ `screen?` registry id — through the resident preview daemon when one is running
(`via:"daemon"`, ~1s warm) else the app's own `:composeApp:renderScreens`, also returns
`treePath`), live (`/inspect/screenshot`), a `pngPath`, or the demo harness.

**Console bridge:** `approval_status {waitForDecision?}` · `review_comments {waitForComment?}` ·
`resolve_comment {id,note}` · `snapshot_variant {name}` (genesis design-language candidates).

**The agent edit loop** (the reason these tools exist — use it while BUILDING, not only when
asked): 1) `preview {projectDir}` once; 2) edit code; 3) `preview_status {waitForRender:true}` —
blocks until the outcome: which screens changed, or the compile error, or the failed hot swap;
4) `preview_diff {screen}` — proven verdict. Feedback in seconds, no device, no polling.

**Preview service:** `preview {projectDir, port?, hot?}` — resident live-preview loop: headless
render of every registry screen, live gallery URL (SSE self-reload, changed-screen flags), source
watch with auto re-render; `hot` (default true) boots the resident preview daemon under Compose
Hot Reload so saves hot-swap into a warm JVM (~1s/screen renders; Gradle-path fallback is
transparent); returns per-screen structural summaries + tree paths · `preview_status
{waitForRender?, timeoutMs?}` — the agent's post-edit call: with `waitForRender:true` it BLOCKS
until the next render or hot-recompile outcome, then returns `changedLastRender`,
`lastError`/`lastErrorSource` (`"compile"` = the edit didn't build — a watchdog compile check
surfaces daemon-mode failures the hot recompiler hides), `lastActivity`, and per-screen summaries (`lastChangedVersion` keeps
attribution across renders) · `preview_diff {screen}` — a verified structural diff between a screen's last two
renders with ZERO snapshot bookkeeping (the service retains the previous generation; drift checked
against the previews dir's design-system.json) · `preview_stop` —
shut the service down (the Gradle daemon stays warm).

**Approvals (the human half of the verification layer):** `approval_status {waitForDecision?,
timeoutMs?}` — every governed artifact's live status (intent brief, design system,
architecture+structure, components, exemplar feature, exemplar spec, per-feature specs — §6
below), read via the project's own `qa/lib/approvals.mjs`. Without `waitForDecision`: the current
snapshot `{available, statuses:[{id,label,status,hash,storedHash,approvedAt,fileCount,missing,
resolvable,mode?,reopenedAt?}]}` (`status` includes `reopened`; `mode` is `"defaults-accepted"`
for an express-lane approval). With `waitForDecision:true`: BLOCKS — same pattern as
`preview_status`'s `waitForRender` — until any artifact's status changes (a console
Approve/Reopen click, or `node qa/approve.mjs <artifact>` / `--reopen <artifact>` run in a
terminal), then returns `{timedOut, available, changed:[artifactIds], statuses}`. Requires a
running preview service (`preview {projectDir}` first) — that's where the project root comes
from.

**Genesis (the design-language workbench — GENESIS-FLOW-DESIGN.md §2):** `snapshot_variant
{name}` — stashes the CURRENT preview render (every screen's `screen.png` from the last
completed render, plus `design-system.json`) into
`composeApp/build/previews/variants/<name>/`, replacing a same-named variant if one exists;
`name` must match `[a-z0-9-]+`. The typical loop: edit `Tokens.kt` → `preview_status
{waitForRender:true}` → `snapshot_variant {name:"warmer"}` → repeat per candidate → the human
compares them side by side in the console's Design System tab candidates strip and clicks Pick,
which posts a `pick:<name>` comment observed the normal `review_comments` way. Requires a running
preview service with at least one completed render.

**Comments (the console talks back — §7 below):** `review_comments {status?, waitForComment?,
timeoutMs?}` — a snapshot of `qa/comments.json`, read via the project's own
`qa/lib/comments.mjs`; `status` filters to `"open"`/`"resolved"`. With `waitForComment:true`:
BLOCKS — same pattern as `approval_status`'s `waitForDecision` — until a new comment lands, then
returns the refreshed snapshot · `resolve_comment {id, note}` — closes a comment *after* the agent
has acted on it (author recorded as the agent), refusing an unknown id or a comment already
resolved. Approvals gate the lane; comments never do — they're advisory input the agent is
expected to read and act on, not a blocking check.

### The in-app server (tier 1 plumbing)

A **debug-only** zero-dependency server the generated app runs on `127.0.0.1:9500`, **structurally
absent from release builds**. Routes: `GET /inspect/health` · `/inspect/tree` · `/inspect/design-
system` · `/inspect/screenshot` (PNG) · `POST /inspect/tap {x,y}` · `GET /inspect/remote` (the
human's live device view page — watch + click-to-tap the real app). Reach it with
`adb forward tcp:9500 tcp:9500` (or just call `connect_live`).

---

## 6. Approvals — human sign-off on governed artifacts

Every generated project also carries a human half to the verification layer: six **governed
artifacts**, in a **definition order**, not just an approval order — each is the vocabulary the
next is written in — and hash-bound the same way an evidence receipt is bound to the code it
verified.

| # | Artifact | Files |
|---|---|---|
| 0 | Intent brief | `specs/intent.md` |
| 1 | Design system | `presentation/theme/Theme.kt`, `presentation/theme/Tokens.kt` |
| 2 | Architecture + structure | `specs/app-base.spec.md` |
| 3 | Components | `presentation/components/*.kt` (dynamic, sorted glob) |
| 4 | Exemplar feature | the **configured** exemplar's 11-file set `add-feature` clones from (`home` by default) |
| 5 | Exemplar spec | `specs/<exemplar>.spec.md` |
| 6+ | Per-feature spec | `specs/<feature>.spec.md`, one per non-base, non-exemplar feature as it lands |

**Configurable exemplar:** `qa/approvals.json` carries a top-level `"exemplarFeature"` key
(absent ⇒ `"home"`, so every ledger written before this key existed keeps meaning what it meant).
It names the feature whose file set is the governed exemplar-feature/exemplar-spec artifacts AND
the clone source `qa/scaffold-feature.mjs` stamps new features from — retargeting it to the app's
own first feature is the genesis walk's endgame (see below); `home` then demotes to an ordinary
per-feature spec.

**Commands:**

| Command | What |
|---|---|
| `node qa/approve.mjs --status` | List every governed artifact + live state (`unreviewed` / `approved` / `changed-since-approval` / `reopened`) + short hash + mode badge |
| `node qa/approve.mjs <artifact>` | Record approval — hashes the artifact's files now, stamps the time (also clears a `defaults-accepted` mode: shaping upgrades the record) |
| `node qa/approve.mjs --accept-defaults` | **Express lane**: approve every currently-resolvable artifact in one visible act, each stamped `"mode": "defaults-accepted"`. Unresolvable artifacts are skipped with the standard refusal, never silently. |
| `node qa/approve.mjs --reopen <artifact>` | **Reopen for redesign**: move an *approved* artifact back to `reopened` (recorded `reopenedAt`); refuses unknown ids and anything not currently approved. |

**The console:** the same preview-service URL from `preview {projectDir}` carries an **Approvals**
tab (alongside **Screens**, **Design System**, **Architecture**, **Specs**, and **Comments**) —
click Approve there and it calls `POST /api/approve`, which writes the exact same
`qa/approvals.json` the CLI writes; a **Reopen** button beside Approve on approved rows calls
`POST /api/reopen` the same way. An agent blocks on the human's decision with `approval_status
{waitForDecision:true}` (§5) instead of polling. The **Design System** tab also lists the app's
common components (name, file, params, used-in call sites) from a static source scan below the
token grids — plus, while `design-system` is unreviewed/reopened, the **candidates strip** from
the design-language workbench (§5's `snapshot_variant`) — and the **Architecture** tab renders the
layer map (`presentation` → `domain` ← `data`, with `di`/`navigation` as cross-cutting rails), the
governed `app-base.spec.md` clauses, and the exemplar feature's file tree — everything derived
from the real project, never fabricated.

**Gate semantics** (the `approvals` step, in every verify-lane profile):
- **`unreviewed`** → **SKIP** with a warning line — non-blocking; nothing fails until a human
  opts in.
- **`reopened`** → **SKIP** with a warning line, exactly like `unreviewed` — sanctioned redesign
  never trips the gate.
- **`approved`, hash still matches** → **PASS**.
- **`approved`, hash no longer matches** → **FAIL**, naming the artifact and the re-approval
  command — the artifact changed after sign-off without a reopen. A gate FAIL fails the lane
  verdict, which the Stop hook and CI both already refuse "done" over — no separate enforcement
  to maintain. A run with one reopened artifact and one drifted artifact FAILs naming only the
  drifted one — redesign is a decision, drift is an accident.

### The genesis walk — defining artifacts before freezing them

On a fresh scaffold nothing generic gets signed: the `cmp-new` skill runs an intent interview
(purpose, audience, platforms, brand feel, reference apps, first screens → `specs/intent.md`),
proves the build GREEN, then offers a fork:

- **Express lane** — `qa/approve.mjs --accept-defaults`, build now, walk the definition later.
- **Guided walk** — a conversation per artifact, each ending in its approval, in the registry
  order above: intent → design language (the candidates workbench, §5) → architecture
  (comprehension + configuration, not open-ended choice) → components (propose/shape/approve) →
  the human's own first feature stamped as the exemplar (`qa/scaffold-feature.mjs`, then
  `exemplarFeature` retargeted) → exemplar spec.

Full design: [`GENESIS-FLOW-DESIGN.md`](./GENESIS-FLOW-DESIGN.md). Step-by-step skill behavior:
[`skills/cmp-new/SKILL.md`](../skills/cmp-new/SKILL.md).

`add-feature` seeds each new feature's spec as `unreviewed` automatically and prints the approval
reminder; it never refuses to stamp over this. Approving zero or partially-resolved files is
refused outright (a vacuous approval would attest nothing) — see
[VERIFICATION-LAYER-DESIGN.md](./VERIFICATION-LAYER-DESIGN.md) §2 for the full data model.

## 7. Comments — the console talks back

Approvals are binding; comments are advisory. Where an artifact needs a person's sign-off, a
comment is a person's *running feedback* — on a screen, a spec clause, a design-system token or
component, an architecture tree node, or general — with a defined path back into the agent's
plan, spec, and code.

**The ledger:** `qa/comments.json` (`{schema:"cmp-comments/1", comments:[]}`), owned by
`qa/lib/comments.mjs` (state, validation, transitions — the same split as `qa/lib/approvals.mjs`)
and fronted by `qa/comment.mjs`, the CLI:

| Command | What |
|---|---|
| `node qa/comment.mjs --list [--open]` | Every comment (or open-only), with resolution notes for resolved ones |
| `node qa/comment.mjs --resolve <id> --note "..."` | Resolve a comment, recording what changed (author `agent-cli`) |

**Targets:** `screen` (`{screen}`) · `element` (`{screen, testTag}`) · `spec-line`
(`{file, clauseId}`) · `design-system` (`{token}`) · `architecture` (`{path}`) · `general` (no
fields). `addComment` refuses empty/whitespace text and a target missing the fields its type
requires; a ledger that exists but can't be parsed is never silently read as empty — reads throw,
writes refuse, rather than fabricate an inbox with nothing in it.

**The console:** a 💬 control on every screen card, spec clause row, design-system swatch/dimen/
component card, and architecture tree node, plus a **Comments** tab (full ledger, an open-count
badge). Adding one calls `POST /api/comment`, which writes the exact same `qa/comments.json` the
CLI writes, through a bridge that degrades honestly for older scaffolds with no comments library.

**The loop of record:** a human leaves a comment in the console → the agent observes it
(`review_comments {waitForComment:true}` (§5), same blocking pattern as `approval_status`'s
`waitForDecision`) → the agent updates the plan/spec/code the comment points at → the agent
resolves it with a note (`resolve_comment {id, note}` (§5) or the CLI's `--resolve`) → the console
shows `resolved` plus the note. The console never edits code — humans add/see, agents resolve,
mirroring the Approvals tab's read-only-for-humans design. See
[VERIFICATION-LAYER-DESIGN.md](./VERIFICATION-LAYER-DESIGN.md) §7.3 for the full contract.

## 8. Workflows — how it all fits together

### A. New app → green

`cmp-new` (or `create --verify`) → interview (incl. intent) → stamp (tabs wired, extra tabs get a
`PlaceholderScreen` stub) → **GREEN build verdict** → the genesis walk (§6): express-approve the
defaults, or shape design language/architecture/components and stamp the human's own first
feature as the exemplar. Output ships `.gitignore`, a CI `verify.yml`, the Maestro E2E harness,
the inspector, and the desktop dev-client. Next: `cmp-firebase-connect`, then run it.

### B. Connect your own backend

`cmp-firebase-connect` → Firebase CLI creates/reuses a project, registers the app, drops the **real**
`google-services.json` over the placeholder; a green `assembleDebug` proves it. (Auth sign-in
providers + the Storage bucket are console-only — the skill says so.)

### C. The dev-client loop (fast UI iteration, no emulator)

`./gradlew :composeApp:hotRunDesktop --auto` → the shared UI runs in a phone-sized JVM window;
editing Compose and saving hot-reloads it. Firebase never initializes on desktop (offline DI fakes).
The same JVM target hosts the inspector's headless tier-0 renders.

### D. The verified dev loop (THE core workflow) — *prompt → watch → prove*

For any UI change in a create-cmp app, a change **isn't done until the proof call says so**:

1. `preview {projectDir}` once per session (or `connect_live` for the on-device tier).
2. Make the edit.
3. `preview_status {waitForRender:true}` → which screens changed, or the compile error.
4. `preview_diff {screen}` → structural diff + drift + a11y regressions + verdict
   (`proven-clean` / `changed-with-regressions` / `no-change`).
5. `inspect_tree {format:"wireframe"}` → show the human the after-state wireframe.

The agent reports *"title bounds grew, `GapCard` unchanged, no drift, no a11y regressions:
**proven-clean**"* — it demonstrates the change from the rendered tree instead of claiming it.

### E. Live inspection + the human live view

`connect_live` → `remoteUrl` (offer to open it: the human watches the real device and clicks to
tap). Agent side: `inspect_tree` (subtree via `testTag`), `navigate_and_inspect {testTag}` to
drive + re-observe; token fidelity and touch targets are the lane's `tokenDrift` and `a11y`
steps; `inspect_tree {format:"wireframe"}` / `render_screen` to show.

### F. Tests that write themselves

`cmp-test` → observe the live tree (tags, clickables, reachable screens) → derive existence /
interaction / navigation / golden-tree assertions → write Maestro E2E flows in the shipped harness
style (id-selectors work out of the box — the template exposes testTags as resource-ids via the
`exposeTestTagsForAutomation()` shim) → run + heal.

### G. Maintenance (any KMP project, for the life of the repo)

`doctor` (diagnose/heal) · `upgrade --dry-run` then `upgrade --verify` (lockstep-safe migration) ·
`clean` (cache hygiene) · `verify` (standalone green gate). CI ships in every generated repo; a
nightly canary re-verifies the frozen set and probes the next upstream set (feeding `upgrade`'s
registry).

### H. Extend a generated app with Claude Code (no plugin needed)

The harness's real point: a generated project carries its own definition of done, so any Claude
Code session can extend it correctly — **the create-cmp plugin is not required.**

1. Open the scaffolded app in Claude Code — a plain session, no plugin installed, works.
2. Ask for a feature ("add a Favorites feature with a list screen"). Claude reads the generated
   `CLAUDE.md` contract and, because new behavior begins as a spec clause, proposes the clause
   first (human confirms) before generating anything. It then fires the in-project `add-feature`
   skill (`add-screen`/`add-repository` for narrower cuts — presentation-only or data-only) —
   which shells to `qa/scaffold-feature.mjs`, a deterministic stamper (whole-word rename map,
   anchor injection) that clones the `home` exemplar: Screen + ViewModel + UseCase + Repository +
   DI + navigation, with tests at every layer and a golden-tree baseline, spec-linked from birth.
3. Claude runs `node qa/verify.mjs` — the profile-tiered lane (§3: 16 steps at `local`, from
   `harnessIntegrity` first through build, the full JVM test tier, and the device steps when one
   is attached) — into one typed PASS/FAIL/SKIP verdict + a schema-validated evidence-pack JSON
   (`qa/evidence/latest.json`).
4. The PASS receipt gets committed. The generated `.claude/settings.json` **Stop hook**
   (`qa/receipt-check.mjs`) blocks "done" if the verified surface has changed since the last PASS
   receipt — validity is a content hash of that surface (`inputs.hash`; see
   [ADR-0005](./adr/0005-evidence-binding-by-inputs-hash.md)), so a later rebase/merge doesn't
   invalidate an honest receipt. CI re-checks the committed receipt still attests `HEAD` on every push.
5. **Refusal is named, not silent.** If Claude hardcodes a color, imports the data layer from UI,
   deletes or weakens a spec-linked test, or regresses a screen's structure, the matching gate
   fails and cites the clause: `ARCH-05` (hardcoded color), `ARCH-01` (illegal import),
   `HOME-01`/`specCoverage` (weakened test), `HOME-06` (structural regression) — rehearsed as a
   scripted 4/4 in `qa/refusal-demo.mjs`.

Rehearsed for real (C5): a plain session with no plugin installed ran `add-feature` end to end —
conforming slice, green tests at every layer, lane PASS.

---

## 9. Invariants (never violate these)

- **No pixels in model context.** `render_screen` and the screenshot route return **paths**, not
  bytes; `inspect_tree {format:"wireframe"}` returns SVG (text) — fine. The remote page is for the human.
- **Determinism.** Don't hand-generate what the engine stamps. To change the skeleton, change the
  template + version set, not one output.
- **Feature toggles are delete-before-rename.** Declare feature paths with the literal
  `com/example/app` roots; a disabled feature's files (and references) must be stripped so every
  toggle combination builds green (there are feature-strip tests enforcing this).
- **The inspector is debug-only** and must never be reachable in a release build (`doctor` checks).
- **Android-only Compose APIs stay out of `commonMain`** — e.g. `testTagsAsResourceId` lives behind
  an expect/actual shim; putting it in common code breaks desktop + iOS compilation.
- **Port 9500 is single-owner.** A stale debug app can squat it; if `/inspect/health` reports the
  wrong `appId`, force-stop the other app and relaunch.

---

## 10. Quick reference

```bash
# scaffold + prove green
npx create-cmp-cli@latest ./my-app --name MyApp --package com.my.app --no-ios --yes --verify
# maintain (any KMP project)
npx create-cmp-cli doctor --fix
npx create-cmp-cli upgrade --dry-run          # then --verify to apply+prove
# dev-client
(cd my-app && ./gradlew :composeApp:hotRunDesktop --auto)
# live inspection
(cd my-app && ./gradlew :composeApp:installDebug) ; adb forward tcp:9500 tcp:9500
#   then in Claude: connect_live → inspect_tree → navigate_and_inspect → preview_diff
```

**Deeper dives:** [`ARCHITECTURE.md`](./ARCHITECTURE.md) (engine) · [`ROADMAP.md`](./ROADMAP.md) ·
[`inspector/mcp/README.md`](../inspector/mcp/README.md) (per-tool detail). Historical build
designs for the inspector, live-view, and the founder test-drive checklist have moved to
[`docs/history/`](./history/) — this document (§5 above) is the current inspector/tool reference.
