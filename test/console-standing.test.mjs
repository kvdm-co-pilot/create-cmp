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
  // THIS EXPECTATION WAS RIGHT ALL ALONG, and briefly said "drive" instead.
  // Mid-branch it looked like screens could never be settled, so preview was
  // made to abstain and this line was changed to match. That diagnosis was
  // wrong — screens was only ever unasked, and deriving its glyph from the
  // screen count restored exactly the reading this line started with: an
  // `open("screens")` project has rendered nothing, preview genuinely wants
  // attention, and the marker rests there. A test that has to be edited twice
  // to accommodate a fix is a test that was telling you the fix was wrong.
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
  // Keyed on the OPEN SECTION, not the step. This fixture keyed on the step id
  // for a day, and that was the defect written down: a step is a phase, so
  // "what advances this?" has no answer at the step's altitude — `define`
  // spans four sections and named `arch-doc.mjs` whichever of them was open.
  // The section holding the step open does have an unambiguous answer, and
  // `flowRail` reports it as `openSection`. Same rule as the verdict fix one
  // screen up: fix the evidence, never the predicate.
  const html = flowRailHtml(
    [{ id: "evidence", glyph: null }],
    (id) => (id === "evidence" ? "node qa/verify.mjs" : null),
  );
  assert.match(html, /flow-here/);
  assert.match(html, /node qa\/verify\.mjs/);
  assert.ok(!/<button|<a /.test(html), "the rail is descriptive — it has no controls");
});

test("the rail names `node qa/arch-doc.mjs` beside a `define` step that is open for a SIGNATURE", () => {
  // THE COMMAND IS KEYED ON THE STEP, AND ANSWERS FOR ONE OF ITS FOUR SECTIONS.
  // preview-service.mjs's FLOW_COMMANDS rejects section keys in its own words —
  // "a map keyed on sections could only ever answer for one section of the four
  // a step may have" — and then keys `define` to `node qa/arch-doc.mjs`, which
  // is the answer for exactly one of its four (architecture). `define` is done
  // when intent, features, architecture AND specs are signed, so the state that
  // holds it open is almost always a SIGNATURE, and arch-doc.mjs signs nothing:
  // it regenerates ARCHITECTURE.md's `cmp:generated` sections. A reader who
  // runs the one command the rail names gets no change, and the rail says the
  // same thing again. The command that does advance it — `node qa/approve.mjs`
  // — is in the same map, one line down, keyed to `approve`.
  //
  // It is the rule that map states for itself, broken by the map: "a step with
  // no unambiguous command returns null and the rail says nothing beside it,
  // which is evidence-or-silence applied to a command." A four-section step has
  // no unambiguous command; this one names a command anyway.
  //
  // AND IT IS THE CLAIM ANOTHER MODULE IS BUILT ON. console-overview.mjs
  // refuses the prototype's `next:` clause because "the flow rail is drawn on
  // this same page DIRECTLY ABOVE these rows, already naming the current step
  // AND the command that advances it" — the second half of that sentence is
  // what this test finds untrue.
  //
  // MINE, NOT PRE-EXISTING: on main the map was keyed by SECTION
  // (`architecture: "node qa/arch-doc.mjs"`) and a step WAS a section, so the
  // command could only appear beside the one section it belonged to — and
  // `flowRailHtml` had no caller, so it never appeared at all. This branch
  // rekeyed one section's command to a four-section phase and wired the call.
  //
  // Fix-agnostic, deliberately: deriving the command from the section that is
  // actually open, or dropping `define` from the map so the rail says nothing
  // beside it, or naming the command that signs, all satisfy this. What it
  // refuses is the rail naming a command that cannot advance the step it marks.
  const feature = {
    name: "meal", rel: "docs/features/meal.md", phase: "accepted", record: { status: "approved" },
    touches: [], blockError: null, specRel: "specs/meal.spec.md", specExists: true, clauses: [],
    covered: 0, total: 0, receipt: { present: true, verdict: "PASS", attestsTree: true }, provenDone: false,
  };
  // Everything settled but ONE unsigned spec: the architecture doc is signed
  // and undrifted, so arch-doc.mjs has nothing to do on this tree, and `define`
  // is open for exactly one reason — a signature nobody has given.
  const statuses = [
    { id: "intent", status: "approved", resolvable: true },
    { id: "architecture", status: "approved", resolvable: true },
    { id: "design-system", status: "approved", resolvable: true },
    { id: "components", status: "approved", resolvable: true },
    { id: "feature-brief:meal", status: "approved", resolvable: true },
    { id: "feature-spec:meal", status: "approved", resolvable: true },
    { id: "exemplar-spec", status: "unreviewed", resolvable: true },
  ];
  const html = galleryHtml({
    appName: "Acme",
    viewport: { width: 411, height: 891 },
    version: 1,
    cards: [{ screen: { id: "Home", name: "Home" }, summary: { nodes: 12, tokenized: 12, tagged: 12 }, a11y: { pass: true, violations: [] } }],
    features: { available: true, board: { features: [feature], undeclared: [] } },
    approvals: { available: true, statuses },
    lastReceipt: { available: true, verdict: "PASS", stale: false, ageMs: 1000, evidenceLevel: { rung: "L2", name: "device", satisfiedBy: [] }, packId: "cmp", steps: [] },
    liveDevice: { reachable: true },
    walkthrough: { available: true, runs: [{ generatedAt: "2026-09-10T00:00:00Z", manifest: { screens: [] } }] },
  });
  // The console KNOWS what is actually open — asserted first, so a failure
  // below is the command and never a fixture that stopped representing the
  // state. The page's own queue names the act: approve, not regenerate.
  assert.match(html, /Approve exemplar-spec/, "the fixture no longer represents a tree whose only open act is a signature");

  const at = html.indexOf('<nav class="flow"');
  assert.ok(at > 0, "the front door renders no flow rail");
  const rail = html.slice(at, html.indexOf("</nav>", at));
  assert.match(rail, /class="flow-step flow-here">define</, "the fixture no longer marks `define` as the step in hand");
  assert.doesNotMatch(
    rail,
    /arch-doc/,
    `a signature is what \`define\` is waiting for, and the rail's one instruction regenerates a doc: ${rail}`,
  );
});

test("the rail names `node qa/arch-doc.mjs` beside an `architecture` section that is waiting for a SIGNATURE", () => {
  // THE COMMAND IS NOW KEYED ON THE SECTION, AND ONE SECTION'S ENTRY STILL
  // CANNOT ADVANCE IT. The map was rekeyed from steps to sections on 2026-09-10
  // ("a step has no unambiguous command; the open SECTION does"), and eight of
  // its nine entries are the command that changes the state the rail reads. The
  // ninth is not:
  //
  //   architecture: "node qa/arch-doc.mjs"        preview-service.mjs
  //   { id: "architecture", glyph: statusGlyph(archRecord) }   ← same module
  //
  // The glyph that decides whether `architecture` is open is the APPROVAL
  // status and nothing else. The command named beside it regenerates
  // docs/ARCHITECTURE.md's `cmp:generated` bodies — and those bodies are
  // explicitly stripped out of the artifact's hash basis, in the approvals
  // library's own words (qa/lib/approvals.mjs, hashArchitectureArtifact:
  // "Regenerating a marker section (`node qa/arch-doc.mjs`) changes only the
  // stripped-away body, so this hash does not move"). So the one command the
  // rail offers provably cannot move the one state the rail is reading: a
  // reader who runs it gets no change, and the rail says the same thing again.
  //
  // It is the same shape the map was rekeyed to kill, one altitude lower. The
  // key `architecture` cannot express WHY that section is open — unsigned,
  // drifted, reopened — and the console has no input describing doc staleness
  // at all, so the map answers a question this page never asks while the page's
  // own queue names the act it does ask: "Approve architecture".
  //
  // MINE, NOT PRE-EXISTING: on main `flowRailHtml` had no caller, so no command
  // reached the page; this branch wired the call and kept this entry.
  //
  // Fix-agnostic, deliberately: naming the command that signs, or dropping
  // `architecture` from the map so the rail says nothing beside it (silence is
  // what that map promises for a section with no unambiguous command), both
  // satisfy this. What it refuses is the rail naming a command that cannot
  // advance the thing it marks.
  const feature = {
    name: "meal", rel: "docs/features/meal.md", phase: "accepted", record: { status: "approved" },
    touches: [], blockError: null, specRel: "specs/meal.spec.md", specExists: true, clauses: [],
    covered: 0, total: 0, receipt: { present: true, verdict: "PASS", attestsTree: true }, provenDone: false,
  };
  // Everything settled but the architecture SIGNATURE. Nothing here is stale —
  // staleness is not an input to this page — so the only thing standing between
  // this tree and a finished `define` is a human's approval.
  const statuses = [
    { id: "intent", status: "approved", resolvable: true },
    { id: "architecture", status: "unreviewed", resolvable: true },
    { id: "design-system", status: "approved", resolvable: true },
    { id: "components", status: "approved", resolvable: true },
    { id: "feature-brief:meal", status: "approved", resolvable: true },
    { id: "feature-spec:meal", status: "approved", resolvable: true },
    { id: "exemplar-spec", status: "approved", resolvable: true },
  ];
  const html = galleryHtml({
    appName: "Acme",
    viewport: { width: 411, height: 891 },
    version: 1,
    cards: [{ screen: { id: "Home", name: "Home" }, summary: { nodes: 12, tokenized: 12, tagged: 12 }, a11y: { pass: true, violations: [] } }],
    features: { available: true, board: { features: [feature], undeclared: [] } },
    approvals: { available: true, statuses },
    lastReceipt: { available: true, verdict: "PASS", stale: false, ageMs: 1000, evidenceLevel: { rung: "L2", name: "device", satisfiedBy: [] }, packId: "cmp", steps: [] },
    liveDevice: { reachable: true },
    walkthrough: { available: true, runs: [{ generatedAt: "2026-09-10T00:00:00Z", manifest: { screens: [] } }] },
  });
  // The console KNOWS the act — asserted first, so a failure below is the
  // command and never a fixture that stopped representing the state.
  assert.match(html, /Approve architecture/, "the fixture no longer represents a tree waiting on the architecture signature");

  const at = html.indexOf('<nav class="flow"');
  assert.ok(at > 0, "the front door renders no flow rail");
  const rail = html.slice(at, html.indexOf("</nav>", at));
  assert.match(rail, /class="flow-step flow-here">define</, "the fixture no longer marks `define` as the step in hand");
  assert.doesNotMatch(
    rail,
    /arch-doc/,
    `\`architecture\` is waiting for a signature, and the rail's one instruction regenerates a doc it does not hash: ${rail}`,
  );
});

test("a step evidenced by an UNGOVERNABLE section is never done — the marker cannot leave `preview`", () => {
  // `flowRail`'s own docblock, one screen up: "`here` is the first present step
  // still wanting attention — the next thing to do... When everything is
  // settled the arc is complete and the marker rests on the last present step."
  //
  // THIS CONSOLE CANNOT REACH THAT STATE. `done` is `evidence.every(settled)`
  // and `settled` is `glyph.cls === "glyph-signed"`, so a step is done only if
  // EVERY section that evidences it can carry a signature. Two of the six are
  // evidenced by sections that can never carry one, and preview-service.mjs
  // says so itself:
  //
  //   preview <- screens      "Screens is UNGOVERNED — no signature exists, so
  //                            it can never be green."  glyph: null | glyph-drift
  //   report  <- walkthrough  `{ id: "walkthrough", label: "Walkthrough",
  //                             glyph: null }` — the literal, unconditionally
  //
  // `settled()` cannot tell NOT YET SIGNED from CANNOT BE SIGNED, which is the
  // same calibration error the `cls.includes("signed")` fix corrected one level
  // down: a predicate answering a question its vocabulary cannot express. So
  // `preview` and `report` render grey on every project forever, and because
  // `here` is the FIRST not-done step it is pinned at `preview` — it can never
  // reach `verify`, `report` or `drive`, and `preview` is one of the two steps
  // FLOW_COMMANDS deliberately gives no command, so the rail also stops naming
  // one. A finished project's rail tells its owner to go and preview.
  //
  // MINE, NOT PRE-EXISTING: FLOW_STEPS and the step-to-section mapping are new
  // on this branch, and `flowRailHtml` had no caller before it. Before, a
  // section was its own step and "Screens, ungoverned" read as exactly that;
  // now an ungovernable section gates a PHASE of the working flow.
  //
  // Not caught by the test above it, because its fixture hands `screens` a
  // `glyph-signed` — a glyph preview-service.mjs cannot produce for it.
  //
  // A SETTLED PROJECT, built only from inputs the console really takes: every
  // governed artifact signed, a fresh PASS receipt, a device attached. The
  // sections are declared rather than defaulted so the failure is attributable
  // to one cause: `features` is left out because an EMPTY feature board also
  // yields a null glyph, which is the same defect wearing different clothes and
  // would blur which step this test is about.
  const governed = ["intent", "architecture", "specs", "design-system", "components", "exemplar-spec"];
  const html = galleryHtml({
    appName: "Acme",
    viewport: { width: 411, height: 891 },
    version: 1,
    // `cards: []` until 2026-09-10, and that omission was the LAST instance of
    // this branch's recurring defect. A fixture calling itself A SETTLED
    // PROJECT while rendering no screens demanded `preview` be done on a tree
    // with an empty gallery — the same self-contradiction the missing
    // walkthrough run carried, and it kept `screens` looking ungovernable when
    // it was only ever unasked. A settled project has rendered its screens.
    cards: [{ screen: { id: "Home", name: "Home" }, summary: { nodes: 12, tokenized: 12, tagged: 12 }, a11y: { pass: true, violations: [] } }],
    sections: ["overview", "intent", "architecture", "specs", "screens", "design-system", "components", "evidence", "walkthrough", "approvals", "live-device"],
    approvals: { available: true, statuses: governed.map((id) => ({ id, status: "approved", resolvable: true })) },
    lastReceipt: { available: true, verdict: "PASS", stale: false, ageMs: 1000, evidenceLevel: { rung: "L2", name: "device", satisfiedBy: [] }, packId: "cmp", steps: [] },
    liveDevice: { reachable: true },
    // ADDED 2026-09-10, and the omission was the point. This fixture called
    // itself A SETTLED PROJECT while carrying no walkthrough run — so it
    // entrenched the very behaviour it was written to refuse: it demanded
    // `report` be done on a tree that had never produced one. The first fix
    // obliged by making `report` abstain, and abstaining is not finished; a
    // brand-new tree then painted `report` DONE while the Walkthrough section
    // beside it read "no runs yet". `walkthrough` is not ungovernable, it was
    // simply never given a glyph. A settled project HAS a walkthrough, so this
    // fixture now has one, and the assertions below are unchanged.
    walkthrough: { available: true, runs: [{ generatedAt: "2026-09-10T00:00:00Z", manifest: { screens: [] } }] },
  });
  const at = html.indexOf('<nav class="flow"');
  assert.ok(at > 0, "the front door renders no flow rail");
  const rail = html.slice(at, html.indexOf("</nav>", at));
  const steps = [...rail.matchAll(/<span class="flow-step([^"]*)">([^<]+)<\/span>/g)].map((m) => ({
    id: m[2],
    done: /flow-done/.test(m[1]),
    here: /flow-here/.test(m[1]),
  }));
  assert.ok(steps.length > 0, `the rail drew no steps: ${rail}`);

  // The fixture is a SETTLED project — checked first, so a failure below is the
  // defect and never a fixture that stopped representing one.
  for (const id of ["define", "approve", "verify", "drive"]) {
    const step = steps.find((s) => s.id === id);
    assert.ok(step && step.done, `the fixture no longer represents a settled project: ${id} is not done — ${rail}`);
  }

  // Fix-agnostic, deliberately: dropping a step whose evidence cannot be
  // signed, or not letting such a section block its step, or giving those
  // sections a real settled state all satisfy this. What it refuses is a rail
  // that can never finish.
  const open = steps.filter((s) => !s.done).map((s) => s.id);
  assert.deepEqual(open, [], `nothing is left to sign, yet the rail paints these steps unfinished forever: ${open.join(", ")}`);
  assert.equal(steps.at(-1).here, true, "with the arc complete the marker rests on the LAST step, not on one it can never leave");
});

test("the rail paints `report` DONE on a project that has never produced a walkthrough", () => {
  // THE ABSTENTION RULE ANSWERS A SECOND QUESTION IT WAS NOT ASKED. It was
  // added on 2026-09-10 to stop a step whose evidence can never be signed from
  // blocking the arc forever, and it does that by declaring such a step DONE:
  //
  //   const votes = (s) => !UNGOVERNED.has(s.id) || Boolean(s.glyph);
  //   done: voting.length === 0 ? true : voting.every(settled)
  //
  // ABSTAINING AND FINISHED ARE NOT THE SAME FACT. "This step cannot block the
  // arc" is a statement about the console's vocabulary; "this step is done" is
  // a claim about the project, and `flow-done` is a distinct visual role
  // (console-shell.mjs: `.flow-done { color: var(--ink-2) }`, brighter than an
  // unreached step's `--muted`) that makes it to the reader as one.
  //
  // `report` is evidenced by exactly one section, `walkthrough`, and
  // preview-service.mjs hands it the literal `{ id: "walkthrough", glyph: null }`
  // — unconditional, reached by no project state. So `voting` is empty for
  // `report` on EVERY project, and the rail paints the report phase complete on
  // the first page load of a tree where `node qa/walkthrough.mjs` has never
  // been run. The console is not missing the fact: the Walkthrough section on
  // this same page reads "no runs yet", derived from `walkthrough.available`,
  // which the rail's own input throws away.
  //
  // MINE, NOT PRE-EXISTING: `glyph: null` on walkthrough is older, but FLOW_STEPS,
  // the `report` step and the abstention rule are all new on this branch, and
  // `flowRailHtml` had no caller before it. The page never made this claim.
  //
  // It is also the shape this branch has now fixed twice, moved one layer up:
  // `settled()` was taught not to call unsigned "signed" (2026-09-09), and then
  // `done` was taught to call never-signed "done" (2026-09-10).
  //
  // Fix-agnostic, deliberately: dropping a step no project can ever settle,
  // deriving `walkthrough`'s glyph from `walkthrough.available`, or a third rail
  // state that is neither `flow-here` nor `flow-done` all satisfy this. What it
  // refuses is the rail asserting a phase complete that never happened. (The
  // first of those three also satisfies the test above it, which asserts the
  // same fixture's rail has nothing open; the second changes that test's
  // fixture, which is the author's call, not a gate being weakened.)
  const html = galleryHtml({ appName: "Acme", viewport: { width: 411, height: 891 }, version: 1, cards: [] });

  // The console KNOWS — asserted first, so a failure below is the rail and
  // never a fixture that stopped representing a project with no report.
  assert.match(html, /no runs yet/, "the fixture no longer represents a project with no walkthrough run");

  const at = html.indexOf('<nav class="flow"');
  assert.ok(at > 0, "the front door renders no flow rail");
  const rail = html.slice(at, html.indexOf("</nav>", at));
  // Not `assert.match(rail, />report</)`: a rail that no longer draws a step no
  // project can settle is one of the fixes this is agnostic to, and must pass.
  // What must hold is that a rail was drawn at all.
  assert.match(rail, /class="flow-step/, "the fixture no longer draws any steps");
  assert.doesNotMatch(
    rail,
    /class="flow-step[^"]*flow-done[^"]*">report</,
    `nothing has ever been reported, and the rail says the report step is done: ${rail}`,
  );
});

test("the rail paints `preview` DONE on a project that has rendered no screens", () => {
  // `screens` IS THE SAME STORY AS `walkthrough`, AND ONLY ONE OF THEM WAS
  // FIXED. `walkthrough` left UNGOVERNED on 2026-09-10 because it was never
  // ungovernable — it had a state (`walkthrough.available`, rendered beside it
  // as "no runs yet") that the rail's input threw away. `screens` has exactly
  // that shape too, and it is still in the set:
  //
  //   glyph: error ? {cls: "glyph-drift"} : null      preview-service.mjs
  //   statusHtml: `render #N · ${baseScreenCount} screens`   ← same module
  //
  // The glyph is null when twelve screens rendered cleanly AND when none did.
  // The console is not missing the fact — the Screens section on this same page
  // says "0 screens" — the rail's input drops it, exactly as it dropped
  // "no runs yet". So `settled()` cannot tell PREVIEWED from NOTHING TO
  // PREVIEW, `votes()` reads the null as "cannot ever be answered", and the
  // step is resolved the one way that is a claim about the project: DONE.
  //
  // MINE, NOT PRE-EXISTING: FLOW_STEPS, the `preview` step, the abstention rule
  // and the UNGOVERNED set are all new on this branch, and `flowRailHtml` had
  // no caller before it. "Screens, ungoverned" was a section's own honest
  // grade; a PHASE of the working flow painted complete is a different claim.
  //
  // Not caught by the two tests above: the settled-project fixture hands
  // `screens` nothing to render either — it still calls itself A SETTLED
  // PROJECT with `cards: []` — and the walkthrough fixture declares no
  // approvals, so `preview` is held open there by design-system and components
  // rather than by anything about screens.
  //
  // Fix-agnostic, deliberately: deriving screens' glyph from the render it
  // already reports (which empties UNGOVERNED and retires the concept), or
  // dropping a step whose evidence no project can settle, or a third rail state
  // that is neither `flow-here` nor `flow-done`, all satisfy this. What it
  // refuses is the rail asserting a phase complete that never happened.
  //
  // 1. THE SHIPPED CONFIG. No `sections` declared — which is what the server
  //    actually passes (inspector/mcp/src/lib/preview-service.mjs names no
  //    `sections` in its galleryHtml call), so `preview` is evidenced by
  //    screens + design-system + components. Sign the two that can be signed
  //    and the step is done, with nothing rendered and nothing to look at.
  const html = galleryHtml({
    appName: "Acme",
    viewport: { width: 411, height: 891 },
    version: 1,
    cards: [], // NOTHING HAS EVER RENDERED
    approvals: {
      available: true,
      statuses: ["design-system", "components"].map((id) => ({ id, status: "approved", resolvable: true })),
    },
  });
  // The console KNOWS — asserted first, so a failure below is the rail and
  // never a fixture that stopped representing a project with nothing rendered.
  assert.match(html, /0 screens/, "the fixture no longer represents a project with no rendered screens");

  const at = html.indexOf('<nav class="flow"');
  assert.ok(at > 0, "the front door renders no flow rail");
  const rail = html.slice(at, html.indexOf("</nav>", at));
  assert.match(rail, /class="flow-step/, "the fixture no longer draws any steps");
  assert.doesNotMatch(
    rail,
    /class="flow-step[^"]*flow-done[^"]*">preview</,
    `nothing has ever been rendered, and the rail says the preview step is done: ${rail}`,
  );

  // 2. THE SAME DEFECT UNCONDITIONAL, one altitude up — the residue of the
  //    abstention rule the walkthrough fix left in place. `done: voting.length
  //    === 0 ? true : ...` still equates ABSTAINING with FINISHED, and a
  //    profile that declares Screens without Design language or Components
  //    leaves `preview` with no voting evidence at all. On a bare tree where
  //    nothing whatever has happened, the rail paints the preview phase
  //    complete — the `report`-is-DONE shape, moved to the other member of the
  //    set. (`sections` is a first-class declared input with its own suite,
  //    test/console-sections-declared.test.mjs, and this branch made the rail
  //    read it.)
  const declared = galleryHtml({
    appName: "Acme",
    viewport: { width: 411, height: 891 },
    version: 1,
    cards: [],
    sections: ["overview", "specs", "screens", "evidence"],
  });
  const dat = declared.indexOf('<nav class="flow"');
  assert.ok(dat > 0, "the front door renders no flow rail");
  const declaredRail = declared.slice(dat, declared.indexOf("</nav>", dat));
  assert.match(declaredRail, /class="flow-step/, "the fixture no longer draws any steps");
  assert.doesNotMatch(
    declaredRail,
    /class="flow-step[^"]*flow-done[^"]*">preview</,
    `nothing at all has happened on this tree, and the rail says preview is done: ${declaredRail}`,
  );
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
