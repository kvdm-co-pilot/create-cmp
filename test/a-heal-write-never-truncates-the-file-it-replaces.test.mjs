// A HEAL WRITE NEVER TRUNCATES THE FILE IT REPLACES (KD-241).
//
// `healWriter` wrote with `fs.writeFileSync(target, content)`, which truncates the target
// before it writes: a full disk or a kill part-way left a truncated .claude/settings.json
// where the app's own file was. KD-214 reported the failure as "could not write", but the
// original bytes were already gone.
//
// THE CLASS: a heal write that fails at any point after it starts leaves the target's
// original bytes, leaves no temporary file behind, and is still reported as a refused
// write. One that succeeds replaces the content and keeps the file's mode and its symlink.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { mock } from "node:test";

import { healWriter } from "../src/commands/doctor.mjs";

const ORIGINAL = '{\n  "model": "opus",\n  "env": { "A": "1" }\n}\n';
const HEALED = '{\n  "model": "opus",\n  "env": { "A": "1" },\n  "statusLine": { "type": "command" }\n}\n';

function tree() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cmp-heal-atomic-")));
  const target = path.join(dir, "settings.json");
  fs.writeFileSync(target, ORIGINAL);
  return { dir, target };
}

/** Run one heal write with stdout captured; returns what the writer returned and printed. */
function healOnce(target) {
  const write = healWriter();
  let printed = "";
  const out = mock.method(process.stdout, "write", (s) => ((printed += String(s)), true));
  let wrote;
  try {
    wrote = write(target, HEALED, "the walk into settings.json");
  } finally {
    out.mock.restore();
  }
  return { wrote, printed: printed.replace(/\x1b\[[0-9;]*m/g, ""), failed: write.failed };
}

const refusal = (code, syscall) => Object.assign(new Error(`${code}: simulated, ${syscall}`), { code, syscall });

// KD-241
test("a write that fails part-way leaves the original bytes and no temporary file, and is reported", () => {
  const { dir, target } = tree();
  const real = fs.writeFileSync;
  // The disk fills after five bytes of whatever file the heal writes.
  const w = mock.method(fs, "writeFileSync", (p, data, opts) => {
    real(p, String(data).slice(0, 5), opts);
    throw refusal("ENOSPC", "write");
  });
  try {
    const r = healOnce(target);
    assert.equal(r.wrote, false);
    assert.equal(fs.readFileSync(target, "utf8"), ORIGINAL, "the original bytes were not kept");
    assert.deepEqual(fs.readdirSync(dir), ["settings.json"], "a temporary file was left behind");
    assert.equal(r.failed.length, 1);
    assert.match(r.printed, /could not write the walk into settings\.json — the disk is full \(ENOSPC\)/);
  } finally {
    w.mock.restore();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a rename that fails leaves the original bytes and no temporary file, and is reported", () => {
  const { dir, target } = tree();
  const rn = mock.method(fs, "renameSync", () => {
    throw refusal("EPERM", "rename");
  });
  try {
    const r = healOnce(target);
    assert.equal(r.wrote, false, "the write claimed success");
    assert.equal(fs.readFileSync(target, "utf8"), ORIGINAL);
    assert.deepEqual(fs.readdirSync(dir), ["settings.json"], "a temporary file was left behind");
    assert.match(r.printed, /could not write the walk into settings\.json .*\(EPERM\)/);
  } finally {
    rn.mock.restore();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a write that succeeds replaces the content, keeps the mode and the symlink, and leaves no temporary file", () => {
  const { dir, target } = tree();
  fs.chmodSync(target, 0o640);
  const link = path.join(dir, "link.json");
  fs.symlinkSync(target, link);
  try {
    const r = healOnce(link);
    assert.equal(r.wrote, true);
    assert.equal(fs.readFileSync(target, "utf8"), HEALED);
    assert.ok(fs.lstatSync(link).isSymbolicLink(), "the symlink was replaced by a file");
    assert.equal(fs.statSync(target).mode & 0o777, 0o640, "the file's mode changed");
    assert.deepEqual(fs.readdirSync(dir).sort(), ["link.json", "settings.json"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
