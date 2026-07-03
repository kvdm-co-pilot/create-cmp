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
    "testTag": "home_action",
    "text": "+",
    "contentDescription": "Add item",
    "role": "Button",
    "clickable": true,
    "disabled": false,
    "bounds": { "x": 960, "y": 16, "width": 48, "height": 48 },
    "designToken": { "tokens": ["PaddingPage"], "resolved": { "padding": "16dp" } },
    "children": []
  }
}
```

Every node has `bounds` (pixel, root-relative) and `children` (array, possibly empty).
`testTag` / `text` / `contentDescription` / `designToken` are nullable.

**Additive contract extension (still schemaVersion 1)** — optional interaction fields, emitted by
this harness and safely absent on older trees:

- `role` — `string|null`, the semantics `Role` (e.g. `"Button"`, `"Checkbox"`).
- `clickable` — `boolean`, presence of the `OnClick` semantics action.
- `disabled` — `boolean`, presence of the `Disabled` semantics property.

These power the MCP's `audit_a11y` (touch targets / missing labels) and make golden-tree
snapshot diffs catch interaction regressions (a node silently losing its click handler).

## Committed fixtures

- `sample-tree.json` — a produced tree (carries `role`/`clickable`/`disabled` on the interactive
  nodes: the `home_action` icon-button and the bottom-nav items), the MCP track validates against it.
- `sample-design-system.json` — the produced catalog.

## What the sample renders

`SampleScreen` mirrors the **annotated template kit** in a concrete package — this is the compile
proof for the template's placeholder-form Kotlin: `BaseScreenMirror` (= template `BaseScreen`,
inset-fact designToken on the content Box), `SampleBottomNav` (= template `AppBottomNav`,
`BottomNavHeight` token + `app_bottom_nav` testTag + 48dp-minimum nav items), the HomeScreen-style
page padding/card tokens, and a 48dp clickable icon-button (`home_action`) so the dump exercises
`role`/`clickable`.

## Phase 1

Phase 1 productionizes this as a `jvm()` target **inside generated apps**, so it renders
the real app's `commonMain` screens (with DI fakes for platform `actual`s) rather than this
local sample — same contract, real screens. The reusable semantics contract
(`DesignToken.kt`) is already seeded into the create-cmp template so generated components
can self-report their resolved tokens.
