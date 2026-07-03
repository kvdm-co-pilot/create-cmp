# cmp-inspector MCP server

Read a **running Compose Multiplatform UI as structured JSON** — hierarchy + geometry +
resolved design tokens — and query/assert on it. **Never screenshots.** This is the
Claude-side of Phase 0 of the create-cmp inspector (see [`../../docs/INSPECTOR-PLAN.md`](../../docs/INSPECTOR-PLAN.md)).

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

The **declared design-system catalog** (input to `diff_against_design_system`):

```json
{ "colors": { "Primary": "#0A2540", "Surface": "#FFFFFF" },
  "dimens": { "PaddingPage": "16dp", "RadiusCard": "16dp" } }
```

## Tools

| Tool | Input | Returns |
|---|---|---|
| `inspect_tree` | `{ treePath? }` | full tree + `{ nodeCount, taggedCount, tokenizedCount }` |
| `get_node` | `{ treePath?, testTag }` | the matching node (geometry + resolved tokens), or not-found |
| `assert_token` | `{ treePath?, testTag, key, expected }` | `{ pass, key, actual, expected }` |
| `layout_gaps` | `{ treePath?, testTagA, testTagB }` | `{ gapX, gapY, dxLeft, dyTop }` |
| `diff_against_design_system` | `{ treePath?, catalogPath }` | drift list `{ path, token, declared, resolved }` (empty = clean) |
| `find_drift` | `{ treePath? }` | un-tokenized-node list (visual footprint, no token) |

`treePath` is optional everywhere: if omitted it falls back to the **`CMP_INSPECTOR_TREE`**
environment variable, and errors clearly if neither is set (render a tree with the harness first).
Missing files / bad JSON return a clean `{ error }` payload, never a stack dump.

## Layout

```
inspector/mcp/
  bin/server.mjs         # thin stdio MCP wiring — all logic delegates to src/lib
  src/lib/tree.mjs       # loadTree, walk (stable dotted paths), findByTestTag
  src/lib/query.mjs      # getNode, assertToken, layoutGaps
  src/lib/drift.mjs      # findDrift, diffAgainstDesignSystem
  fixtures/tree.json     # example tree (one un-tokenized node + one drifting radius)
  fixtures/design-system.json
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
| **0 — Headless render** | `ImageComposeScene` / `runComposeUiTest` on the host JVM | tree + geometry + tokens, no emulator, milliseconds | **now** (Phase 0) |
| **1 — Live app** | debug-only Ktor endpoint in the app, reached via `adb forward`, walking `SemanticsOwner` | same tree **+ real data + nav state** | later |
| **2 — Zero-instrument** | `uiautomator` / Appium | geometry + text only, any app | fallback |

The tree-producing harness lives in [`../harness/`](../harness) (owned by a separate track). Point
these tools at the JSON it emits.
