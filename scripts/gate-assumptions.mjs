#!/usr/bin/env node
// WHAT EACH GATE COMPENSATES FOR, AND WHAT KEPT DEFECT TURNS IT RED.
//
//   node scripts/gate-assumptions.mjs                        the table
//   node scripts/gate-assumptions.mjs --check                exit 1 if a gate states no assumption,
//                                                            or names a plant that is not in the tree
//   node scripts/gate-assumptions.mjs --record-ablated <m>   write qa-artifacts/last-ablated-model.txt
//                                                            after the canary's ablate-gates ran green on <m>
//
// Every gate here encodes an assumption about what the model cannot yet be
// trusted to do, and an assumption true of one model may be false of the next —
// Anthropic removed its own sprint scaffolding once a model no longer needed it
// (FIX-PLAN slice 18, D-4). So each gate says, beside its code, what it assumes
// and which kept plant must turn it red (GATE-RULES Rule 1), and this lists
// them. The re-test on a model release is canary.yml `ablate-gates`, dispatched
// with the model's name; its job summary is the ablation record.
//
// THE TABLES ARE IMPORTED, NEVER RESTATED: TIERS from scripts/proof-plan.mjs and
// WATCHED_GATES from scripts/hooks/proof-gate.mjs. A copy here would be the
// second statement of a rule, and the second statement is the one that drifts.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { TIERS } from "./proof-plan.mjs";
import { WATCHED_GATES } from "./hooks/proof-gate.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Where the last model the gates were ablated on is recorded — gitignored, one machine's memory. */
export const LAST_ABLATED_PATH = path.join("qa-artifacts", "last-ablated-model.txt");

/**
 * Every gate, one row each: where it lives, what it assumes, its plant, and
 * whether that plant is in the tree. `plantStatus` is "present", "absent" (a
 * named path that is not there — the plant rotted or moved) or "null" (no plant
 * exists yet: a named gap).
 * @returns {Array<{gate: string, source: string, assumes: string|null, plant: string|null, plantStatus: "present"|"absent"|"null"}>}
 */
export function gates({ root = REPO_ROOT, tiers = TIERS, watched = WATCHED_GATES } = {}) {
  const row = (source, gate, g) => {
    const plant = g?.plant ?? null;
    const plantStatus = plant === null ? "null" : fs.existsSync(path.join(root, plant)) ? "present" : "absent";
    return { gate, source, assumes: typeof g?.assumes === "string" && g.assumes.trim() ? g.assumes.trim() : null, plant, plantStatus };
  };
  return [
    ...Object.entries(tiers).map(([k, g]) => row("proof-plan TIERS", k, g)),
    ...Object.entries(watched).map(([k, g]) => row("proof-gate WATCHED", k, g)),
  ];
}

/** The rows `--check` refuses on: no assumption stated, or a named plant not in the tree. */
export function problems(rows) {
  const out = [];
  for (const r of rows) {
    if (!r.assumes) out.push(`${r.source} ${r.gate}: states no \`assumes\``);
    if (r.plantStatus === "absent") out.push(`${r.source} ${r.gate}: plant ${r.plant} is not in the tree`);
  }
  return out;
}

/** The recorded last-ablated model, or null. */
export function lastAblated(root = REPO_ROOT) {
  try {
    const [model, at] = fs.readFileSync(path.join(root, LAST_ABLATED_PATH), "utf8").split("\n");
    return model.trim() ? { model: model.trim(), at: at?.trim() || null } : null;
  } catch {
    return null;
  }
}

export function recordAblated(model, { root = REPO_ROOT, now = new Date() } = {}) {
  const file = path.join(root, LAST_ABLATED_PATH);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${model}\n${now.toISOString()}\n`);
  return file;
}

export function render(rows, last = null) {
  const L = [];
  for (const r of rows) {
    L.push(`${r.source} · ${r.gate}`);
    L.push(`    assumes  ${r.assumes ?? "(NOT STATED)"}`);
    L.push(`    plant    ${r.plant ?? "null"} (${r.plantStatus})`);
  }
  const nulls = rows.filter((r) => r.plantStatus === "null").map((r) => r.gate);
  L.push("");
  L.push(`${rows.length} gates; ${nulls.length} with no kept plant${nulls.length ? ` (${nulls.join(", ")})` : ""}.`);
  L.push(last ? `last ablated on ${last.model}${last.at ? ` at ${last.at}` : ""} (${LAST_ABLATED_PATH})` : `never recorded as ablated on this machine (${LAST_ABLATED_PATH})`);
  L.push("re-test on a model release: dispatch .github/workflows/canary.yml, job ablate-gates, with the model's name.");
  return L.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const at = argv.indexOf("--record-ablated");
  if (at !== -1) {
    const model = argv[at + 1];
    if (!model || model.startsWith("--")) {
      process.stderr.write("--record-ablated needs the model's name: node scripts/gate-assumptions.mjs --record-ablated <model>\n");
      process.exit(2);
    }
    process.stdout.write(`recorded: gates last ablated on ${model} — ${recordAblated(model)}\n`);
    process.exit(0);
  }
  const rows = gates();
  process.stdout.write(`${render(rows, lastAblated())}\n`);
  if (argv.includes("--check")) {
    const bad = problems(rows);
    if (bad.length) {
      process.stderr.write(`\ngate assumptions: FAIL\n${bad.map((b) => `  ${b}`).join("\n")}\n`);
      process.exit(1);
    }
    process.stdout.write("gate assumptions: every gate states what it assumes; every named plant is in the tree\n");
  }
}
