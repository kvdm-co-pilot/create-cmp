// WHAT THIS TREE STAMPS, AS BYTES — the thing an L2 run actually proves.
//
// THE DEFECT THIS EXISTS TO CLOSE. The runtime tier was scheduled by INPUT
// paths: `deviceTreeHash` hashed `template/` + `packages/harness/src/` +
// `packages/receipts/src/`, and `DEVICE_TIER_IRRELEVANT` declared what could
// not oblige a run. Both are proxies for one question — does the app this tree
// stamps differ from the app the last run proved — and a proxy is wrong in
// both directions. An edit under `packages/harness/src/` that has not been
// synced into `template/qa/` REOPENED the tier over an app that was
// byte-identical; a slice that only touched `src/lib/args.mjs` owed a
// three-and-a-half-minute L2 run for an app it could not change.
//
// Karel, 2026-09-22: "it's a template; it does not need to rerun after every
// change; if we are running it again without code changes to the template then
// something is wrong."
//
// SO THE QUESTION IS ASKED DIRECTLY. `create-cmp` is deterministic by design —
// package.json says so — so the app is a pure function of the tree, and the
// honest key for an L2 run is a hash of that app rather than of the inputs
// that produce it. It costs one stamp into a temp dir, which is ~0.3s and
// runs nothing the stamped tree executes; the run it schedules costs 3.5
// minutes.
//
// THE STAMP IS NOT QUITE PURE, AND EVERY IMPURITY IS NAMED RATHER THAN HOPED
// AWAY: `create-cmp.json` carries `stampedAt`, the wall clock at stamp time,
// and the others are listed at NORMALISERS below, each with its reason.
// `test/two-stamps-of-one-tree-are-not-the-same-app.test.mjs` asserts that two
// raw stamps really do differ there — so a normaliser cannot be deleted by a
// later reader who takes it for decoration. Nothing else moved between two
// stamps of one tree (measured 2026-09-22, 242 files, `diff -r`): no absolute
// paths, no random ids, no second clock.
//
// THE DIGEST HAS A RULE NUMBER, because what it covers is a decision and the
// decision moved once (STAMPED_OUTPUT_RULE, below). Rule 1 hashed every byte
// the stamp wrote. Rule 2 (2026-09-24) hashes what the L2 run EXECUTES OR
// READS: on 2026-09-24 a release bump plus one sentence in the stamped
// `AGENTS.md` — four files, none of them code, measured by stamping e21fc3d
// and ddf86b3 side by side — made a PASS run over an identical executing app
// read as "another app", and the tier asked for a fresh L2 run to prove prose
// no program in the run ever opens. Rule 2 still LISTS every file, so an
// added, removed or re-moded file moves it; it stops hashing the CONTENT of
// the two kinds of bytes named at UNOBSERVED_BY_PROFILE and at the version
// normalisers, and nothing else. A record says which rule its digest was taken
// under (`stampedOutputRule`, written by scripts/fleet-check.mjs; absent means
// rule 1), and `node scripts/proof-plan.mjs --rekey` re-derives an older
// record's digest under the current rule from the commit it ran on — never by
// editing the record.
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
  flags: Object.freeze(["--yes", "--name", "FleetCheck", "--package", "com.fleet.check", "--no-ios", "--no-verify"]),
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

/**
 * The cap a stamp gets when its caller names none: `STAMP_CAP_MS`, except
 * under node's test runner.
 *
 * A test that stamps to learn a digest or a state is making a claim about
 * BYTES, not about speed. At `STAMP_CAP_MS` a busy machine kills that stamp
 * and the test fails on the clock, not on the code: `npm publish`'s
 * `prepublishOnly` runs the whole suite, several files stamp at once, and one
 * stamp plus its `add firebase` outran 3000ms there (reproduced 2026-09-26:
 * 13 of 112 cases red under 96 CPU burners, green idle). So under the runner
 * (`NODE_TEST_CONTEXT`, which it sets in every file it spawns and which the
 * CLIs those files run inherit) the default is `TEST_STAMP_CAP_MS` — still a
 * bound, so a stamp that hangs or shells out to Gradle still fails a test.
 * The tests that are ABOUT the cap pass `timeoutMs` and inject `now`, so they
 * do not depend on the machine either. The hook never runs under the test
 * runner, and nothing here moves what it enforces.
 */
export const TEST_STAMP_CAP_MS = 60_000;

/** @param {NodeJS.ProcessEnv} [env] */
export function defaultStampCapMs(env = process.env) {
  return env.NODE_TEST_CONTEXT ? TEST_STAMP_CAP_MS : STAMP_CAP_MS;
}

/** The argv that stamps the fleet scratch app from `root` into `appDir`. */
export function stampArgv(root, appDir) {
  return [path.join(root, "bin", "create-cmp.mjs"), appDir, ...FLEET_SCRATCH_APP.flags];
}

/**
 * The argv that adds Firebase to the stamped scratch app in `appDir` — ONE
 * spelling of it, for the reason `FLEET_SCRATCH_APP` is one spelling: the
 * Firebase tier's criterion is that the app `stampedApps` hashes is the app the
 * Firebase L2 run proved, and two argv lists that drift apart would have the
 * record and the oracle describing different apps while both looked right.
 *
 * `--no-verify` for the reason the stamp has it: the lane is the run's own next
 * step, and an add that verified itself here would cost minutes for a hash.
 */
export function addFirebaseArgv(root, appDir) {
  return [path.join(root, "bin", "create-cmp.mjs"), "add", "firebase", appDir, "--no-verify"];
}

/**
 * Where the Firebase L2 run leaves its record, relative to the repo root — a
 * file of its own beside `qa-artifacts/fleet-latest.json`, because each record
 * binds exactly one digest and `fleet-latest.json` stays what the publish gate
 * reads.
 */
export const FIREBASE_FLEET_RECORD = "qa-artifacts/fleet-firebase-latest.json";

/**
 * WHICH RULE A DIGEST IS TAKEN UNDER — the one every NEW digest uses.
 *
 * A digest is only comparable with a digest taken under the same rule, so the
 * number travels with it: `fleet-check` writes `stampedOutputRule` beside
 * `stampedOutputHash`, a discharge writes `stampedRule` beside `stampedHash`,
 * and `recordMeetsTier` (scripts/proof-plan.mjs) refuses to compare across a
 * difference rather than calling two rules' digests "another app". A record
 * with no rule field predates the number and was taken under rule 1 — that is
 * a fact about every record written before 2026-09-24, not a default.
 *
 * Raising this is a decision, not a refactor: every PASS record on every
 * laptop reads as `other-rule` the moment it moves, until
 * `node scripts/proof-plan.mjs --rekey` re-derives it (a stamp, no L2 run).
 */
export const STAMPED_OUTPUT_RULE = 2;

/** The rule a record's digest was taken under when the record does not say. */
export const LEGACY_STAMPED_OUTPUT_RULE = 1;

/** Every rule `hashStampedTree` can still compute — rule 1 stays, byte-identical, so an old record can be re-derived. */
export const STAMPED_OUTPUT_RULES = Object.freeze([1, 2]);

/** The rule a fleet record's digest was taken under. Absent → rule 1: the field did not exist before rule 2. */
export function ruleOfRecord(record) {
  return record && Object.hasOwn(record, "stampedOutputRule") ? record.stampedOutputRule : LEGACY_STAMPED_OUTPUT_RULE;
}

/**
 * WHAT THE STAMP WRITES THAT IS NOT A FUNCTION OF THE TREE — named, measured,
 * and normalised before hashing. Each would otherwise make every stamp a
 * different app, so the comparison could never be equal and the runtime tier
 * would be OWED forever: the 3.5-minute run this schedule exists to buy once,
 * bought on every query.
 *
 * 1. `create-cmp.json`'s `stampedAt` — the wall clock at stamp time
 *    (src/scaffold.mjs, `writeSpecOfRecord`).
 * 2. `docs/adr/NNNN-*.md`'s `- **Date:**` line — the day the ADR was SEEDED
 *    (src/lib/adr-seed.mjs, `new Date().toISOString().slice(0, 10)`). Without
 *    this the app a tree stamps changes at midnight UTC with no byte of the
 *    tree moving, and a slice that changed nothing reads REOPENED and is sent
 *    to an L2 run, with a documentation file named as the culprit. The rule
 *    covers every ADR in the app rather than only the seeded ones, because
 *    which ones were seeded is a fact about the config and not about the path —
 *    so the cost is stated plainly: an edit to the Date LINE of an ADR the
 *    template ships is invisible to this digest. Its title, status and body are
 *    not.
 * 3. `local.properties`'s `sdk.dir` — THIS MACHINE'S Android SDK, from
 *    ANDROID_HOME, or ANDROID_SDK_ROOT, or the conventional install path, and
 *    the file is not written at all when none of them exists
 *    (`writeLocalProperties`). Measured 2026-09-22: two stamps of one unchanged
 *    tree hashed differently across a change of ANDROID_HOME. `fleet-check`
 *    runs with the cmp lane's SDK exported and `proof-plan` runs inside a
 *    hook that may have none, so this is not a hypothetical divergence — it is
 *    the likely one. It is a POINTER to a directory on this laptop, not a byte
 *    of the app: Gradle resolves the SDK from the environment when the file is
 *    absent, and every Android project gitignores it.
 *
 * Those three are rule 1, and rule 1 is kept BYTE-IDENTICAL to the digest
 * every record before 2026-09-24 carries, because `--rekey` has to reproduce
 * a record's digest before it may re-derive it.
 *
 * RULE 2 ADDS THE STAMP-WRITTEN RELEASE NUMBERS (4–6, VERSION_NORMALISERS) —
 * not because they are impure (they are a function of the tree) but because
 * they are LABELS on bytes the digest already covers, and a release bump with
 * no other change made a PASS run over an identical executing app read as
 * another app (e21fc3d → ddf86b3). Each is normalised ONLY when its JSON is in
 * the exact form the stamp writes — `JSON.stringify(x, null, 2) + "\n"`, byte
 * for byte — because then re-serialising after replacing one field loses
 * nothing else; any other form keeps its raw bytes, so the digest MOVES. That
 * is the safe direction: an unrecognised form costs a run, never hides one.
 *
 * Applied to CONTENT, by path, and to nothing else. A normaliser that dropped a
 * field carrying real information would be a hash that cannot see a change to
 * the stamped app, which is the failure direction that matters — so the files
 * stay IN the manifest carrying a value that says what they are, rather than
 * being excluded and silently unwatched.
 */
const NORMALISED_INSTANT = "1970-01-01T00:00:00.000Z";
const NORMALISED_DAY = "1970-01-01";
const NORMALISED_VERSION = "0.0.0-normalised-by-stamped-output";
const NORMALISED_LOCK_HASH = "verified-against-the-stamped-bytes-then-normalised";
const MACHINE_POINTER = Buffer.from("# normalised by scripts/stamped-output.mjs: a pointer to this machine's Android SDK, not a byte of the app\n", "utf8");
const STAMPED_AT = {
  match: (rel) => rel === "create-cmp.json",
  apply: (buf) => Buffer.from(buf.toString("utf8").replace(/("stampedAt"\s*:\s*")[^"]*(")/, `$1${NORMALISED_INSTANT}$2`)),
};
const ADR_DATE = {
  match: (rel) => /^docs\/adr\/\d{4}-.*\.md$/.test(rel),
  apply: (buf) => Buffer.from(buf.toString("utf8").replace(/^(- \*\*Date:\*\* ).*$/m, `$1${NORMALISED_DAY}`)),
};
const SDK_POINTER = { match: (rel) => rel === "local.properties", apply: () => MACHINE_POINTER };

/**
 * The JSON as the stamp writes it, or null when these bytes are in any other
 * form. Compared as BYTES, not as decoded text: a file with an invalid UTF-8
 * sequence decodes to U+FFFD on both sides of a string comparison and would
 * pass one, while its bytes do not round-trip.
 */
function canonicalJson(buf) {
  let value;
  try {
    value = JSON.parse(buf.toString("utf8"));
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8").equals(buf) ? value : null;
}
const reserialise = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");

const sha256 = (b) => createHash("sha256").update(b).digest("hex");

/**
 * 4–6: THE RELEASE NUMBERS THE STAMP WRITES, and the one file that hashes one.
 *
 * 4. `create-cmp.json`'s `engineVersion` — which create-cmp release stamped
 *    the app (src/scaffold.mjs, `writeSpecOfRecord`). Nothing the L2 run
 *    executes branches on it; `stampedAt` (1) is normalised in the same pass.
 *    When the file is NOT in the stamp's form, rule 1's `stampedAt` regex is
 *    applied and `engineVersion` keeps its raw bytes — the clock must still not
 *    make every stamp a new app, and an unrecognised form must still move.
 * 5. `qa/harness-source.json`'s `version` — which harness release was vendored.
 *    The lane PRINTS it (template/qa/verify.mjs:682 reads it as provenance into
 *    the receipt); no verdict reads it.
 * 6. `qa/harness.lock.json` — its `version` (a label, as 5), its per-file
 *    hashes and its top-level `sha256`. The lane DOES read this file: the
 *    harness-lock step compares the vendored region against it and FAILs on a
 *    mismatch (template/qa/lib/profiles/cmp/steps-cmp.mjs:352,
 *    template/qa/lib/harness-lock.mjs). So its hashes are normalised only when
 *    they are TRUE here and now: every per-file hash equals the sha256 of that
 *    stamped file's raw bytes, and the top-level hash equals a recomputation —
 *    `rel\0hash\n` over the sorted keys, written out below from
 *    packages/harness/src/lib/harness-region.mjs:252-269, never imported, so a
 *    change there cannot quietly change what this accepts. Then the lane's
 *    comparison is decided by the files themselves, whose own bytes are in this
 *    manifest, and the lock's hashes carry nothing more. If EITHER check fails
 *    the whole lock keeps its raw bytes: a lock that lies is a lane that FAILs,
 *    and that has to move the digest. The key set and `fileCount` are kept, so
 *    a lock that names a different set of files is a different lock.
 */
const VERSION_NORMALISERS = Object.freeze([
  {
    match: (rel) => rel === "create-cmp.json",
    apply: (buf) => {
      const v = canonicalJson(buf);
      if (!v) return STAMPED_AT.apply(buf);
      if (Object.hasOwn(v, "stampedAt")) v.stampedAt = NORMALISED_INSTANT;
      if (typeof v.engineVersion === "string") v.engineVersion = NORMALISED_VERSION;
      return reserialise(v);
    },
  },
  {
    match: (rel) => rel === "qa/harness-source.json",
    apply: (buf) => {
      const v = canonicalJson(buf);
      if (!v || typeof v.version !== "string") return buf;
      v.version = NORMALISED_VERSION;
      return reserialise(v);
    },
  },
  {
    match: (rel) => rel === "qa/harness.lock.json",
    apply: (buf, { appDir }) => {
      const v = canonicalJson(buf);
      if (!v || !lockTellsTheTruth(v, appDir)) return buf;
      if (typeof v.version === "string") v.version = NORMALISED_VERSION;
      v.sha256 = NORMALISED_LOCK_HASH;
      for (const rel of Object.keys(v.files)) v.files[rel] = NORMALISED_LOCK_HASH;
      return reserialise(v);
    },
  },
]);

/**
 * Whether a parsed lock describes the stamped bytes beside it — both halves,
 * or it is not normalised at all. A missing file, an unreadable one, a hash
 * that is not a string, or a path that climbs out of the app all answer no.
 */
function lockTellsTheTruth(lock, appDir) {
  const files = lock?.files;
  if (!files || typeof files !== "object" || Array.isArray(files) || typeof lock.sha256 !== "string") return false;
  const rels = Object.keys(files).sort();
  if (!rels.length) return false;
  const digest = createHash("sha256");
  for (const rel of rels) {
    const h = files[rel];
    if (typeof h !== "string") return false;
    const abs = path.resolve(appDir, rel);
    if (!abs.startsWith(`${path.resolve(appDir)}${path.sep}`)) return false;
    let raw;
    try {
      raw = fs.readFileSync(abs);
    } catch {
      return false;
    }
    if (sha256(raw) !== h) return false;
    digest.update(rel, "utf8").update("\0").update(h, "utf8").update("\n");
  }
  return digest.digest("hex") === lock.sha256;
}

/** Each rule's normalisers, in the order they are tried — first match wins, and no path has more than one. */
const NORMALISERS_BY_RULE = Object.freeze({
  1: Object.freeze([STAMPED_AT, ADR_DATE, SDK_POINTER]),
  2: Object.freeze([...VERSION_NORMALISERS, ADR_DATE, SDK_POINTER]),
});

/**
 * WHAT A PROFILE'S L2 RUN NEVER OPENS — held at a placeholder under rule 2,
 * keyed by the stamp's own `qa/harness-manifest.json` `profile.id` (the field
 * the lane itself reads to choose its profile, template/qa/lib/harness-manifest.mjs:83-96).
 * A stamp whose manifest is missing, unreadable, or names a profile not listed
 * here gets the core default: NOTHING is unobserved, every byte is hashed.
 *
 * The files stay IN the manifest with their mode bit, so adding, removing or
 * chmod-ing one moves the digest; only their CONTENT is not hashed. What that
 * costs, said plainly: an instruction an agent reads in these files can change
 * with no L2 run owed. That is the point — no program in the run reads them —
 * and it is why the list is short and each entry carries its proof.
 *
 * THE NOT-READ PROOF FOR `cmp`, measured 2026-09-24 over a stamp of this tree
 * (every non-markdown file, `grep -rn 'AGENTS\|CLAUDE\|\.claude\|SKILL'`):
 *   - the only references outside markdown are PROSE: comments at
 *     template/qa/verify.mjs:12 and :68, template/qa/receipt-check.mjs:8 and
 *     template/qa/scaffold-feature.mjs:207, and a SessionStart hook string in
 *     template/.claude/settings.json that the agent's session runs and the L2
 *     run does not;
 *   - the receipt's inputs surface (template/qa/verified-surface.json:2-10)
 *     names composeApp, specs, qa and the Gradle files — none of these;
 *   - the memoised steps' inputs (template/qa/lib/profiles/cmp/steps-cmp.mjs:1376-1382)
 *     name specs, docs/features, docs/ARCHITECTURE.md, docs/adr, composeApp/src
 *     and qa — none of these;
 *   - the lane's other directory walks start at qa-artifacts, build output,
 *     composeApp and specs, or read mtimes only (template/qa/lib/plan.mjs:316).
 * `README.md` is NOT on the list and must not be: template/qa/verify.mjs:790
 * calls `updateReadmeBadge(ROOT)`, which reads and may rewrite README.md on
 * every lane run (template/qa/lib/evidence-badge.mjs:159). `specs/` and
 * `docs/features/` are read by the lane and stay observed.
 */
const UNOBSERVED_BY_PROFILE = Object.freeze({
  cmp: Object.freeze(["AGENTS.md", "CLAUDE.md", ".claude/**/*.md"]),
});
const UNOBSERVED = Buffer.from("# not read by this profile's L2 run: content held by scripts/stamped-output.mjs (UNOBSERVED_BY_PROFILE); presence and mode still hashed\n", "utf8");

/** `dir/**\/*.ext` or an exact relative path — the only two shapes the list uses. */
function matchesUnobserved(pattern, rel) {
  const m = /^(.+)\/\*\*\/\*(\.[^/*]+)$/.exec(pattern);
  if (m) return rel.startsWith(`${m[1]}/`) && rel.endsWith(m[2]);
  return rel === pattern;
}

/** The stamp's profile id, or null — read the way the lane reads it, and never guessed. */
function profileIdOf(appDir) {
  try {
    const id = JSON.parse(fs.readFileSync(path.join(appDir, "qa", "harness-manifest.json"), "utf8"))?.profile?.id;
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}

/** The unobserved list a stamp's own profile declares — empty for any profile not named, which hashes every byte. */
export function unobservedFor(appDir) {
  const id = profileIdOf(appDir);
  return id && Object.hasOwn(UNOBSERVED_BY_PROFILE, id) ? UNOBSERVED_BY_PROFILE[id] : [];
}

/**
 * Files whose ABSENCE is as machine-dependent as their content, held at their
 * normalised value whether the stamp wrote them or not.
 *
 * `local.properties` is the whole list: a machine with no Android SDK gets no
 * file, a machine with one gets a path, and neither fact is about the app. One
 * entry in the manifest either way, so the digest cannot move with the laptop
 * and the file is never silently missing from the list a reader diffs.
 */
const ALWAYS_PRESENT = Object.freeze(["local.properties"]);

/**
 * Every file of a stamped app, as relative POSIX path → content digest.
 *
 * NOTHING IS EXCLUDED. A stamped app has no build output, no `.git` and no
 * lane evidence — it has only what `create-cmp` wrote — and an exclusion list
 * here would be the same proxy this file replaces, one layer down. Dotfiles are
 * WALKED, unlike `observed-tree.mjs`'s walker: `.githooks/pre-push`,
 * `.github/workflows/` and `.gitignore` are shipped bytes of the app. Under
 * rule 2 an unobserved file is still listed; its value is the placeholder's.
 *
 * The EXECUTABLE BIT rides on the value. A `gradlew` that arrives without it is
 * a broken app, and a digest that could not see the difference would call two
 * trees identical when one of them cannot build. A symlink is recorded as its
 * TARGET rather than followed, so a link that points somewhere else is a
 * change (and a dangling one is not a crash).
 *
 * @param {string} appDir a stamped app's root
 * @param {{rule?: number}} [opts] which rule to hash under — STAMPED_OUTPUT_RULE unless re-deriving an old record
 * @returns {{hash: string, files: Record<string, string>, rule: number}}
 */
export function hashStampedTree(appDir, { rule = STAMPED_OUTPUT_RULE } = {}) {
  if (!STAMPED_OUTPUT_RULES.includes(rule)) throw new Error(`no stamped-output rule ${JSON.stringify(rule)} — this module computes rules ${STAMPED_OUTPUT_RULES.join(", ")}`);
  const normalisers = NORMALISERS_BY_RULE[rule];
  const normaliserFor = (rel) => normalisers.find((n) => n.match(rel)) ?? null;
  const unobserved = rule >= 2 ? unobservedFor(appDir) : [];
  const isUnobserved = (rel) => unobserved.some((p) => matchesUnobserved(p, rel));
  const files = {};
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(appDir, abs).split(path.sep).join("/");
      if (e.isDirectory()) walk(abs);
      else if (e.isSymbolicLink()) files[rel] = `l${sha256(Buffer.from(fs.readlinkSync(abs)))}`;
      else if (e.isFile()) {
        const mode = fs.lstatSync(abs).mode & 0o111 ? "x" : "-";
        if (isUnobserved(rel)) {
          files[rel] = `${mode}${sha256(UNOBSERVED)}`;
          continue;
        }
        const raw = fs.readFileSync(abs);
        const n = normaliserFor(rel);
        const content = n ? n.apply(raw, { appDir }) : raw;
        files[rel] = `${mode}${sha256(content)}`;
      }
    }
  };
  walk(appDir);
  for (const rel of ALWAYS_PRESENT) if (!(rel in files)) files[rel] = `-${sha256(normaliserFor(rel).apply(Buffer.alloc(0), { appDir }))}`;
  const rows = Object.keys(files)
    .sort()
    .map((rel) => `${rel}\n${files[rel]}`);
  return { hash: sha256(Buffer.from(rows.join("\n"), "utf8")), files, rule };
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
export function stampScratchApp(root = REPO_ROOT, { timeoutMs = defaultStampCapMs() } = {}) {
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
 * `rule` is for re-deriving an OLD record (`proof-plan --rekey`); every
 * reader that compares a record with this tree takes the default, which is
 * the rule fleet-check writes.
 *
 * @param {string} root repo root
 * @param {{rule?: number, timeoutMs?: number}} [opts]
 * @returns {{hash: string, files: Record<string, string>, rule: number, ms: number}}
 */
export function stampedOutput(root = REPO_ROOT, { rule = STAMPED_OUTPUT_RULE, ...opts } = {}) {
  const startedMs = Date.now();
  const app = stampScratchApp(root, opts);
  try {
    const { hash, files } = hashStampedTree(app.appDir, { rule });
    return { hash, files, rule, ms: Date.now() - startedMs };
  } finally {
    app.dispose();
  }
}

/** Just the digest, for the readers that only compare. */
export function stampedOutputHash(root = REPO_ROOT, opts = {}) {
  return stampedOutput(root, opts).hash;
}

/**
 * ONE STAMP, TWO DIGESTS: the app this tree stamps, and the same app after
 * `create-cmp add firebase` — the two apps the default and the Firebase L2
 * runs prove, each keyed on its own output bytes.
 *
 * ONE DEADLINE (KD-208). The stamp and the add share `timeoutMs`: the add is
 * given what the stamp and the first hash left of it, never a cap of its own.
 * This runs inside the PreToolUse hook, whose four bounds already sum to
 * exactly the declared budget; `ANSWER_RESERVE_MS` covers one stamp's cap, so
 * a second cap here would be a fifth bound nobody holds to that budget.
 * Measured 2026-09-26: 0.25–0.34s for both digests, ~9x under the cap.
 *
 * A failed, killed or never-started add makes ONLY the Firebase half
 * unanswerable — `{hash: null, files: null, unanswerable}`, the reason naming
 * the cause — which `tierState` (scripts/proof-plan.mjs) reads as OWED, never
 * as discharged. The default half is the digest `stampedOutput()` answers, and
 * a stamp that fails throws exactly as it does there.
 *
 * `spawnAdd` (spawnSync's signature) and `now` exist for the test that has to
 * make the add fail, hang, or find the cap spent without breaking the overlay.
 *
 * @param {string} root repo root
 * @param {{rule?: number, timeoutMs?: number, spawnAdd?: typeof spawnSync, now?: () => number}} [opts]
 * @returns {{default: {hash: string, files: Record<string, string>, rule: number},
 *   firebase: {hash: string, files: Record<string, string>, rule: number} | {hash: null, files: null, unanswerable: string},
 *   ms: number}}
 */
export function stampedApps(root = REPO_ROOT, { rule = STAMPED_OUTPUT_RULE, timeoutMs = defaultStampCapMs(), spawnAdd = spawnSync, now = Date.now } = {}) {
  const startedMs = now();
  const app = stampScratchApp(root, { timeoutMs });
  try {
    const { hash, files } = hashStampedTree(app.appDir, { rule });
    return { default: { hash, files, rule }, firebase: addAndHash(root, app.appDir, { rule, timeoutMs, startedMs, spawnAdd, now }), ms: now() - startedMs };
  } finally {
    app.dispose();
  }
}

function addAndHash(root, appDir, { rule, timeoutMs, startedMs, spawnAdd, now }) {
  const unanswerable = (why) => ({ hash: null, files: null, unanswerable: `the Firebase app could not be stamped — ${why}` });
  const leftMs = timeoutMs - (now() - startedMs);
  // spawnSync reads `timeout: 0` as NO timeout, so a spent cap must not reach it.
  if (!(leftMs > 0)) return unanswerable(`the stamp's ${timeoutMs}ms cap was spent before the add could start`);
  let r;
  try {
    r = spawnAdd(process.execPath, addFirebaseArgv(root, appDir), {
      cwd: root,
      stdio: ["ignore", "ignore", "pipe"],
      encoding: "utf8",
      timeout: leftMs,
      killSignal: "SIGKILL",
    });
  } catch (err) {
    return unanswerable(`the add could not be spawned: ${err?.message ?? String(err)}`);
  }
  const stderr = String(r?.stderr ?? "").trim().split("\n").slice(-3).join(" / ") || "no stderr";
  if (r?.error?.code === "ETIMEDOUT") return unanswerable(`the add did not finish inside ${leftMs}ms of the ${timeoutMs}ms cap it shares with the stamp, and was killed`);
  if (r?.error) return unanswerable(`the add could not be spawned: ${r.error.code ?? r.error.message}`);
  if (r?.status !== 0) return unanswerable(`the add exited ${r?.status ?? r?.signal}: ${stderr}`);
  try {
    const { hash, files } = hashStampedTree(appDir, { rule });
    return { hash, files, rule };
  } catch (err) {
    return unanswerable(`the app the add left could not be hashed: ${err?.message ?? String(err)}`);
  }
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
