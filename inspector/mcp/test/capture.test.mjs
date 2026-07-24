// capture.mjs — the atomic same-frame verb (C6) and the verified relaunch (C10).
// Contracts under test: the pixels-tree-pixels sandwich only accepts a stable
// frame; staleness is refused, not papered over; relaunch is proven by
// processStartedAtMs moving forward, never assumed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { captureScreen, relaunchApp } from "../src/lib/capture.mjs";

// A real 1x1 PNG so readPngMeta parses the written file.
const PNG_A = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d4944415478da63640000000600023081d02f0000000049454e44ae426082",
  "hex"
);
const PNG_B = Buffer.concat([PNG_A, Buffer.from([0x00])]); // different bytes -> different hash

const TREE = { role: "root", children: [] };

// Transport stub: serves a scripted sequence of screenshot bodies; tree/nav are static.
function fetchStub(screens) {
  let i = 0;
  return async (url) => {
    const path = new URL(url).pathname;
    const body =
      path === "/inspect/screenshot"
        ? screens[Math.min(i++, screens.length - 1)]
        : path === "/inspect/tree"
          ? Buffer.from(JSON.stringify(TREE))
          : Buffer.from(JSON.stringify({ currentRoute: "shell", backStack: ["shell"] }));
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
      text: async () => body.toString("utf8"),
      json: async () => JSON.parse(body.toString("utf8")),
      headers: { get: () => (path === "/inspect/screenshot" ? "image/png" : "application/json") },
    };
  };
}

const outDir = () => mkdtempSync(join(tmpdir(), "capture-test-"));

test("captureScreen: stable frame -> pixels, tree and route in one result, attempt 1", async () => {
  const out = join(outDir(), "shot.png");
  const r = await captureScreen({ out, fetchImpl: fetchStub([PNG_A, PNG_A]), sleep: async () => {} });
  assert.equal(r.attempts, 1);
  assert.equal(r.route, "shell");
  assert.deepEqual(r.tree, TREE);
  assert.equal(readFileSync(out).length, PNG_A.length, "the FIRST read's bytes are what lands on disk");
});

test("captureScreen: frame moves mid-observation -> retried, succeeds on the stable pair", async () => {
  // attempt 1: A then B (unstable). attempt 2: B then B (stable).
  const r = await captureScreen({
    out: join(outDir(), "shot.png"),
    fetchImpl: fetchStub([PNG_A, PNG_B, PNG_B, PNG_B]),
    sleep: async () => {},
  });
  assert.equal(r.attempts, 2);
});

test("captureScreen: never-stable frame -> honest failure carrying both hashes", async () => {
  // Alternate every read so no sandwich ever matches.
  const alternating = [PNG_A, PNG_B, PNG_A, PNG_B, PNG_A, PNG_B];
  await assert.rejects(
    captureScreen({
      out: join(outDir(), "shot.png"),
      fetchImpl: fetchStub(alternating),
      sleep: async () => {},
      maxAttempts: 3,
    }),
    /never stabilised across 3 attempts/
  );
});

test("captureScreen: refuses a frame identical to the previous capture (stale tripwire)", async () => {
  const first = await captureScreen({
    out: join(outDir(), "a.png"),
    fetchImpl: fetchStub([PNG_A, PNG_A]),
    sleep: async () => {},
  });
  await assert.rejects(
    captureScreen({
      out: join(outDir(), "b.png"),
      fetchImpl: fetchStub([PNG_A, PNG_A]),
      previousSha256: first.sha256,
      sleep: async () => {},
    }),
    /byte-identical to the previous capture/
  );
  // allowSame opts out, and the result says so.
  const again = await captureScreen({
    out: join(outDir(), "c.png"),
    fetchImpl: fetchStub([PNG_A, PNG_A]),
    previousSha256: first.sha256,
    allowSame: true,
    sleep: async () => {},
  });
  assert.equal(again.sameAsPrevious, true);
});

test("relaunchApp: proven by processStartedAtMs advancing; adb sequence recorded", async () => {
  const calls = [];
  let started = 1_000;
  const r = await relaunchApp({
    appId: "com.example.app",
    clearState: true,
    exec: async (cmd, args) => {
      calls.push([cmd, ...args].join(" "));
      if (args.includes("monkey")) started = 2_000; // launch -> new process start
    },
    fetchHealthImpl: async () => ({ processStartedAtMs: started }),
    sleep: async () => {},
  });
  assert.equal(r.beforeStartedAtMs, 1_000);
  assert.equal(r.afterStartedAtMs, 2_000);
  assert.equal(r.clearedState, true);
  assert.ok(calls.some((c) => c.includes("force-stop")), "force-stop issued");
  assert.ok(calls.some((c) => c.includes("pm clear")), "pm clear issued when clearState");
  const order = [calls.findIndex((c) => c.includes("force-stop")), calls.findIndex((c) => c.includes("pm clear")), calls.findIndex((c) => c.includes("monkey"))];
  assert.deepEqual([...order].sort((a, b) => a - b), order, "force-stop -> pm clear -> launch, in that order");
});

test("relaunchApp: a process that never restarts is an error, not a success", async () => {
  await assert.rejects(
    relaunchApp({
      appId: "com.example.app",
      exec: async () => {},
      fetchHealthImpl: async () => ({ processStartedAtMs: 1_000 }), // never advances
      sleep: async () => {},
      waitTimeoutMs: 30, // a few poll iterations, then give up
    }),
    /no fresh process within/
  );
});
