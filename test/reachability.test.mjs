// Navigation-reachability gate (task FI-7, docs/AUTONOMY-GAPS.md §3): a
// feature that passes every other gate but is wired into no navigation
// destination is a confident false green — exactly what happened to
// MealTrayScreen/MealTrayRoute before this gate existed. These tests cover
// the gate's decision logic on cheap fake-tree fixtures (mirrors
// test/inputs-hash-parity.test.mjs's fixture style), then prove the RULE
// against the real shipped template via a fresh scaffold (mirrors
// test/approvals-gate.test.mjs's makeProject), and finally the verify.mjs
// CLI's strict argument parsing (Change 2 of the same brief).

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { evaluateReachability, findEntryComposables } from "../template/qa/lib/profiles/cmp/reachability.mjs";
import { scaffold } from "../src/scaffold.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function write(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const MEAL_TRAY_SCREEN_KT = `package com.acme.app.presentation.meal

import androidx.compose.runtime.Composable

@Composable
fun MealTrayRoute(onBack: () -> Unit) {
}
`;

const NAV_HOST_REFERENCING_MEAL = `package com.acme.app.presentation.navigation

import androidx.compose.runtime.Composable
import com.acme.app.presentation.meal.MealTrayRoute

@Composable
fun AppNavHost() {
    MealTrayRoute(onBack = {})
}
`;

const NAV_HOST_NOT_REFERENCING_MEAL = `package com.acme.app.presentation.navigation

import androidx.compose.runtime.Composable

@Composable
fun AppNavHost() {
    // the meal tray route was pulled out of the graph
}
`;

const MEAL_BRIEF_UNROUTED = `# Meal

The meal tray screen. Not yet wired into the navigation graph — deliberately,
pending a design review of where it hangs off the shell.

\`\`\`json cmp:feature
{ "unrouted": true }
\`\`\`
`;

// --- findEntryComposables: unit-level regex behavior ------------------------

test("findEntryComposables: top-level fun ending Screen/Route matches; indented/non-matching names do not", () => {
  const text = `
package com.acme.app.presentation.meal

@Composable
fun MealTrayRoute(onBack: () -> Unit) {
    fun helperNotTopLevel() {}
}

@Composable
fun MealTrayScreen() {}

fun doSomethingScreenful() {}

private fun MealTrayViewModel() {}
`;
  assert.deepEqual(findEntryComposables(text), ["MealTrayRoute", "MealTrayScreen"]);
});

// --- fake-tree fixture: the decision logic -----------------------------------

test("reachability: an entry composable referenced by nothing outside its own feature dir -> FAIL naming the feature and the composable", () => {
  const root = tmp("cmp-reach-fail-");
  try {
    write(root, "composeApp/src/commonMain/kotlin/com/acme/app/presentation/meal/MealTrayScreen.kt", MEAL_TRAY_SCREEN_KT);

    const r = evaluateReachability(root);
    assert.equal(r.verdict, "FAIL");
    assert.match(r.reason, /\[meal\]/, "names the feature");
    assert.match(r.reason, /MealTrayRoute/, "names the entry composable");
    assert.match(r.reason, /AppNavHost/, "points at the navigation graph as the fix");
    assert.match(r.reason, /unrouted/, "names the brief-exemption escape hatch");
    const meal = r.details.features.find((f) => f.name === "meal");
    assert.equal(meal.reachable, false);
    assert.deepEqual(meal.entryComposables, ["MealTrayRoute"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("reachability: wiring the entry composable into the nav graph (commonMain, outside the feature dir) -> PASS", () => {
  const root = tmp("cmp-reach-pass-");
  try {
    write(root, "composeApp/src/commonMain/kotlin/com/acme/app/presentation/meal/MealTrayScreen.kt", MEAL_TRAY_SCREEN_KT);
    write(
      root,
      "composeApp/src/commonMain/kotlin/com/acme/app/presentation/navigation/AppNavHost.kt",
      NAV_HOST_REFERENCING_MEAL,
    );

    const r = evaluateReachability(root);
    assert.equal(r.verdict, "PASS", r.reason);
    const meal = r.details.features.find((f) => f.name === "meal");
    assert.equal(meal.reachable, true);
    assert.ok(!meal.unrouted, "reachable via the graph, not via the exemption");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("reachability: removing the reference but declaring unrouted:true in the feature brief -> PASS, recorded as unrouted", () => {
  const root = tmp("cmp-reach-unrouted-");
  try {
    write(root, "composeApp/src/commonMain/kotlin/com/acme/app/presentation/meal/MealTrayScreen.kt", MEAL_TRAY_SCREEN_KT);
    write(
      root,
      "composeApp/src/commonMain/kotlin/com/acme/app/presentation/navigation/AppNavHost.kt",
      NAV_HOST_NOT_REFERENCING_MEAL,
    );
    write(root, "docs/features/meal.md", MEAL_BRIEF_UNROUTED);

    const r = evaluateReachability(root);
    assert.equal(r.verdict, "PASS", r.reason);
    const meal = r.details.features.find((f) => f.name === "meal");
    assert.equal(meal.reachable, true);
    assert.equal(meal.unrouted, true, "the exemption is recorded, not just silently honored");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("reachability: a reference that exists only in desktopMain (e.g. PreviewRegistry) must NOT count — still FAIL", () => {
  const root = tmp("cmp-reach-desktop-only-");
  try {
    write(root, "composeApp/src/commonMain/kotlin/com/acme/app/presentation/meal/MealTrayScreen.kt", MEAL_TRAY_SCREEN_KT);
    // Registered in the preview gallery only — exactly the false green FI-7 exists to catch.
    write(
      root,
      "composeApp/src/desktopMain/kotlin/com/acme/app/inspector/PreviewRegistry.kt",
      `package com.acme.app.inspector

fun previewRegistry() = listOf(story("meal-tray") { MealTrayRoute(onBack = {}) })
`,
    );
    // Also present in commonTest — must not count either.
    write(
      root,
      "composeApp/src/commonTest/kotlin/com/acme/app/presentation/meal/MealTrayRouteTest.kt",
      `package com.acme.app.presentation.meal

// references MealTrayRoute in commentary only — commonTest must not count
class MealTrayRouteInstantiationTest
`,
    );

    const r = evaluateReachability(root);
    assert.equal(r.verdict, "FAIL", "desktopMain/test references must not satisfy reachability");
    const meal = r.details.features.find((f) => f.name === "meal");
    assert.equal(meal.reachable, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("reachability: honest SKIPs — no commonMain/kotlin, no presentation dir, no *Screen.kt anywhere", () => {
  const noCommonMain = tmp("cmp-reach-skip-nocommon-");
  const noPresentation = tmp("cmp-reach-skip-nopres-");
  const noScreens = tmp("cmp-reach-skip-noscreens-");
  try {
    assert.equal(evaluateReachability(noCommonMain).verdict, "SKIP");

    write(noPresentation, "composeApp/src/commonMain/kotlin/com/acme/app/domain/Foo.kt", "package com.acme.app.domain\n");
    assert.equal(evaluateReachability(noPresentation).verdict, "SKIP");

    write(
      noScreens,
      "composeApp/src/commonMain/kotlin/com/acme/app/presentation/components/AppHeader.kt",
      "package com.acme.app.presentation.components\n",
    );
    assert.equal(evaluateReachability(noScreens).verdict, "SKIP", "components/ is excluded, so no feature is found");
  } finally {
    fs.rmSync(noCommonMain, { recursive: true, force: true });
    fs.rmSync(noPresentation, { recursive: true, force: true });
    fs.rmSync(noScreens, { recursive: true, force: true });
  }
});

// --- the shipped template, via a real scaffold + the verify.mjs CLI --------

async function makeScaffoldedProject(prefix) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  await scaffold(
    {
      appName: "Acme",
      package: "com.acme.demo",
      iosBundleId: "com.acme.demo",
      region: "us-central1",
      themePrefix: "Acme",
      platforms: { android: true, ios: true },
      firebase: { enabled: true, auth: "both", firestore: true, storage: true, functions: true, fcm: true },
      room: true,
      e2e: true,
      inspector: true,
      devClient: true,
      // Two tabs (Home + Profile) — the shipped default shape: with only one
      // tab configured, the `profile` stub screen file exists on disk but is
      // never wired into AppNavHost by scaffold's own tab regeneration, which
      // would be a real (pre-existing, unrelated) templating gap, not a
      // reachability-matcher bug. Mirrors component-stories.test.mjs's
      // DEFAULT_TABS.
      tabs: [
        { label: "Home", icon: "home" },
        { label: "Profile", icon: "person" },
      ],
      targetDir: out,
    },
    { verify: false },
  );
  return out;
}

test("shipped template: a fresh scaffold's own home/profile screens are reachable via AppNavHost (real-tree check of the matcher, not the template)", async () => {
  const out = await makeScaffoldedProject("cmp-reach-scaffold-");
  try {
    // Cache-bust via a project-unique module URL (mirrors approvals-gate.test.mjs's loadLib).
    const { evaluateReachability: evaluateReachabilityInProject } = await import(
      pathToFileURL(path.join(out, "qa/lib/profiles/cmp/reachability.mjs"))
    );
    const r = evaluateReachabilityInProject(out);
    assert.equal(
      r.verdict,
      "PASS",
      r.reason ? `${r.reason}\n\nIf this FAILs, the RULE is wrong (the template's nav wiring is known-good) — fix reachability.mjs, not the template.` : undefined,
    );
    // `navigation/` also surfaces as a candidate (its Screen.kt — the route
    // registry, trivially matching the "*Screen.kt" glob — declares no
    // top-level fun ending Screen/Route, so it is a no-op entry, not a
    // reachability concern). The two REAL shipped features must both appear
    // and both be reachable.
    const names = r.details.features.map((f) => f.name);
    assert.ok(names.includes("home"), `expected "home" among ${names.join(", ")}`);
    assert.ok(names.includes("profile"), `expected "profile" among ${names.join(", ")}`);
    assert.ok(
      r.details.features.every((f) => f.reachable),
      "every discovered feature (real or trivial) reads as reachable",
    );
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("verify.mjs: strict argument parsing — --help prints usage and exits 0, an unknown flag exits 2, neither starts Gradle", async () => {
  const out = await makeScaffoldedProject("cmp-reach-cli-");
  try {
    const helpStarted = Date.now();
    const helpOut = execFileSync(process.execPath, [path.join(out, "qa/verify.mjs"), "--help"], {
      cwd: out,
      encoding: "utf8",
    });
    const helpMs = Date.now() - helpStarted;
    assert.match(helpOut, /verify\.mjs/);
    assert.match(helpOut, /--profile/);
    assert.match(helpOut, /scaffold/);
    assert.match(helpOut, /\blocal\b/);
    assert.match(helpOut, /\bci\b/);
    assert.ok(helpMs < 10_000, `--help must complete in seconds, took ${helpMs}ms — Gradle must not have started`);

    const bogusStarted = Date.now();
    try {
      execFileSync(process.execPath, [path.join(out, "qa/verify.mjs"), "--bogus"], {
        cwd: out,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      assert.fail("expected node qa/verify.mjs --bogus to exit non-zero");
    } catch (err) {
      const bogusMs = Date.now() - bogusStarted;
      assert.equal(err.status, 2);
      assert.match(err.stderr, /unknown argument "--bogus"/);
      assert.match(err.stderr, /--help/);
      assert.ok(bogusMs < 10_000, `--bogus must fail fast, took ${bogusMs}ms — Gradle must not have started`);
    }
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});
