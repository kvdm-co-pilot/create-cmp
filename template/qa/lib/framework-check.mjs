// framework-check.mjs (lib) — Rule 0's instrument, aimed at an app's OWN tree.
//
// GATE-RULES Rule 0 says: before any real work is pointed at the harness, prove
// the FRAMEWORK returns — a deterministic PASS and a deterministic FAIL, fast,
// through the real lane machinery, with a bound short enough that a hang is
// obvious rather than patient.
//
// create-cmp's own `scripts/framework-check.mjs` proves that for the ENGINE: it
// stamps a scratch app and reads the lane it just shipped. That script has never
// existed inside a generated project, and it never can — it needs `bin/create-
// cmp.mjs` and a tree to stamp. Meanwhile the lane that DOES ship names it four
// times (verify.mjs, steps-cmp.mjs, evidence-badge.mjs, USAGE.md), pointing every
// adopter at a path they do not have.
//
// That dangling reference has a measured cost. payment-blueprint read those
// comments, could not find the file, and hand-built its own copy with nine
// plants; then, months later, briefed a whole wave to prove new gates by hand —
// plant, `./gradlew`, confirm red, revert, build again, 30–60 s per cycle — and
// burned ~38 minutes reproducing exactly what the missing instrument does in
// seconds. Their own diagnosis was "I failed to check what already existed". The
// truer reading is narrower and is ours: the harness advertised a tool it never
// handed over, so there was nothing in their tree to find.
//
// This module is the half of that instrument an app can run against itself. The
// plants are DERIVED from the tree rather than hardcoded, because an adopted
// project is not a stamped Compose app: it may have no `specs/`, no `qa/e2e/`,
// no Kotlin test source at all. A plant whose target is absent is reported as
// unavailable WITH ITS REASON and does not silently vanish — a framework check
// that skips everything and prints PASS is the failure this exists to refuse.
//
// Pure by construction: every function here takes data and returns data. The IO
// — reading the tree, writing the plant, running the lane, reverting in a
// `finally` — lives in the runner (qa/framework-check.mjs), so the decisions
// this file makes are unit-testable without a scaffold.
//
// SINGLE SOURCE OF TRUTH: packages/harness/src/lib/framework-check.mjs in the
// create-cmp repo. The copy in a generated project's qa/lib/ is vendored
// byte-identical at scaffold time — edit the package source, then run
// `node scripts/sync-harness.mjs`.

/**
 * Per-direction bound. Rule 0's whole claim is about SPEED of refusal, so the
 * default is small on purpose: the smoke profile is every pure-Node gate and no
 * Gradle, which returns in around a second on a real tree. A direction that
 * does not return inside the bound is killed and reported as a hang — the bound
 * IS the assertion, never a courtesy timeout waited out.
 */
export const DEFAULT_BOUND_MS = 10_000;

/**
 * Every plant this instrument knows how to make. The kinds are named so tests
 * (and a report) can talk about them without matching prose.
 */
export const PLANT_KINDS = Object.freeze({
  ORPHANED_CITATION: "orphaned-citation",
  UNBOUND_CITATION: "unbound-citation",
  TIER_UNMET: "tier-unmet",
  FEATURE_WITHOUT_FLOW: "feature-without-flow",
  NESTED_FLOW: "flow-the-lane-never-runs",
  NARROWED_SURFACE: "narrowed-surface",
  EDITED_LANE: "edited-lane",
});

/**
 * The plants that need nothing but a lane. `harnessIntegrity` reads the machine-
 * owned region, which exists in every project that has a lane at all — so these
 * two are the floor. If even these cannot run, the tree has no harness to check
 * and the instrument must say so rather than report a vacuous PASS.
 */
export const FLOOR_KINDS = Object.freeze([PLANT_KINDS.NARROWED_SURFACE, PLANT_KINDS.EDITED_LANE]);

/** A clause id at the head of a spec list item: `- **HOME-02** — …`. */
const CLAUSE_RE = /^-\s+\*\*([A-Z][A-Z0-9]*-\d{2,})\*\*/m;

/** `# SPEC: HOME-02` in a flow file — the citation an e2e journey carries. */
const FLOW_CITATION_RE = /^#\s*SPEC:\s*([A-Z][A-Z0-9]*-\d{2,})/m;

/**
 * The first clause id in a spec, or null. Used to pick something real to plant
 * against: a clause that already exists and is already cited is the only kind
 * whose removal proves a gate READS, rather than proving a gate rejects garbage.
 * @param {string} text
 * @returns {string|null}
 */
export function firstClauseId(text) {
  if (typeof text !== "string") return null;
  const m = text.match(CLAUSE_RE);
  return m ? m[1] : null;
}

/**
 * The clause a flow cites, or null.
 * @param {string} text
 * @returns {string|null}
 */
export function flowCitation(text) {
  if (typeof text !== "string") return null;
  const m = text.match(FLOW_CITATION_RE);
  return m ? m[1] : null;
}

/**
 * The clause-id PREFIX ("HOME" from "HOME-02"), used to mint planted ids that
 * cannot collide with a real clause: a spec's own family with a number far above
 * anything hand-authored.
 * @param {string} clause
 * @returns {string}
 */
export function clauseFamily(clause) {
  const m = String(clause ?? "").match(/^([A-Z][A-Z0-9]*)-/);
  return m ? m[1] : "SPEC";
}

/**
 * Decide which plants this tree can support, and say WHY each unavailable one
 * is unavailable.
 *
 * @param {{specs?: Array<{rel: string, text: string}>,
 *          flows?: Array<{rel: string, text: string}>,
 *          harnessLib?: string[],
 *          testDir?: string|null}} tree
 * @returns {{plants: Array<{kind: string, label: string, step: string,
 *            names: string[], target: object}>,
 *           unavailable: Array<{kind: string, reason: string}>}}
 */
export function selectPlants(tree) {
  const specs = Array.isArray(tree?.specs) ? tree.specs : [];
  const flows = Array.isArray(tree?.flows) ? tree.flows : [];
  const harnessLib = Array.isArray(tree?.harnessLib) ? tree.harnessLib : [];
  const testDir = tree?.testDir ?? null;
  // Where this stack keeps the flow-shaped citation files the lane executes
  // (the profile's `layout.flows.dir`). The nested-flow plant must land INSIDE
  // it — a subdirectory the runner walks past — so the directory cannot be a
  // constant here. Derived from the flows themselves when the caller does not
  // say, so a caller with flows always gets the plant.
  const flowsDir = typeof tree?.flowsDir === "string" && tree.flowsDir
    ? tree.flowsDir
    : (flows.find((f) => typeof f?.rel === "string" && f.rel.includes("/"))?.rel.replace(/\/[^/]*$/, "") ?? null);

  const plants = [];
  const unavailable = [];
  const skip = (kind, reason) => unavailable.push({ kind, reason });

  // ── Spec-derived plants ──────────────────────────────────────────────────
  const spec = specs.find((s) => firstClauseId(s?.text));
  const clause = spec ? firstClauseId(spec.text) : null;

  if (!spec) {
    const why = specs.length
      ? `no clause of the form "- **ID-NN**" in ${specs.length} spec file(s)`
      : "no spec files — nothing declares behavior to plant against";
    for (const kind of [PLANT_KINDS.ORPHANED_CITATION, PLANT_KINDS.UNBOUND_CITATION, PLANT_KINDS.TIER_UNMET]) skip(kind, why);
  } else {
    // Renaming a live clause orphans every citation of it: specCoverage must
    // name the id it can no longer find.
    plants.push({
      kind: PLANT_KINDS.ORPHANED_CITATION,
      label: "orphaned citation",
      step: "specCoverage",
      names: [clause],
      target: { spec: spec.rel, clause },
    });

    const family = clauseFamily(clause);
    // A tag on a CLASS with no test inside the binding window: the clause
    // exists, the tag exists, and nothing runs. The two remaining spec plants
    // need somewhere to put that Kotlin, so they hang on a test source dir.
    if (!testDir) {
      const why = "no Kotlin test source directory — a planted citation has nowhere to live";
      skip(PLANT_KINDS.UNBOUND_CITATION, why);
      skip(PLANT_KINDS.TIER_UNMET, why);
    } else {
      plants.push({
        kind: PLANT_KINDS.UNBOUND_CITATION,
        label: "unbound citation",
        step: "specCoverage",
        names: [`${family}-99`],
        target: { spec: spec.rel, clause: `${family}-99`, testDir },
      });
      plants.push({
        kind: PLANT_KINDS.TIER_UNMET,
        label: "tier unmet",
        step: "specCoverage",
        names: [`${family}-98`],
        target: { spec: spec.rel, clause: `${family}-98`, testDir },
      });
    }
  }

  // ── Flow-derived plants ──────────────────────────────────────────────────
  // Both strip EVERY citation from every flow, not just one line. e2eCoverage
  // asks whether a screen feature has any device journey at all, so removing a
  // single `# SPEC:` from a flow that carries several leaves the feature
  // covered and the gate — correctly — green. A plant that does not actually
  // produce the violation is worse than no plant: it reads as a calibrated
  // gate while proving nothing.
  const citingFlows = flows.filter((f) => flowCitation(f?.text));
  if (!citingFlows.length) {
    const why = flows.length
      ? `no "# SPEC:" citation in ${flows.length} flow file(s) — e2eCoverage has nothing to lose`
      : `no flows${flowsDir ? ` under ${flowsDir}` : ""} — this project declares no journeys`;
    skip(PLANT_KINDS.FEATURE_WITHOUT_FLOW, why);
    skip(PLANT_KINDS.NESTED_FLOW, why);
  } else {
    const rels = citingFlows.map((f) => f.rel);
    // A real feature with a screen and a spec and no device journey at all.
    plants.push({
      kind: PLANT_KINDS.FEATURE_WITHOUT_FLOW,
      label: "feature without a flow",
      step: "e2eCoverage",
      names: [],
      // FAIL BY NAME, without knowing this project's feature names: the gate
      // must name the feature it caught, in the [brackets] its reason uses.
      reasonPattern: String.raw`\[[^\]\s]+\]`,
      target: { flows: rels },
    });
    // The citations move into a subdirectory Maestro's directory run never
    // executes. The tags exist, the YAML is real, and nothing runs it — which
    // must read exactly like having no journey.
    plants.push({
      kind: PLANT_KINDS.NESTED_FLOW,
      label: "flow the lane never runs",
      step: "e2eCoverage",
      names: [],
      reasonPattern: String.raw`\[[^\]\s]+\]`,
      target: { flows: rels, nestInto: `${flowsDir}/wip` },
    });
  }

  // ── Region plants — the floor ────────────────────────────────────────────
  // A narrowed declaration un-attests a whole layer while every checker stays
  // intact (payment-blueprint's planted proof); an edited lane cannot vouch for
  // its own verdict. Both are read by harnessIntegrity, which needs only a lane.
  plants.push({
    kind: PLANT_KINDS.NARROWED_SURFACE,
    label: "narrowed surface declaration",
    step: "harnessIntegrity",
    names: ["unrecorded"],
    hookPattern: "harnessIntegrity|vouch",
    target: { declaration: "qa/verified-surface.json" },
  });

  const spine = harnessLib.find((rel) => rel.endsWith("/spec-coverage.mjs")) ?? harnessLib[0] ?? null;
  if (!spine) {
    skip(PLANT_KINDS.EDITED_LANE, "no machine-owned lane files found under qa/lib — there is no region to edit");
  } else {
    plants.push({
      kind: PLANT_KINDS.EDITED_LANE,
      label: "edited lane cannot vouch",
      step: "harnessIntegrity",
      names: ["modified"],
      hookPattern: "harnessIntegrity|vouch",
      target: { file: spine },
    });
  }

  return { plants, unavailable };
}

/**
 * Is this set of plants enough to make a claim at all?
 *
 * The refusal is the point. An instrument that finds nothing to plant and
 * prints PASS has proven that it ran, not that the framework returns — the
 * "green with gaps" the harness exists to refuse, applied to itself.
 *
 * @param {Array<{kind: string}>} plants
 * @returns {{ok: true}|{ok: false, reason: string}}
 */
export function assessCoverage(plants) {
  const kinds = new Set((plants ?? []).map((p) => p?.kind));
  const missingFloor = FLOOR_KINDS.filter((k) => !kinds.has(k));
  if (missingFloor.length === FLOOR_KINDS.length) {
    return {
      ok: false,
      reason:
        "no plant could be made at all — this tree has no machine-owned lane to check. " +
        "Run this from a project root whose qa/lib/ carries the vendored harness.",
    };
  }
  if (missingFloor.length) {
    return { ok: false, reason: `the region plants are the floor and ${missingFloor.join(", ")} could not be made` };
  }
  return { ok: true };
}

/**
 * Judge one planted run. Every branch here is a distinct framework defect and
 * says which one it is: a hang, a lane that produced no receipt, a guard that
 * did not fail, or a guard that failed WITHOUT NAMING what it caught.
 *
 * "FAIL BY NAME" is not decoration. A gate that fails with a generic message
 * costs the reader the diagnosis every time it fires, and — worse — cannot be
 * told apart from a gate failing for an unrelated reason, which is how a
 * calibration passes on a gate that was never actually read.
 *
 * @param {{hung?: boolean, ms?: number, exit?: number|null,
 *          receipt?: {verdict?: string, steps?: Array<object>}|null,
 *          stderr?: string}} run
 * @param {{label: string, step: string, names?: string[]}} plant
 * @param {number} boundMs
 * @returns {{ok: true}|{ok: false, reason: string}}
 */
export function assessPlantRun(run, plant, boundMs) {
  const label = plant?.label ?? "(unnamed plant)";
  if (run?.hung) {
    return { ok: false, reason: `"${label}" did not return inside ${boundMs}ms — the framework HANGS on a failing input` };
  }
  const receipt = run?.receipt;
  if (!receipt) {
    const tail = String(run?.stderr ?? "").slice(-600);
    return { ok: false, reason: `"${label}" returned no receipt (exit ${run?.exit ?? "?"})${tail ? `:\n${tail}` : ""}` };
  }
  const row = (receipt.steps ?? []).find((s) => s?.name === plant.step);
  if (receipt.verdict !== "FAIL" || !row || row.verdict !== "FAIL") {
    return {
      ok: false,
      reason: `planted "${label}" and the lane said ${receipt.verdict} (${plant.step}: ${row ? row.verdict : "no row"}) — the guard did not FAIL BY NAME`,
    };
  }
  const reason = String(row.reason ?? "");
  for (const name of plant.names ?? []) {
    if (!reason.includes(name)) {
      return { ok: false, reason: `${plant.step} FAILed on "${label}" but did not NAME ${name}:\n${reason}` };
    }
  }
  // Some gates name something the selector cannot know in advance — a feature
  // this project happens to have. The pattern is how those still assert FAIL BY
  // NAME instead of settling for "it went red".
  if (plant.reasonPattern && !new RegExp(plant.reasonPattern).test(reason)) {
    return { ok: false, reason: `${plant.step} FAILed on "${label}" but named nothing matching /${plant.reasonPattern}/:\n${reason}` };
  }
  return { ok: true };
}

/**
 * Judge the baseline (and the post-revert re-run): a tree that cannot go green
 * on its own has nothing to plant against, and every FAIL below would be
 * unattributable.
 *
 * @param {{hung?: boolean, receipt?: object|null, exit?: number|null, stderr?: string}} run
 * @param {string} phase  "baseline" or "revert"
 * @param {number} boundMs
 * @returns {{ok: true}|{ok: false, reason: string}}
 */
export function assessGreenRun(run, phase, boundMs) {
  if (run?.hung) {
    return { ok: false, reason: `the ${phase} run did not return inside ${boundMs}ms — the framework HANGS on a passing input` };
  }
  if (!run?.receipt) {
    const tail = String(run?.stderr ?? "").slice(-600);
    return { ok: false, reason: `the ${phase} run returned no receipt (exit ${run?.exit ?? "?"})${tail ? `:\n${tail}` : ""}` };
  }
  if (run.receipt.verdict !== "PASS") {
    const bad = (run.receipt.steps ?? [])
      .filter((s) => s?.verdict === "FAIL" || s?.verdict === "ERROR")
      .map((s) => `${s.name}: ${String(s.reason ?? "").split("\n")[0]}`)
      .join("; ");
    const suffix =
      phase === "revert"
        ? " — the plants were not the only cause, or a revert did not restore the tree"
        : " — fix the tree before calibrating anything against it";
    return { ok: false, reason: `the ${phase} run is ${run.receipt.verdict} (${bad || "no failing row named"})${suffix}` };
  }
  return { ok: true };
}

/**
 * Rule 1's stated bound, made checkable.
 *
 * Rule 1 says a calibration is "four steps, seconds each". That sentence has
 * always been prose, and prose does not refuse: payment-blueprint calibrated
 * through a 30–60 s composite Gradle build, which violated the rule on its own
 * terms from the first cycle, and nothing noticed for three occurrences. The
 * cost is not the single cycle — it is per-instance cost times every instance,
 * which is how 38 minutes disappears into something that looks like rigour.
 *
 * A calibration cycle slower than this is not wrong, but it is a finding: it
 * means the plant is being run through the wrong instrument, and the report
 * must say so while the choice is still cheap to change.
 */
export const CALIBRATION_BUDGET_MS = 5_000;

/**
 * @param {Array<{label: string, ms: number}>} cycles
 * @param {number} [budgetMs]
 * @returns {{withinBudget: boolean, slowest: {label: string, ms: number}|null,
 *            totalMs: number, note: string|null}}
 */
export function assessCalibrationCost(cycles, budgetMs = CALIBRATION_BUDGET_MS) {
  const rows = Array.isArray(cycles) ? cycles.filter((c) => Number.isFinite(c?.ms)) : [];
  const totalMs = rows.reduce((n, c) => n + c.ms, 0);
  if (!rows.length) return { withinBudget: true, slowest: null, totalMs: 0, note: null };
  const slowest = rows.reduce((a, b) => (b.ms > a.ms ? b : a));
  if (slowest.ms <= budgetMs) return { withinBudget: true, slowest, totalMs, note: null };
  return {
    withinBudget: false,
    slowest,
    totalMs,
    note:
      `slowest calibration cycle "${slowest.label}" took ${slowest.ms}ms against a ${budgetMs}ms budget. ` +
      `GATE-RULES Rule 1 calls a calibration "four steps, seconds each" — a cycle past that is being run ` +
      `through the wrong instrument, and the cost is paid on every plant forever.`,
  };
}
