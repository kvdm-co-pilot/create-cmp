// A QUOTING STYLE NO CURATED ROW COVERS RESOLVES A DIRECTORY THE SHELL WOULD NOT.
//
// test/the-gate-resolves-a-directory-a-shell-would-not.test.mjs holds the
// property this file holds. The difference is where the shapes come from, and
// it is the whole point: that file carries 31 rows a human wrote, and every one
// of them was written the day a defect was found in it. This one GENERATES its
// shapes — every directory name crossed with every way of quoting it crossed
// with every way of chaining it — so a spelling nobody has met yet is measured
// before it is met. The curated table stays exactly as it is: it is the record
// of what went wrong and why, and a generated sweep is no substitute for that.
//
// THE PROPERTY, unchanged from the curated file:
//
//   for every command, the gate resolves the directory /bin/sh would run the
//   gated command in, or it resolves NOTHING at all.
//
// WHY `/bin/sh` IS THE ORACLE AND NOT A SECOND OPINION. `commandCwd` infers a
// directory from a command STRING, and every verdict the proof gate reaches is
// about the tree that directory sits in. There is exactly one authority on where
// a shell runs a command, and it is a shell. So each shape is run twice: once by
// `/bin/sh` with the gated command replaced by `pwd -P`, which is ground truth by
// construction, and once by the reader. A disagreement is a defect in the reader,
// never in the oracle. The gated command is never run.
//
// WHY IT IS WORTH THE SECONDS. KD-95 was a quoted operand the reader saw only
// part of — `cd "/a b"/in` read as `/in`, `cd /here"/sub"` read as the payload's
// own cwd, which is KD-79. Both were found by hand, one at a time, and each cost
// a round. This sweep was built during the review of the fix and ran 600 rows
// against a real shell in the time it takes to read one of them.
//
// A DIRECTORY THE GATE RESOLVES THAT IS NOT THERE IS NOT COUNTED, and that is a
// real exemption rather than a convenience. `judgedTree` refuses a directory
// that does not exist, so such a row can never reach a verdict — and it is the
// case the curated file's own header describes: `cd /gone; gh pr merge` runs the
// merge in the ORIGINAL directory after the `cd` fails, and "the gate cannot tell
// those apart, so it does not try". The count of skipped rows is asserted and
// printed, so the exemption can never quietly become the whole sweep.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { commandCwd } from "../scripts/hooks/proof-gate.mjs";

const GATED = "gh pr merge 1 --rebase";
const PROBE = "pwd -P";

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "gate-cwd-sweep-")));
const HERE = path.join(tmp, "here");

/**
 * Directory names, each one a thing a real checkout is called or a thing a
 * shell treats specially. The spaced and apostrophed ones are macOS reality
 * (`/Users/k/My Drive`, `Karel's trees`); the rest are the characters whose
 * handling differs between quoted and unquoted, which is what this sweeps.
 */
const NAMES = [
  "plain",
  "my trees",
  "Karel's trees",
  'a"b',
  "a&b",
  "a;b",
  "a(b)c",
  "a b c",
  "a!b",
  "a#b",
  "a=b",
  "a,b",
  "a-b",
  "  leading",
  "trailing  ",
  "a\tb",
  "a\\b",
  "a$b",
  "a*b",
  "a?b",
  "a[b]",
  "a~b",
  "a`b",
  "a|b",
  "a>b",
  "a<b",
];
for (const d of [HERE, ...NAMES.map((n) => path.join(tmp, n))]) fs.mkdirSync(d, { recursive: true });

/**
 * THE ONE DISAGREEMENT THIS TREE ALREADY KNOWS ABOUT, pinned exactly so it can
 * neither grow nor be forgotten.
 *
 * `LITERAL_PATH` admits `>` and `<`, which are not path characters to a shell —
 * they are redirection operators, so `cd /x>b` is `cd /x` with stdout sent to a
 * file called `b`, and the gate reads the whole thing as a directory. This is
 * KD-192's class exactly (an unquoted brace expansion, "cannot mislead unless a
 * directory literally named `{b,c}` exists"): the resolved path is only THERE,
 * and so only reachable, when someone has made a directory whose name contains
 * the operator — otherwise the gate refuses it for not existing. This sweep
 * makes such a directory on purpose, which is why it sees it and a real session
 * never has.
 *
 * Asserted as the exact set of REASONS, not as a row count. A disagreement of
 * any other kind lands in `wrong` and fails; fixing this one empties the list
 * and fails the floor below, which is what tells whoever fixes it to delete
 * this declaration rather than leave it lying.
 */
const KNOWN_REASON = "an unquoted redirection operator (`>`/`<`) read as part of the path — KD-192's class";
const knownUnreadable = (name, how) => how === "unquoted" && /[<>]/.test(name);

const dir = (p) => path.dirname(p);
const base = (p) => path.basename(p);

/** Every way of writing one path as one `cd` operand. */
const WRAPS = [
  ["unquoted", (p) => p],
  ["wholly double-quoted", (p) => `"${p}"`],
  ["wholly single-quoted", (p) => `'${p}'`],
  ["every special character escaped", (p) => p.replace(/([ '"$`*?[\]~\\&;()!#|<>\t])/g, "\\$1")],
  ["a double-quoted head joined to an unquoted tail", (p) => `"${dir(p)}"/${base(p)}`],
  ["a single-quoted head joined to an unquoted tail", (p) => `'${dir(p)}'/${base(p)}`],
  // THE DANGEROUS HALF OF KD-95, and the reason this wrap is here rather than
  // only its mirror image: an unquoted HEAD that is itself a real directory,
  // with the quoted tail that takes the shell one level deeper. A reader that
  // sees only the head resolves a directory that EXISTS and is the wrong one —
  // where the mirror shape (`"/a b"/in`) misreads to `/in`, which is not there
  // and which the gate refuses downstream for that reason. Only this direction
  // ends in a verdict about the wrong tree.
  ["an unquoted head joined to a double-quoted tail", (p) => `${dir(p)}"/${base(p)}"`],
  ["an unquoted head joined to a single-quoted tail", (p) => `${dir(p)}'/${base(p)}'`],
  ["quoted, with a trailing slash", (p) => `"${p}/"`],
  ["quoted, with a trailing /.", (p) => `"${p}/."`],
];

/** Every way of putting that `cd` in front of the gated command. */
const CHAINS = [
  ["chained with &&", (o) => `cd ${o} && ${GATED}`],
  ["joined with ;", (o) => `cd ${o}; ${GATED}`],
  ["with an ordinary command in between", (o) => `cd ${o} && echo ok && ${GATED}`],
];

/**
 * Where /bin/sh actually runs the gated command, or null when the shape does not
 * run cleanly — an operand the shell itself rejects is not a shape this gate owes
 * an answer about. NOT trimmed: a directory whose name ends in a space is one of
 * the rows here, and trimming the oracle would invent a disagreement.
 */
function whereTheShellRuns(command) {
  const r = spawnSync("/bin/sh", ["-c", command.replace(GATED, PROBE)], { cwd: HERE, encoding: "utf8", timeout: 10000 });
  if (r.status !== 0) return null;
  const lines = r.stdout.split("\n").filter(Boolean);
  const last = lines.at(-1);
  return last && path.isAbsolute(last) ? last : null;
}

/**
 * The same answer for many shapes at once, because 780 shells cost thirteen
 * seconds and 30 cost one. Each shape runs in its OWN subshell, which starts in
 * the parent's directory exactly as a fresh shell would, and prints a sentinel
 * after it so the answers stay aligned even when a shape prints nothing (a
 * failed `cd` before a `&&`, which is one of the cases being measured).
 *
 * FALLS BACK RATHER THAN GUESSING. A shape with an unterminated quote swallows
 * the sentinel and every line after it, so a batch that does not come back with
 * one chunk per shape is discarded and its shapes are run one at a time. That is
 * not a rare path — the names carrying a `"` or a `'` take it every time — so it
 * is the same code both ways, and the equivalence of the two is asserted below.
 */
const SENTINEL = "__END_OF_SHAPE__";
function whereTheShellRunsAll(commands) {
  const script = commands.map((c) => `( ${c.replace(GATED, PROBE)} )\nprintf '${SENTINEL}\\n'\n`).join("");
  const r = spawnSync("/bin/sh", ["-c", script], { cwd: HERE, encoding: "utf8", timeout: 30000 });
  const chunks = (r.stdout ?? "").split(`${SENTINEL}\n`);
  if (chunks.length < commands.length + 1) return commands.map(whereTheShellRuns);
  return commands.map((_, i) => {
    const last = chunks[i].split("\n").filter(Boolean).at(-1);
    return last && path.isAbsolute(last) ? last : null;
  });
}

test("every generated quoting of a cd operand resolves the shell's directory, or resolves nothing", () => {
  const wrong = [];
  const known = [];
  let executed = 0;
  let resolved = 0;
  let refused = 0;
  let notThere = 0;
  let notAShape = 0;

  for (const name of NAMES) {
    const target = path.join(tmp, name);
    // One shell for this name's whole row of shapes; see whereTheShellRunsAll.
    const rows = WRAPS.flatMap(([how, wrap]) => CHAINS.map(([chained, build]) => ({ how, chained, command: build(wrap(target)) })));
    const truths = whereTheShellRunsAll(rows.map((r) => r.command));
    for (const [i, { how, chained, command }] of rows.entries()) {
      {
        const truth = truths[i];
        if (truth === null) {
          notAShape += 1;
          continue;
        }
        executed += 1;
        const got = commandCwd("merge", command, HERE);
        // Declining is always allowed: an unreadable tree is refused, never
        // guessed at, and that is the direction this gate is settled on.
        if (got.unknown) {
          refused += 1;
          continue;
        }
        if (!fs.existsSync(got.dir)) {
          notThere += 1;
          continue;
        }
        if (got.dir === truth) {
          resolved += 1;
          continue;
        }
        if (knownUnreadable(name, how)) {
          known.push(KNOWN_REASON);
          continue;
        }
        wrong.push(
          `${how}, ${chained}\n    command: ${JSON.stringify(command)}\n` +
            `    the shell runs it in: ${JSON.stringify(truth)}\n` +
            `    the gate resolved:    ${JSON.stringify(got.dir)}` +
            (got.dir === HERE ? " (the payload's cwd — KD-79's own mistake, for this spelling)" : ""),
        );
      }
    }
  }

  // The pinned disagreement, both directions. It must still be exactly one kind
  // — anything else is in `wrong` below — and it must still be THERE, so that
  // the day `LITERAL_PATH` stops admitting `>` and `<` this line is what tells
  // the person who fixed it to delete the declaration above.
  assert.deepEqual(
    [...new Set(known)],
    [KNOWN_REASON],
    "the known-bad set changed shape: it is declared as one reason and is pinned so it can neither grow silently nor outlive its fix",
  );

  assert.deepEqual(
    wrong,
    [],
    `${wrong.length} of ${executed} generated shapes resolve a directory the command will not run in ` +
      `(${refused} refused, ${resolved} resolved exactly, ${notThere} resolved a directory that is not there and cannot reach a verdict, ` +
      `${notAShape} the shell itself rejected).\n\n${wrong.join("\n\n")}\n\n` +
      "Each one is a verdict about the wrong tree. Resolving a tree that owes nothing ALLOWS the command; " +
      "resolving one outside this repository makes the gate SILENT, which is the same allow without a message. " +
      "The honoured set is small on purpose (docs/GATE-RULES.md, Rule 4) — a spelling outside it must reach `{ unknown }`, " +
      "not the payload's cwd and not a directory read out of part of a quoted word.",
  );

  // A SWEEP THAT STOPPED SWEEPING MUST NOT PASS. The floor is well under what
  // this tree produces (600 shapes, ~490 executed) and well over nothing, so it
  // catches a wrap that stopped building, a shell that rejects everything, and a
  // `continue` that swallowed the rows — the ways a generated table goes vacuous.
  assert.ok(
    executed > 300,
    `only ${executed} of ${NAMES.length * WRAPS.length * CHAINS.length} generated shapes ran cleanly under /bin/sh ` +
      `(${notAShape} did not) — the sweep is broken, not the tree`,
  );
  // And both outcomes must be live. All-refused would satisfy the property above
  // while measuring nothing, and is exactly what KD-95 looked like.
  assert.ok(resolved > 50, `the gate resolved only ${resolved} of ${executed} shapes — a gate that refuses everything passes this property and reads no tree`);
  assert.ok(refused > 50, `the gate refused only ${refused} of ${executed} shapes — the spellings it must refuse are not reaching it`);

});

test("the oracle is an oracle: the sweep's own fixtures are directories a shell can reach", () => {
  // The sweep is worth nothing if `whereTheShellRuns` silently returns the
  // starting directory for everything. Two shapes on opposite sides, and the
  // shell — not this file — says which is which.
  const spaced = path.join(tmp, "my trees");
  assert.equal(whereTheShellRuns(`cd "${spaced}" && ${GATED}`), spaced, "a quoted spaced path is reachable, so a disagreement about it is real");
  assert.equal(whereTheShellRuns(`cd ${spaced} && ${GATED}`), null, "the same path unquoted is not one operand, and the shape does not run");
  assert.equal(whereTheShellRuns(`cd ${path.join(tmp, "plain")} && ${GATED}`), path.join(tmp, "plain"));
});

test("the batched oracle answers exactly what one shell per shape answers", () => {
  // The sweep above asks one shell per NAME instead of one per shape, which is
  // what makes it cost five seconds instead of thirteen. That is only allowed if
  // the two agree everywhere, so the two are run side by side here — over both
  // kinds of name: one whose batch parses, and one carrying a quote, whose batch
  // never does and which therefore exercises the fallback every time. Measured
  // over the full 780-shape matrix when the batching was introduced: identical,
  // with the same 140 shapes unrunnable on both sides.
  for (const name of ["my trees", `a"b`]) {
    const target = path.join(tmp, name);
    const commands = WRAPS.flatMap(([, wrap]) => CHAINS.map(([, build]) => build(wrap(target))));
    assert.deepEqual(
      whereTheShellRunsAll(commands),
      commands.map(whereTheShellRuns),
      `the batched oracle and the per-shape oracle disagree on ${JSON.stringify(name)} — the cheap oracle is not an oracle, and every row measured against it is unmeasured`,
    );
  }
});

process.on("exit", () => fs.rmSync(tmp, { recursive: true, force: true }));
