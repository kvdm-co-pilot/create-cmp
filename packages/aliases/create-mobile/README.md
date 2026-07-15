# create-mobile

> **The honest front door to a new mobile app.** `npm create mobile` doesn't silently
> pick a framework for you — it opens with Kotlin/Compose Multiplatform as the modern
> default, states the real trade-offs vs React Native and Flutter, and lets you choose.
> Continue, and it scaffolds a green-building Android + iOS app via
> [`create-cmp-cli`](https://www.npmjs.com/package/create-cmp-cli).

```bash
npm create mobile@latest my-app
```

## Why this package exists — a fit check, not a redirect

"mobile" is framework-neutral, so a package under that name that quietly stamped one
stack would be a bait-and-switch. This one is built to earn the generic name. Launch it
and it opens with an honest positioning:

> Here's Compose Multiplatform as the modern default — one statically-typed codebase,
> real native Android + iOS UI, Google-backed, iOS stable since May 2025 — and here are
> the real trade-offs vs React Native/Flutter (bigger RN/Flutter ecosystems and hiring
> pools; a JS bridge or Dart's non-native render layer; CMP is the youngest of the three).
> **You choose.**

That's the same step-0 fit check the create-cmp Claude Code plugin's `cmp-new` skill runs,
brought to the command line. The generic name raises the honesty bar; this is how it's
cleared — you become the honest front door to mobile, not a redirect. The full sourced case
for choosing CMP (with its weaknesses named, not just its strengths) is
[docs/WHY-CMP.md](https://github.com/kvdm-co-pilot/create-cmp/blob/main/docs/WHY-CMP.md).

- **Interactive run:** you get the positioning **and a real prompt** —
  `Continue with Compose Multiplatform? [Y/n]`. Decline and nothing is written; it points
  you at `npm create expo` (React Native) or `flutter create` and exits cleanly.
- **Scripts / CI / agents (`--yes` or piped):** you've already chosen by how you invoked
  it, so it prints the honest note and proceeds — no blocking prompt.
- **`--help` / `--version`:** pass straight through to the real CLI.

## What you get if you continue

One command stamps a **frozen, CI-verified template** — deterministic output, never
LLM-freehanded project code:

- Android + iOS shells (XcodeGen + CocoaPods pre-wired), Clean Architecture with a worked
  example feature, Koin DI, bottom navigation with insets solved.
- A **proven-green version set** (Kotlin/KSP/Compose/Room/AGP pinned to a combination that
  actually builds together — including the iOS/KSP2 path).
- Optional features by flag: Firebase (GitLive) with auth, Room, Maestro on-device E2E, a
  live UI inspector, a desktop hot-reload dev client. `--verify` builds the app before
  reporting success; the CLI exits non-zero on failure.
- The **delivery harness** in every generated project: specs with stable clause ids, an
  8-gate verify lane (`node qa/verify.mjs`), evidence receipts bound to a content hash, a
  device-free preview loop so coding agents see what they build, and CI that refuses "done"
  without proof. See it working in the
  [public showcase repo](https://github.com/kvdm-co-pilot/create-cmp-showcase) — including
  [a PR the harness refuses](https://github.com/kvdm-co-pilot/create-cmp-showcase/pull/1).

## About this package

An **official alias** for `create-cmp-cli`, published by the same maintainer so the
conventional `npm create mobile` invocation works. It adds exactly one thing of its own —
the honest fit check above — then delegates to the installed `create-cmp-cli`, forwarding
all arguments, stdio, and the exit code. After the choice, either name runs the same tool
with the same flags.

Fully non-interactive (scripts and AI agents):

```bash
npx create-mobile my-app --name Acme --package com.acme.app --yes --verify
```

## Docs

- Repository, full README and issues: <https://github.com/kvdm-co-pilot/create-cmp>
- Why Compose Multiplatform (sourced, honest): [docs/WHY-CMP.md](https://github.com/kvdm-co-pilot/create-cmp/blob/main/docs/WHY-CMP.md)
- Every flag: [options.schema.json](https://github.com/kvdm-co-pilot/create-cmp/blob/main/options.schema.json) or `npx create-mobile --help`
- Usage guide (commands, skills, workflows): [docs/USAGE.md](https://github.com/kvdm-co-pilot/create-cmp/blob/main/docs/USAGE.md)
