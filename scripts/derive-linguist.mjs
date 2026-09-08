#!/usr/bin/env node
// THE LANGUAGE TABLE IS DERIVED, NEVER HAND-WRITTEN.
//
//   node scripts/derive-linguist.mjs          # refresh packages/harness/install/linguist-languages.json
//
// PATTERN: GitHub Linguist's languages.yml is the canonical map from file
// extension to language, maintained by the people who classify every public
// repository; `enry` and GitHub's own code navigation read the same file.
// WHY IT WORKS: an extension list nobody here wrote cannot rot here, and the
// harness's own table of ten hand-picked extensions (the 2026-09-08 audit)
// becomes a check against this one instead of a rival to it. HOW IT FAILS: the
// snapshot ages, or the YAML changes shape and this extractor reads fewer
// languages than are there. WHAT WE DO: the JSON carries its source URL,
// fetch time and the sha256 of the bytes it was derived from, so a reader
// can tell how old it is and re-derive it; and a test pins that every seed
// grammar's extension is in it and that the count did not collapse.
//
// Deliberately dependency-free: the YAML is regular enough for a line reader
// — a top-level key, `type:`, and an `extensions:` list — and a YAML library
// would be the harness's first runtime dependency for a build-time task.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const SOURCE = "https://raw.githubusercontent.com/github-linguist/linguist/HEAD/lib/linguist/languages.yml";
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "packages", "harness", "install", "linguist-languages.json");

export function extractProgrammingLanguages(yaml) {
  const langs = {};
  let cur = null, type = null, exts = [], inExt = false;
  const flush = () => { if (cur && type === "programming" && exts.length) langs[cur] = exts; };
  for (const line of yaml.split("\n")) {
    const top = line.match(/^([^ #][^:]*):\s*$/);
    if (top) { flush(); cur = top[1].trim().replace(/^"|"$/g, ""); type = null; exts = []; inExt = false; continue; }
    if (!cur) continue;
    const t = line.match(/^  type:\s*(\w+)/);
    if (t) { type = t[1]; inExt = false; continue; }
    if (/^  extensions:\s*$/.test(line)) { inExt = true; continue; }
    if (inExt) {
      const e = line.match(/^  - "?(\.[^"\s]+)"?/);
      if (e) { exts.push(e[1]); continue; }
      if (!line.startsWith("  - ")) inExt = false;
    }
  }
  flush();
  return Object.fromEntries(Object.entries(langs).sort(([a], [b]) => a.localeCompare(b)));
}

async function main() {
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`${SOURCE} → HTTP ${res.status}`);
  const yaml = await res.text();
  const languages = extractProgrammingLanguages(yaml);
  const count = Object.keys(languages).length;
  if (count < 300) throw new Error(`extracted only ${count} programming languages — the YAML shape has changed; refusing to write a collapsed table`);
  const out = { source: SOURCE, fetchedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), sha256: crypto.createHash("sha256").update(yaml).digest("hex"), type: "programming", languages };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
  process.stdout.write(`${count} programming languages, ${Object.values(languages).flat().length} extensions → ${path.relative(process.cwd(), OUT)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { process.stderr.write(`${e.message}\n`); process.exit(1); });
