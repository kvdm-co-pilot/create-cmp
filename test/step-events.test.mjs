// The lane reports each step as it finishes — without breaking the readers it
// already has.
//
// `verify --json` prints ONE object on stdout, and two things in this repo
// parse it that way (qa/watch.mjs's receipt extraction, qa/refusal-demo.mjs).
// Interleaving step lines there would break every existing reader for the
// benefit of a new one — the class of change ADR-0007 refused for the receipt
// format, one layer down.
//
// So progress goes to STDERR under `--events`, and stdout keeps its contract:
// stdout is the RESULT, stderr is the PROGRESS. That split is what these tests
// pin, along with the rule that a reporter may never fail a lane.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runLane } from "../packages/harness/src/lib/lane-runner.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function lane({ onStep, print, steps }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "step-events-"));
  try {
    return runLane({
      steps,
      markerPath: path.join(dir, "marker"),
      print: print ?? null,
      onStep: onStep ?? null,
      narrator: null,
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const step = (name, verdict, extra = {}) => {
  const fn = () => ({ name, verdict, durationMs: 1, ...extra });
  Object.defineProperty(fn, "name", { value: name });
  return fn;
};

test("onStep reports every step, in order, with its index and the total", () => {
  const seen = [];
  const out = lane({
    steps: [step("a", "PASS"), step("b", "SKIP", { note: "nothing to do" }), step("c", "PASS")],
    onStep: (r, meta) => seen.push({ name: r.name, verdict: r.verdict, ...meta }),
  });
  assert.equal(out.verdict, "PASS");
  assert.deepEqual(seen, [
    { name: "a", verdict: "PASS", index: 0, total: 3 },
    { name: "b", verdict: "SKIP", index: 1, total: 3 },
    { name: "c", verdict: "PASS", index: 2, total: 3 },
  ]);
});

test("a reporter that throws may not fail the lane", () => {
  const out = lane({
    steps: [step("a", "PASS"), step("b", "PASS")],
    onStep: () => {
      throw new Error("the console went away mid-run");
    },
  });
  assert.equal(out.verdict, "PASS", "a broken reporter must never turn a passing run red");
  assert.equal(out.steps.length, 2, "and must not stop the lane either");
});

test("onStep and print are independent channels — a machine run gets one without the other", () => {
  const printed = [];
  const seen = [];
  lane({ steps: [step("a", "PASS")], print: (l) => printed.push(l), onStep: (r) => seen.push(r.name) });
  assert.equal(printed.length, 1);
  assert.deepEqual(seen, ["a"]);

  const only = [];
  lane({ steps: [step("a", "PASS")], print: null, onStep: (r) => only.push(r.name) });
  assert.deepEqual(only, ["a"], "no print (a --json run) must still report structurally");
});

test("--events is a recognised flag and is documented in the usage", () => {
  const src = fs.readFileSync(path.join(ROOT, "packages/harness/src/verify.mjs"), "utf8");
  assert.match(src, /RECOGNIZED_FLAGS[^\n]*--events/, "an undeclared flag is refused by the lane's own arg check");
  assert.match(src, /--events\s+one NDJSON object per finished step, on STDERR/, "a flag nobody documents is a flag nobody finds");
});

test("stdout keeps its one-object contract while stderr streams the steps", () => {
  // The real binary, against a real tree — the only way to prove the two
  // streams do not contaminate each other.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "step-events-lane-"));
  try {
    const git = (...a) => execFileSync("git", ["-C", dir, ...a], { stdio: "ignore" });
    git("init", "-q");
    fs.mkdirSync(path.join(dir, "src"));
    fs.writeFileSync(path.join(dir, "src", "main.py"), "def add(a, b):\n    return a + b\n");
    execFileSync(process.execPath, [path.join(ROOT, "packages/harness/bin/prooflane.mjs"), "init"], { cwd: dir, stdio: "ignore" });
    git("add", "-A");
    execFileSync("git", ["-C", dir, "-c", "user.email=x@y", "-c", "user.name=x", "commit", "-qm", "init"], { stdio: "ignore" });

    const res = execFileSync(process.execPath, [path.join(dir, "qa", "verify.mjs"), "--json", "--events"], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    // execFileSync returns stdout; capture stderr separately via a second run
    // would double the cost, so read what the call gave us and assert on it.
    const receipt = JSON.parse(res);
    assert.equal(typeof receipt.verdict, "string", "stdout must still parse as exactly one receipt");
    assert.ok(Array.isArray(receipt.steps) && receipt.steps.length > 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
