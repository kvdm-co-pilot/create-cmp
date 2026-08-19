---
name: cmp-inspect
description: >-
  Inspect a running Kotlin/Compose Multiplatform UI as structured design data — hierarchy, geometry,
  and resolved design tokens delivered as JSON, never screenshots. Use this when the user wants to
  "inspect the Compose UI", "read the design tokens", asks "why is this padding wrong", "check for
  token drift", "is this screen matching the design system", "debug this Compose layout without
  screenshots", "what colour/radius/spacing did this actually render", "assert the resolved tokens",
  "did this UI change / regress", or "audit this screen for accessibility (touch targets, missing
  labels)", "inspect the RUNNING app", "what's on the screen right now", "check the real
  navigation state", "show me the screen / a preview / a wireframe of the UI", or "prove this UI
  change did what it should". Drives the create-cmp inspector: either render a screen headlessly
  with the harness (tier 0) or connect to the RUNNING debug app's live endpoint (tier 1:
  connect_live + source {kind:"live"} — real data, real nav state), then query with the
  cmp-inspector MCP tools (inspect_tree — whole tree, one testTag subtree, wireframe SVG, or
  layout-gap report; navigate_and_inspect; render_screen; db_query; runtime_crashes;
  runtime_logs). Also covers "drive the running app", "tap the app and check the screen",
  "let me watch/click the app from my browser" (connect_live's remoteUrl live device view).
  Asserts on the rendered STRUCTURE, not pixels — layout faults, UI regressions, and navigation
  state are read mechanically from the tree; token drift and a11y are gated by the verify lane.
---

# cmp-inspect — read a live Compose UI as structured design data

Your job: answer "what did this Compose screen actually render, and does it match the design system?"
by inspecting **structured JSON** — hierarchy + geometry + resolved design tokens — **never a
screenshot**. Screenshots burn tokens, degrade to pixel-guessing for colours/spacing, and can't read
theme tokens at all. This skill drives the `cmp-inspector` MCP over a fixed JSON tree contract.

## Before any inspector call: confirm the capability (fail loud)

The cmp-inspector MCP tools are a capability, not a given. Before your first call, confirm
they resolve (ToolSearch for "cmp-inspector"). If no tools match, **STOP — do not fall back
to screenshots, raw adb, or manual Gradle silently.** Diagnose in order and REPORT to the human:

1. **Plugin enabled?** Check `enabledPlugins` in `~/.claude/settings.json` (or the project's
   `.claude/settings.json`).
2. **Session older than the plugin's enablement?** MCP servers attach at session START — a
   session born without the plugin never gains its tools, and no amount of in-session
   retrying will surface them. The fix is restarting the session.
3. **Plugin copy stale or server broken?** Run cmp-doctor's inspector-MCP check group.

Only after reporting may the documented degraded path be used — and the report must name what
is lost: structured trees and change proofs replaced by pixels.

> **No-pixels rule.** Do not screenshot the app to reason about layout, colour, or spacing. Render
> the semantics tree and assert on it. The tree carries the *resolved* design token — strictly
> better than sampling an image, and 100% structured.

## Two loops — pick the right tier first

**Tier 0 (headless) — render → dump → inspect.** Fast (seconds, incl. compile), no device.
Use for previews and layout/token assertions on the app's real screens:

1. **Render** with the app's own generated harness — every create-cmp app scaffolded with the
   inspector feature ships `inspector/PreviewRegistry.kt` (the `@Preview` analog: shell, one
   entry per tab, detail) and a `:composeApp:renderScreens` Gradle task:

       ./gradlew :composeApp:renderScreens                 # all screens
       ./gradlew :composeApp:renderScreens -Pscreen=home   # one screen (registry id)

   Real DI, real theme, real data — each screen lands in `composeApp/build/previews/<id>/`
   as `tree.json` (inspector contract, density 1, px == dp) + `screen.png` (@2x pixel twin,
   same viewport), plus `design-system.json` and a `manifest.json`. Parameters are `-P`
   properties, NEVER `--args` (Gradle word-splits it into task names). Or in one MCP call:
   `render_screen { projectDir, screen? }` runs the task and returns the PNG metadata +
   `treePath`. (Prefer the **cmp-preview** loop when you're editing — its resident service
   renders on save and owns the change-proof verdict.)
2. **Show the human** — `node qa/preview-gallery.mjs` builds one self-contained
   `composeApp/build/previews/index.html`: pixels + wireframe + a11y per screen. Open it in a
   browser; regenerate after any edit. No device, no emulator, no app launch.
3. **Inspect** — call `inspect_tree` against a screen's tree, passing
   `treePath` (or `source:{kind:"file",path}`, or export `CMP_INSPECTOR_TREE` once and omit it).

**Tier 1 (LIVE) — build → connect → inspect the running app.** Use when the question involves
*real data, real navigation state, or "what is on screen right now"*:

1. **Build + install + launch the DEBUG app** on an emulator/device (`./gradlew
   :composeApp:installDebug`, then launch it). Every create-cmp app scaffolded with the default
   `--inspector` feature ships a debug-only loopback HTTP server on `127.0.0.1:9500`
   (androidDebug source set only — release builds contain no inspector code).
2. **`connect_live { port?: 9500, serial?, relaunch? }`** — the self-healing handshake: it
   ensures a device is attached, ensures the `adb forward`, polls `/inspect/health`, launches
   the app itself if health is dead, and resets a stale adb transport once before giving up.
   Pass `relaunch: true` to force a fresh app process (proven by `processStartedAtMs` moving
   forward). On success it sets the session default source, so every subsequent tool call can
   just omit `source`; its result's `healed` list says what it had to fix, and every failure
   names the stage that failed plus the one command to run next.
3. **Inspect** — call any tool with `source:{kind:"live"}` (or nothing, after connect_live). Each
   call re-fetches the tree, so it always reflects the CURRENT screen: navigate the app
   (`navigate_and_inspect`), call `inspect_tree` again, and assert the nav-state change
   structurally (e.g. `home_title` gone, detail content present). Trees carry
   `source:"live-android"`.

**Tier 2 (uiautomator fallback)** — when the app is NOT a create-cmp debug build (third-party,
release build) or tier 1 is unreachable: get Appium `getPageSource` XML and pass
`source:{kind:"uiautomator", xml}` (or `xmlPath`). You get geometry + text + clickability for any
app, but `designToken` is always null — token-aware consumers reject these trees by design.

## The tree contract you assert on

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

Every node has `bounds` (pixels, root-relative) and `children`. `testTag`, `text`,
`contentDescription`, and `designToken` are nullable. `designToken` is
`{ tokens: string[], resolved: { key: value } }` — the component *self-reporting* its resolved token,
which is only possible because create-cmp owns the theme and the component kit.

Nodes may also carry **optional interaction fields** (additive, still schemaVersion 1; absent on
old trees): `role` (`"Button"`, `"Checkbox"`, … or null), `clickable` (has an OnClick action),
`disabled` (Disabled semantics present). These feed the lane's a11y gate and interaction diffs.

## The MCP tools you'll use here

| Tool | Use it to… |
|---|---|
| `inspect_tree` | the one query verb. Whole tree + summary `{ nodeCount, taggedCount, tokenizedCount }`; `testTag` narrows to one subtree (geometry + resolved tokens of a single node and its children); `format: "wireframe"` returns the deterministic SVG wireframe instead of JSON (structure you AND the human can read — SVG is text, not pixels); `includeLayoutGaps: true` adds the computed spacing report between sibling footprints (`{ gapX, gapY, dxLeft, dyTop }`) — how you verify padding/margins |
| `connect_live` | tier-1 handshake, self-healing (forward, health, launch, transport reset; `relaunch: true` forces a fresh process); sets the session default source and returns the human's `remoteUrl` live view |
| `navigate_and_inspect` | tap the RUNNING app (coords resolved from the live tree by `testTag`, or explicit x/y) via POST /inspect/tap, wait, re-fetch → `{ tapped, before, after, changed }` |
| `render_screen` | pixel preview with a **path-only contract** — returns the PNG's path + metadata, never bytes; for the HUMAN. `{ source: {kind:"live"} }` captures the CURRENT device screen |
| `db_query` | read bounded rows from the running app's database — assert persisted state instead of shelling into sqlite or trusting the UI |
| `runtime_crashes` | persisted crashes with cause attribution — reach for it before hand-grepping logcat |
| `runtime_logs` | bounded structured logcat for the app's pid |

All take an optional `source` (`{kind:"file"|"live"|"uiautomator"}`) and the legacy `treePath`;
omit both after `connect_live` (or if `CMP_INSPECTOR_TREE`/`CMP_INSPECTOR_LIVE` is set). Errors
(missing file, bad JSON, node not found, live server unreachable) come back as a clean, actionable
`{ error }` — read it and fix the input.

**Jobs that moved to the lane and the preview loop** (don't look for interactive twins — they
were removed because the deterministic version won): token drift and design-system conformance →
the verify lane's `tokenDrift` step; a11y audit → the lane's `a11y` step (and per-screen
`a11yPass`/`a11yViolations` in `preview_status`); golden-tree snapshots and regression diffs →
the lane's `goldenTrees` step (`qa/golden/`, re-blessed with `UPDATE_GOLDEN=1`); change proof →
`preview_diff { screen }` (cmp-preview's verified edit loop) and, live, `navigate_and_inspect`'s
before/after delta.

## Typical workflows

**"Why is this padding wrong?"** — `inspect_tree { testTag: "<node>" }` for the node's resolved
tokens, then `inspect_tree { includeLayoutGaps: true }` and compare the computed `gapY`/`gapX`
between the two elements to the intended dp.

**"Check for token drift / does this match the design system?"** — that's the lane's job:
`node qa/verify.mjs` (`tokenDrift` step) flags raw values where a token belongs and resolved
values that contradict the declared catalog, deterministically. Use `inspect_tree` only to
examine a specific node the lane named.

**"Assert this screen renders correctly"** — `inspect_tree` for the shape, then targeted
`inspect_tree { testTag }` reads on the key nodes; a `includeLayoutGaps` pass for spacing claims.

**"Did this UI change / regress?"** — while editing, use cmp-preview's loop:
`preview_status { waitForRender: true }` → `preview_diff { screen }` for the
`proven-clean | changed-with-regressions | no-change` verdict. Durable cross-session baselines
are the lane's golden trees (`qa/golden/`), regenerated deliberately with `UPDATE_GOLDEN=1`.

**"What is the running app actually showing? / did navigation work?"** — the tier-1 loop:
`connect_live`, then `inspect_tree` (no `source` needed — session default). Drive the app with
`navigate_and_inspect` (one tool call taps AND re-inspects), then assert the structural change:
the old screen's testTag/text is gone, the new screen's content is present. Real navigation
state, observed live, zero screenshots.

**"Is the data actually saved?"** — `db_query`: bounded rows from the running app's own
database. A flow whose proof is "a row exists (or is gone) after the action" is asserted here,
not by squinting at the UI and not by `adb shell` sqlite gymnastics.

**"The app crashed / misbehaves on device"** — `runtime_crashes` first (persisted crashes with
cause attribution), then `runtime_logs` for the app-pid slice of logcat. Both are bounded and
structured; hand-grepping `adb logcat` is the fallback, not the default.

## Drive it — the live device view (human) + navigate_and_inspect (agent)

The human watches and drives the REAL app from a browser while you assert on the tree —
same app, two audiences, zero pixels in model context.

1. **`connect_live`** — its result includes `remoteUrl`
   (`http://127.0.0.1:9500/inspect/remote`). **Offer to open it for the human** (e.g. `open
   <remoteUrl>` on macOS): it is a self-contained live device view — the current screen re-fetched
   ~every 700ms, and clicking the image taps the real device (click coords are scaled to device px
   and POSTed to `/inspect/tap`). Do NOT fetch or read that page's screenshot yourself.
2. **You navigate structurally** with **`navigate_and_inspect { testTag?, x?, y?, settleMs? }`**:
   it resolves the tap point FROM THE LIVE TREE (center of `testTag`'s bounds — a not-found error
   lists the available tags; or pass explicit root-relative `x`/`y` read from any node's bounds),
   delivers the tap over HTTP (`POST /inspect/tap` — no adb shell needed), waits `settleMs`
   (default 1500), re-fetches the tree, and returns
   `{ tapped, before:{tags,textSample,nodeCount}, after:{…}, changed }`. Assert on it: `changed:
   true` plus the new screen's tags/text in `after` IS the navigation proof.
3. **Live pixels for the human**: `render_screen { source: {kind:"live"} }` captures the CURRENT
   device screen via `GET /inspect/screenshot` and writes it to a file (`out` optional), returning
   path-only metadata — never bytes.

The `/inspect/screenshot`, `/inspect/tap` and `/inspect/remote` routes carry the same guarantees
as the rest of the inspector server: **debug builds only** (androidDebug source set — structurally
absent from release), **loopback only**, reached through one bounded `adb forward`. And the
no-pixels rule holds: the screenshot route exists so pixels can flow to the HUMAN's browser/disk;
your reasoning stays on `inspect_tree` / `navigate_and_inspect`.

## See it — wireframes for anyone, pixels for the human

**The architecture rule, stated plainly: pixels flow to the HUMAN, structure flows to the AI.**
No tool ever returns image bytes/base64 into model context. When you (the agent) need to *see*
the screen, see it structurally; when the human needs to see it, hand them a file.

- **`inspect_tree { format: "wireframe" }`** — the structural wireframe. Works for **any** source,
  including `{kind:"live"}` while you develop: every footprint node drawn as a rect, tokenized
  nodes highlighted with a resolved-values chip (`radius 16 · pad 16`), clickable nodes with a
  distinct dashed outline, testTags as mono labels, text shown, legend + a footer
  (`<n> nodes · <source> · schemaVersion <v>`). The result includes the SVG **text** — SVG is
  structured text, not pixels, so you may read and reason over it, and the human can open the
  written `.svg` file too. Deterministic: the same tree always renders byte-identical SVG.
- **`render_screen { projectDir, screen? }`, `{ pngPath }` or `{ source: {kind:"live"} }`** —
  real pixels, **path-only contract**. Returns `{ path, width, height, sizeBytes, displayHint }`
  parsed from the PNG header — NEVER the image data. `projectDir` runs the app's own
  `:composeApp:renderScreens` task for one registry `screen` (default `shell`) and additionally
  returns `treePath` + `previewsDir`, so every preview has its structural twin from the same
  viewport. To show the human: prefer the gallery (`node qa/preview-gallery.mjs`), or follow the
  `displayHint` — write a tiny HTML wrapper embedding `<img src="file://…">` and open it (or
  attach the file in the host UI). Do **not** Read the PNG.

Pair them: `render_screen` for the human's eyes, `inspect_tree` (JSON or wireframe) for your
assertions — same screen, two audiences.

## Three tiers, one interface

The tools are identical regardless of where the tree comes from, so work done against the fast
headless loop transfers to the live app:

- **Tier 0 — headless render**: `ImageComposeScene` / `runDesktopComposeUiTest` on the host JVM
  via the generated `:composeApp:renderScreens` task + `inspector/PreviewRegistry.kt`. Fast, no
  device. Only renders `commonMain` composables whose deps resolve on the JVM; anything behind an
  Android `actual` (Firebase, platform APIs) needs a DI fake (the harness starts the app's real
  Koin modules; add desktop fakes for remote-backed repositories, as the dev-client does).
- **Tier 1 — live app**: the debug-only in-app HTTP server (zero-dep ServerSocket on
  `127.0.0.1:9500`, androidDebug source set only), reached via `adb forward`, walking the
  `SemanticsOwner` of the topmost Compose root — same tree, **plus real data and real nav state**.
  `connect_live` then `source:{kind:"live"}` (pull-on-demand: every call re-reads the screen).
- **Tier 2 — zero-instrument fallback**: `uiautomator` / Appium page-source via
  `source:{kind:"uiautomator"}` — geometry + text only, any app, no tokens ever. Use when you
  can't instrument.

## Registering the MCP

The `create-cmp` plugin ships this server; it's registered via the repo-root `.mcp.json`
(`cmp-inspector` → `node inspector/mcp/bin/server.mjs`), so it loads when the project/plugin is
active. To wire it into another project manually:

```bash
claude mcp add cmp-inspector -- node /absolute/path/to/inspector/mcp/bin/server.mjs
```

See `inspector/mcp/README.md` for the full tool reference and the tier roadmap.
