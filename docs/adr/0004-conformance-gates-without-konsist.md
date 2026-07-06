# ADR-0004: Conformance gates without Konsist

- **Status:** accepted
- **Date:** 2026-07-06

## Context

Architecture conformance — dependency direction, layer naming, testTag presence, no hardcoded
design values, ViewModel-to-test pairing, inset-API ownership — needs to be mechanically
checkable, not prose guidance that drifts silently under AI-speed change. The obvious tool for
structural Kotlin queries is Konsist, but the template's whole premise is a frozen, CI-verified,
lockstep-safe version set (Kotlin/KSP/Compose/Room/AGP move as one) with as few moving parts as
possible.

## Decision

Conformance gates are dependency-free source scans — plain `kotlin-test` over file walks and
import-line checks, living in `ArchitectureConformanceTest` on the JVM tier
(`:composeApp:desktopTest`) — rather than Konsist. The rules the template currently needs
(layer-import direction, testTag presence, color-literal bans, ViewModel-test pairing, inset-API
ownership) are all expressible as line-level checks against source files, with named clause ids
tied to `specs/app-base.spec.md`.

## Consequences

- Konsist would add `kotlin-compiler-embeddable` plus a version pin to track — exactly the
  version-lockstep fragility the template exists to remove — so it is deliberately left out of
  the default dependency set.
- Gates stay cheap to run and immune to compiler-version drift, and violations report the
  offending files with a named clause and a fix hint rather than a generic style nit.
- Complex structural rules that outgrow line-level checks must either stay simple or move to the
  golden-tree layer instead of pulling in a heavier query engine.
- Konsist remains a documented opt-in for teams that want richer structural queries than source
  scanning can express — swapping it in is expected to preserve the existing clause ids.

## Related

- `template/composeApp/src/desktopTest/kotlin/com/example/app/conformance/ArchitectureConformanceTest.kt`
  — the header comment recording this decision, and the clause implementations (ARCH-01 through
  ARCH-05, SHELL-03).
- `docs/adr/0003-jvm-desktop-target-is-harness-infrastructure.md` — the target these gates run on.
