// preview-service: pure helpers + the service loop with an injected render runner
// (no Gradle, no real app — a fake previews dir stands in for renderScreens output).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import {
  summarizeTree,
  diffScreenTrees,
  galleryHtml,
  createPreviewService,
  detectAppPackage,
} from "../src/lib/preview-service.mjs";

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
