# ADR-0006: Keep the `create-cmp-cli` package name; position the product as an AI delivery harness

- **Status:** accepted
- **Date:** 2026-07-07

## Context

The product has outgrown its original identity. It began as a scaffolder ("create a CMP app")
and is now an **AI delivery harness**: every generated project carries a spec-driven verify lane,
executable conformance gates, in-project generation skills, mechanical enforcement (Stop hook +
evidence-bound receipts), and an AI-native inspector. The front-door copy (npm, plugin,
marketplace) still led with "scaffold," underselling the differentiator.

Two naming facts constrain the options:

- The bare npm name **`create-cmp` was registered by a third party in 2020** (a placeholder at
  `0.0.0`, unrelated project). It is not available, so `npm create cmp` / `npx create-cmp` can
  never resolve to this project. We publish as **`create-cmp-cli`** (the binary it installs is
  `create-cmp`), live on npm since 2026-07-04.
- The name `create-cmp` is nonetheless established: the repo, the plugin, the docs, and the
  0.2.0 release all use it, and it has early search/SEO presence.

## Decision

- **Keep the package name `create-cmp-cli`.** Do not chase the squatted bare name, do not rename.
  A rename spends scarce effort for zero revenue, resets discoverability, and orphans existing
  links — while the product is a **proof/brand artifact, not the venture's revenue brand** (the
  verification platform will carry its own name). The cost/benefit is clearly negative.
- **Position the product as "the AI delivery harness for Kotlin/Compose Multiplatform."**
  Framing rule everywhere: *scaffold is the front door; the harness is the product.* Lead with
  the scaffold (it is the entry point) but always name the harness layers (verify lane +
  evidence receipt, conformance gates, in-project generation, enforcement, inspector).
- **Optional, deferred:** reserve a scoped alias (e.g. `@kvdm/create-cmp`) as cheap insurance if
  a namespace becomes desirable later. Do not migrate to it now.

## Consequences

- No discoverability reset; existing npm installs, links, and the 0.2.0 → 0.3.0 line stay intact.
- All front-door copy (README, `plugin.json`, `marketplace.json`, `package.json`, `cmp-new`
  skill) is aligned to the harness identity; "scaffolder-only" descriptions are treated as bugs.
- The verification **platform** (the venture) is a separate brand and repo; create-cmp is its
  live reference implementation and lead-gen surface, not its product name.
- If Amper or another upstream shift ever forces a structural reset, revisit the alias option
  then — not before.

## Related

- `docs/research/PRODUCT-PLAN-AND-POTENTIAL.md` — the plan this positioning serves (internal).
- `docs/DOCUMENTATION.md` — the doc charter that keeps the copy coherent.
- `docs/adr/0001-the-contract-lives-in-the-generated-project.md` — why the harness ships *inside*
  the generated app (the substance behind the positioning).
