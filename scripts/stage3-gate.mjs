// STAGE 3's EXIT, AS A COMMAND.
//
// §9 states it as: "10 repos upgraded by one command; receipts comparable
// within pack." Its trigger — "first evidence prospect with more than 10
// repos" — has not fired, so THIS GATE IS EXPECTED TO BE RED, and the shape of
// its red matters more than the fact of it: `scripts/stage-gate.mjs` already
// records the honest assessment ("countable, so a predicate is cheap. Nothing
// to count yet"), and both halves have to survive into the predicate. Cheap,
// because a fleet is a list and a list has a length. Nothing to count, because
// no such list exists — which is a REFUSAL, not a zero. A gate that read an
// absent fleet as "0 of 0 upgraded, all green" would be the failure §8.7
// refuses one layer down, and writing this predicate before the stage starts
// is Rule 3 (docs/GATE-RULES.md): a stage whose exit is still prose has not
// started.
//
//   node scripts/stage3-gate.mjs [--fleet <path to fleet.json>]
//
// Exit 0 when every criterion passes, 1 otherwise. Criteria that cannot be
// reached because an earlier one failed say so rather than reporting a pass.
//
// ── TWO DIFFERENT NOUNS ARE SPELLED "fleet" IN THIS REPO ────────────────────
//
// `scripts/fleet-check.mjs` and `qa-artifacts/fleet-latest.json` are the
// ENGINE's pre-release gate: ONE scratch app, stamped from the current tree,
// run up the DEVICE tier (its header: "stamp a real app, run its lane"). Its
// fleet is a fleet of tiers inside one repo.
//
// Stage 3's fleet is many REPOS. Nothing in this file reads, writes or implies
// anything about the device-tier record, and the collision is a real hazard —
// "fleet L2 green" (one app, on a phone) and "fleet upgraded" (ten repos, on
// disk) are unrelated claims that a reader skimming a report will fuse. The
// older name is not renamed here; naming the hazard is what this comment is
// for.
//
// ── THE FLEET IS DECLARED, NEVER DISCOVERED ─────────────────────────────────
//
// This gate reads a manifest a HUMAN wrote — `fleet.json` at the root of the
// tree the command is run from, overridable with `--fleet`. An absent manifest
// is REFUSED and the message says exactly how to write one. That is §8.7 ("no
// default profile — an absent manifest is refused and the user is told exactly
// how to make one") applied one layer up, and it is the whole difference
// between "there is nothing to count" and "I counted zero and called it done".
// A discovered fleet — scan for sibling directories containing qa/ — would
// have made this gate green on a laptop with two scratch apps on it.
//
// WHY THE ROOT, and not the two obvious alternatives:
//
//   qa-artifacts/  is defined as LANE OUTPUT. inputs-hash.mjs excludes it by
//                  name (`packages/harness/src/lib/inputs-hash.mjs:110`),
//                  verify.mjs hashes "whatever the run left" there
//                  (`packages/harness/src/verify.mjs:464`), and .gitignore
//                  ignores the whole directory (`.gitignore:51`). A
//                  human-authored declaration filed among machine-written
//                  outputs is the exact confusion this harness refuses
//                  everywhere else, and it could never be reviewed.
//   docs/          is prose for humans: every file under it is .md. A data
//                  file read only by a program would be the one thing there
//                  nobody reads and everybody edits.
//
// The root is where a project's own declarations already live (create-cmp.json
// for a stamped app, options.schema.json, package.json), and it is also the
// natural cwd for a fleet operator who holds ten repos and none of this one.
// It is the OPERATOR's file, not this repo's: it names somebody's repositories,
// so whoever adopts it decides whether their copy is committed or ignored, and
// `--fleet <path>` exists so it never has to sit in a tree it does not belong
// to.
//
// ── THE COUNT IS §9's, NOT THIS FILE'S ──────────────────────────────────────
//
// `requiredFleetSize()` READS the number out of docs/NORTH-STAR.md §9 rather
// than declaring it here, and fails closed when the sentence cannot be found
// exactly once. Two reasons. Derived, never declared: a constant copied from a
// governing document drifts from it silently, and this repo's whole subject is
// that doneness is derived. And it moves the cheapest attack somewhere
// visible: lowering the bar now means editing the road in a signed document
// with a diff, not editing a `const` in a script nobody re-reads.
//
// ── ONE COMMAND, AND THE PROOF IS EACH TREE ─────────────────────────────────
//
// ADR-0008 binds this gate exactly as it binds `scripts/stage1-gate.mjs`: the
// harness is ALWAYS vendored, so a core fix reaches a repo as RESOLVE →
// VENDOR → RE-LOCK, and the proof that it arrived is that the adopter's own
// TREE moved. A repo whose lock version moved while its bytes did not is not a
// slow upgrade; it is the falsehood the ADR forbids, and it is reported by
// name.
//
// This gate never trusts the lock's own `files` map as evidence about the
// tree — it recomputes the region with the engine's own hasher
// (`hashHarnessRegion`) before and after, and separately asks whether the new
// lock DESCRIBES the new tree. A fleet command that rewrote ten locks and no
// bytes would move every recorded digest and would fail here, because the
// recomputed region would be unchanged.
//
// ── COMPARABILITY IS WITHIN A PACK AND NEVER ACROSS ─────────────────────────
//
// §8.9: "a `cmp` L2 and any other pack's L2 are different claims and are shown
// as such" — which the receipt schema states in its own words at
// `template/qa/evidence/schema.json:149`: "THE RUNG IS THE PACK'S … Compare
// rungs only within a pack." So this gate GROUPS by `pack.id` and reports each
// group separately. There is no code path in this file that produces a
// fleet-wide rung, count-at-rung or average: not a policy, an absence. A repo
// whose receipt names no pack is reported NOT COMPARABLE by name, and a group
// whose members disagree about what a rung is CALLED (`evidenceLevel.name` —
// the pack's own word for the rung) is reported as two ladders wearing one
// letter, which is the same falsehood one level down.
//
// Receipts are read from the clone BEFORE the upgrade runs, deliberately: an
// upgrade rewrites the lane, the lane is inside the verified surface, so every
// receipt in the fleet is stale the moment the command returns. Comparing
// post-upgrade receipts would be comparing ten invalidated claims, and
// staleness is not incomparability. What criteria F and G judge is the
// evidence the fleet's own lanes minted.
//
// ── EVERY REPO IS READ-ONLY, INCLUDING THIS ONE ─────────────────────────────
//
// An upgrade writes, so nothing may be upgraded in place. Each declared repo
// is `git clone`d into os.tmpdir() (`--no-hardlinks` for a local source, so
// the copy shares not one byte of object store with the operator's repo), the
// fleet command is handed a manifest naming the CLONES, and the scratch root
// is removed in a `finally`. The gate is read-only to this repo too: it writes
// nothing under REPO_ROOT and `git status --porcelain` is identical either
// side of a run.
//
// ── WHAT THIS PREDICATE DOES NOT CLAIM ──────────────────────────────────────
//
// It does not run ten lanes. §9's sentence is "upgraded", and proving each
// upgraded lane still reaches green is ten lane runs — minutes to hours, a
// cost that chooses a nightly stage under Rule 1, not a stage gate. So this
// gate proves the bytes arrived and the new lock describes them; it does not
// prove the fleet is still green afterwards. Said plainly here rather than
// implied by silence.
//
// It measures the COMMITTED state of each repo, because it measures a clone.
// Uncommitted work in an operator's tree is neither upgraded nor judged here,
// and criterion B names every source that had some — a hand-edited lock that
// was never committed is invisible to this gate, and that is a property of
// cloning, not an oversight.
//
// It cannot tell whether a lock's recorded VERSION is true. Criterion C proves
// the lock's per-file digests describe the bytes on disk; the version beside
// them names a published artifact, and no code in this repo compares a lock to
// a registry — `harness-lock.mjs:11-31` says so in its own header, and
// ADR-0008 leaves that comparison to whoever has a network. So a repo whose
// lock says `99.0.0` over honest bytes passes C. What the gate does catch is
// that number moving while the bytes do not, which is criterion E.
//
// ── THE CHEAPEST FALSE GREEN, PER CRITERION ─────────────────────────────────
//
//   A  `echo '{}' > fleet.json`. Resisted only in part, and on purpose: A
//      claims no more than "a fleet is declared". What it does refuse is the
//      empty declaration — `{"repos": []}` is rejected in A itself rather than
//      counted as zero, because a manifest naming no repos is the "counted
//      zero and called it done" failure — plus an unknown `schema`, a
//      malformed entry, and two entries sharing an id.
//   B  Ten entries pointing at one repo (`cp -R`, or ten clones of one
//      upstream). Resisted by IDENTITY rather than by path: two entries are
//      the same repo when they share a root commit OR a HEAD tree — the first
//      catches clones and copies (a copied .git carries the same root commit),
//      the second catches `git init` over a copied tree, which has a fresh
//      root commit and identical content. Ten paths is not ten repos.
//   C  `writeHarnessLock` over an empty `qa/` — which returns `intact` with
//      fileCount 0, the vacuous self-vouch ADR-0008 names as an unfixed hole.
//      Resisted by requiring the region to contain the lane's own entry point,
//      not merely to be self-consistent: a lock over two declaration files
//      describes no lane, and a fleet upgrades lanes.
//   D  A shell loop, or ten invocations. Resisted structurally: this gate
//      spawns exactly ONE process for the whole fleet and reports the count it
//      spawned. Also resisted: letting the manifest name the command, which
//      would make `"command": "true"` a passing fleet upgrade — the command is
//      the PRODUCT's and is resolved here, from the harness package's bin if
//      it has one and otherwise from this repo's front door.
//   E  Rewrite each lock (bump the version, refresh the digests) and touch no
//      lane file. Resisted by recomputing the region from the bytes both
//      sides of the command, and by requiring the new lock to describe the new
//      tree — the recorded digests are never the evidence. Second cheapest:
//      delete `qa/` and re-init it, which does move every byte; resisted by
//      failing any repo that lost its profile (an "upgrade" that discards the
//      adopter's declared stack has broken the repo, not upgraded it). Only
//      partly, and the part that is missing is said out loud: a re-init that
//      happens to land on the SAME profile id regenerates the adopter's own
//      profile without changing its name, and this gate reports that as
//      adopter-owned files rewritten rather than failing it — because a
//      protocol migration does the same thing for a good reason and nothing on
//      disk distinguishes them.
//   F  Ten hand-written JSON files carrying `{"pack": {"id": "cmp"}}`.
//      Resisted by `evaluateReceipt`, which binds the receipt to the tree's
//      recomputed inputs hash and refuses a PASS its own rows do not support —
//      a valid receipt costs a real lane run. The sharper version of the same
//      attack: EDIT the pack id on ten receipts that are already valid, which
//      costs nothing at all, because a receipt is excluded from the hash it
//      carries. Resisted by cross-checking the claimed pack against the repo's
//      own locked manifest and against the presence of that profile module —
//      so the forgery moves inside the lock, where criterion C is standing.
//   G  One pack id pasted onto ten receipts of unlike lanes, or a rung typed
//      onto a receipt whose lane never earned one. Resisted by F's cross-check
//      for the first and, for the second, only in part: `evidenceLevel` is on
//      the same unhashed receipt and no other file in the repo records the
//      rung, so a typed rung is not detectable from one repo. What the gate
//      does refuse is the fleet-level lie built from it — a rung letter that
//      means two different things inside one pack — and a fleet where no group
//      has two rung-bearing receipts FAILS rather than passing vacuously: a
//      fleet view that can compare nothing has not been shown to compare
//      anything.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { hashHarnessRegion, compareHarnessRegion, isAdopterOwned } from "../packages/harness/src/lib/harness-region.mjs";
import { readHarnessLock } from "../packages/harness/src/lib/harness-lock.mjs";
import { profileEntryRel } from "../packages/harness/src/lib/profile-loader.mjs";
import { readReceipt, evaluateReceipt } from "../packages/receipts/src/receipt-validate.mjs";
import { computeInputsHash } from "../packages/receipts/src/inputs-hash.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NORTH_STAR = path.join(REPO_ROOT, "docs", "NORTH-STAR.md");
const HARNESS_PKG = path.join(REPO_ROOT, "packages", "harness");

/** Where the human declares the fleet, relative to the tree the gate runs in. */
export const FLEET_MANIFEST_REL = "fleet.json";
/** The manifest's own schema tag. An unknown tag is refused, never guessed at. */
export const FLEET_SCHEMA = "prooflane-fleet/1";
/** The lane's entry point — what makes a harness region a LANE rather than a directory. */
const LANE_ENTRY = "qa/verify.mjs";

// Bounds, per GATE-RULES Rule 0: the expensive failure is not a wrong verdict,
// it is a hang that looks like work. A fleet command that does not return is a
// failed fleet command and is reported as one, with the bound it blew.
const CLONE_BUDGET_MS = 5 * 60_000;
const FLEET_BUDGET_MS = 15 * 60_000;

/** What to write when there is no fleet — printed verbatim by criterion A. */
const HOW_TO_DECLARE_A_FLEET =
  `write it, naming every repo (a local path, or a clone URL):\n` +
  `        {\n` +
  `          "schema": "${FLEET_SCHEMA}",\n` +
  `          "repos": [\n` +
  `            { "id": "cart-service",  "path": "../cart-service" },\n` +
  `            { "id": "orders",        "url": "https://github.com/acme/orders.git", "ref": "main" }\n` +
  `          ]\n` +
  `        }\n` +
  `        Every repo is CLONED before anything touches it; none is ever upgraded in place.`;

function run(cmd, args, cwd, timeout) {
  return spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout });
}

function git(args, cwd, timeout = CLONE_BUDGET_MS) {
  return run("git", args, cwd, timeout);
}

function tail(r, n = 2) {
  return ((r?.stderr || r?.stdout) ?? "").trim().split("\n").slice(-n).join(" ");
}

/**
 * The FIRST line of what a command said, not the last. A CLI that refuses an
 * unknown subcommand prints the refusal and then its usage; the refusal is the
 * finding and the usage is furniture, so a tail would report the furniture.
 */
function head(r) {
  return ((r?.stderr || r?.stdout) ?? "").trim().split("\n")[0]?.trim() ?? "";
}

function readJson(abs) {
  try {
    return JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch {
    return null;
  }
}

/**
 * §9's number, read from §9.
 *
 * Fails closed on anything but exactly one match: a criterion that silently
 * defaulted when it could not find its own threshold would be a gate deciding
 * its own bar, which is Rule 3's failure in miniature.
 * @returns {{n: number|null, reason: string|null}}
 */
export function requiredFleetSize() {
  let text;
  try {
    text = fs.readFileSync(NORTH_STAR, "utf8");
  } catch {
    return { n: null, reason: `docs/NORTH-STAR.md is unreadable — this gate takes its count from §9, never from itself` };
  }
  const hits = [...text.matchAll(/(\d+)\s+repos upgraded by one command/g)];
  if (hits.length !== 1) {
    return {
      n: null,
      reason:
        `§9's Stage 3 criterion ("N repos upgraded by one command") matched ${hits.length} times in docs/NORTH-STAR.md, not once — ` +
        `the count is the road's and this gate will not invent one`,
    };
  }
  return { n: Number(hits[0][1]), reason: null };
}

/**
 * Read and validate the fleet manifest.
 *
 * Every refusal names the file and what is wrong with it, because the reader
 * of this message is a human holding ten repos and no idea what this gate
 * wants. An EMPTY repos array is refused here rather than counted downstream —
 * "the fleet is declared" must not be satisfiable by declaring nothing.
 * @param {string} abs absolute path to the manifest
 */
export function readFleetManifest(abs) {
  const shown = abs.startsWith(REPO_ROOT) ? path.relative(REPO_ROOT, abs) : abs;
  let raw;
  try {
    raw = fs.readFileSync(abs, "utf8");
  } catch {
    return { ok: false, reason: `no fleet manifest at ${shown} — ${HOW_TO_DECLARE_A_FLEET}` };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { ok: false, reason: `${shown} is not valid JSON: ${err.message}` };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: `${shown} must be a JSON object — ${HOW_TO_DECLARE_A_FLEET}` };
  }
  if (parsed.schema !== FLEET_SCHEMA) {
    return {
      ok: false,
      reason: `${shown} declares schema ${JSON.stringify(parsed.schema ?? null)}; this gate reads ${JSON.stringify(FLEET_SCHEMA)} and refuses a manifest it does not know`,
    };
  }
  if (!Array.isArray(parsed.repos)) {
    return { ok: false, reason: `${shown} has no "repos" array — ${HOW_TO_DECLARE_A_FLEET}` };
  }
  if (parsed.repos.length === 0) {
    return {
      ok: false,
      reason:
        `${shown} declares "repos": [] — a manifest that names no repos is not a declared fleet. ` +
        `This is refused rather than counted as zero, which is the difference between "nothing to count" and "counted zero and called it done"`,
    };
  }
  const problems = [];
  const seen = new Set();
  parsed.repos.forEach((entry, i) => {
    const where = `repos[${i}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      problems.push(`${where} is not an object`);
      return;
    }
    if (typeof entry.id !== "string" || !/^[a-z0-9][a-z0-9._-]*$/i.test(entry.id)) {
      problems.push(`${where}.id must be a short name (got ${JSON.stringify(entry.id ?? null)}) — it labels the repo in every line this gate prints`);
    } else if (seen.has(entry.id)) {
      problems.push(`${where}.id ${JSON.stringify(entry.id)} appears twice — two repos cannot share a name in a report about which of them moved`);
    } else {
      seen.add(entry.id);
    }
    const hasPath = typeof entry.path === "string" && entry.path.length > 0;
    const hasUrl = typeof entry.url === "string" && entry.url.length > 0;
    if (hasPath === hasUrl) problems.push(`${where} must name exactly one of "path" or "url"`);
    if ("ref" in entry && typeof entry.ref !== "string") problems.push(`${where}.ref must be a string when present`);
  });
  if (problems.length) return { ok: false, reason: `${shown} is malformed:\n        ${problems.join("\n        ")}` };
  return { ok: true, manifest: parsed, dir: path.dirname(abs), shown };
}

/**
 * Clone one declared repo into the scratch root.
 *
 * `--no-hardlinks` for a local source: git's local clone hardlinks the object
 * store by default, and a gate that is about to run an UPGRADE inside the copy
 * must not share bytes with the operator's repository under any circumstance.
 * The source is read with `--no-optional-locks` for the same reason — plain
 * `git status` may refresh (and write) the index of the repo it is asked
 * about, and this gate writes nothing anybody else owns.
 */
function cloneEntry(entry, fleetDir, manifestDir) {
  const source = entry.path ? path.resolve(manifestDir, entry.path) : entry.url;
  const dir = path.join(fleetDir, entry.id);
  const args = entry.path
    ? ["clone", "--quiet", "--no-hardlinks", source, dir]
    : ["clone", "--quiet", source, dir];
  const cloned = git(args, fleetDir);
  if (cloned.status !== 0) {
    return { id: entry.id, source, ok: false, reason: `could not obtain ${source}: ${tail(cloned) || `git clone exited ${cloned.status}`}` };
  }
  if (entry.ref) {
    const co = git(["checkout", "--quiet", entry.ref], dir);
    if (co.status !== 0) {
      return { id: entry.id, source, ok: false, reason: `${source} has no ref ${JSON.stringify(entry.ref)}: ${tail(co)}` };
    }
  }
  const head = git(["rev-parse", "HEAD"], dir).stdout?.trim() ?? "";
  const tree = git(["rev-parse", "HEAD^{tree}"], dir).stdout?.trim() ?? "";
  const roots = (git(["rev-list", "--max-parents=0", "HEAD"], dir).stdout ?? "").trim().split("\n").filter(Boolean).sort().join(",");
  // Uncommitted work in the operator's tree is NOT in the clone. Not a
  // failure — it is their tree — but it is measured state this run did not
  // measure, and a report that hid it would overstate what it looked at.
  const dirty = entry.path ? Boolean((git(["--no-optional-locks", "status", "--porcelain"], source).stdout ?? "").trim()) : false;
  return { id: entry.id, source, ok: true, dir, head, tree, roots, dirty };
}

/**
 * What lane does this tree carry, and does its own lock describe it?
 *
 * The region is recomputed from the BYTES with the engine's own hasher, so
 * nothing here takes the lock's word for the tree's contents — that is the
 * whole defence against a hand-edited lock, in one function.
 */
function laneState(dir) {
  const region = hashHarnessRegion(dir);
  const lock = readHarnessLock(dir);
  const cmp = lock ? compareHarnessRegion(dir, lock) : null;
  const manifest = readJson(path.join(dir, "qa", "harness-manifest.json"));
  return {
    region,
    lock,
    cmp,
    profileId: typeof manifest?.profile?.id === "string" ? manifest.profile.id : null,
    hasLane: Object.prototype.hasOwnProperty.call(region.files, LANE_ENTRY),
  };
}

/** The receipt this repo carries, and whether it validly attests its own tree. */
function receiptState(dir) {
  const receipt = readReceipt(dir);
  if (!receipt) return { present: false, valid: false, reason: "no qa/evidence/latest.json — this repo has minted no receipt" };
  let verdict;
  try {
    verdict = evaluateReceipt(receipt, () => computeInputsHash(dir));
  } catch (err) {
    // computeInputsHash REFUSES a surface that matches nothing rather than
    // hashing the empty set. That refusal is the finding; pass it through.
    return { present: true, valid: false, receipt, reason: `its inputs hash could not be computed: ${err.message}` };
  }
  return { present: true, valid: verdict.valid, receipt, reason: verdict.reason };
}

/**
 * WHICH command upgrades a fleet.
 *
 * The command is the product's, never the manifest's: a manifest that named
 * its own command would make `"command": "true"` a passing fleet upgrade.
 * Two front doors, in the order a fleet operator meets them — the harness
 * package's own bin (what they install; Stage 1's deliverable), then this
 * repo's CLI, whose `harness` namespace already exists and whose dispatcher
 * says in as many words that it "will grow siblings (`upgrade`, `doctor`)"
 * (bin/create-cmp.mjs:66-69). `--fleet <manifest>` is the flag; if Stage 3
 * chooses a different spelling, this function is the one place to change and
 * changing it is a decision to record, not a detail to smooth over.
 */
export function resolveFleetCommand() {
  const pkg = readJson(path.join(HARNESS_PKG, "package.json"));
  const bin = pkg?.bin;
  if (bin) {
    const rel = typeof bin === "string" ? bin : Object.values(bin)[0];
    if (typeof rel === "string") {
      return { door: `${pkg.name ?? "prooflane-harness"} ${path.basename(rel)} upgrade --fleet`, argv: [path.join(HARNESS_PKG, rel), "upgrade", "--fleet"] };
    }
  }
  return { door: "create-cmp harness upgrade --fleet", argv: [path.join(REPO_ROOT, "bin", "create-cmp.mjs"), "harness", "upgrade", "--fleet"] };
}

/** Did the front door answer at all, or is there simply no such command yet? */
function looksUnimplemented(r) {
  const text = `${r?.stdout ?? ""}${r?.stderr ?? ""}`;
  return r?.status === 2 && /unknown (sub)?command|not a command|unrecognized/i.test(text);
}

function criteria({ manifestPath = path.join(REPO_ROOT, FLEET_MANIFEST_REL) } = {}) {
  const out = [];
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "stage3-"));
  const blocked = (what, why) => out.push({ what, ok: false, detail: `not reached — ${why}` });
  try {
    // ── A — the fleet is declared, and an absent declaration is a refusal ────
    const required = requiredFleetSize();
    const read = readFleetManifest(manifestPath);
    out.push({
      what: "the fleet is DECLARED — a manifest the human wrote names each repo",
      ok: read.ok,
      detail: read.ok ? `${read.shown}: ${read.manifest.repos.length} repo(s) declared` : read.reason,
    });
    if (!read.ok) {
      const why = "no fleet is declared (criterion A)";
      blocked(`the manifest names at least §9's ${required.n ?? "N"} DISTINCT repos, each obtainable`, why);
      blocked("every repo carries a lane its own lock describes, before anything is upgraded", why);
      blocked("ONE command upgrades the whole fleet", why);
      blocked("the upgrade arrives IN EACH TREE — vendored bytes and lock digests move, per repo", why);
      blocked("every repo's receipt validly attests its own tree and names its pack", why);
      blocked("rungs are compared only WITHIN a pack, from one ladder — never across", why);
      return out;
    }

    // ── B — ten DISTINCT repos, each actually obtainable ─────────────────────
    const fleetDir = path.join(scratch, "fleet");
    fs.mkdirSync(fleetDir, { recursive: true });
    const clones = read.manifest.repos.map((entry) => cloneEntry(entry, fleetDir, read.dir));
    const obtained = clones.filter((c) => c.ok);
    const unobtainable = clones.filter((c) => !c.ok);

    // Identity, not path. Same root commit → the same repository's history
    // (a clone, or a copied .git). Same HEAD tree → the same bytes (a copied
    // tree re-`git init`ed, which has a fresh root commit). Either match makes
    // two entries one repo.
    // The two relations are unioned rather than counted separately, so a
    // fleet of A≡B (same history) and B≡C (same bytes) collapses to ONE repo
    // and not to two near-misses that each look like a pair.
    const parent = obtained.map((_, i) => i);
    const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    const union = (a, b) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };
    const firstSeen = new Map();
    obtained.forEach((c, i) => {
      for (const key of [c.roots ? `root:${c.roots}` : null, c.tree ? `tree:${c.tree}` : null]) {
        if (!key) continue;
        if (firstSeen.has(key)) union(i, firstSeen.get(key));
        else firstSeen.set(key, i);
      }
    });
    const classes = new Map();
    obtained.forEach((c, i) => {
      const root = find(i);
      classes.set(root, [...(classes.get(root) ?? []), c.id]);
    });
    const duplicates = [...classes.values()].filter((g) => g.length > 1);
    const distinctCount = classes.size;
    const countOk = required.n !== null && distinctCount >= required.n && unobtainable.length === 0 && duplicates.length === 0;
    const bDetail = [];
    if (required.n === null) bDetail.push(required.reason);
    bDetail.push(`${read.manifest.repos.length} declared, ${obtained.length} obtainable, ${distinctCount} distinct${required.n === null ? "" : ` (§9 requires ${required.n})`}`);
    for (const c of unobtainable) bDetail.push(`${c.id}: ${c.reason}`);
    for (const g of duplicates) bDetail.push(`${g.join(", ")} are the SAME repo — same root commit or the same HEAD tree; ten paths is not ten repos`);
    const dirty = obtained.filter((c) => c.dirty).map((c) => c.id);
    if (dirty.length) bDetail.push(`uncommitted work not measured (the clone carries the committed state): ${dirty.join(", ")}`);
    out.push({
      what: `the manifest names at least §9's ${required.n ?? "N"} DISTINCT repos, each obtainable`,
      ok: countOk,
      detail: bDetail.join("\n        "),
    });

    if (obtained.length === 0) {
      const why = "not one declared repo could be obtained (criterion B)";
      blocked("every repo carries a lane its own lock describes, before anything is upgraded", why);
      blocked("ONE command upgrades the whole fleet", why);
      blocked("the upgrade arrives IN EACH TREE — vendored bytes and lock digests move, per repo", why);
      blocked("every repo's receipt validly attests its own tree and names its pack", why);
      blocked("rungs are compared only WITHIN a pack, from one ladder — never across", why);
      return out;
    }

    // ── C — each repo carries a lane its own lock describes ─────────────────
    // Before anything is upgraded, because a repo whose lock already lies
    // about its tree makes the before/after comparison in E meaningless: any
    // rewrite "moves" digests that were never true in the first place.
    const before = new Map();
    const cProblems = [];
    for (const c of obtained) {
      const state = laneState(c.dir);
      before.set(c.id, state);
      if (!state.lock) {
        cProblems.push(`${c.id}: no qa/harness.lock.json — nothing records which lane this repo carries`);
      } else if (!state.hasLane) {
        cProblems.push(
          `${c.id}: its harness region holds ${state.region.fileCount} file(s) and no ${LANE_ENTRY} — ` +
            `a lock over declarations alone reads "intact" and vouches for no lane (ADR-0008's named hole)`,
        );
      } else if (!state.cmp.intact) {
        const bits = [];
        if (state.cmp.modified.length) bits.push(`${state.cmp.modified.length} modified (${state.cmp.modified.slice(0, 3).join(", ")})`);
        if (state.cmp.missing.length) bits.push(`${state.cmp.missing.length} missing (${state.cmp.missing.slice(0, 3).join(", ")})`);
        if (state.cmp.extra.length) bits.push(`${state.cmp.extra.length} unrecorded (${state.cmp.extra.slice(0, 3).join(", ")})`);
        cProblems.push(`${c.id}: its lock does not describe its tree — ${bits.join("; ")}. A hand-edited lock (or a forked lane) makes any before/after comparison a comparison of two fictions`);
      }
    }
    out.push({
      what: "every repo carries a lane its own lock describes, before anything is upgraded",
      ok: cProblems.length === 0,
      detail: cProblems.length ? cProblems.join("\n        ") : `${obtained.length} repo(s): lock present, ${LANE_ENTRY} in the region, every recorded digest matches the bytes on disk`,
    });

    // ── F and G's input, read BEFORE the command runs ────────────────────────
    // An upgrade rewrites the lane, the lane is inside the verified surface,
    // so every receipt goes stale the moment the command returns. What is
    // judged below is the evidence the fleet's own lanes minted.
    const receipts = new Map(obtained.map((c) => [c.id, receiptState(c.dir)]));

    // ── D — ONE command ─────────────────────────────────────────────────────
    // One process, for the whole fleet, handed a manifest that names the
    // CLONES. The count is reported because "one command" is the claim.
    const cloneManifest = path.join(scratch, "fleet-clones.json");
    fs.writeFileSync(
      cloneManifest,
      `${JSON.stringify({ schema: FLEET_SCHEMA, repos: obtained.map((c) => ({ id: c.id, path: c.dir })) }, null, 2)}\n`,
    );
    const cmd = resolveFleetCommand();
    const started = Date.now();
    const ran = run(process.execPath, [...cmd.argv, cloneManifest], scratch, FLEET_BUDGET_MS);
    const elapsed = Date.now() - started;
    const timedOut = ran.error && ran.error.code === "ETIMEDOUT";
    const missing = looksUnimplemented(ran);
    const dOk = !missing && !timedOut && ran.status === 0;
    out.push({
      what: "ONE command upgrades the whole fleet",
      ok: dOk,
      detail: missing
        ? `no fleet command exists: \`${cmd.door} <manifest>\` is not implemented — ${head(ran)}`
        : timedOut
          ? `\`${cmd.door}\` did not return within ${Math.round(FLEET_BUDGET_MS / 1000)}s — a fleet command that hangs is a failed fleet command`
          : dOk
            ? `\`${cmd.door}\` — 1 process spawned for ${obtained.length} repo(s), ${(elapsed / 1000).toFixed(1)}s`
            : `\`${cmd.door}\` exited ${ran.status}: ${tail(ran)}`,
    });

    // ── E — the proof is each TREE ──────────────────────────────────────────
    if (!dOk) {
      blocked("the upgrade arrives IN EACH TREE — vendored bytes and lock digests move, per repo", "no fleet command ran to completion (criterion D)");
    } else {
      const upgraded = [];
      const notes = [];
      for (const c of obtained) {
        const was = before.get(c.id);
        const now = laneState(c.dir);
        const bytesMoved = now.region.sha256 !== was.region.sha256;
        const versionMoved = (now.lock?.version ?? null) !== (was.lock?.version ?? null);
        const describes = Boolean(now.lock) && compareHarnessRegion(c.dir, now.lock).intact;
        if (!bytesMoved && versionMoved) {
          notes.push(
            `${c.id}: NOT UPGRADED — the lock's version moved ${was.lock?.version ?? "?"} → ${now.lock?.version ?? "?"} and not one vendored byte changed. ` +
              `That is the falsehood ADR-0008 forbids: a fix arrives as a re-lock over new bytes, never as a number`,
          );
        } else if (!bytesMoved) {
          notes.push(`${c.id}: NOT UPGRADED — its harness region is byte-identical (${was.region.sha256.slice(0, 8)}, ${was.region.fileCount} files)`);
        } else if (!describes) {
          notes.push(`${c.id}: the tree moved but its new lock does not describe it — the upgrade left the lane and its manifest disagreeing`);
        } else if (was.profileId && now.profileId !== was.profileId) {
          notes.push(`${c.id}: the tree moved but the repo lost its profile (${was.profileId} → ${now.profileId ?? "none"}) — an upgrade that discards the adopter's declared stack has broken the repo, not upgraded it`);
        } else {
          // WHAT THE UPGRADE TOUCHED THAT IS NOT THE ENGINE'S. The region holds
          // two kinds of file and only one is the engine's to replace: the
          // adopter's profile and declarations are theirs
          // (harness-region.mjs `isAdopterOwned`). This is REPORTED, not
          // failed, and the asymmetry is deliberate — a protocol migration may
          // legitimately rewrite a manifest, and so does a wipe-and-reinit
          // wearing an upgrade's clothes. The gate cannot tell those apart, so
          // it names the files and leaves the judgement with the human rather
          // than inventing a verdict it cannot derive.
          const theirs = Object.keys(was.region.files).filter((rel) => isAdopterOwned(rel) && now.region.files[rel] !== was.region.files[rel]);
          const note = theirs.length ? ` — also rewrote ${theirs.length} adopter-owned file(s): ${theirs.slice(0, 3).join(", ")}` : "";
          upgraded.push(`${c.id} (${was.region.sha256.slice(0, 8)} → ${now.region.sha256.slice(0, 8)}, lock ${was.lock?.version ?? "?"} → ${now.lock?.version ?? "?"})${note}`);
        }
      }
      const detail = [`${upgraded.length} of ${obtained.length} upgraded`, ...notes, ...upgraded.map((u) => `upgraded: ${u}`)];
      out.push({
        what: "the upgrade arrives IN EACH TREE — vendored bytes and lock digests move, per repo",
        ok: upgraded.length === obtained.length,
        detail: detail.join("\n        "),
      });
    }

    // ── F — the receipts are real, and the pack they name is this repo's ────
    // The cross-check matters more than it looks. A receipt EXCLUDES ITSELF
    // from the inputs hash it carries (a file cannot hash itself), so `pack.id`
    // is editable in a text editor without invalidating anything — pasting one
    // pack id onto ten unlike receipts is a two-minute job. What is not
    // editable for free is the repo's own declaration: the lane writes
    // `pack.id` from the profile it loaded, the loader refuses a profile whose
    // exported id differs from the manifest's (profile-loader.mjs:75-76), and
    // qa/harness-manifest.json is inside the lock criterion C just checked. So
    // the receipt is made to agree with a locked file and with a profile module
    // that has to exist.
    // Judged ONCE, here, and reused by G. When this was two independent passes,
    // a repo whose receipt claimed a pack its manifest denied was refused by F
    // and then counted inside that very pack's group by G — the gate naming a
    // lie in one line and repeating it in the next.
    const comparable = new Map();
    for (const c of obtained) {
      const r = receipts.get(c.id);
      const packId = r.valid && typeof r.receipt.pack?.id === "string" ? r.receipt.pack.id : null;
      const declared = before.get(c.id).profileId;
      if (!r.valid) comparable.set(c.id, { ok: false, reason: r.reason });
      else if (!packId) comparable.set(c.id, { ok: false, reason: "its receipt names no pack, so nothing says which ladder its rung is drawn from" });
      else if (declared && packId !== declared)
        comparable.set(c.id, {
          ok: false,
          reason: `its receipt claims pack ${JSON.stringify(packId)} but the repo's locked manifest declares profile ${JSON.stringify(declared)} — a receipt cannot name a pack its own repo does not carry`,
        });
      else if (!fs.existsSync(path.join(c.dir, ...profileEntryRel(packId).split("/"))))
        comparable.set(c.id, {
          ok: false,
          reason: `its receipt claims pack ${JSON.stringify(packId)} and the repo carries no ${profileEntryRel(packId)} — the pack that supposedly produced these rows is not in the tree`,
        });
      else comparable.set(c.id, { ok: true, packId });
    }
    const fProblems = obtained.filter((c) => !comparable.get(c.id).ok).map((c) => `${c.id}: ${comparable.get(c.id).reason}`);
    out.push({
      what: "every repo's receipt validly attests its own tree and names its pack",
      ok: fProblems.length === 0,
      detail: fProblems.length ? fProblems.join("\n        ") : `${obtained.length} receipt(s) valid against their own trees, each naming a pack`,
    });

    // ── G — comparability, within a pack and never across ───────────────────
    // Grouped by pack id. There is no branch in this file that adds two
    // groups together: the fleet number §8.9 forbids is absent, not suppressed.
    const groups = new Map();
    const uncomparable = [];
    for (const c of obtained) {
      const verdict = comparable.get(c.id);
      if (!verdict.ok) {
        uncomparable.push(`${c.id}: NOT COMPARABLE — ${verdict.reason}; reported by name, never folded into a group`);
        continue;
      }
      const receipt = receipts.get(c.id).receipt;
      const level = receipt.evidenceLevel;
      groups.set(verdict.packId, [
        ...(groups.get(verdict.packId) ?? []),
        { id: c.id, rung: level?.rung ?? null, rungName: level?.name ?? null, packVersion: receipt.pack?.version ?? null },
      ]);
    }
    const gDetail = [];
    const ladderClashes = [];
    let comparablePairs = 0;
    for (const [packId, members] of [...groups.entries()].sort()) {
      const named = new Map();
      for (const m of members) {
        if (!m.rung) continue;
        const seenName = named.get(m.rung);
        if (seenName === undefined) named.set(m.rung, m.rungName ?? null);
        else if (seenName !== (m.rungName ?? null)) {
          ladderClashes.push(`pack ${packId}: ${m.rung} is "${seenName ?? "unnamed"}" in one repo and "${m.rungName ?? "unnamed"}" in ${m.id} — two ladders wearing one letter, which is the §8.9 falsehood one level down`);
        }
      }
      const withRung = members.filter((m) => m.rung);
      if (withRung.length >= 2) comparablePairs += 1;
      const rungs = withRung.length
        ? withRung.map((m) => `${m.id} ${m.rung}${m.rungName ? ` (${m.rungName})` : ""}`).join(", ")
        : "no member carries a rung — this pack declares no calibrated ladder, which earns no rung (§8.9)";
      gDetail.push(`pack ${packId} — ${members.length} repo(s): ${rungs}`);
      const versions = [...new Set(members.map((m) => m.packVersion ?? "null"))];
      if (versions.length > 1) gDetail.push(`  pack ${packId} spans versions ${versions.join(", ")} — stated, not averaged`);
    }
    gDetail.push(...uncomparable);
    if (groups.size > 1) gDetail.push(`${groups.size} packs in this fleet — no fleet-wide rung is computed, because a "${[...groups.keys()][0]}" rung and a "${[...groups.keys()][1]}" rung are different claims (§8.9)`);
    if (!comparablePairs) gDetail.push(`no pack has two rung-bearing receipts — there is nothing here a fleet view could compare, so this is a red, not a vacuous green`);
    gDetail.push(...ladderClashes);
    out.push({
      what: "rungs are compared only WITHIN a pack, from one ladder — never across",
      ok: ladderClashes.length === 0 && uncomparable.length === 0 && comparablePairs > 0,
      detail: gDetail.join("\n        "),
    });

    return out;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

function main() {
  const i = process.argv.indexOf("--fleet");
  const manifestPath = i !== -1 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : path.join(REPO_ROOT, FLEET_MANIFEST_REL);
  process.stdout.write(`stage 3 — fleet (NORTH-STAR §9)\n  fleet manifest: ${manifestPath}\n\n`);
  const results = criteria({ manifestPath });
  for (const c of results) process.stdout.write(`  ${c.ok ? "✓" : "✗"} ${c.what}\n        ${c.detail}\n`);
  const failed = results.filter((c) => !c.ok);
  process.stdout.write(failed.length ? `\nstage 3: NOT EXITED — ${failed.length}/${results.length} criteria unmet\n` : "\nstage 3: EXITED\n");
  process.exit(failed.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
export { criteria };
