# create-cmp — the complete usage guide

> **Read this first.** It is the single entry point to the whole product: setup, the engine CLI,
> the 9 skills, the `cmp-inspector` MCP (18 tools), and the workflows that tie them together. An
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

**Two front doors, one engine:** the `create-cmp` CLI (`npx`) and the Claude Code plugin (9 skills +
the MCP). Same deterministic Node engine behind both.

**The frozen version set** (moved as one unit by `upgrade`; never bump a piece in isolation):
Kotlin `2.2.20` · KSP `2.2.20-2.0.4` · Compose MP `1.10.3` · Room `2.8.4` · AGP `8.7.3` · Koin
`4.1.1` · Ktor `3.1.0` · Nav Compose `2.9.2` · GitLive Firebase `2.1.0`, with `ksp.useKSP2=true`
(the Room-on-iOS/native catch-22).

> **Scope now:** Android + host-JVM are the active targets. iOS template support is intact and
> compiles, but iOS CI is parked (manual dispatch). The inspector/live-view/dev-client features are
> Android + desktop.

---

## 2. Setup

**Requirements:** Node ≥ 18 to run the engine. JDK 17, Android SDK + an emulator/AVD, and (for the
inspector's live tier) `adb` for the app itself. macOS only for iOS output. Everything else — the
Android SDK, Appium + drivers (the legacy e2e path), CocoaPods/XcodeGen — the built-in **doctor**
detects and (with consent) installs. The E2E flows themselves run on Maestro, installed separately
with `curl -fsSL https://get.maestro.mobile.dev | bash`.

**Get the tool:**

```bash
# From the repo (current path — npm publish is pending):
node bin/create-cmp.mjs --help
npx github:kvdm-co-pilot/create-cmp --help        # zero-install
```

**Claude Code plugin** (adds the 9 skills + the `cmp-inspector` MCP):

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
| `create [dir]` | Stamp a new app from the frozen template; `--verify` proves a green build before returning. | `--name --package --bundle-id --region --theme-prefix` · `--ios/--no-ios` · `--firebase/--no-firebase --auth <email\|phone\|both\|none>` · `--room/--no-room` · `--e2e/--no-e2e` (the Maestro E2E harness; feature key renamed from `appium` in 0.3.0 — `--appium/--no-appium` still works as a deprecated alias) · `--inspector/--no-inspector` · `--dev-client/--no-dev-client` · `--tabs Home:home,Profile:person` · `--verify/--no-verify` · `--yes` · `--force` |
| `doctor` | Toolchain preflight **+** project diagnosis (kotlin↔ksp lockstep, drift vs the proven set, the KSP2/iOS catch-22, `sdk.dir`, `~/.konan` bloat, disk, and an inspector-stays-debug-only check). See also [docs/errors/](errors/README.md) — one page per build failure `doctor` diagnoses, with the exact error text and the manual fix. | `--fix` (safe heals) · `--yes --no-install --no-ios --target-dir <dir>` |
| `upgrade` | Migrate `gradle/libs.versions.toml` to the next **proven-green** version set: diff table → surgical in-place edits (comments/format preserved) with `.bak-upgrade` backups → optional verify. Lockstep guardrail refuses a broken kotlin↔ksp pairing. | `--target-dir <dir> --set <id> --dry-run --yes --verify` |
| `clean` | Cache & build-output hygiene: stale `~/.konan` toolchains + project `build/`/`.gradle/` (sizes shown, consent-gated); global Gradle caches are size-reported only. | `--target-dir <dir> --dry-run --yes` |
| `verify` | Run the green-build gate (Android; iOS on macOS when `iosApp/` exists) against an existing project. | `--target-dir <dir> --no-ios --dry-run` |

**Determinism rule for agents:** never hand-author Gradle files / the iOS shell / navigation / DI —
that's exactly what makes CMP flaky. Stamp with the engine, then author only per-app screens.

---

## 4. The 9 skills

Skills are the plugin's conversational front door; each shells the same engine or the MCP. Invoke by
intent — the descriptions carry rich triggers.

| Skill | Use it to… | Under the hood |
|---|---|---|
| **cmp-new** | Start a new mobile app (Android + iOS) by interview — fires on framework-undecided "create a mobile app" requests (honest CMP-vs-RN/Flutter fit check first) as well as explicit CMP/KMP asks and comparisons like "React Native vs KMP". | Interviews → `create --verify` → generates tab screens from the example feature. |
| **cmp-doctor** | Set up or fix the toolchain / diagnose any KMP build. | `doctor` (+ `--fix`). |
| **cmp-upgrade** | Bump Kotlin/CMP/KSP/Room/AGP safely. | `upgrade` (diff → apply → verify). |
| **cmp-firebase-connect** | Wire a fresh app to its **own** Firebase (the #1 post-scaffold manual step). | Firebase CLI: login → project create/reuse → app register → real `google-services.json` replaces the placeholder → green build proves it. Consent-gated per cloud write. |
| **cmp-dev-client** | Run the shared UI in a desktop window with Compose Hot Reload. | `:composeApp:hotRunDesktop --auto` / `:composeApp:run`. |
| **cmp-inspect** | See/drive a running Compose UI as JSON; check tokens, drift, a11y; the verified dev loop. | The `cmp-inspector` MCP (§5). |
| **cmp-preview** | Live previews of REAL screens, zero commands. | `preview {projectDir}` → live gallery URL; watches sources, re-renders on save; structural summaries for the agent. |
| **cmp-test** | Generate a regression suite by **observing** the app. | Reads the live tree via the MCP → derives a plan → writes Maestro E2E flows + golden-tree snapshots in the shipped harness style. |
| **cmp-qa-prep** | Bring up emulator + Maestro flow run + the bottom-nav smoke (legacy Appium bring-up path also supported). | Emulator + Maestro harness. |

---

## 5. The `cmp-inspector` MCP (18 tools)

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

### The 18 tools

**Read & assert:** `inspect_tree` (full tree + counts) · `get_node {testTag}` · `assert_token
{testTag,key,expected}` · `layout_gaps {testTagA,testTagB}` (computed spacing).

**Design-system:** `diff_against_design_system {catalogPath?}` (resolved vs declared token catalog;
live auto-fetches it) · `find_drift` (footprint nodes with no token — un-tokenized/raw values).

**Regression:** `snapshot_save {snapshotPath}` (normalized golden) · `snapshot_diff
{snapshotPath,tolerancePx?}` (structural diff; kinds: node-added/-removed, text/testTag/
contentDescription/designToken/role/clickable/disabled-changed, bounds-moved) · `audit_a11y
{minTouchTargetPx?}` (touch-target-too-small, missing-label, empty-content-description).

**Live (tier 1):** `connect_live {port?,serial?}` — runs ONE `adb forward`, GETs `/inspect/health`,
returns `remoteUrl` and sets the session default source · `navigate_and_inspect {testTag?|x,y,
settleMs?}` — resolves a tap from the live tree, taps via `POST /inspect/tap`, re-fetches, returns
`{before, after, changed}` (structural navigation, zero pixels).

**Render:** `render_tree {source?,a11y?}` — deterministic **SVG wireframe** (any source; tokenized
nodes highlighted with resolved-value chips, clickable outlines, optional a11y overlay); SVG is
text, so it's returned inline · `render_screen` — **pixel preview, path-only**: returns
`{path,width,height,sizeBytes,displayHint}` from the PNG header, never bytes. From
`projectDir` (+ `screen?` registry id — through the resident preview daemon when one is running
(`via:"daemon"`, ~1s warm) else the app's own `:composeApp:renderScreens`, also returns
`treePath`), live (`/inspect/screenshot`), a `pngPath`, or the demo harness.

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
attribution across renders) · `preview_diff {screen}` — prove_change between a screen's last two
renders with ZERO snapshot bookkeeping (the service retains the previous generation; drift checked
against the previews dir's design-system.json) · `preview_stop` —
shut the service down (the Gradle daemon stays warm).

**Verify:** `prove_change {before, after, catalogPath?}` — the verified-dev-loop keystone in one
call: diffs before/after, regression-checks the after tree (drift + a11y), returns
`{changes, regressions, verdict}` with verdict `proven-clean` | `changed-with-regressions` |
`no-change`.

### The in-app server (tier 1 plumbing)

A **debug-only** zero-dependency server the generated app runs on `127.0.0.1:9500`, **structurally
absent from release builds**. Routes: `GET /inspect/health` · `/inspect/tree` · `/inspect/design-
system` · `/inspect/screenshot` (PNG) · `POST /inspect/tap {x,y}` · `GET /inspect/remote` (the
human's live device view page — watch + click-to-tap the real app). Reach it with
`adb forward tcp:9500 tcp:9500` (or just call `connect_live`).

---

## 6. Workflows — how it all fits together

### A. New app → green

`cmp-new` (or `create --verify`) → interview/flags → stamp → **GREEN build verdict** → generate tab
screens. Output ships `.gitignore`, a CI `verify.yml`, the Maestro E2E harness, the inspector, and the
desktop dev-client. Next: `cmp-firebase-connect`, then run it.

### B. Connect your own backend

`cmp-firebase-connect` → Firebase CLI creates/reuses a project, registers the app, drops the **real**
`google-services.json` over the placeholder; a green `assembleDebug` proves it. (Auth sign-in
providers + the Storage bucket are console-only — the skill says so.)

### C. The dev-client loop (fast UI iteration, no emulator)

`./gradlew :composeApp:hotRunDesktop --auto` → the shared UI runs in a phone-sized JVM window;
editing Compose and saving hot-reloads it. Firebase never initializes on desktop (offline DI fakes).
The same JVM target hosts the inspector's headless tier-0 renders.

### D. The verified dev loop (THE core workflow) — *prompt → watch → prove*

For any UI change in a create-cmp app, a change **isn't done until `prove_change` says so**:

1. `snapshot_save {source:{kind:"live"}}` → `before.json` (before editing).
2. Make the code change (agent edits source).
3. Reload — hot reload (desktop) or reinstall (device).
4. `prove_change {before:"before.json", after:{kind:"live"}}` → structural diff + drift + a11y +
   **verdict**.
5. `render_tree {source:{kind:"live"}}` → show the human the after-state wireframe.

The agent reports *"title bounds grew, `GapCard` unchanged, no drift, no a11y regressions:
**proven-clean**"* — it demonstrates the change from the rendered tree instead of claiming it.

### E. Live inspection + the human live view

`connect_live` → `remoteUrl` (offer to open it: the human watches the real device and clicks to
tap). Agent side: `inspect_tree`, `get_node`, `navigate_and_inspect {testTag}` to drive + re-observe,
`diff_against_design_system` / `find_drift` for token fidelity, `audit_a11y` for touch targets,
`render_tree`/`render_screen` to show.

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
3. Claude runs `node qa/verify.mjs` — the lane: specCoverage → build → unitTests → conformance →
   goldenTrees → tokenDrift → a11y → (device present) e2eSmoke — into one typed PASS/FAIL/SKIP
   verdict + a schema-validated evidence-pack JSON (`qa/evidence/latest.json`).
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

## 7. Invariants (never violate these)

- **No pixels in model context.** `render_screen` and the screenshot route return **paths**, not
  bytes; `render_tree` returns SVG (text) — fine. The remote page is for the human.
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

## 8. Quick reference

```bash
# scaffold + prove green
node bin/create-cmp.mjs ./my-app --name MyApp --package com.my.app --no-ios --yes --verify
# maintain (any KMP project)
node bin/create-cmp.mjs doctor --fix
node bin/create-cmp.mjs upgrade --dry-run     # then --verify to apply+prove
# dev-client
(cd my-app && ./gradlew :composeApp:hotRunDesktop --auto)
# live inspection
(cd my-app && ./gradlew :composeApp:installDebug) ; adb forward tcp:9500 tcp:9500
#   then in Claude: connect_live → inspect_tree → navigate_and_inspect → prove_change
```

**Deeper dives:** [`ARCHITECTURE.md`](./ARCHITECTURE.md) (engine) · [`INSPECTOR-PLAN.md`](./INSPECTOR-PLAN.md)
+ [`INSPECTOR-PHASE2-DESIGN.md`](./INSPECTOR-PHASE2-DESIGN.md) (inspector) ·
[`LIVE-VIEW-PLAN.md`](./LIVE-VIEW-PLAN.md) (preview/live-view/dev-client) ·
[`ROADMAP.md`](./ROADMAP.md) · [`TEST-DRIVE.md`](./TEST-DRIVE.md) (hands-on) ·
[`inspector/mcp/README.md`](../inspector/mcp/README.md) (per-tool detail).
