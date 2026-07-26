# Autonomy gaps — what stopped the agent working unattended

Findings from the first end-to-end run of the governed change flow: the `meal`
feature on `create-cmp-showcase` (2026-07-25/26), brief → design → spec → build
→ prove → sign, three build slices, human decisions made in the studio console.

The feature shipped. The question this document answers is narrower and more
useful: **at every point the agent had to stop, wait, or redo work — why, and
is that cost real governance or an accident of the implementation?**

Every entry carries the evidence that produced it. Entries that are correct
by design are recorded as such and closed, not left as open complaints.

---

## 1. Machine-read metadata lives inside the human's signed bytes

**Evidence.** `computeArtifactHash` (`template/qa/lib/approvals.mjs:541`) hashes
a feature brief with `hashArtifactFiles` — raw file bytes. The `cmp:feature`
declaration block is part of those bytes. Adding the *required* `"screens": true`
declaration to `docs/features/meal.md` moved `feature-brief:meal` from
`202cc64b` → `0f77f5ff` and forced a human re-approval of a brief whose prose,
decisions, and rationale had not changed by one word.

**Why it blocks autonomy.** The agent cannot add mandatory machine-read metadata
to a signed brief without manufacturing a human decision point. Tonight that
cost one avoidable re-approval, in the middle of a build.

**Fix — the precedent is in the same file.** `hashArchitectureArtifact` already
strips `cmp:generated` sections before hashing, *precisely* so a mechanical
regeneration never invalidates a signature. Do the same for the brief: strip the
` ```json cmp:feature ` block before hashing. The human signs reasoning; the
block is declaration, and the artifact hashes it governs already enforce.

**Refuter.** *Could an agent smuggle a decision through an unhashed block?*
`touches` and `screens` are declarations that the harness independently verifies
(hashes enforce blast; disk presence enforces the design gate). Neither can
authorise anything. If a future field could, it does not belong in the block.

**Status: FIXED (2026-07-26).** `hashFeatureBriefArtifact` in
`template/qa/lib/approvals.mjs` hashes the brief EOL-normalized with the block
stripped (`stripFeatureBlock`, feature-brief.mjs — one grammar, shared with the
parser). Legacy raw-bytes approvals keep verifying via a byte-identical
fallback, which can only ever vouch for content unchanged since signing.
Pinned by `test/autonomy-hash-surface.test.mjs`.

---

## 2. Accepting a proven feature invalidates the proof that permitted acceptance

**Evidence.** `VERIFIED_SURFACE` (`template/qa/lib/inputs-hash.mjs:22`) includes
`qa`, excluding only `qa/evidence` and `qa-artifacts`. So `qa/approvals.json`
and `qa/comments.json` are inside the hashed surface. Observed consequences:

- Human clicks **Accept** → `accepted: true` written → `--status` immediately
  reads *"all clauses cited and receipt PASS, but it attests an older tree"*.
  Required a third full lane run and an extra commit (`b55dfa9`).
- Agent resolves an advisory comment (`c3`, the hand-off note) → receipt
  invalidated → second full lane run.

**Why it blocks autonomy.** Closing the loop *costs the proof of the loop*. Each
hand-off click and each resolution note bought a ~4-minute lane re-run. Three of
tonight's lane runs existed only to re-attest a tree whose **code had not
changed**.

**Fix, in two parts.**

- **`qa/comments.json` should leave the surface entirely.** The module's own
  stated principle is *"every tracked file whose content can change the lane's
  verdict"* (`inputs-hash.mjs:21`). There is no comments step in the lane;
  comments are explicitly advisory. Including them contradicts the rule the file
  states about itself.
- **`qa/approvals.json` must stay hashed** — it gates. But hash the *gating*
  fields (`artifact`, `status`, `hash`) rather than the whole file, so ledger
  bookkeeping (`accepted`, `acceptedAt`, `via`, `reopenedAt`) does not invalidate
  evidence. Acceptance is a bookend recorded *after* proof; it must not destroy
  it.

**Refuter.** *Does excluding acceptance let an agent fake it?* No: `acceptFeature`
refuses unless doneness derives from clauses + receipt + tree hash, and that
check runs before the write. The field records a decision; it never gates one.

**Status: FIXED (2026-07-26).** In the receipts SSOT
(`packages/receipts/src/inputs-hash.mjs`, vendored to `template/qa/lib/`):
`qa/comments.json` is excluded from the surface, and `qa/approvals.json` is
hashed by gating-field projection — `artifact`, `status`, `hash`,
`exemplarFeature` — with an unparsable ledger falling back to raw bytes.
Pinned by `test/autonomy-hash-surface.test.mjs`.

---

## 3. Nothing catches "built, verified, and unreachable"

**Evidence.** `MealTrayScreen.kt` passed clause coverage, conformance, goldens,
a11y, token drift and on-device smoke, and was **accepted** — while `grep`
showed `MealTrayRoute` referenced by nothing but its own tests: no `Screen`
object, no `Routes` constant, no `AppNavHost` destination. A user opening
Fuelled could not add a meal.

**Why it blocks autonomy.** Worse than a stop — it produced a *confident false
green*. The agent reported a feature complete because every gate it had said so.
The user had to ask "is the feature implemented now?" to discover otherwise.

**Fix.** A reachability gate in the harness's existing parity idiom (cf. the
`componentStories` step and IMP-1's PreviewRegistry parity): fail the lane when a
presentation feature screen is not reachable from the navigation graph, unless
explicitly declared intentionally unrouted. Tracked as task **FI-7 (#112)**.

**Root cause, which is authoring not tooling.** `specs/meal.spec.md`'s scope note
carved M3 down to "the tray" and omitted how a user reaches it. The brief had
opened with *"I need to be able to actually add meals."* **Brief and spec
drafting must cover the entry point by default** — a screen nobody can navigate
to is not a delivered feature.

**Status: FIXED (2026-07-26).** `template/qa/lib/reachability.mjs` +
`stepReachability` in both lane profiles: a `presentation/<feature>/*Screen.kt`
whose `*Screen`/`*Route` entry composables are referenced nowhere in commonMain
outside the feature's own directory FAILs the lane; preview-registry references
(desktopMain) deliberately do not count. Escape hatch is a declaration:
`{ "unrouted": true }` in the brief's block. Pinned by
`test/reachability.test.mjs`; the exact pre-wiring meal state is a fixture.
Side-finding, ALSO FIXED: a scaffold whose `--tabs` omitted a shipped default
feature left that feature's files on disk unwired, which the new gate honestly
flagged. `rewriteTabSurfaces` now removes it — `profile` only, a self-contained
stub; `home` is never stripped (the governed exemplar, and it owns the
unconditionally-registered `DetailScreen`, so it stays genuinely reachable with
no tab of its own rather than being exempted by declaration).

---

## 4. The preview daemon and every other Gradle task fight over caches

**Evidence.** DF-4 fixed the preview-daemon ↔ *verify-lane* collision. It is not
fixed for anything else:

- A `desktopTest --rerun` started seconds after a console restart produced three
  spurious failures — `NoClassDefFoundError: TodayViewModel` in
  `TodayViewModelTest`, `TodayGoldenTreeTest`, `TodayScreenTest` — and a short
  test count (122 vs 131), because those classes never initialised. Re-run
  uncontended: 131/131 green.
- A build agent could not run `renderScreens` **at all**, failing five times with
  `FileNotFoundException: composeApp/build/kspCaches/desktop/desktopMain/symbols`
  while the hot-reload continuous build (`-Dcompose.reload.build.continuous=true`)
  deleted and recreated that directory underneath it.

**Why it blocks autonomy.** It manufactures **false reds**, which are the most
expensive possible failure for an unattended agent — indistinguishable from real
ones without a human-grade judgement call. It also forces a choice between the
console (the user's live view, and the agent's eyes) and running any Gradle
task, because clearing the caches means stopping the daemon and killing the
console's renderer. The console was restarted six times tonight for this reason
alone.

**Fix.** Give the preview daemon its own `--project-cache-dir` so its
incremental state cannot alias the lane's, or expose a pause/resume on the
preview service that tooling can serialise against. Until then, every automated
run must stop the console first — which is exactly the coupling to remove.

**Status: FIXED for the harness's own surfaces (2026-07-26).** The daemon
stamps `composeApp/build/.cmp-render-in-progress` (mtime-refreshed on
activity) for the duration of its Gradle work; the lane's `shGradle` waits for
it to clear or go stale (5-minute freshness window, 3-minute wait cap) — the
symmetric half of the DF-4 lane marker the daemon already respects. The
self-heal retry remains as the last line. HONEST RESIDUAL: an ad-hoc
`./gradlew` run outside `shGradle` (an agent invoking `desktopTest` directly)
is still uncoordinated — it should check the marker, or expect the KSP
self-heal to catch the collision.

---

## 5. The console reports healthy while it is blind

**Evidence.** After a `./gradlew --stop` (the sanctioned stale-cache remedy),
port 9600 kept answering **HTTP 200** while every render since had failed:
`render FAILED: Command failed: ./gradlew :composeApp:renderScreens`. The page
looked fine. The user had to say *"the console is disconnected"* — the agent had
no signal, having checked the status code, which proves nothing.

**Why it blocks autonomy.** The agent's eyes can die silently, and it will keep
reporting on stale pixels believing they are current.

**Fix.** Surface renderer health where it is already being tracked: last render
outcome and its age in `/api/status` and on the page. The rail already has the
vocabulary for this — Screens goes red on render/compile failure — but a *dead
renderer* is a different condition from *a compile error*, and only the second
is currently visible.

**Status: FIXED (2026-07-26).** The preview service tracks every render
attempt (`lastOutcome` / `lastSuccessAt` / `lastAttemptAt` /
`consecutiveFailures`, independent of the compile watchdog's `lastError`) and
surfaces the `renderer` object in `/api/status` and the `preview_status` MCP
tool; the console page shows an amber "Renderer down since … — screens below
are stale" banner, distinct from the red compile-error banner. Agent
discipline stays: check `renderer.lastOutcome`, never a status code.

---

## 6. `qa/verify.mjs` treats any unknown flag as "run the lane"

**Evidence.** An agent ran `node qa/verify.mjs --help` expecting usage; the full
lane started and had to be killed after ~2 minutes.

**Why it blocks autonomy.** A typo silently burns minutes and can collide with
the preview daemon (§4). It also contradicts the refusal-over-fabrication stance
every other `qa/` CLI takes — `qa/approve.mjs` refuses an unknown artifact by
name.

**Fix.** Real `--help`; refuse unknown flags with a non-zero exit naming the
flag. Already queued as a background task.

**Status: FIXED (2026-07-26).** `--help`/`-h` prints usage and exits 0 before
anything runs; an unknown argument exits 2 naming it. Live-verified on the
showcase (`--bogus` → exit 2 in under a second, no Gradle started).

---

## Correct by design — recorded so they are not "fixed" later

- **The agent holds no signing verb.** Four human decisions (brief, design,
  spec, acceptance) are the product. Reopen is agent-may-do on the human's word;
  approve is not, and running `qa/approve.mjs` on the human's behalf would forge
  a decision into an audit ledger. This is not a gap.
- **The design gate stopping the build.** It cost one deliberate re-approval and
  earned it: MEAL-09/10 forced the tray past the signed shape, and the gate also
  kept two build slices from silently editing an approved screen. Working as
  intended.
- **A red lane on drift.** The single `approvals` FAIL in an otherwise green lane
  was the honest reason the feature could not ship. Working as intended.

---

## Ranked by cost to unattended work

| # | Gap | Cost observed | Kind |
|---|---|---|---|
| 3 | No reachability gate | shipped a false green; feature unusable | missing gate |
| 4 | Gradle cache contention | false reds; renderScreens unavailable; 6 console restarts | environment |
| 2 | Ledger writes inside the hashed surface | 3 lane re-runs, 2 commits, no code changed | hash surface |
| 5 | Console healthy-while-blind | user had to report the failure | observability |
| 1 | `cmp:feature` block inside signed bytes | 1 avoidable human re-approval | hash surface |
| 6 | `verify.mjs` unknown-flag | ~2 min, once | CLI hygiene |

**The pattern.** None of these is the governance being too strict. Four of six
are the *verified surface* and the *build environment* being drawn imprecisely —
hashing things that cannot change a verdict, and letting two Gradle clients share
one cache. Fixing them removes roughly three lane re-runs, one human
re-approval, and every false red from a run like tonight's, without weakening a
single gate.

---

## Resolution — all six closed (2026-07-26)

Every gap above now carries a **Status** line. All six were fixed the day after
they were logged, live-tested by finishing the `today` feature on the showcase
with the console running throughout. One honest residual (§4: ad-hoc Gradle
runs outside `shGradle`) and one side-finding (§3: scaffold leaves unconfigured
default-tab features on disk) are recorded in place and tracked as their own
tasks. The prediction in "The pattern" held: no gate was weakened.
