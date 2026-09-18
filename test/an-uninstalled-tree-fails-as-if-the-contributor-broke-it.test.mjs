// THE FIRST THING A FRESH CLONE IS TOLD MUST NOT BE A CLAIM ABOUT ITS OWN CHANGE.
//
// Measured 2026-09-18 in a git worktree with `inspector/mcp`'s packages absent:
// `npm test` reported three failures and only one of them looked like a missing
// install. Two were ERR_MODULE_NOT_FOUND, which a reader can follow. The third
// was an AssertionError about the Evidence tab not linking a step to the section
// it governs — a statement about product behaviour, arriving as the first thing
// a contributor sees about code they may have just touched. The verdict was
// right and the diagnosis it invited was wrong, and the honest way to clear it
// cost a run of the same three files against clean `origin/main` first.
//
// scripts/suite-preflight.mjs is the answer and its header carries the design:
// why a refusal rather than a skip (this suite's verdict does not count skips,
// so skipping would report PASS over tests that never ran), and why the
// predicate is the resolver's node_modules walk rather than any of the three
// cheaper spellings, each of which was measured calling an installed package
// missing.
//
// WHAT THIS FILE HAS TO PIN, AND THE ORDER IT MATTERS IN:
//
//   1. the door refuses, and the runner does not start — asserted end to end
//      through npm's own `pretest` lifecycle on a fixture tree, because the
//      claim is about npm aborting the run, not about a function returning a
//      list;
//   2. THIS repo is wired to that same door, or (1) is a property of a fixture
//      and of nothing that ships;
//   3. the door cannot hide a real failure. It is a precondition on the whole
//      run and touches no test: on an installed tree it finds nothing, and the
//      files it would otherwise have protected run in full with zero skipped.
//      A guard that could skip would have to enumerate its victims, and one of
//      the three victims here was never reproducible — which is the argument
//      for a door, made as a test;
//   4. it fails OPEN. A preflight that goes wrong costs a worse error message,
//      never an unrunnable repository;
//   5. it needs nothing installed itself, or it cannot run on the tree it is
//      about.
import { test } from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { declaredPackages, installedFrom, refusal, uninstalled } from "../scripts/suite-preflight.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOOR = path.join(ROOT, "scripts", "suite-preflight.mjs");

/**
 * The three files KD-89 measured. Named here because point 3 above is about
 * THESE, and a test that checked "some files" would pass while the ones that
 * were hurt were skipped.
 */
const VICTIMS = [
  "inspector/mcp/test/bundle-freshness.test.mjs",
  "inspector/mcp/test/server-tools.test.mjs",
  "test/console-copy-delivery.test.mjs",
];

/**
 * A run of the node runner is not a run of THIS suite, and an inherited
 * NODE_TEST_CONTEXT makes a nested runner exit 0 whatever its tests did
 * (KD-49). Every spawn below starts from a scrubbed environment.
 */
function cleanEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_OPTIONS;
  return env;
}

/**
 * A miniature of this repo's shape: a root manifest declaring a workspace, a
 * `pretest` running the REAL door, and a `test` script that leaves a marker.
 * The marker is the point — it is how "the runner never started" is observed
 * rather than inferred from an exit code.
 */
/**
 * Four packages nobody will ever publish, one per axis of the door's SCOPE: the
 * root's own dependencies, a workspace's, a second entry in one package (so a
 * refusal that names only the first is visible), and a devDependency. Each was
 * added because a mutation of `declaredPackages` that dropped that axis left
 * every test in this file green.
 */
const ROOT_DEP = "a-root-package-nobody-installed";
const SECOND_DEP = "a-second-package-nobody-installed";
const DEV_DEP = "a-dev-package-nobody-installed";

function fixture({ dep = "a-package-nobody-installed", workspaces = ["ws"] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preflight-"));
  fs.mkdirSync(path.join(dir, "ws"));
  fs.writeFileSync(path.join(dir, "ran.mjs"), `import fs from "node:fs";\nfs.writeFileSync(new URL("./ran.marker", import.meta.url), "the runner started\\n");\n`);
  fs.writeFileSync(
    path.join(dir, "package.json"),
    `${JSON.stringify(
      {
        name: "preflight-fixture",
        version: "0.0.0",
        private: true,
        type: "module",
        workspaces,
        // THE ROOT IS A PACKAGE TOO, and a fixture whose only dependencies live
        // in a workspace cannot tell a door that walks the root from one that
        // does not: both return the same refusal. Measured by mutation —
        // dropping "." from `rels` left all eight tests green.
        dependencies: { [ROOT_DEP]: "^1.0.0" },
        scripts: { pretest: `node ${JSON.stringify(DOOR)}`, test: "node ./ran.mjs" },
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(
    path.join(dir, "ws", "package.json"),
    `${JSON.stringify(
      {
        name: "@fixture/ws",
        version: "0.0.0",
        dependencies: { [dep]: "^1.0.0", [SECOND_DEP]: "^1.0.0" },
        // Same argument twice more: a door reading only `dependencies` and a
        // refusal naming only the first missing package were both invisible to
        // this fixture until it carried a devDependency and a second entry.
        devDependencies: { [DEV_DEP]: "^1.0.0" },
      },
      null,
      2,
    )}\n`,
  );
  return dir;
}

const npmTest = (dir) =>
  spawnSync("npm", ["test"], { cwd: dir, encoding: "utf8", env: cleanEnv({ PROOFLANE_SUITE_ROOT: dir }) });

test("a tree whose packages are not installed is refused by name, and the runner never starts", () => {
  const dir = fixture();
  try {
    const run = npmTest(dir);
    const out = `${run.stdout ?? ""}${run.stderr ?? ""}`;

    assert.notEqual(run.status, 0, `npm test exited 0 on an uninstalled tree — the door did not refuse:\n${out}`);
    assert.ok(
      !fs.existsSync(path.join(dir, "ran.marker")),
      "the door refused and the test script RAN ANYWAY — a refusal that does not stop the run is a log line",
    );
    // What the refusal has to say, in the words a reader can act on: which
    // packages, which dependencies, and the one command. Substrings rather than
    // a shape, so the prose can be improved without this file becoming the place
    // it is spelled — but EVERY axis of the door's scope, because a refusal that
    // silently covered one fewer of them read identically here until it did.
    for (const want of ["ws", "a-package-nobody-installed", ROOT_DEP, SECOND_DEP, DEV_DEP, "npm ci"]) {
      assert.ok(
        out.includes(want),
        `the refusal never names ${JSON.stringify(want)}, so the door is not walking it — ` +
          `a package or a dependency field outside its scope is one it can never refuse:\n${out}`,
      );
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("this repository runs that same door before its own suite", () => {
  const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts ?? {};
  // `pretest` and nothing else: npm runs it before `test`, which is what makes
  // the refusal reach `npm test`, `prepublishOnly` and CI without any of the
  // three naming it. A door wired into only one of them guards only that one.
  assert.ok(
    scripts.pretest,
    "package.json declares no `pretest`, so nothing checks this tree is installed before the suite runs — " +
      "the three failures KD-89 measured are what a fresh clone still gets",
  );
  assert.match(
    scripts.pretest,
    /scripts\/suite-preflight\.mjs/,
    `\`pretest\` does not run the preflight, so the fixture above proves a property of a fixture: ${scripts.pretest}`,
  );
});

test("the door finds nothing on this installed tree, so it can hide no failure here", () => {
  // The whole non-hiding argument rests on this being empty: the door either
  // aborts the entire run, or it is silent and every test runs exactly as it
  // did before this file existed. There is no third state, because the door is
  // a precondition on the run and appears in no test.
  const findings = uninstalled(ROOT);
  assert.deepEqual(
    findings.map((f) => `${f.rel}: ${f.missing.join(", ")}`),
    [],
    // THIS MESSAGE NAMES BOTH CAUSES, and the cheap one first, because this file
    // is reachable by a direct `node --test` run that the `pretest` door does not
    // guard — and on an uninstalled tree the true reason is the boring one. An
    // earlier draft said only "the predicate is wrong", which is this slice's own
    // defect committed inside the file that closes it: a message that invites the
    // reader to suspect the code in front of them when their tree is the answer.
    "the preflight reports THIS tree uninstalled while its own suite is running. Either this tree's " +
      "packages are NOT installed — run `npm ci` at the repository root, which is the likely answer if " +
      "you invoked the runner directly rather than through `npm test` — or the predicate is wrong, and " +
      "on a tree it wrongly refuses nothing can run at all",
  );
  // Non-vacuity: an empty list is also what a predicate that inspects nothing
  // returns. These are the packages it actually walked.
  const packages = declaredPackages(ROOT);
  assert.ok(
    packages.length >= 3 && packages.some((p) => p.rel === "inspector/mcp" && p.deps.length),
    `the preflight walked ${packages.length} package(s) and inspector/mcp's dependencies were not among them — ` +
      "it would report an uninstalled tree clean",
  );
});

test("the three files a missing workspace hurt still RUN in full, and none of them is skipped", () => {
  // The risk this answers: a guard that skips is cheap, and a skip that
  // swallows a genuine regression in these three would be worse than the defect
  // it fixes. So they are executed here, under the door, with the count of
  // skipped tests asserted to be zero.
  const run = spawnSync(process.execPath, ["--test", "--test-reporter=tap", ...VICTIMS], {
    cwd: ROOT,
    encoding: "utf8",
    env: cleanEnv(),
  });
  const out = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  const count = (field) => {
    const m = new RegExp(`^# ${field} (\\d+)$`, "m").exec(out);
    return m ? Number(m[1]) : null;
  };
  // Third message with the same rule. Run directly on an uninstalled tree this
  // is the FIRST of the three to go red, and its output is the two
  // ERR_MODULE_NOT_FOUND from KD-89 — so it must not open by asserting the tree
  // is installed, which is precisely the claim in doubt.
  assert.equal(
    count("fail"),
    0,
    "one of the three failed. If the output below is ERR_MODULE_NOT_FOUND, this tree's packages are not " +
      "installed — run `npm ci` at the repository root; `npm test` refuses before reaching here, so this " +
      `is a direct runner invocation. Anything else is a real failure in those files:\n${out.slice(-3000)}`,
  );
  assert.equal(
    count("skipped"),
    0,
    `${count("skipped")} of the three were SKIPPED on an installed tree — a real failure in them would be invisible:\n${out.slice(-3000)}`,
  );
  assert.ok(
    (count("pass") ?? 0) >= VICTIMS.length,
    `only ${count("pass")} test(s) ran across ${VICTIMS.length} files — they are not being executed:\n${out.slice(-3000)}`,
  );
});

test("a tree the door cannot read runs its suite, rather than never running again", () => {
  // KD-89 named this risk in the same breath as the fix: "a preflight that
  // itself goes wrong makes every run unrunnable". So a tree the door does not
  // understand is not a refusal — it is a note, and the suite proceeds to
  // whatever it would have done without this file.
  //
  // The confusing input is a workspace glob shape the door does not implement.
  // It has to be one npm itself accepts, or npm aborts the run before any
  // script starts and the fixture would prove nothing about the door: a
  // deliberately malformed package.json was tried first and npm refused it with
  // EJSONPARSE, never reaching `pretest`.
  const dir = fixture({ workspaces: ["ws", "nested/*/*"] });
  try {
    const run = npmTest(dir);
    const out = `${run.stdout ?? ""}${run.stderr ?? ""}`;
    assert.equal(run.status, 0, `a manifest the door could not parse REFUSED the run:\n${out}`);
    assert.ok(
      fs.existsSync(path.join(dir, "ran.marker")),
      `the door failed open by exit code and the test script still did not run:\n${out}`,
    );
    assert.match(out, /not deciding anything/, `the door swallowed its own error silently:\n${out}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the door needs nothing installed, because it runs on trees where nothing is", () => {
  const source = fs.readFileSync(DOOR, "utf8");
  const specifiers = [...source.matchAll(/^\s*(?:import|export)[^"']*from\s*["']([^"']+)["']/gm)].map((m) => m[1]);
  assert.ok(specifiers.length, "no import found in the preflight — this guard would pass vacuously");
  const foreign = specifiers.filter((s) => !s.startsWith("node:"));
  assert.deepEqual(
    foreign,
    [],
    `the preflight imports ${foreign.join(", ")} — on the uninstalled tree it exists to describe, ` +
      "it would fail to load before it could say anything",
  );
});

test("the predicate answers about the directory it was asked about", () => {
  // The bug in two of the three cheaper predicates the header rejects: they
  // answer about the wrong place, or about the export map instead of the
  // package. inspector/mcp's dependencies are NOT visible from the repository
  // root and ARE visible from inspector/mcp — one predicate, two answers, which
  // is the whole reason it is a walk.
  // Same rule as the message above: the boring cause first. `esbuild` is
  // inspector/mcp's devDependency, so this assertion is about the TREE before it
  // is about the predicate, and on an uninstalled tree it is the tree.
  assert.equal(
    installedFrom(path.join(ROOT, "inspector", "mcp"), "esbuild"),
    true,
    "esbuild is not visible from inspector/mcp. Either this tree's packages are not installed — run " +
      "`npm ci` at the repository root — or the walk is not finding a package that is there",
  );
  assert.equal(installedFrom(ROOT, "esbuild"), false, "esbuild is NOT a root dependency — a predicate that says it is, is not walking");
  assert.equal(installedFrom(ROOT, "no-such-package-anywhere"), false, "a package nobody declared cannot be installed");
});

test("the refusal names every package it found, not the first one", () => {
  const text = refusal([
    { rel: "inspector/mcp", name: "@create-cmp/inspector", missing: ["esbuild"] },
    { rel: "packages/harness", name: "prooflane-harness", missing: ["left-pad", "right-pad"] },
  ]);
  for (const want of ["inspector/mcp", "esbuild", "packages/harness", "left-pad", "right-pad", "npm ci"]) {
    assert.ok(text.includes(want), `the refusal omits ${JSON.stringify(want)}:\n${text}`);
  }
});
