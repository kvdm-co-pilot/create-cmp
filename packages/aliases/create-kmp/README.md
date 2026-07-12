# create-kmp

> Scaffold a production-shaped **Kotlin Multiplatform** app (Android + iOS, Compose
> Multiplatform UI) in one command — the official `npm create` alias for
> [`create-cmp-cli`](https://www.npmjs.com/package/create-cmp-cli).

```bash
npm create kmp@latest my-app
```

Fully non-interactive (for scripts and AI agents):

```bash
npx create-kmp my-app --name Acme --package com.acme.app --yes --verify
```

## What you get

One command stamps a **frozen, CI-verified template** — deterministic output, never
LLM-freehanded project code:

- Android + iOS shells (XcodeGen + CocoaPods pre-wired), Clean Architecture with a worked
  example feature, Koin DI, bottom navigation with insets solved.
- A **proven-green version set** (Kotlin/KSP/Compose/Room/AGP pinned to a combination that
  actually builds together — including the iOS/KSP2 path).
- Optional features by flag: Firebase (GitLive) with auth, Room, Maestro on-device E2E, a live
  UI inspector, a desktop hot-reload dev client. `--verify` builds the app before reporting
  success; the CLI exits non-zero on failure.
- The **delivery harness** in every generated project: specs with stable clause ids, an 8-gate
  verify lane (`node qa/verify.mjs`), evidence receipts bound to a content hash, and CI that
  refuses "done" without proof. See it working in the
  [public showcase repo](https://github.com/kvdm-co-pilot/create-cmp-showcase) — including
  [a PR the harness refuses](https://github.com/kvdm-co-pilot/create-cmp-showcase/pull/1).

The tool also ships `doctor` (diagnose/heal any KMP project's toolchain and version catalog),
`upgrade` (migrate to the next proven-green version set), `clean`, and `verify` — they work on
**any** KMP project, not just generated ones.

## About this package

This is the **official alias** for `create-cmp-cli`, published by the same maintainer so the
conventional `npm create kmp` invocation works. It contains a single delegating bin and **no
logic of its own**: it resolves the installed `create-cmp-cli` and re-executes it, forwarding
all arguments, stdio, and the exit code. Either name runs the same tool with the same flags —
this one just matches what you'd naturally type.

## Docs

- Repository, full README and issues: <https://github.com/kvdm-co-pilot/create-cmp>
- Every flag: [options.schema.json](https://github.com/kvdm-co-pilot/create-cmp/blob/main/options.schema.json) or `npx create-kmp --help`
- Usage guide (commands, skills, workflows): [docs/USAGE.md](https://github.com/kvdm-co-pilot/create-cmp/blob/main/docs/USAGE.md)
- Hit a KMP build error? [Common CMP/KMP build errors and fixes](https://github.com/kvdm-co-pilot/create-cmp/blob/main/docs/errors/README.md)
