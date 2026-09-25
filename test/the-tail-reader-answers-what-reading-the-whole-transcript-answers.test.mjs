// THE TAIL READER ANSWERS WHAT READING THE WHOLE TRANSCRIPT ANSWERS.
//
// `carriedContext` in scripts/hooks/resume-price.mjs reads a helper transcript
// BACKWARDS, in fixed chunks, splitting at newlines and stitching lines that
// straddle a chunk boundary. That is the part of the hook a wrong number would
// come from, and the hook's own tests pin it by instance: a 7-byte chunk over
// one file, a 5-byte chunk over another, one truncated last line.
//
// WHY AN INVARIANT AND NOT AN INSTANCE. The class is "the backward, chunked
// reader disagrees with the obvious forward one" — at some chunk size, over
// some mix of truncated lines, synthetic zero-usage turns, CRLF endings, blank
// lines and multi-byte characters. So this is a DIFFERENTIAL: an oracle that
// reads the whole file forwards and keeps the last real assistant turn, against
// the tail reader at several chunk sizes, over seeded random transcripts. Any
// disagreement names the chunk size and the bytes.
//
// Built during round 1 of the resume-price review (2026-09-25), where it and a
// scan of 219 real helper transcripts on the author's machine found no
// disagreement. Landed so the next edit to the reader is checked by it rather
// than by another reviewer reasoning about chunk boundaries.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { carriedContext } from "../scripts/hooks/resume-price.mjs";

/** The obvious reader: every line, forwards; the last real assistant turn's prompt size wins. */
function forwardOracle(text) {
  let last = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e?.type !== "assistant") continue;
    const u = e.message?.usage;
    if (!u || typeof u !== "object") continue;
    const total = [u.input_tokens, u.cache_read_input_tokens, u.cache_creation_input_tokens]
      .map((n) => (Number.isFinite(n) && n >= 0 ? n : 0))
      .reduce((a, b) => a + b, 0);
    if (total > 0) last = total;
  }
  return last;
}

test("the tail reader answers what a forward read of the whole transcript answers, at every chunk size", () => {
  let seed = 20260925;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff), seed / 0x7fffffff);
  const int = (n) => Math.floor(rand() * n);

  const kinds = [
    () => JSON.stringify({ type: "assistant", message: { usage: { input_tokens: int(10), cache_read_input_tokens: int(300_000), cache_creation_input_tokens: int(5_000) } }, pad: "é".repeat(int(40)) }),
    () => JSON.stringify({ type: "assistant", message: { model: "<synthetic>", usage: { input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }),
    () => JSON.stringify({ type: "user", message: { content: `"assistant" "usage" ${"ü".repeat(int(80))}` } }),
    () => "",
    () => {
      const whole = JSON.stringify({ type: "assistant", message: { usage: { input_tokens: 1, cache_read_input_tokens: int(300_000) } } });
      return whole.slice(0, int(whole.length)); // a line the helper was still writing
    },
    () => JSON.stringify({ type: "assistant", message: { usage: { input_tokens: 1 + int(9) } } }) + "\r",
  ];

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tail-reader-"));
  const file = path.join(dir, "agent-x.jsonl");
  const disagreements = [];
  try {
    for (let i = 0; i < 1500 && disagreements.length < 5; i++) {
      const lines = Array.from({ length: int(8) }, () => kinds[int(kinds.length)]());
      const text = lines.join(int(2) ? "\n" : "\r\n") + (int(2) ? "\n" : "");
      fs.writeFileSync(file, text);
      const want = forwardOracle(text);
      for (const chunkBytes of [2, 3, 7, 31, 64 * 1024]) {
        const got = carriedContext(file, { chunkBytes });
        if (got !== want) disagreements.push({ chunkBytes, want, got, text });
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.deepEqual(disagreements, [], "the backward reader and the forward oracle disagree on these transcripts");
});
