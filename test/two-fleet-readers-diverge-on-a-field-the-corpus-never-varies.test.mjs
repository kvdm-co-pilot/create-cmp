// THE THING THAT HOLDS TWO DELIBERATE COPIES TOGETHER, MADE ADEQUATE.
//
// `readFleetManifest` exists twice on purpose — once in
// `packages/harness/install/fleet.mjs` and once in `scripts/stage3-gate.mjs` —
// because a gate that imports the thing it gates cannot catch that thing being
// wrong. The stated price of that stance is drift, and the stated payment is a
// differential test. On 304bc33 the payment was a HAND-WRITTEN corpus of twelve
// manifests, and a hand-written corpus can only ever cover the divergences its
// author already thought of.
//
// It did not cover this one, which exists TODAY:
//
//     { "id": "a", "path": "./a", "ref": 5 }
//
// The gate refuses it (`"ref" in entry && typeof entry.ref !== "string"`); the
// product accepts it. The twelve-manifest corpus varies `ref` exactly once, as
// the string `"main"`, which both readers accept — so the one field only one
// reader validates is the one field the corpus holds constant. The readers have
// already drifted and the test that exists to notice is green.
//
// THE INVARIANT, not the instance: the corpus is DERIVED, not listed. Every
// field either reader looks at is varied over well-formed, ill-formed, empty,
// wrong-typed and absent, and the readers must agree on all 900 — except the
// ONE divergence this repo chose on purpose, which is pinned by its reason
// (the gate clones a `url`, the product refuses to clone on the operator's
// behalf) rather than by a case number. Fixing the `ref` gap by hand leaves
// this test standing over the next field added to either reader, which is
// where the twelve-manifest version was never going to reach.
import { test } from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { readFleetManifest, FLEET_SCHEMA } from "../packages/harness/install/fleet.mjs";
import { readFleetManifest as gateReadFleetManifest } from "../scripts/stage3-gate.mjs";

/** The one divergence this repo declared. Recognised by its REASON, not its shape. */
const PINNED_URL_DIVERGENCE = /an upgrade writes to a working tree/;

/** Every value each field is allowed to take in the generated corpus. */
const AXES = {
  id: [undefined, "a", "A.b_c-1", "", "-leading-dash", "has space", 5, null],
  path: [undefined, "./a", "../a", "/abs/a", "", 5, null],
  url: [undefined, "git@example.com:a.git", ""],
  ref: [undefined, "main", "", 5, null, {}],
};

function* entries() {
  for (const id of AXES.id)
    for (const p of AXES.path)
      for (const url of AXES.url)
        for (const ref of AXES.ref) {
          const e = {};
          if (id !== undefined) e.id = id;
          if (p !== undefined) e.path = p;
          if (url !== undefined) e.url = url;
          if (ref !== undefined) e.ref = ref;
          yield e;
        }
}

test("the two fleet readers agree on every generated manifest, bar the one divergence this repo declared", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "fleet-differential-")));
  try {
    const abs = path.join(dir, "fleet.json");
    const disagreements = [];
    let n = 0;

    for (const entry of entries()) {
      for (const body of [
        { schema: FLEET_SCHEMA, repos: [entry] },
        // A second entry, so a reader that stops at the first problem and one
        // that collects them all are compared on more than a single verdict.
        { schema: FLEET_SCHEMA, repos: [{ id: "first", path: "./first" }, entry] },
      ]) {
        n += 1;
        fs.writeFileSync(abs, JSON.stringify(body));
        const mine = readFleetManifest(abs);
        const theirs = gateReadFleetManifest(abs);

        if (mine.ok === theirs.ok) {
          if (mine.ok) {
            assert.deepEqual(
              mine.repos.map((r) => r.id),
              theirs.manifest.repos.map((r) => r.id),
              `both accepted ${JSON.stringify(body)} and read different repos out of it`,
            );
          }
          continue;
        }
        // The declared asymmetry: the gate clones a url, the product refuses to.
        if (!mine.ok && theirs.ok && PINNED_URL_DIVERGENCE.test(mine.reason)) continue;
        const why = (r) => (r.ok ? "ACCEPTS" : `refuses — ${r.reason.split("\n").map((s) => s.trim()).filter(Boolean).slice(-2).join(" ")}`);
        disagreements.push(`${JSON.stringify(body)}\n    product: ${why(mine)}\n    gate:    ${why(theirs)}`);
      }
    }

    assert.ok(n > 500, `the corpus generated only ${n} manifests — an axis stopped varying`);
    assert.deepEqual(
      disagreements.slice(0, 4),
      [],
      `${disagreements.length} of ${n} generated manifests are read differently by the two readers, ` +
        `and only the url asymmetry is declared. First few:\n  ${disagreements.slice(0, 4).join("\n  ")}`,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
