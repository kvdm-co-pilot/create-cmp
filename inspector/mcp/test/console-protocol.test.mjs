// The console protocol (docs/proposals/console-protocol.md) — the wire the MCP
// tools speak, whoever started the console process.
//
// These tests boot the REAL service (preview-service.test.mjs's harness style)
// and exercise the routes over actual HTTP — because the entire point of the
// protocol is that HTTP is the only path, so anything proven through the
// service object would prove the wrong thing.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createPreviewService } from "../src/lib/preview-service.mjs";

/** A minimal project the service can boot against (no gradle — runRender is stubbed). */
function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-protocol-"));
  fs.mkdirSync(path.join(root, "composeApp", "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "composeApp", "build.gradle.kts"), 'android {\n  namespace = "com.acme.demo"\n}\n');
  return root;
}

/** The tree contract's node shape (schemaVersion 1) — matches preview-service.test.mjs's fixtures. */
const NODE = (over = {}) => ({
  testTag: null,
  text: null,
  contentDescription: null,
  role: null,
  clickable: false,
  disabled: false,
  bounds: { x: 0, y: 0, width: 100, height: 50 },
  designToken: null,
  children: [],
  ...over,
});

/** Write a render generation: manifest + one screen tree the service can load. */
function writeRender(root, { text }) {
  const previews = path.join(root, "composeApp", "build", "previews");
  fs.mkdirSync(path.join(previews, "home"), { recursive: true });
  const tree = {
    schemaVersion: 1,
    source: "headless-jvm",
    root: NODE({
      testTag: "home_screen",
      bounds: { x: 0, y: 0, width: 400, height: 800 },
      children: [NODE({ testTag: "home_title", text, bounds: { x: 16, y: 16, width: 200, height: 60 } })],
    }),
  };
  fs.writeFileSync(path.join(previews, "home", "tree.json"), JSON.stringify(tree));
  fs.writeFileSync(path.join(previews, "home", "screen.png"), "png");
  fs.writeFileSync(
    path.join(previews, "manifest.json"),
    JSON.stringify({ viewport: { width: 400, height: 800 }, screens: [{ id: "home", title: "Home", tree: "home/tree.json", png: "home/screen.png" }] }),
  );
}

async function boot(root, port) {
  const service = createPreviewService({ projectDir: root, port, hot: false, runRender: async () => {} });
  const st = await service.start();
  return { service, url: st.url };
}

const getJson = async (url) => (await fetch(url)).json();

test("protocol: /api/render-wait long-polls and answers with the wait's own snapshot+timedOut shape", async () => {
  const root = makeProject();
  writeRender(root, { text: "hello" });
  const { service, url } = await boot(root, 19960);
  try {
    // Nothing renders within the budget → the SERVER answers timedOut:true;
    // the wire adds nothing and takes nothing away from the in-process shape.
    const timedOut = await getJson(`${url}api/render-wait?timeoutMs=300`);
    assert.equal(timedOut.timedOut, true);
    assert.ok(Array.isArray(timedOut.changedLastRender));

    // A render completing DURING the hold resolves the poll with the outcome.
    const pending = getJson(`${url}api/render-wait?timeoutMs=10000`);
    // Let the request REACH the server and register its waiter before the
    // render fires — otherwise the render completes first and the late waiter
    // correctly holds for the NEXT one (which never comes) until timeout.
    await new Promise((r) => setTimeout(r, 200));
    writeRender(root, { text: "changed" });
    await service._renderCycle();
    const outcome = await pending;
    assert.equal(outcome.timedOut, false);
    assert.deepEqual(outcome.changedLastRender, ["home"]);
  } finally {
    service.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("protocol: /api/diff computes SERVER-side across the last two generations; refusals are 409 with the tool's wording", async () => {
  const root = makeProject();
  writeRender(root, { text: "before" });
  const { service, url } = await boot(root, 19961);
  try {
    // Unknown screen: a 409 that names the known ones — the tool's own wording,
    // crossing the wire untouched.
    const unknownRes = await fetch(`${url}api/diff?screen=nope`);
    assert.equal(unknownRes.status, 409);
    assert.match((await unknownRes.json()).reason, /Known screens: home/);

    // Boot leaves two identical generations (start loads, then renders once):
    // an honest no-change verdict, not a refusal.
    const same = await getJson(`${url}api/diff?screen=home`);
    assert.equal(same.ok, true);
    assert.equal(same.verdict, "no-change");

    // A real edit → a verdict computed where the state lives; the wire carries
    // the VERDICT, never the tree pair.
    writeRender(root, { text: "after" });
    await service._renderCycle();
    const diff = await getJson(`${url}api/diff?screen=home`);
    assert.equal(diff.ok, true);
    assert.equal(diff.screen, "home");
    assert.notEqual(diff.verdict, "no-change");
    assert.ok(diff.changes.length > 0, "the before/after text change is visible in the verdict's changes");
  } finally {
    service.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("protocol: /api/approvals + /api/comments degrade honestly for a project with no qa libraries", async () => {
  const root = makeProject();
  writeRender(root, { text: "x" });
  const { service, url } = await boot(root, 19962);
  try {
    const approvals = await getJson(`${url}api/approvals`);
    assert.equal(approvals.available, false, "no approvals library -> {available:false}, same as in-process");
    const comments = await getJson(`${url}api/comments`);
    assert.equal(comments.available, false);
  } finally {
    service.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("protocol: /api/variant stashes over POST, refuses a bad name with the library's reason, and 405s a GET", async () => {
  const root = makeProject();
  writeRender(root, { text: "x" });
  const { service, url } = await boot(root, 19963);
  try {
    const post = (body) =>
      fetch(`${url}api/variant`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

    const okRes = await post({ name: "warmer" });
    assert.equal(okRes.status, 200);
    const stashed = await okRes.json();
    assert.equal(stashed.ok, true);
    assert.ok(fs.existsSync(path.join(root, "composeApp", "build", "previews", "variants", "warmer", "home", "screen.png")));

    const bad = await post({ name: "Not Valid!" });
    assert.equal(bad.status, 409);

    const get = await fetch(`${url}api/variant`);
    assert.equal(get.status, 405, "mutations are POST-only");
  } finally {
    service.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("protocol: /api/resolve-comment validates its body and returns the library's answer verbatim", async () => {
  const root = makeProject();
  writeRender(root, { text: "x" });
  const { service, url } = await boot(root, 19964);
  try {
    const missing = await fetch(`${url}api/resolve-comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "c1" }),
    });
    assert.equal(missing.status, 400, "note is required — resolution without a note is a claim without content");

    // No comments library in this fixture: the bridge's honest refusal crosses
    // the wire as-is (never a crash, never a fabricated success).
    const res = await fetch(`${url}api/resolve-comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "c1", note: "did the thing" }),
    });
    const body = await res.json();
    assert.equal(body.ok, false);
  } finally {
    service.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
