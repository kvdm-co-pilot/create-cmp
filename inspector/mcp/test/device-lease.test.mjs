// device-lease.mjs — the check-only reader of the machine-global device lease.
//
// Contracts under test: the reader honors the shared on-disk contract
// (location shape, serial sanitization, staleness rules) written into both
// this module's header and the acquiring side's
// (template/qa/lib/device-lease.mjs); dead leases read as FREE but are never
// deleted (reclaim belongs to acquirers); EPERM means alive. Real temp dirs,
// no fs mocking — the { dir } override exists exactly so tests never touch the
// machine's actual lease directory.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  MAX_LEASE_AGE_MS,
  formatHolder,
  leasePath,
  listLiveDeviceLeases,
  pidAlive,
  readDeviceLease,
  sanitizeSerial,
} from "../src/lib/device-lease.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "lease-reader-"));

function writeLease(dir, serial, lease) {
  fs.mkdirSync(dir, { recursive: true });
  const file = leasePath(serial, { dir });
  fs.writeFileSync(file, `${JSON.stringify(lease)}\n`);
  return file;
}

test("serial sanitization: tcp serials produce a legal filename with no ':'", () => {
  assert.equal(sanitizeSerial("emulator-5554"), "emulator-5554");
  assert.equal(sanitizeSerial("192.168.1.5:5555"), "192.168.1.5_5555");
  const dir = tmp();
  assert.ok(!path.basename(leasePath("192.168.1.5:5555", { dir })).includes(":"));
});

test("a live lease reads back with holder, pid, root, and age", () => {
  const dir = tmp();
  const acquiredAt = new Date(Date.now() - 120_000).toISOString();
  writeLease(dir, "emulator-5554", {
    pid: process.pid, // our own pid: provably alive
    holder: "verify lane androidChecks",
    root: "/tmp/scratch-x",
    serial: "emulator-5554",
    acquiredAt,
  });
  const held = readDeviceLease("emulator-5554", { dir });
  assert.equal(held.holder, "verify lane androidChecks");
  assert.equal(held.pid, process.pid);
  assert.equal(held.root, "/tmp/scratch-x");
  assert.ok(held.ageMs >= 120_000 && held.ageMs < 130_000);
  assert.match(formatHolder(held), /"verify lane androidChecks" \(pid \d+, \/tmp\/scratch-x, 2m ago\)/);
});

test("staleness: a dead pid reads as free — and the file is NOT deleted (reclaim belongs to acquirers)", async () => {
  const dir = tmp();
  // A real once-alive-now-dead pid: spawn a child and let it exit.
  const { spawnSync } = await import("node:child_process");
  const child = spawnSync(process.execPath, ["-e", ""]);
  assert.equal(child.status, 0);
  const file = writeLease(dir, "emulator-5554", {
    pid: child.pid ?? 999_999_999, // spawnSync exposes pid; fallback is an impossible pid
    holder: "crashed lane",
    root: "/tmp/gone",
    serial: "emulator-5554",
    acquiredAt: new Date().toISOString(),
  });
  assert.equal(readDeviceLease("emulator-5554", { dir }), null);
  assert.ok(fs.existsSync(file), "the reader never deletes — it only reports free");
});

test("staleness: an over-age lease (alive pid) reads as free", () => {
  const dir = tmp();
  writeLease(dir, "emulator-5554", {
    pid: process.pid,
    holder: "forgotten lane",
    root: "/tmp/old",
    serial: "emulator-5554",
    acquiredAt: new Date(Date.now() - MAX_LEASE_AGE_MS - 1000).toISOString(),
  });
  assert.equal(readDeviceLease("emulator-5554", { dir }), null);
});

test("EPERM means ALIVE: a lease owned by another user's process still holds", () => {
  const eperm = () => {
    const e = new Error("kill EPERM");
    e.code = "EPERM";
    throw e;
  };
  assert.equal(pidAlive(1234, { killImpl: eperm }), true);
  const dir = tmp();
  writeLease(dir, "emulator-5554", {
    pid: 1234,
    holder: "another user's lane",
    root: "/Users/other/app",
    serial: "emulator-5554",
    acquiredAt: new Date().toISOString(),
  });
  const held = readDeviceLease("emulator-5554", { dir, killImpl: eperm });
  assert.ok(held, "EPERM is existence, not death");
  assert.equal(held.holder, "another user's lane");
});

test("torn/unparseable lease files read as free; missing dir lists as empty", () => {
  const dir = tmp();
  fs.writeFileSync(leasePath("emulator-5554", { dir }), "{ torn wri");
  assert.equal(readDeviceLease("emulator-5554", { dir }), null);
  assert.deepEqual(listLiveDeviceLeases({ dir: path.join(dir, "never-created") }), []);
});

test("listLiveDeviceLeases: live leases across serials, dead ones filtered out", () => {
  const dir = tmp();
  writeLease(dir, "emulator-5554", {
    pid: process.pid,
    holder: "verify lane e2eSmoke",
    root: "/tmp/a",
    serial: "emulator-5554",
    acquiredAt: new Date().toISOString(),
  });
  writeLease(dir, "192.168.1.5:5555", {
    pid: 999_999_999, // dead
    holder: "crashed",
    root: "/tmp/b",
    serial: "192.168.1.5:5555",
    acquiredAt: new Date().toISOString(),
  });
  const live = listLiveDeviceLeases({ dir });
  assert.equal(live.length, 1);
  assert.equal(live[0].serial, "emulator-5554");
  assert.equal(live[0].holder, "verify lane e2eSmoke");
});
