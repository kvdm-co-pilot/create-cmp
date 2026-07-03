# cmp-inspector-harness

Phase 0 of the create-cmp inspector (`docs/INSPECTOR-PLAN.md`): a standalone Compose
**Desktop (JVM)** project that composes a sample screen **headlessly** — no window, no
emulator, no device — walks the Compose **semantics tree**, and emits it as JSON enriched
with resolved **design tokens**. This proves the "inspect a running Compose UI as
structured design data, never pixels" thesis using APIs that already exist
(`runComposeUiTest` + the semantics interaction API).

## Render + dump JSON

```bash
./gradlew run
```

Writes:
- `out/tree.json` — the enriched semantics tree (contract below), also printed to stdout.
- `out/design-system.json` — the declared token catalog (colors + dimens) the MCP diffs against.

Custom output paths (invoke the app directly so the `--args` spaces survive shell splitting):

```bash
./gradlew installDist
./build/install/cmp-inspector-harness/bin/cmp-inspector-harness --out out/tree.json --tokens-out out/design-system.json
```

`./gradlew run --args="..."` also works when the shell passes the quoted value through
intact; some shells word-split it, so the two default output files above are the reliable path.

## JSON contract

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

Every node has `bounds` (pixel, root-relative) and `children` (array, possibly empty).
`testTag` / `text` / `contentDescription` / `designToken` are nullable.

## Committed fixtures

- `sample-tree.json` — a produced tree, the MCP track validates against it.
- `sample-design-system.json` — the produced catalog.

## Phase 1

Phase 1 productionizes this as a `jvm()` target **inside generated apps**, so it renders
the real app's `commonMain` screens (with DI fakes for platform `actual`s) rather than this
local sample — same contract, real screens. The reusable semantics contract
(`DesignToken.kt`) is already seeded into the create-cmp template so generated components
can self-report their resolved tokens.
