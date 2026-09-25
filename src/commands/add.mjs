// `create-cmp add firebase` — add Firebase to an app create-cmp stamped.
//
//   create-cmp add firebase [target-dir] [--region <r>] [--auth <email|phone|both|none>]
//       [--no-firestore] [--no-storage] [--no-functions] [--no-fcm]
//       [--google-services <path>] [--dry-run] [--no-verify]
//
// Firebase left stamp-time on purpose (docs/proposals/LIBRARIES-IN-SERVICES-OUT.md, Decision 2):
// the default stamp builds with no account and no credential file, and a service is added to an
// app that already builds. The edits themselves are planned and written by src/lib/add-firebase.mjs;
// this file is the door — flags, the printed plan, and the verify lane at the end, which runs by
// default exactly as it does after `create` (`--no-verify` skips it).
//
// ONE SERVICE. `add` names what it adds so the command reads as what it does; Firebase is the only
// service the template has ever carried, and a general "add anything" mechanism waits for the
// second one (the proposal's "Not now").

import fs from "node:fs";
import path from "node:path";

import { flagBool } from "../lib/args.mjs";
import { colors, ok, warn, step } from "../lib/log.mjs";
import {
  AddFirebaseRefusal,
  planAddFirebase,
  applyAddFirebasePlan,
  regenerateArchDoc,
} from "../lib/add-firebase.mjs";
import { runVerify, printVerifyVerdict } from "../lib/verify.mjs";
import { resolveVerifyCommands } from "./verify.mjs";

/** What `create-cmp add` can add. */
export const ADDABLE = ["firebase"];

/**
 * The flags only this door reads — Firebase's own, as opposed to the directory and the verify
 * lane's switches every command shares. Declared HERE because this is where they are read, and
 * the stamp refuses every one of them from this list (`firebaseStampFlags`, src/commands/create.mjs):
 * KNOWN_FLAGS is one set for every command, so a flag this door grows and the stamp does not
 * refuse is ACCEPTED by `create` and thrown away there — `--google-services` was, until this list.
 * `test/a-flag-only-add-firebase-reads-is-accepted-by-the-stamp.test.mjs` derives the same set
 * from this file's reads and fails when a new read is missing here.
 */
export const FIREBASE_VALUE_FLAGS = Object.freeze(["region", "auth", "google-services"]);
export const FIREBASE_SERVICE_FLAGS = Object.freeze(["firestore", "storage", "functions", "fcm"]);

/**
 * @param {Record<string,string|boolean>} flags
 * @param {string|undefined} what the service named after `add`
 * @param {string|undefined} positional the app directory
 */
export async function runAdd(flags, what, positional) {
  if (!ADDABLE.includes(what)) {
    process.stderr.write(
      `create-cmp add: ${what === undefined ? "names nothing to add" : `cannot add ${JSON.stringify(what)}`} — ` +
        `the one service it adds is ${ADDABLE.map((a) => `\`${a}\``).join(", ")}.\n` +
        `  usage: create-cmp add firebase [target-dir] [flags]   (\`create-cmp --help\` lists them). Nothing was written.\n`,
    );
    process.exit(2);
  }

  // A VALUE FLAG GIVEN NO VALUE arrives as `true` (src/lib/args.mjs), and every read below is
  // `typeof … === "string" ? … : undefined` — so a bare flag is no flag, and the step writes the
  // default: `--google-services $GS` with GS unset wrote the MOCK config over the line's "use my
  // real one". The bin refuses `--x=` for every value flag; the bare form only for a destination,
  // because `--set` bare is an answer. None of these has a bare meaning, so the bare form is
  // refused here, by name, before anything is read or written.
  const bare = FIREBASE_VALUE_FLAGS.filter((n) => flags[n] === true);
  if (bare.length) {
    process.stderr.write(
      `create-cmp add firebase: ${bare.map((n) => `--${n}`).join(", ")} ` +
        `${bare.length === 1 ? "needs a value, and was given none" : "need values, and were given none"} ` +
        `(an unset shell variable expands to nothing, quoted or not).\n` +
        `  run \`create-cmp --help\` for what each one takes. Nothing was written.\n`,
    );
    process.exit(2);
  }

  const targetDir =
    (typeof flags["target-dir"] === "string" && flags["target-dir"]) || positional || ".";
  const projectDir = path.resolve(targetDir);
  if (!fs.existsSync(projectDir)) {
    process.stderr.write(`create-cmp add firebase: ${projectDir} does not exist. Nothing was written.\n`);
    process.exit(1);
  }

  const input = {
    region: typeof flags.region === "string" ? flags.region : undefined,
    auth: typeof flags.auth === "string" ? flags.auth : undefined,
    firestore: flagBool(flags, "firestore", undefined),
    storage: flagBool(flags, "storage", undefined),
    functions: flagBool(flags, "functions", undefined),
    fcm: flagBool(flags, "fcm", undefined),
    googleServices: typeof flags["google-services"] === "string" ? flags["google-services"] : undefined,
  };

  let plan;
  try {
    plan = planAddFirebase(projectDir, input);
  } catch (e) {
    if (!(e instanceof AddFirebaseRefusal)) throw e;
    process.stderr.write(`create-cmp add firebase: ${e.message}\n  Nothing was written.\n`);
    process.exit(1);
  }

  const dryRun = flagBool(flags, "dry-run", false);
  process.stdout.write(
    `\n${colors.bold("create-cmp add firebase")}${dryRun ? colors.yellow(" (dry run)") : ""}\n` +
      `  app:     ${colors.cyan(projectDir)}\n` +
      `  GitLive: version set ${plan.setId} (matched on the app's kotlin version)\n` +
      `  region ${plan.options.region} · auth ${plan.options.auth} · firestore ${plan.options.firestore} · ` +
      `storage ${plan.options.storage} · functions ${plan.options.functions} · fcm ${plan.options.fcm}\n` +
      colors.dim(
        `  (auth and the four services are recorded in create-cmp.json for the console work — ` +
          `cmp-firebase-connect enables them there; every GitLive module is wired either way)\n\n`,
      ),
  );
  for (const w of plan.writes) process.stdout.write(`  ${w.created ? "create" : "edit  "} ${w.rel}\n`);
  for (const p of plan.present) process.stdout.write(colors.dim(`  already there: ${p}\n`));

  if (plan.config === "mock") {
    warn(
      `composeApp/google-services.json is a MOCK: it names no Firebase project (demo-mock-not-real) and its ` +
        `API key says it is not one. The app builds and a debug build talks to the local emulator suite; nothing ` +
        `reaches a real project until you replace it — \`create-cmp add firebase --google-services <path>\`, or ` +
        `the cmp-firebase-connect skill.`,
    );
  }
  if (plan.ios) {
    warn(
      `iOS UNPROVEN: iosApp/ exists, so the iOS half was ${dryRun ? "planned" : "applied"} (FirebaseEmulators.kt, the ` +
        `Swift configure call, the Podfile pods${plan.writes.some((w) => w.rel.endsWith("GoogleService-Info.plist")) ? ", a MOCK GoogleService-Info.plist" : ""}). ` +
        `No gate in create-cmp builds it.`,
    );
  }

  if (dryRun) {
    process.stdout.write(`\n${colors.yellow("Dry run")} — nothing written.\n`);
    process.exit(0);
  }
  if (plan.writes.length === 0) {
    ok("Firebase is already added — nothing to write.");
    process.stdout.write(`  Prove the build: ${colors.cyan(`create-cmp verify --target-dir ${targetDir}`)}\n`);
    process.exit(0);
  }

  const written = applyAddFirebasePlan(projectDir, plan);
  ok(`wrote ${written.length} file${written.length === 1 ? "" : "s"}`);

  try {
    const doc = await regenerateArchDoc(projectDir);
    if (doc.wrote) ok(`docs/ARCHITECTURE.md → updated section(s): ${doc.changedSections.join(", ")}`);
    else if (!doc.ok) warn(`docs/ARCHITECTURE.md not regenerated: ${doc.reason}`);
  } catch (e) {
    warn(`docs/ARCHITECTURE.md regeneration failed (the edits stand): ${e?.message ?? e}`);
  }

  if (!flagBool(flags, "verify", true)) {
    warn("Verify skipped (--no-verify): GREEN build is NOT proven.");
    process.exit(0);
  }
  step("Running verify gate (north-star: prove GREEN)…");
  const { verify } = resolveVerifyCommands(projectDir);
  const verdict = await runVerify({
    projectDir,
    manifest: { verify },
    config: { platforms: { ios: plan.ios && flagBool(flags, "ios", true) }, harness: plan.record.harness !== false },
    dryRun: flagBool(flags, "dry-run-verify", false),
  });
  printVerifyVerdict(verdict);
  if (!verdict.green) {
    process.stderr.write("\nFirebase was added, but the verify gate did NOT go green.\n");
    process.exit(1);
  }
  process.exit(0);
}
