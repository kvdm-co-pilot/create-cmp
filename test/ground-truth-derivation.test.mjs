// The deriver's own drift gate.
//
// scripts/ground-truth.mjs exists because prose cannot be trusted to count.
// It then carried, for months, a hand-written list of which packages were
// unpublished — inside the one file whose entire premise is that a claim about
// a tree must be derived from it. The list was correct until 0.25.0 published
// both names, and the very next run of the deriver reported two live packages
// as unpublished. A hand-written claim in the deriver is the drift the deriver
// exists to remove, one layer in.
//
// So this file gates two things the fix depends on:
//
//   1. Ownership is DERIVED — add a package under packages/ and it appears
//      without anyone editing a list.
//   2. The default path never reaches the network, and never asserts registry
//      state. `groundTruth()` is consumed by the suite (doc-counts.test.mjs),
//      which must pass air-gapped; and a registry claim is not a tree fact.
//
// The registry answer itself is tested against an injected fetch, never the
// real network — a test that needs the registry to be up is a test that fails
// for reasons that are not defects.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { groundTruth, registryStatus } from "../scripts/ground-truth.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("ownership is derived from the manifests on disk, not from a list in the source", () => {
  const gt = groundTruth();
  const onDisk = fs
    .readdirSync(path.join(ROOT, "packages"), { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "aliases")
    .filter((e) => fs.existsSync(path.join(ROOT, "packages", e.name, "package.json")))
    .map((e) => JSON.parse(fs.readFileSync(path.join(ROOT, "packages", e.name, "package.json"), "utf8")))
    .filter((p) => !p.private)
    .map((p) => p.name)
    .sort();

  assert.deepEqual(
    gt.npm.independent.map((p) => p.name).sort(),
    onDisk,
    "the independent list must equal what is on disk — if this fails, someone re-introduced a hand-written list",
  );
  assert.ok(onDisk.length > 0, "the fixture is vacuous if no publishable package exists under packages/");
});

test("no package name is hard-coded in the deriver's source", () => {
  const src = fs.readFileSync(path.join(ROOT, "scripts/ground-truth.mjs"), "utf8");
  const gt = groundTruth();
  // The primary is legitimately read from the root manifest by path, not by name.
  for (const p of [...gt.npm.independent, ...gt.npm.aliases]) {
    assert.ok(
      !src.includes(`"${p.name}"`),
      `${p.name} is written literally into scripts/ground-truth.mjs — derive it from the manifest instead`,
    );
  }
});

test("the deriver states no registry claim, and the word that was the bug is gone", () => {
  const gt = groundTruth();
  assert.ok(!("unpublished" in gt.npm), "gt.npm.unpublished was a hand-written registry claim; it must not return");

  const generated = path.join(ROOT, "docs/research/launch/GROUND-TRUTH.md");
  if (fs.existsSync(generated)) {
    const md = fs.readFileSync(generated, "utf8");
    assert.ok(
      !/unpublished|Not yet published/i.test(md),
      "the generated facts file asserts publication status it cannot derive — regenerate with --markdown",
    );
    assert.ok(!md.includes("\\`"), "backtick escaping leaked into the generated markdown");
  }
});

test("groundTruth() does not reach the network", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("groundTruth() fetched — it is consumed by the suite and must work air-gapped");
  };
  try {
    assert.ok(groundTruth().npm.independent.length > 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("registryStatus reports each name against what the registry serves", async () => {
  const gt = groundTruth();
  const first = gt.npm.independent[0].name;
  const held = gt.npm.independent[0].version;

  const fake = async (url) => {
    if (url.endsWith(`/${first}`)) return { ok: true, status: 200, json: async () => ({ "dist-tags": { latest: held } }) };
    if (url.includes("create-cmp-cli")) return { ok: true, status: 200, json: async () => ({ "dist-tags": { latest: "0.0.0" } }) };
    return { ok: false, status: 404 };
  };

  const status = await registryStatus(gt, fake);
  const by = (n) => status.find((p) => p.name === n);

  assert.equal(by(first).state, "published", "a name the registry serves at this tree's version is published");
  assert.equal(by("create-cmp-cli").state, "differs", "a registry version that is not this tree's is a difference, not a pass");
  assert.equal(by("create-cmp-cli").latest, "0.0.0", "the difference must carry what the registry actually serves");
  assert.ok(
    status.some((p) => p.state === "absent"),
    "a 404 is absent — a name the registry does not have at all",
  );
});

test("a registry that cannot be reached is reported as unknown, never as absent", async () => {
  const gt = groundTruth();
  const status = await registryStatus(gt, async () => {
    throw new Error("ENOTFOUND registry.npmjs.org");
  });
  assert.ok(status.length > 0);
  for (const p of status) {
    assert.equal(p.state, "unknown", "an offline machine must not be told its packages are missing");
    assert.match(p.why, /ENOTFOUND/, "the reason the answer is unknown must survive into the report");
  }
});
