// The feature walk's state machine: feature briefs (docs/proposals/*.md with a
// cmp:intent-checks block) as governed `feature-intent:<name>` artifacts, the
// deliver/accept ledger lifecycle, the armed-checks gate, and the Features
// board's declared-vs-actual blast radius.
//
// Same harness shape as test/approvals-gate.test.mjs: scaffold the REAL
// template once (verify: false — gradle-free), import the project's own
// qa/lib in-process for the pure decisions, and run the real qa/approve.mjs
// CLI where the point IS the CLI surface.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { scaffold } from "../src/scaffold.mjs";

function baseConfig(targetDir) {
  return {
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
    tabs: [{ label: "Home", icon: "home" }],
    targetDir,
  };
}

function runApprove(root, args) {
  return execFileSync(process.execPath, [path.join(root, "qa/approve.mjs"), ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function runApproveExpectFail(root, args) {
  try {
    execFileSync(process.execPath, [path.join(root, "qa/approve.mjs"), ...args], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    assert.fail("expected qa/approve.mjs to exit non-zero");
  } catch (err) {
    return { status: err.status, stdout: err.stdout, stderr: err.stderr };
  }
}

const BRIEF = `# Meal planning — feature brief

The decisions and their why live here as prose.

\`\`\`json cmp:intent-checks
{
  "touches": ["components"],
  "checks": [
    { "id": "clauses", "kind": "spec-clauses", "file": "specs/meal.spec.md", "clauses": ["MEAL-01", "MEAL-02"] },
    { "id": "day-boundary", "kind": "pattern", "file": "notes/day.kt", "pattern": "dayStartHour" },
    { "id": "tray-file", "kind": "file-exists", "file": "notes/Tray.kt" }
  ]
}
\`\`\`
`;

test("feature briefs: governance opt-in, lifecycle, armed checks, board", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-feature-intent-"));
  await scaffold(baseConfig(root), { verify: false });
  const lib = await import(pathToFileURL(path.join(root, "qa/lib/approvals.mjs")));
  const intentLib = await import(pathToFileURL(path.join(root, "qa/lib/intent-checks.mjs")));

  const proposalsDir = path.join(root, "docs/proposals");
  fs.mkdirSync(proposalsDir, { recursive: true });
  fs.writeFileSync(path.join(proposalsDir, "meal-plan.md"), BRIEF);
  fs.writeFileSync(path.join(proposalsDir, "scratch-notes.md"), "# Notes\n\nno block here — never governed.\n");

  await t.test("the block is the opt-in: with-block governed, without-block not", () => {
    const ids = lib.listGovernedArtifacts(root).map((a) => a.id);
    assert.ok(ids.includes("feature-intent:meal-plan"), `expected feature-intent:meal-plan in ${ids}`);
    assert.ok(!ids.includes("feature-intent:scratch-notes"), "a block-less doc must never be governed");
  });

  await t.test("deliver refuses an unapproved brief; the walk is approve-first", () => {
    const res = lib.deliverFeature(root, "meal-plan");
    assert.equal(res.ok, false);
    assert.match(res.reason, /"unreviewed", not "approved"/);
    const cli = runApproveExpectFail(root, ["--deliver", "meal-plan"]);
    assert.match(cli.stderr, /not "approved"/);
  });

  await t.test("gate SKIPs while the brief is building (checks informational)", () => {
    runApprove(root, ["feature-intent:meal-plan"]);
    const gate = lib.evaluateIntentChecksGate(root);
    assert.equal(gate.verdict, "SKIP");
    assert.match(gate.reason, /informational until delivery/);
  });

  await t.test("deliver arms the checks: unsatisfied -> lane FAIL, acceptance refused", () => {
    const out = runApprove(root, ["--deliver", "meal-plan"]);
    assert.match(out, /checks armed/);
    const gate = lib.evaluateIntentChecksGate(root);
    assert.equal(gate.verdict, "FAIL");
    assert.match(gate.reason, /meal-plan/);
    assert.match(gate.reason, /check "clauses" — specs\/meal\.spec\.md is missing/);
    const acc = lib.acceptFeature(root, "meal-plan");
    assert.equal(acc.ok, false);
    assert.match(acc.reason, /armed check\(s\) failing/);
  });

  await t.test("satisfying every check turns the gate PASS and acceptance succeeds", () => {
    fs.mkdirSync(path.join(root, "notes"), { recursive: true });
    fs.writeFileSync(path.join(root, "specs/meal.spec.md"), "# meal\n\n- **MEAL-01** — Given…\n- **MEAL-02** — Given…\n");
    fs.writeFileSync(path.join(root, "notes/day.kt"), "val dayStartHour = 4\n");
    fs.writeFileSync(path.join(root, "notes/Tray.kt"), "class Tray\n");
    assert.equal(lib.evaluateIntentChecksGate(root).verdict, "PASS");
    const out = runApprove(root, ["--accept", "meal-plan"]);
    assert.match(out, /accepted feature-intent:meal-plan/);
    const row = lib.getApprovalStatuses(root).find((s) => s.id === "feature-intent:meal-plan");
    assert.equal(row.delivered, true);
    assert.equal(row.accepted, true);
  });

  await t.test("editing the signed brief after acceptance is drift, and the lifecycle survives on the row", () => {
    fs.appendFileSync(path.join(proposalsDir, "meal-plan.md"), "\nsneaky post-signature edit\n");
    const row = lib.getApprovalStatuses(root).find((s) => s.id === "feature-intent:meal-plan");
    assert.equal(row.status, "changed-since-approval");
    assert.equal(lib.evaluateApprovalsGate(root).verdict, "FAIL");
    // restore for the board tests below
    fs.writeFileSync(path.join(proposalsDir, "meal-plan.md"), BRIEF);
    assert.equal(lib.getApprovalStatuses(root).find((s) => s.id === "feature-intent:meal-plan").status, "approved");
  });

  await t.test("a malformed block FAILs the gate even undelivered — a broken gate never silently stops gating", () => {
    fs.writeFileSync(path.join(proposalsDir, "broken.md"), "# broken\n\n```json cmp:intent-checks\n{ not json\n```\n");
    const gate = lib.evaluateIntentChecksGate(root);
    assert.equal(gate.verdict, "FAIL");
    assert.match(gate.reason, /broken/);
    fs.rmSync(path.join(proposalsDir, "broken.md"));
  });

  await t.test("deliver refuses a zero-check brief — a claim with nothing to check is vacuous", () => {
    fs.writeFileSync(path.join(proposalsDir, "empty.md"), '# empty\n\n```json cmp:intent-checks\n{ "checks": [] }\n```\n');
    runApprove(root, ["feature-intent:empty"]);
    const res = lib.deliverFeature(root, "empty");
    assert.equal(res.ok, false);
    assert.match(res.reason, /zero checks/);
    fs.rmSync(path.join(proposalsDir, "empty.md"));
  });

  await t.test("board: declared drift reads as planned; undeclared drift is called out", () => {
    // components drifts, and meal-plan DECLARES touching it -> not undeclared.
    runApprove(root, ["components"]);
    const componentsDir = path.join(root, "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/components");
    const someComponent = fs.readdirSync(componentsDir).find((f) => f.endsWith(".kt"));
    fs.appendFileSync(path.join(componentsDir, someComponent), "\n// drift\n");
    // design-system drifts and NOTHING declares it -> undeclared.
    runApprove(root, ["design-system"]);
    fs.appendFileSync(path.join(root, "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/theme/Tokens.kt"), "\n// drift\n");

    const board = lib.getFeatureBoard(root);
    const card = board.features.find((f) => f.name === "meal-plan");
    assert.equal(card.phase, "accepted");
    assert.deepEqual(
      card.touches.map((x) => [x.id, x.status]),
      [["components", "changed-since-approval"]],
    );
    const undeclaredIds = board.undeclared.map((u) => u.id);
    assert.ok(undeclaredIds.includes("design-system"), `design-system should be undeclared blast, got ${undeclaredIds}`);
    // meal-plan is ACCEPTED (closed) — its touches no longer cover components,
    // so components is undeclared too unless another open brief declares it.
    assert.ok(undeclaredIds.includes("components"), "an accepted brief no longer covers its touches");
  });

  await t.test("via is recorded on the approval row (audit: which surface signed)", () => {
    const res = lib.approveArtifact(root, "feature-intent:meal-plan", { via: "console" });
    assert.equal(res.ok, true);
    const raw = JSON.parse(fs.readFileSync(path.join(root, "qa/approvals.json"), "utf8"));
    const row = raw.artifacts.find((a) => a.artifact === "feature-intent:meal-plan");
    assert.equal(row.via, "console");
    // ...and the fresh approval cleared the old lifecycle (new signature, new claim needed)
    assert.equal(row.delivered, undefined);
    assert.equal(row.accepted, undefined);
  });

  await t.test("the lane step wiring exists (verify.mjs names intentChecks in both profiles)", () => {
    const verify = fs.readFileSync(path.join(root, "qa/verify.mjs"), "utf8");
    assert.match(verify, /stepIntentChecks/);
    assert.match(verify, /name: "intentChecks"/);
    const parsed = intentLib.parseIntentChecks(BRIEF);
    assert.equal(parsed.error, null);
    assert.deepEqual(parsed.touches, ["components"]);
  });

  fs.rmSync(root, { recursive: true, force: true });
});
