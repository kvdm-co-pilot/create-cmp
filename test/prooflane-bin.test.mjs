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

test("an unknown command names what exists AND what does not yet", () => {
  const r = run(["upgrade"]);
  assert.equal(r.status, 2);
  const out = r.stdout + r.stderr;
  assert.match(out, /unknown command "upgrade"/);
  assert.match(out, /not shipped yet/, "a missing command must be named as missing, never silently unknown");
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

test("re-running init names no command this door does not have", () => {
  // The branch most likely to lie. Its whole job is to hand the adopter the
  // NEXT command, and until `prooflane upgrade` exists there is no harness-side
  // re-vendor to send them to — so it must not invent one, and must not fall
  // back to naming the scaffolder either.
  const root = goRepo();
  try {
    assert.equal(run(["init", "--target-dir", root]).status, 0);
    const again = run(["init", "--target-dir", root]);
    assert.equal(again.status, 0, "re-running is safe, never a failure");
    const out = again.stdout + again.stderr;
    assert.match(out, /already exists/);
    assert.match(out, /prooflane relock/, "the common case — an edited profile — is named first");
    assert.doesNotMatch(out, /create-cmp/, `named the scaffolder:\n${out}`);
    assert.doesNotMatch(out, /prooflane upgrade/, `named a command that does not exist:\n${out}`);
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
