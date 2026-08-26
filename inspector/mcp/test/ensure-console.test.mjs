// ensureConsole (walk-legibility L6): the console is a RESIDENT — adopt the
// one already serving the project, else spawn the standalone launcher
// detached; fail open on everything. Pure-seam tests: probe + spawnImpl
// injected, no real console, no real spawn.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureConsole, consoleLauncherPath, consoleRegistryPath } from "../src/lib/preview-service.mjs";

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cmp-ensure-"));
}
function writeRecord(dir, rec) {
  fs.writeFileSync(consoleRegistryPath(dir), `${JSON.stringify(rec)}\n`);
}
function cleanup(dir) {
  fs.rmSync(consoleRegistryPath(dir), { force: true });
  fs.rmSync(dir, { recursive: true, force: true });
}

test("adopts a live console without spawning anything", async () => {
  const dir = tmpProject();
  try {
    writeRecord(dir, { pid: process.pid, port: 9611, url: "http://127.0.0.1:9611/", startedAt: "now" });
    const spawnImpl = () => {
      throw new Error("must not spawn when a live console exists");
    };
    const c = await ensureConsole(dir, { spawnImpl, probe: async () => true });
    assert.equal(c.started, false, "adoption, not a second console");
    assert.equal(c.url, "http://127.0.0.1:9611/");
  } finally {
    cleanup(dir);
  }
});

test("spawns the launcher detached when nothing serves the project, and adopts the result", async () => {
  const dir = tmpProject();
  try {
    let spawned = null;
    let unrefd = false;
    const spawnImpl = (cmd, args, opts) => {
      spawned = { cmd, args, opts };
      // The "console" comes up: it writes its registry record, as the real one does.
      writeRecord(dir, { pid: process.pid, port: 9612, url: "http://127.0.0.1:9612/", startedAt: "now" });
      return { pid: 4242, unref: () => { unrefd = true; } };
    };
    const c = await ensureConsole(dir, { spawnImpl, probe: async () => true, pollMs: 10, waitMs: 2000 });
    assert.equal(c.started, true, "this call started the resident");
    assert.equal(c.url, "http://127.0.0.1:9612/");
    assert.equal(spawned.opts.detached, true, "detached — survives the MCP respawn class");
    assert.deepEqual(spawned.opts.stdio, "ignore");
    assert.ok(unrefd, "unref'd — never keeps this process alive");
    assert.ok(spawned.args.some((a) => a.endsWith("console.mjs")), "the standalone launcher is what runs");
    assert.ok(spawned.args.includes(path.resolve(dir)), "the project dir rides as the positional arg");
  } finally {
    cleanup(dir);
  }
});

test("fail-open: a spawned console that never answers yields null, not a throw", async () => {
  const dir = tmpProject();
  try {
    const c = await ensureConsole(dir, {
      launcher: "/nonexistent/console.mjs",
      spawnImpl: () => ({ pid: 1, unref() {} }),
      probe: async () => false,
      pollMs: 10,
      waitMs: 50,
    });
    assert.equal(c, null);
  } finally {
    cleanup(dir);
  }
});

test("the launcher resolves beside this build (repo layout)", () => {
  const p = consoleLauncherPath();
  assert.ok(p && p.endsWith(path.join("bin", "console.mjs")), `launcher found: ${p}`);
  assert.ok(fs.existsSync(p));
});
