// The walk (docs/features/walk-status.md): a PROJECTION of the feature board
// into six stages — Decide · Design · Contract · Build · Prove · Sign-off —
// with promises (clauses) as the Build station's inner progress, whose-turn
// derived from the board's own owner, arrivals for work no open walk accounts
// for, and fail-open CLI surfaces (statusline / inject) that may never block.
//
// Same harness shape as feature-brief.test.mjs: scaffold the REAL template
// once (verify: false — gradle-free), drive states through the project's own
// qa/ CLIs, import the vendored lib in-process for the pure derivations.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { scaffold } from "../src/scaffold.mjs";

function baseConfig(targetDir) {
  return {
    appName: "Acme",
    package: "com.acme.demo",
    iosBundleId: "com.acme.demo",
    region: "us-central1",
    themePrefix: "Acme",
    platforms: { android: true, ios: true },
    firebase: { enabled: true, auth: "both", firestore: true, storage: true, functions: true, fcm: true },
    room: true,
    e2e: true,
    inspector: true,
    devClient: true,
    tabs: [{ label: "Home", icon: "home" }],
    targetDir,
  };
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-walk-"));
await scaffold(baseConfig(dir), { verify: false });
const lib = await import(pathToFileURL(path.join(dir, "qa/lib/walk.mjs")).href);
const cli = path.join(dir, "qa/walk-status.mjs");

const writeBrief = (name, body = "") =>
  fs.writeFileSync(
    path.join(dir, "docs/features", `${name}.md`),
    `# Feature brief: ${name}\n\n\`\`\`json cmp:feature\n{ "touches": [], "screens": false }\n\`\`\`\n\n## Decisions\n\nD1 — yes.\n${body}\n`,
  );

test("a fresh brief opens a walk at Decide, YOUR TURN, with the remaining stops named", () => {
  fs.mkdirSync(path.join(dir, "docs/features"), { recursive: true });
  writeBrief("meal");
  const d = lib.deriveWalks(dir);
  assert.equal(d.available, true);
  const w = d.walks.find((x) => x.name === "meal");
  assert.ok(w, "the brief file alone opens the walk");
  assert.equal(w.currentStage, "decide");
  assert.equal(w.you.turn, "you", "signing the brief is the human's act");
  // Design is honestly skipped — screens: false, no screen files.
  assert.deepEqual(w.stages.find((s) => s.key === "design").state, "skipped");
  assert.ok(w.stops.includes("Decide") && w.stops.includes("Sign-off"), `stops name the human gates: ${w.stops}`);
});

test("signing the brief moves the walk to Contract; the promises are the spec's own words", () => {
  execFileSync("node", [path.join(dir, "qa/approve.mjs"), "feature-brief:meal"], { cwd: dir });
  let w = lib.deriveWalks(dir).walks.find((x) => x.name === "meal");
  assert.equal(w.currentStage, "contract");
  assert.equal(w.stages.find((s) => s.key === "decide").state, "done");

  fs.writeFileSync(
    path.join(dir, "specs/meal.spec.md"),
    [
      "# Spec: meal",
      "",
      "- **MEAL-01** — Given a day, Then six containers render in day order.",
      "- **MEAL-02** — Given a container tap, Then the catalog opens pre-targeted.",
      "- ~~**MEAL-03**~~ — Given nothing, Then withdrawn clauses never count.",
    ].join("\n"),
  );
  w = lib.deriveWalks(dir).walks.find((x) => x.name === "meal");
  assert.equal(w.promises.total, 2, "withdrawn promises never count");
  assert.equal(w.promises.current.id, "MEAL-01");
  assert.match(w.promises.current.title, /six containers render in day order/, "the promise speaks the spec's words");
});

test("citing tests move Build's inner progress; whose-turn follows the board's owner verbatim", () => {
  execFileSync("node", [path.join(dir, "qa/approve.mjs"), "feature-spec:meal"], { cwd: dir });
  let w = lib.deriveWalks(dir).walks.find((x) => x.name === "meal");
  assert.equal(w.currentStage, "build");
  assert.equal(w.you.turn, "agent", "building is the agent's turn");

  const testsDir = path.join(dir, "composeApp/src/commonTest/kotlin/com/acme/demo");
  fs.mkdirSync(testsDir, { recursive: true });
  fs.writeFileSync(path.join(testsDir, "MealTest.kt"), "package com.acme.demo\n// SPEC: MEAL-01\nclass MealTest\n");
  w = lib.deriveWalks(dir).walks.find((x) => x.name === "meal");
  assert.equal(w.promises.kept, 1);
  assert.equal(w.promises.current.id, "MEAL-02", "the NOW promise is the first unkept one");
});

test("an arrival is a reopened/drifted artifact no open walk accounts for — with the journal's reason", () => {
  // Sign it first — a reopen presupposes a signature to reopen.
  execFileSync("node", [path.join(dir, "qa/approve.mjs"), "design-system"], { cwd: dir });
  execFileSync(
    "node",
    [path.join(dir, "qa/approve.mjs"), "--reopen", "design-system", "--reason", "swatch grid rebuild"],
    { cwd: dir },
  );
  const d = lib.deriveWalks(dir);
  const a = d.arrivals.find((x) => x.id === "design-system");
  assert.ok(a, "an artifact outside every open walk arrives");
  assert.equal(a.reason, "swatch grid rebuild", "the WHY rides the journal");
  // The open walk's own family never reads as an arrival (edge case, brief).
  assert.ok(!d.arrivals.some((x) => x.id.startsWith("feature-")), "walk-family artifacts are the walk's, not arrivals");
});

test("statusline: YOUR TURN beats agent-working; renderings carry the stage grammar", () => {
  const d = lib.deriveWalks(dir);
  const line = lib.renderStatusline(d);
  assert.match(line, /▲1 arrived/, "arrivals surface in the one-liner");
  const card = lib.renderCard(d.walks.find((x) => x.name === "meal"));
  assert.match(card, /Decide/);
  assert.match(card, /keeping promise 2 of 2/);
  assert.match(card, /next stop/i);
});

test("the inject renders position + protocol, and is valid UserPromptSubmit hook JSON via the CLI", () => {
  const out = execFileSync("node", [cli, "--inject"], { cwd: dir, encoding: "utf8" });
  const parsed = JSON.parse(out);
  assert.equal(parsed.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  const ctx = parsed.hookSpecificOutput.additionalContext;
  assert.match(ctx, /render this state, never your own memory/i);
  assert.match(ctx, /ARRIVED, UNPLANNED — Design system/);
  assert.match(ctx, /Decide·Design·Contract·Build·Prove·Sign-off/);
});

test("fail-open: outside any project, every surface exits 0 and stays silent", () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-walk-empty-"));
  // The CLI resolves its root from its own location — copy it standalone so a
  // broken/absent lib is the scenario, not a path trick.
  fs.mkdirSync(path.join(empty, "qa"));
  fs.copyFileSync(cli, path.join(empty, "qa/walk-status.mjs"));
  for (const flag of [["--statusline"], ["--inject"], []]) {
    const r = execFileSync("node", [path.join(empty, "qa/walk-status.mjs"), ...flag], { encoding: "utf8" });
    assert.ok(true, `exit 0 with ${flag} (output: ${JSON.stringify(r.slice(0, 40))})`);
  }
  fs.rmSync(empty, { recursive: true, force: true });
});

test("an ungoverned/empty board renders SILENCE on the statusline, never a fabricated state", () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-walk-bare-"));
  const d = lib.deriveWalks(bare);
  assert.equal(lib.renderStatusline(d), "");
  assert.equal(lib.renderInject(d), "");
  fs.rmSync(bare, { recursive: true, force: true });
});

test("cleanup", () => {
  fs.rmSync(dir, { recursive: true, force: true });
});
