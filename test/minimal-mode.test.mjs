// `--minimal` (LADDER §R3) stamps the app WITHOUT its verification harness:
// same architecture, same tests, same eyes — no lane, no governance, no
// enforcement. This suite stamps the REAL template minimal and asserts the
// whole shape, because the mode is a filter over one template and the filter
// is exactly what can silently rot: a kept file that presupposes a deleted
// one, a hook that references a lane that is not there, a doc that promises
// receipts the tree cannot produce.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, before, after } from "node:test";
import { fileURLToPath } from "node:url";

import { scaffold } from "../src/scaffold.mjs";
import { laneKeepSet } from "../src/lib/minimal.mjs";
import { listHarnessFiles } from "../packages/harness/src/lib/harness-region.mjs";
import { checkHarnessIntegrity } from "../packages/harness/src/lib/harness-lock.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function minimalConfig(targetDir, overrides = {}) {
  return {
    appName: "Min App",
    package: "com.minapp.app",
    iosBundleId: "com.minapp.app",
    region: "us-central1",
    themePrefix: "Min",
    harness: false,
    platforms: { android: true, ios: false },
    firebase: { enabled: false },
    room: true,
    e2e: true,
    inspector: true,
    devClient: true,
    tabs: [
      { label: "Home", icon: "home" },
      { label: "Profile", icon: "person" },
    ],
    targetDir,
    ...overrides,
  };
}

let tmpRoot;
let out;

before(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-minimal-"));
  out = path.join(tmpRoot, "app");
  await scaffold(minimalConfig(out), { verify: false });
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const exists = (rel) => fs.existsSync(path.join(out, rel));
const read = (rel) => fs.readFileSync(path.join(out, rel), "utf8");

test("the lane and governance surfaces are gone", () => {
  for (const rel of [
    "qa/verify.mjs",
    "qa/watch.mjs",
    "qa/receipt-check.mjs",
    "qa/approve.mjs",
    "qa/comment.mjs",
    "qa/refusal-demo.mjs",
    "qa/scaffold-feature.mjs",
    "qa/setup-hooks.mjs",
    "qa/approvals.json",
    "qa/comments.json",
    "qa/evidence",
    "specs",
    ".claude/skills",
    ".githooks",
  ]) {
    assert.ok(!exists(rel), `minimal scaffold still carries ${rel}`);
  }
});

test("the machine-owned region is EXACTLY the derived keep-set, and the lock attests it", () => {
  const kept = listHarnessFiles(out);
  const expected = [...laneKeepSet(path.join(ROOT, "template"))].sort();
  assert.deepEqual(kept, expected, "shipped lane region ≠ entry points + their import closure");
  assert.ok(kept.includes("qa/preview-gallery.mjs"), "the eyes lost their no-plugin surface");

  const integrity = checkHarnessIntegrity(out);
  assert.equal(integrity.status, "intact", `harness.lock does not attest the shipped subset: ${integrity.status}`);
});

test("the app and its tests survive intact", () => {
  for (const rel of [
    "composeApp/src/commonMain/kotlin/com/minapp/app",
    "composeApp/src/commonTest/kotlin/com/minapp/app",
    "composeApp/src/desktopTest/kotlin/com/minapp/app/conformance/ArchitectureConformanceTest.kt",
    "composeApp/src/desktopTest/kotlin/com/minapp/app/presentation/home/HomeGoldenTreeTest.kt",
    "qa/golden/home.json",
    "qa/e2e/smoke.yaml",
    "docs/ARCHITECTURE.md",
  ]) {
    assert.ok(exists(rel), `minimal scaffold lost ${rel}`);
  }
});

test("the hook set is advisory-only and tells the truth", () => {
  const settings = JSON.parse(read(".claude/settings.json"));
  assert.equal(settings.hooks.Stop, undefined, "the Stop hook shipped without its lane");
  const commands = Object.values(settings.hooks)
    .flat()
    .flatMap((g) => g.hooks)
    .map((h) => h.command);
  assert.ok(commands.length >= 2, "expected SessionStart + at least one PreToolUse nudge");
  // Every lane path a hook names must exist in the tree that shipped — naming
  // a kept script (the preview gallery) is honest; naming a deleted one lies.
  for (const c of commands) {
    for (const m of [...c.matchAll(/qa\/(?:lib\/)?[a-z-]+\.mjs/g)]) {
      assert.ok(exists(m[0]), `a hook names ${m[0]}, which this scaffold does not carry`);
    }
  }
  assert.ok(
    commands.some((c) => c.includes("harden")),
    "no hook names the climb command"
  );
});

test("CLAUDE.md is the ~40-line working guide, not the contract", () => {
  const claude = read("CLAUDE.md");
  const lines = claude.trimEnd().split("\n").length;
  assert.ok(lines <= 48, `minimal CLAUDE.md is ${lines} lines — the plan's ~40-line budget (pin: 48)`);
  assert.match(claude, /Min App — working guide/);
  assert.match(claude, /UI feedback loop/);
  assert.match(claude, /npx create-cmp-cli harden/);
  // Naming what full mode ADDS is honest; instructing the deleted lane is not.
  assert.ok(!claude.includes("node qa/verify.mjs"), "minimal CLAUDE.md instructs the deleted lane");
  assert.ok(!claude.includes("cmp:feature"), "marker noise shipped");
});

test("every stamped text surface is mode-honest — no command the tree cannot run", () => {
  for (const rel of ["AGENTS.md", "README.md", "CONTRIBUTING.md", "docs/TESTING.md", ".github/workflows/verify.yml"]) {
    const body = read(rel);
    assert.ok(!body.includes("cmp:feature"), `${rel} shipped marker noise`);
    assert.ok(!body.includes("node qa/verify.mjs"), `${rel} instructs the deleted lane`);
    assert.ok(!body.includes("qa/receipt-check"), `${rel} instructs the deleted receipt gate`);
  }
  assert.match(read("AGENTS.md"), /create-cmp-cli harden/);
  assert.match(read("README.md"), /create-cmp-cli harden/);
  assert.match(read(".github/workflows/verify.yml"), /desktopTest/);
});

test("the spec-of-record and the ADR record the mode decision", () => {
  const record = JSON.parse(read("create-cmp.json"));
  assert.equal(record.harness, false);

  const adrs = fs.readdirSync(path.join(out, "docs/adr"));
  const modeAdr = adrs.find((f) => {
    if (!f.endsWith(".md")) return false;
    return read(path.join("docs/adr", f)).includes("Minimal scaffold — verification harness deferred");
  });
  assert.ok(modeAdr, "no ADR records the --minimal decision");
});

test("a default (full) stamp is untouched by the mode split", async () => {
  const fullOut = path.join(tmpRoot, "full-app");
  await scaffold(minimalConfig(fullOut, { harness: true }), { verify: false });
  for (const rel of ["qa/verify.mjs", "qa/receipt-check.mjs", "specs/app-base.spec.md", ".claude/skills/add-feature/SKILL.md", "qa/approvals.json"]) {
    assert.ok(fs.existsSync(path.join(fullOut, rel)), `full stamp lost ${rel}`);
  }
  const settings = JSON.parse(fs.readFileSync(path.join(fullOut, ".claude/settings.json"), "utf8"));
  assert.ok(settings.hooks.Stop, "full stamp lost the Stop hook");
  const claude = fs.readFileSync(path.join(fullOut, "CLAUDE.md"), "utf8");
  assert.match(claude, /AI delivery contract/);
  assert.ok(claude.split("\n").length > 300, "full CLAUDE.md lost its body");
  const record = JSON.parse(fs.readFileSync(path.join(fullOut, "create-cmp.json"), "utf8"));
  assert.equal(record.harness, true);
});
