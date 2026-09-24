// `create-cmp doctor` prints, inside the walk-wiring warning, that a surface "is
// anchored and still works from any directory". THE ORACLE FOR THAT SENTENCE IS
// NOT A PARSER. It is the shell: run the surface's command from a directory that
// is not the project root, with CLAUDE_PROJECT_DIR exported as a hook gets it, and
// either the walk executes or it does not. This file runs it.
//
// THE CLASS: a claim of health derived from a reading of the command's TEXT that
// the shell does not share. It has now been written three ways inside this one
// finding, and each fix closed the spelling in front of it:
//
//   round 1 — `working` was "absent from anchorViolations", so a hook the detector
//             cannot SEE (KD-86 bare basename, KD-87 single-quoted span) was read
//             as credit. Fixed by requiring the anchor in the command.
//   round 2 — "the command contains the anchor" credited a command whose anchor is
//             on a different path, so one surface was printed inert AND working.
//             Fixed by subtracting whatever the detector calls inert.
//   here    — subtracting the DETECTOR'S list carries the detector's blind spots
//             back in. The engine template's own hook anchors the walk TWICE
//             (`test -f "${…}/qa/walk-status.mjs" && node "${…}/qa/walk-status.mjs"`),
//             so an adopter who keeps that anchored `test -f` prefix and leaves the
//             RUN half in a shape the detector cannot judge has a command that
//             carries the anchor, raises no violation, and does not run the walk.
//             Doctor tells them it works from any directory.
//
// Measured on this tree, each shape silent from a foreign cwd and each claimed:
//
//     test -f "${CLAUDE_PROJECT_DIR:-.}/qa/walk-status.mjs" && sh -c 'node qa/walk-status.mjs --inject' || true
//     test -f "${CLAUDE_PROJECT_DIR:-.}/qa/walk-status.mjs" && node walk-status.mjs --inject || true
//
// That is the defect this whole slice was opened to close — doctor asserting health
// over a surface that prints nothing — surviving in the sentence the fix added.
//
// ONE DIRECTION ONLY, on purpose. This asserts that doctor never claims a surface
// works when the shell says it does not. The opposite direction — a command that
// really resolves (`cd "${CLAUDE_PROJECT_DIR:-.}" && node qa/walk-status.mjs`) being
// reported inert — is the detector's deliberate conservatism and is logged, not
// gated here, so this test cannot be used to argue for weakening a refusal. The
// control below keeps it from being satisfiable by deleting the sentence.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { gatherWalkInputs } from "../src/commands/doctor.mjs";
import { PROJECT_DIR_ANCHOR } from "../src/lib/hooks.mjs";
import { diagnoseProject } from "../src/lib/project-doctor.mjs";

const SCRIPT = "qa/walk-status.mjs";
const MARKER = "WALK-ACTUALLY-RAN";

/**
 * A throwaway project carrying a walk that PRINTS when it runs, wired with the
 * given UserPromptSubmit command and the shipped (relative, unanchorable) status
 * line, so every fixture lands in the branch that names what still works.
 */
function project(hookCommand) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-claimed-working-"));
  fs.mkdirSync(path.join(dir, "qa"), { recursive: true });
  fs.writeFileSync(path.join(dir, "qa", "walk-status.mjs"), `process.stdout.write(${JSON.stringify(MARKER)});\n`);
  fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, ".claude", "settings.json"),
    JSON.stringify({
      hooks: { UserPromptSubmit: [{ matcher: "", hooks: [{ type: "command", command: hookCommand }] }] },
      statusLine: { type: "command", command: `test -f ${SCRIPT} && node ${SCRIPT} --statusline || true` },
    })
  );
  return dir;
}

const walkWiring = (dir) =>
  diagnoseProject({ toml: null, walk: gatherWalkInputs(dir) }).find((f) => f.id === "walk-wiring");

/** Does the finding tell the adopter the UserPromptSubmit hook keeps working? */
const claimsHookWorks = (finding) =>
  /UserPromptSubmit[^.]*\bstill works?\b/.test(String(finding?.detail ?? ""));

/**
 * THE ORACLE: run the hook command the way Claude Code would — through `sh -c`,
 * from a directory that is not the project, with CLAUDE_PROJECT_DIR exported —
 * and report whether the walk executed. `|| true` makes every shape exit 0, so
 * the marker on stdout is the only honest signal, which is precisely why the
 * surface fails silently in the first place.
 */
function runsFromElsewhere(command, projectDir, elsewhere) {
  try {
    const out = execFileSync("/bin/sh", ["-c", command], {
      cwd: elsewhere,
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return String(out).includes(MARKER);
  } catch (err) {
    return String(err?.stdout ?? "").includes(MARKER);
  }
}

/** Anchored in both halves — the form the engine template ships today. */
const SHIPPED = `test -f "${PROJECT_DIR_ANCHOR}/${SCRIPT}" && node "${PROJECT_DIR_ANCHOR}/${SCRIPT}" --inject || true`;

const SHAPES = [
  SHIPPED,
  // Anchored `test -f`, relative `node` — the detector SEES this one (round 2).
  `test -f "${PROJECT_DIR_ANCHOR}/${SCRIPT}" && node ${SCRIPT} --inject || true`,
  // Anchored `test -f`, run half single-quoted: KD-87's blind spot, with the
  // template's own prefix supplying the anchor that `carries` accepts.
  `test -f "${PROJECT_DIR_ANCHOR}/${SCRIPT}" && sh -c 'node ${SCRIPT} --inject' || true`,
  `test -f "${PROJECT_DIR_ANCHOR}/${SCRIPT}" && eval 'node ${SCRIPT} --inject' || true`,
  // Anchored `test -f`, run half a bare basename: KD-86's blind spot, same prefix.
  `test -f "${PROJECT_DIR_ANCHOR}/${SCRIPT}" && node walk-status.mjs --inject || true`,
];

test("doctor never says a surface still works when running it from elsewhere does not run the walk", () => {
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-foreign-cwd-"));
  const wrong = [];
  try {
    for (const command of SHAPES) {
      const dir = project(command);
      try {
        const finding = walkWiring(dir);
        if (claimsHookWorks(finding) && !runsFromElsewhere(command, dir, elsewhere)) {
          wrong.push(
            `  claimed working, produced NOTHING from another directory:\n    ${command}\n    detail: ${finding.detail}`
          );
        }
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  } finally {
    fs.rmSync(elsewhere, { recursive: true, force: true });
  }
  assert.deepEqual(
    wrong,
    [],
    "doctor told an adopter a surface works from any directory; the shell, run from another " +
      "directory, printed nothing:\n" +
      wrong.join("\n") +
      "\n  `carries` reads the anchor anywhere in the command, and the inert list subtracted from " +
      "it is the DETECTOR'S, whose blind spots (KD-86, KD-87) are exactly these shapes. Credit the " +
      "surface only for a walk invocation whose own executed path is anchored — the claim must be " +
      "about the command that RUNS the walk, not about the command string containing the anchor."
  );
});

test("the claim is still made for the wiring the engine template ships", () => {
  // The control: without it, deleting the "still works" sentence would turn the
  // test above green while taking a true and useful fact away from the adopter.
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-foreign-cwd-"));
  const dir = project(SHIPPED);
  try {
    assert.equal(
      runsFromElsewhere(SHIPPED, dir, elsewhere),
      true,
      "the shipped hook did not run from another directory"
    );
    assert.equal(
      claimsHookWorks(walkWiring(dir)),
      true,
      "the shipped, anchored hook really does work from any directory and doctor stopped saying so"
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(elsewhere, { recursive: true, force: true });
  }
});
