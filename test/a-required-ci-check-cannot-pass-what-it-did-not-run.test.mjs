// The stamped CI's pre-merge check is a REQUIRED status check (qa/ruleset.json
// requires `android`), and GitHub reads two things as "passed": a job that
// succeeded, and a job that was SKIPPED. So a required check is only as honest
// as every path by which it can end green without having run what it claims.
//
// Invariants, each for the class and not the one field that broke it:
//   1. A required job is never skipped by a FAILED dependency. A job with
//      `needs:` and no status function in its `if:` gets an implicit
//      `success() &&` — so when the job it needs fails, it is skipped, and the
//      ruleset accepts the skip. The scope job is a Node process reading a
//      JSON file: when it crashes, the feature check must not read as passed.
//   2. The lane the required check runs never PASSes over a step that COULD
//      have run and did not (`skipKind: "environment"`). The feature profile
//      exists to drive the feature's flow on a device; a missing Maestro or an
//      offline device is the same SKIP the done-evidence refusal names, and
//      it must not exit 0 into a required check.
//   3. Every file the committed receipt hashes (qa/verified-surface.json) is
//      receipt-checked before it merges. CI, the pre-push hook and CLAUDE.md
//      all say "CI still enforces" the receipt check; a change the scope calls
//      docs-only must not be a change that skips it, when it moves the hash.
//   4. Shipped prose about WHEN CI runs and WHAT it runs is derived from the
//      workflow it describes: no push trigger, no "CI … on push"; no
//      pull-request job running a non-feature profile, no "CI re-runs the
//      full/same lane".
//
// Found by review round 1 of the feature-scoped CI slice, 2026-11-14.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stripFeatureBlocks } from "../src/lib/toggle.mjs";
import { deriveFeatureScope } from "../template/qa/lib/affected-tests.mjs";
import { affected as cmpAffected } from "../template/qa/lib/profiles/cmp/affected.mjs";
import { computeInputsHash } from "../template/qa/lib/inputs-hash.mjs";
import { installHarnessLib, TEMPLATE_QA } from "./helpers/harness-fixture.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = fs.readFileSync(path.join(ROOT, "template", ".github", "workflows", "verify.yml"), "utf8");
const RENDERED = {
  harness: stripFeatureBlocks(RAW, []).content,
  minimal: stripFeatureBlocks(RAW, ["harness"]).content,
};
const REQUIRED = JSON.parse(fs.readFileSync(path.join(ROOT, "template", "qa", "ruleset.json"), "utf8"))
  .rules.filter((r) => r.type === "required_status_checks")
  .flatMap((r) => r.parameters.required_status_checks.map((c) => c.context));

// ── a reader for the workflow's jobs (comments dropped; two-space job keys) ──
function jobs(yml) {
  const lines = yml.split("\n").filter((l) => !/^\s*#/.test(l));
  const start = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  const out = {};
  let cur = null;
  for (const l of lines.slice(start + 1)) {
    const head = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(l);
    if (head) {
      cur = out[head[1]] = { id: head[1], text: [] };
      continue;
    }
    if (/^\S/.test(l)) break;
    if (cur) cur.text.push(l);
  }
  for (const j of Object.values(out)) {
    const body = j.text.join("\n");
    const ifm = /^ {4}if:\s*(.+)$/m.exec(body);
    j.if = ifm ? ifm[1].trim().replace(/^\$\{\{\s*|\s*\}\}$/g, "") : null;
    const nm = /^ {4}needs:\s*(.+)$/m.exec(body);
    j.needs = nm ? nm[1].replace(/[[\]\s]/g, "").split(",").filter(Boolean) : [];
    j.body = body;
  }
  return out;
}

function triggers(yml) {
  const lines = yml.split("\n").filter((l) => !/^\s*#/.test(l));
  const start = lines.findIndex((l) => /^on:\s*$/.test(l));
  const out = [];
  for (const l of lines.slice(start + 1)) {
    if (/^\S/.test(l)) break;
    const m = /^ {2}([a-z_]+):/.exec(l);
    if (m) out.push(m[1]);
  }
  return out;
}

// ── a GitHub Actions expression evaluator, enough for a job's `if:` ─────────
// Literals, contexts (dotted), ==, !=, &&, ||, !, parentheses, and the four
// status functions. Missing context values read as '' (an output the failed
// job never set). An `if:` with no status function is `success() && (if)` —
// GitHub's own rule, and the whole point of invariant 1.
function evaluate(expr, ctx) {
  const STATUS = /\b(always|success|failure|cancelled)\(\)/;
  const src = STATUS.test(expr) ? expr : `success() && (${expr})`;
  const toks = src.match(/'(?:[^']|'')*'|==|!=|&&|\|\||[!()]|[A-Za-z_][A-Za-z0-9_.-]*\(\)|[A-Za-z_][A-Za-z0-9_.-]*|\d+/g);
  let i = 0;
  const peek = () => toks[i];
  const next = () => toks[i++];
  const truthy = (v) => !(v === false || v === null || v === undefined || v === "" || v === 0);
  const eq = (a, b) => String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();
  function primary() {
    const t = next();
    if (t === "(") {
      const v = or();
      next();
      return v;
    }
    if (t === "!") return !truthy(primary());
    if (t.startsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
    if (t === "true") return true;
    if (t === "false") return false;
    if (t === "null") return null;
    if (/^\d+$/.test(t)) return Number(t);
    if (t.endsWith("()")) return ctx.status[t.slice(0, -2)];
    return t.split(".").reduce((o, k) => (o && typeof o === "object" && k in o ? o[k] : ""), ctx);
  }
  function cmp() {
    let v = primary();
    while (peek() === "==" || peek() === "!=") {
      const op = next();
      const r = primary();
      v = op === "==" ? eq(v, r) : !eq(v, r);
    }
    return v;
  }
  function and() {
    let v = cmp();
    while (peek() === "&&") {
      next();
      const r = cmp();
      v = truthy(v) ? r : v;
    }
    return v;
  }
  function or() {
    let v = and();
    while (peek() === "||") {
      next();
      const r = and();
      v = truthy(v) ? v : r;
    }
    return v;
  }
  return truthy(or());
}

const READY_PR = { event_name: "pull_request", event: { pull_request: { draft: false, number: 7 } } };

/** The context a job's `if:` sees on a ready PR, every job it needs having ended with `result`. */
function contextFor(job, result, outputs = {}) {
  const needs = Object.fromEntries(job.needs.map((n) => [n, { result, outputs }]));
  const failed = result === "failure";
  return { github: READY_PR, needs, status: { always: true, success: !failed, failure: failed, cancelled: false } };
}

test("the evaluator reads GitHub's implicit success(): a plain needs-output `if:` skips on a failed need", () => {
  const job = { needs: ["scope"] };
  assert.equal(evaluate("needs.scope.outputs.run == 'true'", contextFor(job, "success", { run: "true" })), true);
  assert.equal(evaluate("needs.scope.outputs.run == 'true'", contextFor(job, "failure")), false);
  assert.equal(evaluate("!cancelled() && needs.scope.result != 'success'", contextFor(job, "failure")), true);
});

test("a failed scope job skips the required `android` check, and a ruleset reads that skip as passed", () => {
  const all = jobs(RENDERED.harness);
  assert.ok(REQUIRED.length > 0, "qa/ruleset.json requires at least one check");
  const skippedByFailure = [];
  for (const id of REQUIRED) {
    const job = all[id];
    assert.ok(job, `the required check \`${id}\` names a job in verify.yml`);
    if (job.needs.length === 0 || !job.if) continue;
    if (!evaluate(job.if, contextFor(job, "failure"))) skippedByFailure.push(`${id} (needs ${job.needs.join(", ")}; if: ${job.if})`);
  }
  assert.deepEqual(
    skippedByFailure,
    [],
    "a required job whose dependency FAILED is skipped, and GitHub accepts a skipped required check — a crash in the scope job merges an unchecked feature",
  );
});

test("a feature check PASSes, into a required status check, with its own flow SKIPped for the environment", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "feature-env-skip-"));
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "feature-env-bin-"));
  try {
    installHarnessLib(root);
    fs.copyFileSync(path.join(TEMPLATE_QA, "verify.mjs"), path.join(root, "qa", "verify.mjs"));
    fs.mkdirSync(path.join(root, "qa", "e2e"), { recursive: true });
    for (const f of ["qa/e2e/shipments.yaml", "qa/e2e/smoke.yaml"]) fs.writeFileSync(path.join(root, f), "appId: com.example.app\n---\n- launchApp\n");
    // Gradle answers green, so the run reaches the step the profile exists for.
    fs.writeFileSync(path.join(root, "gradlew"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    const G = ["-c", "user.email=t@t", "-c", "user.name=t"];
    const git = (...a) => execFileSync("git", a, { cwd: root, stdio: ["ignore", "pipe", "pipe"] }).toString();
    git("init", "-q", "-b", "main");
    git(...G, "add", "-A");
    git(...G, "commit", "-qm", "base");
    git("checkout", "-qb", "feat/shipments");
    const kt = path.join(root, "composeApp/src/commonMain/kotlin/com/example/app/presentation/shipments/ShipmentsScreen.kt");
    fs.mkdirSync(path.dirname(kt), { recursive: true });
    fs.writeFileSync(kt, "package com.example.app.presentation.shipments\n");
    git(...G, "add", "-A");
    git(...G, "commit", "-qm", "feature");
    // A PATH with no Maestro on it: the install step failed, the way
    // `curl … | bash` under the runner's default `bash -e` (no pipefail) does.
    for (const t of ["git", "sh", "node", "uname", "env"]) {
      const w = spawnSync("/usr/bin/which", [t], { encoding: "utf8" }).stdout.trim();
      if (w) fs.symlinkSync(w, path.join(bin, t));
    }
    const r = spawnSync(process.execPath, ["qa/verify.mjs", "--profile", "feature", "--base", "main"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: bin, CI: "true" },
      timeout: 120_000,
    });
    const receipt = JSON.parse(fs.readFileSync(path.join(root, "qa", "evidence", "latest-feature.json"), "utf8"));
    // The flow did not run (no Maestro on PATH). Before the fix that was an
    // environmental SKIP; now it is a FAIL naming the flow. Either way the
    // fixture must reach the step and the step must not have PASSed.
    const e2e = receipt.steps.find((s) => s.name === "e2eSmoke");
    assert.ok(e2e && e2e.verdict !== "PASS", "the fixture reaches e2eSmoke with no Maestro on PATH, and the flow does not run");
    assert.ok(!(e2e.verdict === "SKIP" && e2e.skipKind === "environment"), `the feature check SKIPped its own flow for the environment: ${e2e.reason}`);
    const envSkips = [`${e2e.name}: ${e2e.verdict} — ${e2e.reason}`];
    assert.notEqual(
      r.status,
      0,
      `the feature lane exited 0 — the required \`android\` check goes green — while a step it exists to run never ran: ${envSkips.join("; ")}`,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(bin, { recursive: true, force: true });
  }
});

test("a pull request that moves only receipt-hashed files skips the receipt check CI claims to enforce", () => {
  const surface = JSON.parse(fs.readFileSync(path.join(TEMPLATE_QA, "verified-surface.json"), "utf8")).surface;
  const tracked = execFileSync("git", ["ls-files", "template"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .map((p) => p.slice("template/".length));
  const inSurface = tracked.filter((p) => surface.some((s) => p === s || p.startsWith(`${s}/`)));
  assert.ok(inSurface.length > 10, "the template carries files inside the verified surface");
  const scopedOut = inSurface.filter((p) => deriveFeatureScope([p], cmpAffected, { flows: [], smokeFlow: null }).run === false);
  // "Moves the hash" is asked of the hash itself, never restated: each
  // scoped-out file is edited in a scratch repo and computeInputsHash read
  // before and after.
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "surface-"));
  let skippedByScope;
  try {
    const G = ["-c", "user.email=t@t", "-c", "user.name=t"];
    const git = (...a) => execFileSync("git", a, { cwd: scratch, stdio: ["ignore", "pipe", "pipe"] });
    git("init", "-q");
    fs.mkdirSync(path.join(scratch, "qa"), { recursive: true });
    fs.copyFileSync(path.join(TEMPLATE_QA, "verified-surface.json"), path.join(scratch, "qa", "verified-surface.json"));
    for (const p of scopedOut) {
      fs.mkdirSync(path.dirname(path.join(scratch, p)), { recursive: true });
      fs.writeFileSync(path.join(scratch, p), "before\n");
    }
    git("add", "-A");
    git(...G, "commit", "-qm", "base");
    skippedByScope = scopedOut.filter((p) => {
      const before = computeInputsHash(scratch).hash;
      fs.writeFileSync(path.join(scratch, p), "after\n");
      const after = computeInputsHash(scratch).hash;
      fs.writeFileSync(path.join(scratch, p), "before\n");
      return before !== after;
    });
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }

  const all = Object.values(jobs(RENDERED.harness));
  const checkers = all.filter((j) => /node qa\/receipt-check\.mjs/.test(j.body));
  assert.ok(checkers.length > 0, "the stamped workflow runs qa/receipt-check.mjs somewhere");
  // The scope job SUCCEEDED and answered run=false: does any receipt check still run?
  const runsOnDocsOnly = checkers.some((j) => !j.if || evaluate(j.if, contextFor(j, "success", { run: "false" })));
  const unchecked = runsOnDocsOnly ? [] : skippedByScope;
  assert.deepEqual(
    unchecked,
    [],
    "these files move the committed receipt's inputs-hash, yet a PR touching only them is scoped `run: false` and no job runs qa/receipt-check.mjs — while verify.yml, .githooks/pre-push and CLAUDE.md say CI still enforces it",
  );
});

test("shipped prose says CI runs on push, or re-runs the full lane, where the stamped workflow does neither", () => {
  const claims = [];
  const files = execFileSync("git", ["ls-files", "template"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((f) => f && !f.startsWith("template/.github/") && /\.(md|mjs|sh|json|txt)$|\.githooks\//.test(f));
  for (const [mode, yml] of Object.entries(RENDERED)) {
    const on = triggers(yml);
    const prJobs = Object.values(jobs(yml)).filter((j) => !j.if || evaluate(j.if, { github: READY_PR, needs: Object.fromEntries(j.needs.map((n) => [n, { result: "success", outputs: { run: "true" } }])), status: { always: true, success: true, failure: false, cancelled: false } }));
    const prProfiles = prJobs.flatMap((j) => [...j.body.matchAll(/qa\/verify\.mjs[^\n]*?--profile (\w+)/g)].map((m) => m[1]));
    const prRunsWholeLane = prProfiles.some((p) => p !== "feature");
    const rules = [];
    if (!on.includes("push")) rules.push({ re: /\bCI\b[^.;]{0,60}?\bon (?:every )?push(?:es)?\b/gi, why: `the ${mode} workflow has no push trigger (on: ${on.join(", ")})` });
    if (!prRunsWholeLane) rules.push({ re: /\bCI\b[^.;]{0,30}?\bre-?runs?\b[^.;]{0,20}?\b(?:full|same|whole) lane\b/gi, why: `before merge the ${mode} workflow runs only the feature profile` });
    for (const f of files) {
      const raw = fs.readFileSync(path.join(ROOT, f), "utf8");
      const text = stripFeatureBlocks(raw, mode === "minimal" ? ["harness"] : []).content.replace(/\s+/g, " ");
      for (const { re, why } of rules) for (const m of text.matchAll(re)) claims.push(`${f}: "${m[0]}" — ${why}`);
    }
  }
  assert.deepEqual([...new Set(claims)], [], "a sentence an adopter (or their agent) reads about CI that the workflow does not honour");
});
