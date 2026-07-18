import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import {
  fetchHealth,
  fetchLiveTree,
  fetchLiveCatalog,
  fetchLiveNav,
  fetchLiveCrashes,
  fetchLiveDbSchema,
  fetchLiveDbQuery,
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

// ---------------------------------------------------------------------------
// nav / crashes / db — §3.1/§3.2/§3.3 runtime-eyes fetchers
// ---------------------------------------------------------------------------

test("fetchLiveNav: parses { currentRoute, backStack }", async () => {
  const { server, port } = await startStub({
    "/inspect/nav": [200, { currentRoute: "detail/42", backStack: ["shell", "detail/42"] }],
  });
  try {
    const nav = await fetchLiveNav({ port });
    assert.equal(nav.currentRoute, "detail/42");
    assert.deepEqual(nav.backStack, ["shell", "detail/42"]);
  } finally {
    server.close();
  }
});

test("fetchLiveNav: 404 (older app, no route yet) resolves to null, never throws", async () => {
  const { server, port } = await startStub({
    "/inspect/nav": [404, { error: "unknown path" }],
  });
  try {
    assert.equal(await fetchLiveNav({ port }), null);
  } finally {
    server.close();
  }
});

test("fetchLiveNav: a 503 (not the 404 absence case) still throws", async () => {
  const { server, port } = await startStub({
    "/inspect/nav": [503, { error: "compose root not ready yet" }],
  });
  try {
    await assert.rejects(() => fetchLiveNav({ port }), /not ready/);
  } finally {
    server.close();
  }
});

test("fetchLiveCrashes: parses { crashes:[...] }", async () => {
  const crash = { timestamp: "2026-07-18T00:00:00.000Z", exception: "java.lang.NullPointerException", message: null, frames: [] };
  const { server, port } = await startStub({
    "/inspect/crashes": [200, { crashes: [crash] }],
  });
  try {
    const data = await fetchLiveCrashes({ port });
    assert.equal(data.crashes.length, 1);
    assert.equal(data.crashes[0].exception, "java.lang.NullPointerException");
  } finally {
    server.close();
  }
});

test("fetchLiveDbSchema: parses { tables:[...] }", async () => {
  const { server, port } = await startStub({
    "/inspect/db": [200, { tables: [{ name: "items", sql: "CREATE TABLE items (id TEXT)" }] }],
  });
  try {
    const schema = await fetchLiveDbSchema({ port });
    assert.deepEqual(schema.tables, [{ name: "items", sql: "CREATE TABLE items (id TEXT)" }]);
  } finally {
    server.close();
  }
});

test("fetchLiveDbQuery: requires a string table before any network call", () => {
  assert.throws(() => fetchLiveDbQuery({}), /requires a string `table`/);
  assert.throws(() => fetchLiveDbQuery({ table: 42 }), /requires a string `table`/);
});

test("fetchLiveDbQuery: builds the querystring with table + limit and parses rows", async () => {
  const { server, port } = await startStub({
    "/inspect/db?table=items&limit=10": [
      200,
      { table: "items", columns: ["id", "title"], rows: [{ id: "1", title: "A" }], rowCount: 1 },
    ],
  });
  try {
    const data = await fetchLiveDbQuery({ table: "items", limit: 10, port });
    assert.equal(data.table, "items");
    assert.equal(data.rowCount, 1);
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
