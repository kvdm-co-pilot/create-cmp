// THE PUBLISHED README DESCRIBES THE FILE `harness init` WRITES. IT MUST
// DESCRIBE THE ONE IT WRITES NOW.
//
// packages/harness/README.md is not a design note. It is the `prooflane-harness`
// package's own front page — it ships in `files`, it is what npm renders, and
// it is the text an adopter reads BEFORE running the command, which is the one
// moment they cannot check it against anything. It makes exactly one structural
// claim about the generated profile: which exports come out live and which come
// out as commented blocks. The README's own argument for making that claim is
// that "the generated profile is the specification" — prose about the protocol
// drifts from the loader silently.
//
// So does prose about the skeleton. On 2026-09-11 the ladder interview gave
// `harness init` a SECOND output shape: answer its questions and `export const
// ladder` is written LIVE rather than commented. The command's non-interactive
// path still writes the commented one, and so does every test in this suite that
// drives the CLI — `node --test` has no TTY — so the shape an actual human at a
// terminal receives is the shape nothing here had looked at. The README went on
// describing the other one.
//
// THE INVARIANT is over the pair, and it takes no side: whatever the README says
// is commented must be commented in EVERY profile the skeleton can write, for
// every answer the menu accepts. Deleting or rewriting the sentence is as valid
// a fix as changing the code — this test does not know which of the two is
// right, and must not, because that is the author's call and not a reviewer's.
//
// THE CLASS, NOT THE INSTANCE. The names are read out of the README sentence and
// the profiles out of the contract's menu, so this is not "`ladder` must be
// commented": it is "a published promise about the seeded file is checked
// against the seeded file", and it covers the next export the README describes
// and the next answer that changes one.
//
// SCOPE: README.md files only, and only the paragraphs that make the claim. A
// proposal or an ADR may describe what was true when it was signed — that is
// what a record is for — while a README describes the command as it is today.
// (The same line test/cited-decision-that-does-not-exist.test.mjs draws between
// source and planning prose, for the same reason.)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { profileSkeleton } from "../packages/harness/install/init.mjs";
import { CONTRACT, MENU_FIELDS } from "../packages/harness/src/lib/profile-contract.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MENU = MENU_FIELDS.filter((p) => p.startsWith("ladder.")).map((p) => p.slice("ladder.".length));

/** Every `answers` map over the menu: each field skipped, or answered with each option it offers. */
function everyAnswerMap() {
  let maps = [{}];
  for (const field of MENU) {
    const next = [];
    for (const base of maps) {
      next.push(base);
      for (const option of CONTRACT.ladder.fields[field].options) next.push({ ...base, [field]: option });
    }
    maps = next;
  }
  return maps;
}

/**
 * Every backticked identifier a README promises is "present as a commented
 * block", with the file and line it was promised on.
 *
 * THE CLAUSE, NOT THE PARAGRAPH, and that boundary is load-bearing rather than
 * fussy: one of the two honest fixes is to write down that `ladder` now comes
 * out live, and a reader who does that will naturally do it in the same
 * paragraph — often the same sentence, after a semicolon. A scan that read the
 * paragraph would go on failing at the correction, which is a test dictating
 * prose layout. So the subject of the promise is taken to be the backticked
 * names between the last sentence boundary and the phrase itself, and nothing
 * said after it.
 */
function commentedBlockClaims() {
  const rels = execFileSync("git", ["ls-files", "*README.md"], { cwd: REPO_ROOT, encoding: "utf8" }).trim().split("\n").filter(Boolean);
  const claims = [];
  for (const rel of rels) {
    const raw = fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
    for (const phrase of raw.matchAll(/commented blocks?/gi)) {
      const before = raw.slice(0, phrase.index ?? 0);
      const start = Math.max(before.lastIndexOf("\n\n"), ...[...before.matchAll(/[.;:]\s/g)].map((m) => (m.index ?? 0) + m[0].length));
      const clause = before.slice(Math.max(start, 0));
      for (const m of clause.matchAll(/`([A-Za-z_$][\w$]*)`/g)) {
        claims.push({ rel, line: before.slice(0, Math.max(start, 0) + (m.index ?? 0)).split("\n").length, name: m[1] });
      }
    }
  }
  return claims;
}

/** The lines on which `export const <name>` / `export function <name>` stands LIVE, not commented. */
function liveDeclarations(source, name) {
  const out = [];
  source.split("\n").forEach((line, i) => {
    if (!new RegExp(`export\\s+(?:const|function)\\s+${name}\\b`).test(line)) return;
    if (/^\s*\/\//.test(line)) return;
    out.push({ line: i + 1, text: line.trim() });
  });
  return out;
}

test("every export the published README promises as a commented block is commented in every profile init can write", () => {
  const claims = commentedBlockClaims();
  // No promise, nothing to check: deleting the sentence is one of the two
  // honest fixes, and this test must not punish it.
  if (!claims.length) return;

  const maps = everyAnswerMap();
  const skeletons = maps.map((answers) => ({ answers, src: profileSkeleton("probe", { sourceRoots: ["src"], tiers: ["unit"], lang: "Python", answers }) }));
  assert.ok(
    new Set(skeletons.map((s) => s.src)).size > 1,
    `generated ${skeletons.length} profiles and they are all the same bytes — the interview no longer reaches the skeleton, so this test is checking one shape and calling it every shape`,
  );

  const broken = [];
  const unmentioned = [];
  for (const claim of claims) {
    if (!skeletons.some((s) => s.src.includes(claim.name))) {
      unmentioned.push(claim);
      continue;
    }
    for (const { answers, src } of skeletons) {
      for (const live of liveDeclarations(src, claim.name)) broken.push({ claim, answers, live });
    }
  }

  assert.deepEqual(
    unmentioned.map((c) => `${c.rel}:${c.line} \`${c.name}\``),
    [],
    unmentioned.map((c) => `  ${c.rel}:${c.line} promises \`${c.name}\` as a commented block, and no profile the skeleton writes mentions that name at all.`).join("\n"),
  );

  assert.deepEqual(
    [...new Set(broken.map((b) => `${b.claim.rel}:${b.claim.line} \`${b.claim.name}\``))],
    [],
    // One example per promised name is the whole finding; the other answer maps
    // are the same sentence again with different keystrokes in front of it.
    [...new Map(broken.map((b) => [b.claim.name, b])).values()]
      .map(
        (b) =>
          `\n  ${b.claim.rel}:${b.claim.line} tells an adopter that \`${b.claim.name}\` comes out of \`harness init\` as a\n` +
          `  commented block. Answer the ladder menu ${JSON.stringify(b.answers)}\n` +
          `  and line ${b.live.line} of the profile it writes is live code:\n` +
          `      ${b.live.text}`,
      )
      .join("\n") +
      "\n\n  This is the package's own front page, read before the command is run and therefore before it can be " +
      "checked against anything — and its stated reason for describing the skeleton at all is that prose about the " +
      "generated file drifts from the generated file silently. Either the sentence moves with the code, or the code " +
      "stops writing a shape the sentence does not cover. This test does not know which; it knows they disagree.",
  );
});
