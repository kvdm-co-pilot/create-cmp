// A citation proves a test EXISTS; it cannot prove the test could OBSERVE the
// promise. MOTION-13 claimed an animation "plays once per process start" and
// was cited by a desktop Compose test — a tier with no process lifecycle at
// all. Coverage was green; nothing had checked anything; the defect reached a
// user. (docs/proposals/evidence-economics.md C2/C3; DOGFOODING-FINDINGS P1.)
//
// The clause declares the tier that can observe it, and the gate polices it.
// REAL files in a REAL temp dir — the same scan the lane runs.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { TIERS_SATISFYING, clauseTierCoverage, scanCitations, scanSpecClauses } from "../packages/harness/src/lib/spec-coverage.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function project(spec, citations) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-tier-"));
  fs.mkdirSync(path.join(root, "specs"), { recursive: true });
  fs.writeFileSync(path.join(root, "specs", "motion.spec.md"), spec);
  for (const [rel, ids] of Object.entries(citations)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, `// SPEC: ${ids}\nclass T\n`);
  }
  return root;
}

const DESKTOP = "composeApp/src/desktopTest/kotlin/IntroScreenTest.kt";
const DEVICE = "composeApp/src/androidInstrumentedTest/kotlin/IntroLifecycleTest.kt";
const E2E = "qa/e2e/intro.yaml";

test("a clause may declare the tier that can observe it, on the clause line", () => {
  const root = project(
    "- **MOTION-13** [tier: device] — Given a cold start, When the app opens, Then the intro plays once.\n" +
      "- **MOTION-14** — Given a tap, When skip is pressed, Then the intro ends.\n",
    {},
  );
  const clauses = scanSpecClauses(root);
  assert.equal(clauses.get("MOTION-13").requiredTier, "device");
  assert.equal(clauses.get("MOTION-14").requiredTier, null, "undeclared stays undeclared — no tier is inferred");
});

test("PLANTED FAILURE: the MOTION-13 case — a device-tier clause cited only from the desktop tier is UNMET", () => {
  const root = project("- **MOTION-13** [tier: device] — Given a cold start, Then the intro plays once per process start.\n", {
    [DESKTOP]: "MOTION-13",
  });
  const tiers = clauseTierCoverage(scanSpecClauses(root), scanCitations(root));
  assert.equal(tiers.unmetTier.length, 1, "the citation exists and is incompetent — that is the hole, and it is now red");
  assert.equal(tiers.unmetTier[0].id, "MOTION-13");
  assert.equal(tiers.unmetTier[0].requiredTier, "device");
  assert.deepEqual(tiers.unmetTier[0].tiers, ["desktopTest"], "the message can say exactly which blind tier cited it");
});

test("a device-tier clause is satisfied by an instrumented citation, or by e2e", () => {
  for (const file of [DEVICE, E2E]) {
    const root = project("- **MOTION-13** [tier: device] — Given a cold start, Then the intro plays once.\n", {
      [DESKTOP]: "MOTION-13",
      [file]: "MOTION-13",
    });
    const tiers = clauseTierCoverage(scanSpecClauses(root), scanCitations(root));
    assert.equal(tiers.unmetTier.length, 0, `${file} can observe the promise`);
  }
});

test("an e2e-tier clause is NOT satisfied by an instrumented test — only the flow can see the flow", () => {
  const root = project("- **FLOW-01** [tier: e2e] — Given the installed app, When the journey runs, Then it lands on Home.\n", {
    [DEVICE]: "FLOW-01",
  });
  const tiers = clauseTierCoverage(scanSpecClauses(root), scanCitations(root));
  assert.equal(tiers.unmetTier.length, 1);
  assert.deepEqual(TIERS_SATISFYING.e2e, ["e2e"]);
});

test("undeclared clauses are unchanged: any citation still covers them (instrument before you police)", () => {
  const root = project("- **HOME-01** — Given Home, Then the title reads Home.\n", { [DESKTOP]: "HOME-01" });
  const tiers = clauseTierCoverage(scanSpecClauses(root), scanCitations(root));
  assert.equal(tiers.unmetTier.length, 0);
  assert.deepEqual(tiers.desktopOnly, ["HOME-01"], "still REPORTED as desktop-only — the descriptive half stays");
});

test("a withdrawn clause declares nothing — struck-through promises are exempt", () => {
  const root = project("- ~~**MOTION-13**~~ [tier: device] — withdrawn.\n", {});
  const tiers = clauseTierCoverage(scanSpecClauses(root), scanCitations(root));
  assert.equal(tiers.unmetTier.length, 0);
});

test("the lane's specCoverage step FAILS on an unmet tier — pinned in the step pack itself", () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, "packages/harness/src/lib/steps-cmp.mjs"), "utf8");
  assert.match(src, /tiers\.unmetTier\.length === 0\)/, "PASS requires unmetTier to be empty");
  assert.match(src, /declares \[tier: \$\{u\.requiredTier\}\] but is/, "and the failure names the declared tier and the blind citation");
});
