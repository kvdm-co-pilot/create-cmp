// WHAT A CONSOLE DOES AROUND ITS OWN STOP — the three defects that together took a
// suite from "a test passed" to "a passed test is recorded as FAILED" (KD-56's
// kept message; KD-202, KD-203, KD-204).
//
// The real service over real HTTP and raw sockets: the defects live in the timing
// between `server.close()` and a request already on the wire, which a call on the
// service object cannot reach.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { createPreviewService } from "../src/lib/preview-service.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-console-stop-"));
  fs.mkdirSync(path.join(root, "qa", "evidence"), { recursive: true });
  return root;
}

/** A port the OS says is free right now. */
async function freePort() {
  const srv = http.createServer();
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const { port } = srv.address();
  await new Promise((r) => srv.close(r));
  return port;
}

test("a request in flight when stop() runs never becomes an unhandled rejection (KD-202)", async () => {
  // The recipe that reproduced it: a raw socket sends HALF a request, the console
  // stops, the socket sends the rest. `server.close()` does not end a connection
  // whose request is already arriving, so the handler runs after `port` was nulled
  // — and built `http://127.0.0.1:null` outside its try.
  const root = makeProject();
  const rejections = [];
  const onRejection = (reason) => rejections.push(reason);
  process.on("unhandledRejection", onRejection);
  const service = createPreviewService({ projectDir: root, port: await freePort(), hot: false, runRender: async () => {} });
  let socket = null;
  let stopped = false;
  try {
    const { url } = await service.start();
    socket = net.connect(Number(new URL(url).port), "127.0.0.1");
    await new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
    const answered = new Promise((resolve) => {
      let got = "";
      socket.on("data", (b) => (got += b.toString()));
      socket.on("close", () => resolve(got));
      socket.on("error", () => resolve(got));
      setTimeout(() => resolve(got), 3000);
    });
    socket.write("GET /status HTTP/1.1\r\nHost: 127.0.0.1\r\n");
    await sleep(100);
    service.stop();
    stopped = true;
    socket.write("Connection: close\r\n\r\n"); // the rest of the request
    await answered;
    await sleep(100); // an async listener's rejection surfaces on a later tick
    assert.deepEqual(
      rejections.map((r) => String(r?.stack ?? r)),
      [],
      "a request that arrived during stop() threw out of the async request listener"
    );
  } finally {
    process.off("unhandledRejection", onRejection);
    if (socket) socket.destroy();
    if (!stopped) service.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("`port: 0` binds a port the OS picked, and the console reports the port it bound (KD-203)", async () => {
  // `0 || 9600` was 9600: a caller asking for an ephemeral port got the console's
  // well-known one, probing upward — measured binding 9601, the daemon's port. And
  // the bound port was assumed from the argument, so with `0` it would have been 0.
  const root = makeProject();
  const service = createPreviewService({ projectDir: root, port: 0, hot: false, runRender: async () => {} });
  try {
    const st = await service.start();
    const bound = Number(new URL(st.url).port);
    assert.ok(Number.isInteger(bound) && bound > 0, `the console reports port ${JSON.stringify(new URL(st.url).port)}`);
    assert.ok(bound !== 9600 && bound !== 9601, `asked for an OS-picked port, bound the well-known ${bound}`);
    // The reported port is the one that answers. node:http with `agent: false`, not
    // fetch: a pooled socket outliving the service would be the noise KD-202 was.
    const code = await new Promise((resolve, reject) => {
      const req = http.get({ host: "127.0.0.1", port: bound, path: "/status", agent: false }, (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      });
      req.on("error", reject);
    });
    assert.equal(code, 200, "the port the console reports is not the one it listens on");
  } finally {
    service.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/** An HTTP server that records every path it is sent, answering as a daemon would. */
async function bystander(health = () => ({})) {
  const seen = [];
  const srv = http.createServer((req, res) => {
    seen.push(req.url);
    const pathname = new URL(req.url, "http://127.0.0.1").pathname;
    const body = pathname === "/health" ? health() : pathname === "/render" ? { rendered: [], ms: 0 } : {};
    res.writeHead(200, { "content-type": "application/json", connection: "close" });
    res.end(JSON.stringify(body));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return {
    seen,
    url: `http://127.0.0.1:${srv.address().port}`,
    close: () => new Promise((r) => srv.close(r)),
  };
}

async function until(predicate, ms, what) {
  const deadline = Date.now() + ms;
  while (!predicate() && Date.now() < deadline) await sleep(25);
  assert.ok(predicate(), `timed out waiting for ${what}`);
}

test("a console that started no daemon sends no /shutdown to whatever holds the daemon port (KD-204)", async () => {
  // Measured before the fix: a bystander on the daemon port received `GET /shutdown`
  // from a `hot: false` console's stop — every console, in every process, sent one to
  // a fixed address anything may be listening on.
  const root = makeProject();
  const other = await bystander();
  const service = createPreviewService({ projectDir: root, port: 0, hot: false, daemonUrl: other.url, runRender: async () => {} });
  try {
    await service.start();
    service.stop();
    await sleep(400); // the request was fire-and-forget; give one every chance to land
    assert.deepEqual(other.seen, [], `a console that never started or confirmed a daemon sent: ${other.seen.join(", ")}`);
  } finally {
    await other.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the control: a daemon this console confirmed is still sent /shutdown on stop", async () => {
  // A healthy daemon serving THIS project's previews is adopted (daemonHealthy), and
  // stopping the console asks it to exit — the teardown the request exists for.
  const root = makeProject();
  fs.mkdirSync(path.join(root, "composeApp", "src"), { recursive: true });
  const previewsDir = path.join(path.resolve(root), "composeApp", "build", "previews");
  const daemon = await bystander(() => ({ previewsDir }));
  const service = createPreviewService({ projectDir: root, port: 0, hot: true, daemonUrl: daemon.url, runRender: async () => {} });
  let stopped = false;
  try {
    await service.start();
    await until(() => service.status().daemon?.active === true, 8000, "the console to adopt the daemon");
    service.stop();
    stopped = true;
    await until(() => daemon.seen.some((p) => p.startsWith("/shutdown")), 3000, "GET /shutdown at the confirmed daemon");
  } finally {
    if (!stopped) service.stop();
    await daemon.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
