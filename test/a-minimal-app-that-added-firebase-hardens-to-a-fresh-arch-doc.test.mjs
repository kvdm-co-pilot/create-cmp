// KD-242 — `--minimal`, then `add firebase`, then `harden`: the architecture doc must be fresh.
//
// Minimal subtraction removes the app's own arch-doc walker (qa/lib/arch-doc.mjs), so `add
// firebase` has nothing to regenerate docs/ARCHITECTURE.md with and skips it. `harden` installs the
// walker back; the doc's generated sections must then describe the tree the app has, Firebase
// included — measured 2026-09-25 with the CLI: before the fix, `node qa/arch-doc.mjs --check` in
// the hardened app failed on [layer-file-inventory], missing `remote/FirebaseConfig.kt`.
//
// No Gradle, no lane: scaffold, the add-firebase plan and harden all run in-process.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, after } from "node:test";
import { pathToFileURL } from "node:url";

import { scaffold } from "../src/scaffold.mjs";
import { planAddFirebase, applyAddFirebasePlan } from "../src/lib/add-firebase.mjs";
import { hardenProject } from "../src/commands/harden.mjs";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-kd242-"));
after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

test("a minimal app that ran add firebase is hardened to a fresh architecture doc (KD-242)", async () => {
  const app = path.join(tmpRoot, "app");
  await scaffold(
    {
      appName: "Late Fire",
      package: "com.late.fire",
      iosBundleId: "com.late.fire",
      themePrefix: "Late",
      harness: false,
      platforms: { android: true, ios: false },
      room: true,
      e2e: true,
      inspector: true,
      devClient: true,
      tabs: [{ label: "Home", icon: "home" }],
      targetDir: app,
    },
    { verify: false },
  );
  const walker = path.join(app, "qa", "lib", "arch-doc.mjs");
  // The premise: minimal mode carries no walker. If it ever does, `add firebase` regenerates the
  // doc itself and this test no longer reaches the path KD-242 is about — revisit it then.
  assert.equal(fs.existsSync(walker), false, "a minimal scaffold carries no qa/lib/arch-doc.mjs");

  const plan = planAddFirebase(app, {});
  applyAddFirebasePlan(app, plan);
  assert.ok(
    fs.existsSync(path.join(app, "composeApp/src/commonMain/kotlin/com/late/fire/data/remote/FirebaseConfig.kt")),
    "add firebase wrote FirebaseConfig.kt",
  );
  assert.doesNotMatch(fs.readFileSync(path.join(app, "docs/ARCHITECTURE.md"), "utf8"), /remote\/FirebaseConfig\.kt/);

  const outcome = await hardenProject({ projectDir: app, apply: true });
  assert.equal(outcome.alreadyFull, false);
  assert.ok(fs.existsSync(walker), "harden installed the walker");

  // The same decision the lane's archDoc step and `node qa/arch-doc.mjs --check` make.
  const { regenerateArchDoc } = await import(pathToFileURL(walker).href);
  const r = regenerateArchDoc(app);
  assert.equal(r.ok, true);
  assert.deepEqual(r.changedSections, [], "no generated section is stale after harden");
  assert.deepEqual(r.missingSections, []);
  assert.match(fs.readFileSync(path.join(app, "docs/ARCHITECTURE.md"), "utf8"), /remote\/FirebaseConfig\.kt/);
});
