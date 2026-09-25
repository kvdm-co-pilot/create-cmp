// `--preset lean|full` — THE APP'S SHAPE, AS A NAME FOR TOGGLES THAT ALREADY EXIST.
//
// docs/proposals/LIBRARIES-IN-SERVICES-OUT.md, Decision 3: a preset flips options the
// schema already has and adds ZERO template branches; it never removes a library
// that has no toggle; the harness is full in both; `upgrade` must rebuild the same
// shape. Each of those is a claim a later edit could quietly break, so each is held
// here by the bytes a stamp writes rather than by reading the table that declares it:
//
//   - `--preset lean` stamps the SAME BYTES as `--no-room`, and `--preset full` the
//     same bytes as no preset at all. That is what "only a name" means, and it is the
//     one check that fails if a preset ever grows a branch of its own.
//   - a stated flag wins: `--preset lean --room` is the default app, byte for byte.
//   - the record says `"room": false`, and the config `upgrade --harness` rebuilds from
//     that record stamps the lean app again.
//   - a preset the command does not have is refused by name, and nothing is written —
//     including the shape where `--preset` swallowed the directory after it.
//
// Files and exit codes, never Gradle: whether the lean app COMPILES is CI's
// stamp-android job, which stamps and builds it on every PR. Nothing here can say
// that, and nothing pretends to.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { PRESETS, DEFAULT_PRESET, resolvePreset } from "../src/commands/create.mjs";
import { configFromSpecRecord } from "../src/lib/harness-upgrade.mjs";
import { scaffold } from "../src/scaffold.mjs";
import { hashStampedTree } from "../scripts/stamped-output.mjs";
import { offTheRunnerChannel } from "./helpers/runner-channel.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "create-cmp.mjs");
const SAME_APP = ["--name", "Acme", "--package", "com.acme.demo", "--no-ios", "--no-verify", "--yes"];

/** Run the real bin from a scratch cwd, so a mis-resolved directory lands there and not in the repo. */
const cli = (cwd, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8", timeout: 60_000 });

/**
 * Every file's bytes under rule 1 — the three normalisations only (`stampedAt`, an
 * ADR's Date line, `local.properties`), so two stamps of one config compare equal and
 * every other byte counts. Rule 2's "unobserved" paths would hide exactly the files a
 * preset branch might touch.
 */
const bytesOf = (dir) => hashStampedTree(dir, { rule: 1 }).files;

const record = (dir) => JSON.parse(fs.readFileSync(path.join(dir, "create-cmp.json"), "utf8"));

function scratch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preset-"));
  return { dir, app: (name) => path.join(dir, name), dispose: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

function stamp(box, name, ...flags) {
  const dir = box.app(name);
  const r = cli(box.dir, dir, ...SAME_APP, ...flags);
  assert.equal(r.status, 0, `stamp ${flags.join(" ") || "(no preset)"} exited ${r.status}:\n${r.stdout}${r.stderr}`);
  return dir;
}

test("the presets are names for schema toggles: lean turns Room off and nothing else, and full is the default", () => {
  const schema = JSON.parse(fs.readFileSync(path.join(ROOT, "options.schema.json"), "utf8"));
  const toggles = Object.entries(schema.properties)
    .filter(([key, spec]) => spec.type === "boolean" && key !== "harness")
    .map(([key]) => key);

  for (const [name, values] of Object.entries(PRESETS)) {
    for (const key of Object.keys(values)) {
      assert.ok(
        toggles.includes(key),
        `preset ${name} sets \`${key}\`, which is not one of the schema's app toggles (${toggles.join(", ")}). ` +
          "A preset may only move a toggle that already exists — `harness` is the mode axis (`--minimal`), not the app's shape.",
      );
    }
  }
  // The owner's decision, pinned: Room is the lever, and the eyes stay on.
  assert.deepEqual({ ...PRESETS.lean }, { room: false });
  assert.deepEqual({ ...PRESETS.full }, {});
  assert.equal(DEFAULT_PRESET, "full");
  assert.equal(resolvePreset({}).name, "full", "no --preset is the full shape");
});

test("--preset lean stamps the same bytes as --no-room, and --preset full the same bytes as no preset", () => {
  const box = scratch();
  try {
    const lean = bytesOf(stamp(box, "lean", "--preset", "lean"));
    const noRoom = bytesOf(stamp(box, "no-room", "--no-room"));
    const full = bytesOf(stamp(box, "full", "--preset", "full"));
    const plain = bytesOf(stamp(box, "plain"));

    assert.deepEqual(lean, noRoom, "--preset lean wrote something --no-room does not: a preset has grown a template branch of its own");
    assert.deepEqual(full, plain, "--preset full wrote something the default stamp does not");
    // The control: the two shapes really are different apps, so the equalities above
    // are not two empty walks agreeing.
    assert.notDeepEqual(lean, plain, "lean and full stamped identical trees — the preset changed nothing");
    assert.ok(!Object.keys(lean).some((rel) => rel.includes("/data/local/")), "the lean app still carries Room's data/local sources");
    assert.ok(Object.keys(plain).some((rel) => rel.includes("/data/local/")), "the full app lost Room's data/local sources");
  } finally {
    box.dispose();
  }
});

test("a stated flag wins over the preset: --preset lean --room is the default app", () => {
  const box = scratch();
  try {
    const leanWithRoom = stamp(box, "lean-room", "--preset", "lean", "--room");
    const plain = stamp(box, "plain");
    assert.equal(record(leanWithRoom).room, true);
    assert.deepEqual(bytesOf(leanWithRoom), bytesOf(plain));
  } finally {
    box.dispose();
  }
});

test("the lean record says what the preset resolved to — the harness full, the eyes on, Room off — and upgrade rebuilds that app from it", async () => {
  const box = scratch();
  try {
    const lean = stamp(box, "lean", "--preset", "lean");
    const rec = record(lean);
    assert.equal(rec.room, false);
    assert.equal(rec.harness, true, "the harness is full in both shapes");
    for (const key of ["e2e", "inspector", "devClient"]) assert.equal(rec[key], true, `${key} stays on in the lean shape`);
    assert.ok(!("preset" in rec), "the record carries the resolved options, not a name something would have to interpret");

    // `upgrade --harness` and `harden` stamp their comparison trees from this.
    const config = configFromSpecRecord(rec, box.app("rebuilt"));
    assert.equal(config.room, false);
    await offTheRunnerChannel(() => scaffold(config, { verify: false }));
    assert.deepEqual(bytesOf(box.app("rebuilt")), bytesOf(lean), "the config rebuilt from the lean record stamps a different app");
  } finally {
    box.dispose();
  }
});

test("a preset the command does not have is refused by name, and nothing is written", () => {
  const box = scratch();
  try {
    const cases = [
      { argv: (dir) => [dir, ...SAME_APP, "--preset", "tiny"], says: /--preset tiny is not a preset/ },
      // Bare at the end of the line: the flag arrives as `true`.
      { argv: (dir) => [dir, ...SAME_APP, "--preset"], says: /--preset needs a value/ },
      // An empty value: refused at the door before the command runs.
      { argv: (dir) => [dir, ...SAME_APP, "--preset="], says: /--preset needs a value/ },
      // A value flag takes the token after it. When that token was the directory, the
      // refusal names it, and neither it nor the cwd is written to.
      { argv: (dir) => ["--preset", dir, ...SAME_APP], says: /is not a preset/ },
    ];
    for (const [i, c] of cases.entries()) {
      const dir = box.app(`refused-${i}`);
      const argv = c.argv(dir);
      const r = cli(box.dir, ...argv);
      assert.equal(r.status, 2, `${argv.join(" ")}:\n${r.stdout}${r.stderr}`);
      assert.match(r.stderr, c.says, argv.join(" "));
      assert.match(r.stderr, /Nothing was written/);
      assert.ok(!fs.existsSync(dir), `${argv.join(" ")} wrote ${dir}`);
    }
    assert.deepEqual(fs.readdirSync(box.dir).sort(), [], "a refused line wrote into the working directory");
  } finally {
    box.dispose();
  }
});

test("the help names --preset, and cmp-new passes it without a --room that would undo lean", () => {
  const help = spawnSync(process.execPath, [BIN, "--help"], { encoding: "utf8", timeout: 60_000 });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--preset full\|lean/);

  const skill = fs.readFileSync(path.join(ROOT, "skills", "cmp-new", "SKILL.md"), "utf8");
  const invocation = skill.match(/node <repo>\/bin\/create-cmp\.mjs[\s\S]*?--yes/);
  assert.ok(invocation, "cmp-new no longer shows the engine invocation this test reads");
  assert.match(invocation[0], /--preset (lean|full)/, "cmp-new's invocation passes the shape");
  assert.doesNotMatch(
    invocation[0],
    /--room\b/,
    "cmp-new's invocation passes --room: a stated flag beats the preset, so an agent copying it turns lean back into full without a word",
  );
});

test("CI builds the lean shape: a fresh --preset lean stamp, assembleDebug'd, with no add step on it", () => {
  const ci = fs.readFileSync(path.join(ROOT, ".github", "workflows", "ci.yml"), "utf8");
  const job = ci.slice(ci.indexOf("  stamp-android:"), ci.indexOf("  stamp-ios:"));
  assert.ok(job.length > 0, "ci.yml has no stamp-android job for this test to read");

  const stampLine = job.match(/create-cmp\.mjs "\$RUNNER_TEMP\/([\w-]+)"[^\n]*\n[^\n]*\n\s*--preset lean\b/);
  assert.ok(stampLine, "the stamp-android job no longer stamps --preset lean");
  const leanDir = stampLine[1];
  assert.match(
    job,
    new RegExp(`cd "\\$RUNNER_TEMP/${leanDir}"\\n\\s*\\./gradlew :composeApp:assembleDebug`),
    `the lean app (${leanDir}) is stamped but never built`,
  );
  assert.doesNotMatch(job, new RegExp(`add firebase "\\$RUNNER_TEMP/${leanDir}"`), "the lean shape is under proof alone; Firebase is added to the default app");
});
