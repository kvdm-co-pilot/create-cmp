// A REFUSAL THAT NAMES THE WRONG CAUSE SENDS THE READER SOMEWHERE ELSE.
//
// `scripts/fleet-check.mjs` writes `stampedOutputHash: null` when hashing the
// app it just stamped THREW — a real run, on this tree, today, whose own digest
// could not be taken. Every reader then refuses it with the sentence written
// for a different record entirely: *"it predates the stamped-app criterion"*.
// That is false about a record written five minutes ago, and it is the kind of
// false that costs time: an agent told a record is OLD re-runs the fleet check
// and gets the same broken stamp, because the thing to fix is the stamp.
//
// Two records, two causes, two sentences:
//
//   the key is ABSENT  — written before the tier was scheduled by the stamped
//                        app. Nothing to fix; run the fleet check.
//   the key is NULL    — this run's stamp failed. Fix the stamp first; the next
//                        run records the same null until you do.
//
// The second half of this file pins the other thing the review round found
// underneath the rung hole: THE LEVEL A TIER REQUIRES IS DECLARED ONCE. The
// command an agent is told to run and the bar its record is held to were two
// spellings of "L2" with nothing tying them together — and a third lived in the
// publish gate as `rung >= 2`. One moves, the others do not, and the gate that
// still says L2 accepts a record the command no longer produces.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { TIERS, recordMeetsTier } from "../scripts/proof-plan.mjs";
import { stampedOutput } from "../scripts/stamped-output.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BRANCH = "slice/under-test";
const COPIED = ["bin", "src", "template", "packages", "scripts", "options.schema.json", "package.json"];

/** A fleet record that is PASS at the tier's own level over `hash`, minus whatever the case removes. */
const recordFor = (hash, over = {}) => ({
  schema: "cmp-fleet-check/1",
  ranAt: "2026-09-22T09:00:00.000Z",
  verdict: "PASS",
  rung: TIERS.device.requires,
  pack: "cmp",
  requiredLevel: TIERS.device.requires,
  failures: [],
  avd: "Medium_Phone_API_35",
  stampedOutputHash: hash,
  stampedOutputFiles: {},
  commit: null,
  treeWasDirty: false,
  laneVerdict: "PASS",
  steps: [],
  ...over,
});

test("THE LEVEL THE DEVICE TIER REQUIRES IS DECLARED ONCE — the command and the bar cannot drift apart", () => {
  const inCommand = /--min-level\s+(L\d)/.exec(TIERS.device.cmd)?.[1];
  assert.ok(inCommand, `the device tier's command names no --min-level, so an agent running it cannot produce a record at the bar: ${TIERS.device.cmd}`);
  assert.equal(
    TIERS.device.requires,
    inCommand,
    "the rung the tier holds a record to and the rung the command it prints would produce are different numbers. Whichever is edited next, the other stays — and a record that satisfies one reader is refused by the other.",
  );
});

test("a record whose own stamp FAILED is refused for that, not for being old", () => {
  const failed = recordMeetsTier(recordFor(null, { stampedOutputError: "the scratch stamp did not produce an app — it exited 1" }), TIERS.device, "a".repeat(64));
  assert.equal(failed.ok, false);
  assert.match(
    failed.reason,
    /stamp/i,
    `a record whose stamp threw must be refused for the stamp: an agent told this record is old runs the fleet check again and meets the same broken stamp.\n${failed.reason}`,
  );
  assert.doesNotMatch(failed.reason, /predates/, `and must NOT be called old — it was written by this tree's own fleet check:\n${failed.reason}`);
  assert.match(failed.reason, /exited 1/, "the run's own recorded reason is quoted, because it is the only thing that says what broke");

  // The other record, unchanged: absent key, and the sentence that IS true of it.
  const { stampedOutputHash, ...withoutKey } = recordFor("b".repeat(64));
  const old = recordMeetsTier(withoutKey, TIERS.device, "a".repeat(64));
  assert.equal(old.ok, false);
  assert.match(old.reason, /predates/, `a record written before the criterion is still named as such:\n${old.reason}`);
  assert.doesNotMatch(old.reason, /stamp failed|could not be hashed/, "and is not blamed on a stamp that never ran");
});

test("and the program says the same thing: --discharge on a stamp-failed record names the stamp", () => {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "stamp-failed-")));
  try {
    for (const entry of COPIED) fs.cpSync(path.join(ROOT, entry), path.join(tmp, entry), { recursive: true });
    const git = (...a) => execFileSync("git", a, { cwd: tmp, stdio: ["ignore", "pipe", "ignore"] });
    git("init", "-q");
    git("config", "user.email", "t@t");
    git("config", "user.name", "t");
    git("add", "-A");
    git("commit", "-qm", "base");
    git("update-ref", "refs/remotes/origin/main", "HEAD");
    git("switch", "-q", "-c", BRANCH);
    fs.appendFileSync(path.join(tmp, "template/composeApp/src/commonMain/kotlin/com/example/app/App.kt"), "\n// a line that ships\n");

    const write = (name, body) => fs.writeFileSync(path.join(tmp, "qa-artifacts", name), `${JSON.stringify(body, null, 2)}\n`);
    fs.mkdirSync(path.join(tmp, "qa-artifacts"), { recursive: true });
    write("fleet-latest.json", recordFor(null, { stampedOutputError: "the scratch stamp did not produce an app — it exited 1" }));
    write("proof-plan.json", {
      schema: "prooflane-proof-plan/1",
      slice: "a slice that edited the template",
      branch: BRANCH,
      openedAt: "2026-09-22T09:00:00.000Z",
      base: null,
      declared: { suite: "per-commit", frameworkCheck: "per-commit", device: "at-close", review: "at-close" },
      discharged: null,
      reviewDischarged: null,
    });

    const r = spawnSync(process.execPath, [path.join(tmp, "scripts", "proof-plan.mjs"), "--discharge"], { cwd: tmp, encoding: "utf8" });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    assert.equal(r.status, 2, `a discharge that cannot be checked is exit 2 — "I could not check", not "I checked and it failed":\n${out}`);
    assert.match(out, /stamp/i, `the refusal names the stamp:\n${out}`);
    assert.doesNotMatch(out, /predates/, `and does not call a record written by this fleet check old:\n${out}`);
    assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, "qa-artifacts", "proof-plan.json"), "utf8")).discharged, null, "and nothing is written down");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("the record fleet-check writes when its stamp throws carries WHY, so the refusal can quote it", async () => {
  // The reason has to survive into the file: the stderr line the run printed is
  // gone by the time anyone reads the record, and a refusal that cannot say
  // what broke is one the reader has to reproduce to act on.
  const { writeFleetRecord } = await import("../scripts/fleet-check.mjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rec-stamp-failed-"));
  try {
    writeFleetRecord({
      root,
      rung: "L2",
      minLevel: "L2",
      failures: [],
      avd: null,
      startedAt: null,
      receipt: { verdict: "PASS", steps: [] },
      stamped: null,
      stampedError: "the scratch stamp did not produce an app — it exited 1: ENOENT",
    });
    const rec = JSON.parse(fs.readFileSync(path.join(root, "qa-artifacts", "fleet-latest.json"), "utf8"));
    assert.equal(rec.stampedOutputHash, null, "no digest is invented for a stamp that failed");
    assert.match(rec.stampedOutputError, /ENOENT/, "and the record carries why, in its own words");
    assert.match(recordMeetsTier(rec, TIERS.device, "a".repeat(64)).reason, /ENOENT/, "which is what a reader quotes back");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a PASS record at the tier's own level, over these exact bytes, still proves it", () => {
  // The control for THIS file, beside the reviewer's: none of the above may be
  // bought by refusing everything.
  const stamped = stampedOutput(ROOT);
  const m = recordMeetsTier(recordFor(stamped.hash), TIERS.device, stamped.hash);
  assert.equal(m.ok, true, `a PASS run at ${TIERS.device.requires} over the app this tree stamps must still discharge: ${m.reason ?? ""}`);
  assert.equal(m.proof.rung, TIERS.device.requires);
  assert.equal(m.proof.stampedHash, stamped.hash);
});

test("THE FIT TEST IS A READER TOO — its Q6 block may not tick a run below the tier, nor call a broken stamp old", async () => {
  // `scripts/fit-test.mjs` prints NORTH-STAR §10 Q6 — "proof at altitude" —
  // ready to paste into a PR, under a row labelled `fleet L2`. It read the
  // fleet record with its own comparison: digest only. So a `--min-level L1`
  // run over these bytes printed "ran against this exact code ✓" under
  // `fleet L2`, which is the discharge hole in the one surface a reviewer is
  // handed as evidence; and a record whose stamp failed was "written before the
  // record was content-bound", the same wrong sentence as every other reader.
  const { readFleetRecord, render } = await import("../scripts/fit-test.mjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fit-reader-"));
  const H = "e".repeat(64);
  const rowFor = (record) => {
    const p = path.join(dir, "fleet-latest.json");
    fs.writeFileSync(p, JSON.stringify(record));
    const fleet = readFleetRecord(p, H);
    return { fleet, out: render({ suite: null, frameworkCheck: null, device: { required: true, reason: "a template file changed" }, owed: { state: "owed" }, fleet }) };
  };
  try {
    const low = rowFor(recordFor(H, { rung: "L1", requiredLevel: "L1", avd: null }));
    assert.doesNotMatch(low.out, /ran against this exact code ✓/, `a desktop-only run is ticked under "fleet L2" in the block pasted into a PR as proof:\n${low.out}`);
    assert.match(low.out, new RegExp(`requires ${TIERS.device.requires}`), `and the row says why it does not count:\n${low.out}`);

    const broken = rowFor(recordFor(null, { stampedOutputError: "the scratch stamp did not produce an app — it exited 1" }));
    assert.doesNotMatch(broken.fleet.staleReason ?? "", /content-bound|predates/, `a record written by this fleet check, whose stamp failed, is called old:\n${broken.fleet.staleReason}`);
    assert.match(broken.fleet.staleReason ?? "", /stamp/i);

    // The control: a run AT the tier's level over these bytes is still ticked.
    assert.match(rowFor(recordFor(H)).out, /ran against this exact code ✓/, "a proof that carries the tier is still quoted as one");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
