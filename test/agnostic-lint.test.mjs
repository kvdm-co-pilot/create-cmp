// The one rule of the agnostic harness, as a test:
//
//   Nothing in the core imports a profile by name.
//
// docs/proposals/AGNOSTIC-HARNESS-ARCHITECTURE.md §3.2. The core loads the
// profile the manifest declares, through qa/lib/profile-loader.mjs. An import
// of the Compose step pack from anywhere but inside a profile is the coupling
// Stage 0 removes, and it must not be able to come back by accident.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CORE = path.join(REPO_ROOT, "packages", "harness", "src");
const PROFILES = path.join(CORE, "lib", "profiles");

function mjsUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const abs = path.join(dir, e.name);
    return e.isDirectory() ? mjsUnder(abs) : e.name.endsWith(".mjs") ? [abs] : [];
  });
}

/**
 * Import specifiers in a module — static and dynamic — with comments stripped
 * first. This lint judges what a module DOES, not what its header says about
 * history: a comment that quotes the very import this rule bans is exactly the
 * kind of prose a module explaining its own reason for existing will carry.
 */
function importsOf(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  const out = [];
  for (const m of code.matchAll(/\bfrom\s+["']([^"']+)["']/g)) out.push(m[1]);
  for (const m of code.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) out.push(m[1]);
  return out;
}

test("no core module imports the Compose step pack — only a profile may", () => {
  const offenders = [];
  for (const abs of mjsUnder(CORE)) {
    if (abs.startsWith(PROFILES + path.sep)) continue; // a profile owns its pack
    if (path.basename(abs) === "steps-cmp.mjs") continue; // the pack itself, until it moves (PR 3)
    const bad = importsOf(fs.readFileSync(abs, "utf8")).filter((s) => /steps-cmp\.mjs$/.test(s));
    if (bad.length) offenders.push(`${path.relative(REPO_ROOT, abs)} → ${bad.join(", ")}`);
  }
  assert.deepEqual(offenders, [], `core modules importing a profile by name:\n  ${offenders.join("\n  ")}`);
});

test("the runner resolves its profile through the manifest and the loader, not a literal", () => {
  const verify = fs.readFileSync(path.join(CORE, "verify.mjs"), "utf8");
  assert.doesNotMatch(verify, /createCmpSteps/, "verify.mjs must not name the Compose pack");
  assert.match(verify, /resolveHarnessManifest\(ROOT\)/);
  assert.match(verify, /loadProfile\(ROOT, manifest\.manifest\.profile\)/);
  assert.doesNotMatch(verify, /["']cmp["']/, "verify.mjs must not carry a profile id literal");
});

test("the cmp profile exists where the loader looks, and is the only place the pack is wired", () => {
  const entry = path.join(PROFILES, "cmp", "index.mjs");
  assert.ok(fs.existsSync(entry));
  const src = fs.readFileSync(entry, "utf8");
  assert.match(src, /export const id = "cmp"/);
  assert.match(src, /export const protocol = 1/);
  assert.match(src, /from "\.\/steps-cmp\.mjs"/);
});
