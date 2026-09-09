// "Stale is not PASS" — the rule, gated.
//
// The rung says how STRONG the last proof was. It does not say whether that
// proof is about the code in front of you. A receipt earned three commits ago
// is a true statement about a tree that no longer exists, and rendered as a
// green PASS with nothing beside it, it is the most confident lie the console
// can tell. docs/proposals/LIVE-CONSOLE.md makes that a rule; this enforces it.
//
// The second half is the one-spelling rule, borrowed from evidence-ladder's
// inversion: console modules may not grow a SECOND way of deciding whether a
// receipt is current. A fix applied to instances rather than the class comes
// back (NORTH-STAR §9.2), and this repo has paid that price twice in one file.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { STANDING, flowRail, standing } from "../packages/harness/src/console/console-standing.mjs";
import { overviewStatusHtml, flowRailHtml } from "../packages/harness/src/console/console-overview.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONSOLE_DIR = path.join(ROOT, "packages/harness/src/console");
const receipt = (sha) => ({ available: true, verdict: "PASS", evidenceLevel: "L2", pack: "cmp", commit: { sha } });

test("a receipt for THIS commit, on a clean tree, stands current", () => {
  const s = standing(receipt("a".repeat(40)), { head: "a".repeat(40), dirtyCount: 0 });
  assert.equal(s.state, STANDING.CURRENT);
  assert.equal(s.ok, true);
});

test("a moved tree is NOT ok — the verdict is true about a tree you are not looking at", () => {
  const s = standing(receipt("a".repeat(40)), { head: "b".repeat(40), dirtyCount: 0 });
  assert.equal(s.state, STANDING.MOVED);
  assert.equal(s.ok, false, "a PASS receipt from another commit must never read as ok");
  assert.match(s.label, /MOVED/);
  assert.match(s.note, /aaaaaaa/, "the note names the commit the receipt actually proves");
  assert.match(s.note, /bbbbbbb/, "and the commit this tree actually is");
});

test("the right commit with uncommitted edits is NOT ok, and says what it does not cover", () => {
  const s = standing(receipt("a".repeat(40)), { head: "a".repeat(40), dirtyCount: 3 });
  assert.equal(s.state, STANDING.DIRTY);
  assert.equal(s.ok, false);
  assert.match(s.label, /3 files changed/);
  assert.match(s.note, /uncommitted/);

  const one = standing(receipt("a".repeat(40)), { head: "a".repeat(40), dirtyCount: 1 });
  assert.match(one.label, /1 file changed/, "one file is not '1 files'");
});

test("an unanswerable question is stated as absent — never as a pass, never as a failure", () => {
  for (const [what, args] of [
    ["no receipt", [null, { head: "a".repeat(40) }]],
    ["unavailable receipt", [{ available: false }, { head: "a".repeat(40) }]],
    ["receipt with no commit", [{ available: true, commit: {} }, { head: "a".repeat(40) }]],
    ["no HEAD", [receipt("a".repeat(40)), { head: null }]],
  ]) {
    const s = standing(...args);
    assert.equal(s.state, STANDING.UNKNOWN, `${what} must be unknown`);
    assert.equal(s.ok, false, `${what} must not read as ok`);
    assert.match(s.label, /not derivable/, `${what} must use the standard absence form`);
  }
});

test("the strip renders standing, and a moved tree never renders in the ok role", () => {
  const glyph = () => ({ ch: "●", cls: "glyph-signed", label: "PASS" });
  const current = overviewStatusHtml({
    receipt: receipt("a".repeat(40)), receiptGlyph: glyph, tree: { head: "a".repeat(40), dirtyCount: 0 },
  });
  assert.match(current, /standing-ok/);
  assert.match(current, /tree unchanged since/);

  const moved = overviewStatusHtml({
    receipt: receipt("a".repeat(40)), receiptGlyph: glyph, tree: { head: "b".repeat(40), dirtyCount: 0 },
  });
  assert.match(moved, /standing-open/);
  assert.ok(!/standing-ok/.test(moved), "a moved tree must not render in the ok role");

  // Absent `tree` is the pre-existing caller: the clause is simply not shown,
  // rather than a guess rendered as fact.
  const noTree = overviewStatusHtml({ receipt: receipt("a".repeat(40)), receiptGlyph: glyph });
  assert.ok(!/standing-/.test(noTree), "with no tree supplied the strip states nothing about standing");
});

test("the flow rail is DERIVED from the declared sections — a stack that declares no drive gets none", () => {
  const signed = (label, id) => ({ id, label, glyph: { ch: "●", cls: "glyph-signed", label: "signed" } });
  const open = (label, id) => ({ id, label, glyph: null });

  const full = flowRail([signed("Specs", "specs"), open("Screens", "screens"), open("Live device", "live-device")]);
  assert.deepEqual(full.steps.map((s) => s.label), ["Specs", "Screens", "Live device"]);
  assert.equal(full.here, "screens", "here is the FIRST section still wanting attention");
  assert.equal(full.steps[0].done, true);

  const noDevice = flowRail([signed("Specs", "specs"), open("Screens", "screens")]);
  assert.ok(!noDevice.steps.some((s) => s.id === "live-device"), "a rail may not promise a step the profile never declared");

  const allDone = flowRail([signed("Specs", "specs"), signed("Screens", "screens")]);
  assert.equal(allDone.here, "screens", "with nothing open the marker rests on the last step");

  assert.deepEqual(flowRail([]).steps, [], "no sections is an empty rail, not a default one");
  assert.equal(flowRailHtml([]), "", "and renders nothing at all");
});

test("the rail names one command for the step it marks, and nothing to click", () => {
  const html = flowRailHtml(
    [{ id: "verify", label: "Evidence", glyph: null }],
    (id) => (id === "verify" ? "node qa/verify.mjs" : null),
  );
  assert.match(html, /flow-here/);
  assert.match(html, /node qa\/verify\.mjs/);
  assert.ok(!/<button|<a /.test(html), "the rail is descriptive — it has no controls");
});

test("the console keeps ONE spelling of standing — no module may decide it a second way", () => {
  const offenders = [];
  for (const f of fs.readdirSync(CONSOLE_DIR).filter((n) => n.endsWith(".mjs"))) {
    if (f === "console-standing.mjs") continue;
    const src = fs.readFileSync(path.join(CONSOLE_DIR, f), "utf8");
    // Comparing a receipt's commit to a head anywhere but the one module is the
    // second spelling this exists to refuse.
    if (/commit\s*\??\.\s*sha\s*(===|!==)/.test(src) || /\breceipt\b[^\n]*\.\s*sha\s*(===|!==)/.test(src)) {
      offenders.push(f);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these console modules decide standing themselves — import standing() from console-standing.mjs instead: ${offenders.join(", ")}`,
  );
});
