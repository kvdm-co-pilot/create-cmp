// `--help` describes the lane THIS project actually has.
//
// Stage 0 PR 6b (docs/NORTH-STAR.md §6; the residue PR 6a named). The usage
// text enumerated a Compose app's step names — releaseBuild, tokenDrift,
// e2eSmoke, androidChecks, releaseSmoke — as the "device/release tier" that
// `--fast` omits. In any other repo that described a lane the repo does not
// have: the one surface whose whole job is telling an operator what will run,
// confidently naming steps that do not exist. The step names belong to the
// pack, so `--help` reads them from the pack the manifest names.
//
// Two properties, and the second is the load-bearing one: help must never
// refuse. A project with no manifest still gets the full flag reference plus
// one line saying why the project section is missing — it must not invent a
// lane, and it must not exit non-zero on a question.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function stampedApp() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "verify-help-"));
  const dir = path.join(base, "HelpApp");
  const r = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, "bin", "create-cmp.mjs"), dir, "--yes", "--name", "HelpApp", "--package", "com.example.helpapp", "--no-ios", "--no-firebase", "--no-verify"],
    { cwd: REPO_ROOT, encoding: "utf8", timeout: 60_000 },
  );
  if (r.status !== 0) throw new Error(`stamp failed: ${r.stdout}${r.stderr}`);
  return dir;
}

function help(cwd) {
  const r = spawnSync(process.execPath, [path.join(cwd, "qa", "verify.mjs"), "--help"], { cwd, encoding: "utf8", timeout: 30_000 });
  return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

test("a stamped app's --help names its own pack, its steps per profile, and what --fast omits — and exits 0", () => {
  const dir = stampedApp();
  try {
    const { status, out } = help(dir);
    assert.equal(status, 0, out);
    assert.match(out, /This project \(profile "cmp"\):/);
    // The step names are the PACK's, read from it — not a list in the runner.
    assert.match(out, /^ {2}local {5}.*\bbuild\b.*\bunitTests\b/m, "the local profile's steps are listed");
    assert.match(out, /^ {2}smoke {5}/m, "every profile the pack declares gets a row");
    assert.match(out, /--fast omits: .*\be2eSmoke\b/, "the expensive tier is named from the pack, not from prose");
    // And the neutral half no longer hardcodes them.
    const usageOnly = out.slice(0, out.indexOf("This project"));
    for (const stepName of ["releaseBuild", "tokenDrift", "androidChecks", "releaseSmoke"]) {
      assert.ok(!usageOnly.includes(stepName), `the stack-neutral usage must not name ${stepName}`);
    }
    assert.ok(!/Gradle|composeApp|APK/.test(usageOnly), "nor a build tool, a source root, or an artifact format");
  } finally {
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  }
});

test("--help never refuses: no manifest still prints the full flag reference, exits 0, and says why the project section is missing", () => {
  const dir = stampedApp();
  try {
    fs.rmSync(path.join(dir, "qa", "harness-manifest.json"));
    const { status, out } = help(dir);
    assert.equal(status, 0, "a question is not a failure");
    assert.match(out, /--profile <smoke\|scaffold\|local\|ci\|nightly\|release>/, "the flag reference still prints in full");
    assert.match(out, /This project:\n {2}qa\/harness-manifest\.json is missing/);
    // A STAMPED app is told to upgrade (the manifest is derivable from what the
    // stamper already knows); a foreign repo is told to attach and be interviewed.
    assert.match(out, /create-cmp upgrade --harness/, "and names the command that fixes it for THIS kind of tree");
    assert.ok(!/This project \(profile/.test(out), "with no manifest it must not claim a profile");
  } finally {
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  }
});
