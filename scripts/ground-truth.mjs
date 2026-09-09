#!/usr/bin/env node
// The repo's own counts, DERIVED — never hand-maintained.
//
//   node scripts/ground-truth.mjs            # human-readable table
//   node scripts/ground-truth.mjs --json     # machine-readable, for tests and briefs
//   node scripts/ground-truth.mjs --registry # what the REGISTRY serves, fetched
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
// which must pass on an air-gapped machine and in CI with no registry. That is
// why `--registry` is a FLAG and not the default, and why `groundTruth()` never
// reaches the network — the one question that needs the registry is asked only
// when a human asks it. A tree fact and a registry fact are different kinds of
// fact, and this file states only the first (see `npmNames`).

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
  // S8b: the profiles live in the step pack; the spine (verify.mjs) composes it.
  const src = read("template/qa/lib/profiles/cmp/steps-cmp.mjs");
  const block = src.match(/const stepsForProfile = \{[\s\S]*?\n\s*\};/);
  if (!block) throw new Error("ground-truth: could not locate stepsForProfile in template/qa/lib/profiles/cmp/steps-cmp.mjs");
  const stepNames = (text) =>
    text
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/, "").trim())
      .join("")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^step[A-Za-z]/.test(s));

  const smoke = stepNames(block[0].match(/smoke:\s*\[([\s\S]*?)\],/)[1]);
  const scaffold = stepNames(block[0].match(/scaffold:\s*\[([\s\S]*?)\],/)[1]);
  const local = stepNames(block[0].match(/local:\s*\[([\s\S]*?)\n\s*\],/)[1]);

  // ci and release extend the profile below them; count the extra rows added.
  const ciExtra = (src.match(/stepsForProfile\.ci\s*=\s*\[\.\.\.stepsForProfile\.local,([^\]]*)\]/) || [, ""])[1]
    .split(",").map((s) => s.trim()).filter(Boolean);
  const releaseExtra = (src.match(/stepsForProfile\.release\s*=\s*\[\.\.\.stepsForProfile\.ci,([^\]]*)\]/) || [, ""])[1]
    .split(",").map((s) => s.trim()).filter(Boolean);

  const strip = (n) => n.replace(/^step/, "").replace(/Memo$/, "").replace(/^./, (c) => c.toLowerCase());
  return {
    smoke: { count: smoke.length, steps: smoke.map(strip) },
    scaffold: { count: scaffold.length, steps: scaffold.map(strip) },
    local: { count: local.length, steps: local.map(strip) },
    ci: { count: local.length + ciExtra.length, steps: [...local, ...ciExtra].map(strip) },
    release: { count: local.length + ciExtra.length + releaseExtra.length, steps: [...local, ...ciExtra, ...releaseExtra].map(strip) },
  };
}

/**
 * npm names this repo owns, and where each is defined.
 *
 * WHAT THIS MAY AND MAY NOT SAY. Ownership and version are facts about the
 * TREE, so they are derived here. Whether a name is live on the registry is a
 * fact about the REGISTRY, and this file cannot see it — so it does not claim
 * it. It used to: two names were listed under a hand-written `unpublished`
 * key, which stayed correct only until they were published (0.25.0, and both
 * had in fact been live for minutes when the deriver was next run). A
 * hand-written claim inside the file whose entire purpose is that claims are
 * derived is the drift this project exists to remove, one layer in.
 *
 * `independent` is the tree fact that key was reaching for: these packages
 * carry their own manifest under `packages/` and version apart from the
 * CLI/plugin/marketplace lockstep. For the registry's answer, ask the
 * registry: `--registry`.
 */
function npmNames() {
  const dirs = (rel) =>
    fs
      .readdirSync(path.join(ROOT, rel), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => `${rel}/${e.name}`)
      .filter((d) => fs.existsSync(path.join(ROOT, d, "package.json")));
  const manifest = (d) => {
    const p = json(`${d}/package.json`);
    return { name: p.name, version: p.version, dir: d };
  };
  return {
    primary: { name: json("package.json").name, version: json("package.json").version, dir: "." },
    aliases: dirs("packages/aliases").map(manifest),
    independent: dirs("packages")
      .map(manifest)
      .filter((p) => !json(`${p.dir}/package.json`).private),
  };
}

/** Every name this repo owns, in one list — what `--registry` asks about. */
function ownedNames(gt) {
  return [gt.npm.primary, ...gt.npm.independent, ...gt.npm.aliases];
}

/**
 * The registry's answer, fetched — never assumed. Opt-in via `--registry`,
 * because `groundTruth()` itself is consumed by the suite and must stay
 * offline (see the header). Reports the delta a release manager actually
 * asks for: is what this tree holds the thing the registry serves?
 */
export async function registryStatus(gt, fetchImpl = fetch) {
  return Promise.all(
    ownedNames(gt).map(async (p) => {
      try {
        const res = await fetchImpl(`https://registry.npmjs.org/${p.name}`, {
          headers: { accept: "application/vnd.npm.install-v1+json" },
        });
        if (res.status === 404) return { ...p, state: "absent", latest: null };
        if (!res.ok) return { ...p, state: "unknown", latest: null, why: `HTTP ${res.status}` };
        const latest = (await res.json())["dist-tags"]?.latest ?? null;
        if (latest === null) return { ...p, state: "unknown", latest, why: "no dist-tags.latest" };
        if (latest === p.version) return { ...p, state: "published", latest };
        return { ...p, state: "differs", latest };
      } catch (err) {
        return { ...p, state: "unknown", latest: null, why: err.message };
      }
    }),
  );
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
${gt.npm.independent.map((p) => `| \`${p.name}\` | ${p.version} — independent |`).join("\n")}
| \`@create-cmp/inspector\` | ${v.inspectorMcp} — independent |

CLI, plugin, and marketplace are **one release** and are pinned in lockstep.
The other ${gt.npm.independent.length + 1} are **deliberately independent** — the lane is versioned apart
from the engine that stamped it, so a project can upgrade its lane without
upgrading its generator. Do not "fix" them to match.

> **⚠ Repo version ≠ published version.** The table above is what is in the
> tree; what a reader can actually \`npx\` may lag it. That is a fact about the
> registry, not about this tree, so nothing above asserts it. Ask for it:
> \`node scripts/ground-truth.mjs --registry\` fetches every name this repo owns
> and reports which the registry serves at the version held here.
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

Owned by this repo: ${ownedNames(gt).map((n) => `\`${n.name}\``).join(" · ")}.
Lead all copy with **\`npm create kmp@latest my-app\`** — the most memorable invocation.

Whether each is live on the registry is not a fact about this tree, so it is not
asserted here. Ask the registry: \`node scripts/ground-truth.mjs --registry\`.

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

async function main() {
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
  if (process.argv.includes("--registry")) {
    const status = await registryStatus(gt);
    const MARK = { published: "✓", differs: "→", absent: "·", unknown: "?" };
    const SAY = {
      published: "registry serves this exact version",
      differs: "registry serves",
      absent: "no such name on the registry",
      unknown: "could not ask",
    };
    console.log("\ncreate-cmp — the registry's answer, fetched just now\n");
    const label = (p) => `${MARK[p.state]} ${p.name}@${p.version}`;
    const width = Math.max(...status.map((p) => label(p).length)) + 2;
    for (const p of status) {
      const detail = p.state === "differs" ? `${SAY.differs} ${p.latest}` : p.state === "unknown" ? `${SAY.unknown} — ${p.why}` : SAY[p.state];
      console.log(`  ${label(p).padEnd(width)}${detail}`);
    }
    const behind = status.filter((p) => p.state === "differs" || p.state === "absent");
    console.log(
      behind.length === 0
        ? "\n  every name this repo owns is live at the version this tree holds.\n"
        : `\n  ${behind.length} name(s) the registry does not serve at this tree's version: ${behind.map((p) => p.name).join(", ")}.\n`,
    );
    return;
  }
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
  for (const p of gt.npm.independent) row("independent", `${p.name}@${p.version}`);
  for (const a of gt.npm.aliases) row("alias", `${a.name}@${a.version}`);
  console.log("\n  registry state is not a fact about this tree — ask for it with --registry\n");
}

if (import.meta.url === `file://${process.argv[1]}`) main();
