#!/usr/bin/env node
// scripts/canary.mjs — nightly freshness probe for the frozen version set.
//
// The golden template pins a mutually-agreeing Kotlin/KSP/CMP/Room/AGP set
// (template/gradle/libs.versions.toml). Two things must never happen silently:
//   1. the FROZEN set rots (stops building on fresh runners) — CI's job;
//   2. a NEWER set goes green without us noticing — this script's job: it
//      reports current-vs-latest per pinned coordinate so the canary workflow
//      can probe the latest set and, later, feed the `upgrade` registry.
//
// Usage:
//   node scripts/canary.mjs --check-only [--report <path>]
//       Query Maven metadata (a SMALL FIXED list of ~10 bounded HTTPS GETs,
//       nothing iterative) and write canary-report.json.
//   node scripts/canary.mjs --write-latest <projectDir> [--report <path>]
//       Rewrite <projectDir>/gradle/libs.versions.toml pins to the latest
//       STABLE versions (reuses an existing report file when present, so the
//       canary workflow does one fetch pass total).
//
// No dependencies beyond the Node 18+ stdlib (global fetch).

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const CATALOG = path.join(REPO_ROOT, "template", "gradle", "libs.versions.toml");

// ── The bounded probe list ──────────────────────────────────────────────────
// One representative coordinate per pinned toolchain axis. `key` MUST match
// the [versions] key in libs.versions.toml. This list is deliberately FIXED —
// do not make it dynamic or iterate over the whole catalog.
const DEPS = [
  { key: "kotlin",                repo: "central", group: "org.jetbrains.kotlin",       artifact: "kotlin-gradle-plugin" },
  { key: "ksp",                   repo: "central", group: "com.google.devtools.ksp",    artifact: "com.google.devtools.ksp.gradle.plugin" },
  { key: "compose-multiplatform", repo: "central", group: "org.jetbrains.compose",      artifact: "org.jetbrains.compose.gradle.plugin" },
  { key: "agp",                   repo: "google",  group: "com.android.tools.build",    artifact: "gradle" },
  { key: "room",                  repo: "google",  group: "androidx.room",              artifact: "room-runtime" },
  { key: "sqlite",                repo: "google",  group: "androidx.sqlite",            artifact: "sqlite-bundled" },
  { key: "koin",                  repo: "central", group: "io.insert-koin",             artifact: "koin-core" },
  { key: "ktor",                  repo: "central", group: "io.ktor",                    artifact: "ktor-client-core" },
  { key: "firebase-gitlive",      repo: "central", group: "dev.gitlive",                artifact: "firebase-auth" },
  { key: "navigation",            repo: "central", group: "org.jetbrains.androidx.navigation", artifact: "navigation-compose" },
];
const MAX_REQUESTS = 12; // hard circuit breaker — must exceed DEPS.length by little
if (DEPS.length > MAX_REQUESTS) {
  throw new Error(`probe list grew past the bounded cap (${DEPS.length} > ${MAX_REQUESTS})`);
}

function metadataUrl(dep) {
  const g = dep.group.replace(/\./g, "/");
  const base = dep.repo === "google"
    ? "https://dl.google.com/android/maven2"
    : "https://repo1.maven.org/maven2";
  return `${base}/${g}/${dep.artifact}/maven-metadata.xml`;
}

// ── Version catalog parsing (line-oriented; [versions] section only) ───────
export function readVersions(tomlPath) {
  const src = fs.readFileSync(tomlPath, "utf8");
  const versions = {};
  let inVersions = false;
  for (const raw of src.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("[")) {
      inVersions = line === "[versions]";
      continue;
    }
    if (!inVersions || !line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z0-9_-]+)\s*=\s*"([^"]+)"/);
    if (m) versions[m[1]] = m[2];
  }
  return versions;
}

// ── Version ordering + stability ────────────────────────────────────────────
// Pre-release markers → not "stable". Note KSP's two-part scheme
// (2.2.20-2.0.4) contains a dash but no marker word, so it stays stable.
function isStable(v) {
  return !/alpha|beta|rc|dev|eap|snapshot|preview|-m\d/i.test(v);
}

function compareVersions(a, b) {
  const seg = (v) => v.split(/[.\-+]/).map((s) => (/^\d+$/.test(s) ? Number(s) : s));
  const as = seg(a), bs = seg(b);
  for (let i = 0; i < Math.max(as.length, bs.length); i++) {
    const x = as[i], y = bs[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (typeof x === "number" && typeof y === "number") {
      if (x !== y) return x - y;
    } else {
      const c = String(x).localeCompare(String(y));
      if (c !== 0) return c;
    }
  }
  return 0;
}

// ── Metadata fetch ──────────────────────────────────────────────────────────
async function fetchMetadata(dep) {
  const url = metadataUrl(dep);
  const res = await fetch(url, {
    headers: { "user-agent": "create-cmp-canary (+https://github.com/kvdm-co-pilot/create-cmp)" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const xml = await res.text();
  const versions = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]);
  const lastUpdated = (xml.match(/<lastUpdated>(\d+)<\/lastUpdated>/) || [])[1] || null;
  return { url, versions, lastUpdated };
}

function latestOf(versions, filter = () => true) {
  return versions.filter(filter).sort(compareVersions).pop() || null;
}

// lastUpdated is yyyyMMddHHmmss (UTC) — days since the artifact last published.
function daysSince(lastUpdated) {
  if (!lastUpdated || lastUpdated.length < 8) return null;
  const d = new Date(Date.UTC(
    Number(lastUpdated.slice(0, 4)), Number(lastUpdated.slice(4, 6)) - 1,
    Number(lastUpdated.slice(6, 8))
  ));
  return Math.round((Date.now() - d.getTime()) / 86400000);
}

// ── Report ──────────────────────────────────────────────────────────────────
export async function buildReport() {
  const pinned = readVersions(CATALOG);
  const deps = [];
  for (const dep of DEPS) {
    const current = pinned[dep.key] ?? null;
    let entry = {
      key: dep.key,
      coordinate: `${dep.group}:${dep.artifact}`,
      repo: dep.repo,
      current,
    };
    try {
      const meta = await fetchMetadata(dep); // sequential: bounded + gentle
      const latestStable = latestOf(meta.versions, isStable);
      const latestAny = latestOf(meta.versions);
      entry = {
        ...entry,
        latestStable,
        latestAny,
        upToDate: current !== null && latestStable !== null && compareVersions(current, latestStable) >= 0,
        upstreamLastPublishedDaysAgo: daysSince(meta.lastUpdated),
      };
    } catch (err) {
      entry.error = String(err.message || err);
    }
    deps.push(entry);
  }

  const checked = deps.filter((d) => !d.error);
  const behind = checked.filter((d) => d.upToDate === false);
  return {
    generatedAt: new Date().toISOString(),
    catalog: path.relative(REPO_ROOT, CATALOG),
    deps,
    summary: {
      checked: checked.length,
      errors: deps.length - checked.length,
      upToDate: checked.length - behind.length,
      behind: behind.length,
      behindKeys: behind.map((d) => `${d.key} (${d.current} -> ${d.latestStable})`),
      // Proxy for "how stale is the frozen set": the most recent upstream
      // publish among coordinates we're behind on. 0 deps behind => null.
      frozenSetBehindNewestPublishDaysAgo: behind.length
        ? Math.min(...behind.map((d) => d.upstreamLastPublishedDaysAgo ?? Infinity))
        : null,
    },
  };
}

// ── --write-latest: apply latest stable pins to a stamped project ──────────
export function writeLatest(projectDir, report) {
  const toml = path.join(projectDir, "gradle", "libs.versions.toml");
  if (!fs.existsSync(toml)) throw new Error(`no version catalog at ${toml}`);
  let src = fs.readFileSync(toml, "utf8");
  const applied = [];
  for (const dep of report.deps) {
    if (!dep.latestStable || dep.error) continue;
    const re = new RegExp(`^(${dep.key.replace(/[-]/g, "\\-")}\\s*=\\s*")[^"]+(")`, "m");
    const before = src;
    src = src.replace(re, `$1${dep.latestStable}$2`);
    if (src !== before) applied.push(`${dep.key} = ${dep.latestStable}`);
  }
  fs.writeFileSync(toml, src);
  return applied;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2);
  const has = (f) => argv.includes(f);
  const val = (f) => {
    const i = argv.indexOf(f);
    return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
  };

  const reportPath = val("--report") || path.join(process.cwd(), "canary-report.json");
  const writeDir = val("--write-latest");

  if (!has("--check-only") && !writeDir) {
    process.stderr.write(
      "Usage:\n" +
      "  node scripts/canary.mjs --check-only [--report <path>]\n" +
      "  node scripts/canary.mjs --write-latest <projectDir> [--report <path>]\n"
    );
    process.exit(2);
  }

  // Reuse an existing report for --write-latest so the workflow fetches once.
  let report;
  if (writeDir && fs.existsSync(reportPath)) {
    report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    process.stdout.write(`Reusing report ${reportPath}\n`);
  } else {
    report = await buildReport();
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`Wrote ${reportPath}\n`);
  }

  process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
  for (const d of report.deps) {
    const status = d.error ? `ERROR ${d.error}` : d.upToDate ? "up-to-date" : `behind -> ${d.latestStable}`;
    process.stdout.write(`  ${d.key.padEnd(22)} ${String(d.current).padEnd(14)} ${status}\n`);
  }

  if (writeDir) {
    const applied = writeLatest(path.resolve(writeDir), report);
    process.stdout.write(`\nApplied latest stable pins to ${writeDir}/gradle/libs.versions.toml:\n`);
    for (const a of applied) process.stdout.write(`  ${a}\n`);
    if (applied.length === 0) process.stdout.write("  (nothing to apply)\n");
  }
}

main().catch((err) => {
  process.stderr.write(`canary failed: ${err.stack || err}\n`);
  process.exit(1);
});
