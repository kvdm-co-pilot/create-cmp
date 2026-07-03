import { test } from "node:test";
import assert from "node:assert/strict";

import { diagnoseProject, formatBytes, GIB } from "../src/lib/project-doctor.mjs";
import { loadRegistry } from "../src/lib/registry.mjs";

const REGISTRY = loadRegistry();

const GOOD_TOML = [
  "[versions]",
  'kotlin = "2.2.20"',
  'ksp = "2.2.20-2.0.4"',
  'room = "2.8.4"',
  'agp = "8.7.3"',
  'google-services = "4.4.2"',
  'compose-multiplatform = "1.10.3"',
  'koin = "4.1.1"',
  'ktor = "3.1.0"',
  'sqlite = "2.6.2"',
  'kotlinx-serialization = "1.7.3"',
  'kotlinx-datetime = "0.7.0"',
  'lifecycle = "2.10.0"',
  'navigation = "2.9.2"',
  'firebase-gitlive = "2.1.0"',
  'coil = "3.1.0"',
  'androidx-core = "1.15.0"',
  'androidx-activity = "1.10.1"',
  "",
].join("\n");

function baseInput(overrides = {}) {
  return {
    toml: GOOD_TOML,
    gradleProperties: "ksp.useKSP2=true\n",
    localProperties: "sdk.dir=/opt/android-sdk\n",
    sdkDirExists: true,
    androidHomeSet: true,
    hasIos: true,
    registry: REGISTRY,
    konanBytes: 2 * GIB,
    freeDiskBytes: 50 * GIB,
    ...overrides,
  };
}

function byId(findings, id) {
  return findings.find((f) => f.id === id);
}

test("healthy project: everything ok, nothing fails", () => {
  const findings = diagnoseProject(baseInput());
  assert.ok(findings.length > 0);
  assert.ok(!findings.some((f) => f.level === "fail"), JSON.stringify(findings, null, 2));
  assert.equal(byId(findings, "kotlin-ksp-lockstep").level, "ok");
  assert.equal(byId(findings, "ksp2-flag").level, "ok");
  assert.equal(byId(findings, "registry-drift").level, "ok");
  assert.equal(byId(findings, "local-properties").level, "ok");
});

test("kotlin↔ksp lockstep violation is a FAIL", () => {
  const toml = GOOD_TOML.replace('ksp = "2.2.20-2.0.4"', 'ksp = "2.1.0-1.0.29"');
  const findings = diagnoseProject(baseInput({ toml }));
  const f = byId(findings, "kotlin-ksp-lockstep");
  assert.equal(f.level, "fail");
  assert.ok(f.detail.includes("OUT OF LOCKSTEP"));
});

test("room + iOS without ksp.useKSP2=true is a FAIL with an auto fix", () => {
  const findings = diagnoseProject(baseInput({ gradleProperties: "kotlin.code.style=official\n" }));
  const f = byId(findings, "ksp2-flag");
  assert.equal(f.level, "fail");
  assert.equal(f.fix.auto, true);
});

test("room + iOS with ksp.useKSP2=false is also a FAIL", () => {
  const findings = diagnoseProject(baseInput({ gradleProperties: "ksp.useKSP2=false\n" }));
  assert.equal(byId(findings, "ksp2-flag").level, "fail");
});

test("ksp2 check does not fire without iOS or without room", () => {
  const noIos = diagnoseProject(baseInput({ hasIos: false, gradleProperties: "" }));
  assert.equal(byId(noIos, "ksp2-flag"), undefined);
  const noRoom = diagnoseProject(
    baseInput({ toml: GOOD_TOML.replace('room = "2.8.4"\n', ""), gradleProperties: "" })
  );
  assert.equal(byId(noRoom, "ksp2-flag"), undefined);
});

test("Room < 2.7 with iOS is flagged (no Kotlin/Native support)", () => {
  const toml = GOOD_TOML.replace('room = "2.8.4"', 'room = "2.6.1"');
  const findings = diagnoseProject(baseInput({ toml }));
  assert.equal(byId(findings, "room-native-support").level, "fail");
});

test("registry drift is a WARN listing the drifted versions", () => {
  const toml = GOOD_TOML.replace('kotlin = "2.2.20"', 'kotlin = "2.2.0"').replace(
    'ksp = "2.2.20-2.0.4"',
    'ksp = "2.2.0-2.0.2"'
  );
  const findings = diagnoseProject(baseInput({ toml }));
  const f = byId(findings, "registry-drift");
  assert.equal(f.level, "warn");
  assert.ok(f.detail.includes("kotlin 2.2.0 → 2.2.20"));
  assert.ok(f.fix.description.includes("create-cmp upgrade"));
});

test("no version catalog → warn, checks skipped gracefully (any-project resilience)", () => {
  const findings = diagnoseProject(baseInput({ toml: null }));
  assert.equal(byId(findings, "version-catalog").level, "warn");
  assert.equal(byId(findings, "kotlin-ksp-lockstep"), undefined);
  assert.equal(byId(findings, "registry-drift"), undefined);
});

test("missing local.properties: FAIL without ANDROID_HOME, WARN (auto-fixable) with it", () => {
  const without = diagnoseProject(baseInput({ localProperties: null, sdkDirExists: null, androidHomeSet: false }));
  assert.equal(byId(without, "local-properties").level, "fail");
  const withHome = diagnoseProject(baseInput({ localProperties: null, sdkDirExists: null, androidHomeSet: true }));
  const f = byId(withHome, "local-properties");
  assert.equal(f.level, "warn");
  assert.equal(f.fix.auto, true);
});

test("sdk.dir pointing at a missing directory is a FAIL", () => {
  const findings = diagnoseProject(baseInput({ sdkDirExists: false }));
  assert.equal(byId(findings, "local-properties").level, "fail");
});

test("~/.konan over 10GB warns; under does not", () => {
  const big = diagnoseProject(baseInput({ konanBytes: 11 * GIB }));
  assert.equal(byId(big, "konan-size").level, "warn");
  const small = diagnoseProject(baseInput({ konanBytes: 9 * GIB }));
  assert.equal(byId(small, "konan-size").level, "ok");
});

test("free disk under 3GB warns; unknown disk is skipped", () => {
  const low = diagnoseProject(baseInput({ freeDiskBytes: 2 * GIB }));
  assert.equal(byId(low, "disk-free").level, "warn");
  const unknown = diagnoseProject(baseInput({ freeDiskBytes: null }));
  assert.equal(byId(unknown, "disk-free"), undefined);
});

test("formatBytes renders GB and MB sensibly", () => {
  assert.equal(formatBytes(10 * GIB), "10.0 GB");
  assert.equal(formatBytes(512 * 1024 ** 2), "512 MB");
});

// --- live inspector placement + catalog drift (Phase 2) ------------------------

test("inspector code confined to androidDebug → ok finding", () => {
  const findings = diagnoseProject(
    baseInput({
      inspectorHits: [
        "composeApp/src/androidDebug/kotlin/com/acme/app/inspector/InspectorHttpServer.kt",
        "composeApp/src/androidDebug/kotlin/com/acme/app/inspector/InspectorInit.kt",
      ],
    })
  );
  const f = byId(findings, "inspector-placement");
  assert.equal(f.level, "ok");
});

test("inspector reference outside androidDebug → WARN naming the leak", () => {
  const findings = diagnoseProject(
    baseInput({
      inspectorHits: [
        "composeApp/src/androidDebug/kotlin/com/acme/app/inspector/InspectorHttpServer.kt",
        "composeApp/src/androidMain/kotlin/com/acme/app/AppApplication.kt",
      ],
    })
  );
  const f = byId(findings, "inspector-placement");
  assert.equal(f.level, "warn");
  assert.ok(f.detail.includes("AppApplication.kt"));
  assert.ok(!f.detail.includes("InspectorHttpServer.kt"), "debug-set file is not a leak");
});

test("no inspector code / scan skipped → no inspector finding", () => {
  assert.equal(byId(diagnoseProject(baseInput({ inspectorHits: [] })), "inspector-placement"), undefined);
  assert.equal(byId(diagnoseProject(baseInput({ inspectorHits: null })), "inspector-placement"), undefined);
  assert.equal(byId(diagnoseProject(baseInput({})), "inspector-placement"), undefined);
});

test("catalog drift tripwire: token declared in theme but missing from catalog → WARN", () => {
  const theme = [
    "object AcmeTokens {",
    "    val PaddingPage = 16.dp",
    "    val RadiusCard  = 16.dp",
    "    val BrandNewToken = 42.dp",
    "}",
  ].join("\n");
  const catalog = 'put("PaddingPage", ...)\nput("RadiusCard", ...)\n';
  const findings = diagnoseProject(baseInput({ inspectorCatalog: { catalog, theme } }));
  const f = byId(findings, "inspector-catalog-drift");
  assert.equal(f.level, "warn");
  assert.ok(f.detail.includes("BrandNewToken"));
  assert.ok(!f.detail.includes("PaddingPage,"), "covered tokens not listed");
});

test("catalog drift tripwire: full coverage → ok; private vals ignored", () => {
  const theme = [
    "object AcmeColors {",
    "    val Primary = Color(0xFF0A2540)",
    "}",
    "private val AcmeColorScheme = lightColorScheme()",
  ].join("\n");
  const catalog = 'put("Primary", AcmeColors.Primary.toHex())';
  const findings = diagnoseProject(baseInput({ inspectorCatalog: { catalog, theme } }));
  assert.equal(byId(findings, "inspector-catalog-drift").level, "ok");
});
