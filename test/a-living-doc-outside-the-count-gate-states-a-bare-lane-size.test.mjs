// A LANE SIZE THAT NAMES NO PROFILE IS NOT A FACT — AND ONE IS STILL SHIPPING,
// ON A DOCUMENT `test/doc-counts.test.mjs` DOES NOT READ.
//
// That gate's surface list is derived where the category is closed
// (`.claude-plugin/*.json`, `packages/**/README.md`) and HAND-NAMED everywhere
// else — five files. Its justification for the boundary enumerates what is
// deliberately out on the ground that it records a PAST tree:
// `docs/proposals/`, `docs/adr/`, `docs/research/`, `docs/history/`,
// `docs/HARNESS-PLAN.md`, `inspector/mcp/README.md`. `docs/WHY-CMP.md` is in
// neither set. It is not a record — it opens *"written for both humans choosing
// a stack and agents advising one"*, present tense — and it is not hand-named,
// so nothing reads it. It says:
//
//     create-cmp generates a project that is deterministic (frozen CI-verified
//     template), SELF-VERIFYING (8-GATE VERIFY LANE, evidence receipts,
//     Stop-hook enforcement)                            docs/WHY-CMP.md:99
//
// docs/USAGE.md §3 is normative that this sentence cannot be true: *"how many
// steps run depends on `--profile`, so 'N gates' is never a fixed number."* The
// lane a generated project actually runs is 17 at `local`, 18 at `ci`, 20 at
// `release`; the only profile that runs 8 is `smoke`, whose receipt
// `qa/receipt-check.mjs` REFUSES as done-evidence. And this is not an obscure
// page: `llms.txt` sends agents to it by URL as "the full sourced case",
// `AGENTS.md` cites it, all three alias READMEs cite it, and the `cmp-new`
// skill's fit check is sourced from it. It is where a stranger goes to be
// convinced, and it undersells the product by nine gates with a number left
// over from the tree that had eight.
//
// THE INVARIANT, not the instance: the number gate's `gates` noun cannot catch
// this even if WHY-CMP.md were added to its list — it allows any value in the
// SET of derived profile sizes, and `smoke` is 8, so the stale figure is
// laundered by coincidence into a pass. What is checkable is the rule §3
// already states: a gate count is a fact only once it names the profile it
// belongs to. Written against the living docs as a CLASS so the next one cannot
// ship the same way.
//
// SCOPE IS DERIVED, NOT LISTED. `docs/DOCUMENTATION.md` is the repo's own doc
// map and carries a status column; this reads the documents it marks `living`,
// which is the repo's existing answer to "is this prose about the tree or about
// a tree". No exception list — the dated records (`docs/adr/`,
// `docs/proposals/`, `docs/history/`, `CHANGELOG.md`, `inspector/mcp/README.md`)
// are not in the map's living rows at all, and so are never read here.
//
// MEASURED 2026-09-18 over those 20 documents, using the same claim shapes
// `doc-counts.test.mjs` uses (space+plural, or hyphen+either — space+singular
// is not a claim, which is what keeps NORTH-STAR's "Stage 0 gate" out): the
// `gates` noun matches EXACTLY ONE string in the whole set, and it is this one.
// Zero false positives. That is a different measurement from KD-67's, which
// found 50% on the bare `steps` noun and is why THAT noun stays out here too.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { groundTruth } from "../scripts/ground-truth.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const GT = groundTruth();

const WORDS = [
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
  "eighteen", "nineteen", "twenty",
];
const toNumber = (raw) => (/^\d+$/.test(raw) ? Number(raw) : WORDS.indexOf(raw.toLowerCase()) + 1);

/**
 * "<n> gates" and "<n>-gate" — the two shapes `doc-counts.test.mjs` treats as a
 * count. Space + SINGULAR is deliberately excluded there and here: "Stage 0
 * gate" and "the Rule 0 gate" count nothing.
 */
function gateCounts(text) {
  const n = `\\d+|${WORDS.join("|")}`;
  return [
    ...text.matchAll(new RegExp(`\\b(${n}) gates\\b`, "gi")),
    ...text.matchAll(new RegExp(`\\b(${n})-(?:gates?)\\b`, "gi")),
  ]
    .map((m) => ({ raw: m[1], value: toNumber(m[1]), text: m[0] }))
    .filter((c) => Number.isFinite(c.value));
}

/** The documents `docs/DOCUMENTATION.md` itself marks `living`. */
function livingDocs() {
  const out = [];
  for (const row of read("docs/DOCUMENTATION.md").split("\n")) {
    if (!row.startsWith("|")) continue;
    const cells = row.split("|").map((c) => c.trim());
    if (cells[cells.length - 2] !== "living") continue;
    const href = cells[1].match(/\]\(([^)]+)\)/);
    if (!href) continue;
    const rel = path.normalize(path.join("docs", href[1]));
    if (rel.startsWith("..") || !fs.existsSync(path.join(ROOT, rel))) continue;
    out.push(rel);
  }
  return [...new Set(out)].sort();
}

test("a document the doc map calls living states a verify-lane gate count that names no profile", () => {
  const docs = livingDocs();

  // NON-VACUITY. An empty derived list passes everything, and this one is
  // parsed out of a markdown table — one column added and the walk finds
  // nothing while going green. `docs/USAGE.md` is the fixed point: the doc map
  // calls it "**The deep reference**", so if it is not in the living rows the
  // walk is broken rather than the tree clean.
  assert.ok(
    docs.includes("docs/USAGE.md"),
    `the doc map's living rows derived [${docs.join(", ")}] and missed docs/USAGE.md — this test is reading nothing.`,
  );

  const profiles = Object.keys(GT.verifyProfiles);
  const offenders = [];
  for (const rel of docs) {
    const text = read(rel);
    for (const c of gateCounts(text)) {
      const line = text.slice(0, text.indexOf(c.text)).split("\n").length;
      // A size bound to a profile is a fact, and `doc-counts.test.mjs`'s
      // `laneSizeClaims` already checks that form against the deriver.
      if (profiles.some((p) => new RegExp(`\`${p}\`[^\\n]{0,60}${c.text}|${c.text}[^\\n]{0,60}\`${p}\``).test(text))) continue;
      offenders.push(`${rel}:${line} says "${c.text}"`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `a living document states a verify-lane gate count naming no profile, and docs/USAGE.md §3 says such a ` +
      `number does not exist — the lane runs ${Object.entries(GT.verifyProfiles)
        .map(([n, p]) => `${n}=${p.count}`)
        .join(", ")}. ${offenders.join("; ")}. ` +
      `test/doc-counts.test.mjs does not read this file, and adding it would not help: its \`gates\` noun ` +
      `allows every derived profile size, so a stale 8 is laundered by \`smoke\`. Name the profile or drop the number.`,
  );
});
