# ADR-0001: The contract lives in the generated project

- **Status:** accepted
- **Date:** 2026-07-06

## Context

create-cmp is an AI delivery harness for Compose Multiplatform, not a scaffolder that merely
saves typing. At scaffold time we have maximal certainty — a frozen version set, a known
architecture, known patterns — and zero knowledge of the user's future features. We cannot ship
the user's tests, but we can ship a machine-enforceable definition of "correct." The question is
where that enforcement machinery lives: inside the create-cmp Claude Code plugin, or inside the
project it generates.

## Decision

We ship the AI delivery contract — the generated `CLAUDE.md`, `specs/`, `qa/verify.mjs`,
conformance gates, and evidence receipts — INSIDE every generated project, not as a dependency
on the create-cmp plugin. The plugin (skills + the `cmp-inspector` MCP) is the toolchain for
operating the machinery; the template-embedded contract is the product. Any Claude Code session
that ever opens a generated repo is bound by it, whether or not the plugin is installed.

## Consequences

- The template is the product's core, not an implementation detail of the CLI — every contract
  change is a template change, propagated to new projects by scaffolding (and to existing ones
  via `npx create-cmp-cli upgrade`).
- A generated repo must be self-enforcing: it works for any Claude Code user who scaffolds an
  app, zero plugin required, and keeps working whichever agent is doing the modifying.
- Plugin features must degrade gracefully — losing the plugin (or using a different agent)
  must never leave a generated project unverifiable, only less convenient to operate.
- The cost: duplication of some tooling logic between the plugin and the template, and a
  discipline requirement that new capabilities default to "lives in the template" unless there
  is a specific reason for plugin-only placement.

## Related

- `docs/HARNESS-PLAN.md` §3, "The key architectural decision" — the source framing for this ADR.
- `docs/adr/0004-conformance-gates-without-konsist.md` — a specific instance of the same
  "no external dependency in the enforcement layer" principle.
