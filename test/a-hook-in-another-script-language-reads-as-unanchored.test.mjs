// A HOOK IN ANOTHER SCRIPT LANGUAGE READ CLEAN (KD-86).
//
// `unanchoredPaths` recognised a script path only by `.mjs/.cjs/.js/.sh`, so an
// adopter's hook written `python3 qa/report.py` — exactly as cwd-relative as
// `node qa/walk-status.mjs`, and exactly as broken one directory down — was
// credited by `doctor` as anchored. Every common interpreter's extension is a
// script path now; the anchored form still reads clean, and `settings.json` and a
// single-segment name still do not match.

import assert from "node:assert/strict";
import test from "node:test";
import { unanchoredPaths, PROJECT_DIR_ANCHOR } from "../src/lib/hooks.mjs";

const LANGS = [
  ["python3", "qa/report.py"],
  ["ruby", "qa/report.rb"],
  ["perl", "qa/report.pl"],
  ["npx tsx", "qa/report.ts"],
  ["npx tsx", "qa/report.mts"],
  ["bash", "qa/report.bash"],
  ["zsh", "qa/report.zsh"],
  ["kotlin", "qa/report.main.kts"],
];

for (const [interp, rel] of LANGS) {
  test(`\`${interp} ${rel}\` is reported unanchored, and its anchored form is clean`, () => {
    assert.deepEqual(unanchoredPaths(`${interp} ${rel}`), [rel]);
    assert.deepEqual(unanchoredPaths(`${interp} "${PROJECT_DIR_ANCHOR}/${rel}"`), []);
  });
}

test("a settings file and a single-segment name are still not script paths", () => {
  assert.deepEqual(unanchoredPaths("cat .claude/settings.json && python3 report.py"), []);
});
