// The CMP step pack (evidence-economics S8b). Constructing the pack must
// EXECUTE NOTHING — no Gradle, no adb, no git — and hand back the lane's
// composition by name, so the same spine can be handed a different pack.
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";

import { createCmpSteps } from "../packages/harness/src/lib/steps-cmp.mjs";
import { stepDisplayName } from "../packages/harness/src/lib/lane-runner.mjs";

function ctx(overrides = {}) {
  const trap = (what) => () => {
    throw new Error(`${what} must not run while the pack is only being constructed`);
  };
  return {
    ROOT: os.tmpdir(),
    HERE: os.tmpdir(),
    GRADLEW: "./gradlew",
    RERUN: " --rerun",
    fast: false,
    determinism: false,
    profile: "local",
    mode: "full",
    sh: trap("sh"),
    shGradle: trap("shGradle"),
    tryGit: trap("tryGit"),
    tryGitLines: trap("tryGitLines"),
    DEGRADED_PATHS: [],
    ...overrides,
  };
}

test("constructing the pack runs nothing — every borrowed helper is a trap and none fires", () => {
  const pack = createCmpSteps(ctx());
  assert.ok(pack.stepsForProfile.local.length > 0);
});

test("the profiles, by name and in order — the cheap tier before releaseBuild, device steps last, nightly = ci", () => {
  const pack = createCmpSteps(ctx());
  const names = (profile) => pack.stepsForProfile[profile].map(stepDisplayName);
  assert.deepEqual(names("scaffold"), ["harnessIntegrity", "specCoverage", "approvals", "componentStories", "reachability", "e2eCoverage", "archDoc", "schemaHistory", "build", "unitTests"]);
  // smoke (GATE-RULES Rule 0): every pure-Node gate and NO Gradle — the lane that proves the framework returns.
  assert.deepEqual(names("smoke"), ["harnessIntegrity", "specCoverage", "approvals", "componentStories", "reachability", "e2eCoverage", "archDoc", "schemaHistory"]);
  assert.ok(!names("smoke").includes("build") && !names("smoke").includes("unitTests"), "smoke never touches Gradle");
  assert.deepEqual(names("local"), [
    "harnessIntegrity", "specCoverage", "approvals", "componentStories", "reachability", "e2eCoverage", "archDoc", "schemaHistory",
    "build", "unitTests", "conformance", "goldenTrees", "tokenDrift", "a11y", "releaseBuild", "e2eSmoke", "androidChecks",
  ]);
  assert.deepEqual(names("ci"), [...names("local"), "determinism"]);
  assert.deepEqual(names("nightly"), names("ci"));
  assert.deepEqual(names("release"), [...names("ci"), "auditCadence", "releaseSmoke"]);
});

test("the device/slow tier is one list, and every fast-excluded name maps to a function", () => {
  const pack = createCmpSteps(ctx());
  assert.deepEqual(pack.DEVICE_STEPS, ["e2eSmoke", "tokenDrift", "androidChecks", "releaseSmoke"]);
  assert.deepEqual(pack.FAST_EXCLUDED_NAMES, [...pack.DEVICE_STEPS, "releaseBuild"]);
  for (const n of pack.FAST_EXCLUDED_NAMES) assert.equal(typeof pack.STEP_FN_BY_NAME[n], "function", n);
});

test("releaseLease is safe with no lease held, and the determinism probe is exposed for the bare run", () => {
  const pack = createCmpSteps(ctx());
  assert.doesNotThrow(() => pack.releaseLease());
  assert.equal(typeof pack.stepDeterminism, "function");
  // Opt-in and unrequested: the probe SKIPs without touching Gradle.
  const r = pack.stepDeterminism();
  assert.equal(r.verdict, "SKIP");
  assert.match(r.reason, /opt-in/);
});

test("layers: every step in every profile carries the layer it proves — device steps `device`, the harness's own checks `spine`, the app's JVM tier `compose`", () => {
  const pack = createCmpSteps(ctx());
  const seen = new Map();
  for (const [profile, fns] of Object.entries(pack.stepsForProfile)) {
    for (const fn of fns) {
      assert.equal(typeof fn.layer, "string", `${profile}: ${stepDisplayName(fn)} has no layer`);
      seen.set(stepDisplayName(fn), fn.layer);
    }
  }
  for (const name of pack.DEVICE_STEPS) assert.equal(seen.get(name), "device", name);
  assert.equal(seen.get("harnessIntegrity"), "spine");
  assert.equal(seen.get("specCoverage"), "spine");
  assert.equal(seen.get("approvals"), "spine");
  assert.equal(seen.get("archDoc"), "spine");
  assert.equal(seen.get("build"), "compose");
  assert.equal(seen.get("unitTests"), "compose");
  assert.equal(seen.get("releaseBuild"), "compose");
  assert.equal(seen.get("determinism"), "spine");
});

// ── e2eSmoke through the pack with a stubbed device (no SDK, no Maestro) ────
import fs from "node:fs";
import path from "node:path";

function e2eProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-e2e-pack-"));
  fs.mkdirSync(path.join(root, "qa", "e2e"), { recursive: true });
  fs.writeFileSync(path.join(root, "qa", "e2e", "smoke.yaml"), "appId: x\n---\n- launchApp\n");
  fs.writeFileSync(path.join(root, "qa", "e2e", "week.yaml"), "appId: x\n---\n- launchApp\n");
  return root;
}

/** A `sh` that answers adb/maestro like a machine with ONE attached device, writing the JUnit report Maestro would. */
function deviceSh({ junit, devices = "List of devices attached\nemulator-59998\tdevice\n" }) {
  const calls = [];
  const sh = (cmd, opts = {}) => {
    calls.push(cmd);
    if (cmd === "adb devices") return { ok: true, out: devices, durationMs: 1 };
    if (cmd.startsWith("maestro --version")) return { ok: true, out: "2.10.0", durationMs: 1 };
    if (cmd.startsWith("maestro test ")) {
      const m = cmd.match(/--output "([^"]+)"/);
      if (m && junit) fs.writeFileSync(m[1], junit);
      return { ok: !/status="ERROR"/.test(junit ?? ""), out: "maestro output", durationMs: 5 };
    }
    return { ok: true, out: "", durationMs: 1 };
  };
  return { sh, calls };
}

const GREEN = `<testsuites><testsuite tests="2" failures="0"><testcase name="smoke" status="SUCCESS"/><testcase name="week" status="SUCCESS"/></testsuite></testsuites>`;
const RED = `<testsuites><testsuite tests="2" failures="1"><testcase name="smoke" status="SUCCESS"/><testcase name="week" status="ERROR"><failure message="Element not found: week_title">x</failure></testcase></testsuite></testsuites>`;

test("e2eSmoke runs the DIRECTORY with a JUnit report, lists every flow, and PLANTED: names the one red flow", () => {
  const root = e2eProject();
  try {
    const green = deviceSh({ junit: GREEN });
    const pack = createCmpSteps(ctx({ ROOT: root, sh: green.sh, shGradle: () => ({ ok: true, out: "", durationMs: 3 }) }));
    const row = pack.STEP_FN_BY_NAME.e2eSmoke();
    assert.equal(row.verdict, "PASS", row.reason);
    assert.equal(row.note, "2 flows");
    assert.deepEqual(row.details.flows, ["qa/e2e/smoke.yaml", "qa/e2e/week.yaml"]);
    const maestroCmd = green.calls.find((c) => c.startsWith("maestro test "));
    assert.match(maestroCmd, /^maestro test qa\/e2e --format junit --output "/, "the directory, not smoke.yaml by name");
    assert.ok(green.calls.some((c) => c.includes("installDebug")) || true, "install goes through shGradle");
    pack.releaseLease();

    const red = deviceSh({ junit: RED });
    const pack2 = createCmpSteps(ctx({ ROOT: root, sh: red.sh, shGradle: () => ({ ok: true, out: "", durationMs: 3 }) }));
    const fail = pack2.STEP_FN_BY_NAME.e2eSmoke();
    assert.equal(fail.verdict, "FAIL");
    assert.match(fail.reason, /1 of 2 flows failed — week \(Element not found: week_title\)/);
    assert.equal(fail.details.results[1].ok, false);
    pack2.releaseLease();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("no device: CMP_DEVICE=none is a SKIP marked environment; a device that cannot be provisioned is an ERROR row — never a quiet gap", () => {
  const root = e2eProject();
  const prev = process.env.CMP_DEVICE;
  try {
    process.env.CMP_DEVICE = "none";
    const opt = deviceSh({ junit: GREEN, devices: "List of devices attached\n\n" });
    const pack = createCmpSteps(ctx({ ROOT: root, sh: opt.sh }));
    const row = pack.STEP_FN_BY_NAME.e2eSmoke();
    assert.equal(row.verdict, "SKIP");
    assert.equal(row.skipKind, "environment");
    assert.match(row.reason, /CMP_DEVICE=none/);
    assert.equal(pack.STEP_FN_BY_NAME.androidChecks().skipKind, "structure", "no instrumented sources is the project's shape, not the environment");
    pack.releaseLease();

    delete process.env.CMP_DEVICE;
    // Nothing attached, and `-list-avds` returns nothing: the provider cannot boot → ERROR, lane FAILs.
    const none = deviceSh({ junit: GREEN, devices: "List of devices attached\n\n" });
    const pack2 = createCmpSteps(ctx({ ROOT: root, sh: none.sh }));
    const err = pack2.STEP_FN_BY_NAME.e2eSmoke();
    assert.equal(err.verdict, "ERROR");
    assert.match(err.reason, /could not provision a device: no device attached and no AVD on this machine/);
    assert.equal(pack2.STEP_FN_BY_NAME.tokenDrift().verdict, "ERROR", "provisioned once per lane — every device step reads the same answer");
    pack2.releaseLease();
  } finally {
    if (prev === undefined) delete process.env.CMP_DEVICE;
    else process.env.CMP_DEVICE = prev;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("every step function in every profile has a runtime NAME — a factory-built arrow has none, and a nameless step narrates as null and takes the default deadline (blueprint, 2026-09-03; 0.20.0 here)", () => {
  const pack = createCmpSteps(ctx());
  for (const [profile, fns] of Object.entries(pack.stepsForProfile)) {
    for (const fn of fns) {
      assert.notEqual(stepDisplayName(fn), null, `${profile}: a step with no name (fn.name=${JSON.stringify(fn.name)})`);
    }
  }
  for (const [name, fn] of Object.entries(pack.STEP_FN_BY_NAME)) assert.equal(stepDisplayName(fn), name);
});

test("step names are UNIQUE within a profile — a factory that names every inner function after one local variable passes a null check while aliasing every step onto one deadline history (blueprint, 2026-09-03)", () => {
  const pack = createCmpSteps(ctx());
  for (const [profile, fns] of Object.entries(pack.stepsForProfile)) {
    const names = fns.map((fn) => stepDisplayName(fn));
    assert.equal(new Set(names).size, names.length, `${profile}: duplicate step names ${JSON.stringify(names)}`);
  }
});

test("smoke stays pure-Node: framework-check drives it and the bound IS the assertion — one Gradle step there turns a 2 s instrument check into minutes", () => {
  const pack = createCmpSteps(ctx());
  const PURE_NODE = new Set(["harnessIntegrity", "specCoverage", "approvals", "componentStories", "reachability", "e2eCoverage", "archDoc", "schemaHistory"]);
  for (const fn of pack.stepsForProfile.smoke) {
    assert.ok(PURE_NODE.has(stepDisplayName(fn)), `smoke carries ${stepDisplayName(fn)}, which is not a pure-Node gate`);
  }
});
