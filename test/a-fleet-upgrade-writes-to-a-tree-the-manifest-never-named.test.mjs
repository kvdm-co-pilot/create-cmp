// A FLEET UPGRADE MAY WRITE ONLY WHERE THE MANIFEST POINTS.
//
// `runFleetUpgrade` forwards the operator's whole flag set into each repo's
// upgrade, minus `fleet`:
//
//     code = await runHarnessUpgrade({ ...flags, fleet: undefined }, repo.dir, opts);
//
// and `runHarnessUpgrade` resolves its target as
//
//     (typeof flags["target-dir"] === "string" && flags["target-dir"]) || positional || "."
//
// — the FLAG wins over the positional. So `--target-dir` survives the forward
// and silently outranks `repo.dir` for every repo in the loop. Measured on
// 304bc33 with a two-repo manifest and `--target-dir ./decoy`: exit 0,
// "fleet: 2 of 2 repo(s) upgraded", neither named repo changed one byte, and a
// third tree the manifest never mentions was rewritten twice. Both front doors
// accept `--target-dir` and `--fleet` on the same line, so nothing upstream
// refuses it. That is KD-7's shape — files into a repository nobody named,
// exit 0 — inside the one command in this product that writes to OTHER
// PEOPLE'S repositories, N of them, unattended.
//
// THE INVARIANT, not the instance: a flag is not the thing being tested here,
// `--target-dir` is only the flag that has this property today. What must hold
// is that NO argument this door accepts can redirect a fleet upgrade's writes
// out of the set of directories the manifest names. The sweep below is derived
// from `KNOWN_FLAGS` rather than written out, so a `--root`, `--project` or
// `--into` added later is covered on the day it is added and not on the day
// someone remembers this file.
import { test } from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { KNOWN_FLAGS } from "../packages/harness/install/args.mjs";
import { runHarnessInit } from "../packages/harness/install/init.mjs";
import { runFleetUpgrade, FLEET_SCHEMA } from "../packages/harness/install/fleet.mjs";
import { hashHarnessRegion } from "../packages/harness/src/lib/harness-region.mjs";

async function quiet(fn) {
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true;
  try {
    return await fn();
  } finally {
    process.stdout.write = write;
  }
}

/** Make a lane stale, so an upgrade that runs here has something to write. */
function makeStale(root) {
  fs.appendFileSync(path.join(root, "qa", "lib", "harness-lock.mjs"), "\n// planted: this lane is behind the package\n");
  return hashHarnessRegion(root).sha256;
}

test("no argument this door accepts can point a fleet upgrade at a tree the manifest never named", async () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "fleet-decoy-")));
  try {
    // One real lane, cloned per case — `init` is the slow part and its output
    // is identical every time, so it runs once.
    const template = path.join(dir, "template");
    fs.mkdirSync(template, { recursive: true });
    await quiet(() => runHarnessInit({ "no-interview": true }, template, { invocation: "prooflane" }));

    // `fleet` itself IS the manifest pointer, so it is not a redirect to sweep for.
    const sweep = [...KNOWN_FLAGS].filter((f) => f !== "fleet");
    assert.ok(sweep.length > 1, "the sweep derives nothing — KNOWN_FLAGS is not being read");

    const offenders = [];
    for (const flag of sweep) {
      const bed = path.join(dir, `case-${flag}`);
      const named = path.join(bed, "alpha");
      const decoy = path.join(bed, "decoy");
      fs.mkdirSync(bed, { recursive: true });
      fs.cpSync(template, named, { recursive: true });
      fs.cpSync(template, decoy, { recursive: true });
      makeStale(named);
      const decoyBefore = makeStale(decoy);

      const abs = path.join(bed, "fleet.json");
      fs.writeFileSync(abs, JSON.stringify({ schema: FLEET_SCHEMA, repos: [{ id: "alpha", path: "./alpha" }] }));

      // The value is a directory, because a directory is what a redirect takes.
      await quiet(() => runFleetUpgrade({ fleet: abs, [flag]: decoy }, undefined, {}));

      if (hashHarnessRegion(decoy).sha256 !== decoyBefore) offenders.push(`--${flag}`);
    }

    assert.deepEqual(
      offenders,
      [],
      `${offenders.join(", ")} redirected a fleet upgrade into a directory the manifest does not name. ` +
        `A fleet command runs unattended across repositories the operator does not have open; the set of ` +
        `trees it may write is the set the manifest declares, and nothing on the command line may widen it.`,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
