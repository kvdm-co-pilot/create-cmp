// `create-cmp doctor --fix --dry-run` WROTE. Measured on this tree, in a project that
// had no .claude directory at all:
//
//     $ create-cmp doctor --fix --dry-run --no-install --no-ios --target-dir <tmp>
//     ✓ --fix: wired the walk into .claude/settings.json (statusLine + UserPromptSubmit)
//     $ ls <tmp>/.claude
//     settings.json          # created by a dry run
//
// `--dry-run` reached the toolchain installer and nothing else: `applySafeFixes` wrote
// local.properties from ANDROID_HOME, ksp.useKSP2 into gradle.properties, and the walk
// wiring into .claude/settings.json, whatever the flag said. That is KD-16's class one
// command over — `upgrade --dry-run true` wrote the version catalog — and it is a tree
// the adopter did not ask for, which is the first row of the line docs/KNOWN-DEFECTS.md
// opens with. Age decides who paid for it, never whether it blocks.
//
// THE GATE IS ONE MECHANISM, NOT A CHECK PER HEAL. Every project heal writes through
// one writer; `--dry-run` makes that writer print instead of write. The last test in
// this file refuses a direct write in src/commands/doctor.mjs, because a heal added
// tomorrow that calls fs itself would be invisible to the flag again — which is exactly
// how three heals came to ignore it.
//
// WHAT A DRY RUN OWES, and this file asserts all three: it writes nothing (every byte of
// the project is what it was, and no file appears); it says what it WOULD have done, in
// the same words the real run uses (so the two runs can be read against each other); and
// the control proves the real run does write, so "nothing changed" cannot be passed by a
// doctor that heals nothing at all.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "create-cmp.mjs");

// The pre-0.26.3 Stop hook: it makes the shipped-hooks REWRITE applicable, beside the
// walk-wiring ADD (both surfaces are missing here), so one run exercises both doors
// into .claude/settings.json.
const LEGACY_SETTINGS =
  '{"hooks":{"Stop":[{"matcher":"","hooks":[{"type":"command","command":"node qa/receipt-check.mjs --hook"}]}]}}';

const TOML = [
  "[versions]",
  'kotlin = "2.2.20"',
  'ksp = "2.2.20-2.0.4"',
  'room = "2.8.4"',
  "",
].join("\n");

/**
 * A project every project heal has something to do in: no local.properties (with
 * ANDROID_HOME set, below), Room + iOS without ksp.useKSP2, a walk with no wiring, and
 * a Stop hook that is the form create-cmp shipped through 0.26.2.
 */
function project() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cmp-dry-run-")));
  assert.ok(
    !dir.startsWith(`${fs.realpathSync(ROOT)}${path.sep}`),
    `the fixture landed inside the repository (${dir})`
  );
  fs.writeFileSync(path.join(dir, "settings.gradle.kts"), "");
  fs.mkdirSync(path.join(dir, "gradle"), { recursive: true });
  fs.writeFileSync(path.join(dir, "gradle", "libs.versions.toml"), TOML);
  fs.mkdirSync(path.join(dir, "iosApp"), { recursive: true });
  fs.writeFileSync(path.join(dir, "iosApp", "Info.plist"), "<!-- stand-in -->\n");
  fs.mkdirSync(path.join(dir, "qa"), { recursive: true });
  fs.writeFileSync(path.join(dir, "qa", "walk-status.mjs"), "// stand-in for the walk\n");
  fs.writeFileSync(path.join(dir, "qa", "receipt-check.mjs"), "// stand-in for the Stop gate\n");
  fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".claude", "settings.json"), LEGACY_SETTINGS);
  return dir;
}

/** Every file under `dir`, project-relative path → contents. */
function snapshot(dir) {
  const out = new Map();
  const walk = (cur) => {
    for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) walk(full);
      else out.set(path.relative(dir, full).split(path.sep).join("/"), fs.readFileSync(full, "utf8"));
    }
  };
  walk(dir);
  return out;
}

const strip = (s) => String(s ?? "").replace(/\x1b\[[0-9;]*m/g, "");

/**
 * `create-cmp doctor --fix [--dry-run] --yes …`, hermetic: empty HOME, minimal PATH.
 * `sdk` is ANDROID_HOME — the same directory for two runs being compared, since the
 * heal's own message names the path it wrote.
 */
function doctorFix(dir, { dryRun, sdk = null }) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-dry-run-home-"));
  const ownSdk = sdk === null ? fs.mkdtempSync(path.join(os.tmpdir(), "cmp-dry-run-sdk-")) : null;
  try {
    const r = spawnSync(
      process.execPath,
      [
        BIN,
        "doctor",
        "--fix",
        ...(dryRun ? ["--dry-run"] : []),
        "--yes",
        "--no-install",
        "--no-ios",
        "--target-dir",
        dir,
      ],
      {
        env: {
          HOME: home,
          // A real SDK directory, so the local.properties heal has something to write.
          ANDROID_HOME: sdk ?? ownSdk,
          PATH: [path.dirname(process.execPath), "/usr/bin", "/bin"].join(path.delimiter),
          NO_COLOR: "1",
        },
        input: "",
        encoding: "utf8",
        timeout: 60_000,
      }
    );
    assert.ok(r.status === 0 || r.status === 1, `doctor did not finish (status ${r.status}):\n${r.stderr}`);
    const out = strip(r.stdout);
    assert.match(out, /Project diagnosis/, `the project section never ran:\n${out}\n${r.stderr}`);
    return out;
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    if (ownSdk !== null) fs.rmSync(ownSdk, { recursive: true, force: true });
  }
}

/** The heals a run performed: the `what` of every `✓ --fix: wrote <what>` line. */
const wrote = (out) => [...out.matchAll(/^.*--fix: wrote (.+)$/gm)].map((m) => m[1].trim());
/** The heals a run PREVIEWED: the `what` of every `[dry-run] --fix: would write <what>`. */
const wouldWrite = (out) => [...out.matchAll(/^.*\[dry-run\] --fix: would write (.+)$/gm)].map((m) => m[1].trim());

test("the control: --fix without --dry-run really does write, and more than one heal fires", () => {
  const dir = project();
  try {
    const before = snapshot(dir);
    const out = doctorFix(dir, { dryRun: false });
    const after = snapshot(dir);
    const heals = wrote(out);
    assert.ok(
      heals.length >= 3,
      `only ${heals.length} heal(s) fired, so "a dry run changes nothing" would be nearly vacuous:\n${out}`
    );
    assert.ok(after.has("local.properties"), "the local.properties heal did not fire");
    assert.ok(after.has("gradle.properties"), "the ksp.useKSP2 heal did not fire");
    assert.notEqual(
      after.get(".claude/settings.json"),
      before.get(".claude/settings.json"),
      "neither door into .claude/settings.json fired"
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("--fix --dry-run leaves every byte of the project as it was", () => {
  const dir = project();
  try {
    const before = snapshot(dir);
    const out = doctorFix(dir, { dryRun: true });
    const after = snapshot(dir);
    const appeared = [...after.keys()].filter((p) => !before.has(p));
    const vanished = [...before.keys()].filter((p) => !after.has(p));
    const changed = [...before.keys()].filter((p) => after.has(p) && after.get(p) !== before.get(p));
    assert.deepEqual(
      { appeared, vanished, changed },
      { appeared: [], vanished: [], changed: [] },
      `a dry run changed the adopter's tree:\n${out}`
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a dry run says what it WOULD have done, in the words the real run uses", () => {
  // Two identical fixtures, one run each: whatever the real run says it wrote, the dry
  // run must say it would write — same description, so the two are readable against
  // each other, and a heal cannot go silent under the flag.
  const real = project();
  const dry = project();
  const sdk = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-dry-run-sdk-"));
  try {
    const realOut = doctorFix(real, { dryRun: false, sdk });
    const dryOut = doctorFix(dry, { dryRun: true, sdk });
    assert.deepEqual(
      wouldWrite(dryOut),
      wrote(realOut),
      `the dry run's preview does not match what the real run wrote.\n--- real:\n${realOut}\n--- dry:\n${dryOut}`
    );
    assert.ok(wouldWrite(dryOut).length >= 3, "fewer than three heals were previewed — the comparison is thin");
  } finally {
    fs.rmSync(real, { recursive: true, force: true });
    fs.rmSync(dry, { recursive: true, force: true });
    fs.rmSync(sdk, { recursive: true, force: true });
  }
});

test("no project heal writes on its own — the flag is honoured in one place or not at all", () => {
  // The defect was not that three heals each forgot the flag; it is that each heal held
  // its own `fs` call, so honouring the flag was a thing to REMEMBER. One writer owns
  // the write, and this refuses the next heal that reaches around it.
  const src = fs.readFileSync(path.join(ROOT, "src", "commands", "doctor.mjs"), "utf8");
  const code = src
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join("\n");
  const mutators = ["fs.writeFileSync(", "fs.mkdirSync(", "fs.rmSync(", "fs.appendFileSync("];
  const counts = Object.fromEntries(mutators.map((m) => [m, code.split(m).length - 1]));
  const writerStart = code.indexOf("function healWriter");
  assert.notEqual(writerStart, -1, "src/commands/doctor.mjs has no healWriter — the one mechanism is gone");
  const writerEnd = code.indexOf("\n}", writerStart);
  const writer = code.slice(writerStart, writerEnd);
  assert.deepEqual(
    counts,
    { "fs.writeFileSync(": 1, "fs.mkdirSync(": 1, "fs.rmSync(": 0, "fs.appendFileSync(": 0 },
    "a project heal in src/commands/doctor.mjs mutates the tree outside healWriter. Route it through the " +
      "writer: a heal that calls fs itself is invisible to --dry-run, which is how this defect happened."
  );
  for (const m of ["fs.writeFileSync(", "fs.mkdirSync("]) {
    assert.ok(writer.includes(m), `${m} is not inside healWriter, so --dry-run does not gate it`);
  }
});
