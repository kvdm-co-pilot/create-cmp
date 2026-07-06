#!/usr/bin/env node
// The verify lane — this project's single verification gate.
//
//   node qa/verify.mjs [--profile scaffold|local|ci] [--json]
//
// Runs every verification step this project carries, aggregates a typed
// PASS/FAIL verdict, and writes the evidence receipt to qa/evidence/latest.json.
// The receipt is COMMITTED with your change (see CLAUDE.md — a change is not
// done without it). Binary artifacts under qa-artifacts/ are never committed;
// the receipt references them by path + sha256.
//
// Verdicts per step: PASS | FAIL | SKIP. The lane verdict is PASS iff no step
// FAILed. SKIPs are recorded with reasons — green-with-gaps is visible, never
// silent. Exit code: 0 = PASS, 1 = FAIL.
//
// Profiles:
//   scaffold — build + unit tests (what `create-cmp --verify` proves at stamp time)
//   local    — everything; device-dependent steps SKIP when no device is attached
//   ci       — everything; SKIPs are recorded so the pipeline stays honest

import { execSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EVIDENCE_DIR = path.join(ROOT, "qa", "evidence");
const ARTIFACTS_DIR = path.join(ROOT, "qa-artifacts");

const args = process.argv.slice(2);
const profile = args.includes("--profile") ? args[args.indexOf("--profile") + 1] : "local";
const asJson = args.includes("--json");

const GRADLEW = process.platform === "win32" ? "gradlew.bat" : "./gradlew";

function sh(cmd, opts = {}) {
  const started = Date.now();
  // maxBuffer: first-run Gradle output easily exceeds spawnSync's 1MB default,
  // which would surface as a bogus FAIL (status null / ENOBUFS).
  const res = spawnSync(cmd, { shell: true, cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
  const ok = res.status === 0 && !res.error;
  return { ok, status: res.status, error: res.error?.message, out: `${res.stdout ?? ""}${res.stderr ?? ""}`, durationMs: Date.now() - started };
}

function tryGit(cmd) {
  try {
    return execSync(`git ${cmd}`, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function junitSummary(dir) {
  if (!fs.existsSync(dir)) return null;
  let tests = 0, failures = 0, errors = 0, skipped = 0;
  for (const f of fs.readdirSync(dir).filter((f) => f.startsWith("TEST-") && f.endsWith(".xml"))) {
    const xml = fs.readFileSync(path.join(dir, f), "utf8");
    const m = xml.match(/<testsuite[^>]*tests="(\d+)"[^>]*skipped="(\d+)"[^>]*failures="(\d+)"[^>]*errors="(\d+)"/);
    if (m) {
      tests += Number(m[1]);
      skipped += Number(m[2]);
      failures += Number(m[3]);
      errors += Number(m[4]);
    }
  }
  return { tests, failures, errors, skipped };
}

function deviceAttached() {
  const res = sh("adb devices", { timeout: 10_000 });
  if (!res.ok) return false;
  return res.out.split("\n").slice(1).some((l) => /\tdevice$/.test(l.trim().replace(/\s+/g, "\t")));
}

// ── Steps ──────────────────────────────────────────────────────────────────
// Each returns { name, verdict, reason?, durationMs, details? }. Failure
// reasons are worded for an AI collaborator to act on.

function stepBuild() {
  const res = sh(`${GRADLEW} :composeApp:assembleDebug --console=plain`);
  return {
    name: "build",
    verdict: res.ok ? "PASS" : "FAIL",
    reason: res.ok ? undefined : `assembleDebug failed — fix the build before anything else:\n${res.out.split("\n").filter((l) => /error|FAILURE/i.test(l)).slice(0, 12).join("\n")}`,
    durationMs: res.durationMs,
  };
}

// Runs a filtered slice of the JVM test tier and names the verdict after the gate it proves.
// The full suite already ran in unitTests; these re-runs are cheap (compiled, cached) and give
// each gate its own named verdict + failure text in the receipt.
function gradleTestStep(name, testsFilter, failHint) {
  return () => {
    const res = sh(`${GRADLEW} :composeApp:desktopTest --tests "${testsFilter}" --console=plain`);
    return {
      name,
      verdict: res.ok ? "PASS" : "FAIL",
      reason: res.ok
        ? undefined
        : `${failHint}\n${res.out.split("\n").filter((l) => /FAILED|\[(ARCH|SHELL|HOME)-\d+\]|error:/i.test(l)).slice(0, 15).join("\n")}`,
      durationMs: res.durationMs,
    };
  };
}

function stepUnitTests() {
  const res = sh(`${GRADLEW} :composeApp:desktopTest --console=plain`);
  const summary = junitSummary(path.join(ROOT, "composeApp/build/test-results/desktopTest"));
  return {
    name: "unitTests",
    verdict: res.ok ? "PASS" : "FAIL",
    reason: res.ok
      ? undefined
      : `desktopTest failed (${summary ? `${summary.failures + summary.errors} of ${summary.tests} tests` : "see output"}). Fix the failing behavior — do not delete or weaken tests to pass:\n${res.out.split("\n").filter((l) => /FAILED|error:/i.test(l)).slice(0, 12).join("\n")}`,
    durationMs: res.durationMs,
    details: summary ?? undefined,
  };
}

const stepConformance = gradleTestStep(
  "conformance",
  "*ArchitectureConformanceTest",
  "Architecture conformance violated (specs/app-base.spec.md ARCH clauses). The failing rule names the clause, files, and fix:",
);
const stepGoldenTrees = gradleTestStep(
  "goldenTrees",
  "*GoldenTreeTest",
  "Golden-tree drift: a screen's rendered STRUCTURE no longer matches qa/golden/. Unintended → fix your change; intended → regenerate with UPDATE_GOLDEN=1 and declare it:",
);
const stepA11y = gradleTestStep(
  "a11y",
  "*A11yConformanceTest",
  "A11y gate failed (SHELL-04): interactive nodes must expose a testTag, text, or contentDescription:",
);

function stepTokenDrift() {
  return {
    name: "tokenDrift",
    verdict: "SKIP",
    reason: "static color-literal rule runs in conformance (ARCH-05); runtime resolved-token drift needs the live inspector tier (harness M4)",
    durationMs: 0,
  };
}

function maestroAvailable() {
  return sh("maestro --version", { timeout: 15_000 }).ok;
}

function stepE2eSmoke() {
  if (!fs.existsSync(path.join(ROOT, "qa/e2e"))) {
    return { name: "e2eSmoke", verdict: "SKIP", reason: "e2e harness not included in this project (--no-appium)", durationMs: 0 };
  }
  if (!deviceAttached()) {
    return { name: "e2eSmoke", verdict: "SKIP", reason: "no Android device/emulator attached (adb)", durationMs: 0 };
  }
  if (!maestroAvailable()) {
    return { name: "e2eSmoke", verdict: "SKIP", reason: "maestro CLI not installed — curl -fsSL https://get.maestro.mobile.dev | bash", durationMs: 0 };
  }
  const install = sh(`${GRADLEW} :composeApp:installDebug --console=plain`);
  if (!install.ok) {
    return { name: "e2eSmoke", verdict: "FAIL", reason: "installDebug failed — the APK could not be installed on the attached device", durationMs: install.durationMs };
  }
  const res = sh("maestro test qa/e2e/smoke.yaml");
  return {
    name: "e2eSmoke",
    verdict: res.ok ? "PASS" : "FAIL",
    reason: res.ok ? undefined : `Maestro smoke failed (flow cites the SHELL spec clauses it proves):\n${res.out.split("\n").slice(-15).join("\n")}`,
    durationMs: install.durationMs + res.durationMs,
  };
}

// ── Lane ───────────────────────────────────────────────────────────────────

const stepsForProfile = {
  // scaffold: what `create-cmp --verify` proves at stamp time — the full JVM tier
  // (unit + conformance + golden + UI tests) plus the Android build.
  scaffold: [stepBuild, stepUnitTests],
  local: [
    stepBuild,
    stepUnitTests,
    stepConformance,
    stepGoldenTrees,
    stepTokenDrift,
    stepA11y,
    stepE2eSmoke,
  ],
};
stepsForProfile.ci = stepsForProfile.local;

if (!stepsForProfile[profile]) {
  console.error(`Unknown profile "${profile}" — use scaffold | local | ci.`);
  process.exit(2);
}

const steps = [];
for (const step of stepsForProfile[profile]) {
  const result = step();
  steps.push(result);
  if (!asJson) {
    const mark = result.verdict === "PASS" ? "✓" : result.verdict === "SKIP" ? "→" : "✗";
    console.log(`${mark} ${result.name}: ${result.verdict}${result.reason ? ` — ${result.reason.split("\n")[0]}` : ""}`);
  }
  if (result.name === "build" && result.verdict === "FAIL") break; // nothing downstream is meaningful
}

const verdict = steps.some((s) => s.verdict === "FAIL") ? "FAIL" : "PASS";

// Artifacts: hash whatever the run left under qa-artifacts/ (never committed).
const artifacts = [];
if (fs.existsSync(ARTIFACTS_DIR)) {
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else artifacts.push({ path: path.relative(ROOT, p), sha256: createHash("sha256").update(fs.readFileSync(p)).digest("hex") });
    }
  };
  walk(ARTIFACTS_DIR);
  artifacts.sort((a, b) => a.path.localeCompare(b.path));
}

// The receipt. Deterministic key order; ONE volatile timestamp field.
// commit.sha is the parent HEAD at run time (you cannot know the sha of the
// commit the receipt will be part of); commit.dirty lists what was uncommitted.
const receipt = {
  schema: "cmp-evidence/1",
  profile,
  verdict,
  commit: {
    sha: tryGit("rev-parse HEAD"),
    dirty: (tryGit("status --porcelain") ?? "").split("\n").filter(Boolean).map((l) => l.slice(3)).sort(),
  },
  steps,
  artifacts,
  toolVersions: {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
  },
  generatedAt: new Date().toISOString(),
};

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
fs.writeFileSync(path.join(EVIDENCE_DIR, "latest.json"), `${JSON.stringify(receipt, null, 2)}\n`);

if (asJson) console.log(JSON.stringify(receipt, null, 2));
else console.log(`\n${verdict === "PASS" ? "✅" : "❌"} verify lane: ${verdict} — receipt written to qa/evidence/latest.json (commit it with your change)`);

process.exit(verdict === "PASS" ? 0 : 1);
