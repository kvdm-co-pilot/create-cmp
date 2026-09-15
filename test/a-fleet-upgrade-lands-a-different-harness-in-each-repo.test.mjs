// THE PROMISE THIS COMMAND IS SOLD ON, EXECUTED.
//
// `prooflane upgrade --fleet` exists instead of a shell loop for exactly one
// stated reason, and all three places that state it say the same thing:
//
//   README (adopter-facing) — "the ten upgrades come from **one** resolved
//   harness, so the fleet ends up on one version instead of on whatever each
//   directory's `node_modules` happened to hold. A shell loop cannot promise
//   that; one process can."
//
//   install/fleet.mjs's header — "`resolveHarness` falls back to the package
//   the running binary ships from, so a single process carries a single
//   artifact into every tree."
//
// `runHarnessUpgrade` calls `resolveHarness(root)` once PER REPO, and that
// function prefers `<root>/node_modules/prooflane-harness` over the package the
// running binary ships from — the fallback is the second candidate, not the
// first. So one process resolves N harnesses, one per tree, which is precisely
// what a shell loop does. Measured on 304bc33: two repos, one fleet, one
// command, exit 0, "fleet: 2 of 2 repo(s) upgraded" — and the two trees left
// carrying prooflane-harness 0.0.1-ancient and 0.21.1 respectively.
//
// THE INVARIANT, not the instance: a fleet upgrade that reports a repo as
// upgraded has put the harness THIS PROCESS resolved into it. Whatever a repo
// had pinned locally is the thing the operator invoked a fleet command to stop
// mattering. An adopter reading the README gets a fleet on one version or the
// sentence is false; there is no third answer, and no warning is printed.
import { test } from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runHarnessInit } from "../packages/harness/install/init.mjs";
import { runFleetUpgrade, FLEET_SCHEMA } from "../packages/harness/install/fleet.mjs";
import { SOURCE_PATH, HARNESS_PKG_NAME } from "../packages/harness/src/lib/harness-source.mjs";
import { LOCK_PATH } from "../packages/harness/src/lib/harness-lock.mjs";

const HARNESS_PKG = path.resolve(fileURLToPath(import.meta.url), "..", "..", "packages", "harness");

/** The version the running process ships — the single artifact it promises to carry. */
const RUNNING_VERSION = JSON.parse(fs.readFileSync(path.join(HARNESS_PKG, "package.json"), "utf8")).version;

/** A version no tree could reach except by resolving a repo-local node_modules. */
const PINNED_LOCALLY = "0.0.1-pinned-in-this-repos-node-modules";

async function quiet(fn) {
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true;
  try {
    return await fn();
  } finally {
    process.stdout.write = write;
  }
}

/** What version does this tree say it now carries? Both records must agree. */
function versionInTree(root) {
  const provenance = JSON.parse(fs.readFileSync(path.join(root, ...SOURCE_PATH.split("/")), "utf8"));
  const lock = JSON.parse(fs.readFileSync(path.join(root, ...LOCK_PATH.split("/")), "utf8"));
  assert.equal(provenance.version, lock.version, `${root}: provenance and lock disagree about the version`);
  return lock.version;
}

test("a fleet upgrade carries ONE harness into every repo it reports as upgraded", async () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "fleet-one-harness-")));
  try {
    for (const id of ["alpha", "beta"]) {
      const root = path.join(dir, id);
      fs.mkdirSync(root, { recursive: true });
      await quiet(() => runHarnessInit({ "no-interview": true }, root, { invocation: "prooflane" }));
    }

    // alpha has an older harness pinned in its own node_modules — the ordinary
    // state of a repo that has not run `npm i -D prooflane-harness@latest`, and
    // the exact state the fleet command claims to make irrelevant.
    const pinned = path.join(dir, "alpha", "node_modules", HARNESS_PKG_NAME);
    fs.mkdirSync(pinned, { recursive: true });
    fs.cpSync(path.join(HARNESS_PKG, "src"), path.join(pinned, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(pinned, "package.json"),
      JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(HARNESS_PKG, "package.json"), "utf8")), version: PINNED_LOCALLY }, null, 2),
    );

    const abs = path.join(dir, "fleet.json");
    fs.writeFileSync(
      abs,
      JSON.stringify({ schema: FLEET_SCHEMA, repos: [{ id: "alpha", path: "./alpha" }, { id: "beta", path: "./beta" }] }),
    );

    const code = await quiet(() => runFleetUpgrade({ fleet: abs }, undefined, {}));
    assert.equal(code, 0, "the fleet reported a failure; this test is about what a SUCCESSFUL fleet upgrade leaves behind");

    const landed = new Map(["alpha", "beta"].map((id) => [id, versionInTree(path.join(dir, id))]));

    // One fleet, one version. Not "each repo is internally consistent" — that
    // is true of a fleet on ten different versions, which is the failure.
    assert.equal(
      new Set(landed.values()).size,
      1,
      `one command reported every repo upgraded and left the fleet on ${new Set(landed.values()).size} versions: ` +
        `${[...landed].map(([id, v]) => `${id}=${v}`).join(", ")}`,
    );
    for (const [id, v] of landed) {
      assert.equal(
        v,
        RUNNING_VERSION,
        `${id} carries ${v}, not the ${RUNNING_VERSION} this process resolved — the repo's own node_modules won, ` +
          `which is what a shell loop does and what --fleet says it does instead`,
      );
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
