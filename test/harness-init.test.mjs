// `create-cmp harness init` — the entrance for a repo of any stack.
//
// The gate this file is: a repo that is not a Compose app, containing nothing
// but sources, a spec and a test, goes from THAT to a green verify lane and a
// PASSing Rule 0 instrument in ONE command, with no human editing a generated
// file. Everything else here is a supporting assertion.
//
// Why it is worth a real end-to-end run rather than unit tests over a plan: the
// failure this command exists to fix was not a wrong value anywhere, it was a
// closed loop between two correct components. The absent-manifest refusal named
// `create-cmp attach`; attach refuses non-Compose repos by design. Both were
// individually right and the adopter was stuck. Only running the whole path
// catches that class, so the whole path runs here.
//
// It also pins the generated profile against the loader's own contract, which
// is the mechanical form of PACKAGE-SPLIT D2 — "the skeleton is normative".
// Prose describing the protocol can drift from `profile-loader.mjs` silently; a
// skeleton that must load cannot.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PROFILE_TOOLS,
  PROFILE_LIB,
  vendorPlan,
  slugProfileId,
  seedSurface,
  manifestFor,
  profileSkeleton,
} from "../src/commands/harness-init.mjs";
import { validateProfileModule, profileEntryRel } from "../packages/harness/src/lib/profile-loader.mjs";
import { absentManifestReason } from "../packages/harness/src/lib/harness-manifest.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(REPO_ROOT, "bin", "create-cmp.mjs");

/** A repo that is emphatically not a Compose app: JS sources, a spec, a real test. */
function foreignRepo() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "harness-init-"));
  const dir = path.join(base, "svc");
  fs.mkdirSync(path.join(dir, "services", "core"), { recursive: true });
  fs.mkdirSync(path.join(dir, "specs"), { recursive: true });
  fs.mkdirSync(path.join(dir, "test"), { recursive: true });
  fs.writeFileSync(path.join(dir, "specs", "core.spec.md"), "# Core\n\n- **SVC-01** the service adds two numbers\n");
  fs.writeFileSync(path.join(dir, "services", "core", "add.js"), "export const add = (a, b) => a + b;\n");
  fs.writeFileSync(
    path.join(dir, "test", "add.test.js"),
    'import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { add } from "../services/core/add.js";\n\n// SPEC: SVC-01\ntest("adds two numbers", () => {\n  assert.equal(add(1, 2), 3);\n});\n',
  );
  git(dir, ["init", "-q", "."]);
  commitAll(dir, "init");
  return dir;
}

function git(cwd, args) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}
function commitAll(cwd, msg) {
  git(cwd, ["add", "-A"]);
  git(cwd, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", msg]);
}
function node(cwd, args) {
  return spawnSync(process.execPath, args, { cwd, encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
}

test("THE GATE: a non-Compose repo goes from nothing to a green lane and a PASSing Rule 0, in one command", () => {
  const dir = foreignRepo();
  try {
    const init = node(dir, [CLI, "harness", "init", "--target-dir", dir]);
    assert.equal(init.status, 0, `init failed:\n${init.stdout}${init.stderr}`);

    // Init writes into the working tree, so Rule 0 cannot run yet — the
    // instrument refuses to plant into uncommitted changes. The command must
    // SAY that rather than staging a guaranteed failure for every adopter's
    // first contact with the product.
    assert.match(init.stdout, /uncommitted changes/, "init must explain why Rule 0 has not run yet");
    assert.match(init.stdout, /node qa\/framework-check\.mjs/, "init must name the command that proves the lane");

    commitAll(dir, "install the verify lane");

    const lane = node(dir, [path.join(dir, "qa", "verify.mjs")]);
    assert.equal(lane.status, 0, `the lane a fresh init produces must be GREEN:\n${lane.stdout}${lane.stderr}`);
    assert.match(lane.stdout, /harnessIntegrity: PASS/);
    assert.match(lane.stdout, /specCoverage: PASS/);

    // Rule 0 on the second stack: the lane must be seen to refuse and recover.
    // Deliberately AFTER a real lane run, because that is the order a human
    // uses and it is the order that caught a defect in the instrument: the
    // Stop-hook check reverted the receipt before asking the hook about it, so
    // it passed on a fresh tree only because the revert had deleted the receipt
    // entirely. Running the lane first is what makes this assertion mean
    // something.
    const before = git(dir, ["status", "--porcelain"]).stdout;
    const rule0 = node(dir, [path.join(dir, "qa", "framework-check.mjs")]);
    assert.equal(rule0.status, 0, `framework-check must PASS on a fresh init:\n${rule0.stdout}${rule0.stderr}`);
    assert.match(rule0.stdout, /framework check: PASS/);
    assert.match(rule0.stdout, /Stop hook\s+refuses a FAIL receipt/);

    // The instrument reverts everything it plants, or it is a tool that eats
    // work. Compared against how it FOUND the tree — the lane's own receipt and
    // journal are its outputs, not the instrument's plants.
    assert.equal(git(dir, ["status", "--porcelain"]).stdout, before, "framework-check must leave the tree as it found it");
  } finally {
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  }
});

test("the generated profile satisfies the loader's contract with no human editing it — the skeleton IS the spec", async () => {
  const dir = foreignRepo();
  try {
    assert.equal(node(dir, [CLI, "harness", "init", "--target-dir", dir]).status, 0);
    const entry = path.join(dir, profileEntryRel("svc"));
    assert.ok(fs.existsSync(entry), "init must write the profile it named in the manifest");
    const mod = await import(entry);
    assert.deepEqual(validateProfileModule(mod, "svc"), { ok: true });

    // Five REQUIRED exports, and the four optional ones present as commented
    // blocks carrying their true field names — every one of them was an
    // undocumented guess in the fuelled-api adoption report.
    const src = fs.readFileSync(entry, "utf8");
    for (const optional of ["artifacts", "governable", "ladder", "plants"]) {
      assert.match(src, new RegExp(`//\\s*export (?:function |const )?${optional}\\b`), `${optional} must be present and commented`);
    }
    assert.match(src, /testFileBasename/, "the plants block must carry its real field names");
    assert.match(src, /deviceExecution/, "the ladder block must carry its real field names");
  } finally {
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  }
});

test("init never clobbers: a second run changes nothing and says so", () => {
  const dir = foreignRepo();
  try {
    assert.equal(node(dir, [CLI, "harness", "init", "--target-dir", dir]).status, 0);
    const before = fs.readFileSync(path.join(dir, "qa", "harness-manifest.json"), "utf8");
    const again = node(dir, [CLI, "harness", "init", "--target-dir", dir]);
    assert.equal(again.status, 0);
    assert.match(again.stdout, /already exists/);
    assert.equal(fs.readFileSync(path.join(dir, "qa", "harness-manifest.json"), "utf8"), before);
  } finally {
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  }
});

test("the vendor set is the SPINE — no profile tool and no profile-coupled lib rides into a foreign repo", () => {
  const rels = vendorPlan().map((v) => v.rel);
  for (const tool of PROFILE_TOOLS) {
    assert.ok(!rels.includes(`qa/${tool}`), `${tool} is the cmp profile's tool and must not be vendored`);
  }
  for (const lib of PROFILE_LIB) {
    // a11y.mjs imports ./profiles/cmp/tree.mjs — vendored into a repo with no
    // cmp profile it is a module that cannot load. This is the ONE real import
    // edge from the spine into a profile, which is why the list is not empty.
    assert.ok(!rels.includes(`qa/lib/${lib}`), `${lib} imports a profile and must not be vendored`);
  }
  // The spine itself must be there, or init writes a lane that cannot run.
  for (const required of ["qa/verify.mjs", "qa/receipt-check.mjs", "qa/framework-check.mjs", "qa/watch.mjs", "qa/lib/profile-loader.mjs", "qa/lib/spec-model.mjs", "qa/evidence/schema.json"]) {
    assert.ok(rels.includes(required), `${required} is part of the spine`);
  }
  assert.ok(!rels.some((r) => r.includes("/profiles/")), "no profile ships with the spine — there is no default profile");
});

test("the surface seed always covers qa/, because the declarations the lane reads live there", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "seed-"));
  try {
    fs.mkdirSync(path.join(base, "services"));
    fs.mkdirSync(path.join(base, "node_modules"));
    // init reads the tree BEFORE it writes qa/, so a naive seed misses the very
    // files that declare what the lane attests — the hole harness-region.mjs
    // exists to close, reopened at the moment of adoption.
    assert.deepEqual(seedSurface(base), ["qa", "services"]);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("a profile id is derived from the directory, and an underivable one is refused rather than guessed", () => {
  assert.equal(slugProfileId("fuelled-api"), "fuelled-api");
  assert.equal(slugProfileId("My Service"), "my-service");
  assert.equal(slugProfileId("2024"), null);
  assert.equal(slugProfileId(""), null);
  assert.equal(manifestFor("svc", ["services"]).profile.id, "svc");
  assert.deepEqual(manifestFor("svc", []).citationRoots, ["src"], "an undetectable source root falls back visibly, in the manifest");
});

test("the absent-manifest refusal names a command that can actually help a foreign repo", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "absent-"));
  try {
    const reason = absentManifestReason(base);
    // The dead end this replaced: it named `create-cmp attach`, which refuses
    // any repo without a Compose/KMP plugin signal and does not write a lane in
    // any case. A cold adopter could not get past it without reading the engine.
    assert.match(reason, /create-cmp harness init/);
    assert.ok(!/create-cmp attach/.test(reason), "attach cannot serve a non-Compose repo and must not be offered to one");
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("the generated skeleton reads the SpecModel by its real field names", () => {
  // Both of the author's first-run bugs were here: `model.specs` (the field is
  // `specsDir`) and `r.ok` on the integrity result (it carries `status`, with
  // three values). A skeleton that is the spec has to be right about the API it
  // demonstrates, or it teaches the next adopter the same two mistakes.
  const src = profileSkeleton("demo", { sourceRoots: ["src"], tiers: ["unit"] });
  assert.match(src, /model\.specsDir/);
  assert.ok(!/model\.specs\b(?!Dir)/.test(src), "the SpecModel field is specsDir");
  assert.match(src, /r\.status === "intact"/);
  assert.match(src, /r\.status === "unlocked" \? "SKIP"/, "unlocked is not a failure — nothing is proven and nothing is wrong");
  assert.ok(!/r\.ok\b/.test(src), "checkHarnessIntegrity returns status, never ok");
});
