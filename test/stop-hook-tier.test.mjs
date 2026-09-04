// The Stop hook refuses a tier that COULD have run and did not — on any stack.
//
// Stage 0 PR 6c (docs/NORTH-STAR.md §6, §8.9). The rule is the core's and the
// sharpest one it has: a step that skipped because the environment was not
// ready is a gap a human can close, and a change is not done while it stands.
// A step that skipped because this project genuinely has no such tier is
// honest and allowed.
//
// It used to be implemented as `["e2eSmoke", "androidChecks"].includes(name)`
// plus Android reason-text matching, so on any other stack the one gate that
// refuses "done" over a tier that never ran was silently inert — it checked
// nothing and said nothing about checking nothing. `skipKind` is the
// stack-free signal, and every receipt the current lane writes carries it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { computeInputsHash } from "../packages/harness/src/lib/inputs-hash.mjs";
import { installHarnessLib } from "./helpers/harness-fixture.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOOK_SRC = path.join(REPO_ROOT, "packages", "harness", "src", "receipt-check.mjs");

/**
 * A backend-shaped project: its own profile, its own step names, no device
 * anywhere — and a receipt whose hash actually attests the tree, so the hook
 * reaches the tier rule instead of stopping at the hash.
 */
function backendProject(steps) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stop-hook-tier-"));
  const write = (rel, text) => {
    const abs = path.join(root, ...rel.split("/"));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
  };
  installHarnessLib(root);
  fs.copyFileSync(HOOK_SRC, path.join(root, "qa", "receipt-check.mjs"));
  write("qa/harness-manifest.json", JSON.stringify({ schema: "harness-manifest/2", profile: { id: "ktor-backend" } }));
  write(
    "qa/lib/profiles/ktor-backend/index.mjs",
    'export const id = "ktor-backend";\nexport const protocol = 1;\n' +
      'export const layout = { specs: "specs", citationRoots: ["services"], citationExts: [".kt"], flows: null };\n' +
      'export const tiers = { names: ["unit", "integration"], hostOnly: ["unit"], satisfying: { integration: ["integration"] }, journey: null, forFile: () => "unit" };\n' +
      "export function steps() { return {}; }\n",
  );
  write("specs/money.spec.md", "- **MN-01** — Given a ledger, Then it balances.\n");
  write("services/core/Money.kt", "class Money\n");
  const receipt = {
    schema: "cmp-evidence/1",
    profile: "local",
    stage: "change",
    mode: "full",
    verdict: "PASS",
    // The lane always vouches for itself first; without this row the hook
    // refuses for a different (also correct) reason and never reaches the rule
    // under test.
    steps: [{ name: "harnessIntegrity", verdict: "PASS", durationMs: 2 }, ...steps],
    inputs: { hash: "" },
  };
  // Write the receipt first with a placeholder, then hash the tree WITH it in
  // place — the same order the lane uses, so the hash attests this exact tree.
  write("qa/evidence/latest.json", JSON.stringify(receipt, null, 2));
  receipt.inputs.hash = computeInputsHash(root).hash;
  write("qa/evidence/latest.json", JSON.stringify(receipt, null, 2));
  return root;
}

function runHook(root) {
  try {
    execFileSync(process.execPath, [path.join(root, "qa", "receipt-check.mjs"), "--hook"], { input: "{}", encoding: "utf8" });
    return { refused: false, stderr: "" };
  } catch (err) {
    return { refused: true, status: err.status, stderr: String(err.stderr ?? "") };
  }
}

test("PLANTED: a BACKEND step that skipped for an environmental reason blocks done — the rule never knew the word 'device'", () => {
  const root = backendProject([
    { name: "unitTests", verdict: "PASS", durationMs: 40 },
    { name: "integrationTests", verdict: "SKIP", skipKind: "environment", reason: "no container runtime on this machine — start Docker", durationMs: 0 },
  ]);
  try {
    const hook = runHook(root);
    assert.ok(hook.refused, "a tier that could have run and did not must block done");
    assert.equal(hook.status, 2);
    assert.match(hook.stderr, /a tier did not run — integrationTests: no container runtime/);
    // The hook QUOTES the step's own reason and adds no remediation: it cannot
    // know this stack's toolchain, and inventing advice is how it used to tell
    // a backend team about Android emulators.
    assert.match(hook.stderr, /skipped for an environmental reason, not because this project lacks them/);
    assert.doesNotMatch(hook.stderr, /emulator|CMP_AVD|adb/, "no toolchain advice of the core's own");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a STRUCTURAL skip on the same stack is honest and allowed — this project simply has no such tier", () => {
  const root = backendProject([
    { name: "unitTests", verdict: "PASS", durationMs: 40 },
    { name: "integrationTests", verdict: "SKIP", skipKind: "structure", reason: "no services/*/src/integrationTest sources in this project", durationMs: 0 },
  ]);
  try {
    const hook = runHook(root);
    assert.equal(hook.refused, false, `a structural skip must not block done: ${hook.stderr}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a legacy receipt (no skipKind) is read by reason text against the PROFILE's execution tier, never a hardcoded pair", () => {
  // A profile that declares no ladder gets no legacy fallback at all — better
  // than guessing which of its step names used to mean "device".
  const root = backendProject([
    { name: "integrationTests", verdict: "SKIP", reason: "no Android device/emulator attached (adb)", durationMs: 0 },
  ]);
  try {
    assert.equal(runHook(root).refused, false, "no ladder, no legacy name list — nothing is assumed");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
