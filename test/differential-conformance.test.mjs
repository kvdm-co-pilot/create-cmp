// DIFFERENTIAL CONFORMANCE — two profiles or it isn't parameterised.
//
// This is Stage 0's exit criterion, made executable (NORTH-STAR §9, §9.1).
//
// The two criteria before it were both wrong in the same way. A de-fork count
// measured a repo we had decided not to touch. "A foreign profile adopts with
// zero core edits" was met TWICE — a Ktor backend and a Python service — and was
// still not sufficient, because the core carried five rules that produce
// silently WRONG VERDICTS on any ecosystem but the first. Every one passed the
// lint, passed 1,458 tests, and passed adoption.
//
// The reason those criteria could not catch them: adoption proves the seam
// ACCEPTS a profile. It does not prove the core COMPUTES THE SAME ANSWER for
// both. Only running the same logical input through two unlike profiles does,
// because a convention-shaped assumption has no word to grep for but always
// makes the second profile disagree with the first.
//
// So every test here is one shape: build the same *logical* input twice, once in
// each ecosystem's conventions, and assert the core returns the same verdict.
// When it does not, the core has learned a stack fact.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as alien from "./fixtures/profiles/py-alien/index.mjs";
import * as cmp from "../packages/harness/src/lib/profiles/cmp/index.mjs";
import { specModelFrom } from "../packages/harness/src/lib/spec-model.mjs";
import { scanSpecClauses, scanCitations, clauseTierCoverage } from "../packages/harness/src/lib/spec-coverage.mjs";
import { checkLaneVouching } from "../packages/harness/src/lib/receipt-validate.mjs";
import { computeInputsHash } from "../packages/harness/src/lib/inputs-hash.mjs";

function tmp(p) {
  return fs.mkdtempSync(path.join(os.tmpdir(), p));
}

/** The same promise, cited from a real test, in each ecosystem's dialect. */
const CASES = [
  {
    name: "cmp (Kotlin)",
    profile: cmp,
    specsDir: "specs",
    specRel: "specs/home.spec.md",
    testRel: "composeApp/src/commonTest/kotlin/HomeTest.kt",
    source: "import kotlin.test.Test\n\n// SPEC: HOME-01\n@Test\nfun renders() {}\n",
  },
  {
    name: "py-alien (Python)",
    profile: alien,
    specsDir: "contracts",
    specRel: "contracts/home.spec.md",
    testRel: "t/test_home.py",
    source: "import pytest\n\n# SPEC: HOME-01\ndef test_renders():\n    assert True\n",
  },
];

function treeFor(c) {
  const root = tmp("diff-");
  fs.mkdirSync(path.join(root, path.dirname(c.specRel)), { recursive: true });
  fs.mkdirSync(path.join(root, path.dirname(c.testRel)), { recursive: true });
  fs.writeFileSync(path.join(root, c.specRel), "# Home\n\n- **HOME-01** the list renders\n");
  fs.writeFileSync(path.join(root, c.testRel), c.source);
  return root;
}

test("a promise cited from a real test is COVERED — in both ecosystems", () => {
  for (const c of CASES) {
    const root = treeFor(c);
    try {
      const m = specModelFrom(c.profile, {});
      assert.equal(m.ok, true, `${c.name}: ${m.ok ? "" : m.reason}`);
      const clauses = scanSpecClauses(root, m.model);
      const tags = scanCitations(root, m.model);
      assert.equal(clauses.size, 1, `${c.name}: the clause must be read`);
      assert.deepEqual(
        tags.map((t) => t.id),
        ["HOME-01"],
        `${c.name}: the citation must bind — same promise, same proof, same verdict`,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("a clause proved at a tier that cannot observe it FAILS — in both ecosystems", () => {
  // cmp: a device promise cited only from a host test.
  // alien: a slow promise cited only from a fast test.
  const cases = [
    { ...CASES[0], tier: "device", from: "composeApp/src/commonTest/kotlin/T.kt", src: "// SPEC: HOME-01\n@Test\nfun a() {}\n" },
    { ...CASES[1], tier: "slow", from: "t/test_a.py", src: "# SPEC: HOME-01\ndef test_a():\n    pass\n" },
  ];
  for (const c of cases) {
    const root = tmp("diff-tier-");
    try {
      fs.mkdirSync(path.join(root, path.dirname(c.specRel)), { recursive: true });
      fs.mkdirSync(path.join(root, path.dirname(c.from)), { recursive: true });
      fs.writeFileSync(path.join(root, c.specRel), `# Home\n\n- **HOME-01** [tier: ${c.tier}] observable only there\n`);
      fs.writeFileSync(path.join(root, c.from), c.src);
      const m = specModelFrom(c.profile, {}).model;
      const { unmetTier } = clauseTierCoverage(scanSpecClauses(root, m), scanCitations(root, m), m);
      assert.equal(unmetTier.length, 1, `${c.name}: a promise proved where it cannot be seen must FAIL`);
      assert.equal(unmetTier[0].id, "HOME-01");
      assert.equal(unmetTier[0].requiredTier, c.tier);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("a receipt VOUCHES for its lane whatever the pack calls its integrity step", () => {
  // `checkLaneVouching` found a step named exactly `harnessIntegrity` — a name
  // the cmp pack chose, that the profile protocol never mentions, and that a
  // profile author has no way to discover. A green lane whose self-vouching step
  // is spelled `harness_integrity` minted receipts that were invalid FOREVER,
  // and the refusal accused the lane of not vouching for itself.
  const receiptWith = (stepName) => ({
    schema: "cmp-evidence/1",
    profile: "ci",
    verdict: "PASS",
    steps: [
      { name: stepName, verdict: "PASS", durationMs: 12, harness: { status: "intact" } },
      { name: "spec_coverage", verdict: "PASS", durationMs: 30 },
    ],
    harness: { name: "prooflane-harness", version: "0.19.0", status: "intact" },
  });
  for (const [label, stepName] of [
    ["cmp", "harnessIntegrity"],
    ["py-alien", "harness_integrity"],
  ]) {
    const r = checkLaneVouching(receiptWith(stepName));
    assert.equal(r.ok, true, `${label}: a lane that vouched for itself must be accepted — got: ${r.detail ?? ""}`);
  }
});

test("the inputs hash is the SAME before and after `git init` — in both ecosystems", () => {
  // The walk-mode ignore set is one ecosystem's: build, .gradle, .kotlin, .git,
  // .idea, node_modules. It knows nothing of __pycache__, venv, target, bin/obj
  // or vendor. So a Python tree hashed before `git init` counted its bytecode
  // cache and after it did not — and the stamp-time PASS receipt read "source
  // changed since the receipt" the instant a user ran `git init`, with no source
  // change at all. That is the exact invariant the constant was written to hold.
  const cases = [
    { name: "cmp", src: "composeApp/src/Main.kt", junk: "composeApp/build/classes/Main.class" },
    { name: "py-alien", src: "app/main.py", junk: "app/__pycache__/main.cpython-312.pyc" },
  ];
  for (const c of cases) {
    const root = tmp("diff-hash-");
    try {
      for (const rel of [c.src, c.junk]) {
        fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
        fs.writeFileSync(path.join(root, rel), "x");
      }
      fs.mkdirSync(path.join(root, "qa"), { recursive: true });
      fs.writeFileSync(path.join(root, "qa", "verified-surface.json"), JSON.stringify({ surface: [c.src.split("/")[0], "qa"] }));
      fs.writeFileSync(path.join(root, ".gitignore"), "__pycache__/\nbuild/\n");

      const before = computeInputsHash(root);
      execFileSync("git", ["init", "-q", "."], { cwd: root });
      execFileSync("git", ["add", "-A"], { cwd: root });
      const after = computeInputsHash(root);

      assert.equal(after.hash, before.hash, `${c.name}: the same bytes must hash the same before and after git init`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});
