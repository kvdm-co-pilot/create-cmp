// Review round 2 — harness/hooks-never-grant.
//
// Round 1 found `npm --tag x publish` classified as no gated act, because the
// gate's hand-kept list of value-taking npm flags lacked --tag. The fix grew the
// list to 13 entries, and round 1's test checks only the flags ON that list, so
// it cannot fail for a flag the list forgot. npm itself defines which options
// take a value — @npmcli/config's definitions, in the npm that runs the command —
// and on npm 11.16 that is 104 options (types without Boolean) plus shorthands.
// Measured 2026-09-29 with --dry-run: `npm --scope foo publish`,
// `npm --location project publish`, `npm --globalconfig /dev/null publish`,
// `npm --node-options x publish`, `npm --message m publish`,
// `npm --before 2020-01-01 publish` and `npm -reg <url> publish` all publish,
// and all classify as null.
//
// The invariant: every option npm reads a separate value for, placed in front
// of publish, still classifies as publish. Derived from npm's own definitions,
// so the gate cannot agree with itself and be wrong about npm.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { classify } from "../scripts/hooks/proof-gate.mjs";

function npmDefinitions() {
  const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
  const file = path.join(globalRoot, "npm", "node_modules", "@npmcli", "config", "lib", "definitions", "index.js");
  assert.ok(fs.existsSync(file), `npm's own option definitions are where the value-taking flags are declared; not found at ${file}`);
  return createRequire(import.meta.url)(file);
}

test("every option npm reads a separate value for, in front of publish, is still classified publish", () => {
  const { definitions, shorthands = {} } = npmDefinitions();
  // Only types with no Boolean in them: nopt ALWAYS consumes the next word for
  // these, so this set under-claims (e.g. `--color always publish` also publishes).
  const valued = Object.entries(definitions)
    .filter(([, d]) => ![].concat(d.type).includes(Boolean))
    .map(([k]) => k);
  const shorts = Object.entries(shorthands)
    .filter(([, exp]) => exp.length === 1 && valued.includes(String(exp[0]).replace(/^--/, "")))
    .map(([s]) => `-${s}`);
  assert.ok(valued.length > 50, `read only ${valued.length} value-taking npm options — the definitions did not load as expected`);
  const spellings = [...valued.map((k) => `npm --${k} v publish`), ...shorts.map((s) => `npm ${s} v publish`)];
  const missed = spellings.filter((c) => classify(c) !== "publish");
  assert.deepEqual(missed, [], `${missed.length} of ${spellings.length} spellings npm runs as publish walk past the gate as no gated act at all`);
});
