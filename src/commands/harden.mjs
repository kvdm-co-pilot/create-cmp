// `create-cmp harden` — install the full verification harness into a minimal
// scaffold. The Act 2 → Act 3 climb (LADDER §R3), in-band, one command.
//
// This is deliberately NOT new machinery. `--minimal` subtracts the harness;
// harden re-derives the subtraction and installs it back through the SAME
// three-way walk `upgrade --harness` already trusts:
//
//   base   = this app's config stamped MINIMAL   (what the app was given)
//   new    = this app's config stamped FULL      (what full mode gives it)
//   theirs = the app's working tree today
//
// Every base→new difference is, by construction, exactly the harness: the
// lane region (restored wholesale — decideRegionFile), the governance
// surfaces (specs/, skills, hooks — "added"), and the mode-variant documents
// (CLAUDE.md, AGENTS.md, README, CI — "applied" when untouched, three-way
// merged when the app edited them, `.cmp-new` sidecars when both moved the
// same lines). Nothing is ever clobbered, and a second run finds everything
// current — idempotent by the walk's own semantics, not by bookkeeping.
//
// One seam the walk deliberately refuses: EXCLUDED_PATTERNS keeps app state
// (qa/approvals.json, qa/evidence/, qa/golden/) out of upgrades, because
// overwriting a ledger is never an upgrade. But a MINIMAL app has no ledgers
// to protect — harden must seed them. So after the walk, anything excluded
// that exists in the full stamp and is MISSING in the app is copied in:
// seed-if-absent, never overwrite.
//
// Both stamps use the CURRENT engine's template. If the app was stamped by an
// older engine, app-shaped drift from engine evolution surfaces as merges or
// sidecars — visible, never silent — and the installed lane is the current
// one (which is what `upgrade --harness` would land anyway).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { colors, ok, warn, fail, step } from "../lib/log.mjs";
import { consent } from "../bootstrap/exec.mjs";
import { buildTokenMap } from "../lib/tokens.mjs";
import {
  planHarnessUpgrade,
  applyHarnessPlan,
  configFromSpecRecord,
  stampBaseWith,
  isExcludedPath,
  SIDECAR_SUFFIX,
} from "../lib/harness-upgrade.mjs";
import { listFiles } from "../lib/fsutil.mjs";
import {
  writeHarnessLock,
  checkHarnessIntegrity,
  describeIntegrity,
} from "../../packages/harness/src/lib/harness-lock.mjs";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The harness version this engine ships (the lane's own package, not the engine's). */
function shippedHarnessVersion() {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, "packages/harness/package.json"), "utf8")
    ).version;
  } catch {
    return null;
  }
}

function currentEngineVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")).version;
  } catch {
    return "unknown";
  }
}

/**
 * The testable core: plan (and optionally apply) the harness install.
 * Throws on a hopeless setup; never calls process.exit and never prompts.
 *
 * @param {object} params
 * @param {string} params.projectDir absolute path of the app
 * @param {string} [params.templateDir] template override (tests)
 * @param {boolean} [params.apply=false] write changes (false = plan only)
 * @param {(msg:string)=>void} [params.log]
 * @returns {Promise<{alreadyFull:boolean, plan?:object, result?:object,
 *           seeded?:string[], record?:object}>}
 */
export async function hardenProject({ projectDir, templateDir, apply = false, log = () => {} }) {
  const specPath = path.join(projectDir, "create-cmp.json");
  if (!fs.existsSync(specPath)) {
    throw new Error(
      `no create-cmp.json under ${projectDir}.\n` +
        `\`create-cmp harden\` installs the verification harness into a create-cmp-stamped ` +
        `project and needs the spec-of-record the stamp wrote. Run it from the project root ` +
        `or pass --target-dir. (For an app that was never stamped by create-cmp, harden ` +
        `cannot help yet — that is attach mode's territory.)`
    );
  }
  const record = JSON.parse(fs.readFileSync(specPath, "utf8"));

  // Full already: record says harness and the lane's front door is present.
  // (A full record with a missing lane is a broken tree harden can heal, so
  // only the conjunction short-circuits.)
  if (record.harness !== false && fs.existsSync(path.join(projectDir, "qa", "verify.mjs"))) {
    return { alreadyFull: true, record };
  }

  const { scaffold } = await import("../scaffold.mjs");
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "create-cmp-harden-"));
  try {
    const baseDir = path.join(tmpRoot, "base");
    const newDir = path.join(tmpRoot, "new");
    const baseConfig = { ...configFromSpecRecord(record, baseDir), harness: false };
    const newConfig = { ...configFromSpecRecord(record, newDir), harness: true };

    log("Stamping this app's config MINIMAL (the walk's base)…");
    await scaffold(baseConfig, { verify: false, ...(templateDir ? { templateDir } : {}) });
    log("Stamping this app's config FULL (the walk's target)…");
    await scaffold(newConfig, { verify: false, ...(templateDir ? { templateDir } : {}) });

    const plan = planHarnessUpgrade({
      baseDir,
      newDir,
      projectDir,
      stampBase: stampBaseWith(buildTokenMap(configFromSpecRecord(record, projectDir))),
    });

    // App-state seeds the walk excludes by design: present in the full stamp,
    // absent in the app → copy. Never touches an existing file.
    const seedPlan = [];
    for (const abs of listFiles(newDir)) {
      const rel = path.relative(newDir, abs).split(path.sep).join("/");
      if (!isExcludedPath(rel)) continue;
      if (rel === "create-cmp.json" || rel === "local.properties") continue; // ours below / host-specific
      if (!fs.existsSync(path.join(projectDir, rel))) seedPlan.push(rel);
    }

    if (!apply) return { alreadyFull: false, plan, seedPlan, record };

    const actionable = plan.entries.filter(
      (e) => e.write !== null || e.sidecar !== null || e.remove
    );
    const result = applyHarnessPlan(projectDir, actionable);

    const seeded = [];
    for (const rel of seedPlan) {
      const target = path.join(projectDir, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(newDir, rel), target);
      seeded.push(rel);
    }

    const harnessVersion = shippedHarnessVersion();
    if (harnessVersion) writeHarnessLock(projectDir, { version: harnessVersion });

    const updated = { ...record, harness: true, engineVersion: currentEngineVersion() };
    fs.writeFileSync(specPath, JSON.stringify(updated, null, 2) + "\n");

    return { alreadyFull: false, plan, seedPlan, result, seeded, record: updated };
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

/**
 * `create-cmp harden [target-dir] [--dry-run] [--yes] [--verify]`
 * @param {Record<string,string|boolean>} flags
 * @param {string|undefined} positional optional target dir
 */
export async function runHarden(flags, positional) {
  const targetDir =
    (typeof flags["target-dir"] === "string" && flags["target-dir"]) || positional || ".";
  const projectDir = path.resolve(targetDir);

  process.stdout.write(
    `\n${colors.bold("create-cmp harden")} — install the full verification harness\n` +
      `  project: ${colors.cyan(projectDir)}\n\n`
  );

  let outcome;
  try {
    // Plan first (side-effect free) so the consent question shows real content.
    outcome = await hardenProject({ projectDir, log: (m) => step(m) });
  } catch (e) {
    fail(e.message);
    process.exit(1);
  }

  if (outcome.alreadyFull) {
    ok("This app already carries the full harness — nothing to install.");
    process.stdout.write(
      colors.dim(
        `  ${describeIntegrity(checkHarnessIntegrity(projectDir))}\n` +
          `  To refresh the harness to the current engine: npx create-cmp-cli upgrade --harness\n`
      )
    );
    process.exit(0);
  }

  const { plan, seedPlan } = outcome;
  const counts = plan.counts;
  const installing = plan.entries.filter((e) => e.write !== null || e.remove).length;
  const conflicts = plan.entries.filter((e) => e.sidecar !== null).map((e) => e.relPath);
  process.stdout.write(
    `${colors.bold(String(installing))} file(s) to install/refresh · ` +
      `${colors.bold(String(seedPlan.length))} app-state seed(s) · ` +
      `${colors.dim(`already current ${counts.current + counts.unchanged}`)}\n`
  );
  for (const f of conflicts) {
    warn(`edited since stamp — full-mode content will land beside as ${f}${SIDECAR_SUFFIX}`);
  }

  if (installing === 0 && seedPlan.length === 0 && conflicts.length === 0) {
    ok("Nothing to do — the tree already matches full mode.");
    process.exit(0);
  }
  if (flags["dry-run"] === true) {
    for (const e of plan.entries) {
      if (e.write !== null || e.remove || e.sidecar !== null) process.stdout.write(`    ${e.relPath}\n`);
    }
    for (const rel of seedPlan) process.stdout.write(`    ${rel} ${colors.dim("(seed)")}\n`);
    process.stdout.write(`\n${colors.yellow("Dry run")} — nothing written.\n`);
    process.exit(0);
  }

  const approved = await consent(
    `\nInstall the harness (existing files are backed up; edited files get *${SIDECAR_SUFFIX} sidecars, never clobbered)?`,
    { assumeYes: flags.yes === true }
  );
  if (!approved) {
    process.stdout.write(`${colors.yellow("Not applied")} — re-run with --yes to skip the prompt.\n`);
    process.exit(0);
  }

  let applied;
  try {
    applied = await hardenProject({ projectDir, apply: true, log: (m) => step(m) });
  } catch (e) {
    fail(e.message);
    process.exit(1);
  }

  const r = applied.result;
  for (const f of r.created) ok(`installed ${f}`);
  for (const f of r.written) ok(`refreshed ${f}`);
  for (const f of applied.seeded) ok(`seeded ${f}`);
  for (const f of r.sidecars) warn(`conflict sidecar ${f} — resolve by hand, then delete it`);
  ok(`create-cmp.json → harness: true · ${describeIntegrity(checkHarnessIntegrity(projectDir))}`);

  process.stdout.write(
    `\nProve it: ${colors.bold("node qa/verify.mjs --profile scaffold")}` +
      colors.dim("  (runs now with --verify)\n")
  );
  if (flags.verify === true) {
    const v = spawnSync("node", ["qa/verify.mjs", "--profile", "scaffold"], {
      cwd: projectDir,
      stdio: "inherit",
    });
    process.exit(v.status === 0 && r.sidecars.length === 0 ? 0 : 1);
  }
  process.exit(r.sidecars.length > 0 ? 1 : 0);
}
