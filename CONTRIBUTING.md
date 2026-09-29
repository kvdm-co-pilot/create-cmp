# Contributing to create-cmp

Thanks for your interest! This project's whole value is **reproducibility**, so the contribution bar
is about keeping the scaffold green, not about volume of features.

## Project layout

| Path | What it is |
|---|---|
| `bin/` | CLI entry (`create-cmp`) |
| `src/` | the deterministic engine — doctor/bootstrap, scaffold pipeline, lib |
| `template/` | the frozen golden CMP skeleton that gets stamped |
| `options.schema.json` | JSON Schema for the scaffold config object |
| `skills/`, `.claude-plugin/` | the Claude Code plugin front door |
| `test/` | engine unit tests (synthetic fixtures, no real template needed) |
| `docs/ARCHITECTURE.md` | the design |

## Development

```bash
git clone https://github.com/kvdm-co-pilot/create-cmp.git
cd create-cmp
node --test                 # run the engine unit tests
node bin/create-cmp.mjs --help
node bin/create-cmp.mjs doctor --dry-run   # inspect the toolchain checks, no mutation
git config core.hooksPath .githooks        # opt in: pre-push refuses landing on main while a slice owes
```

To try a real stamp:

```bash
node bin/create-cmp.mjs --name "Demo App" --package com.example.demo \
  --no-ios --target-dir /tmp/demo --yes
```

## Ground rules

1. **Never regress the green build.** If you change the template or its version set, stamp a demo app
   and build it (`./gradlew :composeApp:assembleDebug`, and an iOS build on macOS when touching iOS).
   A change that can't build green isn't ready.
2. **The version set is frozen on purpose.** Bumping Kotlin/KSP/CMP/Room/AGP means re-verifying the
   whole matrix — treat it as a dedicated PR with build evidence, not a drive-by.
3. **Engine changes need tests.** Token replacement, package-directory rename, and feature-marker
   toggling are the correctness-critical paths — add/extend `test/*.test.mjs`.
4. **No secrets.** Only *placeholder* `google-services.json` / `GoogleService-Info.plist` belong in
   the template.
5. **Keep the two front doors in sync.** If you change the CLI flag surface, update the `cmp-new`
   skill's example invocation to match.

## Pull requests

- Keep PRs focused; describe what you changed and paste build/test evidence.
- By contributing you agree your work is licensed under the project's [MIT License](./LICENSE).
- Be excellent to each other — see the [Code of Conduct](./CODE_OF_CONDUCT.md).

## What `main` requires — prepared, not applied

Two CI checks are meant to gate every merge to `main`: `tests` (one context over the Node 20/22/24
matrix of `engine unit tests`) and `proof owed` (`node scripts/proof-plan.mjs --ci`, run from the base
branch's code: what the PR's diff owes, and whether a `review` / `L2 run` check run attests it). Today
the ruleset requires neither. The payload that would make it so is `qa/ruleset-create-cmp.json`;
applying it is a repository-settings act for the maintainer, not something a PR does:

```bash
gh api repos/kvdm-co-pilot/create-cmp/rulesets            # read first: require-pr-main was id 18921080 on 2026-09-29
gh api -X PUT repos/kvdm-co-pilot/create-cmp/rulesets/18921080 --input qa/ruleset-create-cmp.json
```

What changes: the ruleset gains `required_status_checks` (`tests`, `proof owed`, strict — the branch
must be up to date with `main`), and its one bypass actor today — `RepositoryRole` 5 (admin),
`bypass_mode: always` — is removed, so an admin push meets the same checks. The pull-request rule
(zero approvals, three merge methods) is carried over unchanged, because a PUT replaces the rule list
whole. `guard-main-force-delete` (id 18921079) is untouched. UNVERIFIED: the payload's shape has not
been sent to the API; read the PUT's response, then `gh api …/rulesets/18921080`, before trusting it.
Apply it only after `proof owed` has run green on a recorded PR (GATE-RULES Rule 1) and something
posts the `review` and `L2 run` check runs: until then a PR that owes one reads MISSING. The job only
reports until its step passes `--strict`; requiring it refuses nothing before that flag is added.
