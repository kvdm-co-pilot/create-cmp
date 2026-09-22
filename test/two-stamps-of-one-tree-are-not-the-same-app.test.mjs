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

import { stampedOutput, stampScratchApp, FLEET_SCRATCH_APP } from "../scripts/stamped-output.mjs";

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
  // looked right — the shape of KD-67, where `fleet-check` recorded one hash,
  // `proof-plan` compared a second and the publish gate computed a third.
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
