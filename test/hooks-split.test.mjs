// The advisory/enforcement hook split (src/lib/hooks.mjs) is the mechanical line
// between Act 2 (discovery: inform at the wall, constrain nothing) and Act 3
// (enforcement: refuse "done" without evidence). These tests pin that line against
// the REAL template settings, so a template hook change that blurs it fails here.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { isEnforcementEvent, stripEnforcementHooks } from "../src/lib/hooks.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const settings = JSON.parse(
  fs.readFileSync(path.join(ROOT, "template/.claude/settings.json"), "utf8"),
);

test("the template carries both classes — the split has something to split", () => {
  const events = Object.keys(settings.hooks);
  assert.ok(events.some((e) => isEnforcementEvent(e)), "no enforcement hook in template");
  assert.ok(events.some((e) => !isEnforcementEvent(e)), "no advisory hook in template");
});

test("every advisory hook in the template really is advisory", () => {
  // An advisory hook must never deny: PreToolUse entries must resolve to
  // permissionDecision "allow" (with a reason), and SessionStart only adds context.
  for (const [event, groups] of Object.entries(settings.hooks)) {
    if (isEnforcementEvent(event)) continue;
    for (const group of groups) {
      for (const hook of group.hooks) {
        assert.ok(
          !/"permissionDecision":\s*"(deny|ask)"/.test(hook.command),
          `${event} hook denies/asks — that is enforcement living in an advisory event: ${hook.command.slice(0, 80)}`,
        );
      }
    }
  }
});

test("stripEnforcementHooks: Stop goes, discovery survives byte-identical, input unmutated", () => {
  const before = JSON.stringify(settings);
  const light = stripEnforcementHooks(settings);
  assert.equal(light.hooks.Stop, undefined, "Stop hook survived the strip");
  assert.deepEqual(light.hooks.SessionStart, settings.hooks.SessionStart);
  assert.deepEqual(light.hooks.PreToolUse, settings.hooks.PreToolUse);
  assert.equal(JSON.stringify(settings), before, "input was mutated");
  // Idempotent: stripping a stripped set changes nothing.
  assert.deepEqual(stripEnforcementHooks(light), light);
});

test("the enforcement hook is the receipt gate, not something else", () => {
  // If the Stop hook ever stops being receipt-check, the Act 3 story changed and
  // this split (and the light/full docs) must be revisited deliberately.
  const stop = settings.hooks.Stop.flatMap((g) => g.hooks).map((h) => h.command);
  assert.ok(
    stop.some((c) => c.includes("qa/receipt-check.mjs")),
    "Stop hook no longer runs qa/receipt-check.mjs",
  );
});
