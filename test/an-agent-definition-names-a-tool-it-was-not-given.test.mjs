// AN AGENT DEFINITION THAT INSTRUCTS A TOOL IT WAS NEVER GRANTED.
//
// `agents/cmp-orchestrator.md` told the orchestrator to "re-brief the same agent
// (`SendMessage`)" from the commit that created it on 2026-07-06. Its frontmatter
// never listed `SendMessage`. The contradiction shipped for ten weeks and cost
// nothing, because nobody drove that path — then on 2026-09-18 FOUR orchestrators
// took it in one day, could not resume a reviewer, and each ran a COLD substitute
// pass instead. Who carries out a re-record is docs/KNOWN-DEFECTS.md's header; this
// comment only points at it.
//
// WHY THIS CHECK CARRIES NO LIST OF TOOL NAMES. The harness's tool surface changes
// faster than any list in this repository could track, and a hand-maintained copy is
// the drift `scripts/ground-truth.mjs` exists to abolish. So nothing here knows what
// Claude Code's tools ARE. Two derivations do the work instead:
//
//   1. SHAPE — a backticked multi-hump CamelCase token (`SendMessage`, `TodoWrite`,
//      `NotebookEdit`) is a tool name almost everywhere and ordinary prose almost
//      nowhere. This is the one that catches a tool granted NOWHERE in the repo,
//      which is the case that actually bit: a union of what other files grant could
//      not have seen it.
//   2. THE REPO'S OWN VOCABULARY — any token another agent definition grants in its
//      `tools:` line is a tool here by demonstration. This catches the single-hump
//      names (`Bash`, `Agent`, `Read`) that shape alone cannot distinguish from
//      English.
//
// Both are read out of the tree at run time. Adding a tool to the harness, or to any
// definition, needs no edit here.
//
// It asks a question rather than asserting a fact: "this file tells the agent to use
// X and does not give it X — did you mean to grant it, or to stop saying it?" Either
// answer clears the test.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Every agent definition this repository ships or uses. */
export function agentDefinitions(root = ROOT) {
  const dirs = [path.join(root, "agents"), path.join(root, ".claude", "agents")];
  return dirs.flatMap((dir) => {
    let names = [];
    try {
      names = fs.readdirSync(dir).filter((n) => n.endsWith(".md"));
    } catch {
      return [];
    }
    return names.map((n) => path.join(dir, n));
  });
}

/** `tools:` as declared, and the body with its frontmatter and fenced blocks removed. */
export function readDefinition(file) {
  const text = fs.readFileSync(file, "utf8");
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
  const granted = new Set(
    (/^tools:\s*(.+)$/m.exec(fm?.[1] ?? "")?.[1] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  // Fenced blocks are examples and shell, not instructions to this agent.
  const body = text.slice(fm?.[0].length ?? 0).replace(/```[\s\S]*?```/g, "");
  return { granted, body };
}

const BACKTICKED = /`([A-Za-z][A-Za-z0-9_]*)`/g;
/** Two humps or more: SendMessage, TodoWrite, NotebookEdit — a shape prose does not use. */
const MULTI_HUMP = /^[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+$/;

/**
 * Tool names a definition's prose tells the agent to use. `vocabulary` is every name
 * some definition grants — the repo demonstrating its own single-hump tools.
 */
export function toolsNamedInProse(body, vocabulary = new Set()) {
  const named = new Set();
  for (const [, token] of body.matchAll(BACKTICKED)) {
    if (MULTI_HUMP.test(token) || vocabulary.has(token)) named.add(token);
  }
  return named;
}

test("no agent definition instructs a tool its own frontmatter does not grant", () => {
  const files = agentDefinitions();
  assert.ok(files.length > 0, "no agent definitions found — this check would pass vacuously");

  const read = files.map((file) => ({ file, ...readDefinition(file) }));
  // The repository's own vocabulary: anything any definition grants is a tool here.
  const vocabulary = new Set(read.flatMap((d) => [...d.granted]));

  const offences = read.flatMap(({ file, granted, body }) =>
    [...toolsNamedInProse(body, vocabulary)]
      .filter((name) => !granted.has(name))
      .map((name) => `${path.relative(ROOT, file)} tells the agent to use \`${name}\` and does not grant it`),
  );

  assert.deepEqual(
    offences,
    [],
    `${offences.length} agent definition(s) name a tool they were not given:\n  ${offences.join("\n  ")}\n\n` +
      "Either add the name to that file's `tools:` line, or stop telling the agent to use it. " +
      "An instruction the agent cannot follow is worse than no instruction: it reads as capability " +
      "and fails only when someone finally takes that path (agents/cmp-orchestrator.md, 2026-07-06 to 2026-09-18).",
  );
});

test("the check finds a planted contradiction, and is not satisfied by shape alone", () => {
  // Multi-hump, granted nowhere in this repo — the case a union of other files' grants
  // could not see, and the one that actually shipped.
  const planted = "Re-brief the same agent (`SendMessage`) or spawn a fresh one.";
  assert.deepEqual([...toolsNamedInProse(planted, new Set())], ["SendMessage"]);

  // Single-hump: invisible to shape, found only because the repo demonstrates it.
  const single = "Run it with `Bash` and read the result.";
  assert.deepEqual([...toolsNamedInProse(single, new Set())], [], "shape alone must not guess at single-hump words");
  assert.deepEqual([...toolsNamedInProse(single, new Set(["Bash"]))], ["Bash"]);

  // Ordinary prose is not a tool name, whatever its capitalisation.
  const prose = "Follow `Rule` 1 and record the `PASS` verdict in `qa-artifacts`.";
  assert.deepEqual([...toolsNamedInProse(prose, new Set())], []);
});
