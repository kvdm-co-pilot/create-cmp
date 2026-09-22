// WHAT THIS TREE STAMPS, AS BYTES — the thing a device run actually proves.
//
// THE DEFECT THIS EXISTS TO CLOSE. The device tier was scheduled by INPUT
// paths: `deviceTreeHash` hashed `template/` + `packages/harness/src/` +
// `packages/receipts/src/`, and `DEVICE_TIER_IRRELEVANT` declared what could
// not oblige a run. Both are proxies for one question — does the app this tree
// stamps differ from the app the last run proved — and a proxy is wrong in
// both directions. An edit under `packages/harness/src/` that has not been
// synced into `template/qa/` REOPENED the tier over an app that was
// byte-identical; a slice that only touched `src/lib/args.mjs` owed a
// three-and-a-half-minute emulator run for an app it could not change.
//
// Karel, 2026-09-22: "it's a template; it does not need to rerun after every
// change; if we are running it again without code changes to the template then
// something is wrong."
//
// SO THE QUESTION IS ASKED DIRECTLY. `create-cmp` is deterministic by design —
// package.json says so — so the app is a pure function of the tree, and the
// honest key for a device run is a hash of that app rather than of the inputs
// that produce it. It costs one stamp into a temp dir, which is ~0.3s and
// touches no device, no network and no phone; the run it schedules costs 3.5
// minutes and an emulator.
//
// THE STAMP IS NOT QUITE PURE, AND THE ONE IMPURITY IS NAMED RATHER THAN
// HOPED AWAY: `create-cmp.json` carries `stampedAt`, the wall clock at stamp
// time. It is normalised below, with the reason, and
// `test/two-stamps-of-one-tree-are-not-the-same-app.test.mjs` asserts that two
// raw stamps really do differ there — so the normalisation cannot be deleted
// by a later reader who takes it for decoration. Nothing else moved between
// two stamps of one tree (measured 2026-09-22, 242 files, `diff -r`): no
// absolute paths, no random ids, no second clock.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The scratch app `scripts/fleet-check.mjs` stamps and runs a lane inside —
 * ONE spelling of it, because the tier's whole criterion is that the app
 * hashed here is the app the device run proved. Two flag lists that agree
 * today and drift tomorrow would have the record and the oracle describing
 * different apps while both looked right: the shape of the defect where
 * `fleet-check` recorded one hash, `proof-plan` compared a second and the
 * publish gate computed a third.
 *
 * `--no-verify` because the lane run is fleet-check's own next step, under its
 * own assertions; a stamp that verified itself here would cost minutes of
 * Gradle for a hash.
 */
export const FLEET_SCRATCH_APP = Object.freeze({
  name: "FleetCheck",
  package: "com.fleet.check",
  flags: Object.freeze(["--yes", "--name", "FleetCheck", "--package", "com.fleet.check", "--no-ios", "--no-firebase", "--no-verify"]),
});

/**
 * What the stamp is allowed to cost before it is killed.
 *
 * This is not a performance nicety. `obligation()` calls this, and
 * `obligation()` runs inside the PreToolUse hook that `.claude/settings.json`
 * kills at 10s — past which the decision the hook is holding is never
 * delivered, and a PreToolUse decision that is never delivered is a PERMITTED
 * command, not a refusal. Measured 2026-09-22 on this tree: 0.27 / 0.26 / 0.30s
 * with output discarded. This is ~10x the slowest of those, and it is a term of
 * the hook's `ANSWER_RESERVE_MS` arithmetic (scripts/hooks/proof-gate.mjs),
 * which a test sums against the declared budget.
 */
export const STAMP_CAP_MS = 3000;

/** The argv that stamps the fleet scratch app from `root` into `appDir`. */
export function stampArgv(root, appDir) {
  return [path.join(root, "bin", "create-cmp.mjs"), appDir, ...FLEET_SCRATCH_APP.flags];
}

/**
 * THE ONE NON-DETERMINISTIC FIELD, normalised before hashing.
 *
 * `stampedAt` is the wall clock at stamp time (src/scaffold.mjs,
 * `writeSpecOfRecord`). Hashing it would make every stamp a different app, the
 * comparison below could never be equal, and the device tier would be OWED
 * forever — which is the 3.5-minute run this schedule exists to buy once.
 *
 * Applied to CONTENT, by path, and to nothing else: a normaliser that dropped a
 * field carrying real information would be a hash that cannot see a change to
 * the stamped app, which is the failure direction that matters.
 */
const NORMALISED_INSTANT = "1970-01-01T00:00:00.000Z";
const NORMALISERS = Object.freeze({
  "create-cmp.json": (buf) => Buffer.from(buf.toString("utf8").replace(/("stampedAt"\s*:\s*")[^"]*(")/, `$1${NORMALISED_INSTANT}$2`)),
});

/**
 * Every file of a stamped app, as relative POSIX path → content digest.
 *
 * NOTHING IS EXCLUDED. A stamped app has no build output, no `.git` and no
 * lane evidence — it has only what `create-cmp` wrote — and an exclusion list
 * here would be the same proxy this file replaces, one layer down. Dotfiles are
 * WALKED, unlike `observed-tree.mjs`'s walker: `.githooks/pre-push`,
 * `.github/workflows/` and `.gitignore` are shipped bytes of the app.
 *
 * The EXECUTABLE BIT rides on the value. A `gradlew` that arrives without it is
 * a broken app, and a digest that could not see the difference would call two
 * trees identical when one of them cannot build. A symlink is recorded as its
 * TARGET rather than followed, so a link that points somewhere else is a
 * change (and a dangling one is not a crash).
 *
 * @param {string} appDir a stamped app's root
 * @returns {{hash: string, files: Record<string, string>}}
 */
export function hashStampedTree(appDir) {
  const files = {};
  const sha = (b) => createHash("sha256").update(b).digest("hex");
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(appDir, abs).split(path.sep).join("/");
      if (e.isDirectory()) walk(abs);
      else if (e.isSymbolicLink()) files[rel] = `l${sha(Buffer.from(fs.readlinkSync(abs)))}`;
      else if (e.isFile()) {
        const raw = fs.readFileSync(abs);
        const content = NORMALISERS[rel] ? NORMALISERS[rel](raw) : raw;
        files[rel] = `${fs.lstatSync(abs).mode & 0o111 ? "x" : "-"}${sha(content)}`;
      }
    }
  };
  walk(appDir);
  const rows = Object.keys(files)
    .sort()
    .map((rel) => `${rel}\n${files[rel]}`);
  return { hash: sha(Buffer.from(rows.join("\n"), "utf8")), files };
}

/**
 * Stamp the fleet scratch app from `root` into a temp dir, and hand back the
 * directory with the means to delete it. Exported for the test that has to see
 * two RAW stamps side by side; everything else wants `stampedOutput`.
 *
 * Never inside the repository: a stamp that wrote into the tree would change
 * the tree it is measuring. stdout is discarded (the stamp narrates ~40 lines,
 * and piping them to a terminal costs four times the stamp itself); stderr is
 * kept, because it is the only thing that can say why a failure happened.
 */
export function stampScratchApp(root = REPO_ROOT, { timeoutMs = STAMP_CAP_MS } = {}) {
  const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-stamped-output-"));
  const appDir = path.join(scratchRoot, FLEET_SCRATCH_APP.name);
  const dispose = () => fs.rmSync(scratchRoot, { recursive: true, force: true });
  const r = spawnSync(process.execPath, stampArgv(root, appDir), {
    cwd: root,
    stdio: ["ignore", "ignore", "pipe"],
    encoding: "utf8",
    timeout: timeoutMs,
    killSignal: "SIGKILL",
  });
  if (r.status !== 0 || !fs.existsSync(path.join(appDir, "create-cmp.json"))) {
    dispose();
    const why = r.error?.code === "ETIMEDOUT" ? `it did not finish inside ${timeoutMs}ms and was killed` : `it exited ${r.status ?? r.signal}`;
    throw new Error(`the scratch stamp did not produce an app — ${why}: ${(r.stderr ?? "").trim().split("\n").slice(-3).join(" / ") || "no stderr"}`);
  }
  return { scratchRoot, appDir, dispose };
}

/**
 * The app this tree stamps: its digest, its file manifest, and what asking
 * cost. The temp dir is gone by the time this returns, on both paths.
 *
 * @param {string} root repo root
 * @returns {{hash: string, files: Record<string, string>, ms: number}}
 */
export function stampedOutput(root = REPO_ROOT, opts = {}) {
  const startedMs = Date.now();
  const app = stampScratchApp(root, opts);
  try {
    const { hash, files } = hashStampedTree(app.appDir);
    return { hash, files, ms: Date.now() - startedMs };
  } finally {
    app.dispose();
  }
}

/** Just the digest, for the readers that only compare. */
export function stampedOutputHash(root = REPO_ROOT, opts = {}) {
  return stampedOutput(root, opts).hash;
}

/**
 * How two manifests differ, as paths — cheap, and the half of a refusal a
 * reader can act on. "The stamped app moved" is a verdict; "1 file(s) differ,
 * first: composeApp/src/commonMain/.../App.kt" is a place to look.
 *
 * `first` is the first path in sorted order across all three kinds, so the
 * sentence is stable between two runs over the same pair of trees.
 *
 * @param {Record<string,string>} proven the manifest the device run recorded
 * @param {Record<string,string>} now the manifest of the app this tree stamps
 */
export function diffManifests(proven = {}, now = {}) {
  const added = Object.keys(now).filter((p) => !(p in proven));
  const removed = Object.keys(proven).filter((p) => !(p in now));
  const changed = Object.keys(now).filter((p) => p in proven && proven[p] !== now[p]);
  const all = [...added, ...removed, ...changed].sort();
  return { added: added.sort(), removed: removed.sort(), changed: changed.sort(), count: all.length, first: all[0] ?? null };
}

/**
 * The sentence proof-plan and the gates print about a moved app. One spelling,
 * because the wording is what a reader acts on and two of them drift.
 *
 * An empty `proven` manifest is the record that carried only a digest: it can
 * say THAT the app moved and not WHICH files, and it says exactly that rather
 * than reporting "0 file(s) differ" over bytes that plainly differ.
 */
export function describeStampedDiff(proven, now) {
  if (!proven || !Object.keys(proven).length) return "the stamped app moved: the run recorded no file list, so nothing here can say which files";
  const d = diffManifests(proven, now);
  if (!d.count) return "the stamped app moved: the digests differ but no file does — the manifest and the digest disagree, which is a defect in whichever produced them";
  return `the stamped app moved: ${d.count} file(s) differ, first: ${d.first}`;
}
