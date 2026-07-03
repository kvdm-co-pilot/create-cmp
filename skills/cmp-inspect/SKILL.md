---
name: cmp-inspect
description: >-
  Inspect a running Kotlin/Compose Multiplatform UI as structured design data — hierarchy, geometry,
  and resolved design tokens delivered as JSON, never screenshots. Use this when the user wants to
  "inspect the Compose UI", "read the design tokens", asks "why is this padding wrong", "check for
  token drift", "is this screen matching the design system", "debug this Compose layout without
  screenshots", "what colour/radius/spacing did this actually render", "assert the resolved tokens",
  or "diff this screen against the design system". Drives the create-cmp inspector: render a screen
  with the harness to produce a JSON tree, then query it with the cmp-inspector MCP tools
  (get_node, assert_token, layout_gaps, diff_against_design_system, find_drift). Asserts on the
  rendered STRUCTURE, not pixels — catches token drift (raw values where a token belongs) and layout
  faults mechanically.
---

# cmp-inspect — read a live Compose UI as structured design data

Your job: answer "what did this Compose screen actually render, and does it match the design system?"
by inspecting **structured JSON** — hierarchy + geometry + resolved design tokens — **never a
screenshot**. Screenshots burn tokens, degrade to pixel-guessing for colours/spacing, and can't read
theme tokens at all. This skill drives the `cmp-inspector` MCP over a fixed JSON tree contract.

> **No-pixels rule.** Do not screenshot the app to reason about layout, colour, or spacing. Render
> the semantics tree and assert on it. The tree carries the *resolved* design token — strictly
> better than sampling an image, and 100% structured.

## The loop: render → dump → inspect

1. **Render** the screen with the inspector **harness** (in `inspector/harness/`, owned by the
   harness track). It composes a `commonMain` screen on the host JVM (headless — no emulator, no
   device) and writes the semantics tree to a JSON file. This is Tier 0; it runs in milliseconds.
2. **Dump** — the harness output is a JSON file matching the tree contract (below). Note its path.
3. **Inspect** — call the `cmp-inspector` MCP tools against that JSON, passing `treePath` (or export
   `CMP_INSPECTOR_TREE` once and omit it).

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

## The MCP tools

| Tool | Use it to… |
|---|---|
| `inspect_tree` | pull the whole tree + a summary `{ nodeCount, taggedCount, tokenizedCount }` |
| `get_node` | fetch one node by `testTag` — its geometry + resolved tokens |
| `assert_token` | assert a node's resolved value for a key (`padding`, `radius`, `color`, `fontSize`) equals what you expect |
| `layout_gaps` | compute real spacing between two nodes: `{ gapX, gapY, dxLeft, dyTop }` — this is how you verify padding/margins |
| `diff_against_design_system` | flag every node whose resolved value contradicts the declared catalog |
| `find_drift` | sweep for nodes that render but carry **no** token (raw value / un-tokenized) |

All take an optional `treePath`; omit it if `CMP_INSPECTOR_TREE` is set. Errors (missing file, bad
JSON, node not found) come back as a clean `{ error }` — read it and fix the input.

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
`assert_token` / `layout_gaps` assertions on the key nodes. Commit the tree JSON as a golden-tree
snapshot if you want a regression fixture — the diffs are human-readable, unlike pixels.

## Three tiers, one interface

The tools are identical regardless of where the tree comes from, so work done against the fast
headless loop transfers to the live app:

- **Tier 0 — headless render** (now): `ImageComposeScene` / `runComposeUiTest` on the host JVM. Fast,
  no device. Only renders `commonMain` composables whose deps resolve on the JVM; anything behind an
  Android `actual` (Firebase, platform APIs) needs a DI fake (the template's Koin makes this trivial).
- **Tier 1 — live app** (later): a debug-only Ktor endpoint inside the running app, reached via
  `adb forward`, walking `SemanticsOwner.getAllSemanticsNodes` — same tree, **plus real data and real
  nav state**.
- **Tier 2 — zero-instrument fallback**: `uiautomator` / Appium — geometry + text only, any app, no
  tokens. Use when you can't instrument.

## Registering the MCP

The `create-cmp` plugin ships this server; it's registered via the repo-root `.mcp.json`
(`cmp-inspector` → `node inspector/mcp/bin/server.mjs`), so it loads when the project/plugin is
active. To wire it into another project manually:

```bash
claude mcp add cmp-inspector -- node /absolute/path/to/inspector/mcp/bin/server.mjs
```

See `inspector/mcp/README.md` for the full tool reference and the tier roadmap.
