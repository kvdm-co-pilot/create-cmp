// The declared Node floor is a promise, and promises need a gate.
//
// package.json says `engines: ">=20.19.0"` and the CI matrix tests 20, 22, 24. But
// nothing checked that the code we ship actually RUNS on the floor — so
// `import.meta.dirname` (Node 20.11+) reached scripts/check-plugin-sync.mjs
// while the floor was 18, which meant the plugin-drift detector was dead on
// load for every Node 18 user, and its test file took the whole Node 18 lane red. That red sat on
// main across two releases, read as background noise rather than as the
// finding it was.
//
// This test is the cheap structural version of "does it run on the floor":
// a scan for the specific APIs that postdate it. It cannot replace running
// the suite on the floor (CI does that) — it just makes the next violation fail
// on every developer's machine, in the same second they write it.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { listFiles } from "../src/lib/fsutil.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** APIs newer than the engines floor, with the version that introduced them. */
// The floor moved to 20.19 on 2026-09-04 (Stage 0 PR 4: sync `require()` of an
// ES module, which is 20.19 / 22.12). Node 18 and 20.18 were end-of-life. The
// 20.11 entries above that point are gone; these are the 22.x APIs a 24-era
// developer reaches for that a 20.19 user does not have.
const TOO_NEW = [
  { pattern: /\bfs\.globSync\b|\bfsPromises\.glob\b|\bfs\.promises\.glob\b/, since: "22.0", use: "a readdirSync walk (listFiles / walkFiles)" },
  { pattern: /\bPromise\.withResolvers\b/, since: "22.0", use: "new Promise((resolve, reject) => …)" },
  { pattern: /\bArray\.fromAsync\b/, since: "22.0", use: "a for await loop into an array" },
  { pattern: /\bprocess\.getBuiltinModule\b/, since: "22.3", use: "createRequire(import.meta.url)" },
];

const SCAN_DIRS = ["src", "scripts", "test", "packages", "inspector", "template"];
const SKIP = /(^|\/)(node_modules|dist|build|\.git|golden)(\/|$)/;

function shippedFiles() {
  const out = [];
  for (const dir of SCAN_DIRS) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const file of listFiles(abs)) {
      const rel = path.relative(ROOT, file).split(path.sep).join("/");
      if (SKIP.test(rel) || !file.endsWith(".mjs")) continue;
      out.push(rel);
    }
  }
  return out;
}

test("the engines floor is 20.19 — if it moves, this test's premise moves with it", () => {
  const engines = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).engines;
  assert.equal(
    engines.node,
    ">=20.19.0",
    "the declared Node floor changed — revisit TOO_NEW below (and the CI matrix) before relaxing it"
  );
});

test("no shipped .mjs uses an API newer than the declared Node floor", () => {
  const violations = [];
  for (const rel of shippedFiles()) {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    for (const { pattern, since, use } of TOO_NEW) {
      // Ignore prose: a line that is only a comment may NAME the API to explain
      // why it is avoided — that is documentation, not a call.
      for (const line of src.split("\n")) {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
        if (pattern.test(line)) {
          violations.push(`${rel}: ${pattern.source} is Node ${since}+ — use ${use}`);
          break;
        }
      }
    }
  }
  assert.deepEqual(violations, [], `\n  ${violations.join("\n  ")}\n`);
});

test("the scan actually reaches the files it claims to cover", () => {
  const files = shippedFiles();
  assert.ok(files.length > 100, `scan found only ${files.length} files — the walk is broken, not the code clean`);
  assert.ok(files.includes("scripts/check-plugin-sync.mjs"), "the file that motivated this gate is not scanned");
  assert.ok(files.some((f) => f.startsWith("src/")), "src/ not scanned");
  assert.ok(files.some((f) => f.startsWith("packages/")), "packages/ not scanned");
});
