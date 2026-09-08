// WHAT THE 2026-09-08 CONTEXT AUDIT FOUND IN CODE, PINNED.
//
// Four defects the three audits found were in programs, not prose, and each is
// held here by a test: a step that booted a device before asking whether the
// endpoint it wanted was shipped; a fast run that overwrote the receipt of
// record; a pack version borrowed from the wrong package; a pre-push hook that
// said "committed" and checked the working tree. And one from the same day's
// own episode: a fleet check that orphaned its child lane when killed.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { inspectorShipped } from "../packages/harness/src/lib/profiles/cmp/steps-cmp.mjs";
import { runCommand, terminateChildren } from "../scripts/fleet-check.mjs";
import { memoryRestatements } from "../scripts/hooks/proof-gate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));

test("tokenDrift asks whether the inspector shipped BEFORE it touches a device", () => {
  const empty = tmp("no-inspector");
  assert.equal(inspectorShipped(empty), false, "no androidDebug at all");
  fs.mkdirSync(path.join(empty, "composeApp/src/androidDebug/kotlin/x/y"), { recursive: true });
  assert.equal(inspectorShipped(empty), false, "androidDebug without the server");
  fs.writeFileSync(path.join(empty, "composeApp/src/androidDebug/kotlin/x/y/InspectorHttpServer.kt"), "");
  assert.equal(inspectorShipped(empty), true, "found at any depth — the package path is the app's, not ours");

  // The order is the defect: the structural SKIP must come first, and it must
  // be structural so the receipt stays done-evidence.
  const src = read("packages/harness/src/lib/profiles/cmp/steps-cmp.mjs");
  const body = src.slice(src.indexOf("function stepTokenDrift()"));
  const skipAt = body.indexOf('skipKind: "structure", reason: "inspector not shipped');
  const deviceAt = body.indexOf('ensureLaneDevice("tokenDrift")');
  assert.ok(skipAt > 0 && deviceAt > 0 && skipAt < deviceAt, "the structural SKIP precedes the device touch");
  assert.equal(read("template/qa/lib/profiles/cmp/steps-cmp.mjs").includes("export function inspectorShipped"), true, "vendored twin carries it");
});

test("a fast run writes latest-fast.json — the receipt of record cannot be overwritten by a watcher", () => {
  const verify = read("packages/harness/src/verify.mjs");
  assert.match(verify, /const RECEIPT_FILE = fast \? "latest-fast\.json" : "latest\.json";/);
  assert.match(verify, /writeFileSync\(path\.join\(EVIDENCE_DIR, RECEIPT_FILE\)/);
  assert.match(read("template/gitignore"), /^qa\/evidence\/latest-fast\.json$/m, "never committed");
});

test("pack.version is the profile's own or null — never the harness lock's number (ADR-0008, accepted)", () => {
  const verify = read("packages/harness/src/verify.mjs");
  assert.match(verify, /pack: \{ id: pack\.id, version: typeof loaded\.profile\?\.version === "string" \? loaded\.profile\.version : null \}/);
  assert.doesNotMatch(verify, /version: harnessSummary\.version/, "the borrowed number is gone");
});

test("the pre-push hook checks the receipt is COMMITTED, not merely on disk", () => {
  const hook = read("template/.githooks/pre-push");
  assert.match(hook, /git ls-files --error-unmatch qa\/evidence\/latest\.json/);
  assert.match(hook, /git diff --quiet HEAD -- qa\/evidence\/latest\.json/);
  assert.ok(hook.indexOf("git diff --quiet HEAD") < hook.indexOf("node qa/receipt-check.mjs"), "the git half runs first");
});

test("fleet-check takes its child down with it — runCommand tracks the child and terminateChildren forwards the signal", async () => {
  const p = runCommand(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(terminateChildren("SIGTERM"), 1, "one live child");
  const status = await p;
  assert.notEqual(status, 0, "a killed child does not report success");
  assert.equal(terminateChildren(), 0, "and it is no longer tracked");
  const src = read("scripts/fleet-check.mjs");
  for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) assert.match(src, new RegExp(`"${sig}"`), `${sig} is forwarded`);
});

test("SessionStart scans the session's memory for the cadence the lint hunts — non-fatal, named by file:line", async () => {
  const dir = tmp("memory");
  assert.equal(await memoryRestatements(dir), "", "clean memory says nothing");
  fs.writeFileSync(path.join(dir, "old-habit.md"), "# note\n\nrun fleet L2 green per PR, always.\n");
  const out = await memoryRestatements(dir);
  assert.match(out, /old-habit\.md:3/);
  assert.match(out, /the program is the rule/);
  assert.equal(await memoryRestatements(path.join(dir, "does-not-exist")), "", "an absent directory is not an error");
});
