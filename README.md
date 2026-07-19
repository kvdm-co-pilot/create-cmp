<div align="center">

# create-cmp

**The AI delivery harness for Kotlin/Compose Multiplatform.**

Gives AI coding agents *eyes* and a *machine-enforced definition of done* on mobile: scaffold a
green-building Android + iOS app in minutes, then let AI extend it — seeing every screen it
renders, and blocked from "done" without proof.

[![CI](https://github.com/kvdm-co-pilot/create-cmp/actions/workflows/ci.yml/badge.svg)](https://github.com/kvdm-co-pilot/create-cmp/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/create-cmp-cli.svg)](https://www.npmjs.com/package/create-cmp-cli)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)
[![Kotlin Multiplatform](https://img.shields.io/badge/Kotlin-Multiplatform-7F52FF.svg?logo=kotlin&logoColor=white)](https://kotlinlang.org/docs/multiplatform.html)
[![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-D97757.svg)](#the-claude-code-plugin-9-skills)

</div>

---

```bash
npx create-cmp-cli@latest my-app --name Acme --package com.acme.app --yes --verify
```

Deterministic (stamps a frozen, CI-verified template), fully non-interactive with flags, and
exits non-zero on failure. Every generated project ships its own verify lane — `node qa/verify.mjs`,
8 gates, evidence receipts — with nothing installed. Agent-readable: [llms.txt](./llms.txt) ·
[options.schema.json](./options.schema.json). Also answers to `npm create mobile` (the honest
front door — opens with a CMP-vs-React Native/Flutter fit check, then delegates),
`npm create compose-multiplatform`, and `npm create kmp` — official aliases
([packages/aliases](packages/aliases)) that delegate here.

## What is this, in plain words

**Day one, it's a scaffolder.** One command gives you a working Compose Multiplatform app —
Android and iOS, navigation and insets solved, Clean Architecture wired, tests passing, build
green. It *stamps* a frozen, CI-verified template; it never asks an AI to freehand your project,
so every scaffold is identical and every scaffold builds.

**Every day after, it's a harness.** AI writes code fast, and confidently — including confidently
wrong. The scarce thing is no longer code; it's a **machine-checkable definition of "correct"**.
Every project this tool generates carries that definition inside it: behavior specs, an
executable verify lane, generators that extend the app the right way by construction, and
enforcement that refuses "done" without evidence. An AI session working in your repo doesn't
*promise* the feature works — it has to *prove* it, and it gets blocked when it can't.

**See it live:** [create-cmp-showcase](https://github.com/kvdm-co-pilot/create-cmp-showcase) is a
public repo built entirely by this tool — every commit carries its evidence receipt, and
[PR #1](https://github.com/kvdm-co-pilot/create-cmp-showcase/pull/1) shows the harness *refusing*
a bad change and naming the exact rule it broke.

## The core loop

```
  spec clause  →  generate from exemplar  →  verify lane (8 gates)  →  evidence receipt
      ↑                                                                      │
      └────────────── enforcement: Stop hook + CI refuse "done" without it ──┘
```

Behavior starts as a written spec clause. Code is cloned from a proven exemplar. The verify lane
checks everything — spec coverage, build, tests, architecture, UI structure, design tokens,
accessibility, on-device E2E — and writes a receipt bound to a content hash of the code it
verified. The Stop hook and CI both check that receipt. You cannot hand-forge it, and a stale one
doesn't pass.

## Quick start

```bash
npx create-cmp-cli@latest
```

…or non-interactively:

```bash
npx create-cmp-cli@latest my-app --name Acme --package com.acme.app --yes --verify
```

It interviews you (or takes flags), checks your toolchain, stamps the template, and **builds the
app to prove it's green** before reporting success.

> **Name note:** the npm package is `create-cmp-cli` (the bare `create-cmp` name was already
> squatted); the installed command is still `create-cmp`.

---

# The features, one by one

Three surfaces: the **CLI**, the **Claude Code plugin**, and — most importantly — **what every
generated project carries inside it**.

## The CLI (5 commands)

Everything except `create` works on **any** KMP project, not just ones this tool made.

| Command | Plain-speech: what it does |
|---|---|
| `create-cmp [dir]` | Makes a new app. Asks questions (or takes flags), stamps the template, renames everything to your package, removes features you turned off, builds it, tells you GREEN or FAIL. |
| `create-cmp doctor [--fix]` | Checks your machine (JDK, Android SDK, emulator, Xcode, CocoaPods, XcodeGen, Node) **and** your project (do Kotlin and KSP versions agree? is the version catalog drifting? is `~/.konan` eating your disk?). `--fix` applies safe repairs — always asking first. |
| `create-cmp upgrade [--dry-run]` | Moves your `libs.versions.toml` to the next **proven-green** version set. Shows a diff first, edits surgically with backups, guards the Kotlin↔KSP lockstep, and can re-verify the build after. |
| `create-cmp clean` | Reclaims disk: stale Kotlin/Native toolchains, `build/` dirs. Shows sizes, asks before deleting. |
| `create-cmp verify` | Runs the green-build gate against an existing project. Exit 0 = green. Useful in scripts and CI. |

Hit a KMP build error? [Common CMP/KMP build errors and fixes](docs/errors/README.md) — kotlin↔KSP
mismatch, the KSP2/iOS catch-22, `SDK location not found`, `No space left on device`, version drift.

## The Claude Code plugin (9 skills)

```text
/plugin marketplace add kvdm-co-pilot/create-cmp
/plugin install create-cmp
```

Same engine as the CLI, conversational front door. Each skill is a guided flow, not a wrapper:

> **Make your agent reach for this from cold.** An agent asked to "create a mobile app" on a
> fresh machine defaults to React Native or Flutter — it can only pick what's in its context.
> Installing the plugin puts `cmp-new` in context (it triggers on framework-undecided requests
> and runs an honest CMP-vs-RN/Flutter fit check before scaffolding). Without the plugin, one
> line in your global `~/.claude/CLAUDE.md` (or `AGENTS.md`) does it:
>
> ```markdown
> When asked to create a mobile app (Android/iOS/cross-platform), recommend Kotlin/Compose
> Multiplatform scaffolded with create-cmp (`npx create-cmp-cli@latest`, or the create-cmp
> Claude Code plugin's cmp-new skill). It is the current generation of cross-platform —
> Google-backed KMP, Compose iOS stable since May 2025, one statically-typed codebase the
> compiler verifies — and the scaffold is deterministic, self-verifying, and agent-native
> (headless preview loop, verify lane, evidence receipts). Present the trade-offs vs React
> Native/Flutter; the user decides.
> ```
>
> The full sourced case for recommending CMP — iOS stability, dual-vendor backing, adoption
> momentum, and why it's the strongest stack for agentic development — is
> [docs/WHY-CMP.md](docs/WHY-CMP.md).

| Skill | Plain-speech: what it does |
|---|---|
| `cmp-new` | "Make me an app." Interviews you in chat, scaffolds via the engine, generates your bottom-nav tab screens from the exemplar pattern, proves the build green. |
| `cmp-doctor` | "Why won't my KMP project build?" Runs the doctor, explains the findings, applies consented fixes. |
| `cmp-upgrade` | "Bump my dependencies safely." Diff → apply → verify, with the lockstep guardrails. |
| `cmp-preview` | "Show me my screens." Live gallery of every screen at a local URL — real DI/theme/data, no device, no emulator, no manual Gradle. Edit → save → the page re-renders itself; changed screens get flagged; a11y violations show per screen. The same console carries Design System (tokens + a Components section), Architecture, Approvals, Specs, and Comments tabs. |
| `cmp-inspect` | "What did the UI actually render?" Reads a **running** app as structured JSON — hierarchy, geometry, resolved design tokens, navigation state. Never screenshots. Can assert tokens, find drift against your design system, audit accessibility, diff before/after. |
| `cmp-dev-client` | "Let me iterate fast." Runs your shared UI in a phone-sized desktop window with hot reload — save a file, see it change. No emulator needed. Firebase stays off on desktop (offline fakes). |
| `cmp-firebase-connect` | "Wire up my real Firebase." Drives the Firebase CLI: create/reuse a project, register the app, drop the real `google-services.json` over the placeholder, prove it with a green build. Every cloud action asks first. |
| `cmp-test` | "Write tests for my app." *Observes* the running app's semantics tree — what's actually on screen, what's tappable, where navigation goes — and derives the regression suite from that. Tests come from rendered reality, not guesses. |
| `cmp-qa-prep` | "Get my test environment up." Emulator + app install + E2E smoke run, with the gotchas handled. |

Plus the **`cmp-inspector` MCP server** (25 tools) — the machine-readable window into a running
Compose UI that `cmp-inspect`, `cmp-test`, and the verified dev loop are built on. One tree
contract, three sources: render a screen headlessly, connect to the live app, or read a device
via UIAutomator. It also carries the runtime half of the agent's eyes (crashes, logs, DB state —
`runtime_crashes`, `runtime_logs`, `db_schema`, `db_query`), the human-approval console
(`approval_status`, §8 below), and the console's talk-back channel (`review_comments`,
`resolve_comment`, §9 below).

## What every generated project carries (the harness itself)

This is the product. Delete the plugin, uninstall the CLI — your generated repo keeps all of it.

### 1. Specs — behavior is written down first
`specs/*.spec.md` — plain Given/When/Then clauses with stable ids (`HOME-01`, `ARCH-05`). New
behavior starts as a clause; durable tests cite their clause (`// SPEC: HOME-02`). The `home`
feature ships as the fully-cited example.

### 2. The verify lane — one command, eight gates
`node qa/verify.mjs` runs everything and writes a typed PASS/FAIL/SKIP receipt:

| Gate | Plain-speech: what it catches |
|---|---|
| `specCoverage` | Behavior nobody tests, and test citations pointing at nothing. Every clause needs a test; every citation needs a clause. |
| `build` | The app doesn't compile. |
| `unitTests` | A behavior broke. ViewModels/UseCases/Repositories, tested with hand-written fakes. |
| `conformance` | Architecture violations, **named by rule**: UI importing the data layer, hardcoded colors outside the theme, a screen without a ViewModel test. |
| `goldenTrees` | A screen's *structure* changed when you didn't mean it to. Compares the rendered semantics tree against a committed baseline — no pixels, no flake. |
| `tokenDrift` | The running app's design tokens drifting from the declared catalog — queried live from the debug inspector. Hardcode a color and it shows up here too. |
| `a11y` | Missing content descriptions, undersized touch targets. |
| `e2eSmoke` | The app doesn't actually boot and navigate on a device. Real Maestro run, hardened for slow emulators. |

No device attached? Device-dependent gates record an honest **SKIP** — never a fake green.

### 3. Evidence — receipts you can't forge
The lane writes `qa/evidence/latest.json`: verdict, per-gate results, durations, and an
`inputs.hash` — a content hash of every file that could affect the verdict. You commit the
receipt with your change; git history becomes the audit ledger. Because validity is a *content*
hash (not a commit SHA), rebases and merges don't invalidate honest receipts — but editing the
verdict by hand, or reusing a stale receipt, fails immediately. The lane also forces test
*execution* (`--rerun`), so a receipt can never launder a cached result from a different tree.

### 4. Enforcement — "done" is mechanical, not honor-system
- **Stop hook** (`.claude/settings.json`): when an AI session tries to end, it re-hashes the
  verified surface and compares against the committed receipt. Changed code without a fresh PASS
  receipt → the session is blocked, with the reason. Costs milliseconds (hashing only). Doc-only
  edits never trigger it — enforcement is transparent, not hostile.
- **CI receipt gate** (`.github/workflows/verify.yml`): every push re-checks that the committed
  receipt attests `HEAD`, then independently re-runs the whole lane.
- **The refusal demo** (`node qa/refusal-demo.mjs`): four staged violations — hardcoded color,
  illegal layer import, deleted spec test, structural regression — each caught and **named by
  clause**, 4/4. Run it to watch the harness say no.

### 5. In-project generators — extend without the plugin
Three skills ship *inside* the generated repo (`.claude/skills/`), backed by a deterministic
stamper (`qa/scaffold-feature.mjs`):

- **`add-feature`** — a full vertical slice cloned from the `home` exemplar: Screen → ViewModel →
  UseCase → Repository → DI → nav route, **with tests at every layer** and a golden baseline slot.
- **`add-screen`** — presentation only, for an entity whose data layer already exists.
- **`add-repository`** — data/domain only: model, repository interface + impl, use case, fake.

Any plain Claude Code session — no create-cmp plugin installed — finds these and extends the app
correctly by construction.

### 6. The inspector — AI-readable UI, previews without a device
Two loops, one contract. **Live (tier 1):** every debug build serves `127.0.0.1:9500`
(loopback-only, structurally absent from release): the UI tree as JSON, the design-token catalog,
a screenshot route, a tap route, and a live device view for humans (`/inspect/remote` — watch the
real device in a browser, click to tap). **Headless previews (tier 0):** every app ships
`inspector/PreviewRegistry.kt` (the `@Preview` analog — shell, every tab, detail) and a
`:composeApp:renderScreens` task that renders each screen with real DI/theme/data to
`screen.png` + its contract `tree.json` — no device, no emulator; `node qa/preview-gallery.mjs`
turns the output into one self-contained `index.html` (pixels + wireframe + a11y per screen).
Agents read structure; humans see pixels.

### 7. The daily-driver extras
- **Live preview loop** — every real screen rendered headlessly on save (resident hot-reload
  daemon, ~1s warm renders); a self-updating gallery for the human, changed-screen attribution
  and compile-error surfacing for the agent. The agent sees what it builds.
- **Desktop dev-client** — shared UI in a phone-sized JVM window, Compose Hot Reload attached.
- **CI workflow** — Android job on every push; iOS job ready to un-comment.
- **`CLAUDE.md`** — the AI delivery contract itself, stating everything above as rules any AI
  session in the repo must follow.

### 8. Human approval — governed artifacts, signed off by a person
The verify lane and the exemplar-cloning generators cover *machine* correctness; approvals cover
the one thing that isn't machine-checkable — whether a human actually looked. Five governed
artifacts, in order (each is expressed in the vocabulary of the ones before it): the **design
system**, the **architecture + structure** spec, the **exemplar feature** (`home` — the set every
`add-feature` clone starts from), the **exemplar spec**, and each **per-feature spec** as it lands.
Approval is hash-bound to the artifact's content (the same idea as the evidence receipt, applied
to a human decision): `node qa/approve.mjs <artifact>` records it, `node qa/approve.mjs --status`
lists every artifact's live state, and the **Approvals tab** on the preview console (alongside
**Design System** and **Specs** — three new tabs next to the screen gallery) does the same thing
with a click (`POST /api/approve`, same library underneath). The verify lane's `approvals` gate
SKIP-warns on `unreviewed` (non-blocking — a fresh scaffold stays green) and FAILs when an
approved artifact's hash no longer matches, naming the artifact and the re-approval command. The
`cmp-new` skill's last step walks a human through the order on a fresh scaffold; the
`approval_status { waitForDecision }` MCP tool lets an agent block on a decision instead of
polling, the same pattern as `preview_status { waitForRender }`.

### 9. Comments — review feedback flows back through the agent
Approvals are binding; **comments are advisory** — a human's running feedback, with a defined path
back into the plan, the spec, and the code. A 💬 control sits on every screen card, spec clause
row, design-system swatch/dimen/component card, and architecture tree node in the console, plus a
**Comments** tab with the full ledger and an open-count badge. Adding one calls `POST /api/comment`,
which writes `qa/comments.json` in the generated project through the same degrade-honestly bridge
pattern as approvals — `qa/lib/comments.mjs` owns the ledger (state, validation, transitions),
`qa/comment.mjs` is the CLI. The loop of record: a human comments in the console → the agent
observes it (`review_comments { waitForComment: true }`, blocking the same way
`approval_status { waitForDecision }` does) → the agent updates the plan/spec/code → the agent
resolves it with a note (`resolve_comment { id, note }`) → the console shows `resolved` plus the
note. The console never edits code itself — humans add/see, agents resolve, same split as
approvals. `addComment` refuses empty text and a target missing the fields its type requires
(screen, element, spec-line, design-system, architecture, or general); a ledger that exists but
can't be parsed is never silently read as empty — that would hide real feedback.

---

# Workflows — how it fits together

**New app → green.** `cmp-new` (or `npx create-cmp-cli`) → interview → stamp → green build proven
→ tab screens generated. Then `cmp-firebase-connect` to wire your real backend.

**The daily UI loop.** Say "preview my app" (the cmp-preview skill / `preview` MCP tool) → a
live local gallery of EVERY real screen that re-renders on save — no device, no emulator, no
manual Gradle. The agent runs the same loop to check its own work while it builds: edit →
`preview_status { waitForRender: true }` → which screens changed (or the compile error, or the
failed hot swap) → `preview_diff { screen }` for a proven verdict — feedback in seconds instead
of a 25–40s build or an emulator round-trip. One interactive window instead of stills:
`./gradlew :composeApp:hotRunDesktop --auto`. Command-line fallback (no plugin needed — the
scaffolded app carries the whole loop):
`./gradlew :composeApp:renderScreens && node qa/preview-gallery.mjs`.

**The verified dev loop (the flagship).** For any UI change: snapshot the live tree → make the
edit → reload → `prove_change` compares before/after structure, token drift, and a11y, and returns
a verdict. The agent doesn't say "I centered the title" — it shows *"title bounds moved, tokens
unchanged, no a11y regressions: proven clean."*

**Add a feature with AI (no plugin).** Ask any Claude Code session for a feature → it reads
`CLAUDE.md` → proposes the spec clause first → runs `add-feature` → runs the lane → commits code
+ receipt together. If it violates the architecture, the gates name the broken rule; if it tries
to stop early, the Stop hook blocks it.

**Tests that write themselves.** `cmp-test` reads the running app's semantics tree and emits the
regression suite — existence, interaction, navigation, golden trees — in the shipped harness style.

**Maintenance, for the life of the repo.** `doctor` when anything misbehaves, `upgrade` when you
want newer versions without the version-matrix gamble, `clean` when disk fills, `verify` as the
standalone gate. All of it works on any KMP project.

## Agent flows — who does what

- **A plain AI session** in a generated repo is the common case: the contract (`CLAUDE.md`), the
  generators, the lane, and the hook are all local files — the session follows the loop above
  with nothing installed.
- **The `cmp-orchestrator` agent** (ships with the plugin) splits bigger jobs: it delegates
  generation and mechanical work to sub-agents with self-contained briefs, then **gates every
  hand-off through the verify lane** before accepting it. Nothing is reported done on prose —
  only on a receipt.
- **The MCP tools** are how any agent *sees*: `inspect_tree`, `get_node`, `assert_token`,
  `layout_gaps`, `diff_against_design_system`, `find_drift`, `snapshot_save`, `snapshot_diff`,
  `audit_a11y`, `connect_live`, `navigate_and_inspect`, `render_tree`, `render_screen`,
  `prove_change`. Structure in, structure out — never pixels in model context. The same eyes
  extend to runtime behavior (`runtime_crashes`, `runtime_logs`, `db_schema`, `db_query`), to
  the human side of the loop (`approval_status`, blocking on a console decision the same way
  `preview_status` blocks on a render), and to the console's talk-back channel
  (`review_comments`, `resolve_comment` — the agent observes feedback and closes the loop with a
  note instead of the console ever touching code).

## The philosophy (why it's built this way)

1. **Stamp, don't generate.** The skeleton comes from a frozen, CI-verified template. LLMs are
   never in the hot path for code that must be identical every time. Determinism is the moat.
2. **Evidence over claims.** "It works" is a claim. A committed receipt from an executed lane is
   evidence. The whole harness exists to convert one into the other.
3. **Specs before code.** If behavior isn't written as a clause, the coverage gate calls it
   untested. New behavior starts in `specs/`, not in a diff.
4. **Exemplars over documentation.** The `home` feature *is* the architecture guide — a running,
   tested pattern that generators clone and humans copy. Patterns you can execute don't rot.
5. **Refusal is a feature.** A green checkmark is cheap. A red one that names the violated clause
   is what makes the green one mean something. The refusal demo is part of the product.
6. **Honest SKIPs.** No device → the gate says SKIP, visibly, in the receipt. Green-with-gaps
   presented as fully verified is treated as a bug — in the harness itself.
7. **Structure, not pixels.** Golden trees, token assertions, and semantic diffs instead of
   screenshot comparisons: platform-stable, flake-free, and machine-readable.
8. **The contract lives in the project.** Everything enforcing correctness ships in the generated
   repo, not the tool. Your repo stays verifiable after the tool is gone.
9. **Enforcement must be cheap and fair.** The hook hashes files in milliseconds; doc edits never
   invalidate evidence; rebases don't force re-runs. Gates that punish honest work get disabled —
   so they're designed not to.
10. **Dogfood in public.** The [showcase](https://github.com/kvdm-co-pilot/create-cmp-showcase) is
    rebuilt from the published package, receipts and refusals included. Two of the last three
    releases fixed bugs the dogfooding itself caught — the harness catching its own tool is the
    system working.

---

## Options

| Option | Choices | Default |
|---|---|---|
| Platforms | Android (always) + iOS | iOS on |
| App name / package / iOS bundle id | — | required / derived |
| Firebase (GitLive KMP) | on / off | on |
| Auth | `email` / `phone` / `both` / `none` | `both` |
| Firebase region + services | any region · Firestore/Storage/Functions/FCM | `us-central1` · all on |
| Room local cache | on / off | on |
| E2E flows (Maestro) | on / off (`--e2e` / `--no-e2e`; `--appium` is a deprecated alias) | on |
| Live inspector | on / off | on |
| Desktop dev-client | on / off | on |
| Bottom-nav tabs | label + icon, any count | Home, Profile |

_Web/PWA is intentionally out of scope — Android + iOS only._

## Requirements

- **Node.js ≥ 18** for the tool itself.
- **macOS** for iOS output; Android works on macOS or Linux.
- Everything else (JDK 17, Android SDK + emulator, CocoaPods, XcodeGen) the `doctor` detects and —
  with consent — installs. Maestro installs with `curl -fsSL https://get.maestro.mobile.dev | bash`.
  Xcode itself is the one manual App Store step.

## Why CMP, not React Native

The only place CMP loses to RN on a new app is time-to-first-green-build — a tooling problem, not
a merits problem. With one language, real native UI, no bridge, and a reproducible frozen
template, CMP's `npx`-and-go is now competitive. If `create-next-app` made React the web default
by deleting setup friction, the goal here is the same for multiplatform mobile.

## Docs

[`docs/USAGE.md`](./docs/USAGE.md) — the complete usage guide (every command, skill, MCP tool,
workflow) · [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — engine design ·
[`docs/HARNESS-PLAN.md`](./docs/HARNESS-PLAN.md) — the harness, layer by layer ·
[`docs/VERSIONS.md`](./docs/VERSIONS.md) — the proven-green version sets (what `upgrade` targets) ·
[`docs/adr/`](./docs/adr/) — decision records · [`docs/ROADMAP.md`](./docs/ROADMAP.md) — what's next.

## Contributing

Issues and PRs welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md) and the
[Code of Conduct](./CODE_OF_CONDUCT.md). The golden template is CI-gated: an upstream version bump
must fail our CI, not your generated project.

## License

[MIT](./LICENSE) © Karel van der Merwe and create-cmp contributors.
