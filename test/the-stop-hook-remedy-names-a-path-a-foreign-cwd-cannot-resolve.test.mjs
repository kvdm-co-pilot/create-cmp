// THE STOP HOOK'S REMEDY NAMED A PATH THE SESSION IT WAS TALKING TO COULD NOT RESOLVE (KD-215).
//
// `doctor --fix` anchors the Stop hook, so `qa/receipt-check.mjs --hook` now runs
// from any directory — which is the point: a session opened outside the project
// had no Stop gate at all before. Its refusal then told that session to "Run
// `node qa/verify.mjs`", a path relative to a directory the session is, by
// construction, not in. The one population the heal newly reached was the one
// population the remedy failed for.
//
// THE ORACLE IS THE SHELL, as for the anchoring itself: take the command out of
// the message, run it with `sh -c` from where the session stands, and see whether
// it reaches the project's lane. At the project root the message must stay the
// words it always was, byte for byte — an agent there was served correctly.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARKER = "THE-LANE-WAS-REACHED";

/** The shipped receipt-check and its lib, no receipt, and a stand-in lane that prints when it runs. */
function project(name = "cmp-stop-remedy-") {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), name)));
  fs.mkdirSync(path.join(dir, "qa"), { recursive: true });
  fs.copyFileSync(path.join(REPO_ROOT, "template", "qa", "receipt-check.mjs"), path.join(dir, "qa", "receipt-check.mjs"));
  fs.cpSync(path.join(REPO_ROOT, "template", "qa", "lib"), path.join(dir, "qa", "lib"), { recursive: true });
  fs.writeFileSync(path.join(dir, "qa", "verify.mjs"), `process.stdout.write(${JSON.stringify(MARKER)});\n`);
  return dir;
}

function stopHook(root, cwd) {
  const r = spawnSync(process.execPath, [path.join(root, "qa", "receipt-check.mjs"), "--hook"], {
    cwd,
    input: "{}",
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  return { code: r.status, err: String(r.stderr ?? "") };
}

/** The command the refusal tells the agent to run. */
const remedy = (stderr) => stderr.match(/Run `([^`]+)` \(it checks every promise/)?.[1] ?? null;

/** Does that command, run by the shell from `cwd`, reach this project's lane? */
function reachesTheLane(command, cwd) {
  const r = spawnSync("/bin/sh", ["-c", command], { cwd, encoding: "utf8" });
  return String(r.stdout ?? "").includes(MARKER);
}

const AT_ROOT =
  "Run `node qa/verify.mjs` (it checks every promise and writes the receipt), " +
  "commit the receipt, or see README §Verification enforcement to bypass.";

test("at the project root the remedy is the words it always was", () => {
  const root = project();
  try {
    const { code, err } = stopHook(root, root);
    assert.equal(code, 2, `the Stop hook did not refuse a tree with no receipt:\n${err}`);
    assert.ok(err.includes(AT_ROOT), `the root-cwd remedy changed:\n${err}`);
    assert.doesNotMatch(err, /\bcd /);
    assert.equal(reachesTheLane(remedy(err), root), true, "the root remedy does not reach the lane from the root");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("from another directory the remedy names the project, and the shell reaches the lane with it", () => {
  const root = project();
  const elsewhere = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cmp-foreign-cwd-")));
  try {
    const { code, err } = stopHook(root, elsewhere);
    assert.equal(code, 2, `the anchored Stop hook did not refuse from another directory:\n${err}`);
    const command = remedy(err);
    assert.equal(command, `cd "${root}" && node qa/verify.mjs`, `the remedy is not spelled from the project:\n${err}`);
    // The premise: the bare form really does fail from here, or this test proves nothing.
    assert.equal(reachesTheLane("node qa/verify.mjs", elsewhere), false, "the relative form resolved from elsewhere");
    assert.equal(reachesTheLane(command, elsewhere), true, `the remedy does not reach the lane from ${elsewhere}:\n  ${command}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(elsewhere, { recursive: true, force: true });
  }
});

test("a project path double quotes would not protect is quoted so the shell still reaches it", () => {
  // `$` expands inside double quotes: `cd "/tmp/a$HOME"` is a different directory.
  const root = project("cmp-stop-remedy-$HOME-");
  const elsewhere = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cmp-foreign-cwd-")));
  try {
    const { err } = stopHook(root, elsewhere);
    const command = remedy(err);
    assert.ok(command, `no remedy in the refusal:\n${err}`);
    assert.equal(reachesTheLane(command, elsewhere), true, `the remedy does not reach the lane:\n  ${command}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(elsewhere, { recursive: true, force: true });
  }
});
