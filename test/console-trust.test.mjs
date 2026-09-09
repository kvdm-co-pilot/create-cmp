// "Can I trust the lane that says so?" — the record, and the row that reads it.
//
// docs/proposals/LIVE-CONSOLE.md Phase C, D4a. Four properties, and each one is
// a way this row could lie:
//
//   1. THE RESTORE CONTRACT SURVIVES. The Rule 0 instrument plants into a real
//      tree and puts it back; three gates already hold it to that. The record
//      is therefore opt-in, and the plain run must leave the tree byte-for-byte
//      as it found it — asserted here by RUNNING both, because a claim about
//      what a script writes is not testable by reading it.
//   2. AN ABSENT RECORD RENDERS AS ABSENCE. Never as reassurance. This is the
//      state most trees are in, so it is the state most likely to be quietly
//      wrong.
//   3. A FAILED Rule 0, and a tree the instrument did NOT put back, are said
//      out loud and in red.
//   4. ONE SPELLING: no other console module reads the record or decides what
//      it means — the inversion test/console-now.test.mjs applies to the step
//      stream, applied to this artifact.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  FRAMEWORK_RECORD_COMMAND,
  FRAMEWORK_RECORD_REL,
  buildFrameworkRecord,
  readFrameworkRecord,
  trustLine,
  trustState,
} from "../packages/harness/src/lib/framework-record.mjs";
import { trustRowHtml } from "../packages/harness/src/console/console-trust.mjs";
import { galleryHtml } from "../packages/harness/src/console/preview-service.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONSOLE_DIR = path.join(ROOT, "packages/harness/src/console");
const T0 = Date.parse("2026-09-09T12:00:00.000Z");

/** A record as the instrument writes one, with the fields a case needs changed. */
const record = (over = {}) =>
  buildFrameworkRecord({
    verdict: "PASS",
    plants: [
      { kind: "orphaned-citation", label: "orphaned citation", step: "specCoverage", observed: "specCoverage", names: ["HOME-01"], failedByName: true, durationMs: 240 },
      { kind: "edited-lane", label: "edited lane cannot vouch", step: "harnessIntegrity", observed: "harnessIntegrity", names: ["modified"], failedByName: true, durationMs: 205 },
    ],
    treeIdentical: true,
    generatedAt: new Date(T0 - 2 * 3600_000).toISOString(),
    ...over,
  });

const read = (rec) => ({ ok: true, record: rec, relPath: FRAMEWORK_RECORD_REL });

// ── 1. The instrument, run for real ─────────────────────────────────────────

/** A minimal adopted tree with a working lane — step-artifact.test.mjs's seed. */
function seedProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trust-record-"));
  const git = (...a) => execFileSync("git", ["-C", dir, ...a], { stdio: "ignore" });
  git("init", "-q");
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src", "main.py"), "def add(a, b):\n    return a + b\n");
  execFileSync(process.execPath, [path.join(ROOT, "packages/harness/bin/prooflane.mjs"), "init"], { cwd: dir, stdio: "ignore" });
  git("add", "-A");
  execFileSync("git", ["-C", dir, "-c", "user.email=x@y", "-c", "user.name=x", "commit", "-qm", "init"], { stdio: "ignore" });
  return dir;
}

const porcelain = (dir) => execFileSync("git", ["-C", dir, "status", "--porcelain"], { encoding: "utf8" });

test("the record is written ONLY when asked — a plain Rule 0 run still leaves the tree exactly as it found it", () => {
  const dir = seedProject();
  try {
    const before = porcelain(dir);
    const plain = spawnSync(process.execPath, [path.join(dir, "qa", "framework-check.mjs")], { cwd: dir, encoding: "utf8", timeout: 120_000 });
    assert.equal(plain.status, 0, `Rule 0 must pass in a fresh adopted tree:\n${plain.stdout}${plain.stderr}`);
    // THE PROPERTY THREE OTHER GATES ALSO KEEP, pinned here against the change
    // that would break it: an instrument that leaves residue is one nobody runs
    // twice, and the record must not have made this instrument that.
    assert.equal(porcelain(dir), before, "a default run writes NOTHING — not even the record");
    assert.equal(fs.existsSync(path.join(dir, ...FRAMEWORK_RECORD_REL.split("/"))), false);

    const asked = spawnSync(process.execPath, [path.join(dir, "qa", "framework-check.mjs"), "--record"], { cwd: dir, encoding: "utf8", timeout: 120_000 });
    assert.equal(asked.status, 0, `${asked.stdout}${asked.stderr}`);
    const added = porcelain(dir)
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => l.slice(3));
    assert.deepEqual(added, [FRAMEWORK_RECORD_REL], "exactly ONE file appears, and it is the one that was asked for");

    const got = readFrameworkRecord(dir);
    assert.equal(got.ok, true, got.reason);
    assert.equal(got.record.verdict, "PASS");
    assert.ok(got.record.plants.length >= 1, "the record names the plants that ran");
    for (const p of got.record.plants) {
      assert.equal(p.failedByName, true, `${p.label} is only recorded past the assessor's refusal`);
      assert.ok(p.observed, "the row that ACTUALLY went red is named, not the one the plant asked for");
      assert.ok(typeof p.durationMs === "number", "with what it cost");
    }
    assert.equal(got.record.treeIdentical, true, "and the instrument's own restore check, measured against the bytes it read");
    // What it could NOT plant, and why — a run reporting two green plants over
    // a tree where five were impossible has said much less than it looks.
    assert.ok(got.record.unavailable.length >= 1, "unavailable plants travel with their reasons");
    assert.ok(got.record.unavailable.every((u) => u.kind && u.reason));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a Rule 0 that FAILS still leaves a record — the run that most needs one is the one that died", () => {
  const dir = seedProject();
  try {
    // An absurd bound makes a healthy lane read as a hang: the instrument's own
    // planted failure (test/framework-check.test.mjs uses the same lever).
    const r = spawnSync(process.execPath, [path.join(dir, "qa", "framework-check.mjs"), "--bound-ms", "1", "--record"], { cwd: dir, encoding: "utf8", timeout: 120_000 });
    assert.equal(r.status, 1, "it must not pass");
    const got = readFrameworkRecord(dir);
    assert.equal(got.ok, true, "the record is there");
    assert.equal(got.record.verdict, "FAIL");
    assert.match(got.record.reason, /HANGS|bound/i, "in the instrument's own words");
    assert.match(trustLine(trustState(got)), /^Rule 0 — FAILED/, "and the row leads with it");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── 2–3. What the record MEANS ──────────────────────────────────────────────

test("an absent record renders as absence and names the command — never as reassurance", () => {
  const state = trustState(readFrameworkRecord(fs.mkdtempSync(path.join(os.tmpdir(), "no-record-"))));
  assert.equal(state.available, false);
  const html = trustRowHtml(state);
  assert.match(html, /no Rule 0 record/);
  assert.match(html, new RegExp(FRAMEWORK_RECORD_COMMAND.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "the command that ends the absence");
  assert.equal(/trust-bad/.test(html), false, "an unrun instrument is an open question, not a failure");
  for (const reassuring of [/\bPASS\b/, /failed by name/, /byte-identical/]) {
    assert.equal(reassuring.test(html), false, `an absence must not borrow the words of a pass: ${reassuring}`);
  }
});

test("the line says what the record says: plants that refused BY NAME, and whether the tree came back", () => {
  const ok = trustState(read(record()), { now: T0 });
  assert.equal(trustLine(ok, "2h ago"), "Rule 0 — 2 plants failed by name · tree byte-identical · 2h ago");
  assert.equal(ok.ageMs, 2 * 3600_000, "the age is derived from the record's own stamp");

  // A plant that did not refuse by name is COUNTED SEPARATELY, never rounded up.
  const partial = record({
    plants: [
      { kind: "a", label: "a", step: null, observed: "specCoverage", names: ["X"], failedByName: true, durationMs: 1 },
      { kind: "b", label: "b", step: null, observed: null, names: [], failedByName: false, durationMs: 1 },
    ],
  });
  assert.match(trustLine(trustState(read(partial))), /1 of 2 plants failed by name/);

  // A tree the instrument did not put back is the finding nobody would look for.
  const dirty = trustState(read(record({ treeIdentical: false, changed: ["specs/home.spec.md"] })));
  assert.match(trustLine(dirty), /tree NOT restored — 1 file left changed/);
  assert.match(trustRowHtml(dirty), /trust-bad/, "and it is said in the colour that means something went wrong");

  // "The record does not say" is a third state, never folded into either.
  assert.match(trustLine(trustState(read(record({ treeIdentical: null })))), /does not say whether the tree was restored/);
});

test("the row expands to name each plant and the gate it made refuse — one question, more of it", () => {
  const html = trustRowHtml(trustState(read(record())), { age: "2h ago" });
  assert.match(html, /Rule 0 — 2 plants failed by name · tree byte-identical · 2h ago/);
  assert.match(html, /<details/, "the detail expands in place rather than becoming a second row");
  assert.match(html, /orphaned citation/);
  assert.match(html, /specCoverage naming HOME-01/, "the gate that refused, and what it named");
  assert.match(html, /edited lane cannot vouch/);
  assert.match(html, /harnessIntegrity naming modified/);
  // §7's refusals, in the place a "trust" row is most tempted by them.
  for (const banned of [/\d+%/, /score/i, /health/i]) {
    assert.equal(banned.test(html), false, `the trust row refuses ${banned}`);
  }
});

test("the front door renders the row, and a caller that supplies no state renders no row", () => {
  const base = { appName: "Acme", viewport: { width: 411, height: 891 }, version: 1, cards: [] };
  const withTrust = galleryHtml({ ...base, trust: trustState(read(record()), { now: T0 }) });
  assert.match(withTrust, /<h3 class="fd-h">Trust<\/h3>/);
  assert.match(withTrust, /id="trust"/);
  assert.match(withTrust, /Rule 0 — 2 plants failed by name/);

  const without = galleryHtml(base);
  assert.equal(/id="trust"/.test(without), false, "no state supplied means no row — an empty trust row reads as 'nothing is wrong'");
});

// ── 4. One spelling ─────────────────────────────────────────────────────────

test("THE CLASS: no console module reads the Rule 0 record or decides what it means but console-trust.mjs", () => {
  // Deny by default over the whole console directory, so the SECOND module to
  // reach for the record is caught the day it is written and by nobody
  // remembering a list. The rule is stated as the DEFECT: reading the record's
  // path, or its fields, anywhere the shared derivation is not being called.
  const files = fs
    .readdirSync(CONSOLE_DIR)
    .filter((f) => f.endsWith(".mjs") && f !== "console-trust.mjs")
    .sort();
  assert.ok(files.length >= 5, `expected the whole console to be scanned, saw ${files.length} modules`);
  const offenders = [];
  for (const f of files) {
    const src = fs
      .readFileSync(path.join(CONSOLE_DIR, f), "utf8")
      .replace(/^[ \t]*\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    src.split("\n").forEach((line, i) => {
      const readsRecord = /framework-check\.json/.test(line) || /\btrustState\s*\(/.test(line);
      // Deciding for itself what "failed by name" or "the tree came back" means
      // is the second spelling this exists to refuse.
      const decidesMeaning = /\bfailedByName\b/.test(line) || /\btreeIdentical\b/.test(line);
      if (readsRecord || decidesMeaning) offenders.push(`${f}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(
    offenders,
    [],
    `these console modules read Rule 0's record themselves — go through qa/lib/framework-record.mjs instead:\n  ${offenders.join("\n  ")}`,
  );
});
