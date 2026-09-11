// THE INTERVIEW ASKS THE CONTRACT'S QUESTIONS, AND RECORDS ONLY WHAT A HUMAN
// ANSWERED.
//
// Two defects are in scope here, and they pull in opposite directions.
//
// THE FIRST is an interview that answers for you. `install/interview.mjs`
// returns nothing at all when it is not interactive, and the temptation to
// "fix" that by falling back to the contract's recommended `default` is
// permanent — it looks like a missing else-branch and it makes every CI install
// produce a fuller-looking profile. It would also destroy the only distinction
// `ladder.intent` exists to create: an absent intent means NOBODY WAS ASKED, an
// answer equal to `declinesRung` means ASKED, AND THERE IS NO SUCH RUNG HERE,
// and a default written on a human's behalf is the second one asserted by a
// program that has no idea. Test 1 is that gate, and it names the value that
// must not appear rather than merely counting keys.
//
// THE SECOND is an interview that holds a copy of the menu. Every question,
// option, recommendation and explanation lives in profile-contract.mjs, which
// exists — by its own header — so that help text and validator are one artifact
// and neither can drift. A menu re-typed into the asker is a menu that will one
// day offer an option the loader refuses, and the author who picks it is
// refused by the product that just recommended it. So the last test reads
// interview.mjs's own source and asserts none of those strings is in it.
//
// EVERY ASSERTION HERE IS AGAINST `CONTRACT`, never against a copied string —
// for exactly the reason the file under test may not copy one.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";

import { askLadderMenu } from "../packages/harness/install/interview.mjs";
import { CONTRACT, MENU_FIELDS, contractAt } from "../packages/harness/src/lib/profile-contract.mjs";
import { profileSkeleton } from "../packages/harness/install/init.mjs";
import { validateProfileModule } from "../packages/harness/src/lib/profile-loader.mjs";
import { evidenceLadderFor } from "../packages/harness/src/lib/evidence-ladder.mjs";
import { readLadder } from "../packages/harness/src/lib/evidence-level.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INTERVIEW_SRC = path.resolve(HERE, "..", "packages", "harness", "install", "interview.mjs");

/** The two fields the contract offers a menu for, in the order the rungs climb. */
const L2 = contractAt("ladder.l2Execution");
const L3 = contractAt("ladder.l3Execution");

/**
 * A scripted session: lines in, everything the interview printed out.
 *
 * REAL STREAMS, AND ONE LINE PER PROMPT. Both halves were learned by measuring
 * rather than assumed, and the second cost this file a rewrite.
 *
 * `Readable.from(["1\n", "2\n"])` delivers every line at once, and readline
 * captures a line only while a question is actually pending — so the second line
 * was silently dropped and the run then ended mid-interview. That is not the
 * product's behaviour, it is the harness's: a human at a terminal types the next
 * line after seeing the next prompt, and a PIPED stdin never gets here at all
 * (install/init.mjs treats a non-TTY as non-interactive). So this driver answers
 * prompt by prompt.
 *
 * A PROMPT IS THE ONE THING WRITTEN WITHOUT A TRAILING NEWLINE — the cursor has
 * to stay on the line to be typed at — which is why the driver can recognise one
 * without knowing a word of what it says. When the script runs out, the input
 * ENDS rather than hanging: that is what a real session cut short looks like,
 * and a test that instead waited forever would be a test that times out with no
 * message.
 */
function session(lines) {
  const input = new PassThrough();
  const queue = [...lines];
  let out = "";
  const output = new Writable({
    write(chunk, _enc, cb) {
      const text = String(chunk);
      out += text;
      if (!text.endsWith("\n")) {
        setImmediate(() => (queue.length ? input.write(`${queue.shift()}\n`) : input.end()));
      }
      cb();
    },
  });
  return { input, output, read: () => out };
}

/** One interview, driven by `lines`. */
async function interview(lines, current = {}) {
  const s = session(lines);
  const result = await askLadderMenu({ input: s.input, output: s.output, interactive: true, current });
  return { ...result, out: s.read() };
}

/** The 1-based menu position of an option, as the author would type it. */
function choice(spec, option) {
  return String(spec.options.indexOf(option) + 1);
}

test("with nobody there to answer, the interview records NOTHING — not even the recommended answer", async () => {
  const s = session([]);
  const result = await askLadderMenu({ input: s.input, output: s.output, interactive: false });

  assert.equal(result.asked, false, "no human was asked, and the result has to say so");
  assert.deepEqual(result.answers, {}, "a non-interactive install recorded an answer nobody gave");
  assert.equal(
    result.answers.l2Execution,
    undefined,
    `the interview fell back to ${JSON.stringify(L2.default)} with no human present. That is the contract's ` +
      "RECOMMENDATION, not an answer: writing it here is an agent's guess wearing a human's answer, and it " +
      "erases the one distinction ladder.intent exists to create — an absent intent means nobody was asked, " +
      `while an answer equal to ${JSON.stringify(L2.declinesRung)} means asked, and there is no such rung here. ` +
      "Those are opposite claims about the same project.",
  );
  assert.ok(result.why.length > 0, "an empty result has to carry the reason it is empty, or the caller cannot report it");
  assert.equal(s.read(), "", "nothing was asked, so nothing should have been printed at a human");
});

test("a number picks that option, verbatim, in the contract's own words", async () => {
  const r = await interview([choice(L2, L2.options[1]), "s"]);

  assert.equal(
    r.answers.l2Execution,
    L2.options[1],
    "the recorded answer must be the option string the contract offers, byte for byte. NOT because anything " +
      "validates it later — the answer is SPENT at init, deciding what gets seeded, and is never stored, so " +
      "there is nothing at load to match it against. It matters because `init` branches on the string, and a " +
      "paraphrase would take the wrong branch in silence.",
  );
  assert.equal(r.asked, true);
});

test("enter takes the contract's recommendation, and nothing else does", async () => {
  const r = await interview(["", "s"]);

  assert.equal(
    r.answers.l2Execution,
    L2.default,
    "an empty line is the author accepting the recommendation the menu marked; it must resolve to the " +
      "contract's own `default` rather than to whichever option happens to be first",
  );
});

test("`?` prints the contract's own explanation, not a second one written here", async () => {
  const r = await interview(["?", "s", "s"]);

  assert.ok(
    r.out.includes(L2.meaning),
    "asking what a field means must print the contract's `meaning` verbatim — it is the same text " +
      "`node qa/profile.mjs explain ladder.l2Execution` prints, and an interview that paraphrased it would be " +
      "a second description of one field that nothing keeps in step with the first.",
  );
  assert.deepEqual(r.answers, {}, "`?` is a question, not an answer — it must record nothing on its own");
});

test("answering that a rung does not exist here ends the interview, and says why", async () => {
  const r = await interview([choice(L2, L2.declinesRung)]);

  assert.equal(r.answers.l2Execution, L2.declinesRung, "the declining answer is recorded — it is an answer, not a refusal to answer");
  assert.ok(
    !("l3Execution" in r.answers),
    "the rungs are climbed in order, so a project with no L2 cannot be asked whether its L3 is built differently — " +
      "recording an answer to that question would be recording an answer to a question that cannot arise",
  );
  assert.ok(
    !r.out.includes(L3.question),
    `the interview asked ${JSON.stringify(L3.question)} after being told there is no rung beneath it`,
  );
  assert.ok(
    r.out.includes(L3.refusal),
    "a question dropped without a reason reads as a bug. The reason is already published on the field — " +
      `"${L3.refusal}" — and the loader speaks the same sentence, so the interview must quote it rather than invent one.`,
  );
});

test("an answer already on record is offered back, and enter keeps it", async () => {
  const held = L2.options[1];
  assert.notEqual(held, L2.default, "this test is only meaningful while the held answer differs from the recommendation");

  const r = await interview(["", "s"], { l2Execution: held });

  assert.equal(
    r.answers.l2Execution,
    held,
    "enter over an existing answer must KEEP it, not overwrite it with the recommendation. `prooflane upgrade` " +
      "asks about a ladder that is already declared, and an interview that silently replaced the author's answer " +
      "with the default would be the rewrite ADR-0008 promises never happens to a profile.",
  );
  assert.ok(r.out.includes(JSON.stringify(held)), "the answer on record must be visible before it is kept, or enter is a blind keystroke");
});

test("THE PROPERTY THE DESIGN RESTS ON: the interview holds no copy of the menu it renders", async () => {
  const src = fs.readFileSync(INTERVIEW_SRC, "utf8");
  const copied = [];
  for (const [field, spec] of Object.entries(CONTRACT.ladder.fields)) {
    const strings = [
      ["question", spec.question],
      ["meaning", spec.meaning],
      ["refusal", spec.refusal],
      ["default", spec.default],
      ["declinesRung", spec.declinesRung],
      ...(spec.options ?? []).map((o, i) => [`options[${i}]`, o]),
    ];
    for (const [what, value] of strings) {
      if (typeof value === "string" && value && src.includes(value)) copied.push(`ladder.${field}.${what}`);
    }
  }
  assert.deepEqual(
    copied,
    [],
    `install/interview.mjs spells out ${copied.join(", ")}. profile-contract.mjs exists so that the menu an author ` +
      "picks from and the menu the loader validates against are ONE artifact — a copy in the asker drifts the first " +
      "time the contract is edited, and the author who picks the stale option is refused by the product that just " +
      "offered it. Read it from CONTRACT at the moment of asking instead.",
  );
});

/**
 * The generated profile at the path it is written to, with its lane siblings
 * stubbed — the same shape test/harness-init.test.mjs builds, because the
 * skeleton imports `../../harness-lock.mjs` and can only be loaded from
 * qa/lib/profiles/<id>/.
 */
function skeletonTree(answers) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "interview-skeleton-"));
  const lib = path.join(dir, "qa", "lib");
  fs.mkdirSync(path.join(lib, "profiles", "probe"), { recursive: true });
  fs.writeFileSync(path.join(lib, "harness-lock.mjs"), "export const checkHarnessIntegrity = () => ({ status: 'unlocked' });\nexport const describeIntegrity = () => '';\n");
  fs.writeFileSync(path.join(lib, "spec-model.mjs"), "export const requireSpecModel = () => ({});\n");
  fs.writeFileSync(path.join(lib, "spec-coverage.mjs"), "export const scanSpecClauses = () => new Map();\nexport const scanCitations = () => [];\nexport const clauseTierCoverage = () => ({});\nexport const citationScanDiagnostic = () => null;\n");
  fs.writeFileSync(path.join(lib, "profiles", "probe", "index.mjs"), profileSkeleton("probe", { sourceRoots: ["src"], tiers: ["unit"], lang: "Python", answers }));
  return dir;
}
test("the profile an interview writes actually LOADS — validated, ladder resolved, in a real tree", async () => {
  // The one end-to-end assertion in this file: everything else checks what the
  // interview RETURNS. This checks what the interview CAUSES — the generated
  // module imported from the path it is written to, put through the same
  // validator and the same ladder resolver the lane uses. It was verified by
  // hand during review and not landed, which is how a check becomes a sentence.
  const r = await interview([choice(L2, L2.default), choice(L3, L3.default)]);
  // The contract publishes DOTTED paths ("ladder.l2Execution"); the interview
  // records by the bare field name, because that is the key the ladder itself
  // is written with. Both menu fields were asked, and both were answered.
  assert.deepEqual(
    [...Object.keys(r.answers)].sort(),
    MENU_FIELDS.map((f) => f.split(".").pop()).sort(),
    "every field the contract offers a menu for is a field the interview records",
  );

  const dir = skeletonTree(r.answers);
  try {
    const mod = await import(pathToFileURL(path.join(dir, "qa", "lib", "profiles", "probe", "index.mjs")).href);
    assert.deepEqual(validateProfileModule(mod, "probe"), { ok: true }, "the skeleton an interview writes must satisfy the loader that reads it");

    const resolved = evidenceLadderFor(mod, null);
    assert.equal(resolved.ok, true, `the generated ladder is refused by the resolver: ${resolved.reason}`);

    // The two step fields are not a guess: they are the steps this same command
    // wrote into that same pack, which is the property that makes a LIVE ladder
    // honest rather than aspirational.
    const L = readLadder(resolved.ladder);
    for (const field of ["l0Required", "l1Required"]) {
      assert.ok(L[field].length > 0, `a live ladder declares ${field}, or it earns no rung at all`);
      for (const step of L[field]) assert.equal(typeof step, "string", `${field} names a step that is not a string`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("skipping every question records nothing, and leaves a profile byte-identical to an uninterviewed one", async () => {
  const r = await interview(["s", "s"]);

  assert.equal(r.asked, true, "a human WAS asked — the command has to be able to say so even though the file cannot");
  assert.deepEqual(r.answers, {}, "a skipped question is not an answer");

  const opts = { sourceRoots: ["src"], tiers: ["unit"], lang: "Python" };
  assert.equal(
    profileSkeleton("probe", { ...opts, answers: r.answers }),
    profileSkeleton("probe", opts),
    "with no answers there is nothing to record, so the profile must be exactly the one an uninterviewed install " +
      "writes. An empty `answers: {}` carries nothing any reader can act on, and a live ladder block wrapped around " +
      "it would tell the next reader a human decided something. The COMMAND still reports that it asked — that " +
      "honesty belongs at the surface where the person is standing, not in a file that outlives the session.",
  );
});
