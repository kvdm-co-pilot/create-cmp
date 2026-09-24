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

  // Minimal mode has no in-app lane to run — its gate is the Gradle tier the
  // scaffold DOES ship (unit + conformance + golden tests, debug build).
  const minimal = config?.harness === false;
  const androidCommand = minimal && verify.androidMinimal ? verify.androidMinimal : verify.android;

  const plan = [];
  if (androidCommand) plan.push({ platform: "android", command: androidCommand, eligible: true });
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
    const startedAt = Date.now();
    const { code } = await runCommand(item.command, projectDir);
    results.push({
      platform: item.platform,
      command: item.command,
      code,
      ran: true,
      durationMs: Date.now() - startedAt,
    });
    if (code !== 0) green = false;
  }

  // GREEN NEEDS SOMETHING TO HAVE RUN. `green` starts true and only a non-zero
  // exit turns it false, and an ineligible step is pushed as `code: 0` — so a
  // manifest whose every step is ineligible on this host (an iOS-only verify on
  // a machine that cannot build iOS) used to end green over a build nobody
  // started. `nothingRan` is that case, named, so the printer can say it.
  const nothingRan = !dryRun && !results.some((r) => r.ran);
  if (nothingRan) green = false;

  // `dryRun` travels WITH the verdict, because a dry run's `green` is not a
  // verdict: every command it skipped was pushed as `code: 0`, so `green` is
  // true for a build nobody started. The printer below reads this and says so
  // instead of reporting proof.
  return { green, results, dryRun, nothingRan };
}

/**
 * Pretty-print the verify verdict table.
 * @param {{green:boolean, results:Array}} verdict
 */
export function printVerifyVerdict(verdict) {
  // A DRY RUN HAS NO VERDICT TO PRINT. It used to print the table, then
  // "GREEN — build proven." and a `::create-cmp-verdict::{"green":true}` marker,
  // and only after both of those the sentence saying nothing had run — the line
  // an adopter reads first and the line an agent greps, both saying the opposite
  // of the truth. Answered HERE, in the printer, because it has two callers
  // (`create-cmp verify --dry-run` and the scaffold's gate under
  // `--dry-run-verify`) and a rule kept at one call site is a rule the other
  // does not keep. What would have run was already printed by `runVerify`.
  if (verdict.dryRun) {
    process.stdout.write(
      `\n${colors.yellow("Dry run")} — commands printed, nothing executed; the build is NOT proven.\n`
    );
    return;
  }
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
    verdict.nothingRan
      ? `\n${colors.red("Nothing executed")} — every verify step was skipped as not eligible on this host/config; the build is NOT proven.\n`
      : verdict.green
        ? `\n${colors.green("GREEN — build proven.")}\n`
        : `\n${colors.red("FAIL — build did not go green.")}\n`
  );

  // Machine-readable verdict, one greppable line (field-report finding 2.3):
  // a verify run can exceed 170k log lines, where "-Werror=" clang flags and
  // Xcode phase names false-positive naive error greps. Agents anchor on this
  // marker instead of parsing raw Gradle/xcodebuild output.
  process.stdout.write(
    `::create-cmp-verdict::${JSON.stringify({
      green: verdict.green,
      results: verdict.results.map((r) => ({
        platform: r.platform,
        // A step that did not run is not green, whatever code it was filed under.
        green: r.ran === true && r.code === 0,
        ran: r.ran,
        durationMs: r.durationMs ?? null,
      })),
    })}\n`
  );
}
