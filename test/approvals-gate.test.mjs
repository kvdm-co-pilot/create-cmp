// State-machine coverage for the hash-bound human-approval data model
// (VERIFICATION-LAYER-DESIGN.md §2, DoD §6.3): qa/lib/approvals.mjs (the
// registry/hashing/state/gate), qa/approve.mjs (the CLI), and the seeding this
// stamps into a fresh scaffold + into qa/scaffold-feature.mjs's stamped output.
//
// Scaffolds the REAL template with `verify: false` (mirrors
// test/stamped-feature-conformance.test.mjs / test/stamped-preview-registration.test.mjs)
// so these tests stay fast and gradle-free — no Android SDK/JDK dependency. The
// gate itself is exercised by importing qa/lib/approvals.mjs directly (pure
// Node, no subprocess) plus running the real CLIs via execFileSync where the
// point IS the CLI surface.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { scaffold } from "../src/scaffold.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function baseConfig(targetDir, overrides = {}) {
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
    ...overrides,
  };
}

async function makeProject(prefix, overrides = {}) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  await scaffold(baseConfig(out, overrides), { verify: false });
  return out;
}

async function loadLib(projectRoot) {
  // Cache-bust: Node ESM caches by resolved URL, and every temp project's
  // qa/lib/approvals.mjs lives at a DIFFERENT path, so no query param is
  // needed for isolation between tests — each makeProject() gets its own module.
  return import(pathToFileURL(path.join(projectRoot, "qa/lib/approvals.mjs")));
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

function runStamper(root, args) {
  return execFileSync(process.execPath, [path.join(root, "qa/scaffold-feature.mjs"), ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

// GENESIS-FLOW-DESIGN.md §1 REVISED order (spec-first behavior, UI-first
// visuals): intent(0), architecture(1), exemplar-spec(2), exemplar-feature(3),
// design-system(4), components(5) — six static artifacts on a fresh scaffold
// (feature-spec:<name> only appears once a feature is stamped).
const STATIC_IDS = ["intent", "architecture", "exemplar-spec", "exemplar-feature", "design-system", "components"];

test("fresh scaffold: all six static artifacts are unreviewed and the gate SKIPs", async () => {
  const out = await makeProject("cmp-appr-fresh-");
  try {
    const { evaluateApprovalsGate, listGovernedArtifacts } = await loadLib(out);

    const registry = listGovernedArtifacts(out);
    assert.deepEqual(
      registry.map((a) => a.id),
      STATIC_IDS,
      "fresh scaffold registers exactly the 6 static governed artifacts, in §1 order (no feature specs exist yet)",
    );

    const gate = evaluateApprovalsGate(out);
    assert.equal(gate.verdict, "SKIP", "unreviewed artifacts SKIP the gate, not FAIL");
    assert.match(gate.reason, /awaiting human approval/);
    for (const id of STATIC_IDS) {
      assert.match(gate.reason, new RegExp(`\\[${id}\\]`), `gate reason names ${id}`);
      const status = gate.statuses.find((s) => s.id === id);
      assert.equal(status.status, "unreviewed");
    }
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("approve via CLI moves one artifact to approved+match; others stay unreviewed; gate still SKIPs", async () => {
  const out = await makeProject("cmp-appr-partial-");
  try {
    const approveOut = runApprove(out, ["design-system"]);
    assert.match(approveOut, /approved design-system/);

    const { evaluateApprovalsGate } = await loadLib(out);
    const gate = evaluateApprovalsGate(out);
    assert.equal(gate.verdict, "SKIP", "the other 5 artifacts are still unreviewed");
    const ds = gate.statuses.find((s) => s.id === "design-system");
    assert.equal(ds.status, "approved");
    assert.equal(ds.storedHash, ds.hash);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("approving every governed artifact flips the gate to PASS", async () => {
  const out = await makeProject("cmp-appr-allpass-");
  try {
    for (const id of STATIC_IDS) runApprove(out, [id]);

    const { evaluateApprovalsGate } = await loadLib(out);
    const gate = evaluateApprovalsGate(out);
    assert.equal(gate.verdict, "PASS");
    assert.equal(gate.reason, undefined);
    assert.ok(gate.statuses.every((s) => s.status === "approved"));
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("mutating an approved artifact's file FAILs the gate, naming the artifact and the re-approval command", async () => {
  const out = await makeProject("cmp-appr-mutate-");
  try {
    for (const id of STATIC_IDS) runApprove(out, [id]);

    const themeFile = path.join(out, "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/theme/Theme.kt");
    fs.appendFileSync(themeFile, "\n// mutated after approval\n");

    const { evaluateApprovalsGate } = await loadLib(out);
    const gate = evaluateApprovalsGate(out);
    assert.equal(gate.verdict, "FAIL", "an approved artifact whose content changed FAILs, not SKIPs");
    assert.match(gate.reason, /\[design-system\]/);
    assert.match(gate.reason, /node qa\/approve\.mjs design-system/);
    const ds = gate.statuses.find((s) => s.id === "design-system");
    assert.equal(ds.status, "changed-since-approval");
    assert.notEqual(ds.storedHash, ds.hash);

    // Unrelated approved artifacts are unaffected.
    const arch = gate.statuses.find((s) => s.id === "architecture");
    assert.equal(arch.status, "approved");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("re-approving after a mutation clears the FAIL back to PASS", async () => {
  const out = await makeProject("cmp-appr-reapprove-");
  try {
    for (const id of STATIC_IDS) runApprove(out, [id]);
    const themeFile = path.join(out, "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/theme/Theme.kt");
    fs.appendFileSync(themeFile, "\n// mutated after approval\n");

    const { evaluateApprovalsGate } = await loadLib(out);
    assert.equal(evaluateApprovalsGate(out).verdict, "FAIL");

    runApprove(out, ["design-system"]);
    const gate = evaluateApprovalsGate(out);
    assert.equal(gate.verdict, "PASS", "re-approving the changed artifact restores PASS");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("approve.mjs on an unknown artifact errors and lists valid ids", async () => {
  const out = await makeProject("cmp-appr-unknown-");
  try {
    const { status, stderr } = runApproveExpectFail(out, ["not-a-real-artifact"]);
    assert.equal(status, 1);
    assert.match(stderr, /unknown artifact "not-a-real-artifact"/);
    for (const id of STATIC_IDS) assert.match(stderr, new RegExp(id));
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("approve.mjs --status lists every artifact with its live state and a short hash", async () => {
  const out = await makeProject("cmp-appr-status-");
  try {
    runApprove(out, ["architecture"]);
    const status = runApprove(out, ["--status"]);
    assert.match(status, /design-system: unreviewed/);
    assert.match(status, /architecture: approved/);
    // short hash form: 8 hex chars
    assert.match(status, /architecture: approved \([0-9a-f]{8}\)/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("qa/approvals.json absent is tolerated — treated as all-unreviewed, gate never crashes", async () => {
  const out = await makeProject("cmp-appr-absent-");
  try {
    fs.rmSync(path.join(out, "qa/approvals.json"));
    const { evaluateApprovalsGate } = await loadLib(out);
    const gate = evaluateApprovalsGate(out);
    assert.equal(gate.verdict, "SKIP");
    assert.ok(gate.statuses.every((s) => s.status === "unreviewed"));
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("qa/approvals.json corrupt (unparsable JSON) is tolerated — treated as all-unreviewed, gate never crashes", async () => {
  const out = await makeProject("cmp-appr-corrupt-");
  try {
    fs.writeFileSync(path.join(out, "qa/approvals.json"), "{ this is not json");
    const { evaluateApprovalsGate } = await loadLib(out);
    const gate = evaluateApprovalsGate(out);
    assert.equal(gate.verdict, "SKIP");
    assert.ok(gate.statuses.every((s) => s.status === "unreviewed"));
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("qa/approvals.json wrong shape (not {artifacts:[...]})  is tolerated", async () => {
  const out = await makeProject("cmp-appr-wrongshape-");
  try {
    fs.writeFileSync(path.join(out, "qa/approvals.json"), JSON.stringify({ nope: true }));
    const { evaluateApprovalsGate } = await loadLib(out);
    const gate = evaluateApprovalsGate(out);
    assert.equal(gate.verdict, "SKIP");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

// Break package resolution the way the raw template is broken: a namespace
// that is still a placeholder-shaped token (matches the lib's UNRESOLVED_TOKEN_RE).
// Every kotlin-rooted artifact then resolves to 0 files.
function breakPackageResolution(root) {
  const gradleFile = path.join(root, "composeApp/build.gradle.kts");
  const text = fs.readFileSync(gradleFile, "utf8");
  fs.writeFileSync(gradleFile, text.replace(/namespace\s*=\s*"[^"]+"/, 'namespace = "__PACKAGE_UNRESOLVED__"'));
}

test("vacuous approvals refused: approveArtifact rejects an artifact that resolves 0 files", async () => {
  const out = await makeProject("cmp-appr-vacuous-lib-");
  try {
    breakPackageResolution(out);
    const { approveArtifact } = await loadLib(out);

    // Unresolvable-package flavor (empty file list).
    const res = approveArtifact(out, "design-system");
    assert.equal(res.ok, false, "zero-file approval must be refused");
    assert.match(res.reason, /cannot approve "design-system"/);
    assert.match(res.reason, /package is not resolvable/);
    assert.match(res.reason, /raw template or a pre-stamp tree/);
    assert.match(res.reason, /only 0 file\(s\) resolved/);
    assert.match(res.reason, /vacuous/);

    // Partially-resolvable flavor: exemplar-feature still resolves its spec
    // file (1 of 11) — a PARTIAL approval is just as vacuous and must refuse.
    const partial = approveArtifact(out, "exemplar-feature");
    assert.equal(partial.ok, false, "partial (kotlin-unresolved) approval must be refused too");
    assert.match(partial.reason, /cannot approve "exemplar-feature"/);
    assert.match(partial.reason, /only 1 file\(s\) resolved/);
    assert.match(partial.reason, /vacuous/);

    // Nothing was written.
    const approvals = JSON.parse(fs.readFileSync(path.join(out, "qa/approvals.json"), "utf8"));
    const ds = approvals.artifacts.find((a) => a.artifact === "design-system");
    assert.equal(ds.status, "unreviewed", "refused approval leaves the seed record untouched");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("vacuous approvals refused: all-files-missing flavor names the expected files", async () => {
  const out = await makeProject("cmp-appr-vacuous-missing-");
  try {
    // Package resolves fine; delete BOTH design-system files so the artifact's
    // declared file list is non-empty but nothing is present on disk.
    const themeDir = path.join(out, "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/theme");
    fs.rmSync(path.join(themeDir, "Theme.kt"));
    fs.rmSync(path.join(themeDir, "Tokens.kt"));

    const { approveArtifact } = await loadLib(out);
    const res = approveArtifact(out, "design-system");
    assert.equal(res.ok, false);
    assert.match(res.reason, /it resolves to 0 files/);
    assert.match(res.reason, /expected files are all missing on disk/);
    assert.match(res.reason, /presentation\/theme\/Theme\.kt/);
    assert.match(res.reason, /presentation\/theme\/Tokens\.kt/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("approve CLI refuses to write approvals in a pre-stamp/raw-template-shaped tree (non-zero exit)", async () => {
  const out = await makeProject("cmp-appr-cli-prestamp-");
  try {
    breakPackageResolution(out);
    const before = fs.readFileSync(path.join(out, "qa/approvals.json"), "utf8");

    // Even a spec-file-only artifact (which genuinely resolves here) is refused
    // for WRITING: recording decisions into a template-shaped tree pollutes it.
    const { status, stderr } = runApproveExpectFail(out, ["architecture"]);
    assert.equal(status, 1);
    assert.match(stderr, /package is not resolvable/);
    assert.match(stderr, /raw template or a pre-stamp tree/);
    assert.match(stderr, /refusing to write qa\/approvals\.json/);

    assert.equal(fs.readFileSync(path.join(out, "qa/approvals.json"), "utf8"), before, "approvals.json untouched");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("--status marks zero-file artifacts unresolvable and never shows the empty-input hash as approvable", async () => {
  const out = await makeProject("cmp-appr-status-unres-");
  try {
    breakPackageResolution(out);
    const status = runApprove(out, ["--status"]);
    assert.match(status, /design-system: unreviewed \(unresolvable \(0 of expected files resolved\) — not approvable\)/);
    // exemplar-feature still resolves its spec file (1 of 11) — partial is
    // marked unresolvable too, never shown with a would-approve hash.
    assert.match(status, /exemplar-feature: unreviewed \(unresolvable \(1 of expected files resolved\) — not approvable\)/);
    // sha256("")'s short form must never be displayed as a would-approve hash.
    assert.ok(!status.includes("e3b0c442"), "empty-input hash never displayed");
    // Spec-file-only artifacts still resolve and still show a real would-approve hash.
    assert.match(status, /architecture: unreviewed \(would approve at [0-9a-f]{8}\)/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("approved artifact whose files are then deleted -> gate FAIL (changed-since-approval), never PASS or silent SKIP", async () => {
  const out = await makeProject("cmp-appr-deleted-");
  try {
    for (const id of STATIC_IDS) runApprove(out, [id]);

    // Delete the exemplar spec: exemplar-spec now resolves 0 files.
    fs.rmSync(path.join(out, "specs/home.spec.md"));

    const { evaluateApprovalsGate } = await loadLib(out);
    const gate = evaluateApprovalsGate(out);
    assert.equal(gate.verdict, "FAIL", "vanished files after approval must FAIL the gate");
    const spec = gate.statuses.find((s) => s.id === "exemplar-spec");
    assert.equal(spec.status, "changed-since-approval");
    assert.equal(spec.fileCount, 0);
    assert.equal(spec.resolvable, false);
    assert.match(gate.reason, /\[exemplar-spec\]/);
    assert.match(gate.reason, /files no longer fully resolve \(0 present/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("legacy/hand-written vacuous approval (stored empty-input hash, 0 files) reads as FAIL, never PASS", async () => {
  const out = await makeProject("cmp-appr-legacy-vacuous-");
  try {
    breakPackageResolution(out);
    // sha256 of zero update() calls — what a pre-fix approval over 0 files recorded.
    const EMPTY_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    fs.writeFileSync(
      path.join(out, "qa/approvals.json"),
      JSON.stringify(
        {
          schema: "cmp-approvals/1",
          artifacts: [{ artifact: "design-system", status: "approved", hash: EMPTY_HASH, approvedAt: new Date().toISOString() }],
        },
        null,
        2,
      ),
    );

    const { evaluateApprovalsGate } = await loadLib(out);
    const gate = evaluateApprovalsGate(out);
    // The stored hash MATCHES the recompute (both empty-input) — without the
    // zero-file rule this would be a silent vacuous PASS. It must be FAIL.
    assert.equal(gate.verdict, "FAIL");
    const ds = gate.statuses.find((s) => s.id === "design-system");
    assert.equal(ds.status, "changed-since-approval");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("add-feature seeds the new feature's spec as unreviewed and prints the approval reminder", async () => {
  const out = await makeProject("cmp-appr-stamp-");
  try {
    const stdout = runStamper(out, ["Favorites"]);
    assert.match(stdout, /Approval: specs\/favorites\.spec\.md is unreviewed/);
    assert.match(stdout, /node qa\/approve\.mjs feature-spec:favorites/);

    const approvals = JSON.parse(fs.readFileSync(path.join(out, "qa/approvals.json"), "utf8"));
    const entry = approvals.artifacts.find((a) => a.artifact === "feature-spec:favorites");
    assert.ok(entry, "feature-spec:favorites was seeded into qa/approvals.json");
    assert.equal(entry.status, "unreviewed");
    assert.equal(entry.hash, null);

    const { listGovernedArtifacts, evaluateApprovalsGate } = await loadLib(out);
    const registry = listGovernedArtifacts(out);
    assert.ok(registry.some((a) => a.id === "feature-spec:favorites"), "registry dynamically picks up the new spec");

    const gate = evaluateApprovalsGate(out);
    assert.match(gate.reason, /\[feature-spec:favorites\]/);

    runApprove(out, ["feature-spec:favorites"]);
    const gate2 = evaluateApprovalsGate(out);
    const entry2 = gate2.statuses.find((s) => s.id === "feature-spec:favorites");
    assert.equal(entry2.status, "approved");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("stamper does not refuse to stamp when qa/lib/approvals.mjs is missing (v1 never blocks the stamp)", async () => {
  const out = await makeProject("cmp-appr-stamp-nolib-");
  try {
    fs.rmSync(path.join(out, "qa/lib/approvals.mjs"));
    const stdout = runStamper(out, ["Favorites"]);
    assert.match(stdout, /Scaffolded feature "Favorites"/);
    assert.match(stdout, /approvals seeding skipped/);
    // The feature itself still stamped fully despite the missing approvals lib.
    assert.ok(
      fs.existsSync(path.join(out, "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/favorites/FavoritesScreen.kt")),
    );
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("verify.mjs registers the approvals step in the scaffold and local (and therefore ci) profiles", async () => {
  const out = await makeProject("cmp-appr-wiring-");
  try {
    const text = fs.readFileSync(path.join(out, "qa/verify.mjs"), "utf8");
    assert.match(text, /import \{ evaluateApprovalsGate, evaluateIntentChecksGate \} from "\.\/lib\/approvals\.mjs";/);
    assert.match(text, /function stepApprovals\(\)/);
    assert.match(text, /function stepIntentChecks\(\)/);

    const scaffoldArrayMatch = text.match(/scaffold:\s*\[([^\]]*)\]/);
    const localArrayMatch = text.match(/local:\s*\[([^\]]*)\]/);
    assert.ok(scaffoldArrayMatch, "scaffold profile array found");
    assert.ok(localArrayMatch, "local profile array found");
    assert.match(scaffoldArrayMatch[1], /stepApprovals/, "approvals step registered in scaffold profile");
    assert.match(localArrayMatch[1], /stepApprovals/, "approvals step registered in local profile");
    assert.match(text, /stepsForProfile\.ci\s*=\s*stepsForProfile\.local/, "ci profile inherits local (and therefore approvals)");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("Stop-hook composition: an approvals FAIL fails the lane verdict, and receipt-check.mjs --hook blocks over it", async () => {
  const out = await makeProject("cmp-appr-hook-fail-");
  try {
    // Simulate what qa/verify.mjs would write if the `approvals` step FAILed
    // (a real gate FAIL, hand-placed here so this test stays gradle-free —
    // the FAIL itself is proven for real by the gate tests above). The point
    // of THIS test is the composition: receipt.verdict FAIL -> Stop hook blocks,
    // with no separate approvals-aware code in receipt-check.mjs.
    const receipt = {
      schema: "cmp-evidence/1",
      profile: "local",
      verdict: "FAIL",
      commit: { sha: null, dirty: [] },
      inputs: { hash: "0".repeat(64), fileCount: 0 },
      steps: [
        { name: "specCoverage", verdict: "PASS", durationMs: 1 },
        { name: "approvals", verdict: "FAIL", reason: "Approval invalidated — a governed artifact changed after sign-off:\n  [design-system] ... Re-approve: node qa/approve.mjs design-system", durationMs: 1 },
      ],
      artifacts: [],
      toolVersions: { node: process.version, platform: `${process.platform}-${process.arch}` },
      generatedAt: new Date().toISOString(),
    };
    fs.mkdirSync(path.join(out, "qa/evidence"), { recursive: true });
    fs.writeFileSync(path.join(out, "qa/evidence/latest.json"), JSON.stringify(receipt, null, 2));

    try {
      execFileSync(process.execPath, [path.join(out, "qa/receipt-check.mjs"), "--hook"], {
        cwd: out,
        input: "{}",
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      assert.fail("expected the Stop hook to block (exit 2) over an approvals FAIL");
    } catch (err) {
      assert.equal(err.status, 2, "Stop-hook protocol: INVALID -> exit 2");
      assert.match(err.stderr, /Not done:/);
      assert.match(err.stderr, /FAIL/);
    }
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("Stop-hook composition: a genuinely valid receipt (approvals PASS included) does not block", async () => {
  const out = await makeProject("cmp-appr-hook-pass-");
  try {
    for (const id of STATIC_IDS) runApprove(out, [id]);

    const { computeInputsHash } = await import(pathToFileURL(path.join(out, "qa/lib/inputs-hash.mjs")));
    const inputs = computeInputsHash(out);

    const receipt = {
      schema: "cmp-evidence/1",
      profile: "local",
      verdict: "PASS",
      commit: { sha: null, dirty: [] },
      inputs: { hash: inputs.hash, fileCount: inputs.fileCount },
      steps: [
        { name: "specCoverage", verdict: "PASS", durationMs: 1 },
        { name: "approvals", verdict: "PASS", durationMs: 1 },
      ],
      artifacts: [],
      toolVersions: { node: process.version, platform: `${process.platform}-${process.arch}` },
      generatedAt: new Date().toISOString(),
    };
    fs.mkdirSync(path.join(out, "qa/evidence"), { recursive: true });
    fs.writeFileSync(path.join(out, "qa/evidence/latest.json"), JSON.stringify(receipt, null, 2));

    const stdout = execFileSync(process.execPath, [path.join(out, "qa/receipt-check.mjs"), "--hook"], {
      cwd: out,
      input: "{}",
      encoding: "utf8",
    });
    assert.equal(stdout, "", "valid receipt: Stop hook is silent and exits 0");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});
