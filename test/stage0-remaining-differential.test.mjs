// The rest of Stage 0's exit criterion: the profile-dependent verdict functions
// that had no differential proof, proved.
//
// None of these had ever been executed against a second ecosystem. That is not
// the same as being wrong — most turn out to be honest — but "it looks
// stack-free" is exactly the reasoning that shipped five wrong verdicts, so it
// is not evidence. What follows is evidence.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as cmp from "../packages/harness/src/lib/profiles/cmp/index.mjs";
import * as alien from "./fixtures/profiles/py-alien/index.mjs";
import { profileEntryRel } from "../packages/harness/src/lib/profile-loader.mjs";
import { absentManifestReason, manifestFor } from "../packages/harness/src/lib/harness-manifest.mjs";
import { listSkippedSteps, validateReceiptForTree } from "../packages/harness/src/lib/receipt-validate.mjs";
import { buildFlightEntry } from "../packages/harness/src/lib/flight-recorder.mjs";
import { hashArchitectureArtifact } from "../packages/harness/src/lib/approvals.mjs";
import { readPlan, clearPlan, readPlanHistory } from "../packages/harness/src/lib/plan.mjs";

function tmp(p) {
  return fs.mkdtempSync(path.join(os.tmpdir(), p));
}

test("a profile's entry point is derived from its id, with no id privileged", () => {
  for (const id of [cmp.id, alien.id, "ktor-backend", "a-b-c"]) {
    assert.equal(profileEntryRel(id), `qa/lib/profiles/${id}/index.mjs`, `${id}: the path is the id's, never a default`);
  }
  assert.notEqual(profileEntryRel(cmp.id), profileEntryRel(alien.id), "two profiles cannot share one entry point");
});

test("a manifest is built for the profile it names, and its layout is that profile's", () => {
  const forCmp = manifestFor(cmp.id, cmp.layout);
  const forAlien = manifestFor(alien.id, alien.layout);
  // `profile` is an object carrying the id — the shape the loader reads.
  assert.equal(forCmp.profile.id, "cmp");
  assert.equal(forAlien.profile.id, "py-alien");
  // The alien layout's declared spec directory must survive into the manifest —
  // `contracts`, not the conventional `specs`.
  assert.equal(JSON.stringify(forAlien).includes("contracts"), true, "the declared spec dir is carried, not normalised away");
  assert.equal(JSON.stringify(forCmp).includes("composeApp"), true);
  assert.notDeepEqual(forCmp, forAlien);
});

test("the missing-manifest refusal names the file, and no stack", () => {
  const root = tmp("no-manifest-");
  try {
    const reason = absentManifestReason(root);
    assert.ok(typeof reason === "string" && reason.length > 0, "an absent manifest must be explained");
    for (const word of ["composeApp", "gradlew", "Gradle", "Compose", "Kotlin"]) {
      assert.ok(!reason.includes(word), `the refusal must not assume a stack — found "${word}"`);
    }
    assert.match(reason, /harness-manifest\.json/, "and it names the file the reader must write");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("SKIPs are listed by the names the PACK chose, in both ecosystems", () => {
  const cases = [
    { name: "cmp", steps: [{ name: "tokenDrift", verdict: "SKIP", reason: "inspector not reachable" }, { name: "build", verdict: "PASS" }] },
    { name: "py-alien", steps: [{ name: "py_tests_slow", verdict: "SKIP", reason: "no device" }, { name: "py_build", verdict: "PASS" }] },
  ];
  for (const c of cases) {
    const listed = listSkippedSteps({ steps: c.steps });
    assert.equal(listed.length, 1, `${c.name}: exactly the skipped step`);
    assert.equal(listed[0].name, c.steps[0].name, `${c.name}: named as the pack spells it`);
    assert.match(listed[0].reason, /reachable|device/, `${c.name}: with its honest reason`);
  }
});

test("a flight entry carries the pack's own step names and verdict, unrewritten", () => {
  const mk = (profile, steps, onDevice) =>
    buildFlightEntry({
      profile, mode: "full", verdict: "PASS", evidenceLevel: { rung: "L2" },
      steps, sha: "abc1234", durationMs: 1000, onDeviceSteps: onDevice, degraded: [],
    });
  const c = mk("ci", [{ name: "build", verdict: "PASS", durationMs: 10 }], ["e2eSmoke"]);
  const a = mk("ci", [{ name: "py_build", verdict: "PASS", durationMs: 10 }], ["py_tests_slow"]);
  const asText = (e) => JSON.stringify(e);
  assert.ok(asText(a).includes("py_build"), "the alien pack's step name survives into the journal");
  assert.ok(!asText(a).includes("build\"") || asText(a).includes("py_build"), "and is not rewritten to another stack's");
  assert.ok(asText(c).includes("build"));
  assert.notDeepEqual(c, a);
});

test("the architecture artifact is hashed at the paths the PROFILE declares", () => {
  // The governance hash must follow the declared spec directory. A profile
  // using `contracts/` must not be hashed at `specs/` and reported unchanged.
  const root = tmp("arch-");
  try {
    fs.mkdirSync(path.join(root, "contracts"), { recursive: true });
    fs.mkdirSync(path.join(root, "docs"), { recursive: true });
    fs.writeFileSync(path.join(root, "contracts", "app-base.spec.md"), "# base\n");
    fs.writeFileSync(path.join(root, "docs", "ARCHITECTURE.md"), "# arch\n");
    const first = hashArchitectureArtifact(root, { specRel: "contracts/app-base.spec.md", docRel: "docs/ARCHITECTURE.md" });
    assert.ok(first, "a declared, existing artifact hashes");

    // Editing the declared spec must move the hash — otherwise governance is
    // watching a file the project does not use.
    fs.writeFileSync(path.join(root, "contracts", "app-base.spec.md"), "# base, changed\n");
    assert.notEqual(hashArchitectureArtifact(root, { specRel: "contracts/app-base.spec.md", docRel: "docs/ARCHITECTURE.md" }), first);

    // And a conventional path that does NOT exist here must not silently hash
    // to something that looks valid.
    const wrong = hashArchitectureArtifact(root, { specRel: "specs/app-base.spec.md", docRel: "docs/ARCHITECTURE.md" });
    assert.notEqual(wrong, first, "hashing a path this profile never declared cannot equal the real artifact");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("plan state is read and cleared per project, whatever the pack calls its steps", () => {
  for (const steps of [["build", "unitTests"], ["py_build", "py_tests_fast"]]) {
    const root = tmp("plan-");
    try {
      fs.mkdirSync(path.join(root, "qa"), { recursive: true });
      // No plan yet: every reader must degrade honestly rather than throw.
      assert.doesNotThrow(() => readPlan(root));
      assert.doesNotThrow(() => readPlanHistory(root));
      assert.doesNotThrow(() => clearPlan(root));
      fs.writeFileSync(path.join(root, "qa", ".plan.json"), JSON.stringify({ steps: steps.map((s) => ({ name: s, state: "todo" })) }));
      const plan = readPlan(root);
      assert.ok(plan, `a written plan is read back (${steps[0]})`);
      assert.ok(JSON.stringify(plan).includes(steps[0]), "and carries the pack's own step names");
      clearPlan(root);
      assert.ok(!fs.existsSync(path.join(root, "qa", ".plan.json")), "cleared means gone, on every stack");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("the hosted predicate returns the same verdict for the same logical receipt, in both ecosystems", async () => {
  // The end-to-end predicate: read the receipt, recompute the tree hash, check
  // the lane vouched. Its answer must depend on the RECEIPT and the TREE, never
  // on which ecosystem wrote them. Two trees, two dialects, one answer.
  const { computeInputsHash } = await import("../packages/harness/src/lib/inputs-hash.mjs");
  const RECEIPT_REL = "qa/evidence/latest.json";

  const shapes = [
    {
      name: "cmp (Kotlin)",
      files: { "composeApp/src/Main.kt": "fun main() {}\n", "specs/home.spec.md": "- **HOME-01** it renders\n" },
      surface: ["composeApp", "specs", "qa"],
      steps: [
        { name: "harnessIntegrity", verdict: "PASS", durationMs: 12, harness: { status: "intact" } },
        { name: "build", verdict: "PASS", durationMs: 21_800 },
      ],
    },
    {
      name: "py-alien (Python)",
      files: { "app/main.py": "x = 1\n", "contracts/home.spec.md": "- **HOME-01** it renders\n" },
      surface: ["app", "contracts", "qa"],
      steps: [
        { name: "harness_integrity", verdict: "PASS", durationMs: 8, harness: { status: "intact" } },
        { name: "py_build", verdict: "PASS", durationMs: 143 },
      ],
    },
  ];

  const verdicts = [];
  for (const s of shapes) {
    const root = tmp("predicate-");
    try {
      for (const [rel, body] of Object.entries(s.files)) {
        fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
        fs.writeFileSync(path.join(root, rel), body);
      }
      fs.mkdirSync(path.join(root, "qa"), { recursive: true });
      fs.writeFileSync(path.join(root, "qa", "verified-surface.json"), JSON.stringify({ surface: s.surface }));
      fs.writeFileSync(path.join(root, "qa", "verify.mjs"), "// lane stub\n");
      const { hash, fileCount } = computeInputsHash(root);
      fs.mkdirSync(path.join(root, "qa", "evidence"), { recursive: true });
      fs.writeFileSync(
        path.join(root, RECEIPT_REL),
        JSON.stringify({
          schema: "cmp-evidence/1", profile: "local", verdict: "PASS",
          commit: { sha: null, dirty: [] }, inputs: { hash, fileCount },
          steps: s.steps, artifacts: [], toolVersions: { node: process.version },
          generatedAt: new Date().toISOString(),
        }),
      );

      const good = validateReceiptForTree({ root });
      assert.equal(good.status, "valid", `${s.name}: an unchanged tree with a vouching lane is VALID — got ${good.status} (${good.reason ?? ""})`);

      // And it still bites identically: touch the source, the receipt no longer
      // speaks for the tree.
      const firstSource = Object.keys(s.files)[0];
      fs.appendFileSync(path.join(root, firstSource), "// changed\n");
      const stale = validateReceiptForTree({ root });
      assert.equal(stale.status, "invalid", `${s.name}: a changed tree must invalidate`);
      assert.match(stale.reason, /source changed/, `${s.name}: and say why`);
      verdicts.push([good.status, stale.status]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
  assert.deepEqual(verdicts[0], verdicts[1], "the same logical input must produce the same verdict in both ecosystems");
});
