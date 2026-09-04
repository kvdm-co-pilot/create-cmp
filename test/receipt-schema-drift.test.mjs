// The published receipt schema must describe the receipt the lane actually writes.
//
// qa/evidence/schema.json is a CONTRACT, not a runtime validator: nothing in the
// lane checks a receipt against it. That is exactly why it drifts silently. By
// 2026-09-04 the lane had been emitting five fields the schema never declared
// (`stage`, `harness`, `strength`, and per-step `skipKind` and `layer`), running
// two profiles it did not list (`smoke`, `nightly`), and writing a verdict it did
// not allow (`ERROR`) — while the format is the thing we tell people is open and
// a third party is invited to read.
//
// An open format nobody checks is a format that lies. This test is the check: it
// runs a REAL lane, then holds every key and every enum value in the receipt
// against the schema. Adding a field to a receipt without documenting it now
// fails here, in the same second it is written.
//
// Deliberately hand-rolled rather than a JSON-schema library: the harness is
// dependency-free by design (a receipt must be checkable from the repo alone,
// offline), and the drift class this catches — undeclared key, unlisted enum
// value — needs neither $ref resolution nor full validation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "template", "qa", "evidence", "schema.json"), "utf8"));

/**
 * Keys present in `obj` that `properties` does not declare. The whole drift
 * class, in one function — so the planted case below can prove it bites.
 * @param {object} obj
 * @param {object} properties a JSON-schema `properties` map
 * @returns {string[]}
 */
function undeclaredKeys(obj, properties) {
  return Object.keys(obj ?? {}).filter((k) => !Object.hasOwn(properties ?? {}, k)).sort();
}

/** Enum violations for the fields that carry one, as `path=value` strings. */
function enumViolations(value, schema, where) {
  if (!schema || !Array.isArray(schema.enum) || value === undefined) return [];
  return schema.enum.includes(value) ? [] : [`${where}=${JSON.stringify(value)}`];
}

function stampedApp() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "receipt-schema-"));
  const dir = path.join(base, "SchemaApp");
  const r = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, "bin", "create-cmp.mjs"), dir, "--yes", "--name", "SchemaApp", "--package", "com.example.schemaapp", "--no-ios", "--no-firebase", "--no-verify"],
    { cwd: REPO_ROOT, encoding: "utf8", timeout: 60_000 },
  );
  if (r.status !== 0) throw new Error(`stamp failed: ${r.stdout}${r.stderr}`);
  return dir;
}

function smokeReceipt(dir) {
  const r = spawnSync(process.execPath, [path.join(dir, "qa", "verify.mjs"), "--profile", "smoke", "--json", "--no-journal"], {
    cwd: dir,
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const text = r.stdout ?? "";
  return JSON.parse(text.slice(text.indexOf("{")));
}

test("a REAL receipt carries no field the published schema fails to declare", () => {
  const dir = stampedApp();
  try {
    const receipt = smokeReceipt(dir);
    assert.deepEqual(undeclaredKeys(receipt, SCHEMA.properties), [], "the lane writes a field the contract does not document");
    const stepProps = SCHEMA.properties.steps.items.properties;
    for (const step of receipt.steps) {
      assert.deepEqual(undeclaredKeys(step, stepProps), [], `step "${step.name}" carries an undocumented field`);
    }
    // Every enum the receipt actually exercises.
    const violations = [
      ...enumViolations(receipt.profile, SCHEMA.properties.profile, "profile"),
      ...enumViolations(receipt.stage, SCHEMA.properties.stage, "stage"),
      ...enumViolations(receipt.mode, SCHEMA.properties.mode, "mode"),
      ...enumViolations(receipt.verdict, SCHEMA.properties.verdict, "verdict"),
      ...enumViolations(receipt.harness?.status, SCHEMA.properties.harness.properties.status, "harness.status"),
      ...receipt.steps.flatMap((s) => enumViolations(s.verdict, stepProps.verdict, `steps.${s.name}.verdict`)),
      ...receipt.steps.flatMap((s) => enumViolations(s.skipKind, stepProps.skipKind, `steps.${s.name}.skipKind`)),
    ];
    assert.deepEqual(violations, [], "the lane writes a value the contract forbids");
    // The four fields whose absence was the 2026-09-04 drift — pinned by name so
    // a future edit cannot quietly drop them from the contract again.
    for (const field of ["stage", "harness", "strength", "pack"]) {
      assert.ok(SCHEMA.properties[field], `${field} must stay declared`);
      assert.ok(Object.hasOwn(receipt, field), `${field} must stay emitted`);
    }
  } finally {
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  }
});

test("PLANTED: an undeclared field and a forbidden enum value are both caught", () => {
  // The check must actually bite, or the test above is a green light that
  // reads nothing — the failure mode this whole file exists to close.
  assert.deepEqual(undeclaredKeys({ schema: "cmp-evidence/1", inventedYesterday: true }, SCHEMA.properties), ["inventedYesterday"]);
  assert.deepEqual(enumViolations("staging", SCHEMA.properties.profile, "profile"), ['profile="staging"']);
  assert.deepEqual(enumViolations("local", SCHEMA.properties.profile, "profile"), []);
});

test("the contract allows what the lane can legitimately emit but this run did not: ERROR, both skipKinds, every profile and stage", () => {
  const stepProps = SCHEMA.properties.steps.items.properties;
  // ERROR is the verdict for a step that could not run. It is written by
  // lane-runner.mjs on a deadline or a throw, and the schema omitted it — so a
  // receipt from a timed-out step contradicted the published format.
  assert.ok(stepProps.verdict.enum.includes("ERROR"));
  assert.match(stepProps.verdict.description, /never FAIL/);
  // Both skipKinds, because the distinction is what the Stop hook refuses on.
  assert.deepEqual(stepProps.skipKind.enum, ["structure", "environment"]);
  // Every profile the runner accepts, and every stage it maps them to.
  assert.deepEqual(SCHEMA.properties.profile.enum, ["smoke", "scaffold", "local", "ci", "nightly", "release"]);
  assert.deepEqual(SCHEMA.properties.stage.enum, ["smoke", "scaffold", "change", "merge", "nightly", "release"]);
  const verifySrc = fs.readFileSync(path.join(REPO_ROOT, "packages", "harness", "src", "verify.mjs"), "utf8");
  for (const p of SCHEMA.properties.profile.enum) {
    assert.ok(verifySrc.includes(`${p}:`), `the runner must know the profile "${p}" the schema advertises`);
  }
});

test("the rung's NAME is the pack's, not an enum — a ladder the core does not own cannot be enumerated by it", () => {
  const lvl = SCHEMA.properties.evidenceLevel.properties;
  assert.equal(lvl.name.type, "string");
  assert.ok(!lvl.name.enum, "enumerating mobile's rung names made every other pack's receipt invalid by the published contract");
  assert.match(SCHEMA.properties.evidenceLevel.description, /Compare rungs only within a pack/);
  // The mode description used to name five Compose steps as "the device/release
  // tier" — the published format describing one stack's lane as though it were
  // every lane.
  const code = JSON.stringify(SCHEMA);
  for (const stackFact of ["releaseBuild", "tokenDrift", "e2eSmoke", "androidChecks", "releaseSmoke", "composeApp"]) {
    assert.ok(!code.includes(stackFact), `the published receipt contract must not name ${stackFact}`);
  }
});
