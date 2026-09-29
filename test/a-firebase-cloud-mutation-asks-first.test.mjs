// FIX-PLAN slice 16 (SK9, decision D6) — a Firebase cloud mutation asks first, in the stamped app.
//
// `create-cmp add firebase` ships qa/hooks/firebase-consent.mjs and registers it as a PreToolUse
// hook on Bash in the app's .claude/settings.json, with a permissions.ask rule on the file. What
// these tests hold:
//
//   - the hook, on synthetic payloads: each of the four mutations → `ask`, with a reason naming
//     it, directly and through the launchers and wrappers; everything else → silence; a payload
//     it cannot read → exit 0 and silence (a consent check, not a safety gate); never `allow`;
//   - the add step, on a stamped app: the hook file and its registration are there, the app's own
//     hooks and rules are kept, an ask rule covers the file, and a second run writes nothing;
//   - on a --minimal app, whose ask list the stamp pruned of every qa/ rule, the step adds one.
//
// What no test here can say: how Claude Code treats `ask` under auto mode and under `-p`. That is
// open verification #8 (LIVE-CHECKS-CHECKLIST.md §8), recorded in the slice's hand-off.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { scaffold } from "../src/scaffold.mjs";
import { planAddFirebase, applyAddFirebasePlan } from "../src/lib/add-firebase.mjs";
import { offTheRunnerChannel } from "./helpers/runner-channel.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "create-cmp.mjs");
const HOOK_REL = "qa/hooks/firebase-consent.mjs";
const OVERLAY_HOOK = path.join(ROOT, "overlays", "firebase", "files", HOOK_REL);

const runHook = (hookPath, stdin) =>
  spawnSync(process.execPath, [hookPath], { input: stdin, encoding: "utf8", timeout: 20000 });
const bash = (command) => JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } });

/** The hook's answer to one Bash command: the parsed JSON, or null when it printed nothing. */
function answer(command, hookPath = OVERLAY_HOOK) {
  const r = runHook(hookPath, bash(command));
  assert.equal(r.status, 0, `exit 0 for ${command}: ${r.stderr}`);
  return r.stdout.trim() === "" ? null : JSON.parse(r.stdout);
}

const MUTATIONS = [
  ["firebase projects:create acme-app-dev --display-name Acme", "projects:create"],
  ['firebase apps:create ANDROID "Acme" --package-name com.acme.demo --project acme-app-dev', "apps:create"],
  ['firebase firestore:databases:create "(default)" --location eur3 --project acme-app-dev', "firestore:databases:create"],
  ["firebase apps:android:sha:create 1:123:android:abc 3A:1B:00", "apps:android:sha:create"],
  ["npx firebase projects:create acme-app-dev", "projects:create"],
  ["npx -y firebase-tools@13 --project acme-app-dev apps:create IOS Acme --bundle-id com.acme", "apps:create"],
  ["npm exec -- firebase firestore:databases:create x --location nam5", "firestore:databases:create"],
  ["npx -p firebase-tools firebase apps:android:sha:create 1:2 AB", "apps:android:sha:create"],
  ["cd app && env FIREBASE_TOKEN=x timeout 60 /usr/local/bin/firebase projects:create p", "projects:create"],
  ['bash -lc "firebase login:list && firebase apps:create WEB w"', "apps:create"],
];

for (const [command, sub] of MUTATIONS) {
  test(`the hook asks, naming the mutation: ${command}`, () => {
    const out = answer(command);
    assert.ok(out, "a mutation is not met with silence");
    const h = out.hookSpecificOutput;
    assert.equal(h.hookEventName, "PreToolUse");
    assert.equal(h.permissionDecision, "ask", "ask — never allow, never deny");
    assert.ok(h.permissionDecisionReason.includes(`firebase ${sub}`), `the reason names firebase ${sub}: ${h.permissionDecisionReason}`);
  });
}

test("the hook names every mutation in one command line", () => {
  const reason = answer("firebase projects:create p; firebase apps:create ANDROID a --project p").hookSpecificOutput
    .permissionDecisionReason;
  assert.match(reason, /firebase projects:create p/);
  assert.match(reason, /firebase apps:create ANDROID a --project p/);
});

for (const command of [
  "firebase deploy",
  "firebase deploy --only firestore:rules",
  "firebase emulators:start --only auth,firestore",
  "npx firebase-tools emulators:start",
  "firebase projects:list",
  "firebase apps:list ANDROID --project p",
  "firebase apps:sdkconfig ANDROID 1:2 --out composeApp/google-services.json",
  "firebase firestore:locations",
  "firebase login:list",
  "./gradlew :composeApp:assembleDebug",
  'echo "firebase projects:create p"',
  "grep -rn apps:create docs/",
  "git commit -m 'docs: firebase apps:create'",
]) {
  test(`the hook is silent: ${command}`, () => {
    assert.equal(answer(command), null);
  });
}

test("the hook is silent for a tool that is not Bash", () => {
  const r = runHook(OVERLAY_HOOK, JSON.stringify({ tool_name: "Write", tool_input: { command: "firebase projects:create p" } }));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});

test("a payload the hook cannot read: exit 0 and silence — a consent check, not a safety gate", () => {
  for (const stdin of ["not json", "", "null", '{"tool_input":{"command":42}}']) {
    const r = runHook(OVERLAY_HOOK, stdin);
    assert.equal(r.status, 0, `exit 0 on ${JSON.stringify(stdin)}`);
    assert.equal(r.stdout, "", `nothing decided on ${JSON.stringify(stdin)}`);
  }
});

test("the hook never answers allow", () => {
  const src = fs.readFileSync(OVERLAY_HOOK, "utf8");
  assert.doesNotMatch(src, /permissionDecision:\s*"(allow|deny)"/);
});

// ── the add step ────────────────────────────────────────────────────────────

async function stampApp(extra = {}) {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cmp-fb-consent-")), "app");
  await offTheRunnerChannel(() =>
    scaffold(
      {
        appName: "Acme",
        package: "com.acme.demo",
        iosBundleId: "com.acme.demo.ios",
        themePrefix: "Acme",
        platforms: { android: true, ios: false },
        room: true,
        e2e: true,
        inspector: true,
        devClient: true,
        tabs: [{ label: "Home", icon: "home" }],
        targetDir: dir,
        ...extra,
      },
      { verify: false },
    ),
  );
  return dir;
}
const cleanup = (dir) => fs.rmSync(path.dirname(dir), { recursive: true, force: true });
const settingsOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, ".claude", "settings.json"), "utf8"));
const consentHooks = (settings) =>
  (settings.hooks?.PreToolUse ?? []).flatMap((g) =>
    (g.hooks ?? []).filter((h) => String(h.command).includes(HOOK_REL)).map((h) => ({ matcher: g.matcher, ...h })),
  );

test("add firebase registers the consent hook in the app, keeps the app's own hooks, and a second run writes nothing", async () => {
  const app = await stampApp();
  try {
    const before = settingsOf(app);
    const cli = () => spawnSync(process.execPath, [BIN, "add", "firebase", app, "--no-verify"], { encoding: "utf8", timeout: 60000 });
    const r = cli();
    assert.equal(r.status, 0, r.stderr + r.stdout);

    const shipped = path.join(app, HOOK_REL);
    assert.equal(fs.readFileSync(shipped, "utf8"), fs.readFileSync(OVERLAY_HOOK, "utf8"), "the app gets the overlay's bytes");

    const after = settingsOf(app);
    const hooks = consentHooks(after);
    assert.equal(hooks.length, 1, "registered once");
    assert.equal(hooks[0].matcher, "Bash");
    assert.equal(hooks[0].command, 'node "${CLAUDE_PROJECT_DIR:-.}/qa/hooks/firebase-consent.mjs"', "anchored at the project root");

    // The app's own hooks and rules are kept, in their order.
    assert.deepEqual(after.hooks.PreToolUse.slice(0, before.hooks.PreToolUse.length), before.hooks.PreToolUse);
    for (const event of ["SessionStart", "Stop", "UserPromptSubmit"]) assert.deepEqual(after.hooks[event], before.hooks[event]);
    assert.deepEqual(after.permissions.allow, before.permissions.allow);
    // The full stamp's `Edit(qa/hooks/**)` already asks before the file is edited: no second rule.
    assert.ok(before.permissions.ask.includes("Edit(qa/hooks/**)"), "premise: the full stamp asks before qa/hooks/ is edited");
    assert.deepEqual(after.permissions.ask, before.permissions.ask);

    // The copy in the app, run the way the settings file runs it, asks.
    const asked = runHook(shipped, bash("npx firebase-tools projects:create acme-app-dev"));
    assert.equal(JSON.parse(asked.stdout).hookSpecificOutput.permissionDecision, "ask");

    const again = cli();
    assert.equal(again.status, 0, again.stderr + again.stdout);
    assert.match(again.stdout, /already there: \.claude\/settings\.json/);
    assert.deepEqual(settingsOf(app), after, "a second run leaves the settings as they were");
  } finally {
    cleanup(app);
  }
});

test("add firebase on a --minimal app adds the ask rule the minimal stamp pruned", async () => {
  const app = await stampApp({ harness: false });
  try {
    const before = settingsOf(app);
    assert.ok(!(before.permissions?.ask ?? []).some((r) => r.includes("qa/")), "premise: minimal prunes every qa/ ask rule");
    applyAddFirebasePlan(app, planAddFirebase(app, {}));
    const after = settingsOf(app);
    assert.equal(consentHooks(after).length, 1);
    assert.ok(after.permissions.ask.includes(`Edit(${HOOK_REL})`), "the file the hook runs asks before an edit");
    assert.ok(fs.existsSync(path.join(app, HOOK_REL)));
    assert.equal(planAddFirebase(app, {}).writes.length, 0, "a second plan writes nothing");
  } finally {
    cleanup(app);
  }
});

test("a settings file that is not JSON is refused by name, and nothing is written", async () => {
  const app = await stampApp();
  try {
    fs.writeFileSync(path.join(app, ".claude", "settings.json"), "{ not json");
    assert.throws(() => planAddFirebase(app, {}), /\.claude\/settings\.json is not valid JSON/);
    assert.equal(fs.existsSync(path.join(app, HOOK_REL)), false);
  } finally {
    cleanup(app);
  }
});
