// A BOOLEAN FLAG MUST NOT SWALLOW THE DIRECTORY THE USER NAMED.
//
// Both CLIs parse `--k <next>` as "k has the value next" whenever `next` does
// not itself start with `--`. Nothing tells either parser which flags take a
// value, so a bare boolean eats the positional after it and the command runs
// against a directory nobody asked for. Measured 2026-09-11 (KD-7):
//
//   $ cd cwdtest2 && prooflane init --new-profile ../pFlag2
//     project: …/cwdtest2          ← not ../pFlag2
//
// 52 files into the wrong repo, exit 0. `--dry-run <dir>` is the same shape and
// additionally reports on a tree the user did not name.
//
// WHY THE FIX IS A BOOLEAN LIST AND NOT A VALUE LIST, because the direction is
// the whole safety argument: `--profile foo` and `--new-profile foo` are
// syntactically identical, so a parser cannot decide between them without being
// told something. Told which flags are BOOLEAN, a name accidentally left off the
// list keeps today's behaviour — the bug, unchanged, for that one flag. Told
// which flags take a VALUE, a name left off turns a working value flag into a
// boolean and drops its value into the positionals, which is a NEW break in
// something that worked. Same omission, and only one of the two directions
// invents a defect.
//
// The invariant is over the pair — every boolean flag × a positional after it —
// rather than over the two spellings that were measured, so a flag added to
// either CLI tomorrow is covered by the same assertion.
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseArgs as parseHarnessArgs, BOOLEAN_FLAGS as HARNESS_BOOLEANS } from "../packages/harness/install/args.mjs";
import { parseArgs as parseCliArgs, BOOLEAN_FLAGS as CLI_BOOLEANS } from "../src/lib/args.mjs";

const CLIS = [
  { name: "prooflane", parse: (argv) => { const r = parseHarnessArgs(argv); return { flags: r.flags, positionals: r.positionals }; }, booleans: HARNESS_BOOLEANS },
  { name: "create-cmp", parse: (argv) => { const r = parseCliArgs(argv); return { flags: r.flags, positionals: r._ }; }, booleans: CLI_BOOLEANS },
];

test("a boolean flag before a directory leaves the directory a positional", () => {
  const lost = [];
  for (const cli of CLIS) {
    assert.ok(cli.booleans.size > 0, `${cli.name} declares no boolean flags, so nothing is protected`);
    for (const flag of cli.booleans) {
      // The order the help itself suggests: `init [dir] … [--flag]` read right
      // to left is `--flag <dir>`, which is exactly the order that broke.
      const { flags, positionals } = cli.parse([`--${flag}`, "../target-dir"]);
      if (positionals[0] !== "../target-dir" || flags[flag] !== true) {
        lost.push(`${cli.name}: --${flag} ../target-dir → flags[${flag}]=${JSON.stringify(flags[flag])}, positionals=${JSON.stringify(positionals)}`);
      }
    }
  }
  assert.deepEqual(
    lost,
    [],
    "each line is a boolean flag that consumed the directory after it. The command then runs against " +
      `the current directory instead — for \`init\` that is 52 files written into a repo the user did not name, ` +
      "and exit 0:\n  " + lost.join("\n  "),
  );
});

test("a flag that genuinely takes a value still takes it", () => {
  // The control, and the reason this file cannot be satisfied by making every
  // flag boolean: the fix must not turn `--profile svc` into a boolean plus a
  // stray positional. Both CLIs parse `--profile`; neither may list it.
  for (const cli of CLIS) {
    assert.equal(cli.booleans.has("profile"), false, `${cli.name} lists \`profile\` as boolean, and it takes a value`);
    const { flags, positionals } = cli.parse(["--profile", "svc", "../target-dir"]);
    assert.equal(flags.profile, "svc", `${cli.name}: --profile lost its value`);
    assert.deepEqual(positionals, ["../target-dir"], `${cli.name}: --profile ate the directory or dropped its value into positionals`);
  }
});

test("a trailing boolean, and prooflane's `--flag=value`, are unchanged", () => {
  // The `=` form is asserted for prooflane ONLY, because only prooflane parses
  // it. create-cmp's parser has never split on `=` — `--profile=svc` becomes a
  // flag literally named `profile=svc` — and its help has never offered the
  // form. That is a real gap and it is KD-14, not this slice: widening a test
  // until it covers a second defect is how a bounded fix stops being one.
  const eq = parseHarnessArgs(["--profile=svc", "../dir"]);
  assert.equal(eq.flags.profile, "svc", "prooflane: --flag=value broke");
  assert.deepEqual(eq.positionals, ["../dir"]);

  for (const cli of CLIS) {
    const [firstBoolean] = [...cli.booleans];
    const trailing = cli.parse(["../dir", `--${firstBoolean}`]);
    assert.equal(trailing.flags[firstBoolean], true, `${cli.name}: a trailing boolean stopped being true`);
    assert.deepEqual(trailing.positionals, ["../dir"]);
  }
});
