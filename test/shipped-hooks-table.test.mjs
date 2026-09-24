// The table in src/lib/shipped-hooks.mjs is the only thing `create-cmp doctor` is
// allowed to read a "this surface works from any directory" claim out of, and the only
// thing `doctor --fix` is allowed to rewrite a command in an app's file for. A table
// that drifts from what the template actually ships would therefore do one of two
// things: withhold the claim from the wiring every new stamp gets, or offer to rewrite
// a command into a form nobody ships.
//
// So nothing here restates the table. Every fact is read back from the two sources the
// table is derived from — template/.claude/settings.json as it stands today, and the
// git history of that same file — and the one property the claim rests on is EXECUTED:
// a form marked `anchored` is run from a directory that is not the project, the way
// Claude Code runs a hook, and the script either runs or the claim is false.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { describeAnchorViolations, unfixedHookAnchors } from "../src/lib/hooks.mjs";
import {
  SHIPPED_COMMANDS,
  currentForms,
  healedForm,
  shippedForm,
  successorOf,
  withoutAnchor,
} from "../src/lib/shipped-hooks.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = path.join(ROOT, "template", ".claude", "settings.json");
const MARKER = "SHIPPED-FORM-RAN";

const git = (...args) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8" });

/** (surface, command) for every command a parsed settings object carries. */
function commandsOf(settings) {
  const out = [];
  for (const [event, groups] of Object.entries(settings?.hooks ?? {})) {
    for (const group of groups ?? []) {
      for (const hook of group?.hooks ?? []) out.push({ surface: event, command: hook.command });
    }
  }
  if (settings?.statusLine?.command) out.push({ surface: "statusLine", command: settings.statusLine.command });
  return out;
}

const templateToday = () => JSON.parse(fs.readFileSync(TEMPLATE, "utf8"));

test("every command the template ships TODAY is in the table, as `current` for its surface", () => {
  const missing = [];
  for (const { surface, command } of commandsOf(templateToday())) {
    const form = shippedForm(surface, command);
    if (form === null) missing.push(`  ${surface}: absent from the table — ${JSON.stringify(command).slice(0, 90)}…`);
    else if (form.status !== "current") missing.push(`  ${surface}: in the table as ${form.status} — ${form.id}`);
  }
  assert.deepEqual(
    missing,
    [],
    "the template ships a command the table does not call current, so doctor cannot recognise the wiring a " +
      `fresh stamp gets:\n${missing.join("\n")}`
  );
});

test("nothing is `current` that the template no longer ships", () => {
  const shipped = commandsOf(templateToday());
  const stale = SHIPPED_COMMANDS.filter(
    (e) => e.status === "current" && !shipped.some((s) => s.surface === e.surface && s.command === e.command)
  ).map((e) => `  ${e.id} (${e.surface})`);
  assert.deepEqual(
    stale,
    [],
    `the table calls a form current that template/.claude/settings.json does not carry:\n${stale.join("\n")}\n` +
      "  Either the template changed and the table did not, or the form was superseded without being marked."
  );
});

test("every command this file has EVER carried is in the table", () => {
  assert.notEqual(
    git("rev-parse", "--is-shallow-repository").trim(),
    "true",
    "this clone is shallow, so the history below is not the history — fetch it all (CI checks out fetch-depth 0)"
  );
  const shas = git("log", "--follow", "--format=%H", "--", "template/.claude/settings.json")
    .split("\n")
    .filter(Boolean);
  assert.ok(shas.length >= 2, `only ${shas.length} commit(s) touch this file — the walk below proves nothing`);

  const missing = [];
  let seen = 0;
  let superseded = 0;
  for (const sha of shas) {
    let settings;
    try {
      settings = JSON.parse(git("show", `${sha}:template/.claude/settings.json`));
    } catch {
      continue; // the path did not exist at that commit (a rename), or was not JSON
    }
    for (const { surface, command } of commandsOf(settings)) {
      seen += 1;
      const form = shippedForm(surface, command);
      if (form === null) missing.push(`  ${sha.slice(0, 7)} ${surface}: ${JSON.stringify(command).slice(0, 90)}…`);
      else if (form.status === "superseded") superseded += 1;
    }
  }
  assert.ok(seen > 0, "no historical command was read at all — this test would pass on an empty table");
  assert.ok(superseded > 0, "the history produced no superseded form, so the heal's whole subject is missing");
  assert.deepEqual(
    [...new Set(missing)],
    [],
    "a command create-cmp once stamped into apps is not in the table. An app carrying it would be told " +
      `doctor cannot recognise its wiring, and the heal could never reach it:\n${[...new Set(missing)].join("\n")}`
  );
});

test("every superseded form names a current successor on its own surface", () => {
  const broken = [];
  for (const form of SHIPPED_COMMANDS.filter((e) => e.status === "superseded")) {
    const next = successorOf(form);
    if (next === null) broken.push(`  ${form.id}: no current form with id ${JSON.stringify(form.successor)}`);
    else if (next.surface !== form.surface) broken.push(`  ${form.id}: successor ${next.id} is on ${next.surface}`);
    if (!form.why) broken.push(`  ${form.id}: no \`why\`, so doctor cannot tell the adopter what changed`);
  }
  assert.deepEqual(broken, [], `superseded forms with no usable successor:\n${broken.join("\n")}`);
});

// ── the executed half ─────────────────────────────────────────────────────────

/** A project whose every `qa/<name>.mjs` prints MARKER, so "did it run" is observable. */
function projectFor(commands) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cmp-shipped-form-")));
  fs.mkdirSync(path.join(dir, "qa"), { recursive: true });
  // A path this misses simply leaves the script absent, which can only make the
  // assertions below fail — never pass.
  for (const command of commands) {
    for (const m of command.matchAll(/qa\/[A-Za-z0-9_.-]+\.mjs/g)) {
      fs.mkdirSync(path.dirname(path.join(dir, m[0])), { recursive: true });
      fs.writeFileSync(path.join(dir, m[0]), `process.stdout.write(${JSON.stringify(MARKER)});\n`);
    }
  }
  return dir;
}

/** Run a hook command the way Claude Code does: /bin/sh, given cwd, CLAUDE_PROJECT_DIR exported. */
function ran(command, { cwd, projectDir }) {
  const r = spawnSync("/bin/sh", ["-c", command], {
    cwd,
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    input: "",
    encoding: "utf8",
    timeout: 30_000,
  });
  return String(r.stdout ?? "").includes(MARKER);
}

test("EXECUTED: every form marked `anchored` runs its script from a directory that is not the project", () => {
  const anchored = SHIPPED_COMMANDS.filter((e) => e.anchored === true);
  assert.ok(anchored.length > 0, "no form claims to be anchored — the credit doctor gives has no subject");
  const dir = projectFor(anchored.map((e) => e.command));
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-foreign-cwd-"));
  try {
    for (const form of anchored) {
      assert.equal(form.status, "current", `${form.id}: only a current form may be credited`);
      assert.notEqual(form.surface, "statusLine", `${form.id}: CLAUDE_PROJECT_DIR is never set for a status line (KD-90)`);
      assert.equal(
        ran(form.command, { cwd: dir, projectDir: dir }),
        true,
        `${form.id}: does not even run at the project root`
      );
      assert.equal(
        ran(form.command, { cwd: elsewhere, projectDir: dir }),
        true,
        `${form.id} is marked anchored, and run from another directory it produced nothing. Doctor tells ` +
          "adopters this form works from any directory; the shell disagrees."
      );
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(elsewhere, { recursive: true, force: true });
  }
});

test("EXECUTED: the heal's rewrite changes nothing at the project root and repairs every other directory", () => {
  // The whole safety argument for rewriting a command in someone else's repository:
  // at the root the two forms do the same thing, and away from it the old one is the
  // silence KD-85 is about. Asserted by running both, not by comparing their text.
  const healable = SHIPPED_COMMANDS.filter((e) => healedForm(e) !== null);
  assert.ok(healable.length >= 2, "the heal covers fewer than the two commands a 0.26.2 stamp carries");
  assert.deepEqual(
    healable.map((e) => e.surface).sort(),
    ["Stop", "UserPromptSubmit"],
    "the set of surfaces the heal rewrites changed — a new one needs its own execution evidence here"
  );
  const dir = projectFor(healable.flatMap((e) => [e.command, healedForm(e)]));
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-foreign-cwd-"));
  try {
    for (const form of healable) {
      const next = healedForm(form);
      assert.equal(withoutAnchor(next), form.command, `${form.id}: the rewrite changes more than the anchor`);
      assert.equal(ran(form.command, { cwd: dir, projectDir: dir }), true, `${form.id}: the old form fails at the root`);
      assert.equal(ran(next, { cwd: dir, projectDir: dir }), true, `${form.id}: the new form fails at the root`);
      assert.equal(
        ran(form.command, { cwd: elsewhere, projectDir: dir }),
        false,
        `${form.id} already works from another directory, so rewriting it heals nothing`
      );
      assert.equal(
        ran(next, { cwd: elsewhere, projectDir: dir }),
        true,
        `${form.id}: the form the heal writes does not run from another directory either`
      );
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(elsewhere, { recursive: true, force: true });
  }
});

test("a credited form raises no anchor violation — doctor's two answers cannot contradict", () => {
  for (const form of SHIPPED_COMMANDS.filter((e) => e.anchored === true)) {
    const settings = { hooks: { [form.surface]: [{ matcher: "", hooks: [{ type: "command", command: form.command }] }] } };
    const found = unfixedHookAnchors(settings);
    assert.deepEqual(
      found,
      [],
      `${form.id} is credited as working AND reported unanchored by the detector:\n${describeAnchorViolations(found)}`
    );
  }
});

test("the walk surfaces each have exactly one current form, which is what doctor prints to paste", () => {
  for (const surface of ["UserPromptSubmit", "statusLine", "Stop"]) {
    assert.equal(
      currentForms(surface).length,
      1,
      `${surface} has more than one current form, so "the form create-cmp ships" is ambiguous in doctor's report`
    );
  }
});
