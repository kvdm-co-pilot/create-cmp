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
import {
  BOOLEAN_FLAGS,
  parseArgs,
  unknownFlags,
  unreadableBooleanValues,
  emptyValues,
  takesNoValue,
  negatedValueFlags,
} from "../install/args.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(fs.readFileSync(path.join(HERE, "..", "package.json"), "utf8"));

/** Long flags only, `--k=v` or `--k v`, with a bare `--k` meaning true. */

function usage() {
  return (
    `\n${colors.bold("prooflane")} — the verify lane, for a repo of any stack\n\n` +
    `  ${colors.bold("Commands")}\n` +
    `    prooflane init [dir]      install the lane, then prove it refuses\n` +
    `    prooflane relock [dir]    re-take the lock after editing YOUR profile or declarations\n` +
    `    prooflane upgrade [dir]   re-vendor the lane from the installed harness, then re-lock\n` +
    `    prooflane upgrade --fleet <manifest>\n` +
    `                              the same, for every repo a fleet manifest names\n\n` +
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

  // READ BY PRESENCE, and the only two flags here that are. `--version` and
  // `--help` are QUESTIONS: `--version false` does not mean "do the other thing
  // instead", so once `parseArgs` started handing the value form through as a
  // real boolean (KD-16) these had to stop reading it, or the answer to a
  // question asked awkwardly became `usage`, exit 2 — and at the other door,
  // which shares this shape, a scaffold (KD-15).
  if ("version" in flags || "v" in flags) {
    process.stdout.write(`${PKG.name} ${PKG.version}\n`);
    return 0;
  }

  const command = positionals[0];
  const askedForHelp = "help" in flags || "h" in flags || command === "help";

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

  // A RECOGNISED FLAG CARRYING A VALUE IT CANNOT MEAN. `parseArgs` turns a
  // declared boolean's `true`/`false` into the boolean, at both the space form
  // and the `=` form; what is left holding a string is `--dry-run=maybe`, whose
  // NAME is known, so the check above cannot see it. It used to run as a dry run
  // (a non-empty string is truthy) and after the coercion would run as a real
  // install — neither of them what was typed. Only the `=` form reaches this:
  // `--dry-run maybe ../app` leaves `maybe` a positional on purpose, because
  // refusing THAT is how KD-7 comes back.
  const unreadable = unreadableBooleanValues(flags);
  // The BARE `--no-<value flag>` holds a boolean, so the line above cannot see it,
  // and it left the next word the project (KD-218): refused in the same words.
  const negatedBare = negatedValueFlags(flags).filter((f) => typeof flags[f] !== "string");
  if (!askedForHelp && (unreadable.length || negatedBare.length)) {
    // `--no-<value flag>` lands here too — `no-` reads as boolean by construction —
    // and it is no flag at all, so it is refused as that, by name (KD-218). Only the
    // WORDS differ: what the parser accepts, and that this refuses, are unchanged.
    const negatedValue = unreadable.filter((f) => f.startsWith("no-") && !BOOLEAN_FLAGS.has(f) && !takesNoValue(f.slice(3)));
    const booleans = unreadable.filter((f) => !negatedValue.includes(f));
    if (booleans.length) {
      fail(
        `prooflane: ${booleans.map((f) => `--${f}=${flags[f]}`).join(", ")} — ` +
          `${booleans.length === 1 ? "that flag takes" : "those flags take"} \`true\` or \`false\`, or no value at all`
      );
    }
    for (const f of negatedValue) {
      fail(`prooflane: --${f}=${flags[f]} — there is no \`--${f}\`: \`--${f.slice(3)}\` takes a value, and has no \`--no-\` form`);
    }
    for (const f of negatedBare) {
      fail(`prooflane: --${f} — there is no \`--${f}\`: \`--${f.slice(3)}\` takes a value, and has no \`--no-\` form`);
    }
    process.stdout.write(`  run ${colors.cyan("prooflane --help")} for what each one means. Nothing was written.\n\n`);
    return 2;
  }

  // A VALUE FLAG GIVEN NO VALUE. `init`, `relock` and `upgrade` resolve
  // their tree with `(typeof v === "string" && v) || positional || "."`, and
  // `""` is falsy — so `--target-dir=` is the same as no `--target-dir` at all
  // and the lane installs into the CWD. Measured 2026-09-22: `prooflane init
  // --target-dir= --no-interview` from an empty directory wrote the lane into
  // it. The line behind it is a script's `--target-dir=$DIR` with `DIR` unset: a
  // directory WAS named, by a variable that expanded to nothing, and guessing
  // the cwd from that is KD-7 — fifty-two files into the wrong repository.
  // Unquoted, the same script leaves the flag BARE (`--target-dir --dry-run`),
  // which `emptyValues` counts as empty for the flags that name where files are
  // written and for no others: `--profile` bare still means the directory slug.
  const empty = emptyValues(flags);
  if (!askedForHelp && empty.length) {
    fail(
      `prooflane: ${empty.map((f) => `--${f}`).join(", ")} ` +
        `${empty.length === 1 ? "needs a value, and was given none" : "need values, and were given none"} ` +
        `(an unset shell variable expands to nothing, quoted or not)`
    );
    process.stdout.write(`  run ${colors.cyan("prooflane --help")} for what each one takes. Nothing was written.\n\n`);
    return 2;
  }

  // AN EMPTY POSITIONAL. The other half of the same readers is `|| positional
  // ||`, and `""` is falsy there too: `prooflane init ""` installs into the cwd,
  // which is `prooflane init "$DIR"` with `DIR` unset — the flag's mistake, one
  // argument over. Refused at the door rather than in `init`, `relock` and
  // `upgrade` separately, for the reason `install/args.mjs` gives about the
  // value form: a fix at the read sites has to find all of them today and again
  // tomorrow, and nothing this command takes positionally can mean `""`.
  const blank = positionals.filter((p) => p === "");
  if (!askedForHelp && blank.length) {
    fail(
      `prooflane: the directory to install into ${blank.length === 1 ? "was given as an empty argument" : "was given as empty arguments"} ` +
        `(an unset shell variable expands to nothing, quoted or not)`
    );
    process.stdout.write(`  name it, or drop the argument to mean the current directory. Nothing was written.\n\n`);
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
  // MORE THAN ONE DIRECTORY. `init`, `relock` and `upgrade` each read ONE
  // positional after the command and dropped the rest, so a word after a
  // boolean — `--dry-run maybe ../app`, which stays a positional on purpose
  // (refusing it is KD-7) — pushed the directory the user named out of the
  // command: the lane went to `./maybe` (KD-150). Two directories is a question
  // this door cannot answer, so it is refused rather than guessed.
  if (!askedForHelp && ["init", "relock", "upgrade"].includes(command) && positionals.length > 2) {
    const named = positionals.slice(1);
    fail(`prooflane: ${named.join(", ")} — \`${command}\` takes one directory, and was given ${named.length}`);
    process.stdout.write(`  a word after a flag like \`--dry-run\` is read as a directory unless it is \`true\` or \`false\`. Nothing was written.\n\n`);
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
    if ("fleet" in flags) {
      const { runFleetUpgrade } = await import("../install/fleet.mjs");
      return await runFleetUpgrade(flags, positionals[1], { invocation: "prooflane" });
    }
    const { runHarnessUpgrade } = await import("../install/upgrade.mjs");
    return await runHarnessUpgrade(flags, positionals[1], { invocation: "prooflane" });
  }

  fail(`prooflane: unknown command ${JSON.stringify(command)}`);
  process.stdout.write(
    `  usage: prooflane init    [dir] [--profile <id>] [--dry-run] [--no-interview]\n` +
      `         prooflane relock  [dir] [--dry-run]\n` +
      `         prooflane upgrade [dir] [--dry-run]\n` +
      `         prooflane upgrade --fleet <manifest> [--dry-run]\n\n`
  );
  return 2;
}

main()
  .then((code) => process.exit(code ?? 0))
  .catch((err) => {
    fail(`prooflane: ${err?.message ?? err}`);
    process.exit(1);
  });
