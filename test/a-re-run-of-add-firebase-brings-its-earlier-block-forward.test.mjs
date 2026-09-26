// A RE-RUN OF `add firebase` SAID ITS EARLIER BLOCK WAS THERE, AND LEFT THE BOM OUT (KD-262).
//
// An app that ran `add firebase` before KD-260's fix carries the block without the
// `androidMain` Firebase BoM line, so its instrumented tests do not compile. A re-run
// saw `>>> create-cmp add firebase`, printed `already there: composeApp/build.gradle.kts
// (the add-firebase block)` and changed nothing — the command meant to fix the app
// said it was fine. The step now recognises its OWN earlier block by its exact bytes
// (`overlays/firebase/append-earlier/`, the way it recognises the legacy
// FirebaseConfig.kt) and rewrites it to the current one. A block an adopter edited
// is not a block this step wrote, and is left alone.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { scaffold } from "../src/scaffold.mjs";
import { planAddFirebase, applyAddFirebasePlan } from "../src/lib/add-firebase.mjs";
import { offTheRunnerChannel } from "./helpers/runner-channel.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OVERLAY = path.join(ROOT, "overlays", "firebase");
const GRADLE = "composeApp/build.gradle.kts";
const BOM_LINE = "implementation(project.dependencies.platform(libs.firebase.bom))";
const count = (text, s) => text.split(s).length - 1;

test("a re-run over the pre-KD-260 block rewrites it to the current one, BoM included; an edited block is left alone", async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-add-earlier-"));
  try {
    const app = path.join(scratch, "app");
    await offTheRunnerChannel(() =>
      scaffold(
        {
          appName: "Acme", package: "com.acme.demo", iosBundleId: "com.acme.demo", themePrefix: "Acme",
          platforms: { android: true, ios: false }, room: true, e2e: true, inspector: true, devClient: true,
          tabs: [{ label: "Home", icon: "home" }], targetDir: app,
        },
        { verify: false },
      ),
    );
    // The overlay as it shipped before KD-260: the same step, the earlier Gradle block.
    const earlier = path.join(scratch, "overlay-earlier");
    fs.cpSync(OVERLAY, earlier, { recursive: true });
    fs.copyFileSync(path.join(OVERLAY, "append-earlier", GRADLE), path.join(earlier, "append", GRADLE));
    applyAddFirebasePlan(app, planAddFirebase(app, {}, { overlayDir: earlier }));
    const before = fs.readFileSync(path.join(app, GRADLE), "utf8");
    assert.equal(count(before, BOM_LINE), 0, "the fixture is not the pre-KD-260 shape");

    const edited = path.join(scratch, "edited");
    fs.cpSync(app, edited, { recursive: true });

    const plan = planAddFirebase(app, {});
    const gradle = plan.writes.find((w) => w.rel === GRADLE);
    assert.ok(gradle, `the re-run did not write ${GRADLE}; present: ${plan.present.join(" | ")}`);
    assert.equal(count(gradle.content, BOM_LINE), 1);
    assert.equal(count(gradle.content, ">>> create-cmp add firebase"), 1, "the block was appended twice");
    assert.ok(gradle.content.includes(fs.readFileSync(path.join(OVERLAY, "append", GRADLE), "utf8")));
    assert.ok(!plan.present.includes(`${GRADLE} (the add-firebase block)`), plan.present.join(" | "));

    // An adopter's line inside the block makes it theirs: not rewritten.
    const editedText = before.replace("implementation(libs.firebase.config)", "implementation(libs.firebase.config)\n            implementation(libs.mine)");
    fs.writeFileSync(path.join(edited, GRADLE), editedText);
    const kept = planAddFirebase(edited, {});
    assert.ok(!kept.writes.some((w) => w.rel === GRADLE), "an edited block was rewritten");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
