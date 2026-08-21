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
[![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-D97757.svg)](#the-claude-code-plugin-10-skills)

</div>

---

```bash
npm create kmp@latest my-app
```

Deterministic (stamps a frozen, CI-verified template), non-interactive with flags, exits non-zero
on failure — and it **builds the app to prove it's green** before reporting success.
Agent-readable: [llms.txt](./llms.txt) · [options.schema.json](./options.schema.json).

## What is this, in plain words

One product: a **contract between an AI agent and a mobile repo**. The agent gets *eyes*
(every screen rendered headlessly as structure, never screenshots), *hands* (generators that
extend the app correctly by construction), and — when you want it — *a definition of done it
cannot argue with* (an executable verify lane, evidence receipts, enforcement). You climb in
three steps, each priced in what you have at that moment:

| | You pay | You get | How |
|---|---|---|---|
| **Try** | a five-second decision | a green Android + iOS build; the emulator/testing/dependency walls pre-solved | `npm create kmp@latest my-app` (add `--minimal` for the light scaffold) |
| **Work** | attention, repaid immediately | preview on save, a live on-device inspector, a doctor at every wall, feature generators | commands shipped inside the repo — nothing to install, no plugin required |
| **Trust** | constraint | specs, an executable verify lane, tamper-evident evidence receipts, a Stop hook + CI that refuse "done" without proof | on by default; `--minimal` defers it, one command installs it later: `npx create-cmp-cli harden` |

**See the trust layer live:**
[create-cmp-showcase](https://github.com/kvdm-co-pilot/create-cmp-showcase) is a public repo
built entirely by this tool — every commit carries its evidence receipt, and
[PR #1](https://github.com/kvdm-co-pilot/create-cmp-showcase/pull/1) shows the harness *refusing*
a bad change and naming the exact rule it broke.

## The core loop

```
  spec clause  →  generate from exemplar  →  verify lane  →  evidence receipt
      ↑                                                              │
      └────────────── enforcement: Stop hook + CI refuse "done" without it ──┘
```

Behavior starts as a written spec clause. Code is cloned from a proven exemplar. The verify lane
checks everything — spec coverage, build, tests, architecture, UI structure, design tokens,
accessibility, on-device E2E, and more — and writes a receipt bound to a content hash of the code
it verified. You cannot hand-forge it, and a stale one doesn't pass.

## Quick start

`npm create kmp@latest my-app` interviews you and takes you through it interactively. For
scripts and CI, drive it with flags instead:

```bash
npx create-cmp-cli@latest my-app --name Acme --package com.acme.app --yes --verify
```

Either way it checks your toolchain, stamps the template, and **builds the app to prove it's
green** before reporting success. (The npm package is `create-cmp-cli` — `create-cmp` was
already squatted — but the installed command is still `create-cmp`.)

**Two modes, one template.** The default scaffold carries the full harness. `--minimal`
stamps the same app, tests, previews, and inspector *without* the verify lane, specs,
receipts, or enforcement — the smallest thing that builds green. Climbing back up is
in-band and idempotent:

```bash
npx create-cmp-cli harden
```

Nothing is forked: minimal is a filter over the one template, and `harden` installs exactly
the subtraction back (existing files are merged or preserved beside a sidecar, never
clobbered). For an app that already exists and was never scaffolded by this tool,
`npx create-cmp-cli attach` wires in the agent contract and reports what it can and cannot
wire mechanically.

## The Claude Code plugin (10 skills)

Install with `/plugin marketplace add kvdm-co-pilot/create-cmp` then `/plugin install create-cmp`.

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

## Docs

[`docs/USAGE.md`](./docs/USAGE.md) is the deep reference — every CLI command, the full plugin
skill table, the `cmp-inspector` MCP tools, the harness deep dive (specs, evidence, enforcement,
generators, inspector, approvals, comments), workflows, philosophy, and the scaffold options
table. Also: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) (engine design) and
[`docs/ROADMAP.md`](./docs/ROADMAP.md) (what's next).

## Contributing & License

Issues and PRs welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md) and the
[Code of Conduct](./CODE_OF_CONDUCT.md). [MIT](./LICENSE) © Karel van der Merwe and create-cmp
contributors.
