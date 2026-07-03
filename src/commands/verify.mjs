// `create-cmp verify` — run the green-build gate against an EXISTING project
// directory (the same north-star gate the scaffold ends on, exposed
// standalone). Usage: create-cmp verify [--target-dir .] [--no-ios] [--dry-run]
//
// Command resolution order:
//   1. <project>/manifest.json `verify` block (rare — the scaffold deletes it)
//   2. the bundled template's manifest.json `verify` block
//   3. hard fallbacks (./gradlew :composeApp:assembleDebug)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { flagBool } from "../lib/args.mjs";
import { runVerify, printVerifyVerdict } from "../lib/verify.mjs";
import { colors } from "../lib/log.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const FALLBACK_VERIFY = {
  android: "./gradlew :composeApp:assembleDebug",
};

/** Resolve the verify command block for a project dir. */
export function resolveVerifyCommands(projectDir) {
  for (const candidate of [
    path.join(projectDir, "manifest.json"),
    path.join(REPO_ROOT, "template", "manifest.json"),
  ]) {
    try {
      const manifest = JSON.parse(fs.readFileSync(candidate, "utf8"));
      if (manifest && manifest.verify && manifest.verify.android) {
        return { verify: manifest.verify, source: candidate };
      }
    } catch {
      // keep falling through
    }
  }
  return { verify: FALLBACK_VERIFY, source: "built-in fallback" };
}

/**
 * @param {Record<string,string|boolean>} flags
 * @param {string|undefined} positional optional target dir positional
 */
export async function runVerifyCommand(flags, positional) {
  const targetDir =
    (typeof flags["target-dir"] === "string" && flags["target-dir"]) || positional || ".";
  const projectDir = path.resolve(targetDir);

  if (!fs.existsSync(projectDir)) {
    process.stderr.write(`Error: ${projectDir} does not exist.\n`);
    process.exit(1);
  }
  const looksGradle =
    fs.existsSync(path.join(projectDir, "settings.gradle.kts")) ||
    fs.existsSync(path.join(projectDir, "settings.gradle")) ||
    fs.existsSync(path.join(projectDir, "gradlew"));
  if (!looksGradle) {
    process.stderr.write(
      `Error: ${projectDir} does not look like a Gradle project (no settings.gradle[.kts] or gradlew).\n`
    );
    process.exit(1);
  }

  const { verify, source } = resolveVerifyCommands(projectDir);

  // iOS leg runs only when the project actually has an iOS shell (and the user
  // didn't opt out); runVerify additionally gates on macOS.
  const hasIosShell = fs.existsSync(path.join(projectDir, "iosApp"));
  const ios = flagBool(flags, "ios", true) && hasIosShell;

  process.stdout.write(
    `${colors.bold("create-cmp verify")} — green-build gate\n` +
      `  project:  ${colors.cyan(projectDir)}\n` +
      `  commands: ${colors.dim(source)}\n\n`
  );

  const dryRun = flags["dry-run"] === true;
  const verdict = await runVerify({
    projectDir,
    manifest: { verify },
    config: { platforms: { ios } },
    dryRun,
  });
  printVerifyVerdict(verdict);
  if (dryRun) {
    process.stdout.write(
      `${colors.yellow("Dry run")} — commands printed, nothing executed; the build is NOT proven.\n`
    );
  }
  process.exit(verdict.green ? 0 : 1);
}
