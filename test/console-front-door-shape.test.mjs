// THE FRONT DOOR HAS A DESIGN OF RECORD, AND THIS IS THE PROGRAM THAT READS IT.
//
// docs/reference/live-console-prototype.html is the prototype Karel signed on
// 2026-09-09. Phases A–D were implemented against LIVE-CONSOLE.md's ASCII mock
// instead, because the prototype lived outside the repo — and drifted: four
// one-line rows became four <h3> sections with prose under them, a six-step
// flow rail became thirteen wrapping section names duplicating the sidebar, and
// the page stopped fitting above the fold. A design that lives outside the repo
// is a design the repo drifts from, and a drift nobody measures is a drift
// nobody finds.
//
// So the shape is DERIVED from the committed prototype and compared against
// what the console actually renders. Nothing here is a number typed twice: the
// four row keys, the summary grid, the step table's columns and the breakpoint
// are all read out of that file, so editing the prototype moves this test with
// it and editing only the console fails it.
//
// STRUCTURE ONLY. Not pixels — this is a string comparison, not a renderer —
// and not copy: what a row SAYS is each row's own test (console-now,
// console-trust, console-ladder, console-standing). What is pinned here is the
// SHAPE those tests cannot see, because each of them holds one row and the
// defect was in how the four sat together.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { SHELL_CSS } from "../packages/harness/src/console/console-shell.mjs";
import { galleryHtml } from "../packages/harness/src/console/preview-service.mjs";
import { nowState, parseStepStream } from "../packages/harness/src/console/console-now.mjs";
import { trustState, buildFrameworkRecord, FRAMEWORK_RECORD_REL } from "../packages/harness/src/lib/framework-record.mjs";
import { ladderStanding } from "../packages/harness/src/lib/evidence-level.mjs";
import { CMP_LADDER } from "../packages/harness/src/lib/profiles/cmp/ladder.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROTOTYPE_REL = "docs/reference/live-console-prototype.html";
const PROTOTYPE = fs.readFileSync(path.join(ROOT, PROTOTYPE_REL), "utf8");

// ── the normative shape, READ OUT of the prototype ───────────────────────────

/** The prototype's own `.rows` block, and the key of each row in it, in order. */
function prototypeRowKeys() {
  const start = PROTOTYPE.indexOf('<div class="rows">');
  const end = PROTOTYPE.indexOf("</div>\n\n    <footer", start);
  assert.ok(start > 0 && end > start, `${PROTOTYPE_REL} no longer carries a .rows block — the derivation below is reading nothing`);
  const block = PROTOTYPE.slice(start, end);
  return [...block.matchAll(/<span class="k">([^<]+)<\/span>/g)].map((m) => m[1]);
}

/** One CSS declaration out of one of the prototype's rules. */
function prototypeDecl(selector, prop) {
  const i = PROTOTYPE.indexOf(`${selector} {`);
  assert.ok(i > 0, `${PROTOTYPE_REL} declares no rule for ${selector}`);
  const body = PROTOTYPE.slice(i, PROTOTYPE.indexOf("}", i));
  const m = new RegExp(`${prop}\\s*:\\s*([^;}]+)`).exec(body);
  assert.ok(m, `${PROTOTYPE_REL}'s ${selector} declares no ${prop}`);
  return m[1].trim();
}

const ROW_KEYS = prototypeRowKeys();
const SUMMARY_GRID = prototypeDecl(".row > summary", "grid-template-columns");
const STEP_COLUMNS = [...new Set([...PROTOTYPE.matchAll(/table\.steps td\.(\w+)/g)].map((m) => m[1]))];
const BREAKPOINT = Number(/@media \(max-width: (\d+)px\)/.exec(PROTOTYPE)[1]);

// ── the console, rendered ────────────────────────────────────────────────────

const stream = [
  JSON.stringify({ event: "run", phase: "start", runId: "r1", startedAt: "2026-09-09T12:00:00.000Z", profile: "local", mode: "full", total: 2, steps: ["build", "unitTests"] }),
  JSON.stringify({ event: "step", runId: "r1", at: "2026-09-09T12:00:01.000Z", index: 0, total: 2, name: "build", verdict: "PASS", durationMs: 6900 }),
  JSON.stringify({ event: "step", runId: "r1", at: "2026-09-09T12:00:05.000Z", index: 1, total: 2, name: "unitTests", verdict: "PASS", durationMs: 4200 }),
  JSON.stringify({ event: "run", phase: "end", runId: "r1", endedAt: "2026-09-09T12:00:05.000Z", verdict: "PASS", durationMs: 5000, completed: 2, total: 2 }),
].join("\n");

const trust = trustState({
  ok: true,
  relPath: FRAMEWORK_RECORD_REL,
  record: buildFrameworkRecord({
    verdict: "PASS",
    plants: [{ kind: "orphaned-citation", label: "orphaned citation", step: "specCoverage", observed: "specCoverage", names: ["HOME-01"], failedByName: true, durationMs: 240 }],
    treeIdentical: true,
    generatedAt: "2026-09-09T10:00:00.000Z",
  }),
});

const BASE = { appName: "Acme", viewport: { width: 411, height: 891 }, version: 1, cards: [] };
const FULL = {
  ...BASE,
  now: nowState(parseStepStream(stream), { now: Date.parse("2026-09-09T12:01:00.000Z") }),
  trust,
  ladder: ladderStanding(CMP_LADDER, { earned: "L2", passed: ["build", "unitTests"] }),
  lastReceipt: { available: true, verdict: "PASS", evidenceLevel: { rung: "L2", name: "device", satisfiedBy: [] }, packId: "cmp", steps: [] },
};

/** Just the front door's own panel — the rest of the page is other sections. */
function frontDoor(opts = {}) {
  const html = galleryHtml({ ...FULL, ...opts });
  const start = html.indexOf('<section id="tab-overview"');
  assert.ok(start > 0, "the console rendered no front door at all");
  return html.slice(start, html.indexOf("</section>", start));
}

// ── the assertions ───────────────────────────────────────────────────────────

test("FOUR ROWS, in the design of record's order — one line each, not four headed sections", () => {
  assert.deepEqual(ROW_KEYS, ["now", "waiting", "trust", "ladder"], "the derivation itself: the prototype's four keys");
  const panel = frontDoor();
  const rowsStart = panel.indexOf('<div class="rows">');
  assert.ok(rowsStart > 0, "the front door renders no .rows block");
  const rows = panel.slice(rowsStart);
  const keys = [...rows.matchAll(/<span class="k">([^<]+)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(keys, ROW_KEYS, "the console's rows are the prototype's rows, in its order");
  // Each one is a <details class="row"> — collapsed, expanding IN PLACE. Four
  // <h3>s with prose under them is the shape this replaces.
  assert.equal((rows.match(/<details class="row"/g) || []).length, ROW_KEYS.length);
});

test("the summary is the prototype's GRID — a fixed key column, an elastic value, a chevron", () => {
  assert.match(SUMMARY_GRID, /^\S+ 1fr \S+$/, "the derivation itself: three columns, the middle one elastic");
  const grid = new RegExp(`grid-template-columns:\\s*${SUMMARY_GRID.replace(/\s+/g, "\\s+")}`);
  assert.match(SHELL_CSS, grid, `the console's .row > summary must use the prototype's grid (${SUMMARY_GRID})`);
  const panel = frontDoor();
  for (const key of ROW_KEYS) {
    const at = panel.indexOf(`<span class="k">${key}</span>`);
    const summary = panel.slice(panel.lastIndexOf("<summary", at), panel.indexOf("</summary>", at));
    assert.match(summary, /<span class="v[ "]/, `${key}: the summary carries a value cell`);
    assert.match(summary, /<span class="chev">/, `${key}: and a chevron`);
  }
});

test("ONE LINE means one line: no value cell may contain a block, and none may wrap", () => {
  // The CSS half — the three declarations that make an over-long value ellipse
  // instead of wrapping. A wrapped row is no longer a row.
  for (const decl of ["white-space: nowrap", "overflow: hidden", "text-overflow: ellipsis"]) {
    assert.ok(SHELL_CSS.includes(decl), `.row > summary .v must declare ${decl}`);
  }
  // And the markup half, which the CSS cannot save: a <p>, a <table> or a
  // heading inside the value is a second line no matter what white-space says.
  const panel = frontDoor();
  for (const key of ROW_KEYS) {
    const at = panel.indexOf(`<span class="k">${key}</span>`);
    const value = panel.slice(at, panel.indexOf("</summary>", at));
    for (const block of ["<p", "<div", "<table", "<ul", "<ol", "<h3", "<details"]) {
      assert.ok(!value.includes(block), `${key}: its one-line value contains a ${block}> — that is not one line`);
    }
    assert.ok(!value.includes("\n"), `${key}: its one-line value is broken across source lines`);
  }
});

test("the step table is the prototype's four columns, and it has a TBODY", () => {
  assert.deepEqual(STEP_COLUMNS, ["step", "verd", "dur", "why"], "the derivation itself: the prototype's columns");
  for (const col of STEP_COLUMNS) {
    assert.ok(SHELL_CSS.includes(`table.steps td.${col}`), `the console styles no td.${col}`);
  }
  const panel = frontDoor();
  assert.match(panel, /<table class="steps"><tbody/, "table.steps opens a tbody");
  // THE TBODY IS LOad-BEARING, not tidiness: the client appends a finished step
  // with insertAdjacentHTML("beforeend", <tr>…), and the HTML fragment parser
  // FOSTER-PARENTS a bare <tr> out of a <table> while accepting it into a
  // <tbody>. Without it every live row would silently vanish until a reload.
  assert.match(panel, /<tbody id="now-steps">/, "and the rows the SSE appends to are addressed on the tbody");
  for (const col of STEP_COLUMNS) {
    assert.ok(panel.includes(`<td class="${col}">`), `no rendered row carries a td.${col}`);
  }
});

test("NOTHING stands between the strip and the rows — no heading, no intro paragraph", () => {
  const panel = frontDoor();
  const strip = panel.indexOf('class="strip"');
  const rows = panel.indexOf('<div class="rows">');
  assert.ok(strip > 0, "the front door renders no strip");
  assert.ok(rows > strip, "the rows must come after the strip");
  const between = panel.slice(strip, rows);
  assert.ok(!/<h3/.test(between), `a heading sits between the strip and the rows: ${between.slice(0, 200)}`);
  assert.ok(!/<p class="meta"/.test(between), "an intro paragraph sits between the strip and the rows");
  // What IS allowed between them is the one thing the design of record puts
  // there: the flow rail.
  assert.match(between, /<nav class="flow"/, "the flow rail sits directly under the strip");
});

test("the phone breakpoint exists, and it REFLOWS the rail rather than deleting it", () => {
  assert.equal(BREAKPOINT, 720, "the derivation itself: the prototype's breakpoint");
  const at = SHELL_CSS.indexOf(`@media (max-width: ${BREAKPOINT}px)`);
  assert.ok(at > 0, `the console declares no ${BREAKPOINT}px breakpoint — §8's success test is written for a phone`);
  const block = SHELL_CSS.slice(at, SHELL_CSS.indexOf("\n  }", at));
  // THE ONE DELIBERATE DEVIATION from the design of record, pinned so it is not
  // "restored" by someone diffing the two files. The prototype's rail is mockup
  // decoration and it hides it here; this console's rail is the only navigation
  // there is, and deleting navigation on a phone is a regression the design
  // never intended.
  assert.ok(!/#rail\s*\{[^}]*display:\s*none/.test(block), "the rail must stay REACHABLE on a phone, not be deleted");
  assert.match(block, /#rail\s*\{[^}]*order:\s*2/, "it moves below the front door instead");
  assert.match(block, /body\s*\{[^}]*flex-direction:\s*column/, "…which needs the shell to stack");
  assert.match(block, /\.row > summary\s*\{[^}]*grid-template-columns/, "and the row grid narrows with it");
});

test("THE DERIVATION: a project with no live device is promised no `drive` step", () => {
  // The rule the flow rail has always carried, checked where it is actually
  // rendered rather than only against flowRail() in isolation — because the
  // defect it was written for was a CALL SITE that handed the deriver the raw
  // thirteen-item list instead of the filtered one, so the rail promised
  // Screens, Design language, Components and Live device to a project that had
  // none of them while its own sidebar honestly showed none.
  const railOf = (panel) => {
    const rail = panel.slice(panel.indexOf('<nav class="flow"'), panel.indexOf("</nav>"));
    return [...rail.matchAll(/<span class="flow-step[^"]*">([^<]+)<\/span>/g)].map((m) => m[1]);
  };

  // Capability: no Compose app, so no Screens, no Design language, no Live
  // device — the console's own long-standing subtraction.
  const govOnly = railOf(frontDoor({ capabilities: { governance: true, screens: false } }));
  assert.ok(govOnly.length > 0, "a governance-only project still has a flow");
  assert.ok(!govOnly.includes("drive"), `a project with no device section was promised: ${govOnly.join(" → ")}`);
  assert.ok(govOnly.includes("verify"), "what it DOES declare is still on the rail");

  // Declaration: a profile that names four sections gets the steps those four
  // evidence, and no others. Three of the six are simply not this project's.
  const declared = railOf(frontDoor({ sections: ["overview", "specs", "evidence", "approvals"] }));
  assert.deepEqual(declared, ["define", "approve", "verify"], "the rail is what the profile declared, and nothing else");

  // The control: the same console, with the sections, gets both back.
  const compose = frontDoor({ capabilities: { governance: true, screens: true } });
  const full = compose.slice(compose.indexOf('<nav class="flow"'), compose.indexOf("</nav>"));
  for (const step of ["preview", "drive"]) {
    assert.match(full, new RegExp(`>${step}<`), `a project that declares it gets ${step}`);
  }
});

test("the rail's SIX steps never become the section list again", () => {
  const panel = frontDoor();
  const rail = panel.slice(panel.indexOf('<nav class="flow"'), panel.indexOf("</nav>"));
  const steps = [...rail.matchAll(/<span class="flow-step[^"]*">([^<]+)<\/span>/g)].map((m) => m[1]);
  assert.ok(steps.length <= 6, `the flow rail drew ${steps.length} steps: ${steps.join(" → ")}`);
  // The failure by name: the section labels this console's sidebar carries.
  for (const label of ["Screens", "Design language", "Components", "Live device", "Approvals", "Evidence"]) {
    assert.ok(!steps.includes(label), `the flow rail is showing the SECTION "${label}", not a step`);
  }
});
