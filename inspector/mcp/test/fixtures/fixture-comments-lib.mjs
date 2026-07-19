// fixture-comments-lib.mjs — a minimal JSON-file implementation of the §7.3
// comments library contract (VERIFICATION-LAYER-DESIGN.md), used ONLY by this
// package's (inspector/mcp) tests. Agent F builds the real
// template/qa/lib/comments.mjs against the same contract in parallel; this
// fixture exists so comments-bridge.mjs's tests don't depend on that landing
// first — copied into a temp fixture project's qa/lib/comments.mjs the same
// way approvals-bridge.test.mjs copies the real template/qa/lib/approvals.mjs.
//
// Contract (VERIFICATION-LAYER-DESIGN.md §7.3, binding for both agents):
//   listComments(root, {status?}) -> {schema, comments: Comment[]}
//   addComment(root, {target, text, author}) -> {ok:true, comment} | {ok:false, reason}
//     — refuses empty/whitespace text and unknown target types.
//   resolveComment(root, id, {note, author}) -> {ok:true, comment} | {ok:false, reason}
//     — refuses unknown ids and double-resolve.
//   Comment = {id, target, text, author, createdAt, status: "open"|"resolved",
//     resolvedAt?, resolvedBy?, resolutionNote?}; ids c1, c2, … monotonic.
//   target.type ∈ screen | element | spec-line | design-system | architecture |
//     general.

import fs from "node:fs";
import path from "node:path";

const REL_PATH = "qa/comments.json";
const SCHEMA = "cmp-comments/1";
const VALID_TARGET_TYPES = new Set(["screen", "element", "spec-line", "design-system", "architecture", "general"]);

function load(root) {
  const p = path.join(root, REL_PATH);
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!parsed || !Array.isArray(parsed.comments)) return { schema: SCHEMA, comments: [] };
    return { schema: parsed.schema ?? SCHEMA, comments: parsed.comments };
  } catch {
    return { schema: SCHEMA, comments: [] };
  }
}

function save(root, state) {
  const p = path.join(root, REL_PATH);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify({ schema: SCHEMA, comments: state.comments }, null, 2)}\n`);
}

function nextId(comments) {
  const max = comments.reduce((m, c) => {
    const n = Number(String(c.id).replace(/^c/, ""));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `c${max + 1}`;
}

export function listComments(root, { status } = {}) {
  const state = load(root);
  const comments = status ? state.comments.filter((c) => c.status === status) : state.comments;
  return { schema: state.schema, comments };
}

export function addComment(root, { target, text, author } = {}) {
  if (!text || !String(text).trim()) return { ok: false, reason: "text must not be empty/whitespace" };
  if (!target || !VALID_TARGET_TYPES.has(target.type)) {
    return { ok: false, reason: `unknown target type "${target && target.type}"` };
  }
  const state = load(root);
  const comment = {
    id: nextId(state.comments),
    target,
    text: String(text),
    author: author || "unknown",
    createdAt: new Date().toISOString(),
    status: "open",
  };
  state.comments.push(comment);
  save(root, state);
  return { ok: true, comment };
}

export function resolveComment(root, id, { note, author } = {}) {
  const state = load(root);
  const comment = state.comments.find((c) => c.id === id);
  if (!comment) return { ok: false, reason: `unknown comment id "${id}"` };
  if (comment.status === "resolved") return { ok: false, reason: `comment "${id}" is already resolved` };
  comment.status = "resolved";
  comment.resolvedAt = new Date().toISOString();
  comment.resolvedBy = author || "unknown";
  if (note) comment.resolutionNote = String(note);
  save(root, state);
  return { ok: true, comment };
}
