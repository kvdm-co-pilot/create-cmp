#!/usr/bin/env node
// The repo's own counts, DERIVED — never hand-maintained.
//
//   node scripts/ground-truth.mjs            # human-readable table
//   node scripts/ground-truth.mjs --json     # machine-readable, for tests and briefs
//
// WHY THIS EXISTS. create-cmp's thesis is that a claim about a tree must be
// derived from that tree, and that the delta between claim and tree IS the
// drift. Its own README violated that: "8 gates" outlived three profile
// changes, "9 skills" outlived cmp-audit, and "26 tools" and "15 tools"
// coexisted inside one file. Prose cannot be trusted to count; this can.
//
// Every number below is read out of the artifact that defines it, so a
// number can only be wrong if the artifact moved and this script was not
// re-run — which test/doc-counts.test.mjs then fails on.
//
// Offline and dependency-free BY DESIGN: it is consumed by the test suite,
// which must pass on an air-gapped machine and in CI with no registry.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const json = (rel) => JSON.parse(read(rel));

/** Package versions, each from its own manifest — the version spine. */
function versions() {
  return {
    cli: json("package.json").version,
    plugin: json(".claude-plugin/plugin.json").version,
    marketplace: json(".claude-plugin/marketplace.json").metadata.version,
    harness: json("packages/harness/package.json").version,
    receipts: json("packages/receipts/package.json").version,
    inspectorMcp: json("inspector/mcp/package.json").version,
  };
}

/**
 * Skills, two ways: what the plugin DECLARES and what is on DISK. They must
 * agree — a skill on disk but undeclared never loads, and a declared skill
 * missing from disk breaks the install. cmp-audit was the former for weeks.
 */
function skills() {
  const declared = json(".claude-plugin/plugin.json").skills.map((s) => path.basename(s));
  const onDisk = fs
    .readdirSync(path.join(ROOT, "skills"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  return { count: declared.length, declared: [...declared].sort(), onDisk, inSync: JSON.stringify([...declared].sort()) === JSON.stringify(onDisk) };
}

/** MCP tools — counted from the registrations themselves, not from a list. */
function mcpTools() {
  const src = read("inspector/mcp/bin/server.mjs");
  const names = [...src.matchAll(/server\.registerTool\(\s*\n?\s*"([a-z_]+)"/g)].map((m) => m[1]);
  return { count: names.length, names };
}

/** CLI commands — one module per command in src/commands/. */
function cliCommands() {
  const names = fs
    .readdirSync(path.join(ROOT, "src/commands"))
    .filter((f) => f.endsWith(".mjs"))
    .map((f) => path.basename(f, ".mjs"))
    .sort();
  return { count: names.length, names };
}

/**
 * Verify-lane steps per profile, parsed out of the lane's own profile table.
 * `ci` and `release` are expressed as spreads of the profile below them, so
 * they are computed the same way the lane computes them.
 */
function verifyProfiles() {
  const src = read("template/qa/verify.mjs");
  const block = src.match(/const stepsForProfile = \{[\s\S]*?\n\};/);
  if (!block) throw new Error("ground-truth: could not locate stepsForProfile in template/qa/verify.mjs");
  const stepNames = (text) =>
    text
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/, "").trim())
      .join("")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^step[A-Za-z]/.test(s));

  const scaffold = stepNames(block[0].match(/scaffold:\s*\[([\s\S]*?)\],/)[1]);
  const local = stepNames(block[0].match(/local:\s*\[([\s\S]*?)\n\s*\],/)[1]);

  // ci and release extend the profile below them; count the extra rows added.
  const ciExtra = (src.match(/stepsForProfile\.ci\s*=\s*\[\.\.\.stepsForProfile\.local,([^\]]*)\]/) || [, ""])[1]
    .split(",").map((s) => s.trim()).filter(Boolean);
  const releaseExtra = (src.match(/stepsForProfile\.release\s*=\s*\[\.\.\.stepsForProfile\.ci,([^\]]*)\]/) || [, ""])[1]
    .split(",").map((s) => s.trim()).filter(Boolean);

  const strip = (n) => n.replace(/^step/, "").replace(/Memo$/, "").replace(/^./, (c) => c.toLowerCase());
  return {
    scaffold: { count: scaffold.length, steps: scaffold.map(strip) },
    local: { count: local.length, steps: local.map(strip) },
    ci: { count: local.length + ciExtra.length, steps: [...local, ...ciExtra].map(strip) },
    release: { count: local.length + ciExtra.length + releaseExtra.length, steps: [...local, ...ciExtra, ...releaseExtra].map(strip) },
  };
}

/** npm names this repo owns, and where each is defined. */
function npmNames() {
  const aliases = fs
    .readdirSync(path.join(ROOT, "packages/aliases"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const p = json(`packages/aliases/${e.name}/package.json`);
      return { name: p.name, version: p.version };
    });
  return {
    primary: { name: json("package.json").name, version: json("package.json").version },
    aliases,
    unpublished: [
      { name: json("packages/harness/package.json").name, version: json("packages/harness/package.json").version },
      { name: json("packages/receipts/package.json").name, version: json("packages/receipts/package.json").version },
    ],
  };
}

export function groundTruth() {
  return {
    generatedFrom: "scripts/ground-truth.mjs — derived, never hand-written",
    versions: versions(),
    skills: skills(),
    mcpTools: mcpTools(),
    cliCommands: cliCommands(),
    verifyProfiles: verifyProfiles(),
    npm: npmNames(),
  };
}


/**
 * The launch-collateral facts file, GENERATED.
 *
 * LAUNCH-SPRINT.md §2 used to hold these numbers by hand. It froze at 0.6.1 and
 * every asset written from it went false. A hand-written replacement would fail
 * the same way — and did, within the hour: the repo shipped 0.14.1 while the
 * file still said 0.14.0. So the file is emitted from the same derivation the
 * test suite pins, and regenerating it is one command.
 */
function renderMarkdown(gt) {
  const v = gt.versions;
  const p = gt.verifyProfiles;
  const stamp = new Date().toISOString().slice(0, 10);
  return `# Launch ground truth — GENERATED, do not edit

> **Regenerate:** \`node scripts/ground-truth.mjs --markdown\`
> (\`--json\` for the machine-readable form, no flag for a terminal table).
> Pinned by \`test/doc-counts.test.mjs\`, which fails the suite when a public
> surface contradicts it.
>
> **Why this file is generated.** \`LAUNCH-SPRINT.md\` §2 held these numbers by
> hand, froze at \`0.6.1\` on 2026-07-13, and was copied faithfully into every
> asset that sprint produced. Eight releases later all of it was false. Nothing
> written by hand survives contact with a moving tree — this file included, which
> is why it is emitted rather than maintained.

**Derived ${stamp} from the working tree.**

## Versions

| Surface | Version |
|---|---|
| \`create-cmp-cli\` (repo) | **${v.cli}** |
| Claude Code plugin | **${v.plugin}** |
| marketplace entry | **${v.marketplace}** |
| \`${gt.npm.unpublished[0].name}\` | ${v.harness} — independent, unpublished |
| \`${gt.npm.unpublished[1].name}\` | ${v.receipts} — independent, unpublished |
| \`@create-cmp/inspector\` | ${v.inspectorMcp} — independent, published separately |

CLI, plugin, and marketplace are **one release** and are pinned in lockstep.
The other three are **deliberately independent** — the lane is versioned apart
from the engine that stamped it, so a project can upgrade its lane without
upgrading its generator. Do not "fix" them to match.

> **⚠ Repo version ≠ published version.** The table above is what is in the
> tree. What a reader can actually \`npx\` may lag it. Check with
> \`npm view create-cmp-cli version\` before citing any version in copy.
>
> **Best practice for all launch copy: don't pin a version at all.** Write
> \`npm create kmp@latest my-app\`. A pinned number in prose is a promise to
> maintain it, and this whole exercise exists because that promise was not kept.
> Pin only where a machine requires it (the MCP registry manifest, \`scene.sh\`).

## Counts

| Thing | Count | Detail |
|---|---|---|
| Plugin skills | **${gt.skills.count}** | ${gt.skills.declared.join(", ")} |
| \`cmp-inspector\` MCP tools | **${gt.mcpTools.count}** | ${gt.mcpTools.names.join(", ")} |
| CLI commands | **${gt.cliCommands.count}** | ${gt.cliCommands.names.join(", ")} |

## The verify lane — it is not "8 gates"

Profile-tiered. There is no single gate count, and quoting one without naming
its profile is false:

| Profile | Steps | What it is |
|---|---|---|
| \`scaffold\` | **${p.scaffold.count}** | what \`create-cmp --verify\` proves at stamp time |
| \`local\` | **${p.local.count}** | the developer's done-checkpoint — \`node qa/verify.mjs\` |
| \`ci\` | **${p.ci.count}** | local + the determinism probe's row |
| \`release\` | **${p.release.count}** | ci + audit-cadence report + release-APK smoke |

\`local\` steps, in order: ${p.local.steps.join(", ")}.

**Correct:** "a ${p.local.count}-step verify lane", "the verify lane (${p.local.count} steps at \`local\`,
${p.release.count} at \`release\`)", or "a multi-gate verify lane". Best of all, describe what it
checks and skip the number.
**Never:** "8 gates", "8-gate", "eight gates".

The old eight-item list (spec coverage, build, unit tests, conformance, golden
trees, token drift, a11y, on-device E2E) is also **incomplete** — it omits
${p.local.steps.filter((x) => !["specCoverage", "build", "unitTests", "conformance", "goldenTrees", "tokenDrift", "a11y", "e2eSmoke"].includes(x)).join(", ")}.

## npm names

Live: ${[gt.npm.primary, ...gt.npm.aliases].map((n) => `\`${n.name}\``).join(" · ")}.
Lead all copy with **\`npm create kmp@latest my-app\`** — the most memorable invocation.
Not yet published: ${gt.npm.unpublished.map((n) => `\`${n.name}\``).join(", ")}.

## Stable, non-numeric facts (safe to cite directly)

- Repo: https://github.com/kvdm-co-pilot/create-cmp
- Showcase, every commit carrying its receipt: https://github.com/kvdm-co-pilot/create-cmp-showcase
- **Refusal PR #1** — the harness blocking a bad change and naming the violated clause:
  https://github.com/kvdm-co-pilot/create-cmp-showcase/pull/1 — the single best hook
- Principle: *pixels flow to the human, structure flows to the AI*
- Preview loop: headless render of the app's real screens on save, ~1s warm,
  changed-screen attribution, compile-error surfacing, \`preview_diff\`
- Positioning case, sourced and dated: \`docs/WHY-CMP.md\`
- Metrics are **bot-noisy** — never quote download counts without the caveat

## Binding constraints (LAUNCH-SPRINT §3)

1. **Prepare-then-stop.** No agent posts, submits, uploads, pins, or publishes anything.
2. **Strongest-TRUE-case only.** Never claim RN/Flutter deprecated. Every dated claim sourced.
3. **ZERO monetization copy.** Gatekeeper, Evidence, pricing, "notary" do not exist publicly.
4. **House gates.** Engine/template changes need \`npm test\` green + a CHANGELOG entry.
`;
}

function main() {
  const gt = groundTruth();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(gt, null, 2));
    return;
  }
  if (process.argv.includes("--markdown")) {
    const out = path.join(ROOT, "docs/research/launch/GROUND-TRUTH.md");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, renderMarkdown(gt));
    console.log(`wrote ${path.relative(ROOT, out)}`);
    return;
  }
  const row = (k, v) => console.log(`  ${k.padEnd(26)}${v}`);
  console.log("\ncreate-cmp — derived ground truth\n");
  console.log("versions");
  for (const [k, v] of Object.entries(gt.versions)) row(k, v);
  console.log("\ncounts");
  row("skills", `${gt.skills.count}${gt.skills.inSync ? "" : "  ⚠ declared/disk MISMATCH"}`);
  row("mcp tools", gt.mcpTools.count);
  row("cli commands", gt.cliCommands.count);
  console.log("\nverify lane (steps per profile)");
  for (const [k, v] of Object.entries(gt.verifyProfiles)) row(k, v.count);
  console.log("\nnpm");
  row("primary", `${gt.npm.primary.name}@${gt.npm.primary.version}`);
  for (const a of gt.npm.aliases) row("alias", `${a.name}@${a.version}`);
  for (const u of gt.npm.unpublished) row("unpublished", `${u.name}@${u.version}`);
  console.log("");
}

if (import.meta.url === `file://${process.argv[1]}`) main();
