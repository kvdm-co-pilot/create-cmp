#!/usr/bin/env node
// create-cmp — scaffold a production-ready Kotlin/Compose Multiplatform app.
//
// Two front doors share one engine. This is the npx CLI. Usage:
//
//   npx create-cmp [target-dir] [flags]      # scaffold (default command)
//   npx create-cmp doctor [flags]            # toolchain doctor → bootstrap → verify
//
// Scaffold flags (non-interactive when --yes or enough flags are given):
//   --name <str>           app display name
//   --package <id>         reverse-DNS package (com.acme.app)
//   --bundle-id <id>       iOS bundle id (defaults to --package)
//   --region <r>           Firebase region (default us-central1)
//   --theme-prefix <P>     PascalCase symbol prefix (default from --name)
//   --ios / --no-ios       enable/disable iOS (default on)
//   --firebase / --no-firebase
//   --auth <email|phone|both|none>   (default both)
//   --no-firestore --no-storage --no-functions --no-fcm
//   --room / --no-room
//   --appium / --no-appium
//   --tabs Home:home,Profile:person     comma list of label:icon
//   --target-dir <dir>     destination (or positional arg)
//   --verify / --no-verify (default verify on)
//   --yes                  accept defaults / skip prompts (CI)
//   --dry-run-verify       print verify commands without running
//   --force                allow non-empty target dir
//
// Doctor flags: --yes --dry-run --no-ios --no-install

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- tiny arg parser -------------------------------------------------------

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        args.flags[key] = true; // boolean flag
      } else {
        args.flags[key] = next;
        i++;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function flagBool(flags, name, dflt) {
  if (flags[name] === true || flags[name] === "true") return true;
  if (flags[`no-${name}`] === true || flags[name] === "false") return false;
  return dflt;
}

function parseTabs(str) {
  if (!str || str === true) return null;
  const tabs = String(str)
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const [label, icon] = pair.split(":").map((s) => s.trim());
      return { label, icon: icon || label.toLowerCase() };
    });
  return tabs.length ? tabs : null;
}

function pascalFromName(name) {
  return (name || "App")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("") || "App";
}

function slugFromName(name) {
  return (name || "app").toLowerCase().replace(/[^a-z0-9]/g, "") || "app";
}

// --- config builders -------------------------------------------------------

function buildConfigFromFlags(flags, positional) {
  const name = typeof flags.name === "string" ? flags.name : "MyApp";
  const pkg = typeof flags.package === "string" ? flags.package : `com.${slugFromName(name)}.app`;
  const ios = flagBool(flags, "ios", true);
  const firebase = flagBool(flags, "firebase", true);
  const targetDir =
    (typeof flags["target-dir"] === "string" && flags["target-dir"]) ||
    positional ||
    `./${slugFromName(name)}`;

  return {
    appName: name,
    package: pkg,
    iosBundleId: typeof flags["bundle-id"] === "string" ? flags["bundle-id"] : pkg,
    region: typeof flags.region === "string" ? flags.region : "us-central1",
    themePrefix:
      typeof flags["theme-prefix"] === "string" ? flags["theme-prefix"] : pascalFromName(name),
    platforms: { android: true, ios },
    firebase: {
      enabled: firebase,
      auth: typeof flags.auth === "string" ? flags.auth : "both",
      firestore: flagBool(flags, "firestore", firebase),
      storage: flagBool(flags, "storage", firebase),
      functions: flagBool(flags, "functions", firebase),
      fcm: flagBool(flags, "fcm", firebase),
    },
    room: flagBool(flags, "room", true),
    appium: flagBool(flags, "appium", true),
    tabs: parseTabs(flags.tabs) || [
      { label: "Home", icon: "home" },
      { label: "Profile", icon: "person" },
    ],
    targetDir,
  };
}

async function interactiveConfig(positional) {
  let prompts;
  try {
    prompts = (await import("prompts")).default;
  } catch {
    process.stderr.write(
      "Interactive mode needs the 'prompts' package. Re-run with flags + --yes for non-interactive use.\n"
    );
    process.exit(1);
  }

  const onCancel = () => {
    process.stdout.write("Cancelled.\n");
    process.exit(1);
  };

  const base = await prompts(
    [
      { type: "text", name: "appName", message: "App display name", initial: "MyApp" },
      {
        type: "text",
        name: "package",
        message: "Package (reverse-DNS)",
        initial: (prev) => `com.${slugFromName(prev)}.app`,
      },
      { type: "confirm", name: "ios", message: "Enable iOS target?", initial: true },
      { type: "text", name: "region", message: "Firebase region", initial: "us-central1" },
      { type: "confirm", name: "firebase", message: "Wire Firebase (GitLive)?", initial: true },
    ],
    { onCancel }
  );

  let auth = "none";
  let firestore = false, storage = false, functions = false, fcm = false;
  if (base.firebase) {
    const fb = await prompts(
      [
        {
          type: "select",
          name: "auth",
          message: "Auth type",
          choices: [
            { title: "Email + Phone (both)", value: "both" },
            { title: "Email only", value: "email" },
            { title: "Phone/OTP only", value: "phone" },
            { title: "None", value: "none" },
          ],
          initial: 0,
        },
        { type: "confirm", name: "firestore", message: "Firestore?", initial: true },
        { type: "confirm", name: "storage", message: "Storage?", initial: true },
        { type: "confirm", name: "functions", message: "Cloud Functions?", initial: true },
        { type: "confirm", name: "fcm", message: "FCM (push)?", initial: true },
      ],
      { onCancel }
    );
    auth = fb.auth; firestore = fb.firestore; storage = fb.storage;
    functions = fb.functions; fcm = fb.fcm;
  }

  const extras = await prompts(
    [
      { type: "confirm", name: "room", message: "Room local cache?", initial: true },
      { type: "confirm", name: "appium", message: "Appium test harness?", initial: true },
      {
        type: "text",
        name: "tabs",
        message: "Bottom-nav tabs (label:icon, comma-separated)",
        initial: "Home:home,Profile:person",
      },
      {
        type: "text",
        name: "targetDir",
        message: "Target directory",
        initial: positional || `./${slugFromName(base.appName)}`,
      },
    ],
    { onCancel }
  );

  return {
    appName: base.appName,
    package: base.package,
    iosBundleId: base.package,
    region: base.region,
    themePrefix: pascalFromName(base.appName),
    platforms: { android: true, ios: base.ios },
    firebase: { enabled: base.firebase, auth, firestore, storage, functions, fcm },
    room: extras.room,
    appium: extras.appium,
    tabs: parseTabs(extras.tabs) || [{ label: "Home", icon: "home" }],
    targetDir: extras.targetDir,
  };
}

// --- commands --------------------------------------------------------------

async function runDoctor(flags) {
  const { doctor } = await import("../src/doctor.mjs");
  const result = await doctor({
    assumeYes: flags.yes === true,
    dryRun: flags["dry-run"] === true,
    ios: flagBool(flags, "ios", true),
    installMissing: flags["no-install"] !== true,
  });
  process.exit(result.green ? 0 : 1);
}

async function runScaffold(flags, positional) {
  const { scaffold } = await import("../src/scaffold.mjs");

  const nonInteractive =
    flags.yes === true ||
    typeof flags.name === "string" ||
    typeof flags.package === "string" ||
    !process.stdin.isTTY;

  const config = nonInteractive
    ? buildConfigFromFlags(flags, positional)
    : await interactiveConfig(positional);

  const verify = flagBool(flags, "verify", true);

  try {
    const { verdict } = await scaffold(config, {
      verify,
      dryRunVerify: flags["dry-run-verify"] === true,
      force: flags.force === true,
    });

    if (verify && verdict && !verdict.green) {
      process.stderr.write("\nScaffold produced files but the verify gate did NOT go green.\n");
      process.exit(1);
    }
    process.stdout.write(`\nDone. cd ${config.targetDir}\n`);
    process.exit(0);
  } catch (err) {
    process.stderr.write(`\nError: ${err.message}\n`);
    process.exit(1);
  }
}

// --- entry -----------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const { _: positionals, flags } = parseArgs(argv);
  const command = positionals[0];

  if (flags.help || flags.h || command === "help") {
    printHelp();
    process.exit(0);
  }

  if (command === "doctor") {
    await runDoctor(flags);
    return;
  }

  // Default command is scaffold; first positional (if not a subcommand) is target dir.
  await runScaffold(flags, positionals[0]);
}

function printHelp() {
  process.stdout.write(
    `create-cmp — scaffold a Kotlin/Compose Multiplatform app (Android + iOS)\n\n` +
      `Usage:\n` +
      `  npx create-cmp [target-dir] [flags]   scaffold (default)\n` +
      `  npx create-cmp doctor [flags]         toolchain doctor → bootstrap → verify\n\n` +
      `Common flags:\n` +
      `  --name --package --bundle-id --region --theme-prefix\n` +
      `  --ios/--no-ios  --firebase/--no-firebase  --auth <email|phone|both|none>\n` +
      `  --room/--no-room  --appium/--no-appium  --tabs Home:home,Profile:person\n` +
      `  --target-dir  --verify/--no-verify  --yes  --force  --dry-run-verify\n\n` +
      `Doctor flags: --yes  --dry-run  --no-ios  --no-install\n`
  );
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err && err.stack ? err.stack : err}\n`);
  process.exit(1);
});
