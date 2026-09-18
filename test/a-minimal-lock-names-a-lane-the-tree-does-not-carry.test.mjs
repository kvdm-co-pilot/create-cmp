// SCRATCH COPY of the intended test/a-minimal-lock-names-a-lane-the-tree-does-not-carry.test.mjs
// Identical assertions; only the three import specifiers are absolute, so it
// can be executed without writing into a worktree. Run against the clean
// 8bd782a checkout at .claude/worktrees/agent-kd40-lock.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, before, after } from "node:test";

const SRC = "/Users/test/dev/create-cmp/.claude/worktrees/agent-kd40-lock";
const { scaffold } = await import(`${SRC}/src/scaffold.mjs`);
const { listHarnessFiles } = await import(`${SRC}/packages/harness/src/lib/harness-region.mjs`);
const { checkHarnessIntegrity } = await import(`${SRC}/packages/harness/src/lib/harness-lock.mjs`);

const LOCK = "qa/harness.lock.json";

function config(targetDir, overrides = {}) {
  return {
    appName: "Lock App",
    package: "com.lockapp.app",
    iosBundleId: "com.lockapp.app",
    region: "us-central1",
    themePrefix: "Lock",
    harness: false,
    platforms: { android: true, ios: false },
    firebase: { enabled: false },
    room: true,
    e2e: true,
    inspector: true,
    devClient: true,
    tabs: [{ label: "Home", icon: "home" }],
    targetDir,
    ...overrides,
  };
}

let tmpRoot;
let fresh;
let restamped;

before(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-kd40-"));
  fresh = path.join(tmpRoot, "fresh");
  await scaffold(config(fresh), { verify: false });

  restamped = path.join(tmpRoot, "restamped");
  await scaffold(config(restamped, { harness: true }), { verify: false });
  await scaffold(config(restamped), { verify: false, force: true });
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function assertLockDescribesThisTree(root, label) {
  const abs = path.join(root, LOCK);
  assert.ok(fs.existsSync(abs), `${label}: no ${LOCK} at all`);
  const lock = JSON.parse(fs.readFileSync(abs, "utf8"));

  const named = Object.keys(lock.files).sort();
  const absent = named.filter((rel) => !fs.existsSync(path.join(root, ...rel.split("/"))));
  assert.deepEqual(absent, [], `${label}: the lock names ${absent.length} path(s) the tree does not carry`);

  assert.deepEqual(
    named,
    listHarnessFiles(root),
    `${label}: the lock and the machine-owned region are not the same set of files`
  );
  assert.equal(lock.fileCount, named.length, `${label}: fileCount disagrees with the map it counts`);

  const integrity = checkHarnessIntegrity(root);
  assert.equal(
    integrity.status,
    "intact",
    `${label}: ${integrity.missing.length} missing, ${integrity.extra.length} unrecorded`
  );
}

test("a fresh --minimal stamp's lock names only files that stamp shipped", () => {
  assertLockDescribesThisTree(fresh, "fresh --minimal");
});

test("re-stamping --minimal over a FULL tree re-locks the subset, not the lane it deleted", () => {
  assertLockDescribesThisTree(restamped, "--minimal --force over a full stamp");

  const lock = JSON.parse(fs.readFileSync(path.join(restamped, LOCK), "utf8"));
  assert.ok(
    lock.fileCount < 20,
    `the re-stamp kept a ${lock.fileCount}-file lock — a full stamp's region is ~73, so this is the pre-subtraction lane`
  );
  assert.ok(!fs.existsSync(path.join(restamped, "qa/verify.mjs")), "the lane was not actually subtracted");
});

test("the lock is the ONLY machine-written file under qa/ that outlives --minimal", () => {
  const region = new Set(listHarnessFiles(fresh));
  const APP_OWNED = ["qa/e2e/", "qa/golden/"];

  const survivors = [];
  const walk = (abs, rel) => {
    for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
      const r = `${rel}/${ent.name}`;
      if (ent.isDirectory()) walk(path.join(abs, ent.name), r);
      else survivors.push(r);
    }
  };
  walk(path.join(fresh, "qa"), "qa");

  const unaccounted = survivors
    .filter((rel) => !region.has(rel))
    .filter((rel) => !APP_OWNED.some((prefix) => rel.startsWith(prefix)))
    .sort();

  assert.deepEqual(
    unaccounted,
    [LOCK],
    "a minimal scaffold carries a machine-written qa/ file that is neither in the region nor app content"
  );
});
