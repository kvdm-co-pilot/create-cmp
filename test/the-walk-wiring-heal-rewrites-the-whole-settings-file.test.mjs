// THE WALK-WIRING ADD HEAL REWROTE THE WHOLE SETTINGS FILE (KD-197).
//
// `doctor --fix` adds the walk's status line and UserPromptSubmit hook to an app's
// `.claude/settings.json`. It used to parse the file and write `JSON.stringify(settings,
// null, 2)` back, so an app with four-space indentation, its own key order, or the
// `\u2014` escapes the template's own commands carry got every one of those rewritten
// as a side effect of gaining a status line. The shipped-hook rewrite beside it edits
// the raw text in place; the add heal now does too.
//
// THE ORACLE IS THE APP'S OWN LINES: every line of the file before the heal is still
// there after it, in order and unchanged — the one exception being a `,` appended where
// a new member follows what used to be the last one. What the heal adds is in the
// file's own indentation, and the file means what it meant plus the walk.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { applySafeFixes, gatherWalkInputs, templateWalkWiring } from "../src/commands/doctor.mjs";
import { diagnoseProject } from "../src/lib/project-doctor.mjs";
import { editJsonInPlace } from "../src/lib/json-in-place.mjs";
import { offTheRunnerChannel } from "./helpers/runner-channel.mjs";

function project(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-walk-in-place-"));
  fs.mkdirSync(path.join(dir, "qa"), { recursive: true });
  fs.writeFileSync(path.join(dir, "qa", "walk-status.mjs"), "// stand-in for the real walk\n");
  fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".claude", "settings.json"), settings);
  return dir;
}

async function heal(dir) {
  const inputs = { toml: null, walk: gatherWalkInputs(dir) };
  const findings = diagnoseProject(inputs);
  const fixed = await offTheRunnerChannel(() => applySafeFixes(dir, findings, inputs));
  return { fixed, after: fs.readFileSync(path.join(dir, ".claude", "settings.json"), "utf8") };
}

/** Every line of `before`, in order, in `after` — verbatim, or with one `,` appended. */
function linesSurvive(before, after) {
  const a = after.split("\n");
  let k = 0;
  const lost = [];
  for (const line of before.split("\n")) {
    while (k < a.length && a[k] !== line && a[k] !== `${line},`) k += 1;
    if (k === a.length) lost.push(line);
    else k += 1;
  }
  return lost;
}

const invokesWalk = (h) => /walk-status\.mjs/.test(String(h?.command ?? ""));

// Four-space indentation, a key order that is not ours, and a `\u2014` escape — the
// three things the old heal rewrote.
const FOUR_SPACE = [
  "{",
  '    "permissions": {',
  '        "allow": ["Bash(npm test)"]',
  "    },",
  '    "hooks": {',
  '        "SessionStart": [',
  "            {",
  '                "matcher": "",',
  '                "hooks": [',
  '                    { "type": "command", "command": "echo the app \\u2014 its own words" }',
  "                ]",
  "            }",
  "        ]",
  "    },",
  '    "model": "opus"',
  "}",
  "",
].join("\n");

test("the add heal keeps every line of the app's settings, and adds the walk in the app's own indentation", async () => {
  const dir = project(FOUR_SPACE);
  try {
    const { fixed, after } = await heal(dir);
    assert.deepEqual(fixed, ["walk-wiring"], "the heal did not run — this test's premise is gone");
    assert.deepEqual(linesSurvive(FOUR_SPACE, after), [], `lines of the app's file did not survive the heal:\n${after}`);
    assert.ok(after.includes("\\u2014"), "the app's \\u2014 escape was un-escaped");
    assert.deepEqual(Object.keys(JSON.parse(after)).slice(0, 3), ["permissions", "hooks", "model"], "the app's key order moved");

    const added = after.split("\n").filter((l) => !FOUR_SPACE.split("\n").includes(l) && !FOUR_SPACE.split("\n").includes(l.replace(/,$/, "")));
    assert.ok(added.length > 0, "nothing was added");
    for (const l of added) {
      const lead = /^[ \t]*/.exec(l)[0];
      assert.ok(!lead.includes("\t") && lead.length % 4 === 0, `an added line is not in the file's four-space indentation: ${JSON.stringify(l)}`);
    }

    const settings = JSON.parse(after);
    assert.ok(invokesWalk(settings.statusLine), "the status line was not added");
    assert.ok(settings.hooks.UserPromptSubmit.some((g) => g.hooks.some(invokesWalk)), "the UserPromptSubmit hook was not added");
    assert.equal(settings.hooks.SessionStart[0].hooks[0].command, "echo the app — its own words");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a one-line settings file stays one line", async () => {
  const before = '{"hooks":{"Stop":[{"matcher":"","hooks":[{"type":"command","command":"node qa/receipt-check.mjs --hook"}]}]}}';
  const dir = project(before);
  try {
    const { fixed, after } = await heal(dir);
    assert.deepEqual(fixed, ["walk-wiring"]);
    assert.ok(!after.includes("\n"), `the heal laid out a file the app keeps on one line:\n${after}`);
    assert.ok(after.startsWith('{"hooks":{"Stop":[{"matcher":"","hooks":[{"type":"command","command":"node qa/receipt-check.mjs --hook"}]}]'), after);
    const settings = JSON.parse(after);
    assert.ok(invokesWalk(settings.statusLine));
    assert.ok(settings.hooks.UserPromptSubmit.some((g) => g.hooks.some(invokesWalk)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("an app's own UserPromptSubmit keeps its bytes, and the walk's group is appended after it", async () => {
  const before = [
    "{",
    '\t"hooks": {',
    '\t\t"UserPromptSubmit": [',
    '\t\t\t{ "matcher": "", "hooks": [{ "type": "command", "command": "echo theirs" }] }',
    "\t\t]",
    "\t},",
    '\t"statusLine": { "type": "command", "command": "echo mine" }',
    "}",
    "",
  ].join("\n");
  const dir = project(before);
  try {
    const { after } = await heal(dir);
    assert.deepEqual(linesSurvive(before, after), [], `lines of the app's file did not survive:\n${after}`);
    const settings = JSON.parse(after);
    assert.equal(settings.statusLine.command, "echo mine", "the app's status line was taken");
    assert.equal(settings.hooks.UserPromptSubmit[0].hooks[0].command, "echo theirs");
    assert.ok(settings.hooks.UserPromptSubmit.slice(1).some((g) => g.hooks.some(invokesWalk)));
    for (const l of after.split("\n").filter((x) => !before.split("\n").includes(x.replace(/,$/, "")))) {
      assert.match(l, /^\t*\S/, `an added line is not tab-indented like the app's: ${JSON.stringify(l)}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the in-place editor writes nothing it cannot account for against JSON.parse", () => {
  const { statusLine } = templateWalkWiring();
  // A duplicate key: which `hooks` counts is JSON.parse's call, so no edit is attempted.
  assert.equal(editJsonInPlace('{"hooks":{},"hooks":{}}', [{ at: ["hooks"], add: "UserPromptSubmit", value: [] }]), null);
  // Not JSON at all.
  assert.equal(editJsonInPlace("{ not json", [{ at: [], add: "statusLine", value: statusLine }]), null);
  // Adding a key that is already there is not an add.
  assert.equal(editJsonInPlace('{"statusLine":null}', [{ at: [], add: "statusLine", value: statusLine }]), null);
  // And the control: a plain add works, and changes nothing but the insertion.
  const out = editJsonInPlace('{\n  "a": 1\n}\n', [{ at: [], add: "b", value: 2 }]);
  assert.equal(out, '{\n  "a": 1,\n  "b": 2\n}\n');
});
