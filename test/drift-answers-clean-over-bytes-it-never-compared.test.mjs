// A CLEAN ANSWER MUST MEAN "I COMPARED, AND THEY MATCH" — never "I did not look".
//
// `publishedBytesDrift()` exists because a version number named two trees and the
// check said it held. Its own header says the rule it is built on: "NOT DERIVABLE
// IS A RESULT, NEVER A PASS. A derivation that answers 'nothing drifted' when it
// could not look is the same vacuity one level up." This file is that sentence as
// a test. It refuses the CLASS the sentence names — every route by which the
// comparison can skip bytes and still return `derivable: true` with an empty
// drift list — because a guard whose blind spots are silent is the guard that was
// green over `create-cmp-cli@0.25.0` for sixty-six files.
//
// Three routes, all measured against this tree on 2026-09-16, all of them
// answering CLEAN over bytes that really did change:
//
//   1. A `files` entry that is gone from the working tree is filtered out by
//      `fs.existsSync` and never compared. Delete ONE file inside
//      `packages/receipts/src` → correctly reported. Delete the WHOLE `src`
//      directory — the entire shipped source of the package — and both
//      `prooflane-receipts` and `create-cmp-cli` (which ships it too) read CLEAN.
//      The filter buys nothing: `git diff` and `git ls-files` both exit 0 on a
//      pathspec that matches nothing.
//
//   2. A history too short to reach the commit that set the version anchors on
//      whatever commit the history happens to end at, and reports that anchor as
//      if it were the real one. Measured: the same bytes, the same planted drift,
//      a full clone says `create-cmp-cli` drifted by one file, a `--depth 1` clone
//      says `derivable: true` and nothing drifted, and all four assertions in
//      test/a-version-number-cannot-name-two-different-trees.test.mjs pass.
//      This is not hypothetical: .github/workflows/ci.yml runs `npm test` after
//      `actions/checkout@v4` with no `fetch-depth`, and that action's default is
//      1. The new gate is green by construction on every PR.
//
//   3. `git ls-files --others --exclude-standard` cannot see a file npm packs.
//      The code comments the opposite — "`--exclude-standard` keeps ignored build
//      output out, which is also what npm does with it" — and npm's rule is the
//      reverse: a path inside a `files` entry CANNOT be excluded by .gitignore or
//      .npmignore. Measured on the registry, not argued: the published
//      `create-cmp-cli@0.25.0` tarball contains
//      `package/template/.gradle/8.11.1/checksums/checksums.lock` and six more of
//      the publisher's local Gradle state, and `src/lib/fsutil.mjs`'s `copyDir`
//      has no exclusion list, so every `npx create-cmp-cli` copies them into the
//      adopter's new project. Those seven files are exactly the ones this
//      derivation cannot see change.
//
// EACH TEST CARRIES ITS OWN POSITIVE CONTROL. The fixture plants an ordinary
// change first and asserts the derivation DOES report it; only then does it plant
// the defect. Without that, a fixture that silently built the wrong repo would
// make every assertion here pass by measuring nothing — which is the defect this
// file is about, one level up again.
import { test } from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { publishedBytesDrift, driftingPackages } from "../scripts/ground-truth.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// A REAL MANIFEST, BORROWED. `publishedBytesDrift(gt, { cwd })` runs git in `cwd`
// but reads each manifest from this repo's ROOT, so a fixture repo must carry the
// same package at the same relative path for the two halves to describe one
// package. `packages/receipts` is the smallest one that ships a directory.
const BORROWED = "packages/receipts";
const MANIFEST_BYTES = fs.readFileSync(path.join(ROOT, BORROWED, "package.json"), "utf8");
const MANIFEST = JSON.parse(MANIFEST_BYTES);
const SHIPPED_DIR = (MANIFEST.files ?? []).find((f) =>
  fs.statSync(path.join(ROOT, BORROWED, f), { throwIfNoEntry: false })?.isDirectory(),
);

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" });
const gt = (version = MANIFEST.version) => ({
  npm: { primary: { name: MANIFEST.name, version, dir: BORROWED }, independent: [], aliases: [] },
});
const ask = (cwd) => publishedBytesDrift(gt(), { cwd });
/** The shape this whole file refuses: "I looked, and nothing changed." */
const readsClean = (drift) => drift.derivable && driftingPackages(drift).length === 0;
const say = (drift) =>
  `derivable=${drift.derivable}${drift.why ? ` why=${drift.why}` : ""} drifting=${JSON.stringify(
    driftingPackages(drift).map((p) => p.changed),
  )}`;

/** A repo holding one real package at its real path, with one commit that SET the version. */
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-fixture-"));
  const pkg = path.join(dir, BORROWED);
  fs.mkdirSync(path.join(pkg, SHIPPED_DIR), { recursive: true });
  fs.writeFileSync(path.join(pkg, "package.json"), MANIFEST_BYTES);
  fs.writeFileSync(path.join(pkg, SHIPPED_DIR, "one.mjs"), "export const v = 1;\n");
  fs.writeFileSync(path.join(pkg, SHIPPED_DIR, "two.mjs"), "export const w = 1;\n");
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "test@example.invalid");
  git(dir, "config", "user.name", "fixture");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", `set ${MANIFEST.name}@${MANIFEST.version}`);
  return { dir, pkg, rm: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test("the fixture borrows a package that actually ships a directory", () => {
  // Without this every test below would plant its change somewhere the
  // derivation was never asked to look, and pass for the wrong reason.
  assert.ok(
    SHIPPED_DIR,
    `${BORROWED}/package.json declares no \`files\` entry that is a directory on disk, so the fixtures in ` +
      `this file cannot plant a shipped change and nothing here measures anything`,
  );
});

test("a shipped path the anchor HAS and the worktree does not is dropped instead of compared", () => {
  const { dir, pkg, rm } = fixture();
  try {
    // Control: one file inside the shipped directory changes, and it is seen.
    fs.writeFileSync(path.join(pkg, SHIPPED_DIR, "one.mjs"), "export const v = 2;\n");
    assert.equal(
      readsClean(ask(dir)),
      false,
      `the fixture is not wired: a changed file inside \`${SHIPPED_DIR}\` was not reported — ${say(ask(dir))}`,
    );

    // The defect: the same change, plus the rest of the directory removed. npm
    // would publish a tarball missing the package's entire source under a number
    // the registry already serves.
    fs.rmSync(path.join(pkg, SHIPPED_DIR), { recursive: true });
    const drift = ask(dir);
    assert.equal(
      readsClean(drift),
      false,
      `${MANIFEST.name} reads CLEAN with its whole \`${SHIPPED_DIR}\` directory deleted. The anchor commit has ` +
        `those files and the tarball would not, which is two trees under one number — the property this ` +
        `derivation exists to refuse. \`watched\` filters every declared path through \`fs.existsSync\`, so a ` +
        `path that is GONE is not compared but forgiven; delete one file of a directory and it is caught, ` +
        `delete the directory and it is not. The filter protects nothing: \`git diff --name-only <anchor> -- ` +
        `no/such/path\` and \`git ls-files --others -- no/such/path\` both exit 0. Got ${say(drift)}`,
    );
  } finally {
    rm();
  }
});

test("a history too short to reach the version's own commit anchors on the boundary and calls it clean", () => {
  const { dir, pkg, rm } = fixture();
  const shallow = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "drift-shallow-")), "clone");
  try {
    // A shipped file changes and is COMMITTED without a bump — the exact shape
    // that was live for sixty-six files. Full history: reported.
    fs.writeFileSync(path.join(pkg, SHIPPED_DIR, "one.mjs"), "export const v = 2;\n");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "change a shipped file, no bump");
    assert.equal(readsClean(ask(dir)), false, `the fixture is not wired: committed drift went unreported — ${say(ask(dir))}`);

    // The same bytes, the same HEAD, a history that stops one commit short of the
    // commit that set the version. This is what `actions/checkout@v4` hands CI.
    execFileSync("git", ["clone", "-q", "--depth", "1", `file://${dir}`, shallow]);
    assert.equal(git(shallow, "rev-parse", "--is-shallow-repository").trim(), "true", "the fixture clone is not shallow");
    assert.equal(
      git(shallow, "rev-parse", "HEAD").trim(),
      git(dir, "rev-parse", "HEAD").trim(),
      "the shallow clone is not at the same commit, so the two answers below are not about one tree",
    );

    const drift = ask(shallow);
    assert.equal(
      readsClean(drift),
      false,
      `the same bytes read CLEAN here and DRIFTED in the full clone. The walk stops at whatever commit the ` +
        `history ends at and reports it as \`setAt\` — indistinguishable from the commit that really set the ` +
        `version — so everything older than the boundary is forgiven and \`derivable\` still says true. ` +
        `.github/workflows/ci.yml checks out with \`actions/checkout@v4\` and no \`fetch-depth\`, whose default ` +
        `is 1, so this is the answer the new gate gives on every PR. A derivation that cannot see the commit it ` +
        `anchors on must say so (\`derivable: false\`) or refuse to call the boundary an anchor; it may not pass. ` +
        `Got ${say(drift)}`,
    );
  } finally {
    rm();
    fs.rmSync(path.dirname(shallow), { recursive: true, force: true });
  }
});

test("a file npm packs and git ignores is never compared — and npm packs them today", () => {
  const { dir, pkg, rm } = fixture();
  try {
    // npm's rule, from its own docs: a path inside a `files` entry cannot be
    // excluded by .gitignore or .npmignore. So an ignored file under a shipped
    // directory SHIPS, while `--exclude-standard` hides it from the comparison.
    fs.writeFileSync(path.join(pkg, ".gitignore"), `${SHIPPED_DIR}/ignored.mjs\n`);
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "declare the ignore rule");
    fs.writeFileSync(path.join(pkg, SHIPPED_DIR, "ignored.mjs"), "export const local = 1;\n");

    const packed = JSON.parse(
      execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: pkg, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
    )[0].files.map((f) => f.path);
    assert.ok(
      packed.includes(`${SHIPPED_DIR}/ignored.mjs`),
      `npm did not pack the ignored file, so this test proves nothing about the derivation — packed: ${packed.join(", ")}`,
    );

    const drift = ask(dir);
    assert.equal(
      readsClean(drift),
      false,
      `npm would publish a file this derivation cannot see. \`changedSince\` asks git with ` +
        `\`--exclude-standard\`, whose comment claims that "is also what npm does with it"; npm's rule is the ` +
        `opposite for anything under a \`files\` entry. This is not a fixture-only hazard: the PUBLISHED ` +
        `create-cmp-cli@0.25.0 tarball carries seven of them (package/template/.gradle/**), copyDir ships them ` +
        `into every scaffolded app, and their bytes may change under an unchanged version number with this ` +
        `check green. Got ${say(drift)}`,
    );
  } finally {
    rm();
  }
});

// ROUND 2 — THE FIX'S OWN NEW BEHAVIOUR. `unseenByGit` prunes git's ignored
// candidates with the derivation's own reading of a leading `!` BEFORE npm is
// asked, and that reading ignores order. npm does not: a negation above the
// entry that includes the path is a no-op, and a later plain entry re-includes
// what a negation removed. Either way npm packs the ignored file, the candidate
// list is already empty, npm is never spawned, and the answer is `derivable:
// true` with nothing drifting — finding 3 again, one construct over. The first
// shape is what alphabetising `files` produces (`!` sorts before letters). The
// invariant: WHETHER npm packs a git-invisible file is npm's answer, never a
// second spelling of npm's rules in this derivation.
test("an ignored file npm packs reads CLEAN when a `!` entry the derivation honours is one npm does not", () => {
  const shapes = {
    control: ["tpl"],
    "negation above the include": ["!tpl/.cache", "tpl"],
    "re-included after the negation": ["tpl", "!tpl/.cache", "tpl/.cache/x.lock"],
  };
  const answers = {};
  for (const [shape, files] of Object.entries(shapes)) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-negation-"));
    try {
      fs.mkdirSync(path.join(dir, "tpl/.cache"), { recursive: true });
      fs.writeFileSync(path.join(dir, "package.json"), `${JSON.stringify({ name: "negation-fixture", version: "1.0.0", files }, null, 2)}\n`);
      fs.writeFileSync(path.join(dir, "tpl/a.txt"), "a\n");
      fs.writeFileSync(path.join(dir, ".gitignore"), "tpl/.cache/\n");
      git(dir, "init", "-q", "-b", "main");
      git(dir, "config", "user.email", "test@example.invalid");
      git(dir, "config", "user.name", "fixture");
      git(dir, "add", "-A");
      git(dir, "commit", "-q", "-m", "set negation-fixture@1.0.0");
      fs.writeFileSync(path.join(dir, "tpl/.cache/x.lock"), "another machine's state\n");

      const packed = JSON.parse(
        execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
      )[0].files.map((f) => f.path);
      assert.ok(packed.includes("tpl/.cache/x.lock"), `[${shape}] npm does not pack the ignored file, so this shape proves nothing — packed: ${packed.join(", ")}`);

      const drift = publishedBytesDrift(
        { npm: { primary: { name: "negation-fixture", version: "1.0.0", dir: "." }, independent: [], aliases: [] } },
        { cwd: dir },
      );
      answers[shape] = readsClean(drift) ? `CLEAN (${say(drift)})` : "refused";
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  assert.equal(answers.control, "refused", `the fixture is not wired: the plain shape did not refuse — ${answers.control}`);
  assert.deepEqual(
    answers,
    Object.fromEntries(Object.keys(shapes).map((s) => [s, "refused"])),
    "npm packs `tpl/.cache/x.lock` in every shape above, and git cannot see it in any. The derivation dropped it from " +
      "the candidates by its own order-blind reading of `!` before npm was asked, so npm was never spawned and the " +
      "answer was CLEAN. Let npm decide every ignored candidate under a shipped path; a leading-`!` prefix match is " +
      "a second spelling of npm's `files` rules and it disagrees with npm on order.",
  );
});
