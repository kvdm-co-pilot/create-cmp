// template/README.md tells the adopter "Edits to the gate's own files … ask for
// your approval first", and slice 8B wrote the ask rules. The same slice put a
// NEW file in front of the gate — qa/hooks/fail-closed.sh, which the Stop hook
// now runs and which decides whether a gate that cannot answer refuses — and
// left it outside every ask rule. An agent that rewrites that launcher to
// `exit 0` ends the Stop gate without meeting the prompt the README promises.
//
// The invariant, so the next file the gate reaches is covered the day it is
// added: every file the stamped Stop hook's command names, and every module
// the gate imports (transitively, by relative path), matches an
// `Edit(...)` rule in the template's permissions.ask.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = path.join(ROOT, "template");

const globRe = (g) =>
  new RegExp(
    "^" +
      g
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, "\u0000")
        .replace(/\*/g, "[^/]*")
        .replace(/\u0000/g, ".*") +
      "$",
  );

function importClosure(rel, seen = new Set()) {
  if (seen.has(rel)) return seen;
  seen.add(rel);
  const abs = path.join(TEMPLATE, rel);
  if (!rel.endsWith(".mjs") || !fs.existsSync(abs)) return seen;
  const src = fs.readFileSync(abs, "utf8");
  for (const m of src.matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g)) {
    importClosure(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])), seen);
  }
  return seen;
}

test("every file the stamped Stop gate runs or imports matches an Edit ask rule in the template's permissions", () => {
  const settings = JSON.parse(fs.readFileSync(path.join(TEMPLATE, ".claude", "settings.json"), "utf8"));
  const ask = (settings.permissions?.ask ?? []).map((r) => /^Edit\((.+)\)$/.exec(r)?.[1]).filter(Boolean).map(globRe);
  const stop = (settings.hooks?.Stop ?? []).flatMap((g) => g.hooks ?? []).map((h) => String(h.command));
  assert.ok(stop.length, "the template registers a Stop hook");
  const named = stop.flatMap((c) => [...c.matchAll(/(qa\/[^\s"']+)/g)].map((m) => m[1]));
  assert.ok(named.length, "the Stop hook names the files it runs");
  const files = new Set();
  for (const f of named) for (const g of importClosure(f)) files.add(g);
  const open = [...files].filter((f) => !ask.some((re) => re.test(f)));
  assert.deepEqual(open, [], `${open.length} file(s) the Stop gate runs can be edited without the prompt template/README.md promises`);
});
