// `create-cmp harness init` DELEGATES to the same `runHarnessInit` as
// `prooflane init`, so the two doors take the same flags. Their help did not
// say so: `prooflane --help` named `--new-profile`, and create-cmp's
// `harness init flags:` block, and the usage it prints for an unknown `harness`
// subcommand, did not (KD-4). An adopter who came in through create-cmp met a
// profile collision whose remedy names a flag their door's help never listed.
//
// THE INVARIANT is over the pair, like test/install-flag-its-own-help-never-names
// is for prooflane: every flag `packages/harness/install/init.mjs` branches on is
// named in BOTH places create-cmp prints the `harness init` flag list. The oracle
// is the printed text, not the source — the help is what an adopter reads.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(REPO_ROOT, "bin", "create-cmp.mjs");
const INIT = path.join(REPO_ROOT, "packages", "harness", "install", "init.mjs");

/** Comments out, strings kept: `flagBool(flags, "dry-run")` names its flag inside a string. */
const codeOf = (raw) => raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

function initBranchesOn() {
  const code = codeOf(fs.readFileSync(INIT, "utf8"));
  const out = new Set();
  for (const m of code.matchAll(/flagBool\(\s*flags\s*,\s*"([^"]+)"|\bflags\s*(?:\[\s*"([^"]+)"\s*\]|\.([A-Za-z_$][\w$]*))/g)) {
    out.add(m[1] ?? m[2] ?? m[3]);
  }
  return out;
}

const flagsIn = (text) => new Set([...text.matchAll(/--([a-z][a-z0-9-]*)/g)].map((m) => m[1]));

function run(args) {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd: REPO_ROOT, encoding: "utf8" });
  return { code: r.status, out: String(r.stdout ?? ""), err: String(r.stderr ?? "") };
}

test("create-cmp's `harness init flags:` block and its usage line name every flag init branches on", () => {
  const branched = initBranchesOn();
  assert.ok(branched.size >= 4, `found ${branched.size} flags branched on in init.mjs — this test is inert`);
  assert.ok(branched.has("new-profile"), "init.mjs no longer branches on --new-profile — re-read KD-4 before trusting this test");

  const help = run(["--help"]).out;
  const at = help.indexOf("harness init flags:");
  const end = help.indexOf("harness relock flags:", at);
  assert.ok(at !== -1 && end !== -1, `create-cmp --help no longer prints a \`harness init flags:\` block:\n${help}`);
  const block = help.slice(at, end);

  const refusal = run(["harness", "no-such-subcommand"]);
  assert.equal(refusal.code, 2, `an unknown harness subcommand exited ${refusal.code}:\n${refusal.err}`);
  const usage = refusal.err.split("\n").find((l) => l.includes("create-cmp harness init")) ?? "";
  assert.notEqual(usage, "", `the unknown-subcommand refusal no longer prints a harness init usage line:\n${refusal.err}`);

  const missing = [];
  for (const [where, text] of [
    ["the `harness init flags:` block of create-cmp --help", block],
    ["the usage line of the unknown-subcommand refusal", usage],
  ]) {
    const named = flagsIn(text);
    for (const flag of [...branched].sort()) if (!named.has(flag)) missing.push(`  --${flag} is not in ${where}`);
  }
  assert.deepEqual(missing, [], `create-cmp harness init branches on a flag its help does not name:\n${missing.join("\n")}`);
});
