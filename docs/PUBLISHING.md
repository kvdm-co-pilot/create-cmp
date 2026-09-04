# Publishing — the `@create-cmp/*` packages

The runbook for first-publishing the three scoped library packages:
`prooflane-receipts` (`packages/receipts`), `prooflane-harness`
(`packages/harness`), and `@create-cmp/inspector` (`inspector/mcp`).

**Human-run, deliberately.** Nothing here executes itself, and a first
`npm publish` of a name is effectively a one-way door (see Risks). The root
CLI and its alias packages are a different flow — the `npm-publish` skill
(`.claude/skills/npm-publish/SKILL.md`) — and neither flow is a prerequisite
for the other.

## The namespace (settled 2026-08-20/21)

Two tiers, deliberately, and the split is not an inconsistency to fix:

| Tier | Names | Why this shape |
|---|---|---|
| Front doors | `create-cmp-cli`, `create-kmp`, `create-compose-multiplatform`, `create-mobile` | `npm create X` resolves to the package `create-X` — npm's convention forces it; these can never be scoped |
| Libraries | `prooflane-harness`, `prooflane-receipts`, `@create-cmp/inspector` | free choice — scoped |

Why scoped rather than a `cmp-*` prefix, in order of weight:

1. **The stack-agnostic tension.** The receipt pipeline is committed to
   outgrowing one stack. `cmp-receipts` would hard-code Compose Multiplatform
   into the artifact's own name; under a scope, "cmp" sits in the *vendor*
   position — `prooflane-receipts` can describe any stack's receipts
   without lying.
2. **One move reserves the whole namespace.** Owning the org reserves every
   future `@create-cmp/*` name. Unscoped, each new `cmp-<thing>` is a fresh
   land-grab race.
3. **It ended a three-prefix scatter.** These packages were headed to the
   registry as `cmp-receipts` + `create-cmp-harness` + `cmp-inspector-mcp`.

## Prerequisites (both are one-time, both are yours)

1. **The `@create-cmp` npm org exists** (created 2026-08-21, free tier —
   unlimited public packages). Note the probe trap: `npm org ls create-cmp`
   needs org-level read, which a granular token does not carry, so it can
   return 403 *with the org existing* — observed live. The publish itself is
   the only definitive probe.
2. **The token must cover the scope.** The granular token documented in the
   `npm-publish` skill's Auth section was created against the four front-door
   names only. Edit it (or issue a new one) on npmjs.com to include the
   `@create-cmp` scope — the three names don't exist yet, so scope-level
   access is the only way to grant them pre-publish. The failure signature of
   a token that doesn't cover the scope is **E404 on the publish PUT** (the
   same signature the skill documents for an expired token).

Auth rules are the skill's, shared: `npm whoami` is the only probe; never
read, echo, or move the token; no repo-level `.npmrc`, ever.

## Version relationships

- **Lockstep:** root CLI + plugin + marketplace entry are one release
  (`test/doc-counts.test.mjs` pins `plugin === cli === marketplace`, derived
  by `scripts/ground-truth.mjs`).
- **Independent, by design:** all three scoped packages. The lane changes far
  more often than the app shape; `template/CLAUDE.md` states the lane is
  "versioned independently of the engine that stamped this", and the 0.14.1
  release proved the point by moving the harness alone. When the harness
  version happens to equal the CLI's, that is coincidence, not an invariant —
  do not "fix" a divergence. The gate only asserts each package has *a* valid
  semver, never that they match.
- `prooflane-harness` vendors two `prooflane-receipts` files
  byte-identically (synced by `scripts/sync-harness.mjs`, pinned by
  `test/harness-parity.test.mjs`) precisely so neither package needs the
  other as an npm dependency. Vendoring couples bytes, not version numbers.

## Order, and why

1. **`prooflane-receipts`** — smallest, zero dependencies, most
   foundational; confirms auth/registry mechanics on the lowest-risk tarball.
2. **`prooflane-harness`** — also dependency-free; no install-time relation
   to receipts (source-level vendoring only).
3. **`@create-cmp/inspector`** — real dependencies
   (`@modelcontextprotocol/sdk`, `zod` — both declared), largest tarball, and
   its downstream consumer (the MCP registry submission, internal
   `docs/research/launch/mcp-registry/SUBMIT.md`) can only proceed after this
   publish. Its **bin** stays `cmp-inspector-mcp` — a command name, not a
   package name.

No ordering is a *correctness* requirement; each tarball builds and installs
alone. Foundational-first is risk ordering.

## Shared pre-flight

```sh
node -v                                       # v24.18.0 on this machine
npm whoami                                    # must print a username
git status --porcelain                        # the three package dirs clean
node --test test/harness-parity.test.mjs      # green
node --test test/inputs-hash-parity.test.mjs  # green
```

## Publish + verify, per package

Each package.json already carries `publishConfig.access: "public"` — required
knowledge, not boilerplate: **scoped names default to restricted**, and this
field is what makes the publish public without a CLI flag.

### `prooflane-receipts`

```sh
cd packages/receipts
npm view prooflane-receipts version   # expect E404 (name unclaimed). A version here
                                        # means someone claimed it — STOP, do not publish over it
npm pack --dry-run                      # eyeball the file list one last time
npm publish                             # prepublishOnly runs the package's own tests
# verify:
npm view prooflane-receipts version
cd "$(mktemp -d)" && npm init -y >/dev/null && npm i prooflane-receipts
node -e "import('prooflane-receipts').then(m => console.log(Object.keys(m).length, 'exports'))"
```

### `prooflane-harness`

```sh
cd packages/harness
npm view prooflane-harness version    # expect E404
npm pack --dry-run
npm publish
# verify:
cd "$(mktemp -d)" && npm init -y >/dev/null && npm i prooflane-harness
node -e "import('prooflane-harness/harness-region').then(m => console.log(typeof m.hashHarnessRegion))"   # → function
```

No `prepublishOnly` here, deliberately: the package's real proof is the two
repo-root parity tests in pre-flight (they test across the package ↔ template
↔ fresh-scaffold boundary). A local `npm test` would run zero test files and
exit 0 — a gate that *looks* like verification is worse than none.

### `@create-cmp/inspector`

```sh
cd inspector/mcp
npm view @create-cmp/inspector version  # expect E404
npm pack --dry-run
npm publish                             # prepublishOnly runs the inspector's own suite
# verify — the check that matters is a cold npx start:
cd "$(mktemp -d)" && npx -y @create-cmp/inspector </dev/null & sleep 8; kill %1 2>/dev/null
# a stdio MCP server starting cleanly and waiting on stdin is SUCCESS;
# an immediate crash or stack trace is not
```

Then — and only then — the MCP registry submission (internal SUBMIT.md).

## Risks and open decisions (a human decides; this doc only names them)

- **Squat risk until published.** All three names were confirmed unclaimed
  (E404) on 2026-08-21. Only publishing reserves them.
- **Irreversibility.** `npm unpublish` is limited to a 72-hour window and
  discouraged even inside it; after that: deprecate, never remove, and a
  fully-unpublished name cannot be reused. Treat each first publish as a
  go/no-go decision.
- **`prooflane-receipts` at 0.1.0 vs 1.0.0.** Its docs present the receipt
  format as stable and single-source-of-truth; `0.1.0` says "no compatibility
  promise yet". Shipping `1.0.0` makes the promise explicit — breaking
  `evaluateReceipt` or `VERIFIED_SURFACE` then costs a major. The repo's gate
  requires only *a* valid semver; the promise level is your call.
- **`prooflane-harness` is the whole lane, not just the lock.** Most of the
  tarball only runs vendored inside a scaffolded app; the standalone value is
  the region hash-lock. The README says so — this is an expectation to set at
  publish time, not a defect.
- **`@create-cmp/inspector`'s next version.** Its public tool surface shrank
  by deliberate consolidation since its last internal version; removals are
  breaking for callers, so the first public version after that consolidation
  should bump accordingly rather than patch.
