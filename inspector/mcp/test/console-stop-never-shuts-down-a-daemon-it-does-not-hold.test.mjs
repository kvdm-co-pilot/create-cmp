// stop() NEVER SENDS /shutdown TO A DAEMON THIS CONSOLE DOES NOT HOLD (review of KD-204).
//
// KD-204 gated stop()'s `GET <daemonUrl>/shutdown` on `daemonOurs`, which is set the
// moment a daemon child is SPAWNED (`adoptDaemonChild`) and never cleared. The case
// KD-204 is about is the port being someone else's — and that is exactly when our own
// spawned daemon cannot bind it and exits. The console notices (the child's exit
// handler logs it, drops back to gradle, nulls `daemonChild`), yet `daemonOurs` stays
// true, so stop() shuts down ANOTHER PROJECT's daemon: the one `daemonHealthy()` had
// just refused to reuse because it serves a different previewsDir.
//
// THE CLASS: /shutdown goes to the daemon port only while this console holds a daemon
// there — a live child it started, or one whose /health named this project.

import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { createPreviewService } from "../src/lib/preview-service.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("a daemon we spawned that exited leaves the port's other owner un-shut-down on stop()", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-console-stop-held-"));
  fs.mkdirSync(path.join(root, "qa", "evidence"), { recursive: true });
  fs.mkdirSync(path.join(root, "composeApp", "src"), { recursive: true });
  // Another project's daemon holds the daemon port.
  const seen = [];
  const other = http.createServer((req, res) => {
    seen.push(req.url);
    const body = req.url.startsWith("/health") ? { previewsDir: "/some/other/project/composeApp/build/previews" } : {};
    res.writeHead(200, { "content-type": "application/json", connection: "close" });
    res.end(JSON.stringify(body));
  });
  await new Promise((r) => other.listen(0, "127.0.0.1", r));
  const daemonUrl = `http://127.0.0.1:${other.address().port}`;
  // Our daemon cannot bind the port it is given, so it exits — as a real one would.
  let spawned = 0;
  let exited = false;
  const spawnDaemon = () => {
    spawned += 1;
    const child = new EventEmitter();
    child.kill = () => {};
    setTimeout(() => {
      exited = true;
      child.emit("exit", 1);
    }, 50);
    return child;
  };
  const service = createPreviewService({ projectDir: root, port: 0, hot: true, daemonUrl, spawnDaemon, runRender: async () => {} });
  try {
    await service.start();
    const deadline = Date.now() + 5000;
    while (!exited && Date.now() < deadline) await sleep(25);
    assert.ok(spawned === 1 && exited, "the premise: the console spawned its own daemon and saw it exit");
    await sleep(100);
    service.stop();
    await sleep(400); // fire-and-forget: give the request every chance to land
    const shutdowns = seen.filter((u) => u.startsWith("/shutdown"));
    assert.deepEqual(shutdowns, [], `stop() shut down another project's daemon; it was sent: ${seen.join(", ")}`);
  } finally {
    await new Promise((r) => other.close(r));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
