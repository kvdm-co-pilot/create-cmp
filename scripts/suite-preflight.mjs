// THE DOOR OF `npm test`: AN UNINSTALLED TREE IS REFUSED BY NAME, NOT LEFT TO
// EXPLAIN ITSELF THROUGH WHICHEVER ASSERTION HAPPENS TO BREAK FIRST.
//
// Measured 2026-09-18 in a fresh git worktree with `inspector/mcp`'s packages
// absent: `npm test` reported three failures, and only ONE of them looked like a
// missing install.
//
//     ✖ inspector/mcp/test/bundle-freshness.test.mjs   ERR_MODULE_NOT_FOUND: 'esbuild'
//     ✖ inspector/mcp/test/server-tools.test.mjs       ERR_MODULE_NOT_FOUND: '@modelcontextprotocol/sdk'
//     ✖ the console host delivers no profile console copy …
//                                                      AssertionError: stepGoverns={}
//
// The third is the defect. It is a semantic claim about product behaviour — the
// Evidence tab does not link a step to the section it governs — landing in a
// contributor's terminal as the first thing they see about their own change. The
// channel that produces it is real and still here: `applyConsoleCopy` in
// inspector/mcp/src/lib/preview-service.mjs wraps the profile load in a bare
// `catch {}` and degrades to neutral copy, so ANY load error, including an
// unresolvable module, is re-narrated downstream as "no console copy". A reader
// cannot tell that apart from a bug they wrote.
//
// Nobody is wrongly served by the shipped product here — one root `npm ci`
// provisions every package and .github/workflows/ci.yml does exactly that, so CI
// is never in this state and no adopter is. The cost is a wrong DIAGNOSIS, paid
// by the first outside person to clone this repository.
//
// ── WHY A REFUSAL AND NOT A SKIP ──────────────────────────────────────────────
//
// A skip that names its reason is usually the kinder outcome, and it is the wrong
// one here, for a reason measured in this repo's own reporter: `recordRun` in
// scripts/suite-reporter.mjs computes
//
//     verdict: counts.fail > 0 || counts.cancelled > 0 ? "FAIL" : "PASS"
//
// — `counts.skipped` is recorded and does not reach the verdict. Skipping the
// victims would make an uninstalled tree report PASS, with a suite record and a
// history row saying so. A green verdict over tests that never ran is the exact
// thing this project exists to refuse; a red one that misattributes its cause is
// merely expensive. So the door refuses, and the runner never starts.
//
// The second reason is that a skip has to ENUMERATE its victims. Two of the three
// above reproduce deterministically from an absent `inspector/mcp/node_modules`;
// the third did not reproduce from that condition alone when this was written,
// only its channel was found. A door does not need to know who would have been
// hurt, which is why it is the instrument that fits what is actually known.
//
// ── THE PREDICATE, AND THE THREE CHEAPER ONES THAT ARE WRONG ──────────────────
//
// The question is "would Node find this package from here", so the answer is
// Node's own lookup: walk up from the package's directory and ask whether
// `node_modules/<name>/package.json` exists. Three shorter spellings were
// measured on a CORRECTLY INSTALLED tree and all three answer falsely:
//
//   1. "each declared workspace has a node_modules" — 10 of this repo's 12
//      declared packages have NONE after a clean `npm ci`, because their
//      dependencies hoist to the root. This predicate refuses a correct tree.
//   2. `import.meta.resolve(spec, parentUrl)` — the two-argument form needs
//      --experimental-import-meta-resolve; unflagged, the parent is IGNORED, so
//      it answers about the wrong directory. Measured: esbuild, zod and
//      @modelcontextprotocol/sdk all reported missing while installed.
//   3. `require.resolve(name)` / a bare-specifier import — both go through the
//      package's `exports` map, and a package with only subpath exports has no
//      `.` to resolve. Measured: `require.resolve("@modelcontextprotocol/sdk")`
//      throws MODULE_NOT_FOUND from `inspector/mcp` where it IS installed.
//
// Each of those, used as a skip condition, would have hidden real failures in
// packages it wrongly called uninstalled. The walk cannot: it is the resolver's
// own directory lookup, minus the export-map layer that is not being asked about.
//
// ── TWO RULES THIS FILE KEEPS ────────────────────────────────────────────────
//
// IT IMPORTS ONLY `node:` BUILTINS. A preflight that needs what it checks for
// cannot run on the tree it exists to describe. A test pins this.
//
// IT FAILS OPEN. Anything it cannot read or does not understand — an unreadable
// manifest, a workspace glob shape it does not implement — prints a note and
// exits 0, so the suite runs exactly as it did before this file existed. A
// preflight that goes wrong must cost a worse error message, never an unrunnable
// repository.
//
// KNOWN LIMIT: the walk is npm's layout. A pnpm or Yarn-PnP tree is not what this
// repo declares (package-lock.json, npm workspaces, `npm ci` in CI) and is not
// covered; a Yarn-PnP checkout would be refused while working, loudly and with a
// command to run.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * THE ONLY WORKSPACE PATTERN THIS READER IMPLEMENTS — a literal path, optionally
 * with a trailing `/*`. Everything else declines (see `declaredPackages`).
 *
 * This is an ALLOW-LIST and not a list of metacharacters to reject, which is the
 * same choice `declaredSuiteFiles` in scripts/suite-reporter.mjs already makes
 * about the patterns it hands to a shell, and it is here because a deny-list was
 * measured wrong. npm resolves workspaces with `@npmcli/map-workspaces`, which
 * accepts negation, braces, `**` and character classes. The first version of
 * this reader rejected only `*` in the wrong place, so:
 *
 *   ["ws/*", "!ws/b"]   npm installs `a` only; the door walked `a` AND `b` and
 *                       refused over dependencies `npm ci` will never install —
 *                       a correctly installed tree that can never run its suite,
 *                       and the one command the refusal names cannot clear it
 *   ["ws/{a,b}"]        npm installs both; the door walked NEITHER, silently,
 *                       covering less than its own docstring promised
 *
 * A second reader of one declaration must agree with the first or decline. The
 * declining direction is free — the suite runs exactly as it did before this
 * file existed — and the disagreeing direction is unrecoverable.
 */
const LITERAL_PATH = /^[\w./-]+$/;

/**
 * Would Node find `name` as a package, starting from `fromDir`? The resolver's
 * node_modules walk, and nothing above it: no `exports` map, no conditions, no
 * subpath. Those answer a different question (can this specifier be imported),
 * and answering it here is what makes cheaper spellings refuse correct trees.
 *
 * A broken symlink is not installed — `existsSync` follows links, so a dangling
 * workspace link reads false, which is the honest answer.
 *
 * The walk does not stop at the repository root because Node's does not: a
 * checkout nested under another project's node_modules really can resolve from
 * there, and a predicate that disagreed with the resolver would be a third fact.
 *
 * @param {string} fromDir
 * @param {string} name a bare package name, scoped or not
 * @returns {boolean}
 */
export function installedFrom(fromDir, name) {
  for (let dir = path.resolve(fromDir); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "node_modules", name, "package.json"))) return true;
    if (dir === path.dirname(dir)) return false;
  }
}

/**
 * Every package whose dependencies this tree owes: the root, plus each workspace
 * the root manifest declares. Read from `workspaces` rather than listed here —
 * a list in this file would be a second declaration of the same fact, and the
 * two would drift.
 *
 * Throws on any shape it does not implement, so the caller fails OPEN rather
 * than quietly covering a different set than npm does.
 *
 * @param {string} [root]
 * @returns {Array<{rel: string, name: string, deps: string[]}>}
 */
export function declaredPackages(root = REPO_ROOT) {
  const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel, "package.json"), "utf8"));
  const manifest = read(".");
  const rels = ["."];
  const declared = manifest.workspaces;
  // npm also accepts the yarn-style `{ "packages": [...] }` object. Not
  // implemented, so it declines rather than reading `undefined` as "no
  // workspaces" — which would silently cover only the root.
  if (declared !== undefined && !Array.isArray(declared)) {
    throw new Error(`workspaces is not an array: ${JSON.stringify(declared).slice(0, 80)}`);
  }
  for (const pattern of declared ?? []) {
    if (typeof pattern !== "string") throw new Error(`workspace pattern is not a string: ${String(pattern)}`);
    const literal = pattern.endsWith("/*") ? pattern.slice(0, -2) : pattern;
    if (!LITERAL_PATH.test(literal)) throw new Error(`workspace pattern not implemented: ${pattern}`);
    if (!pattern.endsWith("/*")) {
      rels.push(pattern);
      continue;
    }
    // THE EXPANSION IS THE SECOND AXIS, and it diverged from npm in both
    // directions until this loop stopped asking `isDirectory()`. Measured:
    //
    //   ws/.hidden/     npm: [a]          door: [a, hidden]   REFUSING direction
    //   ws/linked -> …  npm: [a, linked]  door: [a]           silent under-coverage
    //
    // npm's globber ignores dot-entries by default, and `isDirectory()` is FALSE
    // for a symlinked directory that npm follows. Neither judgement belongs
    // here: a dot-entry is not a workspace to npm, and everything else is
    // decided by whether it holds a `package.json` — which is the same question
    // the `rels` loop below already asks, so asking it twice with two different
    // answers was the whole defect. This is KD-44's rule one module over: do not
    // re-implement the other reader's globber.
    for (const entry of fs.readdirSync(path.join(root, literal))) {
      if (entry.startsWith(".")) continue;
      rels.push(path.posix.join(literal, entry));
    }
  }
  const packages = [];
  for (const rel of rels) {
    // A workspace directory with no manifest is not an uninstalled package —
    // it is not a package. Skipping it here is not the silent kind: nothing
    // about it is claimed.
    if (!fs.existsSync(path.join(root, rel, "package.json"))) continue;
    const pkg = read(rel);
    packages.push({
      rel,
      name: typeof pkg.name === "string" ? pkg.name : rel,
      // optionalDependencies are excluded by their own definition; peer
      // dependencies are the consumer's to install, not this tree's.
      deps: [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})],
    });
  }
  return packages;
}

/**
 * The declared packages that cannot see one or more of their dependencies —
 * `[]` on an installed tree, which is what makes this a no-op everywhere except
 * the tree it is about.
 *
 * @param {string} [root]
 * @returns {Array<{rel: string, name: string, missing: string[]}>}
 */
export function uninstalled(root = REPO_ROOT) {
  const findings = [];
  for (const pkg of declaredPackages(root)) {
    const missing = pkg.deps.filter((dep) => !installedFrom(path.join(root, pkg.rel), dep));
    if (missing.length) findings.push({ rel: pkg.rel, name: pkg.name, missing });
  }
  return findings;
}

/**
 * What the contributor reads. It names the package, the dependencies, the one
 * command, and — because the next person to touch this will ask — why it is a
 * refusal rather than the test run they asked for.
 *
 * @param {Array<{rel: string, name: string, missing: string[]}>} findings
 * @returns {string}
 */
export function refusal(findings) {
  const rows = findings
    .map((f) => `    ${f.rel}${f.name === f.rel ? "" : ` (${f.name})`}\n        missing: ${f.missing.join(", ")}`)
    .join("\n");
  return [
    "npm test refused: this tree's packages are not installed.",
    "",
    rows,
    "",
    "  Run this at the repository root, then npm test again:",
    "",
    "      npm ci",
    "",
    "  This is a refusal rather than a test run because the run would not name the",
    "  cause. Some files fail with ERR_MODULE_NOT_FOUND, which is readable; others",
    "  fail on their own ASSERTION, about product behaviour, in code you may have",
    "  just changed. It is a refusal rather than a skip because this suite's verdict",
    "  does not count skipped tests (scripts/suite-reporter.mjs) — skipping would",
    "  report PASS for a tree that never ran them.",
    "",
  ].join("\n");
}

/**
 * The door. Exit 1 with the refusal, or exit 0 silently — and exit 0 with a note
 * for anything else at all, which is the fail-open rule above.
 *
 * @param {string} [root]
 * @returns {number} the exit code
 */
export function main(root = REPO_ROOT) {
  let findings;
  try {
    findings = uninstalled(root);
  } catch (err) {
    process.stderr.write(
      `suite preflight could not read this tree, so it is not deciding anything: ${err?.message ?? err}\n`,
    );
    return 0;
  }
  if (!findings.length) return 0;
  process.stderr.write(refusal(findings));
  return 1;
}

// `PROOFLANE_SUITE_ROOT` points it at another root, which only a test does —
// the same knob, with the same meaning, that scripts/suite-reporter.mjs reads.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.env.PROOFLANE_SUITE_ROOT || REPO_ROOT));
}
