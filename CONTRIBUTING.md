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

## What `main` requires — applied 2026-10-13

Two CI checks gate every merge to `main`: `tests` (one context over the Node 20/22/24 matrix of
`engine unit tests`) and `proof owed` (`node scripts/proof-plan.mjs --ci`, run from the base branch's
code: what the PR's diff owes, and whether a `review` / `L2 run` check run attests it). The ruleset
`require-pr-main` (id 18921080) requires both, strict — the branch must be up to date with `main`. Its
payload is `.github/ruleset-create-cmp.json`; it was applied on 2026-10-13 by the maintainer:

```bash
gh api -X PUT repos/kvdm-co-pilot/create-cmp/rulesets/18921080 --input .github/ruleset-create-cmp.json
```

Verified by reading it back the same day: `gh api repos/kvdm-co-pilot/create-cmp/rulesets/18921080`
returns `enforcement: active`, `bypass_actors: []`, the `pull_request` rule, and
`required_status_checks` with contexts `tests` and `proof owed` and
`strict_required_status_checks_policy: true`.

What changed: the ruleset gained `required_status_checks`, and its one bypass actor before then —
`RepositoryRole` 5 (admin), `bypass_mode: always` — was removed, so an admin push meets the same
checks. The pull-request rule (zero approvals, three merge methods) was carried over unchanged,
because a PUT replaces the rule list whole. `guard-main-force-delete` (id 18921079) is untouched.
`proof owed` only reports until its step passes `--strict`; requiring it refuses nothing before that
flag is added, and until something posts the `review` and `L2 run` check runs a PR that owes one
reads MISSING.

To revert — restore the admin bypass and drop the required checks, keeping the pull-request rule:

```bash
jq '.bypass_actors = [{"actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always"}]
    | .rules |= map(select(.type != "required_status_checks"))' .github/ruleset-create-cmp.json \
  | gh api -X PUT repos/kvdm-co-pilot/create-cmp/rulesets/18921080 --input -
gh api repos/kvdm-co-pilot/create-cmp/rulesets/18921080   # read it back
```
