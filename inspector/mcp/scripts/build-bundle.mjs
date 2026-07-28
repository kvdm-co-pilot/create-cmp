// Bundle the cmp-inspector MCP server into ONE self-contained file.
//
// Why this exists: the Claude Code plugin is distributed as a git clone into
// ~/.claude/plugins/cache/…, and nothing runs `npm install` there. `inspector/mcp`
// is a separate package, so its dependencies were simply absent and the server
// died on `ERR_MODULE_NOT_FOUND` for @modelcontextprotocol/sdk — meaning
// cmp-inspector (the preview loop, the inspector, the console) never started for
// anyone who installed the plugin from the marketplace. It only ever worked from
// a repo checkout, where node_modules happens to exist.
//
// The bundle is COMMITTED, because the clone is the distribution: whatever is in
// git is what the plugin runs. A committed build artifact drifts the moment
// someone edits a source file and forgets to rebuild, so the bundle carries a
// hash of the sources it was built from (`cmp:bundle-inputs`), and
// test/bundle-freshness.test.mjs recomputes that hash and fails when they differ.
// Same idea as the verify lane's own receipt: the artifact attests its inputs.
//
// The hash — not a byte-comparison against a fresh build — is deliberate:
// esbuild's output need only be deterministic for a given version, and pinning
// the gate to byte-equality would make a routine esbuild bump look like source
// drift on someone else's machine.
//
// Usage: node scripts/build-bundle.mjs [--check]
//   (no flag) build and write dist/server.mjs
//   --check   report whether the committed bundle matches the current sources

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

// The build id's definition lives in src/lib/build-id.mjs, not here: the
// SERVICE needs it at runtime (to report which build it is running), and it
// cannot import this file without dragging esbuild into the shipped bundle.
// Re-exported below so this module's existing consumers keep their import site.
import { BUNDLE_MARKER, recordedHash, sourceFiles, sourcesHash } from "../src/lib/build-id.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const ENTRY = path.join(ROOT, "bin", "server.mjs");
const OUT = path.join(ROOT, "dist", "server.mjs");
const MARKER = BUNDLE_MARKER;

// Re-exported so scripts/tests that import them from here keep working — one
// definition (src/lib/build-id.mjs), two import sites.
export { sourceFiles, recordedHash };
/** @deprecated name kept for existing callers; `sourcesHash` is the definition. */
export const inputsHash = sourcesHash;

export async function build() {
  const hash = inputsHash();
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await esbuild.build({
    define: { __CMP_BUNDLE_VERSION__: JSON.stringify(version) },
    entryPoints: [ENTRY],
    outfile: OUT,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node18",
    // Node built-ins stay external; everything else is inlined so the file runs
    // with no node_modules anywhere near it.
    packages: "bundle",
    banner: {
      js:
        `// GENERATED — do not edit. Built by inspector/mcp/scripts/build-bundle.mjs.\n` +
        `// Edit bin/server.mjs or src/**, then: npm run build:bundle (and commit this file).\n` +
        `// ${MARKER} ${hash}\n` +
        `import { createRequire as __cmpCreateRequire } from "node:module";\n` +
        `const require = __cmpCreateRequire(import.meta.url);\n`,
    },
    logLevel: "silent",
  });
  return { out: OUT, hash, bytes: fs.statSync(OUT).size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const check = process.argv.includes("--check");
  if (check) {
    const want = inputsHash();
    const got = recordedHash();
    if (got === want) {
      console.log(`✓ dist/server.mjs is current (${want.slice(0, 12)})`);
      process.exit(0);
    }
    console.error(
      got === null
        ? `✗ dist/server.mjs is missing or carries no ${MARKER} marker — run: npm run build:bundle`
        : `✗ dist/server.mjs is stale (built from ${got.slice(0, 12)}, sources are ${want.slice(0, 12)}) — run: npm run build:bundle`,
    );
    process.exit(1);
  }
  const { out, hash, bytes } = await build();
  console.log(`✓ ${path.relative(process.cwd(), out)} — ${(bytes / 1024).toFixed(0)} kB, inputs ${hash.slice(0, 12)}`);
}
