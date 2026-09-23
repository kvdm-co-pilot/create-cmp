// A DRY RUN PRINTS "GREEN — BUILD PROVEN." FOR A BUILD THAT NEVER RAN.
//
// `create-cmp verify --dry-run` prints the commands it would run, then the
// verdict table, then — measured on `8a0b7fc`, in a Gradle project outside this
// repository:
//
//   › verify.android: ./gradlew :composeApp:assembleDebug
//     · android  skipped
//   GREEN — build proven.
//   ::create-cmp-verdict::{"green":true,…,"ran":false,…}
//   Dry run — commands printed, nothing executed; the build is NOT proven.
//
// Three lines, and the first two say the opposite of the third. The adopter's
// eye lands on `GREEN — build proven.`; an agent's grep lands on the marker
// line, which says `"green":true` for a build that never started. The last line
// is the true one and it is last. `runVerify` pushes `code: 0, ran: false` for
// every command it did not run, so `verdict.green` stays true and
// `printVerifyVerdict` reports proof of a build nobody ran.
//
// A dry run has no verdict to print. It prints what it would have executed and
// says so, and that is the whole of its output.
//
// WHICH SPELLINGS: derived, not listed. `flagBool` resolves ten spellings of a
// declared boolean and five of them mean "dry run"; this file asks the tree's
// own `parseArgs` + `flagBool` which five, and drives those. The other five are
// deliberately NOT driven: they are not dry runs, so each would start a real
// Gradle build — minutes, a toolchain, and a network — for an assertion about a
// sentence. `a-dry-run-asked-for-by-the-other-name-writes-the-catalog.test.mjs`
// is where all ten are driven end to end, at a command that writes without
// building.
//
// WHY NOT `/proven\./`: the honest sentence a dry run prints ends in "the build
// is NOT proven.", so a regex that refuses `proven.` refuses the fix as well as
// the defect. What is refused here is the CLAIM — `GREEN`, `build proven`, and
// the machine-readable verdict line an agent parses — while the sentence that
// tells the truth is required to still be there.
//
// `clean --dry-run` is driven beside it because it is the same shape of command
// and is cheap to run. `harden --dry-run` is not: reaching its dry-run branch
// scaffolds two complete apps into temp directories to compute the plan. Read
// instead, on this tree: neither `src/commands/clean.mjs` nor
// `src/commands/harden.mjs` contains the words `GREEN` or `proven` at all, and
// both dry-run branches print one sentence — "nothing deleted", "nothing
// written". Only `verify` claims proof, because only `verify` has a verdict.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parseArgs, flagBool } from "../src/lib/args.mjs";
import { resolveVerifyCommands } from "../src/commands/verify.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CREATE_CMP = path.join(ROOT, "bin", "create-cmp.mjs");
const PLAIN = /\u001B\[[0-9;]*m/g;

/** Every way the tri-state contract lets one declared boolean be stated. */
function spellings(name) {
  return [
    [`--${name}`],
    [`--${name}`, "true"],
    [`--${name}=true`],
    [`--${name}`, "false"],
    [`--${name}=false`],
    [`--no-${name}`],
    [`--no-${name}`, "true"],
    [`--no-${name}=true`],
    [`--no-${name}`, "false"],
    [`--no-${name}=false`],
  ];
}

/** The ones THIS TREE calls a dry run — asked of the tree, not of the test. */
const dryRunSpellings = () => spellings("dry-run").filter((s) => flagBool(parseArgs(s).flags, "dry-run", false));

/** A Gradle-looking project outside this repository. */
function project(prefix) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  const rel = path.relative(ROOT, dir);
  assert.ok(rel.startsWith("..") || path.isAbsolute(rel), `the fixture ${dir} is inside the repository ${ROOT}`);
  fs.writeFileSync(path.join(dir, "settings.gradle.kts"), "// a Gradle settings file\n");
  return dir;
}

function snapshot(root, rel = "", into = new Map()) {
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) snapshot(root, r, into);
    else into.set(r, fs.readFileSync(path.join(root, r)).toString("base64"));
  }
  return into;
}

function run(argv, cwd) {
  const r = spawnSync(process.execPath, [CREATE_CMP, ...argv], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60_000,
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}`.replace(PLAIN, "") };
}

test("the contract still calls five of the ten spellings a dry run, so this file drives five", () => {
  // If `flagBool` changes, the set below changes with it and the assertions
  // follow — that is why nothing here is written out by hand.
  assert.equal(dryRunSpellings().length, 5, "the tri-state table has moved under this file");
});

test("`verify --dry-run` claims no verdict it did not earn, in every spelling that means a dry run", () => {
  const claimed = [];
  for (const spelling of dryRunSpellings()) {
    const dir = project("dry-run-verdict-");
    const line = `create-cmp verify ${spelling.join(" ")}`;
    try {
      const before = snapshot(dir);
      const r = run(["verify", ...spelling], dir);

      if (r.code !== 0) claimed.push(`${line} exited ${r.code}; a dry run that ran nothing has nothing to fail\n${r.out}`);
      // The claim, in the three forms it is made: the verdict line a human
      // reads, the table row, and the marker an agent greps.
      if (/GREEN/.test(r.out)) claimed.push(`${line} printed GREEN for a build that never ran:\n${r.out}`);
      if (/build proven/.test(r.out)) claimed.push(`${line} said the build was proven:\n${r.out}`);
      if (/::create-cmp-verdict::/.test(r.out)) claimed.push(`${line} emitted a machine verdict for a build that never ran:\n${r.out}`);
      // And what it MUST still say: what it would have executed, and that it did not.
      const android = resolveVerifyCommands(dir).verify.android;
      if (!r.out.includes(android)) claimed.push(`${line} did not print the command it would have run (${android}):\n${r.out}`);
      if (!/Dry run/.test(r.out)) claimed.push(`${line} did not say it was a dry run:\n${r.out}`);

      const after = snapshot(dir);
      assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), `${line} wrote into the project`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  assert.deepEqual(
    claimed,
    [],
    "a dry run printed proof of a build it never started — the line an adopter reads first says\n" +
      "GREEN and the line it says last says NOT proven:\n  " + claimed.join("\n  ")
  );
});

test("the printer itself claims no verdict for a dry run — so `create --dry-run-verify` cannot either", () => {
  // `printVerifyVerdict` has a second caller: the scaffold's own gate, which
  // `create-cmp --dry-run-verify` reaches with `dryRun: true` and then prints
  // exactly as `verify` does (src/scaffold.mjs). Driving THAT through the bin
  // stamps a whole app to reach one sentence, so the shared pair is driven
  // instead, in a child process with its own stdout: whatever `runVerify` +
  // `printVerifyVerdict` print for a dry run, every caller prints.
  const dir = project("dry-run-printer-");
  try {
    const lib = pathToFileURL(path.join(ROOT, "src", "lib", "verify.mjs")).href;
    const program =
      `const { runVerify, printVerifyVerdict } = await import(${JSON.stringify(lib)});\n` +
      `const verdict = await runVerify({ projectDir: ${JSON.stringify(dir)}, ` +
      `manifest: { verify: { android: "echo this-must-not-run" } }, config: { platforms: { ios: false } }, dryRun: true });\n` +
      `printVerifyVerdict(verdict);\n`;
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", program], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
    });
    const out = `${r.stdout}${r.stderr}`.replace(PLAIN, "");
    assert.equal(r.status, 0, `the printer did not run:\n${out}`);
    assert.doesNotMatch(out, /GREEN|build proven|::create-cmp-verdict::/, `the shared printer claimed a verdict for a dry run:\n${out}`);
    assert.match(out, /Dry run/, `the shared printer did not say it was a dry run:\n${out}`);
    assert.ok(out.includes("echo this-must-not-run"), `the dry run did not print what it would have executed:\n${out}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("`clean --dry-run` claims nothing either — the same shape, checked at the sibling command", () => {
  // With something to delete, so the dry-run branch is the one reached: a
  // `build/` dir beside the settings file is what `selectProjectCleanDirs`
  // collects.
  const dir = project("dry-run-clean-");
  try {
    fs.mkdirSync(path.join(dir, "build"));
    fs.writeFileSync(path.join(dir, "build", "output.bin"), "not really a build output\n");
    const before = snapshot(dir);
    const r = run(["clean", "--dry-run"], dir);
    assert.equal(r.code, 0, `create-cmp clean --dry-run failed:\n${r.out}`);
    assert.doesNotMatch(r.out, /GREEN|build proven|::create-cmp-verdict::/, `clean --dry-run claimed a verdict:\n${r.out}`);
    assert.match(r.out, /Dry run/, `clean --dry-run did not say it was a dry run:\n${r.out}`);
    assert.deepEqual([...snapshot(dir).keys()].sort(), [...before.keys()].sort(), "a dry run deleted something");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
