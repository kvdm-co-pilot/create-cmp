import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { resolveSourceDescriptor, resolveTree } from "../src/lib/source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const TREE_PATH = join(here, "..", "fixtures", "tree.json");
const XML_PATH = join(here, "..", "fixtures", "uiautomator-page.xml");
const NO_ENV = {};

// A fetchImpl stub that serves the live endpoints without any network.
function stubFetch(byPath) {
  return async (url) => {
    const path = new URL(url).pathname;
    const hit = byPath[path];
    if (!hit) return { ok: false, status: 404, text: async () => JSON.stringify({ error: "unknown path" }) };
    return { ok: true, status: 200, text: async () => JSON.stringify(hit) };
  };
}

test("descriptor precedence: explicit source > treePath > sessionDefault > env live > env tree", () => {
  const explicit = { kind: "file", path: "/x.json" };
  assert.deepEqual(
    resolveSourceDescriptor({ source: explicit, treePath: "/y.json", env: NO_ENV }),
    explicit
  );
  assert.deepEqual(
    resolveSourceDescriptor({ treePath: "/y.json", sessionDefault: { kind: "live", port: 9500 }, env: NO_ENV }),
    { kind: "file", path: "/y.json" }
  );
  assert.deepEqual(
    resolveSourceDescriptor({ sessionDefault: { kind: "live", port: 9501 }, env: { CMP_INSPECTOR_TREE: "/z.json" } }),
    { kind: "live", port: 9501 }
  );
  assert.deepEqual(
    resolveSourceDescriptor({ env: { CMP_INSPECTOR_LIVE: "9502", CMP_INSPECTOR_TREE: "/z.json" } }),
    { kind: "live", host: "127.0.0.1", port: 9502 }
  );
  assert.deepEqual(
    resolveSourceDescriptor({ env: { CMP_INSPECTOR_LIVE: "10.0.0.5:9503" } }),
    { kind: "live", host: "10.0.0.5", port: 9503 }
  );
  assert.deepEqual(
    resolveSourceDescriptor({ env: { CMP_INSPECTOR_TREE: "/z.json" } }),
    { kind: "file", path: "/z.json" }
  );
});

test("no source anywhere → clear instruction", () => {
  assert.throws(() => resolveSourceDescriptor({ env: NO_ENV }), /No tree source available/);
});

test("unknown source kind is rejected", () => {
  assert.throws(
    () => resolveSourceDescriptor({ source: { kind: "telepathy" }, env: NO_ENV }),
    /unknown source kind 'telepathy'/
  );
});

test("resolveTree file kind + legacy treePath load from disk", async () => {
  const viaSource = await resolveTree({ source: { kind: "file", path: TREE_PATH }, env: NO_ENV });
  assert.equal(viaSource.source, "headless-jvm");
  const viaLegacy = await resolveTree({ treePath: TREE_PATH, env: NO_ENV });
  assert.deepEqual(viaLegacy, viaSource);
});

test("resolveTree uiautomator kind converts inline xml AND xmlPath", async () => {
  const xml = readFileSync(XML_PATH, "utf8");
  const fromString = await resolveTree({ source: { kind: "uiautomator", xml }, env: NO_ENV });
  assert.equal(fromString.source, "uiautomator");
  const fromPath = await resolveTree({ source: { kind: "uiautomator", xmlPath: XML_PATH }, env: NO_ENV });
  assert.deepEqual(fromPath, fromString);
  await assert.rejects(
    () => resolveTree({ source: { kind: "uiautomator" }, env: NO_ENV }),
    /requires `xml`/
  );
  await assert.rejects(
    () => resolveTree({ source: { kind: "uiautomator", xmlPath: "/nope.xml" }, env: NO_ENV }),
    /not found/
  );
});

test("resolveTree live kind fetches /inspect/tree via the injected fetch", async () => {
  const liveTree = { schemaVersion: 1, source: "live-android", root: { testTag: "home_title", children: [] } };
  const tree = await resolveTree({
    source: { kind: "live", port: 9500 },
    env: NO_ENV,
    fetchImpl: stubFetch({ "/inspect/tree": liveTree }),
  });
  assert.equal(tree.source, "live-android");
  assert.equal(tree.root.testTag, "home_title");
});
