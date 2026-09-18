// `create-cmp doctor` told an adopter, at level `ok`, that "The walk is wired" —
// about a status line that produces nothing for any session whose directory is
// not the project root. The diagnostic whose whole purpose is to say whether the
// app is healthy was the one surface making the false claim, and the comment
// directly above the check had already named the stakes: *"the failure mode is
// silence … Nothing else in the system can notice, so doctor does."* It did not
// notice this one, because its presence test was a substring:
//
//     invokesWalk(entry) => String(entry?.command ?? "").includes("walk-status.mjs")
//
// and `test -f qa/walk-status.mjs && node qa/walk-status.mjs --statusline || true`
// contains that string while resolving against the SESSION's directory. `|| true`
// then turns the miss into a clean exit with no output.
//
// TWO POPULATIONS, and the second is why this is not a cleanup:
//
//   (a) apps stamped through 0.26.2, whose hooks are cwd-relative too (KD-85);
//   (b) EVERY NEW STAMP, because `template/.claude/settings.json` still ships the
//       relative statusLine on purpose — KD-90 established the anchor cannot
//       reach that surface, and the remedy taken then was to stop CLAIMING the
//       fix. Doctor kept claiming it. (b) stands however many of (a) exist.
//
// WHY THERE IS NO `ok` FIXTURE HERE, which is the honest version of a negative
// control rather than a missing one. `ANCHORABLE_SURFACES.statusLine === false`
// says no form written on that surface is established to resolve — so while that
// declaration stands, any project whose status line invokes the walk warns, and
// an end-to-end `ok` is unreachable BY CONSTRUCTION, not by this file's choice.
// What would be vacuous is a check that cannot answer anything else, so the two
// places it can are pinned instead: the deriver credits an anchored hook and
// returns `[]` (so it is not "always non-empty"), and the pure finding still
// reads `ok` when handed `cwdRelative: []`. The day the status line is genuinely
// fixed, that declaration flips, these fixtures answer differently, and this file
// is where the change announces itself.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { gatherWalkInputs } from "../src/commands/doctor.mjs";
import { PROJECT_DIR_ANCHOR } from "../src/lib/hooks.mjs";
import { diagnoseProject } from "../src/lib/project-doctor.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = "qa/walk-status.mjs";

/** A throwaway project carrying the walk, with the given settings.json text. */
function project(settingsText) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-silent-statusline-"));
  fs.mkdirSync(path.join(dir, "qa"), { recursive: true });
  fs.writeFileSync(path.join(dir, "qa", "walk-status.mjs"), "// stand-in for the real walk\n");
  fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".claude", "settings.json"), settingsText);
  return dir;
}

const walkWiring = (dir) =>
  diagnoseProject({ toml: null, walk: gatherWalkInputs(dir) }).find((f) => f.id === "walk-wiring");

const relative = (mode) => `test -f ${SCRIPT} && node ${SCRIPT} ${mode} || true`;
const anchoredHookGroup = {
  matcher: "",
  hooks: [{ type: "command", command: `node "${PROJECT_DIR_ANCHOR}/${SCRIPT}" --inject || true` }],
};

const withStatusLine = (command) =>
  JSON.stringify({
    hooks: { UserPromptSubmit: [anchoredHookGroup] },
    statusLine: { type: "command", command },
  });

test("the SHIPPED template does not read ok — the population is every new stamp", () => {
  // Read from template/.claude/settings.json rather than restated, so this test
  // is about what an adopter actually receives on the day it runs.
  const dir = project(fs.readFileSync(path.join(ROOT, "template/.claude/settings.json"), "utf8"));
  try {
    const f = walkWiring(dir);
    assert.notEqual(
      f.level,
      "ok",
      "doctor scored the shipped wiring as healthy; its status line resolves only from the project root"
    );
    assert.equal(f.level, "warn");
    assert.match(f.title, /status line/);
    assert.match(f.detail, /relative to the SESSION's directory/);
    assert.match(f.detail, /\|\| true/, "the detail must say WHY the failure is silent, not only that it fails");
    assert.equal(f.fix.auto, false, "offered an automatic heal for a surface that has no correct rewrite");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("what STILL WORKS is named, derived from the settings rather than assumed", () => {
  // A warning that reads "your walk is broken" while the hook half runs would be
  // its own false statement, in the surface this fix exists to make honest.
  const shipped = project(fs.readFileSync(path.join(ROOT, "template/.claude/settings.json"), "utf8"));
  const legacy = project(
    JSON.stringify({
      hooks: { UserPromptSubmit: [{ matcher: "", hooks: [{ type: "command", command: relative("--inject") }] }] },
      statusLine: { type: "command", command: relative("--statusline") },
    })
  );
  try {
    assert.match(
      walkWiring(shipped).detail,
      /UserPromptSubmit hook is anchored and still works/,
      "the anchored half works and the adopter is not told so"
    );
    const both = walkWiring(legacy);
    assert.match(both.title, /UserPromptSubmit hook and the status line/, "a 0.26.2 stamp has TWO inert surfaces");
    assert.doesNotMatch(
      both.detail,
      /anchored and still works/,
      "claimed a working surface in a project that has none — the same false comfort, reversed"
    );
    assert.match(both.fix.description, /Anchor the UserPromptSubmit hook/, "a hook CAN be anchored; say so");
  } finally {
    for (const d of [shipped, legacy]) fs.rmSync(d, { recursive: true, force: true });
  }
});

test("no spelling of the anchor on the status line buys an ok", () => {
  // test/inert-anchor-scored-as-protection.test.mjs forbids this one level down,
  // in `anchorViolations`. Doctor is where an adopter would READ the wrong
  // answer, so the invariant is asserted here too rather than assumed to travel.
  const dir = project(withStatusLine(`test -f "${PROJECT_DIR_ANCHOR}/${SCRIPT}" && node "${PROJECT_DIR_ANCHOR}/${SCRIPT}" --statusline || true`));
  try {
    assert.equal(
      walkWiring(dir).level,
      "warn",
      `writing ${PROJECT_DIR_ANCHOR} on the status line cleared doctor's finding. The command is exactly ` +
        "as broken — the variable is not set for that surface — so the only thing that changed is that " +
        "the diagnostic stopped saying so."
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a status line naming no directory does not read ok either", () => {
  // `node walk-status.mjs --statusline` is exactly as cwd-bound, and the path
  // detector cannot see it: SCRIPT_PATH requires a directory segment (KD-86).
  // It read `ok` until the surface's own declaration was consulted directly.
  const dir = project(withStatusLine("node walk-status.mjs --statusline || true"));
  try {
    assert.equal(walkWiring(dir).level, "warn");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the deriver CREDITS an anchored hook — it is not a function that always accuses", () => {
  // The control that keeps the check from being unfalsifiable: given a project
  // whose only walk invocation is anchored, it must report nothing cwd-relative.
  const dir = project(
    JSON.stringify({
      hooks: { UserPromptSubmit: [anchoredHookGroup] },
      statusLine: { type: "command", command: "echo the app's own status line" },
    })
  );
  try {
    assert.deepEqual(gatherWalkInputs(dir).cwdRelative, [], "an anchored hook was reported as cwd-relative");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the finding's ok branch is driven by the input, not removed", () => {
  const walk = { scriptPresent: true, settingsPresent: true, statusLine: true, promptHook: true, cwdRelative: [] };
  const f = diagnoseProject({ toml: null, walk }).find((x) => x.id === "walk-wiring");
  assert.equal(f.level, "ok", "nothing cwd-relative and both surfaces present is the one state that IS wired");
});

test("absence is still reported ahead of inertness, so --fix keeps a path to run", () => {
  // The heal can add missing wiring; it cannot rewrite a command the app owns.
  // An unwired project must therefore still get the auto-fixable finding.
  const dir = project('{"hooks":{"Stop":[{"matcher":"","hooks":[{"type":"command","command":"node qa/receipt-check.mjs --hook"}]}]}}');
  try {
    const f = walkWiring(dir);
    assert.equal(f.level, "warn");
    assert.equal(f.fix.auto, true, "an unwired project lost its automatic heal");
    assert.match(f.detail, /no statusLine/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
