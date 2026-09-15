// fleet.mjs — one command, every repo in a declared fleet.
//
// WHAT A FLEET IS HERE, because the word is overloaded in this repo and the
// collision is expensive: `scripts/fleet-check.mjs` and
// `qa-artifacts/fleet-latest.json` are about the TIER fleet — one app, many
// evidence tiers, on one machine. This file is about many REPOS. Nothing here
// reads or writes any of that, and "fleet upgraded" (ten repos) and "fleet L2
// green" (one app, on a phone) are different sentences about different nouns.
//
// WHY ONE COMMAND AND NOT A LOOP THE HUMAN WRITES. The thing an operator
// holding ten repos actually needs is not the ability to type `prooflane
// upgrade` ten times — they have a shell. It is that the ten upgrades come
// from ONE resolved harness, so the fleet ends up on one version rather than
// on whatever each directory's node_modules happened to hold. `resolveHarness`
// falls back to the package the running binary ships from, so a single process
// carries a single artifact into every tree. A shell loop cannot promise that.
//
// EVERY REPO RUNS, EVEN AFTER ONE FAILS. Stopping at the first failure reports
// one problem when there are three, and leaves the fleet half-upgraded either
// way — the stop buys nothing and costs the operator two more round trips.
// So: run all, report each by name, and exit non-zero if any failed.

import fs from "node:fs";
import path from "node:path";

import { colors, fail, ok, warn } from "./log.mjs";
import { frontDoor } from "./init.mjs";
import { runHarnessUpgrade, runningHarness } from "./upgrade.mjs";

/** The one schema this reads. A manifest that says anything else is refused. */
export const FLEET_SCHEMA = "prooflane-fleet/1";

/** Printed whenever there is nothing usable to read. */
export const HOW_TO_DECLARE_A_FLEET =
  `A fleet is a file you write, naming every repo:\n` +
  `    {\n` +
  `      "schema": "${FLEET_SCHEMA}",\n` +
  `      "repos": [\n` +
  `        { "id": "cart-service", "path": "../cart-service" },\n` +
  `        { "id": "web-bff",      "path": "../web-bff" }\n` +
  `      ]\n` +
  `    }`;

/**
 * Read and validate a fleet manifest for an UPGRADE.
 *
 * DELIBERATELY A SECOND READER. `scripts/stage3-gate.mjs` has its own, and the
 * duplication is the point: a gate that imports the thing it gates cannot
 * catch that thing being wrong. They are held together by a differential test
 * rather than by a shared import, so drift between them is a red suite instead
 * of a silent agreement to be wrong in the same direction.
 *
 * PATHS RESOLVE AGAINST THE MANIFEST, never the cwd. A fleet operator runs this
 * from wherever they happen to be standing, and `"../cart-service"` means "next
 * to the manifest" — which is the only reading under which the file can be
 * committed and still mean the same thing tomorrow.
 *
 * @param {string} abs absolute path to the manifest
 * @returns {{ok: true, repos: {id: string, dir: string, declared: string}[], dir: string}
 *          | {ok: false, reason: string}}
 */
export function readFleetManifest(abs) {
  let raw;
  try {
    raw = fs.readFileSync(abs, "utf8");
  } catch {
    return { ok: false, reason: `no fleet manifest at ${abs}.\n\n  ${HOW_TO_DECLARE_A_FLEET}` };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { ok: false, reason: `${abs} is not valid JSON: ${err.message}` };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: `${abs} must be a JSON object.\n\n  ${HOW_TO_DECLARE_A_FLEET}` };
  }
  if (parsed.schema !== FLEET_SCHEMA) {
    return {
      ok: false,
      reason:
        `${abs} declares schema ${JSON.stringify(parsed.schema ?? null)}; this command reads ` +
        `${JSON.stringify(FLEET_SCHEMA)} and refuses a manifest it does not know rather than guessing at its shape.`,
    };
  }
  if (!Array.isArray(parsed.repos)) {
    return { ok: false, reason: `${abs} has no "repos" array.\n\n  ${HOW_TO_DECLARE_A_FLEET}` };
  }
  if (parsed.repos.length === 0) {
    // Refused, not counted as zero. "Upgraded 0 of 0 repos, all green" is the
    // shape of report this product exists to refuse.
    return {
      ok: false,
      reason:
        `${abs} declares "repos": [] — a manifest naming no repos is not a declared fleet. ` +
        `Refusing is the difference between "nothing to upgrade" and "upgraded nothing and called it done".`,
    };
  }

  const dir = path.dirname(abs);
  const problems = [];
  const seen = new Set();
  const repos = [];
  parsed.repos.forEach((entry, i) => {
    const where = `repos[${i}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      problems.push(`${where} is not an object`);
      return;
    }
    if (typeof entry.id !== "string" || !/^[a-z0-9][a-z0-9._-]*$/i.test(entry.id)) {
      problems.push(`${where}.id must be a short name (got ${JSON.stringify(entry.id ?? null)}) — it labels the repo in every line this prints`);
    } else if (seen.has(entry.id)) {
      problems.push(`${where}.id ${JSON.stringify(entry.id)} appears twice — two repos cannot share a name in a report about which of them moved`);
    } else {
      seen.add(entry.id);
    }
    const hasPath = typeof entry.path === "string" && entry.path.length > 0;
    const hasUrl = typeof entry.url === "string" && entry.url.length > 0;
    if (hasPath === hasUrl) {
      problems.push(`${where} must name exactly one of "path" or "url"`);
      return;
    }
    // Validated because the OTHER reader validates it. `scripts/stage3-gate.mjs`
    // has had this check since it was written; this one did not, so
    // `{"ref": 5}` was accepted here and refused there — a drift the twelve-
    // manifest corpus could not see, because it varied `ref` exactly once and
    // only as a string. The generated corpus that replaced it reported 72 of
    // 2016 manifests disagreeing, all of them this.
    if ("ref" in entry && typeof entry.ref !== "string") {
      problems.push(`${where}.ref must be a string when present (got ${JSON.stringify(entry.ref)})`);
    }
    if (hasUrl) {
      // An upgrade WRITES to a working tree. A URL is not one, and cloning on
      // the operator's behalf would put a repo on their disk they did not ask
      // for, at a path this command chose. The gate clones because a gate must
      // not touch the original; the product refuses because the operator's
      // checkout is theirs to make.
      problems.push(
        `${where} names a url (${JSON.stringify(entry.url)}) — an upgrade writes to a working tree, and this ` +
          `command will not clone one for you. Check it out, then name its "path".`,
      );
      return;
    }
    if (typeof entry.id === "string") repos.push({ id: entry.id, dir: path.resolve(dir, entry.path), declared: entry.path });
  });
  if (problems.length) return { ok: false, reason: `${abs} is malformed:\n        ${problems.join("\n        ")}` };
  return { ok: true, repos, dir };
}

/**
 * `prooflane upgrade --fleet <manifest>` — re-vendor every lane in a declared
 * fleet, from ONE resolved harness, in ONE process.
 *
 * @param {Record<string, string|boolean>} flags
 * @param {string|undefined} positional
 * @param {{invocation?: string}} [opts]
 * @returns {Promise<number>} exit code — 0 only when every repo succeeded
 */
export async function runFleetUpgrade(flags, positional, opts = {}) {
  const cmd = frontDoor(opts.invocation);
  const value = flags.fleet;
  if (typeof value !== "string" || !value) {
    fail("--fleet needs the path to a fleet manifest.");
    process.stdout.write(`\n  ${HOW_TO_DECLARE_A_FLEET}\n\n  Then: ${colors.cyan(`${cmd.upgrade} --fleet ./fleet.json`)}\n\n`);
    return 2;
  }
  if (typeof flags["target-dir"] === "string") {
    // The manifest names every tree this writes to. A flag that renames the
    // target outranks `repo.dir` inside `runHarnessUpgrade` — so this ran N
    // times against ONE directory nobody declared and reported "N of N
    // upgraded". That is KD-7's shape (fifty-two files into the wrong
    // repository, exit 0) inside the one command that writes, unattended, to
    // repositories the operator does not have open.
    fail(`--target-dir and --fleet name different trees — pass one.`);
    process.stdout.write(
      `\n  ${colors.dim("A fleet upgrade writes to the directories its manifest names, and to nothing else.")}\n\n`,
    );
    return 2;
  }
  if (positional) {
    // One command, two targets, and no way to tell which the operator meant.
    // Guessing here would upgrade a directory nobody named.
    fail(`--fleet and a directory (${JSON.stringify(positional)}) are two different targets — pass one.`);
    process.stdout.write(
      `\n  ${colors.dim("--fleet upgrades every repo the manifest names; a directory upgrades that one repo.")}\n\n`,
    );
    return 2;
  }

  const manifestPath = path.resolve(value);
  const read = readFleetManifest(manifestPath);
  if (!read.ok) {
    fail(read.reason);
    process.stdout.write("\n");
    return 2;
  }

  // ONE ARTIFACT, RESOLVED ONCE, FOR THE WHOLE FLEET — the single property that
  // makes this command worth more than a shell loop, and it has to be taken
  // HERE. `runHarnessUpgrade` resolves per project and prefers that project's
  // own node_modules, which is right for one repo (the adopter installed the
  // version they meant to carry) and exactly wrong for a fleet: ten repos would
  // land on whatever each directory happened to hold, from one green run.
  // Measured before this line existed — two repos, one command, versions
  // 0.0.1-ancient and 0.21.1, "2 of 2 repo(s) upgraded", no warning.
  const harness = runningHarness();
  if (!harness) {
    fail(`could not resolve the harness this command ships from — there is nothing to carry into the fleet.`);
    process.stdout.write("\n");
    return 2;
  }

  const dryRun = Boolean(flags["dry-run"]);
  process.stdout.write(
    `\n${colors.bold(`${cmd.upgrade} --fleet`)} — re-vendor every lane the manifest names\n` +
      `  manifest: ${colors.cyan(manifestPath)}\n` +
      `  repos:    ${colors.cyan(String(read.repos.length))}${dryRun ? colors.yellow("   (--dry-run — nothing will be written)") : ""}\n` +
      `  carrying: ${colors.cyan(`${harness.version}`)} ${colors.dim("— the same bytes into every repo below")}\n`,
  );

  const results = [];
  for (const repo of read.repos) {
    process.stdout.write(`\n${colors.dim("─".repeat(72))}\n  ${colors.bold(repo.id)}  ${colors.dim(repo.declared)}\n`);
    if (!fs.existsSync(repo.dir)) {
      // Named, not there. Reported per repo and carried to the summary rather
      // than thrown, so one bad line in the manifest does not hide nine good
      // upgrades — or nine more problems.
      fail(`${repo.id}: no directory at ${repo.dir}`);
      results.push({ id: repo.id, code: 2, why: "no such directory" });
      continue;
    }
    let code;
    try {
      // AN ALLOWLIST, NOT A SPREAD. Forwarding `{...flags}` handed every flag
      // this door accepts to a command whose target is already decided, and one
      // of them (`--target-dir`) silently outranked it. A denylist would have
      // to be extended by whoever adds the next targeting flag, in a file they
      // are not editing; an allowlist is wrong only about flags that do not
      // reach here yet, which is the safe direction for a command that writes.
      code = await runHarnessUpgrade({ "dry-run": dryRun }, repo.dir, { ...opts, harness });
    } catch (err) {
      // A throw in one repo is that repo's failure, never the fleet's crash.
      fail(`${repo.id}: ${err?.message ?? err}`);
      code = 1;
    }
    results.push({ id: repo.id, code: code ?? 0, why: null });
  }

  const failed = results.filter((r) => r.code !== 0);
  process.stdout.write(`\n${colors.dim("─".repeat(72))}\n`);
  if (failed.length === 0) {
    ok(`fleet: ${results.length} of ${results.length} repo(s) upgraded${dryRun ? " (dry run)" : ""}.`);
    process.stdout.write("\n");
    return 0;
  }
  warn(`fleet: ${results.length - failed.length} of ${results.length} repo(s) upgraded — ${failed.length} failed:`);
  for (const f of failed) process.stdout.write(`    ${colors.red("✗")} ${f.id}${f.why ? ` — ${f.why}` : ` (exit ${f.code})`}\n`);
  process.stdout.write("\n");
  return 1;
}
