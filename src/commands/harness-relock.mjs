// `create-cmp harness relock` — re-take the lock over the files an adopter owns.
//
// WHY THIS EXISTS. The harness locks a region and then tells adopters to edit
// part of it. `harness init` generates qa/lib/profiles/<id>/index.mjs with a
// header reading "This file is YOURS"; the README's adoption section says to
// correct qa/harness-manifest.json's citationRoots and the seeded
// qa/verified-surface.json. All three are inside the lock
// (harness-region.mjs HARNESS_PROFILES_DIR / HARNESS_DECLARATIONS), so an
// adopter's first legitimate edit produced:
//
//     ✗ harnessIntegrity: FAIL — prooflane-harness 0.19.0 — 1 modified:
//       qa/lib/profiles/<id>/index.mjs
//
// and then a closed loop, measured on 2026-09-05 against a fixture built by
// init itself: `harness init` refuses to re-run ("already exists") and
// `create-cmp upgrade --harness` refuses because it needs the create-cmp.json
// that init never writes. The reported escape was an adopter writing their own
// script to call writeHarnessLock — which is the failure state, not a
// workaround: the one operation the lock exists to police, performed by hand
// with no rule about which files it may cover.
//
// THE REFUSAL IS THE WHOLE COMMAND. A relock that re-baselines whatever it
// finds is a gate-disabling tool: edit qa/lib/spec-coverage.mjs to stop seeing
// an uncited clause, relock, and the lane vouches for a forked core forever
// after — precisely the attack harness-region.mjs was written to prevent.
// So this refuses unless EVERY difference is a file the adopter authors:
//
//   qa/lib/profiles/<id>/**              their profile
//   qa/verified-surface.json             \  their declarations — the lane READS
//   qa/harness-manifest.json             /  these, and the README says to fix them
//
// TWO RULES, IN TWO PLACES, ON PURPOSE. The name rule above is
// `isAdopterOwned` in the core, so a vendored lane can use it to point a
// failing adopter at the right command. It cannot answer the second question —
// "is this profile one the ENGINE ships?" — without the core learning a
// profile id, which is exactly the coupling Stage 0 removed (see
// test/agnostic-lint.test.mjs). So the engine layers that on here, DERIVED from
// the profiles the harness package it ships with actually contains. It matters:
// qa/lib/profiles/cmp/steps-cmp.mjs is the whole Compose gate pack, vendored
// byte-identical into every stamped app and restored by `upgrade --harness`.
// Relocking a fork of it is the same act as relocking a forked spine, one
// directory over, and the name rule alone would have allowed it.
//
// WHAT IT DOES NOT DO. It never changes the harness name or version in the
// lock: it re-hashes the SAME lane and preserves what the lock already records.
// A relock that bumped the version would claim an upgrade that did not happen.
// And it refuses an unlocked tree outright — with no lock there is no baseline,
// so "which files are yours" has no answer and every file would be adopted.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { colors, ok, warn, fail } from "../lib/log.mjs";
import {
  HARNESS_DECLARATIONS,
  HARNESS_PROFILES_DIR,
  isAdopterOwned,
} from "../../packages/harness/src/lib/harness-region.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Where the harness package keeps the profiles this engine vendors. */
const SHIPPED_PROFILES_DIR = path.resolve(HERE, "../../packages/harness/src/lib/profiles");

/** The lane module a project carries — the one that will CHECK what we write. */
const PROJECT_LOCK_MODULE = "qa/lib/harness-lock.mjs";

/**
 * Profile ids this engine vendors — read from the harness package, never a
 * literal, so adding a profile needs no edit here and the core learns no id.
 * A directory that cannot be read yields [], which fails SAFE in one direction
 * only: an unrecognised profile is treated as the adopter's, so the id list is
 * pinned by test/harness-relock.test.mjs against the package's real contents.
 * @returns {string[]}
 */
export function shippedProfileIds() {
  try {
    return fs
      .readdirSync(SHIPPED_PROFILES_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * The profile id a region path belongs to, or null when it is not under a
 * profile directory. `qa/lib/profiles/x.mjs` — loose, not in any profile — is
 * null, and therefore machine-owned by isAdopterOwned's own rule.
 * @param {string} rel project-relative path
 * @returns {string|null}
 */
export function profileIdOf(rel) {
  const prefix = `${HARNESS_PROFILES_DIR}/`;
  if (typeof rel !== "string" || !rel.startsWith(prefix)) return null;
  const rest = rel.slice(prefix.length);
  const slash = rest.indexOf("/");
  return slash > 0 ? rest.slice(0, slash) : null;
}

/**
 * Classify every difference an integrity check found. Pure, so the safety rule
 * is assertable without writing a tree — which is the point, since this
 * function IS the gate.
 *
 * @param {{modified: string[], missing: string[], extra: string[]}} r
 * @param {{shippedProfiles?: string[]}} [opts]
 * @returns {{rows: {rel: string, kind: string, owner: "yours"|"engine", why?: string}[],
 *            yours: object[], refused: object[]}}
 */
export function planRelock(r, { shippedProfiles = [] } = {}) {
  const shipped = new Set(shippedProfiles);
  const rows = [
    ...(r.modified ?? []).map((rel) => ({ rel, kind: "modified" })),
    ...(r.missing ?? []).map((rel) => ({ rel, kind: "missing" })),
    ...(r.extra ?? []).map((rel) => ({ rel, kind: "unrecorded" })),
  ].map((row) => {
    const id = profileIdOf(row.rel);
    if (id !== null && shipped.has(id)) {
      // Named before isAdopterOwned is consulted: a shipped profile passes the
      // core's name rule and must still be refused.
      return { ...row, owner: "engine", why: `the "${id}" profile ships with the harness` };
    }
    if (isAdopterOwned(row.rel)) return { ...row, owner: "yours" };
    return { ...row, owner: "engine", why: "machine-owned lane code" };
  });
  return {
    rows,
    yours: rows.filter((row) => row.owner === "yours"),
    refused: rows.filter((row) => row.owner === "engine"),
  };
}

/** One aligned line per difference, so the two owners are read at a glance. */
function renderRows(rows) {
  const kindWidth = Math.max(...rows.map((row) => row.kind.length));
  const relWidth = Math.max(...rows.map((row) => row.rel.length));
  return rows
    .map((row) => {
      const tag = row.owner === "yours" ? colors.green("yours ") : colors.red("engine");
      const why = row.why ? `${row.rel.padEnd(relWidth)}  ${colors.dim(`— ${row.why}`)}` : row.rel;
      return `    ${tag}  ${row.kind.padEnd(kindWidth)}  ${why}\n`;
    })
    .join("");
}

/**
 * `create-cmp harness relock` — re-hash the region and rewrite the lock, but
 * only over files the adopter owns.
 * @param {Record<string, string|boolean>} flags
 * @param {string|undefined} positional
 * @returns {Promise<number>} exit code
 */
export async function runHarnessRelock(flags, positional) {
  const targetDir = (typeof flags["target-dir"] === "string" && flags["target-dir"]) || positional || ".";
  const root = path.resolve(targetDir);
  const dryRun = Boolean(flags["dry-run"]);

  process.stdout.write(
    `\n${colors.bold("create-cmp harness relock")} — re-take the lock over the files you own\n` +
      `  project: ${colors.cyan(root)}\n\n`
  );

  if (!fs.existsSync(root)) {
    fail(`${root} does not exist.`);
    return 2;
  }

  // THE PROJECT'S OWN COPY, not this engine's. The two are byte-identical by
  // contract (test/harness-parity.test.mjs), but only while the project is on
  // this harness version — and a lock must be taken by the same code that will
  // check it, or an engine whose region rule has moved writes a lock the
  // project's own lane reads as already broken. `harness init` takes the first
  // lock through the vendored copy for the same reason.
  const lockModulePath = path.join(root, ...PROJECT_LOCK_MODULE.split("/"));
  if (!fs.existsSync(lockModulePath)) {
    fail(`no ${PROJECT_LOCK_MODULE} under ${root} — this project carries no verify lane.`);
    process.stdout.write(`  Install one: ${colors.cyan("create-cmp harness init")}\n\n`);
    return 2;
  }
  const { checkHarnessIntegrity, describeIntegrity, writeHarnessLock, LOCK_PATH } = await import(
    pathToFileURL(lockModulePath).href
  );

  const before = checkHarnessIntegrity(root);

  if (before.status === "unlocked") {
    fail(`no readable ${LOCK_PATH} — there is nothing to re-lock against.`);
    process.stdout.write(
      `  A relock re-takes a lock you already have; it decides what it may cover by\n` +
        `  comparing the tree against the recorded one. With no baseline, every file in\n` +
        `  the region would be adopted sight unseen — including a forked lane.\n\n` +
        `  Install the lane (and its first lock): ${colors.cyan("create-cmp harness init")}\n` +
        `  Restore a stamped app's lane:          ${colors.cyan("create-cmp upgrade --harness")}\n\n`
    );
    return 2;
  }

  if (before.status === "intact") {
    ok(`nothing to re-lock — ${describeIntegrity(before)}`);
    process.stdout.write("\n");
    return 0;
  }

  if (typeof before.version !== "string" || before.version === "") {
    fail(`${LOCK_PATH} records no harness version.`);
    process.stdout.write(
      `  A relock re-hashes the lane already installed and preserves the identity the\n` +
        `  lock names. It will not invent one — a lock claiming a version this tree was\n` +
        `  never proven against is worse than no lock.\n\n` +
        `  Reinstall the lane: ${colors.cyan("create-cmp upgrade --harness")}\n\n`
    );
    return 2;
  }

  const plan = planRelock(before, { shippedProfiles: shippedProfileIds() });
  process.stdout.write(`  ${colors.bold(`${plan.rows.length} file(s) differ from ${LOCK_PATH}`)}:\n\n${renderRows(plan.rows)}\n`);

  if (plan.refused.length) {
    fail(
      `refusing to re-lock: ${plan.refused.length} of ${plan.rows.length} differing file(s) ${plan.refused.length === 1 ? "is" : "are"} machine-owned.`
    );
    process.stdout.write(
      `\n${plan.refused.map((row) => `    ${colors.red(row.rel)}  ${row.kind} — ${row.why}\n`).join("")}\n` +
        `  Editing the lane's own code is a ${colors.bold("fork")}, not a re-lock. Re-taking the lock\n` +
        `  over it would make every receipt this project issues vouch for a lane the\n` +
        `  harness has never seen — the one thing the lock exists to prevent.\n\n` +
        `  Restore them:  ${colors.cyan("create-cmp upgrade --harness")}\n` +
        `  If the change belongs in the harness, it belongs upstream: a local patch is a\n` +
        `  lane no upgrade preserves and no fix ever reaches.\n\n`
    );
    return 2;
  }

  if (dryRun) {
    warn(`--dry-run: nothing was written. ${plan.yours.length} file(s) would be re-locked.`);
    process.stdout.write("\n");
    return 0;
  }

  const wrote = writeHarnessLock(root, { name: before.name ?? undefined, version: before.version });
  const after = checkHarnessIntegrity(root);
  if (after.status !== "intact") {
    fail(`the re-lock did not settle — ${describeIntegrity(after)}`);
    return 1;
  }

  const wasRegion = typeof before.recordedSha256 === "string" ? before.recordedSha256.slice(0, 8) : "unrecorded";
  ok(`re-locked ${wrote.fileCount} files at ${colors.bold(`${before.name ?? "harness"} ${before.version}`)}`);
  process.stdout.write(
    `  region   ${colors.dim(wasRegion)} ${colors.dim("→")} ${colors.green(wrote.sha256.slice(0, 8))}\n` +
      `  ${LOCK_PATH} rewritten — ${colors.bold("commit it")}. The lock is inside the verified\n` +
      `  surface, so any receipt minted before now no longer matches this tree: run\n` +
      `  ${colors.cyan("node qa/verify.mjs")} to issue one that does.\n`
  );

  // SAY WHAT THE RELOCK ACTUALLY BLESSED. A declaration is the adopter's to
  // correct — the README tells them to — but it is also the definition of what
  // the lane attests: remove one entry from the surface and a whole subtree
  // stops being covered, with a valid smaller hash and nothing in the chain
  // saying the coverage moved (payment-blueprint, 2026-09-03). The lock cannot
  // tell a correction from a narrowing, so it does not pretend to; it names the
  // file whose meaning changed and sends the reader to the diff.
  const declarations = plan.yours.filter((row) => HARNESS_DECLARATIONS.includes(row.rel));
  if (declarations.length) {
    process.stdout.write(
      `\n  ${colors.yellow("Note")}: ${declarations.map((row) => row.rel).join(", ")} ${declarations.length === 1 ? "is a DECLARATION" : "are DECLARATIONS"} — ${declarations.length === 1 ? "it defines" : "they define"}\n` +
        `  what the lane attests, not just how it runs. Re-locking records the new\n` +
        `  definition; it cannot tell a correction from a narrowing. Read the diff.\n`
    );
  }
  process.stdout.write("\n");
  return 0;
}
