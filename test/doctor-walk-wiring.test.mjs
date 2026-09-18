// End-to-end for the walk-wiring check and its --fix heal, against real trees.
//
// The pure finding is unit-tested in project-doctor.test.mjs. What THIS file
// pins is the part that can only be wrong on disk: reading a project's real
// .claude/settings.json, and healing it from the engine's own template without
// disturbing anything the app put there.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { applySafeFixes, gatherWalkInputs, templateWalkWiring } from "../src/commands/doctor.mjs";
import { describeAnchorViolations, unfixedHookAnchors } from "../src/lib/hooks.mjs";
import { diagnoseProject } from "../src/lib/project-doctor.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** A throwaway project: the walk installed, settings.json as given. */
function project(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-walk-wiring-"));
  fs.mkdirSync(path.join(dir, "qa"), { recursive: true });
  fs.writeFileSync(path.join(dir, "qa", "walk-status.mjs"), "// stand-in for the real walk\n");
  if (settings !== undefined) {
    fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".claude", "settings.json"), settings);
  }
  return dir;
}

const readSettings = (dir) =>
  JSON.parse(fs.readFileSync(path.join(dir, ".claude", "settings.json"), "utf8"));

/** Diagnose + heal, the way `create-cmp doctor --fix` does. */
function heal(dir) {
  const inputs = { toml: null, walk: gatherWalkInputs(dir) };
  const findings = diagnoseProject(inputs);
  const fixed = applySafeFixes(dir, findings, inputs);
  return { findings, fixed };
}

test("the engine template IS the wiring of record — both halves are readable", () => {
  const { statusLine, promptSubmit } = templateWalkWiring();
  assert.ok(statusLine, "template/.claude/settings.json declares no walk statusLine");
  assert.ok(promptSubmit && promptSubmit.length > 0, "template declares no walk UserPromptSubmit hook");
});

test("a project with the real template settings: both surfaces invoke the walk, and the status line is cwd-relative", () => {
  // This expectation was EDITED when doctor stopped scoring a silent status line
  // as wired. It used to assert only the four presence booleans, under the title
  // "reads as wired" — and that is precisely the claim the template does not
  // support: its statusLine is `node qa/walk-status.mjs`, relative, and KD-90
  // records that it cannot be anchored. `cwdRelative` is asserted here, against
  // the real shipped file, so the presence half can never again be read as the
  // whole answer. See test/doctor-calls-a-silent-status-line-wired.test.mjs.
  const dir = project(fs.readFileSync(path.join(ROOT, "template/.claude/settings.json"), "utf8"));
  try {
    assert.deepEqual(gatherWalkInputs(dir), {
      scriptPresent: true,
      settingsPresent: true,
      statusLine: true,
      promptHook: true,
      cwdRelative: ["statusLine"],
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("no walk installed → nothing to say (null, not a false alarm)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-walk-none-"));
  try {
    assert.equal(gatherWalkInputs(dir), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("--fix wires an unwired project, and the walk then reads as wired", () => {
  // The Stop hook here is deliberately the UNANCHORED form the template shipped
  // through 0.26.2 — i.e. a real app stamped before the anchoring fix, which is
  // the population that actually exists. It is a fixture, not an endorsement.
  const dir = project('{"hooks":{"Stop":[{"matcher":"","hooks":[{"type":"command","command":"node qa/receipt-check.mjs --hook"}]}]}}');
  try {
    const { findings, fixed } = heal(dir);
    assert.equal(findings.find((f) => f.id === "walk-wiring").level, "warn");
    assert.deepEqual(fixed, ["walk-wiring"]);

    const after = readSettings(dir);
    assert.match(after.statusLine.command, /walk-status\.mjs/);
    assert.ok(after.hooks.UserPromptSubmit.some((g) => g.hooks.some((h) => /walk-status\.mjs/.test(h.command))));
    // The app's own Stop hook is untouched — the heal adds, never rewrites. That
    // is also the limit of this heal: it does NOT retro-anchor a legacy hook
    // (KD-85), and pinning the string here says so out loud rather than leaving
    // it to be discovered.
    assert.equal(after.hooks.Stop[0].hooks[0].command, "node qa/receipt-check.mjs --hook");

    // And the project now diagnoses as far as this heal can take it — which is
    // NOT clean, and this expectation was edited to say so. The heal copies the
    // engine template, whose statusLine is cwd-relative by necessity (KD-90), so
    // a healed project is wired on both surfaces with one of them resolving only
    // from the project root. Asserting "ok" here is what let doctor ship the
    // claim it could not support; the honest post-heal state is a warn that names
    // the status line.
    const healed = diagnoseProject({ toml: null, walk: gatherWalkInputs(dir) }).find((f) => f.id === "walk-wiring");
    assert.equal(healed.level, "warn");
    assert.match(healed.title, /status line/);
    assert.equal(healed.fix.auto, false, "offered a second automatic heal for something --fix cannot fix");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("--fix creates .claude/settings.json when the project has none", () => {
  const dir = project(undefined);
  try {
    assert.deepEqual(heal(dir).fixed, ["walk-wiring"]);
    assert.match(readSettings(dir).statusLine.command, /walk-status\.mjs/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("what --fix WRITES is anchored — the heal is a second door into a project's settings", () => {
  // templateWalkWiring() copies the engine template verbatim, so the anchoring
  // fix reaches a healed project for free. "For free" is exactly the kind of
  // claim that stops being true silently, and `doctor --fix` writes into real
  // apps without anyone re-reading the template, so it is gated here too.
  const dir = project("{}");
  try {
    heal(dir);
    const found = unfixedHookAnchors(readSettings(dir));
    assert.deepEqual(
      found,
      [],
      `doctor --fix wrote a command that will not resolve from a subdirectory:\n${describeAnchorViolations(found)}`
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("--fix never takes a status line the app already claimed", () => {
  const dir = project('{"statusLine":{"type":"command","command":"echo mine"}}');
  try {
    heal(dir);
    const after = readSettings(dir);
    assert.equal(after.statusLine.command, "echo mine", "the heal stole the app's status line");
    // The half it CAN add, it adds — a claimed slot is not a reason to do nothing.
    assert.ok(after.hooks.UserPromptSubmit.some((g) => g.hooks.some((h) => /walk-status\.mjs/.test(h.command))));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("--fix appends to an existing UserPromptSubmit rather than replacing it", () => {
  const dir = project('{"hooks":{"UserPromptSubmit":[{"matcher":"","hooks":[{"type":"command","command":"echo theirs"}]}]}}');
  try {
    heal(dir);
    const groups = readSettings(dir).hooks.UserPromptSubmit;
    assert.equal(groups.length, 2);
    assert.equal(groups[0].hooks[0].command, "echo theirs");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("--fix refuses to write over settings.json it could not parse", () => {
  const dir = project("{ not json");
  try {
    const { findings, fixed } = heal(dir);
    assert.equal(findings.find((f) => f.id === "walk-wiring").level, "warn");
    assert.deepEqual(fixed, [], "healed a file it could not read");
    assert.equal(fs.readFileSync(path.join(dir, ".claude", "settings.json"), "utf8"), "{ not json");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("healing twice is a no-op — re-running --fix does not stack duplicate hooks", () => {
  const dir = project("{}");
  try {
    heal(dir);
    const once = readSettings(dir);
    const { fixed } = heal(dir);
    assert.deepEqual(fixed, [], "second run reported a fix it did not need to make");
    assert.deepEqual(readSettings(dir), once);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
