#!/usr/bin/env node
// WHAT A RESUMED HELPER WILL RE-READ, PRICED AT THE MOMENT OF THE SEND.
//
// THE DEFECT THIS EXISTS TO CLOSE (docs/proposals/RESUME-COSTS-MORE-THAN-RESTART.md).
// A helper resumed with `SendMessage` carries its whole history, and every step
// it takes after the resume re-reads all of it. Measured 2026-09-23 on this
// repo's own wave: one orchestration session spent 19.8M cost-weighted tokens in
// three hours, an estimated 9-10M of it on resumes — a proofs fixer carrying
// ~428k spent 4.0M over 18 steps. A fresh helper briefed from the same commits
// and hand-off file starts small. And the shipped orchestrator guidance listed
// the costly move first. Nothing priced the choice at the moment it was made,
// so this does.
//
// IT IS ADVISORY, IN THE `scripts/change-price.mjs` STANCE. It never denies,
// never blocks, never asks, and exits 0 on every path — there is no
// `process.exit` in this file at all, so every path ends at node's own zero.
// Whether a helper holds state worth its price is a JUDGEMENT about work this
// program cannot see; a refusal on it would be the uncalibrated instrument in a
// refusal path that PRINCIPLES.md §2 forbids, and a new gate NORTH-STAR §10 Q3
// presumes against. It prints a number and says what the number means.
//
// THE OUTPUT CONTRACT. PreToolUse `hookSpecificOutput.additionalContext`, with
// `hookEventName` and NOTHING ELSE — no `permissionDecision`. Relied on:
// https://code.claude.com/docs/en/hooks.md, read 2026-09-24 —
//   "PreToolUse decision control": `additionalContext` is a "String added to
//     Claude's context alongside the tool result", listed beside, and not
//     requiring, `permissionDecision`;
//   the same table: `permissionDecision: "allow"` "skips the permission
//     prompt", which is why it is never emitted here — an advisory that
//     approved the send would be quietly granting a permission the user holds;
//   "Add context for Claude": the context is "next to the tool result" for
//     PreToolUse, so the send has already gone when this is read — it prices
//     the NEXT decision (keep feeding this helper, or stop it and start fresh);
//     and "Write the text as factual statements rather than imperative system
//     instructions", which is why the text below states facts.
//
// WHAT IT READS, AND ONLY THAT. The payload's `transcript_path` names the
// session transcript `<dir>/<session>.jsonl`; a helper spawned in that session,
// at any spawn depth, writes `<dir>/<session>/subagents/agent-<id>.jsonl`, and
// `tool_input.to` is that `<id>` when the send addresses a helper by id
// (verified by execution 2026-09-24; the hand-off is the slice's record). The
// context the helper carries is the prompt its most recent turn read:
// `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` on the
// last assistant line's `message.usage`. The transcript is written
// asynchronously and may lag, so this is a floor, never an overcount.
//
// Transcripts reach many megabytes (a 252-step helper: 290,921 tokens carried),
// so the file is read BACKWARDS from its end in fixed chunks and the read stops
// at the first assistant line that answers — the common case is one chunk. A
// cap bounds the pathological one; past it, silence.
//
// IT FAILS OPEN AND SILENT, deliberately and everywhere. Silent — no output, exit
// 0 — when:
//   - the payload is not JSON, or not a PreToolUse for SendMessage;
//   - `to` is not a helper file in this session: a NAME, a peer session, "main",
//     a "[ref]" suffix, a broadcast — none of these is an `agent-<id>.jsonl`
//     here, and a `to` that is not a bare id is never joined into a path at all;
//   - the transcript cannot be opened, is empty, is truncated with no complete
//     assistant line, or answers only past the read cap;
//   - anything throws.
// A price it cannot compute is not a price, and an advisory that spoke up on a
// guess would be training its reader to ignore it. Silence costs one
// un-priced send; a wrong number costs the program its credibility.
//
// WHERE IT RUNS. Shipped with the plugin: `.claude-plugin/plugin.json` names
// `./scripts/hooks/plugin-hooks.json` in its `hooks` field, and that file runs this
// script through `${CLAUDE_PLUGIN_ROOT}` (the plugin is this repository — the
// marketplace entry's source is "./" — so `scripts/` is inside what installs).
// Not the default `hooks/hooks.json`: a new top-level directory is a path that
// obliges a review and can reopen none (test/proof-plan.test.mjs, "EVERY PATH
// THAT OBLIGES A REVIEW IS A PATH THAT CAN REOPEN ONE"), while `.claude-plugin/`
// and `scripts/` are both review roots already. Wired in this repo's
// `.claude/settings.json` too, with the anchored `${CLAUDE_PROJECT_DIR}` form the
// proof gate uses. It imports nothing outside node's standard library, so the
// plugin copy runs from any adopter's tree.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/** Above this many carried tokens, the send is priced. The proposal's starting point; declared here once. */
export const RESUME_PRICE_THRESHOLD = 150_000;

/**
 * What a FRESH helper reads on its first step, for comparison. Measured
 * 2026-09-24 on a minimal fresh helper's first turn: input 4 + cache read
 * 19,099 + cache creation 17,916 = 37,019. The proposal's range was ~30-50k;
 * this is the one measured figure, declared here once. A heavier brief starts
 * higher — the comparison is to a floor, as the carried figure is.
 */
export const FRESH_HELPER_TOKENS = 4 + 19_099 + 17_916;

/** A helper id: what Claude Code names `agent-<id>.jsonl` after. Nothing else is joined into a path. */
const HELPER_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** Read the tail in chunks of this size; stop after this many bytes without an answer. */
const CHUNK_BYTES = 64 * 1024;
const MAX_TAIL_BYTES = 32 * 1024 * 1024;

/**
 * The session directory helper transcripts live under, from a payload's
 * `transcript_path`. The main session's transcript is `<dir>/<session>.jsonl`
 * and its helpers are under `<dir>/<session>/`. A path that is itself a helper
 * transcript (`<dir>/<session>/subagents/agent-x.jsonl`) is resolved to the same
 * session directory: that shape is what SubagentStop documents for
 * `agent_transcript_path`, and it is handled so a send FROM a helper can never be
 * priced against a directory that does not exist. Null when the path is not a
 * transcript path at all.
 */
export function sessionDirOf(transcriptPath) {
  if (typeof transcriptPath !== "string" || !transcriptPath.endsWith(".jsonl")) return null;
  const parent = path.dirname(transcriptPath);
  if (path.basename(parent) === "subagents") return path.dirname(parent);
  return transcriptPath.slice(0, -".jsonl".length);
}

/** The helper transcript a SendMessage payload addresses, or null when `to` is not a helper id. */
export function helperTranscript(input) {
  const to = input?.tool_input?.to;
  if (typeof to !== "string" || !HELPER_ID.test(to)) return null;
  const dir = sessionDirOf(input?.transcript_path);
  if (!dir) return null;
  return path.join(dir, "subagents", `agent-${to}.jsonl`);
}

/** The prompt size one transcript line records, or null when it is not a real assistant turn. */
function carriedBy(line) {
  if (!line.includes('"assistant"') || !line.includes('"usage"')) return null; // cheap reject before a parse
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    return null; // a truncated line — the transcript is written while the helper runs
  }
  if (entry?.type !== "assistant") return null;
  const u = entry.message?.usage;
  if (!u || typeof u !== "object") return null;
  const parts = [u.input_tokens, u.cache_read_input_tokens, u.cache_creation_input_tokens].map((n) => (Number.isFinite(n) && n >= 0 ? n : 0));
  const total = parts[0] + parts[1] + parts[2];
  // A turn that read nothing is not a model turn: an assistant line with model
  // "<synthetic>" records every count as 0 (seen in this machine's transcripts,
  // 2026-09-24). The real turn is further up.
  return total > 0 ? total : null;
}

/**
 * The context a helper carries: the prompt size of the LAST assistant turn in
 * its transcript, read backwards from the end of the file. Null when there is
 * no answer — unreadable, empty, truncated with no complete assistant line, or
 * none within `maxBytes` of the end.
 */
export function carriedContext(file, { chunkBytes = CHUNK_BYTES, maxBytes = MAX_TAIL_BYTES } = {}) {
  let fd;
  try {
    fd = fs.openSync(file, "r");
    const size = fs.fstatSync(fd).size;
    let pos = size;
    // The bytes read but not yet split into lines, in file order: the start of
    // the newest line not yet tried. Kept as a list and joined only when a
    // newline arrives, so one enormous line costs one copy, not one per chunk.
    let pending = [];
    while (pos > 0 && size - pos < maxBytes) {
      const len = Math.min(chunkBytes, pos);
      pos -= len;
      const chunk = Buffer.alloc(len);
      fs.readSync(fd, chunk, 0, len, pos);
      if (chunk.lastIndexOf(0x0a) === -1) {
        pending.unshift(chunk);
        continue;
      }
      let buf = Buffer.concat([chunk, ...pending]);
      // Split at the LAST newline, repeatedly, so lines are tried newest first.
      // 0x0a never occurs inside a multi-byte UTF-8 sequence, so this cannot
      // split a character.
      let nl;
      while ((nl = buf.lastIndexOf(0x0a)) !== -1) {
        const line = buf.subarray(nl + 1).toString("utf8").trim();
        if (line) {
          const n = carriedBy(line);
          if (n !== null) return n;
        }
        buf = buf.subarray(0, nl);
      }
      pending = [buf];
    }
    if (pos === 0 && pending.length) {
      const n = carriedBy(Buffer.concat(pending).toString("utf8").trim()); // the file's first line
      if (n !== null) return n;
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* nothing to do */
      }
    }
  }
}

const tokens = (n) => n.toLocaleString("en-US");
const roughly = (n) => `~${Math.round(n / 1000)}k`;

/** The context added for the sender, or null when the helper carries no more than the threshold. */
export function advisory(carried, id) {
  if (!Number.isFinite(carried) || carried <= RESUME_PRICE_THRESHOLD) return null;
  return (
    `resume-price (advisory; it does not stop this send): helper ${id} carries ${tokens(carried)} tokens of context ` +
    `(${roughly(carried)}) — the prompt its most recent turn read, above the ${tokens(RESUME_PRICE_THRESHOLD)}-token ` +
    `threshold this program prices at. Every step a resumed helper takes re-reads all of it, so each step of this ` +
    `resume costs at least ${roughly(carried)} tokens of input. Whatever it has committed and written to its hand-off ` +
    `file is on disk, and a fresh helper briefed from those starts at ${roughly(FRESH_HELPER_TOKENS)} ` +
    `(${tokens(FRESH_HELPER_TOKENS)} measured 2026-09-24). Resume only if it holds unsaved state you need.`
  );
}

/** The whole decision, pure over a parsed payload: the JSON to print, or null for silence. */
export function respond(input) {
  if (input?.hook_event_name !== "PreToolUse" || input?.tool_name !== "SendMessage") return null;
  const file = helperTranscript(input);
  if (!file) return null;
  const carried = carriedContext(file);
  if (carried === null) return null;
  const text = advisory(carried, input.tool_input.to);
  if (!text) return null;
  return { hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: text } };
}

function readStdin({ timeoutMs = 3000 } = {}) {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve("");
    let s = "";
    // A payload that never ends is not one: give up, silently, well inside the
    // hook's timeout rather than being killed at it.
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
    // Synchronous, so the process cannot end before the JSON is flushed.
    if (out) fs.writeSync(1, JSON.stringify(out));
  } catch {
    /* fail open and silent: see the header */
  }
}

// Only as the entry module, so the tests can import the pure half without
// waiting on a stdin that never ends (the lesson scripts/hooks/proof-gate.mjs records).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
