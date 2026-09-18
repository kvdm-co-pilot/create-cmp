// THE DOOR REFUSES A TREE npm INSTALLED CORRECTLY, AND NAMES A COMMAND THAT
// CANNOT CLEAR THE REFUSAL.
//
// `scripts/suite-preflight.mjs` decides which packages this tree owes
// dependencies for by reading the root manifest's `workspaces` and expanding it
// itself. npm reads the same field and expands it too. That is TWO readers of
// ONE declaration, and they do not agree: npm's expansion honours a `!` pattern
// as an exclusion, and `declaredPackages` pushes it as a literal path, drops it
// (no `package.json` at `!ws/b`) and keeps the package npm threw away.
//
// MEASURED 2026-09-18, a fixture with `workspaces: ["ws/*", "!ws/b"]` where
// `ws/b` declares a dependency:
//
//     npm install   -> exit 0, `npm ls` clean, ws/b correctly not a workspace
//     npm test      -> exit 1
//                      "npm test refused: this tree's packages are not installed.
//                           ws/b (b)  missing: a-package-nobody-installed
//                        Run this at the repository root, then npm test again:
//                            npm ci"
//     npm ci        -> exit 0
//     npm test      -> exit 1, the same refusal
//
// The suite can never run on that tree, and the one command the refusal names
// does not move it. This is the outcome the door's own header calls the worst
// one — "a preflight that goes wrong must cost a worse error message, never an
// unrunnable repository" — arriving through the path the header did not cover.
//
// IT IS NOT THE DOCUMENTED FAIL-OPEN. `declaredPackages` promises, in its own
// doc comment, to throw "on a glob shape it does not implement, so the caller
// fails OPEN rather than quietly covering less than it claims". A `!` pattern IS
// a shape it does not implement; it does not throw, and it covers MORE than the
// declaration, which is the direction that refuses rather than the direction
// that passes. `packages/**` and `packages/aliases/*/` — two other shapes npm
// accepts and this reader does not — do throw, and are the proof the mechanism
// works and that this one slipped past it.
//
// WHAT THIS FILE REFUSES IS THE CLASS, NOT THE `!`. The invariant is that the
// door's package set is npm's own, or the door declines to decide:
//
//     declaredPackages(root) === npm's workspaces + the root,   OR it throws
//
// A THIRD set is the defect, whatever spelling produces it — a brace list, a
// `**`, a trailing slash, an exclusion, or the next shape npm grows. So npm is
// ASKED, per fixture, rather than its answer being written down here: a
// hard-coded expectation would be a third reader of the same declaration and
// would drift the same way the second one just did.
import { test } from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { declaredPackages, main, uninstalled } from "../scripts/suite-preflight.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Declarations npm ACCEPTS — each was run through `npm pkg get name
 * --workspaces` and enumerated a workspace set without error. A pattern npm
 * itself rejects proves nothing about this reader, because npm aborts before
 * any lifecycle script runs.
 */
const DECLARATIONS = [
  ["ws/*"],
  ["ws/*", "!ws/b"],
  ["ws/a", "ws/b"],
  ["./ws/*"],
  ["ws/**"],
  ["ws/*/"],
  // The brace case is the OTHER direction of the same defect, and the one a
  // deny-list of metacharacters reaches last: npm resolves both packages, and
  // the first version of this reader walked NEITHER — silently, because
  // `ws/{a,b}` holds no `*` and so was pushed as a literal directory that does
  // not exist. Under-coverage is the safe direction and it was still a lie:
  // `declaredPackages` promised in its own docstring to decline instead.
  ["ws/{a,b}"],
];

/** A root manifest plus two workspace-shaped directories, one of them with a dependency. */
function fixture(workspaces) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-wsdecl-"));
  const write = (rel, obj) => {
    fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), `${JSON.stringify(obj, null, 2)}\n`);
  };
  write("package.json", { name: "fixture-root", version: "0.0.0", private: true, workspaces });
  write("ws/a/package.json", { name: "@fixture/a", version: "0.0.0" });
  write("ws/b/package.json", {
    name: "@fixture/b",
    version: "0.0.0",
    dependencies: { "a-package-nobody-installed": "^1.0.0" },
  });
  return dir;
}

/**
 * npm's OWN answer for a declaration: the package names it treats as workspaces.
 * `npm pkg get` reads manifests only — no install, no registry.
 */
function npmWorkspaceNames(dir) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // KD-49: a nested runner inherits a verdict
  delete env.NODE_OPTIONS;
  const run = spawnSync("npm", ["pkg", "get", "name", "--workspaces"], { cwd: dir, encoding: "utf8", env });
  assert.equal(
    run.status,
    0,
    `npm could not enumerate the workspaces of a declaration this test claims it accepts — ` +
      `the fixture is wrong, not the door:\n${run.stderr ?? run.error}`,
  );
  return Object.keys(JSON.parse(run.stdout || "{}")).sort();
}

/** What the door decided, or the reason it declined to decide. */
function doorNames(dir) {
  try {
    return {
      names: declaredPackages(dir)
        .filter((p) => p.rel !== ".")
        .map((p) => p.name)
        .sort(),
    };
  } catch (err) {
    return { declined: err?.message ?? String(err) };
  }
}

test("the preflight judges the packages npm declares, or declines to judge — never a third set", () => {
  const divergent = [];
  let observed = 0;
  for (const workspaces of DECLARATIONS) {
    const dir = fixture(workspaces);
    try {
      const npmNames = npmWorkspaceNames(dir);
      const door = doorNames(dir);
      // Declining IS the documented answer: `main()` prints a note and exits 0,
      // so the suite runs exactly as it did before the door existed.
      if (door.declined) continue;
      observed += 1;
      if (JSON.stringify(door.names) !== JSON.stringify(npmNames)) {
        divergent.push(
          `    ${JSON.stringify(workspaces)}\n` +
            `        npm  : ${npmNames.join(", ") || "(none)"}\n` +
            `        door : ${door.names.join(", ") || "(none)"}`,
        );
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  assert.ok(observed >= 2, `only ${observed} declaration(s) were actually compared — this guard would pass vacuously`);
  assert.deepEqual(
    divergent,
    [],
    `${divergent.length} workspace declaration(s) npm ACCEPTS are expanded differently by ` +
      `scripts/suite-preflight.mjs, which neither agrees with npm nor throws:\n${divergent.join("\n")}\n` +
      `  A package npm excluded has no dependencies installed, so the door reports it uninstalled and ` +
      `refuses \`npm test\` on a tree npm built correctly. Either expand it the way npm does, or throw ` +
      `on the shape so the door fails OPEN, which is what its own doc comment promises.`,
  );
});

test("a tree npm built correctly is never refused, whichever remedy the reader takes", () => {
  // The consequence, stated as the thing a contributor actually meets, and asked
  // at the DOOR rather than at `uninstalled()`. The test above allows either
  // remedy — expand the shape the way npm does, or decline it — and only one of
  // them is visible as a finding list: declining throws out of `declaredPackages`
  // and `main` turns it into a note and exit 0. Both remedies are the same
  // sentence here, which is the sentence that matters: this tree is not refused.
  //
  // `ws/b` is excluded, so npm never installs its dependency and never should. A
  // preflight that counted it produced a refusal no install could clear —
  // measured before the fix: `npm install` exit 0, `npm ci` exit 0, `npm test`
  // exit 1 both times, with the same text naming `npm ci`.
  const dir = fixture(["ws/*", "!ws/b"]);
  try {
    const excluded = npmWorkspaceNames(dir);
    assert.ok(
      !excluded.includes("@fixture/b"),
      "npm treats the `!` pattern as an inclusion here, so this fixture is not the exclusion it claims to be",
    );
    assert.equal(
      main(dir),
      0,
      "the door REFUSES a tree `npm install` and `npm ci` both complete cleanly, because it counts a package " +
        "the root manifest EXCLUDES from its workspaces — and the refusal names `npm ci`, which cannot clear it",
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("this repository's own declaration is one both readers agree on", () => {
  // Non-vacuity for the two above, and the reason the defect has no producer
  // here today: the shapes that diverge are not in this manifest. If one is ever
  // added, this goes red beside the others rather than the door silently
  // refusing the repository.
  const declared = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).workspaces ?? [];
  assert.ok(declared.length, "the root manifest declares no workspaces — the guards above describe nothing here");
  const npmNames = npmWorkspaceNames(ROOT);
  const door = doorNames(ROOT);
  assert.ok(!door.declined, `the door declines to judge THIS repository's declaration: ${door.declined}`);
  assert.deepEqual(
    door.names,
    npmNames,
    "the preflight and npm disagree about which packages this repository declares, so the door is deciding " +
      "about a set nobody installs",
  );
});

// THE ALLOW-LIST CONSTRAINS THE PATTERN. THE EXPANSION IS STILL A SECOND GLOB.
//
// `LITERAL_PATH` decides which DECLARATIONS this reader will touch, and the
// three tests above vary the declaration against ONE fixed directory layout.
// The divergence has two axes and the allow-list closed one: for a pattern it
// ADMITS, `declaredPackages` expands `ws/*` with its own `readdirSync` +
// `isDirectory()`, while npm expands the same `ws/*` with
// `@npmcli/map-workspaces`. Two globbers, one declaration — the `!ws/b` finding
// one axis over.
//
// MEASURED 2026-09-18, declaration `["ws/*"]` in every case:
//
//   ws/.hidden/       npm: [a]        door: [a, hidden]
//                     npm's glob does not match a leading dot; `readdirSync`
//                     returns it. This is the REFUSING direction: the door
//                     counts a package npm never installs, refuses `npm test`
//                     over its missing dependencies, and `npm ci` — the one
//                     command the refusal names — cannot clear it.
//   ws/linked -> ../  npm: [a, linked]  door: [a]
//                     `entry.isDirectory()` is false for a symlink, so the door
//                     covers LESS than it claims, silently, which
//                     `declaredPackages`'s own docstring promises not to do.
//
// This is KD-44's class arriving in a second module: that entry measured the
// same dot-entry divergence in `globMatches` and named the remedy — do not
// re-implement the other reader's globber; either ask it or decline the input.
const LAYOUTS = {
  // The control. If this diverges, the fixture is wrong rather than the door.
  "a plain directory": () => {},
  "a dot-directory the glob does not match": (dir, write) =>
    write("ws/.hidden/package.json", {
      name: "@fixture/hidden",
      version: "0.0.0",
      dependencies: { "a-package-nobody-installed": "^1.0.0" },
    }),
  "a symlinked directory": (dir, write) => {
    write("elsewhere/package.json", {
      name: "@fixture/linked",
      version: "0.0.0",
      dependencies: { "a-package-nobody-installed": "^1.0.0" },
    });
    fs.symlinkSync(path.join(dir, "elsewhere"), path.join(dir, "ws", "linked"), "dir");
  },
};

test("the door expands a glob the way npm expands it, or declines — the layout is the other axis", () => {
  const divergent = [];
  let compared = 0;
  for (const [label, layout] of Object.entries(LAYOUTS)) {
    const dir = fixture(["ws/*"]);
    try {
      const write = (rel, obj) => {
        fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
        fs.writeFileSync(path.join(dir, rel), `${JSON.stringify(obj, null, 2)}\n`);
      };
      try {
        layout(dir, write);
      } catch {
        // A layout this filesystem cannot build (symlink privileges on Windows)
        // is not evidence about the door. Every other layout still runs, and
        // the non-vacuity guard below still has to be satisfied.
        continue;
      }
      const npmNames = npmWorkspaceNames(dir);
      const door = doorNames(dir);
      if (door.declined) continue; // declining is the documented answer
      compared += 1;
      if (JSON.stringify(door.names) !== JSON.stringify(npmNames)) {
        divergent.push(
          `    ${label}\n` +
            `        npm  : ${npmNames.join(", ") || "(none)"}\n` +
            `        door : ${door.names.join(", ") || "(none)"}`,
        );
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  assert.ok(compared >= 2, `only ${compared} layout(s) were compared — this guard would pass vacuously`);
  assert.deepEqual(
    divergent,
    [],
    `${divergent.length} directory layout(s) under a glob this reader ACCEPTS are expanded differently by ` +
      `scripts/suite-preflight.mjs:\n${divergent.join("\n")}\n` +
      `  The allow-list decides which PATTERNS the reader touches; it does not make the expansion npm's. A ` +
      `dot-directory is counted here and not by npm, so the door refuses a tree npm built correctly and names ` +
      `\`npm ci\`, which cannot clear it — the same outcome as the \`!\` pattern, one axis over. A symlinked ` +
      `workspace is npm's and not the door's, so the door covers less than its docstring promises. Either ` +
      `expand the way npm does, or decline.`,
  );
});
