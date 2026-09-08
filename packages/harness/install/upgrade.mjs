// `prooflane upgrade` — how a core fix reaches an installed lane: RESOLVE →
// VENDOR → RE-LOCK, by one command.
//
// THE SHAPE IS ADR-0008'S, AND IT IS NOT A PACKAGE-MANAGER UPGRADE. Under that
// decision the harness is always vendored — pinning is how the bytes ARRIVE,
// never how they are trusted — because a lane living in node_modules is outside
// the lock and outside `inputs.hash`, so its receipt would stop binding the code
// that produced the verdict. A fix therefore cannot arrive the way a runtime
// dependency does. `npm install` moves bytes into node_modules; THIS moves them
// into the tree, and the proof that it happened is the adopter's own lock:
// per-file digests that changed.
//
// That is Stage 1's criterion D, and it is the one worth stating twice, because
// the failure it forbids looks exactly like success: a version number moves in
// a manifest, nothing in the tree changes, and every later receipt names a lane
// version the tree does not actually carry.
//
// WHAT IT WILL AND WILL NOT TOUCH. The region is one lock but two kinds of
// file, and this command is the reason that distinction has to be mechanical:
//
//   REPLACED   every machine-owned .mjs — the spine, wholesale. It is derived
//              from the package, so the right operation is replace, not merge
//              (harness-region.mjs's own argument: a three-way merge over
//              engine code produced ~1,000 conflicted lines with zero
//              app-specific tokens in them).
//   REWRITTEN  qa/harness-source.json — the provenance record. The version it
//              names is the artifact just vendored, so a bump moves this file's
//              bytes even when no engine byte changed, and the lock digests
//              move with it. Not a trick to satisfy a gate: it is the tree
//              recording, truthfully, which harness it now carries.
//   UNTOUCHED  qa/lib/profiles/<id>/** — the adopter's profile — and the two
//              declarations they own. `isAdopterOwned` draws that line, and it
//              is the same line `relock` uses from the other side.
//
// A FORKED SPINE IS RESTORED, LOUDLY. If a machine-owned file was edited, this
// overwrites it and says which — that is the escape hatch the fork left behind,
// and a silent restore would hide the fact that someone's local patch is gone.
//
// IDEMPOTENT. Re-running with the same version re-vendors nothing and re-locks
// nothing; it says so and exits 0. An upgrade command that rewrites the tree on
// every run makes its own diff meaningless.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { colors, ok, warn, fail } from "./log.mjs";
import { frontDoor, HARNESS_SRC, vendorPlan } from "./init.mjs";
import { MANIFEST_REL_PATH } from "../src/lib/harness-manifest.mjs";
import { LOCK_PATH } from "../src/lib/harness-lock.mjs";
import { isAdopterOwned } from "../src/lib/harness-region.mjs";
import { SOURCE_PATH, resolvedSourceKind } from "../src/lib/harness-source.mjs";

/** The package whose bytes this command vendors. */
const PKG_NAME = "prooflane-harness";

/**
 * WHERE THE NEW BYTES COME FROM, in the order an adopter would expect.
 *
 * `node_modules` first is the whole point: the adopter ran `npm install
 * prooflane-harness@<newer>`, and this command's job is to carry what that
 * fetched into the tree. The package this binary itself ships from is the
 * fallback, which is the normal case in a development checkout where the two
 * are the same directory.
 *
 * @param {string} root project root
 * @returns {{src: string, pkgDir: string, version: string, where: string}|null}
 */
export function resolveHarness(root) {
  const candidates = [
    { pkgDir: path.join(root, "node_modules", PKG_NAME), where: "node_modules" },
    { pkgDir: path.resolve(HARNESS_SRC, ".."), where: "this package" },
  ];
  for (const c of candidates) {
    const manifest = path.join(c.pkgDir, "package.json");
    if (!fs.existsSync(manifest)) continue;
    let version;
    try {
      version = JSON.parse(fs.readFileSync(manifest, "utf8")).version;
    } catch {
      continue;
    }
    if (typeof version !== "string" || !version) continue;
    const src = path.join(c.pkgDir, "src");
    if (!fs.existsSync(src)) continue;
    return { src, pkgDir: c.pkgDir, version, where: c.where };
  }
  return null;
}

/**
 * The machine-owned files this upgrade would write, and how each differs from
 * what is in the tree — pure, so the decision is assertable without writing.
 *
 * @param {string} root
 * @param {string} srcRoot the resolving package's src/
 * @returns {{rel: string, src: string, state: "same"|"changed"|"new"}[]}
 */
export function upgradePlan(root, srcRoot) {
  return vendorPlan(srcRoot)
    .filter(({ rel }) => !isAdopterOwned(rel))
    .map(({ rel, src }) => {
      const abs = path.join(root, ...rel.split("/"));
      if (!fs.existsSync(abs)) return { rel, src, state: "new" };
      const same = fs.readFileSync(abs).equals(fs.readFileSync(src));
      return { rel, src, state: same ? "same" : "changed" };
    });
}

/**
 * `prooflane upgrade` — re-vendor an installed lane from the resolved harness.
 * @param {Record<string, string|boolean>} flags
 * @param {string|undefined} positional
 * @param {{invocation?: string}} [opts]
 * @returns {Promise<number>} exit code
 */
export async function runHarnessUpgrade(flags, positional, opts = {}) {
  const cmd = frontDoor(opts.invocation);
  const targetDir = (typeof flags["target-dir"] === "string" && flags["target-dir"]) || positional || ".";
  const root = path.resolve(targetDir);
  const dryRun = Boolean(flags["dry-run"]);

  process.stdout.write(`\n${colors.bold(cmd.upgrade)} — re-vendor this project's lane\n  project: ${colors.cyan(root)}\n\n`);

  // A lane to upgrade, or there is nothing to do and the other command is the
  // one they want. Naming it is the difference between a dead end and a path.
  if (!fs.existsSync(path.join(root, MANIFEST_REL_PATH))) {
    fail(`no ${MANIFEST_REL_PATH} — this project has no lane to upgrade.`);
    process.stdout.write(`\n  Install one: ${colors.cyan(cmd.init)}\n\n`);
    return 2;
  }

  const resolved = resolveHarness(root);
  if (!resolved) {
    fail(`could not resolve ${PKG_NAME} — nothing to upgrade from.`);
    process.stdout.write(
      `\n  Install the version you want, then re-run:\n` +
        `    ${colors.cyan(`npm i -D ${PKG_NAME}@latest`)}\n` +
        `    ${colors.cyan(cmd.upgrade)}\n\n`,
    );
    return 2;
  }

  const lockAbs = path.join(root, ...LOCK_PATH.split("/"));
  let before = null;
  try {
    before = JSON.parse(fs.readFileSync(lockAbs, "utf8"));
  } catch {
    /* an unlocked lane upgrades and takes its first lock */
  }

  const plan = upgradePlan(root, resolved.src);
  const changed = plan.filter((f) => f.state === "changed");
  const added = plan.filter((f) => f.state === "new");
  const sourceKind = resolvedSourceKind(root, PKG_NAME) ?? (resolved.where === "node_modules" ? null : "local");
  const versionMoves = before?.version !== resolved.version;

  // IDEMPOTENT, and it has to say why. Same version, nothing to replace, a lock
  // already in place: rewriting the tree here would make every later `git diff`
  // of an upgrade meaningless.
  if (!versionMoves && changed.length === 0 && added.length === 0 && before) {
    ok(`already at ${PKG_NAME} ${resolved.version} — the lane is current, nothing rewritten.`);
    process.stdout.write(`  ${colors.dim(`resolved from ${resolved.where}`)}\n\n`);
    return 0;
  }

  process.stdout.write(
    `  ${colors.bold("resolved")}  ${PKG_NAME} ${colors.cyan(resolved.version)} from ${resolved.where}` +
      `${before?.version ? ` ${colors.dim(`(lane has ${before.version})`)}` : ""}\n` +
      `  ${colors.bold("replace")}   ${changed.length} changed, ${added.length} new, ${plan.length - changed.length - added.length} identical\n` +
      `  ${colors.bold("keep")}      your profile and declarations — never touched by an upgrade\n\n`,
  );
  for (const f of changed.slice(0, 12)) process.stdout.write(`    ${colors.yellow("~")} ${f.rel}\n`);
  if (changed.length > 12) process.stdout.write(`    ${colors.dim(`… ${changed.length - 12} more`)}\n`);
  for (const f of added.slice(0, 12)) process.stdout.write(`    ${colors.green("+")} ${f.rel}\n`);
  if (changed.length || added.length) process.stdout.write("\n");

  if (dryRun) {
    warn("--dry-run: nothing was written.");
    return 0;
  }

  for (const { rel, src, state } of plan) {
    if (state === "same") continue;
    const abs = path.join(root, ...rel.split("/"));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.copyFileSync(src, abs);
  }

  // The provenance record, rewritten from the artifact just vendored. Written
  // through the project's OWN vendored copy for the same reason the lock is:
  // what lands in the tree must be what this project's lane will read.
  const { writeHarnessSource } = await import(pathToFileURL(path.join(root, "qa", "lib", "harness-source.mjs")).href);
  const provenance = writeHarnessSource(root, { name: PKG_NAME, version: resolved.version, source: sourceKind });

  // The lock LAST — it hashes the region, so every vendored byte and the
  // provenance record must be in place before it is taken.
  const { writeHarnessLock } = await import(pathToFileURL(path.join(root, "qa", "lib", "harness-lock.mjs")).href);
  writeHarnessLock(root, { name: PKG_NAME, version: resolved.version });

  let after = null;
  try {
    after = JSON.parse(fs.readFileSync(lockAbs, "utf8"));
  } catch {
    /* reported below as an unreadable lock */
  }
  if (!after) {
    fail(`the lock at ${LOCK_PATH} could not be read back — the upgrade wrote files but cannot prove what it locked.`);
    return 1;
  }

  const movedDigests = before ? Object.keys(after.files ?? {}).filter((k) => (before.files ?? {})[k] !== after.files[k]) : Object.keys(after.files ?? {});
  ok(
    `${PKG_NAME} ${before?.version ?? "unlocked"} → ${after.version} · ` +
      `${changed.length + added.length} file(s) rewritten, ${movedDigests.length} lock digest(s) moved`,
  );
  process.stdout.write(
    `  ${colors.bold("provenance")} ${SOURCE_PATH} — ${provenance.name} ${provenance.version}` +
      ` from ${provenance.source ?? colors.dim("unrecorded")}\n` +
      `  ${colors.bold("lock")}       ${LOCK_PATH} — ${Object.keys(after.files ?? {}).length} files\n\n` +
      `  ${colors.bold("Next")} — the lane changed, so prove it still refuses before you trust it:\n` +
      `    ${colors.cyan("node qa/framework-check.mjs")}\n` +
      `  then commit the lane, the lock and the provenance record together.\n\n`,
  );
  if (changed.length) {
    warn(
      `${changed.length} machine-owned file(s) differed from the package before this ran.\n` +
        `  They have been REPLACED. If any held a local patch, it is gone — that is what\n` +
        `  an upgrade does to a forked spine, and why a fork receives no upstream fix.`,
    );
  }
  return 0;
}
