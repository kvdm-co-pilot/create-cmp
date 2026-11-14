#!/usr/bin/env node
// Measure a Kotlin/Wasm release build: bytes on the wire and time to first rendered frame,
// in headless Chromium under phone-like conditions.
//
//   PLAYWRIGHT_FROM=<dir with node_modules/playwright> [CHROMIUM=<browser binary>] \
//     node scripts/web-load.mjs <dist-dir> [runs]
//
// Not a dependency of create-cmp and not part of `npm test`: it borrows a Playwright install
// from wherever one exists (PLAYWRIGHT_FROM). Results for the 2026-11-13 template app are
// in docs/features/web-platform.md ("Measured").
// The dist is served from a local server that compresses the way a real host would
// (brotli, else gzip), with long-lived caching off so every run is a cold load.
// Profiles follow Lighthouse's mobile presets: CPU slowed 4x, plus the network below.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";

if (!process.env.PLAYWRIGHT_FROM) throw new Error("set PLAYWRIGHT_FROM to a directory whose node_modules has playwright");
const require = createRequire(path.join(path.resolve(process.env.PLAYWRIGHT_FROM), "package.json"));
const { chromium } = require("playwright");

const dist = path.resolve(process.argv[2]);
const runs = Number(process.argv[3] || 3);

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".ttf": "font/ttf", ".json": "application/json", ".map": "application/json" };
const cache = new Map();
function encoded(file, enc) {
  const key = `${file}|${enc}`;
  if (!cache.has(key)) {
    const raw = fs.readFileSync(file);
    cache.set(key, enc === "br" ? zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }) : enc === "gzip" ? zlib.gzipSync(raw, { level: 9 }) : raw);
  }
  return cache.get(key);
}

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = path.join(dist, rel === "/" ? "index.html" : rel);
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    return res.end();
  }
  const accept = String(req.headers["accept-encoding"] || "");
  const enc = /\bbr\b/.test(accept) ? "br" : /gzip/.test(accept) ? "gzip" : null;
  const body = encoded(file, enc);
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", ...(enc ? { "content-encoding": enc } : {}), "cache-control": "no-store", "content-length": body.length });
  res.end(body);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/`;

// Sizes on disk and compressed, per file the page loads (source maps are never fetched).
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (!e.name.endsWith(".map") && !e.name.endsWith(".LICENSE.txt")) files.push(p);
  }
})(dist);
const sizes = files.map((f) => ({ file: path.relative(dist, f), raw: fs.statSync(f).size, gzip: encoded(f, "gzip").length, br: encoded(f, "br").length }));
const total = sizes.reduce((a, s) => ({ raw: a.raw + s.raw, gzip: a.gzip + s.gzip, br: a.br + s.br }), { raw: 0, gzip: 0, br: 0 });

const PROFILES = {
  // Lighthouse "Slow 4G" (its mobile default): 150 ms RTT, 1.6 Mbps down, 750 kbps up.
  "slow-4g": { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
  // A good 4G connection: 40 ms RTT, 10 Mbps down.
  "fast-4g": { latency: 40, downloadThroughput: (10 * 1024 * 1024) / 8, uploadThroughput: (5 * 1024 * 1024) / 8 },
  // Shop wifi / broadband: 20 ms RTT, 50 Mbps down.
  "wifi": { latency: 20, downloadThroughput: (50 * 1024 * 1024) / 8, uploadThroughput: (20 * 1024 * 1024) / 8 },
};

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const results = {};
for (const [name, net] of Object.entries(PROFILES)) {
  const times = [];
  let bytes = 0;
  for (let i = 0; i < runs; i++) {
    const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", { offline: false, ...net });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    let wire = 0;
    cdp.on("Network.loadingFinished", (e) => (wire += e.encodedDataLength));
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    const t0 = Date.now();
    await page.goto(url, { waitUntil: "commit" });
    // First rendered frame: Compose's canvas exists, has a size, and two animation frames
    // have passed since — the first composition has been drawn.
    await page.waitForFunction(() => {
      const find = (root) => {
        const c = root.querySelector("canvas");
        if (c) return c;
        for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { const f = find(el.shadowRoot); if (f) return f; }
        return null;
      };
      const c = find(document);
      return !!c && c.width > 0 && c.height > 0;
    }, null, { timeout: 120_000, polling: 50 }).catch(async (e) => { console.error("errors so far:", errors); console.error(await page.content()); throw e; });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const ms = Date.now() - t0;
    times.push(ms);
    bytes = wire;
    if (i === 0 && name === "wifi" && process.env.SCREENSHOT) await page.screenshot({ path: process.env.SCREENSHOT });
    if (errors.length) console.error(`${name} run ${i + 1} errors:`, errors.slice(0, 5));
    await context.close();
  }
  times.sort((a, b) => a - b);
  results[name] = { medianMs: times[Math.floor(times.length / 2)], allMs: times, wireBytes: bytes };
}
await browser.close();
server.close();

const kib = (n) => `${(n / 1024).toFixed(0)} KiB`;
console.log(JSON.stringify({ dist, sizes, total, results }, null, 2));
console.error("\nfile                              raw        gzip       brotli");
for (const s of sizes.sort((a, b) => b.raw - a.raw)) console.error(`${s.file.padEnd(34)}${kib(s.raw).padStart(9)}  ${kib(s.gzip).padStart(9)}  ${kib(s.br).padStart(9)}`);
console.error(`${"TOTAL".padEnd(34)}${kib(total.raw).padStart(9)}  ${kib(total.gzip).padStart(9)}  ${kib(total.br).padStart(9)}`);
for (const [n, r] of Object.entries(results)) console.error(`${n.padEnd(8)} first frame median ${r.medianMs} ms  (${r.allMs.join(", ")})  on the wire ${kib(r.wireBytes)}`);
