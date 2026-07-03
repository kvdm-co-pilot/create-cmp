# Inspector Phase 2 — Live on-device Compose inspector (design)

> **Status:** DESIGN — 2026-07-03. Companion to [`INSPECTOR-PLAN.md`](./INSPECTOR-PLAN.md)
> (Phase 0 built + verified). This document is the build-track spec for **Tier 1: the live
> on-device inspector** — an AI (via the `cmp-inspector` MCP) reading a **running Android app's**
> UI as structured JSON: hierarchy + geometry + resolved design tokens, with **real data and real
> navigation state**. Never screenshots. Android-only for v1 (iOS deferred, per plan).

## Decisions at a glance

| # | Question | Decision |
|---|----------|----------|
| D1 | How to read the semantics tree in a *running* app | **`SemanticsOwner` via `ViewRootForTest`** — public API, verified against the shipping binary (see §1). Shadow-tree registry is the fallback, not the primary. |
| D2 | Server implementation | **Hand-rolled ~120-line HTTP responder over `ServerSocket`**, not ktor-server (see §2.1). Zero new dependencies. |
| D3 | Where the server lives | **`composeApp/src/androidDebug/kotlin`** (variant source set), with a no-op twin in `androidRelease`. Structurally absent from release builds — stronger than any runtime flag or R8 hope (see §2.2). |
| D4 | Port / bind | **`127.0.0.1:9500`**, loopback only. Host reaches it via `adb forward tcp:9500 tcp:9500`. |
| D5 | Design-system catalog serialization | **Hand-registry** (`InspectorCatalog.kt`) next to the theme objects + a verify-time drift tripwire. No kotlin-reflect, no codegen (see §4). |
| D6 | MCP integration | Optional **`source`** param on all six existing tools (`file` \| `live` \| `uiautomator`) + one new **`connect_live`** tool that shells a bounded `adb forward` and health-checks (see §5). |
| D7 | Real-time model | **v1 = pull-on-demand** (each tool call re-fetches). Push/WebSocket sketched only (§5.4). |
| D8 | Tier-2 fallback | `src/lib/uiautomator.mjs` converter: Appium `getPageSource` XML → contract, `designToken:null`, `source:"uiautomator"` (see §6). |

The wire contract is **fixed** (schemaVersion 1) and identical to Phase 0, with
`source: "live-android"`:

```json
{ "schemaVersion": 1, "source": "live-android",
  "root": { "testTag": null, "text": null, "contentDescription": null,
            "bounds": {"x":0,"y":0,"width":1080,"height":2400},
            "designToken": { "tokens": ["PaddingPage"], "resolved": {"padding":"16dp"} },
            "children": [], "role": "Button", "clickable": true, "disabled": false } }
```

`role` / `clickable` / `disabled` are the contract's optional fields; the live source emits them
(they're free from `SemanticsConfiguration`); the MCP already tolerates extra keys.

---

## 1. The core question: reading the semantics tree inside a running app

`runComposeUiTest` / `SemanticsNodeInteraction` are test-only. Three candidates were evaluated;
the deciding evidence is `javap` output from the **exact artifacts this template ships**
(`androidx.compose.ui:ui-android:1.10.5` — what CMP 1.10.3 resolves on Android — pulled from the
local Gradle cache).

### 1.1 DECISION — (b) `SemanticsOwner` via `ViewRootForTest` is the primary path

Everything needed is **public API** in 1.10.5. Verified member-by-member on the binary:

- `androidx.compose.ui.platform.ViewRootForTest` — **public interface**, `extends RootForTest`,
  exposes `getView(): View`, and `AndroidComposeView` **publicly implements it**. Its companion
  exposes a **public** `var onViewCreatedCallback: ((ViewRootForTest) -> Unit)?` — the exact hook
  the Compose test framework itself uses to discover roots.
- `androidx.compose.ui.node.RootForTest` — public, `getSemanticsOwner(): SemanticsOwner`.
- `androidx.compose.ui.semantics.SemanticsOwner` — public `getRootSemanticsNode()` (merged) and
  `getUnmergedRootSemanticsNode()`.
- `androidx.compose.ui.semantics.SemanticsNode` — public `getChildren()`, `getBoundsInRoot()`,
  `getConfig()`, `getId()`, `getParent()`, `isRoot()`.
- Even `getAllSemanticsNodes(SemanticsOwner, Boolean)` is a public top-level function
  (`SemanticsOwnerKt`), though we don't need it — we walk from the root.

**Annotations:** `onViewCreatedCallback` and `ViewRootForTest` carry `@VisibleForTesting` — a
**lint-severity** annotation, *not* an opt-in requirement. No `@OptIn`, no reflection, no internal
API. One `@SuppressLint("VisibleForTests")` (or a lint baseline entry) in the debug source set and
it compiles clean. Debug-only usage is precisely the spirit of the annotation.

**Stability:** `RootForTest.semanticsOwner`, `SemanticsOwner.rootSemanticsNode`, and
`SemanticsNode`'s tree/geometry surface have been stable public API since Compose 1.0 — they are
the substrate the entire `ui-test` artifact (a separate, semver-bound library) is built on, so
they *cannot* be quietly internalized without breaking every Compose test in the ecosystem.
`ViewRootForTest.onViewCreatedCallback` is the same hook `createComposeRule` relies on. This is as
sanctioned as non-`ui-test` access gets.

**Bonus — contract fidelity for free:** the Phase 0 harness serializer
(`inspector/harness/.../SemanticsJson.kt`) already takes a `SemanticsNode` and emits the contract.
The live path yields **the same type**. The template's live serializer is a near-copy of proven
code (plus `role`/`clickable`/`disabled`), so tier-0 and tier-1 output are structurally identical
by construction. The `designToken` custom `SemanticsPropertyKey` (template
`presentation/theme/DesignToken.kt`) is read back with the same `config.getOrNull(DesignTokenKey)`
— no bridge to cross.

**Proof sketch (the exact access path):**

```kotlin
// androidDebug — registered in Application.onCreate BEFORE the first Activity.
object ComposeRootRegistry {
    private val roots = mutableSetOf<WeakReference<ViewRootForTest>>()
    fun install() { ViewRootForTest.onViewCreatedCallback = { roots += WeakReference(it) } }
    /** Topmost live root: attached, preferring window focus (covers dialogs/popups). */
    fun current(): ViewRootForTest? = roots.mapNotNull { it.get() }
        .filter { it.view.isAttachedToWindow }
        .let { live -> live.lastOrNull { it.view.hasWindowFocus() } ?: live.lastOrNull() }
}

// In the request handler — semantics must be read on the UI thread:
fun dumpTreeJson(): String {
    val root = ComposeRootRegistry.current() ?: return errorJson("no compose root attached")
    return onMainThread(timeoutMs = 2_000) {          // Handler(mainLooper) + CountDownLatch
        LiveSemanticsJson.dumpTree(root.semanticsOwner.rootSemanticsNode) // merged, like Phase 0
    }
}
```

Caveats, owned: (1) reading must happen on the main thread (layout nodes aren't thread-safe) —
the server posts and awaits with a 2s timeout; (2) multiple Compose roots exist when dialogs/
popups are up — each is its own `AndroidComposeView` in its own window; v1 serves the **topmost
attached** root (last-registered + focus heuristic above) which does the right thing for dialogs;
a `?root=all` multi-root envelope is a v2 nicety, out of scope; (3) we use the **merged** tree
(`rootSemanticsNode`) to match Phase 0's `onRoot()` default; (4) if node population ever appears
lazy on some device, `RootForTest.forceAccessibilityForTesting(true)` and
`measureAndLayoutForTest()` are public escape hatches — not expected to be needed.

### 1.2 Fallback — (a) shadow-tree via our own `Modifier.inspectable`

We own the kit, so we *can* maintain our own registry: extend `Modifier.designToken(...)` to also
capture bounds via `onGloballyPositioned` into a process-global map, and rebuild hierarchy at dump
time. Kept as the documented fallback because it is zero-private-API and commonMain-pure (it would
also be the eventual iOS path). **Not primary** because:

- **Coverage:** only annotated nodes appear. The kit annotates the important ones, but the live
  inspector's whole point is *what actually rendered* — including plain `Text`/`Icon` children the
  developer didn't tag. (b) sees everything (a) sees, plus the rest, plus text content for free.
- **Hierarchy reconstruction is genuinely fiddly** — sketch: each registered node stores its
  `LayoutCoordinates`; parenthood = walking `coordinates.parentLayoutCoordinates` chain until the
  first coordinates that belong to another *registered* node (identity map keyed by coordinates),
  falling back to bounds-containment (ambiguous for overlapping siblings — full-bleed overlays
  break naive containment). Detached nodes must self-remove via `onGloballyPositioned`'s
  companion `onDetach` (a custom `ModifierNode` — no longer a one-liner). Solvable, but it
  re-derives what `SemanticsNode.children` already gives us correctly.
- **Trigger condition for switching:** a future Compose release internalizing
  `ViewRootForTest`/`semanticsOwner` (would surface immediately in the pinned-version CI build —
  and the frozen version catalog means we upgrade deliberately, never by surprise).

### 1.3 Rejected as primary — (c) `AccessibilityNodeInfo` walk

Honest answer on the token question: **custom `SemanticsPropertyKey`s do NOT cross the
accessibility bridge.** The Compose a11y delegate maps a fixed, known set of semantics properties
(text, contentDescription, role, actions, state) onto `AccessibilityNodeInfo` fields; unknown keys
like our `DesignTokenKey` are simply never read. The only smuggling channel is
`testTagsAsResourceId` (testTag → `viewIdResourceName`), which is one string, already spoken for.
Stuffing tokens into `contentDescription`/`stateDescription` would pollute real accessibility for
actual users — disqualifying. So (c) can never satisfy the `designToken` half of the contract.
It survives as **Tier 2** (§6): geometry + text, zero instrumentation, any app.

---

## 2. The in-app inspection server

### 2.1 DECISION — hand-rolled `ServerSocket` micro-responder, not ktor-server

We need: three fixed `GET` routes, one local client, JSON strings we already build with
`kotlinx.serialization` (present in commonMain). Against that, ktor-server(-core + -cio) brings a
15+-artifact dependency subtree, its own coroutine engine lifecycle, and a version axis coupled to
the frozen catalog (`ktor = 3.1.0` today — every future bump now has a *server* blast radius too).
The template currently has **no ktor-server** and this design keeps it that way.

The KMP scoping reality that settles it: **commonMain dependencies cannot be debug-scoped** — a
`commonMain` ktor-server dep ships in every variant, and "R8 will strip it" is a hope, not a
guarantee (Koin wiring keeps references live). Android *does* honor `debugImplementation` in the
top-level `dependencies {}` block for android-variant scoping, which would keep release clean —
but then the *code* using ktor must live in `androidDebug` anyway (it can't compile in commonMain
without the dep on all targets). At which point ktor buys us routing DSL for three routes.

The micro-responder wins on every axis that matters here:

- **Zero dependency changes.** `java.net.ServerSocket` is JDK; JSON via `kotlinx.serialization`
  (already in commonMain). `template/composeApp/build.gradle.kts` is untouched.
- **Zero release footprint by construction** (§2.2) — no scoping mistake can ship it.
- ~120 auditable lines: accept-loop on a daemon thread, parse the request line, dispatch on path,
  write `HTTP/1.1 200` + `Content-Type: application/json` + `Content-Length` + body, close.
  Single-threaded accept = one client at a time = bounded by design.
- HTTP/1.1-with-`Connection: close` is trivially correct and `curl`/node-`fetch` compatible.

What we give up: keep-alive, TLS, streaming — all irrelevant for a localhost debug tool. If v2
push (§5.4) ever lands, WebSocket needs are re-evaluated then; do not pre-buy them.

### 2.2 Placement — `androidDebug` source set with a release no-op twin

Not commonMain-with-expect/actual for v1: iOS is deferred, and an expect/actual seam would force a
no-op iOS actual plus commonMain visibility of inspector types for zero benefit today. When iOS
inspection lands, the shadow-tree fallback (§1.2) becomes the shared path and the seam gets
introduced *then*, with a real second implementation to justify it.

The debug/release split uses the classic **variant source-set twin** — same fully-qualified
function, two bodies:

```
composeApp/src/androidDebug/kotlin/__PACKAGE_PATH__/inspector/
    InspectorInit.kt        # fun Application.startInspector() { install registry; start server }
    ComposeRootRegistry.kt  # §1.1
    InspectorHttpServer.kt  # §2.1 responder + routes (§3)
    LiveSemanticsJson.kt    # SemanticsNode -> contract JSON, source:"live-android"
    InspectorCatalog.kt     # §4 declared-token registry
composeApp/src/androidRelease/kotlin/__PACKAGE_PATH__/inspector/
    InspectorInit.kt        # fun Application.startInspector() { /* no-op */ }
```

`AppApplication.onCreate()` (androidMain) calls `startInspector()` unconditionally; the compiler
picks the variant body. Release builds **do not compile the inspector at all** — no server class,
no `/inspect/` strings, no R8 reliance, no `BuildConfig` branch to get wrong. (KMP + AGP create
the `androidDebug`/`androidRelease` Kotlin source sets for `com.android.application` targets;
both compile against commonMain symbols like `DesignTokenKey`, which is all we need.)

Startup: `startInspector()` installs the root-registry callback **first** (before any Activity
exists — that ordering is what makes `onViewCreatedCallback` catch every root), then starts the
server thread. Failure to bind (port busy) logs a warning and gives up — the inspector must never
crash or block app startup. `android.permission.INTERNET` is already in the template manifest
(Firebase/ktor-client), so loopback sockets need no manifest change; the no-Firebase feature
variant must keep INTERNET — add it to `src/androidDebug/AndroidManifest.xml` so the guarantee is
variant-local and unconditional.

No Koin module: the server has no injectable collaborators (registry and catalog are objects), and
DI would put inspector types into a graph that release code can see. Direct wiring is the simpler,
safer shape. (Revisit only if per-app config ever needs injection.)

---

## 3. Endpoints

All respond `application/json; charset=utf-8`, `Connection: close`. Unknown path → 404 JSON
`{"error":"unknown path"}`. Any internal failure → 500 `{"error": "..."}` — never a stack dump.

| Route | Returns |
|---|---|
| `GET /inspect/health` | `{ "status":"ok", "schemaVersion":1, "source":"live-android", "appId":"__PACKAGE__", "buildType":"debug", "composeUi":"1.10.5" }` |
| `GET /inspect/tree` | The full contract document (§ top), serialized from the topmost root on the main thread. 503 `{"error":"no compose root attached"}` before first frame. |
| `GET /inspect/design-system` | The declared catalog, same shape Phase 0 uses: `{ "colors": {"Primary":"#0A2540", ...}, "dimens": {"PaddingPage":"16dp", ...} }` |

`buildType` in health is load-bearing: it is what `create-cmp doctor` interrogates (§7).

---

## 4. `/inspect/design-system` — serializing `<Prefix>Tokens` / `<Prefix>Colors`

The problem: `__THEME_PREFIX__Tokens.PaddingPage` is a `Dp` and `__THEME_PREFIX__Colors.Primary`
a `Color` — both `@JvmInline value class`es, so their getters compile to mangled names
(`getPaddingPage-D9Ej5fM()` returning a raw `float`/`long`). Options:

- **Reflection** — needs mangled-name demangling heuristics and (for pleasant API) kotlin-reflect,
  a heavyweight dependency. Fragile against Kotlin metadata changes. Rejected.
- **Codegen (KSP)** — robust but buys a compiler-plugin round-trip and build-time cost for two
  small objects. Rejected for v1; the natural upgrade if the kit's token surface grows large.
- **Hand-registry** — CHOSEN. `InspectorCatalog.kt` (androidDebug) lists entries explicitly:

```kotlin
object InspectorCatalog {
    fun json(): String = catalogJson(
        colors = mapOf(
            "Primary" to __THEME_PREFIX__Colors.Primary.toHex(),   // toArgb() -> "#0A2540"
            "Surface" to __THEME_PREFIX__Colors.Surface.toHex(),
            /* ...all 17 seed colors... */),
        dimens = mapOf(
            "PaddingPage" to __THEME_PREFIX__Tokens.PaddingPage.token(), // "16dp"
            /* ...all 10 seed dimens... */))
}
```

Type-safe (renaming a token breaks this file at compile time), zero deps, and values are read
from the *real* objects — never string-literal duplicates. The residual risk is a **newly added**
token missing from the registry; that is covered by a **verify-time tripwire**: the engine's
verify step greps `val X =` declarations in `Tokens.kt`/`Theme.kt` and warns when a name is absent
from `InspectorCatalog.kt`. Cheap, textual, catches the realistic failure mode.

---

## 5. Transport and MCP changes

### 5.1 Transport

**`adb forward tcp:9500 tcp:9500`** — direction check: the *server is on the device*, the MCP (on
the host) is the client, so it's `forward` (host port → device port). (`adb reverse` is the
opposite direction — that's the Firebase-emulator pattern; do not copy it here.) `adbd` connects
to the app's port *from on the device*, so the loopback-only bind is fully reachable through the
forward while staying invisible to the LAN. Port **9500**: outside every range this stack already
uses (5001/8080/9099/9199 Firebase, 4723 Appium, 8100 WDA, 5037 adb) and unregistered.

### 5.2 MCP: one `source` param on the existing six tools

All six tools (`inspect_tree`, `get_node`, `assert_token`, `layout_gaps`,
`diff_against_design_system`, `find_drift`) gain an optional discriminated-union param:

```
source?: { kind:"file",  path: string }
        | { kind:"live", host?: string /* 127.0.0.1 */, port?: number /* 9500 */ }
        | { kind:"uiautomator", xml: string }              // §6
```

Resolution order in `resolveTree`: explicit `source` → legacy `treePath` (kept, aliased to
`{kind:"file"}` — Phase 0 callers unaffected) → env `CMP_INSPECTOR_LIVE` (`host:port`) → env
`CMP_INSPECTOR_TREE` (file) → the existing clear error. `kind:"live"` fetches
`http://host:port/inspect/tree` per call (that *is* the pull-on-demand realtime model — every
tool call sees the current screen); `diff_against_design_system` with a live source and no
`catalogPath` fetches `/inspect/design-system` as the catalog. New module **`src/lib/live.mjs`**:
`fetchLiveTree`, `fetchLiveCatalog`, `fetchHealth` — plain `fetch` with a 3 s `AbortController`
timeout, connection-refused mapped to a actionable error ("is the app running? did you
`connect_live`?"). Pure functions, unit-tested against a stub `http.Server`.

### 5.3 New tool: `connect_live`

`connect_live { port?: 9500, serial?: string }` → shells `adb [-s serial] forward tcp:P tcp:P`
(one bounded `execFile`, 5 s timeout, no shell interpolation of user strings beyond validated
serial/port), then `GET /inspect/health`, returns the health payload + sets the session default
source to `{kind:"live", port}`. Safety: bounded (one adb call + one GET per invocation), local
(adb on the host the MCP already runs on), idempotent (`adb forward` re-applies cleanly). The MCP
never launches apps or emulators — that stays with the human/Appium track.

### 5.4 v2 push — sketch only (explicitly not designed now)

The registry pairs naturally with `Snapshot.registerApplyObserver` or a semantics-change listener
to mark the tree dirty and push a `tree-changed` event over a WebSocket, letting the agent observe
recomposition live. Requires debounce, a WS codec, and MCP-side subscription semantics — **only if
an agent workflow demonstrably needs sub-second reactivity**; pull-per-call is already "live" for
the inspect→assert loop.

---

## 6. Tier 2 — the uiautomator adapter

**`inspector/mcp/src/lib/uiautomator.mjs`** — a pure converter from Appium
`getPageSource` XML (uiautomator2 hierarchy) to the contract, used via
`source: {kind:"uiautomator", xml}`. The agent (which drives Appium MCP anyway) pastes the XML in;
no new process wiring.

Mapping: `bounds="[x1,y1][x2,y2]"` → `{x,y,width,height}` **normalized to root-relative** by
subtracting the root node's origin; `resource-id` → `testTag` (only meaningful when the app sets
`testTagsAsResourceId` — the template's Appium feature should set it on the shell root, one
`@OptIn(ExperimentalComposeUiApi)` semantics flag); `text` → `text`; `content-desc` →
`contentDescription`; `class` → `role` (tail of the class name); `clickable`/`enabled` →
`clickable`/`disabled`. Always `designToken: null`, `source: "uiautomator"`.

Lossy, stated plainly: **no tokens ever** (§1.3), only accessibility-important merged nodes (the
a11y tree prunes), physical screen coordinates (status bar included pre-normalization), no
unmerged detail. Tier selection guidance baked into tool descriptions: *tier 1 when the app is a
create-cmp debug build and `connect_live` health-checks OK; tier 2 when inspecting a
non-instrumented/third-party app or when tier 1 is unreachable; token/drift tools require tier 0/1
and return a clear "requires an instrumented source" error on a uiautomator tree.*

---

## 7. Security / safety

- **Bind loopback only** (`InetAddress.getLoopbackAddress()`) — never `0.0.0.0`. Not on the LAN.
- **Debug builds only, structurally** (§2.2) — the release variant contains no server code at all.
  This is the "must NEVER ship in release" enforcement: not a flag, an absent class.
- **No auth in v1 — justified:** the exposure surface is (1) the host developer via adb — trusted
  by definition, they can already do anything to a debug app — and (2) *other apps on the same
  device*, since Android does not isolate localhost per-app. What they'd get: the UI tree of a
  debug build on a dev emulator — no secrets by design (the tree carries on-screen text; debug
  builds run against emulator/test data — worth one line in the generated README). A shared-token
  header is the designed-but-deferred upgrade if generated apps ever run debug builds on personal
  devices with real accounts.
- **What must never ship in release:** the server, the root registry (`onViewCreatedCallback`
  global mutation), `@SuppressLint("VisibleForTests")`, and the catalog. All live in
  `androidDebug` — release compilation proves absence. Belt-and-braces: verify (§8) greps the
  release APK dump for `/inspect/` and fails if present (guards template forks that move files).
- **`create-cmp doctor` check:** if a device is attached — `adb forward tcp:9500 tcp:9500`, GET
  `/inspect/health` (2 s timeout), then: unreachable → info "inspector not running" (normal);
  reachable with `buildType:"debug"` → OK; reachable with anything else → **loud warning**
  ("inspector server reachable in a non-debug build — your variant wiring is broken"). One
  bounded probe, then `adb forward --remove tcp:9500` to leave no residue.

---

## 8. Template integration

Files added (all content-tokenized with `__PACKAGE__`/`__THEME_PREFIX__`, dirs stored literally as
`com/example/app` per the manifest's rename rule):

```
composeApp/src/androidDebug/kotlin/com/example/app/inspector/InspectorInit.kt
composeApp/src/androidDebug/kotlin/com/example/app/inspector/ComposeRootRegistry.kt
composeApp/src/androidDebug/kotlin/com/example/app/inspector/InspectorHttpServer.kt
composeApp/src/androidDebug/kotlin/com/example/app/inspector/LiveSemanticsJson.kt
composeApp/src/androidDebug/kotlin/com/example/app/inspector/InspectorCatalog.kt
composeApp/src/androidDebug/AndroidManifest.xml          # INTERNET (unconditional for debug)
composeApp/src/androidRelease/kotlin/com/example/app/inspector/InspectorInit.kt   # no-op twin
```

Edits: `AppApplication.kt` gains `startInspector()` wrapped in feature markers:

```kotlin
// >>> cmp:feature inspector
startInspector()
// <<< cmp:feature inspector
```

Scaffolder plumbing:

- **`manifest.json`:** `packageSourceRoots` += `composeApp/src/androidDebug/kotlin` and
  `composeApp/src/androidRelease/kotlin` (required for the package-dir rename);
  `features.inspector = { enabledByDefault: true, paths: [both inspector dirs, the androidDebug
  manifest], notes: "strip `inspector` markers in AppApplication.kt when off" }`.
- **`options.schema.json`:** `inspector: boolean` following the `room`/`appium` pattern (added to
  `required` like its siblings — the CLI front door defaults it to `true`; engine callers are
  in-repo and updated in the same change).
- **`verify`:** stamped-app verify must stay green with the feature ON (default) and OFF; add the
  release-APK `/inspect/` grep and the catalog-drift tripwire (§4). No new placeholders.

---

## 9. Verification plan (build track; every live op bounded)

All local — Android emulator + localhost; no cloud services touched.

1. Stamp a scratch app (`node bin/create-cmp.mjs … --inspector`), `assembleRelease` +
   `installDebug` both green; grep release APK: no `/inspect/`.
2. Boot the emulator (headless), launch the stamped debug app.
3. `adb forward tcp:9500 tcp:9500`; `curl /inspect/health` once (expect `buildType:"debug"`),
   `/inspect/tree` once, `/inspect/design-system` once. Fixed three requests.
4. MCP live pass: `connect_live`, then each of the six tools once against
   `source:{kind:"live"}` — assert `source:"live-android"`, `home_screen` testTag present,
   `assert_token` on `PaddingPage=16dp` passes, `diff_against_design_system` clean.
5. **Nav-state proof (the Phase 2 headline):** drive the app to the Detail screen with the
   Appium MCP (bounded: one session, two-three taps), re-run `inspect_tree` — assert the detail
   testTag is now present and the home list absent. Real navigation state, observed live, no
   screenshot at any step.
6. Tier-2 proof: `appium_get_page_source` once on the same screen → `convert` via
   `{kind:"uiautomator"}` → assert geometry/text parity with the live tree for two known nodes
   (tolerance for a11y pruning), `designToken:null`.
7. Feature-off stamp: scaffold with `--no-inspector`, build green, port 9500 refused.
8. `doctor` check exercised against the debug build (warning path unit-tested, not live).

---

## 10. Work breakdown (ordered; spike first)

| # | Task | Size | Risk |
|---|------|------|------|
| 1 | **SPIKE — on-device semantics access PoC**: androidDebug-only registry + `logcat` dump of the walked tree in a stamped app. Proves §1.1 end-to-end on device (root discovery, main-thread walk, DesignTokenKey readback). **Do this before anything else** — it validates the load-bearing assumption. | M (~0.5d) | HIGH |
| 2 | `ComposeRootRegistry` + `InspectorInit` debug/release twin + AppApplication wiring + feature markers | S | low |
| 3 | `InspectorHttpServer` (ServerSocket responder, daemon thread, `/inspect/health` + `/inspect/tree`, main-thread bridge w/ timeout) | M | med |
| 4 | `LiveSemanticsJson` — contract parity with Phase 0 serializer + `role`/`clickable`/`disabled`; golden-JSON comparison test vs a harness dump of the same screen | S | low |
| 5 | `InspectorCatalog` + `/inspect/design-system` + verify drift tripwire | S | low |
| 6 | Scaffolder plumbing: manifest.json (`packageSourceRoots`, `features.inspector`), options.schema, verify additions; stamp+verify green ON and OFF | M | med |
| 7 | MCP: `source` param on six tools + `src/lib/live.mjs` + `connect_live` + unit tests (stub HTTP server) | M | low |
| 8 | `src/lib/uiautomator.mjs` converter + fixture tests (real `getPageSource` XML sample) | S | low |
| 9 | `doctor` release-reachability check | S | low |
| 10 | End-to-end emulator verification (§9) + README/skill (`cmp-inspect`) update | M | low |

Riskiest assumption, named: **task 1's premise that `ViewRootForTest.onViewCreatedCallback` +
`semanticsOwner` behave in a plain running app exactly as they do under the test framework**
(root discovery timing, tree population without a11y enabled). The binary evidence says yes; the
spike proves it on a device before the team builds the server around it. If it fails, the fallback
(§1.2) slots behind the same server/endpoints — everything from task 3 onward survives.

## Open questions

- **Multi-root envelope** (`?root=all` for dialog + underlying screen simultaneously): deferred;
  contract change (array of roots) needs MCP-side design. v1's topmost-root rule covers the
  common case.
- **Shared-token auth** for debug builds on personal devices: deferred until generated apps
  demonstrably run that way (§7).
- **KSP catalog codegen** replacing the hand-registry when the kit's token surface grows: revisit
  at >~50 tokens or first real drift incident that slips the tripwire.
