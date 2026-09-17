// THE CURRENT BRANCH IS READ TWO WAYS, AND THE TWO DISAGREE WHERE CI RUNS.
//
// `proof-plan.mjs` decides whether a plan is this branch's with
// `git branch --show-current`, which prints NOTHING on a detached HEAD. A test
// fixture that writes "this branch's plan" with `git rev-parse --abbrev-ref HEAD`
// writes the literal `HEAD` there — so on a detached checkout the reader calls the
// fixture's plan stale, and whatever the test asserts about "this branch's plan"
// fails for a reason that has nothing to do with what it tests.
//
// GitHub Actions checks a pull_request out DETACHED at its merge ref, and runs
// `npm test` there. Measured 2026-09-17 in a detached clone of `proof-history`:
// "protocol: PostToolUse after a merge closes the slice's plan" fails with
// `actual: []` — the plan was never closed because it was never this branch's.
//
// The invariant is the class, not the one fixture: every place in scripts/ or
// test/ that reads the current branch reads it the way the reader does.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sources(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules") out.push(...sources(p));
    } else if (/\.(mjs|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

test("the two spellings really disagree on a detached HEAD — the reason there may be only one", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "branch-spelling-"));
  try {
    const git = (...a) => spawnSync("git", a, { cwd: dir, encoding: "utf8" });
    git("init", "-q");
    git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "x");
    git("checkout", "-q", "--detach");
    assert.equal(git("branch", "--show-current").stdout.trim(), "");
    assert.equal(git("rev-parse", "--abbrev-ref", "HEAD").stdout.trim(), "HEAD");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("every read of the current branch in scripts/ and test/ is `git branch --show-current`, the reader's spelling", () => {
  const self = fileURLToPath(import.meta.url);
  const offenders = [];
  for (const file of [...sources(path.join(REPO_ROOT, "scripts")), ...sources(path.join(REPO_ROOT, "test"))]) {
    if (file === self) continue;
    fs.readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (/["']--abbrev-ref["']/.test(line)) offenders.push(`${path.relative(REPO_ROOT, file)}:${i + 1}`);
      });
  }
  assert.deepEqual(
    offenders,
    [],
    `these read the current branch as \`rev-parse --abbrev-ref HEAD\`, which says "HEAD" on a detached checkout where proof-plan's currentBranch() says "" — use currentBranch() from scripts/proof-plan.mjs:\n${offenders.join("\n")}`,
  );
});
