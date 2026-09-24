// A RESUMED HELPER IS PRICED AT THE MOMENT OF THE SEND — scripts/hooks/resume-price.mjs.
//
// The proposal (docs/proposals/RESUME-COSTS-MORE-THAN-RESTART.md) measured a
// session spending about half of 19.8M tokens on helpers resumed with
// SendMessage, each re-reading its whole history on every step. The hook prices
// that choice when it is made. These tests pin the two things it must never get
// wrong in either direction: it speaks, with the right number, only above the
// threshold; and it is SILENT, exit 0, everywhere it cannot compute a price —
// because an advisory that guesses, or that ever carries a permission decision,
// is worse than none.
//
// Fixtures are subagent transcripts written in the shape Claude Code writes
// them (one JSON object per line; an assistant line carries `message.usage`),
// laid out where the payload's `transcript_path` says a session's helpers live:
// `<dir>/<session>.jsonl` and `<dir>/<session>/subagents/agent-<id>.jsonl`.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  FRESH_HELPER_TOKENS,
  RESUME_PRICE_THRESHOLD,
  carriedContext,
  helperTranscript,
  sessionDirOf,
} from "../scripts/hooks/resume-price.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOOK = path.join(ROOT, "scripts", "hooks", "resume-price.mjs");

const usage = (input, cacheRead, cacheCreation) => ({
  input_tokens: input,
  cache_creation_input_tokens: cacheCreation,
  cache_read_input_tokens: cacheRead,
  output_tokens: 812,
  service_tier: "standard",
});
const assistant = (id, u, model = "claude-opus-5-5") =>
  JSON.stringify({
    parentUuid: "p",
    isSidechain: true,
    agentId: id,
    message: { model, id: "msg_1", type: "message", role: "assistant", content: [{ type: "text", text: "working" }], usage: u },
    type: "assistant",
    uuid: "u",
    timestamp: "2026-09-24T20:00:00.000Z",
  });
const user = (id, text) =>
  JSON.stringify({ parentUuid: "p", isSidechain: true, agentId: id, message: { role: "user", content: text }, type: "user", uuid: "v" });

/** A session on disk: its transcript, and a way to write helper transcripts beside it. */
function session() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "resume-price-")));
  const sessionId = "7debba1b-ee3b-44a5-81de-7ce81ae02461";
  const transcriptPath = path.join(dir, `${sessionId}.jsonl`);
  fs.writeFileSync(transcriptPath, user("main", "hello") + "\n");
  const subagents = path.join(dir, sessionId, "subagents");
  fs.mkdirSync(subagents, { recursive: true });
  return {
    dir,
    transcriptPath,
    subagents,
    helper(id, lines, { trailingNewline = true } = {}) {
      const file = path.join(subagents, `agent-${id}.jsonl`);
      fs.writeFileSync(file, lines.join("\n") + (trailingNewline ? "\n" : ""));
      return file;
    },
    done: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

const payload = (transcriptPath, to, over = {}) => ({
  session_id: "7debba1b-ee3b-44a5-81de-7ce81ae02461",
  transcript_path: transcriptPath,
  cwd: ROOT,
  permission_mode: "default",
  hook_event_name: "PreToolUse",
  tool_name: "SendMessage",
  tool_input: { to, summary: "resume", message: "carry on", type: "message", recipient: to, content: "carry on" },
  tool_use_id: "toolu_01ABC",
  ...over,
});

/** Run the hook the way Claude Code does: the payload on stdin, from a directory that is not the repo. */
function run(input) {
  const res = spawnSync(process.execPath, [HOOK], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    cwd: os.tmpdir(),
    encoding: "utf8",
    timeout: 20_000,
  });
  return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "", error: res.error };
}

function assertSilent(r, why) {
  assert.equal(r.error, undefined, `${why}: the hook did not run to completion (${r.error})`);
  assert.equal(r.status, 0, `${why}: exit ${r.status} — the advisory exits 0 on every path. stderr: ${r.stderr}`);
  assert.equal(r.stdout, "", `${why}: expected silence, got ${r.stdout}`);
}

// Every output this file ever sees, so the permission check below covers them all.
const SEEN = [];
const seen = (r) => (SEEN.push(r.stdout), r);

test("at or below the threshold the hook is silent — a helper that carries little costs little to resume", () => {
  const s = session();
  try {
    s.helper("a0at", [user("a0at", "brief"), assistant("a0at", usage(0, RESUME_PRICE_THRESHOLD - 19_000, 19_000))]);
    assertSilent(seen(run(payload(s.transcriptPath, "a0at"))), "exactly at the threshold, which is not above it");
    s.helper("a0over", [user("a0over", "brief"), assistant("a0over", usage(1, RESUME_PRICE_THRESHOLD - 19_000, 19_000))]);
    assert.notEqual(seen(run(payload(s.transcriptPath, "a0over"))).stdout, "", "one token above it is priced — the boundary is where the constant says");
    s.helper("a1fresh", [user("a1fresh", "brief"), assistant("a1fresh", usage(4, 19_099, 17_916))]);
    assertSilent(seen(run(payload(s.transcriptPath, "a1fresh"))), "a helper the size of a fresh one");
  } finally {
    s.done();
  }
});

test("above the threshold the sender is told the carried size, what each step re-reads, and what a fresh helper costs", () => {
  const s = session();
  try {
    // The reviewer measured on 2026-09-24: 174,637 carried after 115 steps.
    s.helper("ab94290c9c12b58ca", [
      user("ab94290c9c12b58ca", "brief"),
      assistant("ab94290c9c12b58ca", usage(2, 60_000, 3_000)),
      user("ab94290c9c12b58ca", "tool result"),
      assistant("ab94290c9c12b58ca", usage(2, 172_508, 2_127)),
    ]);
    const r = seen(run(payload(s.transcriptPath, "ab94290c9c12b58ca")));
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    const text = out.hookSpecificOutput.additionalContext;
    assert.match(text, /174,637 tokens/, "the carried size, exactly: input + cache read + cache creation on the LAST assistant turn");
    assert.doesNotMatch(text, /63,002/, "an earlier turn's size is not what the helper carries now");
    assert.match(text, /re-reads all of it/, "what each step of a resume costs");
    assert.match(text, /hand-off/, "that its committed work and hand-off file are on disk");
    assert.ok(text.includes(`~${Math.round(FRESH_HELPER_TOKENS / 1000)}k`), `the fresh-helper baseline, ~37k: ${text}`);
    assert.match(text, /unsaved state you need/, "the one case where resuming is worth it");
    assert.ok(text.includes("ab94290c9c12b58ca"), "which helper it priced");
  } finally {
    s.done();
  }
});

test("the price is the LAST complete assistant turn — an earlier larger one does not count, a half-written last line is skipped", () => {
  const s = session();
  try {
    // Larger earlier, smaller now (a helper that compacted): silent.
    s.helper("a2shrunk", [assistant("a2shrunk", usage(1, 300_000, 1)), user("a2shrunk", "x"), assistant("a2shrunk", usage(1, 90_000, 1))]);
    assertSilent(seen(run(payload(s.transcriptPath, "a2shrunk"))), "the helper carries 90,002 now");
    // The transcript is written while the helper runs: its last line can be a
    // fragment. The complete turn above it is the answer, never a parse error.
    const whole = assistant("a3partial", usage(1, 199_000, 1));
    s.helper("a3partial", [assistant("a3partial", usage(1, 180_000, 1)), whole.slice(0, whole.length / 2)], { trailingNewline: false });
    const r = seen(run(payload(s.transcriptPath, "a3partial")));
    assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /180,002 tokens/);
    // A synthetic assistant line records zeros; the real turn above it is read.
    s.helper("a4synthetic", [assistant("a4synthetic", usage(3, 160_000, 0)), assistant("a4synthetic", usage(0, 0, 0), "<synthetic>")]);
    const r2 = seen(run(payload(s.transcriptPath, "a4synthetic")));
    assert.match(JSON.parse(r2.stdout).hookSpecificOutput.additionalContext, /160,003 tokens/);
  } finally {
    s.done();
  }
});

test("an unreadable, empty or truncated transcript is silence and exit 0 — a price it cannot compute is not a price", () => {
  const s = session();
  try {
    assertSilent(seen(run(payload(s.transcriptPath, "a5missing"))), "no transcript for this id");
    s.helper("a6empty", [], { trailingNewline: false });
    assertSilent(seen(run(payload(s.transcriptPath, "a6empty"))), "an empty transcript");
    const whole = assistant("a7cut", usage(1, 400_000, 1));
    s.helper("a7cut", [user("a7cut", "brief"), whole.slice(0, 120)], { trailingNewline: false });
    assertSilent(seen(run(payload(s.transcriptPath, "a7cut"))), "a transcript cut off inside its only assistant line");
    s.helper("a8garbage", ["\u0000\u0001not json at all", "{\"type\":\"assistant\",\"message\":{\"usage\":\"lots\"}}"]);
    assertSilent(seen(run(payload(s.transcriptPath, "a8garbage"))), "lines that are not transcript lines");
    fs.mkdirSync(path.join(s.subagents, "agent-a9dir.jsonl"));
    assertSilent(seen(run(payload(s.transcriptPath, "a9dir"))), "a directory where the transcript should be");
    if (process.getuid?.() !== 0) {
      const locked = s.helper("a10locked", [assistant("a10locked", usage(1, 400_000, 1))]);
      fs.chmodSync(locked, 0o000);
      assertSilent(seen(run(payload(s.transcriptPath, "a10locked"))), "a transcript this user cannot read");
      fs.chmodSync(locked, 0o600);
    }
  } finally {
    s.done();
  }
});

test("a name, a peer session or `main` is silence — only a helper file in this session is priced, and nothing else becomes a path", () => {
  const s = session();
  try {
    // A real helper above the threshold sits in the same session, so each
    // silence below is about the recipient, not about a missing fixture.
    s.helper("ac0ffee0ffee0ffee", [assistant("ac0ffee0ffee0ffee", usage(1, 400_000, 1))]);
    assert.notEqual(seen(run(payload(s.transcriptPath, "ac0ffee0ffee0ffee"))).stdout, "", "the control: the same session, addressed by id, is priced");
    for (const to of ["worker", "worker [ref]", "main", "peer-session [ref]", "*", "", "../ac0ffee0ffee0ffee", "subagents/agent-ac0ffee0ffee0ffee"]) {
      assertSilent(seen(run(payload(s.transcriptPath, to))), `to=${JSON.stringify(to)}`);
    }
    assert.equal(helperTranscript(payload(s.transcriptPath, "../ac0ffee0ffee0ffee")), null, "a `to` that is not a bare id is never joined into a path");
    for (const to of [null, 42, { id: "ac0ffee0ffee0ffee" }, ["ac0ffee0ffee0ffee"]]) {
      assertSilent(seen(run(payload(s.transcriptPath, to))), `to=${JSON.stringify(to)}`);
    }
  } finally {
    s.done();
  }
});

test("a send FROM a helper prices the same helper file — the session directory is found from either transcript path", () => {
  const s = session();
  try {
    const sender = s.helper("aorchestrator01", [assistant("aorchestrator01", usage(1, 10_000, 1))]);
    s.helper("aworker02", [assistant("aworker02", usage(1, 250_000, 1))]);
    assert.equal(sessionDirOf(sender), sessionDirOf(s.transcriptPath));
    const r = seen(run(payload(sender, "aworker02")));
    assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /250,002 tokens/);
    for (const bad of [undefined, 7, "", "/no/extension", "relative.txt"]) assert.equal(sessionDirOf(bad), null, `transcript_path=${JSON.stringify(bad)}`);
  } finally {
    s.done();
  }
});

test("a malformed payload is silence and exit 0", () => {
  const s = session();
  try {
    s.helper("abadpayload", [assistant("abadpayload", usage(1, 400_000, 1))]);
    const good = payload(s.transcriptPath, "abadpayload");
    const cases = [
      ["no stdin at all", ""],
      ["not JSON", "{not json"],
      ["JSON null", "null"],
      ["a JSON array", "[1,2,3]"],
      ["a JSON string", '"SendMessage"'],
      ["another tool", { ...good, tool_name: "Bash", tool_input: { command: "ls" } }],
      ["another event", { ...good, hook_event_name: "PostToolUse" }],
      ["no tool_input", { ...good, tool_input: undefined }],
      ["tool_input is a string", { ...good, tool_input: "abadpayload" }],
      ["no transcript_path", { ...good, transcript_path: undefined }],
      ["transcript_path is a number", { ...good, transcript_path: 12 }],
    ];
    for (const [why, input] of cases) assertSilent(seen(run(input)), why);
  } finally {
    s.done();
  }
});

test("the program has no exit but node's own zero — it cannot refuse by exit code", () => {
  // Behaviour pins every path above; the bytes pin the paths nobody tested, the
  // way test/nothing-says-which-lane-a-change-is-on.test.mjs pins change-price.
  const source = fs.readFileSync(HOOK, "utf8").replace(/^\s*\/\/.*$/gm, "");
  assert.equal(/process\.exit\s*\(/.test(source), false, "resume-price.mjs calls process.exit — it is advisory and ends at node's zero");
  assert.equal(/process\.exitCode/.test(source), false, "nor by the other spelling of an exit code");
});

test("a multi-megabyte transcript is read from its tail, a line split across chunks is joined, and past the cap it is silence", () => {
  const s = session();
  try {
    // The answer sits ABOVE a 6 MB tool result — the shape a helper that just
    // read a big file leaves — and below 6 MB of older history.
    const big = user("abig", "x".repeat(6 * 1024 * 1024));
    const file = s.helper("abig", [big, assistant("abig", usage(2, 288_792, 2_127)), big]);
    const started = Date.now();
    const r = seen(run(payload(s.transcriptPath, "abig")));
    const ms = Date.now() - started;
    assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /290,921 tokens/);
    assert.ok(ms < 5_000, `the hook took ${ms} ms over a ${fs.statSync(file).size}-byte transcript; its wired timeout is 10 s`);

    // Chunk boundaries anywhere: a 7-byte chunk splits every line many times.
    const small = s.helper("asplit", [user("asplit", "brief é ü"), assistant("asplit", usage(5, 151_000, 5))]);
    assert.equal(carriedContext(small, { chunkBytes: 7 }), 151_010);
    // The file's FIRST line is read too, with no newline before it.
    const first = s.helper("afirst", [assistant("afirst", usage(1, 155_000, 1))], { trailingNewline: false });
    assert.equal(carriedContext(first, { chunkBytes: 5 }), 155_002);
    // The cap: the answer is further from the end than the program will read.
    assert.equal(carriedContext(file, { maxBytes: 1024 * 1024 }), null, "an answer past the read cap is no answer");
  } finally {
    s.done();
  }
});

test("the plugin ships the hook and this repo wires it — each declared command runs the script from outside the repo", () => {
  const plugin = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude-plugin", "plugin.json"), "utf8"));
  assert.equal(typeof plugin.hooks, "string", "plugin.json declares its hooks file");
  assert.ok(plugin.hooks.startsWith("./"), "a plugin component path is relative to the plugin root and starts with ./");
  const pluginHooks = JSON.parse(fs.readFileSync(path.join(ROOT, plugin.hooks), "utf8"));
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude", "settings.json"), "utf8"));
  const sendMessageCommands = (cfg) =>
    (cfg.hooks?.PreToolUse ?? []).filter((g) => g.matcher === "SendMessage").flatMap((g) => g.hooks.map((h) => h.command));

  const shipped = sendMessageCommands(pluginHooks);
  const wired = sendMessageCommands(settings);
  assert.deepEqual(shipped, ['node "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/resume-price.mjs"']);
  assert.deepEqual(wired, ['node "${CLAUDE_PROJECT_DIR:-.}/scripts/hooks/resume-price.mjs"']);

  // Executed, not read: each command, through a shell, from a directory that is
  // not the repo, with the variable Claude Code sets for it.
  const s = session();
  try {
    s.helper("awired", [assistant("awired", usage(1, 200_000, 1))]);
    const input = JSON.stringify(payload(s.transcriptPath, "awired"));
    for (const [command, env] of [
      [shipped[0], { CLAUDE_PLUGIN_ROOT: ROOT }],
      [wired[0], { CLAUDE_PROJECT_DIR: ROOT }],
    ]) {
      const res = spawnSync("sh", ["-c", command], { input, cwd: os.tmpdir(), env: { ...process.env, ...env }, encoding: "utf8", timeout: 20_000 });
      assert.equal(res.status, 0, `${command}: ${res.stderr}`);
      SEEN.push(res.stdout);
      assert.match(JSON.parse(res.stdout).hookSpecificOutput.additionalContext, /200,002 tokens/, command);
    }
  } finally {
    s.done();
  }
});

test("no output ever carries a permission decision — the advisory never allows, asks, defers or denies", () => {
  // `permissionDecision: "allow"` skips the user's permission prompt
  // (code.claude.com/docs/en/hooks.md, "PreToolUse decision control"); an
  // advisory that emitted it would be granting what the user holds.
  const spoke = SEEN.filter(Boolean);
  assert.ok(spoke.length >= 4, `the tests above must have produced priced outputs to check; saw ${spoke.length}`);
  for (const out of SEEN) assert.equal(/permissionDecision|"decision"|updatedInput/.test(out), false, `an output carried a decision: ${out}`);
  // And the one shape it does emit is exactly the documented context-only one.
  for (const out of spoke) {
    const o = JSON.parse(out);
    assert.deepEqual(Object.keys(o), ["hookSpecificOutput"]);
    assert.deepEqual(Object.keys(o.hookSpecificOutput).sort(), ["additionalContext", "hookEventName"]);
    assert.equal(o.hookSpecificOutput.hookEventName, "PreToolUse");
    assert.ok(o.hookSpecificOutput.additionalContext.length < 10_000, "inside the documented 10,000-character cap");
  }
});
