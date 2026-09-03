#!/usr/bin/env node
// framework-check.mjs — GATE-RULES Rule 0, as a command.
//
//   node scripts/framework-check.mjs [--bound-ms 10000] [--keep]
//
// Before any real work is pointed at the harness, prove the FRAMEWORK returns:
// a deterministic PASS and a deterministic FAIL, fast, through the real lane
// machinery (runner, marker, receipt, journal, Stop hook), with a bound short
// enough that a hang is obvious rather than patient. No Gradle, no device, no
// network — the `smoke` profile is every pure-Node gate and nothing else.
//
// Why this exists: the expensive failure class is not a wrong verdict, it is a
// hang. androidChecks sat at 0.5% CPU for hours with no bound; a release build
// ran fourteen minutes without a byte; a scheduled audit died as exit 143 with
// no row on any receipt. Every one was discovered hours in. This is that
// discovery made in the first ten seconds, and it is the first thing to run in
// a repo whose harness is new.
//
// Rule 1 (calibration) is a different instrument — qa/refusal-demo.mjs — and
// this script deliberately does not replace it: refusal-demo proves each gate
// READS; this proves the lane RETURNS.
//
// Exit 0 only if: PASS direction returned PASS within the bound; FAIL direction
// returned FAIL naming specCoverage within the bound; and the Stop hook refused
// the failing receipt. Anything else is a framework defect and exits 1 with the
// scratch app kept for inspection.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP_NAME = "SmokeCheck";
const APP_PACKAGE = "com.example.smokecheck";

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
if (flag("--help") || flag("-h")) {
  console.log("node scripts/framework-check.mjs [--bound-ms <ms>] [--keep]\n  Proves the lane returns a fast deterministic PASS and FAIL through the smoke profile. Default bound 10000 ms per direction.");
  process.exit(0);
}
const BOUND_MS = Number.parseInt(opt("--bound-ms", "10000"), 10);
const keep = flag("--keep");

const t = () => Date.now();
const out = (s) => process.stdout.write(`${s}\n`);
const fail = (msg, scratch) => {
  process.stderr.write(`\nframework check: FAIL — ${msg}\n${scratch ? `Scratch app kept for inspection: ${scratch}\n` : ""}`);
  process.exit(1);
};

/** Run the scratch app's lane with --profile smoke --json; return {verdict, steps, ms, exit}. */
function runSmoke(appDir) {
  const started = t();
  const res = spawnSync(process.execPath, [path.join(appDir, "qa", "verify.mjs"), "--profile", "smoke", "--json", "--no-journal"], {
    cwd: appDir,
    encoding: "utf8",
    env: { ...process.env },
    // The bound IS the assertion: a lane that does not return inside it is the
    // hang this script exists to catch. Killed, not waited out.
    timeout: BOUND_MS,
    killSignal: "SIGKILL",
    maxBuffer: 16 * 1024 * 1024,
  });
  const ms = t() - started;
  if (res.error && res.error.code === "ETIMEDOUT") return { hung: true, ms };
  let receipt = null;
  try {
    const text = res.stdout ?? "";
    receipt = JSON.parse(text.slice(text.indexOf("{")));
  } catch {
    /* no receipt — reported below */
  }
  return { hung: false, ms, exit: res.status, receipt, stderr: res.stderr ?? "" };
}

function hookRefuses(appDir) {
  const res = spawnSync(process.execPath, [path.join(appDir, "qa", "receipt-check.mjs"), "--hook"], {
    cwd: appDir,
    encoding: "utf8",
    input: "{}",
    timeout: 5000,
  });
  return { refused: res.status === 2, stderr: res.stderr ?? "" };
}

out(`framework check: bound=${BOUND_MS}ms per direction, profile=smoke (no Gradle, no device)`);

// 1. Stamp — the same shape fleet-check uses, so this proves the tree as shipped.
const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-framework-check-"));
const appDir = path.join(scratchRoot, APP_NAME);
const s0 = t();
const stamp = spawnSync(
  process.execPath,
  [path.join(REPO_ROOT, "bin", "create-cmp.mjs"), appDir, "--yes", "--name", APP_NAME, "--package", APP_PACKAGE, "--no-ios", "--no-firebase", "--no-verify"],
  { cwd: REPO_ROOT, encoding: "utf8", timeout: BOUND_MS },
);
const stampMs = t() - s0;
if (stamp.status !== 0 || !fs.existsSync(path.join(appDir, "qa", "verify.mjs"))) fail(`the stamp did not produce a runnable app (${stampMs}ms)`, scratchRoot);
out(`  stamp                ${stampMs}ms`);

// 2. PASS direction — a fresh scaffold must return PASS, fast.
const pass = runSmoke(appDir);
if (pass.hung) fail(`PASS direction did not return inside ${BOUND_MS}ms — the framework HANGS on its own fresh scaffold`, scratchRoot);
if (!pass.receipt) fail(`PASS direction returned no receipt (exit ${pass.exit}):\n${pass.stderr.slice(-600)}`, scratchRoot);
if (pass.receipt.verdict !== "PASS") {
  const bad = (pass.receipt.steps ?? []).filter((s) => s.verdict === "FAIL" || s.verdict === "ERROR").map((s) => `${s.name} (${s.verdict})`).join(", ");
  fail(`a FRESH scaffold's smoke lane is ${pass.receipt.verdict}: ${bad || "no failing row named"}`, scratchRoot);
}
if (pass.receipt.stage !== "smoke") fail(`receipt names stage "${pass.receipt.stage}", expected "smoke"`, scratchRoot);
out(`  PASS direction       ${pass.ms}ms   ✓ ${pass.receipt.steps.length} steps, verdict PASS, stage smoke`);

// 3. FAIL direction — plant ONE deterministic violation in the REAL stamped
//    spec (not a fixture): turn a clause bullet from `-` to `*`, which the
//    clause scanner does not read, so exactly one clause goes uncited... except
//    that makes it vanish, not orphan. Orphan the CITATION instead: rename one
//    clause id in the spec so the test's `// SPEC:` tag points at nothing.
const specPath = path.join(appDir, "specs", "home.spec.md");
const specText = fs.readFileSync(specPath, "utf8");
const m = specText.match(/^- \*\*(HOME-\d{2,})\*\*/m);
if (!m) fail(`could not find a HOME-NN clause to plant against in ${specPath}`, scratchRoot);
const clause = m[1];
fs.writeFileSync(specPath, specText.replace(`**${clause}**`, `**${clause}X**`));
const failRun = runSmoke(appDir);
if (failRun.hung) fail(`FAIL direction did not return inside ${BOUND_MS}ms — the framework HANGS on a failing input`, scratchRoot);
if (!failRun.receipt) fail(`FAIL direction returned no receipt (exit ${failRun.exit}):\n${failRun.stderr.slice(-600)}`, scratchRoot);
const sc = (failRun.receipt.steps ?? []).find((s) => s.name === "specCoverage");
if (failRun.receipt.verdict !== "FAIL" || !sc || sc.verdict !== "FAIL") {
  fail(`planted an orphaned citation for ${clause} and the lane said ${failRun.receipt.verdict} (specCoverage: ${sc ? sc.verdict : "no row"}) — the gate did not FAIL BY NAME`, scratchRoot);
}
if (!String(sc.reason ?? "").includes(clause)) fail(`specCoverage FAILed but did not NAME ${clause}:\n${sc.reason}`, scratchRoot);
out(`  FAIL direction       ${failRun.ms}ms   ✓ verdict FAIL, specCoverage FAIL naming ${clause}`);

// 4. The Stop hook must refuse the failing receipt — the framework's last link.
const hook = hookRefuses(appDir);
if (!hook.refused) fail(`the Stop hook did not refuse a FAIL receipt`, scratchRoot);
out(`  Stop hook            refuses ✓`);

// 5. Revert, and it passes again — the plant was the only cause.
fs.writeFileSync(specPath, specText);
const again = runSmoke(appDir);
if (again.hung || !again.receipt || again.receipt.verdict !== "PASS") fail(`after reverting the plant the lane did not return PASS`, scratchRoot);
out(`  revert → PASS        ${again.ms}ms   ✓`);

const total = stampMs + pass.ms + failRun.ms + again.ms;
out(`\nframework check: PASS — the lane returns, both ways, in ${total}ms total (bound ${BOUND_MS}ms per direction).`);
if (keep) out(`Scratch app kept: ${scratchRoot}`);
else fs.rmSync(scratchRoot, { recursive: true, force: true });
