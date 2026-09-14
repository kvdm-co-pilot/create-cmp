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
import { parseArgs, unknownFlags } from "../install/args.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(fs.readFileSync(path.join(HERE, "..", "package.json"), "utf8"));

/** Long flags only, `--k=v` or `--k v`, with a bare `--k` meaning true. */

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
    `    --no-interview            skip the ladder questions and record NO answers.\n` +
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

  // REFUSE WHAT WE CANNOT ACCOUNT FOR, before anything runs. `unknown command`
  // already does this one branch down; an unknown FLAG was parsed as best it
  // could be and the command proceeded — `--verfiy ../app` put the lane in the
  // cwd and exited 0. Refusing after the help/version short-circuit is
  // deliberate: `--help` must answer even when the rest of the line is wrong,
  // because a wrong line is the likeliest reason someone is asking.
  const unknown = unknownFlags(flags);
  if (!askedForHelp && unknown.length) {
    fail(`prooflane: ${unknown.map((f) => `--${f}`).join(", ")} ${unknown.length === 1 ? "is not a flag" : "are not flags"} this command knows`);
    process.stdout.write(`  run ${colors.cyan("prooflane --help")} for the flags it does know. Nothing was written.\n\n`);
    return 2;
  }

  // A single-dash token is a flag to neither parser, so it lands in the
  // positionals — and the first positional after the command is the target
  // DIRECTORY. `prooflane init -y ../app` resolved the project to a directory
  // literally named `-y`.
  const shortish = positionals.filter((p) => p.startsWith("-") && !p.startsWith("--"));
  if (!askedForHelp && shortish.length) {
    fail(`prooflane: ${shortish.join(", ")} — this command takes long flags only, and a bare \`-x\` would be read as the directory to install into`);
    process.stdout.write(`  run ${colors.cyan("prooflane --help")} for the flags it does know. Nothing was written.\n\n`);
    return 2;
  }
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
    `  usage: prooflane init    [dir] [--profile <id>] [--dry-run] [--no-interview]\n` +
      `         prooflane relock  [dir] [--dry-run]\n` +
      `         prooflane upgrade [dir] [--dry-run]\n\n`
  );
  return 2;
}

main()
  .then((code) => process.exit(code ?? 0))
  .catch((err) => {
    fail(`prooflane: ${err?.message ?? err}`);
    process.exit(1);
  });
