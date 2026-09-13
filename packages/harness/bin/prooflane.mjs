#!/usr/bin/env node
// `prooflane` — the harness's own command, and Stage 1's first criterion.
//
// WHAT WAS WRONG. `prooflane-harness` shipped a lane and no way to install it.
// The command that writes one — `harness init` — lived in `create-cmp`, so a Go
// or Python repo wanting the verify lane had to install the Kotlin/Compose
// scaffolder to get it. NORTH-STAR §9's Stage 1 says the opposite in one line:
// "installs without create-cmp". `scripts/stage1-gate.mjs` made that a command,
// and its criterion A named this file's absence as the reason the other three
// could not even be attempted.
//
// WHAT THIS IS NOT. It is not a second implementation. `create-cmp harness
// init` and `prooflane init` run the SAME module (install/init.mjs) and differ
// only in the `invocation` they pass, which decides whether the commands
// printed back say `prooflane relock` or `create-cmp harness relock`. Two front
// doors, one behaviour: a fork here would be a lane that installs differently
// depending on which package the adopter happened to find, and the whole point
// of a vendored harness is that every adopter gets the same bytes.
//
//   prooflane init [dir]      install the verify lane into a repo of any stack
//   prooflane relock [dir]    re-take the lock after editing YOUR profile
//   prooflane upgrade [dir]   re-vendor the lane from the resolved harness
//   prooflane --version       the harness version this command installs
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { colors, fail } from "../install/log.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(fs.readFileSync(path.join(HERE, "..", "package.json"), "utf8"));

/** Long flags only, `--k=v` or `--k v`, with a bare `--k` meaning true. */
/**
 * The flags that take NO value, so the token after them is the user's and not
 * the flag's.
 *
 * Without this a bare boolean eats the positional after it: `prooflane init
 * --new-profile ../app` installed into the CURRENT directory, 52 files, exit 0,
 * against a tree nobody named (KD-7, measured 2026-09-11). `--profile svc` and
 * `--new-profile ../app` are syntactically identical, so no parser can tell them
 * apart unaided.
 *
 * IT LISTS THE BOOLEANS AND NOT THE VALUE FLAGS, and the direction is the whole
 * safety argument: a name missing from THIS list leaves that one flag behaving
 * as it does today — the old bug, no worse. A name missing from a value-flag
 * list would turn a working `--profile svc` into a boolean and drop `svc` into
 * the positionals, which is a NEW break. Same omission, and only one direction
 * invents a defect.
 */
export const BOOLEAN_FLAGS = new Set([
  "help", "h", "version", "v",
  "dry-run", "new-profile",
  "no-interview", "yes", "y",
]);

export function parseArgs(argv) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      positionals.push(a);
      continue;
    }
    const body = a.slice(2);
    const eq = body.indexOf("=");
    if (eq !== -1) {
      flags[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }
    const next = argv[i + 1];
    // `no-` is boolean by construction, not by list: `flagBool` reads `--no-x`
    // as the negation of `x`, so a future `--no-anything` is covered the day it
    // is written rather than the day someone remembers to add it here.
    const takesValue = !BOOLEAN_FLAGS.has(body) && !body.startsWith("no-");
    if (takesValue && next !== undefined && !next.startsWith("--")) {
      flags[body] = next;
      i += 1;
    } else {
      flags[body] = true;
    }
  }
  return { flags, positionals };
}

function usage() {
  return (
    `\n${colors.bold("prooflane")} — the verify lane, for a repo of any stack\n\n` +
    `  ${colors.bold("Commands")}\n` +
    `    prooflane init [dir]      install the lane, then prove it refuses\n` +
    `    prooflane relock [dir]    re-take the lock after editing YOUR profile or declarations\n` +
    `    prooflane upgrade [dir]   re-vendor the lane from the installed harness, then re-lock\n\n` +
    `  ${colors.bold("Flags")}\n` +
    `    --profile <id>            the profile id to write (default: the directory name)\n` +
    `    --target-dir <dir>        the project to install into (default: .)\n` +
    `    --new-profile             seed a generic profile even if another claims this tree\n` +
    `    --dry-run                 print the plan, write nothing\n` +
    `    --no-interview, --yes     skip the ladder questions and record NO answers.\n` +
    `                              NOT the same as accepting the recommendations —\n` +
    `                              nothing is ever answered on your behalf\n` +
    `    --version, --help\n\n` +
    `  After ${colors.cyan("prooflane init")}: commit what it wrote, then run\n` +
    `  ${colors.cyan("node qa/framework-check.mjs")} — a lane you have not seen refuse is a lane\n` +
    `  you have not seen.\n\n`
  );
}

async function main() {
  const argv = process.argv.slice(2);
  const { flags, positionals } = parseArgs(argv);

  if (flags.version || flags.v) {
    process.stdout.write(`${PKG.name} ${PKG.version}\n`);
    return 0;
  }

  const command = positionals[0];
  const askedForHelp = Boolean(flags.help || flags.h) || command === "help";
  if (askedForHelp || !command) {
    process.stdout.write(usage());
    // Asked for: success. Nothing asked for at all: usage is the answer to a
    // question that was not put, so it is not a success.
    return askedForHelp ? 0 : 2;
  }

  if (command === "init") {
    const { runHarnessInit } = await import("../install/init.mjs");
    return await runHarnessInit(flags, positionals[1], { invocation: "prooflane" });
  }
  if (command === "relock") {
    const { runHarnessRelock } = await import("../install/relock.mjs");
    return await runHarnessRelock(flags, positionals[1], { invocation: "prooflane" });
  }
  if (command === "upgrade") {
    const { runHarnessUpgrade } = await import("../install/upgrade.mjs");
    return await runHarnessUpgrade(flags, positionals[1], { invocation: "prooflane" });
  }

  fail(`prooflane: unknown command ${JSON.stringify(command)}`);
  process.stdout.write(
    `  usage: prooflane init    [dir] [--profile <id>] [--dry-run] [--no-interview|--yes]\n` +
      `         prooflane relock  [dir] [--dry-run]\n` +
      `         prooflane upgrade [dir] [--dry-run]\n\n`
  );
  return 2;
}

// Run only when INVOKED, not when imported — the house idiom (ground-truth.mjs,
// sync-harness.mjs, check-plugin-sync.mjs all guard this way). Without it,
// importing this file to test `parseArgs` runs the CLI, prints the help and
// exits, so the parser that decides where a lane installs had no unit test at
// all. That is how KD-7 lived here unnoticed.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then((code) => process.exit(code ?? 0))
    .catch((err) => {
      fail(`prooflane: ${err?.message ?? err}`);
      process.exit(1);
    });
}
