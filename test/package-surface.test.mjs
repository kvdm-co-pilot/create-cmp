// WHAT THE PUBLISHED PACKAGES EXPOSE — held against what consumers actually do.
//
// `prooflane-harness` declares an `exports` map, and an exports map is a
// DENYLIST by default: every subpath not listed becomes unreachable, including
// ones nobody thinks of as API. `./package.json` is the one that matters,
// because reading a dependency's version is what every wrapper, shim and
// introspecting tool does first.
//
// Found the way these things are found: the `prooflane` front door was published,
// installed from the registry, and refused to run — "could not find its
// dependency prooflane-harness" — while the dependency sat right there in
// node_modules. `create-kmp` had worked for months against `create-cmp-cli`,
// which declares NO exports map, so its subpaths were open and the shim pattern
// looked sound. The map is what changed the rules, and only an install proved it.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readPkg = (rel) => JSON.parse(fs.readFileSync(path.join(REPO, rel, "package.json"), "utf8"));

test("a package with an exports map still exposes its own package.json", () => {
  // The rule, stated for every package that has a map rather than for the one
  // that broke: a consumer must always be able to ask a dependency its version.
  for (const rel of ["packages/harness", "packages/receipts"]) {
    const pkg = readPkg(rel);
    if (!pkg.exports) continue; // no map, no denylist, nothing to declare
    assert.equal(
      pkg.exports["./package.json"],
      "./package.json",
      `${pkg.name} declares an exports map without "./package.json" — every wrapper that reads its version gets ERR_PACKAGE_PATH_NOT_EXPORTED, and the failure looks like a missing dependency rather than a hidden file`,
    );
  }
});

test("the prooflane front door depends on the harness whose bin it delegates to", () => {
  const alias = readPkg("packages/aliases/prooflane");
  const harness = readPkg("packages/harness");
  assert.equal(alias.bin.prooflane, "bin/cli.mjs");
  assert.ok(alias.dependencies?.["prooflane-harness"], "the shim must declare what it re-executes");
  assert.equal(
    harness.bin?.prooflane,
    "bin/prooflane.mjs",
    "the alias resolves the harness's `prooflane` bin by name — if the harness renames it, the front door breaks silently",
  );
});
