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
import { observedTreeHash, DEVICE_TIER_TRIGGERS } from "../scripts/observed-tree.mjs";

test("the device tier is required when the locked region or template moved, and not otherwise", () => {
  assert.equal(deviceTierRequired(["docs/NORTH-STAR.md", "scripts/x.mjs"]).required, false);
  assert.equal(deviceTierRequired(["template/qa/lib/watch.mjs"]).required, true);
  assert.equal(deviceTierRequired(["packages/harness/src/verify.mjs"]).required, true);
  assert.equal(deviceTierRequired(["packages/receipts/src/inputs-hash.mjs"]).required, true);
  // And it names WHY, so the answer can be argued with rather than trusted.
  assert.deepEqual(deviceTierRequired(["template/a", "packages/harness/src/b"]).why, ["template/", "packages/harness/src/"]);
});

test("the gate outputs are read, not retyped", () => {
  assert.deepEqual(parseSuite("ℹ tests 1525\nℹ suites 0\nℹ pass 1525\nℹ fail 0\n"), { tests: 1525, pass: 1525, fail: 0 });
  assert.deepEqual(parseSuite("no summary here"), { tests: null, pass: null, fail: null });
  const fc = parseFrameworkCheck("framework check: PASS — the lane returns, both ways: 7 plants, 2883ms total (bound 10000ms)");
  assert.deepEqual(fc, { verdict: "PASS", plants: 7, ms: 2883 });
  assert.equal(parseFrameworkCheck("framework check: FAIL — planted x").verdict, "FAIL");
});

/** A fleet record on disk, bound to a chosen content digest. */
function recordFor(observedHash, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fit-"));
  const p = path.join(dir, "fleet-latest.json");
  fs.writeFileSync(p, JSON.stringify({
    schema: "cmp-fleet-check/1", verdict: "PASS", rung: "L2", requiredLevel: "L2", failures: [],
    observedHash, commit: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef", treeWasDirty: false, laneVerdict: "PASS",
    steps: [{ name: "e2eSmoke", verdict: "PASS", durationMs: 36500 }, { name: "androidChecks", verdict: "PASS", durationMs: 33700 }],
    ...extra,
  }));
  return { p, dir };
}

test("a record goes stale when the code feeding the tier changes", () => {
  const { p, dir } = recordFor("a".repeat(64));
  try {
    const r = readFleetRecord(p, "b".repeat(64));
    assert.equal(r.present, true);
    assert.equal(r.current, false, "different content must never read as this tree's proof");
    assert.match(r.staleReason, /code feeding the device tier changed/);
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
  // The fleet run happens BEFORE the commit that quotes it, so a commit-keyed
  // record named its own parent and read STALE the instant it landed. A warning
  // that is always on is one nobody reads. Content does not change when a commit
  // is made, so the same bytes stay valid across it — proved by hashing a real
  // tree, committing into it, and hashing again.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "commit-survive-"));
  const git = (...a) => execFileSync("git", a, { cwd: root, stdio: ["ignore", "pipe", "ignore"] });
  try {
    fs.mkdirSync(path.join(root, "template", "qa"), { recursive: true });
    fs.writeFileSync(path.join(root, "template", "qa", "verify.mjs"), "// lane\n");
    git("init", "-q");
    git("config", "user.email", "t@t");
    git("config", "user.name", "t");

    const beforeCommit = observedTreeHash(root, DEVICE_TIER_TRIGGERS);
    git("add", "-A");
    git("commit", "-qm", "the commit that carries the record");
    assert.equal(observedTreeHash(root, DEVICE_TIER_TRIGGERS), beforeCommit, "committing changes no bytes, so the record must stay valid");

    // And it still BITES: one edit under a trigger root invalidates it.
    fs.writeFileSync(path.join(root, "template", "qa", "verify.mjs"), "// lane, changed\n");
    assert.notEqual(observedTreeHash(root, DEVICE_TIER_TRIGGERS), beforeCommit, "a change to code feeding the tier must invalidate the run that predates it");

    // A change OUTSIDE the trigger roots does not — that is the whole point.
    fs.writeFileSync(path.join(root, "template", "qa", "verify.mjs"), "// lane\n");
    fs.mkdirSync(path.join(root, "docs"), { recursive: true });
    fs.writeFileSync(path.join(root, "docs", "notes.md"), "# unrelated\n");
    assert.equal(observedTreeHash(root, DEVICE_TIER_TRIGGERS), beforeCommit, "a docs edit cannot invalidate a device run");
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
    assert.match(r.staleReason, /before the record was content-bound/);
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
