// Regression: the inputs-hash walk fallback (no .git yet — exactly the state
// `create-cmp --verify` runs in at stamp time) must produce the SAME hash as
// the git ls-files path after `git init` on identical source. Before the fix,
// walk mode included composeApp/build/** and .gradle/.kotlin scratch, so the
// stamp-time PASS receipt read "INVALID — source changed since the receipt"
// the moment the user ran `git init` (reproduced 2026-07-13 against 0.6.1).

import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATE_INPUTS_HASH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "template",
  "qa",
  "lib",
  "inputs-hash.mjs",
);

function write(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

/** Minimal project tree covering every VERIFIED_SURFACE entry + scratch dirs. */
function makeFakeProject(root) {
  write(root, "composeApp/src/commonMain/kotlin/Main.kt", "fun main() {}\n");
  write(root, "specs/app-base.spec.md", "## [BASE-01] Given/When/Then\n");
  write(root, "qa/verify.mjs", "// lane stub\n");
  write(root, "gradle/libs.versions.toml", "[versions]\nkotlin = \"2.2.20\"\n");
  write(root, "build.gradle.kts", "// root\n");
  write(root, "settings.gradle.kts", "rootProject.name = \"fake\"\n");
  write(root, "gradle.properties", "org.gradle.jvmargs=-Xmx2g\n");
  // The .gitignore the template ships (the relevant subset): what git will
  // exclude post-init, and therefore what walk mode must also exclude pre-init.
  write(root, ".gitignore", "build/\n.gradle/\n.kotlin/\n.idea/\nqa-artifacts/\n.DS_Store\n*.iml\n*.log\n");
  // Non-source scratch that exists at stamp time (--verify just built the app).
  write(root, "composeApp/build/tmp/scratch.bin", "binary-scratch\n");
  write(root, "composeApp/.gradle/cache.lock", "lock\n");
  write(root, "composeApp/.kotlin/sessions/s.txt", "session\n");
  // OS/editor junk that appears on a real machine (the live-repro residual).
  write(root, "composeApp/.DS_Store", "finder-junk\n");
  write(root, "qa/.DS_Store", "finder-junk\n");
  write(root, "composeApp/composeApp.iml", "<module/>\n");
  write(root, "qa/lane.log", "log-noise\n");
  write(root, "composeApp/.idea/workspace.xml", "<project/>\n");
  // Lane outputs (excluded by EXCLUDED_PREFIXES in both modes already).
  write(root, "qa/evidence/latest.json", "{}\n");
}

test("inputs-hash: pre-git (walk) and post-git-init hashes agree for identical source", async () => {
  const { computeInputsHash } = await import(TEMPLATE_INPUTS_HASH);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-hash-parity-"));
  try {
    makeFakeProject(root);

    // Stamp-time state: no .git — the walk fallback runs.
    const preGit = computeInputsHash(root);

    // Scratch must not be part of the surface in walk mode.
    const preGitAgain = computeInputsHash(root);
    assert.equal(preGit.hash, preGitAgain.hash, "walk mode must be deterministic");
    fs.writeFileSync(path.join(root, "composeApp/build/tmp/scratch.bin"), "different-scratch\n");
    const preGitScratchChanged = computeInputsHash(root);
    assert.equal(
      preGit.hash,
      preGitScratchChanged.hash,
      "changing build/ scratch must not change the walk-mode hash",
    );

    // First-touch UX path: the user runs `git init` + commits. The git ls-files
    // path takes over; the hash must NOT change (no source changed).
    const git = (cmd) =>
      execSync(`git ${cmd}`, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    git("init -q");
    git("add -A");
    git('-c user.email=t@t -c user.name=t commit -qm init');

    const postGit = computeInputsHash(root);
    assert.equal(
      preGit.hash,
      postGit.hash,
      "git init must not invalidate a stamp-time receipt: pre-git (walk) and post-git hashes must agree",
    );
    assert.equal(preGit.fileCount, postGit.fileCount, "both modes must see the same surface files");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("inputs-hash: source changes DO change the hash in both modes", async () => {
  const { computeInputsHash } = await import(TEMPLATE_INPUTS_HASH);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-hash-parity-src-"));
  try {
    makeFakeProject(root);
    const before = computeInputsHash(root);
    fs.appendFileSync(path.join(root, "composeApp/src/commonMain/kotlin/Main.kt"), "// changed\n");
    const after = computeInputsHash(root);
    assert.notEqual(before.hash, after.hash, "a real source change must change the walk-mode hash");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
