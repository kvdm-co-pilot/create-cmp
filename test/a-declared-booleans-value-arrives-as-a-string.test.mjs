// A DECLARED BOOLEAN'S VALUE FORM ARRIVES AT ITS READER AS A STRING.
//
// `consumesNext` lets `--dry-run true` past because the tri-state contract
// promises the form. Both parsers then stored the TOKEN, and every reader in
// this repository treats the flag as a boolean — so the value form was wrong in
// both directions at once, which is KD-16. Measured on `8bd782a`, 2026-09-19,
// by execution:
//
//   Boolean("false") === true
//     $ create-cmp my-app --no-firebase true
//       → flagBool(flags, "firebase", true) === true — Firebase scaffolded
//         anyway, by the flag that said not to
//     $ prooflane init --new-profile false --dry-run --no-interview <claimed>
//       → "✓ 51 files written", exit 0. The claimed-tree refusal (init.mjs:950,
//         `!flags["new-profile"]`) never fired: "false" is truthy
//
//   "true" !== true, and ~24 read sites are spelled `=== true`
//     $ create-cmp upgrade --dry-run true --yes
//       → "(auto-yes)", "✓ wrote gradle/libs.versions.toml", "Applied."
//     $ create-cmp doctor --fix true      → flags.fix === true is FALSE: fixes
//         nothing, and `!flags.fix` is also false, so it prints no advice either
//     $ create-cmp my-app --minimal true  → create.mjs:80 reads it through
//         flagBool (harness stripped) and create.mjs:168 reads `!== true` (the
//         interview pre-answer): one argv, two answers, in one command
//
// THE FIX IS AT THE PARSER, and that is the whole of why this file pins the
// parser's RETURN SHAPE as hard as it pins the readers. A declared boolean that
// consumes `true`/`false` now stores the boolean, which makes every existing
// `=== true`, `!== true`, `Boolean(...)` and bare-truthiness site right at both
// front doors without one of them being touched — and makes what `parseArgs`
// returns a thing other code depends on.
//
// WHAT IS DELIBERATELY NOT REFUSED: the SPACE form holding anything else.
// `--dry-run maybe ../app` leaves `maybe` a positional, because `--minimal
// my-app` must keep meaning a directory called `my-app` and an adopter may have
// one called `no`. Refusing it is how KD-7 comes back. Only the `=` form, which
// has no positional to lose, is refused — see the bin-driven tests at the end.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  parseArgs as parseCliArgs,
  flagBool as cliFlagBool,
  coerceDeclaredBoolean as cliCoerce,
  unreadableBooleanValues as cliUnreadable,
  BOOLEAN_FLAGS as CLI_BOOLEANS,
} from "../src/lib/args.mjs";
import {
  parseArgs as parseHarnessArgs,
  flagBool as harnessFlagBool,
  coerceDeclaredBoolean as harnessCoerce,
  unreadableBooleanValues as harnessUnreadable,
  BOOLEAN_FLAGS as HARNESS_BOOLEANS,
} from "../packages/harness/install/args.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The two spellings, behind one calling convention. */
const DOORS = [
  {
    name: "create-cmp",
    file: "src/lib/args.mjs",
    parse: (argv) => { const r = parseCliArgs(argv); return { flags: r.flags, positionals: r._ }; },
    flagBool: cliFlagBool,
    coerce: cliCoerce,
    unreadable: cliUnreadable,
    booleans: CLI_BOOLEANS,
  },
  {
    name: "prooflane",
    file: "packages/harness/install/args.mjs",
    parse: (argv) => parseHarnessArgs(argv),
    flagBool: harnessFlagBool,
    coerce: harnessCoerce,
    unreadable: harnessUnreadable,
    booleans: HARNESS_BOOLEANS,
  },
];

/**
 * `flagBool`'s contract, stated out loud rather than derived, because a table
 * derived from the implementation agrees with whatever the implementation does.
 * `x` is the affirmative name; each row is an argv fragment and what the flag
 * must then mean.
 */
const TRUTH_TABLE = [
  { argv: (x) => [`--${x}`], means: true },
  { argv: (x) => [`--${x}`, "true"], means: true },
  { argv: (x) => [`--no-${x}`, "false"], means: true },
  { argv: (x) => [`--no-${x}`], means: false },
  { argv: (x) => [`--${x}`, "false"], means: false },
  { argv: (x) => [`--no-${x}`, "true"], means: false },
];

test("every form of a declared boolean means what the contract says, at both doors", () => {
  const wrong = [];
  for (const door of DOORS) {
    for (const name of door.booleans) {
      for (const row of TRUTH_TABLE) {
        const argv = [...row.argv(name), "./my-app"];
        const { flags, positionals } = door.parse(argv);
        // The default is the OPPOSITE of what the line says, every time, so a
        // helper that silently fell through to it cannot pass by luck.
        const resolved = door.flagBool(flags, name, !row.means);
        if (resolved !== row.means) {
          wrong.push(`${door.name}: ${argv.join(" ")} → ${name}=${resolved}, and the line says ${row.means}`);
        }
        if (positionals[0] !== "./my-app") {
          wrong.push(`${door.name}: ${argv.join(" ")} → the directory is ${JSON.stringify(positionals[0])}`);
        }
      }
      // Absent: the default, and nothing else.
      for (const dflt of [true, false]) {
        const { flags } = door.parse(["./my-app"]);
        if (door.flagBool(flags, name, dflt) !== dflt) {
          wrong.push(`${door.name}: --${name} absent did not resolve to the default ${dflt}`);
        }
      }
    }
  }
  assert.deepEqual(
    wrong,
    [],
    "each line is a documented spelling of a boolean flag that does not mean what it says. " +
      "`--x true` and `--no-x false` are true; `--x false`, `--no-x` and `--no-x true` are false; " +
      "absent is the default:\n  " + wrong.join("\n  ")
  );
});

test("the parser stores the boolean, so a reader spelled `=== true` is right without being touched", () => {
  // The read sites are not imported here — they are twenty-four `=== true`,
  // `!== true` and `Boolean(...)` expressions across eight commands, and the
  // claim this makes is exactly the one the fix rests on: what `parseArgs`
  // stores is a BOOLEAN, so all of them are right by construction. The three
  // spellings are evaluated against the parsed flags below; the two commands
  // that then write with them are driven end to end in
  // `a-dry-run-asked-for-in-words-writes-the-tree.test.mjs`.
  const wrong = [];
  for (const door of DOORS) {
    for (const name of door.booleans) {
      for (const [literal, means] of [["true", true], ["false", false]]) {
        const { flags } = door.parse([`--${name}`, literal, "./my-app"]);
        const v = flags[name];
        if (typeof v !== "boolean") wrong.push(`${door.name}: --${name} ${literal} stored ${JSON.stringify(v)} (${typeof v})`);
        if ((v === true) !== means) wrong.push(`${door.name}: --${name} ${literal} → \`=== true\` reads ${v === true}`);
        if ((v !== true) !== !means) wrong.push(`${door.name}: --${name} ${literal} → \`!== true\` reads ${v !== true}`);
        if (Boolean(v) !== means) wrong.push(`${door.name}: --${name} ${literal} → \`Boolean(...)\` reads ${Boolean(v)}`);
      }
    }
  }
  assert.deepEqual(wrong, [], "each line is a flag whose stored value still makes one of the three reader spellings wrong:\n  " + wrong.join("\n  "));
});

test("a contradictory line resolves by the affirmative name, and neither door refuses it", () => {
  // Logged, not fixed (KD-151). `--ios false --no-ios false` is a contradiction
  // no parser can resolve correctly, and the answer it gets today — `x` wins,
  // `no-x` is never consulted — is pinned here so the next change to `flagBool`
  // has to mean it. This was the behaviour before the value form was
  // normalized, measured on 8bd782a: `flagBool` returned false for that line.
  for (const door of DOORS) {
    const [name] = [...door.booleans].filter((n) => !n.startsWith("no-"));
    const both = door.parse([`--${name}`, "false", `--no-${name}`, "false"]);
    assert.equal(door.flagBool(both.flags, name, true), false, `${door.name}: the affirmative name stopped winning`);
    const other = door.parse([`--${name}`, "true", `--no-${name}`, "true"]);
    assert.equal(door.flagBool(other.flags, name, false), true, `${door.name}: the affirmative name stopped winning`);
    assert.deepEqual(door.unreadable(both.flags), [], `${door.name}: a contradiction is not a string value, and is not refused here`);
  }
});

test("the shape `parseArgs` returns is pinned, for every flag form either door accepts", () => {
  // The fix changes what `parseArgs` RETURNS, and a gate reads it. Every form
  // in the help text, the shape it produces, written out — so a later change to
  // the coercion cannot quietly alter one of them.
  const CLI = [
    [["my-app"], { flags: {}, positionals: ["my-app"] }],
    [["--minimal"], { flags: { minimal: true }, positionals: [] }],
    [["--minimal", "true", "my-app"], { flags: { minimal: true }, positionals: ["my-app"] }],
    [["--minimal", "false", "my-app"], { flags: { minimal: false }, positionals: ["my-app"] }],
    [["--no-firebase", "my-app"], { flags: { "no-firebase": true }, positionals: ["my-app"] }],
    [["--no-firebase", "true"], { flags: { "no-firebase": true }, positionals: [] }],
    // The space form holding something else: STILL A POSITIONAL, deliberately.
    [["--minimal", "my-app"], { flags: { minimal: true }, positionals: ["my-app"] }],
    [["--no-firebase", "no", "my-app"], { flags: { "no-firebase": true }, positionals: ["no", "my-app"] }],
    // A value flag is untouched by any of this.
    [["--profile", "svc", "../dir"], { flags: { profile: "svc" }, positionals: ["../dir"] }],
    [["--fleet", "./fleet.json"], { flags: { fleet: "./fleet.json" }, positionals: [] }],
    // `=` is split, at a value flag and a boolean, as at the other door. Until
    // KD-14 closed this parser did not split it and the key carried the value.
    [["--profile=svc"], { flags: { profile: "svc" }, positionals: [] }],
    [["--dry-run=true"], { flags: { "dry-run": true }, positionals: [] }],
    [["--dry-run=false"], { flags: { "dry-run": false }, positionals: [] }],
    // The one shape a declared boolean can still hold a string in, refused at
    // the bin (KD-153).
    [["--dry-run=maybe"], { flags: { "dry-run": "maybe" }, positionals: [] }],
    // The npx separator is inert, and a repeated flag is last-one-wins.
    [["--", "--dry-run"], { flags: { "dry-run": true }, positionals: [] }],
    [["--dry-run", "true", "--dry-run", "false"], { flags: { "dry-run": false }, positionals: [] }],
    [["-y", "../app"], { flags: {}, positionals: ["-y", "../app"] }],
  ];
  const HARNESS = [
    [["init", "../app"], { flags: {}, positionals: ["init", "../app"] }],
    [["init", "--dry-run"], { flags: { "dry-run": true }, positionals: ["init"] }],
    [["init", "--dry-run", "true", "../app"], { flags: { "dry-run": true }, positionals: ["init", "../app"] }],
    [["init", "--dry-run", "false", "../app"], { flags: { "dry-run": false }, positionals: ["init", "../app"] }],
    [["init", "--new-profile", "../app"], { flags: { "new-profile": true }, positionals: ["init", "../app"] }],
    [["init", "--dry-run", "maybe", "../app"], { flags: { "dry-run": true }, positionals: ["init", "maybe", "../app"] }],
    [["init", "--profile", "svc"], { flags: { profile: "svc" }, positionals: ["init"] }],
    // This parser DOES split `=`, at both a value flag and a boolean.
    [["init", "--profile=svc"], { flags: { profile: "svc" }, positionals: ["init"] }],
    [["init", "--dry-run=true"], { flags: { "dry-run": true }, positionals: ["init"] }],
    [["init", "--dry-run=false"], { flags: { "dry-run": false }, positionals: ["init"] }],
    // The one shape a declared boolean can still hold a string in. Refused at
    // the bin, not here: the parser reports, the door decides.
    [["init", "--dry-run=maybe"], { flags: { "dry-run": "maybe" }, positionals: ["init"] }],
    [["init", "--", "--dry-run"], { flags: { "dry-run": true }, positionals: ["init"] }],
  ];

  for (const [argv, want] of CLI) {
    const r = parseCliArgs(argv);
    assert.deepEqual({ flags: r.flags, positionals: r._ }, want, `create-cmp: ${argv.join(" ")}`);
  }
  for (const [argv, want] of HARNESS) {
    const r = parseHarnessArgs(argv);
    assert.deepEqual({ flags: r.flags, positionals: r.positionals }, want, `prooflane: ${argv.join(" ")}`);
  }
});

/** A named function's source, braces matched, from a module's text. */
function functionSource(text, name) {
  const at = new RegExp(`(?:export )?function ${name}\\(`).exec(text);
  assert.ok(at, `${name} is not declared in this file`);
  const open = text.indexOf("{", at.index);
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(at.index, i + 1);
    }
  }
  assert.fail(`${name}'s body is not brace-balanced`);
}

/** Comments and layout removed: what the function DOES, not how it is spelled. */
const asCode = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\s+/g, " ")
    .trim();

test("the two spellings of the shared functions are the same function", () => {
  // NOT one shared module, on purpose: neither package depends on the other and
  // the published root tarball carries no copy of `packages/harness/install/`
  // (docs/proposals/PACKAGE-SPLIT.md holds that decision, and this slice does
  // not reopen it). What a copy needs instead is a gate, so this is one.
  //
  // COMMENTS ARE EXCLUDED FROM THE COMPARISON, and that is not a weakening: the
  // two files measure the same defect from different sides — one cites the
  // scaffold it wrote, the other the lane it installed. The CODE has to be
  // identical; the reason it is there is each file's own to state.
  const texts = DOORS.map((d) => ({ door: d, text: fs.readFileSync(path.join(ROOT, d.file), "utf8") }));
  const SHARED = ["takesNoValue", "consumesNext", "coerceDeclaredBoolean", "unreadableBooleanValues", "triState", "flagBool", "unknownFlags"];
  for (const name of SHARED) {
    const [a, b] = texts.map((t) => asCode(functionSource(t.text, name)));
    assert.equal(a, b, `${name} has drifted between ${texts[0].door.file} and ${texts[1].door.file}`);
  }

  // `parseArgs` too, since KD-14 closed. The two used to differ by the `=`
  // branch, which is why this comparison left them out; what is left between
  // them is what each door calls its result — `_` at create-cmp, `positionals`
  // at prooflane, both read by callers that cannot be renamed in one slice. So
  // the RETURN is the one statement set aside, and everything that decides what
  // a token means is compared as code.
  const result = /return \{[^{}]*\}; \}$/;
  const [a, b] = texts.map((t) => {
    const code = asCode(functionSource(t.text, "parseArgs"));
    assert.match(code, result, `parseArgs in ${t.door.file} no longer ends in the one return this comparison sets aside`);
    return code.replace(result, "return RESULT; }");
  });
  assert.equal(a, b, `parseArgs has drifted between ${texts[0].door.file} and ${texts[1].door.file} — one line, two parses`);
});

test("the two spellings answer the same argv the same way", () => {
  // The source comparison above sees `parseArgs` with its return set aside; the
  // two doors' BOOLEAN_FLAGS still differ, so the shared BEHAVIOUR is asserted
  // over argv as well, on the flags both doors declare
  // boolean. A divergence here is `create-cmp harness init` and `prooflane
  // init` doing different things with one line, which is the fork
  // `a-flag-is-boolean-to-one-reader-and-not-to-the-other.test.mjs` exists for.
  //
  // THE `=` FORM IS IN THIS TABLE, and was not when it was written: its first
  // run listed every shared boolean as a divergence, because `--dry-run=true`
  // was a flag named `dry-run` to prooflane and a flag named `dry-run=true` to
  // create-cmp. That was KD-14, and the slice that closed it put the rows back.
  const shared = [...CLI_BOOLEANS].filter((n) => HARNESS_BOOLEANS.has(n));
  assert.ok(shared.length >= 3, `the two doors share ${shared.length} boolean flags — the table is not testing much`);

  const attached = (name) => [
    [`--${name}=true`], [`--${name}=false`], [`--no-${name}=true`], [`--no-${name}=false`],
  ];
  const disagreed = [];
  for (const name of shared) {
    for (const row of [...TRUTH_TABLE.map((r) => r.argv(name)), ...attached(name), [`--${name}`, "maybe"], [`--${name}`, "no"]]) {
      const argv = [...row, "./target"];
      const a = parseCliArgs(argv);
      const b = parseHarnessArgs(argv);
      const aBool = cliFlagBool(a.flags, name, "default");
      const bBool = harnessFlagBool(b.flags, name, "default");
      if (aBool !== bBool) disagreed.push(`${argv.join(" ")} → create-cmp says ${aBool}, prooflane says ${bBool}`);
    }
  }
  assert.deepEqual(
    disagreed,
    [],
    "one flag, two front doors into the same installer, and they resolve it differently:\n  " + disagreed.join("\n  ")
  );
});

test("`coerceDeclaredBoolean` touches declared booleans and nothing else", () => {
  for (const door of DOORS) {
    const [name] = [...door.booleans];
    assert.equal(door.coerce(name, "true"), true);
    assert.equal(door.coerce(name, "false"), false);
    assert.equal(door.coerce(name, "maybe"), "maybe", "a value it cannot read is left exactly as it arrived");
    assert.equal(door.coerce(name, "./my-app"), "./my-app");
    // A value flag's value is never touched, whatever it says.
    assert.equal(door.coerce("profile", "true"), "true", "a VALUE flag whose value is the word `true` keeps the word");
    assert.equal(door.coerce("target-dir", "false"), "false");
    // `no-x` is boolean by construction in both parsers, list or no list.
    assert.equal(door.coerce(`no-${name}`, "false"), false);
  }
});

// ————— the doors, driven —————

const BINS = {
  prooflane: path.join(ROOT, "packages", "harness", "bin", "prooflane.mjs"),
  "create-cmp": path.join(ROOT, "bin", "create-cmp.mjs"),
};

function run(bin, argv, cwd) {
  const r = spawnSync(process.execPath, [BINS[bin], ...argv], { cwd, encoding: "utf8" });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

test("a declared boolean carrying `=maybe` is refused by name, and writes nothing", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "boolean-value-")));
  try {
    const r = run("prooflane", ["init", "--dry-run=maybe", dir], dir);
    assert.equal(r.code, 2, `refusing is the whole point of this branch. Got:\n${r.out}`);
    assert.match(r.out, /--dry-run=maybe/, "the refusal names what was typed");
    assert.match(r.out, /true.*false|`true` or `false`/s, "and says what the flag does take");
    assert.match(r.out, /Nothing was written/);
    assert.deepEqual(fs.readdirSync(dir), [], "the refusal wrote into the tree");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the SPACE form holding something else is NOT refused — it is the user's directory (KD-7)", () => {
  // The refusal above must not grow into this one. `--dry-run maybe ../app`
  // resolves the project to `./maybe` and says so; that is logged as KD-150 and
  // deliberately left, because the alternative refuses `create-cmp --minimal
  // my-app` and an adopter may have a directory called `no`.
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "boolean-space-")));
  try {
    const r = run("prooflane", ["init", "--dry-run", "maybe", "./app"], dir);
    assert.doesNotMatch(r.out, /that flag takes/, `the space form was refused as an unreadable value:\n${r.out}`);
    assert.match(r.out, /project:.*maybe/, `the token after the flag is the positional, and the project is it:\n${r.out}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("`--version` and `--help` answer whatever value they carry (KD-15)", () => {
  // The two declared booleans that are read by PRESENCE, and the only ones. A
  // question does not stop being asked by being answered `false`, and at
  // create-cmp's door the something-else is `create`, which writes: before this
  // guard, normalizing the value form made `create-cmp --version false --yes`
  // fall through the dispatcher and scaffold. Logged as KD-152.
  for (const form of [["--version"], ["--version", "false"], ["--version", "true"]]) {
    const r = run("create-cmp", form, ROOT);
    assert.equal(r.code, 0, `create-cmp ${form.join(" ")} did not answer:\n${r.out}`);
    assert.match(r.out, /^create-cmp-cli \d+\.\d+\.\d+/, `create-cmp ${form.join(" ")} printed something else:\n${r.out}`);
    const p = run("prooflane", form, ROOT);
    assert.equal(p.code, 0, `prooflane ${form.join(" ")} did not answer:\n${p.out}`);
    assert.match(p.out, /^@[\w-]+\/[\w-]+ \d+\.\d+\.\d+|^[\w@/-]+ \d+\.\d+\.\d+/, `prooflane ${form.join(" ")} printed something else:\n${p.out}`);
  }
  for (const form of [["--help"], ["--help", "false"]]) {
    const r = run("create-cmp", form, ROOT);
    assert.equal(r.code, 0, `create-cmp ${form.join(" ")} did not answer:\n${r.out}`);
    assert.match(r.out, /Usage|usage/, `create-cmp ${form.join(" ")} printed something else:\n${r.out}`);
  }
});
