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
//   prooflane --version       the harness version this command installs
//
// `upgrade` is deliberately absent rather than stubbed: re-vendoring an
// installed lane is Stage 1's criteria C and D, and a command that exists but
// does nothing is worse than one that is honestly missing (an adopter reads a
// silent success as an upgrade that happened). The unknown-subcommand refusal
// below names it as not-yet-shipped for exactly that reason.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { colors, fail } from "../install/log.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(fs.readFileSync(path.join(HERE, "..", "package.json"), "utf8"));

/** Long flags only, `--k=v` or `--k v`, with a bare `--k` meaning true. */
function parseArgs(argv) {
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
    if (next !== undefined && !next.startsWith("--")) {
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
    `    prooflane relock [dir]    re-take the lock after editing YOUR profile or declarations\n\n` +
    `  ${colors.bold("Flags")}\n` +
    `    --profile <id>            the profile id to write (default: the directory name)\n` +
    `    --target-dir <dir>        the project to install into (default: .)\n` +
    `    --new-profile             seed a generic profile even if another claims this tree\n` +
    `    --dry-run                 print the plan, write nothing\n` +
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

  // Name what exists and what does not. `upgrade` is the one an adopter will
  // reach for next and the one that is not here yet; saying so is cheaper than
  // letting them discover it as "unknown subcommand".
  fail(`prooflane: unknown command ${JSON.stringify(command)}`);
  process.stdout.write(
    `  usage: prooflane init [dir] [--profile <id>] [--dry-run]\n` +
      `         prooflane relock [dir] [--dry-run]\n\n` +
      `  ${colors.dim("upgrade is not shipped yet — re-vendoring an installed lane is the next slice.")}\n` +
      `  ${colors.dim("Until then a stamped app refreshes its lane with `create-cmp upgrade --harness`.")}\n\n`
  );
  return 2;
}

main()
  .then((code) => process.exit(code ?? 0))
  .catch((err) => {
    fail(`prooflane: ${err?.message ?? err}`);
    process.exit(1);
  });
