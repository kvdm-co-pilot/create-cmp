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
  assert.ok(!/typically/.test(prove.note ?? ""), "one full run is not a distribution — no spread is claimed over it");
  fs.rmSync(path.join(dir, "qa/flight-recorder.jsonl"));
});

// The quoted cost must not be a cache hit. A single last-run figure is dominated
// by Gradle's cache state: a run that changed nothing reports the no-op cost, and
// the operator plans a real change around it (observed: 25s advertised, 140s
// median, 558s worst). Every figure quoted is still a run that HAPPENED.
test("L4: once the journal can support one, the cost is a spread, not a lucky run", () => {
  const runs = [25_000, 140_000, 120_000, 558_000, 130_000].map((durationMs) =>
    JSON.stringify({ profile: "local", mode: "full", verdict: "PASS", durationMs }),
  );
  fs.writeFileSync(path.join(dir, "qa/flight-recorder.jsonl"), `${runs.join("\n")}\n`);
  const timing = lib.laneTiming(dir);
  assert.equal(timing.durationMs, 130_000, "last is still last");
  assert.equal(timing.runs, 5);
  assert.equal(timing.medianMs, 130_000, "the median is a run that happened, never an average of two");
  assert.equal(timing.maxMs, 558_000);
  const phrase = lib.laneCostPhrase(timing);
  assert.match(phrase, /typically/, "the typical cost is named, not just the last one");
  assert.match(phrase, /worst/, "and the worst, because that is what an operator plans around");
  assert.match(phrase, /measured over 5 full runs/, "the sample size is stated, never implied");
  // Two runs is not a distribution; claiming one over them is the same overclaim
  // in a new costume.
  fs.writeFileSync(
    path.join(dir, "qa/flight-recorder.jsonl"),
    `${runs.slice(0, 2).join("\n")}\n`,
  );
  assert.ok(!/typically/.test(lib.laneCostPhrase(lib.laneTiming(dir))));
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

// studio-self-renewal R5: the console publishes its own staleness on the registry
// record, so the per-prompt inject and the statusline stop reporting a clean bill
// of health for a console drawing from code the tree has moved past. The harness
// reads a boolean — it cannot hash the inspector's sources, and a per-prompt hook
// must not make an HTTP call.
function writeConsoleRecord(fields) {
  // Both spellings of the same directory: the in-process call keys off `dir`,
  // while the CLI resolves its root through cwd — and on macOS os.tmpdir() is a
  // symlink, so the two differ. The registry key is sha1 of the resolved path.
  const written = [];
  for (const root of new Set([path.resolve(dir), fs.realpathSync(dir)])) {
    const key = crypto.createHash("sha1").update(root).digest("hex").slice(0, 12);
    const p = path.join(os.tmpdir(), `cmp-console-${key}.json`);
    fs.writeFileSync(p, JSON.stringify({ pid: process.pid, port: 9600, url: "http://127.0.0.1:9600/", ...fields }));
    written.push(p);
  }
  return written;
}

test("studio: a console serving old code reads as STALE, not as running", () => {
  const rec = writeConsoleRecord({ buildStale: true });
  try {
    const state = lib.consoleState(dir);
    assert.equal(state.buildStale, true, "the console's own verdict is carried, not recomputed");
    const hookInput = JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "carry on" });
    const ctx = JSON.parse(
      execFileSync("node", [cli, "--inject"], { cwd: dir, encoding: "utf8", input: hookInput }),
    ).hookSpecificOutput.additionalContext;
    assert.match(ctx, /STALE/, "the inject says so — silence here is the clean bill of health that hid it");
    assert.match(ctx, /renews itself/, "and says it heals, so the agent does not reach for a restart");
    const line = execFileSync("node", [cli, "--statusline"], { cwd: dir, encoding: "utf8" });
    assert.match(line, /console stale/, "the statusline carries it too");
  } finally {
    for (const f of rec) fs.rmSync(f, { force: true });
  }
});

test("studio: a healthy console still reads as plainly running", () => {
  const rec = writeConsoleRecord({ buildStale: false });
  try {
    assert.equal(lib.consoleState(dir).buildStale, false);
    const hookInput = JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "carry on" });
    const ctx = JSON.parse(
      execFileSync("node", [cli, "--inject"], { cwd: dir, encoding: "utf8", input: hookInput }),
    ).hookSpecificOutput.additionalContext;
    assert.match(ctx, /\[studio: running at http/, "no alarm where there is no fault");
    assert.ok(!/STALE/.test(ctx));
  } finally {
    for (const f of rec) fs.rmSync(f, { force: true });
  }
});

// S3 — the build stage's observed tier. Between the prompt and the lane the
// chain moved only if the agent declared steps; a silent agent was a still
// photo. Writes since the request are a fact no cooperation can withhold.
test("chain: activity — files written SINCE the request are observed; earlier writes, machinery files and no-request are not", async () => {
  const planLib = await import(pathToFileURL(path.join(dir, "qa/lib/plan.mjs")).href);
  const old = Date.now() / 1000 - 3600;
  const before = path.join(dir, "specs/before.spec.md");
  fs.writeFileSync(before, "- **B-01** — old\n");
  fs.utimesSync(before, old, old);
  // No request yet → nothing to measure from, and the chain says nothing about activity.
  fs.rmSync(path.join(dir, "qa/.request.json"), { force: true });
  assert.equal(planLib.observeActivity(dir, null), null);
  assert.equal(planLib.describeActivity(null), "", "no request, no line — silence, not zero");
  // Record a request, then work.
  execFileSync("node", [cli, "--inject"], { cwd: dir, encoding: "utf8", input: JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "add the thing" }) });
  await new Promise((r) => setTimeout(r, 20));
  fs.writeFileSync(path.join(dir, "specs/after.spec.md"), "- **A-01** — new\n");
  fs.mkdirSync(path.join(dir, "composeApp/src/commonMain/kotlin/x"), { recursive: true });
  fs.writeFileSync(path.join(dir, "composeApp/src/commonMain/kotlin/x/New.kt"), "class New\n");
  // Machinery writes must not count as work — or the pulse corroborates itself.
  fs.writeFileSync(path.join(dir, "qa/.plan.json"), JSON.stringify({ title: "t", steps: [], updatedAt: new Date().toISOString() }));
  const request = planLib.readRequest(dir);
  const activity = planLib.observeActivity(dir, request.at);
  assert.equal(activity.filesChanged, 2, "the two real writes, not the hour-old spec, not .plan.json");
  assert.ok(activity.lastWriteAgoMs >= 0 && activity.lastWriteAgoMs < 5000);
  assert.match(planLib.describeActivity(activity), /^2 files written since the request · last \d+s ago$/);
  fs.rmSync(path.join(dir, "qa/.plan.json"), { force: true });
  // The chain renders it as the OBSERVED tier — the machine's word, not the
  // agent's — on every surface that derives the chain. (Not via a second
  // --inject: a new prompt stamps a NEW request, and activity is per-request —
  // which is exactly right, and exactly why this asserts on the derivation.)
  const chain = planLib.deriveChain(dir);
  assert.equal(chain.activity.filesChanged, 2);
  assert.match(chain.busyText, /^2 files written since the request/);
  assert.match(planLib.renderChain(chain), /observed: 2 files written since the request/, "the strip moves on what the agent did");
  assert.match(lib.deriveWalks(dir).chain.busyText, /2 files written/, "and the walk's own derivation carries the same words");
  fs.rmSync(before, { force: true });
  fs.rmSync(path.join(dir, "specs/after.spec.md"), { force: true });
});

test("chain: activity — a tree that stopped moving is a STALL, named; the lane marker still wins while a lane runs", async () => {
  const planLib = await import(pathToFileURL(path.join(dir, "qa/lib/plan.mjs")).href);
  const stalled = { filesChanged: 3, lastWriteAgoMs: planLib.ACTIVITY_STALL_MS + 1000, since: new Date().toISOString() };
  assert.match(planLib.describeActivity(stalled), /stalled — nothing written for/);
  const lane = { step: "unitTests", index: 10, total: 16, stepStartedAt: new Date().toISOString() };
  assert.match(planLib.describeBusy({ lane, render: false }, Date.now(), stalled), /^full check — unitTests/, "a running lane is the stronger observation");
  assert.match(planLib.describeBusy({ lane: false, render: false }, Date.now(), stalled), /stalled/, "with nothing running, the stall is what is observed");
});

test("chain: the ephemeral files never enter the receipt's hashed input surface", async () => {
  const ih = await import(pathToFileURL(path.join(dir, "qa/lib/inputs-hash.mjs")).href);
  fs.rmSync(path.join(dir, "qa/.plan.json"), { force: true });
  fs.rmSync(path.join(dir, "qa/.request.json"), { force: true });
  fs.rmSync(path.join(dir, "qa/.plan-history.jsonl"), { force: true });
  const before = ih.computeInputsHash(dir).hash;
  fs.writeFileSync(path.join(dir, "qa/.request.json"), '{"text":"a new prompt","at":"now"}\n');
  fs.writeFileSync(path.join(dir, "qa/.plan.json"), '{"steps":[{"n":1,"label":"x","done":false}],"current":1,"updatedAt":"now"}\n');
  fs.writeFileSync(path.join(dir, "qa/.plan-history.jsonl"), '{"schema":"cmp-plan-history/1","at":"now"}\n');
  const after = ih.computeInputsHash(dir).hash;
  assert.equal(after, before, "a prompt must never invalidate a receipt");
});

// ── drive-narration (docs/features/drive-narration.md) ──────────────────────

test("N1: the declaration's own write stamps become step durations in the rendering", async () => {
  const plan = await import(pathToFileURL(path.join(dir, "qa/lib/plan.mjs")).href);
  plan.setPlan(dir, { title: "timed work", steps: ["first", "second"] });
  // Backdate step 1's start so the closed step has measurable wall time.
  const raw = JSON.parse(fs.readFileSync(path.join(dir, "qa/.plan.json"), "utf8"));
  raw.steps[0].startedAt = new Date(Date.now() - 30000).toISOString();
  fs.writeFileSync(path.join(dir, "qa/.plan.json"), JSON.stringify(raw));
  plan.markStep(dir, 2);
  const text = plan.renderChain(plan.deriveChain(dir));
  assert.match(text, /✓ 1\. first \(30s\)/, "a done step wears its wall time");
  assert.match(text, /◉ 2\. second · \d+s in/, "the current step wears its elapsed");
});

test("N2: the lane marker's narration is parsed, spoken with expected durations, and prefixed observed", async () => {
  const plan = await import(pathToFileURL(path.join(dir, "qa/lib/plan.mjs")).href);
  const markerDir = path.join(dir, "composeApp", "build");
  fs.mkdirSync(markerDir, { recursive: true });
  const marker = path.join(markerDir, ".cmp-lane-in-progress");
  fs.writeFileSync(
    marker,
    `${JSON.stringify({ pid: 1, at: "x", step: "unitTests", index: 10, total: 16, stepStartedAt: new Date(Date.now() - 12000).toISOString(), expectedStepMs: 6000, expectedLaneMs: 52000 })}\n`,
  );
  try {
    const chain = plan.deriveChain(dir);
    assert.match(chain.busyText, /full check — unitTests \(10\/16\) · 12s of ~6s, usually 52s total/);
    assert.match(plan.renderChain(chain), /observed: full check — unitTests/, "the machine's word is labeled as the machine's (N3)");
    // Legacy "pid iso" content still reads as busy — no narration, no breakage.
    fs.writeFileSync(marker, "123 2026-08-29T00:00:00.000Z\n");
    assert.equal(plan.deriveChain(dir).busyText, "the full check is running NOW");
  } finally {
    fs.rmSync(marker, { force: true });
  }
});

test("N5: closing the chain leaves ONE trail entry — request, steps, wall time, receipt at close", async () => {
  const plan = await import(pathToFileURL(path.join(dir, "qa/lib/plan.mjs")).href);
  fs.rmSync(path.join(dir, "qa/.plan-history.jsonl"), { force: true });
  plan.recordRequest(dir, "please add supplements");
  plan.setPlan(dir, { title: "supplements", feature: "supplements", steps: ["build", "check"] });
  plan.markStep(dir, 3); // past the end = close
  plan.markStep(dir, 3); // re-close: must NOT double-write the trail
  const hist = plan.readPlanHistory(dir, 5);
  assert.equal(hist.length, 1, "one close, one line — a re-close never doubles the trail");
  assert.equal(hist[0].title, "supplements");
  assert.equal(hist[0].request, "please add supplements");
  assert.deepEqual(hist[0].steps, ["build", "check"]);
  assert.ok(typeof hist[0].durationMs === "number" && hist[0].durationMs >= 0, "wall time from the chain's own stamps");
  assert.equal(hist[0].receipt, null, "no receipt in this fixture — stated as null, never invented");
  assert.ok(plan.deriveChain(dir).history.length >= 1, "the trail rides along on deriveChain for the Drive fold");
});

test("N5: the trail is capped and newest-first", async () => {
  const plan = await import(pathToFileURL(path.join(dir, "qa/lib/plan.mjs")).href);
  fs.rmSync(path.join(dir, "qa/.plan-history.jsonl"), { force: true });
  for (let i = 1; i <= 60; i++) {
    plan.setPlan(dir, { title: `req ${i}`, steps: ["only"] });
    plan.markStep(dir, 2);
  }
  const lines = fs.readFileSync(path.join(dir, "qa/.plan-history.jsonl"), "utf8").split("\n").filter((l) => l.trim());
  assert.equal(lines.length, 50, "the trail holds the last 50, no unbounded growth");
  const hist = plan.readPlanHistory(dir, 3);
  assert.equal(hist[0].title, "req 60", "newest first");
  assert.equal(hist.length, 3);
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
