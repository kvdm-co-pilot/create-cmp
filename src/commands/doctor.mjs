// `create-cmp doctor` — toolchain preflight (existing behavior, preserved) PLUS
// a project-diagnosis section that activates when run inside (or pointed at,
// via --target-dir) a directory with Gradle files. The project section works on
// ANY KMP project — not just ones we scaffolded.
//
//   create-cmp doctor [--yes] [--dry-run] [--no-ios] [--no-install]
//                     [--target-dir <dir>] [--fix]
//
// --fix applies only SAFE heals (write local.properties from ANDROID_HOME, add
// ksp.useKSP2=true); everything else prints the exact manual step.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { flagBool } from "../lib/args.mjs";
import { colors, ok } from "../lib/log.mjs";
import { probe } from "../bootstrap/exec.mjs";
import { doctor as toolchainDoctor } from "../doctor.mjs";
import { diagnoseProject } from "../lib/project-doctor.mjs";
import { parseProperties, upsertProperty, parseVersions } from "../lib/toml.mjs";
import { loadRegistry } from "../lib/registry.mjs";
import { listFiles } from "../lib/fsutil.mjs";

function readIfExists(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

/** Does this dir look like a Gradle project? (activates project diagnosis) */
export function isGradleProjectDir(dir) {
  return (
    fs.existsSync(path.join(dir, "settings.gradle.kts")) ||
    fs.existsSync(path.join(dir, "settings.gradle")) ||
    fs.existsSync(path.join(dir, "build.gradle.kts")) ||
    fs.existsSync(path.join(dir, "build.gradle")) ||
    fs.existsSync(path.join(dir, "gradle", "libs.versions.toml"))
  );
}

function androidHomeDir() {
  const envHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (envHome && fs.existsSync(envHome)) return envHome;
  const conventional = path.join(os.homedir(), "Library", "Android", "sdk");
  if (fs.existsSync(conventional)) return conventional;
  const linux = path.join(os.homedir(), "Android", "Sdk");
  if (fs.existsSync(linux)) return linux;
  return null;
}

/** ~/.konan size in bytes via `du -sk` (null when absent/unknown). */
function konanSizeBytes() {
  const konan = path.join(os.homedir(), ".konan");
  if (!fs.existsSync(konan)) return null;
  const r = probe("du", ["-sk", konan]);
  if (!r.ok) return null;
  const kb = parseInt(r.stdout.split(/\s+/)[0], 10);
  return Number.isFinite(kb) ? kb * 1024 : null;
}

/** Free disk bytes for the home volume (null when undeterminable). */
function freeDiskBytes() {
  try {
    const s = fs.statfsSync(os.homedir());
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

/** Gather filesystem/env inputs for the pure diagnosis. */
export function gatherProjectInputs(projectDir) {
  const toml = readIfExists(path.join(projectDir, "gradle", "libs.versions.toml"));
  const gradleProperties = readIfExists(path.join(projectDir, "gradle.properties"));
  const localProperties = readIfExists(path.join(projectDir, "local.properties"));

  let sdkDirExists = null;
  if (localProperties !== null) {
    const sdkDir = parseProperties(localProperties).get("sdk.dir");
    if (sdkDir) {
      // local.properties escapes ':' and '\' on some platforms.
      const raw = sdkDir.value.replace(/\\(.)/g, "$1");
      sdkDirExists = fs.existsSync(raw);
    }
  }

  const hasIos =
    fs.existsSync(path.join(projectDir, "iosApp")) ||
    fs.existsSync(path.join(projectDir, "composeApp", "src", "iosMain"));

  let registry = null;
  try {
    registry = loadRegistry();
  } catch {
    // corrupt registry should not break doctor — drift check is skipped
  }

  const { inspectorHits, inspectorCatalog } = scanInspectorSources(projectDir);

  return {
    toml,
    gradleProperties,
    localProperties,
    sdkDirExists,
    androidHomeSet: androidHomeDir() !== null,
    hasIos,
    registry,
    konanBytes: konanSizeBytes(),
    freeDiskBytes: freeDiskBytes(),
    inspectorHits,
    inspectorCatalog,
  };
}

/**
 * Static scan for the live-inspector release-safety check: which Kotlin sources
 * reference the inspector endpoint, and (for the catalog drift tripwire) the
 * stamped InspectorCatalog.kt + theme sources. Purely filesystem — doctor never
 * probes the network for this (the release guarantee is structural).
 */
function scanInspectorSources(projectDir) {
  const srcRoot = path.join(projectDir, "composeApp", "src");
  if (!fs.existsSync(srcRoot)) return { inspectorHits: null, inspectorCatalog: null };

  const hits = [];
  let catalog = null;
  let theme = "";
  for (const file of listFiles(srcRoot)) {
    if (!file.endsWith(".kt")) continue;
    const content = readIfExists(file);
    if (content === null) continue;
    const rel = path.relative(projectDir, file).split(path.sep).join("/");
    if (content.includes("/inspect/") || content.includes("InspectorHttpServer")) {
      hits.push(rel);
    }
    if (path.basename(file) === "InspectorCatalog.kt") catalog = content;
    if (/\/presentation\/theme\/(Tokens|Theme)\.kt$/.test(rel)) theme += `${content}\n`;
  }
  return {
    inspectorHits: hits,
    inspectorCatalog: catalog && theme ? { catalog, theme } : null,
  };
}

/** Apply the SAFE auto-heals for --fix. Returns ids of findings it fixed. */
function applySafeFixes(projectDir, findings, inputs) {
  const fixed = [];
  for (const f of findings) {
    if (!f.fix || !f.fix.auto || f.level === "ok") continue;

    if (f.id === "local-properties") {
      const sdk = androidHomeDir();
      if (!sdk) continue;
      const target = path.join(projectDir, "local.properties");
      const existing = readIfExists(target) ?? "";
      const { content, changed } = upsertProperty(existing, "sdk.dir", sdk);
      if (changed) {
        fs.writeFileSync(target, content);
        ok(`--fix: wrote sdk.dir=${sdk} to local.properties`);
        fixed.push(f.id);
      }
    }

    if (f.id === "ksp2-flag") {
      const target = path.join(projectDir, "gradle.properties");
      const existing = inputs.gradleProperties ?? "";
      const { content, changed } = upsertProperty(existing, "ksp.useKSP2", "true");
      if (changed) {
        fs.writeFileSync(target, content);
        ok(`--fix: set ksp.useKSP2=true in gradle.properties`);
        fixed.push(f.id);
      }
    }
  }
  return fixed;
}

function printFindings(findings) {
  for (const f of findings) {
    if (f.level === "ok") {
      process.stdout.write(`${colors.green("✓")} ${f.title} — ${colors.dim(f.detail)}\n`);
    } else if (f.level === "warn") {
      process.stdout.write(`${colors.yellow("!")} ${f.title}\n    ${colors.dim(f.detail)}\n`);
      if (f.fix) process.stdout.write(`    ${colors.cyan(f.fix.auto ? "fix (--fix):" : "fix:")} ${f.fix.description}\n`);
    } else {
      process.stdout.write(`${colors.red("✗")} ${f.title}\n    ${colors.dim(f.detail)}\n`);
      if (f.fix) process.stdout.write(`    ${colors.cyan(f.fix.auto ? "fix (--fix):" : "fix:")} ${f.fix.description}\n`);
    }
  }
}

/**
 * @param {Record<string,string|boolean>} flags
 * @param {string|undefined} positional optional target dir positional
 */
export async function runDoctor(flags, positional) {
  // 1) Toolchain preflight — unchanged existing behavior.
  const toolchain = await toolchainDoctor({
    assumeYes: flags.yes === true,
    dryRun: flags["dry-run"] === true,
    ios: flagBool(flags, "ios", true),
    installMissing: flags["no-install"] !== true,
  });

  // 2) Project diagnosis — only when pointed at / run inside a Gradle project.
  const targetDir =
    (typeof flags["target-dir"] === "string" && flags["target-dir"]) || positional || ".";
  const projectDir = path.resolve(targetDir);

  let projectGreen = true;
  if (isGradleProjectDir(projectDir)) {
    process.stdout.write(
      `\n${colors.bold("Project diagnosis")} — ${colors.cyan(projectDir)}\n` +
        `${colors.dim("(works on any KMP project — not only create-cmp-scaffolded ones)")}\n\n`
    );

    let inputs = gatherProjectInputs(projectDir);
    let findings = diagnoseProject(inputs);

    if (flags.fix === true) {
      const fixed = applySafeFixes(projectDir, findings, inputs);
      if (fixed.length > 0) {
        // Re-diagnose so the report reflects the healed state.
        inputs = gatherProjectInputs(projectDir);
        findings = diagnoseProject(inputs);
      } else {
        process.stdout.write(`${colors.dim("--fix: nothing auto-fixable found.")}\n`);
      }
    }

    printFindings(findings);
    projectGreen = !findings.some((f) => f.level === "fail");

    if (!flags.fix && findings.some((f) => f.fix?.auto && f.level !== "ok")) {
      process.stdout.write(
        `\n${colors.cyan("Tip:")} re-run with ${colors.bold("--fix")} to apply the safe heals above automatically.\n`
      );
    }
    if (inputs.toml) {
      const kotlin = parseVersions(inputs.toml).get("kotlin");
      if (kotlin) {
        process.stdout.write(`${colors.dim(`Project kotlin: ${kotlin.value}`)}\n`);
      }
    }
    process.stdout.write(
      projectGreen
        ? `\n${colors.green("Project diagnosis: no blocking issues.")}\n`
        : `\n${colors.red("Project diagnosis: blocking issues found (see ✗ above).")}\n`
    );
  }

  process.exit(toolchain.green && projectGreen ? 0 : 1);
}
