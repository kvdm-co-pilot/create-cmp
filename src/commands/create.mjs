// `create-cmp create` (the DEFAULT command) — scaffold a new project.
// Moved verbatim from bin/create-cmp.mjs when the bin became a thin
// dispatcher; behavior and flags are unchanged.

import { flagBool } from "../lib/args.mjs";

// --- name helpers ------------------------------------------------------------

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
    inspector: flagBool(flags, "inspector", true),
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
        type: "confirm",
        name: "inspector",
        message: "Live on-device inspector (debug builds only)?",
        initial: true,
      },
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
    inspector: extras.inspector,
    tabs: parseTabs(extras.tabs) || [{ label: "Home", icon: "home" }],
    targetDir: extras.targetDir,
  };
}

// --- command ----------------------------------------------------------------

/**
 * Run the scaffold (default) command.
 * @param {Record<string,string|boolean>} flags
 * @param {string|undefined} positional first non-subcommand positional (target dir)
 */
export async function runCreate(flags, positional) {
  const { scaffold } = await import("../scaffold.mjs");

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
