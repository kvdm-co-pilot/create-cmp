---
name: cmp-audit
description: >-
  Adversarial audit of one subsystem of a Kotlin/Compose Multiplatform app against its spec
  AND against platform semantics — the class of defect desktop-tier tests cannot see
  (alarms, notifications, PendingIntents, channels, reboot, process death, DST). Use this
  when the user says "audit the notifications", "double check X for bugs", "adversarial
  review of <subsystem>", "platform audit", "are there latent bugs in the alarms/reminders",
  "review the scheduling code for edge cases", "would this survive a reboot", or names a
  subsystem they want interrogated rather than extended. Reads the spec clauses, the
  implementation across ALL source sets (commonMain AND androidMain/iosMain — platform code
  is where JVM tests are blind), and the tests; interrogates them with a platform-semantics
  question bank (identity, lifecycle, cancellation, delivery, state re-ask, permissions,
  coverage arithmetic); kills its own findings before reporting; and lands each survivor in
  the project's change flow as a spec amendment + failing-test-first fix proposal or a named
  human decision — never a direct unreviewed fix to a signed artifact.
---

# cmp-audit — interrogate one subsystem until it confesses

Your job: take one subsystem and try to break it on paper — the audit that finds the bugs
the lane structurally cannot, because they live below the JVM seam (platform scheduling,
notification delivery, process lifecycle) or between clauses the spec never wrote. The
output is evidence, not vibes: every finding is a file:line and a concrete failure scenario,
survived a refuter pass, and lands in the project's normal change flow.

## 1. Scope — one subsystem, three bodies of evidence

The user names the subsystem ("the notifications", "reminders", "sync") or you infer it from
their words — confirm the inference in one sentence before reading. Then read, completely:

1. **Its spec clauses** — every `specs/*.spec.md` clause that governs the subsystem's
   behavior (and note what the spec is silent about; silence is where defects live).
2. **Its implementation across ALL source sets** — `commonMain` AND `androidMain` /
   `iosMain`. Platform code is where desktop-tier tests cannot see; an audit that reads
   only common code audits the part that was already testable.
3. **Its tests** — which clauses they cite, which source set they run in, and therefore
   which claims are actually exercised versus merely asserted in prose.

## 2. Interrogate — the platform-semantics question bank

Ask these against the code you just read. They are questions, not checkboxes: each one is
answered with a file:line or with "not applicable because …" — never with a tick.

**IDENTITY — do two logical things ever share one platform identity?**
- Android `PendingIntent` equality is requestCode + `filterEquals` — **extras do not
  count**. Do two logically distinct intents differ only in extras?
- Notification identity is tag+id. Can two different logical notifications compute the
  same pair and overwrite each other?
- Alarm/job/work identity: is the id derived from the domain key, or from something that
  collides (a constant, an index, a truncated hash, an id that gets reused after delete)?
- If identity is derived from a mutable field, what happens when that field changes —
  does the old identity leak, unreachable?
- Is there a documented id-space partition, or could two features' ids collide?

**LIFECYCLE — what does the platform do to you?**
- Reboot: is everything scheduled re-registered on `BOOT_COMPLETED` (alarms do not
  survive reboot)? From what source of truth, and is that source still correct then?
- Process death: is any needed state held only in memory when the callback fires?
- App update (`MY_PACKAGE_REPLACED`): same question as reboot — who re-arms?
- Timezone change / DST transition / date rollover while the app is open: are "tomorrow
  at 08:00"-style times stored as wall-clock or epoch, and which did the user mean?
- Doze / app standby: does delivery assume the device is awake? Which windows apply?

**CANCELLATION — can everything created be found and destroyed?**
- For every create path, point at the cancel path. Symmetry is the claim; show it.
- Can a thing be cancelled after the DB row that spawned it is gone — or does cancel
  recompute an identity from data that no longer exists?
- Does "cancel all" actually enumerate all — including ids generated dynamically since
  the enumeration was written?
- Re-arming after an edit: is the OLD identity cancelled before the new one is armed, or
  do both now fire?

**DELIVERY — will it actually reach the human, in the state they're in?**
- Channels: whose off-switch is it? One channel for everything hands the user a single
  all-or-nothing switch; is the channel partition per-category as the spec implies?
- Importance vs stream routing: what happens on silent mode and DND? Does the sound come
  from the stream the use case demands (alarm vs notification)?
- Exactness: which alarm API is used, what lateness window does it permit, and can a
  "remind me BEFORE X" arrive AFTER X within that window?
- Lock screen: if the feature claims to take over the screen, does it hold the
  full-screen-intent capability, and what happens when that permission is denied?
- Grouping/rate limits: can a burst collapse or drop the one that mattered?

**STATE RE-ASK — does delivery-time code re-check that the thing is still wanted?**
- Between scheduling and firing, the world changes. At fire time, is the triggering
  entity re-read — or does the callback trust its years-old extras?
- Does the re-check cover EVERY kind of trigger, or only the kind that was easy?
- Completion/undo: can a fired-then-completed thing be resurrected by a later re-arm?

**PERMISSIONS — which grants gate the path, and what happens ungated?**
- List every permission/capability on the path (notifications, exact alarms, full-screen
  intent, background start). For each: what does the code do when it is denied — degrade
  loudly, degrade silently, or crash?
- Are grants re-checked at use time, or only at onboarding (the user can revoke any time)?

**COVERAGE ARITHMETIC — force the count.**
- "The re-check covers N of M" — count the instances. How many trigger kinds / reminder
  types / entry points exist, and how many does each guard actually cover? A guard that
  covers 1 of 13 is a finding with a number, not a feeling.
- Same arithmetic for tests: how many of the subsystem's clauses are exercised only from
  desktop-tier tests (the lane's specCoverage tier line gives the number)?

## 3. Discipline — non-negotiable

- **Evidence-or-silence.** Every finding cites file:line and states the concrete failure
  scenario as inputs → wrong outcome ("two reminders for the same entity compute
  requestCode 0 → arming the second cancels the first"). No file:line, no finding.
- **Refuter pass before reporting.** For each candidate finding, actively try to kill it:
  is there a guard elsewhere? does the platform actually behave as assumed? is the
  scenario reachable? Report only survivors, each marked **CONFIRMED** (reproducible or
  proven from code) or **PLAUSIBLE** (needs a device test to settle).
- **Convert-or-cut.** Each survivor lands as exactly one of: a spec-clause amendment plus
  a failing-test-first fix proposal, or a named human decision ("is one channel per
  category the intent? — decide"). No standing prose, no "consider reviewing" residue.

## 4. Output — findings feed the change flow

Findings enter the project's normal change flow — a feature brief / spec amendment per
`docs/CHANGE-FLOW-DESIGN.md` — **never** direct unreviewed fixes to signed artifacts. The
audit's deliverable is the interrogation record: per finding, the category, the file:line,
the scenario, CONFIRMED/PLAUSIBLE, and its convert-or-cut landing.

If the project has the instrumented seam (`androidInstrumentedTest`), every PLAUSIBLE
platform finding should propose the instrumented test that would settle it — the seam
exists precisely so platform claims stop being unfalsifiable.
