// AN INSTRUCTION THE TREE IT SHIPS INTO CANNOT CARRY OUT.
//
// `template/qa/lib/profile-contract.mjs` told the author of a profile: "Run it
// with `node scripts/fleet-check.mjs --ladder-plant`." The template ships no
// `scripts/` directory — `fleet-check.mjs` lives in create-cmp and is not
// vendored — so every stamped app carried a line whose only possible outcome
// for the person it addresses is `Cannot find module` (KD-31). The contract's
// own header names "the author", a person writing a profile in their own tree,
// as one of its three readers, and that was the one instruction it gave them.
//
// THE CLASS, NOT THE INSTANCE. Every file under `template/` is copied into an
// adopter's repository, so every `node <path>` in one is a promise that `<path>`
// is there. This scans them all and refuses a path the template does not ship —
// unless the SENTENCE the instruction is in says it lives in the create-cmp
// repo, which is the honest form: `harness-lock.mjs` already wrote
// "create-cmp repo — edit there, then run `node scripts/sync-harness.mjs`".
//
// WHY THE SENTENCE AND NOT THE PARAGRAPH. Measured on this tree 2026-09-22,
// before the fix: sixteen instructions name a path the template does not ship,
// and a rule that accepted "create-cmp repo" anywhere in the surrounding
// comment block would have refused ONE of them — KD-31's own line — and
// exempted the other fifteen on the strength of a mention in the sentence
// before. That is not a cheaper version of this rule, it is a different rule:
// the fifteen sit in SINGLE SOURCE OF TRUTH headers, which are exactly where
// the next instruction of this kind will be written, and the next one will not
// come with a sentence above it. A reader who greps one line must be able to
// see from that line where it runs.
//
// A SHEBANG IS NOT AN INSTRUCTION. `#!/usr/bin/env node` followed by a comment
// naming the file it heads reads as "node <that file>" once the comment block
// is joined into prose; six of them do. The line is a kernel directive, not
// something a reader is told to type, so it is skipped by line and not by
// exception.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Comment markers, stripped so a comment block reads as the prose it is. */
const MARKER = /^\s*(\/\/|#|\*\s|\*$|\/\*|<!--)\s?/;

/**
 * `node <path>`, with any flags between — the shape of a thing a reader types.
 * Paths carrying `${` are template literals whose value this cannot know, so
 * they are not judged at all rather than judged wrongly.
 */
const INSTRUCTION = /\bnode\s+((?:-{1,2}[A-Za-z][\w-]*(?:=\S+)?\s+)*)([\w./@-]+\.(?:mjs|cjs|js))\b/g;

/**
 * A file as prose blocks: consecutive lines of the same kind (comment or code),
 * broken by blank lines and by shebangs. Joining is what makes "the sentence"
 * meaningful — these instructions wrap across two and three comment lines, and
 * a line-at-a-time scan would read a sentence's second half as a whole one.
 */
function blocks(text) {
  const out = [];
  let cur = null;
  for (const raw of text.split("\n")) {
    if (raw.startsWith("#!")) {
      cur = null;
      continue;
    }
    const isComment = MARKER.test(raw);
    const stripped = raw.replace(MARKER, "").replace(/-->\s*$/, "").trim();
    if (!stripped) {
      cur = null;
      continue;
    }
    const kind = isComment ? "comment" : "code";
    if (!cur || cur.kind !== kind) {
      cur = { kind, text: "" };
      out.push(cur);
    }
    cur.text += (cur.text ? " " : "") + stripped;
  }
  return out;
}

/** The sentence around [i, j) — `.`, `!` or `?` followed by space, or an end. */
function sentenceAround(text, i, j) {
  const before = [...text.slice(0, i).matchAll(/[.!?](?=\s)/g)].pop();
  const after = text.slice(j).match(/[.!?](?=\s|$)/);
  return text.slice(before ? before.index + 1 : 0, j + (after ? after.index + 1 : text.length - j)).trim();
}

/** Every `node <path>` in one file's text, with the sentence it stands in. */
function instructionsIn(text) {
  const found = [];
  for (const block of blocks(text)) {
    for (const m of block.text.matchAll(INSTRUCTION)) {
      const target = m[2].replace(/^\.\//, "");
      if (target.includes("${")) continue;
      found.push({ target, sentence: sentenceAround(block.text, m.index, m.index + m[0].length) });
    }
  }
  return found;
}

/** The exemption, and the only one: the sentence says where the script lives. */
const saysWhereItLives = (sentence) => /create-cmp repo(sitory)?\b/i.test(sentence);

/** What a stamped app gets: every tracked file under template/, at its app path. */
function shippedPaths() {
  return new Set(
    execFileSync("git", ["ls-files", "template"], { cwd: ROOT, encoding: "utf8" })
      .split("\n")
      .filter(Boolean)
      .map((rel) => rel.slice("template/".length)),
  );
}

test("the scan reads an instruction the way a reader does, and a shebang as no instruction", () => {
  // The positive controls, in text rather than in the tree: a test that only
  // ever saw a clean template would pass the day the scan stopped working.
  const [wrapped] = instructionsIn(
    ["// SINGLE SOURCE OF TRUTH: packages/harness/src/lib/x.mjs in the", "// create-cmp repo. Vendored into qa/lib/ — edit the package", "// source, then run `node scripts/sync-harness.mjs`."].join("\n"),
  );
  assert.equal(wrapped.target, "scripts/sync-harness.mjs", "an instruction wrapped over three comment lines is one instruction");
  assert.equal(
    saysWhereItLives(wrapped.sentence),
    false,
    `the sentence is "${wrapped.sentence}" — the repo is named in the one before it, which is the reading this rule does not take`,
  );

  const [same] = instructionsIn("// create-cmp repo — edit there, then run `node scripts/sync-harness.mjs`.");
  assert.equal(saysWhereItLives(same.sentence), true, "a sentence that says where the script lives is the exempt form");

  assert.deepEqual(
    instructionsIn("#!/usr/bin/env node\n// walk-status.mjs — where every open change stands.").map((f) => f.target),
    [],
    "a shebang and the comment under it are not an instruction to run that file",
  );

  assert.deepEqual(
    instructionsIn("// Run `node qa/verify.mjs --profile local` when the change is done.").map((f) => f.target),
    ["qa/verify.mjs"],
    "flags between the command and its path do not hide the path",
  );
});

test("no file the template ships tells its reader to run a script the template has not got", () => {
  const shipped = shippedPaths();
  assert.ok(shipped.size > 100, `only ${shipped.size} files tracked under template/ — the scan found no template to read`);

  const offences = [];
  let instructions = 0;
  let exempt = 0;
  for (const rel of shipped) {
    const buf = fs.readFileSync(path.join(ROOT, "template", rel));
    if (buf.includes(0)) continue; // binary
    for (const found of instructionsIn(buf.toString("utf8"))) {
      instructions++;
      if (shipped.has(found.target)) continue;
      if (saysWhereItLives(found.sentence)) {
        exempt++;
        continue;
      }
      offences.push(`template/${rel}: \`node ${found.target}\` — "${found.sentence}"`);
    }
  }

  // Both counters guard a scan that quietly stopped reading: the first that it
  // read instructions at all, the second that the exemption is a live path and
  // not a clause nothing takes.
  assert.ok(instructions > 50, `only ${instructions} \`node <path>\` instructions found under template/ — the scan is broken, not the tree`);
  assert.ok(exempt > 0, "no instruction in the template names a script in the create-cmp repo — the exemption is untested here");

  assert.deepEqual(
    offences,
    [],
    `each line is a command a stamped app is told to run and cannot — the path is not in the tree it ships into, ` +
      `and the sentence does not say it lives in the create-cmp repo:\n  ${offences.join("\n  ")}`,
  );
});
