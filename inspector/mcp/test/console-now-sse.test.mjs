// The transport, end to end: a line lands in the lane's step stream and the
// page's own SSE connection carries the row that goes on screen.
//
// docs/proposals/LIVE-CONSOLE.md Phase B's decision is "artifact-and-tail, not
// a push endpoint" — so there is no new endpoint to test. What there IS to
// test is that the EXISTING /events stream rebroadcasts what the tail read,
// and that what it sends is the rendered ROW rather than raw data the page
// would have to interpret. The page deriving nothing is the property; the
// wire is where it is observable.
//
// The real service over real HTTP, for console-protocol.test.mjs's reason:
// anything proven through the service object would prove the wrong thing.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";

import { createPreviewService } from "../src/lib/preview-service.mjs";

// The stream is read against the READER's clock — the harness's own lane-marker
// bound decides when a silent run is a dead one — so the fixture's instants are
// relative to NOW. A fixed date would make every run in this file read as a
// lane that stopped hours ago, which is a true reading of a fixture that lied.
const NAMES = ["harnessIntegrity", "unitTests", "build"];
const START = JSON.stringify({
  event: "run", phase: "start", runId: "r1", startedAt: new Date().toISOString(), profile: "local", mode: "full", total: 3, steps: NAMES,
});
const step = (index, verdict, extra = {}) =>
  JSON.stringify({ event: "step", runId: "r1", at: new Date().toISOString(), index, total: 3, name: NAMES[index], verdict, durationMs: 12, ...extra });

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-now-sse-"));
  fs.mkdirSync(path.join(root, "qa", "evidence"), { recursive: true });
  return root;
}

/**
 * One live text/event-stream connection, with a wait-for-N-frames helper.
 *
 * node:http with `agent: false` rather than fetch(): fetch pools its
 * connections, and a pooled socket outliving the service that answered on it
 * sends a request into a server that has already stopped — noise from the
 * test's own client, mistakable for a defect in the console. One socket, owned
 * here, destroyed here.
 */
function openStream(url) {
  const frames = [];
  let buf = "";
  let closed = false;
  let socket = null;
  const ready = new Promise((resolve, reject) => {
    const req = http.get(`${url}events`, { agent: false, headers: { accept: "text/event-stream" } }, (res) => {
      assert.equal(res.headers["content-type"], "text/event-stream");
      socket = res.socket;
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf("\n\n")) !== -1) {
          const frame = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (line) frames.push(JSON.parse(line.slice(6)));
        }
      });
      res.on("close", () => { closed = true; });
      resolve();
    });
    req.on("error", reject);
  });
  return {
    frames,
    ready,
    async waitFor(n, ms = 8000) {
      await ready;
      const deadline = Date.now() + ms;
      while (frames.length < n && !closed && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
      assert.ok(frames.length >= n, `expected ${n} SSE frames, saw ${frames.length}: ${JSON.stringify(frames).slice(0, 400)}`);
    },
    close: () => {
      if (socket) socket.destroy();
    },
  };
}

test("every connect gets the CURRENT rows in full — a page reconnecting is never left guessing what it missed", async () => {
  const root = makeProject();
  fs.writeFileSync(path.join(root, "qa", ".lane-steps.ndjson"), `${START}\n${step(0, "PASS")}\n`);
  const service = createPreviewService({ projectDir: root, port: 0, hot: false, runRender: async () => {} });
  const { url } = await service.start();
  const sse = openStream(url);
  try {
    await sse.waitFor(2);
    assert.equal(sse.frames[0].type, "hello", "the build handshake still comes first");
    const frame = sse.frames[1];
    assert.equal(frame.type, "step");
    assert.equal(frame.runId, "r1");
    assert.equal(frame.clear, true, "a connect REPLACES what the page has — the one honest moment to do so");
    assert.deepEqual(frame.rows.map((r) => r.index), [0, 1, 2]);
    assert.match(frame.rows[0].html, /harnessIntegrity/);
    assert.match(frame.rows[1].html, /now-running/, "the step after the last finished one is the one running");
    assert.match(frame.headHtml, /RUNNING/);
  } finally {
    sse.close(); // this test owns the socket; drop it before the server goes
    service.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a line appended to the stream arrives as the RENDERED row — the page interprets nothing", async () => {
  const root = makeProject();
  const file = path.join(root, "qa", ".lane-steps.ndjson");
  fs.writeFileSync(file, `${START}\n`);
  const service = createPreviewService({ projectDir: root, port: 0, hot: false, runRender: async () => {} });
  const { url } = await service.start();
  const sse = openStream(url);
  try {
    await sse.waitFor(2); // hello + the connect frame

    fs.appendFileSync(file, `${step(0, "FAIL", { reason: "error: boom (src/x:1)\nfix: unboom it" })}\n`);
    await sse.waitFor(3);

    const frame = sse.frames[2];
    assert.equal(frame.type, "step");
    assert.equal(frame.clear, false, "a step frame APPENDS — it never clears the list");
    assert.deepEqual(frame.rows.map((r) => r.index), [0, 1], "only the finished row and the newly running one");
    // The row is HTML the SERVER rendered, carrying the tool's own words.
    assert.match(frame.rows[0].html, /step-verdict-fail/);
    assert.match(frame.rows[0].html, /error: boom \(src\/x:1\)/);
    assert.match(frame.rows[0].html, /fix: unboom it/, "the tool's own fix, verbatim — never reworded");
    assert.match(frame.rows[0].html, /data-index="0"/, "and the index the page files it under");
  } finally {
    sse.close(); // this test owns the socket; drop it before the server goes
    service.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a project that never ran the lane broadcasts NOTHING — silence, not an empty run", async () => {
  const root = makeProject();
  const service = createPreviewService({ projectDir: root, port: 0, hot: false, runRender: async () => {} });
  const { url } = await service.start();
  const sse = openStream(url);
  try {
    await sse.waitFor(1);
    await new Promise((r) => setTimeout(r, 250));
    assert.deepEqual(
      sse.frames.map((f) => f.type),
      ["hello"],
      "a frame whose content is 'there is nothing' tells the page nothing it does not already show, and §4 is evidence-or-silence",
    );
  } finally {
    sse.close(); // this test owns the socket; drop it before the server goes
    service.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
