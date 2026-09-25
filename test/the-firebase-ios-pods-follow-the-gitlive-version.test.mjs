// KD-243 — the Podfile's Firebase pods follow the GitLive version `add firebase` picks.
//
// The overlay used to write `'~> 11.0'` whatever GitLive version the registry set named. The pairing
// now lives next to `firebase-gitlive` in src/versions/registry.json (`firebaseIos`), sourced from
// GitLive's own gradle/libs.versions.toml (`firebase-cocoapods`) at the matching tag, and a GitLive
// version the registry has no pairing for is refused at add time rather than given a guessed pin.
// No Gradle, no pod: scaffold and the add-firebase plan run in-process.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, after } from "node:test";

import { scaffold } from "../src/scaffold.mjs";
import { loadRegistry } from "../src/lib/registry.mjs";
import { planAddFirebase, AddFirebaseRefusal } from "../src/lib/add-firebase.mjs";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-kd243-"));
after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

const app = path.join(tmpRoot, "app");
await scaffold(
  {
    appName: "Pod Pair",
    package: "com.pod.pair",
    iosBundleId: "com.pod.pair",
    themePrefix: "Pod",
    harness: false,
    platforms: { android: true, ios: true },
    room: false,
    e2e: false,
    inspector: false,
    devClient: false,
    tabs: [{ label: "Home", icon: "home" }],
    targetDir: app,
  },
  { verify: false },
);

/** The shipped registry with every set's GitLive moved to `gitlive`, paired as `pair` says. */
function registryWith(gitlive, pair) {
  const registry = structuredClone(loadRegistry());
  for (const set of registry.sets) {
    set.versions["firebase-gitlive"] = gitlive;
    if (pair === undefined) delete set.firebaseIos;
    else set.firebaseIos = pair;
  }
  return registry;
}

const podfileOf = (plan) => plan.writes.find((w) => w.rel === "iosApp/Podfile")?.content ?? "";

test("every registry set pairs its own GitLive version, cited at GitLive's tag (KD-243)", () => {
  for (const set of loadRegistry().sets) {
    const gitlive = set.versions["firebase-gitlive"];
    assert.equal(set.firebaseIos?.gitlive, gitlive, `${set.id}: firebaseIos pairs the set's firebase-gitlive`);
    assert.match(set.firebaseIos.version, /^\d+\.\d+\.\d+$/, `${set.id}: a whole Firebase iOS version`);
    assert.ok(
      set.firebaseIos.source.includes(`firebase-kotlin-sdk/blob/v${gitlive}/gradle/libs.versions.toml`),
      `${set.id}: the source is GitLive's own catalog at tag v${gitlive}`,
    );
  }
});

test("the Podfile asks for the Firebase iOS the picked GitLive version is built against (KD-243)", () => {
  const plan = planAddFirebase(app, {}, {
    registry: registryWith("9.9.9", { gitlive: "9.9.9", version: "12.3.0", source: "fixture" }),
  });
  const podfile = podfileOf(plan);
  for (const pod of ["FirebaseCore", "FirebaseAuth", "FirebaseFirestore"]) {
    assert.match(podfile, new RegExp(`pod '${pod}',\\s+'~> 12\\.3'`), `${pod} follows the pairing`);
  }
  assert.doesNotMatch(podfile, /11\.0|__FIREBASE_/, "no fixed pin and no unreplaced token");
  assert.match(podfile, /GitLive 9\.9\.9 is built against Firebase iOS 12\.3\.0/);
});

test("a GitLive version the registry pairs with nothing is refused, never given a guessed pin (KD-243)", () => {
  for (const pair of [undefined, { gitlive: "2.4.0", version: "11.8.0", source: "stale" }]) {
    assert.throws(
      () => planAddFirebase(app, {}, { registry: registryWith("9.9.9", pair) }),
      (e) =>
        e instanceof AddFirebaseRefusal &&
        /Firebase pod version is unknown/.test(e.message) &&
        /firebase-kotlin-sdk\/blob\/v9\.9\.9\/gradle\/libs\.versions\.toml/.test(e.message),
    );
  }
});
