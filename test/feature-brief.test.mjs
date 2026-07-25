// The feature walk's state machine (CHANGE-FLOW-DESIGN.md): feature briefs
// (docs/features/*.md — LOCATION is the governance opt-in) as governed
// `feature-brief:<name>` artifacts, DERIVED doneness (clauses cited + receipt
// PASS + receipt attests the tree — never claimed), acceptance refused until
// the derivation holds, and the per-feature board's declared-vs-actual blast
// radius.
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

const BRIEF = `# Meal logging — feature brief

The decisions and their why live here as prose (the day boundary is a
configurable dayStartHour, default 04:00 — not midnight, because late loggers).

\`\`\`json cmp:feature
{ "touches": ["components"] }
\`\`\`
`;

test("feature briefs: location opt-in, derived doneness, acceptance, board", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-feature-brief-"));
  await scaffold(baseConfig(root), { verify: false });
  const lib = await import(pathToFileURL(path.join(root, "qa/lib/approvals.mjs")));
  const briefLib = await import(pathToFileURL(path.join(root, "qa/lib/feature-brief.mjs")));
  const { computeInputsHash } = await import(pathToFileURL(path.join(root, "qa/lib/inputs-hash.mjs")));

  const featuresDir = path.join(root, "docs/features");
  fs.mkdirSync(featuresDir, { recursive: true });
  fs.writeFileSync(path.join(featuresDir, "meal.md"), BRIEF);
  fs.mkdirSync(path.join(root, "docs/proposals"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs/proposals/harness-notes.md"), "# Notes\n\nproposals stay ungoverned.\n");

  const receiptPath = path.join(root, "qa/evidence/latest.json");
  const writeReceipt = (verdict, hash) => {
    fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
    fs.writeFileSync(receiptPath, JSON.stringify({ verdict, inputs: { hash } }, null, 2));
  };

  await t.test("location is the opt-in: docs/features governed, docs/proposals not; briefs sit directly after intent", () => {
    const ids = lib.listGovernedArtifacts(root).map((a) => a.id);
    assert.ok(ids.includes("feature-brief:meal"), `expected feature-brief:meal in ${ids}`);
    assert.ok(!ids.some((id) => id.includes("harness-notes")), "docs/proposals must never be governed");
    // Decide-first: the brief is the layer after intent (CHANGE-FLOW-DESIGN.md
    // §6) — it speaks intent's vocabulary; only the spec needs architecture's.
    assert.equal(ids[0], "intent");
    assert.equal(ids[1], "feature-brief:meal");
    assert.equal(ids[2], "architecture");
  });

  await t.test("acceptance refuses an unsigned brief; the walk is sign-first", () => {
    const res = lib.acceptFeature(root, "meal");
    assert.equal(res.ok, false);
    assert.match(res.reason, /"unreviewed", not "approved"/);
    const cli = runApproveExpectFail(root, ["--accept", "meal"]);
    assert.match(cli.stderr, /not "approved"/);
  });

  await t.test("doneness derives honestly at every stage — and acceptance quotes the gap", () => {
    runApprove(root, ["feature-brief:meal"]);

    // No spec yet.
    let res = lib.acceptFeature(root, "meal");
    assert.equal(res.ok, false);
    assert.match(res.reason, /not provenDone: no spec yet \(specs\/meal\.spec\.md\)/);

    // Spec with live clauses, none cited.
    fs.writeFileSync(path.join(root, "specs/meal.spec.md"), "# meal\n\n- **MEAL-01** — Given…\n- **MEAL-02** — Given…\n");
    res = lib.acceptFeature(root, "meal");
    assert.equal(res.ok, false);
    assert.match(res.reason, /0\/2 clauses cited — 2 promise\(s\) have no citing test/);

    // Clauses cited, but no receipt.
    const testDir = path.join(root, "composeApp/src/commonTest/kotlin/com/acme/demo");
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, "MealTest.kt"), "// SPEC: MEAL-01, MEAL-02\nclass MealTest\n");
    res = lib.acceptFeature(root, "meal");
    assert.equal(res.ok, false);
    assert.match(res.reason, /no receipt — run node qa\/verify\.mjs/);

    // A FAIL receipt proves nothing.
    writeReceipt("FAIL", computeInputsHash(root).hash);
    res = lib.acceptFeature(root, "meal");
    assert.equal(res.ok, false);
    assert.match(res.reason, /latest receipt is FAIL/);

    // A PASS receipt from a DIFFERENT tree attests nothing here.
    writeReceipt("PASS", "0".repeat(64));
    res = lib.acceptFeature(root, "meal");
    assert.equal(res.ok, false);
    assert.match(res.reason, /attests an older tree/);
  });

  await t.test("provenDone flips only when every conjunct holds; acceptance then succeeds", () => {
    writeReceipt("PASS", computeInputsHash(root).hash);
    const derived = briefLib.deriveFeatureStatus(root, { name: "meal", rel: "docs/features/meal.md" });
    assert.equal(derived.provenDone, true);
    assert.match(derived.doneReason, /2\/2 clauses cited · receipt PASS · attests this tree/);

    const board = lib.getFeatureBoard(root);
    assert.equal(board.features.find((f) => f.name === "meal").phase, "proven");

    const out = runApprove(root, ["--accept", "meal"]);
    assert.match(out, /accepted feature-brief:meal/);
    const row = lib.getApprovalStatuses(root).find((s) => s.id === "feature-brief:meal");
    assert.equal(row.accepted, true);
    assert.equal(lib.getFeatureBoard(root).features.find((f) => f.name === "meal").phase, "accepted");
  });

  await t.test("--status prints the same derived doneReason the board carries — honestly stale after the acceptance write", () => {
    const out = runApprove(root, ["--status"]);
    assert.match(out, /Features \(doneness is derived, never claimed\):/);
    // The acceptance itself wrote qa/approvals.json — part of the verified
    // surface — so the receipt no longer attests the tree, and --status says
    // exactly that instead of parroting the pre-acceptance green.
    assert.match(out, /meal: all clauses cited and receipt PASS, but it attests an older tree/);
    assert.match(out, /accepted /);
  });

  await t.test("editing the signed brief after acceptance is drift", () => {
    fs.appendFileSync(path.join(featuresDir, "meal.md"), "\nsneaky post-signature edit\n");
    const row = lib.getApprovalStatuses(root).find((s) => s.id === "feature-brief:meal");
    assert.equal(row.status, "changed-since-approval");
    assert.equal(lib.evaluateApprovalsGate(root).verdict, "FAIL");
    assert.equal(lib.getFeatureBoard(root).features.find((f) => f.name === "meal").phase, "changed-since-approval");
    // restore for the board tests below
    fs.writeFileSync(path.join(featuresDir, "meal.md"), BRIEF);
    assert.equal(lib.getApprovalStatuses(root).find((s) => s.id === "feature-brief:meal").status, "approved");
  });

  await t.test("a malformed cmp:feature block surfaces as blockError — a doc that tried to declare and failed must say so", () => {
    fs.writeFileSync(path.join(featuresDir, "broken.md"), "# broken\n\n```json cmp:feature\n{ not json\n```\n");
    const card = lib.getFeatureBoard(root).features.find((f) => f.name === "broken");
    assert.match(card.blockError, /not valid JSON/);
    assert.deepEqual(card.touches, []);
    fs.rmSync(path.join(featuresDir, "broken.md"));
  });

  await t.test("board: declared drift reads as planned; undeclared drift is called out", () => {
    // A fresh OPEN brief declares touching components (the accepted meal brief
    // no longer covers anything — its card is closed history).
    fs.writeFileSync(path.join(featuresDir, "tray.md"), '# tray\n\n```json cmp:feature\n{ "touches": ["components"] }\n```\n');
    runApprove(root, ["feature-brief:tray"]);
    // components drifts, and tray DECLARES touching it -> not undeclared.
    runApprove(root, ["components"]);
    const componentsDir = path.join(root, "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/components");
    const someComponent = fs.readdirSync(componentsDir).find((f) => f.endsWith(".kt"));
    fs.appendFileSync(path.join(componentsDir, someComponent), "\n// drift\n");
    // design-system drifts and NOTHING declares it -> undeclared.
    runApprove(root, ["design-system"]);
    fs.appendFileSync(path.join(root, "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/theme/Tokens.kt"), "\n// drift\n");

    const board = lib.getFeatureBoard(root);
    const card = board.features.find((f) => f.name === "tray");
    assert.deepEqual(
      card.touches.map((x) => [x.id, x.status]),
      [["components", "changed-since-approval"]],
    );
    const undeclaredIds = board.undeclared.map((u) => u.id);
    assert.ok(undeclaredIds.includes("design-system"), `design-system should be undeclared blast, got ${undeclaredIds}`);
    assert.ok(!undeclaredIds.includes("components"), "declared blast must never read as undeclared");
    fs.rmSync(path.join(featuresDir, "tray.md"));
  });

  await t.test("via is recorded; a fresh signature clears the old acceptance", () => {
    const res = lib.approveArtifact(root, "feature-brief:meal", { via: "console" });
    assert.equal(res.ok, true);
    const raw = JSON.parse(fs.readFileSync(path.join(root, "qa/approvals.json"), "utf8"));
    const row = raw.artifacts.find((a) => a.artifact === "feature-brief:meal");
    assert.equal(row.via, "console");
    assert.equal(row.accepted, undefined);
  });

  await t.test("the deliver/checks machinery is really gone — doneness has ONE definition", () => {
    assert.ok(!fs.existsSync(path.join(root, "qa/lib/intent-checks.mjs")), "intent-checks.mjs must not be stamped");
    const verify = fs.readFileSync(path.join(root, "qa/verify.mjs"), "utf8");
    assert.ok(!verify.includes("intentChecks"), "the lane must not carry an intentChecks step");
    const cli = runApproveExpectFail(root, ["--deliver", "meal"]);
    assert.match(cli.stderr, /unknown artifact "--deliver"/);
    // ...and the lane's coverage scan IS the doneness scan (same module).
    assert.match(verify, /from "\.\/lib\/spec-coverage\.mjs"/);
  });

  fs.rmSync(root, { recursive: true, force: true });
});
