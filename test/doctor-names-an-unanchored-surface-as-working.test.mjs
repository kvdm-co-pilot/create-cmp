// The walk-wiring warning tells the adopter WHAT STILL WORKS — "The UserPromptSubmit
// hook is anchored and still works from any directory" — and it derives that claim
// from a NEGATIVE: the surface is absent from `anchorViolations`. That detector has
// two documented blind spots (KD-86: a path with no directory segment is not a path
// it can judge; KD-87: a single-quoted span is treated as narration, so `sh -c '…'`
// and `eval '…'` read clean), and on a surface it cannot see, "no violation" means
// "nothing was examined", not "it is anchored".
//
// THE CLASS, which is the same one this slice was opened to close, one field over:
// a claim of health asserted from the absence of evidence rather than the presence
// of it. `cwdRelativeWalkSurfaces` refuses that inference on the statusLine ON
// PURPOSE — its own comment says so: "On a surface the anchor cannot reach,
// PRESENCE is the whole answer … there is nothing for the detector to credit", and
// it names `node walk-status.mjs --statusline` (no directory segment) as the shape
// that "read `ok` here until this line". The hook surface takes the inference the
// statusLine surface refuses, and the result is worse than the `ok` this slice
// removed: an `ok` withheld a warning; this PRINTS a false sentence about a surface
// that produces nothing.
//
// So the invariant is not about any one spelling. It was first written here as "a
// surface doctor names as working must CARRY the anchor" — one level less naive than
// the detector's silence, and still a reading of the command's text: the anchor can
// sit on another path, inside narration, or on the `test -f` half of a command whose
// `node` half is relative (the round-2 fixtures at the foot of this file), and the
// shell shares none of those opinions. THE ORACLE MOVED AGAIN, to the one thing
// doctor can hold without running anything: the command is byte-for-byte a form
// create-cmp ships, and that form has been EXECUTED from a foreign directory in
// test/shipped-hooks-table.test.mjs. Withholding the claim is not silence — the
// second test here pins what doctor says in its place, and that it hands over the
// shipped command to compare against.
//
// NOT KD-180, which this branch logs. That entry records the hook-side blind spot
// as "unchanged" and concludes nobody is wrongly served. Coverage is unchanged;
// consequence is not. Reading clean used to withhold a warning — now it is read as
// credit and PRINTED as reassurance, and KD-87's `sh -c '…'` class is not in that
// entry at all. A fix's own new behaviour is in scope for the round that reviews it.
//
// IT FAILED ON THE TREE IT WAS WRITTEN AGAINST for three of six shapes: the bare
// basename, `sh -c '…'` and `eval '…'` hooks were each reported as "anchored and
// still works from any directory" while each resolves against the SESSION's
// directory exactly as the status line beside them does.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { gatherWalkInputs } from "../src/commands/doctor.mjs";
import { PROJECT_DIR_ANCHOR } from "../src/lib/hooks.mjs";
import { diagnoseProject } from "../src/lib/project-doctor.mjs";

const SCRIPT = "qa/walk-status.mjs";

/** A throwaway project carrying the walk, with the given UserPromptSubmit command. */
function project(hookCommand) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-unanchored-working-"));
  fs.mkdirSync(path.join(dir, "qa"), { recursive: true });
  fs.writeFileSync(path.join(dir, "qa", "walk-status.mjs"), "// stand-in for the real walk\n");
  fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, ".claude", "settings.json"),
    JSON.stringify({
      hooks: { UserPromptSubmit: [{ matcher: "", hooks: [{ type: "command", command: hookCommand }] }] },
      // The shipped status line, verbatim in shape: relative, and unanchorable
      // (KD-90). It is here so every fixture lands in the branch under test —
      // both surfaces present, at least one inert — rather than in the absence
      // branch, which says nothing about what works.
      statusLine: { type: "command", command: `test -f ${SCRIPT} && node ${SCRIPT} --statusline || true` },
    })
  );
  return dir;
}

const walkWiring = (dir) =>
  diagnoseProject({ toml: null, walk: gatherWalkInputs(dir) }).find((f) => f.id === "walk-wiring");

/**
 * Does the finding tell the adopter the UserPromptSubmit hook keeps working from
 * any directory? Matched loosely — any sentence naming the surface and claiming it
 * still works — so that rewording the claim does not silently un-assert it.
 */
const claimsHookWorks = (finding) =>
  /UserPromptSubmit[^.]*\bstill works?\b/.test(String(finding?.detail ?? ""));

/**
 * THIS ORACLE MOVED, and in the conservative direction. It read
 * `command.includes(PROJECT_DIR_ANCHOR)` — "a hook resolves from any cwd exactly
 * when the path it runs is anchored" — and asserted the claim BOTH ways. The
 * claiming direction is unchanged and is the one this file exists for. The other
 * direction asserted something doctor cannot know: it demanded the sentence for any
 * command whose text carries the anchor, and reading a command's text is precisely
 * what was wrong three fixes running (the anchor can sit on another path, inside
 * narration, or on the `test -f` half of a command whose `node` half is relative —
 * the fixtures below). What doctor may now say is narrower and checkable: this
 * command is byte-for-byte one create-cmp ships, and that command has been RUN from
 * a foreign directory (test/shipped-hooks-table.test.mjs). So the oracle is the
 * template itself, read at test time.
 *
 * A hand-written anchored hook that really does work is therefore no longer called
 * working — it is reported as one doctor cannot confirm, which the last test in this
 * file pins. That is the same conservatism KD-183 records on the other side.
 */
const TEMPLATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "template/.claude/settings.json");
const SHIPPED_PROMPT_HOOK = JSON.parse(fs.readFileSync(TEMPLATE, "utf8")).hooks.UserPromptSubmit[0].hooks[0].command;
const isShippedForm = (command) => command === SHIPPED_PROMPT_HOOK;

const SHAPES = [
  // Anchored, and hand-written: it resolves from any directory, and create-cmp has
  // never shipped it, so doctor recognises nothing and says so. The claim is
  // WITHHELD here — see the oracle's note, and the last test in this file.
  `node "${PROJECT_DIR_ANCHOR}/${SCRIPT}" --inject || true`,
  // The form the engine template ships. The claim is TRUE here, and asserting that
  // keeps this test from being satisfiable by deleting the sentence.
  `test -f "${PROJECT_DIR_ANCHOR}/${SCRIPT}" && node "${PROJECT_DIR_ANCHOR}/${SCRIPT}" --inject || true`,
  // Unanchored, and the detector SEES this one — a plain relative path.
  `test -f ${SCRIPT} && node ${SCRIPT} --inject || true`,
  // Unanchored, and the detector cannot see it: no directory segment (KD-86).
  "node walk-status.mjs --inject || true",
  // Unanchored, and the detector cannot see it: executed from inside single
  // quotes (KD-87). `sh -c` and `eval` both inherit the session's cwd.
  `sh -c 'node ${SCRIPT} --inject' || true`,
  `eval 'node ${SCRIPT} --inject' || true`,
];

test("doctor claims a surface 'still works' only for the command create-cmp ships", () => {
  assert.ok(
    SHAPES.includes(SHIPPED_PROMPT_HOOK),
    "the template's UserPromptSubmit command is not among these shapes any more — the control is gone, and " +
      "the test could be satisfied by never making the claim at all"
  );
  const wrong = [];
  for (const command of SHAPES) {
    const dir = project(command);
    try {
      const finding = walkWiring(dir);
      const claimed = claimsHookWorks(finding);
      const shipped = isShippedForm(command);
      if (claimed !== shipped) {
        wrong.push(
          `  ${shipped ? "the shipped form, claim WITHHELD" : "NOT a shipped form, claim MADE"}: ${command}\n` +
            `      detail: ${finding.detail}`
        );
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  assert.deepEqual(
    wrong,
    [],
    'doctor\'s "what still works" sentence is made about a command it has neither run nor recognised, or ' +
      `withheld from the one it ships:\n${wrong.join("\n")}` +
      "\n  The claim may rest on one thing only: the command is byte-for-byte a form in " +
      "src/lib/shipped-hooks.mjs marked current and anchored, whose execution from a foreign directory is " +
      "pinned in test/shipped-hooks-table.test.mjs. Every reading of the command's text this repository " +
      "tried instead was wrong in a new spelling (KD-86, KD-87)."
  );
});

test("a hook doctor cannot recognise is reported as unconfirmed, with the shipped form to paste", () => {
  // The other half of moving the oracle: withholding the claim must not become
  // silence. An adopter whose hand-written hook works deserves to be told that
  // doctor did not run it, and given the command create-cmp ships so they can
  // compare. This is the sentence that replaced a claim doctor could not support.
  const dir = project(`node "${PROJECT_DIR_ANCHOR}/${SCRIPT}" --inject || true`);
  try {
    const finding = walkWiring(dir);
    assert.match(finding.title, /cannot confirm/, "the finding does not say the surface is unconfirmed");
    assert.match(
      finding.detail,
      /UserPromptSubmit hook invokes the walk with a command create-cmp does not ship/,
      "the detail does not say WHY doctor withheld an answer"
    );
    assert.ok(
      // As a JSON value, because that is what an adopter pastes into settings.json.
      finding.fix.description.includes(JSON.stringify(SHIPPED_PROMPT_HOOK)),
      `the adopter is not given the form create-cmp ships:\n${finding.fix.description}`
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ROUND 2. The claim is positive evidence now — and the evidence is read from the
// COMMAND, not from the walk path inside it: `carries` is
// `command.includes(PROJECT_DIR_ANCHOR)`. An anchor anywhere in the string counts,
// including one on a different path, one inside single-quoted narration, or the
// `test -f` half of a command whose `node` half is still relative.
//
// That makes the surface's two answers CONTRADICT rather than merely overclaim:
// the detector puts UserPromptSubmit in `cwdRelative` (it can see the bare
// `qa/walk-status.mjs`) and `anchoredWalkSurfaces` puts it in `anchored`, so one
// paragraph tells the adopter the hook "only runs when the session starts at the
// project root" AND that it "is anchored and still works from any directory".
//
// The invariant needs no oracle, which is why it is written this way: the two
// lists are two answers to one question about one surface, so a surface in both is
// the program disagreeing with itself, whichever list is right. Asserting the
// disjointness rather than the truth of either keeps this test from having to
// re-decide what "anchored" means every time the detector learns a new shape.
//
// The producer is not exotic. The engine template's hook command carries the
// anchor TWICE (`test -f "${…}/qa/walk-status.mjs" && node "${…}/qa/walk-status.mjs"`),
// so a hand-upgrade from the pre-0.26.3 form that anchors the first occurrence and
// stops is exactly the first fixture below.
const HALF_ANCHORED = [
  `test -f "${PROJECT_DIR_ANCHOR}/${SCRIPT}" && node ${SCRIPT} --inject || true`,
  `test -f "${PROJECT_DIR_ANCHOR}/qa/other.mjs" && node ${SCRIPT} --inject || true`,
  `printf '%s' '${PROJECT_DIR_ANCHOR}' ; node ${SCRIPT} --inject || true`,
];

test("no surface is reported inert and working at once", () => {
  const both = [];
  for (const command of HALF_ANCHORED) {
    const dir = project(command);
    try {
      const { cwdRelative, anchored } = gatherWalkInputs(dir);
      const overlap = anchored.filter((s) => cwdRelative.includes(s));
      if (overlap.length > 0) {
        both.push(
          `  ${overlap.join(", ")} is in BOTH lists: ${command}\n` +
            `      detail: ${walkWiring(dir).detail}`
        );
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  assert.deepEqual(
    both,
    [],
    "the same surface is reported as cwd-relative and as anchored-and-still-working, in one finding:\n" +
      both.join("\n") +
      "\n  `carries` tests the whole command for the anchor, where the detector tests the PATH. " +
      "Credit the surface only for a walk invocation whose own path is anchored — or subtract the " +
      "inert list from the working one, so the two answers cannot contradict."
  );
});
