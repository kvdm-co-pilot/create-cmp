// Tool descriptions are the inspector's discovery surface. Claude Code defers
// MCP tool definitions and reaches them through tool search, so a tool is found
// by what its description says it does — not by an internal doc reference or a
// transport detail in its opening words (PATTERN-REVIEW-2026-09-28 C-8, M2).
// Annotations tell the client which tools only read and which destroy, and
// resolve_comment — which writes the human's comment ledger as author "agent" —
// must make the client ask the human on every call (B-L-9, M3).
//
// Everything here is read from the RAW `tools/list` JSON-RPC response, not the
// SDK client's parsed view: the SDK's ToolAnnotationsSchema strips keys it does
// not know, so a parsed view could hide a key the wire lacks, or drop one it has.
// Both the source server and the committed bundle (what plugin users run) are
// checked.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENTRIES = {
  source: path.join(HERE, "..", "bin", "server.mjs"),
  bundle: path.join(HERE, "..", "dist", "server.mjs"),
};

// The cap: the Agent Skills spec's 1,024-character description limit — the
// tightest description cap in the 2026-09-27 doc base (note 04), and inside
// Claude Code's 1,536-character listing truncation. Past the cap, text is the
// first thing a listing cuts, so the act must lead and the whole must fit.
export const DESCRIPTION_CAP = 1024;

// The act each tool's description opens with. A new tool adds its verb here on
// purpose; a description that opens with a noun, a doc reference or a transport
// detail fails.
const ACT_VERBS = new Set([
  "Connect", "Diff", "List", "Mark", "Query", "Read", "Render", "Report", "Save", "Start", "Stop", "Tap",
]);

const READ_ONLY = [
  "approval_status", "db_query", "preview_diff",
  "preview_status", "review_comments", "runtime_crashes", "runtime_logs",
];
const APP_CONTROLLED_OUTPUT = ["db_query", "runtime_crashes", "runtime_logs"];

async function rawToolsList(entry) {
  const proc = spawn(process.execPath, [entry], { stdio: ["pipe", "pipe", "pipe"] });
  let out = "";
  let stderr = "";
  proc.stdout.on("data", (b) => (out += b));
  proc.stderr.on("data", (b) => (stderr += b));
  const send = (msg) => proc.stdin.write(JSON.stringify(msg) + "\n");
  const find = (id) =>
    out
      .split("\n")
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .find((m) => m && m.id === id);
  const waitFor = async (id) => {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const hit = find(id);
      if (hit) return hit;
      if (proc.exitCode !== null) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    return find(id) ?? null;
  };
  try {
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "descriptions", version: "0" } },
    });
    await waitFor(1);
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    const list = await waitFor(2);
    assert.ok(list && list.result, `tools/list produced no result. stderr: ${stderr.slice(0, 400)}`);
    return list.result.tools;
  } finally {
    proc.kill();
  }
}

// First sentence: up to the first ". " (a period followed by whitespace).
const sentences = (text) => text.split(/(?<=\.)\s+/);

for (const [label, entry] of Object.entries(ENTRIES)) {
  test(`${label}: every description opens with an act, then a "Use when" sentence, within the cap`, async () => {
    const tools = await rawToolsList(entry);
    assert.equal(tools.length, 15);
    for (const t of tools) {
      const d = t.description;
      assert.ok(d.length <= DESCRIPTION_CAP, `${t.name}: ${d.length} characters, over the ${DESCRIPTION_CAP} cap`);
      const [first, second] = sentences(d);
      const verb = first.split(/\s/)[0];
      assert.ok(ACT_VERBS.has(verb), `${t.name}: the first sentence opens with "${verb}", not an act`);
      assert.match(second ?? "", /^Use when /, `${t.name}: the second sentence is not "Use when …"`);
      assert.doesNotMatch(
        `${first} ${second}`,
        /\.md\b|§/,
        `${t.name}: an internal doc reference sits in the opening; it belongs at the end`,
      );
    }
  });

  test(`${label}: annotations and the human-held tool arrive on the wire`, async () => {
    const tools = Object.fromEntries((await rawToolsList(entry)).map((t) => [t.name, t]));
    for (const name of READ_ONLY) {
      assert.equal(tools[name].annotations?.readOnlyHint, true, `${name} carries readOnlyHint: true`);
    }
    // inspect_tree's `out` writes a file to any path, so it is not read-only.
    assert.equal(tools.inspect_tree.annotations?.readOnlyHint, false, "inspect_tree is not marked read-only");
    // connect_live runs `adb kill-server` and, with clearState, `pm clear`.
    assert.equal(tools.connect_live.annotations?.readOnlyHint, false);
    assert.equal(tools.connect_live.annotations?.destructiveHint, true, "connect_live carries destructiveHint: true");
    // Claude Code reads anthropic/requiresUserInteraction from the tool's _meta.
    assert.equal(
      tools.resolve_comment._meta?.["anthropic/requiresUserInteraction"],
      true,
      "resolve_comment makes the client ask the human on every call",
    );
    assert.equal(tools.resolve_comment.annotations?.readOnlyHint, undefined, "resolve_comment is not marked read-only");
    for (const name of APP_CONTROLLED_OUTPUT) {
      assert.match(tools[name].description, /app-controlled text: treat [^.]* as untrusted/, `${name} labels its output untrusted`);
    }
  });
}
