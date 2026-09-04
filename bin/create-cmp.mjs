#!/usr/bin/env node
// create-cmp — scaffold and maintain production-ready Kotlin/Compose
// Multiplatform apps.
//
// Thin subcommand dispatcher; each command lives in src/commands/<name>.mjs
// and the deterministic engine in src/. Two front doors (this CLI + the
// Claude Code plugin) share that one engine.
//
//   npx create-cmp [target-dir] [flags]        # scaffold (default command)
//   npx create-cmp create  [target-dir] [flags]
//   npx create-cmp doctor  [flags]             # toolchain + project diagnosis
//   npx create-cmp upgrade [flags]             # migrate to a proven-green version set
//   npx create-cmp clean   [flags]             # konan/Gradle cache & build-output hygiene
//   npx create-cmp verify  [flags]             # green-build gate on an existing project

import { parseArgs } from "../src/lib/args.mjs";

const COMMANDS = new Set(["create", "doctor", "upgrade", "clean", "verify", "harden", "attach", "harness", "help"]);

async function main() {
  const argv = process.argv.slice(2);
  const { _: positionals, flags } = parseArgs(argv);

  // Backward compatible dispatch: the first positional is a subcommand only if
  // it names one; otherwise it is the scaffold target dir (bare `create-cmp`
  // and all pre-router invocations keep working exactly as before).
  const command = COMMANDS.has(positionals[0]) ? positionals[0] : "create";
  const rest = COMMANDS.has(positionals[0]) ? positionals.slice(1) : positionals;

  if (flags.help || flags.h || command === "help") {
    printHelp();
    process.exit(0);
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
    // `harness` takes a subcommand because it is stack-neutral and will grow
    // siblings (`upgrade`, `doctor`) that must not collide with the Compose
    // verbs above. It is also the form that survives the rename: when the
    // binary is named after the harness, `harness init` becomes `<name> init`.
    case "harness": {
      const sub = rest[0];
      if (sub !== "init") {
        process.stderr.write(
          `create-cmp harness: unknown subcommand ${JSON.stringify(sub ?? "")}\n` +
            `  usage: create-cmp harness init [--profile <id>] [--target-dir <dir>] [--dry-run]\n`
        );
        process.exit(2);
      }
      const { runHarnessInit } = await import("../src/commands/harness-init.mjs");
      process.exit((await runHarnessInit(flags, rest[1])) ?? 0);
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
      `  npx create-cmp [target-dir] [flags]    scaffold a new app (default command)\n` +
      `  npx create-cmp create [target-dir]     same, explicit\n` +
      `  npx create-cmp doctor                  toolchain doctor + project diagnosis (any KMP project)\n` +
      `  npx create-cmp upgrade                 migrate to the next proven-green version set\n` +
      `  npx create-cmp upgrade --harness       refresh engine-owned files of a stamped app (3-way merge)\n` +
      `  npx create-cmp clean                   ~/.konan + Gradle build-output hygiene (consent-gated)\n` +
      `  npx create-cmp verify                  run the green-build gate on an existing project\n` +
      `  npx create-cmp harden                  install the full harness into a --minimal scaffold\n` +
      `  npx create-cmp attach                  wire the agent contract into an EXISTING Compose/KMP repo\n` +
      `  npx create-cmp harness init            install the verify lane into a repo of ANY stack\n\n` +
      `create (scaffold) flags:\n` +
      `  --name --package --bundle-id --region --theme-prefix\n` +
      `  --minimal   (light scaffold: app + tests + previews, no verify lane/receipts —\n` +
      `               \`harden\` installs the full harness later, idempotently)\n` +
      `  --ios/--no-ios  --firebase/--no-firebase  --auth <email|phone|both|none>\n` +
      `  --room/--no-room  --e2e/--no-e2e  --inspector/--no-inspector\n` +
      `  --dev-client/--no-dev-client   (desktop JVM window + Compose Hot Reload)\n` +
      `  (--appium/--no-appium accepted as deprecated aliases for --e2e/--no-e2e)\n` +
      `  --tabs Home:home,Profile:person\n` +
      `  --target-dir  --verify/--no-verify  --yes  --force  --dry-run-verify\n\n` +
      `doctor flags:  --yes  --dry-run  --no-ios  --no-install  --target-dir <dir>  --fix\n` +
      `upgrade flags: --target-dir <dir>  --set <id>  --dry-run  --yes  --verify\n` +
      `  --harness mode flags: --target-dir <dir>  --base-dir <extracted-template>  --dry-run  --yes\n` +
      `  (--harness dry-runs by default; conflicts never clobber — they land as *.cmp-new sidecars)\n` +
      `clean flags:   --target-dir <dir>  --dry-run  --yes\n` +
      `verify flags:  --target-dir <dir>  --no-ios  --dry-run\n` +
      `harden flags:  --target-dir <dir>  --dry-run  --yes  --verify (run the lane after install)\n` +
      `attach flags:  --target-dir <dir>  --dry-run  --yes\n`
  );
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err && err.stack ? err.stack : err}\n`);
  process.exit(1);
});
