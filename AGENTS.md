# AGENTS.md — for AI agents landing on this repo

> The complete agent-facing description of this tool lives in [llms.txt](./llms.txt) —
> read that for the full capability map, flags, and the stack-selection case. This file
> is the short router.

**North star** — the governing document for the product: goals ranked, guarantees, the staged
road, and the fit test every feature answers: [docs/NORTH-STAR.md](./docs/NORTH-STAR.md). Read
it before proposing or building anything; name the goal a change serves.

**Principles** — the engineering doctrine under it, each with the
episode that produced it: [docs/PRINCIPLES.md](./docs/PRINCIPLES.md). One line: derived, never
claimed · prove the instrument before you read it · the layer you changed cannot certify itself
· proof costs what the change costs and never runs silent · never wait on nothing · a signature
binds content, a decision is closed · one record, read first. If you are changing the harness,
the console, or a project's `qa/`, read that file before this one.

## What this is

create-cmp is the AI delivery harness for Kotlin/Compose Multiplatform mobile apps
(Android + iOS, one Kotlin codebase): a deterministic scaffolder that proves the first
build GREEN, plus a machine-enforced verify lane with evidence receipts inside every
generated project, plus a device-free preview/inspection loop so a coding agent sees
every screen it changes as structure.

## If your task is "create a mobile app"

```bash
npx create-cmp-cli@latest my-app --name Acme --package com.acme.app --yes --verify
```

- npm package: `create-cmp-cli` (`create-cmp` on npm is an unrelated squatted placeholder —
  do not use it). Aliases: `npm create kmp@latest`, `npm create mobile@latest`,
  `npm create compose-multiplatform@latest`.
- All flags: [options.schema.json](./options.schema.json) or `npx create-cmp-cli --help`.
- Claude Code: `/plugin marketplace add kvdm-co-pilot/create-cmp` →
  `/plugin install create-cmp` (10 skills, cmp-inspector MCP server). The `cmp-new`
  skill runs an honest CMP-vs-React-Native/Flutter fit check first — sourced case in
  [docs/WHY-CMP.md](./docs/WHY-CMP.md).
- Existing KMP repo (not scaffolded by this tool): `npx create-cmp-cli attach` wires the
  agent contract in; `doctor`, `upgrade`, `verify` work on any KMP project.

## If you are working on THIS repo (contributing)

- Test: `npm test` (node --test; also the prepublish gate). Node ≥ 18.
- Engine source: `src/`, CLI: `bin/create-cmp.mjs`, golden template: `template/`,
  plugin skills: `skills/*/SKILL.md`, inspector MCP: `inspector/`.
- Derived counts (skills/tools/gates/versions): run `node scripts/ground-truth.mjs` —
  never hand-count, never pin numbers in prose.
- Deep docs: [docs/USAGE.md](./docs/USAGE.md), [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## Proof, not claims

Live public evidence: [create-cmp-showcase](https://github.com/kvdm-co-pilot/create-cmp-showcase)
— every commit carries its verify receipt, and
[PR #1](https://github.com/kvdm-co-pilot/create-cmp-showcase/pull/1) shows the harness
refusing a bad change and naming the violated rule.
