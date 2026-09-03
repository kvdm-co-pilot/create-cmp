// undeclaredTopLevel — the surface is an allowlist and says nothing about what
// it omits. A new top-level directory is silently unattested; this names it on
// the receipt. PLANTED both ways: covered tree → [], one planted dir → [dir].
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { undeclaredTopLevel, computeInputsHash } from "../src/inputs-hash.mjs";

function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "receipts-undeclared-"));
  const git = (...a) => execFileSync("git", a, { cwd: root, stdio: ["ignore", "pipe", "ignore"] });
  git("init", "-q");
  fs.mkdirSync(path.join(root, "services", "core"), { recursive: true });
  fs.writeFileSync(path.join(root, "services", "core", "A.kt"), "class A\n");
  fs.mkdirSync(path.join(root, "qa"), { recursive: true });
  fs.writeFileSync(path.join(root, "qa", "verified-surface.json"), JSON.stringify({ surface: ["services", "qa"] }));
  fs.writeFileSync(path.join(root, ".gitignore"), "qa-artifacts/\n");
  return { root, git };
}

test("a tree the surface covers reports nothing; a planted top-level dir is named; lane outputs and the surface file itself never count", () => {
  const { root } = repo();
  try {
    // .gitignore is a top-level file outside the surface — the honest answer names it.
    assert.deepEqual(undeclaredTopLevel(root), [".gitignore"]);
    fs.writeFileSync(path.join(root, "qa", "verified-surface.json"), JSON.stringify({ surface: ["services", "qa", ".gitignore"] }));
    assert.deepEqual(undeclaredTopLevel(root), []);

    fs.mkdirSync(path.join(root, "infra"), { recursive: true });
    fs.writeFileSync(path.join(root, "infra", "main.tf"), "resource {}\n");
    fs.writeFileSync(path.join(root, "README.md"), "# x\n");
    fs.mkdirSync(path.join(root, "qa-artifacts"), { recursive: true });
    fs.writeFileSync(path.join(root, "qa-artifacts", "x.png"), "");
    assert.deepEqual(undeclaredTopLevel(root), ["README.md", "infra"], "planted dir and file named; gitignored lane output not");
    // And the hash itself is unaffected — this is a report beside it, never an input to it.
    const before = computeInputsHash(root).hash;
    fs.writeFileSync(path.join(root, "infra", "main.tf"), "resource { changed }\n");
    assert.equal(computeInputsHash(root).hash, before, "an undeclared dir does not enter the hash (that is the point of naming it)");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
