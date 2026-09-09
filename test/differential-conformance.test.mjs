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
import { setPlan, markStep, readPlanHistory, PLAN_HISTORY_REL } from "../packages/harness/src/lib/plan.mjs";

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
    pack: { id: "cmp", version: null },
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

test("the plan trail records EACH pack's own rung, and never one borrowed from the other", () => {
  // markStep became profile-dependent on 2026-09-08, when the trail it writes
  // started carrying the pack beside the rung. That was not cosmetic: the trail
  // is WRITTEN and outlives the run, so a bare rung in it can never be
  // attributed afterwards and §8.9's rule — one pack's L2 and another's are
  // different claims — becomes unenforceable for every later reader.
  //
  // Profile-dependent means it must answer the same way for two unlike packs,
  // and "the same way" here is precisely: each records ITS OWN pack, at its own
  // rung, with neither borrowing the other's vocabulary. A core that had learned
  // one stack would write one pack's name into both trails, or drop the field
  // for the ecosystem it did not recognise — and either is invisible from
  // inside a single profile, which is why this is asserted across two.
  const cases = [
    { pack: "cmp", rung: "L2", name: "device" },
    { pack: "alien-py", rung: "L1", name: "fast tests" },
  ];
  const seen = [];
  for (const c of cases) {
    const root = tmp("diff-plan-");
    try {
      fs.mkdirSync(path.join(root, "qa", "evidence"), { recursive: true });
      fs.writeFileSync(
        path.join(root, "qa", "evidence", "latest.json"),
        JSON.stringify({ verdict: "PASS", pack: { id: c.pack, version: null }, evidenceLevel: { rung: c.rung, name: c.name, satisfiedBy: [] } }),
      );

      assert.equal(setPlan(root, { title: "a change", steps: ["build", "prove"] }).ok, true, `${c.pack}: the chain is declared`);
      // Step N+1 CLOSES the chain, and closing is what writes the trail — the
      // glance is only recorded where it will outlive the run, which is exactly
      // why a missing pack there could never be recovered.
      const marked = markStep(root, 3);
      assert.equal(marked.ok, true, `${c.pack}: closing the chain succeeds identically in both ecosystems`);

      const trail = fs.readFileSync(path.join(root, PLAN_HISTORY_REL), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
      const glances = trail.map((e) => e.receipt).filter(Boolean);
      assert.ok(glances.length > 0, `${c.pack}: the trail records a receipt glance at all`);
      for (const g of glances) {
        assert.equal(g.rung, c.rung, `${c.pack}: the trail records this pack's rung`);
        assert.equal(g.pack, c.pack, `${c.pack}: and names the pack that defines it — a stored rung with no pack is unattributable forever`);
      }
      seen.push(glances[0]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
  // The differential claim itself: two unlike packs produced two DIFFERENT
  // attributions from the same logical action. Identical output here would mean
  // the core answered from something other than the profile in front of it.
  assert.notDeepEqual(seen[0], seen[1], "two unlike packs must not produce one attribution");
  assert.deepEqual(Object.keys(seen[0]).sort(), Object.keys(seen[1]).sort(), "and the SHAPE must be identical — same fields, different values");
});
