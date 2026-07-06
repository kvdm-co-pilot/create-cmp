# ADR-0003: The JVM desktop target is harness infrastructure

- **Status:** accepted
- **Date:** 2026-07-06

## Context

The template's `jvm("desktop")` target hosts the fast, device-free verification tier — unit
tests, conformance gates, Compose UI Tests, and golden-tree renders, all run via
`:composeApp:desktopTest`. It was originally declared inside the dev-client feature's markers,
alongside the hot-reload window and foojay pieces the dev-client feature actually owns. That
meant scaffolding with `--no-dev-client` would delete the JVM test tier along with the window
feature, silently taking the harness's fastest verification lane with it. This was discovered
and fixed during M2.

## Decision

The `jvm("desktop")` target is unconditional harness infrastructure, present in every generated
project regardless of feature flags, decoupled from the optional dev-client feature that merely
reuses it. Only the window/hot-reload/foojay pieces specific to the interactive dev-client
experience remain feature-gated; `kspDesktop` and `desktopTest` dependencies are unconditional.

## Consequences

- `--no-dev-client` no longer removes verification capability — only the interactive desktop
  window and hot reload go away.
- The dev-client feature's actual footprint shrinks to what it truly owns; harness code is
  no longer at risk of being pruned by unrelated feature toggles.
- Anyone touching feature markers around the `jvm("desktop")` block must recognize it as
  harness infrastructure first — the surrounding comment in the build file exists to prevent a
  repeat of this mistake.

## Related

- `template/composeApp/build.gradle.kts`, the `jvm("desktop")` comment — the in-repo record of
  this decision.
- `docs/adr/0004-conformance-gates-without-konsist.md` — the tests this target exists to run.
