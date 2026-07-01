// North-star gate: run manifest.verify commands and return GREEN/FAIL.
//
// verify.android runs always; verify.ios runs only on macOS when iOS is
// enabled. Success is PROVEN by a build, not assumed — the CLI refuses to
// claim success without this (unless --no-verify).

import { spawn } from "node:child_process";
import { isMacOS } from "./fsutil.mjs";
import { colors } from "./log.mjs";

/**
 * Run a single shell command in `cwd`, streaming output. Resolves with the
 * exit code.
 * @param {string} command
 * @param {string} cwd
 * @returns {Promise<{code:number, command:string}>}
 */
function runCommand(command, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: "inherit",
      env: process.env,
    });
    child.on("close", (code) => resolve({ code: code ?? 1, command }));
    child.on("error", () => resolve({ code: 127, command }));
  });
}

/**
 * Run the verify gate for the stamped project.
 * @param {object} params
 * @param {string} params.projectDir
 * @param {object} params.manifest manifest.json (must have .verify)
 * @param {object} params.config engine config (uses platforms.ios)
 * @param {boolean} [params.dryRun] when true, print commands but don't run
 * @returns {Promise<{green:boolean, results:Array<{platform:string,command:string,code:number,ran:boolean}>}>}
 */
export async function runVerify({ projectDir, manifest, config, dryRun = false }) {
  const verify = (manifest && manifest.verify) || {};
  const results = [];

  const plan = [];
  if (verify.android) plan.push({ platform: "android", command: verify.android, eligible: true });
  if (verify.ios) {
    const eligible = isMacOS() && !!config?.platforms?.ios;
    plan.push({ platform: "ios", command: verify.ios, eligible });
  }

  if (plan.length === 0) {
    return { green: false, results, reason: "no verify commands in manifest" };
  }

  let green = true;
  for (const item of plan) {
    if (!item.eligible) {
      results.push({ platform: item.platform, command: item.command, code: 0, ran: false });
      process.stdout.write(
        `${colors.yellow("skip")} verify.${item.platform} (not eligible on this host/config)\n`
      );
      continue;
    }
    process.stdout.write(`${colors.cyan("›")} verify.${item.platform}: ${item.command}\n`);
    if (dryRun) {
      results.push({ platform: item.platform, command: item.command, code: 0, ran: false });
      continue;
    }
    const { code } = await runCommand(item.command, projectDir);
    results.push({ platform: item.platform, command: item.command, code, ran: true });
    if (code !== 0) green = false;
  }

  return { green, results };
}

/**
 * Pretty-print the verify verdict table.
 * @param {{green:boolean, results:Array}} verdict
 */
export function printVerifyVerdict(verdict) {
  process.stdout.write("\n");
  for (const r of verdict.results) {
    if (!r.ran) {
      process.stdout.write(`  ${colors.dim("·")} ${r.platform.padEnd(8)} ${colors.dim("skipped")}\n`);
    } else if (r.code === 0) {
      process.stdout.write(`  ${colors.green("GREEN")} ${r.platform}\n`);
    } else {
      process.stdout.write(`  ${colors.red("FAIL ")} ${r.platform} (exit ${r.code})\n`);
    }
  }
  process.stdout.write(
    verdict.green
      ? `\n${colors.green("GREEN — build proven.")}\n`
      : `\n${colors.red("FAIL — build did not go green.")}\n`
  );
}
