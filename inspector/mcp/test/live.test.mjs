import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import {
  fetchHealth,
  fetchLiveTree,
  fetchLiveCatalog,
  validatePort,
  validateSerial,
  DEFAULT_PORT,
} from "../src/lib/live.mjs";

// Tiny stub of the on-device inspector server (loopback only, like the real one).
function startStub(routes) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const route = routes[req.url];
      if (!route) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "unknown path" }));
        return;
      }
      const [status, body] = route;
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

test("fetchHealth / fetchLiveTree / fetchLiveCatalog hit the stub and parse JSON", async () => {
  const tree = { schemaVersion: 1, source: "live-android", root: { testTag: null, children: [] } };
  const { server, port } = await startStub({
    "/inspect/health": [200, { status: "ok", schemaVersion: 1, source: "live-android", buildType: "debug" }],
    "/inspect/tree": [200, tree],
    "/inspect/design-system": [200, { colors: { Primary: "#0A2540" }, dimens: { PaddingPage: "16dp" } }],
  });
  try {
    const health = await fetchHealth({ port });
    assert.equal(health.status, "ok");
    assert.equal(health.buildType, "debug");

    const t = await fetchLiveTree({ port });
    assert.equal(t.source, "live-android");
    assert.ok(t.root);

    const catalog = await fetchLiveCatalog({ port });
    assert.equal(catalog.dimens.PaddingPage, "16dp");
  } finally {
    server.close();
  }
});

test("connection refused maps to an actionable error (app running? connect_live?)", async () => {
  // Grab a port that is definitely closed: open a server, note the port, close it.
  const { server, port } = await startStub({});
  await new Promise((r) => server.close(r));
  await assert.rejects(
    () => fetchLiveTree({ port, timeoutMs: 2000 }),
    (err) => {
      assert.match(err.message, /could not reach the live inspector/);
      assert.match(err.message, /Is the app running/);
      assert.match(err.message, /connect_live/);
      return true;
    }
  );
});

test("503 (compose root not ready) maps to a clear retry message", async () => {
  const { server, port } = await startStub({
    "/inspect/tree": [503, { error: "compose root not ready yet — retry shortly." }],
  });
  try {
    await assert.rejects(
      () => fetchLiveTree({ port }),
      (err) => {
        assert.match(err.message, /not ready/);
        assert.match(err.message, /retry/i);
        return true;
      }
    );
  } finally {
    server.close();
  }
});

test("500 with {error} surfaces the server's message", async () => {
  const { server, port } = await startStub({
    "/inspect/tree": [500, { error: "failed to walk semantics tree: boom" }],
  });
  try {
    await assert.rejects(() => fetchLiveTree({ port }), /failed to walk semantics tree: boom/);
  } finally {
    server.close();
  }
});

test("non-JSON body is reported, not thrown as a parse stack", async () => {
  const { server, port } = await startStub({
    "/inspect/health": [200, "<html>not json</html>"],
  });
  try {
    await assert.rejects(() => fetchHealth({ port }), /non-JSON/);
  } finally {
    server.close();
  }
});

test("validatePort: defaults, accepts valid, rejects garbage", () => {
  assert.equal(validatePort(undefined), DEFAULT_PORT);
  assert.equal(validatePort(9500), 9500);
  assert.throws(() => validatePort(0), /invalid port/);
  assert.throws(() => validatePort(70000), /invalid port/);
  assert.throws(() => validatePort("9500; rm -rf /"), /invalid port/);
});

test("validateSerial: accepts adb-style serials, rejects shell metacharacters", () => {
  assert.equal(validateSerial(undefined), null);
  assert.equal(validateSerial("emulator-5554"), "emulator-5554");
  assert.equal(validateSerial("192.168.1.2:5555"), "192.168.1.2:5555");
  assert.throws(() => validateSerial("evil;rm -rf /"), /invalid adb serial/);
  assert.throws(() => validateSerial("a b"), /invalid adb serial/);
});
