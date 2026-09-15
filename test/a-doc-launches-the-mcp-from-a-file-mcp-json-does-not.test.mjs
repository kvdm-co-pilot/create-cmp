// HOW `cmp-inspector` IS LAUNCHED HAS ONE HOME — `.mcp.json` — AND FIVE PLACES
// IN THIS REPO SAY IT AGAIN IN PROSE.
//
// A doc that reproduces the registration block, or that hands a reader a command
// to launch the server, is a SECOND SPELLING of a fact `.mcp.json` already holds.
// Second spellings drift in one of them, and this one has drifted twice already,
// in opposite directions:
//
//   WHICH FILE — `f5077c8` moved the launch from `bin/server.mjs` to the bundled
//                `dist/server.mjs`, because the marketplace cache has no
//                node_modules and the unbundled entry dies there on
//                ERR_MODULE_NOT_FOUND. Measured again 2026-09-15 in a copy of
//                `inspector/` with node_modules removed: `node
//                inspector/mcp/bin/server.mjs` → ERR_MODULE_NOT_FOUND
//                (@modelcontextprotocol/sdk), `node inspector/mcp/dist/server.mjs`
//                → answers `initialize`. Three live docs still tell the reader to
//                register the entry that cannot start.
//   FROM WHERE — `6851016` anchored the path with ${CLAUDE_PLUGIN_ROOT} so a
//                plugin-loaded server stops resolving against the client's cwd.
//                The README goes on printing the pre-anchor block under the
//                sentence "This repo registers the server via a root `.mcp.json`",
//                so the file it claims to be showing you is not the file.
//
// THE INVARIANT IS OVER THE PAIR, AND IT TAKES NO SIDE. Every launch spelled in a
// live doc is read out of that doc and checked against `.mcp.json`; the test does
// not know which of the two is right and must not, because that is the author's
// call. Rewriting the sentence, deleting the block, or changing `.mcp.json` are
// all valid fixes.
//
// TWO ASSERTIONS, BECAUSE THE TWO DRIFTS ARE NOT THE SAME CLAIM:
//   1. a doc REPRODUCING `.mcp.json` must reproduce the current one, anchor and
//      all — that block is copied into a real config, where the anchor decides
//      whether the plugin's server starts anywhere but one directory;
//   2. a doc handing over a `node <path>/server.mjs` command must name the file
//      `.mcp.json` names. NOT the anchor: `${CLAUDE_PLUGIN_ROOT}` is substituted
//      for a plugin-scoped config and nowhere else, so an absolute-path or
//      `<plugin-root>` form is correct outside the plugin. Only WHICH FILE is
//      shared between the two.
//
// SCOPE IS STRUCTURAL, NOT A LIST OF FILES. A hand-listed set of "live docs" is
// itself a second spelling that goes stale the day someone adds a doc. What is
// matched is the shape of an instruction: a fenced block that IS an `.mcp.json`,
// or a line that hands over a `node` command naming `inspector/mcp/**/server.mjs`
// from the repo root. Architecture prose that merely names the module (`docs/
// VERIFICATION-LAYER-DESIGN.md`, `docs/proposals/console-build-handshake.md`) is
// not an instruction and is not matched.
//
// RECORDS ARE EXEMPT, AND THAT IS LOAD-BEARING. A changelog, an ADR, a proposal
// and the defect log describe what was true when they were written — quoting the
// old spelling is the point of a record. `docs/KNOWN-DEFECTS.md` especially: its
// own header promises that logging a defect is free because markdown under
// `docs/` cannot reopen a gate. A lint that went red when the log quoted the bad
// command would make the honest thing cost a review round, and the honest thing
// would stop happening.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The one home: what this repo actually launches, and how it spells the anchor. */
const MCP_JSON = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, ".mcp.json"), "utf8"));
const ENTRY = MCP_JSON.mcpServers["cmp-inspector"];
const ARG = ENTRY.args[0];
const ANCHOR = "${CLAUDE_PLUGIN_ROOT}/";
/** The repo-relative file, anchor stripped — the half every spelling shares. */
const LAUNCHED = ARG.startsWith(ANCHOR) ? ARG.slice(ANCHOR.length) : ARG;

/** Tracked markdown, minus the records that are supposed to quote yesterday. */
const RECORD = (rel) =>
  rel === "CHANGELOG.md" ||
  rel === "docs/KNOWN-DEFECTS.md" ||
  rel === "docs/DOGFOODING-FINDINGS.md" ||
  rel.startsWith("docs/adr/") ||
  rel.startsWith("docs/proposals/");

const LIVE_DOCS = execFileSync("git", ["ls-files", "*.md"], { cwd: REPO_ROOT, encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((rel) => !RECORD(rel));

const readDoc = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");

/** Every fenced block in `text`, with the 1-based line its fence opens on. */
function fencedBlocks(text) {
  const out = [];
  const lines = text.split("\n");
  let open = null;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) {
      if (open === null) open = { line: i + 1, body: [] };
      else {
        out.push({ line: open.line, body: open.body.join("\n") });
        open = null;
      }
    } else if (open) open.body.push(line);
  });
  return out;
}

test("a doc that reproduces .mcp.json reproduces the one this repo ships", () => {
  const wrong = [];
  for (const rel of LIVE_DOCS) {
    for (const block of fencedBlocks(readDoc(rel))) {
      if (!block.body.includes('"mcpServers"') || !block.body.includes("cmp-inspector")) continue;
      let shown = null;
      try {
        shown = JSON.parse(block.body).mcpServers["cmp-inspector"];
      } catch {
        // An elided snippet cannot be parsed; it must still carry the real arg.
        if (!block.body.includes(ARG)) wrong.push(`${rel}:${block.line} — does not contain ${JSON.stringify(ARG)}`);
        continue;
      }
      try {
        assert.deepEqual(shown, ENTRY);
      } catch {
        wrong.push(`${rel}:${block.line} — shows ${JSON.stringify(shown)}, .mcp.json holds ${JSON.stringify(ENTRY)}`);
      }
    }
  }
  assert.deepEqual(
    wrong,
    [],
    "a doc prints an `.mcp.json` that is not the one in this repo. A reader copies that block into a real " +
      "config, so a stale copy hands them a server that does not start — an unanchored path resolves against " +
      "whatever cwd the MCP client has, which for a plugin-loaded server is not the plugin root:\n  " +
      wrong.join("\n  "),
  );
});

test("a doc that tells a reader to launch cmp-inspector names the file .mcp.json launches", () => {
  // `node <anything>/inspector/mcp/<dir>/server.mjs` — a path spelled from the
  // repo root, i.e. handed to someone who is not standing in inspector/mcp. The
  // prefix is free (absolute, `<plugin-root>`, nothing); the tail is not.
  const COMMAND = /node\s+([^\s`"'|]*inspector\/mcp\/[A-Za-z0-9_-]+\/server\.mjs)/g;
  const wrong = [];
  for (const rel of LIVE_DOCS) {
    readDoc(rel)
      .split("\n")
      .forEach((line, i) => {
        for (const m of line.matchAll(COMMAND)) {
          if (!m[1].endsWith(LAUNCHED)) wrong.push(`${rel}:${i + 1} — launches ${m[1]}, .mcp.json launches ${LAUNCHED}`);
        }
      });
  }
  assert.deepEqual(
    wrong,
    [],
    `a doc hands the reader a launch command for a file this repo does not launch. ${LAUNCHED} is the ` +
      "self-contained bundle; the unbundled entry needs node_modules that a marketplace install does not have, " +
      "and dies there on ERR_MODULE_NOT_FOUND — which is the bug f5077c8 fixed in the config and left standing " +
      "in the prose:\n  " +
      wrong.join("\n  "),
  );
});
