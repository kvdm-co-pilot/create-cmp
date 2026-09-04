// `create-cmp attach` writes the harness manifest for a repo create-cmp never
// stamped — the interview's output, or the flags' — and never touches one that
// already exists.
//
// Stage 0 PR 2 (decision 3): the lane refuses to run without a manifest and
// there is no default, so a foreign repo needs a way to answer "which profile,
// and where do things live?" This is that way. The interview itself is a
// prompt; the testable core is attachProject's manifest unit and the pure
// flags → manifest translation.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { attachProject, manifestFromFlags } from "../src/commands/attach.mjs";
import { MANIFEST_REL_PATH, manifestFor, resolveHarnessManifest } from "../packages/harness/src/lib/harness-manifest.mjs";

/** A minimal Gradle Compose/KMP repo — what classifyTarget accepts. */
function foreignRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "attach-manifest-"));
  fs.writeFileSync(path.join(dir, "settings.gradle.kts"), 'rootProject.name = "foreign"\n');
  fs.writeFileSync(
    path.join(dir, "build.gradle.kts"),
    'plugins {\n  kotlin("multiplatform")\n  id("org.jetbrains.compose")\n}\n',
  );
  return dir;
}

const manifestPath = (dir) => path.join(dir, ...MANIFEST_REL_PATH.split("/"));

test("with a resolved manifest, attach plans and writes it as one more unit — valid by the lane's own reader", () => {
  const dir = foreignRepo();
  const manifest = manifestFor("ktor-backend", { specs: "docs/specs", citationRoots: ["backend"], receipt: "qa/evidence/latest.json" });

  const plan = attachProject({ projectDir: dir, apply: false, manifest });
  assert.ok(plan.units.some((u) => u.relPath === MANIFEST_REL_PATH && u.action === "written"));
  assert.ok(!fs.existsSync(manifestPath(dir)), "a dry plan writes nothing");

  attachProject({ projectDir: dir, apply: true, manifest });
  const r = resolveHarnessManifest(dir);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.manifest.profile.id, "ktor-backend");
  assert.equal(r.manifest.specs, "docs/specs");
  assert.deepEqual(r.manifest.citationRoots, ["backend"]);
});

test("without a manifest to land, attach does not invent one", () => {
  const dir = foreignRepo();
  const plan = attachProject({ projectDir: dir, apply: true });
  assert.ok(!plan.units.some((u) => u.relPath === MANIFEST_REL_PATH));
  assert.ok(!fs.existsSync(manifestPath(dir)));
});

test("an invalid manifest is refused before anything is written", () => {
  const dir = foreignRepo();
  assert.throws(
    () => attachProject({ projectDir: dir, apply: true, manifest: { profile: { id: "../x" } } }),
    /refusing to write an invalid manifest/,
  );
  assert.ok(!fs.existsSync(path.join(dir, "AGENTS.md")), "the refusal happens before ANY unit lands");
});

test("the lane's notWired line now points at the manifest rather than blaming a stamped layout", () => {
  const plan = attachProject({ projectDir: foreignRepo(), apply: false });
  const line = plan.notWired.find((n) => /verify lane/.test(n));
  assert.match(line, /manifest above tells the lane/);
  assert.doesNotMatch(line, /addresses the stamped layout by name/);
});

// ── flags → manifest, pure ───────────────────────────────────────────────────

test("manifestFromFlags: nothing without --profile; a full manifest with it", () => {
  assert.equal(manifestFromFlags({ yes: true }), null);
  const r = manifestFromFlags({ profile: "ktor-backend", specs: "docs/specs", "citation-roots": "backend, contracts", receipt: "qa/evidence/latest.json" });
  assert.deepEqual(r.problems, []);
  assert.equal(r.manifest.profile.id, "ktor-backend");
  assert.deepEqual(r.manifest.citationRoots, ["backend", "contracts"]);
  assert.equal(r.manifest.specs, "docs/specs");
});

test("manifestFromFlags carries the lane's problems back rather than exiting — the CLI decides how to refuse", () => {
  const r = manifestFromFlags({ profile: "Bad Id", "citation-roots": "" });
  assert.ok(r.problems.some((p) => /profile\.id must match/.test(p)));
  // An empty --citation-roots is "no override", not an empty list the lane would refuse.
  assert.ok(!("citationRoots" in r.manifest) || r.manifest.citationRoots.length > 0);
});
