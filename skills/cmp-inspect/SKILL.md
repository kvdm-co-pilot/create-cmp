---
name: cmp-inspect
description: >-
  Inspect a running Kotlin/Compose Multiplatform UI as structured design data — hierarchy, geometry,
  and resolved design tokens delivered as JSON, never screenshots. Use this when the user wants to
  "inspect the Compose UI", "read the design tokens", asks "why is this padding wrong", "check for
  token drift", "is this screen matching the design system", "debug this Compose layout without
  screenshots", "what colour/radius/spacing did this actually render", "assert the resolved tokens",
  "diff this screen against the design system", "snapshot this screen as a regression golden",
  "did this UI change / regress", or "audit this screen for accessibility (touch targets, missing
  labels)", "inspect the RUNNING app", "what's on the screen right now", "check the real
  navigation state", "show me the screen / a preview / a wireframe of the UI", or "prove this UI
  change did what it should". Drives the create-cmp inspector: either render a screen headlessly
  with the harness (tier 0) or connect to the RUNNING debug app's live endpoint (tier 1:
  connect_live + source {kind:"live"} — real data, real nav state), then query with the
  cmp-inspector MCP tools (get_node, assert_token, layout_gaps, diff_against_design_system,
  find_drift, snapshot_save, snapshot_diff, audit_a11y, render_tree, render_screen, prove_change,
  navigate_and_inspect). Also covers "drive the running app", "tap the app and check the screen",
  "let me watch/click the app from my browser" (connect_live's remoteUrl live device view).
  Asserts on the rendered STRUCTURE, not pixels — catches token drift (raw values where a token
  belongs), layout faults, UI regressions, and a11y faults mechanically — and proves every UI
  change with prove_change (the verified dev loop).
---

# cmp-inspect — read a live Compose UI as structured design data

Your job: answer "what did this Compose screen actually render, and does it match the design system?"
by inspecting **structured JSON** — hierarchy + geometry + resolved design tokens — **never a
screenshot**. Screenshots burn tokens, degrade to pixel-guessing for colours/spacing, and can't read
theme tokens at all. This skill drives the `cmp-inspector` MCP over a fixed JSON tree contract.

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
   `treePath`. (The create-cmp checkout also has a standalone demo harness in
   `inspector/harness/` rendering a bundled SampleScreen — for real apps use the project task.)
2. **Show the human** — `node qa/preview-gallery.mjs` builds one self-contained
   `composeApp/build/previews/index.html`: pixels + wireframe + a11y per screen. Open it in a
   browser; regenerate after any edit. No device, no emulator, no app launch.
3. **Inspect** — call the `cmp-inspector` MCP tools against a screen's tree, passing
   `treePath` (or `source:{kind:"file",path}`, or export `CMP_INSPECTOR_TREE` once and omit it).

**Tier 1 (LIVE) — build → connect → inspect the running app.** Use when the question involves
*real data, real navigation state, or "what is on screen right now"*:

1. **Build + install + launch the DEBUG app** on an emulator/device (`./gradlew
   :composeApp:installDebug`, then launch it). Every create-cmp app scaffolded with the default
   `--inspector` feature ships a debug-only loopback HTTP server on `127.0.0.1:9500`
   (androidDebug source set only — release builds contain no inspector code).
2. **`connect_live { port?: 9500, serial? }`** — runs one bounded `adb forward tcp:9500 tcp:9500`
   and health-checks `/inspect/health`. On success it sets the session default source, so every
   subsequent tool call can just omit `source`.
3. **Inspect** — call any tool with `source:{kind:"live"}` (or nothing, after connect_live). Each
   call re-fetches the tree, so it always reflects the CURRENT screen: navigate the app (Appium
   MCP / adb), call `inspect_tree` again, and assert the nav-state change structurally (e.g.
   `home_title` gone, detail content present). Trees carry `source:"live-android"`.
   `diff_against_design_system` needs no `catalogPath` live — the declared catalog is fetched
   from `/inspect/design-system`.

   Cold start: if you get "compose root not ready / not reachable", the app is still launching —
   retry after a second or two. If `connect_live` fails, check `adb devices` and that the app is a
   DEBUG build of a create-cmp app (the server is structurally absent from release).

**Tier 2 (uiautomator fallback)** — when the app is NOT a create-cmp debug build (third-party,
release build) or tier 1 is unreachable: get Appium `getPageSource` XML and pass
`source:{kind:"uiautomator", xml}` (or `xmlPath`). You get geometry + text + clickability for any
app, but `designToken` is always null — token/drift tools reject these trees by design.

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
`disabled` (Disabled semantics present). These feed the a11y audit and interaction-regression diffs.

## The MCP tools

| Tool | Use it to… |
|---|---|
| `inspect_tree` | pull the whole tree + a summary `{ nodeCount, taggedCount, tokenizedCount }` |
| `get_node` | fetch one node by `testTag` — its geometry + resolved tokens |
| `assert_token` | assert a node's resolved value for a key (`padding`, `radius`, `color`, `fontSize`) equals what you expect |
| `layout_gaps` | compute real spacing between two nodes: `{ gapX, gapY, dxLeft, dyTop }` — this is how you verify padding/margins |
| `diff_against_design_system` | flag every node whose resolved value contradicts the declared catalog |
| `find_drift` | sweep for nodes that render but carry **no** token (raw value / un-tokenized) |
| `snapshot_save` | write the normalized tree as a **golden-tree snapshot** (commit it — it's the regression fixture) |
| `snapshot_diff` | structurally diff the current tree vs a golden: `{path, kind, before, after}` entries; empty = pass |
| `audit_a11y` | audit touch targets (< 48px clickables), missing labels on clickables, empty contentDescription |
| `connect_live` | tier-1 handshake: one bounded `adb forward` + `/inspect/health`; sets the session default source and returns the human's `remoteUrl` live view |
| `navigate_and_inspect` | tap the RUNNING app (coords resolved from the live tree by `testTag`, or explicit x/y) via POST /inspect/tap, wait, re-fetch → `{ tapped, before, after, changed }` |
| `render_tree` | draw the tree as a deterministic **SVG wireframe** (any source, incl. live) — structure you AND the human can see |
| `render_screen` | pixel preview with a **path-only contract** — returns the PNG's path + metadata, never bytes; for the HUMAN |
| `prove_change` | the verified dev loop: diff a BEFORE tree vs an AFTER tree + regression-check drift/a11y → one verdict |

All take an optional `source` (`{kind:"file"|"live"|"uiautomator"}`) and the legacy `treePath`;
omit both after `connect_live` (or if `CMP_INSPECTOR_TREE`/`CMP_INSPECTOR_LIVE` is set). Errors
(missing file, bad JSON, node not found, live server unreachable) come back as a clean, actionable
`{ error }` — read it and fix the input.

## Typical workflows

**"Why is this padding wrong?"** — `get_node` both elements, then `layout_gaps` between them; compare
the computed `gapY`/`gapX` to the intended dp. Or `assert_token(testTag, "padding", "16dp")` directly
if the node self-reports padding.

**"Check for token drift / does this match the design system?"** — run `find_drift` first (catches
raw values with no token), then `diff_against_design_system` with the declared catalog
(`{ colors, dimens }`) to catch resolved values that contradict the declared token. A drift entry is
`{ path, token, declared, resolved }`. Both empty = clean. This is the mechanical UI-fidelity gate:
raw hex where `Surface` belongs, or a `24dp` radius where `RadiusCard` is `16dp`, is caught for free.

**"Assert this screen renders correctly"** — `inspect_tree` for the shape, then a handful of
`assert_token` / `layout_gaps` assertions on the key nodes.

**"Snapshot this screen / did it regress?"** — the golden-tree loop, the CI regression primitive:

1. Render the screen with the harness → `snapshot_save { treePath, snapshotPath }`. Commit the
   golden (it's normalized: integer bounds, no `source`, sorted resolved keys — stable and reviewable).
2. After any change: re-render → `snapshot_diff { treePath, snapshotPath }`. Empty `diffs` = pass.
   A non-empty diff is a compact list of `{path, kind, before, after}` — node added/removed, text/
   testTag/designToken changed, `clickable-changed` (a button silently losing its handler!),
   `bounds-moved` beyond `tolerancePx` (default 1px, so sub-pixel jitter never flakes).
3. Intentional change? Re-run `snapshot_save` to re-bless the golden. The review diff of the golden
   file itself is human-readable JSON, unlike a pixel snapshot.

**"What is the running app actually showing? / did navigation work?"** — the tier-1 loop:
`connect_live`, then `inspect_tree` (no `source` needed — session default). Drive the app with
`navigate_and_inspect` (below — one tool call taps AND re-inspects), or Appium MCP / `adb shell
input tap` when you need gestures beyond a tap, then assert the structural change: the old
screen's testTag/text is gone, the new screen's content is present. Real navigation state,
observed live, zero screenshots.

## Drive it — the live device view (human) + navigate_and_inspect (agent)

Track B of Live View: the human watches and drives the REAL app from a browser while you assert
on the tree — same app, two audiences, zero pixels in model context.

1. **`connect_live`** — its result now includes `remoteUrl`
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
3. **Prove edits as usual** — `snapshot_save` → edit → reload → `prove_change` — while the human
   literally watches the change land in the remote view.
4. **Live pixels for the human**: `render_screen { source: {kind:"live"} }` captures the CURRENT
   device screen via `GET /inspect/screenshot` and writes it to a file (`out` optional), returning
   the same path-only metadata as ever — never bytes.

The `/inspect/screenshot`, `/inspect/tap` and `/inspect/remote` routes carry the same guarantees
as the rest of the inspector server: **debug builds only** (androidDebug source set — structurally
absent from release), **loopback only**, reached through one bounded `adb forward`. And the
no-pixels rule holds: the screenshot route exists so pixels can flow to the HUMAN's browser/disk;
your reasoning stays on `inspect_tree` / `render_tree` / `navigate_and_inspect`.

**"Audit accessibility"** — `audit_a11y { treePath }`. Violations: `touch-target-too-small`
(clickable under `minTouchTargetPx`, default 48 — harness dumps are density-1 so px == dp there;
scale it for device-density trees) and `missing-label` (clickable with no text, no
contentDescription, no descendant text — invisible to screen readers). Warning:
`empty-content-description`. Old trees without the `clickable`/`role` fields are skipped, not
crashed on. Fix violations in the kit (e.g. `defaultMinSize(48.dp)` on tap targets), re-render,
re-audit until `pass: true`.

## See it — wireframes for anyone, pixels for the human

**The architecture rule, stated plainly: pixels flow to the HUMAN, structure flows to the AI.**
No tool ever returns image bytes/base64 into model context. When you (the agent) need to *see*
the screen, see it structurally; when the human needs to see it, hand them a file.

- **`render_tree { source?, out?, a11y? }`** — the structural wireframe. Works for **any** source,
  including `{kind:"live"}` while you develop: every footprint node drawn as a rect, tokenized
  nodes highlighted with a resolved-values chip (`radius 16 · pad 16`), clickable nodes with a
  distinct dashed outline, testTags as mono labels, text shown, legend + a footer
  (`<n> nodes · <source> · schemaVersion <v>`). Pass `a11y:true` to overlay audit violations in a
  danger style. The result includes the SVG **text** — SVG is structured text, not pixels, so you
  may read and reason over it, and the human can open the written `.svg` file too. Deterministic:
  the same tree always renders byte-identical SVG (diffable, cacheable).
- **`render_screen { projectDir, screen? }`, `{ pngPath }` or `{ harness: true }`** — real pixels,
  **path-only contract** (tier 0). Returns `{ path, width, height, sizeBytes, displayHint }` parsed
  from the PNG header — NEVER the image data. `projectDir` runs the app's own
  `:composeApp:renderScreens` task for one registry `screen` (default `shell`) and additionally
  returns `treePath` + `previewsDir`, so every preview has its structural twin from the same
  viewport; `harness:true` runs the checkout's demo harness (bundled SampleScreen only). To show
  the human: prefer the gallery (`node qa/preview-gallery.mjs`), or follow the `displayHint` —
  write a tiny HTML wrapper embedding `<img src="file://…">` and open it (or attach the file in
  the host UI). Do **not** Read the PNG.

Pair them: `render_screen` for the human's eyes, `render_tree` + the query tools for your
assertions — same screen, two audiences.

## The verified dev loop — how UI changes get proven (the core workflow)

For **any** UI change in a create-cmp app, "it compiles and looks right" is not done — **a change
without a `prove_change` verdict is not done.** The loop:

1. **Before editing:** `snapshot_save { source: {kind:"live"}, snapshotPath }` (or a tier-0 harness
   tree) — capture the pre-change state as the BEFORE golden.
2. **Make the code change.**
3. **Reload:** dev-client hot reload on desktop, or rebuild/reinstall on the device, until the app
   shows the new state.
4. **`prove_change { before: <snapshotPath>, after: {kind:"live"} }`** — ONE call that structurally
   diffs before→after AND regression-checks the AFTER tree (design-system drift with the live
   catalog auto-fetched, plus the a11y audit). Read the verdict:
   - `proven-clean` — the change landed and nothing regressed. Done.
   - `no-change` — the edit didn't reach the screen (wrong screen? stale build? not reloaded?).
   - `changed-with-regressions` — the change landed but introduced drift and/or a11y faults: fix,
     reload, re-prove.
5. **Present the proof:** the `changes` list is the evidence of what the edit did (human-readable
   `{path, kind, before, after}` entries); pair it with `render_tree` of the after-state so the
   human sees the result structurally (and `render_screen` when they want real pixels).

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
