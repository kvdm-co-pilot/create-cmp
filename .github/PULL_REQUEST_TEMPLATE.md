# Summary

<!-- What does this change and why? -->

## Type of change

- [ ] Bug fix
- [ ] New feature / option
- [ ] Template change (version set, shell, nav, DI, etc.)
- [ ] Docs / tooling

## North star

<!-- docs/NORTH-STAR.md §10 — the fit test. One block; a change that cannot name its goal is not built. -->

```
North star: G_ · mechanism ±_ · core learns no stack fact · receipt unchanged · loop: _
proof: <paste the block `node scripts/fit-test.mjs` prints — suite, framework-check, device schedule>
```

<!-- Questions 1-5 and 8 are yours to write; 6 and 7 are DERIVED by scripts/fit-test.mjs (§10). -->

## Verification

<!-- The scaffold must stay green. Paste evidence. -->

- [ ] `node --test` passes
- [ ] Stamped a demo app and it built green (`./gradlew :composeApp:assembleDebug`)
- [ ] iOS build re-verified (if this touches iOS)
- [ ] Updated `test/*.test.mjs` (if this touches the engine)
- [ ] Updated the `cmp-new` skill invocation (if this changes CLI flags)

```
<!-- paste the BUILD SUCCESSFUL / test summary lines here -->
```
