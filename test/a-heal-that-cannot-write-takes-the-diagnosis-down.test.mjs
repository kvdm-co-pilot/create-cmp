// A HEAL THAT CANNOT WRITE TOOK THE WHOLE PROJECT DIAGNOSIS DOWN WITH IT (KD-214).
// Measured, with `.claude/settings.json` at mode 0444 and the 0.26.2 hooks in it:
//
//     $ create-cmp doctor --fix --yes --no-install --no-ios --target-dir <tmp>
//     Fatal: Error: EACCES: permission denied, open '…/.claude/settings.json'
//         at write (…/src/commands/doctor.mjs:439:8)
//
// and exit 1, with `printFindings` never reached: every finding the adopter ran
// doctor to read was discarded by one optional heal, and the heals that had already
// written earlier in the run stayed applied with nothing saying so.
//
// WHAT IS OWED, and this file asserts each: the refusal is printed in words, not as
// a stack; the diagnosis still prints; the heals already applied are named; the run
// exits 1; and the unwritable file is left byte-for-byte as it was. The unit half
// pins the writer's contract, including that an error the operating system did NOT
// raise still crashes — a defect in doctor must not be reported as a full disk.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { applySafeFixes, healWriter } from "../src/commands/doctor.mjs";
import { offTheRunnerChannel } from "./helpers/runner-channel.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "create-cmp.mjs");

// Root writes through 0444 and 0555, so the refusal this file is about never happens.
const ROOT_USER = typeof process.getuid === "function" && process.getuid() === 0;
const skip = ROOT_USER ? "running as root: permission bits do not refuse this user" : false;

const LEGACY_SETTINGS =
  '{"hooks":{"Stop":[{"matcher":"","hooks":[{"type":"command","command":"node qa/receipt-check.mjs --hook"}]}]}}';
const TOML = ["[versions]", 'kotlin = "2.2.20"', 'ksp = "2.2.20-2.0.4"', 'room = "2.8.4"', ""].join("\n");

/** Every project heal has work here (see a-dry-run-writes-the-tree-it-is-previewing), and settings.json is read-only. */
function project() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cmp-heal-refused-")));
  fs.writeFileSync(path.join(dir, "settings.gradle.kts"), "");
  fs.mkdirSync(path.join(dir, "gradle"), { recursive: true });
  fs.writeFileSync(path.join(dir, "gradle", "libs.versions.toml"), TOML);
  fs.mkdirSync(path.join(dir, "iosApp"), { recursive: true });
  fs.writeFileSync(path.join(dir, "iosApp", "Info.plist"), "<!-- stand-in -->\n");
  fs.mkdirSync(path.join(dir, "qa"), { recursive: true });
  fs.writeFileSync(path.join(dir, "qa", "walk-status.mjs"), "// stand-in for the walk\n");
  fs.writeFileSync(path.join(dir, "qa", "receipt-check.mjs"), "// stand-in for the Stop gate\n");
  fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
  const settings = path.join(dir, ".claude", "settings.json");
  fs.writeFileSync(settings, LEGACY_SETTINGS);
  fs.chmodSync(settings, 0o444);
  return dir;
}

function cleanup(dir) {
  const settings = path.join(dir, ".claude", "settings.json");
  if (fs.existsSync(settings)) fs.chmodSync(settings, 0o644);
  fs.rmSync(dir, { recursive: true, force: true });
}

const strip = (s) => String(s ?? "").replace(/\x1b\[[0-9;]*m/g, "");

test("the writer reports a refused write instead of throwing it, and names the reason in words", { skip }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-heal-writer-"));
  const locked = path.join(dir, "locked");
  fs.mkdirSync(locked);
  fs.chmodSync(locked, 0o555);
  let printed = "";
  try {
    const write = healWriter();
    const changed = await offTheRunnerChannel(
      () => write(path.join(locked, "local.properties"), "sdk.dir=/x\n", "sdk.dir=/x to local.properties"),
      { onText: (t) => (printed = t) }
    );
    assert.equal(changed, false, "a refused write reported that the tree changed");
    assert.equal(write.wrote, 0);
    assert.deepEqual(write.applied, []);
    assert.equal(write.failed.length, 1, `the refusal was not recorded: ${JSON.stringify(write.failed)}`);
    assert.match(write.failed[0].reason, /permission denied/);
    assert.match(write.failed[0].reason, /\(EACCES\)/);
    assert.doesNotMatch(write.failed[0].reason, /\n|\bat /, "the reason carries a stack");
    assert.match(strip(printed), /--fix: could not write sdk\.dir=\/x to local\.properties — permission denied/);
    assert.equal(fs.existsSync(path.join(locked, "local.properties")), false);
  } finally {
    fs.chmodSync(locked, 0o755);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("an error the operating system did not raise is still a crash, not a refusal", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-heal-writer-"));
  try {
    const write = healWriter();
    // A number is not writable content: node throws ERR_INVALID_ARG_TYPE, which has no
    // syscall. That is a defect in the heal, and reporting it as a refusal would hide it.
    await assert.rejects(
      offTheRunnerChannel(() => write(path.join(dir, "x"), 42, "a number")),
      /ERR_INVALID_ARG_TYPE|must be of type/
    );
    assert.deepEqual(write.failed, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("applySafeFixes does not count a refused write as a heal", { skip }, async () => {
  const dir = project();
  try {
    const write = healWriter();
    const findings = [{ id: "walk-wiring", level: "warn", fix: { auto: true } }];
    const fixed = await offTheRunnerChannel(() => applySafeFixes(dir, findings, { gradleProperties: null }, write));
    assert.deepEqual(fixed, [], "the walk-wiring heal was reported healed though its write was refused");
    assert.equal(write.failed.length, 1);
    assert.equal(fs.readFileSync(path.join(dir, ".claude", "settings.json"), "utf8"), LEGACY_SETTINGS);
  } finally {
    cleanup(dir);
  }
});

test("doctor --fix with an unwritable settings file still prints the diagnosis, names what it applied, and exits 1", { skip }, () => {
  const dir = project();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-heal-refused-home-"));
  const sdk = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-heal-refused-sdk-"));
  try {
    const r = spawnSync(
      process.execPath,
      [BIN, "doctor", "--fix", "--yes", "--no-install", "--no-ios", "--target-dir", dir],
      {
        env: {
          HOME: home,
          ANDROID_HOME: sdk,
          PATH: [path.dirname(process.execPath), "/usr/bin", "/bin"].join(path.delimiter),
          NO_COLOR: "1",
        },
        input: "",
        encoding: "utf8",
        timeout: 60_000,
      }
    );
    const out = strip(r.stdout);
    const err = strip(r.stderr);
    assert.doesNotMatch(err, /Fatal:|^\s+at /m, `doctor crashed with a stack instead of reporting the refusal:\n${err}`);
    assert.equal(r.status, 1, `doctor exited ${r.status} with a heal it could not write:\n${out}\n${err}`);

    // The diagnosis is still there — the findings AND the verdict line after them.
    assert.match(out, /Project diagnosis — /, `the project section never ran:\n${out}`);
    assert.match(out, /Project diagnosis: (no blocking issues|blocking issues found)/, `the diagnosis was discarded:\n${out}`);

    // What failed, and why, in words.
    assert.match(out, /--fix: could not write .*\.claude\/settings\.json.* — permission denied/, out);
    assert.match(out, /heals? could not be written, so doctor exits 1/, out);

    // What was already applied, and that it stayed.
    const applied = out.slice(out.indexOf("Already applied in this run"));
    assert.ok(out.includes("Already applied in this run"), `the heals that did write are not named:\n${out}`);
    assert.match(applied, /sdk\.dir=.* to local\.properties/);
    assert.match(applied, /ksp\.useKSP2=true into gradle\.properties/);
    assert.ok(fs.existsSync(path.join(dir, "local.properties")), "the local.properties heal did not apply");

    // The unwritable file is exactly what it was.
    assert.equal(fs.readFileSync(path.join(dir, ".claude", "settings.json"), "utf8"), LEGACY_SETTINGS);
  } finally {
    cleanup(dir);
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(sdk, { recursive: true, force: true });
  }
});
