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

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const ENTRY = path.join(ROOT, "bin", "server.mjs");
const OUT = path.join(ROOT, "dist", "server.mjs");
const MARKER = "cmp:bundle-inputs";

/** Every first-party source the bundle is built from, sorted — the hash inputs. */
export function sourceFiles(root = ROOT) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && p.endsWith(".mjs")) out.push(p);
    }
  };
  walk(path.join(root, "src"));
  out.push(path.join(root, "bin", "server.mjs"));
  return out.sort();
}

/**
 * Hash of the sources AND the declared dependency versions. Dependencies are in
 * the hash on purpose: a bundle built against a different SDK version is a
 * different artifact even when not one first-party byte changed.
 */
export function inputsHash(root = ROOT) {
  const h = createHash("sha256");
  for (const f of sourceFiles(root)) {
    h.update(path.relative(root, f).split(path.sep).join("/"));
    h.update("\0");
    h.update(fs.readFileSync(f));
    h.update("\0");
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  h.update(JSON.stringify(pkg.dependencies ?? {}));
  // The version is INLINED into the bundle (see build()'s `define`), so it is a
  // real input: leave it out and a version bump changes the artifact while the
  // hash still claims the artifact is current. The hash must cover everything
  // that ends up in the file, or it attests less than it appears to.
  h.update(String(pkg.version ?? ""));
  return h.digest("hex");
}

/** The `cmp:bundle-inputs` hash recorded in a built bundle, or null. */
export function recordedHash(bundlePath = OUT) {
  let text;
  try {
    text = fs.readFileSync(bundlePath, "utf8").slice(0, 4096);
  } catch {
    return null;
  }
  const m = text.match(new RegExp(`${MARKER}\\s+([0-9a-f]{64})`));
  return m ? m[1] : null;
}

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
