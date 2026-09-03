// project-layout.mjs — where a project keeps what the console reads.
//
// The console hardcoded one layout (a create-cmp Compose app) and the first
// adopter with its own (payment-blueprint: receipt.json, ARCHITECTURE.md at
// the root, Kotlin under services/) got panes that said "not found" about
// files that existed. The layout is now resolved per project from
// qa/harness-manifest.json — defaulting to the Compose layout, and REFUSING a
// present-but-malformed manifest rather than quietly looking in the wrong
// place.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveProjectLayout, layoutPath, manifestProblems, DEFAULT_LAYOUT, MANIFEST_REL_PATH } from "../src/lib/project-layout.mjs";

function fixture(manifest) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-layout-"));
  fs.mkdirSync(path.join(root, "qa"), { recursive: true });
  if (manifest !== undefined) {
    fs.writeFileSync(path.join(root, MANIFEST_REL_PATH), typeof manifest === "string" ? manifest : JSON.stringify(manifest, null, 2));
  }
  return root;
}

test("no manifest -> the Compose default, byte for byte, and source says so", () => {
  const root = fixture();
  try {
    const r = resolveProjectLayout(root);
    assert.equal(r.ok, true);
    assert.equal(r.source, "default");
    assert.deepEqual(r.layout, DEFAULT_LAYOUT);
    assert.equal(r.layout.receipt, "qa/evidence/latest.json");
    assert.deepEqual([...r.layout.citationRoots], ["composeApp/src", "qa/e2e"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a manifest overrides field by field; undeclared fields keep the default", () => {
  const root = fixture({ receipt: "qa/evidence/receipt.json", architectureDoc: "ARCHITECTURE.md", citationRoots: ["services", "tests"], packs: ["blueprint"] });
  try {
    const r = resolveProjectLayout(root);
    assert.equal(r.ok, true);
    assert.equal(r.source, "manifest");
    assert.equal(r.layout.receipt, "qa/evidence/receipt.json");
    assert.equal(r.layout.architectureDoc, "ARCHITECTURE.md");
    assert.deepEqual([...r.layout.citationRoots], ["services", "tests"]);
    assert.deepEqual([...r.layout.packs], ["blueprint"]);
    assert.equal(r.layout.specs, "specs", "undeclared field keeps the default");
    assert.equal(r.layout.approvals, "qa/approvals.json");
    assert.deepEqual(layoutPath(root, "receipt"), { ok: true, rel: "qa/evidence/receipt.json", source: "manifest" });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a malformed manifest is REFUSED with every problem named — the default is not assumed while a manifest is present", () => {
  const root = fixture({ receipt: "/abs/path.json", specs: "../outside", citationRoots: [], bogus: 1 });
  try {
    const r = resolveProjectLayout(root);
    assert.equal(r.ok, false);
    assert.match(r.reason, /qa\/harness-manifest\.json is malformed/);
    assert.match(r.reason, /receipt must be relative/);
    assert.match(r.reason, /specs may not escape/);
    assert.match(r.reason, /citationRoots must be a non-empty array/);
    assert.match(r.reason, /unknown field "bogus"/);
    assert.match(r.reason, /default layout is NOT assumed/);
    const one = layoutPath(root, "receipt");
    assert.equal(one.ok, false);
    assert.match(one.reason, /malformed/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("invalid JSON is refused naming the file, not parsed as 'no manifest'", () => {
  const root = fixture("{ not json");
  try {
    const r = resolveProjectLayout(root);
    assert.equal(r.ok, false);
    assert.match(r.reason, /qa\/harness-manifest\.json is not valid JSON/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("manifestProblems: the contract in one place — object, relative posix paths, non-empty string lists", () => {
  assert.deepEqual(manifestProblems({}), []);
  assert.deepEqual(manifestProblems({ receipt: "qa/evidence/receipt.json" }), []);
  assert.deepEqual(manifestProblems([]), ["the manifest must be a JSON object"]);
  assert.match(manifestProblems({ receipt: "qa\\evidence\\x.json" })[0], /must use "\/" separators/);
  assert.match(manifestProblems({ receipt: "" })[0], /non-empty string/);
  assert.match(manifestProblems({ packs: [""] })[0], /packs\[0\] must be a non-empty string/);
  assert.match(manifestProblems({ citationRoots: ["ok", "../no"] })[0], /citationRoots\[1\] may not escape/);
});
