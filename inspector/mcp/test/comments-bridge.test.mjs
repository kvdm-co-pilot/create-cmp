// comments-bridge: the console's dynamic link to a generated project's OWN
// qa/lib/comments.mjs. Tested against a FIXTURE implementation of the §7.3
// contract (test/fixtures/fixture-comments-lib.mjs) rather than
// template/qa/lib/comments.mjs — Agent F builds the real template-side
// library against the same contract in parallel, and this bridge's tests
// must not depend on that landing first (VL-7 brief). The point of this
// bridge is "call the library, never fork it": these tests prove it actually
// calls whatever library is present, verbatim refusals included.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCommentsData, addComment, resolveComment, resetCommentsBridgeCache } from "../src/lib/comments-bridge.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_LIB = path.join(HERE, "fixtures", "fixture-comments-lib.mjs");

function makeFixtureProject({ withCommentsLib = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-comments-bridge-"));
  if (withCommentsLib) {
    const libDir = path.join(root, "qa", "lib");
    fs.mkdirSync(libDir, { recursive: true });
    fs.copyFileSync(FIXTURE_LIB, path.join(libDir, "comments.mjs"));
  }
  return root;
}

function cleanup(root) {
  resetCommentsBridgeCache(root);
  fs.rmSync(root, { recursive: true, force: true });
}

test("getCommentsData: {available:false} in a project with no qa/lib/comments.mjs (older scaffold)", async () => {
  const root = makeFixtureProject({ withCommentsLib: false });
  try {
    assert.deepEqual(await getCommentsData(root), { available: false });
  } finally {
    cleanup(root);
  }
});

test("getCommentsData: {available:true, comments:[]} against a fresh ledger", async () => {
  const root = makeFixtureProject();
  try {
    const data = await getCommentsData(root);
    assert.equal(data.available, true);
    assert.deepEqual(data.comments, []);
  } finally {
    cleanup(root);
  }
});

test("addComment: happy path — writes qa/comments.json with a monotonic c1 id, calling the library verbatim", async () => {
  const root = makeFixtureProject();
  try {
    const result = await addComment(root, {
      target: { type: "screen", screen: "home" },
      text: "the CTA is too close to the edge",
      author: "human-console",
    });
    assert.equal(result.ok, true);
    assert.equal(result.comment.id, "c1");
    assert.equal(result.comment.status, "open");

    const written = JSON.parse(fs.readFileSync(path.join(root, "qa", "comments.json"), "utf8"));
    assert.equal(written.schema, "cmp-comments/1");
    assert.equal(written.comments.length, 1);
    assert.equal(written.comments[0].text, "the CTA is too close to the edge");

    // ids are monotonic across calls.
    const second = await addComment(root, { target: { type: "general" }, text: "second", author: "human-console" });
    assert.equal(second.comment.id, "c2");
  } finally {
    cleanup(root);
  }
});

test("addComment: refuses empty/whitespace text and an unknown target type, verbatim from the library", async () => {
  const root = makeFixtureProject();
  try {
    const empty = await addComment(root, { target: { type: "general" }, text: "   ", author: "human-console" });
    assert.equal(empty.ok, false);
    assert.match(empty.reason, /empty/i);

    const badTarget = await addComment(root, { target: { type: "not-a-real-type" }, text: "hi", author: "human-console" });
    assert.equal(badTarget.ok, false);
    assert.match(badTarget.reason, /unknown target type/);
  } finally {
    cleanup(root);
  }
});

test("addComment: honest refusal (not a throw) when the project has no comments library", async () => {
  const root = makeFixtureProject({ withCommentsLib: false });
  try {
    const result = await addComment(root, { target: { type: "general" }, text: "hi", author: "human-console" });
    assert.equal(result.ok, false);
    assert.match(result.reason, /not present in this project/);
  } finally {
    cleanup(root);
  }
});

test("resolveComment: happy path — records author 'agent' and a resolution note, calling the library verbatim", async () => {
  const root = makeFixtureProject();
  try {
    const added = await addComment(root, { target: { type: "general" }, text: "hi", author: "human-console" });
    const resolved = await resolveComment(root, added.comment.id, { note: "updated the spec", author: "agent" });
    assert.equal(resolved.ok, true);
    assert.equal(resolved.comment.status, "resolved");
    assert.equal(resolved.comment.resolvedBy, "agent");
    assert.equal(resolved.comment.resolutionNote, "updated the spec");

    const data = await getCommentsData(root);
    assert.equal(data.comments.find((c) => c.id === added.comment.id).status, "resolved");
  } finally {
    cleanup(root);
  }
});

test("resolveComment: refuses an unknown id and a double-resolve, verbatim from the library", async () => {
  const root = makeFixtureProject();
  try {
    const unknown = await resolveComment(root, "c999", { note: "n/a", author: "agent" });
    assert.equal(unknown.ok, false);
    assert.match(unknown.reason, /unknown comment id/);

    const added = await addComment(root, { target: { type: "general" }, text: "hi", author: "human-console" });
    await resolveComment(root, added.comment.id, { note: "done", author: "agent" });
    const again = await resolveComment(root, added.comment.id, { note: "again", author: "agent" });
    assert.equal(again.ok, false);
    assert.match(again.reason, /already resolved/);
  } finally {
    cleanup(root);
  }
});

test("resolveComment: honest refusal (not a throw) when the project has no comments library", async () => {
  const root = makeFixtureProject({ withCommentsLib: false });
  try {
    const result = await resolveComment(root, "c1", { note: "n/a", author: "agent" });
    assert.equal(result.ok, false);
    assert.match(result.reason, /not present in this project/);
  } finally {
    cleanup(root);
  }
});

test("getCommentsData: status filter passes through to the library", async () => {
  const root = makeFixtureProject();
  try {
    const added = await addComment(root, { target: { type: "general" }, text: "hi", author: "human-console" });
    await addComment(root, { target: { type: "general" }, text: "still open", author: "human-console" });
    await resolveComment(root, added.comment.id, { note: "done", author: "agent" });

    const open = await getCommentsData(root, { status: "open" });
    assert.equal(open.comments.length, 1);
    assert.equal(open.comments[0].text, "still open");

    const resolved = await getCommentsData(root, { status: "resolved" });
    assert.equal(resolved.comments.length, 1);
    assert.equal(resolved.comments[0].id, added.comment.id);
  } finally {
    cleanup(root);
  }
});

test("mid-session library install: a library added AFTER a (miss) lookup is picked up on the NEXT call — no cache reset needed", async () => {
  // The real-world sequence this pins: the console is already running against a
  // pre-comments scaffold, then cmp-upgrade / a drift PR / an agent installs
  // qa/lib/comments.mjs into the project. The bridge must see it on the very
  // next probe — a cached "no library here" answer would hide it until a
  // console restart (the exact defect the VL-7 gate caught in the wild).
  const root = makeFixtureProject({ withCommentsLib: false });
  try {
    assert.deepEqual(await getCommentsData(root), { available: false });
    assert.deepEqual(await getCommentsData(root), { available: false }, "repeat misses stay honest");
    // Library appears mid-session (e.g. a drift PR landed) — NO reset call.
    const libDir = path.join(root, "qa", "lib");
    fs.mkdirSync(libDir, { recursive: true });
    fs.copyFileSync(FIXTURE_LIB, path.join(libDir, "comments.mjs"));
    const data = await getCommentsData(root);
    assert.equal(data.available, true, "the next call must re-probe — misses are never cached");

    // And the write path works immediately too, on the same un-reset bridge.
    const added = await addComment(root, { target: { type: "general" }, text: "now visible", author: "human-console" });
    assert.equal(added.ok, true);
  } finally {
    cleanup(root);
  }
});
