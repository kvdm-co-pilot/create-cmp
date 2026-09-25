// `create-cmp create` (the DEFAULT command) — scaffold a new project.
// Moved verbatim from bin/create-cmp.mjs when the bin became a thin
// dispatcher. Since then one thing left it: Firebase, which is added to a
// stamped app by `create-cmp add firebase` (see firebaseStampFlags below).

import { flagBool } from "../lib/args.mjs";
import { FIREBASE_VALUE_FLAGS, FIREBASE_SERVICE_FLAGS } from "./add.mjs";

// --- deprecated-flag compat -------------------------------------------------

/**
 * Tri-state boolean flag with a deprecated alias: prefers `name`/`no-name`;
 * if that's absent but the alias is present, uses it and prints a one-line
 * deprecation warning. `--appium/--no-appium` was renamed to `--e2e/--no-e2e`
 * in 0.3.0 (ADR-0002) — this keeps the old flag working.
 */
function flagBoolWithAlias(flags, name, aliasName, dflt) {
  const primarySet = flags[name] !== undefined || flags[`no-${name}`] !== undefined;
  if (primarySet) return flagBool(flags, name, dflt);

  const aliasSet = flags[aliasName] !== undefined || flags[`no-${aliasName}`] !== undefined;
  if (aliasSet) {
    process.stderr.write(
      `Warning: --${aliasName}/--no-${aliasName} is deprecated; use --${name}/--no-${name} instead.\n`
    );
    return flagBool(flags, aliasName, dflt);
  }

  return dflt;
}

// --- Firebase left stamp-time ------------------------------------------------

/**
 * The stamp-time spellings of Firebase on this line, split by what each one said.
 *
 * Firebase is a service, and the default stamp takes no service (docs/proposals/
 * LIBRARIES-IN-SERVICES-OUT.md, Decision 2), so a flag that ASKS for it is refused
 * at once — no deprecation release, the owner's call of 2026-09-24 — and the
 * refusal names the door it moved to. A flag that DECLINES it asks for what the
 * stamp already is, so it is honoured with a one-line note rather than turned
 * into an error in every script that spelled the old default out.
 *
 * All of them stay declared (args.mjs): an unknown `--firebase` would eat the
 * directory after it, which is KD-7's harm under a new name.
 *
 * THE LIST IS `add firebase`'s OWN (FIREBASE_VALUE_FLAGS, FIREBASE_SERVICE_FLAGS in
 * src/commands/add.mjs), plus `--firebase` itself. It was hand-written here once, and
 * `--google-services` — which only that door reads — stamped an app with no Firebase
 * and threw the named config away without a word.
 * @returns {{requested: string[], declined: string[]}}
 */
export function firebaseStampFlags(flags) {
  const said = ["firebase", ...FIREBASE_SERVICE_FLAGS].map((n) => [n, flagBool(flags, n, undefined)]);
  const requested = said.filter(([, v]) => v === true).map(([n]) => `--${n}`);
  const declined = said.filter(([, v]) => v === false).map(([n]) => `--no-${n}`);
  for (const n of FIREBASE_VALUE_FLAGS) {
    if (flags[n] !== undefined) {
      // `--auth none` asks for no Firebase Auth, which a stamp with no Firebase already is.
      if (n === "auth" && flags[n] === "none") declined.push("--auth none");
      else requested.push(`--${n}`);
    }
    if (flags[`no-${n}`] !== undefined) declined.push(`--no-${n}`);
  }
  return { requested, declined };
}

// --- presets -----------------------------------------------------------------

/**
 * The app shapes a stamp can take, each a NAME for values of toggles that already
 * exist (docs/proposals/LIBRARIES-IN-SERVICES-OUT.md, Decision 3). A preset adds no
 * template branch and never reaches a library that has no toggle — Ktor, Koin and
 * Navigation are in both. All it moves is a toggle's DEFAULT, so a flag the line
 * states still wins: `--preset lean --room` keeps Room.
 *
 * `lean` turns Room off, and nothing else. Room is the lever: it brings KSP, which
 * is most of the first build and the Kotlin↔KSP lockstep `doctor` polices. The
 * harness is full in both (the owner's call, 2026-09-24), and the inspector, the
 * dev client, the preview loop and E2E are what an agent should notice, so they
 * stay on. The harness MODE is a different axis with its own flag, `--minimal`,
 * which is why this one is not called that.
 *
 * What a preset resolved to is recorded the way every option is — `create-cmp.json`
 * says `"room": false` — so `upgrade` and `harden` rebuild the same shape from the
 * record, with no preset name for them to interpret.
 */
export const PRESETS = Object.freeze({
  full: Object.freeze({}),
  lean: Object.freeze({ room: false }),
});

export const DEFAULT_PRESET = "full";

/**
 * The preset this line asks for, or the sentence that refuses it. Read before
 * anything is asked or written, like the Firebase flags above.
 * @returns {{name: string, defaults: object} | {refusal: string}}
 */
export function resolvePreset(flags) {
  const raw = flags.preset;
  const names = Object.keys(PRESETS).join(", ");
  if (raw === undefined) return { name: DEFAULT_PRESET, defaults: PRESETS[DEFAULT_PRESET] };
  // Bare `--preset` at the end of a line arrives as `true`; an empty value is
  // refused at the bin (`emptyValues`) before this runs.
  if (typeof raw !== "string") return { refusal: `--preset needs a value: one of ${names}.` };
  if (!Object.hasOwn(PRESETS, raw)) return { refusal: `--preset ${raw} is not a preset — the presets are ${names}.` };
  return { name: raw, defaults: PRESETS[raw] };
}

/** A toggle's default under this preset: the preset's value if it names one, else the stamp's. */
function presetDefault(preset, key, dflt) {
  return Object.hasOwn(preset.defaults, key) ? preset.defaults[key] : dflt;
}

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

function buildConfigFromFlags(flags, positional, preset) {
  const name = typeof flags.name === "string" ? flags.name : "MyApp";
  const pkg = typeof flags.package === "string" ? flags.package : `com.${slugFromName(name)}.app`;
  const ios = flagBool(flags, "ios", true);
  const targetDir =
    (typeof flags["target-dir"] === "string" && flags["target-dir"]) ||
    positional ||
    `./${slugFromName(name)}`;

  return {
    appName: name,
    package: pkg,
    iosBundleId: typeof flags["bundle-id"] === "string" ? flags["bundle-id"] : pkg,
    themePrefix:
      typeof flags["theme-prefix"] === "string" ? flags["theme-prefix"] : pascalFromName(name),
    // `--minimal` is the Act 1 door (LADDER §2): same app, tests, previews and
    // advisory hooks, without the verify lane / receipts / governance.
    // `create-cmp harden` installs the subtraction back.
    harness: !flagBool(flags, "minimal", false),
    platforms: { android: true, ios },
    // The preset moves a default; a flag the line states still answers first.
    room: flagBool(flags, "room", presetDefault(preset, "room", true)),
    e2e: flagBoolWithAlias(flags, "e2e", "appium", presetDefault(preset, "e2e", true)),
    inspector: flagBool(flags, "inspector", presetDefault(preset, "inspector", true)),
    devClient: flagBool(flags, "dev-client", presetDefault(preset, "devClient", true)),
    tabs: parseTabs(flags.tabs) || [
      { label: "Home", icon: "home" },
      { label: "Profile", icon: "person" },
    ],
    targetDir,
  };
}

async function interactiveConfig(positional, flags = {}, preset = resolvePreset({})) {
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
    ],
    { onCancel }
  );

  const extras = await prompts(
    [
      {
        type: "confirm",
        name: "harness",
        message: "Verification harness (verify lane, evidence receipts, machine-checked done)?",
        initial: !flagBool(flags, "minimal", false), // --minimal pre-answers the interview question
      },
      // The toggles resolve here exactly as the flag path resolves them — a stated
      // flag, else the preset's default, else on — and pre-answer the question, as
      // `--minimal` does above. So `--preset lean --room` asks with Room already yes.
      {
        type: "confirm",
        name: "room",
        message: "Room local cache?",
        initial: flagBool(flags, "room", presetDefault(preset, "room", true)),
      },
      {
        type: "confirm",
        name: "e2e",
        message: "E2E test harness (Maestro)?",
        initial: flagBoolWithAlias(flags, "e2e", "appium", presetDefault(preset, "e2e", true)),
      },
      {
        type: "confirm",
        name: "inspector",
        message: "Live on-device inspector (debug builds only)?",
        initial: flagBool(flags, "inspector", presetDefault(preset, "inspector", true)),
      },
      {
        type: "confirm",
        name: "devClient",
        message: "Desktop dev-client (JVM window + Compose Hot Reload)?",
        initial: flagBool(flags, "dev-client", presetDefault(preset, "devClient", true)),
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
    themePrefix: pascalFromName(base.appName),
    harness: extras.harness,
    platforms: { android: true, ios: base.ios },
    room: extras.room,
    e2e: extras.e2e,
    inspector: extras.inspector,
    devClient: extras.devClient,
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
  // Before anything is asked or written: a line that asks for Firebase is refused
  // by name, and one that declines it is told it no longer needs to.
  const { requested, declined } = firebaseStampFlags(flags);
  if (requested.length) {
    process.stderr.write(
      `create-cmp: ${requested.join(", ")} — Firebase is not a stamp option any more. Stamp the app without it, ` +
        `then add it with \`create-cmp add firebase <dir>\`, which takes ${FIREBASE_VALUE_FLAGS.map((n) => `--${n}`).join(", ")} ` +
        `and the service flags.\n` +
        `  Nothing was written.\n`
    );
    process.exit(2);
  }
  if (declined.length) {
    process.stderr.write(
      `note: ${declined.join(", ")} ${declined.length === 1 ? "is" : "are"} no longer needed — a stamp carries no Firebase ` +
        `(\`create-cmp add firebase\` adds it later).\n`
    );
  }

  // A preset this command does not have is refused before anything is written, like
  // a Firebase flag: guessing `full` for `--preset tiny` would stamp the shape the
  // line did not ask for and say nothing.
  const preset = resolvePreset(flags);
  if (preset.refusal) {
    process.stderr.write(`create-cmp: ${preset.refusal}\n  Nothing was written.\n`);
    process.exit(2);
  }

  const { scaffold } = await import("../scaffold.mjs");

  const nonInteractive =
    flagBool(flags, "yes", false) ||
    typeof flags.name === "string" ||
    typeof flags.package === "string" ||
    !process.stdin.isTTY;

  const config = nonInteractive
    ? buildConfigFromFlags(flags, positional, preset)
    : await interactiveConfig(positional, flags, preset);

  const verify = flagBool(flags, "verify", true);

  try {
    const { verdict } = await scaffold(config, {
      verify,
      dryRunVerify: flagBool(flags, "dry-run-verify", false),
      force: flagBool(flags, "force", false),
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
