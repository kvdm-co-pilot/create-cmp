// A GREEN SUITE WAS RUN AGAIN BECAUSE NOTHING RECORDED IT.
//
// `npm test` kept nothing, so every reader that needed its verdict re-derived it:
// 295 full-suite runs in eleven days, 4.6 to 6.6 per merged change, and
// `scripts/fit-test.mjs` re-ran the suite the author had just run
// (docs/research/g2-measure/, 2026-09-17). The declared suite now records itself
// (scripts/suite-record.mjs says why), and the class tested here is: a run's
// record binds to the bytes and the Node it ran on, a reader trusts it for
// exactly those, and nothing else is ever read as a PASS.
//
// Every write goes to a scratch git repo — the live record is never touched.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { SUITE_SCHEMA, suiteTreeHash, suiteStatus, readSuiteRecord } from "../scripts/suite-record.mjs";
import { recordRun, narrowing } from "../scripts/suite-reporter.mjs";
import { readHistory, historyPath } from "../scripts/lib/proof-history.mjs";
import { render, suiteFromRecord } from "../scripts/fit-test.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** A scratch git repo with one tracked file, so the suite hash has a tree to describe. */
function scratchRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "suite-record-"));
  const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  fs.writeFileSync(path.join(root, "a.txt"), "one\n");
  fs.writeFileSync(path.join(root, ".gitignore"), "qa-artifacts/\nignored-input.md\n");
  git("add", ".");
  return root;
}

async function* events(list) {
  for (const e of list) yield e;
}
const diag = (message) => ({ type: "test:diagnostic", data: { nesting: 0, message } });
const SUMMARY = (pass, fail) => [diag(`tests ${pass + fail}`), diag("suites 0"), diag(`pass ${pass}`), diag(`fail ${fail}`), diag("cancelled 0"), diag("skipped 0"), diag("todo 0"), diag("duration_ms 12.5")];

test("a finished run records its verdict, its counts, and the tree and Node it ran on — and keeps it", async () => {
  const root = scratchRepo();
  try {
    const record = await recordRun(events([{ type: "test:fail", data: { name: "a broken thing", details: { type: "test" } } }, ...SUMMARY(3, 1)]), { root });
    assert.equal(record.schema, SUITE_SCHEMA);
    assert.equal(record.verdict, "FAIL");
    assert.deepEqual(record.failing, ["a broken thing"]);
    assert.equal(record.counts.tests, 4);
    assert.equal(record.observedHash, suiteTreeHash(root));
    assert.equal(record.node, process.version);
    assert.deepEqual(readSuiteRecord(root), record);
    assert.equal(readHistory(historyPath(root, "suite")).rows.length, 1, "every run is kept, not only the latest");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a run with no summary did not finish: INCOMPLETE, never PASS — and never read as the suite", async () => {
  const root = scratchRepo();
  try {
    const record = await recordRun(events([{ type: "test:pass", data: { name: "x" } }]), { root });
    assert.equal(record.verdict, "INCOMPLETE");
    assert.equal(suiteStatus({ record, now: suiteTreeHash(root) }).state, "incomplete");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("KD-61: a narrowed run is recorded as narrowed and never read as the suite, however green", async () => {
  const root = scratchRepo();
  try {
    const record = await recordRun(events(SUMMARY(1, 0)), { root, narrowedBy: ["runner flag --test-name-pattern=ok"] });
    assert.equal(record.verdict, "PASS");
    assert.equal(record.scope, "narrowed");
    assert.equal(suiteStatus({ record, now: suiteTreeHash(root) }).state, "narrowed", "PASS 1/1 of a filtered run is not the suite's verdict");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("KD-61: what counts as narrowing — a filter flag in execArgv or NODE_OPTIONS, or a declared file that did not run", () => {
  const root = scratchRepo();
  try {
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test --test-reporter=spec a.test.mjs b.test.mjs" } }));
    fs.writeFileSync(path.join(root, "a.test.mjs"), "");
    fs.writeFileSync(path.join(root, "b.test.mjs"), "");
    const base = { root, cwd: root, execArgv: ["--test"], nodeOptions: "", argvFiles: ["a.test.mjs", "b.test.mjs"] };
    assert.deepEqual(narrowing(base), [], "the declared suite, whole");
    assert.deepEqual(narrowing({ ...base, argvFiles: ["a.test.mjs", "b.test.mjs", "extra.test.mjs"] }), [], "more than declared still ran all of it");
    assert.match(narrowing({ ...base, execArgv: ["--test", "--test-only"] }).join(), /--test-only/);
    assert.match(narrowing({ ...base, nodeOptions: "--test-skip-pattern=b" }).join(), /--test-skip-pattern/);
    assert.match(narrowing({ ...base, argvFiles: ["a.test.mjs"] }).join(), /1 declared test file\(s\) did not run, e\.g\. b\.test\.mjs/);
    fs.rmSync(path.join(root, "package.json"));
    assert.match(narrowing(base).join(), /no declared suite/, "with nothing declared, nothing can be the suite");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a run whose tree moved while it ran describes no tree", async () => {
  const root = scratchRepo();
  try {
    const hashAtStart = suiteTreeHash(root);
    fs.writeFileSync(path.join(root, "a.txt"), "edited mid-run\n");
    const record = await recordRun(events(SUMMARY(2, 0)), { root, hashAtStart });
    assert.equal(record.observedHash, null);
    assert.equal(record.treeMovedDuringRun, true);
    assert.equal(suiteStatus({ record, now: suiteTreeHash(root) }).state, "moved");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a record is FRESH for exactly its bytes and its Node — an edit, an untracked file, another Node each make it not", async () => {
  const root = scratchRepo();
  try {
    const record = await recordRun(events(SUMMARY(2, 0)), { root });
    assert.equal(suiteStatus({ record, now: suiteTreeHash(root) }).state, "fresh");
    assert.equal(suiteStatus({ record, now: suiteTreeHash(root), node: "v20.19.0" }).state, "other-node", "KD-57: Node 20 counted nine fewer tests on the same bytes");
    fs.writeFileSync(path.join(root, "new.test.mjs"), "untracked, not ignored — the runner would see it\n");
    assert.equal(suiteStatus({ record, now: suiteTreeHash(root) }).state, "stale", "an untracked file the runner can collect moves the tree");
    fs.rmSync(path.join(root, "new.test.mjs"));
    fs.mkdirSync(path.join(root, "qa-artifacts"), { recursive: true });
    fs.writeFileSync(path.join(root, "qa-artifacts", "noise.json"), "{}");
    assert.equal(suiteStatus({ record, now: suiteTreeHash(root) }).state, "fresh", "generated output is not part of the tree — the record itself lives there");
    fs.writeFileSync(path.join(root, "ignored-input.md"), "a gitignored file a test reads\n");
    assert.equal(suiteStatus({ record, now: suiteTreeHash(root) }).state, "stale", "KD-62: a test can read a gitignored file, so an ignored file is part of the tree");
    fs.rmSync(path.join(root, "ignored-input.md"));
    assert.equal(suiteStatus({ record, now: suiteTreeHash(root) }).state, "fresh");
    fs.writeFileSync(path.join(root, "a.txt"), "two\n");
    assert.equal(suiteStatus({ record, now: suiteTreeHash(root) }).state, "stale");
    assert.equal(suiteStatus({ record: null, now: suiteTreeHash(root) }).state, "absent");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the fit test reads a FRESH record instead of re-running, and says where the number came from", () => {
  const suite = suiteFromRecord({ verdict: "PASS", counts: { tests: 1953, pass: 1953, fail: 0 }, failing: [], ranAt: "2026-09-17T16:40:00.000Z" });
  assert.deepEqual({ tests: suite.tests, pass: suite.pass, fail: suite.fail }, { tests: 1953, pass: 1953, fail: 0 });
  const out = render({ suite, frameworkCheck: null, device: { required: false, reason: "r" }, fleet: { present: false } });
  assert.match(out, /1953\/1953/);
  assert.match(out, /recorded .* for this exact tree/, "a number read from a record must say so, or it reads as a fresh run");
});

test("the declared suite really records itself — the runner, the reporter and a real record, end to end", () => {
  const root = scratchRepo();
  try {
    fs.writeFileSync(path.join(root, "ok.test.mjs"), 'import { test } from "node:test";\ntest("ok", () => {});\n');
    fs.writeFileSync(path.join(root, "bad.test.mjs"), 'import { test } from "node:test";\ntest("bad", () => { throw new Error("x"); });\n');
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test ok.test.mjs bad.test.mjs" } }));
    spawnSync("git", ["add", "."], { cwd: root });
    const reporter = path.join(REPO_ROOT, "scripts", "suite-reporter.mjs");
    const env = { ...process.env, PROOFLANE_SUITE_ROOT: root };
    // KD-49: an inherited NODE_TEST_CONTEXT turns the child into a subtest reporter
    // that exits 0 whatever happens — scrub it, or this proves nothing.
    delete env.NODE_TEST_CONTEXT;
    delete env.NODE_OPTIONS;
    const runner = ({ flags = [], extraEnv = {} } = {}) =>
      spawnSync(process.execPath, ["--test", ...flags, "--test-reporter=spec", "--test-reporter-destination=stdout", `--test-reporter=${reporter}`, "--test-reporter-destination=stderr", "ok.test.mjs", "bad.test.mjs"], { cwd: root, env: { ...env, ...extraEnv }, encoding: "utf8" });
    const r = runner();
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const rec = readSuiteRecord(root);
    assert.ok(rec, "the reporter wrote no record");
    assert.equal(rec.verdict, "FAIL");
    assert.equal(rec.scope, "declared", `the whole declared suite ran: ${JSON.stringify(rec.narrowedBy)}`);
    assert.deepEqual(rec.failing, ["bad"]);
    assert.equal(rec.counts.pass, 1);

    // KD-61: the same run, narrowed to its green half. A green narrowed run is the
    // dangerous one, and it must still read as narrowed, never as the suite.
    const expectNarrowed = (label, result) => {
      assert.equal(result.status, 0, `${label}: ${result.stdout}${result.stderr}`);
      const nrec = readSuiteRecord(root);
      assert.equal(nrec.verdict, "PASS", label);
      assert.equal(nrec.scope, "narrowed", label);
      assert.equal(suiteStatus({ record: nrec, now: suiteTreeHash(root) }).state, "narrowed", label);
    };
    expectNarrowed("a filter flag on the command line", runner({ flags: ["--test-name-pattern=ok"] }));
    // The way it was FOUND — from the environment, where `npm test` itself cannot see
    // it. Node 20 refuses the flag in NODE_OPTIONS (CI measured it, exit 9), so the
    // route only exists where Node allows it, and is only asserted there.
    if (process.allowedNodeEnvironmentFlags.has("--test-name-pattern")) {
      expectNarrowed("a filter flag in NODE_OPTIONS", runner({ extraEnv: { NODE_OPTIONS: "--test-name-pattern=ok" } }));
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("npm test runs the recording reporter, and prints with spec as before", () => {
  const script = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")).scripts.test;
  assert.match(script, /--test-reporter=spec --test-reporter-destination=stdout/);
  assert.match(script, /--test-reporter=\.\/scripts\/suite-reporter\.mjs --test-reporter-destination=stderr/);
});
