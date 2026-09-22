// A THREE-AND-A-HALF-MINUTE EMULATOR RUN FOR AN APP THAT DID NOT MOVE.
//
// The device tier proves one thing: that the app this tree STAMPS runs on a
// phone. It was scheduled by INPUT paths — `deriveTierNeed` over
// `DEVICE_TIER_IRRELEVANT` to oblige it, `deviceTreeHash` over
// `DEVICE_TIER_TRIGGERS` to reopen it — and paths are a proxy for that
// question, wrong in both directions:
//
//   - a slice that touches only `src/lib/args.mjs` or `src/commands/doctor.mjs`
//     owes a run, although the app those files help stamp is byte-identical;
//   - an edit under `packages/harness/src/` that has not been synced into
//     `template/qa/` REOPENS a discharged slice over an app that did not move.
//
// Karel, 2026-09-22: "it's a template; it does not need to rerun after every
// change; if we are running it again without code changes to the template then
// something is wrong."
//
// So this file drives `scripts/proof-plan.mjs` AS A PROGRAM, in a temp copy of
// this repository, against a PASS record — the way an agent meets it at the
// moment of decision. No network, no device, no emulator: every question here
// is answered by stamping an app into a temp dir, which costs ~0.35s.
//
// Each case asserts the PREMISE and then the VERDICT, in that order, because a
// verdict about an app that moved when nobody expected it to would otherwise
// read as a passing test.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { stampedOutput } from "../scripts/stamped-output.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BRANCH = "slice/under-test";

/** Everything `bin/create-cmp.mjs` and `scripts/proof-plan.mjs` read. Not `test/`: nothing here runs this repo's suite. */
const COPIED = ["bin", "src", "template", "packages", "scripts", "options.schema.json", "package.json"];

/**
 * A copy of this repository with a declared slice, a PASS device record, and
 * `origin/main` at the commit that opened it — the state a slice is in when it
 * has run the fleet check and is still working.
 */
function repoCopy() {
  // realpath, because os.tmpdir() is a symlink on macOS (/var → /private/var)
  // and proof-plan.mjs only runs main() when `path.resolve(process.argv[1])`
  // equals its own `fileURLToPath(import.meta.url)` — the resolved spelling.
  // Through the symlink the program is silently a no-op with empty output.
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "stamped-schedule-")));
  for (const entry of COPIED) fs.cpSync(path.join(ROOT, entry), path.join(tmp, entry), { recursive: true });
  const git = (...a) => execFileSync("git", a, { cwd: tmp, stdio: ["ignore", "pipe", "ignore"] });
  git("init", "-q");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  git("add", "-A");
  git("commit", "-qm", "the tree the device run proved");
  // The trunk `changedPaths()` measures against, and a branch to be a slice on.
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  git("switch", "-q", "-c", BRANCH);
  return { dir: tmp, git, dispose: () => fs.rmSync(tmp, { recursive: true, force: true }) };
}

/** The record `fleet-check` writes, and the plan `--discharge` writes from it, for the app this tree stamps right now. */
function proveIt(repo, { at = "2026-09-22T09:00:00.000Z" } = {}) {
  const stamped = stampedOutput(repo.dir);
  const write = (name, body) => {
    fs.mkdirSync(path.join(repo.dir, "qa-artifacts"), { recursive: true });
    fs.writeFileSync(path.join(repo.dir, "qa-artifacts", name), `${JSON.stringify(body, null, 2)}\n`);
  };
  write("fleet-latest.json", {
    schema: "cmp-fleet-check/1",
    ranAt: at,
    verdict: "PASS",
    rung: "L2",
    pack: "cmp",
    requiredLevel: "L2",
    failures: [],
    avd: "Medium_Phone_API_35",
    stampedOutputHash: stamped.hash,
    stampedOutputFiles: stamped.files,
    commit: null,
    treeWasDirty: false,
    laneVerdict: "PASS",
    steps: [{ name: "e2eSmoke", verdict: "PASS", durationMs: 36500 }],
  });
  write("proof-plan.json", {
    schema: "prooflane-proof-plan/1",
    slice: "a slice under test",
    branch: BRANCH,
    openedAt: at,
    base: null,
    declared: { suite: "per-commit", frameworkCheck: "per-commit", device: "at-close", review: "at-close" },
    discharged: { at, stampedHash: stamped.hash, stampedFiles: stamped.files, verdict: "PASS", rung: "L2" },
    reviewDischarged: null,
  });
  return stamped;
}

/** `node scripts/proof-plan.mjs` in that tree, as an agent runs it. */
function planOutput(repo, args = []) {
  const r = spawnSync(process.execPath, [path.join(repo.dir, "scripts", "proof-plan.mjs"), ...args], { cwd: repo.dir, encoding: "utf8" });
  return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/** The `device (fleet L2)` block of that output, verdict line plus its detail. */
function deviceBlock(out) {
  const m = out.match(/\n {2}device \(fleet L2\) +([\s\S]*?)(?=\n {2}review +|$)/);
  assert.ok(m, `no device block in:\n${out}`);
  return m[1];
}

const append = (repo, rel, text) => fs.appendFileSync(path.join(repo.dir, rel), text);

test("A CHANGE THE STAMPED APP NEVER SEES DOES NOT BUY A DEVICE RUN", () => {
  const repo = repoCopy();
  try {
    const proven = proveIt(repo);

    // The engine's own argument parser and its doctor command: code that RUNS
    // during a stamp and whose bytes never land in the app it writes.
    append(repo, "src/lib/args.mjs", "\n// a comment this slice added\n");
    append(repo, "src/commands/doctor.mjs", "\n// and one here\n");

    // THE PREMISE, measured rather than assumed.
    assert.equal(stampedOutput(repo.dir).hash, proven.hash, "the premise of this test is that these edits cannot reach a phone; if the stamped app moved, the verdict below is not the one to assert");

    // THE VERDICT.
    const { out } = planOutput(repo);
    const block = deviceBlock(out);
    assert.match(block, /^DISCHARGED/, `two engine-source edits reopened a discharged device tier. The app they stamp is byte-identical to the one the run at 09:00 proved — this is the 3.5-minute run the schedule exists to buy once.\n${out}`);
    assert.match(block, /byte-identical/, "and the line says what it is deciding on, because the reader has to be able to disbelieve it");
    assert.ok(!/REQUIRED/.test(out), "the word an agent acted on three times in one session stays gone");
  } finally {
    repo.dispose();
  }
});

test("A CHANGE THE STAMPED APP DOES SEE BUYS ONE, AND THE LINE NAMES THE FILE", () => {
  const repo = repoCopy();
  try {
    proveIt(repo);
    append(repo, "template/composeApp/src/commonMain/kotlin/com/example/app/App.kt", "\n// a line that ships\n");

    const { out } = planOutput(repo);
    const block = deviceBlock(out);
    assert.match(block, /^REOPENED/, `a template source file moved after the run and the tier stayed discharged:\n${out}`);
    assert.match(block, /the stamped app moved: 1 file\(s\) differ/, "one file moved, and the count is derived rather than asserted");
    assert.match(block, /first: composeApp\/src\/commonMain\/kotlin\/com\/fleet\/check\/App\.kt/, "and it is named, at its path IN THE APP — a diff of path lists is cheap and is the half a reader can act on");
  } finally {
    repo.dispose();
  }
});

test("THE VERSION CATALOG IS A DEVICE CHANGE — it decides what Gradle resolves on the phone", () => {
  const repo = repoCopy();
  try {
    const proven = proveIt(repo);
    const catalog = path.join(repo.dir, "template", "gradle", "libs.versions.toml");
    fs.writeFileSync(catalog, fs.readFileSync(catalog, "utf8").replace(/^coil = ".*"$/m, 'coil = "3.1.1"'));

    assert.notEqual(stampedOutput(repo.dir).hash, proven.hash, "the premise: the catalog ships into the app");
    const block = deviceBlock(planOutput(repo).out);
    assert.match(block, /^REOPENED/);
    assert.match(block, /first: gradle\/libs\.versions\.toml/);
  } finally {
    repo.dispose();
  }
});

test("src/versions/registry.json is NOT the stamped catalog, and the schedule says so rather than guessing", () => {
  // Checked, not assumed: `src/versions/registry.json` is the ordered set of
  // PROVEN-GREEN version sets that `create-cmp upgrade` and `create-cmp doctor`
  // read. `src/scaffold.mjs` never opens it — the versions a stamped app gets
  // are `template/gradle/libs.versions.toml`, which the test above covers. So
  // editing the registry changes what an UPGRADE would offer, and changes
  // nothing about the app this tree stamps, and the tier is not owed for it.
  // If that ever stops being true this test fails on its premise, in the file
  // that says why it was believed.
  const repo = repoCopy();
  try {
    const proven = proveIt(repo);
    const reg = path.join(repo.dir, "src", "versions", "registry.json");
    const parsed = JSON.parse(fs.readFileSync(reg, "utf8"));
    parsed.sets.at(-1).label = `${parsed.sets.at(-1).label} (edited by a test)`;
    fs.writeFileSync(reg, `${JSON.stringify(parsed, null, 2)}\n`);

    assert.equal(stampedOutput(repo.dir).hash, proven.hash, "the registry does not reach the stamp today — if this fails, the verdict below is the wrong one and the entry in the hand-off is stale");
    assert.match(deviceBlock(planOutput(repo).out), /^DISCHARGED/);
  } finally {
    repo.dispose();
  }
});

test("A RUN THAT NEVER RECORDED THE APP COUNTS AS NO RUN — no hash is fabricated for it", () => {
  const repo = repoCopy();
  try {
    proveIt(repo);
    // The shape of every record and plan written before this criterion existed.
    const strip = (name, keys) => {
      const p = path.join(repo.dir, "qa-artifacts", name);
      const j = JSON.parse(fs.readFileSync(p, "utf8"));
      const target = name === "proof-plan.json" ? j.discharged : j;
      for (const k of keys) delete target[k];
      target.observedHash = "0".repeat(64); // what the old input-path key looked like
      fs.writeFileSync(p, `${JSON.stringify(j, null, 2)}\n`);
    };
    strip("fleet-latest.json", ["stampedOutputHash", "stampedOutputFiles"]);
    strip("proof-plan.json", ["stampedHash", "stampedFiles"]);
    append(repo, "src/lib/args.mjs", "\n// a comment this slice added\n");

    const block = deviceBlock(planOutput(repo).out);
    assert.match(block, /^OWED/, "an unbound record cannot say these bytes were proven, and the honest answer is that the run is owed");
    assert.match(block, /no stampedOutputHash|predates/, `and the reason is stated, so nobody reads it as "the app moved":\n${block}`);

    // And the discharge refuses the same way rather than reading a field whose
    // meaning is a guess — exit 2, "I could not check", not "I checked".
    const d = planOutput(repo, ["--discharge"]);
    assert.equal(d.status, 2, `--discharge on an unbound record: ${d.out}`);
    assert.match(d.out, /stampedOutputHash/);
  } finally {
    repo.dispose();
  }
});

test("a discharge is READ from the record, and a matching record discharges without an emulator", () => {
  // The other half of the economy: once the app is proved, a slice that stamps
  // the same app again discharges from the record it already has — no second
  // run, and no human asserting that one happened.
  const repo = repoCopy();
  try {
    const proven = proveIt(repo);
    const p = path.join(repo.dir, "qa-artifacts", "proof-plan.json");
    const plan = JSON.parse(fs.readFileSync(p, "utf8"));
    plan.discharged = null; // the run happened; the plan has not been told yet
    fs.writeFileSync(p, `${JSON.stringify(plan, null, 2)}\n`);
    append(repo, "src/lib/args.mjs", "\n// a comment this slice added\n");

    assert.match(deviceBlock(planOutput(repo).out), /^OWED/, "before the discharge is read, the plan owes it");
    const d = planOutput(repo, ["--discharge"]);
    assert.equal(d.status, 0, d.out);
    assert.match(deviceBlock(d.out), /^DISCHARGED/);
    assert.equal(JSON.parse(fs.readFileSync(p, "utf8")).discharged.stampedHash, proven.hash, "and what it wrote down is the run's own digest, not the caller's word for it");
  } finally {
    repo.dispose();
  }
});

test("THE RECORD SURVIVES THE COMMIT THAT CARRIES IT — a commit changes no bytes of the app", () => {
  // The property the old input-path hash was built for, and it has to survive
  // the move to the stamped app: the device run happens BEFORE the commit that
  // quotes it, so a record invalidated by committing would read stale the
  // instant it landed — a warning that is always on is one nobody reads.
  const repo = repoCopy();
  try {
    const proven = proveIt(repo);
    append(repo, "src/lib/args.mjs", "\n// a comment this slice added\n");
    repo.git("add", "-A");
    repo.git("commit", "-qm", "the commit that carries the record");

    assert.equal(stampedOutput(repo.dir).hash, proven.hash, "committing changes no bytes of the stamped app");
    assert.match(deviceBlock(planOutput(repo).out), /^DISCHARGED/);
  } finally {
    repo.dispose();
  }
});
