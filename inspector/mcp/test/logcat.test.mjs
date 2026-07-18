import { test } from "node:test";
import assert from "node:assert/strict";

import { parseLogcatLine, parseLogcat } from "../src/lib/logcat.mjs";

const SAMPLE = [
  "07-18 10:23:45.123  1234  1234 I ActivityManager: Displayed com.example.app/.MainActivity",
  "07-18 10:23:45.456  1234  1234 D CmpInspector: inspector server listening on 127.0.0.1:9500",
  "07-18 10:23:46.789  1234  1234 W System.err: some warning text",
  "07-18 10:23:47.012  1234  1234 E AndroidRuntime: FATAL EXCEPTION: main",
  "not a logcat line at all",
  "",
].join("\n");

test("parseLogcatLine: parses timestamp/pid/tid/level/tag/message", () => {
  const e = parseLogcatLine("07-18 10:23:45.123  1234  1234 I ActivityManager: Displayed com.example.app/.MainActivity", { year: 2026 });
  assert.deepEqual(e, {
    timestamp: "2026-07-18T10:23:45.123",
    pid: 1234,
    tid: 1234,
    level: "I",
    tag: "ActivityManager",
    message: "Displayed com.example.app/.MainActivity",
  });
});

test("parseLogcatLine: a non-matching line is null, never throws", () => {
  assert.equal(parseLogcatLine("not a logcat line at all"), null);
  assert.equal(parseLogcatLine(""), null);
});

test("parseLogcat: parses every valid line, skips junk lines", () => {
  const entries = parseLogcat(SAMPLE);
  assert.equal(entries.length, 4);
  assert.deepEqual(entries.map((e) => e.level), ["I", "D", "W", "E"]);
});

test("parseLogcat: level filter keeps that level AND ABOVE (adb semantics)", () => {
  const entries = parseLogcat(SAMPLE, { level: "W" });
  assert.deepEqual(entries.map((e) => e.tag), ["System.err", "AndroidRuntime"]);
});

test("parseLogcat: an unrecognized level filters nothing (best-effort, never throws)", () => {
  assert.equal(parseLogcat(SAMPLE, { level: "NOPE" }).length, 4);
});

test("parseLogcat: since filter keeps entries at/after the given ISO instant", () => {
  // threadtimeToIso defaults to the CURRENT year (logcat carries no year of its own) — build
  // `since` in that same year so this test is robust across calendar years.
  const now = new Date().getFullYear();
  const filtered = parseLogcat(SAMPLE, { since: `${now}-07-18T10:23:46.000` });
  assert.deepEqual(filtered.map((e) => e.tag), ["System.err", "AndroidRuntime"]);
});

test("parseLogcat: an unparseable since filters nothing (best-effort, never throws)", () => {
  assert.equal(parseLogcat(SAMPLE, { since: "not-a-date" }).length, 4);
});

test("parseLogcat: empty/undefined input is an empty array, never throws", () => {
  assert.deepEqual(parseLogcat(""), []);
  assert.deepEqual(parseLogcat(undefined), []);
});
