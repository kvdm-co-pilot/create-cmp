# create-cmp Inspector — plan of record

> **Status:** **Phase 0 built + verified (2026-07-03). Phase 1 (template token-annotation) +
> contract extension + golden-tree snapshots + a11y audit built + verified (2026-07-03).
> Phase 2 (LIVE on-device inspector) BUILT + VERIFIED (2026-07-03).** The
> headless render → semantics-dump → structured-inspect loop works end-to-end on the host JVM (no
> emulator): a Compose Desktop harness (`inspector/harness/`) renders a screen and emits the
> design-token-annotated semantics tree as JSON; the `cmp-inspector` MCP (`inspector/mcp/`)
> consumes it and exposes ten query/assert/drift/snapshot/a11y/connect tools. The node contract
> carries optional `role`/`clickable`/`disabled` fields (additive, schemaVersion 1), the template
> kit (BaseScreen/AppShell/Home/Detail/Profile) self-reports design tokens by default, and
> `snapshot_save`/`snapshot_diff`/`audit_a11y` provide the pixel-free regression + accessibility
> gates. **Phase 2**: every generated app ships a debug-only loopback HTTP server
> (`composeApp/src/androidDebug/.../inspector/`, 127.0.0.1:9500, zero deps, `--inspector` feature
> on by default, androidRelease no-op twin = structurally absent from release) serving
> `/inspect/health|tree|design-system`; the MCP gained the `source` union
> (`file`|`live`|`uiautomator`) + `connect_live`, proven live on an emulator: health → tree
> (`source:"live-android"`, real data) → clean design-system diff → a11y pass → **nav-state proof**
> (tap a card at live-tree coordinates → re-fetch → `home_title` gone, Detail content present).
> Phase 3 remains proposed. Scope for now is **Android + host-JVM only** — iOS is explicitly
> deferred. Companion docs: [`INSPECTOR-PHASE2-DESIGN.md`](./INSPECTOR-PHASE2-DESIGN.md) (the
> Phase 2 spec), [`ARCHITECTURE.md`](./ARCHITECTURE.md) (the scaffolder engine), and the internal
> strategy notes (not in the public repo).

## The problem

AI coding agents are effectively **blind to Compose UI**. To reason about a layout today an agent
either (a) takes a screenshot — which burns tokens, degrades to pixel-guessing for colors/spacing,
and can't read theme tokens at all — or (b) reads the source, which cannot see what actually
*rendered*: past-dated data shown as live, token drift (raw hex where a token belongs), clipped or
occluded elements, missing empty/error states, wrong runtime spacing.

What's missing is a way to inspect a running Compose UI as **structured, queryable design data** —
hierarchy + geometry + resolved design tokens + text + transient state — delivered as JSON, never as
pixels. That is the gap this plan fills.

This directly serves the way we already want to work: **assert on structure, not screenshots.**

## Why this is a create-cmp capability, not a generic tool

The hard part of "read the real colors/padding/tokens of a live Compose app" is that the standard
inspection surface (the Android accessibility/semantics bridge that `uiautomator`/Appium walk) is
**blind to visual styling** — see the ceiling below. The one clean way past that wall is to have the
components *self-report their resolved design tokens*. That is only possible if you **own the theme
and the component kit** — which is exactly what create-cmp generates. The inspector is therefore a
natural, defensible extension of the scaffolder, not a separate product.

## The ceiling on uiautomator (be honest about it)

`uiautomator` (and Appium's `uiautomator2` driver, which the template already wires up) walks the
**accessibility/semantics** tree. For Compose that is exposed via `AndroidComposeView`. It reliably
yields:

- **geometry** — every node's bounds, so spacing/padding can be *computed* from the gaps between
  nodes;
- **text, content-description, testTag, role, and interaction state** (clickable / enabled / etc.).

It **cannot** yield **colors, elevation, shape/radius, dp padding values, font sizes, or theme
tokens** — none of that crosses the accessibility boundary. So "get the full design system from a
live app via uiautomator alone" is **not** achievable. uiautomator remains valuable as the
**zero-instrumentation, works-on-any-app** fallback tier, but it is not the design-system path.

The alternative that *does* read colors/tokens is Android Studio's Layout Inspector, which speaks a
heavy, proprietary-ish on-device transport (the `compose-ui-inspection` agent + protobuf pipeline).
Reimplementing that for arbitrary apps is a large, fragile project we deliberately avoid.

## The unlock: token-annotated semantics

Because create-cmp generates the theme and the component kit, we instrument every generated
component (in **debug builds only**) to emit its *resolved* design token into a dedicated debug
semantics channel:

```kotlin
// generated Kit component, debug source set only
Modifier.semantics {
    designToken = "color=primary #0A2540; pad=16dp; radius=md; type=titleLarge"
}
```

Now the semantics tree is **design-system-aware**, not just geometry. Reading it gives the *declared,
resolved* token — strictly better than sampling a screenshot, and 100% structured (no image bytes).

This also mechanically catches **token drift** — raw hex where a token should be — by diffing the
rendered resolved values against the declared `<Prefix>Tokens`. That is a real, recurring UI-fidelity
fault class, caught for free.

## Architecture — one contract, three source tiers

Design the whole thing as **one JSON tree schema + one MCP tool surface**, fed by three
interchangeable sources. The agent's interface is identical regardless of source, so work done
against the fast headless loop transfers directly to the live app.

| Tier | Source | Yields | Instrumentation | Speed |
|---|---|---|---|---|
| **0 — Headless render** | `ImageComposeScene` / `runComposeUiTest` on the host JVM | tree + geometry + tokens, **no emulator** | debug semantics only | milliseconds |
| **1 — Live app** | debug-only **Ktor** endpoint inside the app, reached via `adb forward`, walking `SemanticsOwner.getAllSemanticsNodes` | same tree, **plus real data + real nav state** | app runs the debug server | live |
| **2 — Zero-instrument fallback** | `uiautomator` / Appium (already set up) | geometry + text only, **any** app | none | live |

**MCP tool surface (over the shared contract):**

- `inspect_tree()` — full enriched semantics tree as JSON.
- `get_node(testTag)` — a single node with geometry + resolved tokens.
- `assert_token(node, expected)` — assert a node's resolved token matches expectation.
- `diff_against_design_system()` — flag every node whose resolved value drifts from `<Prefix>Tokens`.
- `layout_gaps(a, b)` — computed spacing/padding between two nodes.
- `find_drift()` — sweep for raw-value-instead-of-token across the tree.

### Why the headless tier is the centerpiece

Because this is CMP, the same `commonMain` composables run on the **Desktop/JVM Compose runtime**
with no emulator and no device. Compose already ships a headless, fully-inspectable path
(`ImageComposeScene` for offscreen composition; `runComposeUiTest` / the semantics interaction API
for the queryable tree). The renderer itself is therefore **~80% existing**; the novel work is (1)
wrapping it in an MCP and (2) enriching the semantics with design tokens.

**Known limitation (state it plainly):** the headless tier only renders `commonMain` composables
whose dependencies resolve on the JVM. Anything behind an Android `actual` (Firebase, platform APIs)
needs a fake — which the template's Koin DI already makes trivial to swap. Screens with heavy
platform coupling are inspected on Tier 1 instead.

## Phasing — cheapest proof first

- **Phase 0 — headless semantics-dump MCP. ✅ BUILT + VERIFIED (2026-07-03).** A Compose Desktop
  harness (`inspector/harness/`) renders a screen headlessly via `runComposeUiTest` and emits the
  token-annotated semantics tree as JSON; the `cmp-inspector` MCP (`inspector/mcp/`) consumes it and
  exposes `inspect_tree` / `get_node` / `assert_token` / `layout_gaps` / `diff_against_design_system`
  / `find_drift`. Proven end-to-end: fresh render → MCP verifies padding=16dp, measures the 12dp card
  gap, reports a clean design-system diff, and flags un-tokenized nodes. No emulator, no device.
  21/21 MCP tests green.
- **Phase 1 — token-enriched semantics in the generated Kit. ✅ BUILT + VERIFIED (2026-07-03).**
  The template kit self-reports tokens by default: `BaseScreen` emits its inset facts,
  `AppShell`'s bottom nav emits `BottomNavHeight` (+ stable `app_bottom_nav` testTag + 48dp-minimum
  nav tap targets), `HomeScreen`/`DetailScreen`/`ProfileScreen` emit `PaddingPage`/card tokens —
  so every generated app is design-system-aware out of the box. Compile-correctness proven via
  concrete-package mirrors in the harness (`SampleScreen.kt` build green), as in Phase 0.
  Built alongside it (same date):
  - **Contract extension (additive, schemaVersion 1):** optional `role` / `clickable` / `disabled`
    node fields, emitted by the harness from the semantics Role / OnClick / Disabled properties.
  - **Golden-tree snapshots** (`snapshot_save` / `snapshot_diff` + `src/lib/snapshot.mjs`): commit
    the normalized semantics JSON as the regression fixture; diffs are human-readable
    `{path, kind, before, after}` entries (node added/removed, text/testTag/designToken/interaction
    changed, bounds moved beyond a px tolerance) — the CI regression primitive, no pixels.
    Verified: two independent harness renders diff EMPTY against the saved golden.
  - **A11y auditor** (`audit_a11y` + `src/lib/a11y.mjs`): touch targets below 48px (density-1 px==dp
    on harness output; parameterizable for device trees), clickables with no label anywhere, empty
    contentDescription. Its first real catch: the template's bottom-nav tap targets measured ~36px
    tall — fixed in the kit with `defaultMinSize(48.dp)` and re-verified clean.
- **Phase 2 — live on-device inspector. ✅ BUILT + VERIFIED (2026-07-03).** Same JSON schema,
  sourced LIVE from the running app: the template stamps a debug-only, zero-dependency
  `ServerSocket` HTTP responder (`androidDebug` source set only; `androidRelease` ships a no-op
  twin, so release builds contain no inspector code structurally) bound to `127.0.0.1:9500`,
  reading the semantics tree from the topmost Compose root (public `ViewRootForTest.
  onViewCreatedCallback` registry + main-thread bridge) and the declared token catalog from a
  hand-registry (`InspectorCatalog.kt`). MCP side: `source` union
  (`{kind:"file"|"live"|"uiautomator"}`) on all nine tools + `connect_live` (one bounded
  `adb forward` + health check, sets the session default) + the tier-2 uiautomator XML converter.
  Feature-toggled (`--inspector`/`--no-inspector`, default on); `create-cmp doctor` statically
  warns if inspector code leaks outside `androidDebug` and when a declared theme token is missing
  from the catalog. Verified end-to-end on an emulator: `/inspect/health|tree|design-system` live,
  MCP tools green against `source:{kind:"live"}` (clean design-system diff, a11y pass), and the
  headline nav-state proof — tap a card at coordinates read from the live tree, re-fetch,
  `home_title` gone / Detail content present. No screenshots at any step.
- **Phase 3 — ship as the `cmp-inspector` plugin** — MCP server + a driving skill + the template's
  debug module, on by default in generated apps.

## Strategic fit

Today create-cmp's pitch is "scaffold a green-building CMP app." The inspector upgrades it to:
**"apps scaffolded with create-cmp are natively AI-inspectable — an agent sees the UI as structured
design data, not screenshots, and debugs layout/color/token issues mechanically."** No one in the
Compose/CMP ecosystem has a good AI-native inspector; it is a genuine gap, it compounds the
reliability moat, and it serves the assert-on-structure / no-pixels workflow directly.

## Adjacent ecosystem plays (unlocked once the inspector exists)

All reuse the same tree contract + diff engine:

- **Design-system linter** — a CI gate on token drift.
- **Screen-from-token generator** — generate a screen and *prove* it matches declared tokens via the
  inspector, closing the generate→verify loop.
- **Golden-tree snapshots** — commit the semantics JSON (not pixels) as regression fixtures; diffs
  are human-readable and reviewable.

## Open questions

- Exact wire format of the `designToken` semantics value (structured map vs. encoded string) — lean
  structured so the MCP doesn't parse strings.
- Whether the debug Ktor endpoint should push (WebSocket, for live recomposition tracking) or pull
  (HTTP GET on demand). Start pull; add push only if live recomposition observation earns it.
- How the headless harness resolves platform `actual`s at scale without hand-written fakes per
  screen — candidate: a generated `debugFakes` module keyed off the DI graph.

## Scope guardrails

- **iOS is out of scope for now** (per direction). The headless tier incidentally validates
  `commonMain` UI that iOS also consumes, but no iOS-specific inspection work is planned yet.
- No LLM in the inspection hot path — same determinism principle as the scaffolder engine. The MCP
  moves structured data; the agent reasons over it.
