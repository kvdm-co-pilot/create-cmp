---
name: cmp-upgrade
description: >-
  Migrate an existing Kotlin/Compose Multiplatform (CMP/KMP) project to the next PROVEN-GREEN
  dependency version set. Use this when the user wants to upgrade Kotlin, KSP, Compose
  Multiplatform, Room, AGP, Koin, or Ktor versions in a KMP project, bump their KMP dependencies,
  or asks "upgrade kotlin/compose/KMP versions", "bump my KMP dependencies", "update my version
  catalog", "my build broke after updating kotlin", "kotlin and ksp version mismatch", "migrate to
  the latest CMP", or "is my libs.versions.toml up to date". Diffs the project's
  gradle/libs.versions.toml against a CI-verified version set, applies surgical in-place edits with
  backups, guards the kotlin↔ksp lockstep, and can prove the result with the green-build gate.
  Works on ANY project with a Gradle version catalog — not just create-cmp-scaffolded ones.
---

# cmp-upgrade — move a KMP project to a proven-green version set

Your job: turn "upgrade my KMP versions" (or "my build broke after a version bump") into a project
sitting on a **proven-green** version set — one that is known to build on Android + iOS — without
hand-editing versions one at a time. You wrap the engine's `upgrade` command (exposed on the CLI as
the `upgrade` subcommand). **Do not hand-edit `libs.versions.toml` yourself** when the engine can do
it — the engine diffs, guards the lockstep, writes surgically, and backs up.

> **Why this exists.** The recurring pain of KMP is that **Kotlin / KSP / Compose / Room / AGP move
> in lockstep or the build dies**. Upgrading "just Kotlin" is how projects break: `ksp` must always
> be `<kotlin>-<kspVersion>` (e.g. kotlin `2.2.20` ↔ ksp `2.2.20-2.0.4`), Room on iOS needs
> `ksp.useKSP2=true`, and AGP pins a minimum Gradle wrapper. A proven-green *set* moves all of them
> together — one command instead of a day of dependency archaeology.

## The workflow: diff → apply → verify

```bash
# 1. DIFF (safe, writes nothing) — show what the upgrade would change:
node <repo>/bin/create-cmp.mjs upgrade --dry-run
#    (add --target-dir <dir> when not running from the project root,
#     --set <id> to target a specific registry set instead of the latest)

# 2. APPLY — after the user has seen and accepted the diff:
node <repo>/bin/create-cmp.mjs upgrade --yes

# 3. VERIFY — prove the build is green (or chain it: upgrade --yes --verify):
node <repo>/bin/create-cmp.mjs verify
```

(If invoked from the published package: `npx create-cmp-cli@latest upgrade …`.)

What the engine does when applying:

- Rewrites **only the changed version values** in `gradle/libs.versions.toml` — surgical line
  edits; comments, formatting, and every unrelated line are preserved byte-for-byte.
- Adds/updates the `gradle.properties` flags the set requires (e.g. `ksp.useKSP2=true`).
- Updates the Gradle wrapper `distributionUrl` when the set pins one.
- Backs up every touched file as `<file>.bak-upgrade` **before** writing and prints the exact
  `mv` commands to revert.
- Versions the project declares that the set doesn't know are **left untouched** (and warned), so
  project-specific dependencies survive.

## The lockstep guardrail — relay it, don't fight it

The engine **refuses to write** any file where the resulting `ksp` is not `<kotlin>-…`. If it
errors with a lockstep violation, that is the product working as designed: the target set or the
project's partial state would produce a known-dead build. Fix by upgrading kotlin and ksp
**together** (which is exactly what a registry set does) — never by overriding one of them by hand.

## Consent gating

Applying mutates the user's build files. Default behavior is a **dry run**: without `--yes` (or an
interactive "y"), nothing is written. Show the user the diff table first and get their go-ahead
before passing `--yes`. Never skip straight to apply on a project you haven't diffed.

## Any project welcome

This works on **any** Gradle project with a `gradle/libs.versions.toml`, whoever scaffolded it.
The engine detects the create-cmp frozen-set marker only to adjust messaging — for non-create-cmp
projects, review the diff with extra care (their catalog may pin versions for reasons the registry
doesn't know), and lean on the warned "left untouched" list.

## Report

Tell the user: which set was targeted (and its notes — they explain the lockstep and the KSP2/iOS
catch-22), the change table, which files were written and where the `.bak-upgrade` backups are, the
revert commands, and the **GREEN/FAIL verdict** if `--verify`/`verify` was run. If the build is not
green afterwards, revert with the printed `mv` commands and run **cmp-doctor** to diagnose. If the
toolchain itself is incomplete, point them at **cmp-doctor** first.
