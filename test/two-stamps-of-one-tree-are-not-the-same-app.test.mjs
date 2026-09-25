// THE ORACLE THE DEVICE TIER IS SCHEDULED BY: what this tree STAMPS, as bytes.
//
// The device tier proves one thing — that the app `create-cmp` stamps runs on a
// phone. It used to be scheduled by INPUT paths (`deviceTreeHash` over
// `DEVICE_TIER_TRIGGERS`), which is a proxy for that question and is wrong in
// both directions: an edit under `packages/harness/src/` that never reaches
// `template/` reopened the tier although the stamped app was byte-identical,
// and the scaffold is deterministic by design (package.json: "the same inputs
// stamp the same app"), so the proxy was never needed.
//
// The oracle replacing it is only worth anything if it is STABLE: a hash that
// moves between two stamps of one unchanged tree would leave the tier
// permanently OWED, which is the 3.5-minute run this whole schedule exists to
// buy once. So the two things pinned here are the two that make it usable at
// all — two stamps of this tree agree, and they agree in SECONDS, because this
// runs inside `obligation()`, which runs inside a PreToolUse hook that is
// KILLED at the timeout `.claude/settings.json` declares (and a decision never
// delivered is a PERMITTED command, not a refusal).
//
// The stamp IS non-deterministic in exactly one field, and the second test
// names it rather than hoping: `create-cmp.json`'s `stampedAt` is the wall
// clock at stamp time. It is normalised before hashing, and the test asserts
// the normalisation is load-bearing — that the two raw stamps really do differ
// there — so nobody can delete it believing it was decoration.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { spawnSync } from "node:child_process";

import { stampedOutput, stampedApps, stampScratchApp, hashStampedTree, addFirebaseArgv, FLEET_SCRATCH_APP, STAMP_CAP_MS } from "../scripts/stamped-output.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Generous on purpose: what is being refused is a stamp that takes MINUTES (a
 * scaffold that shelled out to Gradle, say), not one that is 200ms slower than
 * yesterday. Measured on this tree 2026-09-22: 0.27-0.30s for the stamp,
 * ~0.03s to hash the 242 files it writes.
 */
const CEILING_MS = 60_000;

test("two stamps of one unchanged tree are the same app, and both take seconds", () => {
  const first = stampedOutput(ROOT);
  const second = stampedOutput(ROOT);

  assert.equal(
    first.hash,
    second.hash,
    "two stamps of one tree hashed differently — the device tier would then be OWED forever, because nothing could ever equal the record. Whatever moved between them has to be normalised in scripts/stamped-output.mjs (with the reason named) or removed from the stamp.",
  );
  assert.deepEqual(first.files, second.files, "and they agree file by file, not merely in the digest");
  assert.ok(Object.keys(first.files).length > 100, `a stamped app is hundreds of files; this one had ${Object.keys(first.files).length}, so the walk found almost nothing`);

  for (const ms of [first.ms, second.ms]) {
    assert.ok(
      ms < CEILING_MS,
      `the stamp+hash took ${ms}ms. obligation() calls this, and obligation() runs inside the PreToolUse hook that .claude/settings.json kills at its timeout — past that the decision it is holding is never delivered, which is a permitted command rather than a refusal.`,
    );
  }
  process.stdout.write(`    [measured] stamp+hash ${first.ms}ms / ${second.ms}ms over ${Object.keys(first.files).length} files\n`);
});

test("the one field that moves between two stamps is NAMED and normalised — not hoped away", () => {
  // Proof that the normalisation is load-bearing. If `stampedAt` ever stops
  // being written, this test fails and says so, and the normaliser can go; if
  // a SECOND clock or a random id appears, the test above fails first.
  const a = stampScratchApp(ROOT);
  const b = stampScratchApp(ROOT);
  try {
    const manifest = (s) => JSON.parse(fs.readFileSync(path.join(s.appDir, "create-cmp.json"), "utf8"));
    const [x, y] = [manifest(a), manifest(b)];
    assert.ok(x.stampedAt && y.stampedAt, "create-cmp.json carries the stamp's wall clock");
    assert.notEqual(
      x.stampedAt,
      y.stampedAt,
      "the two stamps recorded the SAME instant, so this test cannot tell whether the normaliser does anything. Two stamps must be far enough apart in time to differ here.",
    );
    // Everything else is identical — said as a file-by-file comparison rather
    // than as a digest, so a failure names what moved.
    const raw = (dir) => {
      const out = {};
      const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const abs = path.join(d, e.name);
          if (e.isDirectory()) walk(abs);
          else if (e.isFile()) out[path.relative(dir, abs).split(path.sep).join("/")] = fs.readFileSync(abs).toString("base64");
        }
      };
      walk(dir);
      return out;
    };
    const [ra, rb] = [raw(a.appDir), raw(b.appDir)];
    const differing = Object.keys(ra).filter((p) => ra[p] !== rb[p]);
    assert.deepEqual(differing, ["create-cmp.json"], "exactly one file differs between two raw stamps of one tree; anything else here is a second source of non-determinism and must be named in scripts/stamped-output.mjs");
  } finally {
    a.dispose();
    b.dispose();
  }
});

test("ONE spelling of what fleet-check stamps: the oracle's flags are the flags the run uses", () => {
  // The tier's whole criterion is that the app hashed here is the app the
  // device run proved. Two flag lists that agree today and drift tomorrow
  // would make the record and the oracle describe different apps while both
  // looked right — the shape of the three-hash defect `a6c303c` fixed (it never
  // had a KD number), where `fleet-check` recorded one hash, `proof-plan`
  // compared a second and the publish gate computed a third.
  const src = fs.readFileSync(path.join(ROOT, "scripts", "fleet-check.mjs"), "utf8");
  for (const flag of FLEET_SCRATCH_APP.flags) {
    assert.ok(
      !src.includes(`"${flag}"`),
      `scripts/fleet-check.mjs spells ${flag} itself instead of taking it from FLEET_SCRATCH_APP in scripts/stamped-output.mjs. The oracle stamps what the fleet check stamps, or it is measuring a different app.`,
    );
  }
  assert.ok(src.includes("FLEET_SCRATCH_APP") || src.includes("stampArgv"), "fleet-check must build its stamp from the shared spec");
});

test("THE DIGEST MUST NOT MOVE WITH THIS MACHINE'S ANDROID SDK — local.properties is a pointer, not an app byte", () => {
  // MEASURED 2026-09-22, and it is the failure mode that would make this whole
  // schedule useless: `src/scaffold.mjs`'s `writeLocalProperties` writes
  // `sdk.dir=<absolute path>` from ANDROID_HOME / ANDROID_SDK_ROOT, or from the
  // conventional install path, or NOT AT ALL when neither exists. So the app a
  // tree stamps depended on the environment of whoever stamped it —
  // `fleet-check` runs with the device lane's ANDROID_HOME exported, and
  // `proof-plan` runs inside a PreToolUse hook that may have none. Different
  // digests, the record never matching, the device tier REOPENED forever: the
  // 3.5-minute run bought again on every query.
  //
  // It is normalised, not excluded, and the file still appears in the manifest
  // carrying a value that says what it is.
  const saved = { home: process.env.ANDROID_HOME, root: process.env.ANDROID_SDK_ROOT, h: process.env.HOME };
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "an-sdk-that-is-not-yours-"));
  try {
    delete process.env.ANDROID_HOME;
    delete process.env.ANDROID_SDK_ROOT;
    const conventional = stampedOutput(ROOT);

    // An SDK at a different absolute path: the value changes.
    process.env.ANDROID_HOME = elsewhere;
    const moved = stampedOutput(ROOT);
    assert.equal(moved.hash, conventional.hash, `the stamped app's digest moved with ANDROID_HOME (${conventional.files["local.properties"]} → ${moved.files["local.properties"]}). Every device record would then describe an app only the machine that stamped it can reproduce.`);

    // A machine with no SDK anywhere: the file is not written at all, and its
    // ABSENCE must not move the digest either.
    delete process.env.ANDROID_HOME;
    process.env.HOME = elsewhere;
    const none = stampedOutput(ROOT);
    assert.equal(none.hash, conventional.hash, "a machine with no Android SDK stamps the same app — the file's presence is a fact about the machine");
    assert.ok(none.files["local.properties"], "and it is still named in the manifest, with a value that says what it is, rather than silently dropped");
  } finally {
    process.env.HOME = saved.h;
    if (saved.home === undefined) delete process.env.ANDROID_HOME;
    else process.env.ANDROID_HOME = saved.home;
    if (saved.root === undefined) delete process.env.ANDROID_SDK_ROOT;
    else process.env.ANDROID_SDK_ROOT = saved.root;
    fs.rmSync(elsewhere, { recursive: true, force: true });
  }
});

test("THE SAME TREE STAMPED TOMORROW IS THE SAME APP — the seeded ADR carries the day it was written", () => {
  // `src/lib/adr-seed.mjs` renders `- **Date:** <today>` into every ADR it
  // seeds (`new Date().toISOString().slice(0, 10)`), so a tree proved on
  // Monday stamps a different app on Tuesday — and the device tier would read
  // REOPENED for a slice that changed nothing at all, naming a documentation
  // file as the culprit. Two stamps seconds apart cannot see this; the clock
  // is moved by hand instead of waiting for midnight.
  const app = stampScratchApp(ROOT);
  try {
    const adrDir = path.join(app.appDir, "docs", "adr");
    const seeded = fs.readdirSync(adrDir).filter((f) => /^\d{4}-.*\.md$/.test(f));
    assert.ok(seeded.length, "the stamp seeds ADRs at all — if it stopped, this test is aimed at nothing");
    const today = new Date().toISOString().slice(0, 10);
    const dated = seeded.filter((f) => fs.readFileSync(path.join(adrDir, f), "utf8").includes(`- **Date:** ${today}`));
    assert.ok(dated.length, `the premise: at least one ADR in the stamped app carries today's date (${today}). Found: ${seeded.join(", ")}`);

    const before = hashStampedTree(app.appDir).hash;
    for (const f of dated) {
      const at = path.join(adrDir, f);
      fs.writeFileSync(at, fs.readFileSync(at, "utf8").replace(`- **Date:** ${today}`, "- **Date:** 2019-03-04"));
    }
    assert.equal(hashStampedTree(app.appDir).hash, before, "the day an ADR was seeded moved the digest of the app. A slice that changed nothing would be sent to an emulator the first time it crossed midnight.");
  } finally {
    app.dispose();
  }
});

// ONE STAMP, TWO DIGESTS (KD-208). The Firebase L2 run is keyed on the bytes of
// the app `create-cmp add firebase` leaves behind, and that digest is taken
// inside the same PreToolUse hook as the default one. So it is taken from the
// SAME stamp, under the SAME deadline: the add gets what is left of
// `STAMP_CAP_MS` after the stamp, never a cap of its own. A second deadline
// would be a fifth bound the hook's arithmetic does not hold, and the four it
// does hold already sum to exactly the declared budget.
const FIREBASE_EMULATORS_KT = `composeApp/src/androidMain/kotlin/${FLEET_SCRATCH_APP.package.split(".").join("/")}/FirebaseEmulators.kt`;

test("ONE STAMP, TWO DIGESTS: the app with Firebase added is its own stable app, and both digests answer inside the stamp's cap", () => {
  const first = stampedApps(ROOT);
  const second = stampedApps(ROOT);

  for (const r of [first, second]) {
    assert.equal(typeof r.default.hash, "string", `the default half did not answer: ${JSON.stringify(r.default.unanswerable ?? null)}`);
    assert.equal(typeof r.firebase.hash, "string", `the Firebase half did not answer: ${r.firebase.unanswerable}`);
  }
  assert.equal(first.firebase.hash, second.firebase.hash, "two stamps of one tree, each with Firebase added, hashed differently — the Firebase tier would be OWED forever. Whatever the add writes that moves has to be normalised in scripts/stamped-output.mjs, with the reason named.");
  assert.deepEqual(first.firebase.files, second.firebase.files, "and they agree file by file, not merely in the digest");
  assert.notEqual(first.firebase.hash, first.default.hash, "the add changed no hashed byte, so the Firebase digest cannot tell an overlay edit from no edit");
  assert.ok(FIREBASE_EMULATORS_KT in first.firebase.files, `the post-add manifest has no ${FIREBASE_EMULATORS_KT}: whatever was hashed is not the app the add writes`);
  assert.ok(!(FIREBASE_EMULATORS_KT in first.default.files), "the default manifest holds the Firebase redirect — the two halves hashed one directory twice");
  assert.equal(first.default.hash, stampedOutput(ROOT).hash, "the default half is not the digest the default tier compares — the two tiers would be reading two different stamps of the default app");

  for (const ms of [first.ms, second.ms]) {
    assert.ok(ms < STAMP_CAP_MS, `stamp + hash + add + hash took ${ms}ms, over the ${STAMP_CAP_MS}ms cap the hook's ANSWER_RESERVE_MS covers. Past it the Firebase half reads unanswerable on every call.`);
  }
  process.stdout.write(`    [measured] stampedApps ${first.ms}ms / ${second.ms}ms; ${Object.keys(first.default.files).length} -> ${Object.keys(first.firebase.files).length} files\n`);
});

test("a failed, killed or never-started add loses ONLY the Firebase half, and says why", () => {
  const cases = [
    {
      name: "the add fails",
      opts: { spawnAdd: () => ({ status: 1, signal: null, stderr: "injected: the overlay refused\n" }) },
      reason: /exited 1.*injected: the overlay refused/,
    },
    {
      // A real hang, killed by the timeout stampedApps hands the add — what is
      // LEFT of the cap, so the whole call ends at the cap, not a stamp past it.
      name: "the add hangs",
      opts: {
        timeoutMs: 1500,
        spawnAdd: (cmd, _args, o) => {
          assert.ok(o.timeout < 1500, `the add was handed ${o.timeout}ms — a cap of its own, not what the stamp left of the 1500ms`);
          return spawnSync(cmd, ["-e", "setTimeout(() => {}, 60000)"], o);
        },
      },
      reason: /did not finish inside \d+ms of the 1500ms cap/,
      maxMs: 1500 + 750,
    },
    {
      // The cap is spent before the add could start. The clock is injected
      // because a timeoutMs small enough to leave the add nothing would, on a
      // slow day, also kill the stamp that shares it.
      name: "the cap is spent",
      opts: { spawnAdd: () => assert.fail("the add was spawned with none of the cap left — spawnSync reads timeout 0 as NO timeout"), now: stepClock(STAMP_CAP_MS) },
      reason: /cap was spent before the add could start/,
    },
  ];
  for (const c of cases) {
    const r = stampedApps(ROOT, c.opts);
    assert.equal(typeof r.default.hash, "string", `${c.name}: the default half was lost with it`);
    assert.ok(Object.keys(r.default.files).length > 100, `${c.name}: the default half hashed almost nothing`);
    assert.equal(r.firebase.hash, null, `${c.name}: the Firebase half still answered a digest`);
    assert.equal(r.firebase.files, null, `${c.name}: the Firebase half still carries a manifest`);
    assert.match(String(r.firebase.unanswerable), c.reason, `${c.name}: the reason does not name the cause`);
    if (c.maxMs) assert.ok(r.ms < c.maxMs, `${c.name}: the call took ${r.ms}ms — the add was given a deadline of its own, not what was left of the stamp's`);
  }
});

test("ONE spelling of the add: stampedApps spawns exactly addFirebaseArgv, on the app it just stamped", () => {
  const seen = [];
  const r = stampedApps(ROOT, {
    spawnAdd: (cmd, args, o) => {
      const appDir = args[3];
      seen.push({ cmd, args, timeout: o?.timeout, stamped: fs.existsSync(path.join(appDir ?? "", "create-cmp.json")), appDir });
      return spawnSync(cmd, args, o);
    },
  });
  assert.equal(seen.length, 1, `the add was spawned ${seen.length} times`);
  const [call] = seen;
  assert.equal(call.cmd, process.execPath);
  assert.deepEqual(call.args, addFirebaseArgv(ROOT, call.appDir), "the add was spelled by hand instead of by addFirebaseArgv");
  assert.deepEqual(addFirebaseArgv(ROOT, call.appDir), [path.join(ROOT, "bin", "create-cmp.mjs"), "add", "firebase", call.appDir, "--no-verify"]);
  assert.equal(path.basename(call.appDir), FLEET_SCRATCH_APP.name, "the add ran on some other directory than the scratch app");
  assert.ok(call.stamped, "the add ran on a directory that held no stamped app");
  assert.ok(call.timeout > 0 && call.timeout < STAMP_CAP_MS, `the add's timeout was ${call.timeout}: it must be what is left of the stamp's ${STAMP_CAP_MS}ms, never a fresh cap`);
  assert.equal(typeof r.firebase.hash, "string");
  assert.ok(!fs.existsSync(call.appDir), "the scratch app outlived the call");
});

/** A clock that reads the real time once, then `stepMs` later on every read. */
function stepClock(stepMs) {
  let t0 = null;
  return () => (t0 === null ? (t0 = Date.now()) : t0 + stepMs);
}
