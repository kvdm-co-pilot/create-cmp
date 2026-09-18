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
// So the invariant is not about any one spelling. It is: a surface doctor names as
// working from any directory must CARRY the anchor. The oracle below is the command
// text itself — `${CLAUDE_PROJECT_DIR:-.}` is there or it is not — never the
// detector's opinion of it, because the detector's opinion is the thing whose gaps
// are logged. A remedy that derives `working` from the anchor's presence closes
// every member of this family at once, including the ones nobody has written yet.
//
// NOT KD-180, which this branch logs. That entry records the hook-side blind spot
// as "unchanged" and concludes nobody is wrongly served. Coverage is unchanged;
// consequence is not. Reading clean used to withhold a warning — now it is read as
// credit and PRINTED as reassurance, and KD-87's `sh -c '…'` class is not in that
// entry at all. A fix's own new behaviour is in scope for the round that reviews it.
//
// FAILS ON THIS TREE for three of six shapes: the bare basename, `sh -c '…'` and
// `eval '…'` hooks are each reported as "anchored and still works from any
// directory" while each resolves against the SESSION's directory exactly as the
// status line beside them does.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

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
 * The truth the claim must match, read from the command and nothing else: a hook
 * command resolves from any cwd exactly when the path it runs is anchored.
 */
const carriesAnchor = (command) => command.includes(PROJECT_DIR_ANCHOR);

const SHAPES = [
  // Anchored — the form the engine template ships. The claim is TRUE here, and
  // asserting that keeps this test from being satisfiable by deleting the sentence.
  `node "${PROJECT_DIR_ANCHOR}/${SCRIPT}" --inject || true`,
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

test("doctor claims a surface 'still works' only when that surface carries the anchor", () => {
  const wrong = [];
  for (const command of SHAPES) {
    const dir = project(command);
    try {
      const finding = walkWiring(dir);
      const claimed = claimsHookWorks(finding);
      const anchored = carriesAnchor(command);
      if (claimed !== anchored) {
        wrong.push(
          `  ${anchored ? "anchored, claim WITHHELD" : "NOT anchored, claim MADE"}: ${command}\n` +
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
    'doctor\'s "what still works" sentence disagrees with the command it describes, for:\n' +
      wrong.join("\n") +
      "\n  The claim is derived from a surface's ABSENCE among anchorViolations, and that " +
      "detector cannot see a bare basename (KD-86) or a single-quoted span (KD-87). Derive it " +
      "from the anchor's presence in the command instead — the same refusal-to-credit-a-negative " +
      "that cwdRelativeWalkSurfaces already applies to the status line."
  );
});
