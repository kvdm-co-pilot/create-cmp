---
name: npm-publish
description: >-
  Publish the create-cmp CLI to npm as the `create-cmp-cli` package. Use this when the user asks to
  "publish create-cmp to npm", "release a new version", "ship create-cmp-cli", "npm publish this",
  "cut a release", or wants `npx create-cmp-cli` to work. Runs unattended when a granular npm token
  is installed in the user's `~/.npmrc` (one-time user setup — see Auth); falls back to interactive
  `npm login` otherwise. Runs the safety gate (clean git tree, tests green, on main), bumps the
  version, updates the changelog, publishes, verifies on the registry, and pushes the tag + GitHub
  release.
---

# npm-publish — release create-cmp to the npm registry

This repo publishes to npm as **`create-cmp-cli`** (not `create-cmp` — that name is an unrelated
placeholder — and not `create-cmp-app` — that's a real, unrelated CMP generator). The installed
*command* stays `create-cmp` regardless; `package.json` maps both `create-cmp` and `create-cmp-cli`
as bin names so either invocation works.

## Auth — token-first, login fallback

Publishing is unattended when a **granular npm access token** lives in Karel's `~/.npmrc`. The
token is user-managed infrastructure, exactly like his SSH key or `gh` auth: the agent USES the
ambient auth, it never sees, handles, stores, or moves the token itself.

**Check auth before anything else:**

```bash
npm whoami
```

- Prints a username → authed, proceed. Everything below runs without Karel in the loop.
- Errors (`ENEEDAUTH`) → auth is missing/expired. STOP and tell Karel to refresh it (below). Do
  not attempt to work around it.

**One-time token setup (Karel does this himself, not the agent):**

1. npmjs.com → avatar → **Access Tokens** → **Generate New Token** → **Granular Access Token**
2. Permissions: **Read and write**. Packages: only ours — `create-cmp-cli`, `create-mobile`,
   `create-compose-multiplatform`, `create-kmp` — never "all packages".
3. Enable **Bypass two-factor authentication** (this is what makes publish non-interactive).
4. Pick an expiration; when it lapses, `npm whoami` starts failing and publish PUTs return E404 —
   that's the signal to regenerate.
5. Add to `~/.npmrc` **by hand** (or via a local installer that prompts with hidden input):
   `//registry.npmjs.org/:_authToken=npm_XXXX`

**Hard rules for the agent:**

- Never ask for, read, echo, or write the token value. Never `cat`/`grep` the auth line of
  `~/.npmrc`. `npm whoami` is the only auth probe you need.
- Never create a repo-level `.npmrc` and never copy auth config into the project — a committed
  token is a leaked token.
- If auth is dead, the fix is Karel regenerating the token or running `npm login` interactively.
  Both are his steps; hand off and wait.

**Known failure signature:** `E404 Not Found - PUT https://registry.npmjs.org/<pkg>` ("could not
be found or you do not have permission") on a package that provably exists = **expired/revoked
auth**, not a missing package. npm masks publish auth failures as 404. Confirm with `npm whoami`,
then hand off for a token refresh.

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

Must print a username (see Auth above). Do not proceed past this step without a confirmed
identity — if it errors, hand off to Karel for a token refresh / `npm login`.

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

**Also bump the Claude Code plugin manifests to the same version** — they do NOT track
`package.json` automatically, and skipping this is exactly how the installed plugin once lagged the
registry by three minor versions (0.1.0 vs 0.4.0, caught by a field report):

```bash
# .claude-plugin/plugin.json        -> "version": "X.Y.Z"
# .claude-plugin/marketplace.json   -> metadata.version AND plugins[*].version -> "X.Y.Z"
```

Commit these with the changelog fold (step 5). A release is not done while the plugin manifests
disagree with the npm version.

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

Publish from the **repo root only** — subpackages like `inspector/mcp` are `private: true` and
will fail with `EPRIVATE` (that error means wrong directory, not a config problem).

### 7. Verify on the registry

```bash
npm view create-cmp-cli version
npx create-cmp-cli@latest --help
```

Confirm the version matches what you just published and the CLI actually runs from the registry
(not from a local cache) before declaring success.

### 8. Push the tag and cut a GitHub release

Direct pushes to `main` are blocked by branch protection, so release-prep commits (version bump +
changelog) land via branch → PR → `gh pr merge --rebase --delete-branch`, then `git pull` on main
before publishing. By step 8 the commit is already on main; only the tag and release remain:

```bash
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
- Do not touch the token: never read/echo/move it, never put auth config anywhere inside the repo.

## Alias packages (create-compose-multiplatform, create-kmp, create-mobile)

Thin alias packages live in this repo under `packages/aliases/` — `create-compose-multiplatform`,
`create-kmp`, and `create-mobile`. The first two are delegating shims: each bin resolves the
installed `create-cmp-cli` dependency's bin entry and re-executes it (argv forwarded, stdio
inherited, exit code propagated) — so `npm create compose-multiplatform` / `npm create kmp` land
users straight in our tool. `create-mobile` is the **honest front door**: it prints the CMP-default
+ trade-offs banner and runs an interactive fit check (`Continue with Compose Multiplatform? [Y/n]`)
before delegating — that fit check is what earns the generic name; never turn it into a silent
redirect.

They version independently of the main package and depend on `create-cmp-cli` with an **open range**
(`>=X.Y.Z`), so a fresh `npm create <alias>` picks up new main releases automatically. **They only
need republishing when the range must move past a major bump or the shim/README itself changes** —
NOT on every `create-cmp-cli` release. (A routine `create-cmp-cli` bump like 0.7.1 → 0.8.0 needs no
alias republish: the open range already resolves to latest.)

To publish (same token-first auth rules as above; `npm view <name>` first to confirm ownership on
repeat publishes):

```bash
cd packages/aliases/create-compose-multiplatform && npm publish
cd packages/aliases/create-kmp && npm publish
cd packages/aliases/create-mobile && npm publish
```

Verify each afterwards the same way as the main package: `npm view <name> version`, then
`npx <name>@latest --help` must print the real create-cmp banner (for `create-mobile`, the fit
check must still appear on a bare `npx create-mobile` run).
