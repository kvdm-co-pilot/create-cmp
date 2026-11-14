# Web platform: one scaffold for Android, iPhone and the browser

Status: **commissioned 2026-11-13 by the session building Consignly's stack, which needs a web app
and phone apps from one codebase. The decisions below are the building agent's. They follow the
brief and Consignly's recorded needs, and Karel has not yet signed them.** W3 and W4 are the ones
Karel is most likely to want to change.

```json cmp:feature
{ "touches": [], "screens": false }
```

## The problem

Consignly (`kvdm-co-pilot/consignly`) decided on 12 Nov 2026 to ship a web app plus iPhone and
Android apps from one Compose Multiplatform codebase. Its handbook gives three things to check
early: tag printing from the browser, photo capture with the phone camera, and a 2-second load
target. Before this slice, `options.schema.json` allowed only `android` and `ios`. Every later
factory product that wants web would have needed a hand-added target that the lane, the CI and
the docs knew nothing about.

## Decisions

**W1. Web is opt-in.** `platforms.web` is a boolean that defaults to false. The flag is
`--web/--no-web`, and the interview asks it. An absent key means false, so every config and
`create-cmp.json` written before this slice keeps its meaning. Android stays `const: true`, so
web is always in addition to the phone apps and never on its own.

**W2. Kotlin/Wasm, sources in `webMain`.** The target is `wasmJs` with a browser executable.
Kotlin 2.2.20 (the frozen set) puts a shared `webMain` source set above the web targets, and
every web source lives there: the entry point (`main.kt`, `ComposeViewport`), `index.html`
(`webMain/resources`) and the seam actuals. Adding a `js()` target for older browsers later
then costs one line in the build file, with no source moved. The tasks are the plugin's own:
`wasmJsBrowserDevelopmentRun` for the dev server and `wasmJsBrowserDistribution` for the
release build.

**W3. Room has no web target in the frozen set, so web and Room are exclusive.** Room 2.8.4 and
`sqlite-bundled` publish no `wasmJs` variant. Room's web support is in the 2.9 line, which is
outside the proven set and can only enter through `create-cmp upgrade`. So:
- `--web` with no stated Room choice stamps without Room and prints one line saying so.
- `--web --room` is refused by name before anything is written.
- The engine refuses a config that has both, whichever front door built it.

The same rule reaches `create-cmp add firebase`. The GitLive SDK it adds to `commonMain` publishes
no wasmJs variant, so `add firebase` refuses an app with the web target and writes nothing (review
round 1). A web app that needs Firebase calls it from the web side (the REST API or the JS SDK).

Consignly keeps its data on a server (its feature list rules out an offline till), so it loses
nothing here. On-device key-value data goes through the `KeyValueStore` seam (W4).

**W4. Three new seams in every stamp: `KeyValueStore`, `DocumentPrinter`, `PhotoPicker`.**
They live in `core/platform/` as expect/actuals, so every target carries an actual. They are
stamped whether or not web is on, because Consignly's phone apps need the camera and printing
just as much as its web app does. A seam is never limited to one platform.

| Seam | Android | iOS | Desktop (JVM tier) | Web |
|---|---|---|---|---|
| `KeyValueStore` | SharedPreferences | NSUserDefaults | an in-memory map | `localStorage`, or memory for the page load where the browser refuses it |
| `DocumentPrinter.printHtml` | WebView + PrintManager | UIPrintInteractionController | **not on desktop**: returns `PrintOutcome.Unsupported` | a hidden iframe and the browser's print window |
| `rememberPhotoPicker` | the system photo picker (PickVisualMedia) | PHPickerViewController, as JPEG | AWT `FileDialog` | `<input type=file accept=image/*>`; a phone browser offers the camera or the library |

The desktop printer is the only "not here" fake. The desktop target is harness infrastructure,
not a shipped app (project ADR 0003), so it says so in a result value rather than pretending to
print. For the same reason the desktop store is in memory: a preview render or a test must not
leave values behind on the developer's machine.

The web store never throws. A browser that blocks site data, a sandboxed iframe and a full quota
all make `localStorage` throw, and the seam has no failure channel; the web store then keeps the
value in memory for the page load, as the desktop store always does (KD-296, closed).

The web picker has no `capture` attribute. With one, a phone opens the back camera directly;
without it, the phone asks camera or library. Consignly photographs stock, but shops also have
photos already on the phone, so the template asks. The app's `docs/web.md` says which line to
change.

The phone pickers open the photo library, not the camera. Camera capture on Android and iOS
needs a camera permission and a file provider, which is a seam of its own (see "What this slice
does not do").

**W5. The lane has a `webBuild` step.** It runs `:composeApp:wasmJsBrowserDistribution`, the
release web build, in the `local`, `ci` and `release` profiles, after `releaseBuild`. It SKIPs
structurally when `composeApp/src/webMain` is absent, the same way `tokenDrift` SKIPs without
the inspector. It is not part of the scaffold profile, for the same reason `releaseBuild` is
not: a stamp promises a green first build, and the stamp's own `--verify` runs the web build
separately when web is on. `--fast` excludes it as it excludes `releaseBuild`. It changes no
ladder rung, because a web build is compile evidence, the same tier as `releaseBuild`.

**W6. Previews, specs and receipts stay on the JVM tier.** The preview harness renders the same
`commonMain` UI that the browser runs, so no web renderer is added. Specs and receipts carry the
`webBuild` row like any other step.

**W7. CI gets a `stamp-web` job (ubuntu).** It stamps `--web --no-ios`, then builds both the
browser distribution and the Android debug APK from that one tree.

**W8. Size and load time are measured, not gated.** The release build of the stamped template app
is measured against Consignly's 2-second phone target with `scripts/web-load.mjs`. The numbers
are below and in the app's own [`docs/web.md`](../../template/docs/web.md). No program refuses
on them: the budget belongs to the product, and it is the product that has to decide what to
cut.

## Measured (2026-11-13)

`create-cmp --web --no-ios`, template app as stamped, `wasmJsBrowserDistribution`. Each case is
a cold load in headless Chromium (Playwright's headless shell, build 1243) at 412×915, with the
CPU slowed 4×, served brotli-compressed. The time runs from navigation to the first frame
Compose draws. The median of 3 runs is shown; the runs were within 2% of each other.

| File | Raw | gzip | brotli |
|---|---|---|---|
| `skiko.wasm` (Compose's renderer, the same for every app) | 8,440 KiB | 3,232 KiB | 2,539 KiB |
| the app's `.wasm` | 2,766 KiB | 827 KiB | 625 KiB |
| `composeApp.js` | 576 KiB | 103 KiB | 83 KiB |
| four DM Sans fonts | 188 KiB | 106 KiB | 87 KiB |
| **Total** | **11,971 KiB** | **4,269 KiB** | **3,334 KiB** |

| Profile | First frame (median) | On the wire |
|---|---|---|
| Wifi: 50 Mbps, 20 ms RTT | 1,630 ms | 3,248 KiB |
| Good 4G: 10 Mbps, 40 ms RTT | 3,715 ms | 3,248 KiB |
| Slow 4G (Lighthouse mobile): 1.6 Mbps, 150 ms RTT | 17,428 ms | 3,248 KiB |

**Verdict against 2 seconds on a phone:** met on shop wifi, missed on mobile data, by about 2×
on good 4G and about 9× on Slow 4G. The floor is `skiko.wasm`, 76% of the bytes, and no app
code can remove it. For Consignly this matters less than it looks. Staff use the till on shop
wifi every day, and the content-hashed `.wasm` files cache for returning visitors. A
first-time visitor on mobile data is the case that misses, and that is the case where an
`index.html` that paints before Compose does, plus a service worker, help. Whether that is good
enough is Consignly's decision, not the template's.

## What this slice does not do

- It does not scaffold Consignly.
- It adds no Kotlin/JS fallback target. W2 leaves room for one.
- It adds no browser runtime tier (a headless-browser smoke in the lane). This slice proved the
  browser run once, by measurement: the release build loaded and drew the template's Home
  screen in headless Chromium, with no page errors. Making that a lane step is a follow-up.
- It adds no camera capture on Android or iOS. The phone pickers open the library. Consignly
  needs camera capture there too, and it is a seam of its own (permission, file provider,
  `UIImagePickerController`).
- It adds no Room-on-web support. That waits for a version set with Room 2.9.
