// qa/lib/agent-hold.mjs — liveness for an agent working in a tree, and the
// asymmetry that keeps it from becoming a way to switch the gate off.
//
// The two failures it answers, both measured at payment-blueprint on
// 2026-09-04: a healthy agent killed mid-proof because "is it working or
// wedged?" had no cheap answer, and ~15 Stop-hook alarms in one evening whose
// advice ("run the lane") was wrong every single time.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  HOLD_REL,
  HEARTBEAT_FRESH_MS,
  HOLD_CEILING_MS,
  assessHold,
  beatHold,
  claimHold,
  describeHold,
  formatAge,
  holdExplains,
  readHold,
  releaseHold,
} from "../packages/harness/src/lib/agent-hold.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "cmp-hold-"));
const T0 = Date.parse("2026-09-04T03:00:00.000Z");
const hold = (over = {}) => ({ holder: "porter", note: "adopting the ports", at: new Date(T0).toISOString(), heartbeatAt: new Date(T0).toISOString(), ...over });

// ── The declaration round-trips ─────────────────────────────────────────────

test("claim, beat and release round-trip through the file", () => {
  const root = tmp();
  assert.equal(readHold(root), null);

  claimHold(root, { holder: "porter", note: "adopting the ports", now: T0 });
  const claimed = readHold(root);
  assert.equal(claimed.holder, "porter");
  assert.equal(claimed.note, "adopting the ports");
  assert.equal(claimed.at, claimed.heartbeatAt);

  beatHold(root, { note: "compiling module 3", now: T0 + 60_000 });
  const beaten = readHold(root);
  // The CLAIM time is what ages toward the ceiling; the beat only proves alive.
  assert.equal(beaten.at, claimed.at);
  assert.equal(beaten.heartbeatAt, new Date(T0 + 60_000).toISOString());
  assert.equal(beaten.note, "compiling module 3");

  releaseHold(root);
  assert.equal(readHold(root), null);
});

test("the hold file lives where the other ephemeral declarations live", () => {
  // Not an accident of naming: qa/.plan.json and qa/.request.json are gitignored
  // AND excluded from the receipt's hashed surface. A liveness note that could
  // invalidate a receipt would mean saying "I am here" un-proves the tree.
  assert.equal(HOLD_REL, "qa/.agent-hold.json");
});

test("beating without a claim is refused rather than inventing a hold", () => {
  const root = tmp();
  const r = beatHold(root, { now: T0 });
  assert.equal(r.ok, false);
  assert.match(r.error, /claim one first/);
  assert.equal(readHold(root), null);
});

test("re-claiming an active hold keeps the original start time — it cannot reset its own ceiling", () => {
  const root = tmp();
  claimHold(root, { holder: "porter", now: T0 });
  // Within the heartbeat bound — a re-claim from a still-live agent.
  claimHold(root, { holder: "porter", note: "still going", now: T0 + 2 * 60_000 });
  assert.equal(readHold(root).at, new Date(T0).toISOString());
});

test("re-claiming after the previous hold lapsed starts a fresh clock", () => {
  const root = tmp();
  claimHold(root, { holder: "porter", now: T0 });
  const later = T0 + HEARTBEAT_FRESH_MS + 60_000;
  claimHold(root, { holder: "porter", now: later });
  assert.equal(readHold(root).at, new Date(later).toISOString());
});

test("an unreadable or absent hold file reads as no hold, never as a crash", () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, "qa"), { recursive: true });
  fs.writeFileSync(path.join(root, ...HOLD_REL.split("/")), "{ not json");
  assert.equal(readHold(root), null);
  fs.writeFileSync(path.join(root, ...HOLD_REL.split("/")), "[1,2,3]");
  assert.equal(readHold(root), null);
});

// ── Judging a hold ──────────────────────────────────────────────────────────

test("a fresh hold is held, and says who and how long", () => {
  const a = assessHold(hold(), T0 + 120_000);
  assert.equal(a.held, true);
  assert.equal(a.holder, "porter");
  assert.equal(a.heldMs, 120_000);
  assert.match(a.reason, /porter has held the tree for 2 min/);
});

test("a heartbeat past the freshness bound is a crashed writer, not a live agent", () => {
  const a = assessHold(hold(), T0 + HEARTBEAT_FRESH_MS + 1000);
  assert.equal(a.held, false);
  assert.equal(a.expired, true);
  assert.match(a.reason, /crashed writer, not a live agent/);
});

test("a hold past the ceiling stops counting even while heartbeats keep arriving", () => {
  // The whole point: a heartbeat proves the process is alive, never that it is
  // progressing. Past the ceiling the human needs the alarm back.
  const beating = hold({ heartbeatAt: new Date(T0 + HOLD_CEILING_MS + 60_000).toISOString() });
  const a = assessHold(beating, T0 + HOLD_CEILING_MS + 60_000);
  assert.equal(a.held, false);
  assert.equal(a.expired, true);
  assert.match(a.reason, /past the .* ceiling/);
  assert.match(a.reason, /alive, not that it is progressing/);
});

test("no hold, and a hold with unreadable timestamps, both read as not held with a reason", () => {
  assert.deepEqual(assessHold(null, T0), { held: false, reason: "no agent holds the tree" });
  assert.equal(assessHold(hold({ at: "whenever" }), T0).held, false);
  assert.match(assessHold(hold({ at: "whenever" }), T0).reason, /no readable timestamp/);
});

test("describeHold gives the reader an action, and says nothing when nobody holds it", () => {
  const line = describeHold(assessHold(hold(), T0 + 120_000));
  assert.match(line, /porter has held this tree for 2 min \(adopting the ports\)/);
  assert.match(line, /Wait for it rather than starting a lane on a half-edited tree/);
  assert.match(line, /--release/);
  assert.equal(describeHold(assessHold(null, T0)), null);
});

test("holder and note are clipped — an alarm line stays readable", () => {
  const root = tmp();
  claimHold(root, { holder: "x".repeat(500), note: "y".repeat(500), now: T0 });
  const h = readHold(root);
  assert.equal(h.holder.length, 80);
  assert.equal(h.note.length, 200);
});

// ── The safety property ─────────────────────────────────────────────────────

test("a hold explains an absent receipt", () => {
  assert.equal(holdExplains({ valid: false, reason: "no receipt — run `node qa/verify.mjs`" }, null), true);
});

test("a hold explains a tree that moved under a PASSing receipt — an agent mid-edit", () => {
  const result = { valid: false, reason: "source changed since the receipt — re-run the lane (attesting profile: local)" };
  assert.equal(holdExplains(result, { verdict: "PASS" }), true);
});

test("a hold NEVER explains a red receipt, however the tree moved", () => {
  // The asymmetry: a hold explains the ABSENCE of evidence, never evidence that
  // says something is wrong. Otherwise "an agent is working" would be a way to
  // switch the gate off by writing a file.
  const moved = { valid: false, reason: "source changed since the receipt — re-run the lane (attesting profile: local)" };
  assert.equal(holdExplains(moved, { verdict: "FAIL" }), false);
  assert.equal(holdExplains({ valid: false, reason: "the committed receipt is a FAIL (attesting profile: local)" }, { verdict: "FAIL" }), false);
});

test("a hold NEVER explains a forgery, a tier that did not run, or an inner-loop receipt", () => {
  const cases = [
    ["vouching", "harnessIntegrity FAILed — the lane cannot vouch for itself (attesting profile: local)"],
    ["a tier that did not run", "a tier did not run — e2eSmoke: no Android device"],
    ["--fast", "the last verify run was --fast (inner-loop only); run the full lane"],
    ["smoke", "the last verify run was the smoke profile (the framework check — no build, no tests)"],
    ["nightly", "the last verify run was the nightly stage (it proves the harness, not this change)"],
  ];
  for (const [label, reason] of cases) {
    assert.equal(holdExplains({ valid: false, reason }, { verdict: "PASS" }), false, `${label} must not be explained by a hold`);
  }
});

test("a hold explains nothing at all when the receipt is valid", () => {
  assert.equal(holdExplains({ valid: true, reason: "receipt is valid — PASS" }, { verdict: "PASS" }), false);
  assert.equal(holdExplains(null, null), false);
});

test("the ceiling is longer than the heartbeat bound, or a hold could never reach it", () => {
  assert.ok(HOLD_CEILING_MS > HEARTBEAT_FRESH_MS);
});

test("formatAge stays readable across the ranges an alarm prints", () => {
  assert.equal(formatAge(40_000), "40s");
  assert.equal(formatAge(12 * 60_000), "12 min");
  assert.equal(formatAge(65 * 60_000), "65 min");
  assert.equal(formatAge(150 * 60_000), "2h 30m");
  assert.equal(formatAge(-1), "an unknown time");
  assert.equal(formatAge(undefined), "an unknown time");
});
