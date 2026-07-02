---
name: npm-publish
description: >-
  Publish the create-cmp CLI to npm as the `create-cmp-cli` package. Use this when the user asks to
  "publish create-cmp to npm", "release a new version", "ship create-cmp-cli", "npm publish this",
  "cut a release", or wants `npx create-cmp-cli` to work. Requires an INTERACTIVE session — `npm
  login` needs a browser/OTP round-trip that cannot run headlessly. Runs the safety gate (clean git
  tree, tests green, on main), bumps the version, updates the changelog, publishes, verifies on the
  registry, and pushes the tag + GitHub release.
---

# npm-publish — release create-cmp to the npm registry

This repo publishes to npm as **`create-cmp-cli`** (not `create-cmp` — that name is an unrelated
placeholder — and not `create-cmp-app` — that's a real, unrelated CMP generator). The installed
*command* stays `create-cmp` regardless; `package.json` maps both `create-cmp` and `create-cmp-cli`
as bin names so either invocation works.

## Precondition — this must run interactively

`npm login` triggers a browser/OTP flow. **If this session is non-interactive (headless, CI, a
background agent), stop and tell the user to run this from an interactive terminal.** Do not attempt
to script around `npm login` — there is no non-interactive credential path here that doesn't involve
handling a token, and this project doesn't manage npm tokens as secrets.

## Steps

Run these from the repo root (`create-cmp/`), in order. Stop and surface the problem if any step
fails — do not skip ahead.

### 1. Safety gate

```bash
git status --porcelain          # must be empty — no uncommitted changes
git branch --show-current       # must be `main`
node --test                     # must be all-green; this also runs as prepublishOnly
```

### 2. Auth check

```bash
npm whoami
```

If this errors (`ENEEDAUTH`), run `npm login` and wait for the user to complete the browser flow
before continuing. Do not proceed past this step without a confirmed identity.

### 3. Confirm the registry name is still ours to use

```bash
npm view create-cmp-cli version
```

- `E404` → good, unclaimed, first publish.
- A version number → confirm `npm whoami` matches the package's maintainer before publishing over
  it. If it doesn't match, STOP — someone else owns it now; surface this to the user rather than
  guessing a new name yourself.

### 4. Bump the version

Use semver correctly — patch for fixes, minor for new options/features, major for breaking template
or CLI-flag changes:

```bash
npm version patch   # or: minor / major
```

This updates `package.json` and creates a git commit + tag (`vX.Y.Z`) locally — it does not push or
publish anything yet.

### 5. Update the changelog

Move the `## [Unreleased]` entries in `CHANGELOG.md` into a new `## [X.Y.Z] - <date>` section (use
the actual current date, not a placeholder), and add the new compare/tag links at the bottom
matching the existing pattern. Commit this as part of the same release commit if `npm version`
hasn't already committed, or as a follow-up commit — either way it must land before push.

### 6. Publish

```bash
npm publish
```

`publishConfig.access` is already set to `public` in `package.json`, so no extra flag is needed for
an unscoped package. `prepublishOnly` re-runs the test suite as a final gate — if it fails, the
publish aborts; fix and retry rather than forcing past it.

### 7. Verify on the registry

```bash
npm view create-cmp-cli version
npx create-cmp-cli@latest --help
```

Confirm the version matches what you just published and the CLI actually runs from the registry
(not from a local cache) before declaring success.

### 8. Push the tag and cut a GitHub release

```bash
git push origin main
git push origin --tags
gh release create vX.Y.Z --title "vX.Y.Z" --notes-from-tag
```

If `--notes-from-tag` doesn't produce good notes, pull the matching `CHANGELOG.md` section as the
release body instead.

## What "done" looks like

- `npm view create-cmp-cli version` on the registry matches the new tag.
- `npx create-cmp-cli@latest` works from a clean machine (or at least `--help` succeeds).
- The git tag is pushed and a GitHub release exists.
- `CHANGELOG.md` has no stale `[Unreleased]` entries left over from this release.

## Do not

- Do not publish with a dirty git tree or failing tests.
- Do not invent a different package name if `create-cmp-cli` turns out to be taken between now and
  publish — stop and ask.
- Do not force-publish over a version/package you don't own.
- Do not skip the registry verification step — "the command exited 0" is not the same as "the
  package is live and correct."
