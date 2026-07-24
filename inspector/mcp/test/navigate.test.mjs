import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveTapTarget,
  navSummary,
  navigateAndInspect,
  writeLiveScreenshot,
  DEFAULT_SETTLE_MS,
} from "../src/lib/navigate.mjs";
import { postTap, fetchLiveScreenshot } from "../src/lib/live.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const tinyPng = fs.readFileSync(path.join(here, "..", "fixtures", "tiny-2x2.png"));

const node = (over = {}) => ({
  testTag: null,
  text: null,
  contentDescription: null,
  bounds: { x: 0, y: 0, width: 100, height: 40 },
  designToken: null,
  children: [],
  ...over,
});

const homeTree = {
  schemaVersion: 1,
  source: "live-android",
  root: node({
    bounds: { x: 0, y: 0, width: 360, height: 800 },
    children: [
      node({ testTag: "home_title", text: "Home", bounds: { x: 16, y: 16, width: 328, height: 40 } }),
      node({ text: "Card One", clickable: true, bounds: { x: 16, y: 72, width: 328, height: 80 } }),
      node({ testTag: "app_bottom_nav", bounds: { x: 0, y: 728, width: 360, height: 72 } }),
    ],
  }),
};

const detailTree = {
  schemaVersion: 1,
  source: "live-android",
  root: node({
    bounds: { x: 0, y: 0, width: 360, height: 800 },
    children: [
      node({ text: "Detail", bounds: { x: 16, y: 16, width: 328, height: 40 } }),
      node({ text: "Item id: 1", bounds: { x: 16, y: 64, width: 328, height: 24 } }),
    ],
  }),
};

// Stateful stub of the on-device inspector server: GET routes serve queued tree
// payloads; POST /inspect/tap records the exact request (payload shape proof);
// GET /inspect/screenshot serves real PNG bytes. `navs` (optional) queues
// GET /inspect/nav responses in call order; omit to simulate an app without the route (404).
function startStub({ trees = [], screenshot = tinyPng, navs = null } = {}) {
  const seen = { taps: [], treeFetches: 0, navFetches: 0, screenshotFetches: 0 };
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.method === "GET" && req.url.startsWith("/inspect/tree")) {
        const tree = trees[Math.min(seen.treeFetches, trees.length - 1)];
        seen.treeFetches++;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(tree));
        return;
      }
      if (req.method === "GET" && req.url.startsWith("/inspect/nav")) {
        seen.navFetches++;
        if (!navs) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "unknown path" }));
          return;
        }
        const nav = navs[Math.min(seen.navFetches - 1, navs.length - 1)];
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(nav));
        return;
      }
      if (req.method === "GET" && req.url.startsWith("/inspect/screenshot")) {
        const body = Array.isArray(screenshot)
          ? screenshot[Math.min(seen.screenshotFetches, screenshot.length - 1)]
          : screenshot;
        seen.screenshotFetches++;
        res.writeHead(200, { "Content-Type": "image/png" });
        res.end(body);
        return;
      }
      if (req.method === "POST" && req.url === "/inspect/tap") {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          seen.taps.push({ body, contentType: req.headers["content-type"] });
          const { x, y } = JSON.parse(body);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ tapped: true, x, y }));
        });
        return;
      }
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unknown path" }));
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port, seen }));
  });
}

// ---------------------------------------------------------------------------
// resolveTapTarget — coordinate resolution
// ---------------------------------------------------------------------------

test("resolveTapTarget: testTag resolves to the center of the node's bounds", () => {
  const target = resolveTapTarget(homeTree, { testTag: "home_title" });
  assert.deepEqual(target, { x: 16 + 328 / 2, y: 16 + 20, testTag: "home_title" });
});

test("resolveTapTarget: unknown testTag errors listing the available tags", () => {
  assert.throws(
    () => resolveTapTarget(homeTree, { testTag: "nope" }),
    (err) => {
      assert.match(err.message, /No node found with testTag 'nope'/);
      assert.match(err.message, /Available tags: home_title, app_bottom_nav/);
      return true;
    }
  );
});

test("resolveTapTarget: explicit x/y pass through (rounded)", () => {
  assert.deepEqual(resolveTapTarget(homeTree, { x: 100.6, y: 40.2 }), { x: 101, y: 40 });
});

test("resolveTapTarget: neither testTag nor x/y is a clear error", () => {
  assert.throws(() => resolveTapTarget(homeTree, {}), /either `testTag`.*or explicit numeric `x` and `y`/s);
  assert.throws(() => resolveTapTarget(homeTree, { x: 10 }), /`x` and `y`/);
});

test("navSummary: tags, textSample and nodeCount", () => {
  const s = navSummary(homeTree);
  assert.deepEqual(s.tags, ["home_title", "app_bottom_nav"]);
  assert.deepEqual(s.textSample, ["Home", "Card One"]);
  assert.equal(s.nodeCount, 4);
});

// ---------------------------------------------------------------------------
// navigateAndInspect — the full loop against the stub
// ---------------------------------------------------------------------------

test("navigateAndInspect: taps by tag, waits settleMs, reports before/after and changed:true", async () => {
  const { server, port, seen } = await startStub({ trees: [homeTree, detailTree] });
  const slept = [];
  try {
    const result = await navigateAndInspect({
      testTag: "home_title",
      port,
      settleMs: 5,
      sleep: (ms) => (slept.push(ms), Promise.resolve()),
    });
    assert.deepEqual(result.tapped, { x: 180, y: 36, testTag: "home_title" });
    assert.deepEqual(slept, [5], "waits exactly settleMs between tap and re-fetch");
    assert.equal(seen.treeFetches, 2, "one tree fetch before, one after");
    assert.deepEqual(result.before.tags, ["home_title", "app_bottom_nav"]);
    assert.deepEqual(result.after.textSample, ["Detail", "Item id: 1"]);
    assert.equal(result.after.nodeCount, 3);
    assert.equal(result.changed, true);
  } finally {
    server.close();
  }
});

test("navigateAndInspect: POST /inspect/tap payload is exactly {x,y} JSON", async () => {
  const { server, port, seen } = await startStub({ trees: [homeTree, detailTree] });
  try {
    await navigateAndInspect({ x: 120, y: 340, port, settleMs: 0, sleep: () => Promise.resolve() });
    assert.equal(seen.taps.length, 1);
    assert.match(seen.taps[0].contentType, /application\/json/);
    assert.deepEqual(JSON.parse(seen.taps[0].body), { x: 120, y: 340 });
  } finally {
    server.close();
  }
});

test("navigateAndInspect: identical tree after the tap reports changed:false", async () => {
  const { server, port } = await startStub({ trees: [homeTree, homeTree] });
  try {
    const result = await navigateAndInspect({
      testTag: "app_bottom_nav",
      port,
      settleMs: 0,
      sleep: () => Promise.resolve(),
    });
    assert.equal(result.changed, false);
  } finally {
    server.close();
  }
});

test("navigateAndInspect: includes route.before/after when the app exposes /inspect/nav", async () => {
  const { server, port } = await startStub({
    trees: [homeTree, detailTree],
    navs: [{ currentRoute: "shell", backStack: ["shell"] }, { currentRoute: "detail/1", backStack: ["shell", "detail/1"] }],
  });
  try {
    const result = await navigateAndInspect({ testTag: "home_title", port, settleMs: 0, sleep: () => Promise.resolve() });
    assert.deepEqual(result.route, { before: "shell", after: "detail/1" });
  } finally {
    server.close();
  }
});

test("navigateAndInspect: omits `route` entirely when the app has no /inspect/nav (older app)", async () => {
  const { server, port } = await startStub({ trees: [homeTree, detailTree] }); // navs: null → 404
  try {
    const result = await navigateAndInspect({ testTag: "home_title", port, settleMs: 0, sleep: () => Promise.resolve() });
    assert.equal("route" in result, false, "no route field at all when the endpoint is absent");
  } finally {
    server.close();
  }
});

test("navigateAndInspect: default settleMs is 1500", async () => {
  const { server, port } = await startStub({ trees: [homeTree, detailTree] });
  const slept = [];
  try {
    await navigateAndInspect({ x: 1, y: 1, port, sleep: (ms) => (slept.push(ms), Promise.resolve()) });
    assert.deepEqual(slept, [DEFAULT_SETTLE_MS]);
    assert.equal(DEFAULT_SETTLE_MS, 1500);
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// live screenshot — path-only pixel contract
// ---------------------------------------------------------------------------

test("writeLiveScreenshot: writes the PNG to `out` and returns path-only metadata (no bytes)", async () => {
  const { server, port } = await startStub({});
  const out = path.join(os.tmpdir(), `cmp-nav-test-${Date.now()}`, "live.png");
  try {
    const meta = await writeLiveScreenshot({ port, out });
    assert.equal(meta.path, path.resolve(out));
    assert.equal(meta.width, 2);
    assert.equal(meta.height, 2);
    assert.equal(meta.sizeBytes, tinyPng.length);
    assert.deepEqual(
      Object.keys(meta).sort(),
      ["height", "path", "sha256", "sizeBytes", "width"],
      "metadata + capture hash only — never bytes/base64"
    );
    assert.ok(fs.readFileSync(out).equals(tinyPng), "file on disk is the exact PNG served");
  } finally {
    server.close();
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
  }
});

test("writeLiveScreenshot: defaults to a temp file when out is omitted", async () => {
  const { server, port } = await startStub({});
  try {
    const meta = await writeLiveScreenshot({ port });
    assert.ok(meta.path.includes("cmp-inspector"), "temp path under a cmp-inspector dir");
    assert.equal(meta.width, 2);
    fs.rmSync(meta.path, { force: true });
  } finally {
    server.close();
  }
});

// The stale-frame tripwire (DOGFOODING-FINDINGS "render_screen{live} serves a STALE
// cached frame"): two captures of two DIFFERENT screens must hash differently, and the
// hash must be the honest sha256 of the served bytes — it is the only way a caller can
// prove freshness, since the pixels themselves never enter model context.
test("writeLiveScreenshot: sha256 is the real hash of the bytes — different frames differ, identical frames match", async () => {
  const secondPng = Buffer.concat([tinyPng, Buffer.from([0x00])]); // valid header, different bytes
  const { server, port } = await startStub({ screenshot: [tinyPng, secondPng, secondPng] });
  const dir = path.join(os.tmpdir(), `cmp-nav-test-${Date.now()}`);
  try {
    const first = await writeLiveScreenshot({ port, out: path.join(dir, "1.png") });
    const second = await writeLiveScreenshot({ port, out: path.join(dir, "2.png") });
    const third = await writeLiveScreenshot({ port, out: path.join(dir, "3.png") });
    const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
    assert.equal(first.sha256, sha(tinyPng), "hash is of the exact served bytes");
    assert.equal(second.sha256, sha(secondPng));
    assert.notEqual(first.sha256, second.sha256, "different frames must never hash the same");
    assert.equal(second.sha256, third.sha256, "an unchanged frame hashes the same (legitimate)");
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("fetchLiveScreenshot: non-PNG error responses surface the server's JSON error", async () => {
  const seen = await new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "compose root not ready yet — retry shortly." }));
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
  try {
    await assert.rejects(
      () => fetchLiveScreenshot({ port: seen.port }),
      /live inspector not ready: compose root not ready/
    );
  } finally {
    seen.server.close();
  }
});

test("postTap: rejects non-numeric coordinates before any network call", () => {
  assert.throws(() => postTap({ x: "12", y: 5 }), /numeric x and y/);
  assert.throws(() => postTap({ x: 12 }), /numeric x and y/);
});
