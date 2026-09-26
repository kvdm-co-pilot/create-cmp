// THE NOTARY REFUSES WHAT THE DONE-CHECK REFUSES — a differential test (KD-266).
//
// The harness's done-check (qa/receipt-check.mjs, the Stop hook) refused six
// receipt shapes before it ever called prooflane-receipts, and the library
// carried none of them, so a hosted validator calling only the library said
// "valid" to receipts the harness itself will not accept as proof of done.
//
// This test does not restate the rules. For each planted receipt it ASKS the
// harness's own reader (`--json`, in a governed cmp-profile tree) and asks the
// library, and requires that they AGREE: the library's done-evidence refusal
// is the harness's reason word for word, and the hosted composite
// (validateReceiptForTree — what Gatekeeper's validateCommit calls) says
// "invalid" wherever the harness does. The control rows prove the reader ran.
//
// Two rows pin what must NOT be refused: tokenDrift's unlabelled SKIP (KD-5 —
// emitted on every headless L2 run) and a structure SKIP. And the legacy
// reason-text fallback is the profile's, so the library applies it only when
// its caller hands the lists over, as the harness does and Gatekeeper cannot.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { computeInputsHash } from "../packages/harness/src/lib/inputs-hash.mjs";
import { checkDoneEvidence, validateReceiptForTree } from "../packages/receipts/src/index.mjs";
import { CMP_LADDER, legacySkipReasons } from "../packages/harness/src/lib/profiles/cmp/ladder.mjs";
import { installHarnessLib } from "./helpers/harness-fixture.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOOK_SRC = path.join(REPO_ROOT, "packages", "harness", "src", "receipt-check.mjs");
const CMP_LEGACY = { names: [...CMP_LADDER.l2Execution], reasons: [...legacySkipReasons] };

const TOKEN_DRIFT_UNLABELLED = {
  name: "tokenDrift",
  verdict: "SKIP",
  reason: "inspector endpoint not reachable on :9500 (debug app not running?) — launch the debug build to enable the live tier",
  durationMs: 3,
};

function judgeBoth(edit) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "notary-done-check-")));
  const write = (rel, text) => {
    const abs = path.join(root, ...rel.split("/"));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
  };
  try {
    installHarnessLib(root);
    fs.copyFileSync(HOOK_SRC, path.join(root, "qa", "receipt-check.mjs"));
    write("composeApp/src/commonMain/kotlin/Main.kt", "fun main() {}\n");
    write("specs/app-base.spec.md", "## [BASE-01] Given/When/Then\n");
    const receipt = edit({
      schema: "cmp-evidence/1",
      pack: { id: "cmp", version: null },
      profile: "local",
      stage: "change",
      mode: "full",
      verdict: "PASS",
      steps: [
        { name: "harnessIntegrity", verdict: "PASS", durationMs: 12 },
        { name: "androidBuild", verdict: "PASS", durationMs: 21_800 },
        { name: "unitTests", verdict: "PASS", durationMs: 9_500 },
      ],
      commit: { sha: null, dirty: [] },
      inputs: { hash: "" },
      generatedAt: new Date().toISOString(),
    });
    write("qa/evidence/latest.json", JSON.stringify(receipt, null, 2));
    receipt.inputs.hash = computeInputsHash(root).hash;
    write("qa/evidence/latest.json", JSON.stringify(receipt, null, 2));
    const run = spawnSync(process.execPath, ["qa/receipt-check.mjs", "--json"], { cwd: root, encoding: "utf8" });
    assert.ok(run.stdout.trim(), `the harness reader printed nothing: ${run.stderr}`);
    return {
      harness: JSON.parse(run.stdout),
      library: checkDoneEvidence(receipt, { legacySkips: CMP_LEGACY }),
      notary: validateReceiptForTree({ root }),
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const withStep = (step) => (r) => ({ ...r, steps: [...r.steps, step] });

// [label, edit] — each one the harness refuses today.
const REFUSED = [
  ["fast mode", (r) => ({ ...r, mode: "fast" })],
  ["nightly stage", (r) => ({ ...r, stage: "nightly" })],
  ["nightly profile", (r) => ({ ...r, profile: "nightly" })],
  ["smoke stage", (r) => ({ ...r, stage: "smoke" })],
  ["smoke profile", (r) => ({ ...r, profile: "smoke" })],
  ["environment SKIP", withStep({ name: "e2eCoverage", verdict: "SKIP", skipKind: "environment", reason: "no device attached", durationMs: 0 })],
];

test("control: an unedited receipt is valid to the harness reader, the library and the notary", () => {
  const { harness, library, notary } = judgeBoth((r) => r);
  assert.equal(harness.valid, true, harness.reason);
  assert.equal(library.ok, true, library.detail);
  assert.equal(notary.status, "valid", notary.reason);
});

for (const [label, edit] of REFUSED) {
  test(`${label}: the harness refuses, and the library refuses with the harness's own words — so the notary refuses too`, () => {
    const { harness, library, notary } = judgeBoth(edit);
    assert.equal(harness.valid, false, `${label}: the plant must make the harness refuse (it said: ${harness.reason})`);
    assert.equal(library.ok, false, `${label}: the library accepted what the harness refused — "${harness.reason}"`);
    assert.equal(library.detail, harness.reason, "one source of truth: the same named reason, word for word");
    assert.equal(notary.status, "invalid", `${label}: the notary VALIDATED what the harness refuses`);
    assert.ok(notary.reason.includes(harness.reason), `the notary names the same reason: ${notary.reason}`);
  });
}

test("KD-5: tokenDrift's unlabelled SKIP is accepted by all three — the move refuses no headless receipt", () => {
  const { harness, library, notary } = judgeBoth(withStep(TOKEN_DRIFT_UNLABELLED));
  assert.equal(harness.valid, true, harness.reason);
  assert.equal(library.ok, true, library.detail);
  assert.equal(notary.status, "valid", notary.reason);
});

test("a structure SKIP is accepted by all three", () => {
  const { harness, library, notary } = judgeBoth(
    withStep({ name: "e2eSmoke", verdict: "SKIP", skipKind: "structure", reason: "no e2e flows in this project", durationMs: 0 }),
  );
  assert.equal(harness.valid, true, harness.reason);
  assert.equal(library.ok, true, library.detail);
  assert.equal(notary.status, "valid", notary.reason);
});

test("a legacy (pre-skipKind) environmental SKIP: the harness and the library given the profile's lists agree; the list-less notary applies no fallback", () => {
  const { harness, library, notary } = judgeBoth(
    withStep({ name: "e2eSmoke", verdict: "SKIP", reason: "no Android device/emulator attached (adb)", durationMs: 0 }),
  );
  assert.equal(harness.valid, false, "the cmp profile's legacy list reads this as environmental");
  assert.equal(library.ok, false);
  assert.equal(library.detail, harness.reason);
  assert.equal(notary.status, "valid", "no lists passed — no legacy fallback, the documented honest silence");
});
