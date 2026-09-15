// ONE ARTIFACT, ONE PROVENANCE RECORD — the second half of the property
// `runningHarness()` was added to establish.
//
// `e1596a0` fixed "a fleet lands one VERSION in every repo" by resolving the
// harness once and handing it down through `opts.harness`. The provenance
// record has two fields describing that artifact, and only one of them moved to
// the new source of truth. `runHarnessUpgrade` still computes:
//
//     const sourceKind = resolvedSourceKind(root, PKG_NAME)
//       ?? (resolved.where === "node_modules" ? null : "local");
//
// `resolvedSourceKind` reads the TARGET repo's `package-lock.json` and answers
// where THAT REPO's dependency came from — a resolution which, in a fleet, did
// not produce the bytes being written. So `version` now describes the artifact
// the fleet carried and `source` describes the target's dependency graph, and
// the two are no longer answers about the same thing. Before `opts.harness`
// existed they could not disagree: both came from one `resolveHarness(root)`.
//
// Measured on e1596a0 — one command, one artifact (0.21.1, `where: "this
// package"`, a checkout on the operator's disk), four repos, exit 0:
//
//     from-registry   version=0.21.1  source="registry"
//     from-tarball    version=0.21.1  source="local"
//     from-git        version=0.21.1  source="git"
//     no-lockfile     version=0.21.1  source="local"
//
// Three different origins claimed for one set of bytes; two of them name a
// place those bytes have never been. `harness-source.mjs` says what that costs,
// in its own words: "A wrong provenance is worse than none: it tells a checker
// to fetch an artifact that was never published and to conclude something from
// failing." It is written into the adopter's LOCKED region, in N repos, by a
// command that runs unattended, and the record's whole stated purpose is to be
// the fetch coordinates a notary uses.
//
// THE INVARIANT, not the instance: this asserts the WHOLE record is identical
// across the fleet, not that `source` is. One artifact went into every tree, so
// every field describing it must read the same in every tree — including the
// next field somebody adds to `writeHarnessSource`, which is how this defect
// arrived in the first place (a fix that moved one field and left its sibling
// reading the old resolver).
import { test } from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { runHarnessInit } from "../packages/harness/install/init.mjs";
import { runFleetUpgrade, FLEET_SCHEMA } from "../packages/harness/install/fleet.mjs";
import { runningHarness } from "../packages/harness/install/upgrade.mjs";
import { SOURCE_PATH, HARNESS_PKG_NAME } from "../packages/harness/src/lib/harness-source.mjs";

/**
 * How each repo's OWN package manager resolved the harness — every branch of
 * `resolvedSourceKind`, including the absent lockfile. None of these produced
 * the bytes a fleet writes, which is the point.
 */
const HOW_THIS_REPO_PINNED_IT = {
  "from-registry": `https://registry.npmjs.org/${HARNESS_PKG_NAME}/-/${HARNESS_PKG_NAME}-0.0.1.tgz`,
  "from-tarball": `file:../${HARNESS_PKG_NAME}-0.0.1.tgz`,
  "from-git": `git+ssh://git@example.com/x/${HARNESS_PKG_NAME}.git#abc123`,
  "no-lockfile": null,
};

async function quiet(fn) {
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true;
  try {
    return await fn();
  } finally {
    process.stdout.write = write;
  }
}

test("one fleet upgrade writes ONE provenance record, not one per repo's dependency graph", async () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "fleet-provenance-")));
  try {
    for (const [id, resolved] of Object.entries(HOW_THIS_REPO_PINNED_IT)) {
      const root = path.join(dir, id);
      fs.mkdirSync(root, { recursive: true });
      await quiet(() => runHarnessInit({ "no-interview": true }, root, { invocation: "prooflane" }));
      // Stale, so the upgrade has something to carry and rewrites provenance.
      fs.appendFileSync(path.join(root, "qa", "lib", "harness-lock.mjs"), "\n// planted: behind the package\n");
      if (resolved) {
        fs.writeFileSync(
          path.join(root, "package-lock.json"),
          `${JSON.stringify(
            { name: id, lockfileVersion: 3, packages: { [`node_modules/${HARNESS_PKG_NAME}`]: { version: "0.0.1", resolved, dev: true } } },
            null,
            2,
          )}\n`,
        );
      }
    }

    const abs = path.join(dir, "fleet.json");
    fs.writeFileSync(
      abs,
      JSON.stringify({ schema: FLEET_SCHEMA, repos: Object.keys(HOW_THIS_REPO_PINNED_IT).map((id) => ({ id, path: `./${id}` })) }),
    );

    const code = await quiet(() => runFleetUpgrade({ fleet: abs }, undefined, {}));
    assert.equal(code, 0, "the fleet reported a failure; this test is about what a SUCCESSFUL fleet upgrade records");

    const carried = runningHarness();
    const records = Object.keys(HOW_THIS_REPO_PINNED_IT).map((id) => ({
      id,
      record: JSON.parse(fs.readFileSync(path.join(dir, id, ...SOURCE_PATH.split("/")), "utf8")),
    }));

    const [first, ...rest] = records;
    for (const { id, record } of rest) {
      assert.deepEqual(
        record,
        first.record,
        `one command carried ${HARNESS_PKG_NAME} ${carried.version} from ${carried.where} (${carried.pkgDir}) into every repo, ` +
          `and the provenance it wrote differs between them:\n` +
          `    ${first.id}: ${JSON.stringify(first.record)}\n` +
          `    ${id}: ${JSON.stringify(record)}\n` +
          `  A field that changes with the TARGET is not describing the artifact.`,
      );
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
