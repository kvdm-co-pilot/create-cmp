// The shareable snapshot — one file, no server (LIVE-CONSOLE.md D3a).
//
// What "shareable" has to mean, or the file is worse than nothing:
//
//   1. STANDALONE. It opens from a file:// URL on a machine with no network.
//      No script, no image, no stylesheet link, no font URL, no badge from
//      shields.io — anything fetched would leak WHO OPENED IT and would render
//      broken in the one place this file is most likely to be read.
//   2. A RUNG NEVER APPEARS WITHOUT ITS PACK. This surface travels further than
//      any other the lane writes, so it is the one where a bare `L2` does the
//      most damage (§6.5, §8.9).
//   3. IT REWORDS NOTHING. The failing step's own reason, verbatim; SKIP muted
//      rather than green or red.
//   4. IT IS OPT-IN. D3b — write it every run — was rejected as churn, so the
//      lane must not produce it unasked. Asserted by RUNNING the lane both
//      ways, because that is a claim about a file on disk.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { SNAPSHOT_REL, snapshotHtml } from "../packages/harness/src/lib/evidence-html.mjs";
import { buildFrameworkRecord } from "../packages/harness/src/lib/framework-record.mjs";
import { CMP_LADDER } from "../packages/harness/src/lib/profiles/cmp/ladder.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const receipt = (over = {}) => ({
  schema: "prooflane-evidence/1",
  profile: "ci",
  verdict: "PASS",
  mode: "full",
  commit: { sha: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678", dirty: [] },
  inputs: { hash: "deadbeef".repeat(8), fileCount: 615 },
  steps: [
    { name: "harnessIntegrity", verdict: "PASS", durationMs: 10 },
    { name: "approvals", verdict: "SKIP", durationMs: 18, reason: "awaiting human approval (non-blocking)" },
    { name: "build", verdict: "PASS", durationMs: 52_000 },
  ],
  evidenceLevel: { rung: "L2", name: "device", satisfiedBy: ["build", "e2eSmoke"] },
  pack: { id: "cmp", version: null },
  generatedAt: "2026-09-09T12:00:00.000Z",
  ...over,
});

// Everything a browser would go and FETCH. `url(` catches a CSS background,
// `@import` a stylesheet, and the bare protocol catches every href.
const EXTERNAL = [/https?:\/\//i, /<script/i, /<img/i, /<link/i, /<iframe/i, /\ssrc\s*=/i, /url\(/i, /@import/i];

test("the snapshot is one self-contained file: no script, no fetch, no external anything", () => {
  const html = snapshotHtml({ receipt: receipt(), ladder: CMP_LADDER });
  for (const probe of EXTERNAL) {
    assert.equal(probe.test(html), false, `the snapshot must fetch nothing — found ${probe} in it`);
  }
  assert.match(html, /^<!doctype html>/i, "a whole document, not a fragment");
  assert.match(html, /<style>/, "its CSS is inline, because a stylesheet is a fetch");
  assert.match(html, /<\/html>/);
});

/** The strip — the one block that states the rung this run EARNED. */
const strip = (html) => html.slice(html.indexOf(`<div class="strip`), html.indexOf("</div>", html.indexOf(`<div class="strip`)));
/** The ladder row — the one block that draws rungs without stating a grade. */
const ladderRow = (html) => html.slice(html.indexOf("<h2>Ladder"), html.indexOf("<footer"));

test("the rung travels with its pack, and a receipt that names no pack says so", () => {
  assert.match(strip(snapshotHtml({ receipt: receipt(), ladder: CMP_LADDER })), /L2 device · pack cmp/);
  const noPack = snapshotHtml({ receipt: receipt({ pack: null }), ladder: CMP_LADDER });
  assert.match(strip(noPack), /L2 device · pack unnamed/, "never a bare rung — an unattributed one is comparable to nothing");
  assert.equal(/L2 device(?! · pack)/.test(strip(noPack)), false);
  // The ladder row draws RUNGS, so it is a surface that shows one and carries
  // the pack itself rather than leaning on the strip — which on a run that
  // earned nothing has no pack clause to lend.
  assert.match(ladderRow(noPack), /pack unnamed/);
  assert.match(ladderRow(snapshotHtml({ receipt: receipt({ verdict: "FAIL", evidenceLevel: null }), ladder: CMP_LADDER })), /pack cmp/);

  // The three honest absences all render as NO rung, never a weaker one.
  for (const [why, over] of [
    ["a FAILed lane", { verdict: "FAIL", evidenceLevel: null }],
    ["a fast run", { mode: "fast", evidenceLevel: null }],
    ["a receipt predating the ladder", { evidenceLevel: undefined }],
  ]) {
    const html = snapshotHtml({ receipt: receipt(over), ladder: CMP_LADDER });
    assert.match(html, /no rung/, `${why} renders as no rung`);
    assert.equal(/L\d [a-z]+ · pack/.test(html), false, `${why} must not borrow a rung`);
  }
});

test("it rewords nothing: the failing step's own reason, verbatim — and SKIP is not dressed as either", () => {
  const html = snapshotHtml({
    receipt: receipt({
      verdict: "FAIL",
      evidenceLevel: null,
      steps: [
        { name: "build", verdict: "FAIL", durationMs: 41_000, reason: "error: unresolved reference `Foo` (src/Bar.kt:12)\nfix: import it" },
        { name: "approvals", verdict: "SKIP", durationMs: 3, reason: "awaiting human approval (non-blocking)" },
      ],
    }),
    ladder: CMP_LADDER,
  });
  assert.match(html, /error: unresolved reference `Foo` \(src\/Bar\.kt:12\)/);
  assert.match(html, /fix: import it/, "the tool's own fix, not a rewritten one");
  assert.match(html, /<pre class="reason">/, "verbatim, in a block that preserves its newlines");
  // The SKIP's words appear, but not in the red block and not in green.
  assert.match(html, /awaiting human approval/);
  assert.equal(/<pre class="reason">[^<]*awaiting human/.test(html), false, "a SKIP explaining itself is not a failure");
  assert.match(html, /class="v-skip">SKIP/, "SKIP is muted — never green (§7)");
});

test("a receipt carrying markup cannot become markup", () => {
  const html = snapshotHtml({
    receipt: receipt({ verdict: "FAIL", evidenceLevel: null, steps: [{ name: "<script>alert(1)</script>", verdict: "FAIL", reason: "<img onerror=x>", durationMs: 1 }] }),
    ladder: CMP_LADDER,
  });
  for (const probe of EXTERNAL) assert.equal(probe.test(html), false, `escaped output must still fetch nothing — ${probe}`);
  assert.match(html, /&lt;script&gt;/);
});

test("it is a statement about a COMMIT at an INSTANT — never about 'now'", () => {
  const html = snapshotHtml({ receipt: receipt({ commit: { sha: "abcdef1234567890", dirty: ["src/x.kt"] } }), ladder: CMP_LADDER });
  assert.match(html, /abcdef1/, "the commit it is about");
  assert.match(html, /2026-09-09T12:00:00\.000Z/, "and the instant it was written");
  assert.equal(/\bago\b/.test(html), false, "a relative age would stop being true the moment the file is opened tomorrow");
  assert.match(html, /1 uncommitted file at attestation/, "and it says when the run is not the commit");
});

test("the two derived rows are the CONSOLE'S derivations, not a second reading of the same artifacts", () => {
  const withRecord = snapshotHtml({
    receipt: receipt(),
    ladder: CMP_LADDER,
    frameworkRecord: {
      ok: true,
      relPath: "qa/evidence/framework-check.json",
      record: buildFrameworkRecord({
        verdict: "PASS",
        plants: [{ kind: "k", label: "orphaned citation", step: "specCoverage", observed: "specCoverage", names: ["HOME-01"], failedByName: true, durationMs: 4 }],
        treeIdentical: true,
        generatedAt: "2026-09-09T10:00:00.000Z",
      }),
    },
  });
  // trustLine's own sentence, unchanged — the same one the console renders.
  assert.match(withRecord, /Rule 0 — 1 plant failed by name · tree byte-identical/);
  // ladderStanding's own answer: told L2 by the receipt, naming L3's step.
  assert.match(withRecord, /L3 needs <code>releaseSmoke<\/code>/);

  const noRecord = snapshotHtml({ receipt: receipt(), ladder: CMP_LADDER, frameworkRecord: null });
  assert.match(noRecord, /no Rule 0 record/);
  assert.match(noRecord, /node qa\/framework-check\.mjs --record/, "the absence names the command that ends it");
});

// ── The lane, run both ways ─────────────────────────────────────────────────

/** A minimal adopted tree with a working lane — step-artifact.test.mjs's seed. */
function seedProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-html-"));
  const git = (...a) => execFileSync("git", ["-C", dir, ...a], { stdio: "ignore" });
  git("init", "-q");
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src", "main.py"), "def add(a, b):\n    return a + b\n");
  execFileSync(process.execPath, [path.join(ROOT, "packages/harness/bin/prooflane.mjs"), "init"], { cwd: dir, stdio: "ignore" });
  git("add", "-A");
  execFileSync("git", ["-C", dir, "-c", "user.email=x@y", "-c", "user.name=x", "commit", "-qm", "init"], { stdio: "ignore" });
  return dir;
}

test("--html writes the file and a plain run does not — opt-in is the whole of D3a", () => {
  const dir = seedProject();
  const snapshot = path.join(dir, ...SNAPSHOT_REL.split("/"));
  try {
    const plain = spawnSync(process.execPath, [path.join(dir, "qa", "verify.mjs")], { cwd: dir, encoding: "utf8", timeout: 120_000 });
    assert.equal(plain.status, 0, `${plain.stdout}${plain.stderr}`);
    assert.equal(fs.existsSync(snapshot), false, "the lane writes no snapshot unless it is asked (D3b was rejected as churn)");

    const asked = spawnSync(process.execPath, [path.join(dir, "qa", "verify.mjs"), "--html"], { cwd: dir, encoding: "utf8", timeout: 120_000 });
    assert.equal(asked.status, 0, `${asked.stdout}${asked.stderr}`);
    assert.match(asked.stdout, /snapshot written to qa\/evidence\/latest\.html/, "and it NAMES the file — one written silently is one nobody attaches");
    const html = fs.readFileSync(snapshot, "utf8");
    for (const probe of EXTERNAL) assert.equal(probe.test(html), false, `a real run's snapshot must fetch nothing — ${probe}`);
    assert.match(html, /verify PASS/);
    assert.match(html, /harnessIntegrity/, "the run's own steps");

    // A fast run gets its own file, for the reason it gets its own receipt: a
    // fast result must never overwrite the checkpoint's.
    const fast = spawnSync(process.execPath, [path.join(dir, "qa", "verify.mjs"), "--fast", "--html"], { cwd: dir, encoding: "utf8", timeout: 120_000 });
    assert.equal(fast.status, 0, `${fast.stdout}${fast.stderr}`);
    assert.equal(fs.existsSync(path.join(dir, "qa", "evidence", "latest-fast.html")), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
