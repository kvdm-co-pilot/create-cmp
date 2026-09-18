// A surface where `${CLAUDE_PROJECT_DIR:-.}` CANNOT WORK must not be able to earn
// the verdict "anchored" from the detector — otherwise the one mistake this slice
// was corrected for is the mistake its own instruments bless.
//
// The correction that produced ANCHORABLE_SURFACES says it in one line (KD-90,
// src/lib/hooks.mjs): *an inert anchor is worse than none, because it READS as
// protection.* The detector does not know that. `unanchoredPaths()` decides
// "anchored" from the TEXT of a command and nothing else, so on `statusLine` —
// the surface ANCHORABLE_SURFACES declares the mechanism does not reach — writing
// the anchor makes the violation DISAPPEAR from `anchorViolations()`, the function
// whose own docstring calls itself "the honest total".
//
// That is not a hypothesis about a future author. It is the edit this slice
// already made once, on this exact surface, and reverted. Measured on this tree:
//
//   anchorViolations({statusLine:{command:'node "${CLAUDE_PROJECT_DIR:-.}/qa/walk-status.mjs"'}})
//     => []            // the gap is gone from the total
//
// and the three instruments that pin KD-90 then report, in order: the static pin
// red with "the statusLine stopped being the known gap — if it was fixed, fix this
// test and KD-90 with it"; the behavioural pin red with "the statusLine started
// surviving a subdirectory — if it was fixed, delete this test and close KD-90";
// and the differential GREEN, because its `reached()` exports CLAUDE_PROJECT_DIR
// to every surface including the one that never receives it. Three messages
// naming the wrong remedy, on the surface that already produced that remedy once.
//
// THE INVARIANT, which is why this is not a test about the statusLine:
//
//     ANCHORABLE_SURFACES[kind] === false
//       ⟹  no spelling of the anchor removes that surface's violation
//
// It holds for whatever the next non-anchorable surface turns out to be —
// `apiKeyHelper`, `awsCredentialExport` (KD-88), or a surface that does not exist
// yet — because the fixture table below is required to cover every key the
// declaration names.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ANCHORABLE_SURFACES, PROJECT_DIR_ANCHOR, anchorViolations } from "../src/lib/hooks.mjs";

const SCRIPT = "qa/walk-status.mjs";
const relative = `test -f ${SCRIPT} && node ${SCRIPT} --statusline || true`;
const anchored =
  `test -f "${PROJECT_DIR_ANCHOR}/${SCRIPT}" && ` +
  `node "${PROJECT_DIR_ANCHOR}/${SCRIPT}" --statusline || true`;

/** A minimal settings object placing `command` on each declared surface kind. */
const FIXTURE = {
  hooks: (command) => ({ hooks: { Stop: [{ matcher: "", hooks: [{ type: "command", command }] }] } }),
  statusLine: (command) => ({ statusLine: { type: "command", command } }),
};

test("every surface ANCHORABLE_SURFACES names has a fixture here — a new key must not slip past this file", () => {
  assert.deepEqual(
    Object.keys(ANCHORABLE_SURFACES).filter((k) => !(k in FIXTURE)),
    [],
    "ANCHORABLE_SURFACES grew a surface this invariant cannot construct — add it to FIXTURE"
  );
});

test("a surface the anchor CANNOT reach is scored anchored the moment the anchor is written on it", () => {
  const inert = Object.entries(ANCHORABLE_SURFACES).filter(([, works]) => works === false);
  assert.ok(inert.length > 0, "nothing declares itself non-anchorable — this invariant has no subject");

  for (const [kind] of inert) {
    // Control: without the anchor, the surface IS reported. Without this the
    // assertion below could pass simply because the detector reads nothing here.
    assert.deepEqual(
      anchorViolations(FIXTURE[kind](relative)).map((v) => v.paths),
      [[SCRIPT]],
      `${kind}: the detector does not see this surface at all, so the test below proves nothing`
    );

    // The defect: the anchor is text the detector trusts, on a surface where
    // ANCHORABLE_SURFACES says the variable is never set. The violation is
    // unchanged in the world and gone from the report.
    assert.deepEqual(
      anchorViolations(FIXTURE[kind](anchored)).map((v) => v.paths),
      [[SCRIPT]],
      `${kind} is declared NON-ANCHORABLE, yet writing ${PROJECT_DIR_ANCHOR} on it cleared the ` +
        `violation. The command is exactly as broken as before — the anchor expands to nothing ` +
        `there — so the only thing that changed is that "the honest total" stopped reporting it, ` +
        `and every gate and message downstream now reads the non-fix as the fix.`
    );
  }
});

test("executed: with no CLAUDE_PROJECT_DIR the anchor reaches nothing the relative form did not already reach", () => {
  // The claim "the anchor is inert on a statusLine" rests, in this slice, entirely
  // on reading two documentation pages. What CAN be executed is the half that
  // makes it matter: absent the variable, the anchored command resolves exactly
  // where the relative one did — so an instrument that EXPORTS the variable to
  // this surface is testing a world the surface does not live in.
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cmp-inert-anchor-")));
  const sub = path.join(dir, "services", "app");
  try {
    fs.mkdirSync(path.dirname(path.join(dir, SCRIPT)), { recursive: true });
    fs.writeFileSync(path.join(dir, SCRIPT), 'process.stdout.write("RESOLVED\\n");\n');
    fs.mkdirSync(sub, { recursive: true });

    const run = (command, { cwd, projectDir }) => {
      const env = { ...process.env };
      if (projectDir === undefined) delete env.CLAUDE_PROJECT_DIR;
      else env.CLAUDE_PROJECT_DIR = projectDir;
      const res = spawnSync("sh", ["-c", command], { cwd, env, input: "", encoding: "utf8", timeout: 20_000 });
      return String(res.stdout ?? "");
    };

    assert.match(run(relative, { cwd: dir, projectDir: undefined }), /RESOLVED/, "control: works at the root");
    assert.equal(run(relative, { cwd: sub, projectDir: undefined }), "", "control: relative loses it one down");

    // The anchored form, in the environment a non-anchorable surface actually
    // gets. Identical outcome — which is what "inert" means, executed.
    assert.match(run(anchored, { cwd: dir, projectDir: undefined }), /RESOLVED/);
    assert.equal(
      run(anchored, { cwd: sub, projectDir: undefined }),
      "",
      "with CLAUDE_PROJECT_DIR unset the anchor rescued the command — then it is not inert and KD-90's reasoning needs re-reading"
    );

    // And the reason a harness that sets the variable cannot see any of this:
    // with it set, the SAME command works, so the wrong fix looks like a fix.
    assert.match(
      run(anchored, { cwd: sub, projectDir: dir }),
      /RESOLVED/,
      "the anchor did not work even with the variable set — the mechanism itself is broken"
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
