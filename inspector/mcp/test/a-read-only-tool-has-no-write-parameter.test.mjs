// A tool that says `readOnlyHint: true` on the wire tells the client "this does not modify its
// environment" (MCP spec, ToolAnnotations) — the hint a client may use to skip a prompt. A tool
// that accepts a parameter which writes a file (inspect_tree's `out`: "also write the SVG to
// this path", mkdir -p + writeFileSync to any path the model names) is not read-only, whatever
// its main job is.
//
// Invariant: no tool listed with readOnlyHint: true declares an input whose own description
// says it writes — read from the raw tools/list of both the source and the shipped bundle.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENTRIES = { source: path.join(HERE, "..", "bin", "server.mjs"), bundle: path.join(HERE, "..", "dist", "server.mjs") };

async function toolsList(entry) {
  const proc = spawn(process.execPath, [entry], { stdio: ["pipe", "pipe", "pipe"] });
  let out = "";
  proc.stdout.on("data", (b) => (out += b));
  const send = (m) => proc.stdin.write(`${JSON.stringify(m)}\n`);
  const find = (id) => out.split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } }).find((m) => m?.id === id);
  const wait = async (id) => {
    for (const end = Date.now() + 20_000; Date.now() < end && proc.exitCode === null; ) {
      if (find(id)) return find(id);
      await new Promise((r) => setTimeout(r, 50));
    }
    return find(id);
  };
  try {
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "ro", version: "0" } } });
    await wait(1);
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    return (await wait(2)).result.tools;
  } finally {
    proc.kill();
  }
}

const WRITES = /\b(writes?|written|saves?|overwrites?)\b/i;

for (const [label, entry] of Object.entries(ENTRIES)) {
  test(`${label}: a tool marked readOnlyHint declares no parameter that writes`, async () => {
    const offenders = [];
    for (const t of await toolsList(entry)) {
      if (t.annotations?.readOnlyHint !== true) continue;
      for (const [param, schema] of Object.entries(t.inputSchema?.properties ?? {})) {
        if (WRITES.test(schema?.description ?? "")) offenders.push(`${t.name}.${param}: "${schema.description}"`);
      }
    }
    assert.deepEqual(offenders, [], `marked read-only on the wire, and writes:\n  ${offenders.join("\n  ")}`);
  });
}
