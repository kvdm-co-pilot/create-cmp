// The audit-cadence report + ledger (template/qa/lib/audit-cadence.mjs) and
// its lane wiring (release profile of template/qa/verify.mjs).
//
// Contracts under test, with REAL git repos in REAL temp dirs (no mocking):
//   - "subsystem" is DERIVED from the tree (namespace → androidMain package
//     root → immediate dirs), never hardcoded to any app's package
//   - no git history → the report says exactly that and reports NOTHING
//   - no ledger entry → "no audit recorded for <name>", never implied
//     staleness
//   - recording is a CLAIM: sha comes from HEAD, unknown subsystems and
//     dirty-audited-files are refused (never fabricated)
//   - committed changes after a recorded audit surface as "changed", with
//     the act-on-it command; unrelated subsystems stay unchanged
//   - a ledger sha outside this repo's history is reported as unmeasurable,
//     not guessed at
//   - appending to qa/audits.jsonl never moves the receipt's inputs hash
//   - the lane step is a REPORT: release-profile only, and structurally
//     unable to FAIL

import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUDITS_REL_PATH,
  ROOT_SUBSYSTEM,
  androidMainPackageRoot,
  evaluateAuditCadence,
  listSubsystems,
  readAuditLedger,
  recordAudit,
} from "../template/qa/lib/audit-cadence.mjs";
import { computeInputsHash } from "../template/qa/lib/inputs-hash.mjs";

// S8b: the lane is TWO files now — qa/verify.mjs (the spine) and
// qa/lib/profiles/cmp/steps-cmp.mjs (the step pack). A structural read of "the lane's
// source" must see both, or it pins a file that no longer holds the steps.
const laneSrc = (dir) =>
  `${fs.readFileSync(path.join(dir, "qa/verify.mjs"), "utf8")}\n${fs.readFileSync(path.join(dir, "qa/lib/profiles/cmp/steps-cmp.mjs"), "utf8")}`;


const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "audit-cadence-engine-"));

function write(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Engine Test",
  GIT_AUTHOR_EMAIL: "engine@test",
  GIT_COMMITTER_NAME: "Engine Test",
  GIT_COMMITTER_EMAIL: "engine@test",
};

function git(root, cmd) {
  return execSync(`git -c commit.gpgsign=false -c init.defaultBranch=main ${cmd}`, {
    cwd: root,
    env: GIT_ENV,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

// A project whose package deliberately is NOT the template's com.example.app —
// the derivation must work for an app this code has never seen.
function makeProject(root) {
  write(
    root,
    "composeApp/build.gradle.kts",
    ['android {', '    namespace = "io.zed.wildapp"', '    defaultConfig { applicationId = "io.zed.wildapp" }', '}'].join("\n"),
  );
  const pkg = "composeApp/src/androidMain/kotlin/io/zed/wildapp";
  write(root, `${pkg}/notifications/Notifier.kt`, "package io.zed.wildapp.notifications\nclass Notifier\n");
  write(root, `${pkg}/alarms/AlarmScheduler.kt`, "package io.zed.wildapp.alarms\nclass AlarmScheduler\n");
  write(root, `${pkg}/MainActivity.kt`, "package io.zed.wildapp\nclass MainActivity\n");
  return pkg;
}

test("subsystems are derived from the namespace and the tree — immediate package dirs plus '(root)' for root-level files", () => {
  const root = tmp();
  const pkg = makeProject(root);
  const pkgRoot = androidMainPackageRoot(root);
  assert.ok(pkgRoot.ok);
  assert.equal(pkgRoot.rel, pkg);
  assert.deepEqual(listSubsystems(root, pkgRoot.rel), ["alarms", "notifications", ROOT_SUBSYSTEM]);
});

test("no git history: the report says so and reports nothing — no invented staleness", () => {
  const root = tmp();
  makeProject(root);
  const report = evaluateAuditCadence(root);
  assert.equal(report.ok, false);
  assert.match(report.reason, /no git history/);
  assert.ok(!("subsystems" in report), "nothing is reported without a baseline");
  assert.ok(!("lines" in report), "no nudge lines are fabricated without git");
});

test("no audit ever recorded: every subsystem says exactly 'no audit recorded for <name>'", () => {
  const root = tmp();
  makeProject(root);
  git(root, "init -q");
  git(root, "add -A");
  git(root, 'commit -qm "genesis"');
  const report = evaluateAuditCadence(root);
  assert.ok(report.ok);
  for (const name of ["alarms", "notifications", ROOT_SUBSYSTEM]) {
    const line = report.lines.find((l) => l.startsWith(`no audit recorded for ${name}`));
    assert.ok(line, `line for ${name}: ${JSON.stringify(report.lines)}`);
    assert.doesNotMatch(line, /stale|behind|overdue/i, "absence of a record must not be phrased as staleness");
  }
  assert.ok(report.subsystems.every((s) => s.status === "never-audited"));
});

test("recording is a claim: HEAD sha recorded, unknown subsystem refused, dirty audited files refused", () => {
  const root = tmp();
  const pkg = makeProject(root);
  git(root, "init -q");
  git(root, "add -A");
  git(root, 'commit -qm "genesis"');
  const head = git(root, "rev-parse HEAD");

  // Unknown subsystem: refused, naming what actually exists.
  const unknown = recordAudit(root, { subsystem: "payments", by: "test" });
  assert.equal(unknown.ok, false);
  assert.match(unknown.reason, /unknown subsystem "payments"/);
  assert.match(unknown.reason, /alarms, notifications/);

  // Dirty subsystem: refused — the record would claim HEAD for non-HEAD bytes.
  write(root, `${pkg}/alarms/AlarmScheduler.kt`, "package io.zed.wildapp.alarms\nclass AlarmScheduler { fun arm() {} }\n");
  const dirty = recordAudit(root, { subsystem: "alarms", by: "test" });
  assert.equal(dirty.ok, false);
  assert.match(dirty.reason, /uncommitted changes/);
  assert.match(dirty.reason, /[Cc]ommit/);

  // A clean sibling subsystem is NOT blocked by alarms' dirt.
  const ok = recordAudit(root, { subsystem: "notifications", by: "cmp-audit" });
  assert.ok(ok.ok, ok.reason);
  assert.equal(ok.sha, head, "the record claims the commit it was run against");
  const ledger = readAuditLedger(root);
  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.entries[0].subsystem, "notifications");
  assert.equal(ledger.entries[0].sha, head);
  assert.equal(ledger.entries[0].by, "cmp-audit");
  assert.ok(!Number.isNaN(Date.parse(ledger.entries[0].at)), "timestamp is a real ISO date");

  // No git at all: recording is refused, not fabricated against nothing.
  const rootless = tmp();
  makeProject(rootless);
  const noGit = recordAudit(rootless, { subsystem: "alarms", by: "test" });
  assert.equal(noGit.ok, false);
  assert.match(noGit.reason, /no git history/);
});

test("committed androidMain changes after an audit surface as 'changed' with the act-on-it command; unrelated subsystems stay unchanged", () => {
  const root = tmp();
  const pkg = makeProject(root);
  git(root, "init -q");
  git(root, "add -A");
  git(root, 'commit -qm "genesis"');
  assert.ok(recordAudit(root, { subsystem: "alarms", by: "t" }).ok);
  assert.ok(recordAudit(root, { subsystem: "notifications", by: "t" }).ok);
  assert.ok(recordAudit(root, { subsystem: ROOT_SUBSYSTEM, by: "t" }).ok);

  // Change alarms + a root-level file; commit (sha-vs-HEAD is the honest comparison).
  write(root, `${pkg}/alarms/AlarmScheduler.kt`, "package io.zed.wildapp.alarms\nclass AlarmScheduler { fun rearm() {} }\n");
  write(root, `${pkg}/Boot.kt`, "package io.zed.wildapp\nclass Boot\n");
  git(root, "add -A");
  git(root, 'commit -qm "rework alarms"');

  const report = evaluateAuditCadence(root);
  assert.ok(report.ok);
  const byName = Object.fromEntries(report.subsystems.map((s) => [s.name, s]));
  assert.equal(byName.alarms.status, "changed");
  assert.equal(byName.alarms.changedFiles, 1);
  assert.equal(byName[ROOT_SUBSYSTEM].status, "changed", "a new root-level file belongs to '(root)', not to any subsystem dir");
  assert.equal(byName.notifications.status, "unchanged", "untouched subsystems are not nudged");

  const alarmLine = report.lines.find((l) => l.startsWith("alarms:"));
  assert.ok(alarmLine);
  assert.match(alarmLine, /changed since its last recorded audit/);
  assert.match(alarmLine, /cmp-audit alarms/, "the nudge names the audit verb");
  assert.match(alarmLine, /node qa\/record-audit\.mjs "alarms"/, "the nudge names the recording command");
});

test("a ledger sha outside this repo's history is unmeasurable — said plainly, never guessed", () => {
  const root = tmp();
  makeProject(root);
  git(root, "init -q");
  git(root, "add -A");
  git(root, 'commit -qm "genesis"');
  write(root, AUDITS_REL_PATH, `${JSON.stringify({ schema: "cmp-audit-record/1", subsystem: "alarms", sha: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef", at: "2026-01-01T00:00:00.000Z", by: "t" })}\n`);
  const report = evaluateAuditCadence(root);
  assert.ok(report.ok);
  const alarms = report.subsystems.find((s) => s.name === "alarms");
  assert.equal(alarms.status, "unknown-commit");
  const line = report.lines.find((l) => l.startsWith("alarms:"));
  assert.match(line, /not in this repo's history/);
  assert.match(line, /cannot be measured/);
});

test("malformed ledger lines are counted and reported, never silently dropped", () => {
  const root = tmp();
  makeProject(root);
  git(root, "init -q");
  git(root, "add -A");
  git(root, 'commit -qm "genesis"');
  const head = git(root, "rev-parse HEAD");
  write(root, AUDITS_REL_PATH, `not json at all\n${JSON.stringify({ schema: "cmp-audit-record/1", subsystem: "alarms", sha: head, at: "2026-01-01T00:00:00.000Z", by: "t" })}\n{"subsystem": 42}\n`);
  const ledger = readAuditLedger(root);
  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.malformed, 2);
  const report = evaluateAuditCadence(root);
  assert.ok(report.lines.some((l) => /2 ledger line\(s\).*could not be parsed/.test(l)));
});

test("appending an audit record never moves the receipt's inputs hash (bookkeeping must not invalidate evidence)", () => {
  const root = tmp();
  makeProject(root);
  write(root, "qa/verify.mjs", "// lane stub\n");
  write(root, "specs/app-base.spec.md", "## [BASE-01] clause\n");
  git(root, "init -q");
  git(root, "add -A");
  git(root, 'commit -qm "genesis"');
  const before = computeInputsHash(root).hash;
  assert.ok(recordAudit(root, { subsystem: "alarms", by: "t" }).ok);
  assert.equal(computeInputsHash(root).hash, before, "recording an audit moved the inputs hash");
  assert.ok(recordAudit(root, { subsystem: "notifications", by: "t" }).ok);
  assert.equal(computeInputsHash(root).hash, before, "a second record moved the inputs hash");
});

test("lane wiring: auditCadence is a release-profile REPORT that structurally cannot FAIL", () => {
  const verify = laneSrc(path.join(REPO_ROOT, "template"));
  assert.match(
    verify,
    /stepsForProfile\.release = \[\.\.\.stepsForProfile\.ci, stepAuditCadence, stepReleaseSmoke\]/,
    "release = ci + auditCadence + releaseSmoke (smoke stays last)",
  );
  const stepSrc = verify.slice(verify.indexOf("function stepAuditCadence"), verify.indexOf("// ── Lane"));
  assert.ok(stepSrc.length > 0, "stepAuditCadence exists");
  assert.ok(!stepSrc.includes('"FAIL"'), "the step maps every outcome to PASS or SKIP — a report, never a gate");
  assert.match(verify, /audit cadence \(report, never a gate\)/, "the release lane prints the nudges in the human path");
});
