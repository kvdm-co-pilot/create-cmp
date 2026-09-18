// A DRY RUN ASKED FOR IN WORDS WRITES THE ADOPTER'S TREE.
//
// `--dry-run` is a promise: print the plan, change nothing. `parseArgs` accepts
// the value form of it because `flagBool` is tri-state by contract, and until
// this slice it stored the STRING — while every reader that decides whether to
// write is spelled `flags["dry-run"] === true` (src/commands/upgrade.mjs:371 and
// :579, clean.mjs:80, verify.mjs:80, harden.mjs:224, attach.mjs:361,
// doctor.mjs:328). `"true" !== true`, so the promise was read as absent.
//
// Measured on `8bd782a`, 2026-09-19, against a two-line version catalog:
//
//   $ create-cmp upgrade --dry-run true --yes --target-dir <fixture>
//     Apply these changes (backups written as *.bak-upgrade)? (auto-yes)
//     ✓ wrote gradle/libs.versions.toml (backup: gradle/libs.versions.toml.bak-upgrade)
//     Applied. Prove the build: create-cmp verify --target-dir <fixture>
//
// The adopter asked for a dry run, in a form the parser documents, and the
// command rewrote their version catalog. `--yes` on the same line is read
// correctly — it is a bare boolean — so the consent prompt that stands between
// a misread flag and a write was skipped in the same breath: the answer that
// was wrong was the one that protects the tree, and the answer that was right
// was the one that removes the last question. That is "given a tree they did
// not ask for" in the first row of docs/KNOWN-DEFECTS.md's table, so it is
// fixed before merge as a failing test rather than logged (ADR-0014).
//
// The second test here is the same defect read the other way round —
// `Boolean("false") === true`, so a refusal that guards someone else's tree was
// bypassed by the word `false` — and both are driven through the real bins,
// because the parser is not where either promise is kept.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CREATE_CMP = path.join(ROOT, "bin", "create-cmp.mjs");
const PROOFLANE = path.join(ROOT, "packages", "harness", "bin", "prooflane.mjs");

// Styling is stripped before anything is asserted. These assertions are about
// BEHAVIOUR — did it dry-run, did it reach consent, did it write — and the
// command styles its own words: `Dry run` is yellow, so the reset sequence lands
// between "Dry run" and " — nothing written" and a plain regex misses a message
// that is right there. picocolors emits colour when CI is set and not when a
// developer runs it at a pipe, so without this the suite is green on a laptop and
// red on every runner, for a reason that is not the product. Measured 2026-09-19:
// this test passed locally and failed on all three CI Node versions.
const PLAIN = /\u001B\[[0-9;]*m/g;

function run(bin, argv) {
  const r = spawnSync(process.execPath, [bin, ...argv], { cwd: ROOT, encoding: "utf8" });
  return { code: r.status, out: `${r.stdout}${r.stderr}`.replace(PLAIN, "") };
}

/** Every file under a tree, with its bytes — the only honest "nothing changed". */
function snapshot(root, rel = "", into = new Map()) {
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) snapshot(root, r, into);
    else into.set(r, fs.readFileSync(path.join(root, r)).toString("base64"));
  }
  return into;
}

/**
 * A project `create-cmp upgrade` has something to say about: a version catalog
 * pinning a Kotlin the registry's proven set moves. Two lines, no Gradle, no
 * network — the plan is computed from the catalog text alone.
 */
function catalogFixture() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dry-run-writes-")));
  fs.mkdirSync(path.join(dir, "gradle"), { recursive: true });
  fs.writeFileSync(path.join(dir, "gradle", "libs.versions.toml"), '[versions]\nkotlin = "2.0.0"\n');
  return dir;
}

test("`upgrade --dry-run true` writes nothing, and does not reach the consent it would skip", () => {
  const dir = catalogFixture();
  try {
    const before = snapshot(dir);
    const r = run(CREATE_CMP, ["upgrade", "--dry-run", "true", "--yes", "--target-dir", dir]);

    assert.equal(r.code, 0, `the run failed rather than dry-ran:\n${r.out}`);
    assert.match(r.out, /Dry run — nothing written/, `the command did not treat this as a dry run:\n${r.out}`);
    assert.doesNotMatch(r.out, /auto-yes/, "`--yes` answered a consent prompt a dry run must never reach");
    assert.doesNotMatch(r.out, /Applied\./, "the command reported applying changes on a dry run");

    const after = snapshot(dir);
    assert.deepEqual(
      [...after.keys()].sort(),
      [...before.keys()].sort(),
      "a dry run created or removed a file — a `.bak-upgrade` here means it wrote and backed up"
    );
    for (const [rel, bytes] of before) {
      assert.equal(after.get(rel), bytes, `a dry run rewrote ${rel}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("`--dry-run true` and a bare `--dry-run` are the same run", () => {
  // The control. `--dry-run true` is not merely harmless now; it is the flag,
  // and a fix that made it a no-op would pass the test above and still lose the
  // user's meaning. Compared on the output, with the target path — the only
  // line that differs between two fixtures — removed.
  const bare = catalogFixture();
  const worded = catalogFixture();
  try {
    const a = run(CREATE_CMP, ["upgrade", "--dry-run", "--target-dir", bare]);
    const b = run(CREATE_CMP, ["upgrade", "--dry-run", "true", "--target-dir", worded]);
    const scrub = (s, d) => s.split(d).join("<project>").replace(/\s+/g, " ");
    assert.equal(a.code, b.code);
    assert.equal(scrub(a.out, bare), scrub(b.out, worded));
  } finally {
    fs.rmSync(bare, { recursive: true, force: true });
    fs.rmSync(worded, { recursive: true, force: true });
  }
});

test("`init --new-profile false` does not walk through the refusal that guards a claimed tree", () => {
  // The other direction of the same defect: `Boolean("false")` is `true`, so the
  // word `false` turned the claimed-tree check at install/init.mjs:950 off. What
  // it guards is an adopter's existing project — a second, generic profile
  // seeded over the one already there — and `--new-profile` is how you say you
  // meant it. Saying the opposite must not be the same as saying it.
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "claimed-tree-")));
  try {
    // What `packages/harness/src/lib/profiles/cmp/declarations.mjs` detects: the
    // composeApp module and a Gradle settings file, both present.
    fs.mkdirSync(path.join(dir, "composeApp"), { recursive: true });
    fs.writeFileSync(path.join(dir, "composeApp", "build.gradle.kts"), "// a Compose Multiplatform module\n");
    fs.writeFileSync(path.join(dir, "settings.gradle.kts"), "// a Gradle settings file\n");
    const before = snapshot(dir);

    const r = run(PROOFLANE, ["init", "--new-profile", "false", "--no-interview", dir]);
    assert.equal(r.code, 2, `the refusal did not fire:\n${r.out}`);
    assert.match(r.out, /claimed by the `cmp` profile/, `the refusal did not name the claim:\n${r.out}`);

    const after = snapshot(dir);
    assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), "the refused install wrote files anyway");

    // And `--new-profile true` still means what `--new-profile` means: the
    // refusal is passed, deliberately. A dry run, so the assertion is about the
    // refusal and not about fifty-one files.
    const yes = run(PROOFLANE, ["init", "--new-profile", "true", "--dry-run", "--no-interview", dir]);
    assert.doesNotMatch(yes.out, /claimed by the `cmp` profile/, `--new-profile true stopped meaning --new-profile:\n${yes.out}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
