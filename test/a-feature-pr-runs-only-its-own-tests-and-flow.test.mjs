// The stamped CI's pre-merge check (`verify --profile feature --base <ref>`):
// before a feature merges, ONLY that feature's unit/UI tests and its own
// Maestro flow — the app owner's CI policy, decided 2026-11-14, after one
// green PR run of the old template cost 877 s of lane on a real app.
//
// Contracts under test:
//   - a docs-only change scopes to NOTHING (`run: false`), which is what lets
//     the workflow skip the emulator job entirely;
//   - a feature change scopes its unit filter to the feature and its flows to
//     qa/e2e/<feature>.yaml — the approvals ledger, the spec and the golden
//     baseline it carries never widen the scope to "all";
//   - fail open, never fail silent: a broad change (DI, build files, the
//     harness) runs the WHOLE unit suite and says why; git that cannot answer
//     runs everything; a change naming no feature with a flow drives only the
//     smoke flow, never every flow (those are the nightly's);
//   - the feature receipt is refused as done-evidence and earns no rung;
//   - `--dry-run` answers the scope from a real git diff without running a step.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { changedSinceBase, deriveFeatureScope } from "../template/qa/lib/affected-tests.mjs";
import { affected as cmpAffected } from "../template/qa/lib/profiles/cmp/affected.mjs";
import { checkDoneEvidence } from "../template/qa/lib/receipt-validate.mjs";
import { gradeEvidence } from "../template/qa/lib/evidence-level.mjs";
import { installHarnessLib, TEMPLATE_QA } from "./helpers/harness-fixture.mjs";

const SRC = "composeApp/src/commonMain/kotlin/com/example/app";
const FLOWS = ["qa/e2e/orders.yaml", "qa/e2e/shipments.yaml", "qa/e2e/smoke.yaml"];
const scope = (paths) => deriveFeatureScope(paths, cmpAffected, { flows: FLOWS, smokeFlow: "qa/e2e/smoke.yaml" });

test("a docs-only change scopes to nothing — the CI runs no emulator job for it", () => {
  const s = scope(["README.md", "docs/handbook.md", "specs/shipments.spec.md", "qa/approvals.json", ".claude/settings.json", "qa/evidence/latest.json"]);
  assert.equal(s.run, false);
  assert.match(s.reason, /declared unable to affect a test/);
  assert.deepEqual(s.flows, []);
});

test("a feature change runs that feature's tests and its own flow — its ledger, spec and golden never widen it", () => {
  const s = scope([
    `${SRC}/presentation/shipments/ShipmentsScreen.kt`,
    `${SRC}/presentation/shipments/ShipmentsViewModel.kt`,
    "composeApp/src/desktopTest/kotlin/com/example/app/presentation/shipments/ShipmentsScreenTest.kt",
    "specs/shipments.spec.md",
    "qa/e2e/shipments.yaml",
    "qa/golden/shipments.json",
    "qa/approvals.json",
    "qa/evidence/latest.json",
    "qa/flight-recorder.jsonl",
  ]);
  assert.equal(s.run, true);
  assert.deepEqual(s.features, ["shipments"]);
  assert.deepEqual(s.unit, { mode: "filtered", patterns: ["*shipments*"] });
  assert.deepEqual(s.flows, ["qa/e2e/shipments.yaml"], "only its own flow — never orders.yaml, never every flow");
});

test("a broad change runs the WHOLE unit suite and says why, but still drives only the feature's flow", () => {
  const s = scope([`${SRC}/presentation/orders/OrdersScreen.kt`, `${SRC}/di/AppModule.kt`]);
  assert.equal(s.unit.mode, "all");
  assert.match(s.unit.reason, /DI rewires the object graph/);
  assert.deepEqual(s.flows, ["qa/e2e/orders.yaml"]);
  const build = scope(["gradle/libs.versions.toml"]);
  assert.match(build.unit.reason, /build files rewire compilation/);
  const harness = scope(["qa/lib/affected-tests.mjs"]);
  assert.match(harness.unit.reason, /qa\/ is the harness itself/);
  const ci = scope([".github/workflows/verify.yml"]);
  assert.equal(ci.run, true, "a CI change is not docs — it proves itself");
  assert.equal(ci.unit.mode, "all");
});

test("a change naming no feature with a flow drives the smoke flow only — the app still launches", () => {
  const s = scope([`${SRC}/domain/model/Order.kt`]);
  assert.deepEqual(s.features, []);
  assert.deepEqual(s.unit, { mode: "filtered", patterns: ["*model*"] });
  assert.deepEqual(s.flows, ["qa/e2e/smoke.yaml"]);
  assert.match(s.flowsReason, /smoke flow proves the app still launches/);
  const noSmoke = deriveFeatureScope([`${SRC}/domain/model/Order.kt`], cmpAffected, { flows: [], smokeFlow: "qa/e2e/smoke.yaml" });
  assert.deepEqual(noSmoke.flows, []);
});

test("an edited flow runs itself and scopes the unit tests to its feature", () => {
  const s = scope(["qa/e2e/orders.yaml"]);
  assert.deepEqual(s.flows, ["qa/e2e/orders.yaml"]);
  assert.deepEqual(s.unit, { mode: "filtered", patterns: ["*orders*"] });
});

test("fail open: git that cannot answer, or a profile without the mapping, runs everything and says so", () => {
  const unknown = scope(null);
  assert.equal(unknown.run, true);
  assert.equal(unknown.unit.mode, "all");
  assert.deepEqual(unknown.flows, FLOWS);
  assert.match(unknown.reason, /fail open/);
  const bare = deriveFeatureScope(["x.kt"], { broadImpact: () => null, patternsFor: () => ({ patterns: [] }) }, { flows: FLOWS });
  assert.equal(bare.unit.mode, "all");
  assert.match(bare.reason, /no feature-scope mapping/);
});

test("changedSinceBase diffs against the merge base and refuses a ref it cannot pass to git safely", () => {
  const calls = [];
  const runGit = (args) => {
    calls.push(args);
    return "a.kt\nb.md\n";
  };
  assert.deepEqual(changedSinceBase("/x", "HEAD^1", runGit), ["a.kt", "b.md"]);
  assert.deepEqual(calls, ["diff --name-only HEAD^1...HEAD"]);
  assert.equal(changedSinceBase("/x", "main; rm -rf /", runGit), null);
  assert.equal(changedSinceBase("/x", "origin/main", () => null), null);
});

test("a feature receipt is refused as done-evidence and earns no rung", () => {
  const refusal = checkDoneEvidence({ profile: "feature", stage: "feature", mode: "full", steps: [] });
  assert.equal(refusal.ok, false);
  assert.equal(refusal.refusal, "feature");
  const grade = gradeEvidence([{ name: "build", verdict: "PASS" }], "feature", { mode: "full" });
  assert.equal(grade.level, null);
  assert.match(grade.why, /feature profile/);
});

test("--dry-run answers the feature scope from a real branch diff, running nothing and writing no receipt", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "feature-scope-"));
  try {
    installHarnessLib(root);
    fs.copyFileSync(path.join(TEMPLATE_QA, "verify.mjs"), path.join(root, "qa", "verify.mjs"));
    fs.mkdirSync(path.join(root, "qa", "e2e"), { recursive: true });
    for (const f of FLOWS) fs.writeFileSync(path.join(root, f), "appId: com.example.app\n---\n- launchApp\n");
    const git = (...a) => execFileSync("git", a, { cwd: root, stdio: ["ignore", "pipe", "pipe"] }).toString();
    git("init", "-q", "-b", "main");
    git("-c", "user.email=t@t", "-c", "user.name=t", "add", "-A");
    git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base");
    git("checkout", "-qb", "feat/shipments");
    const kt = path.join(root, SRC, "presentation", "shipments", "ShipmentsScreen.kt");
    fs.mkdirSync(path.dirname(kt), { recursive: true });
    fs.writeFileSync(kt, "package com.example.app.presentation.shipments\n");
    git("-c", "user.email=t@t", "-c", "user.name=t", "add", "-A");
    git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "feature");

    const run = (...a) => spawnSync(process.execPath, ["qa/verify.mjs", ...a], { cwd: root, encoding: "utf8" });
    const r = run("--profile", "feature", "--base", "main", "--dry-run", "--json");
    assert.equal(r.status, 0, r.stderr);
    const plan = JSON.parse(r.stdout);
    assert.deepEqual(plan.steps, ["harnessIntegrity", "build", "unitTests", "e2eSmoke"]);
    assert.equal(plan.scope.run, true);
    assert.equal(plan.scope.base, "main");
    assert.deepEqual(plan.scope.unit.patterns, ["*shipments*"]);
    assert.deepEqual(plan.scope.flows, ["qa/e2e/shipments.yaml"]);
    assert.ok(!fs.existsSync(path.join(root, "qa", "evidence", "latest-feature.json")), "a dry run writes no receipt");

    fs.writeFileSync(path.join(root, "NOTES.md"), "docs\n");
    git("checkout", "-q", "main");
    git("checkout", "-qb", "docs/notes");
    git("-c", "user.email=t@t", "-c", "user.name=t", "add", "-A");
    git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "docs");
    const docs = JSON.parse(run("--profile", "feature", "--base", "main", "--dry-run", "--json").stdout);
    assert.equal(docs.scope.run, false, "a docs-only branch scopes to nothing");

    assert.equal(run("--profile", "ci", "--base", "main").status, 2, "--base belongs to the feature profile");
    assert.equal(run("--profile", "feature", "--fast").status, 2, "--fast would drop the flow the feature profile exists to run");

    // The nightly job's own command. The profile forces the determinism probe,
    // and the probe's guard refused every profile but ci/release — so
    // `--profile nightly` exited 2 on every run until a stamped app's CI ran it.
    const nightly = run("--profile", "nightly", "--dry-run", "--json");
    assert.equal(nightly.status, 0, `--profile nightly refused itself: ${nightly.stderr}`);
    assert.ok(JSON.parse(nightly.stdout).steps.includes("determinism"), "the nightly carries the determinism probe");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
