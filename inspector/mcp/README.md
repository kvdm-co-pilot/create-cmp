# cmp-inspector MCP server

Read a **running Compose Multiplatform UI as structured JSON** — hierarchy + geometry +
resolved design tokens — and query/assert on it. **Never screenshots.** This is the
Claude-side of the create-cmp inspector (see [`../../docs/INSPECTOR-PLAN.md`](../../docs/INSPECTOR-PLAN.md)):
Phase 0 (headless harness trees) + Phase 2 (LIVE on-device source over `adb forward`, plus the
uiautomator fallback).

AI coding agents are effectively blind to Compose UI: a screenshot burns tokens and can't read
theme tokens; the source can't see what actually *rendered*. This MCP consumes a fixed JSON tree
(produced by the inspector **harness**) and exposes a deliberately SMALL tool surface around it —
the preview loop, the live tier, and the console's approval/comment bridge. Assertion-style checks
(token drift, a11y, golden trees) are owned by the generated project's **verify lane**
(`qa/verify.mjs` steps `tokenDrift`/`a11y`/`goldenTrees`), not duplicated here as interactive
tools — two real production builds proved the lane wins that job every time
(`docs/proposals/agent-flow-retrospective.md` §5).

## The JSON tree contract (schemaVersion 1)

```json
{
  "schemaVersion": 1,
  "source": "headless-jvm",
  "root": {
    "testTag": "home_title",
    "text": "Home",
    "contentDescription": null,
    "bounds": { "x": 16, "y": 16, "width": 328, "height": 40 },
    "designToken": { "tokens": ["PaddingPage"], "resolved": { "padding": "16dp" } },
    "children": []
  }
}
```

Every node has `bounds` (numbers, pixels, root-relative) and `children`.
`testTag` / `text` / `contentDescription` / `designToken` are nullable.
`designToken` is `{ tokens: string[], resolved: { [k]: string } }` or `null`.

**Additive contract extension (still schemaVersion 1)** — OPTIONAL fields; absent on trees
produced before the extension, so every consumer treats them as optional:

| Field | Type | Meaning |
|---|---|---|
| `role` | `string\|null` | semantics `Role` (e.g. `"Button"`, `"Checkbox"`) |
| `clickable` | `boolean` | presence of the `OnClick` semantics action |
| `disabled` | `boolean` | presence of the `Disabled` semantics property |

These power the a11y overlay and let tree diffs (`preview_diff`, the lane's golden trees) catch
interaction regressions. Old trees keep working everywhere: tools skip nodes that lack the
fields, and tree diffs treat an absent field as its neutral value (`null` / `false`).

The **declared design-system catalog** (what resolved values are checked against):

```json
{ "colors": { "Primary": "#0A2540", "Surface": "#FFFFFF" },
  "dimens": { "PaddingPage": "16dp", "RadiusCard": "16dp" } }
```

## Choosing a source: the `source` union

Every tool accepts an optional **`source`** discriminated union (the legacy bare `treePath`
still works everywhere and equals `{kind:"file"}`):

```
source?: { kind:"file",        path: string }                      // tier 0 — harness JSON on disk
        | { kind:"live",       host?: string, port?: number }     // tier 1 — the RUNNING app (default 127.0.0.1:9500)
        | { kind:"uiautomator", xml?: string, xmlPath?: string }  // tier 2 — Appium page-source XML
```

Resolution order: explicit `source` → legacy `treePath` → the `connect_live` session default →
`$CMP_INSPECTOR_LIVE` (`host:port` or `port`) → `$CMP_INSPECTOR_TREE` (file) → a clear error.

- **`kind:"live"`** re-fetches `http://host:port/inspect/tree` on EVERY call — that is the
  pull-on-demand realtime model: each tool call sees the app's *current* screen (real data, real
  navigation state). Trees come back with `source:"live-android"`. Requires a create-cmp **debug**
  build running (the inspector server is structurally absent from release builds) and the port
  forwarded — run **`connect_live`** first (it heals both conditions itself).
- **`kind:"uiautomator"`** converts Appium `getPageSource` XML to the contract: bounds
  (root-relative), `resource-id` tail → `testTag`, text/content-desc, class tail → `role`,
  clickable/enabled — but **`designToken` is always `null`** (custom semantics keys do not cross
  the accessibility bridge). Use this tier for non-instrumented / third-party apps, or when
  tier 1 is unreachable.

## Tools

The consolidated public surface (15 tools). Every removed verb's job has a named owner — see
the ownership map below the table.

| Tool | Input | Returns |
|---|---|---|
| `inspect_tree` | `{ source?/treePath?, testTag?, format?, out?, a11yOverlay?, maxDepth?, scale?, includeLayoutGaps? }` | the enriched tree + `{ nodeCount, taggedCount, tokenizedCount }`. `testTag` returns only that node's subtree (the old `get_node`); `format:"wireframe"` returns the (sub)tree as a deterministic **SVG wireframe** instead of raw JSON — footprint nodes as rects, tokenized nodes highlighted + a resolved-values chip, clickable nodes outlined, testTags as mono labels; `a11yOverlay:true` marks audit violations, `out` also writes the file (the old `render_tree`); `includeLayoutGaps:true` adds `layoutGaps` — spacing between each pair of consecutive TAGGED siblings, tree-wide (the old two-tag `layout_gaps`, generalized) |
| `connect_live` | `{ port?, serial?, projectDir?, appId?, relaunch?, clearState? }` | **self-healing** tier-1 handshake: ensures a device is attached → ensures the `adb forward` (creates it) → polls `/inspect/health` → if dead, LAUNCHES the debug app (applicationId parsed from `composeApp/build.gradle.kts` / `create-cmp.json`, never hardcoded) and re-polls with bounded backoff → on a `device offline`-class adb error, resets the adb server (`kill-server`/`start-server`/`wait-for-device`) once and retries the whole sequence once. `relaunch:true` forces a VERIFIED restart (force-stop → optional `pm clear` → launch → `processStartedAtMs` proven to advance). Returns `{ status:"connected", healed:[…], health, remoteUrl }` and sets the session default source; every failure names the stage that failed and the one next command — never a bare timeout. `remoteUrl` (`/inspect/remote`) is the HUMAN's live device view — offer to open it in their browser; never fetch it into model context |
| `navigate_and_inspect` | `{ testTag?, x?, y?, port?, settleMs? }` | the agent-side **navigation primitive**: resolves the tap point from the LIVE tree (center of `testTag`'s bounds — a not-found error lists available tags — or explicit root-relative `x`/`y`), delivers it via `POST /inspect/tap` (HTTP, not adb), waits `settleMs` (default 1500), re-fetches the tree. Returns `{ tapped:{x,y,testTag?}, before:{tags,textSample,nodeCount}, after:{…}, changed, route? }` — assert navigation structurally, zero pixels. `route:{before,after}` appears only when the running app exposes `GET /inspect/nav`; omitted entirely for older apps, never reported as null |
| `runtime_crashes` | `{ since?, projectDir?, port? }` | persisted crashes from `GET /inspect/crashes` (current boot + previous — the on-device handler chains to whatever was installed before it, never swallows the crash), each with an `attribution` — stack frames intersected with recently-edited files (`git status`/`git diff` in `projectDir`, default cwd) → `{ verdict:"likely-caused-by-recent-edit"\|"no-recent-edit-implicated", evidence, changedFilesConsidered }`. Returns `{ crashes:[...], changedFilesConsidered }` |
| `runtime_logs` | `{ since?, level?, limit?, port?, serial? }` | structured, BOUNDED device logs: resolves the app's pid (`adb shell pidof <appId>`, appId from `/inspect/health`) then shells `adb logcat -v threadtime --pid=<pid> -d`. `level` keeps that severity and above; `since` (ISO) keeps entries at/after it; `limit` caps the newest-first tail (default 200, max 2000). No on-device log capture — adb-only, needs a device/emulator attached. Returns `{ pid, appId, count, truncated, entries:[{timestamp,pid,tid,level,tag,message}] }` |
| `db_query` | `{ table, limit?, port? }` | `GET /inspect/db?table=<name>&limit=<n>` — assert PERSISTED state in the live tier: read-only, bounded rows for one table. `table` must be a real table name (the app's Room schema JSONs and `@Entity` classes are in-repo); it is validated strictly against `sqlite_master` on-device (never raw SQL from the wire). Returns `{ table, columns, rows, rowCount }` |
| `render_screen` | `{ projectDir?, screen? }` OR `{ source:{kind:"live",port?}, out? }` OR `{ pngPath }` OR `{ harness:true, harnessDir? }` | **pixel preview with a path-only contract**: returns `{ path, width, height, sizeBytes, displayHint }` parsed from the PNG header — **never** bytes/base64 (pixels flow to the HUMAN, structure flows to the AI). `projectDir` renders a REAL screen headlessly (via the resident daemon when running, else `:composeApp:renderScreens`); `source:{kind:"live"}` captures the RUNNING app's current screen via `GET /inspect/screenshot`; pair with `inspect_tree {format:"wireframe"}` for the structural twin |

### Removed tools and where each job now lives

Consolidated 2026-08-19 (`docs/proposals/agent-flow-retrospective.md` §5 — 15+ of the 28 tools
had ZERO calls across two full production builds; the removals were approved as listed):

| Removed tool | The job's owner now |
|---|---|
| `get_node` | `inspect_tree { testTag }` |
| `render_tree` | `inspect_tree { format:"wireframe" }` |
| `layout_gaps` | `inspect_tree { includeLayoutGaps:true }` |
| `assert_token`, `find_drift`, `diff_against_design_system` | the verify lane's `tokenDrift` step (`qa/verify.mjs`) |
| `audit_a11y` | the verify lane's `a11y` step; interactively, the per-screen a11y panel in the preview gallery + `inspect_tree { a11yOverlay:true }` |
| `snapshot_save`, `snapshot_diff` | `preview_diff` (session-scoped, zero bookkeeping) + the lane's `goldenTrees` step (durable baselines in `qa/golden/`) |
| `prove_change` | `preview_diff` (structure) + `navigate_and_inspect` (live) |
| `capture_screen` | `render_screen {source:{kind:"live"}}` for pixels; the `/inspect/remote` live view for humans |
| `relaunch_app` | `connect_live { relaunch:true }` (an internal move of the self-healing handshake) |
| `db_schema` | the app's Room schema JSONs + `@Entity` classes, already in-repo |

Every tool above also accepts the **`source`** union (previous section); `treePath` remains the
tier-0 shorthand and falls back to **`CMP_INSPECTOR_TREE`**. Missing files / bad JSON / unreachable
live servers return a clean, actionable `{ error }` payload, never a stack dump.

## The preview loop + console (`preview`, `preview_status`, `preview_diff`, `preview_stop`, `approval_status`)

`preview { projectDir, port?, hot? }` starts (or reuses) a resident service that renders every
screen in `inspector/PreviewRegistry.kt` headlessly and serves a **live, self-updating gallery**
at a local URL (default `http://127.0.0.1:9600/`, SSE reload on every re-render). The gallery has
four tabs, built server-side in `src/lib/preview-service.mjs`'s `galleryHtml` + `src/lib/console-tabs.mjs`:

| Tab | Shows | Source |
|---|---|---|
| **Screens** | pixels + structure wireframe + a11y per screen (the original gallery, unchanged) | the resident render loop |
| **Design System** | color swatches + a dimens table | `composeApp/build/previews/design-system.json` if present, else a best-effort live `GET /inspect/design-system`, else an honest empty-state — never fabricated |
| **Approvals** | every governed artifact (VERIFICATION-LAYER-DESIGN.md §1/§2): §1 order number, status, file count, hash/approvedAt, and an **Approve** button (disabled + marked "unresolvable" when the artifact can't be fully resolved) | the project's own `qa/lib/approvals.mjs`, called at runtime via `src/lib/approvals-bridge.mjs` — never forked here. `POST /api/approve { artifact }` records the decision (same file `node qa/approve.mjs` writes) and broadcasts an `"approval"` SSE event that reloads the page |
| **Specs** | per `specs/*.spec.md` file, its clause list (id + prose, struck-through when withdrawn) plus a lightweight "cited by a durable test?" badge | `src/lib/specs.mjs`, mirroring `qa/verify.mjs`'s `stepSpecCoverage` clause/tag grammar (not its full orphan-report logic) |

A project with no `qa/lib/approvals.mjs` (an older, pre-approvals-wave scaffold) gets an honest
"not available in this project" Approvals tab instead of an error — the gallery still works.

The agent-side calls (`preview_status`, `preview_diff`, `approval_status`) never return HTML —
structure flows to the AI, pixels flow to the human:

| Tool | Input | Returns |
|---|---|---|
| `preview` | `{ projectDir, port?, hot? }` | `{ url, screens:[...], version, changedLastRender }` — give the human the `url` |
| `preview_status` | `{ waitForRender?, timeoutMs? }` | current status, or (with `waitForRender:true`) **blocks** until the next render/compile outcome |
| `preview_diff` | `{ screen, tolerancePx?, minTouchTargetPx? }` | one-call verified edit: `{ changes, regressions, verdict }` — no snapshot bookkeeping |
| `preview_stop` | `{}` | stops the resident service |
| `approval_status` | `{ waitForDecision?, timeoutMs? }` | `{ available, statuses }` snapshot, or (with `waitForDecision:true`) **blocks** — same shape as `preview_status`'s `waitForRender` — until any governed artifact's status changes, returning `{ timedOut, available, changed:[artifactIds], statuses }`. `{available:false}` (resolves immediately) when the project has no approvals library |

`preview_status`/`preview_diff`/`approval_status` all require a running preview service
(`preview` first) — that's where the project root comes from.

## Gradle coexistence: preview renders vs. tests on the same project

The preview service, its resident hot-reload daemon, and the project's own `qa/verify.mjs`
all invoke Gradle against the SAME build directories (`composeApp/build/classes`,
`kspCaches`) — Gradle offers no CLI-level way to give one invoker a separate output dir
without build-script support, so isolation cannot be done from this side alone. What ships
instead is a two-way coordination protocol plus reactive self-healing
(`src/lib/preview-service.mjs`, honored by the template's `qa/verify.mjs`):

- the verify lane stamps `composeApp/build/.cmp-lane-in-progress` for its duration;
  renders **defer** (re-scheduling, not failing) while it exists (mtime-bounded, so a
  crashed lane never wedges the eyes);
- the preview side stamps `composeApp/build/.cmp-render-in-progress` around every Gradle
  invocation — and for the resident daemon's whole lifetime — so the lane's `shGradle`
  defers around an active render the same way;
- a KSP `Storage … already registered` collision clears `kspCaches` and retries once;
- a `NoClassDefFoundError` / `Could not find or load main class` render failure is treated
  as the transient classpath RACE it is (someone else's build rewriting `build/classes`
  mid-render): the render defers and retries quietly (~48s), then keeps trying on a slow
  cadence while stating its staleness — never reported as a real failure first.

**The remaining constraint:** an AD-HOC `./gradlew desktopTest` (or any hand-typed Gradle
build) stamps no marker and honors none, so it can still collide with a concurrently
running preview daemon — the observed symptom is a cascade of bogus
`NoClassDefFoundError` TEST failures while the preview self-heals. If a test run fails
that way with a console/preview daemon up, stop the daemon (`preview_stop`, or
`node inspector/mcp/bin/console.mjs <projectDir> --stop`) or run the tests through the
lane (`node qa/verify.mjs`), which coordinates via the markers. Making hand-typed Gradle
invocations coordinate too would need template-side build logic (an init script honoring
the markers) — tracked as template work, deliberately not bolted on here.

## Layout

```
inspector/mcp/
  bin/server.mjs         # thin stdio MCP wiring — all logic delegates to src/lib
  src/lib/tree.mjs       # loadTree, walk (stable dotted paths), findByTestTag
  src/lib/query.mjs      # getNode, layoutGaps, siblingLayoutGaps
  src/lib/drift.mjs      # diffAgainstDesignSystem
  src/lib/snapshot.mjs   # normalizeTree, diffTrees (golden-tree snapshots)
  src/lib/a11y.mjs       # auditA11y (touch targets, missing labels, low contrast, empty descriptions)
  src/lib/contrast.mjs   # parseColor/relativeLuminance/contrastRatio — WCAG contrast math
  src/lib/source.mjs     # the source union: resolveSourceDescriptor/resolveTree
  src/lib/live.mjs       # tier 1: fetchHealth/fetchLiveTree/fetchLiveCatalog/fetchLiveNav/
                          # fetchLiveCrashes/fetchLiveDbQuery (+ port/serial validation)
  src/lib/navigate.mjs   # navigateAndInspect (the tap-and-reinspect primitive) + route before/after
  src/lib/connect.mjs    # connectLive — the self-healing tier-1 handshake — + relaunchApp (verified restart)
  src/lib/attribution.mjs# attributeCrash — crash stack frames × recently-changed files
  src/lib/logcat.mjs     # parseLogcat — adb logcat -v threadtime → structured, filterable entries
  src/lib/uiautomator.mjs# tier 2: Appium page-source XML → contract converter
  src/lib/render.mjs     # renderTreeSvg — deterministic SVG wireframe (any source)
  src/lib/png.mjs        # parsePngHeader/readPngMeta — PNG metadata, never pixels
  src/lib/prove.mjs      # proveChange — tree diff + drift + a11y in one verdict (powers preview_diff)
  src/lib/preview-service.mjs   # the resident preview loop + gallery HTTP server (4 tabs)
  src/lib/console-tabs.mjs      # pure (data) -> html for the Design System/Approvals/Specs tabs
  src/lib/approvals-bridge.mjs  # dynamic runtime bridge to a project's OWN qa/lib/approvals.mjs
  src/lib/specs.mjs             # Specs tab data: clause parsing + a lightweight coverage badge
  fixtures/tree.json     # example tree (one un-tokenized node + one drifting radius)
  fixtures/a11y-tree.json# planted a11y cases (tiny unlabeled icon, clean button, legacy node)
  fixtures/design-system.json
  fixtures/uiautomator-page.xml  # real-shaped uiautomator2 page source for converter tests
  fixtures/tiny-2x2.png  # minimal valid PNG for the header-parse tests
  test/*.test.mjs        # node --test coverage of every lib function
```

## Run & test

```bash
cd inspector/mcp
npm install
node --test          # unit tests (all green)
node bin/server.mjs  # start the stdio MCP server
```

## Registering the server with Claude Code

This repo registers the server via a root **`.mcp.json`** so it loads whenever the project (or the
`create-cmp` plugin) is active:

```json
{
  "mcpServers": {
    "cmp-inspector": {
      "command": "node",
      "args": ["inspector/mcp/dist/server.mjs"]
    }
  }
}
```

To register it manually in another project, add the same block to that project's `.mcp.json`, or:

```bash
claude mcp add cmp-inspector -- node /absolute/path/to/inspector/mcp/dist/server.mjs
```

Optionally export a default tree so tools can be called without `treePath`:

```bash
export CMP_INSPECTOR_TREE=/absolute/path/to/tree.json
```

## Where this fits — one contract, three source tiers

The MCP is source-agnostic. It always consumes the same JSON tree; only who *produces* it changes:

| Tier | Source | Yields | Status |
|---|---|---|---|
| **0 — Headless render** | `ImageComposeScene` / `runComposeUiTest` on the host JVM | tree + geometry + tokens, no emulator, milliseconds | **live** (Phase 0) |
| **1 — Live app** | debug-only in-app HTTP server (`127.0.0.1:9500`, ServerSocket, zero deps), reached via `adb forward`, walking `SemanticsOwner` from the `ViewRootForTest` root registry | same tree **+ real data + nav state**, `source:"live-android"` | **live** (Phase 2 — `connect_live` + `source:{kind:"live"}`) |
| **2 — Zero-instrument** | `uiautomator` / Appium page-source XML via `{kind:"uiautomator"}` | geometry + text only, any app, `designToken:null` | **live** (fallback) |

The tier-0 tree-producing harness lives in [`../harness/`](../harness). The tier-1 server is
stamped into every generated app's `composeApp/src/androidDebug/kotlin/<pkg>/inspector/` (feature
`--inspector`, on by default; the androidRelease twin is a no-op, so release builds contain no
inspector code structurally).
