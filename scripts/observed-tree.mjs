// What a proof could have been affected by, as a content digest.
//
// A record first keyed its validity to `git rev-parse HEAD`, and that can never
// work: the run happens BEFORE the commit that carries it, so the recorded
// commit is always the parent and every record reads STALE the moment it lands.
// A warning that is always on is a warning nobody reads — worse than none,
// because it looks like coverage.
//
// A commit is a LABEL. What actually decides whether yesterday's proof still
// speaks for today's code is CONTENT, which is the same reasoning
// inputs-hash.mjs applies to a receipt: bind to the bytes, not to a name for
// them. Committing does not change bytes, so a record stays valid across the
// commit it is quoted in.
//
// THE DEVICE TIER NO LONGER HASHES ANYTHING HERE, and that deletion is what
// this file carries. It used to: `DEVICE_TIER_TRIGGERS` named `template/` +
// `packages/harness/src/` + `packages/receipts/src/`, `DEVICE_SKIP` carved the
// console back out, and `deviceTreeHash` was the key a device run's validity
// was bound to. All three are a PROXY for the only question a device run
// answers — does the app this tree STAMPS differ from the app the run proved —
// and the proxy was wrong in both directions: an edit under
// `packages/harness/src/` that never reached `template/qa/` reopened a
// discharged slice over a byte-identical app, and a slice that touched only
// `src/lib/args.mjs` owed a 3.5-minute run for an app it could not change. The
// question is now asked directly, by stamping the app and hashing it
// (`scripts/stamped-output.mjs`, ~0.35s), and a proxy nobody consults is a
// second spelling of a rule — which drifts in whichever half is read less.
//
// What remains here for the device tier is `DEVICE_TIER_IRRELEVANT`, which
// answers a different question and says so where it is declared. The REVIEW
// tier still binds to paths, because a review is a READER on a diff rather than
// a claim about an artifact, and there is no artifact to hash.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { deriveTierNeed } from "../packages/harness/src/lib/affected-tests.mjs";

/**
 * What CANNOT OBLIGE a device run here — and that is the whole of what this
 * list now does.
 *
 * IT IS NOT THE TIER'S KEY. What DISCHARGES the tier is the app this tree
 * stamps (`scripts/stamped-output.mjs`): a PASS run recorded against those
 * exact bytes. This is the cheap half, asked first, and it answers a question
 * the stamped app cannot — whether anything THIS SLICE changed could reach a
 * phone at all. A docs-only branch on a machine with no device record owes
 * nothing, and not because a record says so: because nothing it touched can
 * reach the question.
 *
 * Declared as irrelevance rather than relevance on purpose (see
 * deriveTierNeed): anything unclassified obliges the tier, so forgetting to
 * list a new directory costs one stamped-app comparison — 0.35s, which then
 * discharges it — rather than a missed regression. That error is far cheaper
 * than it was: before the tier was scheduled by the stamped app, a directory
 * missing from this list cost a 3.5-minute emulator run.
 *
 * This repo's own markdown cannot change what the stamped tree executes; this
 * repo's own tests, scripts and CI config do not ship into the stamped app.
 * Markdown UNDER `template/` is the exception, and `*.md` does not reach it —
 * see DEVICE_TIER_SHIPPED and `deviceTierNeed` below (KD-207).
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
  // nothing — not a judgement about risk. Since the tier was scheduled by the
  // stamped app, the comparison reaches that verdict by itself (a console
  // rebuild moves no byte of the app), so this entry saves the stamp rather
  // than saving a device run.
  "packages/harness/src/console/",
]);

/**
 * WHAT SHIPS INTO THE STAMPED APP, where a SUFFIX in DEVICE_TIER_IRRELEVANT
 * does not reach.
 *
 * KD-207: `*.md` declared every markdown file unable to oblige the runtime
 * tier, matched on the repo path, and markdown under `template/` ships INTO
 * the stamped app — `template/specs/*.md` is what the lane's spec-coverage,
 * e2e-coverage and approvals steps read. So a spec edit could never make the
 * tier required, and when something else did, the same bytes reopened it: the
 * two halves disagreed for exactly the shipped-markdown set, and a slice that
 * changed ONLY a spec was waved through with a digest nobody asked.
 *
 * Closed by making every path under these roots RELEVANT — the tier is then
 * required, and the stamped digest (scripts/stamped-output.mjs) JUDGES it: a
 * spec edit moves the digest and is owed; a `template/AGENTS.md` edit is prose
 * the cmp profile's L2 run never opens (UNOBSERVED_BY_PROFILE), so the digest
 * is equal and a matching record discharges it for the price of one stamp.
 * Being wrong toward "required" costs ~0.35s here; being wrong toward
 * "irrelevant" cost a spec change its L2 run.
 */
export const DEVICE_TIER_SHIPPED = Object.freeze(["template/"]);

/**
 * Must the runtime tier be asked about these paths — `deriveTierNeed` over
 * DEVICE_TIER_IRRELEVANT, with every path under DEVICE_TIER_SHIPPED put back.
 *
 * One function, for every reader that asks (`proof-plan`'s obligation and
 * `fit-test`'s row), so the two cannot disagree about one spec edit. A path
 * the declaration already obliges is not repeated; a shipped path it called
 * irrelevant is added to `obliging` and named in the reason, so a reader sees
 * WHY a markdown file made the tier required.
 *
 * @param {string[]|null} paths changed relpaths, or null when git could not say
 * @param {{tierName?: string}} [opts]
 * @returns {{required: boolean, reason: string, obliging: string[]}}
 */
export function deviceTierNeed(paths, { tierName = "the L2 run" } = {}) {
  const need = deriveTierNeed(paths, { irrelevantRoots: DEVICE_TIER_IRRELEVANT, tierName });
  if (!Array.isArray(paths)) return need;
  const posix = paths.filter((p) => typeof p === "string" && p.length > 0).map((p) => p.split(path.sep).join("/"));
  const shipped = posix.filter((p) => DEVICE_TIER_SHIPPED.some((r) => p.startsWith(r)) && !need.obliging.includes(p));
  if (!shipped.length) return need;
  const named = `${shipped.length} changed path(s) under ${DEVICE_TIER_SHIPPED.join(", ")} ship into the stamped app, and no suffix rule reaches them: ${shipped.slice(0, 3).join(", ")}${shipped.length > 3 ? ", …" : ""}`;
  return {
    required: true,
    reason: need.required ? `${need.reason}; and ${named}` : named,
    obliging: [...need.obliging, ...shipped],
  };
}

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
 * @param {{skip?: (relPath: string) => boolean, normalise?: (relPath: string, buf: Buffer) => Buffer}} [opts]
 *   `skip`: see filesFor; `normalise`: the bytes a file is hashed AS (default: its own)
 * @returns {string} hex digest
 */
export function observedTreeHash(root, roots, opts) {
  const normalise = opts?.normalise ?? ((_rel, buf) => buf);
  const rows = filesFor(root, roots, opts).map(
    (relPath) => `${relPath}\n${createHash("sha256").update(normalise(relPath, fs.readFileSync(path.join(root, relPath)))).digest("hex")}`,
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
 *    because the walker skips dot-entries it meets INSIDE a root. (The L2 run
 *    is keyed on the stamped digest, whose walk DOES include dotfiles; it holds
 *    `.claude/settings.json` and `.claude/**\/*.md` by its own not-read proof,
 *    scripts/stamped-output.mjs UNOBSERVED_BY_PROFILE, digest rule 3.)
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
  // What `create-cmp add firebase` writes into an adopter's app. It ships in the
  // package beside template/ and no stamp copies it, so the L2 run's stamped
  // digest never moves for it (KD-206) — a review is the tier that reads it.
  "overlays/",
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
 * The device tier's oracle hashes the markdown a stamped app CONTAINS and
 * accepts that a comment in it reopens the slice — it has to, because it cannot
 * tell a comment from a statement without a parser for every ecosystem it might
 * meet, and those bytes really are part of the app. Here the
 * question is decidable from the path alone: markdown is already declared
 * unable to OBLIGE a review, so letting it INVALIDATE one would make the two
 * halves disagree, and would charge a re-read of the diff for a typo in a
 * README in a repo whose rule is that docs move in the same commit as the code.
 * Anything else in REVIEW_TIER_IRRELEVANT is simply not a root.
 */
export const REVIEW_SKIP = (relPath) => relPath.endsWith(".md");

/**
 * A release number never wants a reader — and a bump never reopens a review.
 *
 * The stamped digest already holds the release numbers the stamp writes at a
 * placeholder (scripts/stamped-output.mjs VERSION_NORMALISERS); this is the
 * review tier's half of the same rule. A release bump (e8993d7: eight files,
 * every changed line a `"version"`) asked a reader to check numbers
 * `scripts/ground-truth.mjs` already checks by program, and a bump landed after
 * a discharged review moved this hash and reopened it (D-3).
 *
 * WHOLE LINES ONLY, and only this repo's OWN numbers: a line that is nothing
 * but `"version": "<string>"` (a trailing comma allowed) in
 *  - any `package.json`, at the top level (two-space indent);
 *  - `.claude-plugin/plugin.json`, at the top level;
 *  - `.claude-plugin/marketplace.json`, every such line (the catalogue's and
 *    each listed plugin's release number);
 *  - any `package-lock.json`: the top-level line, and the line inside each
 *    `packages` entry that is THIS repo's — the root (`""`) and a workspace
 *    (any key not under `node_modules/`). A dependency's version is someone
 *    else's code and still moves the hash.
 * The line keeps its key, indent and comma, so a version ADDED or REMOVED is
 * still a change; only the number is held. A file whose bytes are not UTF-8 is
 * hashed raw. `versionOnly` below is the diff-side twin: it compares two
 * versions of a file through this same function, so a change the hash cannot
 * see is exactly a change that obliges nothing.
 */
const VERSION_LINE = /^(\s*"version"\s*:\s*")[^"\\]*(",?\s*)$/;
const HELD_VERSION = "0.0.0-held-by-observed-tree";
const TOP_LEVEL_VERSION = /^ {2}"version"/;

/** Which version lines a file's number may be held on, or null when the file carries none this rule holds. */
function versionLineRule(relPath) {
  const base = relPath.split("/").pop();
  if (base === "package-lock.json") return "lock";
  if (base === "package.json" || relPath === ".claude-plugin/plugin.json") return "top";
  if (relPath === ".claude-plugin/marketplace.json") return "every";
  return null;
}

export function reviewBytes(relPath, buf) {
  const rule = versionLineRule(relPath);
  if (!rule) return buf;
  const text = buf.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(buf)) return buf;
  let section = null;
  let entry = null;
  const held = text.split("\n").map((line) => {
    if (rule === "lock") {
      const top = /^ {2}"([^"]*)"\s*:/.exec(line);
      if (top) {
        section = top[1];
        entry = null;
      }
      const key = /^ {4}"([^"]*)"\s*:\s*\{\s*$/.exec(line);
      if (key && section === "packages") entry = key[1];
      const own = TOP_LEVEL_VERSION.test(line) || (/^ {6}"version"/.test(line) && entry !== null && !entry.startsWith("node_modules/"));
      return own ? line.replace(VERSION_LINE, `$1${HELD_VERSION}$2`) : line;
    }
    if (rule === "top" && !TOP_LEVEL_VERSION.test(line)) return line;
    return line.replace(VERSION_LINE, `$1${HELD_VERSION}$2`);
  });
  return Buffer.from(held.join("\n"), "utf8");
}

/** Whether `reviewBytes` holds any line of this path at all — the only files `versionOnly` can say yes for. */
export const holdsVersionLines = (relPath) => versionLineRule(relPath) !== null;

/** True when two versions of a file differ in nothing but the version lines `reviewBytes` holds. */
export function versionOnly(relPath, before, after) {
  return versionLineRule(relPath) !== null && reviewBytes(relPath, before).equals(reviewBytes(relPath, after));
}

/**
 * THE review hash — one spelling, for every reader that records or compares
 * it (proof-plan's obligation, `--record-review`, `--discharge-review`).
 *
 * @param {string} root repo root
 * @returns {string} hex digest
 */
export function reviewTreeHash(root) {
  return observedTreeHash(root, REVIEW_TIER_TRIGGERS, { skip: REVIEW_SKIP, normalise: reviewBytes });
}

// THE DEVICE HASH USED TO LIVE HERE, in three spellings that had to agree and
// once did not: `fleet-check` recorded `observedTreeHash(root,
// DEVICE_TIER_TRIGGERS, { skip: DEVICE_SKIP })`, `proof-plan --discharge`
// compared the same, and the publish gate computed it WITHOUT the skip. Measured
// 2026-09-17: a release proof PASSED at L2 on `main` and recorded `3ed5e09`, the
// gate computed `eb734f5` over the same bytes and refused `npm publish` — twice,
// on two proofs. A gate no passing run could satisfy.
//
// There is now ONE spelling, and it is not a path list: the app this tree
// stamps, hashed by `scripts/stamped-output.mjs`, which every reader calls. The
// console skip that defect turned on went with it — `packages/harness/src/console/`
// never reaches `template/qa/`, so it cannot reach a stamped app, and nothing
// has to declare that twice any more.
