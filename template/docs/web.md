# The web app

__APP_NAME__ also runs in the browser. The browser app is the same `commonMain` UI as the phone
apps, compiled to WebAssembly (Kotlin/Wasm, the `wasmJs` target) and drawn by Compose into one
canvas. There is no second UI codebase and no HTML templates.

## Run it

```bash
./gradlew :composeApp:wasmJsBrowserDevelopmentRun     # dev server; opens the app in your browser
./gradlew :composeApp:wasmJsBrowserDistribution       # release build
```

The release build is plain static files in `composeApp/build/dist/wasmJs/productionExecutable/`:
`index.html`, `composeApp.js`, two `.wasm` files and `composeResources/`. Any static host can
serve them. It must send `.wasm` as `application/wasm`, and it should compress with brotli
(or gzip). That more than halves what a phone downloads (see "Size and load time" below).

Browser support: current Chrome, Edge, Firefox and Safari (Safari 18.2 or newer), which have
the WebAssembly garbage-collection support Kotlin/Wasm needs.

## Where the web code lives

Everything web-only is in `composeApp/src/webMain/`:

| File | What |
|---|---|
| `kotlin/.../main.kt` | The entry point: starts Koin (`initWebKoin`) and mounts `App()` with `ComposeViewport`. |
| `resources/index.html` | The page that loads `composeApp.js`. Put the page title, favicon and meta tags here. |
| `kotlin/.../core/**/*.web.kt` | The web side of each platform seam (below). |

<!-- >>> cmp:feature harness -->
The verify lane builds the browser app in its `webBuild` step
(`./gradlew :composeApp:wasmJsBrowserDistribution`) and records the step in the receipt like
any other.
<!-- <<< cmp:feature harness -->
<!-- >>> cmp:feature !harness -->
CI builds the browser app on every push (`./gradlew :composeApp:wasmJsBrowserDistribution`, in
`.github/workflows/verify.yml`).
<!-- <<< cmp:feature !harness -->
Previews, golden trees and UI tests run on the JVM tier against the same `commonMain` code the
browser runs.

## Platform seams on the web

| Seam | On the web |
|---|---|
| `NetworkMonitor` | `navigator.onLine` plus the `online` and `offline` events. It tells you whether the device has a network, not whether your server answers. |
| `KeyValueStore` | `localStorage`, per origin. It survives reloads and is cleared when the user clears the site's data. Where the browser refuses storage (site data blocked, a sandboxed iframe, the quota full), values are kept in memory for the page load instead of throwing. |
| `DocumentPrinter` (`rememberDocumentPrinter()`) | Lays the HTML out in a hidden iframe and opens the browser's print window, so it works with any printer the browser can reach, label printers included. Size the page with CSS, e.g. `@page { size: 62mm 29mm; margin: 0 }`. |
| `PhotoPicker` (`rememberPhotoPicker { photo -> }`) | A file input for images. On a phone the browser offers the camera or the photo library. To go straight to the back camera, add `capture="environment"` in `PhotoPicker.web.kt`. |
| `exposeTestTagsForAutomation()` | A no-op: the UI is drawn on one canvas, so there is no DOM node to carry a test id. |

Room is not on the web. Room 2.8.4 has no browser target, which is why a web app is stamped
without it. For the same reason `create-cmp add firebase` refuses a web app: the GitLive SDK it
adds has no browser target either. Keep data on your server, and keep small on-device values (a session token, a
setting) in `KeyValueStore`.

## Size and load time

Measured on the template app (this app as stamped, before any feature is added) on
2026-11-13, with create-cmp's `scripts/web-load.mjs`. Each case is a cold load in headless
Chromium at phone size, with the CPU slowed 4×, timed from navigation to the first frame
Compose draws. The median of 3 runs is shown.

| What the phone downloads | Raw | Brotli |
|---|---|---|
| `skiko.wasm`: Compose's graphics engine, the same for every app | 8.2 MiB | 2.5 MiB |
| the app's own `.wasm` | 2.7 MiB | 0.6 MiB |
| `composeApp.js` and four fonts | 0.8 MiB | 0.2 MiB |
| **Total** | **11.7 MiB** | **3.3 MiB** |

| Connection | First frame |
|---|---|
| Wifi (50 Mbps, 20 ms) | 1.6 s |
| Good 4G (10 Mbps, 40 ms) | 3.7 s |
| Slow 4G (1.6 Mbps, 150 ms; Lighthouse's mobile default) | 17.4 s |

Against a 2-second target on a phone, the template app meets it on wifi and misses it on
mobile data. Three-quarters of the download is `skiko.wasm`, which is fixed for every
Compose web app. What an app adds on top is small by comparison. What helps:

- Serve with brotli and long cache lifetimes. The `.wasm` file names are content hashes, so
  a returning visitor downloads nothing until the next release.
- Add a service worker that caches the `.wasm` files. After the first visit, a load is
  mostly compile time.
- Show something useful in `index.html` while the wasm downloads (a logo, a progress line).
  The page can paint long before Compose does.
