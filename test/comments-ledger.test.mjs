// Coverage for the comments ledger (VERIFICATION-LAYER-DESIGN.md §7.3, Wave VL-7):
// qa/lib/comments.mjs (state/validation/transitions), qa/comment.mjs (the CLI), and
// the seed the scaffolder ships (qa/comments.json). Mirrors
// test/approvals-gate.test.mjs's approach: scaffold the REAL template with
// `verify: false` so these tests stay fast and gradle-free, exercise the library by
// importing it directly (pure Node, no subprocess), and exercise the CLI surface via
// execFileSync where the point IS the CLI.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { scaffold } from "../src/scaffold.mjs";

function baseConfig(targetDir, overrides = {}) {
  return {
    appName: "Acme",
    package: "com.acme.demo",
    iosBundleId: "com.acme.demo",
    region: "us-central1",
    themePrefix: "Acme",
    platforms: { android: true, ios: true },
    firebase: { enabled: true, auth: "both", firestore: true, storage: true, functions: true, fcm: true },
    room: true,
    e2e: true,
    inspector: true,
    devClient: true,
    tabs: [{ label: "Home", icon: "home" }],
    targetDir,
    ...overrides,
  };
}

async function makeProject(prefix, overrides = {}) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  await scaffold(baseConfig(out, overrides), { verify: false });
  return out;
}

// Cache-bust: every temp project's qa/lib/comments.mjs lives at a different
// resolved path, so Node's per-URL ESM cache already isolates tests from each
// other — no query param needed.
async function loadLib(projectRoot) {
  return import(pathToFileURL(path.join(projectRoot, "qa/lib/comments.mjs")));
}

function runComment(root, args) {
  return execFileSync(process.execPath, [path.join(root, "qa/comment.mjs"), ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function runCommentExpectFail(root, args) {
  try {
    execFileSync(process.execPath, [path.join(root, "qa/comment.mjs"), ...args], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    assert.fail("expected qa/comment.mjs to exit non-zero");
  } catch (err) {
    return { status: err.status, stdout: err.stdout, stderr: err.stderr };
  }
}

const GENERAL_TARGET = { type: "general" };

// ── Scaffold seeding ─────────────────────────────────────────────────────────

test("scaffold ships the empty comments seed + the lib + the CLI", async () => {
  const out = await makeProject("cmp-comments-seed-");
  try {
    const seedPath = path.join(out, "qa/comments.json");
    assert.ok(fs.existsSync(seedPath), "qa/comments.json shipped");
    const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
    assert.deepEqual(seed, { schema: "cmp-comments/1", comments: [] });

    assert.ok(fs.existsSync(path.join(out, "qa/lib/comments.mjs")), "qa/lib/comments.mjs shipped");
    assert.ok(fs.existsSync(path.join(out, "qa/comment.mjs")), "qa/comment.mjs shipped");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

// ── listComments ─────────────────────────────────────────────────────────────

test("listComments on the fresh seed returns an empty ledger", async () => {
  const out = await makeProject("cmp-comments-list-empty-");
  try {
    const { listComments } = await loadLib(out);
    assert.deepEqual(listComments(out), { schema: "cmp-comments/1", comments: [] });
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("listComments tolerates a missing file as the empty seed, and a write then creates it", async () => {
  const out = await makeProject("cmp-comments-missing-");
  try {
    fs.rmSync(path.join(out, "qa/comments.json"));
    const { listComments, addComment } = await loadLib(out);
    assert.deepEqual(listComments(out), { schema: "cmp-comments/1", comments: [] }, "missing file reads as empty, not an error");
    assert.ok(!fs.existsSync(path.join(out, "qa/comments.json")), "a read never creates the file");

    const res = addComment(out, { target: GENERAL_TARGET, text: "hello" });
    assert.equal(res.ok, true);
    assert.ok(fs.existsSync(path.join(out, "qa/comments.json")), "the first write creates qa/comments.json");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("listComments filters by status", async () => {
  const out = await makeProject("cmp-comments-filter-");
  try {
    const { addComment, resolveComment, listComments } = await loadLib(out);
    const a = addComment(out, { target: GENERAL_TARGET, text: "first" });
    const b = addComment(out, { target: GENERAL_TARGET, text: "second" });
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    resolveComment(out, a.comment.id, { note: "done" });

    const open = listComments(out, { status: "open" });
    assert.deepEqual(open.comments.map((c) => c.id), [b.comment.id]);

    const resolved = listComments(out, { status: "resolved" });
    assert.deepEqual(resolved.comments.map((c) => c.id), [a.comment.id]);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

// ── addComment: refusals ─────────────────────────────────────────────────────

test("addComment refuses empty text", async () => {
  const out = await makeProject("cmp-comments-empty-text-");
  try {
    const { addComment } = await loadLib(out);
    const res = addComment(out, { target: GENERAL_TARGET, text: "" });
    assert.equal(res.ok, false);
    assert.match(res.reason, /empty or whitespace-only/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("addComment refuses whitespace-only text", async () => {
  const out = await makeProject("cmp-comments-ws-text-");
  try {
    const { addComment } = await loadLib(out);
    const res = addComment(out, { target: GENERAL_TARGET, text: "   \n\t  " });
    assert.equal(res.ok, false);
    assert.match(res.reason, /empty or whitespace-only/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("addComment refuses a missing target", async () => {
  const out = await makeProject("cmp-comments-no-target-");
  try {
    const { addComment } = await loadLib(out);
    const res = addComment(out, { text: "hello" });
    assert.equal(res.ok, false);
    assert.match(res.reason, /target is missing or malformed/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("addComment refuses an unknown target.type", async () => {
  const out = await makeProject("cmp-comments-unknown-type-");
  try {
    const { addComment } = await loadLib(out);
    const res = addComment(out, { target: { type: "not-a-real-type" }, text: "hello" });
    assert.equal(res.ok, false);
    assert.match(res.reason, /unknown target type "not-a-real-type"/);
    for (const t of ["screen", "element", "spec-line", "design-system", "architecture", "general"]) {
      assert.match(res.reason, new RegExp(t.replace("-", "\\-")));
    }
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

const REQUIRED_FIELD_CASES = [
  { type: "screen", validTarget: { type: "screen", screen: "home" }, requiredFields: ["screen"] },
  { type: "element", validTarget: { type: "element", screen: "home", testTag: "home:list" }, requiredFields: ["screen", "testTag"] },
  { type: "spec-line", validTarget: { type: "spec-line", file: "specs/home.spec.md", clauseId: "HOME-01" }, requiredFields: ["file", "clauseId"] },
  { type: "design-system", validTarget: { type: "design-system", token: "spacing.md" }, requiredFields: ["token"] },
  { type: "architecture", validTarget: { type: "architecture", path: "presentation/home" }, requiredFields: ["path"] },
];

for (const { type, validTarget, requiredFields } of REQUIRED_FIELD_CASES) {
  test(`addComment refuses target type "${type}" missing its required field(s)`, async () => {
    const out = await makeProject(`cmp-comments-req-${type}-`);
    try {
      const { addComment } = await loadLib(out);
      // Omit every required field entirely.
      const res = addComment(out, { target: { type }, text: "hello" });
      assert.equal(res.ok, false);
      assert.match(res.reason, new RegExp(`target type "${type}" requires`));
      for (const f of requiredFields) assert.match(res.reason, new RegExp(f));

      // A valid target of the same type succeeds.
      const ok = addComment(out, { target: validTarget, text: "hello" });
      assert.equal(ok.ok, true);
      assert.deepEqual(ok.comment.target, validTarget);
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });
}

test('addComment accepts target type "general" with no fields at all', async () => {
  const out = await makeProject("cmp-comments-general-");
  try {
    const { addComment } = await loadLib(out);
    const res = addComment(out, { target: { type: "general" }, text: "overall thought" });
    assert.equal(res.ok, true);
    assert.deepEqual(res.comment.target, { type: "general" });
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("addComment refuses a target whose required field is present but blank", async () => {
  const out = await makeProject("cmp-comments-blank-field-");
  try {
    const { addComment } = await loadLib(out);
    const res = addComment(out, { target: { type: "screen", screen: "   " }, text: "hello" });
    assert.equal(res.ok, false);
    assert.match(res.reason, /requires screen/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

// ── addComment: success shape ────────────────────────────────────────────────

test("addComment assigns monotonic ids c1, c2, … and trims text; missing author defaults to anonymous", async () => {
  const out = await makeProject("cmp-comments-ids-");
  try {
    const { addComment } = await loadLib(out);
    const a = addComment(out, { target: GENERAL_TARGET, text: "  first  " });
    const b = addComment(out, { target: GENERAL_TARGET, text: "second", author: "  Karel  " });

    assert.equal(a.ok, true);
    assert.equal(a.comment.id, "c1");
    assert.equal(a.comment.text, "first");
    assert.equal(a.comment.author, "anonymous");
    assert.equal(a.comment.status, "open");
    assert.ok(a.comment.createdAt);
    assert.equal(a.comment.resolvedAt, undefined);

    assert.equal(b.ok, true);
    assert.equal(b.comment.id, "c2");
    assert.equal(b.comment.author, "Karel");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("ids are never reused even after a hand-edited gap in the ledger", async () => {
  const out = await makeProject("cmp-comments-id-gap-");
  try {
    fs.mkdirSync(path.join(out, "qa"), { recursive: true });
    fs.writeFileSync(
      path.join(out, "qa/comments.json"),
      JSON.stringify(
        {
          schema: "cmp-comments/1",
          comments: [
            { id: "c1", target: GENERAL_TARGET, text: "one", author: "a", createdAt: "2026-01-01T00:00:00.000Z", status: "open" },
            { id: "c3", target: GENERAL_TARGET, text: "three", author: "a", createdAt: "2026-01-01T00:00:00.000Z", status: "open" },
          ],
        },
        null,
        2,
      ),
    );
    const { addComment } = await loadLib(out);
    const res = addComment(out, { target: GENERAL_TARGET, text: "next" });
    assert.equal(res.ok, true);
    assert.equal(res.comment.id, "c4", "next id is max(existing)+1, never a reused/skipped id");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

// ── resolveComment ────────────────────────────────────────────────────────────

test("resolveComment refuses an unknown id", async () => {
  const out = await makeProject("cmp-comments-resolve-unknown-");
  try {
    const { resolveComment } = await loadLib(out);
    const res = resolveComment(out, "c999", { note: "n/a" });
    assert.equal(res.ok, false);
    assert.match(res.reason, /unknown comment id "c999"/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("resolveComment refuses to double-resolve", async () => {
  const out = await makeProject("cmp-comments-double-resolve-");
  try {
    const { addComment, resolveComment } = await loadLib(out);
    const added = addComment(out, { target: GENERAL_TARGET, text: "hello" });
    const first = resolveComment(out, added.comment.id, { note: "fixed it", author: "agent" });
    assert.equal(first.ok, true);

    const second = resolveComment(out, added.comment.id, { note: "again" });
    assert.equal(second.ok, false);
    assert.match(second.reason, /already resolved/);
    assert.match(second.reason, /by agent/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("resolveComment stamps status/resolvedAt/resolvedBy/resolutionNote; omitting note omits resolutionNote", async () => {
  const out = await makeProject("cmp-comments-resolve-shape-");
  try {
    const { addComment, resolveComment } = await loadLib(out);
    const a = addComment(out, { target: GENERAL_TARGET, text: "a" });
    const b = addComment(out, { target: GENERAL_TARGET, text: "b" });

    const withNote = resolveComment(out, a.comment.id, { note: "updated the spec clause", author: "agent-cli" });
    assert.equal(withNote.ok, true);
    assert.equal(withNote.comment.status, "resolved");
    assert.equal(withNote.comment.resolvedBy, "agent-cli");
    assert.equal(withNote.comment.resolutionNote, "updated the spec clause");
    assert.ok(withNote.comment.resolvedAt);

    const noNote = resolveComment(out, b.comment.id, {});
    assert.equal(noNote.ok, true);
    assert.equal(noNote.comment.resolvedBy, "anonymous");
    assert.equal("resolutionNote" in noNote.comment, false, "no note given -> no resolutionNote field");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

// ── Corrupt / unknown-schema ledger ──────────────────────────────────────────

test("corrupt (unparsable) comments.json: listComments throws honestly, writes refuse rather than overwrite", async () => {
  const out = await makeProject("cmp-comments-corrupt-");
  try {
    fs.writeFileSync(path.join(out, "qa/comments.json"), "{ this is not json");
    const { listComments, addComment, resolveComment } = await loadLib(out);

    assert.throws(() => listComments(out), /not valid JSON/, "read surfaces the honest error, never a fabricated empty ledger");

    const addRes = addComment(out, { target: GENERAL_TARGET, text: "hello" });
    assert.equal(addRes.ok, false);
    assert.match(addRes.reason, /not valid JSON/);

    const resolveRes = resolveComment(out, "c1", {});
    assert.equal(resolveRes.ok, false);
    assert.match(resolveRes.reason, /not valid JSON/);

    assert.equal(fs.readFileSync(path.join(out, "qa/comments.json"), "utf8"), "{ this is not json", "the corrupt file is never overwritten");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("unknown-schema comments.json: listComments throws, addComment refuses", async () => {
  const out = await makeProject("cmp-comments-unknown-schema-");
  try {
    fs.writeFileSync(path.join(out, "qa/comments.json"), JSON.stringify({ schema: "something-else/9", comments: [] }));
    const { listComments, addComment } = await loadLib(out);

    assert.throws(() => listComments(out), /unknown schema|declares schema/);

    const res = addComment(out, { target: GENERAL_TARGET, text: "hello" });
    assert.equal(res.ok, false);
    assert.match(res.reason, /schema/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("wrong-shape comments.json (comments not an array) is treated as corrupt, not silently emptied", async () => {
  const out = await makeProject("cmp-comments-wrong-shape-");
  try {
    fs.writeFileSync(path.join(out, "qa/comments.json"), JSON.stringify({ schema: "cmp-comments/1", comments: "nope" }));
    const { listComments } = await loadLib(out);
    assert.throws(() => listComments(out), /unexpected shape/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

// ── CLI smoke ─────────────────────────────────────────────────────────────────

test("comment.mjs --list on the fresh seed", async () => {
  const out = await makeProject("cmp-comments-cli-empty-");
  try {
    const stdout = runComment(out, ["--list"]);
    assert.match(stdout, /No comments recorded yet\./);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("comment.mjs --list --open filters to open comments and shows resolution notes for resolved ones via --list", async () => {
  const out = await makeProject("cmp-comments-cli-filter-");
  try {
    const { addComment, resolveComment } = await loadLib(out);
    const a = addComment(out, { target: { type: "screen", screen: "home" }, text: "the header looks cramped" });
    addComment(out, { target: GENERAL_TARGET, text: "still open" });
    resolveComment(out, a.comment.id, { note: "added spacing token", author: "agent-cli" });

    const openOut = runComment(out, ["--list", "--open"]);
    assert.doesNotMatch(openOut, /cramped/);
    assert.match(openOut, /still open/);

    const allOut = runComment(out, ["--list"]);
    assert.match(allOut, /cramped/);
    assert.match(allOut, /added spacing token/);
    assert.match(allOut, /still open/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("comment.mjs --resolve <id> --note writes the resolution and echoes it", async () => {
  const out = await makeProject("cmp-comments-cli-resolve-");
  try {
    const { addComment } = await loadLib(out);
    const added = addComment(out, { target: GENERAL_TARGET, text: "needs a fix" });

    const stdout = runComment(out, ["--resolve", added.comment.id, "--note", "fixed in HomeScreen.kt"]);
    assert.match(stdout, new RegExp(`resolved ${added.comment.id}`));
    assert.match(stdout, /fixed in HomeScreen\.kt/);

    const ledger = JSON.parse(fs.readFileSync(path.join(out, "qa/comments.json"), "utf8"));
    const stored = ledger.comments.find((c) => c.id === added.comment.id);
    assert.equal(stored.status, "resolved");
    assert.equal(stored.resolvedBy, "agent-cli");
    assert.equal(stored.resolutionNote, "fixed in HomeScreen.kt");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("comment.mjs --resolve on an unknown id exits non-zero and prints the reason", async () => {
  const out = await makeProject("cmp-comments-cli-resolve-unknown-");
  try {
    const { status, stderr } = runCommentExpectFail(out, ["--resolve", "c999", "--note", "n/a"]);
    assert.equal(status, 1);
    assert.match(stderr, /unknown comment id "c999"/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("comment.mjs with no recognized flags prints usage and exits non-zero", async () => {
  const out = await makeProject("cmp-comments-cli-usage-");
  try {
    const { status, stderr } = runCommentExpectFail(out, []);
    assert.equal(status, 1);
    assert.match(stderr, /usage: node qa\/comment\.mjs/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});
