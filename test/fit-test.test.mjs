// The derived half of §10 must be derived, including its own refusals.
//
// The failure this guards is quoting a green device run that was not this
// tree's — the fit test's own version of the stale-receipt problem it exists to
// catch everywhere else.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { deviceTierRequired, parseSuite, parseFrameworkCheck, readFleetRecord, render } from "../scripts/fit-test.mjs";
import { observedTreeHash } from "../scripts/observed-tree.mjs";
import { STAMPED_OUTPUT_RULE } from "../scripts/stamped-output.mjs";

test("the device tier runs unless every changed path is declared unable to affect it", () => {
  // Declared IRRELEVANCE, not relevance. The allowlist shape this replaced could
  // not see `gradle/libs.versions.toml` — outside cmp's declared sourceRoots and
  // absolutely able to change what runs on a device (ADR-0009).
  assert.equal(deviceTierRequired(["docs/NORTH-STAR.md", "scripts/x.mjs", "test/y.test.mjs"]).required, false);
  assert.equal(deviceTierRequired(["README.md"]).required, false, "markdown cannot change what executes on a phone");
  for (const p of ["template/qa/lib/watch.mjs", "packages/harness/src/verify.mjs", "packages/receipts/src/inputs-hash.mjs", "template/gradle/libs.versions.toml", "package.json", "src/scaffold.mjs"]) {
    assert.equal(deviceTierRequired([p]).required, true, `${p} must oblige the device tier`);
  }
  // And it names WHICH paths obliged, so the answer can be argued with.
  assert.deepEqual(deviceTierRequired(["docs/a.md", "template/x"]).obliging, ["template/x"]);
});

test("the gate outputs are read, not retyped", () => {
  assert.deepEqual(parseSuite("ℹ tests 1525\nℹ suites 0\nℹ pass 1525\nℹ fail 0\n"), { tests: 1525, pass: 1525, fail: 0, failing: [] });
  assert.deepEqual(parseSuite("no summary here"), { tests: null, pass: null, fail: null, failing: [] });

  // A failure has to arrive with a NAME. The counts alone are unactionable by
  // the time anyone reads the block — measured on 2026-09-08, when this line
  // said "1647/1648 — 1 FAILING" once and was green on the next two runs, with
  // nothing left to say which test it had been.
  assert.deepEqual(
    parseSuite("✖ a step that broke (12.3ms)\n✖ a step that broke (12.3ms)\nℹ tests 3\nℹ pass 2\nℹ fail 1\n"),
    { tests: 3, pass: 2, fail: 1, failing: ["a step that broke"] },
    "named once, however many times the runner echoes it",
  );
  const fc = parseFrameworkCheck("framework check: PASS — the lane returns, both ways: 7 plants, 2883ms total (bound 10000ms)");
  assert.deepEqual(fc, { verdict: "PASS", plants: 7, ms: 2883 });
  assert.equal(parseFrameworkCheck("framework check: FAIL — planted x").verdict, "FAIL");
});

/** A fleet record on disk, bound to a chosen digest of the app it proved. */
function recordFor(stampedOutputHash, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fit-"));
  const p = path.join(dir, "fleet-latest.json");
  fs.writeFileSync(p, JSON.stringify({
    schema: "cmp-fleet-check/1", verdict: "PASS", rung: "L2", requiredLevel: "L2", failures: [],
    stampedOutputHash, stampedOutputRule: STAMPED_OUTPUT_RULE, commit: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef", treeWasDirty: false, laneVerdict: "PASS",
    steps: [{ name: "e2eSmoke", verdict: "PASS", durationMs: 36500 }, { name: "androidChecks", verdict: "PASS", durationMs: 33700 }],
    ...extra,
  }));
  return { p, dir };
}

test("a record goes stale when the app this tree stamps is not the one it proved", () => {
  const { p, dir } = recordFor("a".repeat(64));
  try {
    const r = readFleetRecord(p, "b".repeat(64));
    assert.equal(r.present, true);
    assert.equal(r.current, false, "different content must never read as this tree's proof");
    // The sentence is `recordMeetsTier`'s — the one reading every fleet-record
    // reader now shares — so what is pinned is the CAUSE it names.
    assert.match(r.staleReason, /describes another app/);
    assert.match(render({ suite: null, frameworkCheck: null, device: { required: true, reason: "x" }, fleet: r }), /STALE/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a record for THIS exact content is quoted, with its device steps", () => {
  const { p, dir } = recordFor("c".repeat(64));
  try {
    const r = readFleetRecord(p, "c".repeat(64));
    assert.equal(r.current, true);
    const out = render({ suite: { tests: 10, pass: 10, fail: 0 }, frameworkCheck: { verdict: "PASS", plants: 7, ms: 100 }, device: { required: true, reason: "x" }, fleet: r });
    assert.match(out, /ran against this exact code/);
    assert.match(out, /e2eSmoke 36\.5s/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("A RECORD SURVIVES THE COMMIT THAT CARRIES IT — the defect commit-keying could not avoid", () => {
  // A run happens BEFORE the commit that quotes it, so a commit-keyed record
  // named its own parent and read STALE the instant it landed. A warning that is
  // always on is one nobody reads. Content does not change when a commit is
  // made, so the same bytes stay valid across it — proved by hashing a real
  // tree, committing into it, and hashing again.
  //
  // THE ROOTS ARE THE TEST'S OWN. `DEVICE_TIER_TRIGGERS` used to be handed in
  // here, and the device tier no longer binds to any path list — it binds to the
  // app the tree stamps, where the same property is asserted by
  // test/a-change-the-stamped-app-never-sees-buys-a-device-run.test.mjs ("THE
  // RECORD SURVIVES THE COMMIT THAT CARRIES IT"). What is left under test in
  // THIS file is `observedTreeHash` itself, which the REVIEW tier still binds
  // to, so the roots are named locally rather than borrowed from a tier.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "commit-survive-"));
  const git = (...a) => execFileSync("git", a, { cwd: root, stdio: ["ignore", "pipe", "ignore"] });
  try {
    fs.mkdirSync(path.join(root, "template", "qa"), { recursive: true });
    fs.writeFileSync(path.join(root, "template", "qa", "verify.mjs"), "// lane\n");
    git("init", "-q");
    git("config", "user.email", "t@t");
    git("config", "user.name", "t");

    const ROOTS = ["template/"];
    const beforeCommit = observedTreeHash(root, ROOTS);
    git("add", "-A");
    git("commit", "-qm", "the commit that carries the record");
    assert.equal(observedTreeHash(root, ROOTS), beforeCommit, "committing changes no bytes, so the record must stay valid");

    // And it still BITES: one edit under a trigger root invalidates it.
    fs.writeFileSync(path.join(root, "template", "qa", "verify.mjs"), "// lane, changed\n");
    assert.notEqual(observedTreeHash(root, ROOTS), beforeCommit, "a change to code feeding the tier must invalidate the run that predates it");

    // A change OUTSIDE the trigger roots does not — that is the whole point.
    fs.writeFileSync(path.join(root, "template", "qa", "verify.mjs"), "// lane\n");
    fs.mkdirSync(path.join(root, "docs"), { recursive: true });
    fs.writeFileSync(path.join(root, "docs", "notes.md"), "# unrelated\n");
    assert.equal(observedTreeHash(root, ROOTS), beforeCommit, "a docs edit cannot invalidate a device run");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a record written before content-binding is named unverifiable, not trusted and not hidden", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-"));
  const p = path.join(dir, "fleet-latest.json");
  try {
    fs.writeFileSync(p, JSON.stringify({ verdict: "PASS", rung: "L2", requiredLevel: "L2", commit: "abc", steps: [] }));
    const r = readFleetRecord(p, "d".repeat(64));
    assert.equal(r.current, false);
    assert.match(r.staleReason, /predates the stamped-app criterion/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a required device run with NO record says so — silence is the failure mode", () => {
  const out = render({ suite: null, frameworkCheck: null, device: { required: true, reason: "1 changed path(s) feed fleet L2" }, fleet: { present: false } });
  assert.match(out, /NO RECORD/);
});

test("a failing suite is stated as failing, never rounded up", () => {
  const out = render({ suite: { tests: 1525, pass: 1520, fail: 5 }, frameworkCheck: null, device: { required: false, reason: "no changed path feeds fleet L2" }, fleet: { present: false } });
  assert.match(out, /5 FAILING/);
});

test("the judgement questions are never answered here", () => {
  const out = render({ suite: null, frameworkCheck: null, device: { required: false, reason: "no changed path feeds fleet L2" }, fleet: { present: false } });
  assert.match(out, /still yours: 1 goal .* 4 stack knowledge .* 5 receipt meaning/);
  for (const q of ["1. Goal", "4. Stack knowledge"]) assert.ok(!out.includes(q), `${q} must not be auto-answered`);
});

// The recorder itself, without a device. Verifying it used to mean booting an
// emulator and running a full L2 lane — twenty minutes to check that a JSON
// file has the right fields, which is the churn this whole feature exists to
// remove. It is a pure function of (receipt, git state); test it as one.
test("the recorder writes reasons for anything that did not pass, where generated output belongs", async () => {
  const { writeFleetRecord } = await import("../scripts/fleet-check.mjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rec-"));
  try {
    writeFleetRecord({
      root,
      rung: null,
      minLevel: "L2",
      failures: ["lane verdict is FAIL, not PASS"],
      avd: "Medium_Phone_API_35",
      receipt: {
        verdict: "FAIL",
        steps: [
          { name: "build", verdict: "PASS", durationMs: 7300 },
          { name: "e2eSmoke", verdict: "ERROR", durationMs: 1156594, reason: "DID NOT COMPLETE — no result within its deadline (5 min).\nsecond line dropped" },
        ],
      },
    });
    const rec = JSON.parse(fs.readFileSync(path.join(root, "qa-artifacts", "fleet-latest.json"), "utf8"));
    assert.equal(rec.verdict, "FAIL", "a record that only exists when green cannot refute anything");
    const e2e = rec.steps.find((s) => s.name === "e2eSmoke");
    assert.match(e2e.reason, /no result within its deadline/, "a FAIL record must say WHY, or it must be reproduced to be read");
    assert.ok(!e2e.reason.includes("second line"), "first line only — the record is an index, not a log");
    assert.equal(rec.steps.find((s) => s.name === "build").reason, undefined, "a passing step needs no reason");
    assert.ok(!fs.existsSync(path.join(root, "qa", "evidence")), "this repo is the engine, not a stamped app — it has no qa/ lane");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// THE FIREBASE L2 RUN HAS ITS OWN ROW, READ FROM THE SCHEDULE. It is its own
// tier with its own digest and its own record (KD-206, scripts/proof-plan.mjs
// TIERS.firebase), so a Q6 block that printed only the default `fleet L2` row
// would paste into a PR as if the default run were the whole of L2. The row is
// `o.firebase` from `obligation()`, printed — never re-derived here — with the
// record's ranAt and verdict wherever there is one.
const Q6 = { suite: null, frameworkCheck: null, device: { required: false, reason: "no changed path feeds fleet L2" }, fleet: { present: false } };
const FB_NEED = { required: true, obliging: ["template/firebase/x.kt"], reason: "1 changed path(s) feed the Firebase L2 run" };
const fbRow = (out) => {
  const lines = out.split("\n");
  const i = lines.findIndex((l) => /^ {3}fleet L2 \+ firebase /.test(l));
  return i < 0 ? null : lines.slice(i, i + 2).join("\n");
};

test("an owed Firebase L2 run is its own Q6 row, saying OWED with the schedule's reason", () => {
  const row = fbRow(render({ ...Q6, owed: { state: "none", firebase: { state: "owed", now: "a".repeat(64), reading: {}, need: FB_NEED } } }));
  assert.ok(row, "Q6 has no `fleet L2 + firebase` row, so the Firebase tier is silent in the block pasted into a PR");
  assert.match(row, /OWED — at slice close, NOT NOW/);
  assert.ok(row.includes(FB_NEED.reason), `the row does not quote o.firebase.need.reason: ${row}`);
});

test("the Firebase row reads discharged, reopened and none from o.firebase, and quotes the record's ranAt and verdict", () => {
  const proof = { at: "2026-09-26T09:15:00.000Z", verdict: "PASS", rung: "L2", from: "qa-artifacts/fleet-firebase-latest.json" };
  const discharged = fbRow(render({ ...Q6, owed: { state: "none", firebase: { state: "discharged", now: "b".repeat(64), proof, need: FB_NEED } } }));
  assert.match(discharged, /DISCHARGED/);
  assert.match(discharged, /PASS/);
  assert.ok(discharged.includes(proof.at), `the discharged row does not say when its run ran: ${discharged}`);

  const onDisk = { ranAt: "2026-09-25T08:00:00.000Z", verdict: "FAIL", rung: "L2", coverage: { firebase: true } };
  const reopened = fbRow(render({ ...Q6, firebaseFleet: onDisk, owed: { state: "none", firebase: { state: "reopened", now: "c".repeat(64), need: FB_NEED } } }));
  assert.match(reopened, /REOPENED/);
  assert.ok(reopened.includes(onDisk.ranAt) && /FAIL/.test(reopened), `the reopened row does not quote the record on disk: ${reopened}`);
  assert.match(reopened, /does not carry/, "a record beside a non-discharged state is said not to carry the tier, never ticked");

  const trunk = fbRow(render({ ...Q6, owed: { state: "none", trunk: true, firebase: { state: "none", trunk: true, need: { required: false, reason: "this tree is trunk" } } } }));
  assert.match(trunk, /not required — this tree is trunk/);

  const unread = fbRow(render(Q6));
  assert.match(unread ?? "", /not read/, "with no schedule handed over, the row says it was not read rather than vanishing");
});
