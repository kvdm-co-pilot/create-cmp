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

import fs from "node:fs";
import path from "node:path";

import { flagBool } from "../lib/args.mjs";
import { colors, ok, warn, fail, step } from "../lib/log.mjs";
import { consent } from "../bootstrap/exec.mjs";
import { loadRegistry, latestSet, getSet } from "../lib/registry.mjs";
import { planUpgrade, BACKUP_SUFFIX } from "../lib/upgrade.mjs";

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

/**
 * @param {Record<string,string|boolean>} flags
 * @param {string|undefined} positional optional target dir positional
 */
export async function runUpgrade(flags, positional) {
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
  const plan = planUpgrade({
    tomlContent,
    gradlePropertiesContent: readIfExists(gradlePropsPath),
    wrapperPropertiesContent: readIfExists(wrapperPropsPath),
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
    plan.newWrapperPropertiesContent !== null;
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
