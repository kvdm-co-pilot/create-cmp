// device-lease.mjs — check-only READER of the machine-global Android device
// lease, so the inspector's live tier never drives a device a verify lane is
// mid-run on (the wedged-adbd / `device offline` / crossed-app-state class).
//
// ── ON-DISK CONTRACT ────────────────────────────────────────────────────────
// This exact contract is implemented independently by the generated app's
// verify lane (template/qa/lib/device-lease.mjs in the create-cmp repo — the
// acquiring side; stamped into every app as qa/lib/device-lease.mjs). The two
// codebases ship separately and cannot import each other, so the contract
// lives verbatim in BOTH file headers, each pointing at the other. Changing
// anything below means changing it there too.
//
//   Location    <os.tmpdir()>/create-cmp/device-leases/<sanitized-serial>.json
//               tmpdir on purpose: a lease must never survive a reboot.
//   Sanitizing  serial chars outside [A-Za-z0-9._-] become "_"
//               ("emulator-5554"    → emulator-5554.json,
//                "192.168.1.5:5555" → 192.168.1.5_5555.json).
//   Shape       { "pid": number, "holder": string, "root": string,
//                 "serial": string, "acquiredAt": ISO-8601 string }
//               `holder` is a human/agent-readable label naming WHO is driving
//               ("verify lane e2eSmoke", "connect_live", "fleet-check scratch
//               lane"); `root` is the holder's project root.
//   Staleness   a lease is DEAD when EITHER
//                 - its pid is not alive — process.kill(pid, 0) throws ESRCH.
//                   EPERM means the process EXISTS under another user: ALIVE.
//                 - OR acquiredAt is older than MAX_LEASE_AGE_MS (30 min — see
//                   the acquiring side for the reasoning).
//               An unparseable lease file counts as dead.
//   Writes      atomic (temp file + rename, last-writer-wins confirmed by
//               re-read) — the ACQUIRING side's business. This module never
//               writes: dead leases read as free but are never deleted here;
//               reclaim-by-overwrite belongs to acquirers.
// ────────────────────────────────────────────────────────────────────────────
//
// HOLD-VS-CHECK DECISION — the inspector CHECKS, it never HOLDS. A console
// session is open-ended (minutes to hours, mostly idle); holding the lease for
// its duration would starve every verify lane for as long as a human keeps a
// console open — inverting the priority, because the lane's batched device
// evidence is the terminal artifact while live driving is opportunistic and
// can simply wait or retry. Live taps are momentary, so the collision risk is
// per-interaction, and per-interaction checks (connect_live's handshake, each
// navigate_and_inspect tap) are the matching granularity. The small window a
// check-only stance leaves (a lane starting between the check and the tap) is
// closed from the other side: the lane holds the lease for its whole device
// phase, so the very next check refuses with the holder's name.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Same value and reasoning as the acquiring side (template qa/lib/device-lease.mjs). */
export const MAX_LEASE_AGE_MS = 30 * 60 * 1000;

/** Serial → safe file stem: anything outside [A-Za-z0-9._-] becomes "_". */
export function sanitizeSerial(serial) {
  return String(serial).replace(/[^A-Za-z0-9._-]/g, "_");
}

/** The machine-global lease directory (override with { dir } in tests only). */
export function leaseDir(dir) {
  return dir || path.join(os.tmpdir(), "create-cmp", "device-leases");
}

/** Absolute path of the lease file for one serial. */
export function leasePath(serial, { dir } = {}) {
  return path.join(leaseDir(dir), `${sanitizeSerial(serial)}.json`);
}

/** ESRCH → dead; EPERM (exists under another user) → ALIVE; doubt → alive. */
export function pidAlive(pid, { killImpl = process.kill.bind(process) } = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    killImpl(pid, 0);
    return true;
  } catch (err) {
    return !(err && err.code === "ESRCH");
  }
}

function parseLease(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null; // missing OR unparseable — no live lease here
  }
}

function describeLease(lease, nowMs) {
  const acquiredMs = Date.parse(lease.acquiredAt);
  return {
    holder: lease.holder ?? "unknown",
    pid: lease.pid ?? null,
    root: lease.root ?? null,
    acquiredAt: lease.acquiredAt ?? null,
    ageMs: Number.isFinite(acquiredMs) ? Math.max(0, nowMs - acquiredMs) : Number.POSITIVE_INFINITY,
  };
}

function liveLease(lease, nowMs, { killImpl } = {}) {
  if (!lease) return null;
  if (!pidAlive(lease.pid, killImpl ? { killImpl } : {})) return null;
  const acquiredMs = Date.parse(lease.acquiredAt);
  if (!Number.isFinite(acquiredMs) || nowMs - acquiredMs >= MAX_LEASE_AGE_MS) return null;
  return describeLease(lease, nowMs);
}

/**
 * The live lease on one serial, or null when the device is free (no file, a
 * dead pid, an over-age lease, or a torn write all read as free).
 *
 * @returns {{holder,pid,root,acquiredAt,ageMs}|null}
 */
export function readDeviceLease(serial, { dir, killImpl, now = Date.now } = {}) {
  return liveLease(parseLease(leasePath(serial, { dir })), now(), { killImpl });
}

/**
 * Every live lease on the machine, serial included — for callers that know
 * only "a device" rather than which one (a session whose source came from env
 * instead of connect_live). On a one-device machine — the normal case this
 * whole mechanism exists for — any live lease means THE device is held.
 *
 * @returns {Array<{serial,holder,pid,root,acquiredAt,ageMs}>}
 */
export function listLiveDeviceLeases({ dir, killImpl, now = Date.now } = {}) {
  const d = leaseDir(dir);
  let entries;
  try {
    entries = fs.readdirSync(d);
  } catch {
    return []; // no lease dir yet — nothing held
  }
  const nowMs = now();
  const out = [];
  for (const name of entries.sort()) {
    if (!name.endsWith(".json")) continue;
    const lease = parseLease(path.join(d, name));
    const live = liveLease(lease, nowMs, { killImpl });
    if (live) out.push({ serial: lease.serial ?? name.replace(/\.json$/, ""), ...live });
  }
  return out;
}

/** `"verify lane e2eSmoke" (pid 4711, /tmp/scratch-x, 2m ago)` — for errors. */
export function formatHolder(heldBy) {
  if (!heldBy) return "an unknown holder";
  const age =
    !Number.isFinite(heldBy.ageMs) ? "age unknown"
    : heldBy.ageMs < 60_000 ? `${Math.max(1, Math.round(heldBy.ageMs / 1000))}s ago`
    : `${Math.round(heldBy.ageMs / 60_000)}m ago`;
  return `"${heldBy.holder}" (pid ${heldBy.pid ?? "?"}, ${heldBy.root ?? "unknown root"}, ${age})`;
}
