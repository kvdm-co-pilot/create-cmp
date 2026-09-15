// A COMMAND PRINTED BACK IS A COMMAND THE CALLER CAN RUN.
//
// `install/init.mjs` already settled this and wrote down why, above the
// vocabulary it built for it:
//
//   "printing `prooflane relock` to a create-cmp user names a binary they may
//    not have. So the caller says which it is … Naming a command an adopter
//    cannot run is the lie this vocabulary exists to prevent. Found 2026-09-09
//    by two independent adoptions (fuelled-api, pantry-api), both of which hit
//    this as the first thing the product said to them."
//
// `runFleetUpgrade` takes `opts.invocation` — it is in the signature, it is in
// the JSDoc, `bin/create-cmp.mjs` passes `{ invocation: "create-cmp" }` — and
// it never reads it. Both of its own strings are hardcoded `prooflane`: the
// banner on every run, and the line at the refusal, which is the one that
// matters most because it is an instruction to type something:
//
//     Then: prooflane upgrade --fleet ./fleet.json
//
// `create-cmp` publishes two bins and neither is `prooflane`, and it does not
// depend on `prooflane-harness`, so for a caller who arrived through that door
// the command named does not exist. The per-repo output underneath it says
// `create-cmp harness upgrade`, correctly, because `runHarnessUpgrade` calls
// `frontDoor(opts.invocation)` — so one command's output names both doors.
//
// THE INVARIANT, not the instance: no output of a fleet upgrade names a front
// door other than the one it was invoked through — over every declared door and
// every path that prints, not over the two strings that are wrong today.
import { test } from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { runFleetUpgrade, FLEET_SCHEMA } from "../packages/harness/install/fleet.mjs";

/** For each front door, the command spellings that belong to the OTHER one. */
const FOREIGN = {
  prooflane: /(?<![\w-])create-cmp (?:harness )?(?:init|relock|upgrade)(?![\w-])/g,
  // `prooflane-harness` is the PACKAGE name and is correct at either door; the
  // negative lookahead keeps it out of this.
  "create-cmp": /(?<![\w-])prooflane (?:init|relock|upgrade)(?![\w-])/g,
};

const ANSI = /\u001B\[[0-9;]*m/g;

/** Run something, returning everything it wrote to stdout, undecorated. */
async function captured(fn) {
  const write = process.stdout.write.bind(process.stdout);
  let out = "";
  process.stdout.write = (chunk) => {
    out += chunk;
    return true;
  };
  try {
    await fn();
  } finally {
    process.stdout.write = write;
  }
  return out.replace(ANSI, "");
}

test("every command a fleet upgrade prints back is one the door it was invoked through offers", async () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "fleet-doors-")));
  try {
    const abs = path.join(dir, "fleet.json");
    fs.writeFileSync(abs, JSON.stringify({ schema: FLEET_SCHEMA, repos: [{ id: "alpha", path: "./alpha" }] }));

    const wrong = [];
    for (const invocation of Object.keys(FOREIGN)) {
      // Every path that prints a command name, reached without writing to a
      // tree: the missing-value refusal, the two-targets refusal, the
      // unreadable-manifest refusal, and a run whose single repo is absent.
      const paths = {
        "--fleet with no value": () => runFleetUpgrade({ fleet: true }, undefined, { invocation }),
        "--fleet plus a directory": () => runFleetUpgrade({ fleet: abs }, "./somewhere", { invocation }),
        "a manifest that is not there": () => runFleetUpgrade({ fleet: path.join(dir, "absent.json") }, undefined, { invocation }),
        "a fleet whose repo is missing": () => runFleetUpgrade({ fleet: abs }, undefined, { invocation }),
      };
      for (const [what, run] of Object.entries(paths)) {
        const out = await captured(run);
        for (const named of out.match(FOREIGN[invocation]) ?? []) {
          wrong.push(`${invocation} door, ${what}: printed ${JSON.stringify(named)}`);
        }
      }
    }

    assert.deepEqual(
      wrong,
      [],
      `a fleet upgrade named a command from the other front door:\n  ${wrong.join("\n  ")}\n` +
        `  create-cmp publishes no \`prooflane\` bin and does not depend on the harness package, ` +
        `so that is an instruction the caller cannot follow.`,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
