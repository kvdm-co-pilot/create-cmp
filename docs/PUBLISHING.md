# Publishing — the sub-packages

A runbook for publishing `packages/receipts` (`cmp-receipts`) and
`packages/harness` (`create-cmp-harness`) to npm. This is a **human-run**
process: nothing in this doc executes itself, and publishing a package name
that has never existed on the registry is effectively a one-way door (see
Risks, below).

For the root CLI (`create-cmp-cli`) and its alias packages, use the
`npm-publish` skill (`.claude/skills/npm-publish/SKILL.md`) instead — this doc
covers the two packages that skill does not, and calls out where the two
processes touch.

## The version spine

**Lockstep set:** the root CLI (`create-cmp-cli`), the Claude Code plugin
(`.claude-plugin/plugin.json`), and its marketplace entry
(`.claude-plugin/marketplace.json`) move together, as one release. This repo
*is* the plugin source, so a split there ships a plugin that misreports the
engine it wraps. `test/doc-counts.test.mjs`'s `"the version spine moves in
lockstep"` test pins `plugin === cli` and `marketplace === cli`, derived by
`scripts/ground-truth.mjs`. As of this writing that's `0.14.1`.

**Deliberately independent:** `create-cmp-harness`, `cmp-receipts`, and
`@create-cmp/inspector-mcp` (private, not published — see Scope, below) each
version on their own schedule. This is a design decision, not an oversight —
`template/CLAUDE.md` states it directly: the lane "belongs to
`create-cmp-harness`, versioned independently of the engine that stamped this
app's shape," and the 0.14.0 CHANGELOG entry says the same. The point is
concrete: a generated project should be able to run
`npx create-cmp-cli upgrade --harness` and pick up a lane fix **without**
also picking up a new template/app shape, and vice versa. `create-cmp-harness`
currently reads `0.14.1` too, but that is coincidence — the two spines
happened to bump together at the same release — not an invariant. Do not
"fix" a future divergence between the CLI version and the harness version;
divergence is the feature working as intended.
`test/doc-counts.test.mjs`'s `"every independently-versioned package still
declares a version"` test only asserts each of `harness`, `receipts`, and
`inspectorMcp` has *some* valid semver — never that they match the CLI.

`cmp-receipts` versions independently of `create-cmp-harness` too, even
though `create-cmp-harness` vendors a byte-identical copy of two of its files
(`src/lib/inputs-hash.mjs`, `src/lib/receipt-validate.mjs` — kept in sync by
`node scripts/sync-harness.mjs`, pinned by `test/harness-parity.test.mjs`).
That vendoring is what keeps `create-cmp-harness` dependency-free (no npm
dependency on `cmp-receipts` at all); it does not couple their version
numbers.

## Scope — what this doc does NOT cover

`inspector/mcp` (`@create-cmp/inspector-mcp`) is `private: true` — it is not
published and this doc does not change that. It's named here only because
`scripts/ground-truth.mjs` tracks its version alongside the other two as part
of the "independently versioned" set.

## Why this order

1. **`cmp-receipts` first.** It has zero dependency on `create-cmp-harness`
   (verified: every `import` in `packages/receipts/src/` resolves to a
   `node:` builtin or a relative path — no `dependencies` in its
   `package.json`). Nothing downstream needs it published first, but
   publishing the smaller, simpler, more foundational package first is the
   lower-risk order, and confirms the auth/registry mechanics work before the
   larger tarball.
2. **`create-cmp-harness` second.** Also zero npm dependencies (same check,
   same result, over `packages/harness/src/**`) — it does *not* depend on
   `cmp-receipts` as an installed package, only vendors a byte-identical copy
   of two of its files at the source level. Publishing order between the two
   is not a correctness requirement for either tarball to build or install
   correctly; it's just the more foundational-first convention above.
3. **Root CLI / plugin / marketplace are unaffected by either of the above**
   and follow their own lockstep release via the `npm-publish` skill,
   whenever that's next warranted. There is no ordering dependency forcing
   this doc's publishes and that skill's release to happen in the same
   sitting.

## Before either package: shared pre-flight

```sh
node -v                              # this repo verifies against v24.18.0
npm whoami                           # must print a username — auth is ambient via ~/.npmrc,
                                      # ONLY use `npm whoami`; never read/echo the token itself
git status --porcelain               # both package directories should be clean
node --test test/harness-parity.test.mjs      # must be green
node --test test/inputs-hash-parity.test.mjs  # must be green
```

`npm whoami` uses the same granular-token, bypass-2FA setup documented in the
`npm-publish` skill's Auth section — it is shared machine-level config, not
something this doc or that skill each maintain separately.

## Publishing `cmp-receipts`

```sh
cd packages/receipts
npm view cmp-receipts version          # expect E404 (first publish) — if it prints a
                                        # version instead, STOP: someone/something already
                                        # claimed this name; do not publish over it blindly
npm pack --dry-run                     # sanity-check the exact file list one more time
npm publish                            # publishConfig.access is "public" in package.json,
                                        # so no --access flag is needed for this unscoped name;
                                        # prepublishOnly runs `npm test` (16 tests) as the final gate
```

**Verify after:**

```sh
npm view cmp-receipts version           # should now print 0.1.0 (or whatever was just published)
mkdir /tmp/verify-cmp-receipts && cd /tmp/verify-cmp-receipts
npm init -y && npm install cmp-receipts
node -e "import('cmp-receipts').then(m => console.log(Object.keys(m)))"
# expect: computeInputsHash, VERIFIED_SURFACE, RECEIPT_REL_PATH, readReceipt,
#         evaluateReceipt, DEFAULT_POLICY, checkFreshness,
#         checkExecutionPlausibility, listSkippedSteps, validateReceiptForTree
```

## Publishing `create-cmp-harness`

```sh
cd packages/harness
npm view create-cmp-harness version    # expect E404 — same "someone already owns this" check
npm pack --dry-run                     # 38 files, ~160 kB packed / ~503 kB unpacked as of 0.14.1
npm publish                            # publishConfig.access is "public"; there is currently
                                        # no prepublishOnly here (see Note below)
```

**Note on `prepublishOnly` for this package:** unlike `cmp-receipts`,
`create-cmp-harness` ships `test/` as an empty directory — its actual
correctness proof (`test/harness-parity.test.mjs`,
`test/inputs-hash-parity.test.mjs`) lives at the create-cmp repo root, testing
across the package ↔ template ↔ fresh-scaffold boundary, not as tests
packaged inside `packages/harness` itself. Adding a `prepublishOnly: npm
test` there today would run `node --test` against zero test files (a silent,
meaningless "0 pass, 0 fail, exit 0") — worse than no gate, because it *looks*
like verification. Run the two repo-root gates above by hand before
publishing this package instead; that is the actual proof.

**Verify after:**

```sh
npm view create-cmp-harness version
mkdir /tmp/verify-create-cmp-harness && cd /tmp/verify-create-cmp-harness
npm init -y && npm install create-cmp-harness
node -e "import('create-cmp-harness/harness-region').then(m => console.log(typeof m.hashHarnessRegion))"
# expect: function
node node_modules/create-cmp-harness/src/verify.mjs --help
# expect: the lane's usage text (this works standalone; running it as an actual
# verify lane requires being vendored into a project's qa/ — see the package README)
```

## Interaction with the `npm-publish` skill

- That skill publishes `create-cmp-cli` (+ its alias packages) from the
  **repo root**; publishing from a subpackage directory would hit `EPRIVATE`
  or publish the wrong package entirely. This doc's commands run from
  `packages/receipts/` and `packages/harness/` specifically — do not mix the
  two working directories.
- Both flows share one auth mechanism (token-first via `~/.npmrc`, `npm
  whoami` as the only probe, `npm login` as the interactive fallback) and one
  hard rule: never read, echo, or move the token.
- The skill's safety gate (`git status --porcelain` empty, on `main`, `node
  --test` green) is the root-CLI-specific version of the same discipline this
  doc asks for above, scoped to the two parity tests that actually cover
  these two packages.
- Neither flow is a prerequisite for the other. A `create-cmp-harness`
  publish does not require a fresh CLI release, and a CLI release does not
  require republishing either subpackage — that decoupling is the entire
  point of the independent version spine above.

## Risks and open decisions (for a human to decide, not this runbook)

- **Name-squatting risk.** Both `cmp-receipts` and `create-cmp-harness` are
  confirmed unclaimed today (`npm view` returns E404 for both, checked
  2026-08-20). Someone else could publish either name before this repo does.
  There is no reservation mechanism short of publishing a placeholder — that
  trade-off (publish early to lock the name vs. wait until the package is
  more polished) is a human call.
- **Publishing is effectively irreversible.** `npm unpublish` is restricted
  to a 72-hour window (and even inside it, unpublishing a name other people
  may have already depended on is discouraged by npm's own policy); after
  that, a published version can be deprecated but not removed, and the name
  cannot be reused if fully unpublished. Treat the first `npm publish` of
  each package as a one-way door — worth a deliberate go/no-go, not a step
  to run "to see what happens."
- **Is `cmp-receipts@0.1.0` the right version to ship first?** The package is
  presented — in its own README and in this repo's docs — as **the** stable,
  single-source-of-truth receipt format and predicate, consumed by every
  generated project and (eventually) a hosted validator. A `0.1.0` first
  publish signals "still moving, no compatibility promise yet," which sits
  awkwardly next to that stability claim; a `1.0.0` first publish is a
  stronger public commitment to the current API shape (breaking
  `evaluateReceipt`'s signature or `VERIFIED_SURFACE`'s meaning later would
  then need a major bump, with everything that implies for anyone who
  installed it). This repo's tests (`test/doc-counts.test.mjs`) only require
  *a* valid semver for this package, not a specific one. Deciding 0.1.0 vs.
  1.0.0 — and by extension, how much stability is actually being promised —
  is left to a human; this doc does not pick one.
- **`create-cmp-harness`'s size and audience.** At ~500 kB unpacked and 38
  files, most of it (e.g. `verify.mjs`, `scaffold-feature.mjs`,
  `approvals.mjs`) is only useful vendored inside a create-cmp-shaped
  project, not as a general npm dependency. Publishing it standalone is
  still worthwhile — it makes the machine-owned region's hash-lock mechanism
  (`hashHarnessRegion` / `checkHarnessIntegrity`) independently installable
  and auditable, which is the differentiated part — but a human should be
  aware the published package is not "just" that mechanism; it's the whole
  lane, most of which won't run outside a scaffolded app. The README's "What
  this does NOT do" section states this; it is flagged here as a publish-time
  expectation to set, not a defect to fix.
