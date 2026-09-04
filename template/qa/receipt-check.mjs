#!/usr/bin/env node
// The evidence-binding predicate — answers one question: does the committed
// receipt (qa/evidence/latest.json) validly attest THIS tree, right now?
//
//   node qa/receipt-check.mjs [--hook] [--json]
//
// Both enforcement points reduce to this predicate: the local Stop hook
// (.claude/settings.json) calls it on every turn-end, and CI calls it before
// re-running the lane. See docs/adr/0005-evidence-binding-by-inputs-hash.md.
//
// VALID  iff receipt.verdict === "PASS" && receipt.inputs.hash === recompute(tree)
// Exit codes (normal mode): VALID -> 0, INVALID -> 1.
// Exit codes (--hook mode, Claude Code Stop-hook protocol):
//   stop_hook_active === true  -> 0 (never block twice in a row)
//   INVALID                    -> 2, reason on stderr (Claude Code's block-and-feed-back signal)
//   VALID                      -> 0, silent

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { computeInputsHash } from "./lib/inputs-hash.mjs";
import { evaluateReceipt, readReceipt } from "./lib/receipt-validate.mjs";
import { readHold, assessHold, describeHold, holdExplains } from "./lib/agent-hold.mjs";
import { LANE_MARKER_STALE_MS, laneMarkerPath } from "./lib/lane-markers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const asHook = args.includes("--hook");
const asJson = args.includes("--json");

// The lane's own in-flight marker (verify.mjs stamps it, rewriting it at each
// step start with the step name and index) — qa/lib/lane-markers.mjs, one
// path and one bound for every reader.

/**
 * The full check running RIGHT NOW, or null. The gate must still refuse — a
 * lane in flight has not produced a receipt yet — but it must not tell the
 * agent to start one. Repeating "run the lane" at a session whose lane is
 * already ten minutes into its release build is an instruction to do the wrong
 * thing, and it fired ~8 times in one observed session.
 * @returns {{step: string|null, index: number|null, total: number|null}|null}
 */
function laneInFlight() {
  try {
    const p = laneMarkerPath(ROOT);
    const st = fs.statSync(p);
    if (Date.now() - st.mtimeMs >= LANE_MARKER_STALE_MS) return null;
    // Content is a bonus, never a requirement: legacy markers hold "pid iso".
    try {
      const n = JSON.parse(fs.readFileSync(p, "utf8"));
      if (n && typeof n === "object") {
        return { step: n.step ?? null, index: n.index ?? null, total: n.total ?? null };
      }
    } catch {
      /* legacy marker — its EXISTENCE is the fact that matters */
    }
    return { step: null, index: null, total: null };
  } catch {
    return null;
  }
}

function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// The predicate itself lives in qa/lib/receipt-validate.mjs (vendored from the
// @create-cmp/receipts package — one definition everywhere a receipt is judged); this
// CLI only reads the receipt and frames the exit codes.
function evaluate() {
  const receipt = readReceipt(ROOT);
  if (receipt === null) {
    return { valid: false, reason: "no receipt — run `node qa/verify.mjs`", profile: undefined };
  }
  // A fast-mode receipt (verify --fast) is an inner-loop signal, never done
  // evidence — refused here before the hash is even recomputed, so a session
  // can never end on "done" while its evidence trail's last run was --fast.
  if (receipt.mode === "fast") {
    return {
      valid: false,
      reason: "the last verify run was --fast (inner-loop only); run the full lane (`node qa/verify.mjs`) before finishing",
      profile: receipt.profile,
    };
  }
  // A nightly receipt proves the HARNESS and the tree's invariants under a
  // forced double-run — never a change. Refused as done-evidence for the same
  // reason --fast is: the receipt's own stage says what it is allowed to mean.
  if (receipt.stage === "nightly" || receipt.profile === "nightly") {
    return {
      valid: false,
      reason: "the last verify run was the nightly stage (it proves the harness, not this change); run the change-stage lane (`node qa/verify.mjs`) before finishing",
      profile: receipt.profile,
    };
  }
  // smoke (GATE-RULES Rule 0) runs no Gradle: it proves the framework returns,
  // never that the change is good. Refused like --fast, for the same reason.
  if (receipt.stage === "smoke" || receipt.profile === "smoke") {
    return {
      valid: false,
      reason: "the last verify run was the smoke profile (the framework check — no build, no tests; it proves the instrument, not this change); run the change-stage lane (`node qa/verify.mjs`) before finishing",
      profile: receipt.profile,
    };
  }
  // The device tier must have RUN (2026-09-03). The lane boots a headless
  // emulator itself, so e2eSmoke/androidChecks only SKIP for two kinds of
  // reason: the project's own structure (no qa/e2e harness, no instrumented
  // sources — honest, allowed) or the ENVIRONMENT (CMP_DEVICE=none, maestro
  // not installed, a lease held elsewhere, an ambiguous serial). The second
  // kind is a gap a human can close, and a change is not done while it stands.
  // Receipts predating `skipKind` are read by their reason text.
  const DEVICE_TIER = ["e2eSmoke", "androidChecks"];
  const envSkipped = (Array.isArray(receipt.steps) ? receipt.steps : []).filter(
    (s) =>
      s &&
      DEVICE_TIER.includes(s.name) &&
      s.verdict === "SKIP" &&
      (s.skipKind === "environment" ||
        (!s.skipKind && /no Android device|maestro CLI not installed|is held by|devices attached|CMP_DEVICE=none/.test(String(s.reason ?? "")))),
  );
  if (envSkipped.length) {
    return {
      valid: false,
      reason:
        `the device tier did not run — ${envSkipped.map((s) => `${s.name}: ${String(s.reason ?? "").split("\n")[0]}`).join("; ")}. ` +
        "The lane boots a headless emulator itself (set CMP_AVD if it cannot choose one); fix the cause and run `node qa/verify.mjs` again before finishing",
      profile: receipt.profile,
    };
  }
  // A surface this project cannot resolve is a REFUSAL with an explanation,
  // never an unhandled stack trace: this runs as the Stop hook on every turn
  // end, and a crash there reads as a broken harness rather than as the
  // misconfiguration it is. (evidence-economics S8 follow-up: computeInputsHash
  // now throws rather than returning a confident hash of the empty set.)
  let result;
  try {
    result = evaluateReceipt(receipt, () => computeInputsHash(ROOT));
  } catch (err) {
    return {
      valid: false,
      reason: `cannot verify this receipt — ${err && err.message ? err.message : String(err)}`,
      profile: receipt.profile,
    };
  }
  // Surface the receipt's evidence rung (the ladder — qa/lib/evidence-level.mjs)
  // alongside the verdict: the rung is the receipt's own derived field, read
  // verbatim, never recomputed here. Older receipts without it stay valid.
  const level = receipt.evidenceLevel;
  if (level && typeof level === "object" && typeof level.rung === "string") {
    result.evidenceLevel = level;
  }
  return result;
}

const result = evaluate();

if (asHook) {
  const hookInput = readStdinJson();
  if (hookInput.stop_hook_active === true) {
    process.exit(0);
  }
  if (!result.valid) {
    // The walk's vocabulary (walk-legibility L3): this gate IS the Prove
    // stage refusing to close — same fact, same enforcement, words that match
    // every other surface. The precise reason stays verbatim beneath.
    //
    // The REFUSAL never changes with a lane in flight — no receipt yet means
    // not done, and that is the whole point of the gate. What changes is the
    // INSTRUCTION: "run the lane" is wrong advice when one is already running,
    // and a gate that tells you to do the thing you are doing trains you to
    // stop reading it.
    //
    // An agent HOLDING the tree is the same shape of correction one level out:
    // a lane in flight explains a receipt that is about to arrive, a hold
    // explains a tree that is mid-edit and would not compile if you ran one.
    // Reported ~15 false alarms in one evening at payment-blueprint, every one
    // of which should have said "wait". It only ever changes the instruction —
    // and only for the two refusals a working agent legitimately causes
    // (holdExplains), never for a FAIL, a forgery or a skipped device tier,
    // where the hold is not the cause and offering it would misdirect.
    const flight = laneInFlight();
    const hold = holdExplains(result, readReceipt(ROOT)) ? assessHold(readHold(ROOT)) : null;
    const act = flight
      ? `A full check is ALREADY RUNNING${flight.step ? ` (${flight.step}${flight.index && flight.total ? `, step ${flight.index} of ${flight.total}` : ""})` : ""} — ` +
        `wait for it to finish and commit its receipt. Do NOT start a second one; two lanes fight over the same build directory.`
      : hold?.held
        ? describeHold(hold)
        : "Run `node qa/verify.mjs` (it checks every promise and writes the receipt), " +
          "commit the receipt, or see README §Verification enforcement to bypass.";
    process.stderr.write(
      `■ Prove — not done: the promises are not yet checked against this tree. ${result.reason}. ${act}\n`,
    );
    process.exit(2);
  }
  process.exit(0);
}

const rungSuffix = result.evidenceLevel ? ` — evidence ${result.evidenceLevel.rung} · ${result.evidenceLevel.name}` : "";

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else if (result.valid) {
  console.log(`VALID — ${result.reason}${rungSuffix}`);
} else {
  console.error(`INVALID — ${result.reason}`);
}

process.exit(result.valid ? 0 : 1);
