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

// S8b: the lane is TWO files now — qa/verify.mjs (the spine) and
// qa/lib/steps-cmp.mjs (the step pack). A structural read of "the lane's
// source" must see both, or it pins a file that no longer holds the steps.
const laneSrc = (dir) =>
  `${fs.readFileSync(path.join(dir, "qa/verify.mjs"), "utf8")}\n${fs.readFileSync(path.join(dir, "qa/lib/steps-cmp.mjs"), "utf8")}`;


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
  return execFileSync(process.execPath, [path.join(root, "qa/approve.mjs"), ...args, "--as", "Test Signer <test@example.com>"], {
    cwd: root,
    encoding: "utf8",
  });
}

function runApproveExpectFail(root, args) {
  try {
    execFileSync(process.execPath, [path.join(root, "qa/approve.mjs"), ...args, "--as", "Test Signer <test@example.com>"], {
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

  await t.test("the derived next step walks the loop — owner-labelled, never claimed", () => {
    const next = () => lib.getFeatureBoard(root).features.find((f) => f.name === "meal").nextStep;
    // Unsigned brief: the human's signature is the next step.
    assert.equal(next().key, "sign-brief");
    assert.equal(next().owner, "human");
  });

  await t.test("doneness derives honestly at every stage — and acceptance quotes the gap", () => {
    runApprove(root, ["feature-brief:meal"]);
    const next = () => lib.getFeatureBoard(root).features.find((f) => f.name === "meal").nextStep;

    // No spec yet.
    let res = lib.acceptFeature(root, "meal");
    assert.equal(res.ok, false);
    assert.match(res.reason, /not provenDone: no spec yet \(specs\/meal\.spec\.md\)/);
    // Signed brief + no spec → the contract step, drafted by the agent for
    // the human's signature.
    assert.equal(next().key, "contract");
    assert.match(next().label, /write the clauses in specs\/meal\.spec\.md/);
    assert.equal(next().owner, "agent drafts → human signs");

    // Spec with live clauses, none cited.
    fs.writeFileSync(path.join(root, "specs/meal.spec.md"), "# meal\n\n- **MEAL-01** — Given…\n- **MEAL-02** — Given…\n");
    res = lib.acceptFeature(root, "meal");
    assert.equal(res.ok, false);
    assert.match(res.reason, /0\/2 clauses cited — 2 promise\(s\) have no citing test/);
    // The spec now exists but is unsigned — the contract needs the signature.
    assert.equal(next().key, "sign-spec");
    assert.equal(next().owner, "human");
    // Sign it; the walk moves to build & cite.
    runApprove(root, ["feature-spec:meal"]);
    assert.equal(next().key, "build");
    assert.match(next().label, /2 clause\(s\) have no citing test yet/);

    // Clauses cited, but no receipt.
    const testDir = path.join(root, "composeApp/src/commonTest/kotlin/com/acme/demo");
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, "MealTest.kt"), "// SPEC: MEAL-01, MEAL-02\nclass MealTest\n");
    res = lib.acceptFeature(root, "meal");
    assert.equal(res.ok, false);
    assert.match(res.reason, /no receipt — run node qa\/verify\.mjs/);
    assert.equal(next().key, "prove");

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
    const card = board.features.find((f) => f.name === "meal");
    assert.equal(card.phase, "proven");
    assert.equal(card.nextStep.key, "accept");
    assert.equal(card.nextStep.owner, "human");

    const out = runApprove(root, ["--accept", "meal"]);
    assert.match(out, /accepted feature-brief:meal/);
    const row = lib.getApprovalStatuses(root).find((s) => s.id === "feature-brief:meal");
    assert.equal(row.accepted, true);
    const after = lib.getFeatureBoard(root).features.find((f) => f.name === "meal");
    assert.equal(after.phase, "accepted");
    assert.equal(after.nextStep.key, "closed");
  });

  await t.test("a change to EXISTING features: the contract step names the declared amendments", () => {
    // A new brief declaring blast into meal's SIGNED contract — the derived
    // contract step must say that contract will be reopened & amended, by
    // name; that is what the human's signature on this brief sets in motion.
    fs.writeFileSync(
      path.join(featuresDir, "planner.md"),
      '# planner\n\n## Decisions\n\n- weeks start Monday.\n\n```json cmp:feature\n{ "touches": ["feature-spec:meal"] }\n```\n',
    );
    runApprove(root, ["feature-brief:planner"]);
    const card = lib.getFeatureBoard(root).features.find((f) => f.name === "planner");
    assert.equal(card.nextStep.key, "contract");
    assert.match(card.nextStep.label, /reopen & amend specs\/meal\.spec\.md \(declared\)/);
    // The signed substance travels with the board — sections, decisions included.
    assert.ok(card.sections.some((s) => /decisions/i.test(s.heading)), "sections carry the decisions heading");
    fs.rmSync(path.join(featuresDir, "planner.md"));
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
    const res = lib.approveArtifact(root, "feature-brief:meal", { approvedBy: "Test Signer <test@example.com>", via: "console" });
    assert.equal(res.ok, true);
    const raw = JSON.parse(fs.readFileSync(path.join(root, "qa/approvals.json"), "utf8"));
    const row = raw.artifacts.find((a) => a.artifact === "feature-brief:meal");
    assert.equal(row.via, "console");
    assert.equal(row.accepted, undefined);
  });

  await t.test("the audit rung: no signature is requested until the design has been attacked", () => {
    // Regression for the churn measured on meal-plan (2026-07-27): brief signed,
    // design signed, spec signed — and only THEN an edge-case audit that found
    // nine gaps, three of them defects in already-signed clauses. Three signing
    // rounds for one feature. The audit was always going to happen; the ladder
    // just never placed it, so it happened last. Now it is a rung.
    fs.writeFileSync(
      path.join(featuresDir, "checkout.md"),
      '# checkout\n\n## Decisions\n\n- one page.\n\n```json cmp:feature\n{ "touches": [], "screens": true }\n```\n',
    );
    const dir = path.join(root, "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/checkout");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "CheckoutScreen.kt"), "// stub-data draft\nclass CheckoutScreen\n");
    const next = () => lib.getFeatureBoard(root).features.find((f) => f.name === "checkout").nextStep;

    // Rendered, unaudited, NOTHING signed: the rung is the audit, owned by the
    // agent — the human is not asked for anything yet.
    assert.equal(next().key, "audit");
    assert.equal(next().owner, "agent");

    // A token gesture does not satisfy it: two cases still read as unaudited.
    fs.appendFileSync(path.join(featuresDir, "checkout.md"), "\n## Edge cases\n\n- empty cart → CHK-02\n- card declined → CHK-05\n");
    assert.equal(next().key, "audit");

    // A real pass does. The count cannot judge QUALITY — what it enforces is
    // that the pass happened and left written output BEFORE the gate.
    fs.appendFileSync(path.join(featuresDir, "checkout.md"), "- back button mid-payment → out of scope for v1\n");
    assert.equal(lib.getFeatureBoard(root).features.find((f) => f.name === "checkout").edgeCases, 3);
    assert.equal(next().key, "sign-brief");
    assert.equal(next().owner, "human");

    // And the audit's findings were recorded while the brief was UNSIGNED, so
    // signing it now does not immediately reopen it — the churn is gone.
    runApprove(root, ["feature-brief:checkout"]);
    assert.equal(lib.getApprovalStatuses(root).find((a) => a.id === "feature-brief:checkout").status, "approved");
    assert.equal(next().key, "sign-design");
  });

  await t.test("the design gate: brief → design → spec → build, signed on rendered output", () => {
    // A feature with NO ui surface carries no design rung at all — the honest skip.
    assert.equal(lib.getFeatureBoard(root).features.find((f) => f.name === "meal").design, null);

    // A brief DECLARING a screens surface holds the gate before any file exists.
    fs.writeFileSync(
      path.join(featuresDir, "wizard.md"),
      '# wizard\n\n## Decisions\n\n- three steps, no skip.\n\n```json cmp:feature\n{ "touches": [], "screens": true }\n```\n',
    );
    const registry = lib.listGovernedArtifacts(root);
    const design = registry.find((a) => a.id === "feature-design:wizard");
    assert.ok(design, "screens:true must create the design artifact before any screen file exists");
    assert.deepEqual(design.files, []);
    assert.equal(design.complete, false);
    // Definition order: design sits after components, before the feature specs.
    const ids = registry.map((a) => a.id);
    assert.ok(ids.indexOf("feature-design:wizard") > ids.indexOf("components"));
    assert.ok(ids.indexOf("feature-design:wizard") < ids.indexOf("feature-spec:meal"));

    // Nothing rendered → nothing signable: the refusal is the point.
    assert.equal(lib.approveArtifact(root, "feature-design:wizard", { approvedBy: "Test Signer <test@example.com>" }).ok, false);

    // Unsigned brief + undrafted design → the DESIGN rung, agent-owned. The
    // ladder asks for no signature yet: drafting and auditing come first, so the
    // human signs once, at the end, rather than signing and then being asked
    // again for every finding.
    const next = () => lib.getFeatureBoard(root).features.find((f) => f.name === "wizard").nextStep;
    assert.equal(next().key, "design");
    assert.equal(next().owner, "agent drafts → human signs");
    assert.match(next().label, /you sign what renders/);

    // Screens land: the artifact binds ONLY *Screen.kt — a ViewModel edit
    // during a legitimate build must never read as design drift.
    const wizardDir = path.join(root, "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/wizard");
    fs.mkdirSync(wizardDir, { recursive: true });
    fs.writeFileSync(path.join(wizardDir, "WizardScreen.kt"), "// stub-data draft\nclass WizardScreen\n");
    fs.writeFileSync(path.join(wizardDir, "WizardViewModel.kt"), "class WizardViewModel\n");
    const resolved = lib.listGovernedArtifacts(root).find((a) => a.id === "feature-design:wizard");
    assert.equal(resolved.files.length, 1);
    assert.match(resolved.files[0], /WizardScreen\.kt$/);

    // Rendered but UNAUDITED: the ladder still refuses to ask for a signature.
    assert.equal(next().key, "audit");
    assert.equal(next().owner, "agent");
    assert.match(next().label, /Findings land BEFORE the signature/);

    // The audit runs and records what it found — into the brief, while the brief
    // is still unsigned, which is the whole point of the ordering.
    fs.appendFileSync(
      path.join(featuresDir, "wizard.md"),
      "\n## Edge cases\n\n- back mid-wizard → step state survives (decision 4)\n" +
        "- no network on step 3 → queued, retried (WIZ-07)\n" +
        "- resumed after kill → out of scope for v1\n",
    );
    assert.equal(next().key, "sign-brief");
    assert.equal(next().owner, "human");

    // Only now, brief signed, is the design signable.
    runApprove(root, ["feature-brief:wizard"]);
    assert.equal(next().key, "sign-design");
    assert.equal(next().owner, "human");
    assert.match(next().label, /audited/);

    // The human signs; the walk moves on to the behavior contract.
    runApprove(root, ["feature-design:wizard"]);
    assert.equal(next().key, "contract");

    // A post-signature screen edit is drift, and the rung says re-approve.
    fs.appendFileSync(path.join(wizardDir, "WizardScreen.kt"), "// drift\n");
    assert.equal(lib.getApprovalStatuses(root).find((s) => s.id === "feature-design:wizard").status, "changed-since-approval");
    assert.equal(next().key, "sign-design");
    assert.match(next().label, /re-approve the design/);

    // Acceptance refuses past an unsigned/drifted design — form is part of
    // "the proven thing is what I wanted". Signature refusals outrank the
    // doneness derivation, so this fires without building wizard to green.
    const res = lib.acceptFeature(root, "wizard");
    assert.equal(res.ok, false);
    assert.match(res.reason, /feature-design:wizard is "changed-since-approval"/);

    fs.rmSync(path.join(featuresDir, "wizard.md"));
    fs.rmSync(wizardDir, { recursive: true, force: true });
  });

  await t.test("the deliver/checks machinery is really gone — doneness has ONE definition", () => {
    assert.ok(!fs.existsSync(path.join(root, "qa/lib/intent-checks.mjs")), "intent-checks.mjs must not be stamped");
    const verify = laneSrc(root);
    assert.ok(!verify.includes("intentChecks"), "the lane must not carry an intentChecks step");
    const cli = runApproveExpectFail(root, ["--deliver", "meal"]);
    assert.match(cli.stderr, /unknown artifact "--deliver"/);
    // ...and the lane's coverage scan IS the doneness scan (same module).
    assert.match(verify, /from "\.\/(?:lib\/)?spec-coverage\.mjs"/);
  });

  fs.rmSync(root, { recursive: true, force: true });
});
