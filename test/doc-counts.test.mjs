// The drift gate on create-cmp's own claims about itself.
//
// This project's whole thesis is that a claim about a tree must be DERIVED
// from that tree, and that the delta between claim and tree is drift. Its own
// public surfaces were the counterexample: "8 gates" survived three profile
// changes (the lane is profile-tiered, and no profile runs 8 steps today),
// "9 skills" survived cmp-audit shipping, and docs/USAGE.md said "26 tools" in
// two places and "15 tools" in a third — inside one file.
//
// Prose cannot be trusted to count. So no human maintains these numbers:
// scripts/ground-truth.mjs derives them, and this test refuses any public
// surface that contradicts it. Adding a skill, a tool, or a lane step now
// fails here until the prose is corrected — which is the entire point.
//
// Scope note: this gates COUNTS, not claims in general. A sentence can still
// be wrong in ways arithmetic cannot see; docs/research honesty scans and
// test/discovery-surfaces.test.mjs cover different ground.
//
// WHAT THE SURFACE LIST COST, measured 2026-09-18. For months this list was
// three markdown files, and the split it produced was total: every surface ON
// it stated the right number, and EVERY count-stating surface off it was
// stale — `.claude-plugin/plugin.json` and the marketplace entry at "Eleven
// skills", the repo's own `AGENTS.md` and `docs/DOCUMENTATION.md` at "10
// skills", and three published alias READMEs at "10 skills". The gate was
// never wrong about what it read; it read three of ten surfaces. The two
// plugin manifests are the sharpest case: the same `plugin.json` was already
// read here for its `skills` LIST (the inSync test below) and never for its
// own PROSE, and that prose is what an agent or a human reads BEFORE the
// install, before this repo is ever fetched.
//
// So the list is derived where the category is closed — every file in
// `.claude-plugin/` is pre-install manifest text, and every `README.md` under
// `packages/` is a published npm front door — and named only where it is not.
// It is deliberately NOT the whole tree: `docs/proposals/`, `docs/adr/`,
// `docs/research/`, `docs/history/`, `docs/HARNESS-PLAN.md` (superseded by its
// own header) and this suite's own comments all legitimately carry counts of
// PAST trees, and so does `inspector/mcp/README.md`, whose "15+ of the 28
// tools had ZERO calls" is a true record of the pre-consolidation surface
// under a heading that says so. A count that records a past tree is not
// drift, and a scanner that cannot tell the difference deletes honest prose.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { groundTruth } from "../scripts/ground-truth.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const GT = groundTruth();

const entries = (rel) => {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? fs.readdirSync(abs, { withFileTypes: true }) : [];
};

/**
 * Every pre-install manifest. A closed category: `.claude-plugin/` holds
 * nothing else, and its whole content is text Claude Code shows a stranger
 * before anything is installed. Globbed rather than named so the next manifest
 * cannot escape the way these two did.
 */
const PLUGIN_MANIFESTS = entries(".claude-plugin")
  .filter((e) => e.isFile() && e.name.endsWith(".json"))
  .map((e) => `.claude-plugin/${e.name}`)
  .sort();

/**
 * Every published package front door — the text npmjs.com renders for a
 * stranger who has installed nothing. Also a closed category: every directory
 * under `packages/` and `packages/aliases/` that carries a README is a
 * published name (`node scripts/ground-truth.mjs` lists them), so this needs
 * no exception list.
 */
const PACKAGE_READMES = ["packages", "packages/aliases"]
  .flatMap((parent) =>
    entries(parent)
      .filter((e) => e.isDirectory())
      .map((e) => `${parent}/${e.name}/README.md`),
  )
  .filter((rel) => fs.existsSync(path.join(ROOT, rel)))
  .sort();

/** The surfaces a stranger or an agent reads to decide what this thing is. */
const PUBLIC_SURFACES = [
  "README.md",
  "llms.txt",
  "AGENTS.md",
  "docs/USAGE.md",
  "docs/DOCUMENTATION.md",
  ...PLUGIN_MANIFESTS,
  ...PACKAGE_READMES,
];

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

/** The claims in one surface's text that ground truth contradicts. */
function drift(text, noun, allowed) {
  const allowedSet = new Set(allowed);
  return claims(text, noun).filter((c) => !allowedSet.has(c.value));
}

/**
 * The lane's size, in the two forms the docs actually write it — a profile
 * table row and the prose that cites it:
 *
 *     | `local` | 16 |          docs/USAGE.md §3's profile table
 *     16 steps at `local`       the prose that cites the table
 *     19 at `release`           the same, with "steps" elided
 *
 * THE `gates` NOUN ABOVE CANNOT SEE ANY OF IT, and that is not an accident of
 * phrasing: §3 opens by explaining that *"how many steps run depends on
 * `--profile`, so 'N gates' is never a fixed number"* — the doc correctly
 * stopped saying "N gates", which is the one phrase the gate reads, and then
 * every number behind it rotted. Measured 2026-09-18 across every surface on
 * the list: EIGHT profile-bound claims, eight of them wrong, none right. One
 * step was added to the shared spine; five of §3's six rows were left an
 * off-by-one, and the sixth names a profile the deriver does not enumerate at
 * all, so no gate can read it either way (KD-68).
 *
 * BOUND TO A PROFILE NAME, which is the whole of why it is safe to read the
 * word `steps` here at all. A bare "<n> steps" is polysemous and was measured
 * as such: across the same surfaces it refuses four strings and two are honest
 * prose — README's "three steps, each priced in what you have at that moment"
 * and the harness README's "Two steps ship in it". The ambiguity is in the
 * noun, never in the claim; nobody writes "three steps at `local`"
 * narratively. So the bare noun stays out (KD-67) and the profile-bound form
 * goes in. Profile names come from the deriver, so nothing here is a
 * hand-maintained list — a sixth profile is covered the day it is derived.
 */
function laneSizeClaims(text, profiles) {
  const out = [];
  for (const [profile, { count }] of Object.entries(profiles)) {
    const esc = profile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const forms = [
      new RegExp(`\\|\\s*\`${esc}\`\\s*\\|\\s*(\\d+)\\s*\\|`, "g"),
      new RegExp(`\\b(\\d+)(?: steps?)? at \`${esc}\``, "gi"),
    ];
    for (const m of forms.flatMap((re) => [...text.matchAll(re)])) {
      out.push({ profile, expected: count, value: Number(m[1]), text: m[0].trim() });
    }
  }
  return out;
}

function assertClaims({ noun, allowed, describe }) {
  for (const surface of PUBLIC_SURFACES) {
    for (const claim of drift(read(surface), noun, allowed)) {
      assert.fail(
        `${surface} claims "${claim.text}" but ${describe}. ` +
          `Run \`node scripts/ground-truth.mjs\` and correct the prose.`,
      );
    }
  }
}

/**
 * Every count this gate derives, in ONE place, because the calibration at the
 * bottom of this file has to be able to plant every one of them. A plant that
 * reads a second list is a plant that can quietly cover less than the gate
 * does — and under-covering is precisely the failure that put the plant here.
 */
const GATED_COUNTS = [
  {
    key: "skills",
    noun: { plural: "skills", singular: "skill" },
    allowed: [GT.skills.count],
    describe: `the plugin ships ${GT.skills.count} (${GT.skills.declared.join(", ")})`,
  },
  {
    key: "MCP tools",
    noun: { plural: "tools", singular: "tool" },
    allowed: [GT.mcpTools.count],
    describe: `cmp-inspector registers ${GT.mcpTools.count}`,
  },
  {
    key: "CLI commands",
    noun: { plural: "commands", singular: "command" },
    allowed: [GT.cliCommands.count],
    describe: `the CLI has ${GT.cliCommands.count} (${GT.cliCommands.names.join(", ")})`,
  },
  {
    // A gate count is honest only if it names a profile that actually exists —
    // the lane is profile-tiered, so a bare "8 gates" is false for every
    // profile whose size is not 8.
    key: "verify lane gates",
    noun: { plural: "gates", singular: "gate" },
    allowed: Object.values(GT.verifyProfiles).map((p) => p.count),
    describe: `the lane's real sizes are ${Object.entries(GT.verifyProfiles)
      .map(([name, p]) => `${name}=${p.count}`)
      .join(", ")}`,
  },
];

const gated = (key) => {
  const spec = GATED_COUNTS.find((c) => c.key === key);
  assert.ok(spec, `no gated count named ${key}`);
  return spec;
};

test("no public surface misstates the skill count", () => {
  assertClaims(gated("skills"));
});

test("no public surface misstates the MCP tool count", () => {
  assertClaims(gated("MCP tools"));
});

test("no public surface misstates the CLI command count", () => {
  assertClaims(gated("CLI commands"));
});

test("no public surface misstates the verify lane's size", () => {
  assertClaims(gated("verify lane gates"));
});

test("no public surface misstates the lane's size for a profile it names by name", () => {
  for (const surface of PUBLIC_SURFACES) {
    for (const c of laneSizeClaims(read(surface), GT.verifyProfiles)) {
      assert.equal(
        c.value,
        c.expected,
        `${surface} says "${c.text}" but \`${c.profile}\` runs ${c.expected} steps. ` +
          `Run \`node scripts/ground-truth.mjs\` and correct the prose.`,
      );
    }
  }
});

test("every surface this gate lists is actually READ — a planted miscount in each is refused", () => {
  // GATE-RULES Rule 1, and the plant lives IN the instrument rather than in a
  // terminal someone closed: a gate that has only ever passed is an unread
  // instrument, and this one passed for months while six surfaces off its list
  // were stale. So the calibration is kept, and it runs in milliseconds.
  //
  // It is the NON-VACUITY check on the list above, which is the thing that was
  // actually wrong. Four of the assertions in this file read `PUBLIC_SURFACES`
  // and none of them can tell the difference between "this surface states the
  // right number" and "this surface was never opened, or was opened and its
  // prose was unreadable" — the second is what a JSON manifest looked like to
  // a scanner that had only ever been pointed at markdown. This plants the
  // exact drift the slice found (a wrong number where a surface really does
  // state one) in every surface and every count the gate covers, and requires
  // each one to come back refused.
  const planted = [];
  for (const surface of PUBLIC_SURFACES) {
    const text = read(surface);
    for (const spec of GATED_COUNTS) {
      const [real] = claims(text, spec.noun);
      if (!real) continue; // states no such count — nothing to drift, nothing to plant

      // One above the largest ALLOWED value, never `+1` on the real one: the
      // lane's sizes are a set, so 17 + 1 is 18 and a plant that landed on
      // another profile's real size would be refused by nothing and read as a
      // pass.
      const wrong = Math.max(...spec.allowed) + 1;
      const bad = text.replace(real.text, real.text.replace(real.raw, String(wrong)));
      assert.notEqual(bad, text, `could not plant a miscount into ${surface} (found "${real.text}")`);

      const caught = drift(bad, spec.noun, spec.allowed);
      assert.ok(
        caught.some((c) => c.value === wrong),
        `a planted "${wrong} ${spec.noun.plural}" in ${surface} was NOT refused — this gate lists ` +
          `${surface} and cannot read a count in it, so every assertion above passes over it.`,
      );
      planted.push(`${surface} [${spec.key}]`);
    }

    // The same calibration for the profile-bound lane size, which is a
    // different claim SHAPE and so a different way to read nothing: the noun
    // scanner above cannot see `| \`local\` | 17 |` at all, and for months
    // nothing could.
    for (const real of laneSizeClaims(text, GT.verifyProfiles)) {
      const wrong = real.expected + 1;
      const bad = text.replace(real.text, real.text.replace(String(real.value), String(wrong)));
      assert.notEqual(bad, text, `could not plant a lane size into ${surface} (found "${real.text}")`);
      const caught = laneSizeClaims(bad, GT.verifyProfiles).filter((c) => c.value !== c.expected);
      assert.ok(
        caught.length > 0,
        `a planted ${wrong}-step \`${real.profile}\` in ${surface} was NOT refused — this gate lists ` +
          `${surface} and cannot read a lane size in it.`,
      );
      planted.push(`${surface} [lane size: ${real.profile}]`);
    }
  }

  // A GLOB THAT MATCHES NOTHING DERIVES AN EMPTY LIST, AND AN EMPTY LIST PASSES
  // EVERYTHING. Both checks below iterate the derived names, so without this the
  // front-door loop would cover zero surfaces the moment `.claude-plugin/` were
  // renamed or the walk broke — and it would say so by going green. Measured
  // while calibrating this test: dropping one character from the directory name
  // put both manifests back outside the gate and every assertion in this file
  // still passed. `plugin.json` is named rather than counted because Claude Code
  // requires it to exist, so it is a fixed point rather than a maintained list.
  assert.ok(
    PLUGIN_MANIFESTS.includes(".claude-plugin/plugin.json"),
    `the pre-install manifest glob derived [${PLUGIN_MANIFESTS.join(", ")}] and missed the plugin's own ` +
      `manifest, so the description an agent reads BEFORE the install is outside this gate — the exact ` +
      `state that shipped "Eleven skills" against a tree of twelve.`,
  );
  assert.ok(
    PACKAGE_READMES.length > 0,
    "the published-front-door glob under packages/ matched nothing, leaving every npm README ungated.",
  );

  // The surfaces whose entire purpose is to tell a stranger what this is, before
  // any install. If one of them states none of the gated counts, the gate reads
  // it for nothing and the list is a fiction — which is not a hypothetical: the
  // manifests are ON this list because their descriptions carry the count, and
  // the day a description drops it, this must be a deliberate decision and not
  // a silent loss of coverage.
  for (const frontDoor of [...PLUGIN_MANIFESTS, "README.md"]) {
    assert.ok(
      planted.some((p) => p.startsWith(`${frontDoor} [`)),
      `${frontDoor} states none of the counts this gate derives, so listing it gates nothing. ` +
        `It is the text read BEFORE the install: either it carries the derived count or it comes off the list. ` +
        `Planted: ${planted.join(", ")}`,
    );
  }
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
