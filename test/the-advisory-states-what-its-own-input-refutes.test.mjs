// TWO SENTENCES `scripts/change-price.mjs` PRINTS THAT ITS OWN INPUT REFUTES.
//
// The standard is the program's own header: "AN ADVISORY THAT BLUFFS IS WORSE
// THAN NONE. Where it does not know, it says so and names what would settle it."
// Round 1 held the VERDICTS to that. These two hold the REASONING to it, which
// is the half a reader actually acts on: a verdict that is right for a reason
// that is false of their diff sends them to check the wrong thing.
//
// Written as the CLASS, not the instance:
//
//   1. A LANE VERDICT'S `why`/`clauses` STATE A FACT ABOUT THE DIFF, AND THE
//      DIFF REFUTES IT. Every such sentence is a claim with a decidable
//      predicate over `paths`, so the table below pairs them and the matrix
//      drives both. Two members today, and they point opposite ways:
//        - "the diff contains code" is printed over diffs that contain none.
//          This member is NEW: measured against 5a3abb1 (pre-fix), zero of the
//          same 288 shapes printed it falsely; on this tree 24 do. Deleting lane
//          rule 4 dropped an all-markdown governing-doc diff into rule 7, which
//          is the one branch whose "why" was written assuming code was present.
//        - "no path under docs/adr/ … moved" is printed over diffs holding
//          `docs/adr/template.md`. The CONCLUSION is right — the template is the
//          empty form and carries no decision — but the sentence that carries it
//          is false, and it is the sentence a reader checks their own diff
//          against. Older than the fix; the fix rewrote both spellings of it and
//          kept the falsity, and this file's routing rule does not exempt age.
//
//   2. A DISCLOSURE NAMES A COMMAND AS REPORTING WHAT IT DOES NOT REPORT.
//      The new malformed-line disclosure tells its reader the sentence is one
//      `proof-plan.mjs --history` prints "about the same file". That command
//      reads `plans`, `reviews` and `fleet` — never `qa-artifacts/suite-history.jsonl`
//      — and prints ONE malformed count summed across the three, so there is no
//      per-file sentence to compare on any row. The command is executed here
//      rather than read, because that is the only way to settle what it prints.
//
// Neither is a taste call: both are assertions made to a human who cannot see
// what the program read.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { laneOf, classifyPath, spendOf, GOVERNING_DOCS } from "../scripts/change-price.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Every sentence one lane verdict puts in front of a human, in one string. */
const saidOf = (r) => [r.headline, ...(r.why ?? []), ...(r.clauses ?? []).flatMap((c) => [c.answer, c.detail])].join("\n");

// One representative of every shape `classifyPath` distinguishes, plus three of
// the eight §12 documents — enough for the cross-product to be read, not enough
// to be slow.
const POOL = ["src/a.mjs", "README.md", "docs/adr/template.md", "docs/adr/0014-x.md", "docs/features/f.md", ...GOVERNING_DOCS.slice(0, 3)];
const SUBJECTS = [[], ["fix: a"], ["docs: a"], ["chore: a"], ["feat: a"], ["refactor: a"], ["wip"], ["fix: a", "feat: b"]];

const DIFFS = [];
for (let i = 0; i < POOL.length; i++) {
  for (const subjects of SUBJECTS) DIFFS.push({ paths: [POOL[i]], subjects });
  for (let j = i + 1; j < POOL.length; j++) for (const subjects of SUBJECTS) DIFFS.push({ paths: [POOL[i], POOL[j]], subjects });
}

/**
 * THE CLAIMS TABLE. `said` is how the program spells the claim; `trueOf` is the
 * same claim as a predicate over the diff it was handed. A row is measured only
 * on the shapes that print it — a claim not printed is not a claim — so the
 * floor below keeps the TABLE from going quietly dead, rather than each row:
 * a row whose sentence is deleted outright has been answered, not evaded.
 */
const CLAIMS = [
  {
    claim: "the diff contains code",
    said: /the diff contains code/,
    trueOf: (paths) => paths.some((p) => classifyPath(p) === "code"),
  },
  {
    claim: "no path under docs/adr/, docs/features/ or a §12 governing document is in this diff",
    said: /(?:no path|nothing) under docs\/adr\//,
    trueOf: (paths) => !paths.some((p) => p.startsWith("docs/adr/") || p.startsWith("docs/features/") || GOVERNING_DOCS.includes(p)),
  },
];

test("a lane verdict's own reasoning states a fact about the diff that the diff refutes", () => {
  const refuted = [];
  const exercised = new Map(CLAIMS.map((c) => [c.claim, 0]));

  for (const { paths, subjects } of DIFFS) {
    const said = saidOf(laneOf(paths, subjects));
    for (const c of CLAIMS) {
      if (!c.said.test(said)) continue;
      exercised.set(c.claim, exercised.get(c.claim) + 1);
      if (!c.trueOf(paths)) refuted.push(`${JSON.stringify(paths)} + ${JSON.stringify(subjects)} → says "${c.claim}"`);
    }
  }

  assert.notEqual(
    [...exercised.values()].reduce((a, b) => a + b, 0),
    0,
    "no diff in this matrix printed ANY claim in the table, so this test measures nothing — re-point the table at the sentences the program prints now",
  );

  assert.deepEqual(
    refuted,
    [],
    `${refuted.length} of ${DIFFS.length} diff shapes are told something about their own paths that is false of them:\n  ${refuted.slice(0, 8).join("\n  ")}\n  …`,
  );
});

test("the malformed-line disclosure cites a command that reports nothing about the file it is disclosing", () => {
  const history = (kind, malformed) => ({ file: `qa-artifacts/${kind}-history.jsonl`, exists: true, rows: [], malformed });
  const suite = spendOf({
    branch: "a-branch",
    plan: null,
    device: "none",
    review: "none",
    commits: 1,
    dirty: false,
    histories: { suite: history("suite", 3), fleet: history("fleet", 0), reviews: history("review", 0) },
  }).find((r) => r.what === "suite");

  // The premise, read from the program rather than asserted here. Dropping the
  // citation — or pointing it at scripts/suite-record.mjs, which does own this
  // file — removes the class outright, so there is nothing left to measure and
  // this returns rather than reddening for the absence of the defect. Re-adding
  // the citation is caught again on the next run.
  const cited = (suite.extra ?? []).find((l) => /proof-plan\.mjs --history/.test(l));
  if (!cited) return;

  // Only `--history` is executed, and only because it is READ-ONLY. Do not
  // generalise this to whatever flag a future line names: `--open`,
  // `--record-review` and `--discharge` all WRITE, and a test that ran them
  // would keep its own books in qa-artifacts/.

  const out = spawnSync(process.execPath, [path.join(REPO_ROOT, "scripts", "proof-plan.mjs"), "--history", "--json"], { encoding: "utf8" });
  assert.equal(out.status, 0, `the cited command did not run: ${out.stderr}`);

  assert.match(
    out.stdout,
    /suite/,
    `the suite row says of its ${suite.malformed} unparsed line(s): "${cited}" — but the command it names never reads ${suite.file}. ` +
      "It reads plans, reviews and fleet, and prints one malformed count summed over those three, so a reader who runs it to check this number is told 0 and learns nothing about the file the row is about.",
  );
});
