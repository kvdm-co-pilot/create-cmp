// `create-cmp upgrade` — migrate an existing Gradle/KMP project to the next
// PROVEN-GREEN version set.
//
//   create-cmp upgrade [--target-dir .] [--set <id>] [--dry-run] [--yes] [--verify]
//
// Behavior:
//   - Parses gradle/libs.versions.toml [versions], diffs against the target
//     registry set (default: latest), prints a change table.
//   - Default is a DRY RUN unless confirmed: applying requires --yes or an
//     interactive "y". --dry-run never applies.
//   - Applying rewrites ONLY the changed version values in-place (surgical
//     line edits — formatting/comments preserved), updates gradle.properties
//     flags the set requires (ksp.useKSP2), and the wrapper distributionUrl.
//   - Every touched file gets a `<file>.bak-upgrade` backup first, and the
//     revert commands are printed.
//   - Lockstep guardrail: refuses to write a file where ksp is not
//     `<kotlin>-…`.
//   - Works on ANY project with a libs.versions.toml — template markers only
//     soften/strengthen messaging, never refuse.
//
// Second mode — `create-cmp upgrade --harness`:
//
//   create-cmp upgrade --harness [--target-dir .] [--base-dir <path>] [--dry-run] [--yes]
//
//   Refreshes the ENGINE-OWNED files of a stamped app via a three-way merge
//   (base = old engine's stamp, new = current engine's stamp, theirs = the
//   app's tree — both stamps use the app's own recorded config from
//   create-cmp.json so every diff is pure engine change). Conflicts never
//   clobber: the app's file stays put and a `.cmp-new` sidecar carries the
//   new engine content. Decision logic lives in src/lib/harness-upgrade.mjs;
//   this file does the filesystem/CLI orchestration (npm pack of the base
//   version, temp-dir stamps, consent, backups, report, exit code).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { flagBool } from "../lib/args.mjs";
import { colors, ok, warn, fail, step } from "../lib/log.mjs";
import { consent } from "../bootstrap/exec.mjs";
import { loadRegistry, latestSet, getSet } from "../lib/registry.mjs";
import { planUpgrade, BACKUP_SUFFIX } from "../lib/upgrade.mjs";
import { writeHarnessLock, checkHarnessIntegrity, describeIntegrity } from "../../packages/harness/src/lib/harness-lock.mjs";
import { LOCAL_PATCH_PATH, stampBaseWith } from "../lib/harness-upgrade.mjs";
import { buildTokenMap } from "../lib/tokens.mjs";
import {
  planHarnessUpgrade,
  applyHarnessPlan,
  configFromSpecRecord,
  SIDECAR_SUFFIX,
} from "../lib/harness-upgrade.mjs";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * The harness version this engine ships. Read from the package that owns the
 * lane, NOT the engine's own package.json — they version independently, which
 * is the point: the lane changes far more often than the template's app shape,
 * and fusing them forced an app-shape merge every time a lane fix shipped.
 * @returns {string|null} semver, or null when unreadable
 */
function shippedHarnessVersion() {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, "packages/harness/package.json"), "utf8")
    ).version;
  } catch {
    return null;
  }
}

/**
 * Advance create-cmp.json's engineVersion to what this engine just applied.
 *
 * Nothing used to do this, and the omission compounded: the next
 * `upgrade --harness` re-fetched the STALE version as its merge base and
 * re-presented every conflict already resolved by hand. Fuelled still read
 * 0.9.0 after being upgraded to 0.13.0.
 *
 * Only called when the sweep landed COMPLETELY. With conflicts outstanding the
 * app is genuinely part-way between two engine versions, and claiming the new
 * one would be the same lie in the other direction.
 * @param {string} projectDir
 * @param {string} version
 * @returns {boolean} whether the record was updated
 */
function writeBackEngineVersion(projectDir, version) {
  const specPath = path.join(projectDir, "create-cmp.json");
  try {
    const record = JSON.parse(fs.readFileSync(specPath, "utf8"));
    if (record.engineVersion === version) return false;
    record.engineVersion = version;
    record.upgradedAt = new Date().toISOString();
    fs.writeFileSync(specPath, `${JSON.stringify(record, null, 2)}\n`);
    return true;
  } catch {
    return false; // best-effort — never fail an applied upgrade over metadata
  }
}

function readIfExists(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

function printDiffTable(changes) {
  const keyWidth = Math.max(...changes.map((c) => c.key.length), 7);
  const fromWidth = Math.max(...changes.map((c) => c.from.length), 7);
  process.stdout.write(
    `  ${colors.bold("version".padEnd(keyWidth))}  ${colors.bold("current".padEnd(fromWidth))}     ${colors.bold("target")}\n`
  );
  for (const c of changes) {
    process.stdout.write(
      `  ${c.key.padEnd(keyWidth)}  ${colors.red(c.from.padEnd(fromWidth))}  ${colors.dim("→")}  ${colors.green(c.to)}\n`
    );
  }
}

// --- harness mode helpers ----------------------------------------------------

/** Current engine version, from this checkout's package.json. */
function currentEngineVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")).version;
  } catch {
    return "unknown";
  }
}

/**
 * Resolve a --base-dir argument to a template root (the dir holding
 * manifest.json). Accepts the template root itself, a repo/package checkout
 * containing `template/`, or an extracted npm tarball (`package/template/`).
 * Throws (never exits) so the caller's temp-dir cleanup always runs.
 * @param {string} p
 * @returns {string} absolute template root
 */
function resolveBaseTemplateDir(p) {
  const abs = path.resolve(p);
  for (const candidate of [abs, path.join(abs, "template"), path.join(abs, "package", "template")]) {
    if (fs.existsSync(path.join(candidate, "manifest.json"))) return candidate;
  }
  throw new Error(
    `--base-dir ${abs} does not look like a create-cmp template (no manifest.json at ` +
      `<dir>, <dir>/template, or <dir>/package/template).`
  );
}

/**
 * Fetch the OLD engine's template by version: `npm pack create-cmp-cli@<v>`
 * into a temp dir, then extract `package/template/` from the tarball.
 * Fails loudly (throws — never exits, so the caller's temp-dir cleanup always
 * runs), naming the exact command that failed and the --base-dir escape hatch
 * (offline / local checkout / testing).
 * @param {string} engineVersion version recorded in create-cmp.json
 * @param {string} tmpRoot session temp dir (cleaned up by the caller)
 * @returns {string} absolute path of the extracted template root
 */
function fetchBaseTemplate(engineVersion, tmpRoot) {
  if (!engineVersion || engineVersion === "unknown" || !/^[0-9A-Za-z.+-]+$/.test(engineVersion)) {
    throw new Error(
      `create-cmp.json does not record a usable engineVersion (got ${JSON.stringify(engineVersion)}). ` +
        `Pass --base-dir <path> pointing at the template this app was stamped from.`
    );
  }
  const packDir = path.join(tmpRoot, "pack");
  fs.mkdirSync(packDir, { recursive: true });
  const packCmd = `npm pack create-cmp-cli@${engineVersion}`;
  const r = spawnSync("npm", ["pack", `create-cmp-cli@${engineVersion}`], {
    cwd: packDir,
    encoding: "utf8",
    timeout: 120000,
  });
  if (r.error || r.status !== 0) {
    throw new Error(
      `Could not fetch the base engine template: \`${packCmd}\` failed` +
        (r.stderr ? ` — ${r.stderr.trim().split("\n").pop()}` : "") +
        `.\n  Offline or unpublished version? Pass --base-dir <path> to an already-extracted template.`
    );
  }
  // npm pack prints the tarball filename as the last stdout line.
  const tgz = (r.stdout || "").trim().split("\n").pop().trim();
  const tgzPath = path.join(packDir, tgz);
  const tarCmd = `tar -xzf ${tgzPath} -C ${packDir}`;
  const rt = spawnSync("tar", ["-xzf", tgzPath, "-C", packDir], { timeout: 120000 });
  if (rt.error || rt.status !== 0 || !fs.existsSync(path.join(packDir, "package", "template", "manifest.json"))) {
    throw new Error(
      `Could not extract the base engine template: \`${tarCmd}\` failed or the tarball ` +
        `carries no package/template/. Pass --base-dir <path> to an already-extracted template.`
    );
  }
  return path.join(packDir, "package", "template");
}

/** Print the grouped harness report; returns whether anything is actionable. */
function printHarnessReport(plan) {
  const c = plan.counts;
  const list = (bucket) => plan.entries.filter((e) => e.bucket === bucket).map((e) => e.relPath);

  process.stdout.write(
    `\n${colors.bold("Engine-owned files")} — ` +
      `${colors.dim(`unchanged ${c.unchanged} · already current ${c.current} · excluded state/secrets ${c.excluded}`)}\n`
  );
  const groups = [
    // The machine-owned lane first: it is the bulk of the sweep and the part
    // that needs no human judgement at all.
    ["region-clean", "lane refreshed (machine-owned, untouched since install)", ok],
    ["region-absorbed", "lane refreshed (local edit already carried by the new engine)", ok],
    ["region-restored", "lane restored (files the app had deleted)", ok],
    ["region-removed", "lane files retired by the engine", ok],
    [
      "region-patched",
      `lane refreshed, LOCAL FORK preserved (not re-applied — see ${LOCAL_PATCH_PATH})`,
      warn,
    ],
    ["applied", "applied (engine changed, app never touched — will take the new content)", ok],
    ["merged", "merged (both changed different regions — both edits survive)", ok],
    ["added", "added (new engine files absent from the app)", ok],
    ["removed", "removed (engine deleted, app never touched — will be deleted)", warn],
    ["orphaned", "orphaned (engine deleted these but the app modified them — left in place)", warn],
    ["conflicted", `conflicted (NEVER clobbered — new engine content lands beside as *${SIDECAR_SUFFIX})`, fail],
  ];
  let actionable = 0;
  for (const [bucket, label, log] of groups) {
    const files = list(bucket);
    if (files.length === 0) continue;
    // `orphaned` needs no action (the app's file is kept as-is), and neither do
    // the clean lane buckets — they apply themselves. Only a preserved local
    // fork earns a human's attention among the region buckets.
    if (bucket !== "orphaned") actionable += files.length;
    log(`${colors.bold(String(files.length))} ${label}`);
    for (const f of files) process.stdout.write(`    ${f}\n`);
  }
  process.stdout.write(
    colors.dim(
      `\n  Not considered: ${c.excluded} excluded app-state/secret files ` +
        `(evidence, approvals, goldens, keystores, Firebase configs), and any app-authored ` +
        `files the engine never stamped.\n`
    )
  );
  return actionable > 0;
}

/**
 * `create-cmp upgrade --harness` — refresh engine-owned files of a stamped app.
 * @param {Record<string,string|boolean>} flags
 * @param {string|undefined} positional optional target dir positional
 */
async function runHarnessUpgrade(flags, positional) {
  const targetDir =
    (typeof flags["target-dir"] === "string" && flags["target-dir"]) || positional || ".";
  const projectDir = path.resolve(targetDir);

  const specPath = path.join(projectDir, "create-cmp.json");
  const specRaw = readIfExists(specPath);
  if (specRaw === null) {
    process.stderr.write(
      `Error: no create-cmp.json under ${projectDir}.\n` +
        `\`create-cmp upgrade --harness\` refreshes the engine-owned files of a create-cmp-stamped ` +
        `project, and needs the spec-of-record the stamp wrote. Run it from the project root or ` +
        `pass --target-dir. (For a plain version-catalog upgrade, drop --harness.)\n`
    );
    process.exit(1);
  }
  let record;
  try {
    record = JSON.parse(specRaw);
  } catch (e) {
    process.stderr.write(`Error: ${specPath} is not valid JSON (${e.message}).\n`);
    process.exit(1);
  }

  const baseVersion = record.engineVersion;
  const currentVersion = currentEngineVersion();
  process.stdout.write(
    `\n${colors.bold("create-cmp upgrade --harness")} — refresh engine-owned files\n` +
      `  project: ${colors.cyan(projectDir)}\n` +
      `  stamped by engine ${colors.yellow(String(baseVersion))} ${colors.dim("→")} current engine ${colors.green(currentVersion)}\n\n`
  );

  // NOTE: `process.exit` skips `finally`, so the body below RETURNS an exit
  // code and the temp trees are cleaned up before the process actually exits.
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "create-cmp-harness-"));
  let code = 1;
  try {
    code = await harnessPlanAndApply({
      flags,
      record,
      projectDir,
      targetDir,
      tmpRoot,
      baseVersion,
      currentVersion,
    });
  } catch (e) {
    fail(e.message);
    code = 1;
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
  process.exit(code);
}

/**
 * The harness mode's plan/report/apply body. Returns the process exit code
 * (0 = clean apply or dry run, 1 = conflicts produced) and throws on
 * environment failures — it never calls process.exit itself, so the caller's
 * temp-dir cleanup always runs.
 * @returns {Promise<number>}
 */
async function harnessPlanAndApply({ flags, record, projectDir, targetDir, tmpRoot, baseVersion, currentVersion }) {
  // Base template: --base-dir wins (offline / local checkout / testing);
  // same-version needs no fetch (the local template IS the base); otherwise
  // npm pack the recorded version.
  let baseTemplateDir;
  if (typeof flags["base-dir"] === "string") {
    baseTemplateDir = resolveBaseTemplateDir(flags["base-dir"]);
    step(`Base template: ${colors.cyan(baseTemplateDir)} (--base-dir)`);
  } else if (baseVersion === currentVersion) {
    baseTemplateDir = path.join(REPO_ROOT, "template");
    step(`App was stamped by THIS engine version — base is the local template.`);
  } else {
    step(`Fetching base engine ${baseVersion} via npm pack…`);
    baseTemplateDir = fetchBaseTemplate(baseVersion, tmpRoot);
  }

  // Stamp both sides with the app's OWN recorded config, so tokens resolve
  // identically and base→new diffs are pure engine change. `verify:false`
  // keeps this filesystem-only — no Gradle, no device.
  const { scaffold } = await import("../scaffold.mjs");
  const newDir = path.join(tmpRoot, "new");
  const baseDir = path.join(tmpRoot, "base");
  step("Stamping the CURRENT engine with the app's recorded config…");
  await scaffold(configFromSpecRecord(record, newDir), { verify: false });
  step(`Stamping the BASE engine (${baseVersion}) with the same config…`);
  await scaffold(configFromSpecRecord(record, baseDir), {
    templateDir: baseTemplateDir,
    verify: false,
  });
  // Engines before 0.14.0 ran lane code through the token stamper, so an app
  // stamped by one carries `Fuelled` where the base template says
  // `__APP_NAME__`. Without this the migration would report the engine's own
  // substitution as if the app had forked the lane.
  const plan = planHarnessUpgrade({
    baseDir,
    newDir,
    projectDir,
    stampBase: stampBaseWith(buildTokenMap(configFromSpecRecord(record, projectDir))),
  });

  const anythingToDo = printHarnessReport(plan);
  if (!anythingToDo) {
    ok("Engine-owned files are fully up to date — nothing to apply.");
    // Still advance the record. An app that is ALREADY at the new engine is as
    // upgraded as it can be, and leaving engineVersion stale here would keep
    // the very defect this write-back exists to fix: the next run would fetch
    // an obsolete merge base and re-litigate changes that already landed. Not
    // on a dry run — that promises to write nothing.
    if (flags["dry-run"] !== true && writeBackEngineVersion(projectDir, currentVersion)) {
      ok(`create-cmp.json engineVersion → ${colors.bold(currentVersion)}`);
    }
    return 0;
  }

  if (flags["dry-run"] === true) {
    process.stdout.write(`\n${colors.yellow("Dry run")} — nothing written. Re-run with --yes to apply.\n`);
    return 0;
  }
  const approved = await consent(
    `\nApply these changes (backups written as *${BACKUP_SUFFIX}; conflicts only get *${SIDECAR_SUFFIX} sidecars)?`,
    { assumeYes: flags.yes === true }
  );
  if (!approved) {
    process.stdout.write(`${colors.yellow("Not applied")} — dry run only. Re-run with --yes to apply.\n`);
    return 0;
  }

  const actionable = plan.entries.filter(
    (e) => e.write !== null || e.sidecar !== null || e.remove
  );
  const result = applyHarnessPlan(projectDir, actionable);
  for (const f of result.written) ok(`wrote ${f} ${colors.dim(`(backup: ${f}${BACKUP_SUFFIX})`)}`);
  for (const f of result.created) ok(`created ${f}`);
  for (const f of result.deleted) ok(`deleted ${f} ${colors.dim(`(backup: ${f}${BACKUP_SUFFIX})`)}`);
  for (const f of result.sidecars) warn(`conflict sidecar ${f} — resolve by hand, then delete it`);

  // ── Re-lock the lane ──────────────────────────────────────────────────────
  // The machine-owned region always lands on the new engine's content, whether
  // or not app-shaped files conflicted — that is what the two independent
  // version numbers buy. So the lock is rewritten on its own schedule.
  const harnessVersion = shippedHarnessVersion();
  if (harnessVersion) {
    writeHarnessLock(projectDir, { version: harnessVersion });
    ok(`lane locked at ${colors.bold(harnessVersion)} — ${describeIntegrity(checkHarnessIntegrity(projectDir))}`);
  }

  if (result.patched.length > 0) {
    warn(
      `${result.patched.length} lane file(s) carried a LOCAL change that the new engine does not. ` +
        `The lane was refreshed and your edits were preserved — NOT re-applied — in ${LOCAL_PATCH_PATH}.`
    );
    for (const f of result.patched) process.stdout.write(`    ${f}\n`);
    process.stdout.write(
      colors.dim(
        `  The diff is against the lane you WERE on, so it may not apply cleanly to the new one —\n` +
          `  that is the merge this tool declined to do behind your back, not a broken patch.\n` +
          `  Attempt it with: git apply --reject ${LOCAL_PATCH_PATH}   (or upstream the change)\n`
      )
    );
  }

  if (result.backups.length > 0 || result.created.length > 0) {
    process.stdout.write(`\n${colors.bold("To revert")}\n`);
    for (const f of result.backups) {
      process.stdout.write(`  mv "${path.join(projectDir, f)}${BACKUP_SUFFIX}" "${path.join(projectDir, f)}"\n`);
    }
    for (const f of result.created) {
      process.stdout.write(`  rm "${path.join(projectDir, f)}"\n`);
    }
  }

  if (result.sidecars.length > 0) {
    fail(
      `${result.sidecars.length} conflict(s) need a human: the app's files were left untouched; ` +
        `each *${SIDECAR_SUFFIX} sidecar carries the new engine content.`
    );
    return 1;
  }
  // ── Advance the recorded engine version ───────────────────────────────────
  // Only now, with nothing conflicted: the sweep landed completely, so the
  // next upgrade's merge base is genuinely this version. Skipping this is what
  // made repeat upgrades compound — the base stayed stale and every
  // already-resolved conflict came back.
  if (writeBackEngineVersion(projectDir, currentVersion)) {
    ok(`create-cmp.json engineVersion → ${colors.bold(currentVersion)}`);
  }

  process.stdout.write(
    `\n${colors.green("Applied.")} Prove the build: ${colors.cyan(`create-cmp verify --target-dir ${targetDir}`)}\n`
  );
  return 0;
}

/**
 * @param {Record<string,string|boolean>} flags
 * @param {string|undefined} positional optional target dir positional
 */
export async function runUpgrade(flags, positional) {
  if (flags.harness === true) {
    return runHarnessUpgrade(flags, positional);
  }
  const targetDir =
    (typeof flags["target-dir"] === "string" && flags["target-dir"]) || positional || ".";
  const projectDir = path.resolve(targetDir);

  const tomlPath = path.join(projectDir, "gradle", "libs.versions.toml");
  const tomlContent = readIfExists(tomlPath);
  if (tomlContent === null) {
    process.stderr.write(
      `Error: no gradle/libs.versions.toml under ${projectDir}.\n` +
        `\`create-cmp upgrade\` works on any Gradle project that uses a version catalog — run it from the project root or pass --target-dir.\n`
    );
    process.exit(1);
  }

  const registry = loadRegistry();
  let set;
  if (typeof flags.set === "string") {
    set = getSet(registry, flags.set);
    if (!set) {
      process.stderr.write(
        `Error: unknown version set "${flags.set}". Available: ${registry.sets.map((s) => s.id).join(", ")}\n`
      );
      process.exit(1);
    }
  } else {
    set = latestSet(registry);
  }

  const gradlePropsPath = path.join(projectDir, "gradle.properties");
  const wrapperPropsPath = path.join(projectDir, "gradle", "wrapper", "gradle-wrapper.properties");
  const buildGradlePath = path.join(projectDir, "composeApp", "build.gradle.kts");
  const plan = planUpgrade({
    tomlContent,
    gradlePropertiesContent: readIfExists(gradlePropsPath),
    wrapperPropertiesContent: readIfExists(wrapperPropsPath),
    buildGradleContent: readIfExists(buildGradlePath),
    set,
  });

  process.stdout.write(
    `\n${colors.bold("create-cmp upgrade")} — proven-green version set ${colors.cyan(set.id)}` +
      (set.label ? ` ${colors.dim(`(${set.label})`)}` : "") +
      `\n  project: ${colors.cyan(projectDir)}\n` +
      (plan.fromOurTemplate
        ? `  ${colors.dim("catalog carries the create-cmp frozen-set marker — this project was stamped by create-cmp.")}\n`
        : `  ${colors.dim("not a create-cmp-stamped catalog — that's fine, upgrade works on any version catalog; review the diff extra carefully.")}\n`) +
      "\n"
  );

  // Guardrail FIRST — never even offer to write a broken pairing.
  if (plan.lockstepError) {
    fail(`Lockstep guardrail: ${plan.lockstepError}`);
    process.exit(1);
  }

  const { changes, unmanaged, notInProject } = plan.diff;
  if (changes.length === 0) {
    ok(`Catalog already matches set ${set.id} — nothing to change.`);
  } else {
    printDiffTable(changes);
  }
  if (plan.propertyChanges.length > 0) {
    process.stdout.write("\n");
    for (const p of plan.propertyChanges) {
      step(
        `gradle.properties: ${p.key}=${p.to}` +
          (p.from === null ? colors.dim(" (new)") : colors.dim(` (was ${p.from})`))
      );
    }
  }
  if (plan.wrapperChange) {
    step(`gradle wrapper: ${plan.wrapperChange.from} ${colors.dim("→")} ${plan.wrapperChange.to}`);
  }
  for (const s of plan.sdkChanges) {
    step(`composeApp/build.gradle.kts: ${s.key} ${s.from} ${colors.dim("→")} ${s.to}`);
  }
  if (unmanaged.length > 0) {
    warn(
      `Left untouched (not in set ${set.id}): ${unmanaged.map((u) => `${u.key} ${u.value}`).join(", ")}`
    );
  }
  if (notInProject.length > 0) {
    process.stdout.write(
      colors.dim(`  (set pins ${notInProject.join(", ")} — not declared by this project, nothing added)\n`)
    );
  }
  if (Array.isArray(set.notes) && set.notes.length > 0) {
    process.stdout.write(`\n${colors.bold("Set notes")}\n`);
    for (const n of set.notes) process.stdout.write(`  ${colors.dim("·")} ${n}\n`);
  }

  const anythingToWrite =
    plan.newTomlContent !== null ||
    plan.newGradlePropertiesContent !== null ||
    plan.newWrapperPropertiesContent !== null ||
    plan.newBuildGradleContent !== null;
  if (!anythingToWrite) {
    ok("Project is fully aligned — nothing to apply.");
    process.exit(0);
  }

  if (flags["dry-run"] === true) {
    process.stdout.write(`\n${colors.yellow("Dry run")} — nothing written. Re-run with --yes to apply.\n`);
    process.exit(0);
  }

  const approved = await consent(`\nApply these changes (backups written as *${BACKUP_SUFFIX})?`, {
    assumeYes: flags.yes === true,
  });
  if (!approved) {
    process.stdout.write(`${colors.yellow("Not applied")} — dry run only. Re-run with --yes to apply.\n`);
    process.exit(0);
  }

  // Apply, backing up each file before its first write.
  const touched = [];
  const writes = [
    { path: tomlPath, content: plan.newTomlContent },
    { path: gradlePropsPath, content: plan.newGradlePropertiesContent },
    { path: wrapperPropsPath, content: plan.newWrapperPropertiesContent },
    { path: buildGradlePath, content: plan.newBuildGradleContent },
  ];
  for (const w of writes) {
    if (w.content === null) continue;
    fs.copyFileSync(w.path, w.path + BACKUP_SUFFIX);
    fs.writeFileSync(w.path, w.content);
    touched.push(w.path);
    ok(`wrote ${path.relative(projectDir, w.path)} ${colors.dim(`(backup: ${path.relative(projectDir, w.path)}${BACKUP_SUFFIX})`)}`);
  }

  process.stdout.write(`\n${colors.bold("To revert")}\n`);
  for (const t of touched) {
    process.stdout.write(`  mv "${t}${BACKUP_SUFFIX}" "${t}"\n`);
  }

  if (flagBool(flags, "verify", false)) {
    process.stdout.write("\n");
    const { runVerifyCommand } = await import("./verify.mjs");
    // runVerifyCommand exits the process with the gate's verdict.
    await runVerifyCommand({ "target-dir": projectDir }, undefined);
    return;
  }

  process.stdout.write(
    `\n${colors.green("Applied.")} Prove the build: ${colors.cyan(`create-cmp verify --target-dir ${targetDir}`)}\n`
  );
  process.exit(0);
}
