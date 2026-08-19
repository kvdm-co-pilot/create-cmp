# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.12.0] - 2026-08-19

### Fixed

- **The pre-release fleet check never actually read the evidence ladder it gates on.**
  `qa/lib/evidence-level.mjs` returns — and the receipt stores — an object
  (`{ rung, name, satisfiedBy }`); `scripts/fleet-check.mjs` read it as a bare string, so
  `String({...})` matched no rung, and every real receipt silently fell through to the
  legacy strength-parsing fallback. Its own test asserted the string form, so the reader
  could be wrong about every receipt ever written and stay green — found only when the
  0.12.0 release run printed "receipt names no evidenceLevel" against a receipt that
  named one perfectly well. Two consequences, both closed: the rung is now read from the
  field the ladder writes, and a receipt asserting **no** rung (`evidenceLevel: null` — a
  FAILed lane, or a `--fast` run) is no longer promoted by the fallback, which would have
  graded a fast receipt L1 off its empty `onDeviceSteps` list and handed the inner loop a
  rung the ladder explicitly refuses it. Only a receipt with no such key is legacy, and
  only it derives from strength.

- **A Java keyword in the package id stamped an app that could never configure.**
  `--package com.final.proof` passed validation (the schema pattern only proves the
  reverse-DNS *shape*), stamped a complete project, and then died at the first Gradle
  configure — `Namespace 'com.final.proof' is not a valid Java package name as 'final'
  is a Java keyword` — a raw Gradle stack for what is an input error, after the work of
  a full stamp. Found while running this batch's device pass. The engine now refuses any
  reserved-word segment at validation stage (a), before a single file is copied, naming
  the offending segment and suggesting the rename. Contextual keywords (`var`, `record`,
  `sealed`, `yield`) stay legal — refusing them would reject valid ids — and the errors
  merge into the schema's own list, so a config with two problems reports both at once.

- **The lane could fail Maestro before the app got a chance to be wrong.** `installDebug`
  returning 0 means the package manager accepted the APK — not that the device is ready to
  be driven. A reinstall over a running app briefly drops the emulator's adb transport;
  `adb devices` still says `device`, but Maestro's own adb client (dadb) gets `device
  offline` and dies before the first assertion. Reproduced deterministically on a real
  generated app: 4/4 failures whenever the live-inspector tier ran earlier in the lane
  (its port-forward traffic widens the window), 0/4 when it was skipped — a false red
  about the harness, never the app. `e2eSmoke` now settles adb between install and drive
  (`kill-server`/`start-server`/`wait-for-device`): wait-for-device blocks only while the
  transport is actually down, the kill/start pair clears the stale server-side transport
  entry, and no assertion is weakened.

- **`connect_live` lost real sessions to four conditions it can now heal itself.** The
  missing `adb forward` (the lane tears its own down), the debug app simply not running,
  the stale adb server transport (the client says `device offline` while `adb devices`
  says `device` — 4/4 false-red smoke runs in one session), and an app process replaced
  by a reinstall: each was a dead end that pushed agents back to raw adb. The handshake
  now heals in order — ensure a device is attached, ensure the forward (creating it IS
  ensuring it), poll health, launch the app if health is dead (applicationId parsed from
  the project's own `build.gradle.kts`/`create-cmp.json`, never hardcoded) and re-poll
  with bounded backoff, and on an offline-class error reset the adb server once and retry
  the whole sequence once. Every failure path names the stage that failed and the one
  command to run next — never a bare timeout — and the result's `healed` list says what
  it had to fix. `relaunch: true` absorbs the old `relaunch_app` verb, still proven by
  `processStartedAtMs` moving strictly forward, never assumed.

### Added

- **Runtime state control — the seam can now put the device INTO the state the claim is
  about.** A claim is provable when the test can reach the state it is about, and most
  escaped platform bugs escaped because the state was unreachable: nobody waits hours for
  Doze, ships to a user who denies the permission, or hopes the OS reclaims the process
  mid-test. TimeWarp (the clock) was the family's first organ and immediately made a
  thrice-shipped-unverified delivery claim provable; the template now ships the rest —
  `DozeControl` (forced light/deep idle), `PermissionControl` (the fresh-install denied
  state as a test input), `ProcessControl` (real OS-driven activity destruction and
  saved-state rebuild), `NetworkControl` (airplane mode, per-transport wifi/data), and
  `ConfigControl` (dark mode, font scale, per-app locale) — every shell command verified
  root-free from the shell uid on a stock user-build image, every bracket
  snapshot/act/restore-in-`finally`, every entry point emulator-gated through one shared
  guard (`Shell`, which also absorbs `AlarmAsserts.execShell`). The flagship exemplar
  composes two organs: schedule `setExactAndAllowWhileIdle`, force deep idle, warp past
  the trigger, watch the alarm arrive — the first proof the API's name keeps its promise
  (`RuntimeStateSeamTest`, with permission-denied and activity-reclaim exemplars beside
  it). The honesty ledger is part of the feature: each organ's header states what its
  state does NOT reproduce (forced idle skips the descent ladder and maintenance windows;
  revoking a held permission kills the holding process — verified live, and why no revoke
  bracket exists; `am kill` cannot reclaim the pinned instrumented process — asserted
  live in the exemplar so the claim can never rot; `settings put global
  always_finish_activities` alone is a runtime no-op — ActivityTaskManagerService reads
  it once at boot, verified live on API 35 — so the don't-keep bracket flips the LIVE
  flag through the same `IActivityManager.setAlwaysFinish` binder call the
  Developer-options toggle uses, under the shell's adopted permission identity, proven by
  re-reading the setting the call itself writes), and docs/TESTING.md and the cmp-audit
  question bank wire each organ to the questions it settles. The activity-reclaim
  exemplar earns its name literally: a nonce planted in the first instance's
  SavedStateRegistry must come back through the rebuilt instance's registry — the
  saved-state path observed, not inferred from a new instance existing.

- **Watch mode — the inner loop made resident, the way an IDE is.** A human's inner loop
  costs nothing because the IDE is always running: errors appear on save. An agent has no
  IDE, so it reaches for the heaviest thing labelled "done" after a five-line edit — the
  exact session-burning pattern the preview daemon already solved for rendering, and the
  most-adopted surface in the plugin because of it. `node qa/watch.mjs` (in every stamped
  app) extends that idea to verification: it watches `composeApp/src`, `specs/`, and `qa/`
  (never `qa/evidence/` or build output — watching your own output is an infinite loop)
  and re-runs the fast lane on every save, debounced at the preview daemon's proven 400ms
  so a multi-file save storm is ONE run and changes landing mid-run coalesce into exactly
  one follow-up, never a stack. Deliberately decoupled: it shells out to
  `node qa/verify.mjs --fast` rather than importing lane internals, so every fast-mode
  economy (step cache, scoped tests) is inherited for free and the step list can never
  fork. It is a fourth citizen of the marker protocol — it defers while
  `.cmp-lane-in-progress` or `.cmp-render-in-progress` is fresh (the collision class that
  once produced a 20+ bogus-failure `NoClassDefFoundError` cascade), and its own child
  stamps the lane marker, so two watch instances serialize through the same mechanism.
  And it is not a gate, by construction and by voice: fast receipts already earn no rung,
  the output is plain greppable lines for agent and human alike (failing step reasons
  verbatim, no cursor-control escapes), every run ends with the standing footer naming
  the real gate, and Ctrl-C exits 0 after killing any in-flight child and cleaning up the
  marker that child could no longer remove itself. `--once` runs a single coordinated
  pass for scripting; `--json` emits one NDJSON object per run.

- **Fast mode is now genuinely cheap — the inner loop stops paying the checkpoint's
  integrity tax.** `--fast` (below) skipped the device/release tier but still
  force-executed the entire JVM test tier four times over (`--rerun` on `unitTests`,
  `conformance`, `goldenTrees`, `a11y`) — ~70 seconds on a bare scaffold for a five-line
  edit, worse on a real app. `--rerun` exists for evidence integrity (Gradle's build cache
  can replay a PASS recorded against a different tree into a receipt), but a fast receipt
  has already declared itself non-evidence — mode `"fast"`, no rung, refused by the Stop
  hook — so the tax protected nothing. Three economies, all fast-mode-only, all reported
  honestly: **(1)** `--rerun` is mode-scoped — full runs keep it byte-identical, fast runs
  let Gradle's up-to-date checks stand; **(2)** the five pure-Node gates (`specCoverage`,
  `approvals`, `componentStories`, `reachability`, `archDoc`) memoize on a content hash of
  their declared input sets (`qa/lib/step-cache.mjs`, cache in the gitignored
  `composeApp/build/.cmp-step-cache.json`) and reuse an unchanged PASS as a visibly
  distinct `⚡ CACHED` verdict — only a PASS is ever reused, a FAIL always re-runs fresh,
  and the FULL lane never reads the cache (it only writes, so the next fast run benefits —
  the integrity property stays absolute, not "absolute unless a cache says otherwise");
  **(3)** fast unit tests scope to the working-tree change (`qa/lib/affected-tests.mjs`):
  changed `.kt` files map to `--tests "*<feature>*"` filters, with a mandatory
  blast-radius hatch (build files, DI, theme, shared components, `qa/` itself, anything
  outside `composeApp/src` → full suite) and fail-open on every uncertain case — no git,
  unmappable change, a filter that matches no tests. The receipt records exactly which
  filter ran (`affected: *home* — 1 changed source file(s)`), so a subset can never
  impersonate the suite; false negatives are tolerable only because the full, unfiltered
  lane still decides done. Measured on a fresh scaffold: 121s cold → 32s unchanged →
  34s after a one-line ViewModel edit (11 of 45 tests, scoped), full lane unchanged.

- **`--fast` — the inner loop the lane never had, and green that cannot lie about being
  done.** The lane had exactly one mode: every configured step, every run. A one-line edit
  paid for the whole device/release tier — the R8 release compile, the emulator, Maestro,
  the instrumented suite — every single time, which made the harness unusable for
  iteration and is exactly how a done-gate teaches people to route around it.
  `node qa/verify.mjs --fast` now filters that tier out of whatever profile resolved
  (`releaseBuild` plus every `DEVICE_STEPS` entry — `tokenDrift`, `e2eSmoke`,
  `androidChecks`, `releaseSmoke` — derived from the same constant, so the two lists can
  never drift apart), unconditionally, device attached or not; the desktop tier still runs
  in full. And the loophole is closed at the receipt, not by convention: a fast receipt
  records `"mode": "fast"`, derives **no** evidence rung (the ladder returns null for
  fast, always), and `qa/receipt-check.mjs` — the Stop hook, CI, and pre-push alike —
  refuses it by name: "the last verify run was --fast (inner-loop only); run the full lane
  (`node qa/verify.mjs`) before finishing". Loud banners at start and verdict say the same
  thing in-band, and the template's Bash reminder hook now nudges a bare
  `node qa/verify.mjs` toward `--fast` for iteration — allow-only, silent whenever
  `--fast` is already present. Fast green is a signal; done still costs the full lane,
  exactly once.

- **One device, one driver — the lease that makes the scarce resource safe by
  construction.** Agents parallelize; that is what they are for. An orchestrator ran three
  subagents concurrently, two of them gated on device evidence, and the machine's ONE
  emulator did what a shared mutable resource always does under concurrent writers: wedged
  adbd, `device offline` while `adb devices` swore everything was fine, app state crossed
  between sessions, false-red runs — every symptom already written up in this repo's own
  retrospective, now reproduced by parallelism nobody can be asked to remember not to use.
  The existing mutual exclusion (`.cmp-lane-in-progress`) was per-PROJECT while the device
  is machine-GLOBAL: a scratch app in /tmp and the real app each stamped their own marker
  and neither saw the other. The primitive now matches the resource:
  - **A machine-global, per-serial device lease** (`<tmpdir>/create-cmp/device-leases/
    <serial>.json` — pid, holder label, project root, acquiredAt; atomic write with
    last-writer-wins detection; a dead pid or a 30-minute age reclaims silently, so a
    crashed run never wedges the machine). Implemented twice against one documented
    contract — `template/qa/lib/device-lease.mjs` (acquirer, ships in every stamped app)
    and `inspector/mcp/src/lib/device-lease.mjs` (check-only reader) — because the two
    codebases ship separately; each header points at the other, and an engine parity test
    is the drift guard.
  - **Every device-touching lane step leases first** (`tokenDrift` live tier, `e2eSmoke`,
    `androidChecks`, `releaseSmoke`) — acquired once by the first device step, held to
    lane exit. **Contention is a SKIP, never a FAIL**, naming the holder, its pid, root,
    and age: nothing is broken, another run holds the device, and the evidence ladder
    already prices that honestly — a SKIPped device step buys no rung, so contention
    visibly degrades L2 to L1 instead of corrupting a receipt.
  - **The live tier checks, and never holds**: `connect_live` refuses a leased device at a
    named stage (`lease`) with the holder spelled out — "a lane is driving this device
    right now", not a mysterious transport error — and `navigate_and_inspect` re-checks
    per tap, because a lane can start mid-session. Holding for a whole console session
    would starve the lane; the decision and its reasoning are written into the reader.
  - **The deterrent**: the template's Bash reminder hook now also fires on hand-driven
    device evidence (`connected*AndroidTest`, `maestro test`, `adb install`/`uninstall`) —
    allow, never deny, ad-hoc debugging stays possible — saying what the lane already
    encodes: device evidence is lane-owned and batched, a checkpoint, never an inner loop.
- **The harness now notarizes itself before it ships.** 0.11.0's headline bug — the release
  build had never once been run — and this batch's hand-run equivalent (stamp a scratch app,
  run its full lane, read the receipt by eye) are now one script: `scripts/fleet-check.mjs`
  stamps a real app from the current tree into a temp dir, runs the app's own
  `qa/verify.mjs` inside it, and asserts the evidence receipt — verdict PASS at rung
  `--min-level` or better (L1 desktop by default; rises to L2 on its own when `adb devices`
  shows a device, because desktop-only green with an emulator sitting attached is
  under-claiming). On failure the scratch app is kept and its path printed; the release
  skill runs the check between the safety gate and the version bump and stops dead on red.
  A notary caught overclaiming is dead — this is the anti-overclaim gate pointed at the
  notary itself.

- **The tier that could not see androidMain.** Across two real apps built on this template,
  the single biggest escaped-bug class was Android platform semantics — alarms that never
  rang, notifications that never posted, a silent phone that stayed silent, two logical
  alarms quietly sharing one PendingIntent slot. Nine defects, several latent across
  multiple releases, and every desktop tier was green the whole time: `desktopTest` is a
  JVM, golden trees are structure, the conformance suite is static, and the Maestro smoke
  taps UI without asserting anything about the shade or the alarm table. The template now
  ships the seam that one of those apps had to hand-build (and which caught two bugs the
  week it landed), generalized:
  - **`androidInstrumentedTest` source set** wired into the KMP build (runner, androidx.test
    core, UiAutomator, JUnit ext in the catalog; `AndroidJUnitRunner` as the entry point),
    with generic behavior-assertion helpers — `NotificationAsserts` (bounded-poll
    wait-for-posted, channel-exists with an importance floor, full-screen-intent capability
    across the API-34 permission split), `AlarmAsserts` (a tolerant `dumpsys alarm` parse
    plus assert-registered and assert-N-distinct — the mechanical form of the
    PendingIntent-identity collision), and `SystemState` (snapshot/restore of ringer/DND,
    honest in its header about what only a manual tier can verify). The exemplar
    `PlatformBehaviorSeamTest` boots the real app (real Android Koin graph — the thing
    desktop DI fakes can never prove) and demonstrates the alarm-slot collision live.
  - **`androidChecks` — a verify-lane step** running `connectedDebugAndroidTest` (with the
    same adb settle and `--rerun` evidence stance as its siblings). It follows local's
    documented contract — device presence is the opt-in, no device is an honest SKIP — and
    the receipt's strength line now names it, so an on-device green is a different claim
    than a desktop-only one, visibly.
  - **The `release` profile** — everything `ci` proves plus `releaseSmoke`: install the
    release APK and drive the same Maestro smoke against it, because two real bugs were
    findable only by *running* what R8 produced, not compiling it. Profile-tiered by
    decision: per-change lanes stay as fast as today, and the release-variant behavior cost
    lands once, at ship time. A template-fresh app with no keystore SKIPs naming exactly
    what to configure, and the debug-over-release signature conflict surfaces as an
    actionable `adb uninstall` message instead of a raw Gradle error.
  - The stamped feature-spec skeleton now says where platform-behavior clauses get their
    citation (an instrumented test, never a desktop one); `docs/TESTING.md` carries the
    tier's what-belongs/what-doesn't/cost-model contract.
- **`schemaHistory` — a verify-lane step that keeps shipped Room schemas shipped.** Room's
  `exportSchema` output looks like harmless build noise, so nothing stopped a regeneration
  from quietly rewriting `composeApp/schemas/**/<version>.json` files that a released
  database had already been built against — corrupting the exact bytes future migrations
  are validated with, invisible until a real user's upgrade fails. The step freezes
  history: every version below the current highest must be byte-identical to `HEAD`
  (restore with `git checkout -- <file>`); the current highest — the live schema — stays
  free to change, because that IS the current change. No schemas directory (feature off,
  or never built) and no git history both SKIP honestly.
- **ARCH-13 — inject the clock.** Ambient time reads (`Clock.System`,
  `System.currentTimeMillis`, `LocalDate.now()` and friends,
  `TimeZone.currentSystemDefault()`) make rendered structure and test evidence a function
  of *when* you run them — a golden tree that passes at 23:00 and fails at 09:00 with no
  code change, and no seam for a test to pin. The conformance gate now bans those APIs in
  `commonMain` outside a designated `core/time` provider package; time arrives everywhere
  else as an injected value. The template itself carries zero time usage, so the rule
  lands green and exists purely to protect the thousands of apps stamped from it.
- **ARCH-14 — explicit ViewModel factories; `viewModelOf` is banned.** Koin's
  reflection-based `viewModelOf` silently ignores Kotlin constructor default parameter
  values: a ViewModel that compiles and previews fine crashes at runtime resolution the
  first time a defaulted parameter matters, because the default was masking a dependency
  the graph never registered. Explicit `viewModel { XViewModel(get(), …) }` factories
  state every dependency and fail at compile time instead. The exemplar's registration
  and the `add-feature` stamper both switched to the explicit form — the stamper clones
  the registration from the configured exemplar's own factory line, so the `get()` arity
  always matches the cloned constructor. Shared-vs-per-destination ViewModel *scope*
  stays an intent decision no static rule can make; `docs/ARCHITECTURE.md` now carries
  the advisory note instead of a gate.
- **The capability contract — a missing inspector is a fault to report, never a silent
  downgrade.** An entire production app was built in one long resumed session that began
  before the plugin was enabled; MCP servers attach at session start, so the inspector
  tools were absent for the app's whole life — the agent probed for them 24 times, found
  nothing, and quietly spent the build on 113 raw screenshots and 190 blind adb taps,
  because the docs legitimized the fallback without ever demanding a diagnosis. Every
  MCP-dependent skill (cmp-preview, cmp-inspect, cmp-test) now opens with the same
  contract: confirm the tools resolve before the first call; if they don't, STOP and
  report which fault it is — plugin disabled, session older than the plugin's enablement
  (only a session restart can fix that; no in-session retry ever will), or a stale/broken
  plugin copy — and only then use the degraded path, naming what it costs (structured
  trees and change proofs replaced by pixels). The generated CLAUDE.md's "Without the
  plugin" paragraph got the same demotion: fault-and-report first, the gradle fallback
  explicitly labeled as the degraded path for environments where the plugin genuinely
  cannot exist.
- **cmp-doctor grew an inspector-MCP check group.** Four checks the engine cannot run for
  you, so the skill has the agent run them directly: are the tools resolvable in THIS
  session; is the plugin registered and enabled in the settings files; is the marketplace
  copy stale (`~/.claude/plugins/marketplaces/<name>` is a git clone that never
  auto-updates — one sat three weeks behind its source with nothing surfacing the drift;
  the doctor now reports "N commits behind" with `git -C <copy> pull` as the
  always-works fallback); and does the bundled server answer a JSON-RPC initialize
  handshake. Plus two field lessons as notes where they belong: the stale-adb-server
  symptom (`adb devices` fine, automation clients get `device offline` →
  kill-server/start-server) and per-app AVD isolation (one shared emulator across apps
  crosses their data and wedges adbd — one AVD per app, named after the app).
- **`cmp-audit` — the adversarial audit that found six latent defects, as a repeatable
  verb.** One human-triggered "double check for bugs" request surfaced six notification
  defects, several latent across releases — because someone finally asked the platform's
  questions instead of the spec's. The new skill encodes that method generically: scope
  one subsystem, read its spec + implementation across ALL source sets (androidMain is
  where JVM tests are blind) + its tests, then interrogate against a platform-semantics
  question bank — identity (PendingIntent equality ignores extras; tag+id collisions),
  lifecycle (reboot, process death, DST), cancellation symmetry, delivery (channel
  off-switches, stream routing, exactness windows), delivery-time state re-ask, permission
  gates, and coverage arithmetic ("the re-check covers N of M" — force the count). The
  discipline is the part that made the original audit work and is non-negotiable:
  evidence-or-silence (file:line + concrete failure scenario or no finding), a refuter
  pass before reporting (only survivors, marked CONFIRMED or PLAUSIBLE), convert-or-cut
  (spec amendment + failing-test-first proposal, or a named human decision). Findings
  feed the change flow — never direct unreviewed fixes to signed artifacts.
- **specCoverage now sees tiers, not just citations.** A clause about platform behavior
  cited only by a desktop test is a claim nothing that runs on a device has ever checked —
  and until now the coverage scan couldn't tell you which clauses those were. Every
  citation now records the tier of the file that carries it (commonTest / desktopTest /
  androidInstrumentedTest / e2e, derived from the citing path), and the lib derives the
  one-line summary — "N clauses cited only from desktop-tier tests" — as report data.
  Deliberately visibility-only, no new failure mode: instrument before you police.

### Removed

- **13 MCP tools nobody ever called — the surface now matches the flow** (28 → 15 public
  tools, `docs/proposals/agent-flow-retrospective.md` §5). Across two full production
  builds, 15+ of the 28 cmp-inspector tools logged **zero calls**: the verify lane had
  already won every one of those jobs, and the unused twins were pure prompt weight and
  choice noise. Every removed verb's job has a named owner, no capability lost:
  `get_node`, `render_tree` and `layout_gaps` folded into `inspect_tree` as options
  (`testTag` for one subtree, `format:"wireframe"` for the SVG, `includeLayoutGaps` for
  the spacing report); `assert_token`/`find_drift`/`diff_against_design_system` belong to
  the lane's `tokenDrift` step and `audit_a11y` to its `a11y` step;
  `snapshot_save`/`snapshot_diff` to `preview_diff` (session-scoped) plus the lane's
  `goldenTrees` (durable); `prove_change` to `preview_diff` + `navigate_and_inspect`;
  `capture_screen` to `render_screen {kind:"live"}` and the `/inspect/remote` live view;
  `relaunch_app` became an internal move of `connect_live` (`relaunch:true`); `db_schema`
  to the Room schema JSONs already sitting in the repo. The registry test now pins the
  surviving set EXACTLY, so a tool can neither vanish nor leak back unnoticed; the
  orphaned internals (`findDrift`, `assertToken`, the atomic capture verb, the
  catalog/instrumented-tree resolvers, `fetchLiveDbSchema`) went with their tools.

### Changed

- **The preview-vs-test build-dir collision: investigated, guards confirmed, the residual
  constraint written down.** The incident — a standalone preview daemon compiling into
  the same Gradle output dirs as a concurrent `desktopTest`, 20+ bogus
  `NoClassDefFoundError` failures — was re-examined against the shipped coexistence
  machinery. The clean isolations aren't reachable from the inspector alone: Gradle has
  no CLI-level way to give one invoker a separate output dir without build-script support
  (template work), and a shared invocation queue can't capture a hand-typed `./gradlew`.
  What ships already serializes every *managed* invocation both ways — the lane's
  `.cmp-lane-in-progress` marker defers renders, the preview's `.cmp-render-in-progress`
  marker (stamped for the resident daemon's whole lifetime) defers the lane's `shGradle`,
  KSP collisions self-heal, and transient classpath races defer-and-retry instead of
  failing. The one uncovered path — an ad-hoc `./gradlew desktopTest` typed around the
  lane while a daemon is up — is now documented in the inspector README with the
  operator's way out (stop the daemon, or run tests through the lane); making hand-typed
  Gradle coordinate too needs template-side build logic and is reported as template work,
  not bolted on here.

## [0.11.0] - 2026-08-03

### Fixed

- **The release build, which had never once succeeded.** `assembleRelease` failed three
  ways on a generated app, none of them visible from a green debug lane, and every one of
  them waiting for the first person who tried to ship:
  - `BuildConfig` is generated **per build type**, and the Firebase-emulator constants were
    declared only in `debug`. `release` could not compile — `Unresolved reference
    'FIREBASE_EMULATOR_HOST'`. The `if (!USE_FIREBASE_EMULATORS) return` guard is a runtime
    check and does nothing for a missing compile-time symbol. Both build types now declare
    the same fields.
  - R8 aborted on GitLive Firebase's RemoteConfig, which references `kotlinx.datetime.Instant`
    — a class this version set no longer has (Kotlin 2.2 moved it to `kotlin.time.Instant`).
    Suppressed with two `-dontwarn` lines: RemoteConfig is not wired up, so nothing reaches
    the reference, and adding kotlinx-datetime back would put two `Instant` types in the graph.
  - `lintVitalRelease` crashed — AGP's `NullSafeMutableLiveData` detector throws
    `IncompatibleClassChangeError` against this Kotlin version. That one check is disabled
    (the template has no LiveData at all); the lint gate itself stays on.

  Proven end to end: a 15 MB minified APK (down from 33 MB debug) installs and runs — Room
  seeds, Koin resolves, navigation and reactive state all behave under R8.

### Added

- **`releaseBuild` — a verify-lane step, so this cannot rot again.** `assembleDebug` passing
  says nothing about `assembleRelease`: R8 and `lintVital` only run on the release variant,
  and `BuildConfig` differs between them. Runs in `local` and `ci`, deliberately not in
  `scaffold` (stamp-time `--verify` promises a green first build; an R8 pass would add
  minutes to every scaffold). Unsigned — signing needs a keystore, which belongs to whoever
  ships the app.
- **The console protocol — one wire, whoever started the process**
  (`docs/proposals/console-protocol.md`). The seven console-backed MCP tools
  (`preview_status`/`waitForRender`, `preview_diff`, `snapshot_variant`, `approval_status`,
  `review_comments`, `resolve_comment`, `preview_stop`) gated on an in-process service
  object — so against the standalone console (the recommended setup since the same day's
  detachment) they answered "No preview service is running". Now the console exposes eight
  thin routes over its existing HTTP server (long-poll waits in the tools' own
  block-then-snapshot shape; `preview_diff` computes SERVER-side, where the previous tree
  generation lives) and the tools speak HTTP **always** — including to a console this
  process started (Docker's model: one path, no in-process fast path to drift).
  `preview_stop` is the deliberate exception: it refuses to stop a console another process
  serves — an agent tool must not close the human's window; `bin/console.mjs --stop` is the
  human's verb. Proven end-to-end: a fresh MCP server adopted the standalone console
  (build-id match confirmed) and ran the previously-gated tools against it.

### Fixed

- **A reopened artifact explained nothing.** The console showed a `reopened` row as a badge,
  a hash and a timestamp — unreadable unless you already knew which files the artifact
  governed and why its signature had been walked back ("I see 1 in redesign, I have no idea
  what that means or where I can see the changes"). The change surface every drifted row
  gets (`driftPanelHtml` — files changed, files still exactly as signed, the anchored diff
  against the signed bytes) was never rendered for it, and `anchoredDiffs` was not even
  computed. The drift/redesign asymmetry belongs to the **gate** (drift FAILs, redesign
  SKIPs); applying it to the **display** was the error — "what moved since I signed this" is
  the same question with the same answer either way, and a sanctioned redesign is precisely
  the one a human is being asked to re-sign. A reopened row now renders that panel, headed
  with who walked the signature back, when, why (or that no reason was recorded, for rows
  predating the reason-required rule), that the lane is not failing over it, and what the
  human is being asked to do.

- **A count with no referent.** The governance strip said `1 in redesign` — a digit naming
  no artifact and offering no way to reach it. A category holding exactly one artifact now
  names it (`in redesign: Feature design (meal — …)`), and every non-zero count is a jump
  button landing on the Approvals row that explains itself.

- **A signed row displayed a hash nobody signed.** Every approved-row display — the console
  section header, the artifact card, `qa/approve.mjs --status` — printed the LIVE recompute
  (`hash`) labelled "signed", not the hash the signature was actually bound to
  (`storedHash`). The two are equal for everything signed on the current basis, which is why
  it went unseen; they legitimately differ on a legacy feature brief signed before
  `cmp:feature` block-stripping, where the permanent raw-bytes fallback still vouches for
  byte-identical content. On the showcase, `feature-brief:meal` therefore read `signed
  e6dfb40b` — a value that appears in no signature, in the one surface whose entire job is
  provenance. All three now read `storedHash`, and `resolveArtifactStatus` marks the
  tolerance path it took (`hashBasis: "raw-bytes"`, emitted only when it fires) so the row
  explains its own stored≠live rather than reading as tolerated drift: *signed pre-strip —
  bytes unchanged since*. No gate behaviour changed; an older project-side library that
  never sets `hashBasis` simply renders the signed hash with no note.

- **A busy console read as a dead one.** `findLiveConsole`'s liveness probe fetched `/` —
  the full gallery page, which derives the whole governed surface — with a 2s budget; under
  boot-time load it timed out, the one-console-per-project guard let a second service
  start, and that service overwrote and then deleted the real console's registry record
  (observed live during the protocol proof). The probe now hits `/status` — constant-cost
  JSON. A liveness probe must cost the server nothing, or load defeats it.

- **The console's build handshake — a process that knows whether it is stale**
  (`docs/proposals/console-build-handshake.md`). Twice in two days a long-lived console
  served a page built from an older module graph while the rebuilt code sat on disk, and
  the only way to detect it was grepping the fetched HTML for a marker string. Now the
  console reports the build it LOADED (`src/lib/build-id.mjs` — the same sources+deps hash
  the bundler already stamps as `cmp:bundle-inputs`, moved down so the service and the
  bundler share one definition), recomputes what is on disk, and the difference is
  staleness — derived, never claimed. Surfaced three ways: `build` on `/status`, the
  console build id in every page's provenance footer, and a **drift-red banner above the
  page** when stale, carrying the command that fixes it. `stale` is tri-state: unknown
  freshness renders as neither a warning nor a clean bill of health.
- **The studio console as a standalone process** (`inspector/mcp/bin/console.mjs`), with
  `--status` and `--stop`. The console used to be hosted inside the MCP server process — a
  child of the agent process, which the desktop app respawns routinely (three MCP server
  pids in one working day). Every respawn killed the console under the human's cursor.
  A detached process survives them; the lifecycle verbs exist because a detached process
  without them is litter by construction (an orphaned console ran for a day). `preview`
  already adopts a console another process is serving — it now also compares build ids and
  **warns instead of silently adopting one running different code**.

### Fixed

- **The console's connection pill could never recover.** `es.onerror` wrote "disconnected"
  and nothing ever wrote "live" back, so a one-second blip looked permanent even after
  `EventSource` silently reconnected — a direct cause of "the studio keeps getting
  disconnected". It now distinguishes *reconnecting…* (the server blinked; retry pending)
  from *server gone* (CLOSED), and restores *live* on every reconnect.

- **The governance journal (2026-07-28 flow audit, fixes 1–4).** The holistic audit of the
  post-genesis flow — triggered by a signer returning to a "reopened" artifact with no way to
  learn what happened — found five root causes; this wave closes four mechanically:
  - *Memory:* `qa/approvals.log.jsonl`, an append-only journal beside the mutable snapshot —
    one line per approve / reopen / accept with `{at, verb, artifact, via, reason?}`.
    `qa/approve.mjs --log` prints it. Excluded from the verified surface like
    `qa/comments.json`, so recording history never invalidates a receipt.
  - *Attribution:* `--reopen` now REFUSES without `--reason` — a reopen walks back a
    signature, and `via` + `reason` land on the ledger row (outside the inputs-hash
    projection) and in the journal. The console's Reopen buttons prompt for the reason; the
    signature bar, Approvals row, and feature-card stamp read it back.
  - *The derived split:* `reopened` covered two opposite situations. Now `reopened` +
    `provenDone` derives "redesign proven — re-approve" (owner: human, ENTERS the guided
    queue); an unproven redesign stays the agent's (out of the queue). One derivation
    (`deriveHumanQueue`) feeds the queue, the guided prompt, and the strip — resolving the
    doc-of-record's own contradiction (next-step table vs queue-exclusion note).
  - *One change, one record:* `--reopen-feature <name> --reason "…"` reopens the brief + its
    spec + its design + every declared `touches` artifact as one grouped change.
- **The governance strip.** Rail-resident, visible on every console tab: derived counts
  (*N signed · M await you · K in redesign · J drifted*), the single next human act as a
  jump button, and History — the journal's recent events with each reopen's reason.
  Refreshes on the same SSE events as the panels.

- **Reachability lane step (FI-7, AUTONOMY-GAPS §3).** A real feature passed clause coverage,
  conformance, goldens, a11y, and on-device smoke — and was accepted — while nothing in the
  navigation graph referenced its screen. `qa/lib/reachability.mjs` closes that shape of false
  green: a `presentation/<feature>/*Screen.kt` whose `*Screen`/`*Route` entry composables are
  referenced nowhere in commonMain outside the feature's own directory fails the lane, in the
  `scaffold` and `local` profiles both. Preview-registry (desktopMain) references deliberately
  do not count. The escape hatch is a declaration, not a gate bypass: `{ "unrouted": true }` in
  the brief's `cmp:feature` block.
- **`qa/verify.mjs --help`, and unknown arguments are refused by name (AUTONOMY-GAPS §6).**
  Previously any unrecognized flag silently started the full multi-minute lane. Same
  refusal-over-fabrication stance as `qa/approve.mjs`: usage on `--help`/`-h` (exit 0), exit 2
  naming the argument otherwise.
- **Renderer health is a first-class signal (FI-9, AUTONOMY-GAPS §5).** The preview service
  tracks every render attempt (`lastOutcome`, `lastSuccessAt`, `lastAttemptAt`,
  `consecutiveFailures`) and surfaces it in `/api/status`, the `preview_status` MCP tool, and
  an amber console banner ("Renderer down since … — screens below are stale") distinct from
  the red compile-error banner. A dead renderer behind an HTTP 200 can no longer pass for
  healthy.

### Fixed

- **Ledger writes no longer destroy the evidence they depend on (FI-8, AUTONOMY-GAPS §2).**
  `qa/comments.json` left the verified surface (comments are advisory; no lane step reads
  them), and `qa/approvals.json` is now hashed by gating-field projection — `artifact`,
  `status`, `hash`, `exemplarFeature` — so acceptance bookkeeping (`accepted`, `acceptedAt`,
  `via`, `mode`, timestamps) never invalidates a receipt. Clicking Accept on a provenDone
  feature used to instantly re-red the lane for a tree whose code had not changed.
- **The scaffolder no longer ships a feature it does not wire.** With a config that omits a
  shipped default tab (`--tabs "Home:home"`, say), `rewriteNavHost` correctly dropped
  `profile`'s import and its `appTabs()` entry and the preview registry dropped its preview —
  but `presentation/profile/` stayed on disk, wired to nothing. The new reachability step
  then FAILed such a scaffold at `create-cmp --verify` time, honestly: it was dead code.
  `rewriteTabSurfaces` now removes the unconfigured feature. `profile` is the only strippable
  one (a self-contained stub: one file, no ViewModel, no clauses, no DI entry, no tests).
  **`home` is deliberately never stripped** — it is the governed exemplar the genesis walk
  approves and `qa/scaffold-feature.mjs` clones, and it owns `DetailScreen`, which the nav
  graph registers unconditionally, so it stays genuinely reachable with no tab of its own
  rather than being exempted by declaration.
- **Screens outside the shell are now visible to on-device automation.**
  `Modifier.exposeTestTagsForAutomation()` was applied inside `AppShell`. That property is
  inherited by descendants, so it covered the tabs and nothing else: every destination
  registered directly on the NavHost (the template's `detail/{itemId}`, and any tray or
  full-screen flow a project adds) had testTags no id-selector could see, making those
  screens untestable end-to-end. Moved to the `NavHost` itself in `AppNavHost.kt` — the
  actual graph root — so every destination inherits it, including ones added later.
- **A signed brief's machine-read block is no longer part of the signed bytes (AUTONOMY-GAPS
  §1).** Feature-brief hashes strip the `cmp:feature` declaration block before hashing (the
  `architecture` artifact's `cmp:generated` precedent), so adding `"screens": true` or
  `"unrouted": true` to a signed brief never manufactures a human re-approval. Legacy
  raw-bytes approvals keep verifying unchanged content via a strictly-stronger byte-identical
  fallback.
- **The preview daemon and the verify lane coordinate in both directions (FI-9, AUTONOMY-GAPS
  §4).** The daemon now stamps `composeApp/build/.cmp-render-in-progress` (mtime-refreshed on
  activity) for the duration of its Gradle work, and the lane's `shGradle` waits for it to
  clear or go stale before launching its own Gradle command — the symmetric half of the
  DF-4 lane marker the daemon already respects. Ad-hoc Gradle runs outside the lane remain
  uncoordinated; pause the daemon or expect the self-heal retry.

## [0.10.1] - 2026-07-24

### Fixed

- **The plugin's MCP server now actually starts (P1).** `cmp-inspector` — the preview loop, the
  inspector, the studio console — had **never** been able to run from a marketplace install.
  The Claude Code plugin is distributed as a git clone into `~/.claude/plugins/cache/`, nothing
  runs `npm install` there, and `inspector/mcp` is a separate package: the server died on
  `ERR_MODULE_NOT_FOUND` for `@modelcontextprotocol/sdk` before serving a single tool. It only
  ever worked from a repo checkout, where `node_modules` happens to exist — which is why no test
  and no amount of local use ever caught it. The server is now bundled to one self-contained
  ~1.4 MB file (`inspector/mcp/dist/server.mjs`, esbuild), committed because the clone IS the
  distribution, and `.mcp.json` launches that. Verified by booting it in a directory with no
  `node_modules` anywhere above it: 28 tools served.
- **The bundle attests its own inputs, so it cannot silently go stale.** A committed build
  artifact drifts the moment someone edits a source and forgets to rebuild — and every plugin
  user would then run yesterday's server while the repo's tests pass against today's source. The
  bundle carries a `cmp:bundle-inputs` hash of every source, the declared dependency versions,
  and the inlined version (the receipt idea, applied to a build artifact); `npm run check:bundle`
  and a test fail with the exact rebuild command when they diverge. Proven by editing a source
  without rebuilding and watching the gate fail, then pass again on restore.
- **The bundle no longer reads a sibling `package.json` for its version** — inlined at build time,
  since a bundle that needs files arranged around it is not self-contained.

## [0.10.0] - 2026-07-24

The first full dogfood run (the Fuelled showcase, rebuilt end-to-end on 0.9.0 —
`docs/DOGFOODING-FINDINGS.md`) is folded back into the harness.

### Fixed

- **The live-session chain reports readable step details (P2), and is testable at all (P1).**
  Driving the console's own Start-live-session chain surfaced `forward` reporting
  `detail: "[object Object]"` — the step handed back its `exec` result and `String()` did the
  rest. Details now degrade sensibly (string → stdout → nothing, never a stringified object) and
  `forward` names the port pair it bound. The deeper issue: `createLiveSession` took no
  injectable fetch, so its `health` step always hit the real loopback inspector on the
  machine-global port — the same isolation trap that let a foreign preview daemon be adopted, and
  the reason this file had no tests. `fetchImpl` is now threaded through, and the chain has
  coverage: step order, readable details, stop-at-failure with the device's own error preserved,
  double-start refusal, and the unreachable/transient/HTTP-error paths of the health probe.
- **CI installs `inspector/mcp`'s dependencies (P1).** `inspector/mcp` is a separate package, not
  a workspace, so the root `npm install` never reached it while `node --test` still discovered its
  tests — `server-tools.test.mjs` died on `ERR_MODULE_NOT_FOUND` and `main` had been red since
  2026-07-20, through the 0.9.0 release. It also meant the local suite was not the gate CI ran.
- **The receipt no longer corrupts the first path in `commit.dirty` (P1).** `commit.dirty` was
  parsed from `tryGit("status --porcelain")`, whose `.trim()` eats the leading space of an
  unstaged-modification line (`" M path"`); the fixed `slice(3)` then swallowed that path's first
  character, so every receipt whose first dirty line was an unstaged modification named a file
  that does not exist. A `tryGitLines()` helper strips only trailing newlines; `tryGit` keeps its
  trim for the single-line callers that need it.
- **The preview service no longer adopts another project's daemon (P1).** The daemon port is
  machine-global: with two checkouts previewed at once, `ensureDaemon()` found the *other*
  project's healthy daemon and rendered through it — serving another app's screens under this
  project's name. `PreviewDaemon`'s `/health` now reports `previewsDir` and adoption refuses on
  mismatch (a daemon predating the field is still reused, with the log saying plainly that the
  project went unverified). Found because it made a preview-service test flaky, which in a
  verification harness is the cardinal sin.
- **Architecture §2 Constraints had no console mirror (P1).** The doc parser skipped §2
  entirely, so the frozen version set — the constraint §2 itself tags "no version-drift gate
  ships yet" — was invisible in the surface where `architecture` gets approved. Now rendered
  as spec + mirror at once: §2's authored bullets, the five lockstep libraries read live from
  `gradle/libs.versions.toml`, the version §2's prose claims for each, a verdict per row, and
  the KSP `<kotlin>-<ksp>` invariant checked against the live values rather than the prose.
- **The type ramp reaches the design-system catalog (P1).** `Typography.kt` now holds the ramp
  as plain data and the `@Composable` factory builds its `TextStyle`s from that list, so the
  published ramp and the rendered ramp are the same numbers by construction (nullable
  `tracking` is preserved, never flattened to `0.sp`). Both emitters publish it —
  `designSystemCatalog()` and `InspectorCatalog` — and the console renders a real ramp:
  a specimen set in each rung's own size, weight and tracking, metrics alongside.
- **Component stories are framed to the component (P2).** Story renders (`component.*` only —
  a screen's frame is part of what is reviewed) crop to their content bounding box plus one
  `PaddingPage` gutter, measured from the pixels so unsemantic decoration is kept. A 48 dp
  button no longer renders as a sliver on a full device-height frame. Lossless, and
  `tree.json` is untouched, so goldens and a11y math are unaffected.
- **Live screenshots read the composited frame (P1).** `/inspect/screenshot` now captures via
  `PixelCopy` (API 26+, Activity-window-guarded; dialog roots and pre-26 fall back to the
  software draw) — a software `View.draw` replays stale Compose layer recordings, which served
  byte-identical "screenshots" of two different screens during the dogfood walkthrough.
  `render_screen{live}` returns the capture's `sha256` and flags `identicalToPrevious` with a
  stale warning — the tripwire that caught the original lie, built in.
- **a11y touch-target audit judges the full composed size (P1).** All three semantics
  serializers emit an additive `size` field (unclipped); both audits use `max(bounds, size)`,
  so a list row bisected by a scroll fold (reported 371×36 of a 371×88 row) is never a false
  violation. Genuinely small targets still fail; old trees behave as before.
- **MCP-spawned Gradle resolves a JDK without touching tracked files (P1).** `jdk.mjs` resolves
  `JAVA_HOME` (env → `/usr/libexec/java_home` → sdkman → Android Studio JBR) and propagates it
  through the child env of every Gradle spawn — the previous de-facto workaround mutated the
  committed `gradlew`, leaving the repo permanently dirty.
- **Preview daemon and verify lane coexist (P1, D13).** The lane stamps
  `composeApp/build/.cmp-lane-in-progress` for its duration and the preview service defers
  renders while it exists (mtime-bounded); both sides self-heal the KSP
  "Storage … is already registered" collision by clearing `kspCaches` and retrying once — the
  manual stop/clear/restart dance, automated.
- **SHELL-05 inspects `*Route` nav destinations** (was keyed on `*Screen(` only — the UI-first
  seam's VM-backed destinations passed the gate vacuously).

### Changed

- **Genesis definition order re-founded on two principles (P1, the headline).** Behavior is
  spec-first: `exemplar-spec` precedes `exemplar-feature` — the clauses are human-confirmed
  before the slice is built, matching `add-feature`. Visuals are UI-first: `design-system` and
  `components` lock AFTER the exemplar (candidates render on real screens; the registry is
  distilled from them; a provisional palette seeded from the intent's brand-feel words carries
  the build). New order: intent → architecture → exemplar-spec → exemplar-feature →
  design-system → components. The `cmp-new` walk, `GENESIS-FLOW-DESIGN.md`, and the template
  contract all encode it, including the exemplar-retarget architecture-prose refresh
  (reopen → re-approve) and the design-lock → golden-regen → reopen loop.
- **The UI-first pattern is codified with an enforced hazard gate.** Template
  `ARCHITECTURE.md` §7 documents stateless-screen + `sample*` preview seam + `*Route` wiring;
  new clause **ARCH-12** fails the lane when a `sample*` fixture is referenced outside its
  declaring file (the proven failure: a nav host resolving entities from sample data).
- **Component distillation is agent judgment, ratified at the approval — never a similarity
  gate.** The console's Components page gains the **promotion queue**: composables used in
  screens but absent from the registry, with signals only (cross-feature use count,
  composes-registry hint). The planned mechanical duplication clause was withdrawn on
  evidence: measured on the real showcase, no metric separates near-identical from
  legitimately-different pairs (0.776 vs 0.734).
- **Premium defaults.** `AppHeader`'s back affordance is a Material auto-mirrored icon button
  via the new **`AppIconButton`** (48 dp floor by construction — raw M3 `IconButton` is 40×40,
  below the harness's own audit); the type ramp grows from 6 to 12 styles with tracked display
  sizes; a **`BrandMark`/`BrandWordmark`** starter lands in `presentation/brand/` (guided
  placeholder — brand is governed separately from the components registry).
- **Receipts declare their strength (D12).** `PASS (on-device: e2eSmoke+tokenDrift)` vs
  `PASS (desktop-only)` on the lane verdict line and as `strength.onDeviceSteps` in the
  receipt — a desktop green and an on-device green are different claims.
- **The live device view is headlined, not buried.** README "Watch and drive your app live
  from a browser" section, generated-project README block, and a standing offer step in the
  generated `CLAUDE.md`; the console shell titles itself from `rootProject.name`, not the
  directory basename. E2E docs + generated smoke carry the settle rule (async assertions use
  `extendedWaitUntil` — a lane-loaded emulator stretches the Loading arm past a bare assert).

## [0.9.0] - 2026-07-21

This release is the **studio** — the generated project's console is rebuilt as a
documentation site where every section is the professional artifact its discipline
authors, derived from the live tree, with drift shown in place — plus the runtime
eyes, the ordered human-approval layer, the genesis definition flow, and a tiered
verify workflow that stops the agent re-running the heavy lane on every edit.

### Added

- **The studio console — the preview gallery rebuilt as a documentation site.** One
  shell (`inspector/mcp/src/lib/console-shell.mjs`) frames a single design system
  (ink/paper + one accent; semantic red/amber/green reserved for drift, reopened, and
  signed) with a sidebar coverage rail whose glyphs read at a glance — ● signed,
  ○ unsigned, ◐ reopened, ⚠ drifted. The sections follow the genesis definition order —
  **Intent → Design language → Architecture → Components → Screens → Specs → Evidence** —
  and each is a spec, a mirror of the live tree, and a drift surface at once: the
  Screen×State matrix, the Intent brief, the Architecture document as derived truth, the
  Design-language token/contrast proof pages, and a **visual render for every component**
  via `ComponentStories.kt` (14 stories) with a parity gate so a component can never
  appear on the bar without its render.
- **The Evidence audit trail — the committed receipt history, reconstructed from git.**
  `qa/evidence/latest.json` is the single receipt-of-record; the console's Evidence
  section walks `git log` of that one file to show the full signed history (verdict,
  profile, commit, author, age) — the git history *is* the ledger, nothing extra to
  retain or trust.
- **Runtime eyes + ordered, hash-bound human approvals (VL-1…VL-7).** The debug app's
  `/inspect/*` endpoints expose live nav, a11y contrast, ANR/crashes, logs, and the DB as
  MCP structure (`connect_live` + the cmp-inspector tools); approvals are hash-bound gates
  the console renders as a two-way surface, with a comments ledger the agent and human
  both write to.
- **The genesis definition flow.** `cmp-new` becomes a six-conversation walk in which
  nothing generic is ever signed: a definition layer sits under the approvals, the
  exemplar is configurable, an express lane exists for the impatient, and reopen-vs-drift
  is an explicit asymmetry.
- **The component vocabulary (CV-1) and the architecture-document standard (AD-1).** Both
  land as derived truth — on the console page and enforced in the lane (new conformance
  clauses, incl. ARCH-11) — rather than as standing prose.
- **Tiered verify workflow — the full lane is a checkpoint, not an inner loop.**
  `template/CLAUDE.md` now teaches two tiers: iterate with the preview + targeted
  `:composeApp:desktopTest`; run `node qa/verify.mjs` once, at the done checkpoint. A new
  opt-in **pre-push gate** (`.githooks/pre-push`, enabled by `node qa/setup-hooks.mjs`)
  runs only the cheap receipt-check — the same predicate CI enforces — so an unverified
  push is caught locally without rebuilding anything. Bypassable with `git push
  --no-verify`; CI still enforces.

### Changed

- **Typed-result error flow at the foundation (template + exemplar).** Exceptions no longer
  cross layer boundaries in generated apps: repositories return `AppResult<T>`
  (`Success`/`Failure(DomainError)` — new shared `domain/result/AppResult.kt` +
  `domain/model/DomainError.kt`), the data layer's new `suspendRunCatching` helper
  (`data/AppResultCatching.kt`) is the single exception-translation point and **always
  rethrows `CancellationException`** (the old `catch (e: Exception)` in the exemplar
  ViewModel swallowed cancellation and leaked raw `e.message` to the UI), and
  `HomeUiState` is now a sealed `Loading`/`Content`/`Empty`/`Error` hierarchy with
  presentation-mapped error copy plus a new `home_empty` state (spec clause HOME-07).
  Three new conformance gates enforce the policy as `specs/app-base.spec.md` clauses
  ARCH-06 (repository interfaces return `AppResult`), ARCH-07 (ViewModels contain no
  `try`/`catch`), and ARCH-08 (the data layer's only catch mechanism is
  `suspendRunCatching`, cancellation-guard verified). The `add-feature` stamper clones the
  new pattern (spec set is now `<FEATURE>-01..07`, incl. the empty state), and
  `docs/ARCHITECTURE.md` gains explicit **Error handling** and **Threading (main-safety)**
  policy sections.

## [0.8.0] - 2026-07-15

### Added

- **`create-cmp upgrade` now manages `compileSdk` / `targetSdk`, and ships the July 2026
  recommended version set (`2026.07r`).** A version set can carry an `androidSdk`
  block, and `upgrade` rewrites `composeApp/build.gradle.kts` (with a backup) alongside the
  catalog — because the Android SDK level is coupled to the set (newer AGP + newer androidx
  force a higher `compileSdk`). The new default upgrade target `2026.07r` is a sourced,
  canary-certified jump: **Kotlin 2.3.10 / KSP 2.3.10 / Compose Multiplatform 1.11.1 /
  AGP 8.13.2 / Gradle 8.14.3 / compileSdk 36**, plus koin 4.2.2, sqlite 2.7.0, firebase 2.4.0,
  google-services 4.5.0 (coil 3.2.0 + serialization 1.9.0 from 2026.07c). Built green on
  Android + desktop + iOS. The lockstep validator now accepts KSP2's aligned scheme
  (`ksp == kotlin`, e.g. `2.3.10`) as well as the classic `<kotlin>-<kspVersion>` form.
  Documented in the new [docs/VERSIONS.md](docs/VERSIONS.md). Deliberate holds, each found by a
  canary build: ktor stays 3.1.0 (3.2.0 isn't dexable at `minSdk 24`), and androidx-core /
  lifecycle stay at their SDK-36-safe versions (their latest demand an unreleased `compileSdk 37`).

- **Second proven-green version set (`2026.07c`) + the canary promotion gate.**
  `scripts/promote-set.mjs` scaffolds a full app pinned to a candidate (staged in the new
  `src/versions/candidates.json`), builds it for real — Android `assembleDebug`, the
  device-free lane gates (`desktopTest`), and the iOS framework link — and ONLY on all-green
  appends it into `src/versions/registry.json` as the new default `create-cmp upgrade` target;
  a red build leaves the registry untouched. The first promoted set, `2026.07c`, bumps
  coil 3.1.0→3.2.0 and kotlinx-serialization 1.7.3→1.9.0 with the entire Kotlin/KSP/Compose/Room/AGP
  lockstep held. The gate earned itself on the first run: it caught ktor 3.2.0 shipping a
  DEX-040 backtick identifier (`use streaming syntax`) that AGP 8.7.3's R8 rejects at
  `mergeExtDexDebug`, and refused to promote it. `create-cmp upgrade` now has a real target
  beyond the frozen baseline. (Complements the existing `scripts/canary.mjs` freshness probe.)

- **New official alias: `create-mobile`** (`packages/aliases/create-mobile`, published
  separately, starts at 0.1.0) — the honest front door to a new mobile app. Unlike the
  pure-passthrough `create-kmp` / `create-compose-multiplatform` shims, `npm create mobile`
  opens with a fit check: Compose Multiplatform as the modern default, the real trade-offs vs
  React Native/Flutter (their strengths named too), and a genuine choice — interactive runs get
  a `Continue with Compose Multiplatform? [Y/n]` prompt that writes nothing and points to Expo /
  Flutter on decline; `--yes`/CI runs print the note and proceed. The generic name earns itself
  rather than silently redirecting. README + llms.txt now list it alongside the other aliases.

## [0.7.1] - 2026-07-14

### Fixed

- **The feature stamper now auto-registers a stamped screen in `inspector/PreviewRegistry.kt`.**
  `add-feature` / `add-screen` (and `qa/scaffold-feature.mjs` directly) previously wired the
  nav route and DI but left the new screen invisible to the preview loop, the gallery, and the
  golden baselines until you hand-added a `ScreenPreview(...)` entry — a drift the harness's own
  philosophy ("extend right-by-construction") shouldn't allow. The stamper now appends that entry
  and its import at a new `// cmp:anchor preview-registry` marker, for both the `feature` and
  `screen` presets, mirroring the nav/DI anchor discipline: idempotent, and a clean no-op when the
  inspector feature is disabled (no `PreviewRegistry.kt`). The engine's generated registry and the
  static template stay byte-identical (pinned by `test/tab-surfaces.test.mjs`), and a new parity
  test (`test/stamped-preview-registration.test.mjs`) locks stamp → registration so the two can't
  drift again.

## [0.7.0] - 2026-07-14

### Added

- **`packages/receipts/` — the receipt-validation logic is now ONE package**
  (`cmp-receipts`, not yet published). The inputs-hash algorithm and the
  receipt predicate (binding present → not FAIL → hash matches the tree →
  PASS) were extracted from the template into `packages/receipts/src/`, which
  is now the single source of truth; the template's `qa/lib/inputs-hash.mjs`
  and new `qa/lib/receipt-validate.mjs` are byte-identical vendored copies
  (`node scripts/sync-receipts.mjs` re-vendors; `test/receipts-parity.test.mjs`
  pins package ↔ template ↔ fresh-scaffold byte-equality), so generated
  projects stay dependency-free while any hosted validator consumes the exact
  same logic from the package. `qa/receipt-check.mjs` now imports the vendored
  predicate — identical CLI behavior, refusal strings, and exit codes. The
  package adds service-grade checks the local predicate deliberately doesn't
  enforce: freshness windows, execution plausibility (impossibly-fast receipts
  are named — evidence must attest execution), SKIP listing, and a composite
  `validateReceiptForTree()` that reports repos without a receipt as `missing`,
  never as failing.

### Changed

- **The package README now leads with the one-line promise.** The README (the first thing
  npm and coding agents read) opens with "gives AI coding agents *eyes* and a
  *machine-enforced definition of done* on mobile," surfacing the preview/inspector "eyes"
  and the verify lane's "definition of done" in the subtitle instead of below the fold.

### Fixed

- **The feature stamper now stamps a SHELL-05-conforming screen out of the box.**
  `qa/scaffold-feature.mjs` clones the `home` exemplar — a tab screen whose BaseScreen
  comes from AppShell — but registers the clone as a pushed NavHost destination, so the
  very next `node qa/verify.mjs` failed SHELL-05 naming the new screen (reproduced against
  released 0.6.1: stamp Favorites → verify → FAIL). The stamper now wraps the cloned
  screen's root container in `BaseScreen { … }` at stamp time (DetailScreen's pattern),
  for both the `feature` and `screen` presets, anchored on the exemplar's shape and
  failing loudly on template drift. The only post-stamp step left is the by-design golden
  capture: stamp → `UPDATE_GOLDEN=1` → verify now PASSes with zero hand edits (pinned by
  `test/stamped-feature-conformance.test.mjs`, which fails against the old stamper).

- **`git init` no longer invalidates a stamp-time receipt (first-touch UX trap).** In a
  project with no `.git` yet — exactly the state `create-cmp --verify` runs in at stamp
  time — the inputs-hash walk fallback included `composeApp/build/**`, Gradle/Kotlin
  scratch, and OS/editor junk (`.DS_Store`, `*.iml`, `.idea/`, `*.log`) that the
  `git ls-files --exclude-standard` path excludes, so the first `git init` flipped the
  PASS receipt to "INVALID — source changed" with no source change. The walk fallback now
  mirrors the template `.gitignore`'s exclusions; pre-git and post-git hashes agree for
  identical source (pinned by `test/inputs-hash-parity.test.mjs`, which fails against the
  old code). Reproduced against released 0.6.1 and verified fixed end-to-end:
  scaffold → verify → `git init` → `receipt-check` now reads VALID.

### Changed

- **Template README attribution is now a visible badge.** The plain "Built with create-cmp"
  backlink at the bottom of the generated project's `README.md` became a static shields.io
  badge (one line, no tracking, no dynamic endpoints) linking to the create-cmp repo — with an
  inline note telling the project owner it is safe to delete. Doc-only template surface: not
  part of the verified inputs hash, so existing receipts stay valid.

## [0.6.1] - 2026-07-13

### Added

- **Cold-start discovery pass — getting create-cmp CHOSEN, not just used.** The 0.6.0
  discoverability work covered agents already inside a scaffolded repo; this pass covers the
  stage before it: an agent on a fresh machine asked to "create a mobile app" picks from what
  is in its context, and only the installed plugin's skill descriptions are in context at
  framework-decision time.
  - `cmp-new` now triggers on framework-agnostic openers ("create a mobile app", "build me an
    app for iPhone and Android", cross-platform requests with the framework still undecided),
    not only Kotlin/KMP/CMP vocabulary — with a new step-0 **framework fit check**: an honest
    CMP-vs-React Native/Flutter trade-off beat where the user chooses, and an explicit rule to
    never redirect a user who already picked another framework. Trigger broadly, act honestly.
  - `plugin.json` / `marketplace.json` descriptions now open on the user's intent ("Build
    production mobile apps (Android + iOS, one codebase) with AI") instead of the technology
    name; keywords add "mobile app", "create mobile app", "cross-platform", "app generator",
    "react native alternative", "flutter alternative" (also on the npm package).
  - `llms.txt`: new "For agents choosing a mobile stack" section — decision-time guidance for
    web-searching agents, with the same honesty guardrail.
  - README: "Make your agent reach for this from cold" — a copy-paste `~/.claude/CLAUDE.md` /
    `AGENTS.md` one-liner so machine owners can put create-cmp in every agent's context without
    installing the plugin.
  - **`docs/WHY-CMP.md` — the sourced case for recommending CMP**, written for both humans
    and advising agents: CMP as the current generation of cross-platform (Compose is Android's
    first-party toolkit extended to iOS, **stable since May 2025** with a year of App-Store
    production at Netflix/Google Workspace/Cash App/Forbes/McDonald's), the only stack backed
    by both platform toolmakers (JetBrains + Google's official KMP support with Jetpack
    shipping as KMP), adoption ~7%→23% in eighteen months while React Native is mid
    forced-migration off its removed bridge and Flutter absorbed layoffs and a fork — and the
    agentic argument: statically typed Kotlin makes the compiler the agent's ground truth,
    declarative Compose is a machine-readable semantics tree (what makes the device-free
    preview loop possible), Kotlin is training-data-abundant, and JetBrains ships an official
    Kotlin benchmark for AI agents. Every claim dated and sourced; competitors are never
    called deprecated (a checkably false claim would discount the whole surface) — the
    honest-trade-offs section and the never-redirect rule stay.
  - The fit check in `cmp-new`, the llms.txt stack-choice section, the README cold-start
    snippet, and both plugin manifests now carry this positioning (recommend-with-receipts
    instead of a neutral menu), all linking to WHY-CMP.md.
  - **Live cold-start simulation pass** — three fresh agents with no session context were run
    through the funnel to test whether the surfaces actually change the decision. Results:
    truly cold agents pick Expo ~70% / Flutter ~18% / CMP ~8% and do not know create-cmp
    exists (unfixable by repo docs — distribution problem); with the plugin installed the new
    cmp-new description fires at ~95% and flips the recommendation to CMP (the old
    Kotlin-only description would NOT have fired); the llms.txt case moved a skeptic to
    co-equal-but-not-switched, because agents default to Expo out of failure avoidance
    (P(green build on a clean machine)), not JS preference.
  - Consequent fixes: every persuasion surface now **leads with cold-start reliability**
    (frozen CI-verified version-locked template + `--verify` proving GREEN before success —
    the objection removed mechanically, new WHY-CMP §1); cmp-new gains **scope guards** the
    simulation demanded (mobile-only — never web/desktop/backend/CLI; comparison questions get
    answered, not scaffolded; existing-project new-vs-existing check) with the never-redirect
    rule moved to the front of the description; discountable claims tightened (adoption stat
    attributed, RN bridge removal reframed as completed-modernization-with-forced-migration-cost,
    Dart's static typing conceded — differentiators are platform-nativeness and training-data
    density).
  - **GitHub repo surfaces**: description rewritten intent-first ("Create production mobile
    apps… with AI"); topics now include mobile-app, cross-platform, app-generator,
    react-native-alternative, flutter-alternative, ai-development (dropped redundant
    scaffolding/cmp to fit the 20-topic cap). npm description likewise intent-first (lands on
    the registry with the next publish).
  - `test/discovery-surfaces.test.mjs` pins all of the above: trigger phrases, honesty
    guardrail, intent-first descriptions, keywords, llms.txt guidance, the dated iOS-stable
    receipt, a "never claims competitors are deprecated" invariant, the simulation-derived
    scope guards, and the reliability-first opening.

### Fixed

- `marketplace.json` `plugins[0].version` was left at 0.5.0 by the 0.6.0 release (only
  `metadata.version` was bumped). Synced, and the new discovery-surfaces test now enforces
  lockstep across `package.json`, `plugin.json`, and both `marketplace.json` fields.
- Stale counts in docs: README's plugin badge anchor still pointed at
  `#the-claude-code-plugin-8-skills` (broken since the heading became "9 skills");
  `docs/USAGE.md` said "8 skills" and "cmp-inspector MCP (v0.4.0 — 14 tools)" in five places —
  now 9 skills / 18 tools, with the badge-anchor-matches-heading invariant pinned by test.

## [0.6.0] - 2026-07-13

### Added

- **Headless screen previews of the app's REAL screens (tier 0, "Android Studio previews"
  without the IDE)** — closing the gap where `render_screen` could only render the bundled
  demo SampleScreen. Every app scaffolded with the inspector feature now ships:
  - `inspector/PreviewRegistry.kt` (desktopMain) — the `@Preview` analog: a `ScreenPreview`
    entry for the shell, every bottom-nav tab, and the detail destination. Regenerated from
    the configured `--tabs` by pipeline step b.3 (default config reproduces the static
    template byte-for-byte, pinned by `test/tab-surfaces.test.mjs`).
  - `inspector/PreviewHarness.kt` + a `:composeApp:renderScreens` Gradle task — renders each
    registry entry with the app's real Koin DI, theme, and data (own Koin start, independent
    of the dev-client feature; provides the Lifecycle/ViewModelStore owners `koinViewModel()`
    and `collectAsStateWithLifecycle` need) to `composeApp/build/previews/<id>/`: the
    inspector-contract `tree.json` (phone viewport 411x891, density 1, px == dp, resolved
    design tokens via the PROJECT's DesignTokenKey) plus a `screen.png` pixel twin (@2x) from
    the same composition sources — no device, no emulator, no window. Parameters travel as
    `-P` properties (`-Pscreen=<id|all>`, `-PpreviewOut`, `-PpngScale`), never `--args`
    (Gradle's CLI parsing word-splits `--args` values into task names).
  - `qa/preview-gallery.mjs` — builds ONE self-contained `index.html` from the output
    (embedded PNGs for humans, wireframe SVG + a11y overlay per screen via the vendored
    pure-logic render libs in `qa/lib/`), dependency-free like the rest of `qa/`.
  - MCP: `render_screen` gains `projectDir` + `screen` — runs the generated task and returns
    the PNG metadata plus `treePath`/`previewsDir`; the bundled-SampleScreen `harness:true`
    path remains as the demo fallback and is labeled as such.
- **`preview` / `preview_stop` MCP tools + the `cmp-preview` skill (ninth skill) — the
  AI-native preview loop ("Storybook for CMP", phase 1)** — nobody runs Gradle or node
  scripts by hand: `preview { projectDir }` starts a resident service owned by the MCP
  server that renders every registry screen headlessly, serves a LIVE gallery at a local
  URL (pixels + inline wireframe SVG + a11y per screen; SSE-driven self-reload; changed
  screens flagged; render failures shown as a banner while the last good state stays up),
  and watches `composeApp/src` so every save re-renders automatically (debounced,
  serialized, one queued follow-up; recursive fs.watch with an mtime-poll fallback). The
  tool returns the same state structurally (`screens` with node/token/a11y counts + tree
  paths, `changedLastRender`) so the agent asserts while the human watches — pixels to
  the human, structure to the AI. Unit-tested via an injected render runner
  (`inspector/mcp/test/preview-service.test.mjs`).
- **Resident preview daemon (phase 2 — `@Preview` parity)** — the template ships
  `inspector/PreviewDaemon.kt`: a long-lived headless JVM serving loopback
  `/health|/screens|/render?screen=|/shutdown`, launched by the preview service under
  **Compose Hot Reload** (`hotRunDesktop --mainClass=<pkg>.inspector.PreviewDaemonKt
  --auto`; plain `runPreviewDaemon` JavaExec as the no-hot-swap variant). Saves recompile
  incrementally and hot-swap into the RUNNING daemon; `/render` re-reads the registry per
  request so fresh scenes compose from the swapped classes. The node service prefers the
  daemon when healthy (spawns it in the background, reuses an already-running one, falls
  back to the Gradle task transparently on any failure) and switches its render trigger
  to the compiled-classes dir so renders never race the swap (1.5s trailing debounce).
  Render settle is now ADAPTIVE (stop when two consecutive tree dumps match / two quiet
  invalidation checks) instead of fixed sleeps. Measured on a real 7-screen app: ~900ms
  single-screen, ~7s all screens, ~10s save→gallery-shows-the-change, vs 25–40s per
  change on the task path. `preview` gains `hot` (default true); `detectAppPackage`
  reads create-cmp.json (the 0.5.0 spec-of-record) with a namespace fallback.
- **Agent feedback loop hardening (dogfood review of the preview loop)** — the two P0
  gaps found by using the loop as an agent, plus the P1/P2 follow-ups:
  - **Compile failures are no longer silent in daemon mode** (P0): a broken edit under
    Compose Hot Reload produces no render (no classes written → no trigger), and the
    hot recompiler is a SEPARATE Gradle daemon whose output is unobservable — verified
    live, previously zero signal. The service now runs a **compile watchdog**: a save
    that produces no in-JVM reload within 20s triggers its own
    `:composeApp:compileKotlinDesktop` check, promoting the compiler's `e:` lines into
    `lastError` with `lastErrorSource: "compile"`, an SSE error broadcast (gallery pill
    "compile failed"), and immediate settlement of pending waiters (daemon-child output
    is also scanned for failure markers as belt-and-braces). `status()` also carries
    `lastActivity` ({what, at}: src-change / compile-failed / render-ok / render-stale…)
    so "quiet" and "stuck" are distinguishable.
  - **Swap-aware renders** (P0, found live): classes appearing on disk PRECEDE the
    in-JVM hot swap, so a classes-triggered render could compose pre-swap code and
    report a false `changed: []`. The daemon now registers an after-reload callback by
    reflecting on the Compose Hot Reload AGENT
    (`org.jetbrains.compose.reload.agent.ReloadHooksKt.invokeAfterHotReload` — the
    `-javaagent` jar is app-visible; the runtime-api facade is NOT, verified by CNFE.
    No compile-time dependency, so inspector stays independent of dev-client; plain
    JVMs report `reloadHooked: false`). `/health` and `/render` expose
    `reloadCount`/`reloadErrors`, and `GET /render?afterReload=<n>` holds the render
    (≤10s) until the swap actually lands. After every save the service passes its last
    seen reload count, retries stale renders on a bounded cadence (time-based when the
    hook is absent), and only settles waiters with the post-swap outcome — `changed:
    []` now really means "your edit reached no screen". A swap the agent REJECTS
    (structural change) bumps `reloadErrors` and surfaces as `lastErrorSource:
    "reload"` with a restart-to-heal message instead of silently rendering stale code.
  - **`preview_status` MCP tool** (P0): the agent's post-edit call.
    `{ waitForRender: true, timeoutMs? }` blocks until the next render cycle completes
    (success or failure) or a hot-recompile failure is detected — edit → one call →
    `changedLastRender`/`lastError` verdict; no HTTP polling, no sleeps. Result carries
    `timedOut` on expiry; waiters are settled (never left hanging) on `preview_stop`.
  - **`preview_diff` MCP tool** (P1): `prove_change` with zero bookkeeping — the service
    retains the previous generation of every screen's tree, so `{ screen }` diffs the
    last two renders and returns the full prove_change contract ({changes, regressions,
    verdict}), drift-checked against the previews dir's `design-system.json` when
    present. `snapshot_save` + `prove_change` remain for cross-session goldens.
  - **`render_screen` warm path** (P1): with `projectDir`, the tool now renders through
    the resident preview daemon when one is healthy (~1s vs the 25–40s task cycle) and
    reports `via: "daemon" | "gradle"`; unknown-screen errors surface the daemon's
    message instead of falling through.
  - **Gallery polish** (P2): per-card persistent "changed #N" badge (attribution
    outlives the next render; `lastChangedVersion` per screen in `/status` too), hover
    before/after compare on changed cards (`screen.prev.png` snapshotted before each
    render), and a screen filter box that survives the SSE self-reloads.
  - **State variants documented** (P2): the registry doc (template + `--tabs` codegen)
    now spells out the Storybook-"story" analog — a forced-state screen is just another
    `ScreenPreview("home@empty", …)` entry; loading/empty/error states render side by
    side with the default seeded state.
- **Agent discoverability pass — a clean-install agent now learns the preview loop from
  every surface it auto-loads** (industry anchors: the AGENTS.md open standard, MCP
  server `instructions`, task-shaped tool/skill descriptions with the key info first):
  - Generated **`CLAUDE.md`** gains a "UI feedback loop" section — the exact
    plugin-tool loop (`preview` → `preview_status {waitForRender:true}` →
    `preview_diff`) AND the no-plugin Gradle fallback, feature-markered so
    `--no-inspector` / `--no-dev-client` stamps stay truthful; generated **`AGENTS.md`**
    (new) points every non-Claude agent (Codex/Cursor/Copilot/…) at the same contract.
  - The **cmp-inspector MCP server now ships `instructions`** (injected into every
    connected agent's context): the default UI loop first, tier-1 inspection after;
    server version now read from package.json instead of a stale hardcode.
  - **cmp-preview's skill description is task-shaped**: it triggers on the agent's own
    workflow ("while building or editing ANY CMP screen", "verify a UI change") — not
    only on user phrases like "preview my app".
  - **cmp-new's report step hands over the daily loop** (offer to start `preview` right
    after scaffolding); **cmp-dev-client** cross-links the preview loop; the
    **cmp-orchestrator** agent gates delegated UI changes through
    `preview_status`/`preview_diff` alongside the verify lane.
  - Template README quick-start gains the headless preview one-liner; plugin +
    marketplace descriptions and the root README/USAGE now headline the loop
    ("the agent sees what it builds").

## [0.5.0] - 2026-07-12

Findings from a full field run of the plugin (HealthStack app: 5 tabs, Room, no Firebase,
Android + iOS) — each gap below was hit live, then reproduced and fixed against a stamped
fixture with negative proofs (injected violations caught by their named clauses).

### Added

- **`create-cmp.json` spec-of-record** — the scaffold persists the fully-resolved config
  (name, package, platforms, features, tabs, engine version, timestamp) into the project
  root. Until now the only pre-code spec in the system was validated, consumed, and
  discarded at stamp time; consistency tooling, `upgrade` intent, and re-stamp/resume all
  need it durable.
- **`core/format` KMP-safe helpers** (`pad2`, `clockLabel`, `fixed`) + tests — the
  `"%02d".format(...)` JVM-only trap is the most common first-week `commonMain` porting
  mistake; the template now ships the safe versions.
- **SHELL-05 conformance rule** — every non-shell NavHost destination must compose inside
  `BaseScreen`. A bare destination that never touches inset APIs passes SHELL-03 while
  rendering under the status bar; observed in the field on a generated app's Settings screen.
- **Machine-readable verify verdict** — `::create-cmp-verdict::{json}` as the last verify
  line (+ per-platform durations). Verify logs can exceed 170k lines where `-Werror=` clang
  flags and Xcode phase names false-positive naive error greps; agents anchor on the marker.

### Fixed

- **Room per-target schema directories** — the single shared `schemaDirectory` tripped
  `Inconsistency detected exporting Room schema files` on the *first entity edit after
  scaffold* (stale cross-target intermediates), i.e. for every user on the happy path.
  Schemas now export to `schemas/<target>/`.
- **ARCH-04 scoped by content, not filename** — `*Screen.kt` scoping missed untagged
  `FooContent.kt` split files and false-positived ViewModel-only `FooScreen.kt` files.
  Any presentation-feature file containing `@Composable` must declare a `testTag`.
- **ARCH-01/02 match fully-qualified inline references** — import-only matching left a
  one-edit evasion open (delete the import, qualify the name inline; gate stays green).
- **Non-empty target check allowlists harmless entries** (`.git`, `.claude`, `.DS_Store`,
  `.idea`, `.vscode`) and names the blocking entries — the documented doctor→create flow
  no longer poisons its own target dir into requiring `--force`.
- **Doctor JDK row label** states the actual requirement (`JDK (17+ required)`) and reports
  the resolved major — it previously read "JDK 17 (Temurin)" while accepting JDK 21.

## [0.4.0] - 2026-07-12

### Added

- **Tab surfaces are generated, not static** — the engine (new pipeline step b.3,
  `src/lib/tabs.mjs`) rewrites the tab-driven surfaces from the configured `--tabs` at stamp
  time, so a non-default tabs config can no longer ship stale defaults:
  - `AppTab.kt`: one `appTabs(...)` entry per configured tab (label + Material icon).
  - `AppNavHost.kt`: the `appTabs(...)` call site is wired per tab — `home`/`profile` slugs get
    the shipped feature screens, anything else gets a generated `PlaceholderScreen` stub carrying
    the `<slug>_title` testTag.
  - `qa/e2e/smoke.yaml`: Maestro taps/asserts per tab by `nav_<label-slug>` id; the JS slug rule
    (`navSlug`) mirrors `AppShell.kt`'s `navItemTag` and the two point at each other.
  The default tabs config (`Home:home,Profile:person`) reproduces the static template files
  byte-for-byte — pinned by `test/tab-surfaces.test.mjs`.
- **Agent discoverability pass** — `llms.txt` at the repo root (llmstxt.org convention: identity,
  the non-interactive one-liner, flag reference, doc/showcase links), shipped in the npm tarball
  and linked from the README. `package.json` and the plugin/marketplace manifests now carry the
  literal multi-word search keywords agents emit ("compose multiplatform", "kotlin multiplatform",
  "project generator", "claude code", "ai agent", …), and the npm description states the
  deterministic, non-interactive contract up front.
- **Alias packages** `create-compose-multiplatform` and `create-kmp` (`packages/aliases/`) — thin
  published shims delegating to `create-cmp-cli`, so `npm create compose-multiplatform` /
  `npm create kmp` land in this tool. Published separately from the main package (see the
  npm-publish skill's Alias packages section).
- **Attribution line in generated READMEs** — generated projects' README now ends with a single
  plain-markdown line, `Built with [create-cmp](…) — the AI delivery harness for Compose
  Multiplatform.`, below a `---` rule. One line, no image badge, no tracking, trivially
  deletable; README is outside the verified surface, so removing it never invalidates a receipt.
- **Error-message pages** (`docs/errors/`) — one page per real KMP/CMP build failure the doctor
  diagnoses (kotlin↔KSP lockstep, the KSP2/iOS `ClassNotFoundException: …MainKt` catch-22,
  `SDK location not found`, `~/.konan` disk exhaustion, version-catalog drift): the exact error
  text, why it happens, the manual fix, and the doctor/scaffold one-liners. Linked from the
  README and USAGE.

### Changed

- **README first screenful** now passes the 3-second agent test: the copy-pasteable
  non-interactive one-liner plus the deterministic / exits-non-zero / ships-its-own-verify-lane
  contract sit directly under the badges. Everything below is unchanged from the 0.3.2 rewrite.

## [0.3.2] - 2026-07-12

### Added

- **Bottom-nav testTags** — nav items derive a deterministic `nav_<label-slug>` testTag from
  their label at runtime, and both `qa/e2e/smoke.yaml` and `AppShellTest` now select by tag —
  bringing the shell in line with the template's own durable-test rule (never select by display
  text). Works for any `--tabs` configuration; golden trees unaffected.

### Fixed

- **Evidence receipts now attest test *execution*, not Gradle cache reuse** — the second shipped
  correctness bug caught by dogfooding the public showcase (the first was 0.3.1's inputs-hash gap).
  The verify lane trusted Gradle exit codes, but the build cache can restore a `desktopTest` PASS
  recorded against a *different* tree state: a deterministic re-scaffold produces byte-identical
  sources, and neither `qa/golden/` baselines nor the `UPDATE_GOLDEN` env var were declared task
  inputs. Observed live: an `UPDATE_GOLDEN` capture run was served from cache (so it never wrote
  the new feature's golden baseline), the lane then emitted a zero-SKIP PASS receipt in 81 seconds
  for tests that never executed — and CI, with a cold cache, correctly failed on the missing
  baseline.
  - `qa/verify.mjs`: both `desktopTest` invocations force `--rerun` — compilation stays cached,
    test execution is forced.
  - `composeApp/build.gradle.kts`: `qa/golden/*.json` and `UPDATE_GOLDEN` are declared `Test` task
    inputs, so Gradle caching is honest even outside the lane.
  - Engine regression guard pins both surfaces.
- **`qa/refusal-demo.mjs` now works in real generated repos** — it scaffolded its throwaway app
  via `<repo-parent>/bin/create-cmp.mjs`, a path that only exists inside the create-cmp dev tree;
  it now falls back to `npx --yes create-cmp-cli@latest`. Caught by the negative-proofs walk on
  the public showcase.

### Changed

- The CLI's `--help` banner leads with the AI-delivery-harness identity (matching README, plugin
  and package manifests — ADR-0006), and a long-dead `qa/appium/package.json` rename block was
  removed from the scaffolder (retired by the Maestro migration, ADR-0002).

## [0.3.1] - 2026-07-12

### Fixed

- **Evidence receipts now attest their own commit** — two gaps in the generated `.gitignore` +
  verify lane meant the committed receipt could never match `HEAD`, so CI's receipt-matches-HEAD
  gate would false-fail on the first change in any real repo. Found by dogfooding a full
  generated app (scaffold → add-feature → commit).
  - `.gitignore` ignored `/build` (root-anchored) — it missed module build dirs like
    `composeApp/build/`, which then got committed and destabilised the receipt's inputs hash.
    Now `build/` (unanchored) ignores build outputs at every level.
  - `qa/lib/inputs-hash.mjs` hashed only git-tracked files, so a freshly generated feature's
    files — untracked when the lane runs but committed *with* the receipt — were excluded. Now
    the surface is the **to-be-committed** set (`git ls-files --cached --others --exclude-standard`):
    tracked + untracked-not-ignored, still excluding gitignored scratch.

## [0.3.0] - 2026-07-11

create-cmp repositions from a scaffolder to an **AI CMP delivery harness**: every generated
project now ships a spec-driven verify lane, mechanical enforcement of the evidence contract, and
in-project generators so an AI session can extend the app without the plugin installed.

### Added

- **Spec-driven foundation** — `specs/*.spec.md` (Given/When/Then, stable clause ids) with the
  `home` feature as the fully-cited exemplar; the verify lane's new `specCoverage` step fails on
  orphan clauses (unverified behavior) and orphan tags (untraceable test citations).
- **Conformance + test pyramid (harness M0–M2)** — dependency-free architecture gates enforcing
  the layer boundaries, Compose UI Tests (spec-cited), golden-tree structural baselines, and a11y
  checks, all running on `:composeApp:desktopTest`.
- **In-project generation skills** — `add-feature`, `add-screen`, `add-repository` ship inside
  every generated project (`.claude/skills/`, backed by `qa/scaffold-feature.mjs` and its
  `--preset screen|repository` modes) and clone the `home` exemplar deterministically — no
  create-cmp plugin required to extend the app.
- **Mechanical enforcement (harness M4)** — an evidence-bound Stop hook that refuses to let a
  session end on unproven claims, evidence receipts bound to an inputs hash, CI that checks the
  committed receipt matches `HEAD`, and a refusal demo proving the gate actually blocks.
- **Maestro E2E hardened** — the `e2eSmoke` verify step tolerates slow/CI emulators, and the
  harness has its first green pack proven on-device.
- **`cmp-orchestrator` agent** — delegates low-level generation work and gates every hand-off
  through the verify lane before reporting done.
- **Repo-level ADRs** (`docs/adr/`) and a documentation charter/standards ledger recording where
  the project adopted, adapted, or rejected industry testing/spec practices.

### Changed

- **BREAKING (soft): feature key `appium` renamed to `e2e`.** The CLI flag (`--e2e/--no-e2e`),
  interview prompt, `options.schema.json` property, `template/manifest.json` feature key, and
  template `cmp:feature` markers all use the new name. The old `--appium`/`--no-appium` flags
  keep working as **deprecated aliases** for `--e2e`/`--no-e2e` (a one-line warning is printed);
  no existing script breaks. Recorded in
  [ADR-0002](docs/adr/0002-maestro-over-appium-for-e2e.md).

## [0.2.0] - 2026-07-04

**First release on the npm registry**, and the first feature-complete one: create-cmp goes from a
scaffolder to a whole-lifecycle CMP tool — scaffold, maintain, and inspect the running UI.

### Added

- **Maintain commands** — a subcommand router (`create` / `doctor` / `upgrade` / `clean` / `verify`);
  `upgrade` migrates `gradle/libs.versions.toml` to the next proven-green version set (diff → surgical
  in-place edits with backups → lockstep guardrail → optional verify); `doctor` gains project
  diagnosis on **any** KMP project (kotlin↔ksp lockstep, drift, the KSP2/iOS catch-22, sdk.dir, konan
  bloat, disk) with `--fix`; `clean` for konan/build hygiene; `verify` as a standalone green-build gate.
- **`cmp-inspector` MCP (14 tools)** — read a running Compose UI as a structured JSON tree
  (hierarchy, geometry, **resolved design tokens**, nav state), never screenshots. Tools:
  `inspect_tree`, `get_node`, `assert_token`, `layout_gaps`, `diff_against_design_system`,
  `find_drift`, `snapshot_save`, `snapshot_diff`, `audit_a11y`, `connect_live`,
  `navigate_and_inspect`, `render_tree`, `render_screen`, `prove_change`. One tree contract, three
  source tiers (file / live / uiautomator).
- **Live on-device inspection** — every generated app ships a debug-only, loopback-only inspector
  server (`127.0.0.1:9500`, structurally absent from release) exposing the tree, design-system
  catalog, screenshot, tap, and a same-origin live device-view page.
- **The verified dev loop** — `prove_change`: snapshot → edit → reload → one call proves what changed
  and that nothing regressed (structural diff + token-drift + a11y → verdict).
- **Desktop dev-client** — a phone-sized JVM window running the shared UI with Compose Hot Reload;
  Firebase never initializes on desktop (offline DI fakes).
- **New skills** — `cmp-inspect`, `cmp-upgrade`, `cmp-dev-client`, `cmp-firebase-connect` (wire an app
  to its own Firebase via the CLI), `cmp-test` (generate the Appium suite by observing the app).
- **Trust** — a real Android CI build matrix per push (iOS on manual dispatch), a nightly canary that
  re-verifies the frozen set and probes the next upstream one, and a `verify.yml` shipped into every
  generated project.
- **Docs** — [`docs/USAGE.md`](docs/USAGE.md), the single-entry-point guide to the whole surface.

### Fixed

- Feature toggles delete disabled-feature paths **before** the package rename, so every toggle
  combination (`--no-room`, `--no-firebase`, `--no-inspector`, `--no-dev-client`, …) builds green on
  any package id.
- `template/.gitignore` ships as `template/gitignore` and is restored on stamp (npm strips literal
  `.gitignore` files from tarballs).
- `testTagsAsResourceId` is exposed via an expect/actual shim (Android-only API kept out of
  `commonMain`), so Appium id-selectors resolve on a stock stamped app.

### Note

- `0.1.1` was tagged but never reached the registry (publishing was deferred); `0.2.0` is the first
  published version.

## [0.1.1] - 2026-07-03

Release cut, but publishing was deferred — superseded by `0.2.0`, the first release on the registry.

### Changed

- The npm package publishes as `create-cmp-cli` (the bare `create-cmp` name is an unrelated
  placeholder and `create-cmp-app` is a real, unrelated CMP generator). The installed command
  remains `create-cmp` — `npx create-cmp-cli@latest` works today.
- Added `.claude/skills/npm-publish`, the documented release procedure used to ship this version.

## [0.1.0] - 2026-06-18

Initial release.

### Added

- **Deterministic scaffolder** for Kotlin/Compose Multiplatform (Android + iOS) — stamps a frozen,
  CI-verified golden template rather than freehand-generating a project.
- **CLI** (`create-cmp`) with interactive prompts and non-interactive flags; runnable via
  `npx github:kvdm-co-pilot/create-cmp`.
- **Toolchain doctor** (`doctor → bootstrap → verify`) — detects and (consent-gated) installs JDK 17,
  Android SDK + AVD, Xcode/CLT, CocoaPods, XcodeGen, Node, Appium + uiautomator2/xcuitest drivers.
- **Golden template** — pinned version set (incl. the iOS Room/KSP2 path), full iOS + Android shells,
  a generic bottom-nav `AppShell` with insets pre-solved, Clean Architecture with one example feature
  wired end-to-end, Koin DI, theme tokens, and an Appium smoke harness.
- **Feature toggles** — iOS on/off, Firebase (GitLive) on/off with auth `email`/`phone`/`both`/`none`,
  Room on/off, Appium on/off, configurable bottom-nav tabs.
- **Verify gate** — every scaffold builds the generated app and reports a GREEN/FAIL verdict.
- **Claude Code plugin** — `cmp-new`, `cmp-doctor`, `cmp-qa-prep` skills over the same engine, plus a
  marketplace manifest.

[Unreleased]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.12.0...HEAD
[0.12.0]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.10.1...v0.11.0
[0.10.1]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.7.1...v0.8.0
[0.7.1]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.6.1...v0.7.0
[0.6.1]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.3.2...v0.4.0
[0.3.2]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/kvdm-co-pilot/create-cmp/releases/tag/v0.1.0
