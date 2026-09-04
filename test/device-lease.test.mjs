// The machine-global device lease (template/qa/lib/profiles/cmp/device-lease.mjs) — the
// mutual-exclusion primitive keyed by the DEVICE (adb serial), not the project,
// because the lane marker is per-project while the emulator is machine-global.
//
// Contracts under test, with REAL files in REAL temp dirs (no fs mocking) and
// REAL child processes for the cross-process claims:
//   - acquire / contend / release, with the holder named on refusal
//   - stale reclaim by dead pid and by age; EPERM means ALIVE
//   - idempotent release that never deletes another holder's lease
//   - atomic write + last-writer-wins confirmation
//   - serial sanitization (tcp serials carry ':')
//   - cross-codebase parity: the inspector MCP's independent reader
//     (inspector/mcp/src/lib/device-lease.mjs) sees exactly what the template
//     side wrote — the two headers document the same contract, and this file
//     is the drift guard between them.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  MAX_LEASE_AGE_MS,
  acquireDeviceLease,
  formatHolder,
  leasePath,
  releaseDeviceLease,
  sanitizeSerial,
  withDeviceLease,
} from "../template/qa/lib/profiles/cmp/device-lease.mjs";
import {
  MAX_LEASE_AGE_MS as INSPECTOR_MAX_LEASE_AGE_MS,
  readDeviceLease as inspectorReadDeviceLease,
  formatHolder as inspectorFormatHolder,
} from "../inspector/mcp/src/lib/device-lease.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_LIB = path.join(HERE, "..", "template", "qa", "lib", "profiles", "cmp", "device-lease.mjs");
const INSPECTOR_LIB = path.join(HERE, "..", "inspector", "mcp", "src", "lib", "device-lease.mjs");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "lease-engine-"));

test("serial sanitization: ':' and friends never reach the filename; the path lands under the lease dir", () => {
  assert.equal(sanitizeSerial("emulator-5554"), "emulator-5554");
  assert.equal(sanitizeSerial("192.168.1.5:5555"), "192.168.1.5_5555");
  const dir = tmp();
  const p = leasePath("192.168.1.5:5555", { dir });
  assert.equal(path.dirname(p), dir);
  assert.equal(path.basename(p), "192.168.1.5_5555.json");
});

test("acquire → contend → release: the second acquirer is refused and told the holder; release frees the device", () => {
  const dir = tmp();
  const a = acquireDeviceLease({ serial: "emulator-5554", holder: "verify lane e2eSmoke", root: "/tmp/app-a", dir });
  assert.equal(a.ok, true);
  assert.equal(a.reclaimed, null);

  const b = acquireDeviceLease({ serial: "emulator-5554", holder: "verify lane androidChecks", root: "/tmp/app-b", dir });
  assert.equal(b.ok, false);
  assert.equal(b.heldBy.holder, "verify lane e2eSmoke");
  assert.equal(b.heldBy.pid, process.pid);
  assert.equal(b.heldBy.root, "/tmp/app-a");
  assert.ok(b.heldBy.ageMs >= 0);

  releaseDeviceLease(a.handle);
  const c = acquireDeviceLease({ serial: "emulator-5554", holder: "verify lane androidChecks", root: "/tmp/app-b", dir });
  assert.equal(c.ok, true);
  releaseDeviceLease(c.handle);
});

test("a different serial is a different lease — two devices never contend", () => {
  const dir = tmp();
  const a = acquireDeviceLease({ serial: "emulator-5554", holder: "lane A", root: "/a", dir });
  const b = acquireDeviceLease({ serial: "192.168.1.5:5555", holder: "lane B", root: "/b", dir });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  releaseDeviceLease(a.handle);
  releaseDeviceLease(b.handle);
});

test("stale reclaim by dead pid: a crashed holder never wedges the machine — reclaimed silently, and named", () => {
  const dir = tmp();
  const child = spawnSync(process.execPath, ["-e", ""]); // a real once-alive pid, now certainly dead
  assert.equal(child.status, 0);
  fs.writeFileSync(
    leasePath("emulator-5554", { dir }),
    JSON.stringify({ pid: child.pid, holder: "crashed lane", root: "/tmp/gone", serial: "emulator-5554", acquiredAt: new Date().toISOString() })
  );
  const res = acquireDeviceLease({ serial: "emulator-5554", holder: "next lane", root: "/tmp/next", dir });
  assert.equal(res.ok, true);
  assert.equal(res.reclaimed.holder, "crashed lane", "the reclaim names the dead lease it replaced");
  releaseDeviceLease(res.handle);
});

test("stale reclaim by age: an over-age lease is dead even when its pid is alive (recycled-pid cover)", () => {
  const dir = tmp();
  fs.writeFileSync(
    leasePath("emulator-5554", { dir }),
    JSON.stringify({
      pid: process.pid, // alive — age alone must reclaim
      holder: "forgotten lane",
      root: "/tmp/old",
      serial: "emulator-5554",
      acquiredAt: new Date(Date.now() - MAX_LEASE_AGE_MS - 1000).toISOString(),
    })
  );
  const res = acquireDeviceLease({ serial: "emulator-5554", holder: "next lane", root: "/tmp/next", dir });
  assert.equal(res.ok, true);
  assert.equal(res.reclaimed.holder, "forgotten lane");
  releaseDeviceLease(res.handle);
});

test("EPERM means ALIVE: a lease owned by another user's process refuses, never reclaims", () => {
  const dir = tmp();
  const eperm = () => {
    const e = new Error("kill EPERM");
    e.code = "EPERM";
    throw e;
  };
  fs.writeFileSync(
    leasePath("emulator-5554", { dir }),
    JSON.stringify({ pid: 4321, holder: "other user's lane", root: "/Users/other/app", serial: "emulator-5554", acquiredAt: new Date().toISOString() })
  );
  const res = acquireDeviceLease({ serial: "emulator-5554", holder: "mine", root: "/mine", dir, killImpl: eperm });
  assert.equal(res.ok, false, "EPERM is existence under another user — ALIVE, not dead");
  assert.equal(res.heldBy.holder, "other user's lane");
});

test("release is idempotent: twice, and after the file is already gone — both no-ops", () => {
  const dir = tmp();
  const res = acquireDeviceLease({ serial: "emulator-5554", holder: "lane", root: "/x", dir });
  releaseDeviceLease(res.handle);
  releaseDeviceLease(res.handle); // second release of the same handle
  fs.rmSync(res.handle.file, { force: true });
  releaseDeviceLease(res.handle); // file certainly gone
  releaseDeviceLease(null); // and a null handle is harmless
});

test("release NEVER deletes another holder's lease: a re-acquired (or overwritten) file survives our stale release", () => {
  const dir = tmp();
  const mine = acquireDeviceLease({ serial: "emulator-5554", holder: "lane A", root: "/a", dir });
  // Someone reclaimed/overwrote us (their rename won): the file now carries a different pid+acquiredAt.
  const foreign = { pid: process.pid, holder: "lane B", root: "/b", serial: "emulator-5554", acquiredAt: new Date(Date.now() + 5000).toISOString() };
  fs.writeFileSync(mine.handle.file, JSON.stringify(foreign));
  releaseDeviceLease(mine.handle);
  assert.ok(fs.existsSync(mine.handle.file), "the foreign lease file is untouched");
  assert.equal(JSON.parse(fs.readFileSync(mine.handle.file, "utf8")).holder, "lane B");
});

test("withDeviceLease: runs under the lease, releases in a finally, passes a refusal through untouched", async () => {
  const dir = tmp();
  let sawHeld = null;
  const out = withDeviceLease({ serial: "emulator-5554", holder: "wrapped", root: "/w", dir }, (handle) => {
    sawHeld = JSON.parse(fs.readFileSync(handle.file, "utf8")).holder;
    return 42;
  });
  assert.deepEqual({ ok: out.ok, result: out.result }, { ok: true, result: 42 });
  assert.equal(sawHeld, "wrapped");
  assert.ok(!fs.existsSync(leasePath("emulator-5554", { dir })), "released after fn");

  const held = acquireDeviceLease({ serial: "emulator-5554", holder: "blocker", root: "/b", dir });
  const refused = withDeviceLease({ serial: "emulator-5554", holder: "late", root: "/l", dir }, () => {
    throw new Error("must not run");
  });
  assert.equal(refused.ok, false);
  assert.equal(refused.heldBy.holder, "blocker");
  releaseDeviceLease(held.handle);

  // And it throws through (still releasing) when fn throws.
  assert.throws(() => withDeviceLease({ serial: "emulator-5554", holder: "thrower", root: "/t", dir }, () => {
    throw new Error("boom");
  }), /boom/);
  assert.ok(!fs.existsSync(leasePath("emulator-5554", { dir })), "released even on throw");
});

test("atomic write: no reader ever sees a half-written lease (the visible file is always whole JSON)", () => {
  const dir = tmp();
  const res = acquireDeviceLease({ serial: "emulator-5554", holder: "atomic", root: "/a", dir });
  const parsed = JSON.parse(fs.readFileSync(res.handle.file, "utf8")); // parses, whole
  assert.equal(parsed.holder, "atomic");
  assert.ok(!fs.readdirSync(dir).some((f) => f.endsWith(".tmp")), "no temp files left behind");
  releaseDeviceLease(res.handle);
});

// ── The multi-process proof (the task's gate): two REAL Node processes ────────
// Process A takes the lease and holds. Process B must be REFUSED and TOLD the
// holder. Then A is killed (a crash, not a release) and the next acquirer
// reclaims the dead lease — a crashed run must not wedge the machine forever.
test("two processes, one device: the second is refused naming the first; killing the first lets the next reclaim", async () => {
  const dir = tmp();
  const libUrl = pathToFileURL(TEMPLATE_LIB).href;
  const childSrc = (holder, hold) => `
    import { acquireDeviceLease } from ${JSON.stringify(libUrl)};
    const res = acquireDeviceLease({ serial: "emulator-5554", holder: ${JSON.stringify(holder)}, root: "/tmp/child", dir: ${JSON.stringify(dir)} });
    console.log(JSON.stringify(res));
    ${hold ? "if (res.ok) setInterval(() => {}, 1000); // hold until killed" : ""}
  `;
  const run = (holder, hold) =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["--input-type=module", "-e", childSrc(holder, hold)], { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      let err = "";
      child.stdout.on("data", (d) => {
        out += d;
        if (out.includes("\n")) resolve({ child, result: JSON.parse(out.slice(0, out.indexOf("\n"))) });
      });
      child.stderr.on("data", (d) => (err += d));
      child.on("error", reject);
      child.on("exit", (code) => {
        if (!out.includes("\n")) reject(new Error(`child exited ${code} without a result: ${err}`));
      });
    });

  const a = await run("verify lane e2eSmoke", true);
  assert.equal(a.result.ok, true, "process A holds the device");

  const b = await run("verify lane androidChecks", false);
  assert.equal(b.result.ok, false, "process B is refused while A holds");
  assert.equal(b.result.heldBy.holder, "verify lane e2eSmoke", "B is told WHO holds");
  assert.equal(b.result.heldBy.pid, a.child.pid, "B is told the holder's real pid");
  assert.equal(b.result.heldBy.root, "/tmp/child");
  b.child.kill("SIGKILL");

  // A crashes (killed, never released) — the lease file remains but its pid is dead.
  a.child.kill("SIGKILL");
  await new Promise((resolve) => a.child.on("exit", resolve));
  assert.ok(fs.existsSync(leasePath("emulator-5554", { dir })), "the crashed holder left its lease behind");

  const next = acquireDeviceLease({ serial: "emulator-5554", holder: "next lane", root: "/tmp/next", dir });
  assert.equal(next.ok, true, "a dead pid's lease is reclaimed — the machine heals itself");
  assert.equal(next.reclaimed.holder, "verify lane e2eSmoke", "the reclaim names the crashed holder");
  releaseDeviceLease(next.handle);
});

// ── Cross-codebase contract parity: the inspector's independent reader ────────
// template/qa/lib/profiles/cmp/device-lease.mjs (acquirer, ships in every stamped app) and
// inspector/mcp/src/lib/device-lease.mjs (check-only reader, ships in the
// plugin bundle) cannot import each other. These pins are the drift guard.
test("contract parity: a lease the template side acquires is exactly what the inspector reader reports", () => {
  const dir = tmp();
  const res = acquireDeviceLease({ serial: "192.168.1.5:5555", holder: "verify lane releaseSmoke", root: "/tmp/app", dir });
  assert.equal(res.ok, true);

  const seen = inspectorReadDeviceLease("192.168.1.5:5555", { dir });
  assert.ok(seen, "the inspector reader finds the template-written lease (same path, same sanitization)");
  assert.equal(seen.holder, "verify lane releaseSmoke");
  assert.equal(seen.pid, process.pid);
  assert.equal(seen.root, "/tmp/app");
  assert.equal(inspectorFormatHolder(seen), formatHolder(seen), "both sides word the holder identically");

  releaseDeviceLease(res.handle);
  assert.equal(inspectorReadDeviceLease("192.168.1.5:5555", { dir }), null, "released reads as free on the inspector side too");
});

test("contract parity: both headers document the shared contract and point at each other", () => {
  const templateSrc = fs.readFileSync(TEMPLATE_LIB, "utf8");
  const inspectorSrc = fs.readFileSync(INSPECTOR_LIB, "utf8");
  assert.match(templateSrc, /inspector\/mcp\/src\/lib\/device-lease\.mjs/, "template header names the inspector implementation");
  assert.match(inspectorSrc, /template\/qa\/lib\/profiles\/cmp\/device-lease\.mjs/, "inspector header names the template implementation");
  for (const src of [templateSrc, inspectorSrc]) {
    assert.match(src, /create-cmp\/device-leases/, "same on-disk location");
    assert.match(src, /A-Za-z0-9._-/, "same sanitization rule");
    assert.match(src, /EPERM/, "same EPERM-means-alive rule");
    assert.match(src, /acquiredAt/, "same JSON shape");
  }
  // The staleness window must agree — both constants, and the documented value.
  assert.equal(MAX_LEASE_AGE_MS, INSPECTOR_MAX_LEASE_AGE_MS, "both sides use the same max age");
  assert.equal(MAX_LEASE_AGE_MS, 30 * 60 * 1000, "the documented 30-minute max age (see the template header's reasoning)");
});
