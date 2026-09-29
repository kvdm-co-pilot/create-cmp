// `proof-plan.mjs --ci` — the hook's question, asked by CI of a PR's diff
// (FIX-PLAN slice 7, GATE-RULES Rule 4). Scratch repos with an `origin/main`,
// as in test/proof-plan.test.mjs, so the diff base...HEAD is real git. GH_TOKEN
// is stripped from the child's env: without it the review and L2 tiers are
// UNKNOWN, never read from this laptop's `gh` session.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { ciPlan, CI_CHECK_RUNS } from "../scripts/proof-plan.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "proof-plan.mjs");

function scratchPR(files, change) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "proof-plan-ci-"));
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  const put = (entries) => {
    for (const [rel, text] of Object.entries(entries)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), text);
    }
  };
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.invalid");
  git("config", "user.name", "t");
  put(files);
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  git("checkout", "-q", "-b", "pr");
  put(change);
  git("add", "-A");
  git("commit", "-q", "-m", "the PR");
  return { dir, dispose: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

function runCi(dir, extra = []) {
  const env = { ...process.env };
  delete env.GH_TOKEN;
  return spawnSync(process.execPath, [SCRIPT, "--ci", "--base", "origin/main", "--tree", dir, ...extra], { encoding: "utf8", env, timeout: 60_000 });
}

const BASE = { "docs/guide.md": "a\n", "scripts/tool.mjs": "export const x = 1;\n" };

test("--ci: a docs-only PR owes nothing and exits 0", () => {
  const r = scratchPR(BASE, { "docs/guide.md": "a, clearer\n" });
  try {
    const out = runCi(r.dir);
    assert.equal(out.status, 0, out.stdout + out.stderr);
    assert.match(out.stdout, /review\s+not owed/);
    assert.match(out.stdout, /L2 run\s+not owed/);
    assert.match(out.stdout, /nothing owed is unattested/);
  } finally {
    r.dispose();
  }
});

test("--ci: a scripts/ PR owes a review — UNKNOWN without GH_TOKEN, exit 0 non-strict and 1 under --strict", () => {
  const r = scratchPR(BASE, { "scripts/tool.mjs": "export const x = 2;\n" });
  try {
    const loose = runCi(r.dir);
    assert.equal(loose.status, 0, loose.stdout + loose.stderr);
    assert.match(loose.stdout, /review\s+OWED, UNKNOWN — GH_TOKEN is not set/);
    assert.match(loose.stdout, /L2 run\s+not owed/, "scripts/ cannot reach the stamped app");
    const strict = runCi(r.dir, ["--strict"]);
    assert.equal(strict.status, 1, strict.stdout + strict.stderr);
    assert.match(strict.stdout, /REFUSED — review \(UNKNOWN\)/);
  } finally {
    r.dispose();
  }
});

test("--ci: an owed tier is MISSING without a successful check run of its name — exit 0 non-strict, 1 under strict — and PRESENT with one", () => {
  const r = scratchPR(BASE, { "scripts/tool.mjs": "export const x = 3;\n" });
  try {
    const failed = [{ name: CI_CHECK_RUNS.review, status: "completed", conclusion: "failure" }];
    // Rule 1: not strict reports and does not refuse — the tier line still names it.
    const missing = ciPlan({ root: r.dir, checkRuns: failed });
    assert.equal(missing.exit, 0, missing.lines.join("\n"));
    assert.equal(missing.tiers.find((t) => t.tier === "review").state, "missing");
    assert.match(missing.lines.join("\n"), /OWED, MISSING/);
    assert.match(missing.lines.join("\n"), /reporting, not strict — review \(MISSING\); --strict would refuse/);
    const strictMissing = ciPlan({ root: r.dir, strict: true, checkRuns: failed });
    assert.equal(strictMissing.exit, 1, strictMissing.lines.join("\n"));
    assert.match(strictMissing.lines.join("\n"), /REFUSED — review \(MISSING\)/);
    const present = ciPlan({ root: r.dir, checkRuns: [{ name: CI_CHECK_RUNS.review, status: "completed", conclusion: "success" }] });
    assert.equal(present.exit, 0, present.lines.join("\n"));
    assert.equal(present.tiers.find((t) => t.tier === "review").state, "present");
  } finally {
    r.dispose();
  }
});

test("--ci: a base git cannot find is exit 2, never a pass", () => {
  const r = scratchPR(BASE, { "docs/guide.md": "b\n" });
  try {
    const out = spawnSync(process.execPath, [SCRIPT, "--ci", "--base", "origin/nope", "--tree", r.dir], { encoding: "utf8", timeout: 60_000 });
    assert.equal(out.status, 2, out.stdout + out.stderr);
  } finally {
    r.dispose();
  }
});
