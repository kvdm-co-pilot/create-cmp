// THE SIX LANGUAGE GAPS, CLOSED BY THEIR PATTERNS — pinned.
//
// The 2026-09-08 language audit found the core speaking Kotlin in places a stack
// fact had no declaration to live in. Each fix borrowed an industry pattern and
// wrote its failure mode next to it (NORTH-STAR §6's table). These tests hold the
// mechanics; the grammar half lives in test/citation-grammar.test.mjs, the report
// half in test/determinism.test.mjs, the lint in test/agnostic-lint.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { detect, grammar, reports, layout } from "../packages/harness/src/lib/profiles/cmp/declarations.mjs";
import { copy as cmpCopy } from "../packages/harness/src/lib/profiles/cmp/console-copy.mjs";
import { NEUTRAL_COPY, setConsoleCopy, consoleCopy } from "../packages/harness/src/console/console-tabs.mjs";
import { declaredIgnore, gitignoredDirs } from "../packages/receipts/src/inputs-hash.mjs";
import { LANGUAGE_GRAMMARS, detectLanguage, profileClaims } from "../src/commands/harness-init.mjs";
import { extractProgrammingLanguages } from "../scripts/derive-linguist.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LINGUIST = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/linguist-languages.json"), "utf8"));
const tmp = (n) => fs.mkdtempSync(path.join(os.tmpdir(), `${n}-`));
const touch = (root, rel) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), ""); };

test("detect (buildpack-style): cmp claims a tree only with BOTH markers, and returns its evidence", () => {
  const empty = tmp("detect");
  assert.equal(detect(empty, fs).claims, false, "nothing there");
  touch(empty, "settings.gradle.kts");
  const one = detect(empty, fs);
  assert.equal(one.claims, false, "a Gradle repo is not a Compose app — an eager detect is the failure mode this guards");
  assert.deepEqual(one.evidence, ["settings.gradle(.kts)"]);
  touch(empty, "composeApp/build.gradle.kts");
  const both = detect(empty, fs);
  assert.equal(both.claims, true);
  assert.equal(both.evidence.length, 2, "evidence, never a bare boolean");
  assert.deepEqual(profileClaims(empty).map((c) => c.id), ["cmp"], "harness init asks the profiles first");
  assert.deepEqual(profileClaims(tmp("none")), [], "and an unclaimed tree gets the seed path");
});

test("the language table is DERIVED: Linguist with provenance, the seed grammars keyed by its names, and the extractor is honest about collapse", () => {
  assert.match(LINGUIST.source, /github-linguist\/linguist/);
  assert.match(LINGUIST.fetchedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(LINGUIST.sha256, /^[0-9a-f]{64}$/);
  assert.ok(Object.keys(LINGUIST.languages).length >= 300, "a collapsed table would be refused by the generator");
  for (const name of Object.keys(LANGUAGE_GRAMMARS)) assert.ok(LINGUIST.languages[name], `seed grammar "${name}" must be a Linguist language name`);
  assert.deepEqual(LINGUIST.languages.Kotlin, [".kt", ".ktm", ".kts"]);
  // The extractor reads the shape it was written for, and only that.
  const langs = extractProgrammingLanguages('Foo:\n  type: programming\n  extensions:\n  - ".foo"\n  - ".fo"\nBar:\n  type: data\n  extensions:\n  - ".bar"\n');
  assert.deepEqual(langs, { Foo: [".foo", ".fo"] });
});

test("detectLanguage names the language, by Linguist's extension map, from what is actually in the roots", () => {
  const root = tmp("lang");
  touch(root, "src/a.kt"); touch(root, "src/b.kt"); touch(root, "src/c.py");
  assert.equal(detectLanguage(root, ["src"]), "Kotlin");
  assert.equal(detectLanguage(tmp("nolang"), ["src"]), null, "nothing recognisable is null, never a guess");
});

test("ignore sets: the floor is universal, the rest is declared — and the declaration is read from the project's surface file", () => {
  const src = fs.readFileSync(path.join(ROOT, "packages/receipts/src/inputs-hash.mjs"), "utf8");
  assert.match(src, /const WALK_FLOOR = new Set\(\["\.git", "node_modules"\]\);/, "no stack names in the floor");
  assert.doesNotMatch(src.replace(/\/\/.*/g, ""), /"\.gradle"|"\.kotlin"|"\.idea"/, "the stack's directories left the core");
  assert.deepEqual([...layout.ignore], [".gradle", ".kotlin", ".idea"], "and arrived in the profile");
  const root = tmp("ignore");
  assert.deepEqual([...declaredIgnore(root)], [], "no surface file, nothing declared");
  fs.mkdirSync(path.join(root, "qa"), { recursive: true });
  fs.writeFileSync(path.join(root, "qa/verified-surface.json"), JSON.stringify({ surface: ["src"], ignore: ["./build/", "target", "../escape", 7] }));
  assert.deepEqual([...declaredIgnore(root)].sort(), ["build", "target"], "normalised, and a path that escapes the root is dropped");
  fs.writeFileSync(path.join(root, ".gitignore"), "build/\n.venv\n# comment\n");
  assert.ok(gitignoredDirs(root).has(".venv"), "the repo's own .gitignore is the truth beneath it");
});

test("the console's words are the profile's: the shell's defaults carry no Compose word, cmp's copy supplies them, and the host's setter merges", () => {
  const compose = /Kotlin|Compose|\.kt\b|KSP|Gradle|libs\.versions/;
  for (const [k, v] of Object.entries(NEUTRAL_COPY)) assert.doesNotMatch(v, compose, `NEUTRAL_COPY.${k}`);
  assert.match(cmpCopy.componentsEmpty, /@Composable/);
  for (const k of Object.keys(NEUTRAL_COPY)) assert.ok(k in cmpCopy, `cmp copy covers ${k} — a missing key is the pattern's failure mode`);
  setConsoleCopy({ usesIn: "here" });
  try {
    assert.equal(consoleCopy().usesIn, "here");
    assert.equal(consoleCopy().componentsEmpty, NEUTRAL_COPY.componentsEmpty, "unset keys keep the neutral default");
  } finally {
    setConsoleCopy(null);
  }
});

test("cmp declares what the core used to assume: a grammar for both of its citation dialects, and its report format", () => {
  assert.ok(grammar.citationMarker.test("// SPEC: HOME-01"), "Kotlin sources");
  assert.ok(grammar.citationMarker.test("# SPEC: HOME-01"), "Maestro YAML journeys");
  assert.ok(grammar.testDeclaration.test("@Test"));
  assert.equal(reports.format, "junit-xml");
});
