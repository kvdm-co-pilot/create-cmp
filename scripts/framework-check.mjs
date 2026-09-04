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

import { createHash } from "node:crypto";
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

// 3. FAIL directions — one planted violation per guard that catches a SKIPPED
//    or FAKE test, each in the REAL stamped app (never a fixture), each asserted
//    to FAIL BY NAME and then reverted. A guard that has only ever passed is an
//    unread instrument (docs/PRINCIPLES.md #2); this is where each one is read.
const specPath = path.join(appDir, "specs", "home.spec.md");
const specText = fs.readFileSync(specPath, "utf8");
const m = specText.match(/^- \*\*(HOME-\d{2,})\*\*/m);
if (!m) fail(`could not find a HOME-NN clause to plant against in ${specPath}`, scratchRoot);
const clause = m[1];
const smokePath = path.join(appDir, "qa", "e2e", "smoke.yaml");
const smokeText = fs.readFileSync(smokePath, "utf8");
if (!/^# SPEC: HOME-02/m.test(smokeText)) fail(`the stamped smoke flow does not cite HOME-02 — e2eCoverage has nothing to lose`, scratchRoot);
const testDir = path.join(appDir, "composeApp", "src", "commonTest", "kotlin", "com", "example");
const plantedTest = path.join(testDir, "PlantedTest.kt");
const spineFile = path.join(appDir, "qa", "lib", "spec-coverage.mjs");
const spineText = fs.readFileSync(spineFile, "utf8");
const receiptPath = path.join(appDir, "qa", "evidence", "latest.json");

/** @type {Array<{label: string, plant: () => void, revert: () => void, step: string, names: string[], hook?: RegExp}>} */
const PLANTS = [
  {
    label: "orphaned citation",
    plant: () => fs.writeFileSync(specPath, specText.replace(`**${clause}**`, `**${clause}X**`)),
    revert: () => fs.writeFileSync(specPath, specText),
    step: "specCoverage",
    names: [clause],
  },
  {
    label: "unbound citation",
    // A tag on a CLASS declaration, no test within the binding window: the
    // clause exists, the tag exists, and nothing runs. Must read as uncited.
    plant: () => {
      fs.writeFileSync(specPath, `${specText.trimEnd()}\n- **HOME-99** — Given a planted clause, Then a class-level tag must not count.\n`);
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(plantedTest, "package com.example\n\n// SPEC: HOME-99\nclass PlantedTest {\n  val notATest = 1\n  val stillNot = 2\n  val nope = 3\n  val nah = 4\n  val no = 5\n  val never = 6\n  fun helper() {}\n}\n");
    },
    revert: () => {
      fs.writeFileSync(specPath, specText);
      fs.rmSync(plantedTest, { force: true });
    },
    step: "specCoverage",
    names: ["HOME-99"],
  },
  {
    label: "tier unmet",
    // A clause only a device can observe, cited only from the JVM.
    plant: () => {
      fs.writeFileSync(specPath, `${specText.trimEnd()}\n- **HOME-98** [tier: e2e] — Given a planted device-only clause, Then a JVM citation cannot satisfy it.\n`);
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(plantedTest, "package com.example\n\nimport kotlin.test.Test\n\nclass PlantedTest {\n  // SPEC: HOME-98\n  @Test\n  fun planted() {}\n}\n");
    },
    revert: () => {
      fs.writeFileSync(specPath, specText);
      fs.rmSync(plantedTest, { force: true });
    },
    step: "specCoverage",
    names: ["HOME-98"],
  },
  {
    label: "feature without a flow",
    // The exemplar's flow stops citing its clause: a real feature with no device journey.
    plant: () => fs.writeFileSync(smokePath, smokeText.replace(/^# SPEC: HOME-02.*$/m, "# (citation removed by the framework check)")),
    revert: () => fs.writeFileSync(smokePath, smokeText),
    step: "e2eCoverage",
    names: ["[home]"],
  },
  {
    label: "flow the lane never runs",
    // The citation lives in a nested flow Maestro's directory run does not execute.
    plant: () => {
      fs.writeFileSync(smokePath, smokeText.replace(/^# SPEC: HOME-02.*$/m, "# (moved to a nested flow by the framework check)"));
      fs.mkdirSync(path.join(appDir, "qa", "e2e", "wip"), { recursive: true });
      fs.writeFileSync(path.join(appDir, "qa", "e2e", "wip", "planted.yaml"), smokeText);
    },
    revert: () => {
      fs.writeFileSync(smokePath, smokeText);
      fs.rmSync(path.join(appDir, "qa", "e2e", "wip"), { recursive: true, force: true });
    },
    step: "e2eCoverage",
    names: ["[home]"],
  },
  {
    label: "narrowed surface declaration",
    // payment-blueprint's planted proof: one entry removed from the surface
    // declaration un-attests a whole layer while every checker is intact. A
    // fresh Compose app has no declaration; writing a narrow one is the same
    // edit — the declaration enters the region unrecorded, and the lock says so.
    plant: () => fs.writeFileSync(path.join(appDir, "qa", "verified-surface.json"), JSON.stringify({ surface: ["qa"] })),
    revert: () => fs.rmSync(path.join(appDir, "qa", "verified-surface.json"), { force: true }),
    step: "harnessIntegrity",
    names: ["unrecorded"],
    hook: /harnessIntegrity|vouch/i,
  },
  {
    label: "edited lane cannot vouch",
    // One byte in the machine-owned region: the lane that issues verdicts is no
    // longer the lane this app was given, and the hook must refuse its receipt.
    plant: () => fs.writeFileSync(spineFile, `${spineText}\n// planted by the framework check\n`),
    revert: () => fs.writeFileSync(spineFile, spineText),
    step: "harnessIntegrity",
    names: ["modified"],
    hook: /harnessIntegrity|vouch/i,
  },
];

let plantsMs = 0;
for (const plant of PLANTS) {
  plant.plant();
  const run = runSmoke(appDir);
  plantsMs += run.ms;
  if (run.hung) fail(`"${plant.label}" did not return inside ${BOUND_MS}ms — the framework HANGS on a failing input`, scratchRoot);
  if (!run.receipt) fail(`"${plant.label}" returned no receipt (exit ${run.exit}):\n${run.stderr.slice(-600)}`, scratchRoot);
  const row = (run.receipt.steps ?? []).find((s) => s.name === plant.step);
  if (run.receipt.verdict !== "FAIL" || !row || row.verdict !== "FAIL") {
    fail(`planted "${plant.label}" and the lane said ${run.receipt.verdict} (${plant.step}: ${row ? row.verdict : "no row"}) — the guard did not FAIL BY NAME`, scratchRoot);
  }
  const reason = String(row.reason ?? "");
  for (const name of plant.names) {
    if (!reason.includes(name)) fail(`${plant.step} FAILed on "${plant.label}" but did not NAME ${name}:\n${reason}`, scratchRoot);
  }
  if (plant.hook) {
    // The hook refuses a smoke-stage receipt on its stage, and a FAIL receipt
    // on its verdict, before the vouching check runs. The vouching guard exists
    // for the FORGERY — the top-level verdict edited to PASS over rows that say
    // the lane could not vouch for itself — so that is the receipt presented:
    // the same rows, change stage, verdict flipped. The hook must still refuse,
    // and for the vouching reason.
    fs.writeFileSync(receiptPath, JSON.stringify({ ...run.receipt, profile: "local", stage: "change", verdict: "PASS" }, null, 2));
    const h = hookRefuses(appDir);
    if (!h.refused || !plant.hook.test(h.stderr)) fail(`the Stop hook did not refuse the "${plant.label}" receipt for the right reason:\n${h.stderr.slice(-400)}`, scratchRoot);
  }
  out(`  FAIL: ${plant.label.padEnd(26)} ${String(run.ms).padStart(5)}ms   ✓ ${plant.step} FAIL naming ${plant.names.join(", ")}`);
  plant.revert();
}
const failRun = { ms: plantsMs };

// 4. The Stop hook must refuse a FAIL receipt — the framework's last link. And
//    a receipt whose device tier SKIPped for an ENVIRONMENTAL reason is refused
//    too, on this real app: a synthetic row with the tree's own valid hash.
{
  PLANTS[0].plant();
  const r = runSmoke(appDir);
  PLANTS[0].revert();
  if (!r.receipt || r.receipt.verdict !== "FAIL") fail(`could not produce a FAIL receipt for the hook check`, scratchRoot);
  const hook = hookRefuses(appDir);
  if (!hook.refused) fail(`the Stop hook did not refuse a FAIL receipt`, scratchRoot);
  out(`  Stop hook            refuses a FAIL receipt ✓`);
}
{
  const green = runSmoke(appDir);
  if (!green.receipt || green.receipt.verdict !== "PASS") fail(`could not produce a PASS receipt for the device-tier hook check`, scratchRoot);
  // Local-profile shape: the hook refuses smoke receipts on stage alone, so the
  // planted row must sit on a change-stage receipt with this tree's real hash.
  const planted = { ...green.receipt, profile: "local", stage: "change", steps: [...green.receipt.steps, { name: "e2eSmoke", verdict: "SKIP", skipKind: "environment", reason: "device tier disabled by CMP_DEVICE=none (planted)", durationMs: 0 }] };
  fs.writeFileSync(receiptPath, JSON.stringify(planted, null, 2));
  const hook = hookRefuses(appDir);
  if (!hook.refused || !/device tier did not run/.test(hook.stderr)) fail(`the Stop hook did not refuse a receipt whose device tier was skipped for an environmental reason:\n${hook.stderr.slice(-400)}`, scratchRoot);
  out(`  Stop hook            refuses a skipped device tier ✓`);
}

// 5. Everything reverted, and it passes again — the plants were the only cause.
const again = runSmoke(appDir);
if (again.hung || !again.receipt || again.receipt.verdict !== "PASS") {
  const bad = ((again.receipt && again.receipt.steps) || []).filter((s) => s.verdict === "FAIL" || s.verdict === "ERROR").map((s) => `${s.name}: ${String(s.reason ?? "").split("\n")[0]}`).join("; ");
  fail(`after reverting every plant the lane did not return PASS (${bad || "no receipt"})`, scratchRoot);
}
out(`  revert → PASS        ${again.ms}ms   ✓`);

// 6. The SHIPPED twin. Everything above proves the ENGINE's lane returns, using
//    a script that lives in this repo and has never existed inside a generated
//    project. `qa/framework-check.mjs` is the half an app runs against itself,
//    and until 0.24.0 it did not ship at all while four shipped files named it
//    — so payment-blueprint hand-built its own copy and, later, briefed a whole
//    wave to plant-and-build by hand at 30–60 s a cycle. An advertised tool
//    nobody was given is worse than no tool. This leg proves the one we now
//    hand over actually runs, on the tree as shipped, and leaves it as it was.
{
  // Snapshot by hashing the tree, NOT by `git status`: the scratch app is a
  // bare temp directory with no repo, so a git-based guard exits non-zero and
  // a `status === 0` condition around it skips silently — the check would then
  // print "tree unchanged" having compared nothing. (It did, for one run, until
  // this comment's author read the output he had just written.)
  // Build output is excluded for the same reason inputs-hash excludes lane
  // outputs: a run legitimately writes composeApp/build/.cmp-step-cache.json,
  // and hashing it would report the lane doing its job as tree damage.
  const IGNORED_DIRS = new Set(["build", ".gradle", ".git", "node_modules"]);
  const snapshot = (dir) => {
    const h = createHash("sha256");
    const walk = (abs, rel) => {
      for (const ent of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const childAbs = path.join(abs, ent.name);
        const childRel = rel ? `${rel}/${ent.name}` : ent.name;
        if (ent.isDirectory()) {
          if (IGNORED_DIRS.has(ent.name)) continue;
          h.update(`D:${childRel}\0`);
          walk(childAbs, childRel);
        } else if (ent.isFile()) {
          h.update(`F:${childRel}\0`).update(fs.readFileSync(childAbs)).update("\0");
        }
      }
    };
    walk(dir, "");
    return h.digest("hex");
  };
  const before = snapshot(appDir);
  const t6 = t();
  const twin = spawnSync(process.execPath, [path.join(appDir, "qa", "framework-check.mjs")], {
    cwd: appDir,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const twinMs = t() - t6;
  if (twin.status !== 0) fail(`the shipped qa/framework-check.mjs did not pass in a fresh scaffold:\n${(twin.stdout ?? "") + (twin.stderr ?? "")}`, scratchRoot);
  // It plants into a real tree. If it can leave residue, nobody will run it
  // twice — and an instrument nobody runs is the failure this whole file is about.
  const after = snapshot(appDir);
  if (before !== after) fail(`qa/framework-check.mjs changed the tree it ran in (${before.slice(0, 12)} → ${after.slice(0, 12)})`, scratchRoot);
  const plantCount = (twin.stdout.match(/^\s+FAIL: /gm) || []).length;
  out(`  shipped twin         ${twinMs}ms   ✓ qa/framework-check.mjs: ${plantCount} plants, tree unchanged`);
}

const total = stampMs + pass.ms + failRun.ms + again.ms;
out(`\nframework check: PASS — the lane returns, both ways, and every skipped-test guard fails by name: ${PLANTS.length} plants, ${total}ms total (bound ${BOUND_MS}ms per direction).`);
if (keep) out(`Scratch app kept: ${scratchRoot}`);
else fs.rmSync(scratchRoot, { recursive: true, force: true });
