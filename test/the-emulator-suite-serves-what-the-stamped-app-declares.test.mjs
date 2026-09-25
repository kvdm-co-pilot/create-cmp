// ONE SPELLING OF THE EMULATOR PORTS (KD-47), AND THE FIREBASE RUN MUST NOT ADD A THIRD.
//
// `create-cmp add firebase` declares the emulator redirect in three places, each
// the one spelling of its fact:
//   the HOST      composeApp/build.gradle.kts, in the build type that sets
//                 USE_FIREBASE_EMULATORS true (debug — the build e2eSmoke installs)
//   the PORTS     `const val FIREBASE_<SERVICE>_EMULATOR_PORT` in
//                 composeApp/src/commonMain/kotlin/<package>/data/remote/FirebaseConfig.kt
//   the PROJECT   composeApp/google-services.json's project_id (the mock names a demo- id)
//
// A Firebase-covering fleet run needs a firebase.json to start the Emulator
// Suite, and the easy way to write one is another copy of four numbers — which
// agrees today and drifts the first time an adopter-facing change moves a port.
// So the suite's firebase.json is GENERATED from what the stamped-and-added app
// itself declares, read from the stamped tree. The proof is a moved port: change
// the Firestore port in a real FirebaseConfig.kt and the suite follows it.
//
// Functions is the one service the redirect names that the suite cannot serve
// from a port: the Functions emulator serves a CODEBASE, and the template ships
// none. It is recorded as unserved with that reason rather than dropped — a
// coverage line that omitted it would read as "all four redirects were served".
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { readDeclaredRedirect, emulatorPlanFor, firebaseJsonFor } from "../scripts/lib/fleet-firebase.mjs";
import { stampArgv, FLEET_SCRATCH_APP } from "../scripts/stamped-output.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GRADLE = path.join("composeApp", "build.gradle.kts");
const CONFIG = path.join("composeApp", "src", "commonMain", "kotlin", ...FLEET_SCRATCH_APP.package.split("."), "data", "remote", "FirebaseConfig.kt");
const GOOGLE_SERVICES = path.join("composeApp", "google-services.json");

/** The fleet scratch app, stamped with the one stamp argv and then `add firebase --no-verify` — generation only, no build. */
function stampAndAdd() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "fleet-firebase-"));
  const dir = path.join(base, FLEET_SCRATCH_APP.name);
  const run = (argv, what) => {
    const r = spawnSync(process.execPath, argv, { cwd: REPO_ROOT, encoding: "utf8", timeout: 60_000 });
    if (r.status !== 0) {
      fs.rmSync(base, { recursive: true, force: true });
      throw new Error(`${what} failed (${r.status ?? r.signal}): ${r.stdout}${r.stderr}`);
    }
  };
  run(stampArgv(REPO_ROOT, dir), "stamp");
  run([path.join(REPO_ROOT, "bin", "create-cmp.mjs"), "add", "firebase", dir, "--no-verify"], "add firebase");
  return { base, dir };
}

const edit = (dir, rel, fn) => {
  const abs = path.join(dir, rel);
  const before = fs.readFileSync(abs, "utf8");
  const after = fn(before);
  assert.notEqual(after, before, `the fixture edit to ${rel} changed nothing`);
  fs.writeFileSync(abs, after);
  return before;
};

test("the suite serves the ports the stamped app declares, on its own demo- project, in the build type that redirects", () => {
  const { base, dir } = stampAndAdd();
  try {
    // The shape this reader depends on, pinned on the real tree: the Gradle file
    // has more than one `getByName("debug")` block (source sets, the cleartext
    // placeholder, the Firebase overlay), and exactly ONE of them redirects.
    const gradle = fs.readFileSync(path.join(dir, GRADLE), "utf8");
    assert.ok((gradle.match(/getByName\("debug"\)\s*\{/g) ?? []).length > 1, "more than one debug block — the reader must pick by the flag, not by the name");

    const redirect = readDeclaredRedirect(dir);
    assert.equal(redirect.buildType, "debug", "the lane's e2eSmoke installs the debug build, which is the one that redirects");
    assert.equal(redirect.file, "composeApp/build.gradle.kts");
    assert.equal(redirect.host, "10.0.2.2");
    assert.deepEqual(redirect.ports, { auth: 9099, firestore: 8080, functions: 5001, storage: 9199 });
    assert.equal(redirect.project, "demo-mock-not-real");

    // The ports are `const val`s in FirebaseConfig.kt — read here by a different
    // route, so the reader cannot agree with itself about a file it misread.
    const config = fs.readFileSync(path.join(dir, CONFIG), "utf8");
    const declared = {};
    for (const m of config.matchAll(/^const val FIREBASE_([A-Z]+)_EMULATOR_PORT = (\d+)$/gm)) declared[m[1].toLowerCase()] = Number(m[2]);
    assert.deepEqual(redirect.ports, declared);

    const plan = emulatorPlanFor(redirect);
    assert.equal(plan.project, "demo-mock-not-real", "the app's OWN project id: the suite answers the project the app asks for");
    assert.equal(plan.host, "127.0.0.1", "10.0.2.2 is the Android emulator's alias for THIS host's loopback");
    assert.equal(plan.appHost, "10.0.2.2");
    assert.deepEqual(
      Object.fromEntries(plan.served.map((s) => [s.service, s.port])),
      { auth: declared.auth, firestore: declared.firestore, storage: declared.storage },
    );
    assert.deepEqual(plan.unserved.map((u) => [u.service, u.port]), [["functions", declared.functions]]);
    assert.match(plan.unserved[0].reason, /codebase/);

    const json = firebaseJsonFor(plan);
    assert.deepEqual(json.emulators.auth, { host: "127.0.0.1", port: declared.auth });
    assert.deepEqual(json.emulators.firestore, { host: "127.0.0.1", port: declared.firestore });
    assert.deepEqual(json.emulators.storage, { host: "127.0.0.1", port: declared.storage });
    assert.deepEqual(json.emulators.ui, { enabled: false }, "no UI: nothing here looks at it, and it would hold a port of its own");
    assert.equal(json.emulators.functions, undefined, "an unserved service is not configured — the CLI would try to load a codebase");
    assert.equal(json.emulators.singleProjectMode, undefined, "the suite runs as the app's own project, so no override is needed");
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("a port moved in FirebaseConfig.kt moves the suite — the generator holds no copy of its own", () => {
  const { base, dir } = stampAndAdd();
  try {
    edit(dir, CONFIG, (s) => s.replace(/(const val FIREBASE_FIRESTORE_EMULATOR_PORT = )\d+/, "$18181"));
    const plan = emulatorPlanFor(readDeclaredRedirect(dir));
    assert.equal(plan.served.find((s) => s.service === "firestore").port, 8181);
    assert.equal(firebaseJsonFor(plan).emulators.firestore.port, 8181);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }

  // And no third spelling exists to drift: neither the generator nor the
  // fleet check carries any of the four port numbers.
  for (const rel of ["scripts/lib/fleet-firebase.mjs", "scripts/fleet-check.mjs"]) {
    const src = fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
    for (const port of ["9099", "8080", "5001", "9199"]) {
      assert.ok(!src.includes(port), `${rel} spells emulator port ${port} — a third copy (KD-47)`);
    }
  }
});

test("a stamp that declares no redirect, or two, or a host the lane cannot reach, is refused rather than guessed at", () => {
  const { base, dir } = stampAndAdd();
  try {
    const original = edit(dir, GRADLE, (s) => s.replace(/"USE_FIREBASE_EMULATORS", "true"/g, '"USE_FIREBASE_EMULATORS", "false"'));
    assert.throws(() => readDeclaredRedirect(dir), /no build type .*USE_FIREBASE_EMULATORS/);

    fs.writeFileSync(path.join(dir, GRADLE), original.replace(/"USE_FIREBASE_EMULATORS", "false"/g, '"USE_FIREBASE_EMULATORS", "true"'));
    assert.throws(() => readDeclaredRedirect(dir), /more than one build type/);

    fs.writeFileSync(path.join(dir, GRADLE), original.replace(/"\\"10\.0\.2\.2\\""/, '"\\"192.168.1.20\\""'));
    assert.throws(() => emulatorPlanFor(readDeclaredRedirect(dir)), /192\.168\.1\.20/);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("a project that is not a demo- id is refused — the suite would run against a real project's name", () => {
  const { base, dir } = stampAndAdd();
  try {
    edit(dir, GOOGLE_SERVICES, (s) => s.replace(/"project_id": "demo-mock-not-real"/, '"project_id": "acme-prod"'));
    assert.throws(() => readDeclaredRedirect(dir), (e) => /acme-prod/.test(e.message) && /demo-/.test(e.message));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
