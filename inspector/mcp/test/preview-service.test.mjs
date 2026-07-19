// preview-service: pure helpers + the service loop with an injected render runner
// (no Gradle, no real app — a fake previews dir stands in for renderScreens output).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import {
  summarizeTree,
  diffScreenTrees,
  extractCompileErrors,
  galleryHtml,
  createPreviewService,
  detectAppPackage,
} from "../src/lib/preview-service.mjs";
import { resetApprovalsBridgeCache } from "../src/lib/approvals-bridge.mjs";
import { resetCommentsBridgeCache } from "../src/lib/comments-bridge.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL_APPROVALS_LIB = path.join(HERE, "..", "..", "..", "template", "qa", "lib", "approvals.mjs");
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
  fs.copyFileSync(REAL_APPROVALS_LIB, path.join(libDir, "approvals.mjs"));
  return root;
}

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
  assert.match(html, /Acme — live previews/);
  assert.match(html, /card changed/, "changed card is flagged");
  assert.match(html, /\/previews\/home\/screen\.png\?v=7/, "png served with version buster");
  assert.match(html, /1 violation\(s\)/);
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
    assert.equal(service.status().version, 1);

    fail = true;
    await service._renderCycle();
    const status = service.status();
    assert.equal(status.version, 1, "previous render is kept");
    assert.match(status.lastError, /compile broke/);

    const page = await (await fetch(status.url)).text();
    assert.match(page, /last render FAILED/, "gallery shows the failure banner");
    assert.match(page, /shell screen/, "previous cards still shown");
  } finally {
    service.stop();
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

test("galleryHtml: tab nav present; approvals/specs/designSystem default to honest empty states when omitted", () => {
  const html = galleryHtml({ appName: "Acme", viewport: { width: 411, height: 891 }, version: 1, cards: [] });
  assert.match(html, /class="tab-btn active" data-tab="screens"/);
  assert.match(html, /data-tab="design-system"/);
  assert.match(html, /data-tab="approvals"/);
  assert.match(html, /data-tab="specs"/);
  assert.match(html, /No design-system catalog available yet/);
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
      body: JSON.stringify({ artifact: "design-system" }),
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
      body: JSON.stringify({ artifact: "not-a-real-artifact" }),
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
      body: JSON.stringify({ artifact: "design-system" }),
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
      body: JSON.stringify({ artifact: "design-system" }),
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
      body: JSON.stringify({ artifact: "design-system" }),
    });

    const res = await fetch(`${st.url}api/reopen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artifact: "design-system" }),
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
      body: JSON.stringify({ artifact: "architecture" }),
    });
    assert.equal(neverApproved.status, 409);
    const neverApprovedBody = await neverApproved.json();
    assert.equal(neverApprovedBody.ok, false);
    assert.match(neverApprovedBody.reason, /not currently approved/);

    const unknown = await fetch(`${st.url}api/reopen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artifact: "not-a-real-artifact" }),
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
      body: JSON.stringify({ artifact: "design-system" }),
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
      body: JSON.stringify({ artifact: "design-system" }),
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
      body: JSON.stringify({ artifact: "design-system" }),
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
      body: JSON.stringify({ artifact: "design-system" }),
    });

    const pending = service.waitForApprovalDecision(5000);
    await fetch(`${st.url}api/reopen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artifact: "design-system" }),
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
      body: JSON.stringify({ artifact: "design-system" }),
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
