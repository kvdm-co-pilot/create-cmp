# Contributing

## The workflow

1. Branch from `main` (`feat/<name>`, `fix/<name>`).
2. Make the change — new features mirror the `home` exemplar
   (see [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)), with tests at every layer
   (see [`docs/TESTING.md`](./docs/TESTING.md)).
<!-- >>> cmp:feature harness -->
3. Run the verify lane: `node qa/verify.mjs`.
4. Commit **including the updated receipt** (`qa/evidence/latest.json`). A change without a
   PASS receipt is not done — CI re-runs the same lane and will say so.
<!-- <<< cmp:feature harness -->
<!-- >>> cmp:feature !harness -->
3. Run the tests: `./gradlew :composeApp:desktopTest` must be green (CI re-runs it on
   every push).
4. Commit.
<!-- <<< cmp:feature !harness -->
5. Open a PR. Keep it one concern; note any intended golden/baseline changes explicitly.

## Definition of done

<!-- >>> cmp:feature harness -->
- `node qa/verify.mjs` → **PASS**, receipt committed.
<!-- <<< cmp:feature harness -->
<!-- >>> cmp:feature !harness -->
- `./gradlew :composeApp:desktopTest` green. (This is a minimal scaffold — the
  machine-checked definition of done arrives with `npx create-cmp-cli harden`.)
<!-- <<< cmp:feature !harness -->
- New behavior has tests; existing tests untouched unless the behavior intentionally changed
  (say so in the PR).
- No hardcoded design values; testTags on anything E2E needs to reach.
- Significant decisions recorded as an ADR (`docs/adr/`).

## Commit style — Conventional Commits

```
<type>(<scope>): <imperative summary>

feat(home): add pull-to-refresh
fix(nav): keep state on tab re-selection
test(profile): cover error retry path
docs(adr): record image-loading choice
```

Types: `feat` `fix` `test` `refactor` `docs` `build` `ci` `chore`. Scope = feature/module.

## Code style

- Kotlin official style; match the surrounding file's idiom.
- Comments explain constraints the code can't (never narrate what the next line does).
- Public surface of `domain` stays framework-free.
