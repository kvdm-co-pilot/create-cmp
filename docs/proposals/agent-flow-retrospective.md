# Agent–tool flow retrospective: what two real apps proved

**Evidence base.** Brat-O-Meter (33 commits, 5 releases, stamped `engineVersion 0.11.0`,
`inspector: true` — `create-cmp.json`) and Fuelled (`create-cmp-showcase`, 6 releases,
schema v15, 333 tests). Session transcripts mined for tool calls:
`~/.claude/projects/-Users-test-dev-brat-o-meter` (129 MB),
`-Users-test-dev-create-cmp` (246 MB, hosts most Fuelled sessions),
`-Users-test-dev-create-cmp-showcase` (21 MB). Counts below are grep counts of
`"name":"mcp__cmp-inspector__*"`, `"skill":"…"`, and `"command":"…"` patterns over those
files. Every finding cites its number, file, or commit; anything that couldn't be
evidenced was cut.

---

## 1. What held — the spine that must not be touched

| Surface | Evidence | Verdict |
|---|---|---|
| Verify lane as done-checkpoint | brat: 211 `node qa/verify` runs; Fuelled sessions: 90+ | **The** adopted workflow. Deterministic gates beat model diligence — validated twice. |
| Approvals / governance | brat: 127 `node qa/approve` runs, signed briefs in `qa/approvals.json`; Fuelled: 66 + six human signatures this week | Adopted, including human CLI signing. Settled design — no changes proposed. |
| Preview loop | 120 `preview`/`preview_status` calls across Fuelled sessions; CLAUDE.md's loop followed as written | The one MCP surface that got *daily* use. Its design (blocking `waitForRender`, changed-screen attribution, compile errors in-band) is the pattern to copy, not amend. |
| Skills as entry points | brat invoked `cmp-new`, `cmp-qa-prep`, `cmp-firebase-connect`; Fuelled `cmp-inspect`, `cmp-doctor` | Entry-point model works. |
| Evidence integrity (0.3.2) | `--rerun` present in `template/qa/verify.mjs` (4 hits) | The build-cache-replay lesson was mirrored. The *process* of mirroring lessons is what failed elsewhere (§3.4). |

## 2. The headline numbers

- **Brat-O-Meter made 0 cmp-inspector MCP calls.** Not one, across the whole build.
- The agent **tried to load the tools 24 times** (`ToolSearch "+preview cmp-inspector
  status diff"` ×14, `"preview render screens gallery inspector"` ×10) and got no match:
  the MCP server was **not connected** in those sessions.
- What it did instead: **113 `adb shell screencap`**, **190 `adb shell input` taps**,
  **59 `uiautomator dump`s**, 13 raw `maestro test` runs.
- In Fuelled sessions the preview tier was used 120×, but the assertion tier went unused:
  `prove_change`, `snapshot_save`, `snapshot_diff`, `assert_token`, `find_drift`,
  `diff_against_design_system`, `audit_a11y`, `layout_gaps`, `render_tree`, `db_query`,
  `db_schema`, `capture_screen`, `runtime_logs`, `runtime_crashes`, `relaunch_app` —
  **0 calls each**, ever, in either app's transcripts.

## 3. Drift stories and root causes

### 3.1 Brat: capability silently absent → wholesale pixel fallback
The agent *wanted* the inspector (24 ToolSearch attempts prove intent). Nothing in the
system told it — or Karel — that the MCP server was down, why, or how to heal it. The
generated CLAUDE.md legitimizes the degradation: *"Without the plugin:
`./gradlew :composeApp:renderScreens`…"* (template/CLAUDE.md §"UI feedback loop") — a
documented fallback with **no instruction to diagnose or report the absence first**.
So a session that should have stopped and healed instead spent hours hand-driving pixels.

**Root cause — pinned (2026-08-19).** The plugin's marketplace copy was cloned at
2026-07-29 11:13 (`git reflog`, `~/.claude/plugins/marketplaces/create-cmp`) and the
plugin was enabled in `~/.claude/settings.json` around 11:27 (file mtime). Brat is one
continuous resumed session — a single 129 MB transcript — whose life began **before the
plugin was enabled**. MCP servers register at session start; a session born without the
plugin never gains its tools, across any number of resumes and compactions. The July-29
snapshot itself was fine (`.mcp.json`, bundled `dist/server.mjs` both present at
`a34f406`). Two generic failures, both now in scope: (1) no surface ever says "this
session predates the plugin — restart to pick it up" (same class as the
`node-keychain-segfault` lesson: running sessions don't see environment changes); (2) the
marketplace copy **never auto-updates** — it has sat at `a34f406` for three weeks while
the repo moved on, so even a fresh session gets a stale plugin and nothing surfaces the
drift.

### 3.2 Fuelled: the assertion tier lost to the lane
The lane subsumed the interactive twins: `stepTokenDrift` does `find_drift`'s job,
`stepA11y` does `audit_a11y`'s, `goldenTrees` does `snapshot_diff`'s. Given a deterministic
gate at commit time, the agent (rationally) never paid for the interactive version
mid-edit. **The lane winning is the system working** — but it means 15+ tools are surface
without flow: prompt space, choice noise, maintenance cost.

### 3.3 On-device work drifted to raw adb — and memory codified the drift
The memory `on-device-proof-without-maestro` ("use `adb input tap` + `uiautomator dump`")
is a workaround for plugin gaps written into the *user's* memory instead of the plugin:
Maestro's driver is fragile (`maestro-device-offline-adb-server` memory), and
`connect_live` is multi-step and racy (this week: the lane's own `adb forward` teardown +
post-install transport staleness produced 4/4 false-red smoke runs before the fix).
When the reliable path is raw adb, agents take raw adb. Several memories are actually
plugin bug reports: `per-app-avd-isolation`, `maestro-device-offline-adb-server`,
`served-page-is-not-your-code`, `on-device-proof-without-maestro`.

### 3.4 Fixes proven in an app don't flow back to the template
Today's two harness fixes exist only in the showcase: the e2eSmoke adb settle
(`kill-server`/`start-server`/`wait-for-device` — 0 hits in `template/qa/verify.mjs`) and
the golden-clock pinning policy (0 hits of `FakeTimeSignal|FixedClock` in
`template/…/HomeGoldenTreeTest.kt`). The 0.3.2 evidence fix *was* mirrored, so the channel
exists — but it depends on someone remembering. Every template user on macOS will re-hit
the false-red smoke.

## 4. Escaped-bug taxonomy — and which tier should have caught each

Legend: ✅ caught · 💥 escaped to a release or needed a human-triggered audit.

| Class | Instances | Why it escaped |
|---|---|---|
| **A. Android platform semantics** (alarms, notifications, lock screen, silent mode, PendingIntent identity, channels) | 💥 Fuelled: 6 notification defects, 4 latent since 0.3.0, found only because Karel said *"double check for bugs in the notificatiobs all round"*. 💥 Brat: "summons never rang — by construction" (1.4.0), "silent phone made no sound / lock-screen takeover never happened" (`0e69202`), emergency filter (`97f9b5d`) — 3 fix-releases to make the app's core feature actually alert. | **No evidence tier crosses the process boundary.** desktopTest is JVM; goldens are structure; Konsist is static; Maestro smoke taps UI but asserts nothing about notifications/alarms; tokenDrift is visual. `androidMain` is effectively test-invisible. |
| **B. DI / wiring reflection** | 💥 Fuelled: Koin `viewModelOf` ignores Kotlin defaults → runtime crash (caught by hand). 💥 Brat: "the app was running four copies of its own state" (`60ef0dc`). | Statically detectable; no Konsist rule exists for either shape. |
| **C. Harness self-trust** | ✅→💥 build-cache PASS replay (fixed 0.3.2); 💥 golden clock-dependence (green at 23:00, red by morning); 💥 adb transport races (4/4 false reds); 💥 preview daemon sharing the test output dir (`NoClassDefFoundError` cascade, 20+ bogus failures); 💥 Room schema history rewritten (`14.json`). | The evidence layer itself had no determinism/isolation guards. |
| **D. Tier gaps** | 💥 Brat: "two bugs only a release build could find" (`9341a6d`) — pre-0.11.0; compile now gated by `releaseBuild`, behavior still isn't. 💥 "two bugs only the real backend exposed" (`9edc308`). | Release-variant smoke doesn't exist; emulator-Firebase ≠ prod. |
| **E. Reachability / completeness** | 💥 Fuelled: meal editor shipped 12/12 green but unreachable by a user (`approved-means-complete-it` memory). | `stepReachability` proves automation reachability of what exists, not that the feature is wired into the shell nav. (FI-10 / task #115 tracks the template guard.) |

**The decisive fact for Class A:** brat hand-built an `androidInstrumentedTest` source set
in R6 ("the harness can finally see the Android seam", `1de52b6`) and it **immediately
caught two bugs** ("went unanswered note vanished — caught by the new seam"; "a summons
at an awkward moment could crash the app — found by the new seam", CHANGELOG Unreleased).
The template ships no such source set (`template/composeApp/src/` has none). The single
highest-value structural addition is already proven in production.

## 5. Tool-by-tool verdict (28 tools)

Cadence classes: **E**=per-edit, **F**=per-feature, **G**=per-genesis, **I**=per-incident.
"0" = zero calls in either app's transcripts.

| Tool | Calls | Cadence | Verdict |
|---|---|---|---|
| `preview_status` | 65 | E | Keep — the workhorse. |
| `preview` | 37 | G/E | Keep. |
| `preview_stop` | 26 | E | Keep (consider auto-stop on session end). |
| `preview_diff` | 5 | E | Keep — absorb `snapshot_save`/`snapshot_diff` into it. |
| `connect_live` | 7 | F | Keep — **rebuild as self-healing** (auto `adb forward`, app launch, health poll, transport reset; the four failure modes from this week become internal retries). |
| `navigate_and_inspect` | 7 | F | Keep — the live-tier verb. |
| `render_screen` | 6 | F | Keep (used for console design passes). |
| `inspect_tree` | 5 | F | Keep; fold `get_node` (1), `render_tree` (0), `layout_gaps` (0) into it as options. |
| `approval_status` | 6 | F | Keep — governance bridge. |
| `snapshot_variant` | 3 | G | Keep — genesis design candidates (low count is correct cadence). |
| `review_comments` / `resolve_comment` | 0 here | F | Keep — comment loop is a settled flow surface (genesis-era use predates these transcripts). |
| `db_query` | 0 | F/I | Keep but **teach**: CLAUDE.md never tells the agent when to reach for it (asserting persisted state in the live tier — exactly what brat needed for delivery receipts). One added CLAUDE.md paragraph or drop it next cycle. |
| `runtime_crashes` / `runtime_logs` | 0 | I | Keep **one** (`runtime_crashes`); agents grep logcat because CLAUDE.md's debugging story never mentions these. Same deal as `db_query`: teach or drop next cycle. |
| `snapshot_save` / `snapshot_diff` | 0 | — | Fold into `preview_diff` / lane goldens. Remove. |
| `assert_token` / `find_drift` / `diff_against_design_system` | 0 | — | Lane's `tokenDrift` owns this. Remove (keep at most one interactive `check_tokens` if the lane step's remediation output names it). |
| `audit_a11y` | 0 | — | Lane's `a11y` owns it. Remove. |
| `capture_screen` | 0 | — | Pixels are for humans; the live remote view serves that. Remove. |
| `db_schema` | 0 | — | Room schema JSONs are in-repo. Remove. |
| `relaunch_app` | 0 | — | Becomes an internal move of self-healing `connect_live`. Remove as a public tool. |
| `prove_change` | 0 | — | Niche covered by `preview_diff` (structure) + `navigate_and_inspect` (live). Remove. |

Net: **28 → ~15 public tools**, no capability lost — every removed verb's job has a named
owner (lane step or surviving tool).

## 6. Best-practice audit (agent-tooling architecture)

1. **Deterministic gates over diligence** — ✅ core strength; extend the gate to the one
   layer with no gate (Class A).
2. **The right path must be the cheapest path** — ✅ preview (adopted instantly);
   ✗ `connect_live` (lost to raw adb on reliability). Fix the tool, not the agent.
3. **Fail loud on missing capability** — ✗ the brat story. A capability the docs assume
   must be *checked*, and its absence must stop-and-remediate, not degrade silently.
4. **Small composable surface** — ✗ 15+ zero-use tools; consolidation above.
5. **Instructions at the point of need** — ✅ preview loop (proof: adoption);
   ✗ debugging/data-assertion (proof: zero use of `db_query`/`runtime_*` while agents
   grepped logcat and ran sqlite by hand).
6. **Evidence must attest execution** — ✅ 0.3.2; extend to determinism (clock pinning),
   isolation (preview vs. test build dirs), and history (frozen schema files).
7. **Lessons must flow to the platform** — ✗ four user memories are plugin bug reports;
   ✗ two of this week's fixes are showcase-only. The loop needs a mechanical step
   (release checklist item: "lesson audit — what did the app teach the template?").

## 7. The plan

Ordered by confidence-per-effort. Each item is a mechanical change or a named decision.

### Phase 0 — Pin the brat failure (½ day)
Scripted repro: fresh scaffold in a clean CWD, plugin loaded, assert `mcp__cmp-inspector__*`
tools resolvable via ToolSearch; test with stale plugin cache (0.9.0) vs current. Output:
one root-cause note + the fix (likely: `cmp-doctor` gains an **MCP connectivity check**, and
every skill that depends on the MCP gets a preamble guard: *"if ToolSearch finds no
cmp-inspector tools → STOP, run doctor's mcp check, report; do not fall back silently"*).
CLAUDE.md's "Without the plugin" paragraph becomes "If the tools are missing, that is a
fault to report and heal — here's how" with the fallback demoted below it.

### Phase 1 — Mirror the proven fixes into the template (½ day)
1. e2eSmoke adb settle (`kill-server`/`start-server`/`wait-for-device` post-install) —
   verbatim from `create-cmp-showcase/qa/verify.mjs`.
2. Golden determinism policy: exemplar golden test pins its clock; `docs/TESTING.md` names
   the rule; Konsist rule: no `RealTimeSignal()`/`Clock.System`/`TimeZone.currentSystemDefault()`
   **defaults** in ViewModel constructor params (the Fuelled bug shape, statically caught).
3. Preview daemon build-dir isolation (own output dir; kills the `NoClassDefFoundError` class).
4. Schema-history guard in the lane: Room schema JSONs for versions < current must be
   byte-identical to HEAD.
5. Koin wiring rule (Class B): Konsist — every VM constructor param with a default must
   have explicit `viewModel { }` registration (or ban defaults in VM constructors; decision below).

### Phase 2 — The Android behavior tier (the big one, ~2–3 days)
Template ships `androidInstrumentedTest` (the brat R6 seam, generalized): an
`androidChecks` lane step, device-tier gated like `e2eSmoke`, running instrumented tests +
notification/alarm assertions (posted-notification presence via `NotificationManager`,
alarm registration via `dumpsys alarm` parse, channel existence, full-screen-intent
capability). The exemplar feature gets one instrumented behavior test as the cloneable
pattern. This is the tier where all six Fuelled notification defects and brat's "never rang"
family become **catchable** — the seam provides reach; Phase 4's audit checklist is what
generates the specific assertions. Brat's own R6 seam catching two bugs on arrival is the
existence proof.

### Phase 3 — Tool surface & live tier (1–2 days)
Consolidation per §5 (28→~15); self-healing `connect_live`; CLAUDE.md gains the two
missing point-of-need paragraphs (crash triage → `runtime_crashes`; persisted-state
assertion → `db_query`); PreToolUse hook (template settings) on
`Bash(adb shell screencap*|*uiautomator dump*)` that *reminds* (not blocks): "the
inspector is connected — `inspect_tree`/`navigate_and_inspect` give you the semantic tree."
Retires the `on-device-proof-without-maestro` workaround memory.

### Phase 4 — Encode the audit that worked (1 day)
`cmp-audit` skill: adversarial subsystem audit against its spec + a platform-semantics
question list (alarm identity, channel policy, Doze, process death, permission grants,
reinstall/upgrade paths) — the exact shape of the human-triggered audit that found six
defects, as a repeatable verb, feeding findings into the existing change-flow (Audit is
already a stage in `docs/CHANGE-FLOW-DESIGN.md`; this implements it). Plus `specCoverage`
weighting: a clause about platform behavior cited only by a desktop test = flagged weak.

### Phase 5 — Acceptance replay (the loop-until-done gate)
Replay the full §4 bug inventory against the upgraded lane on both real repos: for each of
the 17 escaped bugs, name the step that now catches it or the documented tier boundary it
still sits behind (real-backend class D stays documented, not gated — decision below).
The plan is done when every row has an owner. Then cut the engine release and regenerate
both apps' `cmp:generated` blocks via the upgrade path.

## 8. Decisions — resolved 2026-08-19

**Standing constraint (Karel):** every change below is plugin/template-generic. Nothing may
encode Fuelled- or Brat-specific logic; the two apps are observations, not requirements.
The template serves thousands of unseen apps.

1. **DI/time rules (industry best practice):** (a) ambient time reads (`Clock.System`,
   `LocalDate.now`, `System.currentTimeMillis`) permitted only in the designated time
   provider (`core/time`) — the classic "inject the clock" rule, Konsist-enforced; kills
   golden clock-drift by construction. (b) ViewModels are registered with explicit
   `viewModel { }` factories; reflection-based `viewModelOf` is disallowed (documented
   Koin trap: constructor defaults are ignored). Brat's shared-vs-scoped VM bug is a
   scoping *intent* question no static rule can decide — it becomes an ARCHITECTURE.md
   policy note, not a gate.
2. **Release smoke (Karel: "don't wait hours per change — antipattern"):** profile-tiered.
   New `release` lane profile carries the expensive proofs (release-APK install + smoke,
   full instrumented suite); `local` stays as fast as today. Cost lands once, at ship time.
3. **Real backend:** documented tier boundary. No prod infra assumptions in a generic template.
4. **Tool removals:** approved as listed in §5.
5. **`db_query` / `runtime_crashes`:** teach (CLAUDE.md point-of-need paragraphs), measure
   one cycle, then keep or cut.

### Original decision questions (for the record)

1. **Class B rule shape:** ban defaults in VM constructor params (blunt, simple) vs.
   require explicit `viewModel { }` when defaults exist (precise, more Konsist work).
2. **Release smoke (Class D):** add an optional lane step installing the release APK and
   running the Maestro smoke against it (minutes of cost, catches R8-behavior bugs), or
   keep release at compile-gate only?
3. **Real-backend tier (Class D):** accept as documented boundary, or add an opt-in
   `--profile prod-smoke`?
4. **Tool removals in §5:** confirm the remove list (anything there you actually reach for?).
5. **`db_query` / `runtime_crashes`:** teach-then-measure for one cycle, or cut now?


## 9. Acceptance replay — every escaped bug gets an owner

Status legend: **landed** = in the working tree now · *pending* = owning change in flight.

| # | Escaped bug (app) | New owner | Status |
|---|---|---|---|
| 1 | PendingIntent identity collision — two logical alarms, one slot (Fuelled) | `AlarmAsserts.assertDistinctAlarms` (collision demonstrated live in the exemplar seam test) + `androidChecks` step + `cmp-audit` IDENTITY category | **landed** |
| 2 | `cancelAll` couldn't cancel dynamic keys (Fuelled) | `AlarmAsserts` registry parse + `NotificationAsserts.assertNoNotification` + `cmp-audit` CANCELLATION category | **landed** |
| 3 | Re-arm resurrected done-state (Fuelled) | `cmp-audit` STATE RE-ASK category (fire-time re-read, resurrect-after-complete) | **landed** |
| 4 | One notification channel for everything (Fuelled) | `NotificationAsserts.assertChannelExists` (importance floor) + `cmp-audit` DELIVERY category | **landed** |
| 5 | Delivery-time re-ask covered 1/13 reminders (Fuelled) | `cmp-audit` COVERAGE ARITHMETIC category (force the N-of-M count) + specCoverage tier line | **landed** |
| 6 | Lead reminders arriving after the event (Fuelled) | `cmp-audit` DELIVERY category (exactness windows / "before" arriving after) + seam assertability | **landed** |
| 7 | Summons never rang — arming filter (Brat) | instrumented behavior test at the seam (`androidChecks`, local+ci, device-presence opt-in) | **landed** |
| 8 | Silent phone → no sound; wrong audio stream (Brat) | `SystemState.withRingerMode` + `cmp-audit` DELIVERY (importance vs stream on silent/DND); manual tier honestly named in the helper header | **landed** |
| 9 | Lock-screen takeover never happened (Brat) | `NotificationAsserts.assertFullScreenIntentCapable` (API-34 gate handled) | **landed** |
| 10 | Koin `viewModelOf` ignores defaults → runtime crash (Fuelled) | **ARCH-14** (explicit `viewModel { }` only) + stamper emits explicit factories | **landed** |
| 11 | Four copies of app state — per-screen VM instances (Brat) | ARCHITECTURE.md §7 advisory scoping note (intent question; not statically gateable) | **landed** |
| 12 | Build-cache PASS replay | `--rerun` in lane (0.3.2) | **landed** (pre-existing) |
| 13 | Golden green at 23:00, red by morning — ambient clock (Fuelled) | **ARCH-13** (inject the clock) | **landed** |
| 14 | adb transport races → 4/4 false-red smoke (Fuelled) | e2eSmoke settle (shared helper, also guards `androidChecks`) | **landed** |
| 15 | Preview daemon vs desktopTest build-dir collision (Fuelled) | Mutual-exclusion markers (`.cmp-lane-in-progress` / `.cmp-render-in-progress`) — mostly pre-existing, verified honored; residual hole (hand-typed `gradlew desktopTest` vs running daemon) documented in inspector README, template-side guard tracked as follow-up | **landed** (residual tracked) |
| 16 | Room schema history rewritten (Fuelled) | `stepSchemaHistory` — frozen historical records | **landed** |
| 17 | Bugs only a release build could find (Brat) | `releaseBuild` (0.11.0) + `releaseSmoke` in the new `release` profile (proven: full release-profile lane PASS on a scratch scaffold) | **landed** |
| 18 | Bugs only the real backend exposed (Brat) | **Documented tier boundary** (decision 3) — named in TESTING.md's instrumented-tier section | **landed** |
| 19 | Feature green 12/12 but unreachable by a user (Fuelled) | FI-10 / task #115 template guard — tracked, out of this batch's scope | open (tracked) |
| 20 | MCP absent → silent pixel fallback (Brat) | doctor Inspector-MCP check group + fail-loud preambles in cmp-preview/cmp-inspect/cmp-test + CLAUDE.md "If the tools are missing" restructure + self-healing `connect_live` | **landed** |
| 21 | Plugin copy three weeks stale, nothing surfaced (both) | doctor staleness check (`git -C <copy> log HEAD..origin/HEAD`, "N commits behind" + remediation) | **landed** |

**Replay complete 2026-08-19: 20 of 21 rows landed; row 19 (feature-reachability guard)
remains tracked as task #115 / FI-10 — pre-existing, explicitly out of this batch.**
Batch gate: 830/830 engine+inspector tests, instrumented seam proven on a live emulator
(3/3, including the alarm-collision demonstration), full `--profile release` lane PASS on
a scratch scaffold.


## 10. Roadmap beyond this batch — ideas held against the vision (2026-08-19)

Each idea resolves against VISION.md's principles (pixels-to-humans/structure-to-agents;
the gate is the business; billing boundary = assurance boundary; strongest-true-case
honesty; trigger-gated building). Nothing here is built; each names its trigger.

1. **Time-warp alarm proof** — the one honesty gap left in the alerting story: "the
   ladder is unit-tested to the minute, but nobody watched a notification arrive"
   shipped in a release note three times. The seam can close it: qa-prep prefers a
   rootable AOSP emulator image for the QA AVD, a `TimeWarp` helper sets the device
   clock to T−1min, and the instrumented test asserts the notification posts. This is
   an *execution-bound evidence* differentiator no scaffold ships. Spike first: verify
   clock-set mechanics per API level. **Trigger: next app with scheduled alerting.**

2. **The evidence ladder, named** — receipts already grade themselves
   (`desktop-only` → `on-device: …+androidChecks` → release profile). Formalize the
   rungs (L0 scaffold / L1 desktop / L2 device / L3 release), render the rung in the
   console and README badge, and make the release commit's receipt name it. This is
   the vocabulary the Evidence business sells in (billing boundary = assurance
   boundary). Cheap: naming + rendering. **Trigger: first Gatekeeper Evidence
   conversation, or the next engine release — whichever lands first.**

3. **Fleet check before release** — 0.11.0's headline bug was "the release build had
   never once been run"; this batch's equivalent proof (stamp scratch app → full lane
   incl. androidChecks on an emulator) was done by hand. Encode as
   `scripts/fleet-check.mjs` + an npm-publish skill step. A notary caught overclaiming
   is dead; this is the anti-overclaim gate for the harness itself. **Trigger: next
   engine release (run it manually then; script it if it hurts).**

4. **Harness upgrade for stamped apps** — the reverse of §3.4: when the engine moves,
   stamped apps' `cmp:generated` blocks and qa/ scripts age. Extend the upgrade path
   to diff-and-regenerate them (version sets already covered). The pilot is
   regenerating the two real apps after this batch's release. **Trigger: this batch's
   release.**

5. **Flight recorder** — this retrospective was only possible because session
   transcripts happened to exist. The harness can observe its own adoption: an
   append-only in-repo journal (lane runs, SKIP reasons, capability probes,
   degraded-path activations) and a `qa/retrospective.mjs` that answers "did this
   project drift from its tooling?" mechanically. In-repo only, app-owned, no
   phone-home. **Trigger: the next retrospective request — do not build speculatively.**

6. **Determinism probe** — ARCH-13 statically bans ambient time in app code, but a
   library can still read the wall clock. A ci-profile option runs unit+golden tests
   twice under maximally-shifted TZ (UTC vs UTC+14); differing outcomes = a
   nondeterminism leak the static net missed. **Trigger: first golden flake that
   ARCH-13 didn't prevent.**

7. **Audit cadence** — cmp-audit exists but fires on human request, like the audit
   that found the six defects. Cheapest mechanical nudge: the release profile's
   receipt lists subsystems whose androidMain changed since the last recorded audit.
   **Trigger: after cmp-audit's first real-app outing proves the question bank.**

8. **iOS is the known asymmetry** — every behavior-tier capability is Android-only;
   the platform-semantics bug class exists identically on iOS (UNUserNotificationCenter,
   background modes). Named here deliberately and NOT built: no iOS app evidence yet
   (evidence-or-silence), and building ahead of signal violates trigger-gating.
   **Trigger: first real iOS-enabled app reaching its alerting feature.**

Landed this session as part of "all suggestions in": the SessionStart capability-contract
banner (every session learns the contract, not just skill-invoked ones) and the
PreToolUse structured-eyes reminder on `screencap`/`uiautomator dump` — both test-pinned
in `test/harness-surfaces.test.mjs`.
