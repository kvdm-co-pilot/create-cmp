#!/usr/bin/env node
// create-cmp — scaffold and maintain production-ready Kotlin/Compose
// Multiplatform apps.
//
// Thin subcommand dispatcher; each command lives in src/commands/<name>.mjs
// and the deterministic engine in src/. Two front doors (this CLI + the
// Claude Code plugin) share that one engine.
//
//   npx create-cmp-cli [target-dir] [flags]        # scaffold (default command)
//   npx create-cmp-cli create  [target-dir] [flags]
//   npx create-cmp-cli doctor  [flags]             # toolchain + project diagnosis
//   npx create-cmp-cli upgrade [flags]             # migrate to a proven-green version set
//   npx create-cmp-cli clean   [flags]             # konan/Gradle cache & build-output hygiene
//   npx create-cmp-cli verify  [flags]             # green-build gate on an existing project
//   npx create-cmp-cli add firebase [flags]        # add Firebase to a stamped app

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BOOLEAN_FLAGS,
  parseArgs,
  unknownFlags,
  unreadableBooleanValues,
  emptyValues,
  takesNoValue,
} from "../src/lib/args.mjs";

const COMMANDS = new Set(["create", "doctor", "upgrade", "clean", "verify", "harden", "attach", "add", "harness", "help"]);

async function main() {
  const argv = process.argv.slice(2);
  const { _: positionals, flags } = parseArgs(argv);

  // Backward compatible dispatch: the first positional is a subcommand only if
  // it names one; otherwise it is the scaffold target dir (bare `create-cmp`
  // and all pre-router invocations keep working exactly as before).
  const command = COMMANDS.has(positionals[0]) ? positionals[0] : "create";
  const rest = COMMANDS.has(positionals[0]) ? positionals.slice(1) : positionals;

  // ANSWER BEFORE ACTING. `--version` is a documented flag, so refusing the
  // unrecognised never reaches it — it used to pass every check and fall through
  // the dispatcher into `create`, scaffolding a whole app into ./myapp while the
  // user waited for a version string (KD-15). prooflane has always short-circuited
  // both; this is the same rule at the other door.
  //
  // THESE TWO ARE READ BY PRESENCE, and are the only declared booleans that
  // are: `--version` is a QUESTION, so `--version false` is not an instruction
  // to do something else, and the something else here is `create` — which
  // writes. Normalizing the value form (KD-16) turned `"false"` into `false`
  // and would have walked this branch's own KD-15 straight back in: measured
  // before the guard, `create-cmp --version false --yes` fell through the
  // dispatcher and scaffolded an app while the user waited for a version
  // string. A question asked in any form is answered.
  if ("version" in flags || "v" in flags) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(fs.readFileSync(path.join(here, "..", "package.json"), "utf8"));
    process.stdout.write(`${pkg.name} ${pkg.version}\n`);
    process.exit(0);
  }

  if ("help" in flags || "h" in flags || command === "help") {
    printHelp();
    process.exit(0);
  }

  // Refuse what this door cannot account for, before any command runs — the
  // same answer `unknown command` gives, applied to the flags nothing looked at.
  // An unrecognised flag used to be parsed as best it could be, which for
  // `harness init` meant eating the directory and installing into the cwd.
  const unknown = unknownFlags(flags);
  const shortish = positionals.filter((p) => p.startsWith("-") && !p.startsWith("--"));
  if (unknown.length || shortish.length) {
    const named = [...unknown.map((f) => `--${f}`), ...shortish].join(", ");
    process.stderr.write(
      `create-cmp: ${named} ${unknown.length + shortish.length === 1 ? "is not an argument" : "are not arguments"} this command knows.\n` +
        `  run \`create-cmp --help\` for the ones it does. Nothing was written.\n`
    );
    process.exit(2);
  }

  // A RECOGNISED FLAG CARRYING A VALUE IT CANNOT MEAN. `parseArgs` turns a
  // declared boolean's `true`/`false` into the boolean; whatever is left here is
  // a third word attached with `=`, which the check above cannot see because the
  // NAME is known. Refused rather than guessed at, for the reason the block
  // above gives: the alternative is `--dry-run=maybe` silently meaning its
  // opposite. Only the `=` form can reach this — `--dry-run maybe ../app` leaves
  // `maybe` a positional on purpose, because an adopter may have a directory
  // called `maybe` and KD-7 is what refusing it would re-create.
  const unreadable = unreadableBooleanValues(flags);
  if (unreadable.length) {
    // `--no-<value flag>` lands here too, because `no-` reads as boolean by
    // construction — and it is not a flag that takes `true` or `false`. It is no
    // flag at all, so it is refused as that, by name (KD-218). Only the WORDS
    // differ: what the parser accepts, and that this refuses, are unchanged.
    const negatedValue = unreadable.filter((f) => f.startsWith("no-") && !BOOLEAN_FLAGS.has(f) && !takesNoValue(f.slice(3)));
    const booleans = unreadable.filter((f) => !negatedValue.includes(f));
    const lines = [];
    if (booleans.length) {
      const named = booleans.map((f) => `--${f}=${flags[f]}`).join(", ");
      lines.push(`${named} — ${booleans.length === 1 ? "that flag takes" : "those flags take"} \`true\` or \`false\`, or no value at all.`);
    }
    for (const f of negatedValue) {
      lines.push(`--${f}=${flags[f]} — there is no \`--${f}\`: \`--${f.slice(3)}\` takes a value, and has no \`--no-\` form.`);
    }
    process.stderr.write(
      lines.map((l) => `create-cmp: ${l}\n`).join("") +
        `  run \`create-cmp --help\` for what each one means. Nothing was written.\n`
    );
    process.exit(2);
  }

  // A VALUE FLAG GIVEN NO VALUE. Every reader is spelled `(typeof v === "string"
  // && v) || positional || "."`, and `""` is falsy — so `--target-dir=` is the
  // same as no `--target-dir` at all and the command runs against the CWD.
  // Measured 2026-09-22: `create-cmp harness init --target-dir= --no-interview`
  // wrote the lane into the directory it happened to run from, and `create-cmp
  // upgrade --target-dir= --yes` rewrote that directory's version catalog with
  // the consent prompt auto-answered. The line behind it is a script's
  // `--target-dir=$DIR` with `DIR` unset: a directory WAS named, by a variable
  // that expanded to nothing, and guessing the cwd from that is KD-7's outcome —
  // a tree nobody named. Unquoted, the same script leaves the flag BARE, which
  // `emptyValues` counts as empty for the flags that name where files are
  // written and for no others.
  const empty = emptyValues(flags);
  if (empty.length) {
    const named = empty.map((f) => `--${f}`).join(", ");
    process.stderr.write(
      `create-cmp: ${named} ${empty.length === 1 ? "needs a value, and was given none" : "need values, and were given none"} ` +
        `(an unset shell variable expands to nothing, quoted or not).\n` +
        `  run \`create-cmp --help\` for what each one takes. Nothing was written.\n`
    );
    process.exit(2);
  }

  // AN EMPTY POSITIONAL. The other half of every one of those readers is
  // `|| positional ||`, and `""` is falsy there too: `create-cmp upgrade ""` and
  // `create-cmp harness init "" --no-interview` resolve the project to the cwd,
  // which is `prooflane init "$DIR"` with `DIR` unset — the flag's mistake, one
  // argument over. Refused HERE rather than in each command for the reason
  // `src/lib/args.mjs` gives about the value form: there are eleven readers of
  // that idiom across ten files, and a fix at the read sites has to find all of
  // them today and again tomorrow. Nothing at this door can mean `""` — not a
  // subcommand, not a directory, not an app name — so the door can answer for
  // all of them.
  const blank = positionals.filter((p) => p === "");
  if (blank.length) {
    process.stderr.write(
      `create-cmp: the directory to work in ${blank.length === 1 ? "was given as an empty argument" : "was given as empty arguments"} ` +
        `(an unset shell variable expands to nothing, quoted or not).\n` +
        `  name it, or drop the argument to mean the current directory. Nothing was written.\n`
    );
    process.exit(2);
  }

  switch (command) {
    case "doctor": {
      const { runDoctor } = await import("../src/commands/doctor.mjs");
      await runDoctor(flags, rest[0]);
      return;
    }
    case "upgrade": {
      const { runUpgrade } = await import("../src/commands/upgrade.mjs");
      await runUpgrade(flags, rest[0]);
      return;
    }
    case "clean": {
      const { runClean } = await import("../src/commands/clean.mjs");
      await runClean(flags, rest[0]);
      return;
    }
    case "verify": {
      const { runVerifyCommand } = await import("../src/commands/verify.mjs");
      await runVerifyCommand(flags, rest[0]);
      return;
    }
    case "harden": {
      const { runHarden } = await import("../src/commands/harden.mjs");
      await runHarden(flags, rest[0]);
      return;
    }
    case "attach": {
      const { runAttach } = await import("../src/commands/attach.mjs");
      await runAttach(flags, rest[0]);
      return;
    }
    // `add` names the service it adds — `create-cmp add firebase ./app` — so the directory is the
    // SECOND positional. Firebase is the only service, and it left stamp-time for this door
    // (docs/proposals/LIBRARIES-IN-SERVICES-OUT.md, Decision 2).
    case "add": {
      const { runAdd } = await import("../src/commands/add.mjs");
      await runAdd(flags, rest[0], rest[1]);
      return;
    }
    // `harness` takes a subcommand because it is stack-neutral and will grow
    // siblings (`upgrade`, `doctor`) that must not collide with the Compose
    // verbs above. It is also the form that survived the rename it predicted:
    // since 2026-09-08 the implementation lives in the harness package and its
    // own binary spells these `prooflane init` / `prooflane relock`. This
    // dispatch DELEGATES rather than duplicating — `invocation` is the only
    // difference, and it decides which command names the output prints back.
    case "harness": {
      const sub = rest[0];
      if (sub === "init") {
        const { runHarnessInit } = await import("../packages/harness/install/init.mjs");
        process.exit((await runHarnessInit(flags, rest[1], { invocation: "create-cmp" })) ?? 0);
      }
      if (sub === "relock") {
        const { runHarnessRelock } = await import("../packages/harness/install/relock.mjs");
        process.exit((await runHarnessRelock(flags, rest[1], { invocation: "create-cmp" })) ?? 0);
      }
      // The sibling the comment above predicted, arriving with `--fleet`. It is
      // here and not only on `prooflane` because a door offering init and
      // relock but not upgrade is the asymmetry KD-4 and KD-24 are both about,
      // and because scripts/stage3-gate.mjs names THIS door as its fallback
      // when the harness package cannot be resolved — a gate pointing at a
      // subcommand that does not exist is a landmine with a timer on it.
      if (sub === "upgrade") {
        if ("fleet" in flags) {
          const { runFleetUpgrade } = await import("../packages/harness/install/fleet.mjs");
          process.exit((await runFleetUpgrade(flags, rest[1], { invocation: "create-cmp" })) ?? 0);
        }
        const { runHarnessUpgrade } = await import("../packages/harness/install/upgrade.mjs");
        process.exit((await runHarnessUpgrade(flags, rest[1], { invocation: "create-cmp" })) ?? 0);
      }
      process.stderr.write(
        `create-cmp harness: unknown subcommand ${JSON.stringify(sub ?? "")}\n` +
          `  usage: create-cmp harness init    [--profile <id>] [--target-dir <dir>] [--dry-run] [--new-profile] [--no-interview]\n` +
          `         create-cmp harness relock  [--target-dir <dir>] [--dry-run]\n` +
          `         create-cmp harness upgrade [--target-dir <dir>] [--dry-run]\n` +
          `         create-cmp harness upgrade --fleet <manifest> [--dry-run]\n`
      );
      process.exit(2);
    }
    case "create":
    default: {
      const { runCreate } = await import("../src/commands/create.mjs");
      await runCreate(flags, rest[0]);
    }
  }
}

function printHelp() {
  process.stdout.write(
    `create-cmp — the AI delivery harness for Kotlin/Compose Multiplatform (Android + iOS)\n` +
      `Scaffolds a green-building app in minutes; every generated project carries a spec-driven\n` +
      `verify lane, evidence receipts, and mechanical enforcement of "done".\n\n` +
      `Usage:\n` +
      `  npx create-cmp-cli [target-dir] [flags]    scaffold a new app (default command)\n` +
      `  npx create-cmp-cli create [target-dir]     same, explicit\n` +
      `  npx create-cmp-cli doctor                  toolchain doctor + project diagnosis (any KMP project)\n` +
      `  npx create-cmp-cli upgrade                 migrate to the next proven-green version set\n` +
      `  npx create-cmp-cli upgrade --harness       refresh engine-owned files of a stamped app (3-way merge)\n` +
      `  npx create-cmp-cli clean                   ~/.konan + Gradle build-output hygiene (consent-gated)\n` +
      `  npx create-cmp-cli verify                  run the green-build gate on an existing project\n` +
      `  npx create-cmp-cli harden                  install the full harness into a --minimal scaffold\n` +
      `  npx create-cmp-cli attach                  wire the agent contract into an EXISTING Compose/KMP repo\n` +
      `  npx create-cmp-cli add firebase [dir]      add Firebase to a stamped app (GitLive SDK + emulator wiring)\n` +
      `  npx create-cmp-cli harness init            install the verify lane into a repo of ANY stack\n` +
      `  npx create-cmp-cli harness relock          re-take the lock after editing YOUR profile or declarations\n\n` +
      `create (scaffold) flags:\n` +
      `  --name --package --bundle-id --theme-prefix\n` +
      `  --minimal   (light scaffold: app + tests + previews, no verify lane/receipts —\n` +
      `               \`harden\` installs the full harness later, idempotently)\n` +
      `  --preset full|lean   (the app's shape, default full. lean = no Room, so no KSP step in\n` +
      `               the first build; the harness is full in both, and a stated --room wins)\n` +
      `  --ios/--no-ios  --room/--no-room  --e2e/--no-e2e  --inspector/--no-inspector\n` +
      `  --dev-client/--no-dev-client   (desktop JVM window + Compose Hot Reload)\n` +
      `  (--appium/--no-appium accepted as deprecated aliases for --e2e/--no-e2e)\n` +
      `  --tabs Home:home,Profile:person\n` +
      `  --target-dir  --verify/--no-verify  --yes  --force  --dry-run-verify\n` +
      `  (Firebase is not a stamp option: --firebase, --region, --auth and the service flags are\n` +
      `   refused here and name \`create-cmp add firebase\`; their --no- forms are accepted, and moot)\n\n` +
      `doctor flags:  --yes  --dry-run  --no-ios  --no-install  --target-dir <dir>  --fix\n` +
      `upgrade flags: --target-dir <dir>  --set <id>  --dry-run  --yes  --verify\n` +
      `  --harness mode flags: --target-dir <dir>  --base-dir <extracted-template>  --dry-run  --yes\n` +
      `  (--harness dry-runs by default; conflicts never clobber — they land as *.cmp-new sidecars)\n` +
      `clean flags:   --target-dir <dir>  --dry-run  --yes\n` +
      `verify flags:  --target-dir <dir>  --no-ios  --dry-run\n` +
      `harden flags:  --target-dir <dir>  --dry-run  --yes  --verify (run the lane after install)\n` +
      `attach flags:  --target-dir <dir>  --dry-run  --yes\n` +
      `add firebase flags: --target-dir <dir>  --region <r>  --auth <email|phone|both|none>\n` +
      `                    --firestore/--no-firestore  --storage/--no-storage  --functions/--no-functions  --fcm/--no-fcm\n` +
      `                    --google-services <path> (your real config; without it a MOCK that says so is written)\n` +
      `                    --dry-run  --verify/--no-verify  --dry-run-verify\n` +
      `harness init flags:   --profile <id>  --target-dir <dir>  --dry-run\n` +
      `                      --new-profile   (seed a generic profile even if another claims this tree)\n` +
      `                      --no-interview  (skip the ladder questions and record NO answers —\n` +
      `                      not the same as taking the defaults, which this command never does)\n` +
      `harness relock flags: --target-dir <dir>  --dry-run\n` +
      `  (relock covers qa/lib/profiles/<id>/** and qa/{verified-surface,harness-manifest}.json only —\n` +
      `   a machine-owned edit is a fork and is refused by name; \`upgrade --harness\` restores it)\n`
  );
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err && err.stack ? err.stack : err}\n`);
  process.exit(1);
});
