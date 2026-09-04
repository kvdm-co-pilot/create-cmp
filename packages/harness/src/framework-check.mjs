#!/usr/bin/env node
// framework-check.mjs — GATE-RULES Rule 0, in THIS app's own tree.
//
//   node qa/framework-check.mjs [--bound-ms 10000] [--budget-ms 5000] [--json]
//
// Before you point real work at this harness, prove the FRAMEWORK returns: a
// deterministic PASS and a deterministic FAIL, fast, through the real lane
// machinery (runner, receipt, Stop hook), with a bound short enough that a hang
// is obvious rather than patient. No Gradle, no device, no network — `--profile
// smoke` is every pure-Node gate and nothing else.
//
// WHEN TO RUN IT. Whenever you are about to add a gate, and whenever the lane
// starts behaving oddly. It is also the answer to a question that costs hours
// when it is answered by hand: *how do I prove this new gate actually catches
// what it claims?* Add a plant here and run this — seconds — instead of
// planting a defect, running the full build, reading the red, reverting, and
// building again. That hand cycle is 30–60 s on a real project, it is paid on
// every plant forever, and while it happens it is indistinguishable from
// progress. GATE-RULES Rule 1 calls a calibration "four steps, seconds each";
// this is the instrument that makes that true, and it reports its own cost so
// you can see when it stops being true.
//
// WHAT IT ASSERTS. The smoke lane returns PASS on this tree; each planted
// violation makes the lane FAIL and the responsible gate name what it caught;
// the Stop hook refuses a FAIL receipt and refuses a forged one; and after every
// plant is reverted the lane returns PASS again — so the plants were the only
// cause. A direction that does not return inside the bound is KILLED and
// reported as a hang. The bound is the assertion, not a courtesy timeout.
//
// SAFETY. This edits your real tree and puts it back. Every file it may touch is
// read into memory first and restored in a `finally`, and on SIGINT/SIGTERM
// too. It refuses to start if any of those files already has uncommitted
// changes, because a crash mid-plant must never be able to lose your work.
//
// Which plants are possible is DERIVED from the tree (qa/lib/framework-check.mjs).
// A project with no specs, no flows, or no test sources still gets the region
// plants; each unavailable plant is reported WITH ITS REASON. Nothing here ever
// prints PASS because it found nothing to do.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_BOUND_MS,
  CALIBRATION_BUDGET_MS,
  PLANT_KINDS,
  selectPlants,
  assessCoverage,
  assessPlantRun,
  assessGreenRun,
  assessCalibrationCost,
} from "./lib/framework-check.mjs";
import { listHarnessFiles } from "./lib/harness-region.mjs";
import { listFlowFiles, scanCitations, walkFiles } from "./lib/spec-coverage.mjs";
import { resolveSpecModel } from "./lib/spec-model.mjs";
import { resolveHarnessManifest } from "./lib/harness-manifest.mjs";
import { loadProfileSync } from "./lib/profile-loader.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RECEIPT_REL = "qa/evidence/latest.json";
const SURFACE_REL = "qa/verified-surface.json";
const README_REL = "README.md";

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);

if (flag("--help") || flag("-h")) {
  console.log(
    `node qa/framework-check.mjs [--bound-ms <ms>] [--budget-ms <ms>] [--json]\n` +
      `  Proves this app's lane returns a fast deterministic PASS and FAIL through the smoke profile.\n` +
      `  --bound-ms   per-direction hang bound (default ${DEFAULT_BOUND_MS})\n` +
      `  --budget-ms  per-cycle calibration budget; a slower cycle is reported (default ${CALIBRATION_BUDGET_MS})\n` +
      `  --json       print the report as JSON`,
  );
  process.exit(0);
}

const BOUND_MS = Number.parseInt(opt("--bound-ms", String(DEFAULT_BOUND_MS)), 10);
const BUDGET_MS = Number.parseInt(opt("--budget-ms", String(CALIBRATION_BUDGET_MS)), 10);
const asJson = flag("--json");

const t = () => Date.now();
const out = (s) => {
  if (!asJson) process.stdout.write(`${s}\n`);
};
const abs = (rel) => path.join(ROOT, ...rel.split("/"));

function die(msg) {
  restoreAll();
  if (asJson) process.stdout.write(`${JSON.stringify({ verdict: "FAIL", reason: msg }, null, 2)}\n`);
  else process.stderr.write(`\nframework check: FAIL — ${msg}\n`);
  process.exit(1);
}

// ── Restore ledger ──────────────────────────────────────────────────────────
// Captured BEFORE anything is written; replayed in a finally and on a signal.
// `null` means the file did not exist and must be removed again.

/** @type {Map<string, string|null>} */
const original = new Map();
/** Directories this run created, deepest first — removed if left empty. */
const createdDirs = new Set();

function remember(rel) {
  if (original.has(rel)) return;
  const p = abs(rel);
  original.set(rel, fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);
}

function write(rel, text) {
  remember(rel);
  const p = abs(rel);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    createdDirs.add(dir);
  }
  fs.writeFileSync(p, text);
}

// Repeatable on purpose, not one-shot. The last thing this check does is run the
// lane once more to prove the revert worked — and that run writes a receipt and
// refreshes the README badge. A smoke receipt is refused as done-evidence, so
// leaving it in place would CLOBBER whatever real L1/L2 receipt the tree had
// with one that proves nothing. Restoring again afterwards is what makes this
// instrument safe to run on a working tree mid-change.
function restoreAll() {
  for (const [rel, text] of original) {
    const p = abs(rel);
    try {
      if (text === null) fs.rmSync(p, { force: true });
      else fs.writeFileSync(p, text);
    } catch (err) {
      process.stderr.write(`framework check: COULD NOT RESTORE ${rel} — ${err.message}\n`);
    }
  }
  for (const dir of [...createdDirs].sort((a, b) => b.length - a.length)) {
    try {
      if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    } catch {
      /* not empty, or already gone — either way not ours to force */
    }
  }
}

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    restoreAll();
    process.exit(130);
  });
}

// ── Lane runs ───────────────────────────────────────────────────────────────

function runSmoke() {
  const started = t();
  const res = spawnSync(process.execPath, [abs("qa/verify.mjs"), "--profile", "smoke", "--json", "--no-journal"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env },
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
    /* reported by the assessor */
  }
  return { hung: false, ms, exit: res.status, receipt, stderr: res.stderr ?? "" };
}

function hookRefuses() {
  const res = spawnSync(process.execPath, [abs("qa/receipt-check.mjs"), "--hook"], {
    cwd: ROOT,
    encoding: "utf8",
    input: "{}",
    timeout: 5000,
  });
  return { refused: res.status === 2, stderr: res.stderr ?? "" };
}

// ── Read the tree, decide what can be planted ───────────────────────────────

function readSpecs() {
  if (!SPEC_MODEL) return [];
  const dir = path.join(ROOT, ...SPEC_MODEL.specsDir.split("/"));
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".spec.md"))
    .sort()
    .map((n) => ({ rel: `${SPEC_MODEL.specsDir}/${n}`, text: fs.readFileSync(path.join(dir, n), "utf8") }));
}

// The scanner's model — the profile's layout and tiers. This runner plants
// into specs, flows and test sources, so it has to know where they are; it
// asks the profile, never a constant. A tree with no usable profile has no
// spec plants to make, and says so per plant rather than guessing.
const SPEC_MODEL_RESULT = resolveSpecModel(ROOT);
// REFUSE FIRST. With no manifest there is no layout, so every plant that reads
// the tree reported an honest-looking absence of files that exist: a project
// with two specs and nine clauses was told "no spec files — nothing declares
// behavior to plant against", four lines before the manifest refusal explained
// the real problem. That is the exact failure harness-manifest.mjs names in its
// own header as the reason there is no default profile, reproduced inside the
// instrument built to prove the lane returns. A reader who cannot know the
// layout says so and stops, rather than describing a tree it cannot see.
if (!SPEC_MODEL_RESULT.ok) {
  process.stderr.write(`\n${SPEC_MODEL_RESULT.reason}\n`);
  process.exit(2);
}
const SPEC_MODEL = SPEC_MODEL_RESULT.model;

// The SOURCE this profile's planted citations live in. A citation must sit on
// a test, so two of the plants have to WRITE a test — in this stack's
// language, with its test-declaration syntax, at a path it compiles. Everything
// else about a plant is stack-free: the clause grammar and the citation marker
// are the core scanner's, and which plants a tree can support is derived from
// the tree. A profile that declares none simply ships without those two, said
// out loud per plant (§5.2: no plants, no badge).
const PROFILE_PLANTS = (() => {
  const manifest = resolveHarnessManifest(ROOT);
  if (!manifest.ok) return null;
  const loaded = loadProfileSync(ROOT, manifest.manifest.profile);
  if (!loaded.ok) return null;
  const p = loaded.profile.plants;
  if (!p || typeof p.unboundCitationSource !== "function" || typeof p.tierUnmetCitationSource !== "function" || typeof p.testFileBasename !== "string") return null;
  return p;
})();
const PLANTED_TEST_REL = (testDir) => `${testDir}/${PROFILE_PLANTS.testFileBasename}`;

function readFlows() {
  if (!SPEC_MODEL) return [];
  return listFlowFiles(ROOT, SPEC_MODEL).map((rel) => ({ rel, text: fs.readFileSync(abs(rel), "utf8") }));
}

/**
 * A directory that already holds a host-only-tier test, derived from the
 * tree's own citations rather than guessed from a package convention — an
 * adopted project's source layout is not ours to assume.
 */
function findTestDir() {
  if (!SPEC_MODEL) return null;
  let tags = [];
  try {
    tags = scanCitations(ROOT, SPEC_MODEL);
  } catch {
    return null;
  }
  const hostOnly = SPEC_MODEL.tiers.hostOnly;
  const cited = tags.find((tag) => hostOnly.includes(tag.tier));
  if (cited) return path.dirname(cited.file);
  // No citations yet: fall back to any source under a citation root that the
  // profile's own tiering places on a host-only tier.
  for (const rootRel of SPEC_MODEL.citationRoots) {
    const hit = walkFiles(path.join(ROOT, ...rootRel.split("/")), SPEC_MODEL.citationExts).find((f) =>
      hostOnly.includes(SPEC_MODEL.tiers.forFile(path.relative(ROOT, f))),
    );
    if (hit) return path.dirname(path.relative(ROOT, hit));
  }
  return null;
}

out(`framework check: bound=${BOUND_MS}ms per direction, profile=smoke (no Gradle, no device, no network)`);

// With no plant material the instrument cannot write a test, so the two plants
// that need one are unavailable — reported by name, never quietly dropped.
const tree = {
  specs: readSpecs(),
  flows: readFlows(),
  harnessLib: listHarnessFiles(ROOT).filter((rel) => rel.startsWith("qa/lib/")),
  testDir: PROFILE_PLANTS ? findTestDir() : null,
  // So the skip can name the REAL cause instead of blaming the tree.
  plantsDeclared: Boolean(PROFILE_PLANTS),
  // No `?? "e2e"` anywhere: the tier a plant declares is the profile's or absent.
  unmeetableTier: PROFILE_PLANTS?.unmeetableTier ?? null,
  flowsDir: SPEC_MODEL && SPEC_MODEL.flows ? SPEC_MODEL.flows.dir : null,
};

const { plants, unavailable } = selectPlants(tree);
const coverage = assessCoverage(plants);
if (!coverage.ok) die(coverage.reason);

for (const u of unavailable) out(`  ⓘ  ${u.kind.padEnd(24)} not planted — ${u.reason}`);

// ── Refuse to start on a dirty tree ─────────────────────────────────────────
// Everything this may write, named up front. A file with uncommitted changes is
// a file whose bytes we would be gambling with if the process died mid-plant.

const touched = new Set([RECEIPT_REL, SURFACE_REL, README_REL]);
for (const p of plants) {
  if (p.target.spec) touched.add(p.target.spec);
  if (p.target.flow) touched.add(p.target.flow);
  if (p.target.file) touched.add(p.target.file);
  if (p.target.declaration) touched.add(p.target.declaration);
  if (p.target.testDir) touched.add(PLANTED_TEST_REL(p.target.testDir));
}

{
  const res = spawnSync("git", ["status", "--porcelain", "--", ...touched], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 10_000,
  });
  // Not a git repo (or no git): the in-memory restore still covers the normal
  // path, so this is a warning, not a refusal — but say so, because the safety
  // net is thinner than the one the message above promises.
  if (res.status !== 0) {
    out(`  ⓘ  no git here — falling back to in-memory restore only; do not interrupt with SIGKILL`);
  } else {
    const dirty = (res.stdout ?? "")
      .split("\n")
      .map((l) => l.slice(3).trim())
      .filter(Boolean)
      // The receipt and the badge are lane OUTPUT: this run rewrites them and
      // puts them back, and they are routinely dirty mid-change. Refusing on
      // them would make the instrument unrunnable exactly when it is wanted.
      .filter((rel) => rel !== RECEIPT_REL && rel !== README_REL);
    if (dirty.length) {
      die(
        `these files have uncommitted changes and this check plants into them:\n  ${dirty.join("\n  ")}\n` +
          `Commit or stash them first — a plant that dies mid-run must not be able to lose your work.`,
      );
    }
  }
}

// ── Making and unmaking a plant ─────────────────────────────────────────────
// Each plant is the SMALLEST edit that produces its violation, made against
// real content the tree already has. Planting garbage proves a gate rejects
// garbage; editing something live proves it was READING.

/** Every file a plant writes — the set `revertPlant` puts back. */
function plantFiles(plant) {
  const rels = [];
  if (plant.target.spec) rels.push(plant.target.spec);
  if (plant.target.flows) rels.push(...plant.target.flows);
  if (plant.target.file) rels.push(plant.target.file);
  if (plant.target.declaration) rels.push(plant.target.declaration);
  if (plant.target.testDir) rels.push(PLANTED_TEST_REL(plant.target.testDir));
  if (plant.target.nestInto) {
    for (const rel of plant.target.flows ?? []) rels.push(`${plant.target.nestInto}/${path.basename(rel)}`);
  }
  return rels;
}

function read(rel) {
  return fs.readFileSync(abs(rel), "utf8");
}

/** Every `# SPEC:` citation line neutralised — the flow stays valid YAML. */
function stripCitations(text) {
  return text.replace(/^#\s*SPEC:.*$/gm, "# (citation removed by the framework check)");
}

function applyPlant(plant) {
  const { target } = plant;
  switch (plant.kind) {
    case PLANT_KINDS.ORPHANED_CITATION: {
      // Rename a LIVE clause: every citation of it is suddenly an orphan, and
      // specCoverage must name the id it can no longer find.
      const text = read(target.spec);
      write(target.spec, text.replace(`**${target.clause}**`, `**${target.clause}X**`));
      break;
    }
    case PLANT_KINDS.UNBOUND_CITATION: {
      // A tag on a CLASS declaration with no test inside the binding window:
      // the clause exists, the tag exists, and nothing runs.
      const text = read(target.spec);
      write(target.spec, `${text.trimEnd()}\n- **${target.clause}** — Given a planted clause, Then a class-level tag must not count.\n`);
      write(PLANTED_TEST_REL(target.testDir), PROFILE_PLANTS.unboundCitationSource(target.clause));
      break;
    }
    case PLANT_KINDS.TIER_UNMET: {
      // A clause only a device can observe, cited only from the JVM.
      const text = read(target.spec);
      write(
        target.spec,
        `${text.trimEnd()}\n- **${target.clause}** [tier: ${target.unmeetableTier}] — Given a planted clause only the target can observe, Then a host-tier citation cannot satisfy it.\n`,
      );
      write(PLANTED_TEST_REL(target.testDir), PROFILE_PLANTS.tierUnmetCitationSource(target.clause));
      break;
    }
    case PLANT_KINDS.FEATURE_WITHOUT_FLOW: {
      // Every citation in every flow: a real feature with no device journey.
      for (const rel of target.flows) write(rel, stripCitations(read(rel)));
      break;
    }
    case PLANT_KINDS.NESTED_FLOW: {
      // The citations survive, in a subdirectory the lane never executes.
      for (const rel of target.flows) {
        const text = read(rel);
        write(`${target.nestInto}/${path.basename(rel)}`, text);
        write(rel, stripCitations(text));
      }
      break;
    }
    case PLANT_KINDS.NARROWED_SURFACE: {
      // One entry removed from the surface declaration un-attests a whole layer
      // while every checker stays intact. Writing a narrow one where none
      // existed is the same edit: the declaration enters the region unrecorded.
      write(target.declaration, `${JSON.stringify({ surface: ["qa"] }, null, 2)}\n`);
      break;
    }
    case PLANT_KINDS.EDITED_LANE: {
      // One byte in the machine-owned region: the lane issuing verdicts is no
      // longer the lane this app was given.
      write(target.file, `${read(target.file)}\n// planted by the framework check\n`);
      break;
    }
    default:
      die(`unknown plant kind "${plant.kind}" — the selector and the runner have drifted apart`);
  }
}

function revertPlant(plant) {
  for (const rel of [...plantFiles(plant), RECEIPT_REL]) {
    if (!original.has(rel)) continue;
    const text = original.get(rel);
    try {
      if (text === null) fs.rmSync(abs(rel), { force: true });
      else fs.writeFileSync(abs(rel), text);
    } catch (err) {
      die(`could not revert ${rel} — ${err.message}`);
    }
  }
}

// ── The check ───────────────────────────────────────────────────────────────

/** @type {Array<{label: string, ms: number}>} */
const cycles = [];

// The lane's own outputs, captured BEFORE the first run writes them. Do this
// late and you capture the baseline's receipt instead of the tree's real one —
// and then "restoring" leaves a smoke receipt sitting where an L1/L2 receipt
// used to be, which is precisely the weaker-evidence swap this harness refuses.
remember(RECEIPT_REL);
remember(README_REL);

try {
  // 1. Baseline — this tree must be green before anything is planted, or every
  //    FAIL below is unattributable.
  const base = runSmoke();
  cycles.push({ label: "baseline", ms: base.ms });
  const baseVerdict = assessGreenRun(base, "baseline", BOUND_MS);
  if (!baseVerdict.ok) die(baseVerdict.reason);
  if (base.receipt.stage !== "smoke") die(`receipt names stage "${base.receipt.stage}", expected "smoke"`);
  out(`  baseline             ${String(base.ms).padStart(5)}ms   ✓ ${base.receipt.steps.length} steps, verdict PASS, stage smoke`);

  // 2. One planted violation per guard, each asserted to FAIL BY NAME, each
  //    reverted before the next. A guard that has only ever passed is an unread
  //    instrument; this is where each one is read.
  for (const plant of plants) {
    applyPlant(plant);
    const run = runSmoke();
    cycles.push({ label: plant.label, ms: run.ms });
    const verdict = assessPlantRun(run, plant, BOUND_MS);
    if (!verdict.ok) die(verdict.reason);

    if (plant.hookPattern) {
      // The hook refuses a smoke-stage receipt on its stage and a FAIL receipt
      // on its verdict, before the vouching check runs. The vouching guard
      // exists for the FORGERY — the top-level verdict edited to PASS over rows
      // that say the lane cannot vouch for itself — so that is the receipt
      // presented: same rows, change stage, verdict flipped.
      write(RECEIPT_REL, JSON.stringify({ ...run.receipt, profile: "local", stage: "change", verdict: "PASS" }, null, 2));
      const h = hookRefuses();
      if (!h.refused || !new RegExp(plant.hookPattern, "i").test(h.stderr)) {
        die(`the Stop hook did not refuse the forged "${plant.label}" receipt for the right reason:\n${h.stderr.slice(-400)}`);
      }
    }

    const named = plant.names.length ? ` naming ${plant.names.join(", ")}` : "";
    out(`  FAIL: ${plant.label.padEnd(28)} ${String(run.ms).padStart(5)}ms   ✓ ${plant.step} FAIL${named}`);
    revertPlant(plant);
  }

  // 3. The Stop hook refuses a real FAIL receipt — the framework's last link.
  {
    const first = plants[0];
    applyPlant(first);
    const r = runSmoke();
    if (!r.receipt || r.receipt.verdict !== "FAIL") die("could not produce a FAIL receipt for the hook check");
    // ASK THE HOOK BEFORE REVERTING. `revertPlant` restores RECEIPT_REL from
    // what was on disk when this run started, so reverting first meant the hook
    // was never shown the FAIL receipt the lane had just written. On a tree with
    // no prior receipt the revert DELETED it and the hook refused because there
    // was no receipt at all — green, for a reason that has nothing to do with
    // this assertion. On a tree where the lane had already run, the revert put
    // the earlier PASS back and the check failed on a working lane. Neither
    // outcome tested "the Stop hook refuses a FAIL receipt". A check that cannot
    // fail for its own reason is the exact defect this instrument exists to
    // catch, which is why it is worth the four lines to say so. Found by the
    // first non-Compose adoption, 2026-09-04. (`die` is safe here: every touched
    // file is restored in the outer finally, plant reverted or not.)
    if (!hookRefuses().refused) die("the Stop hook did not refuse a FAIL receipt");
    revertPlant(first);
    out(`  Stop hook            refuses a FAIL receipt ✓`);
  }

  // 4. And a receipt whose device tier SKIPped for an ENVIRONMENTAL reason: a
  //    synthetic row over this tree's own valid hash, so only the skip is new.
  {
    const green = runSmoke();
    if (!green.receipt || green.receipt.verdict !== "PASS") {
      // NAME THE STEPS. "could not produce a PASS receipt" told a reader that
      // something was wrong and nothing about what, in the one place where the
      // instrument has the whole receipt in hand. Evidence-or-silence applies to
      // the instrument's own refusals too.
      const bad = (green.receipt?.steps ?? [])
        .filter((s) => s.verdict === "FAIL" || s.verdict === "ERROR")
        .map((s) => `${s.name}: ${s.reason ?? s.verdict}`);
      die(
        `could not produce a PASS receipt for the device-tier hook check` +
          (bad.length ? ` — ${bad.join("; ")}` : green.receipt ? ` (verdict ${green.receipt.verdict}, no failing step)` : " (no receipt at all)"),
      );
    }
    const planted = {
      ...green.receipt,
      profile: "local",
      stage: "change",
      steps: [
        ...green.receipt.steps,
        { name: "e2eSmoke", verdict: "SKIP", skipKind: "environment", reason: "device tier disabled by CMP_DEVICE=none (planted)", durationMs: 0 },
      ],
    };
    write(RECEIPT_REL, JSON.stringify(planted, null, 2));
    const hook = hookRefuses();
    // Stage 0 PR 6c: the refusal is stack-free — ANY step that skipped for an
    // environmental reason blocks done, whatever it is called.
    if (!hook.refused || !/a tier did not run/.test(hook.stderr)) {
      die(`the Stop hook did not refuse a receipt whose tier was skipped for an environmental reason:\n${hook.stderr.slice(-400)}`);
    }
    out(`  Stop hook            refuses a skipped tier ✓`);
  }

  // 5. Everything reverted, and it passes again — the plants were the only cause.
  restoreAll();
  const again = runSmoke();
  cycles.push({ label: "revert → PASS", ms: again.ms });
  const againVerdict = assessGreenRun(again, "revert", BOUND_MS);
  if (!againVerdict.ok) die(againVerdict.reason);
  out(`  revert → PASS        ${String(again.ms).padStart(5)}ms   ✓`);
} finally {
  restoreAll();
}

// ── Report ──────────────────────────────────────────────────────────────────
// The cost is part of the finding. Rule 1 calls a calibration "four steps,
// seconds each"; a cycle past the budget means the plant is running through the
// wrong instrument, and that is worth saying while the choice is cheap.

const cost = assessCalibrationCost(cycles, BUDGET_MS);

if (asJson) {
  process.stdout.write(
    `${JSON.stringify(
      {
        verdict: "PASS",
        plants: plants.map((p) => ({ kind: p.kind, label: p.label, step: p.step })),
        unavailable,
        cycles,
        totalMs: cost.totalMs,
        budgetMs: BUDGET_MS,
        withinBudget: cost.withinBudget,
        note: cost.note,
      },
      null,
      2,
    )}\n`,
  );
} else {
  out(
    `\nframework check: PASS — the lane returns, both ways, and every guard fails by name: ` +
      `${plants.length} plants, ${cost.totalMs}ms total (bound ${BOUND_MS}ms per direction).`,
  );
  if (!cost.withinBudget) out(`  ⚠  ${cost.note}`);
}

process.exit(0);
