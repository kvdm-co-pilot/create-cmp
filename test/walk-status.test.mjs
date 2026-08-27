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
import crypto from "node:crypto";
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

test("L1: a brief that NAMES its specs pairs with all of them — no phantom contract", async () => {
  // The showcase defect this closes: catalog-and-editing's promises live in
  // TWO approved spec files, and filename pairing derived a standing false
  // instruction ("write specs/catalog-and-editing.spec.md") forever.
  fs.writeFileSync(
    path.join(dir, "docs/features/combo.md"),
    `# Feature brief: combo\n\n\`\`\`json cmp:feature\n{ "touches": [], "screens": false, "specs": ["alpha", "beta"] }\n\`\`\`\n\n## Decisions\n\nD1 — yes.\n`,
  );
  fs.writeFileSync(
    path.join(dir, "specs/alpha.spec.md"),
    "# Spec: alpha\n\n- **ALPHA-01** — Given a thing, Then alpha holds.\n",
  );
  fs.writeFileSync(
    path.join(dir, "specs/beta.spec.md"),
    "# Spec: beta\n\n- **BETA-01** — Given a thing, Then beta holds.\n",
  );
  execFileSync("node", [path.join(dir, "qa/approve.mjs"), "feature-brief:combo"], { cwd: dir });

  let w = lib.deriveWalks(dir).walks.find((x) => x.name === "combo");
  assert.equal(w.currentStage, "contract", "both specs exist but neither is signed — Contract, not phantom-Contract");
  assert.match(w.you.act, /feature-spec:alpha/, "the step names the real spec artifacts");
  assert.match(w.you.act, /feature-spec:beta/);
  assert.equal(w.promises.total, 2, "promises concatenate across the paired specs");

  // Signing ONE of two leaves the step naming only the other.
  execFileSync("node", [path.join(dir, "qa/approve.mjs"), "feature-spec:alpha"], { cwd: dir });
  w = lib.deriveWalks(dir).walks.find((x) => x.name === "combo");
  assert.match(w.you.act, /feature-spec:beta/);
  assert.ok(!/feature-spec:alpha/.test(w.you.act), "a signed paired spec is no longer waited on");

  execFileSync("node", [path.join(dir, "qa/approve.mjs"), "feature-spec:beta"], { cwd: dir });
  w = lib.deriveWalks(dir).walks.find((x) => x.name === "combo");
  assert.equal(w.currentStage, "build", "both signed — the walk moves on");
  assert.deepEqual(
    w.promises.all.map((pr) => pr.id),
    ["ALPHA-01", "BETA-01"],
    "the full promise list (L5) spans both specs in declaration order",
  );

  // A reopened PAIRED spec belongs to the walk — never an arrival (D7 + L1).
  execFileSync(
    "node",
    [path.join(dir, "qa/approve.mjs"), "--reopen", "feature-spec:alpha", "--reason", "amend alpha"],
    { cwd: dir },
  );
  const d = lib.deriveWalks(dir);
  assert.ok(!d.arrivals.some((a) => a.id === "feature-spec:alpha"), "a paired spec reopen is the walk's Contract, not an arrival");
  // Restore for later tests.
  execFileSync("node", [path.join(dir, "qa/approve.mjs"), "feature-spec:alpha"], { cwd: dir });
});

test("L1: the **Spec:** header paragraph pairs when the block declares nothing", async () => {
  const fb = await import(pathToFileURL(path.join(dir, "qa/lib/feature-brief.mjs")).href);
  const md = [
    "# Feature brief: gamma",
    "",
    "**Spec:** [`specs/alpha.spec.md`](../../specs/alpha.spec.md) — ALPHA-01, plus",
    "[`specs/beta.spec.md`](../../specs/beta.spec.md).",
    "",
    "Later prose mentioning specs/other.spec.md must NOT redirect the pairing.",
  ].join("\n");
  assert.deepEqual(fb.pairedSpecNames(md, "gamma"), ["alpha", "beta"]);
  assert.deepEqual(fb.pairedSpecNames("# nothing declared", "gamma"), ["gamma"], "filename stays the default");
  assert.deepEqual(
    fb.pairedSpecNames(md, "gamma", { specs: ["delta"] }),
    ["delta"],
    "an explicit block declaration outranks the header",
  );
});

test("L2: the inject leads with the chat header — the statusline's own string, verbatim", () => {
  const d = lib.deriveWalks(dir);
  const inject = lib.renderInject(d);
  const line = lib.renderStatusline(d);
  assert.match(inject, /\[chat header — open your reply with this exact line/);
  assert.ok(inject.includes(line), "the header IS the statusline string — pasted, never composed");
  assert.match(inject, /open every reply with the chat header line/i, "the protocol says so every turn");
});

test("L3: stages carry plain-words glosses; artifact ids translate at the boundary", () => {
  for (const s of lib.STAGES) assert.ok(lib.STAGE_GLOSS[s.key], `gloss exists for ${s.key}`);
  assert.equal(lib.humanArtifact("feature-spec:meal"), "the promises for meal");
  assert.equal(lib.humanArtifact("feature-brief:meal"), "the decisions for meal");
  assert.equal(lib.humanArtifact("design-system"), "design-system", "unknown shapes pass through untouched");
  const w = lib.deriveWalks(dir).walks.find((x) => x.name === "meal");
  const card = lib.renderCard(w);
  assert.match(card, /keeping the promises|agreeing what it promises|choosing what to build/, "the card glosses its stage");
});

test("L4: the lane's cost comes from the flight recorder — never memory", () => {
  const journal = [
    JSON.stringify({ profile: "local", mode: "full", verdict: "PASS", durationMs: 98000 }),
    JSON.stringify({ profile: "local", mode: "fast", verdict: "PASS", durationMs: 9000 }),
  ].join("\n");
  fs.writeFileSync(path.join(dir, "qa/flight-recorder.jsonl"), `${journal}\n`);
  const timing = lib.laneTiming(dir);
  assert.equal(timing.durationMs, 98000, "fast runs iterate, they don't prove — the FULL run is quoted");
  assert.equal(lib.humanDuration(98000), "98s");
  assert.equal(lib.humanDuration(50 * 60000), "~50 min");
  const d = lib.deriveWalks(dir);
  assert.equal(d.lane.durationMs, 98000, "the derivation carries the measured cost");
  const w = d.walks.find((x) => x.name === "meal");
  const prove = w.stages.find((s) => s.key === "prove");
  assert.match(prove.note ?? "", /98s last full run/, "Prove says what it costs, on the stage itself");
  fs.rmSync(path.join(dir, "qa/flight-recorder.jsonl"));
});

test("L6: a crashed console is loud on the statusline; a live one leads the stop card", () => {
  const key = crypto.createHash("sha1").update(path.resolve(dir)).digest("hex").slice(0, 12);
  const regPath = path.join(os.tmpdir(), `cmp-console-${key}.json`);
  try {
    // A record whose pid is dead = the console CRASHED (clean stops delete it).
    fs.writeFileSync(regPath, `${JSON.stringify({ pid: 2 ** 30, port: 9600, url: "http://127.0.0.1:9600/" })}\n`);
    let d = lib.deriveWalks(dir);
    assert.equal(d.console.stale, true);
    assert.match(lib.renderStatusline(d), /console down$/, "the always-visible surface reports the crash");

    // A live record: no alarm, and the YOUR-TURN card leads with the console.
    fs.writeFileSync(regPath, `${JSON.stringify({ pid: process.pid, port: 9600, url: "http://127.0.0.1:9600/" })}\n`);
    d = lib.deriveWalks(dir);
    assert.equal(d.console.url, "http://127.0.0.1:9600/");
    assert.ok(!/console down/.test(lib.renderStatusline(d)));
    // A fresh unsigned brief = a your-turn gate (Decide).
    writeBrief("delta");
    d = lib.deriveWalks(dir);
    const yourTurn = d.walks.find((w) => w.you.turn === "you");
    assert.ok(yourTurn, "fixture has a your-turn walk");
    assert.match(lib.renderCard(yourTurn, d), /Easiest: the studio console at http:\/\/127\.0\.0\.1:9600\//);
  } finally {
    fs.rmSync(regPath, { force: true });
  }
});

test("L5: the your-turn step names its signable artifacts for button-carrying surfaces", () => {
  const w = lib.deriveWalks(dir).walks.find((x) => x.name === "combo");
  // combo sits at Build (agent) — no signature pending, so nothing signable.
  assert.deepEqual(w.you.signable, []);
  const meal = lib.deriveWalks(dir).walks.find((x) => x.name === "meal");
  if (meal.you.turn === "you") {
    assert.ok(meal.you.signable.length > 0, "a human gate names the signature it waits for");
  }
});

test("chain: declare, advance, close — the CLI round-trip with age and provenance", () => {
  const planCli = path.join(dir, "qa/plan.mjs");
  execFileSync("node", [planCli, "--set", "sign the brief | build | full check", "--title", "combo work"], { cwd: dir });
  let chain = lib.deriveWalks(dir).chain;
  assert.equal(chain.plan.title, "combo work");
  assert.equal(chain.plan.steps.length, 3);
  assert.equal(chain.plan.current, 1);
  execFileSync("node", [planCli, "--step", "2"], { cwd: dir });
  chain = lib.deriveWalks(dir).chain;
  assert.equal(chain.plan.steps[0].done, true);
  assert.equal(chain.plan.current, 2);
  assert.ok(chain.planAgeMs >= 0, "the declaration carries its age — a stale chain must read as stale");
  const out = execFileSync("node", [planCli, "--done"], { cwd: dir, encoding: "utf8" });
  assert.match(out, /chain complete/);
  assert.match(out, /declared by the agent/, "provenance is stated on the rendering itself");
});

test("chain: the inject records the human's prompt (tier 1) and renders studio + chain", () => {
  const hookInput = JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "please add supplements with reminders" });
  const out = execFileSync("node", [cli, "--inject"], { cwd: dir, encoding: "utf8", input: hookInput });
  const ctx = JSON.parse(out).hookSpecificOutput.additionalContext;
  assert.match(ctx, /\[studio: /, "the studio's status is stated every prompt");
  assert.match(ctx, /node qa\/plan\.mjs --step N/, "keeping the chain current is re-told, never remembered");
  const recorded = JSON.parse(fs.readFileSync(path.join(dir, "qa/.request.json"), "utf8"));
  assert.equal(recorded.text, "please add supplements with reminders", "the request is the hook's words, machinery-owned");
});

test("chain: the ephemeral files never enter the receipt's hashed input surface", async () => {
  const ih = await import(pathToFileURL(path.join(dir, "qa/lib/inputs-hash.mjs")).href);
  fs.rmSync(path.join(dir, "qa/.plan.json"), { force: true });
  fs.rmSync(path.join(dir, "qa/.request.json"), { force: true });
  const before = ih.computeInputsHash(dir).hash;
  fs.writeFileSync(path.join(dir, "qa/.request.json"), '{"text":"a new prompt","at":"now"}\n');
  fs.writeFileSync(path.join(dir, "qa/.plan.json"), '{"steps":[{"n":1,"label":"x","done":false}],"current":1,"updatedAt":"now"}\n');
  const after = ih.computeInputsHash(dir).hash;
  assert.equal(after, before, "a prompt must never invalidate a receipt");
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
