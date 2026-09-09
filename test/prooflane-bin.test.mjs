// THE HARNESS'S OWN FRONT DOOR — Stage 1 criterion A, at unit speed.
//
// `scripts/stage1-gate.mjs` proves the real thing: npm pack, install into a Go
// repo with no create-cmp, run the binary, reach a green lane. That is the
// criterion and it takes ~30s. This file is the fast half — the properties that
// would make the gate fail for a silly reason, asserted in milliseconds so they
// fail in `npm test` rather than at the stage boundary.
//
// The one property worth stating twice: TWO FRONT DOORS, ONE BEHAVIOUR.
// `create-cmp harness init` and `prooflane init` import the same module, so an
// adopter's lane does not depend on which package they found. What differs is
// the vocabulary printed back — a `prooflane` user must never be told to run a
// `create-cmp` command, because needing create-cmp is the exact thing Stage 1
// removes.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(REPO_ROOT, "packages", "harness", "bin", "prooflane.mjs");
const PKG = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "packages", "harness", "package.json"), "utf8"));

function run(args, cwd = REPO_ROOT) {
  return spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
}

/** A repo of a stack this harness has never met. */
function goRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prooflane-bin-"));
  fs.mkdirSync(path.join(root, "internal", "cart"), { recursive: true });
  fs.mkdirSync(path.join(root, "specs"), { recursive: true });
  fs.writeFileSync(path.join(root, "go.mod"), "module example.com/cartsvc\n\ngo 1.22\n");
  fs.writeFileSync(path.join(root, "internal", "cart", "cart.go"), "package cart\n\ntype Cart struct{ Items []int }\n");
  fs.writeFileSync(
    path.join(root, "internal", "cart", "cart_test.go"),
    'package cart\n\nimport "testing"\n\n// SPEC: CART-01\nfunc TestTotal(t *testing.T) { _ = &Cart{} }\n',
  );
  fs.writeFileSync(path.join(root, "specs", "cart.spec.md"), "# Cart\n\n- **CART-01** the cart totals its line items\n");
  return root;
}

test("--version names the harness whose bytes it installs", () => {
  const r = run(["--version"]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), `${PKG.name} ${PKG.version}`);
});

test("--help lists the commands; a bare invocation is not a success", () => {
  const help = run(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /prooflane init/);
  assert.match(help.stdout, /prooflane relock/);
  assert.match(help.stdout, /qa\/framework-check\.mjs/, "Rule 0 is the next step and the help must say so");

  const bare = run([]);
  assert.equal(bare.status, 2, "usage answers a question that was not asked — exit 2, not 0");
  assert.match(bare.stdout, /prooflane init/);
});

test("an unknown command is refused by name, and lists the three that exist", () => {
  // `upgrade` was the honestly-missing one here until it shipped (Stage 1 C/D).
  // The property that outlives it: a refusal names what you typed and what you
  // could have typed, rather than leaving you to guess the vocabulary.
  const r = run(["frobnicate"]);
  assert.equal(r.status, 2);
  const out = r.stdout + r.stderr;
  assert.match(out, /unknown command "frobnicate"/);
  for (const known of ["init", "relock", "upgrade"]) {
    assert.match(out, new RegExp(`prooflane ${known}`), `the refusal must name ${known}`);
  }
});

test("upgrade refuses a project with no lane, and names the command that installs one", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prooflane-upgrade-"));
  try {
    const r = run(["upgrade", "--target-dir", root]);
    assert.equal(r.status, 2, "upgrading nothing is a refusal, never a silent success");
    const out = r.stdout + r.stderr;
    assert.match(out, /no qa\/harness-manifest\.json/);
    assert.match(out, /prooflane init/);
    assert.doesNotMatch(out, /create-cmp/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("upgrade is idempotent: same version, nothing rewritten, exit 0", () => {
  const root = goRepo();
  try {
    assert.equal(run(["init", "--target-dir", root]).status, 0);
    const before = fs.readFileSync(path.join(root, "qa", "harness.lock.json"), "utf8");

    const r = run(["upgrade", "--target-dir", root]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /already at prooflane-harness/, "an upgrade that changes nothing must say so");

    const after = fs.readFileSync(path.join(root, "qa", "harness.lock.json"), "utf8");
    assert.equal(after, before, "an idempotent upgrade must not rewrite the lock — its diff is the evidence");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("init writes the provenance record, inside the lock and not adopter-owned", async () => {
  // ADR-0008's `harness.source`: recorded because the resolver knows it, never
  // counted as a check — and inside the region so a hand-edited origin cannot
  // pass unnoticed.
  const root = goRepo();
  try {
    assert.equal(run(["init", "--target-dir", root]).status, 0);
    const rec = JSON.parse(fs.readFileSync(path.join(root, "qa", "harness-source.json"), "utf8"));
    assert.equal(rec.schema, "prooflane-harness-source/1");
    assert.equal(rec.name, "prooflane-harness");
    assert.equal(rec.version, PKG.version, "the record names the artifact actually vendored");
    assert.ok(["local", "registry", "git", null].includes(rec.source));

    const lock = JSON.parse(fs.readFileSync(path.join(root, "qa", "harness.lock.json"), "utf8"));
    assert.ok(lock.files["qa/harness-source.json"], "provenance must be inside the lock, or editing it leaves no trace");

    const { isAdopterOwned } = await import("../packages/harness/src/lib/harness-region.mjs");
    assert.equal(
      isAdopterOwned("qa/harness-source.json"),
      false,
      "relock re-baselines what the adopter owns; a forged origin must never be re-lockable",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("init writes a working lane into a foreign repo and never names create-cmp", () => {
  const root = goRepo();
  try {
    const r = run(["init", "--target-dir", root]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const out = r.stdout + r.stderr;

    // The lane is there, and it is the real one.
    assert.ok(fs.existsSync(path.join(root, "qa", "verify.mjs")));
    assert.ok(fs.existsSync(path.join(root, "qa", "harness-manifest.json")));
    assert.ok(fs.existsSync(path.join(root, "qa", "harness.lock.json")));
    assert.ok(fs.existsSync(path.join(root, "qa", "evidence", "schema.json")), "the receipt contract ships with the package");

    // The vocabulary belongs to the door the adopter came through. This is the
    // whole point: a repo that installed only the harness must never be handed
    // a command from the package Stage 1 says it does not need.
    assert.doesNotMatch(out, /create-cmp/, `prooflane's output named create-cmp:\n${out}`);
    assert.match(out, /prooflane init/);

    // And the profile it wrote says so too — that header is in the adopter's
    // tree forever, so it is the copy most likely to mislead later.
    const profile = fs.readFileSync(path.join(root, "qa", "lib", "profiles", path.basename(root).toLowerCase().replace(/[^a-z0-9-]+/g, "-"), "index.mjs"), "utf8");
    assert.match(profile, /Written by `prooflane init`/);

    // Non-vacuous: a foreign repo gets no Compose tool it cannot run.
    for (const withheld of ["preview-gallery.mjs", "walkthrough.mjs", "scaffold-feature.mjs", "refusal-demo.mjs"]) {
      assert.ok(!fs.existsSync(path.join(root, "qa", withheld)), `${withheld} is the cmp profile's and must not be vendored`);
    }
    assert.ok(!fs.existsSync(path.join(root, "qa", "lib", "a11y.mjs")), "a11y.mjs cannot load without profiles/cmp/tree.mjs");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("re-running init names the command that converges an occupied tree — and that command RUNS", () => {
  // The branch most likely to lie. Its whole job is to hand the adopter the
  // NEXT command, so it must never invent one, and must not fall back to
  // naming the scaffolder either.
  //
  // THE PREMISE CHANGED, THE RULE DID NOT. This test used to assert the
  // ABSENCE of `prooflane upgrade`, because when it was written that command
  // did not exist and naming it would have been the lie. It ships now — and
  // the absence assertion silently became the lie it was built to prevent:
  // two independent adoptions (fuelled-api, pantry-api, 2026-09-09) hit this
  // exact refusal, were sent to `git restore qa/` under the words "not
  // shipped yet", and got no provenance because init returns before writing
  // it. ADR-0013's amendment records the correction: init converges a tree
  // with no manifest, `upgrade` converges an occupied one.
  //
  // So the assertion is INVERTED and STRENGTHENED. Naming the command is not
  // enough — a name is what lied last time. The command it names is executed
  // here, through the same front door, and must actually converge this tree.
  const root = goRepo();
  try {
    assert.equal(run(["init", "--target-dir", root]).status, 0);
    const again = run(["init", "--target-dir", root]);
    assert.equal(again.status, 0, "re-running is safe, never a failure");
    const out = again.stdout + again.stderr;
    assert.match(out, /already exists/);
    assert.match(out, /prooflane relock/, "the common case — an edited profile — is named first");
    assert.doesNotMatch(out, /create-cmp/, `named the scaffolder:\n${out}`);
    assert.match(out, /prooflane upgrade/, `the occupied-tree path is not named at all:\n${out}`);
    assert.doesNotMatch(out, /not shipped yet/, `still tells the adopter a shipped command is unavailable:\n${out}`);

    // THE PLANT: run what the refusal just told them to run. A door that names
    // a command it cannot dispatch is the same defect wearing a truer name.
    const upgraded = run(["upgrade", "--target-dir", root]);
    assert.equal(upgraded.status, 0, `the named command failed:\n${upgraded.stdout}${upgraded.stderr}`);
    const upOut = upgraded.stdout + upgraded.stderr;
    assert.doesNotMatch(upOut, /undefined/, `the command announced itself as "undefined":\n${upOut}`);
    assert.match(upOut, /prooflane upgrade/, "it names itself, from the same FRONT_DOORS table");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a stamped app records provenance too — and its upgrade moves lock digests", async () => {
  // The gap this closes: `prooflane upgrade` moved an adopter's digests on a
  // version bump (Stage 1 criterion D), while `create-cmp upgrade --harness`
  // moved a stamped app's lock `version` and not one digest — the shape the
  // criterion forbids, one front door over.
  const { writeHarnessSource, readHarnessSource, HARNESS_PKG_NAME } = await import(
    "../packages/harness/src/lib/harness-source.mjs"
  );
  const { hashHarnessRegion } = await import("../packages/harness/src/lib/harness-region.mjs");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stamped-provenance-"));
  try {
    fs.mkdirSync(path.join(root, "qa", "lib"), { recursive: true });
    fs.writeFileSync(path.join(root, "qa", "verify.mjs"), "// engine\n");

    writeHarnessSource(root, { name: HARNESS_PKG_NAME, version: "0.20.0", source: "local" });
    const before = hashHarnessRegion(root);

    writeHarnessSource(root, { name: HARNESS_PKG_NAME, version: "0.21.0", source: "local" });
    const after = hashHarnessRegion(root);

    assert.notEqual(
      before.files["qa/harness-source.json"],
      after.files["qa/harness-source.json"],
      "a version-only upgrade must move a digest in the TREE, not only a number in the lock",
    );
    assert.equal(before.files["qa/verify.mjs"], after.files["qa/verify.mjs"], "engine bytes that did not change must not move");
    assert.equal(readHarnessSource(root).version, "0.21.0");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("relock through this door refuses with prooflane's vocabulary, not create-cmp's", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prooflane-relock-"));
  try {
    // No lane at all: the refusal must point at the command that installs one.
    const r = run(["relock", "--target-dir", root]);
    assert.notEqual(r.status, 0, "relocking a repo with no lane is a refusal");
    const out = r.stdout + r.stderr;
    assert.match(out, /prooflane init/);
    assert.doesNotMatch(out, /create-cmp/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
