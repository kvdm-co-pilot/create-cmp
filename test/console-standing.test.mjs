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

import { FLOW_STEPS, STANDING, flowRail, standing } from "../packages/harness/src/console/console-standing.mjs";
import { overviewStatusHtml, flowRailHtml } from "../packages/harness/src/console/console-overview.mjs";
import { receiptGlyph, statusGlyph } from "../packages/harness/src/console/console-shell.mjs";
import { galleryHtml } from "../packages/harness/src/console/preview-service.mjs";

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

// The rail is SIX conceptual steps (LIVE-CONSOLE.md §2, and the design of
// record), and what stays derived is WHICH of the six this project has. It was
// one step per section until 2026-09-09, which drew thirteen wrapping section
// names under the strip — a second copy of the sidebar, not a flow. The rule
// this file has always enforced is unchanged and is now MORE true: a rail may
// not promise a step the profile never declared.
test("the flow rail is SIX steps, DERIVED — a stack that declares no device gets no drive", () => {
  const signed = (id) => ({ id, glyph: { ch: "●", cls: "glyph-signed", label: "signed" } });
  const open = (id) => ({ id, glyph: null });

  const full = flowRail([signed("specs"), open("screens"), open("live-device")]);
  assert.deepEqual(full.steps.map((s) => s.id), ["define", "preview", "drive"], "one step per PHASE, not per section");
  assert.equal(full.here, "preview", "here is the first step still wanting attention");
  assert.equal(full.steps[0].done, true, "define's only present evidence is signed, so define is done");

  const noDevice = flowRail([signed("specs"), open("screens")]);
  assert.ok(!noDevice.steps.some((s) => s.id === "drive"), "a rail may not promise a step the profile never declared");
  assert.ok(!noDevice.steps.some((s) => s.id === "verify"), "…and that is true of every one of the six, not just drive");

  // A step is done only when EVERY present section that evidences it is
  // settled. One unsigned spec leaves `define` open, because it is.
  const partly = flowRail([signed("intent"), open("specs")]);
  assert.deepEqual(partly.steps.map((s) => [s.id, s.done]), [["define", false]]);

  const allDone = flowRail([signed("specs"), signed("screens")]);
  assert.equal(allDone.here, "preview", "with nothing open the marker rests on the last present step");

  // The two sections that evidence no phase: the front door is where the rail
  // is drawn, and the comment ledger is a margin, not a phase of the work.
  assert.deepEqual(flowRail([open("overview"), open("comments")]).steps, [], "overview and comments are not steps");
  assert.deepEqual(flowRail([]).steps, [], "no sections is an empty rail, not a default one");
  assert.equal(flowRailHtml([]), "", "and renders nothing at all");
});

test("the rail names one command for the STEP it marks, and nothing to click", () => {
  // Keyed on the step id, not a section id: `verify` is one step and `evidence`
  // is the section that evidences it, and a map keyed on sections could only
  // ever answer for one of the four sections a step may have.
  const html = flowRailHtml(
    [{ id: "evidence", glyph: null }],
    (id) => (id === "verify" ? "node qa/verify.mjs" : null),
  );
  assert.match(html, /flow-here/);
  assert.match(html, /node qa\/verify\.mjs/);
  assert.ok(!/<button|<a /.test(html), "the rail is descriptive — it has no controls");
});

test("the six steps are the proposal's, in the proposal's order", () => {
  // LIVE-CONSOLE.md §2: "define → preview → approve → verify → report → drive
  // is the harness's working flow today". Pinned so a seventh step, or a
  // reordering, is a decision somebody makes rather than one that happens.
  assert.deepEqual(FLOW_STEPS.map((s) => s.id), ["define", "preview", "approve", "verify", "report", "drive"]);
  // No section evidences two steps: a section in two phases would make one
  // step's doneness depend on another's, and the marker would stop meaning
  // "the next thing to do".
  const seen = new Set();
  for (const step of FLOW_STEPS) {
    for (const id of step.sections) {
      assert.equal(seen.has(id), false, `${id} evidences more than one step`);
      seen.add(id);
    }
  }
});

test("an UNSIGNED section is marked DONE on the rail — `settled()` matches \"signed\" as a substring", () => {
  // console-standing.mjs's own comment on the predicate: "signed is done,
  // everything else (unsigned, reopened, drifted, absent) is not." The
  // predicate is `s.glyph.cls.includes("signed")`, and the class an unsigned
  // artifact wears is `glyph-unsigned` — which CONTAINS "signed". So the one
  // state the comment names first is the one the code answers YES to.
  //
  // The glyph vocabulary below is the shell's own derivation, never a class
  // name typed here: renaming the class must move this test, not satisfy it.
  //
  // Why it is this branch's defect and not a pre-existing one: `flowRailHtml`
  // had no caller until preview-service.mjs added one here ("Phase A shipped
  // the rail's deriver, its renderer and its CSS, and never called it"). The
  // wrong answer was unreachable; the call site makes it a line on the page.
  const noReceipt = receiptGlyph({ available: false });
  assert.equal(noReceipt.cls, "glyph-unsigned", "the derivation itself: no receipt is UNSIGNED");
  assert.equal(
    flowRail([{ id: "evidence", glyph: noReceipt }]).steps[0].done,
    false,
    "a tree that has never been verified has not finished `verify`",
  );

  // The same fact one row up, in the words console-standing.mjs uses for it:
  // "One unsigned spec leaves `define` open, which is the honest reading."
  const unsignedSpec = statusGlyph({ status: "unreviewed" });
  assert.equal(unsignedSpec.cls, "glyph-unsigned", "the derivation itself: an unreviewed artifact is UNSIGNED");
  assert.equal(flowRail([{ id: "specs", glyph: unsignedSpec }]).steps[0].done, false, "one unsigned spec leaves `define` open");

  // And where a reader actually meets it. A project with no receipt at all is
  // the state every new adopter opens the console in, and the rail under the
  // strip paints `verify` in the settled role while the strip beside it says
  // "no verify receipt yet" — two clauses on one screen that disagree.
  const html = galleryHtml({ appName: "Acme", viewport: { width: 411, height: 891 }, version: 1, cards: [] });
  const at = html.indexOf('<nav class="flow"');
  assert.ok(at > 0, "the front door renders no flow rail");
  const nav = html.slice(at, html.indexOf("</nav>", at));
  assert.doesNotMatch(
    nav,
    /class="flow-step[^"]*flow-done[^"]*">verify</,
    `the rail called an unverified tree's verify step done: ${nav}`,
  );
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
