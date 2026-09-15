// ONE COMMAND, EVERY REPO — and the properties that make it worth having.
//
// Stage 3's criteria D and E are proved by `scripts/stage3-gate.mjs`, which
// clones the real fleet and measures each tree. That gate is run by a human at
// a stage boundary. THIS file is run on every commit, so the thing it has to
// catch is the command breaking between those boundaries — and it builds its
// own fleet out of scratch repos rather than reading the declared one, because
// a test that upgrades the operator's actual repositories is not a test.
//
// The end-to-end here is cheap enough to be per-commit: `prooflane init`
// vendors a lane in ~0.2s, so two real repos and a real upgrade cost less than
// most of this suite's fixtures.
import { test } from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { readFleetManifest, runFleetUpgrade, FLEET_SCHEMA } from "../packages/harness/install/fleet.mjs";
import { readFleetManifest as gateReadFleetManifest } from "../scripts/stage3-gate.mjs";
import { hashHarnessRegion, compareHarnessRegion } from "../packages/harness/src/lib/harness-region.mjs";
import { LOCK_PATH } from "../packages/harness/src/lib/harness-lock.mjs";
import { runHarnessInit } from "../packages/harness/install/init.mjs";

/** Run something with stdout swallowed — these commands are chatty by design. */
async function quiet(fn) {
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true;
  try {
    return await fn();
  } finally {
    process.stdout.write = write;
  }
}

function manifestIn(dir, body) {
  const abs = path.join(dir, "fleet.json");
  fs.writeFileSync(abs, typeof body === "string" ? body : `${JSON.stringify(body, null, 2)}\n`);
  return abs;
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "fleet-upgrade-"));

// ── the reader ───────────────────────────────────────────────────────────────

test("a manifest that declares no repos is REFUSED, never counted as zero", () => {
  const dir = tmp();
  try {
    const r = readFleetManifest(manifestIn(dir, { schema: FLEET_SCHEMA, repos: [] }));
    assert.equal(r.ok, false);
    assert.match(r.reason, /is not a declared fleet/);
    // The distinction this product exists to make. "0 of 0 upgraded, all green"
    // is a true sentence about nothing and reads as success.
    assert.match(r.reason, /upgraded nothing and called it done/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("every malformed shape is refused BY NAME, with the entry that is wrong", () => {
  const dir = tmp();
  try {
    const cases = [
      [{ schema: "prooflane-fleet/2", repos: [{ id: "a", path: "./a" }] }, /declares schema "prooflane-fleet\/2"/],
      [{ schema: FLEET_SCHEMA }, /has no "repos" array/],
      [{ schema: FLEET_SCHEMA, repos: [{ path: "./a" }] }, /repos\[0\]\.id must be a short name/],
      [{ schema: FLEET_SCHEMA, repos: [{ id: "a", path: "./a" }, { id: "a", path: "./b" }] }, /repos\[1\]\.id "a" appears twice/],
      [{ schema: FLEET_SCHEMA, repos: [{ id: "a" }] }, /repos\[0\] must name exactly one of "path" or "url"/],
      [{ schema: FLEET_SCHEMA, repos: [{ id: "a", path: "./a", url: "git@x:y.git" }] }, /exactly one of "path" or "url"/],
      [{ schema: FLEET_SCHEMA, repos: ["../a"] }, /repos\[0\] is not an object/],
      ["{ not json", /is not valid JSON/],
      [[{ id: "a", path: "./a" }], /must be a JSON object/],
    ];
    for (const [body, expect] of cases) {
      const r = readFleetManifest(manifestIn(dir, body));
      assert.equal(r.ok, false, `accepted ${JSON.stringify(body).slice(0, 60)}`);
      assert.match(r.reason, expect);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a url entry is refused because an upgrade WRITES, and a url is not a working tree", () => {
  // The one place this reader and the gate's deliberately disagree — the gate
  // clones (it must not touch the original), the product refuses (the
  // operator's checkout is theirs to make). Pinned here so a SECOND, accidental
  // divergence between the two readers is not mistaken for this one.
  const dir = tmp();
  try {
    const abs = manifestIn(dir, { schema: FLEET_SCHEMA, repos: [{ id: "a", url: "git@example.com:a.git" }] });
    const mine = readFleetManifest(abs);
    assert.equal(mine.ok, false);
    assert.match(mine.reason, /an upgrade writes to a working tree/);
    assert.match(mine.reason, /Check it out, then name its "path"/, "the refusal says what to do instead");

    assert.equal(gateReadFleetManifest(abs).ok, true, "the GATE accepts a url — it clones, and that asymmetry is the point");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("TWO READERS, ONE SCHEMA: they agree on every path-only manifest", () => {
  // `scripts/stage3-gate.mjs` validates independently, because a gate that
  // imports the thing it gates cannot catch that thing being wrong. The cost of
  // that stance is drift, and this is what pays it: the two are held together
  // by executed agreement rather than by a shared import.
  const dir = tmp();
  try {
    const corpus = [
      { schema: FLEET_SCHEMA, repos: [{ id: "a", path: "./a" }] },
      { schema: FLEET_SCHEMA, repos: [{ id: "a", path: "./a" }, { id: "b-2.x", path: "../b" }] },
      { schema: FLEET_SCHEMA, repos: [{ id: "a", path: "./a", ref: "main" }] },
      { schema: FLEET_SCHEMA, repos: [] },
      { schema: FLEET_SCHEMA, repos: [{ id: "-bad", path: "./a" }] },
      { schema: FLEET_SCHEMA, repos: [{ id: "a", path: "./a" }, { id: "a", path: "./b" }] },
      { schema: FLEET_SCHEMA, repos: [{ id: "a" }] },
      { schema: FLEET_SCHEMA, repos: [{ id: "a", path: "" }] },
      { schema: "something-else/1", repos: [{ id: "a", path: "./a" }] },
      { schema: FLEET_SCHEMA },
      {},
      "not json at all",
    ];
    for (const body of corpus) {
      const abs = manifestIn(dir, body);
      const mine = readFleetManifest(abs);
      const theirs = gateReadFleetManifest(abs);
      assert.equal(
        mine.ok,
        theirs.ok,
        `the two readers disagree on ${JSON.stringify(body)}\n` +
          `  product: ${mine.ok ? "ok" : mine.reason}\n  gate:    ${theirs.ok ? "ok" : theirs.reason}`,
      );
      if (mine.ok) {
        assert.deepEqual(mine.repos.map((r) => r.id), theirs.manifest.repos.map((r) => r.id), "same repos, same order");
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a relative path means NEXT TO THE MANIFEST, not next to the cwd", () => {
  // The property that lets a fleet.json be committed and still mean the same
  // thing tomorrow, from any directory an operator happens to be standing in.
  const dir = fs.realpathSync(tmp());
  try {
    const nested = path.join(dir, "config");
    fs.mkdirSync(nested);
    const r = readFleetManifest(manifestIn(nested, { schema: FLEET_SCHEMA, repos: [{ id: "a", path: "../repos/a" }] }));
    assert.equal(r.ok, true, r.reason ?? "");
    assert.equal(r.repos[0].dir, path.join(dir, "repos", "a"));
    assert.notEqual(r.repos[0].dir, path.resolve(process.cwd(), "../repos/a"), "resolved against the cwd, which is the bug");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── the command ──────────────────────────────────────────────────────────────

test("--fleet and a directory are two targets, and it refuses rather than picking", async () => {
  const dir = tmp();
  try {
    const abs = manifestIn(dir, { schema: FLEET_SCHEMA, repos: [{ id: "a", path: "./a" }] });
    const code = await quiet(() => runFleetUpgrade({ fleet: abs }, "./some-dir", {}));
    assert.equal(code, 2, "guessing here would upgrade a directory nobody named");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("--fleet with no value is refused and prints how to declare one", async () => {
  assert.equal(await quiet(() => runFleetUpgrade({ fleet: true }, undefined, {})), 2);
});

/** A scratch repo with a real vendored lane, and its region made stale. */
async function repoWithStaleLane(root) {
  fs.mkdirSync(root, { recursive: true });
  await quiet(() => runHarnessInit({ "no-interview": true }, root, { invocation: "prooflane" }));
  // A machine-owned file that no longer matches the package, so the upgrade has
  // something to carry. Without this the command is correctly idempotent and
  // nothing moves — which would make the assertions below vacuous.
  const spine = path.join(root, "qa", "lib", "harness-lock.mjs");
  fs.appendFileSync(spine, "\n// planted: this lane is behind the package\n");
  return hashHarnessRegion(root).sha256;
}

test("THE CRITERION: one command, and the bytes arrive in EVERY tree", async () => {
  const dir = fs.realpathSync(tmp());
  try {
    const before = new Map();
    for (const id of ["alpha", "beta"]) before.set(id, await repoWithStaleLane(path.join(dir, id)));
    assert.notEqual(before.get("alpha"), before.get("beta"), "two repos, two regions — or this proves one thing twice");

    const abs = manifestIn(dir, {
      schema: FLEET_SCHEMA,
      repos: [{ id: "alpha", path: "./alpha" }, { id: "beta", path: "./beta" }],
    });
    assert.equal(await quiet(() => runFleetUpgrade({ fleet: abs }, undefined, {})), 0);

    for (const id of ["alpha", "beta"]) {
      const root = path.join(dir, id);
      const after = hashHarnessRegion(root).sha256;
      assert.notEqual(after, before.get(id), `${id}: not one vendored byte moved — the command reported success over a tree it did not change`);

      // The other half, and ADR-0008's whole point: a fix arrives as a re-lock
      // over NEW BYTES, never as a version number over the old ones.
      const lock = JSON.parse(fs.readFileSync(path.join(root, ...LOCK_PATH.split("/")), "utf8"));
      assert.equal(compareHarnessRegion(root, lock).intact, true, `${id}: the tree moved and its new lock does not describe it`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("one repo failing does not stop the fleet, and the exit code still says so", async () => {
  // Stopping at the first failure reports one problem when there are three and
  // leaves the fleet half-upgraded either way. The operator needs both facts:
  // what got through, and that something did not.
  const dir = fs.realpathSync(tmp());
  try {
    const before = await repoWithStaleLane(path.join(dir, "real"));
    const abs = manifestIn(dir, {
      schema: FLEET_SCHEMA,
      repos: [{ id: "ghost", path: "./not-there" }, { id: "real", path: "./real" }],
    });

    const code = await quiet(() => runFleetUpgrade({ fleet: abs }, undefined, {}));
    assert.equal(code, 1, "a fleet with a failure exits non-zero");
    assert.notEqual(
      hashHarnessRegion(path.join(dir, "real")).sha256,
      before,
      "the repo AFTER the failing one was never upgraded — the command stopped at the first problem",
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("--dry-run upgrades nothing, in every tree", async () => {
  const dir = fs.realpathSync(tmp());
  try {
    const before = await repoWithStaleLane(path.join(dir, "alpha"));
    const abs = manifestIn(dir, { schema: FLEET_SCHEMA, repos: [{ id: "alpha", path: "./alpha" }] });
    assert.equal(await quiet(() => runFleetUpgrade({ fleet: abs, "dry-run": true }, undefined, {})), 0);
    assert.equal(hashHarnessRegion(path.join(dir, "alpha")).sha256, before, "--dry-run wrote to the tree");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
