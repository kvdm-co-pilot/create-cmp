// A FLEET CHECK THE SHELL REALLY RUNS GOES UNJUDGED, OR IS JUDGED AGAINST ANOTHER TREE.
//
// The device tier costs three and a half minutes on a real phone, and this hook
// is the only thing standing between "a device run happened" and "a device run
// happened over the tree it claims to prove". There are two ways to lose that,
// and they are not symmetric:
//
//   SILENCE   `classify()` does not recognise the command as a device run, so the
//             hook says NOTHING and the run goes ahead ungated. No message, no
//             refusal, no trace. This is what KD-95 actually was — the entry
//             recorded it as a refusal and it was silence — and it is the
//             direction this gate exists to make impossible.
//   WRONG TREE  the command is classified and `commandCwd` names a tree the run
//             will not prove. A tree that owes nothing ALLOWS the run.
//
// REFUSING IS ALWAYS ALLOWED. A spelling the gate cannot read exactly must come
// back `{ unknown }` with the word it could not read; that is the settled
// fail-safe (docs/GATE-RULES.md, Rule 4). So this file scores three outcomes and
// fails on two of them.
//
// WHY `/bin/sh` IS THE ORACLE. Which file `node <operand>` runs is decided by the
// shell's word-splitting and quote-removal, not by anything this repository can
// reason about. So the shell is asked, with `printf '%s\n' <operand>` — the same
// substitution trick the curated files use when they replace a gated command with
// `pwd -P` — and the answer is the exact word node would be handed. A row counts
// only when that word is a `fleet-check.mjs` that is REALLY THERE on disk, so
// every row scored is a device run the shell would genuinely perform. The last
// test below proves the cheap oracle agrees with the expensive one by letting
// `/bin/sh` actually run planted files and report the tree they sit in.
//
// GENERATED, not curated. test/a-worktree-under-a-path-with-a-space-in-it-is-a-tree-the-gate-can-name.test.mjs
// carries the hand-written rows for KD-95 and stays as it is — it is the record
// of what went wrong. This crosses every awkward tree name with every way of
// quoting the path to it, so the next spelling is measured before it is met.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { classify, commandCwd } from "../scripts/hooks/proof-gate.mjs";

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "fleet-word-sweep-")));
const HERE = path.join(tmp, "here");
fs.mkdirSync(HERE, { recursive: true });

/** Tree names a real checkout is called, and names that are awkward to a shell. */
const NAMES = ["plain", "my trees", "Karel's trees", 'a"b', "a&b", "a;b", "a(b)c", "a b c", "a!b", "a#b", "a=b", "a,b", "a$b", "a*b", "a[b]", "a~b"];

/** Each one a real tree, with a real `scripts/fleet-check.mjs` that names its own root. */
for (const n of NAMES) {
  fs.mkdirSync(path.join(tmp, n, "scripts"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, n, "scripts", "fleet-check.mjs"),
    'import path from "node:path";\nimport { fileURLToPath } from "node:url";\nconsole.log("RAN:" + path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));\n',
  );
}

const dir = (p) => path.dirname(p);
const base = (p) => path.basename(p);

/** Every way of writing one path to one file as one shell word. */
const WRAPS = [
  ["unquoted", (p) => p],
  ["wholly double-quoted", (p) => `"${p}"`],
  ["wholly single-quoted", (p) => `'${p}'`],
  ["every special character escaped", (p) => p.replace(/([ '"$`*?[\]~\\&;()!#])/g, "\\$1")],
  ["a double-quoted directory joined to the file name", (p) => `"${dir(p)}"/${base(p)}`],
  ["a double-quoted tree joined to an unquoted tail", (p) => `"${dir(dir(p))}"/scripts/${base(p)}`],
  ["one path segment single-quoted", (p) => `${dir(dir(p))}/'scripts'/${base(p)}`],
  ["one path segment double-quoted", (p) => `${dir(dir(p))}/"scripts"/${base(p)}`],
  ["the FILE NAME double-quoted", (p) => `${dir(p)}/"${base(p)}"`],
  ["the FILE NAME single-quoted", (p) => `${dir(p)}/'${base(p)}'`],
  ["an empty quoted span after the file name", (p) => `${p}""`],
];

/** What stands in front of the invocation, and what follows the operand. */
const PREFIXES = [["bare", ""], ["behind an assignment", "CMP_AVD=Medium_Phone_API_35 "], ["behind a cd", "cd /tmp && "]];
const SUFFIXES = [["no flags", ""], ["with the lane's flags", " --min-level L2"]];

/**
 * THE SPELLINGS THIS GATE IS ALREADY KNOWN NOT TO SEE, pinned exactly.
 *
 * KD-190 logs two — a command substitution in the path, and a flag before the
 * operand — with reasons that do not reach this one: quoting the FILE NAME
 * itself (`node /t/scripts/"fleet-check.mjs"`) is a wholly literal path with no
 * substitution and no flag, and `FLEET_CHECK_WORD` misses it because every one
 * of its quoted alternatives has to end at a `/`. The shell runs the real file;
 * `classify()` returns null; the hook says nothing.
 *
 * Pinned as the exact set of REASONS rather than as a count. A new silent
 * spelling of any other shape lands in `silent` and fails; closing this one
 * empties the set and fails too, which is what tells whoever closes it to
 * delete this declaration instead of leaving it to rot.
 */
const KNOWN_SILENT_REASON = "the file name itself quoted — a quoted span that does not end at a `/` (KD-190's class, a third spelling)";
const knownSilent = (how) => how === "the FILE NAME double-quoted" || how === "the FILE NAME single-quoted";

/** The word /bin/sh hands node, or null when the shape does not parse as one clean word. */
function shellWord(operand) {
  const r = spawnSync("/bin/sh", ["-c", `printf '%s\\n' ${operand}`], { cwd: HERE, encoding: "utf8", timeout: 10000 });
  if (r.status !== 0) return null;
  const out = r.stdout.replace(/\n$/, "");
  return out.includes("\n") ? null : out; // more than one word: not a single operand
}

test("every spelling the shell really runs is classified, and judged against the tree it runs from", () => {
  const silent = [];
  const known = [];
  const wrong = [];
  let executed = 0;
  let resolved = 0;
  let refused = 0;
  let notARun = 0;

  for (const name of NAMES) {
    const file = path.join(tmp, name, "scripts", "fleet-check.mjs");
    for (const [how, wrap] of WRAPS) {
      const operand = wrap(file);
      const word = shellWord(operand);
      // Only a word that IS a fleet check on disk is a device run the gate owes
      // an answer about. Anything else, the shell would fail to run anyway.
      if (word === null || !word.endsWith(`${path.sep}fleet-check.mjs`) || !fs.existsSync(word)) {
        notARun += PREFIXES.length * SUFFIXES.length;
        continue;
      }
      const truth = path.resolve(path.dirname(word), "..");
      for (const [prefixed, pre] of PREFIXES) {
        for (const [suffixed, suf] of SUFFIXES) {
          const command = `${pre}node ${operand}${suf}`;
          executed += 1;
          if (classify(command) !== "device") {
            if (knownSilent(how)) known.push(KNOWN_SILENT_REASON);
            else silent.push(`${how}, ${prefixed}, ${suffixed}\n    command: ${JSON.stringify(command)}\n    the shell runs: ${JSON.stringify(word)}`);
            continue;
          }
          const got = commandCwd("device", command, HERE);
          if (got.unknown) {
            refused += 1;
            continue;
          }
          if (got.dir === truth) {
            resolved += 1;
            continue;
          }
          wrong.push(
            `${how}, ${prefixed}, ${suffixed}\n    command: ${JSON.stringify(command)}\n` +
              `    the run would prove: ${JSON.stringify(truth)}\n    the gate judged:     ${JSON.stringify(got.dir)}`,
          );
        }
      }
    }
  }

  assert.deepEqual(
    [...new Set(known)],
    [KNOWN_SILENT_REASON],
    "the known-silent set changed shape: it is declared as one reason and pinned so it can neither grow silently nor outlive its fix",
  );

  assert.deepEqual(
    silent,
    [],
    `${silent.length} of ${executed} real device runs are not classified at all — the hook says NOTHING and the run goes ahead ungated.\n\n${silent.join("\n\n")}\n\n` +
      "This is KD-95's actual failure, not a refusal: no message, no refusal, no trace. A spelling this gate cannot read " +
      "must reach `{ unknown }` and be REFUSED with the word it could not read (docs/GATE-RULES.md, Rule 4).",
  );

  assert.deepEqual(
    wrong,
    [],
    `${wrong.length} of ${executed} real device runs are judged against a tree they will not prove ` +
      `(${refused} refused, ${resolved} judged exactly, ${notARun} spellings the shell would not run).\n\n${wrong.join("\n\n")}\n\n` +
      "A device run judged against a tree that owes nothing is ALLOWED, and three and a half minutes on a phone then " +
      "attest to bytes nobody ran them over.",
  );

  // A SWEEP THAT STOPPED SWEEPING MUST NOT PASS, and an all-refused gate
  // satisfies every property above while reading no tree at all.
  assert.ok(executed > 300, `only ${executed} generated spellings resolved to a real fleet-check on disk (${notARun} did not) — the sweep is broken, not the tree`);
  assert.ok(resolved > 50, `the gate resolved a tree for only ${resolved} of ${executed} real device runs — it is refusing everything, which passes by declining`);
  assert.ok(refused > 50, `the gate refused only ${refused} of ${executed} — the unreadable spellings are not reaching it`);

});

test("the oracle is an oracle: the word /bin/sh prints is the file /bin/sh runs", () => {
  // `printf` is used above because it is cheap enough to run hundreds of times.
  // It is only ground truth if the shell resolves a word the same way when the
  // word is a program's argument, so here the planted files are really executed
  // and asked which tree they sit in.
  const reallyRuns = (operand) => {
    const r = spawnSync("/bin/sh", ["-c", `node ${operand}`], { cwd: HERE, encoding: "utf8", timeout: 30000 });
    const line = (r.stdout ?? "").split("\n").find((l) => l.startsWith("RAN:"));
    return line ? line.slice(4) : null;
  };
  for (const name of ["plain", "my trees", "Karel's trees"]) {
    const file = path.join(tmp, name, "scripts", "fleet-check.mjs");
    for (const [how, wrap] of WRAPS.slice(0, 3)) {
      const operand = wrap(file);
      const word = shellWord(operand);
      if (word === null || !fs.existsSync(word)) continue;
      assert.equal(reallyRuns(operand), path.join(tmp, name), `${how} on ${JSON.stringify(name)}: the word printed is not the file run, so the cheap oracle is not one`);
    }
  }
});

process.on("exit", () => fs.rmSync(tmp, { recursive: true, force: true }));
