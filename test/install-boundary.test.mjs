// THE BOUNDARY BETWEEN THE INSTALLER AND THE LANE.
//
// `prooflane-harness` now ships two things that must never be confused:
//
//   src/        THE LANE — vendored byte-identical into every project's qa/,
//               hashed into the lock, inside the receipt's inputs.hash, and
//               held stack-free by test/agnostic-lint.test.mjs.
//   install/    THE INSTALLER — runs once, from the package, on a machine that
//               has npm. It is not vendored, not locked, not in any receipt.
//
// WHY THE SEPARATION IS LOAD-BEARING, and not just tidiness. The installer's
// whole job is to recognise stacks: it carries Linguist's language table, test
// declaration patterns for Kotlin, Python, Go and the rest, and the seed
// grammars a new profile starts from. That is exactly the knowledge the
// agnostic lint exists to keep OUT of the lane. Both rules are right, and they
// are compatible only while the two trees stay apart — the lint scans `src/`,
// and this file is the proof that `install/` never reaches it.
//
// So the exemption is structural rather than granted: the installer is outside
// the lint's scope because it is outside the region, and if it ever enters the
// region these tests fail before the lint has to have an opinion. That is the
// difference between a boundary and an excuse.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { SYNCED_FILES } from "../scripts/sync-harness.mjs";
import { HARNESS_DIRS, HARNESS_PROFILES_DIR, HARNESS_TEST_DIR, hashHarnessRegion } from "../packages/harness/src/lib/harness-region.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PKG_DIR = path.join(REPO_ROOT, "packages", "harness");
const PKG = JSON.parse(fs.readFileSync(path.join(PKG_DIR, "package.json"), "utf8"));

test("the installer is never vendored: nothing under install/ or bin/ is synced into a project", () => {
  const leaked = SYNCED_FILES.filter(({ from }) => /^packages\/harness\/(install|bin)\//.test(from));
  assert.deepEqual(
    leaked,
    [],
    "installer code reached the template's qa/ — it would enter the lock, the region and every receipt's inputs.hash",
  );
  const intoQa = SYNCED_FILES.filter(({ to }) => /^template\/qa\/(install|bin)\//.test(to));
  assert.deepEqual(intoQa, [], "nothing may be synced to a qa/install or qa/bin path");
});

test("the region's shape cannot reach the installer, whatever it holds", () => {
  // The region is `qa` and `qa/lib` one level deep, plus two named subtrees.
  // An installer file could only enter by someone widening that rule, so this
  // asserts the rule itself rather than today's file list.
  assert.deepEqual(HARNESS_DIRS, ["qa", "qa/lib"]);
  assert.equal(HARNESS_PROFILES_DIR, "qa/lib/profiles");
  assert.equal(HARNESS_TEST_DIR, "qa/test");
  for (const dir of [...HARNESS_DIRS, HARNESS_PROFILES_DIR, HARNESS_TEST_DIR]) {
    assert.ok(!/(^|\/)(install|bin)(\/|$)/.test(dir), `the region names ${dir}, which could carry installer code`);
  }
});

test("a stamped app's region holds no installer file", () => {
  const region = hashHarnessRegion(path.join(REPO_ROOT, "template"));
  const names = Object.keys(region.files);
  assert.ok(names.length > 20, `expected the template's whole lane, saw ${names.length} files`);
  const installerish = names.filter((rel) => /(^|\/)(install|bin)\//.test(rel) || /\/(portability|log)\.mjs$/.test(rel));
  assert.deepEqual(installerish, [], "an installer file is inside the lock of every stamped app");
});

test("the package ships what it installs: bin, installer, lane, and the receipt contract", () => {
  // A package that installs itself must carry everything it writes. The receipt
  // schema was the one that got away — `harness init` vendored it out of the
  // repo's template/, which a registry install does not have, so an adopter's
  // qa/evidence/ had no schema beside its receipts while every stamped app did.
  assert.deepEqual(PKG.bin, { prooflane: "bin/prooflane.mjs" }, "criterion A: an adopter must have something to run");
  for (const entry of ["src", "install", "bin", "evidence"]) {
    assert.ok(PKG.files.includes(entry), `package.json files[] omits ${entry} — it would not ship`);
  }
  assert.ok(fs.existsSync(path.join(PKG_DIR, "bin", "prooflane.mjs")));
  assert.ok(fs.existsSync(path.join(PKG_DIR, "evidence", "schema.json")));
  assert.ok(fs.existsSync(path.join(PKG_DIR, "install", "linguist-languages.json")));
});

test("the installer is dependency-free, like the lane it installs", () => {
  // The lane must run offline in a repo that installed nothing; the installer
  // ships in the same package and inherits the rule. A bare-specifier import
  // here is a dependency, whether or not package.json admits it.
  assert.equal(PKG.dependencies, undefined, "prooflane-harness must declare no runtime dependencies");
  const files = [
    ...fs.readdirSync(path.join(PKG_DIR, "install")).filter((f) => f.endsWith(".mjs")).map((f) => `install/${f}`),
    ...fs.readdirSync(path.join(PKG_DIR, "bin")).filter((f) => f.endsWith(".mjs")).map((f) => `bin/${f}`),
  ];
  const offenders = [];
  for (const rel of files) {
    const code = fs
      .readFileSync(path.join(PKG_DIR, rel), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");
    for (const m of code.matchAll(/(?:^|[\n;])\s*import[\s\S]*?from\s*["']([^"']+)["']/g)) {
      const spec = m[1];
      if (spec.startsWith(".") || spec.startsWith("node:")) continue;
      offenders.push(`${rel} imports ${spec}`);
    }
  }
  assert.deepEqual(offenders, [], `installer code took a dependency:\n  ${offenders.join("\n  ")}`);
});
