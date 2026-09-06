// RESOLUTION INPUTS — the files that decide what is attested must themselves be
// attested, and no declaration may drop them.
//
// `.gitignore` decides the attested set in BOTH resolution modes: git mode
// asks `git ls-files --exclude-standard`, which honours it, and walk mode reads
// it directly so the two modes agree before and after `git init`. A file with
// that much say over the receipt, left outside the receipt, is the narrowing
// failure this module's header calls the worst one it can have — arriving
// through the side door. Edit one line, a directory silently leaves every
// future receipt, and nothing in the chain says the coverage moved.
//
// The fix could not live in `defaultSurface`: the shipped template declares a
// surface, `harness init` writes one, and neither lists `.gitignore` — nor
// would any adopter writing the file by hand. So it is attested OUTSIDE the
// declaration, which is what these tests pin.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { computeInputsHash, undeclaredTopLevel } from "../src/inputs-hash.mjs";

/** A tree whose DECLARED surface deliberately omits `.gitignore`. */
function treeWithNarrowSurface() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "resolution-inputs-"));
  fs.mkdirSync(path.join(root, "app"), { recursive: true });
  fs.writeFileSync(path.join(root, "app", "main.py"), "x = 1\n");
  fs.mkdirSync(path.join(root, "qa"), { recursive: true });
  // The shipped shape: a real declaration, listing real source dirs, with no
  // mention of `.gitignore` — because nobody would think to mention it.
  fs.writeFileSync(path.join(root, "qa", "verified-surface.json"), JSON.stringify({ surface: ["app", "qa"] }));
  fs.writeFileSync(path.join(root, ".gitignore"), "__pycache__/\n");
  return root;
}

/** The same tree with `.gitignore` removed — the attested set, measured by difference. */
function withoutGitignore(root) {
  const saved = fs.readFileSync(path.join(root, ".gitignore"));
  fs.rmSync(path.join(root, ".gitignore"));
  try {
    return computeInputsHash(root);
  } finally {
    fs.writeFileSync(path.join(root, ".gitignore"), saved);
  }
}

test("a surface that omits `.gitignore` still attests it — GIT mode", () => {
  const root = treeWithNarrowSurface();
  try {
    execFileSync("git", ["init", "-q", "."], { cwd: root });
    execFileSync("git", ["add", "-A"], { cwd: root });
    const before = computeInputsHash(root);
    // `computeInputsHash` reports a count, not a list, so the attested set is
    // measured by DIFFERENCE: removing the file must drop the count by one.
    // That is a stronger statement than a name in a list anyway — it says the
    // file is genuinely an input to this hash.
    assert.equal(withoutGitignore(root).fileCount, before.fileCount - 1, "the file that decides the attested set must be IN the attested set");

    // Narrowing the coverage by editing an unattested file is the attack. It
    // must move the hash, so the next receipt reads "source changed" rather
    // than quietly attesting less than the one before it.
    fs.writeFileSync(path.join(root, ".gitignore"), "__pycache__/\napp/\n");
    execFileSync("git", ["add", "-A"], { cwd: root });
    const after = computeInputsHash(root);
    assert.notEqual(after.hash, before.hash, "changing what gets attested must change the hash");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a surface that omits `.gitignore` still attests it — WALK mode (no git)", () => {
  const root = treeWithNarrowSurface();
  try {
    const before = computeInputsHash(root);
    assert.equal(withoutGitignore(root).fileCount, before.fileCount - 1, "walk mode attests the resolver's own input too");
    fs.writeFileSync(path.join(root, ".gitignore"), "__pycache__/\nvenv/\n");
    assert.notEqual(computeInputsHash(root).hash, before.hash);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a tree with no `.gitignore` is hashed without one, and gains nothing phantom", () => {
  const root = treeWithNarrowSurface();
  try {
    const withOne = computeInputsHash(root).fileCount;
    fs.rmSync(path.join(root, ".gitignore"));
    const h = computeInputsHash(root);
    assert.equal(h.fileCount, withOne - 1, "a file that does not exist is not attested, and nothing phantom takes its place");
    assert.ok(h.fileCount >= 2, "and the real surface is still attested (app/main.py, the surface declaration)");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the omission report agrees with the hash — an attested file is never called undeclared", () => {
  const root = treeWithNarrowSurface();
  try {
    execFileSync("git", ["init", "-q", "."], { cwd: root });
    execFileSync("git", ["add", "-A"], { cwd: root });
    // `.gitignore` is attested (proved above by difference), so the report that
    // names what the receipt does NOT attest must not name it.
    assert.ok(
      !undeclaredTopLevel(root).includes(".gitignore"),
      "the same receipt cannot both attest a file and report it unattested",
    );
    // And the report still bites for something genuinely outside the surface.
    fs.mkdirSync(path.join(root, "infra"), { recursive: true });
    fs.writeFileSync(path.join(root, "infra", "main.tf"), "resource {}\n");
    execFileSync("git", ["add", "-A"], { cwd: root });
    assert.deepEqual(undeclaredTopLevel(root), ["infra"], "a real omission is still named");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
