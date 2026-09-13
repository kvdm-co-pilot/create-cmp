// ONE INSTALLER, TWO FRONT DOORS, AND ONLY ONE OF THEM KEEPS THE DIRECTORY.
//
// `prooflane init` and `create-cmp harness init` reach the SAME code
// (`packages/harness/install/init.mjs`) through two different parsers, each
// carrying its own `BOOLEAN_FLAGS`. Every name prooflane's parser declares
// boolean is, by that declaration, a flag of the shared installer — so a user
// may type it on either door. Where create-cmp's parser has not been told the
// same thing, that flag eats the directory beside it and the installer runs
// against the current working directory instead. That is KD-7 exactly, still
// alive for one spelling. Measured on this tree, 2026-09-14, with the real
// commands into real directories:
//
//   $ cd cwdY && create-cmp harness init --y ../pY
//     project: …/cwdY        ← 52 files into the cwd, ../pY untouched, exit 0
//   $ cd cwdZ && prooflane   init --y ../pZ
//     project: …/pZ          ← correct
//
// `y` is declared boolean by `packages/harness/install/args.mjs` and absent from
// `src/lib/args.mjs`. The agreement test that landed beside it does not reach
// this: it compares the two lists only over flag names read INSIDE
// `packages/harness/install/`, and what is read there is `flags.yes`, never
// `flags.y`. A list is not the thing that matters anyway — where the directory
// ends up is — so this file asserts THAT, through the shipped bins, and the
// dispatcher's own index arithmetic is exercised rather than restated.
//
// The invariant covers the class, not the spelling: every flag the shared
// installer's own parser declares boolean, checked through both doors, so the
// next name added to either list is covered the day it is written. A door that
// does not run the installer at all for a flag (`--help`, `--version`) is not a
// swallowed directory and is not refused here — only a door that RUNS and
// resolves a project the user did not name.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { BOOLEAN_FLAGS as HARNESS_BOOLEANS } from "../packages/harness/install/args.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const DOORS = [
  {
    name: "prooflane",
    bin: path.join(ROOT, "packages", "harness", "bin", "prooflane.mjs"),
    argv: (extra, dir) => ["init", ...extra, dir, "--dry-run", "--no-interview"],
  },
  {
    name: "create-cmp harness",
    bin: path.join(ROOT, "bin", "create-cmp.mjs"),
    argv: (extra, dir) => ["harness", "init", ...extra, dir, "--dry-run", "--no-interview"],
  },
];

/**
 * Run one door with `extra` typed before the directory and report which project
 * the installer resolved — `null` when the installer never ran (help/version
 * short-circuit before it, which swallows nothing).
 *
 * `--dry-run` rides at the end so nothing is written wherever it lands; if a
 * door ever ignored it, the stray tree would be under the sandbox and the
 * control test below would still be the thing that failed.
 */
function projectResolvedBy(door, extra, cwd, target) {
  const r = spawnSync(process.execPath, [door.bin, ...door.argv(extra, target)], {
    cwd,
    encoding: "utf8",
    timeout: 60_000,
  });
  const m = /project:\s*(\S.*?)\s*$/m.exec(r.stdout ?? "");
  return m ? fs.realpathSync(m[1]) : null;
}

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "front-door-"));
  const cwd = path.join(dir, "cwd");
  const target = path.join(dir, "named-by-the-user");
  fs.mkdirSync(cwd);
  fs.mkdirSync(target);
  return { dir, cwd, target, real: fs.realpathSync(target) };
}

test("both front doors install where the user pointed when no flag is in the way", () => {
  // The control. It is here so the assertion below cannot pass by reading
  // nothing: if the banner stops printing `project:`, every row becomes "the
  // installer never ran" and the real test goes quietly green. This one goes
  // red instead.
  for (const door of DOORS) {
    const box = sandbox();
    try {
      assert.equal(
        projectResolvedBy(door, [], box.cwd, "../named-by-the-user"),
        box.real,
        `${door.name}: the plain form does not resolve the directory it was given — this file can no longer measure anything`
      );
    } finally {
      fs.rmSync(box.dir, { recursive: true, force: true });
    }
  }
});

test("a flag the shared installer declares boolean never eats the directory, through either door", () => {
  assert.ok(HARNESS_BOOLEANS.size > 0, "the shared installer declares no boolean flags, so nothing is protected");

  const swallowed = [];
  for (const flag of HARNESS_BOOLEANS) {
    for (const door of DOORS) {
      const box = sandbox();
      try {
        const resolved = projectResolvedBy(door, [`--${flag}`], box.cwd, "../named-by-the-user");
        if (resolved !== null && resolved !== box.real) {
          swallowed.push(
            `${door.name} init --${flag} ../named-by-the-user → project: ${resolved} ` +
              `(the user named ${box.real}; the other door gets it right)`
          );
        }
      } finally {
        fs.rmSync(box.dir, { recursive: true, force: true });
      }
    }
  }

  assert.deepEqual(
    swallowed,
    [],
    "each line is a front door whose parser was not told that flag takes no value, so it consumed the " +
      "directory beside it and the installer ran against the current directory instead — 52 files into a " +
      "repo nobody named, exit 0, which is the defect this slice exists to remove:\n  " + swallowed.join("\n  ")
  );
});
