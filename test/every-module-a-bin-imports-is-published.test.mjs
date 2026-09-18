// A DOCUMENTED COMMAND THAT CANNOT RUN FOR ANYONE WHO INSTALLED THE DOCUMENTED WAY.
//
// `create-cmp harness init|relock|upgrade` imported `../packages/harness/install/*.mjs`,
// and the root manifest's `files` array shipped `packages/harness/src` but never
// `packages/harness/install`. From a registry install every one of them died with a
// raw Node stack trace:
//
//     $ npx create-cmp harness init ./app
//     Fatal: Error [ERR_MODULE_NOT_FOUND]: Cannot find module
//       '.../packages/harness/install/init.mjs' imported from '.../bin/create-cmp.mjs'
//
// It shipped in 0.24.0 (`e841cce`, 2026-09-08) and `git log -L` over `files` shows
// `install/` was never in it, so every published version from then to 0.26.4 carried
// it — advertised the whole time in `--help`. Reproduced from an extracted tarball,
// not inferred from the file list.
//
// WHY THIS CHECK READS THE MANIFEST AND NOT A TARBALL. `npm pack` is the ground truth
// and it is also seconds of tar and gzip per run, in a suite that already refuses to
// be slow. The cheap half is exact: what a bin IMPORTS is in the source, and what npm
// SHIPS is `files`, and the defect is entirely a disagreement between those two lists.
// A packing test would catch the same thing later and cost every contributor the time.
//
// It deliberately does not police `node_modules` resolution — a bare specifier is a
// dependency and npm's own install handles it. Only relative imports, which npm will
// ship or not ship depending on this one array, are its business.
//
// AND IT ONLY COUNTS A SPECIFIER THAT RESOLVES TO A FILE ON DISK. These installers
// WRITE source into an adopter's tree, so their template literals contain import
// statements addressed to the adopter's layout, not to this one — `init.mjs` holds a
// literal `import … from "../../harness-lock.mjs"` that belongs to a file it generates
// three directories away. Textually those are indistinguishable from its own imports;
// what separates them is that a real import resolves HERE. A specifier that resolves
// to nothing in this tree is either generated text or an import already broken in
// development, and neither is what this check is about.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Relative specifiers a file imports, static or dynamic, resolved to repo-relative paths. */
export function relativeImports(file, root = ROOT) {
  const text = fs.readFileSync(file, "utf8");
  const dir = path.dirname(file);
  const out = new Set();
  for (const [, spec] of text.matchAll(/(?:from|import)\s*\(?\s*["']((?:\.\.?)\/[^"']+)["']/g)) {
    const abs = path.resolve(dir, spec);
    // Generated text, or an import dev would already have caught. Either way, not ours.
    if (!fs.existsSync(abs)) continue;
    out.add(path.relative(root, abs));
  }
  return [...out];
}

/** True when `files` would ship this repo-relative path. A directory entry ships its subtree. */
export function shippedBy(files, relPath) {
  for (const raw of files) {
    if (raw.startsWith("!")) continue;
    const entry = raw.replace(/\/+$/, "");
    if (relPath === entry || relPath.startsWith(`${entry}/`)) return true;
  }
  return false;
}

test("every relative module a published bin imports is inside the published files", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const files = manifest.files ?? [];
  assert.ok(files.length > 0, "the root manifest declares no `files` — this check would pass vacuously");

  const bins = Object.values(manifest.bin ?? {}).map((p) => path.resolve(ROOT, p));
  assert.ok(bins.length > 0, "the root manifest declares no `bin` — this check would pass vacuously");
  // A bin pointing at a path that does not exist makes the walk visit nothing and pass,
  // past both guards above — vacuity arriving through the entry point rather than the list.
  for (const b of bins) {
    assert.ok(fs.existsSync(b), `the manifest declares a bin at ${path.relative(ROOT, b)}, which does not exist`);
  }

  // A bin's imports, and the imports of anything it pulls in that this manifest also ships.
  const seen = new Set();
  const queue = [...bins];
  const missing = [];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file) || !fs.existsSync(file)) continue;
    seen.add(file);
    for (const rel of relativeImports(file)) {
      if (!shippedBy(files, rel)) {
        missing.push(`${path.relative(ROOT, file)} imports ${rel}, which \`files\` does not ship`);
        continue;
      }
      queue.push(path.resolve(ROOT, rel));
    }
  }

  assert.deepEqual(
    missing,
    [],
    `${missing.length} module(s) a bin imports would be absent from the published package:\n  ${missing.join("\n  ")}\n\n` +
      "Add the path to `files`, or stop importing it from a bin. A command that resolves in this tree " +
      "and not from npm fails with a raw ERR_MODULE_NOT_FOUND stack trace, which is the one shape an " +
      "adopter cannot act on (0.24.0 through 0.26.4 shipped `create-cmp harness init` this way).",
  );
});

test("the check finds a bin importing something files does not ship", () => {
  // The exact shape that shipped: a directory sibling to one that IS shipped.
  assert.equal(shippedBy(["bin", "src", "packages/harness/src"], "packages/harness/install/init.mjs"), false);
  assert.equal(shippedBy(["bin", "src", "packages/harness/install"], "packages/harness/install/init.mjs"), true);
  // A directory entry ships its subtree, and a negation is not a grant.
  assert.equal(shippedBy(["template"], "template/qa/verify.mjs"), true);
  assert.equal(shippedBy(["!template/.gradle"], "template/.gradle/x"), false);
  // A prefix that is not a path boundary is not a match.
  assert.equal(shippedBy(["src"], "srcx/a.mjs"), false);
});

test("a specifier that resolves to nothing is not counted as an import", () => {
  // The real shape: packages/harness/install/init.mjs carries `import … from
  // "../../harness-lock.mjs"` inside a template literal it writes into an adopter's
  // tree. It resolves to packages/harness-lock.mjs, which does not exist here.
  const init = path.join(ROOT, "packages", "harness", "install", "init.mjs");
  const imports = relativeImports(init);
  assert.ok(
    !imports.some((p) => p.endsWith("harness-lock.mjs") && !fs.existsSync(path.join(ROOT, p))),
    "a generated-code specifier was counted as one of this file's own imports",
  );
  // And the ones that ARE real are still seen.
  assert.ok(imports.some((p) => p.startsWith("packages/harness/src/lib/")), "real sibling imports must still be found");
});
