// A PASS RECORD UNDER THE OLD DIGEST RULE IS RE-DERIVED BY A STAMP, NOT BY AN L2 RUN.
//
// Raising STAMPED_OUTPUT_RULE (scripts/stamped-output.mjs) makes every record
// on every laptop incomparable with the tree beside it: its digest was taken
// under rule 1, and this tree's is taken under rule 2. Calling that "another
// app" would send every slice to a 3.5-minute L2 run to re-prove an app that
// may not have moved. So `recordMeetsTier` answers `other-rule` and names
// `node scripts/proof-plan.mjs --rekey`, which re-stamps the record's commit,
// REPRODUCES the recorded digest under the old rule, and only then writes the
// new rule's digest beside the record — accepted for that one run and no
// other, and never by editing the fleet record.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { recordMeetsTier, rekeyNamesRun, obligation, render, TIERS, REKEY_SCHEMA } from "../scripts/proof-plan.mjs";
import { decide } from "../scripts/hooks/proof-gate.mjs";
import { STAMPED_OUTPUT_RULE } from "../scripts/stamped-output.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NOW = "c".repeat(64);
const OLD = "d".repeat(64);
const COMMIT = "e21fc3d".padEnd(40, "0");

/** A PASS L2 record written before the digest had a rule — no `stampedOutputRule`, so rule 1. */
const oldRecord = (over = {}) => ({
  schema: "cmp-fleet-check/1",
  ranAt: "2026-09-22T19:31:09.998Z",
  verdict: "PASS",
  rung: "L2",
  requiredLevel: "L2",
  stampedOutputHash: OLD,
  stampedOutputFiles: { "AGENTS.md": `-${"1".repeat(64)}` },
  commit: COMMIT,
  treeWasDirty: false,
  ...over,
});
/** The rekey `--rekey` writes for that record, re-derived to `toHash`. */
const rekeyOf = (record, toHash = NOW, over = {}) => ({
  schema: REKEY_SCHEMA,
  ranAt: record.ranAt,
  commit: record.commit,
  fromRule: 1,
  fromHash: record.stampedOutputHash,
  toRule: STAMPED_OUTPUT_RULE,
  toHash,
  toFiles: { "AGENTS.md": `-${"2".repeat(64)}` },
  rekeyedAt: "2026-09-24T12:00:00.000Z",
  ...over,
});

test("a record under another rule is OTHER-RULE, not another app — and the answer names --rekey INSTEAD of the L2 run", () => {
  // Even a record whose old digest happens to equal `now` is not compared: the
  // two numbers were taken by different rules.
  for (const hash of [OLD, NOW]) {
    const m = recordMeetsTier(oldRecord({ stampedOutputHash: hash }), TIERS.device, NOW, { rekey: null });
    assert.equal(m.ok, false);
    assert.equal(m.code, "other-rule", m.reason);
    assert.equal(m.exit, 2, "could not check, not checked-and-failed");
    assert.match(m.reason, /node scripts\/proof-plan\.mjs --rekey` INSTEAD of the L2 run/);
  }
  // Explicit rule 1 reads the same as absent.
  assert.equal(recordMeetsTier(oldRecord({ stampedOutputRule: 1 }), TIERS.device, NOW, { rekey: null }).code, "other-rule");
});

test("a record under THIS rule never reads the rekey at all — it is read lazily, only when the rules differ", () => {
  let reads = 0;
  const m = recordMeetsTier(oldRecord({ stampedOutputHash: NOW, stampedOutputRule: STAMPED_OUTPUT_RULE }), TIERS.device, NOW, {
    rekey: () => {
      reads += 1;
      throw new Error("read when it did not need to be");
    },
  });
  assert.equal(m.ok, true);
  assert.equal(reads, 0);
});

test("a rekey is accepted ONLY for the run it names: same ranAt, commit, starting digest and rules", () => {
  const record = oldRecord();
  const ok = recordMeetsTier(record, TIERS.device, NOW, { rekey: rekeyOf(record) });
  assert.equal(ok.ok, true, ok.reason);
  assert.equal(ok.proof.stampedHash, NOW, "the digest compared is the re-derived one");
  assert.equal(ok.proof.stampedRule, STAMPED_OUTPUT_RULE);
  assert.deepEqual(ok.proof.rekeyedFrom, { rule: 1, hash: OLD, at: "2026-09-24T12:00:00.000Z" }, "and the proof says it was re-derived, from what");
  assert.match(ok.proof.from, /fleet-rekey-latest\.json/);

  const wrong = {
    "another run": { ranAt: "2026-09-21T00:00:00.000Z" },
    "another commit": { commit: "f".repeat(40) },
    "another starting digest": { fromHash: "9".repeat(64) },
    "another starting rule": { fromRule: 2 },
    "another target rule": { toRule: STAMPED_OUTPUT_RULE + 1 },
    "another schema": { schema: "something-else/1" },
    "a target that is not a digest": { toHash: "not-a-digest" },
  };
  for (const [what, over] of Object.entries(wrong)) {
    const rk = rekeyOf(record, NOW, over);
    assert.equal(rekeyNamesRun(rk, record), false, what);
    const m = recordMeetsTier(record, TIERS.device, NOW, { rekey: rk });
    assert.equal(m.code, "other-rule", `a rekey naming ${what} was applied to this record`);
  }
  // A record overwritten by a newer run: the rekey of the old one says nothing about it.
  const newer = oldRecord({ ranAt: "2026-09-25T00:00:00.000Z" });
  assert.match(recordMeetsTier(newer, TIERS.device, NOW, { rekey: rekeyOf(record) }).reason, /names the run at 2026-09-22T19:31:09\.998Z — not this one/);
});

test("a rekeyed record is then held to everything else: another app, a FAIL, a low rung", () => {
  const record = oldRecord();
  const moved = recordMeetsTier(record, TIERS.device, "b".repeat(64), { rekey: rekeyOf(record) });
  assert.equal(moved.code, "other-app");
  assert.deepEqual(moved.files, rekeyOf(record).toFiles, "and the manifest it compared is the re-derived one, so a diff names like with like");
  const failed = oldRecord({ verdict: "FAIL" });
  assert.equal(recordMeetsTier(failed, TIERS.device, NOW, { rekey: rekeyOf(failed) }).code, "verdict");
  const low = oldRecord({ rung: "L1" });
  assert.equal(recordMeetsTier(low, TIERS.device, NOW, { rekey: rekeyOf(low) }).code, "rung");
});

test("the schedule says REKEY, not run: OWED names --rekey, and an old-rule discharge is not called REOPENED", () => {
  const BRANCH = "slice/rekey";
  const plan = (discharged = null) => ({ schema: "prooflane-proof-plan/1", slice: "rekey", branch: BRANCH, openedAt: "2026-09-24T08:00:00.000Z", base: null, declared: {}, discharged, reviewDischarged: null });
  const paths = ["template/composeApp/build.gradle.kts"];
  const o = obligation(plan(), paths, BRANCH, { fleetRecord: oldRecord() });
  assert.equal(o.state, "owed");
  assert.equal(o.shortfall?.code, "other-rule");
  const text = render(o);
  assert.match(text, /REKEY it, do not re-run it/);
  assert.match(text, /Now: node scripts\/proof-plan\.mjs --rekey/);

  // A discharge copied from an old-rule record carries no stampedRule. Its hash
  // is not compared with a rule-2 digest — "they differ" would be REOPENED for
  // an app that may not have moved — and it discharges nothing.
  const old = obligation(plan({ at: "2026-09-22T19:31:09.998Z", stampedHash: o.now, stampedFiles: {}, verdict: "PASS", rung: "L2" }), paths, BRANCH, { fleetRecord: oldRecord() });
  assert.equal(old.state, "owed", "an old-rule discharge is no discharge, even when its number equals today's");
  const current = obligation(plan({ at: "2026-09-24T09:00:00.000Z", stampedHash: o.now, stampedFiles: {}, stampedRule: STAMPED_OUTPUT_RULE, verdict: "PASS", rung: "L2" }), paths, BRANCH, { fleetRecord: null });
  assert.equal(current.state, "discharged", "a discharge under this rule still discharges");
});

test("the hook adds a sentence, not a refusal: the L2 run command is still allowed, and every text names --rekey first", () => {
  const o = { state: "owed", need: { reason: "1 changed path" }, shortfall: { code: "other-rule" }, review: { state: "none" } };
  const plain = { ...o, shortfall: null };
  const run = decide("device", o, TIERS);
  assert.equal(run.action, decide("device", plain, TIERS).action, "no new refusal (answer 5)");
  assert.match(run.reason, /^the run on record is keyed under another digest rule, so run node scripts\/proof-plan\.mjs --rekey INSTEAD of the L2 run/);
  const merge = decide("merge", o, TIERS);
  assert.equal(merge.action, "deny", "the merge was refused before, for the tier being owed, and still is");
  assert.match(merge.reason, /--rekey INSTEAD of the L2 run/);
  assert.match(decide("create", o, TIERS).reason, /--rekey INSTEAD/);
  assert.doesNotMatch(decide("device", plain, TIERS).reason, /--rekey/, "and nothing changes for a record under this rule");
});

// ---------------------------------------------------------------------------
// --rekey itself, over a real commit.

/** Everything a stamp needs, committed into a scratch repository so it has a commit to archive. */
const COPIED = ["bin", "src", "template", "packages", "scripts", "options.schema.json", "package.json"];
function scratchRepo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rekey-repo-")));
  for (const entry of COPIED) fs.cpSync(path.join(ROOT, entry), path.join(dir, entry), { recursive: true, verbatimSymlinks: true });
  const git = (...a) => execFileSync("git", a, { cwd: dir, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  git("init", "-q");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  git("add", "-A");
  git("commit", "-qm", "the tree an L2 run proved");
  return { dir, commit: git("rev-parse", "HEAD"), dispose: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test("--rekey refuses, each for its own reason, before it stamps anything — and writes nothing", async () => {
  const repo = scratchRepo();
  try {
    const { rekey } = await import(pathToFileURL(path.join(repo.dir, "scripts", "proof-plan.mjs")).href);
    const out = path.join(repo.dir, "qa-artifacts", "fleet-rekey-latest.json");
    const base = oldRecord({ commit: repo.commit });
    const cases = [
      ["no record", null, 2, /no L2 run is recorded/],
      ["no digest", { ...base, stampedOutputHash: undefined }, 2, /carries no stampedOutputHash/],
      ["a failed stamp", { ...base, stampedOutputHash: null }, 2, /its stamp failed/],
      ["already current", { ...base, stampedOutputRule: STAMPED_OUTPUT_RULE }, 1, /already under rule/],
      ["a rule it cannot compute", { ...base, stampedOutputRule: 7 }, 2, /rule 7, which this module cannot compute/],
      ["a FAIL", { ...base, verdict: "FAIL" }, 1, /FAIL, not PASS/],
      ["below the rung", { ...base, rung: "L1" }, 1, /below the L2 this tier requires/],
      ["commit-less", { ...base, commit: null }, 2, /names no commit/],
      ["a dirty tree", { ...base, treeWasDirty: true }, 1, /DIRTY tree/],
      ["dirtiness unrecorded", { ...base, treeWasDirty: undefined }, 1, /possibly dirty/],
      ["no ranAt", { ...base, ranAt: undefined }, 2, /carries no ranAt/],
      ["a commit this checkout lacks", { ...base, commit: "1".repeat(40) }, 2, /does not have commit 1111111/],
    ];
    for (const [what, record, exit, re] of cases) {
      const r = rekey({ root: repo.dir, record, out });
      assert.equal(r.ok, false, `${what}: rekeyed`);
      assert.equal(r.exit, exit, `${what}: ${r.message}`);
      assert.match(r.message, re, what);
      assert.equal(fs.existsSync(out), false, `${what}: wrote a rekey anyway`);
    }
    // And the one refusal that needs a stamp: a commit that does not reproduce the record.
    const lying = rekey({ root: repo.dir, record: { ...base, stampedOutputHash: "a".repeat(64) }, out });
    assert.equal(lying.ok, false);
    assert.equal(lying.exit, 1);
    assert.match(lying.message, /does NOT reproduce the recorded digest under rule 1/);
    assert.equal(fs.existsSync(out), false, "nothing is re-derived from a stamp that is not the app the run proved");
  } finally {
    repo.dispose();
  }
});

test("--rekey succeeds only by REPRODUCING the old digest first, writes beside the record, and never edits it", async () => {
  const repo = scratchRepo();
  try {
    const mod = await import(pathToFileURL(path.join(repo.dir, "scripts", "proof-plan.mjs")).href);
    const stamped = await import(pathToFileURL(path.join(repo.dir, "scripts", "stamped-output.mjs")).href);
    const ruleOne = stamped.stampedOutput(repo.dir, { rule: 1, timeoutMs: 60_000 });
    const ruleNow = stamped.stampedOutput(repo.dir, { timeoutMs: 60_000 });
    assert.notEqual(ruleOne.hash, ruleNow.hash, "premise: the two rules give this app two digests");

    const record = oldRecord({ commit: repo.commit, stampedOutputHash: ruleOne.hash, stampedOutputFiles: ruleOne.files });
    const fleetFile = path.join(repo.dir, "qa-artifacts", "fleet-latest.json");
    fs.mkdirSync(path.dirname(fleetFile), { recursive: true });
    fs.writeFileSync(fleetFile, `${JSON.stringify(record, null, 2)}\n`);
    const before = fs.readFileSync(fleetFile);

    const out = path.join(repo.dir, "qa-artifacts", "fleet-rekey-latest.json");
    const r = mod.rekey({ root: repo.dir, record, out, stampTimeoutMs: 60_000 });
    assert.equal(r.ok, true, r.message);
    const written = JSON.parse(fs.readFileSync(out, "utf8"));
    assert.equal(written.fromHash, ruleOne.hash);
    assert.equal(written.toHash, ruleNow.hash, "the re-derived digest is what this tree's rule computes for the same commit");
    assert.equal(written.commit, repo.commit);
    assert.equal(written.ranAt, record.ranAt);
    assert.ok(fs.readFileSync(fleetFile).equals(before), "the fleet record is byte-for-byte what the run wrote");
    assert.equal(fs.existsSync(path.join(repo.dir, "qa-artifacts", "fleet-history.jsonl")), false, "a rekey appends no history row (answer 7)");

    // Accepted for the run it names — read from disk, the way the schedule reads it.
    const m = mod.recordMeetsTier(record, mod.TIERS.device, ruleNow.hash);
    assert.equal(m.ok, true, m.reason);
    assert.equal(m.proof.rekeyedFrom.hash, ruleOne.hash);
    // And for no other.
    const another = { ...record, ranAt: "2026-09-23T00:00:00.000Z" };
    assert.equal(mod.recordMeetsTier(another, mod.TIERS.device, ruleNow.hash).code, "other-rule");
  } finally {
    repo.dispose();
  }
});
