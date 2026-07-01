// doctor → bootstrap → verify toolchain installer.
//
// Detects the CMP toolchain (JDK 17, Android SDK/cmdline-tools/system-image/AVD,
// Xcode+CLT, CocoaPods, XcodeGen, Node, Appium 3.x + uiautomator2/xcuitest, adb).
// For each missing dep: prints the EXACT install command and asks consent
// (--yes skips prompts for CI). Idempotent (safe to re-run). OS-aware
// (Linux → Android-only, said explicitly). Xcode can't be CLI-installed — the
// App Store step is surfaced as the one manual action. Ends with a
// per-dependency GREEN/FAIL verdict table.

import { checksForHost, hostInfo } from "./bootstrap/checks.mjs";
import { runInstall } from "./bootstrap/exec.mjs";
import { colors } from "./lib/log.mjs";

/**
 * @param {object} opts
 * @param {boolean} [opts.assumeYes] --yes: auto-approve installs (CI)
 * @param {boolean} [opts.dryRun] print install commands, don't run them
 * @param {boolean} [opts.ios] whether iOS support is wanted (gates iOS checks)
 * @param {boolean} [opts.installMissing=true] attempt installs for missing deps
 * @returns {Promise<{green:boolean, rows:Array}>}
 */
export async function doctor(opts = {}) {
  const {
    assumeYes = false,
    dryRun = false,
    ios = true,
    installMissing = true,
  } = opts;

  process.stdout.write(`\n${colors.bold("create-cmp doctor")} — toolchain preflight\n`);
  if (hostInfo.isLinux) {
    process.stdout.write(
      `${colors.yellow("Linux detected")}: scoping to Android-only (iOS toolchain is macOS-only).\n`
    );
  } else if (!hostInfo.isMac) {
    process.stdout.write(
      `${colors.yellow("Non-macOS host")}: iOS checks are skipped.\n`
    );
  }
  process.stdout.write("\n");

  const hostChecks = checksForHost({ iosWanted: ios });
  const rows = [];

  for (const check of hostChecks) {
    let { present, detail } = check.detect();
    const cmd = present ? null : check.installCommand({});

    if (present) {
      process.stdout.write(`${colors.green("✓")} ${check.label} — ${colors.dim(detail)}\n`);
    } else {
      process.stdout.write(`${colors.red("✗")} ${check.label} — ${colors.dim(detail)}\n`);
      if (check.manual && cmd === null) {
        process.stdout.write(`    ${colors.yellow("manual:")} ${check.manual}\n`);
      } else if (cmd) {
        process.stdout.write(`    ${colors.cyan("fix:")} ${cmd}\n`);
        if (installMissing) {
          const res = await runInstall({ command: cmd, assumeYes, dryRun });
          if (res.ran && res.code === 0) {
            // Re-detect after install (idempotent verify).
            const after = check.detect();
            present = after.present;
            detail = after.detail;
            if (present) {
              process.stdout.write(`    ${colors.green("→ now present")} (${detail})\n`);
            } else {
              process.stdout.write(
                `    ${colors.yellow("→ still not detected")} (may need a new shell / PATH export)\n`
              );
            }
          } else if (res.ran && res.code !== 0) {
            process.stdout.write(`    ${colors.red(`install exited ${res.code}`)}\n`);
          }
        }
      }
    }

    rows.push({
      id: check.id,
      label: check.label,
      present,
      detail,
      manual: !present && check.installCommand({}) === null,
    });
  }

  // Verdict table.
  process.stdout.write(`\n${colors.bold("Verdict")}\n`);
  let green = true;
  for (const r of rows) {
    if (r.present) {
      process.stdout.write(`  ${colors.green("GREEN")}  ${r.label}\n`);
    } else if (r.manual) {
      process.stdout.write(`  ${colors.yellow("MANUAL")} ${r.label}\n`);
      green = false;
    } else {
      process.stdout.write(`  ${colors.red("FAIL ")}  ${r.label}\n`);
      green = false;
    }
  }
  process.stdout.write(
    green
      ? `\n${colors.green("GREEN — toolchain ready.")}\n`
      : `\n${colors.red("FAIL — toolchain incomplete.")} Re-run after addressing the items above (idempotent).\n`
  );

  return { green, rows };
}
