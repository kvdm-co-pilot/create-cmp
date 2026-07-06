# ADR-0002: Maestro over Appium for E2E

- **Status:** accepted
- **Date:** 2026-07-06

## Context

The template shipped two Appium-based E2E runners from earlier phases of the project — a Node
smoke runner (`qa/appium`) and a pytest suite (`tests/appium`) — plus an earlier proposal for a
Kotlin `e2e/` Appium module that was never built. Device E2E is the least AI-load-bearing layer
in the testing architecture: the AI's real verification instrument is the structural inspector
(`cmp-inspector`), not black-box UI driving. That reframes what the E2E layer should optimize
for — least brittleness and cross-platform reach, not language uniformity with the rest of the
stack.

## Decision

We replace both previous Appium runners with Maestro YAML flows as the sole E2E layer. Flows
live in `qa/e2e/*.yaml`; the verify lane's `e2eSmoke` step runs `maestro test`. Maestro is
Apache-2.0, free to run locally and in CI on both Android and iOS simulators — only the hosted
Maestro Cloud device farm is paid, and we bring our own emulator/simulator, so we never need it.
Selectors reference testTags exclusively (surfaced as resource-ids on Android and accessibility
identifiers on iOS via the template's `TestTagAutomation` shim), never text, keeping flows
l10n-stable.

## Consequences

- Auto-waits eliminate most flake; one YAML flow drives both platforms, which the two prior
  runners could not do without per-platform driver code.
- Trade-off accepted: Maestro flows are not compile-checked. We compensate by keeping E2E thin
  (boot + a few critical journeys) and putting compile-checked, interaction-level assertions in
  Compose UI Test instead.
- Both prior runners retire: the Node `qa/appium` smoke runner and the pytest `tests/appium`
  suite are superseded, not extended further.
- The engine's `appium` feature key (the `--no-appium` scaffold flag, the `appium` config field)
  is retained as a legacy name for the E2E harness rather than renamed to `maestro` — renaming
  it is a breaking change to the scaffold CLI's flag surface, deferred to 0.3.0.

## Related

- `docs/TESTING-ARCHITECTURE.md` §3.1, "One runner: Maestro (consolidation decision,
  re-amended 2026-07-06)" — the full reasoning and retirement note for this ADR.
