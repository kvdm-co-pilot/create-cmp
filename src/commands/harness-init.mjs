// `create-cmp harness init` — the entrance for a repo of ANY stack.
//
// WHY THIS EXISTS. Until now the only documented way for a non-Compose repo to
// declare its stack was a closed loop, and it was measured: the absent-manifest
// refusal named `create-cmp attach`, which refuses any repo without a Compose
// or KMP plugin signal (attach.mjs COMPOSE_SIGNALS) and — by its own header —
// does not write a lane even for the repos it accepts. A Ktor backend adopting
// the harness on 2026-09-04 hit that wall and could only get past it by reading
// the engine's source. Everything else in that adoption report was a paper cut
// next to it. This command is the exit.
//
// WHAT IT WRITES, and why all of it in one command. The report's assumption log
// is the specification: eleven guesses, six of them answerable ONLY from core
// source. A command that wrote just the manifest would leave every one of them
// standing. So init writes the whole entrance:
//
//   the spine        vendored from the harness package — the adopter should not
//                    have to work out WHICH of 28 files to copy (their
//                    assumptions 8 and 9 were exactly that question)
//   the manifest     qa/harness-manifest.json — what the lane refuses without
//   the profile      a skeleton with all five required exports REAL, not stubbed,
//                    and the optional four present and commented with their true
//                    field names
//   the surface      qa/verified-surface.json seeded from the tree's own top
//                    level, so the receipt attests this repo and not a Compose
//                    app's directory names
//   the lock         qa/harness.lock.json, without which harnessIntegrity can
//                    only ever SKIP
//
// then runs qa/framework-check.mjs and prints the verdict — because a lane you
// have not seen refuse is a lane you have not seen (GATE-RULES Rule 0).
//
// THE SKELETON IS THE SPEC (NORTH-STAR §11 D2, PACKAGE-SPLIT D2). Prose drifts
// from the loader silently; a generated skeleton is checked by the code that
// generates it and by the test that runs its lane. That is why the profile this
// writes is a WORKING one — two real steps that prove something on any stack —
// rather than a set of `throw new Error("TODO")` stubs. An adopter's first lane
// run is green, and every later step is an addition rather than a repair.
//
// NEVER CLOBBERS. An existing file keeps its bytes and is reported as kept. The
// command is safe to re-run; that is how an adopter recovers from a half-done
// attempt without reading this file.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { colors, ok, warn, fail } from "../lib/log.mjs";
import {
  MANIFEST_REL_PATH,
  MANIFEST_SCHEMA,
  PROFILE_ID_RE,
} from "../../packages/harness/src/lib/harness-manifest.mjs";
import { PROFILE_PROTOCOL, profileEntryRel } from "../../packages/harness/src/lib/profile-loader.mjs";
import { LOCK_PATH } from "../../packages/harness/src/lib/harness-lock.mjs";
import { SURFACE_CONFIG_REL } from "../../packages/harness/src/lib/inputs-hash.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** The harness package source — the single source of truth for the vendored bytes. */
export const HARNESS_SRC = path.resolve(HERE, "../../packages/harness/src");

/**
 * Top-level `qa/*.mjs` tools that are the CMP profile's, not the spine's, and
 * are therefore never vendored into a foreign repo. Each would either fail to
 * import or lie about a stack the project is not:
 *   preview-gallery, walkthrough  import the Compose renderer and a11y auditor
 *   scaffold-feature              stamps Compose sources (its own header says so)
 *   refusal-demo                  demonstrates refusals against a Compose tree
 * A profile that wants them ships them; the core does not hand them out.
 */
export const PROFILE_TOOLS = Object.freeze([
  "preview-gallery.mjs",
  "walkthrough.mjs",
  "scaffold-feature.mjs",
  "refusal-demo.mjs",
]);

/**
 * `qa/lib/*.mjs` that are not stack-free. `a11y.mjs` imports
 * `./profiles/cmp/tree.mjs`, so vendoring it into a repo with no `cmp` profile
 * produces a module that cannot load — the one genuine import edge from the
 * spine into a profile, and the reason this list is not empty.
 */
export const PROFILE_LIB = Object.freeze(["a11y.mjs"]);

/** Directories that are never a project's source root. */
const NOT_SOURCE = new Set([
  "qa", "docs", "specs", "node_modules", "build", "dist", "out", "target",
  "gradle", ".git", ".github", ".idea", ".vscode", ".gradle", "qa-artifacts",
]);


/**
 * What a test declaration looks like, per language — seeded into the generated
 * profile so a citation BINDS on the first run.
 *
 * This is the fix for the worst defect the first cold adoption found. A `SPEC:`
 * citation counts only when a test declaration follows it within a few lines,
 * and that pattern lived in the spine matching Kotlin and JavaScript alone. A
 * Python project therefore found every marker, bound none, and read "declared
 * but never cited" — a message about the spec file, which was not the problem.
 * Seeding the pattern here makes it one visible, editable line in the adopter's
 * own profile, which is the same principle `citationRoots` already follows: a
 * wrong guess should be one line you can see, never a default you must
 * reverse-engineer.
 *
 * Keys are file extensions found in the tree. `marker` is the comment form the
 * language uses, so the printed next-steps do not tell a Python project to
 * write `//`.
 */
export const LANGUAGE_GRAMMARS = Object.freeze({
  ".py": { marker: "#", test: String.raw`^\s*(?:async\s+)?def\s+test\w*\s*\(|^\s*class\s+Test\w*\s*[(:]`, type: String.raw`^\s*class\s+\w+` },
  ".go": { marker: "//", test: String.raw`^\s*func\s+(?:Test|Benchmark|Example)\w*\s*\(`, type: String.raw`^\s*type\s+\w+\s+(?:struct|interface)\b` },
  ".rs": { marker: "//", test: String.raw`^\s*#\[(?:test|tokio::test|rstest)\]|^\s*fn\s+test\w*\s*\(`, type: String.raw`^\s*(?:pub\s+)?(?:struct|enum|trait|impl)\b` },
  ".rb": { marker: "#", test: String.raw`^\s*(?:def\s+test_\w+|it\s+["']|describe\s+["'])`, type: String.raw`^\s*(?:class|module)\s+\w+` },
  ".ts": { marker: "//", test: String.raw`\b(?:test|it)\s*\(|^\s*@Test\b`, type: String.raw`^\s*(?:export\s+)?(?:abstract\s+)?(?:class|interface)\b` },
  ".js": { marker: "//", test: String.raw`\b(?:test|it)\s*\(`, type: String.raw`^\s*(?:export\s+)?class\b` },
  ".kt": { marker: "//", test: String.raw`@Test\b|\bfun\s+\x60[^\x60]+\x60\s*\(`, type: String.raw`^(?:@\w+\s+)*(?:public\s+|internal\s+|private\s+|abstract\s+|open\s+|sealed\s+|data\s+|enum\s+)*(?:class|object|interface)\b` },
  ".java": { marker: "//", test: String.raw`@Test\b`, type: String.raw`^(?:@\w+\s+)*(?:public\s+|abstract\s+)*(?:class|interface|enum)\b` },
  ".cs": { marker: "//", test: String.raw`\[(?:Test|Fact|Theory)\]`, type: String.raw`^\s*(?:public\s+|internal\s+)?(?:sealed\s+|abstract\s+)?class\b` },
  ".php": { marker: "//", test: String.raw`function\s+test\w*\s*\(|@test\b`, type: String.raw`^\s*(?:abstract\s+|final\s+)?class\b` },
});

/**
 * The dominant source language under the given roots, by file count. Returns
 * the extension key, or null when nothing recognisable is there — in which case
 * the profile ships the core's fallback and SAYS it is doing so.
 * @param {string} root
 * @param {string[]} roots
 * @returns {string|null}
 */
export function detectLanguage(root, roots) {
  const counts = new Map();
  const walk = (dir) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "build") continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else {
        const ext = path.extname(e.name);
        if (Object.hasOwn(LANGUAGE_GRAMMARS, ext)) counts.set(ext, (counts.get(ext) ?? 0) + 1);
      }
    }
  };
  for (const rel of roots) walk(path.join(root, ...rel.split("/")));
  let best = null;
  for (const [ext, n] of counts) if (!best || n > counts.get(best)) best = ext;
  return best;
}

/**
 * A profile id from a directory name: lowercase, dashes, must start with a
 * letter. The id becomes a directory name and is validated by the manifest
 * reader, so an unusable one is caught here rather than at first lane run.
 * @param {string} name
 * @returns {string|null} a valid id, or null when nothing usable can be derived
 */
export function slugProfileId(name) {
  const slug = String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^[^a-z]+/, "");
  return slug && PROFILE_ID_RE.test(slug) ? slug : null;
}

/**
 * The project's likely source roots — top-level directories that are not build
 * output, tooling, or the harness itself. Reported and written into the
 * manifest's citationRoots, where the adopter can correct them; a wrong guess
 * is visible in one file rather than buried in a scanner.
 * @param {string} root
 * @returns {string[]}
 */
export function detectSourceRoots(root) {
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !NOT_SOURCE.has(e.name))
    .map((e) => e.name)
    .sort();
}

/**
 * Top-level entries this repo would commit — the seed for the verified surface.
 * Seeded from the TREE, never from a stack's directory names: the Compose
 * default in inputs-hash.mjs matching a foreign repo's `qa/` and `specs/` and
 * nothing else is precisely how a receipt comes to attest a fraction of a
 * project while looking complete.
 * @param {string} root
 * @returns {string[]}
 */
export function seedSurface(root) {
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const skip = new Set(["node_modules", "build", "dist", "out", "target", ".gradle", "qa-artifacts"]);
  const names = entries
    .filter((e) => !e.name.startsWith(".") && !skip.has(e.name))
    .map((e) => e.name);
  // `qa` ALWAYS, even though init is reading the tree before it writes it:
  // the harness declarations (the manifest and this very file) live under qa/,
  // and a surface that does not cover them lets an edit to what the lane
  // attests go unattested — the exact hole harness-region.mjs exists to close.
  if (!names.includes("qa")) names.push("qa");
  return names.sort();
}

/**
 * The files init vendors, as project-relative paths paired with their source in
 * the harness package. Pure, so the vendor set is assertable without writing a
 * tree — the test pins that no profile tool and no profile-coupled lib is in it.
 * @returns {{rel: string, src: string}[]}
 */
export function vendorPlan() {
  const out = [];
  for (const f of fs.readdirSync(HARNESS_SRC).filter((f) => f.endsWith(".mjs")).sort()) {
    if (PROFILE_TOOLS.includes(f)) continue;
    out.push({ rel: `qa/${f}`, src: path.join(HARNESS_SRC, f) });
  }
  const libDir = path.join(HARNESS_SRC, "lib");
  for (const f of fs.readdirSync(libDir).filter((f) => f.endsWith(".mjs")).sort()) {
    if (PROFILE_LIB.includes(f)) continue;
    out.push({ rel: `qa/lib/${f}`, src: path.join(libDir, f) });
  }
  const schema = path.join(HARNESS_SRC, "..", "..", "..", "template", "qa", "evidence", "schema.json");
  if (fs.existsSync(schema)) out.push({ rel: "qa/evidence/schema.json", src: schema });
  return out;
}

/**
 * The manifest this project starts from. Flat by contract — the console's
 * reader and the lane's reader must both accept one file.
 * @param {string} id
 * @param {string[]} sourceRoots
 * @returns {object}
 */
export function manifestFor(id, sourceRoots) {
  return {
    schema: MANIFEST_SCHEMA,
    profile: { id },
    receipt: "qa/evidence/latest.json",
    architectureDoc: "docs/ARCHITECTURE.md",
    specs: "specs",
    citationRoots: sourceRoots.length ? sourceRoots : ["src"],
    approvals: "qa/approvals.json",
    packs: [id],
  };
}

/**
 * The generated profile — a WORKING one, not stubs.
 *
 * Two steps, chosen because they are the only two that prove something on a
 * stack nobody has seen: `harnessIntegrity` (this lane is the one that was
 * locked) and `specCoverage` (every promise is cited from a test that can
 * observe it). Both are the core's mechanics; the SENTENCES are here, because
 * the core hands over data and not language — the adoption report's own finding
 * about `clauseTierCoverage`.
 *
 * The four optional exports are present as commented blocks carrying their real
 * field names, since every one of them was an undocumented guess in that report.
 *
 * @param {string} id
 * @param {{sourceRoots: string[], tiers: string[]}} opts
 * @returns {string}
 */
export function profileSkeleton(id, { sourceRoots, tiers, lang = null }) {
  const roots = JSON.stringify(sourceRoots.length ? sourceRoots : ["src"]);
  const g = lang ? LANGUAGE_GRAMMARS[lang] : null;
  const exts = lang ? JSON.stringify([lang]) : '[".kt", ".kts", ".java", ".ts", ".js", ".py", ".go", ".rs"]';
  const grammarBlock = g
    ? `\n/**\n * THE GRAMMAR — what a citation and a test declaration look like HERE.\n *\n * A \`SPEC:\` citation counts only when a test declaration follows it within\n * \`bindingWindow\` non-blank lines. That rule decides whether ANY promise is\n * proved, and the pattern is language-specific, so it is yours rather than the\n * harness's. Seeded from the ${lang} sources found in this tree — correct it if\n * your tests look different, and the lane will say so if nothing binds.\n */\nexport const grammar = {\n  citationMarker: /^(?:\\/\\/|#)\\s*SPEC:/,\n  testDeclaration: /${g.test}/,\n  typeDeclaration: /${g.type}/,\n  bindingWindow: 5,\n};\n`
    : `\n// No recognised source language was found, so this profile uses the core's\n// FALLBACK grammar, which matches Kotlin/JVM and JavaScript only. If your\n// citations report as "declared but never cited" while the markers are plainly\n// there, that is why — declare a grammar:\n//\n// export const grammar = {\n//   citationMarker: /^(?:\\/\\/|#)\\s*SPEC:/,\n//   testDeclaration: /^\\\\s*def\\\\s+test\\\\w*\\\\s*\\\\(/,   // ← your language's test form\n//   typeDeclaration: /^\\\\s*class\\\\s+\\\\w+/,\n//   bindingWindow: 5,\n// };\n`;
  const tierNames = JSON.stringify(tiers);
  const hostTier = tiers[0];
  return `// The "${id}" stack profile — what a stack IS, to this harness.
//
// Written by \`create-cmp harness init\`. This file is YOURS: the harness never
// rewrites it. Everything under qa/lib/ except this directory is machine-owned
// and must not be edited — if you find yourself needing to, that is a defect in
// the harness and worth reporting rather than patching locally.
//
// The five exports below are REQUIRED (qa/lib/profile-loader.mjs refuses without
// them, by name). The commented blocks at the bottom are optional; each is
// inert until you uncomment it, and each carries its real field names.

import fs from "node:fs";
import path from "node:path";

import { checkHarnessIntegrity, describeIntegrity } from "../../harness-lock.mjs";
import { requireSpecModel } from "../../spec-model.mjs";
import { scanSpecClauses, scanCitations, clauseTierCoverage, citationScanDiagnostic } from "../../spec-coverage.mjs";

/** Must equal qa/harness-manifest.json's profile.id, or the lane refuses. */
export const id = "${id}";

/** The profile protocol this file implements. The core speaks ${PROFILE_PROTOCOL}. */
export const protocol = ${PROFILE_PROTOCOL};

/**
 * WHERE things live. The spec scanner's model — qa/lib/spec-model.mjs validates
 * this shape and names every problem at once.
 *
 *   specs          directory of *.spec.md, relative to the root
 *   citationRoots  where a \`// SPEC: ID\` citation may be found
 *   citationExts   file extensions the citation scanner reads
 *   flows          journey files ({dir, exts}) — null when this stack has none
 *   sourceRoots    what the watcher watches (defaults to citationRoots)
 *   buildDir       build output, so the lane can ignore it (optional)
 */
${grammarBlock}
export const layout = {
  specs: "specs",
  citationRoots: ${roots},
  citationExts: ${exts},
  flows: null,
  sourceRoots: ${roots},
};

/**
 * WHICH TEST TIERS exist, and which can observe which promise. This is what
 * lets the lane refuse a clause proved at a tier that cannot see it.
 *
 *   names       every tier, cheapest first
 *   hostOnly    tiers needing nothing but this machine
 *   satisfying  a clause's declared [tier: X] → the tiers that can observe it
 *   journey     the tier proving a user-visible surface, or null
 *   forFile     a citing file's path → the tier it belongs to
 */
export const tiers = {
  names: ${tierNames},
  hostOnly: ${tierNames},
  satisfying: { ${tiers.map((t) => `${t}: ["${t}"]`).join(", ")} },
  journey: null,
  forFile: (rel) => {
    if (/(^|\\/)(test|tests|__tests__)(\\/|$)/.test(rel)) return "${hostTier}";
    return null;
  },
};

/** Is this lane the one that was locked? Pure Node, runs anywhere, seconds. */
function stepHarnessIntegrity(ROOT) {
  const started = Date.now();
  const r = checkHarnessIntegrity(ROOT);
  // Three states, three verdicts. "unlocked" is NOT a failure: nothing is known
  // to be wrong and nothing is proven either, which is a SKIP, not an accusation.
  const verdict = r.status === "intact" ? "PASS" : r.status === "unlocked" ? "SKIP" : "FAIL";
  return {
    name: "harnessIntegrity",
    verdict,
    skipKind: verdict === "SKIP" ? "structure" : undefined,
    reason: verdict === "PASS" ? undefined : describeIntegrity(r),
    durationMs: Date.now() - started,
    layer: "spine",
    harness: r,
  };
}

/**
 * Is every promise cited from a test that can actually observe it?
 *
 * The mechanics are the core's; the sentences are this profile's, because the
 * core hands over data and not language. A clause that declares [tier: X] and
 * is cited only from a tier that cannot see X is the gate that matters most.
 */
function stepSpecCoverage(ROOT) {
  const started = Date.now();
  const model = requireSpecModel(ROOT);
  const specsDir = path.join(ROOT, ...model.specsDir.split("/"));
  if (!fs.existsSync(specsDir)) {
    return {
      name: "specCoverage",
      verdict: "SKIP",
      skipKind: "structure",
      reason: \`no \${model.specsDir}/ directory — this project declares no behaviour yet\`,
      durationMs: Date.now() - started,
      layer: "spine",
    };
  }

  const clauses = scanSpecClauses(ROOT, model);
  const tags = scanCitations(ROOT, model);
  const cited = new Set(tags.map((t) => t.id));
  const orphanClauses = [...clauses.entries()].filter(([, c]) => !c.withdrawn).filter(([cid]) => !cited.has(cid));
  const orphanTags = tags.filter((t) => !clauses.has(t.id) || clauses.get(t.id).withdrawn);
  const { unmetTier } = clauseTierCoverage(clauses, tags, model);

  const problems = [
    ...orphanClauses.map(([cid, c]) => \`\${cid} is declared but never cited from a test (\${c.file})\`),
    ...orphanTags.map((t) => \`\${t.file}:\${t.line} cites \${t.id}, which no spec declares\`),
    ...unmetTier.map((u) => \`\${u.id} declares [tier: \${u.requiredTier}] but is cited only from \${u.tiers.length ? u.tiers.join(", ") : "nowhere"} — only \${(model.tiers.satisfying[u.requiredTier] ?? []).join(" or ")} can observe it (\${u.file})\`),
  ];

  // A scan that saw markers and bound none is NOT "you wrote no citations" —
  // it means this profile's grammar does not match the language. Without this
  // sentence the failure points at the spec file, which is the one place that
  // is not the problem. It cost a real adopter six minutes and a debugger.
  const scanNote = citationScanDiagnostic(tags, model);
  if (scanNote) problems.unshift(scanNote);

  return {
    name: "specCoverage",
    verdict: problems.length ? "FAIL" : "PASS",
    reason: problems.length ? problems.join("\\n  ") : undefined,
    durationMs: Date.now() - started,
    layer: "spine",
    details: { clauses: [...clauses.values()].filter((c) => !c.withdrawn).length, citations: tags.length },
  };
}

/**
 * THE PACK. Called once per lane run with everything the runner can give you.
 *
 * ctx = { ROOT, HERE, fast, determinism, profile, mode, sh, tryGit,
 *         tryGitLines, DEGRADED_PATHS }
 *
 * There is no build-tool helper — wrap \`sh\` yourself when you add a step that
 * compiles or tests, and give it \`fn.layer\` and \`fn.timeoutHint\` so the runner
 * can group it and say where to look when it times out.
 */
export function steps({ ROOT }) {
  // The runner calls these with no arguments, so bind ROOT here. Each returns
  // ONE step row: { name, verdict, durationMs, reason?, skipKind?, layer? }.
  const harnessIntegrity = () => stepHarnessIntegrity(ROOT);
  const specCoverage = () => stepSpecCoverage(ROOT);

  // stepsForProfile holds FUNCTION REFERENCES, not names — the runner calls
  // them directly. STEP_FN_BY_NAME is the name→function lookup that --fast
  // uses to exclude a step by name.
  const all = [harnessIntegrity, specCoverage];
  const STEP_FN_BY_NAME = { harnessIntegrity, specCoverage };

  return {
    id,
    // Which steps run at each entry point. Add your build and test steps to
    // local/ci/nightly/release as you write them; keep smoke pure-Node so
    // Rule 0's instrument stays fast.
    stepsForProfile: { smoke: all, scaffold: all, local: all, ci: all, nightly: all, release: all },
    // Steps needing a resource the host may not have (a device, a container, a
    // network). Their absence is what stops a green lane claiming too much.
    DEVICE_STEPS: [],
    // What \`verify --fast\` leaves out. The inner loop, never the done-gate.
    FAST_EXCLUDED_NAMES: [],
    STEP_FN_BY_NAME,
    // Two runs that must agree. Return null until you have a step whose output
    // could legitimately differ between runs.
    stepDeterminism: () => null,
    // Released when the lane finishes, however it finishes.
    releaseLease: () => {},
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// OPTIONAL exports. Absent is allowed and honest; present-but-wrong is refused.
// ─────────────────────────────────────────────────────────────────────────────
//
// export function artifacts(root) {
//   // What a human signs, in order. Compose it from the core's helpers:
//   // featureBriefArtifacts / featureSpecArtifacts / architectureArtifact.
//   return [];
// }
//
// export function governable(root) {
//   // Refuse to record signatures in a tree that is not a real project.
//   return { ok: true };
// }
//
// export const ladder = {
//   // The evidence rungs THIS pack means. A pack with no ladder earns no rung,
//   // which is the honest grade for a ladder nobody has calibrated.
//   names: { L0: "…", L1: "…", L2: "…", L3: "…" },
//   l0Required: [], l1Required: [], deviceExecution: [], release: [],
// };
//
// export const plants = {
//   // The source Rule 0's instrument plants to prove the gates still bite.
//   // WITHOUT THIS, qa/framework-check.mjs cannot plant the unbound-citation
//   // and tier-unmet cases and says so per plant. No plants, no badge.
//   testFileBasename: "FrameworkCheckPlanted.${hostTier === "unit" ? "kt" : "kt"}",
//   unboundCitationSource: (clause) => "…a citation on a type with no test under it…",
//   tierUnmetCitationSource: (clause) => "…a host-tier test citing a clause it cannot observe…",
//   unmeetableTier: "…a tier in \`tiers.satisfying\` a host test cannot satisfy…",
// };
`;
}

/**
 * The full file plan for an init — pure, so every decision is assertable
 * without touching a filesystem.
 * @param {string} root
 * @param {{id: string}} opts
 * @returns {{vendor: {rel: string, src: string}[], write: {rel: string, content: string}[], id: string, sourceRoots: string[]}}
 */
export function planInit(root, { id }) {
  const sourceRoots = detectSourceRoots(root);
  const tiers = ["unit"];
  const lang = detectLanguage(root, sourceRoots);
  return {
    id,
    sourceRoots,
    lang,
    vendor: vendorPlan(),
    write: [
      { rel: MANIFEST_REL_PATH, content: JSON.stringify(manifestFor(id, sourceRoots), null, 2) + "\n" },
      { rel: profileEntryRel(id), content: profileSkeleton(id, { sourceRoots, tiers, lang }) },
      { rel: SURFACE_CONFIG_REL, content: JSON.stringify({ surface: seedSurface(root) }, null, 2) + "\n" },
    ],
  };
}

/**
 * `create-cmp harness init` — writes the entrance, then proves it.
 * @param {Record<string, string|boolean>} flags
 * @param {string|undefined} positional
 * @returns {Promise<number>} exit code
 */
export async function runHarnessInit(flags, positional) {
  const targetDir = (typeof flags["target-dir"] === "string" && flags["target-dir"]) || positional || ".";
  const root = path.resolve(targetDir);
  const dryRun = Boolean(flags["dry-run"]);

  process.stdout.write(
    `\n${colors.bold("create-cmp harness init")} — the verify lane, for any stack\n` +
      `  project: ${colors.cyan(root)}\n\n`
  );

  if (!fs.existsSync(root)) {
    fail(`${root} does not exist.`);
    return 2;
  }

  const id = typeof flags.profile === "string" ? flags.profile : slugProfileId(path.basename(root));
  if (!id || !PROFILE_ID_RE.test(id)) {
    fail(
      `could not derive a profile id from "${path.basename(root)}".\n` +
        `  A profile id is lowercase, dash-separated, and starts with a letter.\n` +
        `  Pass one: create-cmp harness init --profile <id>`
    );
    return 2;
  }

  const manifestAbs = path.join(root, MANIFEST_REL_PATH);
  if (fs.existsSync(manifestAbs)) {
    warn(`${MANIFEST_REL_PATH} already exists — this project has already declared its stack.`);
    // NAME THE OTHER COMMAND. This branch used to offer `upgrade --harness`
    // alone, and that was the second wall of a closed loop: an adopter whose
    // lane FAILs harnessIntegrity after editing the profile init told them was
    // theirs re-runs init, is sent to `upgrade --harness`, and that refuses too
    // (it needs the create-cmp.json only a stamp writes). The profile-edit case
    // is the common one and gets named first.
    process.stdout.write(
      `  Nothing was changed.\n\n` +
        `  Edited your profile or a declaration, and the lane now FAILs harnessIntegrity?\n` +
        `    ${colors.cyan("create-cmp harness relock")}     re-takes the lock over the files you own\n` +
        `  Re-vendoring the spine after a harness upgrade?\n` +
        `    ${colors.cyan("create-cmp upgrade --harness")}  merges rather than overwrites\n\n`
    );
    return 0;
  }

  const plan = planInit(root, { id });
  const written = [];
  const kept = [];

  for (const { rel, src } of plan.vendor) {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs)) {
      kept.push(rel);
      continue;
    }
    if (!dryRun) {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.copyFileSync(src, abs);
    }
    written.push(rel);
  }
  for (const { rel, content } of plan.write) {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs)) {
      kept.push(rel);
      continue;
    }
    if (!dryRun) {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
    }
    written.push(rel);
  }

  // The lock LAST — it hashes the region, so every vendored byte must be in
  // place before it is taken. Written through the vendored copy so the lock
  // records what this project actually has, not what this repo has.
  if (!dryRun && !fs.existsSync(path.join(root, LOCK_PATH))) {
    const { writeHarnessLock } = await import(path.join(root, "qa", "lib", "harness-lock.mjs"));
    const pkg = JSON.parse(fs.readFileSync(path.join(HARNESS_SRC, "..", "package.json"), "utf8"));
    writeHarnessLock(root, { version: pkg.version });
    written.push(LOCK_PATH);
  }

  ok(`${written.length} files written${kept.length ? `, ${kept.length} kept (already present)` : ""}`);
  process.stdout.write(
    `\n  ${colors.bold("profile")}  ${id}  →  ${profileEntryRel(id)}\n` +
      `  ${colors.bold("sources")}  ${plan.sourceRoots.length ? plan.sourceRoots.join(", ") : colors.yellow("none detected — edit citationRoots in the manifest")}\n` +
      `  ${colors.bold("language")} ${plan.lang ? `${plan.lang} — grammar seeded so citations bind on the first run` : colors.yellow("not detected — the profile uses the Kotlin/JS fallback grammar; declare your own if citations do not bind")}\n` +
      `  ${colors.bold("skipped")}  ${PROFILE_TOOLS.length + PROFILE_LIB.length} Compose-profile tools (not the spine)\n\n`
  );

  if (dryRun) {
    warn("--dry-run: nothing was written.");
    return 0;
  }

  // Rule 0 before anything else: a lane you have not seen refuse is a lane you
  // have not seen. But the instrument PLANTS into the working tree and refuses
  // to do so when there are uncommitted changes — "a plant that dies mid-run
  // must not be able to lose your work" — and init has just written 44 files.
  // Running it here would hand every single adopter a FAIL on their first
  // contact with the product, for a reason that is not their fault and not a
  // defect. So when the tree is dirty we say what to do instead of staging a
  // guaranteed failure.
  const dirty = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
  const treeIsDirty = dirty.status !== 0 || (dirty.stdout ?? "").trim() !== "";
  if (treeIsDirty) {
    process.stdout.write(
      `${colors.bold("Rule 0")} — prove the lane returns before you trust it.\n\n` +
        `  The instrument plants failures into your tree and reverts them, so it\n` +
        `  refuses to run with uncommitted changes present. Commit what init just\n` +
        `  wrote, then run it:\n\n` +
        `    ${colors.cyan('git add -A && git commit -m "install the verify lane"')}\n` +
        `    ${colors.cyan("node qa/framework-check.mjs")}\n\n` +
        `  It should print PASS in a few seconds, having proved the lane fails by\n` +
        `  name and then recovers. ${colors.bold("Do not skip it")} — an unproven lane is a\n` +
        `  lane whose green means nothing.\n\n`
    );
    printNextSteps(id, plan.lang);
    return 0;
  }

  process.stdout.write(`${colors.bold("Rule 0")} — proving the lane returns, both ways:\n\n`);
  const check = spawnSync(process.execPath, [path.join(root, "qa", "framework-check.mjs")], {
    cwd: root,
    stdio: "inherit",
    timeout: 120_000,
  });

  if (check.status !== 0) {
    process.stdout.write(
      `\n${colors.yellow("The lane is installed but its framework check did not pass.")}\n` +
        `  That is information, not a failure of this command: it names which guard\n` +
        `  could not be planted and why. Read it, then run it again.\n\n`
    );
    return check.status ?? 1;
  }

  printNextSteps(id, plan.lang);
  return 0;
}

/**
 * The four things an adopter does next, in the order that works. Shared by both
 * exits so the advice does not depend on whether their tree happened to be clean.
 * @param {string} id
 */
function printNextSteps(id, lang = null) {
  const marker = (lang && LANGUAGE_GRAMMARS[lang]?.marker) || "//";
  process.stdout.write(
    `${colors.bold("Then:")}\n` +
      `  1. Write a promise in ${colors.cyan("specs/")} — a clause line like ${colors.cyan("- **APP-01** the app …")}\n` +
      `  2. Cite it from a test with ${colors.cyan(`${marker} SPEC: APP-01`)} ${colors.bold("directly above a test")}\n` +
      `     — a citation counts only when a test declaration follows within 5 lines\n` +
      `  3. ${colors.cyan("node qa/verify.mjs")} — the lane proves it, and writes a receipt\n` +
      `  4. Add your build and test steps to ${colors.cyan(profileEntryRel(id))}\n\n`
  );
}
