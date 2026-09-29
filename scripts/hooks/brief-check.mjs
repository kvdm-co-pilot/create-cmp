#!/usr/bin/env node
// A BRIEF IS CHECKED FOR ITS FIELDS AT THE MOMENT OF THE SPAWN.
//
// THE DEFECT THIS EXISTS TO CLOSE (docs/research/PATTERN-REVIEW-2026-09-28,
// A-4 and W3). The agents below each say, in their own contract, what a brief
// must name — a branch, a hand-off file, what is out of scope, the proof — and
// until this file nothing read a brief. The audit that found it was itself
// briefed with an output file and neither a branch nor a hand-off file, and
// nothing caught it. A helper briefed without a hand-off file cannot leave its
// state anywhere a fresh one can start from; one briefed without a proof
// command cannot say when it is done. Twenty turns spent finding that out cost
// more than one re-send, so a spawn missing a field is denied (BATCH-2 D7) and
// the reason carries the FULL schema, so the model can answer it in one go.
//
// IT IS A FORM CHECK, NOT A SAFETY GATE. Spawning a helper is not a dangerous
// act, so this hook fails OPEN: a payload it cannot parse, a crash, an agent
// type it does not cover — all end at exit 0 with nothing on stdout, and the
// spawn goes ahead exactly as it would without this file. It never emits
// `allow` (that would skip a permission prompt the user holds) and never
// `ask`. Its one output is `deny` with the missing fields named, which is P4
// applied honestly: a gate whose failure mode is "let through" says so here.
//
// WHICH AGENTS. Only those whose own contracts require the fields:
//   create-cmp:executor, executor, create-cmp:cmp-orchestrator,
//   cmp-orchestrator, deep-worker, staff-reviewer.
// Every other subagent_type is silent. `tool_input.subagent_type` absent
// means the tool's default agent (general-purpose), which has no brief
// contract; the only fallback is a covered agent's hyphenated or namespaced
// name written in `description` or on the prompt's first line (bare
// "executor" is not enough — it is an ordinary word in a task description).
//
// THE MATCHER. Registered on PreToolUse for BOTH `Agent` and `Task` until
// LIVE-CHECKS-CHECKLIST §6 settles which name the live payload carries. The
// local transcripts (2026-09-29, 385 spawns) name the tool `Agent` every time;
// the hook payload itself is not yet observed.
//
// THE CALIBRATION (GATE-RULES Rule 1): the kept plant is this batch's own
// briefs (A-4) — test/brief-check.test.mjs fixes a complete brief (silent),
// each missing field (denied, naming it), the reviewer schema, an uncovered
// agent (silent) and malformed JSON (exit 0, nothing printed).

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const FIELD_TEXT = {
  "Objective": "the one unit of work, and what done means",
  "Output": "the path the work lands in (a file or directory path)",
  "Branch": "the branch the commits go on",
  "Hand-off": "the hand-off file appended after each commit",
  "Diff": "the diff to read (a base..head range or a branch)",
  "Brief": "the brief or plan the diff was written against (a path)",
  "Out of scope": "what this helper must not touch",
  "Proof": "the command that shows it done, and the pass line to expect",
};

const WORKER = ["Objective", "Output", "Branch", "Hand-off", "Out of scope", "Proof"];
const REVIEWER = ["Objective", "Output", "Diff", "Brief", "Out of scope", "Proof"];

export const SCHEMAS = Object.freeze({
  "create-cmp:executor": WORKER,
  "executor": WORKER,
  "create-cmp:cmp-orchestrator": WORKER,
  "cmp-orchestrator": WORKER,
  "deep-worker": WORKER,
  "staff-reviewer": REVIEWER,
});

// Spellings accepted for a label: case-insensitive, and hand-off with or
// without its hyphen or space. The deny reason always prints the canonical one.
const LABEL = {
  "Hand-off": "hand[- ]?off",
  "Out of scope": "out[- ]of[- ]scope",
};

// A label counts at the start of a line, after optional indentation, a list
// marker, heading hashes or bold markers — the forms briefs are written in.
const labelRe = (field) =>
  new RegExp(`(?:^|\\n)[ \\t]*(?:[-*+][ \\t]+|#+[ \\t]+)?(?:\\*\\*|__)?(?:${LABEL[field] ?? field.toLowerCase()})(?:\\*\\*|__)?[ \\t]*:(?:\\*\\*|__)?([^\\n]*)(?:\\n([^\\n]*))?`, "i");

const PATHLIKE = /[\w.~-]*\/[\w./~-]+|\b[\w.-]+\.(?:md|mjs|cjs|js|ts|json|jsonl|kt|kts|txt|ya?ml|sh|html)\b/;

/** Which covered agent this spawn is for, or null. Never throws. */
export function coveredAgent(toolInput) {
  const t = toolInput?.subagent_type;
  if (typeof t === "string" && t.trim()) return Object.hasOwn(SCHEMAS, t.trim()) ? t.trim() : null;
  const hint = `${toolInput?.description ?? ""}\n${String(toolInput?.prompt ?? "").split("\n")[0]}`;
  const m = hint.match(/\b(create-cmp:executor|create-cmp:cmp-orchestrator|cmp-orchestrator|deep-worker|staff-reviewer)\b/);
  return m ? m[1] : null;
}

/** The fields a prompt is missing for an agent's schema. Output must carry a path. */
export function missingFields(prompt, schema) {
  const text = String(prompt ?? "");
  const missing = [];
  for (const field of schema) {
    const m = text.match(labelRe(field));
    if (!m) {
      missing.push(field);
      continue;
    }
    // "Output: (a path)" — on the label's line, or the next one when the value starts below it.
    if (field === "Output" && !PATHLIKE.test(m[1]) && !(m[1].trim() === "" && PATHLIKE.test(m[2] ?? ""))) missing.push("Output (a path)");
  }
  return missing;
}

/** The whole schema for an agent, as the deny reason prints it. */
export function renderSchema(schema) {
  return schema.map((f) => `  ${f}: ${FIELD_TEXT[f]}`).join("\n");
}

/** The hook's answer to a payload: the deny object, or null for silence. */
export function respond(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (payload.tool_name !== undefined && payload.tool_name !== "Agent" && payload.tool_name !== "Task") return null;
  const agent = coveredAgent(payload.tool_input);
  if (!agent) return null;
  const schema = SCHEMAS[agent];
  const missing = missingFields(payload.tool_input?.prompt, schema);
  if (!missing.length) return null;
  const reason =
    `brief-check: this ${agent} brief is missing ${missing.map((f) => `${f}:`).join(", ")}. ` +
    `Re-send the same spawn with every field below labelled at the start of its own line — the ${agent} schema:\n` +
    `${renderSchema(schema)}\n` +
    `(scripts/hooks/brief-check.mjs — a form check on the brief, not a safety gate; the same six labels are the "Brief fields" block of the ${agent} definition.)`;
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } };
}

function readStdin({ timeoutMs = 3000 } = {}) {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve("");
    let s = "";
    const timer = setTimeout(() => {
      process.stdin.destroy();
      resolve("");
    }, timeoutMs);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (s += c));
    process.stdin.on("end", () => {
      clearTimeout(timer);
      resolve(s);
    });
    process.stdin.on("error", () => {
      clearTimeout(timer);
      resolve("");
    });
  });
}

async function main() {
  try {
    const out = respond(JSON.parse((await readStdin()) || "null"));
    if (out) fs.writeSync(1, JSON.stringify(out));
  } catch {
    /* fail open and silent: a form check, see the header */
  }
}

// Only as the entry module, so the tests can import the pure half.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
