// A hook never grants. Source for why an "allow" is a grant: the Claude Code
// permission-modes doc, as
// docs/reference/anthropic-agentic-engineering-2026-09-27/notes/07-security-permissions-governance.md §1.
//
// A PreToolUse hook that answers permissionDecision "allow" approves the call and
// skips the permission prompt. Our reminders did exactly that in every stamped app,
// for any Bash call whose payload mentioned screencap, maestro test, adb install or
// node qa/verify.mjs; and the proof gate's pass verdict did it for `npm publish` and
// `gh pr create`. The rule this file holds: every PreToolUse command hook this
// repository ships — the template's, this repo's own, the plugin's — is EXECUTED on
// a payload it matches, the way Claude Code delivers one (JSON on stdin), and its
// answer may add context, refuse, ask or say nothing. It may never allow.
//
// Executed rather than read, because a grant is what the hook prints, not what its
// source looks like: a command can build the string at run time.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SOURCES = [
  { name: "template/.claude/settings.json", file: path.join(ROOT, "template", ".claude", "settings.json") },
  { name: ".claude/settings.json", file: path.join(ROOT, ".claude", "settings.json") },
  { name: "scripts/hooks/plugin-hooks.json", file: path.join(ROOT, "scripts", "hooks", "plugin-hooks.json") },
];

// Commands that trip every Bash reminder and every gate this repository ships. None
// is run — each is only the text of a payload.
const BASH_COMMANDS = [
  "adb shell screencap -p /sdcard/s.png",
  "adb shell uiautomator dump",
  "maestro test .maestro/smoke.yaml",
  "adb install -r composeApp/build/outputs/apk/debug/composeApp-debug.apk",
  "adb -s emulator-5554 uninstall com.example.app",
  "./gradlew :composeApp:connectedDebugAndroidTest",
  "./gradlew :composeApp:installDebug",
  "emulator -avd Medium_Phone_API_35",
  "node qa/verify.mjs",
  "node qa/verify.mjs --fast",
  "npm publish",
  "gh pr create --title x --body y",
  "CMP_AVD=X node scripts/fleet-check.mjs --min-level L2",
];

/** A SendMessage resume whose helper transcript is large enough to be priced. */
function sendMessagePayload(dir) {
  const sessionId = "7debba1b-ee3b-44a5-81de-7ce81ae02461";
  const transcriptPath = path.join(dir, `${sessionId}.jsonl`);
  fs.writeFileSync(transcriptPath, JSON.stringify({ type: "user", message: { role: "user", content: "hello" } }) + "\n");
  const subagents = path.join(dir, sessionId, "subagents");
  fs.mkdirSync(subagents, { recursive: true });
  const usage = { input_tokens: 1, cache_creation_input_tokens: 1, cache_read_input_tokens: 400_000, output_tokens: 812 };
  fs.writeFileSync(
    path.join(subagents, "agent-abig.jsonl"),
    JSON.stringify({ isSidechain: true, agentId: "abig", type: "assistant", message: { role: "assistant", content: [], usage } }) + "\n",
  );
  return {
    session_id: sessionId,
    transcript_path: transcriptPath,
    cwd: ROOT,
    permission_mode: "default",
    hook_event_name: "PreToolUse",
    tool_name: "SendMessage",
    tool_input: { to: "abig", summary: "resume", message: "carry on" },
  };
}

function preToolUseHooks(file) {
  const settings = JSON.parse(fs.readFileSync(file, "utf8"));
  return (settings.hooks?.PreToolUse ?? []).flatMap((group) =>
    (group.hooks ?? []).filter((h) => h.type === "command").map((h) => ({ matcher: group.matcher ?? "", command: h.command })),
  );
}

function payloadsFor(matcher, scratch) {
  const out = [];
  if (matcher === "" || new RegExp(`^(?:${matcher})$`).test("Bash")) {
    for (const command of BASH_COMMANDS) {
      out.push({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command }, cwd: ROOT });
    }
  }
  if (matcher === "" || new RegExp(`^(?:${matcher})$`).test("SendMessage")) out.push(sendMessagePayload(scratch));
  // A subagent spawn (brief-check), under both tool names it is registered on:
  // one complete brief and one missing every field, so the hook answers at least once.
  for (const tool of ["Agent", "Task"]) {
    if (matcher !== "" && !new RegExp(`^(?:${matcher})$`).test(tool)) continue;
    for (const prompt of ["Objective: x\nOutput: a/b.md\nBranch: b\nHand-off: h.md\nOut of scope: y\nProof: z", "do the thing"]) {
      out.push({ hook_event_name: "PreToolUse", tool_name: tool, tool_input: { subagent_type: "create-cmp:executor", description: "d", prompt }, cwd: ROOT });
    }
  }
  return out;
}

/** Run one hook command as Claude Code does: through a shell, the payload on stdin. */
function runHook(command, payload) {
  return spawnSync("sh", ["-c", command], {
    input: JSON.stringify(payload),
    cwd: ROOT,
    env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT, CLAUDE_PLUGIN_ROOT: ROOT },
    encoding: "utf8",
    timeout: 30_000,
  });
}

const GRANT = /"permissionDecision"\s*:\s*"allow"/;

test("no PreToolUse hook this repository ships answers allow — each is run on payloads it matches", () => {
  const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "no-hook-grants-")));
  try {
    let hooks = 0;
    let answered = 0;
    for (const { name, file } of SOURCES) {
      const found = preToolUseHooks(file);
      assert.ok(found.length > 0, `${name} carries no PreToolUse command hook, so this measured nothing there`);
      for (const { matcher, command } of found) {
        hooks++;
        const payloads = payloadsFor(matcher, scratch);
        assert.ok(payloads.length > 0, `${name}: no synthetic payload matches "${matcher}" — extend this test before shipping that hook`);
        for (const payload of payloads) {
          const r = runHook(command, payload);
          assert.equal(r.signal, null, `${name}: the hook was killed: ${r.stderr}`);
          const what = `${name} [${matcher}] on ${JSON.stringify(payload.tool_input)}`;
          assert.doesNotMatch(r.stdout, GRANT, `${what} granted the call: ${r.stdout}`);
          if (r.stdout.trim()) {
            answered++;
            const out = JSON.parse(r.stdout).hookSpecificOutput ?? {};
            if (out.permissionDecision !== undefined) {
              assert.ok(["deny", "ask"].includes(out.permissionDecision), `${what} decided "${out.permissionDecision}"`);
            } else {
              assert.equal(typeof out.additionalContext, "string", `${what} answered without context or a refusal: ${r.stdout}`);
            }
          }
        }
      }
    }
    assert.ok(hooks >= 5, `only ${hooks} PreToolUse hooks found across the three sources`);
    // The reminders fire on these payloads, so silence everywhere would mean the
    // payloads missed and nothing was proved.
    assert.ok(answered >= 4, `only ${answered} hook runs answered at all — the payloads are not reaching the hooks`);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("proof-gate on `npm publish`, on this tree, refuses or adds context — it never allows", () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "hooks", "proof-gate.mjs")], {
    input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "npm publish" }, cwd: ROOT }),
    cwd: ROOT,
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(r.signal, null, `the gate was killed: ${r.stderr}`);
  assert.doesNotMatch(r.stdout, GRANT, `the gate granted npm publish: ${r.stdout}`);
  assert.doesNotMatch(r.stdout, /"allow"/, `the gate's answer carries an allow: ${r.stdout}`);
  if (r.stdout.trim()) {
    const out = JSON.parse(r.stdout).hookSpecificOutput;
    assert.equal(out.hookEventName, "PreToolUse");
    if (out.permissionDecision !== undefined) assert.equal(out.permissionDecision, "deny", r.stdout);
    else assert.equal(typeof out.additionalContext, "string", r.stdout);
  }
});
