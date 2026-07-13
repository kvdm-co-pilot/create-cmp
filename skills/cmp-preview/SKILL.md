---
name: cmp-preview
description: >-
  THE default UI feedback loop while building or editing ANY Compose Multiplatform
  screen — use it DURING development, not only when asked: it renders the app's REAL
  screens headlessly in seconds (no device, no emulator, no manual Gradle) and tells you
  exactly what each edit changed, so you catch your own mistakes as you build. Use this
  whenever you are about to write or change CMP/KMP UI code, need quick build/visual
  feedback, want to verify a UI change landed, or the user asks "preview my app", "show
  me my screens", "open the preview gallery", "Android Studio previews without the IDE",
  "see my UI without running the app", "live preview my compose screens", or "storybook
  for compose". Starts the cmp-inspector MCP's resident preview service: it renders every
  screen in the app's inspector/PreviewRegistry.kt headlessly (real DI, theme, data),
  serves a self-updating gallery at a local URL (pixels + wireframe + a11y per screen),
  and watches composeApp/src so every save re-renders automatically. The agent's loop is
  edit → preview_status {waitForRender:true} → changedLastRender / compile errors →
  preview_diff {screen} for a proven verdict — pixels flow to the human, structure flows
  to the AI.
---

# cmp-preview — live previews of real screens, zero commands

Your job: give the human a **live gallery URL** of their app's real screens and keep it
current while they (or you) edit code — and use the structural side of the same render
to verify changes. Nobody runs Gradle by hand; the MCP service owns the loop.

## The one-call flow

1. **`preview { projectDir }`** (cmp-inspector MCP) — starts (or reuses) the resident
   service. It:
   - renders every `inspector/PreviewRegistry.kt` entry headlessly via the app's
     generated `:composeApp:renderScreens` task (real Koin DI, real theme, real data);
   - serves the live gallery at the returned `url` (default `http://127.0.0.1:9600/`);
   - watches `composeApp/src/**` — every save re-renders (debounced, serialized) and the
     page reloads itself via SSE, with changed screens flagged `CHANGED`.
1b. **Phase 2 runs automatically (`hot`, default true):** the service boots a resident
   preview daemon under Compose Hot Reload (`hotRunDesktop
   --mainClass=<pkg>.inspector.PreviewDaemonKt --auto`, JBR auto-provisioned). Saving a
   file recompiles incrementally and hot-swaps classes INTO the running JVM; renders go
   through the daemon's loopback `/render` — measured on a real app: **~900ms for one
   screen, ~7s for all seven, ~10s save→gallery-shows-the-change** (vs 25–40s per change
   on the task path). If the daemon can't boot (no dev-client feature/hot-reload plugin,
   no JBR) the service transparently stays on the Gradle path — same gallery, slower loop.
2. **Hand the human the `url`** (open it for them if you can, e.g. `open <url>` on
   macOS, or the host's browser surface). That's their whole workflow: edit → save →
   watch the gallery update. First render includes a Gradle compile (tens of seconds);
   warm saves re-render in a few seconds.
3. **You work structurally** — after every edit, ONE call:
   `preview_status { waitForRender: true }`. It blocks until the render (or the
   recompile) finishes and returns `changedLastRender` (empty = your edit reached no
   screen), `lastError`/`lastErrorSource` (`"compile"` = your edit didn't even build —
   the daemon surfaces hot-recompile failures, you are NOT flying blind), and
   `screens: [{ id, nodes, tokenized, tagged, a11yPass, a11yViolations,
   lastChangedVersion, tree, png }]`. No HTTP polling, no sleeps. Assert deeper on the
   `tree` paths with the inspector tools (`get_node`, `assert_token`) — never read PNGs.
4. **`preview_stop {}`** when the session is done (the Gradle daemon stays warm — good).

## The verified edit loop (with the gallery open)

1. `preview { projectDir }` → human watches the gallery.
2. Edit code → `preview_status { waitForRender: true }` → the result names the changed
   screens or carries the compile/render error.
3. `preview_diff { screen: <a changed id> }` → prove_change verdict (`proven-clean` /
   `changed-with-regressions` / `no-change`) between the last two renders — the service
   keeps the previous generation, so there is NO snapshot bookkeeping. The human sees
   the same change land visually: CHANGED flag, hover-to-compare before/after, and a
   persistent "changed #N" badge per card.
4. For baselines that must survive sessions (goldens), keep using
   `snapshot_save` + `prove_change { before, after }`.

Single-screen warm renders: `render_screen { projectDir, screen }` goes through the
running daemon automatically (`via: "daemon"`, ~1s) and falls back to the Gradle task.

## State variants (the Storybook "story" analog)

A screen in a forced UI state is just another registry entry with a derived id:
`ScreenPreview("home@empty", "Home — empty") { … }` hosting the screen with that state
(a state-first overload, or preview-only fakes). Loading/empty/error states then render
side by side with the default seeded state — same gallery, same selectors, same goldens.

## Troubleshooting

- **"does not look like a create-cmp app"** — `projectDir` must contain `composeApp/`.
- **renderScreens task missing** — the app predates project previews (scaffolded before
  create-cmp 0.6). Re-stamp, or port the harness: `inspector/PreviewRegistry.kt` +
  `PreviewHarness.kt` + `PreviewSemanticsJson.kt` (desktopMain) + the `renderScreens`
  task — see the template or the cmp-upgrade skill.
- **First render slow / red banner "render FAILED"** — the banner carries the Gradle
  error and the gallery keeps the last good state; fix the compile error, save, it
  recovers on the next cycle.
- **Broken edit in daemon mode** — a failed hot recompile produces no render, but it is
  NOT silent: when a save yields no reload within ~20s the service runs its own compile
  check, so the compiler's `e:` lines land in `lastError` with
  `lastErrorSource: "compile"`, any pending `waitForRender` resolves with them, and the
  gallery pill shows "compile failed". Expect that verdict to take ~20–40s (watchdog +
  compile); a successful edit settles much sooner. `lastActivity` tells you what the
  service last saw (src-change / compile-failed / render-ok / render-stale) if you need
  to distinguish "quiet" from "stuck".
- **Daemon quirks** — the daemon listens on 9601; `preview_stop` shuts it down. Rarely, a
  hot swap can't apply a structural change (Compose Hot Reload limitation) — the daemon
  keeps serving pre-change renders; restart the preview to heal. DI-module edits
  (`appModules`) need a daemon restart too (Koin is started once).
- **Port busy** — the service probes upward from 9600 (or pass `port`). Calling
  `preview` again for the same project returns the running service's URL unchanged;
  a different `projectDir` stops the old service first.
- **Screen missing from the gallery** — it's not in `inspector/PreviewRegistry.kt`;
  add a `ScreenPreview` entry (tab entries are regenerated from `--tabs` at scaffold
  time; hand-added screens are yours to register).

## Related

- **cmp-inspect** — the full inspector: tier-1 live device (`connect_live`,
  `navigate_and_inspect`, `/inspect/remote` click-to-tap device view), token drift,
  golden trees. cmp-preview is the tier-0 daily driver; reach for cmp-inspect when you
  need the RUNNING app (real navigation state, on-device data).
- **cmp-dev-client** — the interactive hot-reload desktop window (`hotRunDesktop`);
  complementary: dev-client is one live clickable window, cmp-preview is stills of
  every screen at once, auto-refreshed.
