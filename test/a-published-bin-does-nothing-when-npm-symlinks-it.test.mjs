// A PUBLISHED BIN MUST STILL RUN WHEN IT IS INVOKED THE WAY NPM INSTALLS IT.
//
// npm does not put a `bin` on PATH by copying it. It writes a SYMLINK —
// `node_modules/.bin/prooflane -> ../prooflane-harness/bin/prooflane.mjs` — and
// that is what `npx prooflane` and every `package.json` script execute. Node
// then resolves the symlink for the module graph but NOT for `process.argv[1]`,
// so inside the module those two spellings of "which file am I" disagree:
//
//   process.argv[1]   /tmp/app/node_modules/.bin/prooflane        (the link)
//   import.meta.url   file:///tmp/app/node_modules/prooflane-harness/bin/prooflane.mjs
//
// An entry-point guard written as `import.meta.url === \`file://${argv[1]}\``
// therefore reads FALSE for the one invocation that matters. The module loads,
// defines everything, calls nothing, and the process exits 0 with no output.
// Measured 2026-09-13 against a real `npm pack` + `npm install` of
// packages/harness:
//
//   $ ./node_modules/.bin/prooflane --version
//   $                                              ← nothing. exit 0.
//
// That is worse than a crash: `prooflane init` becomes a silent no-op that
// SUCCEEDS, so a CI step that installs the lane and checks `$?` passes while no
// lane was ever installed.
//
// The class, and why this test compares two invocations rather than grepping
// for the bad comparison: any "am I the entry point" test that compares a URL to
// a path is wrong in more ways than one — a symlink (here), a path holding a
// space or any character percent-encoding touches, a Windows drive letter. The
// invariant is behavioural and covers all of them: EVERY bin every package.json
// declares must produce the same output and the same exit code when reached
// through a link as when reached directly.
//
// "Every package.json" means every package this repo PUBLISHES — the list
// scripts/ground-truth.mjs derives (`ownedNames`), not a directory convention
// of this file's own. It had one (KD-18): the root and `packages/*`, which is
// two of the eight packages that declare a bin; the aliases under
// `packages/aliases/` — `prooflane` among them, the name adopters `npx` — and
// the inspector at `inspector/mcp` were never run.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { groundTruth, ownedNames } from "../scripts/ground-truth.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * What the claim above covers, read from the ONE list of published packages
 * this repo keeps (`ownedNames`, which test/a-version-number-cannot-name-two-
 * different-trees.test.mjs holds to every tracked publishable manifest). Every
 * package there that declares a `bin` owes every one of its bin names — npm
 * links each name, so each is a way an adopter reaches the file.
 */
function requiredBins() {
  const out = [];
  for (const p of ownedNames(groundTruth())) {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, p.dir, "package.json"), "utf8"));
    if (pkg.private || !pkg.bin) continue;
    const names = typeof pkg.bin === "string" ? [pkg.name.replace(/^@[^/]+\//, "")] : Object.keys(pkg.bin);
    for (const name of names) out.push(`${pkg.name}: ${name}`);
  }
  return out.sort();
}

/**
 * Every `bin` of every published package, one entry per NAME. Not deduplicated
 * by target: `create-cmp` and `create-cmp-cli` are one file linked under two
 * names, and npm writes both links.
 */
function declaredBins() {
  const bins = [];
  for (const p of ownedNames(groundTruth())) {
    const manifest = path.join(ROOT, p.dir, "package.json");
    const pkg = JSON.parse(fs.readFileSync(manifest, "utf8"));
    if (pkg.private || !pkg.bin) continue;
    const entries =
      typeof pkg.bin === "string" ? [[pkg.name.replace(/^@[^/]+\//, ""), pkg.bin]] : Object.entries(pkg.bin);
    for (const [name, rel] of entries) {
      bins.push({ target: path.resolve(path.dirname(manifest), rel), name, pkg: pkg.name });
    }
  }
  return bins;
}

/**
 * Run from a scratch directory, never the repo: the inspector's server reads
 * its cwd to decide whether it was launched inside an app, and a bin under test
 * should see no project at all. Bounded, because that bin is a server — it
 * exits when stdin closes (measured), and one that stopped doing so should fail
 * this test rather than hang the suite.
 */
function run(file, cwd) {
  const r = spawnSync(process.execPath, [file, "--help"], { encoding: "utf8", cwd, timeout: 60_000 });
  return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", status: r.status, error: r.error?.code ?? null };
}

const said = (r) =>
  `exit ${r.status}${r.error ? ` (${r.error})` : ""}, ${r.stdout.length} bytes of stdout, ${r.stderr.length} of stderr`;

test("a bin reached through a symlink behaves as it does reached directly", () => {
  const bins = declaredBins();

  const dead = [];
  const exercised = [];
  for (const { target, name, pkg } of bins) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bin-symlink-"));
    try {
      const direct = run(target, dir);
      // WHAT "CAN TELL THE TWO APART" MEANS. A dead entry-point guard has one
      // signature: exit 0, nothing on stdout, nothing on stderr. This used to
      // demand stdout, which both bins it used to read happened to print, and
      // which bins it reads now legitimately may not: the inspector is a stdio MCP
      // server (its stdout is the protocol channel; it announces itself on
      // stderr), and an alias whose dependency is not installed says so on
      // stderr and exits 1. Either is distinguishable from a silent no-op,
      // PROVIDED the comparison below reads stderr too — which it now does, so
      // no channel a bin can speak on goes unread.
      assert.ok(
        direct.status !== 0 || direct.stdout.length > 0 || direct.stderr.length > 0,
        `${name}: invoked directly it already exits 0 in silence (${said(direct)}), so this test cannot tell it ` +
          `from a guard that skipped everything`
      );

      // Exactly what `npm install` writes into node_modules/.bin.
      const link = path.join(dir, name);
      fs.symlinkSync(target, link);
      const linked = run(link, dir);
      if (
        linked.stdout !== direct.stdout ||
        linked.stderr !== direct.stderr ||
        linked.status !== direct.status ||
        linked.error !== direct.error
      ) {
        const silent = linked.status === 0 && !linked.stdout && !linked.stderr;
        dead.push(
          `${pkg} → ${name} (${path.relative(ROOT, target)}): direct → ${said(direct)}; ` +
            `through the symlink npm writes → ${said(linked)}` +
            (silent ? " — the command did NOTHING and reported success" : "")
        );
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    exercised.push(`${pkg}: ${name}`);
  }

  // THE CLAIM'S OWN COVERAGE (KD-18). This file said "every bin" while its scan
  // read the root and `packages/*` one level down: two of the eight packages
  // that declare a bin, and `bins.length > 0` passed on that. Recorded as each
  // bin is RUN, so a narrowed scan, a skip, or an early `continue` all read
  // here as the names they dropped.
  const missed = requiredBins().filter((b) => !exercised.includes(b));
  assert.deepEqual(
    missed,
    [],
    `this test claims every published bin, and never ran these through a symlink:\n  ${missed.join("\n  ")}`
  );

  assert.deepEqual(
    dead,
    [],
    "each line is a published command that changes behaviour when npm installs it, which is the " +
      "only way an adopter ever runs it:\n  " + dead.join("\n  ")
  );
});
