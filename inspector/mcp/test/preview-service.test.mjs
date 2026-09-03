// preview-service: pure helpers + the service loop with an injected render runner
// (no Gradle, no real app — a fake previews dir stands in for renderScreens output).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  summarizeTree,
  diffScreenTrees,
  extractCompileErrors,
  galleryHtml,
  createPreviewService,
  detectAppPackage,
  stateVariantCards,
  componentStoryCards,
  isComponentStoryId,
  laneInProgress,
  consoleRegistryPath,
  findLiveConsole,
  stampRenderMarker,
  touchRenderMarker,
  clearRenderMarker,
  RENDER_MARKER_REL,
} from "../src/lib/preview-service.mjs";
import { resetApprovalsBridgeCache } from "../src/lib/approvals-bridge.mjs";
import { resetCommentsBridgeCache } from "../src/lib/comments-bridge.mjs";
import { resetReceiptBridgeCache } from "../src/lib/receipt-bridge.mjs";
import { copyProjectLib } from "./fixtures/copy-project-lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// copyProjectLib ships approvals.mjs WITH its static relative imports
// (arch-doc.mjs, feature-brief.mjs, …) — a missing sibling fails the bridge's
// dynamic import at load time, which reads as "the whole library is absent"
// rather than as anything specific. The set is derived from the source, so a
// newly added sibling import copies itself (see fixtures/copy-project-lib.mjs).
const REAL_APP_BASE_SPEC = path.join(HERE, "..", "..", "..", "template", "specs", "app-base.spec.md");
const REAL_ARCHITECTURE_DOC = path.join(HERE, "..", "..", "..", "template", "docs", "ARCHITECTURE.md");
const REAL_INPUTS_HASH_LIB = path.join(HERE, "..", "..", "..", "template", "qa", "lib", "inputs-hash.mjs");
const FIXTURE_COMMENTS_LIB = path.join(HERE, "fixtures", "fixture-comments-lib.mjs");
const FIXTURE_APPROVALS_LIB = path.join(HERE, "fixtures", "fixture-approvals-lib.mjs");

/**
 * A minimal generated-project fixture with a REAL qa/lib/approvals.mjs AND the
 * test fixture's qa/lib/comments.mjs (test/fixtures/fixture-comments-lib.mjs —
 * a §7.3-contract implementation; see comments-bridge.test.mjs's header for
 * why this package's tests don't depend on template/qa/lib/comments.mjs).
 */
function makeCommentsFixtureProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-comments-"));
  fs.mkdirSync(path.join(root, "composeApp", "src"), { recursive: true });
  const libDir = path.join(root, "qa", "lib");
  fs.mkdirSync(libDir, { recursive: true });
  fs.copyFileSync(FIXTURE_COMMENTS_LIB, path.join(libDir, "comments.mjs"));
  return root;
}

/**
 * A minimal generated-project fixture with a REAL qa/lib/approvals.mjs (copied
 * from the template, same idea as approvals-bridge.test.mjs) — one resolvable
 * artifact (`design-system`) is enough to exercise the console's approvals
 * wiring end-to-end without a real Gradle/Android project.
 */
function makeApprovalsFixtureProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-approvals-"));
  fs.mkdirSync(path.join(root, "composeApp", "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "composeApp", "build.gradle.kts"), 'android {\n  namespace = "com.acme.demo"\n}\n');
  const themeDir = path.join(
    root,
    "composeApp",
    "src",
    "commonMain",
    "kotlin",
    "com",
    "acme",
    "demo",
    "presentation",
    "theme",
  );
  fs.mkdirSync(themeDir, { recursive: true });
  fs.writeFileSync(path.join(themeDir, "Theme.kt"), "object AcmeColors\n");
  fs.writeFileSync(path.join(themeDir, "Tokens.kt"), "object AcmeTokens\n");
  const libDir = path.join(root, "qa", "lib");
  fs.mkdirSync(libDir, { recursive: true });
  copyProjectLib(libDir, "approvals.mjs");
  return root;
}

/**
 * A minimal generated-project fixture with a REAL presentation/components/
 * directory (one real-shaped component file) AND a REAL qa/lib/approvals.mjs
 * — enough to boot the console end-to-end against a real `components`
 * artifact (CV-1 W3b's "boot the console against a scaffolded app" gate):
 * approve it via the real POST /api/approve -> real library -> real
 * qa/approvals.json, then drift a real file on disk and prove the Components
 * section's per-card badge/chip reflect the REAL approval record and REAL
 * mtime, not a mock.
 */
function makeComponentsFixtureProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-components-"));
  fs.mkdirSync(path.join(root, "composeApp", "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "composeApp", "build.gradle.kts"), 'android {\n  namespace = "com.acme.demo"\n}\n');
  const pkgDir = path.join(root, "composeApp", "src", "commonMain", "kotlin", "com", "acme", "demo");
  const componentsDir = path.join(pkgDir, "presentation", "components");
  fs.mkdirSync(componentsDir, { recursive: true });
  fs.writeFileSync(
    path.join(componentsDir, "ScreenColumn.kt"),
    [
      "package com.acme.demo.presentation.components",
      "",
      "/**",
      " * The page container every screen roots itself in.",
      " */",
      "@Composable",
      "fun ScreenColumn(screenTag: String, content: @Composable () -> Unit) {",
      '  Column(Modifier.semantics { testTag = "${screenTag}_screen" }, content = content)',
      "}",
    ].join("\n"),
  );
  const homeDir = path.join(pkgDir, "presentation", "home");
  fs.mkdirSync(homeDir, { recursive: true });
  fs.writeFileSync(
    path.join(homeDir, "HomeScreen.kt"),
    ["@Composable", 'fun HomeScreen() { ScreenColumn(screenTag = "home") { } }'].join("\n"),
  );
  const libDir = path.join(root, "qa", "lib");
  fs.mkdirSync(libDir, { recursive: true });
  copyProjectLib(libDir, "approvals.mjs");
  return { root, componentsDir };
}

/**
 * A generated-project fixture for the Architecture tab's AD-1 E2E gate: a real
 * presentation/domain/data/di tree (with ONE DELIBERATE data->presentation
 * violating import, planted the same way a lead architect would find one —
 * `ItemRepositoryImpl.kt` reaching up into `presentation/theme`), the REAL
 * specs/app-base.spec.md (so deriveLayerRules parses the actual ARCH-09
 * clause, not a paraphrase), the REAL docs/ARCHITECTURE.md (so the doc-mirror
 * sections are exercised against the real document, not a fixture stand-in),
 * the REAL qa/lib/approvals.mjs (so approve/drift wiring hits the actual
 * governed-artifact registry), and a REAL evidence receipt (Wave C item 1):
 * qa/lib/inputs-hash.mjs is the actual template copy, and qa/evidence/latest.json's
 * inputs.hash is computed with it AFTER every fixture file above is written —
 * so the receipt genuinely attests this exact tree, the same way a real
 * `node qa/verify.mjs` run would, instead of a hand-picked hash string.
 */
async function makeArchitectureFixtureProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-architecture-"));
  fs.mkdirSync(path.join(root, "composeApp", "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "composeApp", "build.gradle.kts"), 'android {\n  namespace = "com.acme.demo"\n}\n');
  const pkgDir = path.join(root, "composeApp", "src", "commonMain", "kotlin", "com", "acme", "demo");

  const themeDir = path.join(pkgDir, "presentation", "theme");
  fs.mkdirSync(themeDir, { recursive: true });
  fs.writeFileSync(path.join(themeDir, "Theme.kt"), "package com.acme.demo.presentation.theme\n\nobject AcmeColors\n");

  const homeDir = path.join(pkgDir, "presentation", "home");
  fs.mkdirSync(homeDir, { recursive: true });
  fs.writeFileSync(
    path.join(homeDir, "HomeViewModel.kt"),
    ["package com.acme.demo.presentation.home", "", "import com.acme.demo.domain.usecase.GetItemsUseCase", "", "class HomeViewModel"].join("\n"),
  );

  const domainDir = path.join(pkgDir, "domain", "usecase");
  fs.mkdirSync(domainDir, { recursive: true });
  fs.writeFileSync(path.join(domainDir, "GetItemsUseCase.kt"), "package com.acme.demo.domain.usecase\n\nclass GetItemsUseCase\n");

  const dataDir = path.join(pkgDir, "data", "remote");
  fs.mkdirSync(dataDir, { recursive: true });
  const violatingFile = path.join(dataDir, "ItemRepositoryImpl.kt");
  fs.writeFileSync(
    violatingFile,
    [
      "package com.acme.demo.data.remote",
      "",
      "import com.acme.demo.domain.usecase.GetItemsUseCase",
      "import com.acme.demo.presentation.theme.Theme", // deliberate ARCH-09 violation
      "",
      "class ItemRepositoryImpl",
    ].join("\n"),
  );

  const diDir = path.join(pkgDir, "di");
  fs.mkdirSync(diDir, { recursive: true });
  fs.writeFileSync(path.join(diDir, "AppModule.kt"), "package com.acme.demo.di\n\nobject AppModule\n");

  const specsDir = path.join(root, "specs");
  fs.mkdirSync(specsDir, { recursive: true });
  fs.copyFileSync(REAL_APP_BASE_SPEC, path.join(specsDir, "app-base.spec.md"));

  const docsDir = path.join(root, "docs");
  fs.mkdirSync(docsDir, { recursive: true });
  fs.copyFileSync(REAL_ARCHITECTURE_DOC, path.join(docsDir, "ARCHITECTURE.md"));

  const libDir = path.join(root, "qa", "lib");
  fs.mkdirSync(libDir, { recursive: true });
  copyProjectLib(libDir, "approvals.mjs");
  fs.copyFileSync(REAL_INPUTS_HASH_LIB, path.join(libDir, "inputs-hash.mjs"));

  // The evidence receipt: computed with the REAL algorithm over the tree as
  // it stands right now (every file above already written) — bit-for-bit the
  // same inputsHash `node qa/verify.mjs` would have produced.
  const { computeInputsHash } = await import(pathToFileURL(path.join(libDir, "inputs-hash.mjs")).href);
  const { hash: inputsHash, fileCount } = computeInputsHash(root);
  const evidenceDir = path.join(root, "qa", "evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(
    path.join(evidenceDir, "latest.json"),
    JSON.stringify(
      {
        schema: "cmp-evidence/1",
        profile: "local",
        verdict: "PASS",
        commit: { sha: "abc123def456", dirty: [] },
        inputs: { hash: inputsHash, fileCount },
        steps: [{ name: "conformance", verdict: "PASS", durationMs: 4210 }],
        artifacts: [],
        toolVersions: { node: process.version, platform: `${process.platform}-${process.arch}` },
        generatedAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(), // 90 minutes ago
      },
      null,
      2,
    ),
  );

  return { root, violatingFile, specFile: path.join(specsDir, "app-base.spec.md") };
}

/** The <div class="arch-top-status">...</div> slice of a page, for badge assertions scoped to the Architecture tab (not the Approvals tab, which uses similar badge text elsewhere on the same page). */
// §3.2 (R4): the architecture artifact's status lives ONLY in the shell's
// page header now — the body renders no arch-top-status block. This helper
// extracts the Architecture section's header status line.
function archHeaderStatus(page) {
  const m = page.match(/id="tab-architecture"[\s\S]*?<p class="page-status">([\s\S]*?)<\/p>/);
  return m ? m[1] : "";
}

test("service: Architecture tab — boots against a real layer tree + the REAL app-base.spec.md/ARCHITECTURE.md/approvals/inputs-hash libraries; doc-shaped structure, a deliberate ARCH-09 violation with file:line, a real receipt's per-clause status + the advisory label, then approve + drift", async () => {
  const { root: projectDir, violatingFile, specFile } = await makeArchitectureFixtureProject();
  const service = createPreviewService({ projectDir, port: 19891, hot: false, runRender: async () => {} });
  try {
    const st = await service.start();
    await new Promise((r) => setTimeout(r, 100));

    // 1. Authored form: the tab mirrors docs/ARCHITECTURE.md's own section shape.
    let page = await (await fetch(st.url)).text();
    assert.match(page, /1\. Purpose &amp; quality goals/);
    assert.match(page, /3\. System context/);
    assert.match(page, /4\. Platform &amp; deployment view/);
    assert.match(page, /5\. Building blocks/);
    assert.match(page, /6\. Runtime view/);
    assert.match(page, /7\. Crosscutting policies/);
    assert.match(page, /8\. Decisions/);

    // 2. Derived truth: the real quality-attribute table + platform table
    //    from the real doc, and the real layer map from the real tree.
    assert.match(page, /Maintainability/);
    assert.match(page, /commonMain/);
    assert.match(page, /GetItemsUseCase\.kt/);

    // 3. Drift surface: the deliberately-injected data->presentation import
    //    is drawn as a violation, in red, with file:line, naming ARCH-09 —
    //    the real clause the real spec's prose resolves to.
    assert.match(page, /class="dep-edge dep-violation"/);
    assert.match(page, /violates ARCH-09/);
    assert.match(page, /ItemRepositoryImpl\.kt:4/, "the violating import is on line 4 of the fixture file");
    assert.doesNotMatch(page, /unchecked, not clean/, "the real spec resolved real rules — violations were actually checked");

    // 3b. Wave C item 1: a real receipt (qa/evidence/latest.json, inputsHash
    //     computed with the REAL qa/lib/inputs-hash.mjs over this exact tree)
    //     renders each ARCH-* clause's last-receipt status — the real
    //     "conformance" step verdict, not stale (the tree hasn't changed
    //     since the receipt was written).
    assert.match(page, /class="receipt-badge receipt-pass"[^>]*>conformance: PASS</, "ARCH clause rows show the real receipt's conformance verdict");
    assert.match(page, /class="receipt-age">1h ago</, "receipt age is computed from the real generatedAt");
    assert.doesNotMatch(page, /stale receipt/, "the tree hasn't changed since the receipt was written — not stale");

    // Wave C item 2: the console's own JS import-scan (the dependency graph
    // above) is labeled advisory, next to the graph it draws — the Kotlin
    // conformance gates + the receipt are the law, not this live scan.
    assert.match(page, /class="dep-advisory">Advisory preview; the lane is the law/);

    // Not yet approved -> the honest "unsigned" status in the section's
    // HEADER (§2 grammar); the body never re-renders it (no arch-top-status).
    assert.match(archHeaderStatus(page), /unsigned — not yet approved/);
    assert.doesNotMatch(page, /arch-top-status/, "R4: the body's duplicate status block is gone — the shell header owns it");

    // 4. Approve the architecture artifact via the real POST /api/approve -> real library.
    const approveRes = await fetch(`${st.url}api/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy: "Test Signer <test@example.com>", artifact: "architecture" }),
    });
    assert.equal((await approveRes.json()).ok, true);

    page = await (await fetch(st.url)).text();
    assert.match(archHeaderStatus(page), /glyph-signed/);
    assert.match(archHeaderStatus(page), /signed <code>/);

    // 5. Drift: edit the REAL governed file after approval; the artifact's own
    //    hash-bound status flips to changed-since-approval, and the tab's own
    //    badge reflects it (not just the Approvals tab's row).
    fs.appendFileSync(specFile, "\n<!-- edited after approval -->\n");
    page = await (await fetch(st.url)).text();
    assert.match(archHeaderStatus(page), /status-drift">drifted — changed since approval/);

    // 5b. The same edit that drifted the approval also changed the verified
    //     surface's REAL inputsHash — the committed receipt now attests a
    //     tree that no longer exists. The clause rows must say so honestly
    //     ("stale receipt"), never keep presenting the old PASS as current.
    assert.doesNotMatch(page, /class="receipt-badge receipt-pass"/, "a stale receipt must not render the pass-colored badge as if it were current");
    assert.match(page, /class="receipt-badge receipt-stale"[^>]*>stale receipt</);
    assert.match(page, /conformance was PASS 1h ago &mdash; source changed since/);

    // Sanity: the violating file really is where the test thinks it is.
    assert.ok(fs.existsSync(violatingFile));
  } finally {
    service.stop();
    resetApprovalsBridgeCache(projectDir);
    resetReceiptBridgeCache(projectDir);
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

/**
 * A minimal generated-project fixture with the test fixture's
 * qa/lib/approvals.mjs (test/fixtures/fixture-approvals-lib.mjs — the §3
 * reopenArtifact/mode contract; see that file's header for why the
 * /api/reopen tests don't depend on template/qa/lib/approvals.mjs, which
 * Agent T is landing reopenArtifact into in parallel with this wave).
 */
function makeReopenFixtureProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-reopen-"));
  fs.mkdirSync(path.join(root, "composeApp", "src"), { recursive: true });
  const libDir = path.join(root, "qa", "lib");
  fs.mkdirSync(libDir, { recursive: true });
  fs.copyFileSync(FIXTURE_APPROVALS_LIB, path.join(libDir, "approvals.mjs"));
  return root;
}

const NODE = (over = {}) => ({
  testTag: null,
  text: null,
  contentDescription: null,
  role: null,
  clickable: false,
  disabled: false,
  bounds: { x: 0, y: 0, width: 100, height: 50 },
  designToken: null,
  children: [],
  ...over,
});

const TREE = (rootOver = {}) => ({
  schemaVersion: 1,
  source: "headless-jvm",
  root: NODE({
    bounds: { x: 0, y: 0, width: 411, height: 891 },
    children: [
      NODE({ testTag: "title", text: "Hello" }),
      NODE({ designToken: { tokens: ["RadiusCard"], resolved: { radius: "16dp" } } }),
    ],
    ...rootOver,
  }),
});

test("summarizeTree counts nodes, tokenized, tagged", () => {
  assert.deepEqual(summarizeTree(TREE()), { nodes: 3, tokenized: 1, tagged: 1 });
});

test("diffScreenTrees: null prev = no changes; content changes, additions, removals detected", () => {
  const a = new Map([["home", "{1}"], ["shell", "{2}"]]);
  assert.deepEqual(diffScreenTrees(null, a), []);
  assert.deepEqual(diffScreenTrees(a, new Map(a)), []);
  const b = new Map([["home", "{1'}"], ["detail", "{3}"]]);
  const changed = diffScreenTrees(a, b);
  assert.ok(changed.includes("home"), "content change detected");
  assert.ok(changed.includes("detail"), "added screen detected");
  assert.ok(changed.includes("shell"), "removed screen detected");
});

test("stateVariantCards: groups @loading/@empty/@error preview-registry entries by state; plain screen ids are ignored; honest empty groups when none registered", () => {
  const cards = [
    { screen: { id: "home", title: "Home tab", png: "home/screen.png" } },
    { screen: { id: "home@empty", title: "Home — empty", png: "home@empty/screen.png" } },
    { screen: { id: "home@loading", title: "Home — loading", png: "home@loading/screen.png" } },
    { screen: { id: "detail@error", title: "Detail — error", png: "detail@error/screen.png" } },
  ];
  const grouped = stateVariantCards(cards);
  assert.deepEqual(grouped.empty, [{ id: "home@empty", title: "Home — empty", png: "home@empty/screen.png", baseScreen: "home" }]);
  assert.deepEqual(grouped.loading, [{ id: "home@loading", title: "Home — loading", png: "home@loading/screen.png", baseScreen: "home" }]);
  assert.deepEqual(grouped.error, [{ id: "detail@error", title: "Detail — error", png: "detail@error/screen.png", baseScreen: "detail" }]);

  assert.deepEqual(stateVariantCards([{ screen: { id: "home", title: "Home tab", png: "home/screen.png" } }]), {
    loading: [],
    empty: [],
    error: [],
  });
});

test("extractCompileErrors: kotlin e:-lines, task/build FAILED markers; quiet output yields none", () => {
  const failing = [
    "> Task :composeApp:compileKotlinDesktop",
    "e: file:///app/src/Today.kt:12:5 Unresolved reference: fooo",
    "e: file:///app/src/Today.kt:14:1 Expecting an expression",
    "> Task :composeApp:compileKotlinDesktop FAILED",
    "BUILD FAILED in 2s",
  ].join("\n");
  const errs = extractCompileErrors(failing);
  assert.equal(errs.length, 4, "two e: lines + task FAILED + BUILD FAILED");
  assert.match(errs[0], /Unresolved reference: fooo/);

  const quiet = [
    "> Task :composeApp:compileKotlinDesktop",
    "BUILD SUCCESSFUL in 1s",
    "reloading classes: 1 changed",
    "some line mentioning failed tests in prose", // no marker shape → not a compile error
  ].join("\n");
  assert.deepEqual(extractCompileErrors(quiet), []);
});

test("galleryHtml embeds cards, changed flags, version cache-buster, and the error banner", () => {
  const tree = TREE();
  const html = galleryHtml({
    appName: "Acme",
    viewport: { width: 411, height: 891 },
    version: 7,
    changed: ["home"],
    error: "boom & <bang>",
    cards: [
      {
        screen: { id: "home", title: "Home tab", png: "home/screen.png" },
        svg: "<svg xmlns='http://www.w3.org/2000/svg'></svg>",
        summary: summarizeTree(tree),
        a11y: { pass: false, violations: [{ rule: "missing-label" }] },
      },
    ],
  });
  // STUDIO-REDESIGN §2: the shell — title, rail (app name + nav), page grammar.
  assert.match(html, /<title>Acme &middot; studio<\/title>/);
  assert.match(html, /class="rail-app">Acme</, "rail carries the app name");
  assert.match(html, /class="page-foot">.*absence = not derivable/, "provenance footer present");
  assert.match(html, /matrix-row changed/, "changed row is flagged");
  assert.match(html, /\/previews\/home\/screen\.png\?v=7/, "png served with version buster");
  assert.match(html, /1 violation</);
  assert.match(html, /render FAILED|last render FAILED/, "error banner present");
  assert.match(html, /boom &amp; &lt;bang&gt;/, "error is escaped");
  assert.match(html, /EventSource\("\/events"\)/, "SSE client wired");
});

test("galleryHtml: filter box, persistent changed-badge, hover before/after on changed cards", () => {
  const tree = TREE();
  const card = (id) => ({
    screen: { id, title: `${id} screen`, png: `${id}/screen.png` },
    svg: "<svg xmlns='http://www.w3.org/2000/svg'></svg>",
    summary: summarizeTree(tree),
    a11y: { pass: true, violations: [] },
  });
  const html = galleryHtml({
    appName: "Acme",
    viewport: { width: 411, height: 891 },
    version: 7,
    changed: ["home"],
    changedVersions: { home: 7, profile: 3 },
    cards: [card("home"), card("profile")],
  });
  assert.match(html, /id="filter"/, "filter input present");
  assert.match(html, /sessionStorage/, "filter survives SSE reloads");
  assert.match(html, /changed #7/, "current change badged");
  assert.match(html, /changed #3/, "older change attribution persists");
  assert.match(html, /home\/screen\.prev\.png\?v=7/, "changed card offers the before image");
  assert.match(html, /hover = before/, "compare affordance labelled");
  assert.doesNotMatch(html, /profile\/screen\.prev\.png/, "unchanged card has no compare");

  // First generation: nothing to compare against yet.
  const first = galleryHtml({
    appName: "Acme",
    viewport: { width: 411, height: 891 },
    version: 1,
    changed: ["home"],
    changedVersions: { home: 1 },
    cards: [card("home")],
  });
  assert.doesNotMatch(first, /screen\.prev\.png/);
});

test("galleryHtml (§2 rail): Overview is the front door, then the genesis definition order", () => {
  const html = galleryHtml({ appName: "Acme", viewport: { width: 411, height: 891 }, version: 1, cards: [] });
  const nav = html.match(/<nav class="rail-nav">([\s\S]*?)<\/nav>/)[1];
  const order = [...nav.matchAll(/data-tab="([a-z-]+)"/g)].map((m) => m[1]);
  // Overview leads: the front door (§3.0) — the returning owner's entry point,
  // and the ONE section permitted to aggregate. Then the definition order
  // (decide-first briefs, spec-first behavior, UI-first visuals): intent →
  // Features (the decide layer — a brief speaks intent's vocabulary, so it sits
  // DIRECTLY after Intent; CHANGE-FLOW-DESIGN.md §6) → architecture → the
  // exemplar's surfaces (Specs, Screens) → design language + components, which
  // lock on / distill from those screens.
  // PW-5 extends the arc's tail: Walkthrough sits after Evidence (it IS
  // evidence, derived from committed manifests) and Live device is deliberately
  // LAST — the console arc ends DRIVE (A1). Digest is no longer a tab: a
  // since-you-last-looked read that must be SOUGHT OUT is not a returning
  // human's first read, so it lives inside the front door.
  assert.deepEqual(order, [
    "overview",
    "intent",
    "features",
    "architecture",
    "specs",
    "screens",
    "design-system",
    "components",
    "evidence",
    "walkthrough",
    "approvals",
    "comments",
    "live-device",
  ]);
  assert.match(html, /id="tab-overview" class="tab-panel active/, "the front door is the default page");
  assert.doesNotMatch(html, /data-tab="digest"/, "Digest is retired into the front door — one surface, not two");
  assert.match(html, /previewTab"\) \|\| "overview"/, "a fresh session lands on the front door; hash + sticky tab still win");
  assert.match(html, /id="tab-intent" class="tab-panel/, "Intent section present");
  assert.match(html, /Not yet captured &mdash; conversation 0 pending/, "no intent data -> the §3.0 pending state");
});

test("galleryHtml (rail-truth): colour = pending human work — a neutral glyph means truly nothing pending", () => {
  const base = { appName: "Acme", viewport: { width: 411, height: 891 }, version: 1, cards: [] };
  const featureBtn = (html) => html.match(/<button[^>]*data-tab="features"[^>]*>.*?<\/button>/s)[0];
  const approvalsBtn = (html) => html.match(/<button[^>]*data-tab="approvals"[^>]*>.*?<\/button>/s)[0];
  const specsBtn = (html) => html.match(/<button[^>]*data-tab="specs"[^>]*>.*?<\/button>/s)[0];
  const brief = (phase) => ({
    name: "meal", rel: "docs/features/meal.md", phase, record: null, touches: [], blockError: null,
    specRel: "specs/meal.spec.md", specExists: false, clauses: [], covered: 0, total: 0,
    receipt: { present: false, verdict: null, attestsTree: false }, provenDone: false,
    doneReason: "no spec yet (specs/meal.spec.md) — behavior starts as clauses there",
  });

  // A brief awaiting the human's signature lights Features the moment the file exists.
  const proposed = galleryHtml({
    ...base,
    features: { available: true, board: { features: [brief("proposed")], undeclared: [] } },
    approvals: { available: true, statuses: [
      { id: "feature-brief:meal", status: "unreviewed" },
      { id: "exemplar-spec", status: "approved" },
    ] },
  });
  assert.match(featureBtn(proposed), /glyph-unsigned/, "proposed brief = colour on Features");
  assert.match(featureBtn(proposed), /awaiting signature/);
  assert.match(approvalsBtn(proposed), /glyph-unsigned/, "the work queue shows the pending decision");
  assert.match(approvalsBtn(proposed), /1 decision\(s\) waiting/);
  assert.match(specsBtn(proposed), /glyph-signed/, "all specs signed reads green, not neutral");

  // Drift outranks everything.
  const drifted = galleryHtml({
    ...base,
    features: { available: true, board: { features: [brief("changed-since-approval")], undeclared: [] } },
    approvals: { available: true, statuses: [
      { id: "feature-brief:meal", status: "changed-since-approval" },
      { id: "feature-spec:meal", status: "changed-since-approval" },
    ] },
  });
  assert.match(featureBtn(drifted), /glyph-drift/);
  assert.match(specsBtn(drifted), /glyph-drift/, "a drifted spec is colour on the Specs roll-up");
  assert.match(approvalsBtn(drifted), /glyph-drift/);

  // All green: signed dots, not neutral — the baseline Karel asked for.
  const green = galleryHtml({
    ...base,
    features: { available: true, board: { features: [{ ...brief("accepted"), record: { status: "approved", accepted: true } }], undeclared: [] } },
    approvals: { available: true, statuses: [
      { id: "feature-brief:meal", status: "approved" },
      { id: "feature-spec:meal", status: "approved" },
    ] },
  });
  assert.match(featureBtn(green), /glyph-signed/);
  assert.match(specsBtn(green), /glyph-signed/);
  assert.match(approvalsBtn(green), /glyph-signed/);
  assert.match(approvalsBtn(green), /nothing waiting on you/);

  // No data at all: the neutral dot is honest.
  const empty = galleryHtml(base);
  assert.match(featureBtn(empty), /glyph-none/, "no briefs = truly nothing pending = neutral");
});

test("galleryHtml (rail-truth semantics): reopen never reads as drift; acceptances count as work; Screens reds on failure", () => {
  const base = { appName: "Acme", viewport: { width: 411, height: 891 }, version: 1, cards: [] };
  const btn = (html, tab) => html.match(new RegExp(`<button[^>]*data-tab="${tab}"[^>]*>.*?</button>`, "s"))[0];
  const brief = (phase, over = {}) => ({
    name: "meal", rel: "docs/features/meal.md", phase, record: { status: "approved" }, touches: [], blockError: null,
    specRel: "specs/meal.spec.md", specExists: true, clauses: [{ id: "MEAL-01", withdrawn: false, cited: true }],
    covered: 1, total: 1, receipt: { present: true, verdict: "PASS", attestsTree: true }, provenDone: false,
    doneReason: "…", ...over,
  });

  // Reopen is a SANCTIONED redesign — amber ◐, never collapsed into drift red.
  const reopened = galleryHtml({
    ...base,
    features: { available: true, board: { features: [brief("reopened")], undeclared: [] } },
    approvals: { available: true, statuses: [{ id: "feature-brief:meal", status: "reopened" }] },
  });
  assert.match(btn(reopened, "features"), /glyph-reopen/);
  assert.doesNotMatch(btn(reopened, "features"), /glyph-drift/);

  // A proven feature awaiting acceptance is accent (attn), and the Approvals
  // work queue COUNTS it — Features and Approvals never tell different stories.
  const proven = galleryHtml({
    ...base,
    features: { available: true, board: { features: [brief("proven", { provenDone: true })], undeclared: [] } },
    approvals: { available: true, statuses: [{ id: "feature-brief:meal", status: "approved" }, { id: "feature-spec:meal", status: "approved" }] },
  });
  assert.match(btn(proven, "features"), /glyph-attn/);
  assert.match(btn(proven, "approvals"), /1 decision\(s\) waiting \(1 acceptance\)/);
  assert.doesNotMatch(btn(proven, "approvals"), /nothing waiting on you/);

  // Screens is ungoverned — never green; red exactly when the last render or
  // compile failed (the gallery may be stale), neutral otherwise.
  const failed = galleryHtml({ ...base, error: "e: boom", errorSource: "compile" });
  assert.match(btn(failed, "screens"), /glyph-drift/);
  assert.match(btn(failed, "screens"), /last compile failed/);
  assert.match(btn(galleryHtml(base), "screens"), /glyph-none/);
});

test("galleryHtml (change surface): a drifted artifact shows WHAT changed and what is still approved, in its own section", () => {
  const anchored = {
    available: true,
    anchorSha: "abc1234",
    anchorWhen: "2026-07-21 10:00:00 +0200",
    diff: "--- a/presentation/components/AppButton.kt\n+++ b/presentation/components/AppButton.kt\n-old\n+new",
    truncated: false,
    files: {
      changed: [{ status: "M", path: "presentation/components/AppButton.kt" }],
      unchanged: ["presentation/components/AppHeader.kt", "presentation/components/ListItemCard.kt"],
    },
  };
  const html = galleryHtml({
    appName: "Acme", viewport: { width: 411, height: 891 }, version: 1, cards: [],
    approvals: {
      available: true,
      statuses: [{
        id: "components", label: "Components", status: "changed-since-approval", hash: "b", storedHash: "a",
        approvedAt: "2026-07-21T08:00:00Z", fileCount: 3, missing: [], resolvable: true,
      }],
    },
    anchoredDiffs: { components: anchored },
  });
  const section = html.match(/<section id="tab-components"[\s\S]*?(?=<section id="tab-)/)[0];
  assert.match(section, /drift-panel/, "the drift panel renders in the artifact's OWN section");
  assert.match(section, /Changed since signature/);
  assert.match(section, /<strong>2 of 3<\/strong> file\(s\) still exactly as signed/);
  assert.match(section, /AppButton\.kt/);
  assert.match(section, /2 file\(s\) still exactly as signed/);
  assert.match(section, /anchor abc1234/);
  assert.match(section, /Re-approve components/, "re-approval offered where the drift is read");
  // …and the Approvals table carries the same panel (without a second button).
  const approvalsSection = html.match(/<section id="tab-approvals"[\s\S]*?(?=<section id="tab-)/)[0];
  assert.match(approvalsSection, /drift-panel/);
});

test("galleryHtml (§3.0): intent sections render with a fill-count status; spec-line comments on specs/intent.md attribute to Intent, not Specs", () => {
  const html = galleryHtml({
    appName: "Acme",
    viewport: { width: 411, height: 891 },
    version: 1,
    cards: [],
    intent: {
      available: true,
      title: "Intent brief",
      sections: [
        { heading: "Purpose", body: "A pocket birding log.", filled: true, guidance: null },
        { heading: "Audience", body: "_not yet captured — x._", filled: false, guidance: "x." },
      ],
    },
    specs: { available: true, files: [], orphanCitations: [] },
    comments: {
      available: true,
      comments: [
        {
          id: "c-1",
          status: "open",
          target: { type: "spec-line", file: "specs/intent.md", clauseId: "Purpose" },
          text: "sharpen this",
          author: "human",
          createdAt: "2026-07-19T10:00:00Z",
        },
      ],
    },
  });
  assert.match(html, /A pocket birding log\./, "the brief's own prose renders");
  const statusOf = (id) => html.match(new RegExp(`<section id="tab-${id}"[\\s\\S]*?class="page-status">([\\s\\S]*?)</p>`))[1];
  assert.match(statusOf("intent"), /1 of 2 sections captured/);
  assert.match(statusOf("intent"), /1 open comment/, "intent.md spec-line comment counts under Intent");
  assert.doesNotMatch(statusOf("specs"), /open comment/, "…and not under Specs");
});

// --- FI-9 Change A: the render-in-progress marker (symmetric with LANE_MARKER) -----

test("stampRenderMarker: writes '<pid> <ISO>\\n' under composeApp/build, creating the dir if needed", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-render-marker-"));
  try {
    stampRenderMarker(projectDir);
    const p = path.join(projectDir, ...RENDER_MARKER_REL);
    assert.ok(fs.existsSync(p), "composeApp/build/.cmp-render-in-progress was created");
    const text = fs.readFileSync(p, "utf8");
    assert.match(text, /^\d+ \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\n$/, "mirrors the lane marker's own '<pid> <ISO>\\n' format");
    assert.equal(Number(text.split(" ")[0]), process.pid);
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("clearRenderMarker: removes the marker; a repeat call (nothing to remove) does not throw", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-render-marker-"));
  try {
    stampRenderMarker(projectDir);
    const p = path.join(projectDir, ...RENDER_MARKER_REL);
    assert.ok(fs.existsSync(p));
    clearRenderMarker(projectDir);
    assert.ok(!fs.existsSync(p));
    assert.doesNotThrow(() => clearRenderMarker(projectDir));
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("touchRenderMarker: refreshes mtime when a marker is stamped; a no-op (never throws) when it isn't", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-render-marker-"));
  try {
    // No marker stamped yet — touch must be a silent no-op (this is what makes
    // wiring it into every touch() call in the service safe, even outside a render).
    assert.doesNotThrow(() => touchRenderMarker(projectDir));
    assert.ok(!fs.existsSync(path.join(projectDir, ...RENDER_MARKER_REL)));

    stampRenderMarker(projectDir);
    const p = path.join(projectDir, ...RENDER_MARKER_REL);
    const before = fs.statSync(p).mtimeMs;
    // Back-date the marker so a refresh is observable even on filesystems with
    // coarse mtime resolution.
    const past = new Date(before - 60_000);
    fs.utimesSync(p, past, past);
    assert.ok(fs.statSync(p).mtimeMs < before);
    touchRenderMarker(projectDir);
    assert.ok(fs.statSync(p).mtimeMs > past.getTime(), "touch bumped mtime forward");
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("render marker vs. lane marker: independent files, same '<pid> <ISO>' contract, distinguishable by name", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-render-marker-"));
  try {
    const laneMarkerPath = path.join(projectDir, "composeApp", "build", ".cmp-lane-in-progress");
    fs.mkdirSync(path.dirname(laneMarkerPath), { recursive: true });
    fs.writeFileSync(laneMarkerPath, `${process.pid} ${new Date().toISOString()}\n`);
    assert.equal(laneInProgress(projectDir), true, "the lane marker still reads as in-progress");

    stampRenderMarker(projectDir);
    // Both markers coexist without clobbering each other.
    assert.ok(fs.existsSync(laneMarkerPath));
    assert.ok(fs.existsSync(path.join(projectDir, ...RENDER_MARKER_REL)));
    assert.notEqual(RENDER_MARKER_REL.at(-1), ".cmp-lane-in-progress");

    clearRenderMarker(projectDir);
    assert.ok(!fs.existsSync(path.join(projectDir, ...RENDER_MARKER_REL)));
    assert.equal(laneInProgress(projectDir), true, "clearing the render marker never touches the lane marker");
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: a render marker left stamped from a prior process does not stop the service — renderCycle's own runRender wrapping owns it, not renderCycle itself", async () => {
  // This documents the intended split of ownership: renderCycle() only ever
  // DEFERS on the LANE marker (laneInProgress); it never reads the render
  // marker itself — the render marker exists for the *other* side's consumer
  // (qa/verify.mjs's shGradle) to read. A stale one left on disk (e.g. from a
  // killed daemon before this fix, or a crash) must never wedge a fresh service.
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-"));
  fs.mkdirSync(path.join(projectDir, "composeApp", "src"), { recursive: true });
  const previewsDir = path.join(projectDir, "composeApp", "build", "previews");
  stampRenderMarker(projectDir); // simulate a leftover marker from a previous run

  const service = createPreviewService({
    projectDir,
    port: 19980,
    hot: false,
    runRender: async () => writeFakePreviews(previewsDir, ["shell"]),
  });
  try {
    await service.start();
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(service.status().version, 1, "render proceeds normally; the render marker never gates renderCycle");
  } finally {
    service.stop();
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

// --- service loop with a fake renderer ---------------------------------------------

function writeFakePreviews(previewsDir, screens, stamps = {}) {
  for (const id of screens) {
    fs.mkdirSync(path.join(previewsDir, id), { recursive: true });
    fs.writeFileSync(
      path.join(previewsDir, id, "tree.json"),
      JSON.stringify(TREE({ children: [NODE({ testTag: id, text: `${id}@${stamps[id] ?? 1}` })] })),
    );
    fs.writeFileSync(path.join(previewsDir, id, "screen.png"), Buffer.from([0x89, 0x50]));
  }
  fs.writeFileSync(
    path.join(previewsDir, "manifest.json"),
    JSON.stringify({
      viewport: { width: 411, height: 891, treeDensity: 1, pngScale: 2 },
      screens: screens.map((id) => ({
        id,
        title: `${id} screen`,
        tree: `${id}/tree.json`,
        png: `${id}/screen.png`,
      })),
    }),
  );
}

test("service: start serves the gallery, re-render marks changed screens, stop closes", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-"));
  fs.mkdirSync(path.join(projectDir, "composeApp", "src"), { recursive: true });
  const previewsDir = path.join(projectDir, "composeApp", "build", "previews");

  const stamps = { shell: 1, home: 1 };
  const service = createPreviewService({
    projectDir,
    port: 19700, // test range, probes upward if busy
    // Gradle path only. The daemon port is machine-global: with `hot` left on,
    // a daemon running for ANY project on this machine gets probed, and
    // adoption schedules its own render — which shows up here as an extra
    // version bump and a flaky assertion. This test drives renderCycle()
    // by hand; the counts must be exactly the cycles it asked for.
    hot: false,
    runRender: async () => writeFakePreviews(previewsDir, ["shell", "home"], stamps),
  });

  try {
    const st = await service.start();
    assert.ok(st.url, "server is listening");
    // start() kicks an async first render; wait for it.
    await new Promise((r) => setTimeout(r, 100));

    let status = service.status();
    assert.equal(status.version, 1, "first render loaded");
    assert.deepEqual(
      status.screens.map((s) => s.id),
      ["shell", "home"],
    );

    const page = await (await fetch(st.url)).text();
    assert.match(page, /shell screen/);
    assert.match(page, /home screen/);

    const png = await fetch(`${st.url}previews/home/screen.png?v=1`);
    assert.equal(png.status, 200);
    assert.equal(png.headers.get("content-type"), "image/png");

    // Traversal is blocked.
    const evil = await fetch(`${st.url}previews/..%2F..%2F..%2Fetc%2Fpasswd`);
    assert.equal(evil.status, 404);

    // Second render with changed home content → only home flagged.
    stamps.home = 2;
    await service._renderCycle();
    status = service.status();
    assert.equal(status.version, 2);
    assert.deepEqual(status.changedLastRender, ["home"]);

    const status2 = await (await fetch(`${st.url}status`)).json();
    assert.equal(status2.version, 2);
  } finally {
    service.stop();
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: render failure keeps previous state and reports lastError", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-"));
  fs.mkdirSync(path.join(projectDir, "composeApp", "src"), { recursive: true });
  const previewsDir = path.join(projectDir, "composeApp", "build", "previews");

  let fail = false;
  const service = createPreviewService({
    projectDir,
    port: 19720,
    runRender: async () => {
      if (fail) throw new Error("compile broke");
      writeFakePreviews(previewsDir, ["shell"]);
    },
  });

  try {
    await service.start();
    await new Promise((r) => setTimeout(r, 100));
    let status = service.status();
    assert.equal(status.version, 1);
    // FI-9 Change B: the first successful render marks the renderer healthy.
    assert.equal(status.renderer.lastOutcome, "ok");
    assert.ok(status.renderer.lastSuccessAt, "lastSuccessAt is stamped");
    assert.ok(status.renderer.lastAttemptAt, "lastAttemptAt is stamped");
    assert.equal(status.renderer.consecutiveFailures, 0);
    const firstSuccessAt = status.renderer.lastSuccessAt;

    fail = true;
    await service._renderCycle();
    status = service.status();
    assert.equal(status.version, 1, "previous render is kept");
    assert.match(status.lastError, /compile broke/);
    // The renderer health object tracks the render PIPELINE's own failure,
    // independent of (but consistent with) lastError/lastErrorSource here.
    assert.equal(status.renderer.lastOutcome, "failed");
    assert.equal(status.renderer.consecutiveFailures, 1);
    assert.equal(status.renderer.lastSuccessAt, firstSuccessAt, "lastSuccessAt is untouched by a failed attempt");
    assert.ok(status.renderer.lastAttemptAt >= firstSuccessAt, "lastAttemptAt advanced");

    // A second consecutive failure increments the streak.
    await service._renderCycle();
    assert.equal(service.status().renderer.consecutiveFailures, 2);

    const page = await (await fetch(status.url)).text();
    assert.match(page, /last render FAILED/, "gallery shows the failure banner");
    assert.match(page, /shell screen/, "previous cards still shown");
    // FI-9 Change B: the distinct renderer-down banner, separate from the
    // generic failure banner above — states since-when + the render error.
    assert.match(page, /<div class="banner banner-renderer">/, "the renderer-down banner is rendered");
    assert.match(page, /Renderer down since/, "banner states the down-since framing");
    assert.match(page, /compile broke/, "banner surfaces the underlying render error");

    // Recovery: a good render clears the renderer failure state.
    fail = false;
    await service._renderCycle();
    status = service.status();
    assert.equal(status.renderer.lastOutcome, "ok");
    assert.equal(status.renderer.consecutiveFailures, 0);
    const recoveredPage = await (await fetch(status.url)).text();
    assert.doesNotMatch(recoveredPage, /<div class="banner banner-renderer">/, "the renderer-down banner clears on recovery");
  } finally {
    service.stop();
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: renderer.lastOutcome starts 'never' before any render has run", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-"));
  fs.mkdirSync(path.join(projectDir, "composeApp", "src"), { recursive: true });
  const service = createPreviewService({ projectDir, port: 19985, hot: false, runRender: async () => {} });
  try {
    const status = service.status();
    assert.deepEqual(status.renderer, {
      lastOutcome: "never",
      lastSuccessAt: null,
      lastAttemptAt: null,
      consecutiveFailures: 0,
    });
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: waitForRender resolves on render completion, times out when nothing happens", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-"));
  fs.mkdirSync(path.join(projectDir, "composeApp", "src"), { recursive: true });
  const previewsDir = path.join(projectDir, "composeApp", "build", "previews");

  const stamps = { shell: 1 };
  const service = createPreviewService({
    projectDir,
    port: 19760,
    runRender: async () => writeFakePreviews(previewsDir, ["shell"], stamps),
  });

  try {
    await service.start();
    await new Promise((r) => setTimeout(r, 100));

    // Waiter settled by the next render cycle, carrying the fresh status.
    stamps.shell = 2;
    const pending = service.waitForRender(5000);
    await service._renderCycle();
    const settled = await pending;
    assert.equal(settled.timedOut, false);
    assert.equal(settled.version, 2);
    assert.deepEqual(settled.changedLastRender, ["shell"]);
    assert.equal(settled.screens[0].lastChangedVersion, 2, "attribution persists in status");

    // No render coming → timeout flag, not a hang.
    const timedOut = await service.waitForRender(60);
    assert.equal(timedOut.timedOut, true);
  } finally {
    service.stop();
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: hot-recompile failure surfaces as lastError(compile) and settles waiters; next good render clears it", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-"));
  fs.mkdirSync(path.join(projectDir, "composeApp", "src"), { recursive: true });
  const previewsDir = path.join(projectDir, "composeApp", "build", "previews");

  const service = createPreviewService({
    projectDir,
    port: 19770,
    runRender: async () => writeFakePreviews(previewsDir, ["shell"]),
  });

  try {
    await service.start();
    await new Promise((r) => setTimeout(r, 100));

    // A broken edit in daemon mode produces NO render — only compiler output.
    const pending = service.waitForRender(5000);
    service._noteDaemonOutput(
      "e: file:///app/src/Today.kt:12:5 Unresolved reference: fooo\n> Task :composeApp:compileKotlinDesktop FAILED\n",
    );
    const settled = await pending;
    assert.equal(settled.timedOut, false, "compile failure IS the outcome — no hang");
    assert.match(settled.lastError, /Unresolved reference: fooo/);
    assert.equal(settled.lastErrorSource, "compile");
    assert.equal(settled.lastActivity.what, "compile-failed");

    // Healed edit → successful render clears the compile error.
    await service._renderCycle();
    const status = service.status();
    assert.equal(status.lastError, null);
    assert.equal(status.lastErrorSource, null);
  } finally {
    service.stop();
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: treesFor exposes the last two generations for preview_diff", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-"));
  fs.mkdirSync(path.join(projectDir, "composeApp", "src"), { recursive: true });
  const previewsDir = path.join(projectDir, "composeApp", "build", "previews");

  const stamps = { shell: 1 };
  const service = createPreviewService({
    projectDir,
    port: 19780,
    runRender: async () => writeFakePreviews(previewsDir, ["shell"], stamps),
  });

  try {
    await service.start();
    await new Promise((r) => setTimeout(r, 100));

    // One generation only: no `before` yet.
    let pair = service.treesFor("shell");
    assert.equal(pair.before, null);
    assert.match(pair.after, /shell@1/);

    stamps.shell = 2;
    await service._renderCycle();
    pair = service.treesFor("shell");
    assert.match(pair.before, /shell@1/);
    assert.match(pair.after, /shell@2/);
    assert.equal(pair.version, 2);

    assert.deepEqual(service.treesFor("nope"), { before: null, after: null, version: 2 });
  } finally {
    service.stop();
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: renderCycle snapshots screen.prev.png before overwriting", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-"));
  fs.mkdirSync(path.join(projectDir, "composeApp", "src"), { recursive: true });
  const previewsDir = path.join(projectDir, "composeApp", "build", "previews");

  let generation = 0;
  const service = createPreviewService({
    projectDir,
    port: 19790,
    runRender: async () => {
      generation++;
      writeFakePreviews(previewsDir, ["shell"], { shell: generation });
      fs.writeFileSync(path.join(previewsDir, "shell", "screen.png"), Buffer.from([generation]));
    },
  });

  try {
    await service.start();
    await new Promise((r) => setTimeout(r, 100));
    assert.ok(!fs.existsSync(path.join(previewsDir, "shell", "screen.prev.png")), "first render: nothing to snapshot");

    await service._renderCycle();
    const prev = fs.readFileSync(path.join(previewsDir, "shell", "screen.prev.png"));
    const cur = fs.readFileSync(path.join(previewsDir, "shell", "screen.png"));
    assert.equal(prev[0], 1, "prev is generation 1");
    assert.equal(cur[0], 2, "current is generation 2");
  } finally {
    service.stop();
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

// --- phase 2: daemon fast path --------------------------------------------------------

test("detectAppPackage: create-cmp.json wins, namespace fallback, clear error", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-pkg-"));
  try {
    assert.throws(() => detectAppPackage(dir), /cannot detect the app package/);
    fs.mkdirSync(path.join(dir, "composeApp"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "composeApp", "build.gradle.kts"),
      'android {\n    namespace = "com.acme.demo"\n}\n',
    );
    assert.equal(detectAppPackage(dir), "com.acme.demo");
    fs.writeFileSync(path.join(dir, "create-cmp.json"), JSON.stringify({ package: "io.spec.app" }));
    assert.equal(detectAppPackage(dir), "io.spec.app");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("service: daemon fast path renders via HTTP and falls back to gradle when it dies", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-"));
  fs.mkdirSync(path.join(projectDir, "composeApp", "src"), { recursive: true });
  const previewsDir = path.join(projectDir, "composeApp", "build", "previews");

  // Fake resident daemon: /health ok, /render writes previews like the real JVM would.
  let daemonRenders = 0;
  const daemon = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, screens: ["shell"] }));
      return;
    }
    if (req.url.startsWith("/render")) {
      daemonRenders++;
      writeFakePreviews(previewsDir, ["shell"], { shell: daemonRenders });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ rendered: ["shell"], ms: 42 }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((r) => daemon.listen(19740, "127.0.0.1", r));

  let gradleRenders = 0;
  const service = createPreviewService({
    projectDir,
    port: 19730,
    hot: true,
    daemonUrl: "http://127.0.0.1:19740",
    spawnDaemon: () => {
      throw new Error("should reuse the healthy daemon, not spawn");
    },
    runRender: async () => {
      gradleRenders++;
      writeFakePreviews(previewsDir, ["shell"], { shell: 100 + gradleRenders });
    },
  });

  try {
    await service.start();
    // First render races daemon discovery — wait for both to settle.
    await new Promise((r) => setTimeout(r, 300));

    let status = service.status();
    assert.equal(status.mode, "daemon", "healthy daemon on the port is adopted");

    const before = daemonRenders;
    await service._renderCycle();
    assert.equal(daemonRenders, before + 1, "renders go through the daemon");
    assert.equal(service.status().lastError, null);

    // Daemon dies → next render falls back to gradle and mode flips.
    await new Promise((r) => daemon.close(r));
    await service._renderCycle();
    status = service.status();
    assert.equal(status.mode, "gradle", "fallback after daemon failure");
    assert.ok(gradleRenders >= 1, "gradle runner took over");
    assert.equal(status.lastError, null, "fallback render succeeded");
  } finally {
    service.stop();
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: a healthy daemon serving ANOTHER project is refused, not adopted", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-"));
  fs.mkdirSync(path.join(projectDir, "composeApp", "src"), { recursive: true });
  const previewsDir = path.join(projectDir, "composeApp", "build", "previews");

  // A daemon for a DIFFERENT checkout, answering on the same machine-global port.
  // It is healthy and would render happily — with the other project's screens.
  let daemonRenders = 0;
  const daemon = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          screens: ["someone-elses-screen"],
          previewsDir: path.join(os.tmpdir(), "a-totally-different-checkout", "composeApp", "build", "previews"),
        }),
      );
      return;
    }
    daemonRenders++;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ rendered: ["someone-elses-screen"], ms: 1 }));
  });
  await new Promise((r) => daemon.listen(19760, "127.0.0.1", r));

  let gradleRenders = 0;
  const service = createPreviewService({
    projectDir,
    port: 19750,
    hot: true,
    daemonUrl: "http://127.0.0.1:19760",
    spawnDaemon: () => {
      throw new Error("no daemon of our own in this test");
    },
    runRender: async () => {
      gradleRenders++;
      writeFakePreviews(previewsDir, ["shell"], { shell: gradleRenders });
    },
  });

  try {
    await service.start();
    await new Promise((r) => setTimeout(r, 300));

    assert.equal(service.status().mode, "gradle", "a foreign daemon is never adopted");
    await service._renderCycle();
    assert.equal(daemonRenders, 0, "not one render went to the foreign daemon");
    assert.ok(gradleRenders >= 1, "renders stayed on the gradle path");
    assert.deepEqual(
      service.status().screens.map((s) => s.id),
      ["shell"],
      "the served screens are this project's, not the other checkout's",
    );
  } finally {
    service.stop();
    await new Promise((r) => daemon.close(r));
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: swap-aware renders — stale render retried until the reload lands; waiter gets the real outcome", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-"));
  fs.mkdirSync(path.join(projectDir, "composeApp", "src"), { recursive: true });
  const previewsDir = path.join(projectDir, "composeApp", "build", "previews");

  // Reload-aware fake daemon: reloadCount only advances when the test says the swap
  // landed; until then /render keeps writing the OLD content (pre-swap code).
  const state = { reloadCount: 5, swapLanded: false };
  const daemon = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, reloadCount: state.reloadCount, reloadHooked: true }));
      return;
    }
    if (url.pathname === "/render") {
      if (state.swapLanded) state.reloadCount++;
      writeFakePreviews(previewsDir, ["shell"], { shell: state.swapLanded ? 2 : 1 });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ rendered: ["shell"], ms: 1, reloadCount: state.reloadCount, reloadHooked: true }),
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((r) => daemon.listen(19800, "127.0.0.1", r));

  const service = createPreviewService({
    projectDir,
    port: 19810,
    hot: true,
    daemonUrl: "http://127.0.0.1:19800",
    staleRetryMs: 50,
    watchdogMs: 60000, // out of the way for this test
    spawnDaemon: () => {
      throw new Error("should reuse the healthy daemon");
    },
    runRender: async () => {
      throw new Error("gradle path must not be used");
    },
  });

  try {
    await service.start();
    await new Promise((r) => setTimeout(r, 300)); // first render + daemon adoption
    assert.equal(service.status().mode, "daemon");

    // A save whose swap is slow: the first render is stale (same content, no reload).
    service._noteSrcChange();
    const pending = service.waitForRender(5000);
    let settled = false;
    pending.then(() => (settled = true));
    await service._renderCycle();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(settled, false, "stale render must NOT settle the waiter");

    // Swap lands → the scheduled retry renders the new content and settles.
    state.swapLanded = true;
    const outcome = await pending;
    assert.equal(outcome.timedOut, false);
    assert.deepEqual(outcome.changedLastRender, ["shell"], "waiter got the post-swap render");
  } finally {
    service.stop();
    await new Promise((r) => daemon.close(r));
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: failed hot swap (reloadErrors bump) surfaces as lastError(reload), no retry loop", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-"));
  fs.mkdirSync(path.join(projectDir, "composeApp", "src"), { recursive: true });
  const previewsDir = path.join(projectDir, "composeApp", "build", "previews");

  const state = { reloadErrors: 0 };
  const daemon = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, reloadCount: 1, reloadErrors: state.reloadErrors, reloadHooked: true }));
      return;
    }
    if (url.pathname === "/render") {
      writeFakePreviews(previewsDir, ["shell"]);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ rendered: ["shell"], ms: 1, reloadCount: 1, reloadErrors: state.reloadErrors, reloadHooked: true }),
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((r) => daemon.listen(19840, "127.0.0.1", r));

  const service = createPreviewService({
    projectDir,
    port: 19850,
    hot: true,
    daemonUrl: "http://127.0.0.1:19840",
    watchdogMs: 60000,
    spawnDaemon: () => {
      throw new Error("should reuse the healthy daemon");
    },
    runRender: async () => writeFakePreviews(previewsDir, ["shell"]),
  });

  try {
    await service.start();
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(service.status().mode, "daemon");

    // A save whose swap the agent rejects: reloadErrors bumps, content stays pre-swap.
    service._noteSrcChange();
    state.reloadErrors = 1;
    const pending = service.waitForRender(5000);
    await service._renderCycle();
    const outcome = await pending;
    assert.equal(outcome.timedOut, false);
    assert.equal(outcome.lastErrorSource, "reload");
    assert.match(outcome.lastError, /hot swap FAILED to apply/);
  } finally {
    service.stop();
    await new Promise((r) => daemon.close(r));
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: compile watchdog — silent recompiler failure surfaces via a compile check", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-"));
  fs.mkdirSync(path.join(projectDir, "composeApp", "src"), { recursive: true });
  const previewsDir = path.join(projectDir, "composeApp", "build", "previews");

  const daemon = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, reloadCount: 1, reloadHooked: true }));
      return;
    }
    if (url.pathname === "/render") {
      writeFakePreviews(previewsDir, ["shell"]);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ rendered: ["shell"], ms: 1, reloadCount: 1, reloadHooked: true }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((r) => daemon.listen(19820, "127.0.0.1", r));

  let compileChecks = 0;
  const service = createPreviewService({
    projectDir,
    port: 19830,
    hot: true,
    daemonUrl: "http://127.0.0.1:19820",
    watchdogMs: 80,
    runCompileCheck: async () => {
      compileChecks++;
      const err = new Error("Command failed: ./gradlew :composeApp:compileKotlinDesktop");
      err.stderr = "e: file:///app/src/Today.kt:3:1 Unresolved reference: fooo\nBUILD FAILED in 1s";
      throw err;
    },
    spawnDaemon: () => {
      throw new Error("should reuse the healthy daemon");
    },
    runRender: async () => writeFakePreviews(previewsDir, ["shell"]),
  });

  try {
    await service.start();
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(service.status().mode, "daemon");

    // Broken save: no classes ever land, no render fires — only the watchdog can tell.
    service._noteSrcChange();
    const outcome = await service.waitForRender(5000);
    assert.equal(outcome.timedOut, false, "watchdog settles the waiter");
    // >= 1: macOS FSEvents can replay the srcDir's own creation after the watcher
    // attaches, arming one extra (harmless) watchdog pass before the manual one.
    assert.ok(compileChecks >= 1, `watchdog ran the compile check (${compileChecks}x)`);
    assert.equal(outcome.lastErrorSource, "compile");
    assert.match(outcome.lastError, /Unresolved reference: fooo/);
  } finally {
    service.stop();
    await new Promise((r) => daemon.close(r));
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("galleryHtml: tab nav present; approvals/specs/designSystem/components default to honest empty states when omitted", () => {
  const html = galleryHtml({ appName: "Acme", viewport: { width: 411, height: 891 }, version: 1, cards: [] });
  assert.match(html, /class="tab-btn active" data-tab="overview"/);
  assert.match(html, /data-tab="screens"/);
  assert.match(html, /data-tab="design-system"/);
  assert.match(html, /data-tab="components"/, "Components is its own rail item (§2 genesis order)");
  assert.match(html, /id="tab-components"/, "…and its own section panel");
  assert.match(html, /data-tab="approvals"/);
  assert.match(html, /data-tab="specs"/);
  assert.match(html, /No design-system catalog available yet/);
  assert.match(html, /No components scan available yet/);
  assert.match(html, /not available in this project/);
  assert.match(html, /No specs\/ directory found/);
  assert.match(html, /msg\.type === "approval"/, "SSE client reloads on an approval broadcast too");
});

// --- Approvals wiring (VERIFICATION-LAYER-DESIGN.md §4) --------------------

test("service: approvalStatusSnapshot reflects the project's real qa/lib/approvals.mjs", async () => {
  const projectDir = makeApprovalsFixtureProject();
  const service = createPreviewService({ projectDir, port: 19860, hot: false, runRender: async () => {} });
  try {
    await service.start();
    const snapshot = await service.approvalStatusSnapshot();
    assert.equal(snapshot.available, true);
    const designSystem = snapshot.statuses.find((s) => s.id === "design-system");
    assert.equal(designSystem.status, "unreviewed");
    assert.equal(designSystem.resolvable, true);
  } finally {
    service.stop();
    resetApprovalsBridgeCache(projectDir);
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: approvalStatusSnapshot is {available:false} for a project with no approvals library", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-"));
  fs.mkdirSync(path.join(projectDir, "composeApp", "src"), { recursive: true });
  const service = createPreviewService({ projectDir, port: 19861, hot: false, runRender: async () => {} });
  try {
    await service.start();
    assert.deepEqual(await service.approvalStatusSnapshot(), { available: false });
  } finally {
    service.stop();
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: POST /api/approve calls the REAL library, writes qa/approvals.json, and the gallery page reflects it", async () => {
  const projectDir = makeApprovalsFixtureProject();
  const service = createPreviewService({ projectDir, port: 19862, hot: false, runRender: async () => {} });
  try {
    const st = await service.start();
    await new Promise((r) => setTimeout(r, 100));

    const res = await fetch(`${st.url}api/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy: "Test Signer <test@example.com>", artifact: "design-system" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.match(body.hash, /^[0-9a-f]{64}$/);

    const written = JSON.parse(fs.readFileSync(path.join(projectDir, "qa", "approvals.json"), "utf8"));
    assert.ok(written.artifacts.some((a) => a.artifact === "design-system" && a.status === "approved"));

    const page = await (await fetch(st.url)).text();
    assert.match(page, /badge-approved/);
    assert.match(page, /Re-approve/);
  } finally {
    service.stop();
    resetApprovalsBridgeCache(projectDir);
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: POST /api/approve surfaces the library's refusal verbatim (vacuous / unknown artifact)", async () => {
  const projectDir = makeApprovalsFixtureProject();
  const service = createPreviewService({ projectDir, port: 19863, hot: false, runRender: async () => {} });
  try {
    const st = await service.start();
    await new Promise((r) => setTimeout(r, 100));

    const unknown = await fetch(`${st.url}api/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy: "Test Signer <test@example.com>", artifact: "not-a-real-artifact" }),
    });
    assert.equal(unknown.status, 409);
    const unknownBody = await unknown.json();
    assert.equal(unknownBody.ok, false);
    assert.match(unknownBody.reason, /unknown artifact/);

    const missingBody = await fetch(`${st.url}api/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    assert.equal(missingBody.status, 400);

    const getInstead = await fetch(`${st.url}api/approve`);
    assert.equal(getInstead.status, 405);
  } finally {
    service.stop();
    resetApprovalsBridgeCache(projectDir);
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: Components section — boots against a real components dir + the REAL approvals library; approve, then drift a real file, and the card reflects both", async () => {
  const { root: projectDir, componentsDir } = makeComponentsFixtureProject();
  const service = createPreviewService({ projectDir, port: 19890, hot: false, runRender: async () => {} });
  try {
    const st = await service.start();
    await new Promise((r) => setTimeout(r, 100));

    // Unapproved: the real components scan renders the full §3.3 entry
    // (params table, kdoc usage notes, state-contract facts, used-in with
    // the screen badge) plus an honest "not yet approved" badge — the
    // components artifact starts `unreviewed` in a fresh qa/approvals.json.
    let page = await (await fetch(st.url)).text();
    assert.match(page, /id="tab-components"/, "Components renders as its own section");
    assert.match(page, /ScreenColumn/);
    assert.match(page, /class="params-table"/, "the signature renders as a params table");
    assert.match(page, /<code>screenTag<\/code><\/td><td><code>String<\/code>/, "name + type from the real scan");
    assert.match(page, /class="param-required">required/, "no default in the source -> stated required");
    assert.match(page, /from the component's own doc comment/);
    assert.match(page, /The page container every screen roots itself in\./);
    assert.match(page, /owns testTags derived from <code>screenTag<\/code>/);
    assert.match(page, /&lt;screenTag&gt;_screen/);
    assert.match(page, /class="badge badge-open">screen/, "HomeScreen.kt is listed as a screen used-in entry");
    assert.match(page, /badge-unreviewed/);

    const approveRes = await fetch(`${st.url}api/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy: "Test Signer <test@example.com>", artifact: "components" }),
    });
    assert.equal((await approveRes.json()).ok, true);

    page = await (await fetch(st.url)).text();
    assert.match(page, /badge-approved/);
    assert.match(page, /approved &middot;/);

    // Drift: edit the real file's content AND push its mtime safely into the
    // future relative to approvedAt (same-millisecond writes on a fast CI
    // disk could otherwise land mtime <= approvedAt and flip the assertion).
    await new Promise((r) => setTimeout(r, 20));
    const file = path.join(componentsDir, "ScreenColumn.kt");
    fs.appendFileSync(file, "\n// edited after approval\n");
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(file, future, future);

    page = await (await fetch(st.url)).text();
    assert.match(page, /drift &middot; artifact changed since approval/);
    assert.match(page, /likely changed \(mtime\)/);
  } finally {
    service.stop();
    resetApprovalsBridgeCache(projectDir);
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: POST /api/approve broadcasts an SSE 'approval' event", async () => {
  const projectDir = makeApprovalsFixtureProject();
  const service = createPreviewService({ projectDir, port: 19864, hot: false, runRender: async () => {} });
  try {
    const st = await service.start();
    await new Promise((r) => setTimeout(r, 100));

    const sseRes = await fetch(`${st.url}events`);
    const reader = sseRes.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    async function nextEvent() {
      while (!buf.includes("\n\n")) {
        const { value, done } = await reader.read();
        if (done) throw new Error("SSE stream closed early");
        buf += decoder.decode(value, { stream: true });
      }
      const idx = buf.indexOf("\n\n");
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      return JSON.parse(chunk.replace(/^data: /, ""));
    }
    assert.equal((await nextEvent()).type, "hello");

    await fetch(`${st.url}api/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy: "Test Signer <test@example.com>", artifact: "design-system" }),
    });

    const evt = await nextEvent();
    assert.equal(evt.type, "approval");
    assert.equal(evt.artifact, "design-system");
    reader.cancel();
  } finally {
    service.stop();
    resetApprovalsBridgeCache(projectDir);
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: waitForApprovalDecision resolves (event-driven) the moment POST /api/approve lands, naming the changed artifact", async () => {
  const projectDir = makeApprovalsFixtureProject();
  const service = createPreviewService({ projectDir, port: 19865, hot: false, runRender: async () => {} });
  try {
    const st = await service.start();
    await new Promise((r) => setTimeout(r, 100));

    const pending = service.waitForApprovalDecision(5000);
    await fetch(`${st.url}api/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy: "Test Signer <test@example.com>", artifact: "design-system" }),
    });
    const settled = await pending;
    assert.equal(settled.timedOut, false);
    assert.equal(settled.available, true);
    assert.ok(settled.changed.includes("design-system"));
    assert.equal(settled.statuses.find((s) => s.id === "design-system").status, "approved");
  } finally {
    service.stop();
    resetApprovalsBridgeCache(projectDir);
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: waitForApprovalDecision catches a change made OUTSIDE the console (e.g. `node qa/approve.mjs`) via the poll fallback", async () => {
  const projectDir = makeApprovalsFixtureProject();
  const service = createPreviewService({ projectDir, port: 19866, hot: false, runRender: async () => {} });
  try {
    await service.start();

    const pending = service.waitForApprovalDecision(5000);
    // Simulate an external `node qa/approve.mjs design-system` run: qa/approvals.json
    // changes on disk without ever going through this server's POST handler.
    setTimeout(() => {
      const approvalsPath = path.join(projectDir, "qa", "approvals.json");
      fs.mkdirSync(path.dirname(approvalsPath), { recursive: true });
      fs.writeFileSync(
        approvalsPath,
        JSON.stringify({
          schema: "cmp-approvals/1",
          artifacts: [{ artifact: "design-system", status: "approved", hash: "deadbeef", approvedAt: new Date().toISOString() }],
        }),
      );
    }, 50);
    const settled = await pending;
    assert.equal(settled.timedOut, false);
    assert.ok(settled.changed.includes("design-system"));
  } finally {
    service.stop();
    resetApprovalsBridgeCache(projectDir);
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: waitForApprovalDecision times out (not a hang) when nothing changes", async () => {
  const projectDir = makeApprovalsFixtureProject();
  const service = createPreviewService({ projectDir, port: 19867, hot: false, runRender: async () => {} });
  try {
    await service.start();
    const result = await service.waitForApprovalDecision(200);
    assert.equal(result.timedOut, true);
    assert.equal(result.available, true);
    assert.deepEqual(result.changed, []);
  } finally {
    service.stop();
    resetApprovalsBridgeCache(projectDir);
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: waitForApprovalDecision resolves immediately with {available:false} — nothing to wait for", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-"));
  fs.mkdirSync(path.join(projectDir, "composeApp", "src"), { recursive: true });
  const service = createPreviewService({ projectDir, port: 19868, hot: false, runRender: async () => {} });
  try {
    await service.start();
    const start = Date.now();
    const result = await service.waitForApprovalDecision(60000);
    assert.equal(result.available, false);
    assert.equal(result.timedOut, false);
    assert.ok(Date.now() - start < 2000, "must not wait for the full timeout when unavailable");
  } finally {
    service.stop();
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: hot=false never touches the daemon", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-"));
  fs.mkdirSync(path.join(projectDir, "composeApp", "src"), { recursive: true });
  const previewsDir = path.join(projectDir, "composeApp", "build", "previews");

  const service = createPreviewService({
    projectDir,
    port: 19750,
    hot: false,
    daemonUrl: "http://127.0.0.1:19999", // nothing listens; must never matter
    spawnDaemon: () => {
      throw new Error("hot=false must not spawn");
    },
    runRender: async () => writeFakePreviews(previewsDir, ["shell"]),
  });

  try {
    await service.start();
    await new Promise((r) => setTimeout(r, 200));
    const status = service.status();
    assert.equal(status.mode, "gradle");
    assert.equal(status.version, 1);
  } finally {
    service.stop();
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

// --- Comments wiring (VERIFICATION-LAYER-DESIGN.md §7.3) --------------------

test("galleryHtml: architecture + comments tabs present; both default to honest empty states when omitted", () => {
  const html = galleryHtml({ appName: "Acme", viewport: { width: 411, height: 891 }, version: 1, cards: [] });
  assert.match(html, /data-tab="architecture"/);
  assert.match(html, /data-tab="comments"/);
  assert.match(html, /No layer map available/);
  assert.match(html, /not available in this project/);
  assert.match(html, /id="comments-badge"[^>]* hidden/, "zero open comments -> badge present but hidden");
});

test("galleryHtml: [hidden] display guards for every hidden-toggled element that carries an author display rule", () => {
  // Pins the VL-7 browser-gate fix: the popover (display:flex) and the tab badge
  // (display:inline-block) are toggled with the `hidden` ATTRIBUTE, and an author
  // display rule overrides the UA stylesheet's [hidden] { display: none }. Without
  // the guards, every closed popover stayed painted at 0x0 and its overflowing
  // textarea invisibly intercepted clicks — on the dense specs tab, clicking one
  // clause's visible Post button actually hit the NEXT clause's hidden textarea
  // (elementFromPoint-verified), so the submit never fired.
  const html = galleryHtml({ appName: "Acme", viewport: { width: 411, height: 891 }, version: 1, cards: [] });
  assert.match(
    html,
    /\.comment-popover\[hidden\]\s*\{\s*display:\s*none\s*!important/,
    "a hidden popover must genuinely not render (author display:flex would otherwise win)",
  );
  assert.match(
    html,
    /\.tab-badge\[hidden\]\s*\{\s*display:\s*none\s*!important/,
    "a hidden badge must genuinely not render (author display:inline-block would otherwise win)",
  );
  // The remaining hidden-toggled elements (#approve-error banner, .comment-error)
  // deliberately need no guard: neither carries an author `display` rule, so the
  // UA's [hidden] { display: none } applies. This assertion documents that premise —
  // if someone later adds `display:` to those selectors, it must fail loudly here.
  for (const selector of ["banner", "comment-error"]) {
    const rules = [...html.matchAll(new RegExp(`\\.${selector}[^{]*\\{[^}]*\\}`, "g"))].map((m) => m[0]);
    assert.ok(rules.length > 0, `.${selector} rule exists`);
    for (const rule of rules) {
      assert.doesNotMatch(
        rule,
        /[{;]\s*display\s*:/,
        `.${selector} must stay free of an author display rule OR gain its own [hidden] guard`,
      );
    }
  }
});

test("service: commentsSnapshot is {available:false} for a project with no comments library", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-"));
  fs.mkdirSync(path.join(projectDir, "composeApp", "src"), { recursive: true });
  const service = createPreviewService({ projectDir, port: 19870, hot: false, runRender: async () => {} });
  try {
    await service.start();
    assert.deepEqual(await service.commentsSnapshot(), { available: false });
  } finally {
    service.stop();
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: POST /api/comment calls the fixture library, writes qa/comments.json, and the gallery page reflects it", async () => {
  const projectDir = makeCommentsFixtureProject();
  const service = createPreviewService({ projectDir, port: 19871, hot: false, runRender: async () => {} });
  try {
    const st = await service.start();
    await new Promise((r) => setTimeout(r, 100));

    const res = await fetch(`${st.url}api/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: { type: "screen", screen: "home" }, text: "move the CTA up" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.comment.author, "human-console");

    const written = JSON.parse(fs.readFileSync(path.join(projectDir, "qa", "comments.json"), "utf8"));
    assert.equal(written.comments.length, 1);
    assert.equal(written.comments[0].text, "move the CTA up");

    const page = await (await fetch(st.url)).text();
    assert.match(page, /move the CTA up/);
    assert.match(page, /id="comments-badge">1</, "open-count badge reflects the new open comment");
  } finally {
    service.stop();
    resetCommentsBridgeCache(projectDir);
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: POST /api/comment surfaces the library's refusal verbatim (empty text / bad target) and rejects non-POST/bad JSON", async () => {
  const projectDir = makeCommentsFixtureProject();
  const service = createPreviewService({ projectDir, port: 19872, hot: false, runRender: async () => {} });
  try {
    const st = await service.start();
    await new Promise((r) => setTimeout(r, 100));

    const empty = await fetch(`${st.url}api/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: { type: "general" }, text: "   " }),
    });
    assert.equal(empty.status, 409);
    const emptyBody = await empty.json();
    assert.equal(emptyBody.ok, false);
    assert.match(emptyBody.reason, /empty/i);

    const missingTarget = await fetch(`${st.url}api/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "hi" }),
    });
    assert.equal(missingTarget.status, 400);

    const badJson = await fetch(`${st.url}api/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    assert.equal(badJson.status, 400);

    const getInstead = await fetch(`${st.url}api/comment`);
    assert.equal(getInstead.status, 405);
  } finally {
    service.stop();
    resetCommentsBridgeCache(projectDir);
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: POST /api/comment broadcasts an SSE 'comment' event", async () => {
  const projectDir = makeCommentsFixtureProject();
  const service = createPreviewService({ projectDir, port: 19873, hot: false, runRender: async () => {} });
  try {
    const st = await service.start();
    await new Promise((r) => setTimeout(r, 100));

    const sseRes = await fetch(`${st.url}events`);
    const reader = sseRes.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    async function nextEvent() {
      while (!buf.includes("\n\n")) {
        const { value, done } = await reader.read();
        if (done) throw new Error("SSE stream closed early");
        buf += decoder.decode(value, { stream: true });
      }
      const idx = buf.indexOf("\n\n");
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      return JSON.parse(chunk.replace(/^data: /, ""));
    }
    assert.equal((await nextEvent()).type, "hello");

    await fetch(`${st.url}api/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: { type: "general" }, text: "hi" }),
    });

    const evt = await nextEvent();
    assert.equal(evt.type, "comment");
    reader.cancel();
  } finally {
    service.stop();
    resetCommentsBridgeCache(projectDir);
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: waitForNewComment resolves (event-driven) the moment POST /api/comment lands, naming the added comment", async () => {
  const projectDir = makeCommentsFixtureProject();
  const service = createPreviewService({ projectDir, port: 19874, hot: false, runRender: async () => {} });
  try {
    const st = await service.start();
    await new Promise((r) => setTimeout(r, 100));

    const pending = service.waitForNewComment(5000);
    await fetch(`${st.url}api/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: { type: "general" }, text: "new feedback" }),
    });
    const settled = await pending;
    assert.equal(settled.timedOut, false);
    assert.equal(settled.available, true);
    assert.equal(settled.added.length, 1);
    assert.equal(settled.added[0].text, "new feedback");
  } finally {
    service.stop();
    resetCommentsBridgeCache(projectDir);
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: waitForNewComment does NOT resolve on a resolveComment() call — only a NEW comment wakes it", async () => {
  const projectDir = makeCommentsFixtureProject();
  const service = createPreviewService({ projectDir, port: 19875, hot: false, runRender: async () => {} });
  try {
    const st = await service.start();
    const added = await fetch(`${st.url}api/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: { type: "general" }, text: "already here" }),
    }).then((r) => r.json());

    const pending = service.waitForNewComment(500);
    await service.resolveComment(added.comment.id, "handled it");
    const settled = await pending;
    assert.equal(settled.timedOut, true, "a resolve alone must not satisfy waitForNewComment");
  } finally {
    service.stop();
    resetCommentsBridgeCache(projectDir);
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: waitForNewComment times out (not a hang) when nothing changes", async () => {
  const projectDir = makeCommentsFixtureProject();
  const service = createPreviewService({ projectDir, port: 19876, hot: false, runRender: async () => {} });
  try {
    await service.start();
    const result = await service.waitForNewComment(200);
    assert.equal(result.timedOut, true);
    assert.equal(result.available, true);
    assert.deepEqual(result.added, []);
  } finally {
    service.stop();
    resetCommentsBridgeCache(projectDir);
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: waitForNewComment resolves immediately with {available:false} — nothing to wait for", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-"));
  fs.mkdirSync(path.join(projectDir, "composeApp", "src"), { recursive: true });
  const service = createPreviewService({ projectDir, port: 19877, hot: false, runRender: async () => {} });
  try {
    await service.start();
    const start = Date.now();
    const result = await service.waitForNewComment(60000);
    assert.equal(result.available, false);
    assert.equal(result.timedOut, false);
    assert.ok(Date.now() - start < 2000, "must not wait for the full timeout when unavailable");
  } finally {
    service.stop();
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: resolveComment (the agent primitive) writes the resolution via the library and broadcasts SSE", async () => {
  const projectDir = makeCommentsFixtureProject();
  const service = createPreviewService({ projectDir, port: 19878, hot: false, runRender: async () => {} });
  try {
    const st = await service.start();
    await new Promise((r) => setTimeout(r, 100));
    const added = await fetch(`${st.url}api/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: { type: "general" }, text: "please clarify" }),
    }).then((r) => r.json());

    const result = await service.resolveComment(added.comment.id, "clarified in the spec");
    assert.equal(result.ok, true);
    assert.equal(result.comment.resolvedBy, "agent");
    assert.equal(result.comment.resolutionNote, "clarified in the spec");

    const page = await (await fetch(st.url)).text();
    assert.match(page, /badge-resolved/);
    assert.match(page, /clarified in the spec/);
  } finally {
    service.stop();
    resetCommentsBridgeCache(projectDir);
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

// --- Reopen wiring (GENESIS-FLOW-DESIGN.md §2/§3) ---------------------------

test("service: POST /api/reopen moves an approved artifact to reopened, writes the ledger, and the gallery page reflects it", async () => {
  const projectDir = makeReopenFixtureProject();
  const service = createPreviewService({ projectDir, port: 19880, hot: false, runRender: async () => {} });
  try {
    const st = await service.start();
    await new Promise((r) => setTimeout(r, 100));

    await fetch(`${st.url}api/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy: "Test Signer <test@example.com>", artifact: "design-system" }),
    });

    const res = await fetch(`${st.url}api/reopen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy: "Test Signer <test@example.com>", artifact: "design-system" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);

    const written = JSON.parse(fs.readFileSync(path.join(projectDir, "qa", "approvals.json"), "utf8"));
    const rec = written.artifacts.find((a) => a.artifact === "design-system");
    assert.equal(rec.status, "reopened");
    assert.ok(rec.reopenedAt);

    const page = await (await fetch(st.url)).text();
    assert.match(page, /badge-reopened/);
    assert.match(page, /banner-genesis/, "a reopened artifact reads back as genesis mode");
  } finally {
    service.stop();
    resetApprovalsBridgeCache(projectDir);
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: POST /api/reopen surfaces the library's refusal verbatim (non-approved / unknown artifact) and rejects non-POST/bad JSON", async () => {
  const projectDir = makeReopenFixtureProject();
  const service = createPreviewService({ projectDir, port: 19881, hot: false, runRender: async () => {} });
  try {
    const st = await service.start();
    await new Promise((r) => setTimeout(r, 100));

    const neverApproved = await fetch(`${st.url}api/reopen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy: "Test Signer <test@example.com>", artifact: "architecture" }),
    });
    assert.equal(neverApproved.status, 409);
    const neverApprovedBody = await neverApproved.json();
    assert.equal(neverApprovedBody.ok, false);
    assert.match(neverApprovedBody.reason, /not currently approved/);

    const unknown = await fetch(`${st.url}api/reopen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy: "Test Signer <test@example.com>", artifact: "not-a-real-artifact" }),
    });
    assert.equal(unknown.status, 409);
    assert.match((await unknown.json()).reason, /unknown artifact/);

    const badJson = await fetch(`${st.url}api/reopen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    assert.equal(badJson.status, 400);

    const getInstead = await fetch(`${st.url}api/reopen`);
    assert.equal(getInstead.status, 405);
  } finally {
    service.stop();
    resetApprovalsBridgeCache(projectDir);
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: POST /api/reopen against a project whose lib predates reopenArtifact degrades honestly (409 + reason, no crash)", async () => {
  // A hand-written stub, NOT template/qa/lib/approvals.mjs — that file has
  // since gained reopenArtifact (Agent T's parallel wave), so asserting
  // against it would make this test's outcome depend on merge order. The
  // stub pins the same SHAPE ("a real library, just an older one") deterministically.
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-predates-reopen-"));
  fs.mkdirSync(path.join(projectDir, "composeApp", "src"), { recursive: true });
  const libDir = path.join(projectDir, "qa", "lib");
  fs.mkdirSync(libDir, { recursive: true });
  fs.writeFileSync(
    path.join(libDir, "approvals.mjs"),
    "export function getApprovalStatuses() { return []; }\n" +
      'export function approveArtifact() { return { ok: false, reason: "n/a" }; }\n',
  );
  const service = createPreviewService({ projectDir, port: 19882, hot: false, runRender: async () => {} });
  try {
    const st = await service.start();
    await new Promise((r) => setTimeout(r, 100));

    const res = await fetch(`${st.url}api/reopen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy: "Test Signer <test@example.com>", artifact: "design-system" }),
    });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.match(body.reason, /predates the reopen wave/);
  } finally {
    service.stop();
    resetApprovalsBridgeCache(projectDir);
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: POST /api/reopen broadcasts the SAME SSE 'approval' event type as /api/approve (§3: existing in-place refresh covers the panel)", async () => {
  const projectDir = makeReopenFixtureProject();
  const service = createPreviewService({ projectDir, port: 19883, hot: false, runRender: async () => {} });
  try {
    const st = await service.start();
    await new Promise((r) => setTimeout(r, 100));

    await fetch(`${st.url}api/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy: "Test Signer <test@example.com>", artifact: "design-system" }),
    });

    const sseRes = await fetch(`${st.url}events`);
    const reader = sseRes.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    async function nextEvent() {
      while (!buf.includes("\n\n")) {
        const { value, done } = await reader.read();
        if (done) throw new Error("SSE stream closed early");
        buf += decoder.decode(value, { stream: true });
      }
      const idx = buf.indexOf("\n\n");
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      return JSON.parse(chunk.replace(/^data: /, ""));
    }
    assert.equal((await nextEvent()).type, "hello");

    await fetch(`${st.url}api/reopen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy: "Test Signer <test@example.com>", artifact: "design-system" }),
    });

    const evt = await nextEvent();
    assert.equal(evt.type, "approval");
    assert.equal(evt.artifact, "design-system");
    reader.cancel();
  } finally {
    service.stop();
    resetApprovalsBridgeCache(projectDir);
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: waitForApprovalDecision also settles on a reopen (it's just another status change)", async () => {
  const projectDir = makeReopenFixtureProject();
  const service = createPreviewService({ projectDir, port: 19884, hot: false, runRender: async () => {} });
  try {
    const st = await service.start();
    await new Promise((r) => setTimeout(r, 100));
    await fetch(`${st.url}api/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy: "Test Signer <test@example.com>", artifact: "design-system" }),
    });

    const pending = service.waitForApprovalDecision(5000);
    await fetch(`${st.url}api/reopen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy: "Test Signer <test@example.com>", artifact: "design-system" }),
    });
    const settled = await pending;
    assert.equal(settled.timedOut, false);
    assert.ok(settled.changed.includes("design-system"));
    assert.equal(settled.statuses.find((s) => s.id === "design-system").status, "reopened");
  } finally {
    service.stop();
    resetApprovalsBridgeCache(projectDir);
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

// --- snapshot_variant / candidates strip (GENESIS-FLOW-DESIGN.md §2) --------

test("service: snapshotVariant refuses an invalid name and refuses when there's no current render yet", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-variants-"));
  fs.mkdirSync(path.join(projectDir, "composeApp", "src"), { recursive: true });
  const service = createPreviewService({ projectDir, port: 19885, hot: false, runRender: async () => {} });
  try {
    await service.start(); // no manifest.json on disk yet -> no render loaded -> cards stays empty
    const badName = service.snapshotVariant("Warmer V2!");
    assert.equal(badName.ok, false);
    assert.match(badName.reason, /\[a-z0-9-\]\+/);

    const noRender = service.snapshotVariant("warmer");
    assert.equal(noRender.ok, false);
    assert.match(noRender.reason, /no current render/);
  } finally {
    service.stop();
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: snapshotVariant stashes every current screen's PNG + design-system.json under variants/<name>/, and REPLACES an existing variant of the same name", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-variants-"));
  fs.mkdirSync(path.join(projectDir, "composeApp", "src"), { recursive: true });
  const previewsDir = path.join(projectDir, "composeApp", "build", "previews");

  const service = createPreviewService({
    projectDir,
    port: 19886,
    hot: false,
    runRender: async () => {
      writeFakePreviews(previewsDir, ["shell", "home"]);
      fs.writeFileSync(path.join(previewsDir, "design-system.json"), JSON.stringify({ colors: { Primary: "#111" } }));
    },
  });
  try {
    await service.start();
    await new Promise((r) => setTimeout(r, 150)); // let the first render land

    const result = service.snapshotVariant("warmer");
    assert.equal(result.ok, true);
    assert.deepEqual(result.screens.sort(), ["home", "shell"]);
    assert.equal(result.designSystemStashed, true);

    const variantDir = path.join(previewsDir, "variants", "warmer");
    assert.ok(fs.existsSync(path.join(variantDir, "home", "screen.png")));
    assert.ok(fs.existsSync(path.join(variantDir, "shell", "screen.png")));
    assert.ok(fs.existsSync(path.join(variantDir, "design-system.json")));

    // Mark the stash with a sentinel, then re-render + re-snapshot the SAME
    // name — the old stash must be gone, not merged with the new one.
    fs.writeFileSync(path.join(variantDir, "sentinel.txt"), "old stash");
    const replaced = service.snapshotVariant("warmer");
    assert.equal(replaced.ok, true);
    assert.equal(fs.existsSync(path.join(variantDir, "sentinel.txt")), false, "the old variant contents are replaced, not merged");
  } finally {
    service.stop();
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: the served gallery page's candidates strip appears only in genesis mode, driven by real approvals + stashed variants together", async () => {
  const projectDir = makeReopenFixtureProject();
  const previewsDir = path.join(projectDir, "composeApp", "build", "previews");
  const variantDir = path.join(previewsDir, "variants", "warmer");
  fs.mkdirSync(path.join(variantDir, "home"), { recursive: true });
  fs.writeFileSync(path.join(variantDir, "home", "screen.png"), Buffer.from([0x89, 0x50]));

  const service = createPreviewService({ projectDir, port: 19887, hot: false, runRender: async () => {} });
  try {
    const st = await service.start();
    await new Promise((r) => setTimeout(r, 100));

    // design-system is unreviewed by default (fixture lib, nothing approved yet) -> genesis mode.
    const genesisPage = await (await fetch(st.url)).text();
    assert.match(genesisPage, /class="candidates-strip"/);
    assert.match(genesisPage, /<h4>warmer<\/h4>/);
    assert.match(genesisPage, /data-variant="warmer"/);

    // Approve it -> steward mode -> the strip disappears entirely, even though the
    // SAME stashed variant is still sitting on disk.
    await fetch(`${st.url}api/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy: "Test Signer <test@example.com>", artifact: "design-system" }),
    });
    const stewardPage = await (await fetch(st.url)).text();
    assert.doesNotMatch(stewardPage, /class="candidates-strip"/);
  } finally {
    service.stop();
    resetApprovalsBridgeCache(projectDir);
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: the Pick flow — the EXACT payload the strip's Pick button posts lands in the comments ledger, observable via waitForNewComment (§2: no new decision machinery)", async () => {
  const projectDir = makeCommentsFixtureProject();
  const service = createPreviewService({ projectDir, port: 19888, hot: false, runRender: async () => {} });
  try {
    const st = await service.start();
    await new Promise((r) => setTimeout(r, 100));

    const pending = service.waitForNewComment(5000);
    // Mirrors wirePickButtons' exact fetch body (preview-service.mjs's client script).
    const res = await fetch(`${st.url}api/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // token is REQUIRED for design-system targets (§7.3) — the real library
      // 409s a token-less pick; the G-gate browser run proved it live.
      body: JSON.stringify({ target: { type: "design-system", token: "variant:warmer" }, text: "pick:warmer" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.comment.author, "human-console");

    const settled = await pending;
    assert.equal(settled.timedOut, false);
    assert.equal(settled.added.length, 1);
    assert.equal(settled.added[0].text, "pick:warmer");
    assert.deepEqual(settled.added[0].target, { type: "design-system", token: "variant:warmer" });
  } finally {
    service.stop();
    resetCommentsBridgeCache(projectDir);
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

// --- component stories (§3.3: `component.*` registry entries are component
// documentation, not screens) ------------------------------------------------

test("isComponentStoryId / componentStoryCards: `component.*` ids group by kebab name; everything else is a screen", () => {
  assert.equal(isComponentStoryId("component.app-header"), true);
  assert.equal(isComponentStoryId("home"), false);
  assert.equal(isComponentStoryId("home@empty"), false);
  const cards = [
    { screen: { id: "home", title: "Home tab", png: "home/screen.png" } },
    { screen: { id: "component.app-header", title: "AppHeader — component story", png: "component.app-header/screen.png" } },
    { screen: { id: "component.list-item-card", title: "ListItemCard — component story", png: "component.list-item-card/screen.png" } },
  ];
  const stories = componentStoryCards(cards);
  assert.deepEqual(Object.keys(stories).sort(), ["app-header", "list-item-card"]);
  assert.equal(stories["app-header"].id, "component.app-header");
  assert.equal(stories["app-header"].png, "component.app-header/screen.png");
  // Registry predating stories: empty map, never an error.
  assert.deepEqual(componentStoryCards([{ screen: { id: "home", title: "t", png: "p" } }]), {});
});

test("galleryHtml: story cards are excluded from the Screens grid and the screen/changed counts, and surface on the Components entry instead", () => {
  const tree = TREE();
  const card = (id, title) => ({
    screen: { id, title, png: `${id}/screen.png` },
    svg: "<svg xmlns='http://www.w3.org/2000/svg'></svg>",
    summary: summarizeTree(tree),
    a11y: { pass: true, violations: [] },
  });
  const html = galleryHtml({
    appName: "Acme",
    viewport: { width: 411, height: 891 },
    version: 5,
    changed: ["home", "component.app-header"],
    changedVersions: { home: 5, "component.app-header": 5 },
    cards: [card("home", "Home tab"), card("component.app-header", "AppHeader — component story")],
    components: {
      available: true,
      components: [
        {
          name: "AppHeader",
          file: "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/components/AppHeader.kt",
          params: [],
          paramsParsed: [],
          parseError: false,
          kdoc: null,
          kdocDescription: null,
          paramDocs: {},
          facts: {},
          usedIn: [],
          usedInScreens: [],
        },
      ],
    },
  });
  // Screens grid: no story card, and the counts exclude it.
  assert.doesNotMatch(html, /id="card-component\.app-header"/, "story card not in the Screens grid");
  assert.match(html, /render #5 &middot; 1 screen /, "screen count excludes the story");
  assert.match(html, /1 changed this render/, "changed count excludes the story");
  // Components entry: the story render, version-busted, with changed attribution.
  assert.match(html, /story render &mdash; <code>component\.app-header<\/code>/);
  assert.match(html, /\/previews\/component\.app-header\/screen\.png\?v=5/);
  assert.match(html, /class="chg">changed #5</);
});

test("galleryHtml: a components scan with no story render on disk states the absence on the entry", () => {
  const html = galleryHtml({
    appName: "Acme",
    viewport: { width: 411, height: 891 },
    version: 1,
    cards: [],
    components: {
      available: true,
      components: [
        {
          name: "ScreenColumn",
          file: "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/components/ScreenColumn.kt",
          params: [],
          paramsParsed: [],
          parseError: false,
          kdoc: null,
          kdocDescription: null,
          paramDocs: {},
          facts: {},
          usedIn: [],
          usedInScreens: [],
        },
      ],
    },
  });
  assert.match(html, /no story render yet &mdash; run the preview render to produce <code>component\.screen-column<\/code>/);
});

// --- §3.6 Evidence wiring: rail item + section + rail-foot deep link ---------

test("galleryHtml: Evidence is a rail item + section after Specs; with no receipt its glyph is ○ and both status and body state the absence", () => {
  const html = galleryHtml({ appName: "Acme", viewport: { width: 411, height: 891 }, version: 1, cards: [] });
  assert.match(html, /data-tab="evidence"/, "Evidence participates in the .tab-btn/data-tab wiring (deep-linkable via #evidence)");
  assert.match(html, /id="tab-evidence"/, "the section panel exists");
  const specsIdx = html.indexOf('id="tab-specs"');
  const evidenceIdx = html.indexOf('id="tab-evidence"');
  const approvalsIdx = html.indexOf('id="tab-approvals"');
  assert.ok(specsIdx < evidenceIdx && evidenceIdx < approvalsIdx, "section order: Specs -> Evidence -> Approvals");
  assert.match(html, /No verify receipt yet/);
  assert.match(html, /no verify receipt yet/, "the status line states the absence too");
});

test("galleryHtml: the rail foot is the deep link to Evidence — a .tab-btn with data-tab=\"evidence\" wrapping the receipt line, no new JS mechanism", () => {
  const html = galleryHtml({
    appName: "Acme",
    viewport: { width: 411, height: 891 },
    version: 1,
    cards: [],
    lastReceipt: { available: true, verdict: "PASS", ageMs: 60_000, stale: false, steps: [], generatedAt: "2026-07-19T09:00:00.000Z" },
  });
  assert.match(html, /class="rail-foot"><button type="button" class="tab-btn" data-tab="evidence"/);
  assert.match(html, /verify PASS/);
  // The Evidence rail item's glyph derives from the receipt: fresh PASS = ✓.
  assert.match(html, /data-tab="evidence"><span class="glyph glyph-signed" title="verify PASS">✓<\/span><span class="rail-label">Evidence<\/span>/);
  // Status line carries verdict + age.
  assert.match(html, /verify PASS &middot; 1m ago/);
});

test("galleryHtml: a stale receipt demotes the Evidence rail glyph to ⚠ and marks the status line — never presented as a live PASS", () => {
  const html = galleryHtml({
    appName: "Acme",
    viewport: { width: 411, height: 891 },
    version: 1,
    cards: [],
    lastReceipt: { available: true, verdict: "PASS", ageMs: 60_000, stale: true, steps: [], generatedAt: "2026-07-19T09:00:00.000Z" },
  });
  assert.match(html, /data-tab="evidence"><span class="glyph glyph-drift"/);
  assert.match(html, /stale &mdash; tree changed since/);
});

test("service: the GOVERNED SURFACE is watched — a spec written by an agent, or a CLI ledger write, reaches the open page without a refresh", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-governance-"));
  fs.mkdirSync(path.join(projectDir, "composeApp", "src"), { recursive: true });
  fs.mkdirSync(path.join(projectDir, "specs"), { recursive: true });
  fs.mkdirSync(path.join(projectDir, "docs", "features"), { recursive: true });
  fs.mkdirSync(path.join(projectDir, "qa"), { recursive: true });
  fs.writeFileSync(path.join(projectDir, "qa", "approvals.json"), JSON.stringify({ schema: "cmp-approvals/1", artifacts: [] }));

  const service = createPreviewService({ projectDir, port: 19930, hot: false, runRender: async () => {} });
  try {
    const st = await service.start();
    await new Promise((r) => setTimeout(r, 100));

    // Read the SSE stream the open page listens on.
    const events = [];
    const ac = new AbortController();
    const res = await fetch(`${st.url}events`, { signal: ac.signal });
    const reader = res.body.getReader();
    const pump = (async () => {
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        for (const line of dec.decode(value).split("\n")) {
          if (line.startsWith("data: ")) events.push(JSON.parse(line.slice(6)));
        }
      }
    })().catch(() => {});
    const waitFor = async (pred, ms = 4000) => {
      const until = Date.now() + ms;
      while (Date.now() < until) {
        if (events.some(pred)) return true;
        await new Promise((r) => setTimeout(r, 50));
      }
      return false;
    };

    // 1. An AGENT writes a spec — the most common event in the change flow.
    fs.writeFileSync(path.join(projectDir, "specs", "meal.spec.md"), "# meal\n\n- **MEAL-01** — Given…\n");
    assert.ok(await waitFor((e) => e.type === "governance"), "a written spec broadcasts governance");

    // 2. An agent writes a feature BRIEF.
    events.length = 0;
    fs.writeFileSync(path.join(projectDir, "docs", "features", "meal.md"), "# meal brief\n");
    assert.ok(await waitFor((e) => e.type === "governance"), "a written brief broadcasts governance");

    // 3. A ledger write made OUTSIDE this server (node qa/approve.mjs in a
    //    terminal) reads as a real decision, not a generic change.
    events.length = 0;
    fs.writeFileSync(
      path.join(projectDir, "qa", "approvals.json"),
      JSON.stringify({ schema: "cmp-approvals/1", artifacts: [{ artifact: "feature-spec:meal", status: "approved", hash: "x", approvedAt: "now" }] }),
    );
    assert.ok(await waitFor((e) => e.type === "approval" && e.origin === "file"), "a CLI ledger write broadcasts approval");

    ac.abort();
    await pump;
  } finally {
    service.stop();
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: a spec file's signature control binds to the MOST SPECIFIC artifact (exemplar-spec, never exemplar-feature)", async () => {
  const projectDir = makeApprovalsFixtureProject();
  const service = createPreviewService({ projectDir, port: 19940, hot: false, runRender: async () => {} });
  try {
    const st = await service.start();
    await new Promise((r) => setTimeout(r, 100));
    const page = await (await fetch(st.url)).text();
    const specs = page.match(/<section id="tab-specs"[\s\S]*?(?=<section id="tab-)/);
    if (!specs) return; // fixture without a specs section — nothing to bind
    const bindings = [...specs[0].matchAll(/<h3>specs\/([^<]+)<\/h3>\s*<div class="signature-bar">[\s\S]*?data-artifact="([^"]+)"/g)]
      .map((m) => [m[1], m[2]]);
    for (const [file, artifact] of bindings) {
      assert.notEqual(artifact, "exemplar-feature", `${file} must bind to its CONTRACT, not the 11-file exemplar feature`);
    }
  } finally {
    service.stop();
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: every decision response carries whatNext — the guided-flow prompt's payload", async () => {
  const projectDir = makeApprovalsFixtureProject();
  // A second RESOLVABLE artifact (intent), so the human's queue is non-empty
  // after the first signature. Unresolvable artifacts are correctly excluded —
  // a queue item whose button could only fail is not guidance.
  fs.mkdirSync(path.join(projectDir, "specs"), { recursive: true });
  fs.writeFileSync(path.join(projectDir, "specs", "intent.md"), "# intent\n\n## Purpose\n\nDemo.\n");
  const service = createPreviewService({ projectDir, port: 19950, hot: false, runRender: async () => {} });
  try {
    const st = await service.start();
    await new Promise((r) => setTimeout(r, 100));

    const post = async (url, body) =>
      (await fetch(new URL(url, st.url), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();

    // Approve one artifact: the response must say what happened, and list the
    // rest of the human's queue (the other unreviewed artifacts).
    const first = await post("/api/approve", { approvedBy: "Test Signer <test@example.com>", artifact: "design-system" });
    assert.equal(first.ok, true);
    assert.ok(first.whatNext, "decision responses carry whatNext");
    assert.equal(first.whatNext.did, "Signed design-system");
    assert.ok(Array.isArray(first.whatNext.pending));
    assert.ok(first.whatNext.pending.length > 0, "other unreviewed artifacts appear in the human's queue");
    assert.ok(first.whatNext.pending.every((p) => p.artifact !== "design-system"), "the just-signed artifact is not in its own queue");
    assert.ok(first.whatNext.pending.every((p) => p.tab && p.label), "each queue item is actionable: a tab and a plain-words label");

    // A reopen WITHOUT a reason is refused by the real library (07-28 audit:
    // a reopen walks back a signature; attribution is mechanical, not polite).
    const bare = await post("/api/reopen", { artifact: "design-system" });
    assert.equal(bare.ok, false);
    assert.match(bare.reason, /without a reason/);

    // Reopen (with its reason) carries whatNext too — with the reopened
    // artifact excluded from the queue (an unproven redesign waits on the
    // WORK, not the human).
    const re = await post("/api/reopen", { artifact: "design-system", reason: "tokens read too cold" });
    assert.equal(re.ok, true);
    assert.equal(re.whatNext.did, "Reopened design-system for redesign");
    assert.ok(re.whatNext.pending.every((p) => p.artifact !== "design-system"));

    // The page script ships the prompt.
    const page = await (await fetch(st.url)).text();
    assert.match(page, /showNextPrompt/);
    assert.match(page, /Ask the agent to proceed/);
    assert.match(page, /Take me there/);
  } finally {
    service.stop();
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: a concurrent foreign Gradle build DEFERS the render — never an error banner, never a renderer-down state", async () => {
  // The race this closes: an ad-hoc `./gradlew` (which stamps no lane marker) rewrites
  // composeApp/build/classes while renderScreens launches off that output, so the
  // JavaExec dies with "Could not find or load main class …PreviewHarnessKt". Nothing
  // is wrong with the tree — the class is back moments later. Reporting that as a
  // render failure sends the operator to debug a build that is fine.
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-"));
  fs.mkdirSync(path.join(projectDir, "composeApp", "src"), { recursive: true });
  const previewsDir = path.join(projectDir, "composeApp", "build", "previews");

  let raceRemaining = 0;
  const service = createPreviewService({
    projectDir,
    port: 19733,
    hot: false,
    runRender: async () => {
      if (raceRemaining > 0) {
        raceRemaining--;
        throw new Error(
          "Could not find or load main class com.example.app.inspector.PreviewHarnessKt",
        );
      }
      writeFakePreviews(previewsDir, ["shell"]);
    },
  });

  try {
    await service.start();
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(service.status().renderer.lastOutcome, "ok");
    const healthyAt = service.status().renderer.lastSuccessAt;

    // A foreign build holds the classes dir for the next two attempts.
    raceRemaining = 2;
    await service._renderCycle();

    const during = service.status();
    assert.equal(during.lastError, null, "a concurrent build sets NO lastError");
    assert.equal(during.lastErrorSource, null, "and no error source");
    assert.equal(
      during.renderer.lastOutcome,
      "ok",
      "the renderer is not 'down' — it was never given a chance to run",
    );
    assert.equal(during.renderer.consecutiveFailures, 0, "a race is not a failure streak");
    assert.equal(during.renderer.lastSuccessAt, healthyAt, "no new success is claimed either");

    const duringPage = await (await fetch(during.url)).text();
    assert.doesNotMatch(duringPage, /last render FAILED/, "no failure banner during the race");
    assert.doesNotMatch(
      duringPage,
      /<div class="banner banner-renderer">/,
      "no renderer-down banner during the race",
    );

    // When the foreign build finishes, the deferred render runs and settles normally.
    raceRemaining = 0;
    await service._renderCycle();
    const after = service.status();
    assert.equal(after.renderer.lastOutcome, "ok");
    assert.equal(after.lastError, null);
    assert.ok(after.renderer.lastSuccessAt >= healthyAt, "the retry produced a real render");
  } finally {
    service.stop();
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: a transient error that NEVER clears stops being quiet — it says stuck, keeps retrying, and never claims health it does not have", async () => {
  // The other half of the promise: deferring silently forever is a hang wearing a smile.
  // Past the quiet window the console must SAY it cannot refresh (and how old what it is
  // showing is) while still retrying — and renderer health, which agents read, must agree.
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-"));
  fs.mkdirSync(path.join(projectDir, "composeApp", "src"), { recursive: true });
  const previewsDir = path.join(projectDir, "composeApp", "build", "previews");

  let broken = false;
  const service = createPreviewService({
    projectDir,
    port: 19734,
    hot: false,
    runRender: async () => {
      if (broken) throw new Error("Could not find or load main class Whatever");
      writeFakePreviews(previewsDir, ["shell"]);
    },
  });

  try {
    await service.start();
    await new Promise((r) => setTimeout(r, 100));
    broken = true;
    // Exhaust the budget: every cycle defers until the allowance is spent.
    for (let i = 0; i < 13; i++) await service._renderCycle();
    const status = service.status();
    // The page states it plainly, with the age of what it IS showing — no Gradle dump.
    assert.equal(status.freshness.phase, "stuck", "the phase says stuck, not 'fine'");
    assert.equal(status.freshness.state, "stale");
    assert.ok(status.freshness.ageMs >= 0, "and how old the shown render is");
    // Renderer health agrees — the MCP surface never reports a health it does not have.
    assert.equal(status.renderer.lastOutcome, "failed");
    assert.ok(status.renderer.consecutiveFailures >= 1);
    const page = await (await fetch(status.url)).text();
    assert.match(page, /Cannot refresh right now/, "the banner states the situation");
    assert.match(page, /still retrying/, "and that it has not given up");
    assert.doesNotMatch(page, /BUILD FAILED/, "never a raw build dump");
  } finally {
    service.stop();
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: freshness is DERIVED — a source change past the last render reads stale, and a render clears it", async () => {
  // The console's core promise: pixels are never shown without a truthful provenance.
  // `state` falls out of comparing when the previews were produced against when a source
  // file last changed — it is never set by whoever happens to feel confident.
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-"));
  const srcDir = path.join(projectDir, "composeApp", "src");
  fs.mkdirSync(srcDir, { recursive: true });
  const previewsDir = path.join(projectDir, "composeApp", "build", "previews");

  const service = createPreviewService({
    projectDir,
    port: 19735,
    hot: false,
    runRender: async () => writeFakePreviews(previewsDir, ["shell"]),
  });

  try {
    await service.start();
    // Wait for the initial render to SETTLE rather than guessing at a delay: while a
    // render is in flight the pixels are not confirmed, so "stale" is the honest answer
    // and a fixed sleep would race it.
    const settled = async () => {
      for (let i = 0; i < 100; i++) {
        if (service.status().freshness.phase === "idle") return true;
        await new Promise((r) => setTimeout(r, 20));
      }
      return false;
    };
    assert.ok(await settled(), "the initial render settles");
    // Render once more explicitly: this covers any watcher event (including a spurious
    // FSEvents delivery for the tmpdir) that arrived during startup, so the assertion
    // tests the DERIVATION rather than the platform's watcher timing.
    // The render and the fetch are two steps, and a spurious FSEvents delivery
    // for the tmpdir can land BETWEEN them — flipping the page to stale while
    // the assertion is in flight, which is the page being honest, not wrong.
    // That race made this a rare, load-sensitive failure in the prepublish gate
    // (seen once during an `npm publish`, ~1 in 10 under full parallel load).
    // Retrying the render/fetch PAIR measures what the test is for — the
    // derivation "fresh tree -> no banner" — instead of the platform's watcher
    // timing, which the comment above already says is not the subject. The
    // assertion itself is unchanged: it still only ever accepts a page with no
    // banner, and only one fetched entirely inside a fresh window.
    let freshPage = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      await service._renderCycle();
      if (service.status().freshness.state !== "fresh") continue;
      const page = await (await fetch(service.status().url)).text();
      if (service.status().freshness.state !== "fresh") continue; // an event landed mid-fetch
      freshPage = page;
      break;
    }
    assert.ok(freshPage !== null, "a render settled without a watcher event landing mid-fetch");
    assert.equal(service.status().freshness.state, "fresh", "a just-rendered tree is fresh");
    assert.doesNotMatch(freshPage, /Showing the last good render/, "no provenance banner when current");

    // A save the render has not caught up with yet.
    service._noteSourceChangedForTest();
    const stale = service.status();
    assert.equal(stale.state, undefined);
    assert.equal(stale.freshness.state, "stale", "source moved past the pixels");
    const stalePage = await (await fetch(stale.url)).text();
    assert.match(stalePage, /out of date|Showing the last good render|Refreshing/i, "the page says so");

    // Rendering it clears the staleness, derived — nothing had to declare it fixed.
    await service._renderCycle();
    assert.equal(service.status().freshness.state, "fresh");
  } finally {
    service.stop();
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: a service that boots onto previews from a PREVIOUS run dates them by the manifest, not by 'now'", async () => {
  // This is the failure that started all of this: a console came up on week-old previews
  // and presented them as current. Age comes from the manifest's own mtime, so the very
  // first page load can already say how old what it is showing really is.
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-"));
  fs.mkdirSync(path.join(projectDir, "composeApp", "src"), { recursive: true });
  const previewsDir = path.join(projectDir, "composeApp", "build", "previews");
  writeFakePreviews(previewsDir, ["shell"]);
  // Backdate the manifest by two days, as a stale on-disk render would be.
  const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
  const manifestPath = path.join(previewsDir, "manifest.json");
  fs.utimesSync(manifestPath, twoDaysAgo / 1000, twoDaysAgo / 1000);

  const service = createPreviewService({
    projectDir,
    port: 19736,
    hot: false,
    // Never renders: the service can only report what it found on disk.
    runRender: async () => {
      throw new Error("Could not find or load main class Whatever");
    },
  });

  try {
    await service.start().catch(() => {});
    await new Promise((r) => setTimeout(r, 150));
    const f = service.status().freshness;
    assert.ok(f.lastRenderAt, "the on-disk render is dated");
    assert.ok(
      f.ageMs > 24 * 60 * 60 * 1000,
      `age comes from the manifest mtime, not boot time (got ${f.ageMs}ms)`,
    );
  } finally {
    service.stop();
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("service: a stale state with NOTHING pending says so — it never promises a refresh that is not coming", async () => {
  // The live bug this closes: in daemon mode the src watcher hands the render off to the
  // classes watcher, which never fires for a save that produces no new classes. The
  // console sat stale forever while its banner claimed "a refresh is queued".
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-"));
  fs.mkdirSync(path.join(projectDir, "composeApp", "src"), { recursive: true });
  const previewsDir = path.join(projectDir, "composeApp", "build", "previews");

  const service = createPreviewService({
    projectDir,
    port: 19737,
    hot: false,
    runRender: async () => writeFakePreviews(previewsDir, ["shell"]),
  });

  try {
    await service.start();
    for (let i = 0; i < 100 && service.status().freshness.phase !== "idle"; i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    await service._renderCycle();
    assert.equal(service.status().freshness.state, "fresh");

    // A change lands but no render is ever scheduled for it (the hand-off that got lost).
    service._noteSourceChangedForTest();
    const f = service.status().freshness;
    assert.equal(f.state, "stale");
    assert.equal(f.pending, false, "nothing is actually scheduled");
    assert.equal(f.phase, "unrefreshed", "and the phase says exactly that");

    const page = await (await fetch(service.status().url)).text();
    assert.match(page, /NOT refreshing/, "the banner does not promise a refresh");
    assert.doesNotMatch(page, /A refresh is queued/, "it must not claim a queue it does not have");
  } finally {
    service.stop();
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("guard: a second console for the same project is refused, and told where the first one is", async () => {
  // Three abandoned consoles were once found serving one project, each rendering into
  // the same build directory — the collision behind the "could not load main class"
  // failures, and two different URLs claiming to be the truth.
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-"));
  fs.mkdirSync(path.join(projectDir, "composeApp", "src"), { recursive: true });
  const previewsDir = path.join(projectDir, "composeApp", "build", "previews");
  const mk = (port) =>
    createPreviewService({
      projectDir,
      port,
      hot: false,
      runRender: async () => writeFakePreviews(previewsDir, ["shell"]),
    });

  const first = mk(19740);
  let second;
  try {
    await first.start();
    second = mk(19741);
    const err = await second.start().then(
      () => null,
      (e) => e,
    );
    assert.ok(err, "the second console must not start");
    assert.equal(err.code, "CMP_CONSOLE_ALREADY_RUNNING");
    assert.match(err.message, /already serving this project/);
    assert.match(err.message, /19740/, "it names the URL of the console that IS serving");
    assert.equal(err.existing.pid, process.pid);

    // Releasing the project lets the next console have it — the guard is not a wedge.
    first.stop();
    await second.start();
    assert.ok(second.status().url.includes("19741"));
  } finally {
    try { first.stop(); } catch { /* already stopped */ }
    try { if (second) second.stop(); } catch { /* never started */ }
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("guard: a record left by a CRASHED console never blocks the next start", async () => {
  // The failure mode a naive lock file introduces: a service that dies without cleanup
  // locks the project forever. Liveness is proven (pid + port), never assumed.
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-"));
  fs.mkdirSync(path.join(projectDir, "composeApp", "src"), { recursive: true });
  const previewsDir = path.join(projectDir, "composeApp", "build", "previews");

  // A record whose pid cannot exist: nothing may be inferred from it but "stale".
  fs.writeFileSync(
    consoleRegistryPath(projectDir),
    JSON.stringify({ pid: 2147483646, port: 19742, url: "http://127.0.0.1:19742/", startedAt: "2020-01-01T00:00:00.000Z" }),
  );
  assert.equal(await findLiveConsole(projectDir), null, "a dead pid is not a live console");

  const service = createPreviewService({
    projectDir,
    port: 19743,
    hot: false,
    runRender: async () => writeFakePreviews(previewsDir, ["shell"]),
  });
  try {
    await service.start(); // must not throw
    assert.ok(service.status().url.includes("19743"));
  } finally {
    service.stop();
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("guard: a BUSY console is still a live console — the probe hits cheap /status, never the heavy gallery page", async () => {
  // Observed 2026-07-28: the probe fetched "/" — the full gallery, which
  // derives the whole governed surface and blew the 2s budget under boot-time
  // load — so a busy console read as DEAD, the guard let a second service
  // start, and that service overwrote and then deleted the real console's
  // registry record. A liveness probe must cost the server nothing.
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-"));
  fs.mkdirSync(path.join(projectDir, "composeApp"), { recursive: true });
  const port = 19746;

  // A server that is ALIVE but busy: /status answers instantly, "/" hangs far
  // past the probe budget — the shape of a console mid-first-render.
  const busy = http.createServer((req, res) => {
    if (req.url === "/status") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
      return;
    }
    /* "/" never answers within any probe budget — hold the socket */
  });
  await new Promise((r) => busy.listen(port, "127.0.0.1", r));
  fs.writeFileSync(
    consoleRegistryPath(projectDir),
    JSON.stringify({ pid: process.pid, port, url: `http://127.0.0.1:${port}/`, startedAt: "2020-01-01T00:00:00.000Z" }),
  );
  try {
    const live = await findLiveConsole(projectDir);
    assert.ok(live, "a console whose gallery is slow is BUSY, not dead — it must still be found");
    assert.equal(live.port, port);
  } finally {
    busy.close();
    fs.rmSync(consoleRegistryPath(projectDir), { force: true });
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("guard: a live pid whose port does NOT answer is stale too — a recycled pid never wedges a project", async () => {
  // pids get reused. Requiring the port to answer as well is what keeps the guard from
  // blocking a project because some unrelated process inherited the number.
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-preview-"));
  fs.mkdirSync(path.join(projectDir, "composeApp"), { recursive: true });
  fs.writeFileSync(
    consoleRegistryPath(projectDir),
    JSON.stringify({ pid: process.pid, port: 19744, url: "http://127.0.0.1:19744/", startedAt: "2020-01-01T00:00:00.000Z" }),
  );
  try {
    // This process is alive, but nothing is listening on that port.
    assert.equal(await findLiveConsole(projectDir), null);
  } finally {
    fs.rmSync(consoleRegistryPath(projectDir), { force: true });
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("galleryHtml (front door): the Overview panel is in the in-place refresh set", () => {
  const html = galleryHtml({ appName: "Acme", viewport: { width: 411, height: 891 }, version: 1, cards: [] });
  const list = html.match(/const GOVERNED_PANELS = \[([\s\S]*?)\];/)[1];
  // Its body IS the queue of what still waits on you. An approval that
  // refreshed every other panel and left this one stale would leave the
  // console's entry point advertising an act the human just completed.
  assert.match(list, /"tab-overview"/, "the front door must refresh on every governed-state event");
  for (const id of ["tab-approvals", "tab-features", "tab-evidence"]) assert.match(list, new RegExp(`"${id}"`));
});

/**
 * The front door, end to end against a LIVE console — the proof the unit tests
 * cannot give. Its whole body is "what still waits on you", so the question
 * that matters is not whether it renders once, but whether it is CORRECT AGAIN
 * after the human acts. (The SSE path re-fetches `/` and swaps `#tab-overview`
 * in place; this pins the server half of that chain, and the GOVERNED_PANELS
 * test pins the client half.)
 */
test("front door (live): the queue names the act, and the act LEAVES the queue once signed", async () => {
  const { root: projectDir, specFile } = await makeArchitectureFixtureProject();
  const service = createPreviewService({ projectDir, port: 19893, hot: false, runRender: async () => {} });
  const overview = (page) => page.match(/<section id="tab-overview"[\s\S]*?<\/section>/)[0];
  try {
    const st = await service.start();

    // 1. Unsigned: the front door names the act and points at the section that
    //    owns the signature — never carrying a signing control of its own.
    let fd = overview(await (await fetch(st.url)).text());
    assert.match(fd, /Approve architecture/);
    assert.match(fd, /data-go-tab="architecture" data-go-artifact="architecture"/);
    // Karel, 2026-08-24: the front door signs too. The constraint that survives
    // is "not a second path" — the row emits the same .approve-btn contract the
    // owning section's signature bar does, so one endpoint serves both.
    assert.match(fd, /class="approve-btn fd-sign" data-artifact="architecture"/, "the row carries its own control");
    assert.match(fd, /read it first/, "…with reading it in full one click away");

    // 2. Sign it for real. Same endpoint the human's button uses.
    const res = await fetch(`${st.url}api/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy: "Test Signer <test@example.com>", artifact: "architecture" }),
    });
    assert.equal((await res.json()).ok, true);

    // 3. THE DEFECT THIS PINS: a re-render must drop the completed act. A front
    //    door that keeps advertising work the human just finished is worse than
    //    no front door — it is the console's entry point telling a lie.
    fd = overview(await (await fetch(st.url)).text());
    assert.doesNotMatch(fd, /Approve architecture/, "the signed act must leave the queue");

    // 4. Drift the signed bytes: the act comes BACK, and now carries the
    //    evidence — which files moved since the signature, and which did not.
    fs.appendFileSync(specFile, "\n<!-- edited after approval -->\n");
    fd = overview(await (await fetch(st.url)).text());
    assert.match(fd, /Re-approve architecture — it changed since signing/);
    assert.match(fd, /changed since you signed|not derivable/, "drift must arrive with its file split, or an honest absence");
    assert.match(fd, /still exactly as signed|not derivable/, "what the signature STILL covers is half the answer");
  } finally {
    service.stop();
    resetApprovalsBridgeCache(projectDir);
    resetReceiptBridgeCache(projectDir);
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

/**
 * The front door's own signature control, end to end against a LIVE console.
 * The unit tests pin the markup; this pins that the markup actually SIGNS —
 * same endpoint, same ledger, same refusal path as the owning section's bar.
 */
test("front door (live): approving from the Overview row signs the real artifact", async () => {
  const { root: projectDir } = await makeArchitectureFixtureProject();
  const service = createPreviewService({ projectDir, port: 19894, hot: false, runRender: async () => {} });
  const overview = (page) => page.match(/<section id="tab-overview"[\s\S]*?<\/section>/)[0];
  try {
    const st = await service.start();
    let fd = overview(await (await fetch(st.url)).text());
    const btn = fd.match(/<button[^>]*class="approve-btn fd-sign"[^>]*data-artifact="architecture"[^>]*>([^<]*)</);
    assert.ok(btn, "an unsigned artifact offers its control on the front door");
    assert.match(btn[1], /^Approve/, "unsigned reads Approve, not Re-approve");

    // The button's contract IS the POST — drive the endpoint it names.
    const res = await fetch(`${st.url}api/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy: "Test Signer <test@example.com>", artifact: "architecture" }),
    });
    assert.equal((await res.json()).ok, true);

    fd = overview(await (await fetch(st.url)).text());
    assert.doesNotMatch(fd, /data-artifact="architecture"/, "signed — the act and its control both leave the queue");

    // A refusal has somewhere to land ON THIS PANEL: before this, the only
    // error boxes lived on the Approvals and Features tabs, so a refusal from
    // here would have been written into a hidden element on another tab.
    const page = await (await fetch(st.url)).text();
    const panel = page.match(/<section id="tab-overview"[\s\S]*?<\/section>/)[0];
    assert.ok(
      /class="banner sig-error" id="overview-error"/.test(panel) || !/approve-btn/.test(panel),
      "a panel offering controls must own an error box",
    );
  } finally {
    service.stop();
    resetApprovalsBridgeCache(projectDir);
    resetReceiptBridgeCache(projectDir);
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});
