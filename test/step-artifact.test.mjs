// The run outlives the process that watched it.
//
// `verify --events` already reported each finished step on stderr (#110). That
// reaches whoever is holding the pipe and nobody else: a console started five
// minutes later learns nothing, and a console that was not running while the
// lane ran learns nothing ever. docs/proposals/LIVE-CONSOLE.md Phase B closes
// that by leaving the same events behind as an ARTIFACT — qa/.lane-steps.ndjson
// — which is what makes the console a READER of the lane rather than a
// participant in it.
//
// These run the real binary against a real tree, because the properties that
// matter are about a file on disk: it is written, it is one run, its lines
// match the ones that went to stderr, and it is not written at all when nobody
// asked for events.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STEPS_REL = "qa/.lane-steps.ndjson";

/** A minimal adopted tree with a working lane — the same seed step-events.test.mjs uses. */
function seedProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "step-artifact-"));
  const git = (...a) => execFileSync("git", ["-C", dir, ...a], { stdio: "ignore" });
  git("init", "-q");
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src", "main.py"), "def add(a, b):\n    return a + b\n");
  execFileSync(process.execPath, [path.join(ROOT, "packages/harness/bin/prooflane.mjs"), "init"], { cwd: dir, stdio: "ignore" });
  git("add", "-A");
  execFileSync("git", ["-C", dir, "-c", "user.email=x@y", "-c", "user.name=x", "commit", "-qm", "init"], { stdio: "ignore" });
  return dir;
}

const runLane = (dir, args) =>
  spawnSync(process.execPath, [path.join(dir, "qa", "verify.mjs"), ...args], { cwd: dir, encoding: "utf8" });

const readStream = (dir) =>
  fs
    .readFileSync(path.join(dir, ...STEPS_REL.split("/")), "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

test("--events leaves the run behind as an artifact: a run/start, a line per step, a run/end", () => {
  const dir = seedProject();
  try {
    runLane(dir, ["--events"]);
    const lines = readStream(dir);

    const start = lines[0];
    assert.equal(start.event, "run");
    assert.equal(start.phase, "start");
    assert.ok(start.runId, "the run identifies itself, so an arriving row can be told from the previous run's");
    assert.ok(Array.isArray(start.steps) && start.steps.length > 0, "the opening line NAMES the steps — a console cannot say 'unitTests, not yet' otherwise");
    assert.equal(start.total, start.steps.length);
    assert.equal(start.mode, "full");

    const steps = lines.filter((l) => l.event === "step");
    assert.equal(steps.length, start.total, "one line per finished step");
    steps.forEach((s, i) => {
      assert.equal(s.index, i, "in order, with its own index");
      assert.equal(s.runId, start.runId);
      assert.equal(s.name, start.steps[i], "and the name the opening line promised");
      assert.ok(typeof s.at === "string" && !Number.isNaN(Date.parse(s.at)), "with the instant it landed");
      assert.ok(Object.hasOwn(s, "expectedMs"), "and what it usually costs — 'impossibly fast' is meaningless without it");
    });

    const end = lines[lines.length - 1];
    assert.equal(end.event, "run");
    assert.equal(end.phase, "end");
    assert.equal(end.runId, start.runId);
    assert.equal(end.completed, steps.length);
    assert.equal(typeof end.verdict, "string");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the artifact carries exactly the lines stderr carried — one object, two sinks", () => {
  const dir = seedProject();
  try {
    const res = runLane(dir, ["--events"]);
    const fromStderr = res.stderr
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("{"))
      .map((l) => JSON.parse(l))
      .filter((o) => o.event === "step");
    const fromFile = readStream(dir).filter((o) => o.event === "step");
    assert.ok(fromStderr.length > 0, "the lane still reports on stderr");
    assert.deepEqual(
      fromFile,
      fromStderr,
      "the file and the pipe must carry the SAME object — two spellings of a step event is two stories about one run",
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the file is ONE run: a second run truncates rather than appends", () => {
  const dir = seedProject();
  try {
    runLane(dir, ["--events"]);
    const first = readStream(dir).find((l) => l.phase === "start").runId;
    runLane(dir, ["--events"]);
    const lines = readStream(dir);
    const starts = lines.filter((l) => l.event === "run" && l.phase === "start");
    assert.equal(starts.length, 1, "a watcher running the fast lane on every save must not grow this file forever");
    assert.notEqual(starts[0].runId, first, "and what is left is the LAST run, not the first");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("no --events, no artifact — the lane writes nothing nobody asked for", () => {
  const dir = seedProject();
  try {
    runLane(dir, []);
    assert.ok(fs.existsSync(path.join(dir, "qa", "evidence", "latest.json")), "the receipt is still written");
    assert.ok(!fs.existsSync(path.join(dir, ...STEPS_REL.split("/"))), `${STEPS_REL} must only exist when --events asked for it`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the stream is transient lane state, and every list that says so names it", () => {
  // It lives beside the lane's in-flight marker rather than under qa/evidence/,
  // and NOT for tidiness: qa/evidence/ holds the committed receipt-of-record
  // (test/harness-surfaces.test.mjs pins that exactly one file under it may be
  // ignored), and a file rewritten on every save in the watch loop does not
  // belong beside it. Three lists have to agree, and each is one line.
  assert.match(
    fs.readFileSync(path.join(ROOT, "template/gitignore"), "utf8"),
    /^qa\/\.lane-steps\.ndjson$/m,
    "gitignored — rewritten on every save in the watch loop, so committing it is pure churn",
  );
  assert.match(
    fs.readFileSync(path.join(ROOT, "packages/receipts/src/inputs-hash.mjs"), "utf8"),
    /"qa\/\.lane-steps\.ndjson"/,
    "excluded from the hashed input surface — a lane that hashed its own progress would invalidate its own receipt mid-run",
  );
  assert.match(
    fs.readFileSync(path.join(ROOT, "packages/harness/src/lib/affected-tests.mjs"), "utf8"),
    /LANE_OUTPUT_PREFIXES[^\n]*qa\/\.lane-steps\.ndjson/,
    "a lane OUTPUT for the fast filter — the lane's own progress is not a change to the tree it is checking",
  );
});

test("ONE spelling of the path: the lane writes what lane-markers.mjs declares", () => {
  // The lane writes it and the console reads it, and neither may guess where
  // the other put it — the failure project-layout.mjs was carved out to end.
  const markers = fs.readFileSync(path.join(ROOT, "packages/harness/src/lib/lane-markers.mjs"), "utf8");
  assert.match(markers, /export const LANE_STEPS_REL = "qa\/\.lane-steps\.ndjson";/);
  const src = fs.readFileSync(path.join(ROOT, "packages/harness/src/verify.mjs"), "utf8");
  assert.match(src, /laneStepsPath\(ROOT\)/, "verify takes the path from lane-markers.mjs rather than composing its own");
  assert.match(src, /qa\/\.lane-steps\.ndjson/, "and --help names it: a file the lane writes and nobody documents is a file nobody finds");
});
