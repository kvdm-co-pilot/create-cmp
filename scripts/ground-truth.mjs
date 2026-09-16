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
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
/**
 * Directories the manifest walk never descends into. `template/` is absent on
 * purpose: it holds no package.json today, and if it ever does, a scaffolded
 * app's manifest is exactly the kind of thing that should be seen and then
 * excluded by its own `"private": true`, not silently skipped by this list.
 */
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "out", "tmp"]);
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
  const manifest = (d) => {
    const p = json(d === "." ? "package.json" : `${d}/package.json`);
    return { name: p.name, version: p.version, dir: d };
  };
  // FOUND BY WALKING, NOT BY CONVENTION. This used to read `packages/` and call
  // the result "every name this repo owns". `@create-cmp/inspector` is published
  // and live and sits at `inspector/mcp`, so that sentence was printed over
  // eleven of twelve names for weeks, and the drift check built on this list
  // inherited the same blind spot. Naming the twelfth directory would have been
  // a hand-written list inside the deriver — the exact defect
  // test/ground-truth-derivation.test.mjs exists to refuse, and the reason the
  // inspector was missing to begin with. So the tree is asked instead.
  const found = [];
  const walk = (rel, depth) => {
    if (depth > 4) return;
    for (const e of fs.readdirSync(path.join(ROOT, rel || "."), { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
      const here = rel ? `${rel}/${e.name}` : e.name;
      if (fs.existsSync(path.join(ROOT, here, "package.json"))) found.push(here);
      walk(here, depth + 1);
    }
  };
  walk("", 0);
  const publishable = found.filter((d) => !json(`${d}/package.json`).private).sort();
  return {
    primary: manifest("."),
    aliases: publishable.filter((d) => d.startsWith("packages/aliases/")).map(manifest),
    independent: publishable.filter((d) => !d.startsWith("packages/aliases/")).map(manifest),
  };
}

/** Every name this repo owns, in one list — what `--registry` asks about. */
function ownedNames(gt) {
  return [gt.npm.primary, ...gt.npm.independent, ...gt.npm.aliases];
}

/** Files npm puts in every tarball whether or not `files` names them. */
const ALWAYS_SHIPPED = ["package.json", "README.md", "LICENSE"];

/** git, as text. Injectable so the derivation below can be tested without a repo. */
export const gitText = (cwd, args) =>
  execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/**
 * What npm would put in this package's tarball, asked of npm itself.
 *
 * Asked only when git reports a candidate it cannot see (below), so a clean
 * checkout never spawns it. `--ignore-scripts` because a dry run is still a
 * pack, and `prepare`/`prepack` would run otherwise — none exists in this repo
 * today, and a derivation should not start depending on that.
 */
export const npmPackedFiles = (pkgDir) =>
  JSON.parse(
    execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
      cwd: pkgDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    }),
  )[0].files.map((f) => f.path);

/**
 * Does each published NUMBER still name these BYTES? Derived from git, offline.
 *
 * THE DEFECT, measured 2026-09-16. `--registry` printed "every name this repo
 * owns is live at the version this tree holds" while `create-cmp-cli@0.25.0` on
 * the registry and `0.25.0` in this tree were SIXTY-SIX shipped files apart —
 * among them the two Kotlin files whose Firebase redirect had been fixed hours
 * earlier, which meant every `npx create-cmp-cli` that day still scaffolded the
 * defect. The check compared NUMBERS and reported the answer as though it had
 * compared CONTENT. Two different trees wore one version, and the green said
 * the property held.
 *
 * That is this repo's recurring shape — a guard written against ABSENCE does
 * not catch VACUITY — arriving in the version spine. A missing name was always
 * caught (`absent`), a moved one too (`differs`). Present-and-equal over
 * different bytes looked exactly like a release that had shipped.
 *
 * WHAT IT ASKS, and why not "is main ahead of npm". Main being ahead of the
 * registry is not a defect, it is trunk working. The defect is narrower, and is
 * ADR-0008's sentence inverted — a fix arrives as new bytes under a new name,
 * never as an old name over new bytes. So the question is
 *
 *   did anything this package SHIPS change after the commit that last SET its
 *   version?
 *
 * and the anchor is the manifest's own history, not a release tag. Tags exist
 * here (`npm version` writes `vX.Y.Z`) and would have answered for
 * `create-cmp-cli` alone. `prooflane-harness` and `prooflane-receipts` publish
 * independently by design (docs/PUBLISHING.md, "Version relationships") and
 * carry no tag of their own — and both were drifting too, by 39 files and by 1.
 *
 * NOT DERIVABLE IS A RESULT, NEVER A PASS — AND IT IS THE ONLY WAY TO SAY "I
 * COULD NOT LOOK". Every route by which this could skip bytes returns
 * `derivable: false` with no packages, never a flag on a package a caller has to
 * remember to read. Review measured why that is the rule rather than a style: a
 * per-package `indeterminate` field, added for the shallow-clone case, still
 * answered `derivable: true` with nothing drifting, and every caller that reads
 * `derivable && !drifting.length` — which is every caller — read CLEAN. A second
 * field is a second place to forget. The routes, each measured on this tree:
 *
 *   no git                      cannot ask at all
 *   a wildcard `files` entry    npm and git disagree about what `*` spans
 *   a truncated history         the anchor is the boundary, not the commit
 *   a file npm packs git can't see   no diff can ever judge its bytes
 */
export function publishedBytesDrift(
  gt = groundTruth(),
  { cwd = ROOT, git = gitText, npmPacked = npmPackedFiles } = {},
) {
  const lines = (args) => git(cwd, args).split("\n").map((s) => s.trim()).filter(Boolean);
  const refuse = (why) => ({ derivable: false, why, packages: [] });
  try {
    lines(["rev-parse", "HEAD"]);
  } catch (err) {
    return refuse(`git could not be asked for HEAD — ${err.message.split("\n")[0]}`);
  }
  // SHALLOW IS REFUSED OUTRIGHT, not per package. The walk below looks for the
  // OLDEST commit bearing a version, and "oldest" means nothing in a history
  // that stops somewhere arbitrary: an older commit bearing the same number may
  // simply not have been cloned. Measured in the shape CI had — commit a shipped
  // change, clone that head at `--depth 1` — the full clone reds and the shallow
  // one exits 0 over identical bytes, because `.github/workflows/ci.yml` checked
  // out at the default depth of 1 and this was green by construction on every
  // pull request. The workflow now fetches everything; this refuses rather than
  // trusting that it did.
  if (lines(["rev-parse", "--is-shallow-repository"])[0] === "true") {
    return refuse(
      "this git history is SHALLOW, so the commit that set a version may not be in it and the anchor would be " +
        "wherever the clone happened to stop — comparing the tip against itself. Fetch the whole history " +
        "(`git fetch --unshallow`; in CI, `actions/checkout` with `fetch-depth: 0`).",
    );
  }
  // KD-54, closed here: this used to run git in `cwd` and read every manifest
  // from the module's own ROOT, so pointed at another tree it measured that
  // tree's history against THIS repo's `files`. A test passing a `cwd` would
  // have planted a change and passed by reading unrelated declarations. npm is
  // now asked in `cwd` too, which would have widened the split to two readers
  // against one — so all three read one tree.
  const manifestAt = (rel) => JSON.parse(fs.readFileSync(path.join(cwd, rel), "utf8"));

  const packages = [];
  const invisible = [];
  for (const p of ownedNames(gt)) {
    const rel = p.dir === "." ? "package.json" : `${p.dir}/package.json`;
    const inRepo = (f) => (p.dir === "." ? f : `${p.dir}/${f}`);
    const manifest = manifestAt(rel);

    // A `files` entry naming a directory ships that whole directory, and a git
    // pathspec of the same name means the same thing — the one construct the
    // two agree on for free. WILDCARDS are where they stop agreeing (git needs
    // `:(glob)` before `*` will refuse to cross a `/`), so an entry carrying one
    // is refused rather than translated; a translation that silently disagreed
    // would report a package clean because it looked in the wrong place, which
    // is KD-41 and KD-42 exactly, one file over.
    //
    // A LEADING `!` IS NOT TRANSLATED AT ALL, and it was, for one round. It is
    // npm's "not this, though an entry includes it" — the only way to keep build
    // output out of a shipped directory, since `.gitignore` and `.npmignore`
    // cannot exclude a path a `files` entry includes. This derivation read it
    // as a prefix and dropped matching candidates before npm was asked. npm's
    // reading depends on ORDER and that one did not: `["!tpl/.cache", "tpl"]`
    // packs the ignored file (measured), the prefix read dropped it, npm was
    // asked zero times, and the answer was CLEAN. Sorting `files` alphabetically
    // puts `!` first, so this repo's own `.gradle` exclusion was one tidy-up
    // away from shipping the cache again under a green check. So `!` entries
    // are skipped here, never interpreted, and npm alone decides what they mean.
    const entries = Array.isArray(manifest.files) ? manifest.files : [];
    const declared = entries.filter((f) => !f.startsWith("!"));
    const exotic = declared.find((f) => /[*?[\]{}!]/.test(f));
    if (exotic) {
      return refuse(
        `${rel} declares a files entry ${JSON.stringify(exotic)} carrying a wildcard this derivation does not ` +
          `translate. npm and git do not agree about what \`*\` spans, and guessing would report a package clean ` +
          `because it looked in the wrong place.`,
      );
    }

    // NOT FILTERED BY `existsSync`. That filter was here and it forgave the worst
    // case: a shipped path that is GONE is the largest drift there is, and
    // dropping it from the watch list compared it against nothing. Measured —
    // delete one file of `packages/receipts/src` and it reds; delete the
    // directory and drift went to []. git needs no protection from a missing
    // path: `diff` and `ls-files` both exit 0 over a pathspec matching nothing.
    const watched = [...declared, ...ALWAYS_SHIPPED].map(inRepo);

    // THE ANCHOR IS THE OLDEST COMMIT THAT EVER BORE THIS VERSION — not the
    // newest unbroken run of it, which is what this walk first found (KD-53).
    // The run form breaks at the first different number, so bump X → Y and then
    // revert to X and the anchor becomes the REVERT: everything shipped between
    // X's real first commit and the revert is older than the anchor and
    // forgiven, while the registry may well be serving the first X. Measured in
    // a fixture — set X · change a shipped file · bump · revert to X — the run
    // form reported `drifting: []`. The oldest form over-reports instead, and
    // over-reporting is the only safe error here: a version reused across two
    // trees is the defect itself, so calling it drift is not a false alarm.
    let setAt = null;
    for (const commit of lines(["log", "--format=%H", "--", rel])) {
      let was = null;
      try {
        was = JSON.parse(git(cwd, ["show", `${commit}:${rel}`])).version ?? null;
      } catch {
        was = null;
      }
      if (was === p.version) setAt = commit; // newest-first, so the last hit is the oldest
    }

    // Files npm will pack that git cannot see. Git answers with a SUPERSET —
    // everything ignored under a shipped path — and npm prunes it, because npm
    // excludes some ignored files itself (`.DS_Store`) and packs others (a
    // `.gradle/` cache), and copying npm's exclusion list here would be a second
    // spelling of npm's rules that drifts from npm. So npm is asked, and only
    // when git has a candidate.
    const candidates = unseenByGit(lines, watched);
    if (candidates.length) {
      let packed;
      try {
        packed = new Set(npmPacked(path.join(cwd, p.dir)).map(inRepo));
      } catch (err) {
        return refuse(
          `${p.name} has ${candidates.length} file(s) under a shipped path that git cannot see, and npm could not ` +
            `be asked whether it packs them — ${err.message.split("\n")[0]}`,
        );
      }
      for (const file of candidates.filter((f) => packed.has(f))) invisible.push(`${p.name}: ${file}`);
    }

    packages.push({
      ...p,
      setAt,
      setDate: setAt ? (lines(["log", "-1", "--format=%ad", "--date=short", setAt])[0] ?? null) : null,
      changed: setAt ? changedSince(lines, setAt, watched) : [],
      unanchored: !setAt,
    });
  }

  if (invisible.length) {
    return refuse(
      `npm would pack ${invisible.length} file(s) git cannot see, so no comparison here can judge their bytes, ` +
        `and they ship to every adopter:\n    ${invisible.join("\n    ")}\n` +
        `  Exclude them with a leading-\`!\` entry in that package's \`files\`, after the entry that includes them.`,
    );
  }
  return { derivable: true, why: null, packages };
}

/**
 * Shipped files that differ between the anchor commit and WHAT IS ON DISK.
 *
 * NOT `diff <anchor> HEAD`, and the difference is the whole usefulness of this
 * check. Gates in this repo run BEFORE the commit — `npm test` then commit then
 * PR — so a comparison that stopped at HEAD would be blind to the edit the
 * author just made and green on exactly the run that should have refused.
 *
 * Untracked files are asked for separately because `git diff` does not list
 * them and `npm publish` packs the working directory. IGNORED files are not
 * counted here, and not because npm skips them — it does not, and the comment
 * that stood here claiming otherwise was the defect. A file git ignores has no
 * history, so it cannot be judged changed-or-not at all; that is
 * `unseenByGit`'s question, and its answer is a refusal, not a row.
 */
function changedSince(lines, anchor, watched) {
  const tracked = lines(["diff", "--name-only", anchor, "--", ...watched]);
  const untracked = lines(["ls-files", "--others", "--exclude-standard", "--", ...watched]);
  return [...new Set([...tracked, ...untracked])].sort();
}

/**
 * Candidates npm MIGHT pack and git cannot see: every ignored file under a
 * shipped path. A superset by design, and NOT pruned here — npm decides every
 * one of them, including what a `!` entry excludes, because pruning here is
 * how the order-blind reading above let a packed file through unasked. Measured against npm's packer before this existed: the root
 * package packed 386 files where the derivation watched 379, and the seven were
 * `template/.gradle/**`, the publisher's local Gradle cache. The registry's
 * `create-cmp-cli@0.25.0` tarball carries all seven, and `copyDir` has no
 * exclusion list, so every scaffold put another machine's `fileHashes.lock` and
 * `checksums.lock` into an adopter's brand-new app.
 */
function unseenByGit(lines, watched) {
  return lines(["ls-files", "--others", "--ignored", "--exclude-standard", "--", ...watched]);
}

/**
 * The packages whose published number no longer names the bytes in this tree.
 *
 * `unanchored` IS NOT IN THIS LIST. In a complete history a version no commit
 * sets exists only in the working tree — a bump not yet committed. Nothing is
 * published under it, so there is no second tree wearing it: the SAFE state,
 * and the one every bump passes through. Counting it as drift made the remedy
 * for drift trip the check that demanded it. (In a truncated history the same
 * ending means nothing at all — which is why a shallow repository refuses
 * before any package is looked at.)
 */
export function driftingPackages(drift) {
  return drift.packages.filter((p) => p.changed.length > 0);
}

/** Versions that exist only in the working tree — an uncommitted bump. */
export function unanchoredPackages(drift) {
  return drift.packages.filter((p) => p.unanchored);
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
    // A MATCHING NUMBER IS NOT MATCHING BYTES. This block used to end with
    // "every name this repo owns is live at the version this tree holds" over a
    // pure version comparison — true of the numbers, false of the trees, and
    // printed as reassurance. `stale` is that sentence's missing half.
    const drift = publishedBytesDrift(gt);
    const drifted = new Map(driftingPackages(drift).map((p) => [p.name, p]));
    const MARK = { published: "✓", stale: "✗", differs: "→", absent: "·", unknown: "?" };
    const SAY = {
      published: "registry serves this exact version, and these exact bytes",
      differs: "registry serves",
      absent: "no such name on the registry",
      unknown: "could not ask",
    };
    console.log("\ncreate-cmp — the registry's answer, fetched just now\n");
    const stateOf = (p) => (p.state === "published" && drifted.has(p.name) ? "stale" : p.state);
    const label = (p) => `${MARK[stateOf(p)]} ${p.name}@${p.version}`;
    const width = Math.max(...status.map((p) => label(p).length)) + 2;
    for (const p of status) {
      const d = drifted.get(p.name);
      const detail =
        stateOf(p) === "stale"
          ? `registry serves this NUMBER over different bytes — ${d.changed.length} shipped file(s) changed since ${d.setDate}`
          : p.state === "differs"
            ? `${SAY.differs} ${p.latest}`
            : p.state === "unknown"
              ? `${SAY.unknown} — ${p.why}`
              : SAY[p.state];
      console.log(`  ${label(p).padEnd(width)}${detail}`);
    }
    const behind = status.filter((p) => p.state === "differs" || p.state === "absent");
    const stale = status.filter((p) => stateOf(p) === "stale");
    if (!drift.derivable) console.log(`\n  bytes NOT COMPARED — ${drift.why}`);
    for (const p of unanchoredPackages(drift))
      console.log(`  · ${p.name}@${p.version} is set only in the working tree — commit the bump before publishing`);
    console.log(
      stale.length
        ? `\n  ${stale.length} name(s) serve a version number over bytes that are not this tree's: ` +
            `${stale.map((p) => p.name).join(", ")}. Bump each, then publish — a fix arrives under a new\n  number, never under an old one (ADR-0008).\n`
        : behind.length === 0 && drift.derivable
          ? "\n  every name this repo owns is live at the version this tree holds, over these bytes.\n"
          : behind.length === 0
            ? "\n  every name this repo owns is live at the version this tree holds — bytes NOT compared (above).\n"
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
  const drift = publishedBytesDrift(gt);
  const stale = driftingPackages(drift);
  const NAME_W = Math.max(26, ...drift.packages.map((p) => p.name.length + 2));
  console.log("\npublished bytes (derived from git, no network)");
  if (!drift.derivable) row("NOT DERIVABLE", drift.why);
  else if (!stale.length) row("in step", "every version number still names the bytes in this tree");
  for (const p of stale)
    console.log(`  ${p.name.padEnd(NAME_W)}v${p.version} set ${p.setDate} · ${p.changed.length} shipped file(s) changed since`);
  for (const p of unanchoredPackages(drift))
    console.log(`  ${p.name.padEnd(NAME_W)}v${p.version} — set only in the working tree; nothing is published under it`);
  console.log("\n  registry state is not a fact about this tree — ask for it with --registry\n");
}

if (import.meta.url === `file://${process.argv[1]}`) main();
