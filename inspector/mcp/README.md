# cmp-inspector MCP server

Read a **running Compose Multiplatform UI as structured JSON** — hierarchy + geometry +
resolved design tokens — and query/assert on it. **Never screenshots.** This is the
Claude-side of the create-cmp inspector (see [`../../docs/INSPECTOR-PLAN.md`](../../docs/INSPECTOR-PLAN.md)):
Phase 0 (headless harness trees) + Phase 2 (LIVE on-device source over `adb forward`, plus the
uiautomator fallback).

AI coding agents are effectively blind to Compose UI: a screenshot burns tokens and can't read
theme tokens; the source can't see what actually *rendered*. This MCP consumes a fixed JSON tree
(produced by the inspector **harness**) and exposes tools to walk it, assert resolved tokens, compute
spacing, and catch **token drift** (raw values where a token belongs, or a resolved value that
contradicts the declared design system).

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

These power `audit_a11y` and let `snapshot_diff` catch interaction regressions. Old trees keep
working everywhere: tools skip nodes that lack the fields, and snapshot diffs treat an absent
field as its neutral value (`null` / `false`).

The **declared design-system catalog** (input to `diff_against_design_system`):

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
  forwarded — run **`connect_live`** first. `diff_against_design_system` with a live source and no
  `catalogPath` fetches the declared catalog from `/inspect/design-system` automatically.
- **`kind:"uiautomator"`** converts Appium `getPageSource` XML to the contract: bounds
  (root-relative), `resource-id` tail → `testTag`, text/content-desc, class tail → `role`,
  clickable/enabled — but **`designToken` is always `null`** (custom semantics keys do not cross
  the accessibility bridge). Token/drift tools (`assert_token`, `diff_against_design_system`,
  `find_drift`) reject uiautomator trees with a clear "requires an instrumented source" error.
  Use this tier for non-instrumented / third-party apps, or when tier 1 is unreachable.

## Tools

| Tool | Input | Returns |
|---|---|---|
| `inspect_tree` | `{ treePath? }` | full tree + `{ nodeCount, taggedCount, tokenizedCount }` |
| `get_node` | `{ treePath?, testTag }` | the matching node (geometry + resolved tokens), or not-found |
| `assert_token` | `{ treePath?, testTag, key, expected }` | `{ pass, key, actual, expected }` |
| `layout_gaps` | `{ treePath?, testTagA, testTagB }` | `{ gapX, gapY, dxLeft, dyTop }` |
| `diff_against_design_system` | `{ treePath?, catalogPath }` | drift list `{ path, token, declared, resolved }` (empty = clean) |
| `find_drift` | `{ treePath? }` | un-tokenized-node list (visual footprint, no token) |
| `snapshot_save` | `{ treePath?, snapshotPath }` | normalizes the tree (integer bounds, no `source`, sorted `resolved` keys) and writes the golden file |
| `snapshot_diff` | `{ treePath?, snapshotPath, tolerancePx? }` | structural diff vs the golden: `{ pass, diffCount, diffs:[{path, kind, before, after}] }` — kinds: `node-added/-removed`, `text-/testTag-/contentDescription-changed`, `designToken-changed`, `role-/clickable-/disabled-changed`, `bounds-moved` (beyond `tolerancePx`, default 1). Empty = pass — the CI regression primitive: JSON diffs, not pixels |
| `audit_a11y` | `{ treePath?, minTouchTargetPx? }` | `{ pass, violations:[{path,testTag,rule,detail,bounds}], warnings, warningCount, passCount }` — rules: `touch-target-too-small` (clickable below `minTouchTargetPx`, default 48), `missing-label` (clickable with no text/contentDescription/descendant text), warn `empty-content-description`. Harness output is density-1, so px == dp there; pass a scaled minimum for device-density trees |
| `connect_live` | `{ port?, serial? }` | Tier-1 handshake: runs ONE bounded `adb [-s serial] forward tcp:port tcp:port`, GETs `/inspect/health`, returns `{ status:"connected", health }` and sets the session default source to `{kind:"live", port}` so subsequent calls can omit `source`. Never launches apps or emulators |

Every tool above also accepts the **`source`** union (previous section); `treePath` remains the
tier-0 shorthand and falls back to **`CMP_INSPECTOR_TREE`**. Missing files / bad JSON / unreachable
live servers return a clean, actionable `{ error }` payload, never a stack dump.

## Layout

```
inspector/mcp/
  bin/server.mjs         # thin stdio MCP wiring — all logic delegates to src/lib
  src/lib/tree.mjs       # loadTree, walk (stable dotted paths), findByTestTag
  src/lib/query.mjs      # getNode, assertToken, layoutGaps
  src/lib/drift.mjs      # findDrift, diffAgainstDesignSystem
  src/lib/snapshot.mjs   # normalizeTree, diffTrees (golden-tree snapshots)
  src/lib/a11y.mjs       # auditA11y (touch targets, missing labels, empty descriptions)
  src/lib/source.mjs     # the source union: resolveTree/resolveCatalog/requireInstrumentedTree
  src/lib/live.mjs       # tier 1: fetchHealth/fetchLiveTree/fetchLiveCatalog (+ port/serial validation)
  src/lib/uiautomator.mjs# tier 2: Appium page-source XML → contract converter
  fixtures/tree.json     # example tree (one un-tokenized node + one drifting radius)
  fixtures/a11y-tree.json# planted a11y cases (tiny unlabeled icon, clean button, legacy node)
  fixtures/design-system.json
  fixtures/uiautomator-page.xml  # real-shaped uiautomator2 page source for converter tests
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
      "args": ["inspector/mcp/bin/server.mjs"]
    }
  }
}
```

To register it manually in another project, add the same block to that project's `.mcp.json`, or:

```bash
claude mcp add cmp-inspector -- node /absolute/path/to/inspector/mcp/bin/server.mjs
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
