// The drift gate on create-cmp's own claims about itself.
//
// This project's whole thesis is that a claim about a tree must be DERIVED
// from that tree, and that the delta between claim and tree is drift. Its own
// public surfaces were the counterexample: "8 gates" survived three profile
// changes (the lane is 16 steps at `local` today), "9 skills" survived
// cmp-audit shipping, and docs/USAGE.md said "26 tools" in two places and
// "15 tools" in a third — inside one file.
//
// Prose cannot be trusted to count. So no human maintains these numbers:
// scripts/ground-truth.mjs derives them, and this test refuses any public
// surface that contradicts it. Adding a skill, a tool, or a lane step now
// fails here until the prose is corrected — which is the entire point.
//
// Scope note: this gates COUNTS, not claims in general. A sentence can still
// be wrong in ways arithmetic cannot see; docs/research honesty scans and
// test/discovery-surfaces.test.mjs cover different ground.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { groundTruth } from "../scripts/ground-truth.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const GT = groundTruth();

/** The surfaces a stranger or an agent reads to decide what this thing is. */
const PUBLIC_SURFACES = ["README.md", "llms.txt", "docs/USAGE.md"];

/** Spelled-out numbers appear in prose as often as digits ("nine skills"). */
const WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};
const toNumber = (raw) => (/^\d+$/.test(raw) ? Number(raw) : WORDS[raw.toLowerCase()]);

/**
 * Find every "<n> <noun>" claim, in the two forms real copy uses:
 *   - space + PLURAL  — "10 skills", "nine skills"
 *   - hyphen + either — "an 8-gate verify lane" (the adjective form launch copy favours)
 *
 * Space + singular is deliberately NOT a claim: "One command gives you a
 * working app" counts nothing, and treating it as arithmetic produced a false
 * positive on the README's opening line.
 */
function claims(text, { plural, singular }) {
  const alternation = `\\d+|${Object.keys(WORDS).join("|")}`;
  const patterns = [
    new RegExp(`\\b(${alternation}) ${plural}\\b`, "gi"),
    new RegExp(`\\b(${alternation})-(?:${plural}|${singular})\\b`, "gi"),
  ];
  return patterns
    .flatMap((p) => [...text.matchAll(p)])
    .map((m) => ({ raw: m[1], value: toNumber(m[1]), text: m[0] }))
    .filter((c) => Number.isFinite(c.value));
}

function assertClaims({ noun, allowed, describe }) {
  const allowedSet = new Set(allowed);
  for (const surface of PUBLIC_SURFACES) {
    const text = read(surface);
    for (const claim of claims(text, noun)) {
      assert.ok(
        allowedSet.has(claim.value),
        `${surface} claims "${claim.text}" but ${describe}. ` +
          `Run \`node scripts/ground-truth.mjs\` and correct the prose.`,
      );
    }
  }
}

test("no public surface misstates the skill count", () => {
  assertClaims({
    noun: { plural: "skills", singular: "skill" },
    allowed: [GT.skills.count],
    describe: `the plugin ships ${GT.skills.count} (${GT.skills.declared.join(", ")})`,
  });
});

test("no public surface misstates the MCP tool count", () => {
  assertClaims({
    noun: { plural: "tools", singular: "tool" },
    allowed: [GT.mcpTools.count],
    describe: `cmp-inspector registers ${GT.mcpTools.count}`,
  });
});

test("no public surface misstates the CLI command count", () => {
  assertClaims({
    noun: { plural: "commands", singular: "command" },
    allowed: [GT.cliCommands.count],
    describe: `the CLI has ${GT.cliCommands.count} (${GT.cliCommands.names.join(", ")})`,
  });
});

test("no public surface misstates the verify lane's size", () => {
  // A gate count is honest only if it names a profile that actually exists —
  // the lane is 9/16/17/19 by profile, so a bare "8 gates" is now false for
  // every one of them.
  const byProfile = Object.entries(GT.verifyProfiles).map(([name, p]) => `${name}=${p.count}`);
  assertClaims({
    noun: { plural: "gates", singular: "gate" },
    allowed: Object.values(GT.verifyProfiles).map((p) => p.count),
    describe: `the lane's real sizes are ${byProfile.join(", ")}`,
  });
});

test("the plugin's declared skills match the skills on disk", () => {
  assert.ok(
    GT.skills.inSync,
    `plugin.json declares [${GT.skills.declared.join(", ")}] but skills/ holds ` +
      `[${GT.skills.onDisk.join(", ")}] — a skill on disk but undeclared never loads.`,
  );
});

test("the version spine moves in lockstep", () => {
  // The CLI, the plugin, and the plugin's marketplace entry are ONE release —
  // this repo IS the plugin source, so a split here ships a plugin that
  // misreports the engine it wraps.
  //
  // `prooflane-harness` is deliberately NOT in this spine. It is "versioned
  // independently of the engine that stamped this" (template/CLAUDE.md) so a
  // project can upgrade its lane without upgrading its generator. It happens
  // to read 0.14.0 today; that is a coincidence, not an invariant, and
  // asserting it would break the first deliberate divergence. `prooflane-receipts`
  // and the inspector MCP are independent for the same reason.
  const { cli, plugin, marketplace } = GT.versions;
  assert.deepEqual(
    { plugin, marketplace },
    { plugin: cli, marketplace: cli },
    `version spine split: cli=${cli} plugin=${plugin} marketplace=${marketplace}`,
  );
});

test("every independently-versioned package still declares a version", () => {
  // The looser invariant that replaces lockstep for the independent packages:
  // they may drift from the CLI, but none may be missing or malformed, since
  // the harness lock and the receipt both record the harness version by name.
  for (const key of ["harness", "receipts", "inspectorMcp"]) {
    assert.match(
      GT.versions[key],
      /^\d+\.\d+\.\d+/,
      `${key} has no usable semver version (${GT.versions[key]})`,
    );
  }
});
