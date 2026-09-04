// The lane's pulse. The steps are SYNCHRONOUS, so no timer in the lane process
// can fire while Gradle runs — fourteen minutes of silence was the observed
// result. The narrator is a second process reading the marker the lane already
// stamps. (docs/proposals/evidence-economics.md C4.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pulseLine, shortDuration } from "../packages/harness/src/lib/lane-narrator.mjs";

const NARRATOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../packages/harness/src/lib/lane-narrator.mjs");
const marker = { step: "releaseBuild", index: 9, total: 16, expectedStepMs: 120_000 };

test("quiet under twenty seconds — a short step is not a wait", () => {
  assert.equal(pulseLine(marker, 5_000, null), null);
  assert.equal(pulseLine(marker, 19_999, null), null);
});

test("speaks at twenty seconds, then every thirty — never more often", () => {
  assert.equal(pulseLine(marker, 45_000, null), "⋯ releaseBuild (9/16) — 45s elapsed, usually ~2m00s");
  assert.equal(pulseLine(marker, 50_000, 45_000), null, "five seconds after the last line is too soon");
  assert.ok(pulseLine(marker, 75_000, 45_000), "thirty seconds after is due");
});

test("past 1.5× its usual time it says so — the fact that separates grinding from wedged", () => {
  assert.match(pulseLine(marker, 200_000, 45_000), /longer than usual/);
  assert.doesNotMatch(pulseLine(marker, 100_000, 45_000), /longer than usual/);
});

test("no expectation is stated when the journal has none — never an estimate", () => {
  const line = pulseLine({ step: "build", index: 8, total: 16, expectedStepMs: null }, 45_000, null);
  assert.equal(line, "⋯ build (8/16) — 45s elapsed");
});

test("a legacy 'pid iso' marker narrates nothing rather than inventing a step", () => {
  assert.equal(pulseLine(null, 99_000, null), null);
  assert.equal(pulseLine({ pid: 1 }, 99_000, null), null);
});

test("shortDuration fits on one line", () => {
  assert.equal(shortDuration(42_000), "42s");
  assert.equal(shortDuration(252_000), "4m12s");
  assert.equal(shortDuration(0), "0s");
});

test("as a process: it reads the marker the lane stamps and writes ONE line to stderr, nothing to stdout", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-narrator-"));
  const markerPath = path.join(root, "qa", ".lane-in-progress");
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  // A step that started 25s ago — already past the quiet window, so the first
  // poll (1s) must speak.
  fs.writeFileSync(
    markerPath,
    JSON.stringify({ ...marker, stepStartedAt: new Date(Date.now() - 25_000).toISOString() }),
  );
  const child = spawn(process.execPath, [NARRATOR, root], { stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  let err = "";
  child.stdout.on("data", (b) => (out += b));
  child.stderr.on("data", (b) => (err += b));
  await new Promise((r) => setTimeout(r, 2_500));
  child.kill("SIGTERM");
  await new Promise((r) => child.on("exit", r));
  assert.equal(out, "", "stdout stays the lane's — --json consumers parse it");
  assert.match(err, /⋯ releaseBuild \(9\/16\) — 2[5-7]s elapsed, usually ~2m00s/);
  assert.equal(err.trim().split("\n").length, 1, "one line, not one per poll");
});
