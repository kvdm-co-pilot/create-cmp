// `create-cmp clean` — report-then-clean cache hygiene (disk-space failures
// are a real KMP build-killer).
//
//   create-cmp clean [--target-dir .] [--yes] [--dry-run]
//
// What it does:
//   - ~/.konan: reports total size; deletes ONLY clearly-stale toolchains —
//     kotlin-native(-prebuilt) dirs whose version ≠ the project's kotlin
//     version (no known project kotlin → report only).
//   - project: deletes Gradle `build/` dirs (only those next to a
//     build.gradle[.kts]) and the root `.gradle/` dir.
//   - ~/.gradle/caches: size REPORT ONLY — never auto-deleted; the manual
//     command is printed instead.
//   - Sizes are shown before and after; every deletion is consent-gated
//     (--yes skips the prompt, --dry-run never deletes).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { colors, ok, warn } from "../lib/log.mjs";
import { probe, consent } from "../bootstrap/exec.mjs";
import { selectStaleKonan, selectProjectCleanDirs } from "../lib/clean.mjs";
import { formatBytes } from "../lib/project-doctor.mjs";
import { parseVersions } from "../lib/toml.mjs";

function duBytes(p) {
  if (!fs.existsSync(p)) return null;
  const r = probe("du", ["-sk", p]);
  if (!r.ok) return null;
  const kb = parseInt(r.stdout.split(/\s+/)[0], 10);
  return Number.isFinite(kb) ? kb * 1024 : null;
}

function listProjectTree(projectDir) {
  const dirs = [];
  const files = [];
  const walk = (dir, rel, depth) => {
    if (depth > 4) return; // Gradle module build dirs live shallow
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        dirs.push(r);
        // don't descend into the heavy dirs we might delete, or vendored trees
        if (e.name === "build" || e.name === ".gradle" || e.name === "node_modules" || e.name === ".git") continue;
        walk(path.join(dir, e.name), r, depth + 1);
      } else if (e.isFile()) {
        files.push(r);
      }
    }
  };
  walk(projectDir, "", 0);
  return { dirs, files };
}

function projectKotlinVersion(projectDir) {
  try {
    const toml = fs.readFileSync(path.join(projectDir, "gradle", "libs.versions.toml"), "utf8");
    const kotlin = parseVersions(toml).get("kotlin");
    return kotlin ? kotlin.value : null;
  } catch {
    return null;
  }
}

/**
 * @param {Record<string,string|boolean>} flags
 * @param {string|undefined} positional optional target dir positional
 */
export async function runClean(flags, positional) {
  const targetDir =
    (typeof flags["target-dir"] === "string" && flags["target-dir"]) || positional || ".";
  const projectDir = path.resolve(targetDir);
  const dryRun = flags["dry-run"] === true;

  process.stdout.write(`\n${colors.bold("create-cmp clean")} — cache & build-output hygiene\n\n`);

  // ---- gather the plan ------------------------------------------------------
  const plan = []; // {label, absPath, bytes}

  // ~/.konan
  const konanDir = path.join(os.homedir(), ".konan");
  const konanBytes = duBytes(konanDir);
  const kotlinVersion = projectKotlinVersion(projectDir);
  if (konanBytes !== null) {
    process.stdout.write(
      `${colors.bold("~/.konan")}: ${formatBytes(konanBytes)}` +
        (kotlinVersion
          ? colors.dim(` (project kotlin: ${kotlinVersion})`)
          : colors.dim(" (no project kotlin version found — nothing is provably stale)")) +
        "\n"
    );
    let entries = [];
    try {
      entries = fs.readdirSync(konanDir).filter((e) => {
        try {
          return fs.statSync(path.join(konanDir, e)).isDirectory();
        } catch {
          return false;
        }
      });
    } catch {
      /* unreadable — skip */
    }
    const { stale, kept } = selectStaleKonan(entries, kotlinVersion);
    for (const name of stale) {
      const abs = path.join(konanDir, name);
      plan.push({ label: `~/.konan/${name} (stale toolchain)`, absPath: abs, bytes: duBytes(abs) });
    }
    for (const k of kept) {
      process.stdout.write(`  ${colors.dim(`keep ${k.name} — ${k.reason}`)}\n`);
    }
  } else {
    process.stdout.write(`${colors.bold("~/.konan")}: ${colors.dim("not present")}\n`);
  }

  // project build outputs
  if (fs.existsSync(projectDir)) {
    const tree = listProjectTree(projectDir);
    const cleanDirs = selectProjectCleanDirs(tree);
    for (const rel of cleanDirs) {
      const abs = path.join(projectDir, rel);
      plan.push({ label: `${path.basename(projectDir)}/${rel}`, absPath: abs, bytes: duBytes(abs) });
    }
    if (cleanDirs.length === 0) {
      process.stdout.write(`${colors.bold("project")}: ${colors.dim(`no Gradle build/.gradle dirs under ${projectDir}`)}\n`);
    }
  }

  // ~/.gradle/caches — REPORT ONLY
  const gradleCaches = path.join(os.homedir(), ".gradle", "caches");
  const gradleCachesBytes = duBytes(gradleCaches);
  if (gradleCachesBytes !== null) {
    process.stdout.write(
      `${colors.bold("~/.gradle/caches")}: ${formatBytes(gradleCachesBytes)} ` +
        colors.dim("(report only — never auto-deleted; reclaim manually with: rm -rf ~/.gradle/caches)") +
        "\n"
    );
  }

  if (plan.length === 0) {
    ok("Nothing safe to clean.");
    process.exit(0);
  }

  // ---- report the plan ------------------------------------------------------
  const totalBytes = plan.reduce((s, p) => s + (p.bytes ?? 0), 0);
  process.stdout.write(`\n${colors.bold("Would delete")} (${formatBytes(totalBytes)} total):\n`);
  for (const p of plan) {
    process.stdout.write(
      `  ${colors.red("×")} ${p.label} ${colors.dim(p.bytes !== null ? `(${formatBytes(p.bytes)})` : "")}\n`
    );
  }

  if (dryRun) {
    process.stdout.write(`\n${colors.yellow("Dry run")} — nothing deleted.\n`);
    process.exit(0);
  }

  const approved = await consent(`\nDelete the ${plan.length} item(s) above?`, {
    assumeYes: flags.yes === true,
  });
  if (!approved) {
    warn("Not approved — nothing deleted.");
    process.exit(0);
  }

  // ---- delete + after sizes ---------------------------------------------------
  let freed = 0;
  for (const p of plan) {
    try {
      fs.rmSync(p.absPath, { recursive: true, force: true });
      freed += p.bytes ?? 0;
      ok(`deleted ${p.label}`);
    } catch (err) {
      warn(`could not delete ${p.label}: ${err.message}`);
    }
  }

  const konanAfter = duBytes(konanDir);
  process.stdout.write(
    `\n${colors.green("Done.")} Freed ~${formatBytes(freed)}.` +
      (konanBytes !== null && konanAfter !== null
        ? ` ~/.konan: ${formatBytes(konanBytes)} → ${formatBytes(konanAfter)}.`
        : "") +
      "\n"
  );
  process.exit(0);
}
