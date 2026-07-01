// Shared command-detection + consent-gated install helpers for the bootstrap
// toolchain installer. Detection is real (which/--version probes); every
// mutating install command is consent-gated and dry-runnable.

import { spawnSync, spawn } from "node:child_process";
import readline from "node:readline";

/**
 * Run a command and capture output synchronously (for detection probes).
 * Never throws — returns {ok, code, stdout, stderr}.
 * @param {string} cmd
 * @param {string[]} args
 * @returns {{ok:boolean, code:number, stdout:string, stderr:string}}
 */
export function probe(cmd, args = []) {
  try {
    const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 20000 });
    return {
      ok: r.status === 0,
      code: r.status ?? 1,
      stdout: (r.stdout || "").trim(),
      stderr: (r.stderr || "").trim(),
    };
  } catch {
    return { ok: false, code: 127, stdout: "", stderr: "" };
  }
}

/**
 * Is a binary on PATH?
 * @param {string} bin
 * @returns {string|null} resolved path or null
 */
export function which(bin) {
  const finder = process.platform === "win32" ? "where" : "which";
  const r = probe(finder, [bin]);
  if (r.ok && r.stdout) return r.stdout.split("\n")[0].trim();
  return null;
}

/**
 * Ask the user for yes/no consent. In --yes mode, auto-approves.
 * @param {string} question
 * @param {object} opts
 * @param {boolean} opts.assumeYes
 * @returns {Promise<boolean>}
 */
export async function consent(question, { assumeYes = false } = {}) {
  if (assumeYes) {
    process.stdout.write(`${question} ${"(auto-yes)"}\n`);
    return true;
  }
  if (!process.stdin.isTTY) {
    // Non-interactive without --yes: decline mutating actions.
    process.stdout.write(`${question} (no TTY, declining — pass --yes to auto-approve)\n`);
    return false;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (a) => resolve(a.trim().toLowerCase()));
  });
  rl.close();
  return answer === "y" || answer === "yes";
}

/**
 * Run an install command, consent-gated and dry-runnable.
 * @param {object} params
 * @param {string} params.command human/shell install command
 * @param {boolean} params.assumeYes
 * @param {boolean} params.dryRun
 * @returns {Promise<{ran:boolean, code:number, approved:boolean}>}
 */
export async function runInstall({ command, assumeYes, dryRun }) {
  if (dryRun) {
    process.stdout.write(`    [dry-run] would run: ${command}\n`);
    return { ran: false, code: 0, approved: false };
  }
  const approved = await consent(`    Run install: \`${command}\`?`, { assumeYes });
  if (!approved) {
    process.stdout.write(`    skipped (not approved)\n`);
    return { ran: false, code: 0, approved: false };
  }
  const code = await new Promise((resolve) => {
    const child = spawn(command, { shell: true, stdio: "inherit", env: process.env });
    child.on("close", (c) => resolve(c ?? 1));
    child.on("error", () => resolve(127));
  });
  return { ran: true, code, approved: true };
}
