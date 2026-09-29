// `--minimal`, then `add firebase`, then `harden --apply`: .claude/settings.json merges clean.
//
// `add firebase` registers its consent hook (qa/hooks/firebase-consent.mjs) as a PreToolUse group,
// and an ask rule on that file, in the app's .claude/settings.json. harden then walks the same file
// from the minimal stamp's advisory hook set to the full lane's. A line merge saw both sides move
// the same lines and wrote a `.cmp-new` sidecar — the lane's Stop gate and ask rules waited on a
// hand resolution (measured 2026-09-28, PATTERN-REVIEW slice 16). Hook groups and permission rules
// are sets: merged as JSON, the overlay's group sits beside the lane's, and neither side is lost.
//
// No Gradle, no lane: scaffold, the add-firebase plan and harden all run in-process.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, after } from "node:test";

import { scaffold } from "../src/scaffold.mjs";
import { planAddFirebase, applyAddFirebasePlan } from "../src/lib/add-firebase.mjs";
import { hardenProject } from "../src/commands/harden.mjs";
import { mergeSettingsJson, SIDECAR_SUFFIX } from "../src/lib/harness-upgrade.mjs";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-harden-fb-settings-"));
after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

const SETTINGS = ".claude/settings.json";
const CONSENT = 'node "${CLAUDE_PROJECT_DIR:-.}/qa/hooks/firebase-consent.mjs"';

const config = (harness, targetDir) => ({
  appName: "Late Fire",
  package: "com.late.fire",
  iosBundleId: "com.late.fire",
  themePrefix: "Late",
  harness,
  platforms: { android: true, ios: false },
  room: true,
  e2e: true,
  inspector: true,
  devClient: true,
  tabs: [{ label: "Home", icon: "home" }],
  targetDir,
});

/** Every `event matcher command` a settings object registers. */
const hookIds = (s) =>
  Object.entries(s.hooks ?? {}).flatMap(([event, groups]) =>
    groups.flatMap((g) => (g.hooks ?? []).map((h) => `${event} ${g.matcher ?? ""} ${h.command.trim()}`)),
  );

test("a minimal app that ran add firebase hardens with .claude/settings.json merged, both sides kept", async () => {
  const app = path.join(tmpRoot, "app");
  const full = path.join(tmpRoot, "full");
  await scaffold(config(false, app), { verify: false });
  await scaffold(config(true, full), { verify: false });

  applyAddFirebasePlan(app, planAddFirebase(app, {}));
  const added = JSON.parse(fs.readFileSync(path.join(app, SETTINGS), "utf8"));
  // The premise: add firebase wrote into the file harden walks. If it ever stops, this test no
  // longer reaches the merge it is about.
  assert.ok(hookIds(added).includes(`PreToolUse Bash ${CONSENT}`), "add firebase registered its consent hook");

  const outcome = await hardenProject({ projectDir: app, apply: true });
  assert.equal(outcome.alreadyFull, false);
  const entry = outcome.plan.entries.find((e) => e.relPath === SETTINGS);
  assert.equal(entry.bucket, "merged", `${SETTINGS} is merged, not ${entry.bucket}`);
  assert.equal(outcome.plan.entries.filter((e) => e.bucket === "conflicted").length, 0, "no conflicted entry");
  assert.deepEqual(outcome.result.sidecars, []);
  assert.equal(fs.existsSync(path.join(app, SETTINGS + SIDECAR_SUFFIX)), false, "no sidecar written");

  const merged = JSON.parse(fs.readFileSync(path.join(app, SETTINGS), "utf8"));
  const lane = JSON.parse(fs.readFileSync(path.join(full, SETTINGS), "utf8"));
  const have = hookIds(merged);

  // The overlay's side: the consent hook, as add firebase wrote it, and its ask rule.
  assert.ok(have.includes(`PreToolUse Bash ${CONSENT}`), "the firebase consent hook survives");
  const consentGroup = merged.hooks.PreToolUse.find((g) => g.hooks.some((h) => h.command === CONSENT));
  assert.equal(consentGroup.hooks.find((h) => h.command === CONSENT).timeout, 10);
  assert.ok(merged.permissions.ask.includes("Edit(qa/hooks/firebase-consent.mjs)"));

  // The lane's side: every hook, every allow and ask rule, and the status line of a full stamp.
  for (const id of hookIds(lane)) assert.ok(have.includes(id), `the lane's hook is present: ${id.slice(0, 90)}`);
  for (const rule of lane.permissions.allow) assert.ok(merged.permissions.allow.includes(rule), rule);
  for (const rule of lane.permissions.ask) assert.ok(merged.permissions.ask.includes(rule), rule);
  assert.deepEqual(merged.statusLine, lane.statusLine);

  // Nothing else: the minimal stamp's advisory SessionStart hook, which the lane replaces, is gone.
  const extra = have.filter((id) => !hookIds(lane).includes(id));
  assert.deepEqual(extra, [`PreToolUse Bash ${CONSENT}`]);
});

const buf = (o) => Buffer.from(JSON.stringify(o, null, 2) + "\n");

test("mergeSettingsJson keeps a hook or rule either side added and drops one a side removed", () => {
  const base = { hooks: { Stop: [{ matcher: "", hooks: [{ type: "command", command: "a" }] }] }, permissions: { ask: ["Edit(x)"] } };
  const theirs = {
    hooks: { Stop: [{ matcher: "", hooks: [{ type: "command", command: "mine" }] }] }, // app removed "a", added "mine"
    permissions: { ask: ["Edit(x)", "Edit(y)"] },
  };
  const next = {
    hooks: { Stop: [{ matcher: "", hooks: [{ type: "command", command: "a" }, { type: "command", command: "lane" }] }] },
    permissions: { ask: ["Edit(x)", "Edit(z)"], allow: ["Bash(v)"] },
  };
  const out = JSON.parse(mergeSettingsJson(buf(theirs), buf(base), buf(next)).toString());
  assert.deepEqual(out.hooks.Stop.flatMap((g) => g.hooks.map((h) => h.command)), ["lane", "mine"]);
  assert.deepEqual(out.permissions, { ask: ["Edit(x)", "Edit(z)", "Edit(y)"], allow: ["Bash(v)"] });
});

test("mergeSettingsJson returns null when both sides move one value differently, or a side is not JSON", () => {
  const base = { statusLine: { command: "a" } };
  assert.equal(mergeSettingsJson(buf({ statusLine: { command: "b" } }), buf(base), buf({ statusLine: { command: "c" } })), null);
  const hook = (timeout) => ({ hooks: { Stop: [{ matcher: "", hooks: [{ command: "x", timeout }] }] } });
  assert.equal(mergeSettingsJson(buf(hook(2)), buf(hook(1)), buf(hook(3))), null);
  assert.equal(mergeSettingsJson(Buffer.from("{ not json"), buf(base), buf(base)), null);
});

test("mergeSettingsJson hands back the app's own bytes when the merge changes nothing", () => {
  const theirs = Buffer.from('{"permissions":{"ask":["Edit(x)"]}}\n');
  assert.equal(mergeSettingsJson(theirs, buf({}), buf({ permissions: { ask: ["Edit(x)"] } })), theirs);
});
