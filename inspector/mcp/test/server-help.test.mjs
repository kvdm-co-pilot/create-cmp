// `cmp-inspector-mcp --help` STARTED THE SERVER AND PRINTED NOTHING (KD-188).
//
// Any argument at all started the stdio MCP server: `--help` exited 0 with zero
// bytes on stdout once stdin closed, and until then looked hung. An MCP client
// never passes an argument; a person does, and `--help` is the one they pass.
//
// The control keeps the fix honest in the other direction: with no argument the
// bin is still the server — it announces itself on stderr (stdout is the
// protocol channel) and exits when stdin closes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = path.join(HERE, "..", "bin", "server.mjs");

/** Run the bin from a directory that is not an app, stdin closed at once, bounded. */
function run(args) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "inspector-help-"));
  try {
    const r = spawnSync(process.execPath, [SERVER_ENTRY, ...args], { cwd, input: "", encoding: "utf8", timeout: 30_000 });
    return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", error: r.error?.code ?? null };
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

for (const flag of ["--help", "-h"]) {
  test(`${flag} says what the bin is on stdout and exits 0, without starting the server`, () => {
    const r = run([flag]);
    assert.equal(r.error, null, `the bin did not finish: ${r.error}`);
    assert.equal(r.status, 0, `exit ${r.status}:\n${r.stderr}`);
    assert.match(r.stdout, /^cmp-inspector-mcp \S+ — the cmp-inspector MCP server\n/, `stdout:\n${r.stdout}`);
    assert.match(r.stdout, /--help, -h/);
    assert.doesNotMatch(r.stderr, /running on stdio/, `${flag} started the server anyway:\n${r.stderr}`);
  });
}

test("the control: with no argument the bin is still the stdio server", () => {
  const r = run([]);
  assert.equal(r.error, null, `the server did not exit when stdin closed: ${r.error}`);
  assert.match(r.stderr, /cmp-inspector MCP server running on stdio/, `stderr:\n${r.stderr}`);
  assert.equal(r.stdout, "", "the server wrote to the protocol channel with no client on it");
});
