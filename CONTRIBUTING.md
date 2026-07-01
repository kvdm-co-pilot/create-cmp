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
```

To try a real stamp:

```bash
node bin/create-cmp.mjs --name "Demo App" --package com.example.demo \
  --no-ios --no-firebase --target-dir /tmp/demo --yes
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
