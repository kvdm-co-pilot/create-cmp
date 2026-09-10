// What the device run could have been affected by, as a content digest.
//
// The fleet record first keyed its validity to `git rev-parse HEAD`, and that
// can never work: the run happens BEFORE the commit that carries it, so the
// recorded commit is always the parent and every record reads STALE the moment
// it lands. A warning that is always on is a warning nobody reads — worse than
// none, because it looks like coverage.
//
// A commit is a LABEL. What actually decides whether yesterday's device run
// still speaks for today's code is the CONTENT of the paths that feed it, which
// is the same reasoning inputs-hash.mjs applies to a receipt: bind to the bytes,
// not to a name for them. Committing does not change bytes, so a record stays
// valid across the commit it is quoted in — and editing one byte under a
// trigger root invalidates it immediately, committed or not.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

/**
 * The content a device run's validity depends on, for THIS repo — the template
 * plus the package sources it is built from. create-cmp is the engine, not a
 * stamped app, so this is what `fleet-check` actually exercises.
 */
export const DEVICE_TIER_TRIGGERS = Object.freeze(["template/", "packages/harness/src/", "packages/receipts/src/"]);

/**
 * What CANNOT affect a device run here. Declared as irrelevance rather than
 * relevance on purpose (see deriveTierNeed): anything unclassified obliges the
 * tier, so forgetting to list a new directory costs a device run, never a
 * missed regression. Markdown cannot change what executes on a phone; this
 * repo's own tests, scripts and CI config do not ship into the stamped app.
 */
export const DEVICE_TIER_IRRELEVANT = Object.freeze([
  "docs/",
  "test/",
  "scripts/",
  ".github/",
  "*.md",
  // The inspector SHIPS (the tokenDrift step talks to it), so `inspector/` as a
  // whole is not irrelevant — that is `inspector/harness/`, whose code is
  // compiled into the app and answers on :9500. `inspector/mcp/` is the other
  // thing entirely: the MCP server and the console it serves, dev tooling that
  // runs on this machine. Widened from `inspector/mcp/test/` on 2026-09-10
  // after checking the only question that matters here — can it change what a
  // phone does in `fleet-check`? `fleet-check` scaffolds a scratch app from
  // `template/` + `packages/harness/src/` and contains ZERO references to
  // `inspector`, so nothing under `inspector/mcp/` is reachable from a device
  // run. The narrower entry cost a device run every time the console bundle was
  // rebuilt, which was nine times in one night.
  "inspector/mcp/",
  // This repo's own Claude Code hooks and agent definitions. What SHIPS is
  // `template/.claude/`, which is under a trigger; this one configures the
  // agent that develops the harness and never reaches a stamped app.
  ".claude/",
  // THE CONSOLE IS NOT VENDORED. `packages/harness/src/` is a trigger root
  // because most of it becomes `template/qa/`, but `sync-harness.mjs`'s
  // REGION_DIRS copies `src` and `src/lib` ONLY — `console/` is not among them,
  // and `template/qa/` contains zero console files. The console is a web page
  // served by the inspector MCP for local development; nothing in it can reach
  // a phone.
  //
  // Nine consecutive device runs were spent proving a phone still worked after
  // changing that web page, on 2026-09-09/10. All nine passed, so nothing is
  // being hidden by this entry — they were incapable of failing for the reason
  // they were run. The set's own rule three entries up ("the cost of a
  // too-narrow entry is one device run and the cost of a too-wide one is a
  // missed regression") is what argues for naming this: it is the same property
  // `inspector/mcp/test/` is named for, and it was missed because the console
  // sits under a root that mostly does ship.
  //
  // Stated plainly because this entry unblocks the merge of the slice that
  // found it: the reasoning is structural and checkable — `REGION_DIRS` in
  // scripts/sync-harness.mjs, and `ls template/qa/**/console*` returning
  // nothing — not a judgement about risk.
  "packages/harness/src/console/",
]);

const SKIP_DIRS = new Set(["node_modules", ".git", "build", "dist", "out"]);

function filesUnder(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) filesUnder(abs, out);
    else if (e.isFile()) out.push(abs);
  }
  return out;
}

/**
 * Exactly the files a hash over `roots` is taken of, as relative POSIX paths.
 *
 * Exported because a set of roots makes a promise — "everything that obliges
 * this tier can also invalidate it" — and the only honest way to test that
 * promise is to ask the walker itself which files it reaches, rather than to
 * write a second predicate that agrees with it right up until it does not.
 *
 * A root may be a DIRECTORY, walked, or a single FILE: a repo's root holds
 * `package.json`, `LICENSE` and `.gitignore`, and a tier whose roots must all
 * be directories silently cannot see any of them. Missing roots contribute
 * nothing rather than throwing.
 *
 * @param {string} root repo root
 * @param {string[]} roots relative directories or files whose content feeds the tier
 * @param {{skip?: (relPath: string) => boolean}} [opts] paths the tier declares
 *   unable to affect it, decided from the path alone
 * @returns {string[]} sorted relative POSIX paths
 */
export function filesFor(root, roots, { skip = () => false } = {}) {
  const rel = (abs) => path.relative(root, abs).split(path.sep).join("/");
  const out = new Set();
  for (const r of roots) {
    const abs = path.join(root, r);
    let st;
    try {
      st = fs.statSync(abs);
    } catch {
      continue;
    }
    if (st.isFile()) out.add(rel(abs));
    else if (st.isDirectory()) for (const f of filesUnder(abs)) out.add(rel(f));
  }
  return [...out].filter((p) => !skip(p)).sort();
}

/**
 * sha256 over every file under `roots`, by relative path and content.
 *
 * Deterministic, git-independent, and unchanged by committing. Missing roots
 * contribute nothing rather than throwing — a project that declares a root it
 * does not have gets a smaller digest, not a crash.
 *
 * @param {string} root repo root
 * @param {string[]} roots relative directories or files whose content feeds the tier
 * @param {{skip?: (relPath: string) => boolean}} [opts] see filesFor
 * @returns {string} hex digest
 */
export function observedTreeHash(root, roots, opts) {
  const rows = filesFor(root, roots, opts).map(
    (relPath) => `${relPath}\n${createHash("sha256").update(fs.readFileSync(path.join(root, relPath))).digest("hex")}`,
  );
  return createHash("sha256").update(rows.join("\n")).digest("hex");
}

/**
 * The content a REVIEW's validity depends on — and, as its complement, what is
 * declared unable to want a reader at all.
 *
 * WHY THE SET IS BROADER THAN THE DEVICE'S. A device run proves what executes
 * on a phone, so `scripts/`, `test/` and `.github/` cannot affect it and are
 * declared irrelevant above. A review is not about a phone: it is a second
 * reader on a change that can alter behaviour, and a rewrite of
 * `scripts/proof-plan.mjs` or a test that quietly stops refusing what it used
 * to refuse is exactly the change that most wants one. ADR-0014 fixes the
 * boundary: "It runs on delegated work and on changes touching a trigger path
 * or a signed artifact; not on a doc-only slice."
 *
 * SO THE DECLARATION IS: prose is irrelevant, and everything else obliges a
 * review. Markdown anywhere and `docs/` wholesale cannot change what runs;
 * they are the doc-only slice ADR-0014 exempts. Nothing else is exempt — not
 * this repo's own scripts, not its tests, not its CI workflows, not
 * `package-lock.json`. The direction of the error is the same one
 * `deriveTierNeed` was built for: an unclassified path costs a read of a diff,
 * never a missed defect.
 *
 * TWO ENTRIES ARE NOT PROSE AND ARE STILL DECLARED IRRELEVANT, both because
 * the hash below cannot see them and a rule the hash cannot enforce is a rule
 * that pretends: `*.gitkeep` (empty directory markers, and `filesFor` skips
 * dotfiles) and `inspector/mcp/dist/` (a built artifact whose source is under
 * `inspector/`, which IS hashed — and `dist` is in SKIP_DIRS). Declaring them
 * keeps the two halves honest instead of leaving a path that obliges a review
 * but could never reopen one.
 *
 * WHAT THIS COSTS, said out loud: a slice that only rewrites a SKILL.md — an
 * instruction an agent will execute — owes no review, because it is markdown.
 * That is the accepted price of a boundary drawn where a program can see it
 * without parsing prose for intent. ADR-0014 names the trigger set as the lever
 * if it proves wrong in either direction.
 */
export const REVIEW_TIER_IRRELEVANT = Object.freeze(["docs/", "*.md", "*.gitkeep", "inspector/mcp/dist/"]);

/**
 * The roots whose bytes a review record is bound to — the complement of the
 * declaration above, enumerated, because `filesFor` walks roots rather than
 * excluding.
 *
 * It is a LONG list on purpose. Every tracked path that obliges a review must
 * also be able to REOPEN one, or the ordering rule has a hole: an author could
 * discharge the review and then edit the one directory nobody listed. That
 * invariant is not an intention here, it is a test —
 * test/proof-plan.test.mjs's "every path that obliges a review is a path that
 * can reopen it" walks `git ls-files` through these exact roots.
 *
 * Three shapes appear, and each is a fact about `filesFor`, not a preference:
 *  - directories, walked;
 *  - single FILES, because a repo's root holds `package.json`, `LICENSE` and
 *    `.gitignore`, and a change to any of them can change what runs;
 *  - dot-directories named EXPLICITLY (`template/.claude/`, `.claude/settings.json`),
 *    because the walker skips dot-entries it meets INSIDE a root. `template/` is
 *    a device trigger and its `.claude/` has never been hashed by that tier
 *    either — that gap is the device tier's and is left alone here; this set
 *    simply does not inherit it.
 *
 * `.claude/` is NOT a root, and `.claude/settings.json` is named instead: agent
 * worktrees live under `.claude/worktrees/` in the main checkout, so walking
 * that directory would hash entire copies of this repository, and
 * `.claude/settings.local.json` is machine-local state that would key the hash
 * to one laptop. `qa-artifacts/` is not a root either — the review record is
 * written INTO it, and a record that invalidated itself the moment it landed
 * would be the always-stale warning `observed-tree.mjs` exists to avoid.
 */
export const REVIEW_TIER_TRIGGERS = Object.freeze([
  "src/",
  "bin/",
  "scripts/",
  "test/",
  "packages/",
  "template/",
  "template/.claude/",
  "template/.github/",
  "template/.githooks/",
  "inspector/",
  "skills/",
  "agents/",
  ".github/",
  ".claude-plugin/",
  ".claude/settings.json",
  ".gitignore",
  ".mcp.json",
  "LICENSE",
  "fleet.json",
  "llms.txt",
  "options.schema.json",
  "package.json",
  "package-lock.json",
]);

/**
 * Markdown never enters the review hash.
 *
 * The device tier hashes the markdown under `template/` and accepts that a
 * comment reopens the slice — it has to, because it cannot tell a comment from
 * a statement without a parser for every ecosystem it might meet. Here the
 * question is decidable from the path alone: markdown is already declared
 * unable to OBLIGE a review, so letting it INVALIDATE one would make the two
 * halves disagree, and would charge a re-read of the diff for a typo in a
 * README in a repo whose rule is that docs move in the same commit as the code.
 * Anything else in REVIEW_TIER_IRRELEVANT is simply not a root.
 */
export const REVIEW_SKIP = (relPath) => relPath.endsWith(".md");

/**
 * What the DEVICE hash must not see. The oblige and reopen halves have to agree:
 * `DEVICE_TIER_IRRELEVANT` stops a path obliging a run, and without the same
 * exclusion here the hash still moves when that path changes, so the run is
 * reopened by a file that could never have obliged it. The review tier already
 * had this (REVIEW_SKIP); the device tier did not, because until 2026-09-10
 * nothing under its trigger roots was irrelevant.
 *
 * `console/` is the whole of it: `packages/harness/src/` is a trigger root
 * because most of it becomes `template/qa/`, and sync-harness.mjs's REGION_DIRS
 * copies `src` and `src/lib` only — the console ships to no phone.
 */
export const DEVICE_SKIP = (relPath) => relPath.startsWith("packages/harness/src/console/");
