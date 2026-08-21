// The hook classifier (src/lib/hooks.mjs) is the mechanical Act 2 / Act 3
// line (LADDER §R2): enforcement (Stop — refuses "done" without evidence),
// lane-advisory (nudges that presuppose qa/), portable advisory (true in
// every mode). These tests pin the line against the REAL template settings,
// so a template hook change that blurs it fails here with a reason.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  classifyHook,
  isEnforcementEvent,
  minimalHookSettings,
  sessionStartCommand,
  stripEnforcementHooks,
} from "../src/lib/hooks.mjs";
import { MINIMAL_SESSION_CONTEXT, laneKeepSet } from "../src/lib/minimal.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const settings = JSON.parse(
  fs.readFileSync(path.join(ROOT, "template/.claude/settings.json"), "utf8")
);

const allHooks = (s) =>
  Object.entries(s.hooks ?? {}).flatMap(([event, groups]) =>
    groups.flatMap((g) => (g.hooks ?? []).map((hook) => ({ event, hook })))
  );

test("the template carries all three classes — the split has something to split", () => {
  const classes = new Set(allHooks(settings).map(({ event, hook }) => classifyHook(event, hook)));
  assert.ok(classes.has("enforcement"), "no enforcement hook in template");
  assert.ok(classes.has("lane-advisory"), "no lane-advisory hook in template");
  assert.ok(classes.has("advisory"), "no portable advisory hook in template");
});

test("every advisory hook really is advisory — informs, never denies", () => {
  for (const { event, hook } of allHooks(settings)) {
    if (isEnforcementEvent(event)) continue;
    assert.ok(
      !/"permissionDecision":\s*"(deny|ask)"/.test(hook.command),
      `${event} hook denies/asks — enforcement living in an advisory event: ${hook.command.slice(0, 80)}`
    );
  }
});

test("the enforcement hook is the receipt gate, not something else", () => {
  const stop = settings.hooks.Stop.flatMap((g) => g.hooks).map((h) => h.command);
  assert.ok(
    stop.some((c) => c.includes("qa/receipt-check.mjs")),
    "Stop hook no longer runs qa/receipt-check.mjs — the Act 3 story changed; revisit the split"
  );
});

test("stripEnforcementHooks: Stop goes, both advisory kinds survive byte-identical", () => {
  const before = JSON.stringify(settings);
  const light = stripEnforcementHooks(settings);
  assert.equal(light.hooks.Stop, undefined, "Stop hook survived the strip");
  assert.deepEqual(light.hooks.SessionStart, settings.hooks.SessionStart);
  assert.deepEqual(light.hooks.PreToolUse, settings.hooks.PreToolUse);
  assert.equal(JSON.stringify(settings), before, "input was mutated");
  assert.deepEqual(stripEnforcementHooks(light), light, "not idempotent");
});

test("minimalHookSettings: enforcement and lane-advisory go, the portable nudge survives", () => {
  const before = JSON.stringify(settings);
  const minimal = minimalHookSettings(settings, { sessionContext: MINIMAL_SESSION_CONTEXT });
  assert.equal(JSON.stringify(settings), before, "input was mutated");

  assert.equal(minimal.hooks.Stop, undefined, "Stop hook survived");

  // The rule is not "never say qa/" — minimal KEEPS the preview entry points,
  // so naming them is honest. The rule is that every lane path a surviving
  // hook names must be one the minimal stamp actually ships.
  const keep = laneKeepSet(path.join(ROOT, "template"));
  for (const { hook } of allHooks(minimal)) {
    for (const m of [...hook.command.matchAll(/qa\/(?:lib\/)?[a-z-]+\.mjs/g)]) {
      assert.ok(
        keep.has(m[0]),
        `a surviving hook names ${m[0]}, which the minimal stamp deletes: ${hook.command.slice(0, 80)}`
      );
    }
  }

  // The portable advisory PreToolUse nudge (screenshots-lose-structure) ships
  // byte-identical — minimal mode still has the inspector.
  const fullPortable = allHooks(settings)
    .filter(({ event, hook }) => classifyHook(event, hook) === "advisory" && event === "PreToolUse")
    .map(({ hook }) => hook.command);
  const minimalPreToolUse = allHooks(minimal)
    .filter(({ event }) => event === "PreToolUse")
    .map(({ hook }) => hook.command);
  assert.deepEqual(minimalPreToolUse, fullPortable, "portable nudges did not pass through untouched");
});

test("the minimal SessionStart hook parses and tells the truth about this scaffold", () => {
  const minimal = minimalHookSettings(settings, { sessionContext: MINIMAL_SESSION_CONTEXT });
  const commands = (minimal.hooks.SessionStart ?? []).flatMap((g) => g.hooks).map((h) => h.command);
  assert.equal(commands.length, 1, "expected exactly one SessionStart hook");

  const m = commands[0].match(/^printf '%s' '(.*)'$/s);
  assert.ok(m, "SessionStart command is not the template's printf shape");
  const payload = JSON.parse(m[1]);
  assert.equal(payload.hookSpecificOutput.hookEventName, "SessionStart");
  const context = payload.hookSpecificOutput.additionalContext;
  assert.match(context, /minimal/i, "context does not say what this scaffold is");
  assert.match(context, /create-cmp-cli harden/, "context does not name the climb command");
  // Naming receipts as something `harden` ADDS is honest; instructing the
  // deleted lane as if this scaffold had it is not.
  assert.ok(
    !/node qa\/verify\.mjs/.test(context),
    "minimal context instructs the lane this scaffold does not carry"
  );
});

test("sessionStartCommand refuses copy the shell quoting cannot carry", () => {
  assert.throws(() => sessionStartCommand("don't do this"), /apostrophe/);
});
