#!/usr/bin/env node
// The `add-feature` stamper — deterministic vertical-slice generator.
//
//   node qa/scaffold-feature.mjs <FeatureName> [--entity <EntityName>] [--dry-run]
//
// Copies the `home` exemplar file set, applies a curated WHOLE-WORD identifier
// rename (never a blind substring replace — see the rename map below), injects
// the new feature into the three shared files at their `// cmp:anchor` markers,
// and writes a default spec clause set. Pure Node, no dependencies.
//
// Philosophy: skills instruct, scripts stamp (HARNESS-ROADMAP M3). The AI only
// refines spec wording after this runs; the file set + wiring are mechanical.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function die(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

// ── Argument parsing ────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const entityFlagIdx = args.indexOf("--entity");
const entityArg = entityFlagIdx !== -1 ? args[entityFlagIdx + 1] : undefined;

const featureName = positional[0];
if (!featureName) {
  die(
    "usage: node qa/scaffold-feature.mjs <FeatureName> [--entity <EntityName>] [--dry-run]\n" +
      "  <FeatureName> is required, e.g. `Favorites`.",
  );
}

const IDENTIFIER_RE = /^[A-Z][A-Za-z0-9]*$/;
if (!IDENTIFIER_RE.test(featureName)) {
  die(
    `"${featureName}" is not a valid PascalCase Kotlin identifier. Use e.g. "Favorites", "Bookmarks".`,
  );
}

function defaultEntity(feature) {
  // Naive de-pluralization — the skill's interview step should let a human
  // override this via --entity when it's wrong (Categories -> Category, etc).
  if (feature.endsWith("ies") && feature.length > 3) return `${feature.slice(0, -3)}y`;
  if (feature.endsWith("s") && !feature.endsWith("ss")) return feature.slice(0, -1);
  return feature;
}

const entityName = entityArg ?? defaultEntity(featureName);
if (!IDENTIFIER_RE.test(entityName)) {
  die(`"${entityName}" is not a valid PascalCase Kotlin identifier for --entity.`);
}

const F = featureName; // PascalCase feature, e.g. Favorites
const f = F[0].toLowerCase() + F.slice(1); // camelCase/package segment, e.g. favorites
const F_UPPER = F.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase(); // FAVORITES
const E = entityName; // PascalCase entity, e.g. Favorite

// ── Resolve the target project's real package ───────────────────────────────
// This script runs POST-scaffold, so __PACKAGE__ is already resolved in the
// target project. Parse it from composeApp/build.gradle.kts (namespace) or,
// failing that, from any source file's `package` line.

function resolvePackage() {
  const gradleFile = path.join(ROOT, "composeApp", "build.gradle.kts");
  if (fs.existsSync(gradleFile)) {
    const contents = fs.readFileSync(gradleFile, "utf8");
    const m = contents.match(/namespace\s*=\s*"([^"]+)"/);
    if (m && m[1] !== "__PACKAGE__") return m[1];
  }
  const homeViewModel = path.join(
    ROOT,
    "composeApp/src/commonMain/kotlin",
    ...guessPackageDirFromDisk(),
    "presentation/home/HomeViewModel.kt",
  );
  if (fs.existsSync(homeViewModel)) {
    const m = fs.readFileSync(homeViewModel, "utf8").match(/^package\s+([\w.]+)\.presentation\.home\s*$/m);
    if (m) return m[1];
  }
  die(
    "could not resolve the project's package — expected a resolved `namespace = \"...\"` in " +
      "composeApp/build.gradle.kts (found __PACKAGE__ unresolved, or the file is missing). " +
      "Run this script POST-scaffold, in a project that has already been stamped.",
  );
}

// Best-effort directory walk to find the HomeViewModel.kt under some package
// path when build.gradle.kts didn't yield an answer (fallback path only).
function guessPackageDirFromDisk() {
  const base = path.join(ROOT, "composeApp/src/commonMain/kotlin");
  let dir = base;
  const segments = [];
  // Walk down single-child directories until we hit `presentation` or run out.
  while (fs.existsSync(dir)) {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
    if (entries.length !== 1) break;
    if (entries[0].name === "presentation") break;
    segments.push(entries[0].name);
    dir = path.join(dir, entries[0].name);
  }
  return segments;
}

const PACKAGE = resolvePackage();
const PACKAGE_DIR = PACKAGE.split(".").join("/");

// ── The rename map (§3) ──────────────────────────────────────────────────────
// Whole-word (\b-delimited), applied LONGEST KEY FIRST so compound entries
// (ItemRepositoryImpl) resolve before their substrings (ItemRepository, Item).
// Anything not in this list is left untouched by design (see design doc §3
// "LEAVE GENERIC" — awaitItem, items, item, goldenItems, itemId, onItemClick,
// id, title, subtitle, and every androidx./kotlinx./org.koin./kotlin. token).

const RENAME_MAP = [
  ["HomeScreenTest", `${F}ScreenTest`],
  ["HomeViewModelTest", `${F}ViewModelTest`],
  ["HomeGoldenTreeTest", `${F}GoldenTreeTest`],
  ["HomeScreen", `${F}Screen`],
  ["HomeViewModel", `${F}ViewModel`],
  ["HomeUiState", `${F}UiState`],
  ["home_title", `${f}_title`],
  ["home_error", `${f}_error`],
  ["FakeItemRepository", `Fake${E}Repository`],
  ["ItemRepositoryImpl", `${E}RepositoryImpl`],
  ["ItemRepository", `${E}Repository`],
  ["GetItemsUseCase", `Get${E}sUseCase`],
  ["getItemsCallCount", `get${E}sCallCount`],
  ["getItems", `get${E}s`],
  ["Item", E],
  // Spec + test SPEC-tag retargeting (§6): HOME-0N -> <F_UPPER>-0N, then the
  // bare HOME -> <F_UPPER> (must run AFTER the -0 form or "HOME-0" would be
  // partially consumed oddly — longest-key-first already orders this).
  ["HOME-0", `${F_UPPER}-0`],
  ["HOME", F_UPPER],
  // Package segment / path / golden filename / display text. Order matters:
  // must run after HomeXxx / home_xxx above so those compounds are already
  // resolved; the bare `home` word only matches the standalone package
  // segment, golden filename stem, and prose by this point.
  ["home", f],
  ["Home", F],
].sort((a, b) => b[0].length - a[0].length);

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const COMPILED_RENAMES = RENAME_MAP.map(([from, to]) => [new RegExp(`\\b${escapeRegExp(from)}\\b`, "g"), to]);

function applyRename(text) {
  let out = text;
  for (const [re, to] of COMPILED_RENAMES) out = out.replace(re, to);
  return out;
}

// ── The file set (§4) ───────────────────────────────────────────────────────
// Source paths are relative to composeApp/src/<sourceSet>/kotlin/<PACKAGE_DIR>.

const SRC = (sourceSet) => path.join(ROOT, "composeApp/src", sourceSet, "kotlin", PACKAGE_DIR);

const FILES = [
  { from: path.join(SRC("commonMain"), "domain/model/Item.kt"), to: path.join(SRC("commonMain"), `domain/model/${E}.kt`) },
  { from: path.join(SRC("commonMain"), "domain/repository/ItemRepository.kt"), to: path.join(SRC("commonMain"), `domain/repository/${E}Repository.kt`) },
  { from: path.join(SRC("commonMain"), "domain/usecase/GetItemsUseCase.kt"), to: path.join(SRC("commonMain"), `domain/usecase/Get${E}sUseCase.kt`) },
  { from: path.join(SRC("commonMain"), "data/remote/ItemRepositoryImpl.kt"), to: path.join(SRC("commonMain"), `data/remote/${E}RepositoryImpl.kt`) },
  { from: path.join(SRC("commonMain"), "presentation/home/HomeScreen.kt"), to: path.join(SRC("commonMain"), `presentation/${f}/${F}Screen.kt`) },
  { from: path.join(SRC("commonMain"), "presentation/home/HomeViewModel.kt"), to: path.join(SRC("commonMain"), `presentation/${f}/${F}ViewModel.kt`) },
  { from: path.join(SRC("commonTest"), "presentation/home/HomeViewModelTest.kt"), to: path.join(SRC("commonTest"), `presentation/${f}/${F}ViewModelTest.kt`) },
  { from: path.join(SRC("commonTest"), "testing/fakes/FakeItemRepository.kt"), to: path.join(SRC("commonTest"), `testing/fakes/Fake${E}Repository.kt`) },
  { from: path.join(SRC("desktopTest"), "presentation/home/HomeScreenTest.kt"), to: path.join(SRC("desktopTest"), `presentation/${f}/${F}ScreenTest.kt`) },
  { from: path.join(SRC("desktopTest"), "presentation/home/HomeGoldenTreeTest.kt"), to: path.join(SRC("desktopTest"), `presentation/${f}/${F}GoldenTreeTest.kt`) },
  { from: path.join(ROOT, "specs/home.spec.md"), to: path.join(ROOT, `specs/${f}.spec.md`), isDefaultSpec: true },
];

// Golden baseline: NOT copied (a feature's golden tree is captured fresh via
// UPDATE_GOLDEN=1, per the skill's step 5), but we still verify the source
// files above genuinely exist before doing anything.
for (const file of FILES) {
  if (!fs.existsSync(file.from)) {
    die(
      `exemplar source file missing: ${path.relative(ROOT, file.from)}\n` +
        "This script must run in an unmodified (or already-featured) create-cmp scaffold " +
        "where the `home` exemplar still exists.",
    );
  }
}

// Name-taken check.
const existing = FILES.filter((file) => fs.existsSync(file.to) && !file.isDefaultSpec).map((file) =>
  path.relative(ROOT, file.to),
);
if (existing.length > 0) {
  die(
    `feature "${featureName}" appears to already exist — these target files are already present:\n` +
      existing.map((p) => `  ${p}`).join("\n"),
  );
}
if (fs.existsSync(path.join(ROOT, `specs/${f}.spec.md`))) {
  die(`specs/${f}.spec.md already exists — feature "${featureName}" appears to already exist.`);
}

// ── Default spec clause set (§6) ────────────────────────────────────────────

function defaultSpec() {
  return `# Spec: ${f}

> Generated by \`scaffold-feature.mjs\` from the \`home\` exemplar shape. Refine the clause
> prose below for ${F}'s real behavior (ids stay fixed) before running the verify lane.

- **${F_UPPER}-01** — Given the ${F} screen opens, When ${f} are being loaded, Then a loading
  indicator is shown and no ${f} are visible.
- **${F_UPPER}-02** — Given the repository returns ${f}, When loading completes, Then the ${f}
  are listed with their title and subtitle, and no error is shown.
- **${F_UPPER}-03** — Given the repository fails, When loading completes, Then a human-readable
  error message is shown (\`${f}_error\`) and no ${f} are visible.
- **${F_UPPER}-04** — Given a load has failed, When the data source recovers and the user
  triggers a reload, Then the error clears and the ${f} render.
- **${F_UPPER}-05** — Given ${f} are listed, When the user taps an item, Then the app navigates
  to that item's detail.
- **${F_UPPER}-06** — Given the ${F} screen renders, When its structure is inspected, Then the
  screen matches its committed golden tree (\`qa/golden/${f}.json\`) — structural regressions
  are intentional, declared changes only.
`;
}

// ── Anchor injection (§5) ────────────────────────────────────────────────────
// Idempotent (skip if the feature's line is already present); fails loudly if
// an anchor marker is missing from the shared file. Each function is a pure
// string -> string transform so multiple injections into the SAME file can be
// chained (each one sees the previous one's output) before a single write.

function injectAtAnchor(content, filePathForErrors, anchorName, lineToInsert) {
  const anchorLine = `// cmp:anchor ${anchorName}`;
  const lines = content.split("\n");
  const anchorLineIdx = lines.findIndex((l) => l.trim() === anchorLine);
  if (anchorLineIdx === -1) {
    die(
      `anchor "${anchorName}" not found in ${path.relative(ROOT, filePathForErrors)}. ` +
        "The template shared file may be out of date with this stamper — " +
        "check for the `// cmp:anchor` marker comments.",
    );
  }

  // Idempotency: if the line is already present verbatim (ignoring leading
  // whitespace), skip — running the stamper twice for the same feature must
  // not duplicate wiring.
  const alreadyPresent = lines.some((l) => l.trim() === lineToInsert.trim());
  if (alreadyPresent) return { content, skipped: true, diff: "" };

  // Match the anchor comment's own indentation so the inserted line sits at
  // the same nesting level as its sibling lines (e.g. inside a `module { }`
  // block, or a `NavHost { }` block).
  const anchorIndent = lines[anchorLineIdx].match(/^\s*/)[0];
  const insertedLine = `${anchorIndent}${lineToInsert}`;
  lines.splice(anchorLineIdx, 0, insertedLine);
  return { content: lines.join("\n"), skipped: false, diff: `${insertedLine}\n` };
}

function injectImport(content, filePathForErrors, importLine) {
  if (content.split("\n").some((l) => l.trim() === importLine.trim())) {
    return { content, skipped: true, diff: "" };
  }

  const diImportsAnchor = "// cmp:anchor di-imports";
  const lines = content.split("\n");
  const anchorLineIdx = lines.findIndex((l) => l.trim() === diImportsAnchor);
  if (anchorLineIdx !== -1) {
    lines.splice(anchorLineIdx, 0, importLine);
    return { content: lines.join("\n"), skipped: false, diff: `${importLine}\n` };
  }

  // Fallback: append after the last existing `import ` line (used by
  // AppNavHost.kt, which has no dedicated imports anchor).
  let lastImportIdx = -1;
  lines.forEach((line, i) => {
    if (line.startsWith("import ")) lastImportIdx = i;
  });
  if (lastImportIdx === -1) {
    die(`no import block found in ${path.relative(ROOT, filePathForErrors)} to inject "${importLine}" near.`);
  }
  lines.splice(lastImportIdx + 1, 0, importLine);
  return { content: lines.join("\n"), skipped: false, diff: `${importLine}\n` };
}

// Applies an ordered list of (content -> result) steps to one file, chaining
// each step's output into the next, and returns the final content plus a flat
// diff log. Reads the file once; the caller writes it once.
function applyInjectionSteps(filePath, steps) {
  if (!fs.existsSync(filePath)) {
    die(`shared file missing: ${path.relative(ROOT, filePath)} — cannot inject wiring for the new feature.`);
  }
  let content = fs.readFileSync(filePath, "utf8");
  const log = [];
  for (const step of steps) {
    const result = step(content);
    content = result.content;
    log.push({ skipped: result.skipped, diff: result.diff });
  }
  return { filePath, content, log };
}

// ── Plan ─────────────────────────────────────────────────────────────────────

const plan = {
  feature: F,
  entity: E,
  package: PACKAGE,
  files: FILES.map((file) => ({
    from: path.relative(ROOT, file.from),
    to: path.relative(ROOT, file.to),
  })),
};

const APP_MODULE = path.join(SRC("commonMain"), "di/AppModule.kt");
const SCREEN_KT = path.join(SRC("commonMain"), "presentation/navigation/Screen.kt");
const APP_NAV_HOST = path.join(SRC("commonMain"), "presentation/navigation/AppNavHost.kt");

const fileInjectionPlans = [
  {
    filePath: APP_MODULE,
    steps: [
      (c) => injectImport(c, APP_MODULE, `import ${PACKAGE}.data.remote.${E}RepositoryImpl`),
      (c) => injectImport(c, APP_MODULE, `import ${PACKAGE}.domain.repository.${E}Repository`),
      (c) => injectImport(c, APP_MODULE, `import ${PACKAGE}.domain.usecase.Get${E}sUseCase`),
      (c) => injectImport(c, APP_MODULE, `import ${PACKAGE}.presentation.${f}.${F}ViewModel`),
      (c) => injectAtAnchor(c, APP_MODULE, "di-repositories", `single<${E}Repository> { ${E}RepositoryImpl() }`),
      (c) => injectAtAnchor(c, APP_MODULE, "di-usecases", `factory { Get${E}sUseCase(get()) }`),
      (c) => injectAtAnchor(c, APP_MODULE, "di-viewmodels", `viewModelOf(::${F}ViewModel)`),
    ],
  },
  {
    filePath: SCREEN_KT,
    steps: [
      (c) => injectAtAnchor(c, SCREEN_KT, "screen-objects", `data object ${F} : Screen(Routes.${F_UPPER})`),
      (c) => injectAtAnchor(c, SCREEN_KT, "route-consts", `const val ${F_UPPER} = "${f}"`),
    ],
  },
  {
    filePath: APP_NAV_HOST,
    steps: [
      (c) => injectImport(c, APP_NAV_HOST, `import ${PACKAGE}.presentation.${f}.${F}Screen`),
      (c) => injectAtAnchor(c, APP_NAV_HOST, "nav-destinations", `composable(Screen.${F}.route) { ${F}Screen(onItemClick = {}) }`),
    ],
  },
];

const fileResults = fileInjectionPlans.map((p) => applyInjectionSteps(p.filePath, p.steps));

plan.injections = fileResults.flatMap((r) =>
  r.log.map((entry) => ({ file: path.relative(ROOT, r.filePath), skipped: entry.skipped, diff: entry.diff })),
);

// ── Dry-run: print the plan and exit ────────────────────────────────────────

if (dryRun) {
  console.log(`Plan for feature "${F}" (entity "${E}", package "${PACKAGE}"):\n`);
  console.log("Files to create:");
  for (const f of plan.files) console.log(`  ${f.from}\n    -> ${f.to}`);
  console.log("\nAnchor injections:");
  for (const inj of plan.injections) {
    if (inj.skipped) {
      console.log(`  ${inj.file}: (already present, skip)`);
    } else {
      console.log(`  ${inj.file}:`);
      for (const line of inj.diff.split("\n").filter(Boolean)) console.log(`    + ${line}`);
    }
  }
  console.log(`\nspecs/${f}.spec.md will be written with default clauses ${F_UPPER}-01..06.`);
  console.log("\n(dry run — nothing written)");
  process.exit(0);
}

// ── Execute ──────────────────────────────────────────────────────────────────

let filesWritten = 0;
for (const file of FILES) {
  const contents = file.isDefaultSpec ? defaultSpec() : applyRename(fs.readFileSync(file.from, "utf8"));
  fs.mkdirSync(path.dirname(file.to), { recursive: true });
  fs.writeFileSync(file.to, contents);
  filesWritten += 1;
}

let injectionsApplied = 0;
for (const result of fileResults) {
  const anyApplied = result.log.some((entry) => !entry.skipped);
  if (!anyApplied) continue;
  fs.writeFileSync(result.filePath, result.content);
  injectionsApplied += result.log.filter((entry) => !entry.skipped).length;
}

console.log(`✓ Scaffolded feature "${F}" (entity "${E}") — ${filesWritten} files written, ${injectionsApplied} anchor injections applied.`);
console.log(`  specs/${f}.spec.md written with default clauses ${F_UPPER}-01..06 — refine the prose next.`);
console.log(`  Next: capture the golden tree, then run node qa/verify.mjs.`);
