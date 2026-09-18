// Every command a stamped app's .claude/settings.json EXECUTES must resolve from
// any working directory — because Claude Code runs a hook in the SESSION's cwd,
// not in the directory holding settings.json.
//
// The defect this file exists to keep closed: the template shipped three
// cwd-relative commands (Stop, UserPromptSubmit, statusLine) while create-cmp's
// OWN .claude/settings.json had already anchored all of its entries with
// ${CLAUDE_PROJECT_DIR:-.}. The template IS the spec for a stamped app, so that
// delta was spec-mirror drift — and payment-blueprint paid for it on 2026-09-02
// ("Cannot find module …/services/qa/receipt-check.mjs") before anchoring its own
// copy eight days later. Apps stamped in between carry the defect; they live in
// other repositories and are not this file's to reach into.
//
// TWO instruments, deliberately, because either alone is insufficient:
//
//   STATIC — anchorViolations() over the real settings files, calibrated on a
//     KEPT plant (GATE-RULES Rule 1: the plant goes in the instrument, not in a
//     ceremony someone performs once and closes the terminal on). PLANTED_RELATIVE
//     below is the template exactly as it shipped through 0.26.2, so the detector
//     re-fails on its own violation, by surface name, on every run in
//     milliseconds. A detector that has only ever passed is an unread instrument.
//
//   BEHAVIOURAL — actually run the shipped commands with `sh -c` from a
//     SUBDIRECTORY. The static check alone is a lint that believes itself: it
//     proves the string changed shape, not that the new shape works where the old
//     one did not. These tests assert the relative form FAILS from a subdirectory
//     and the shipped form succeeds there, so the lint is bound to an observed
//     difference rather than to its own opinion.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ANCHORABLE_SURFACES,
  PROJECT_DIR_ANCHOR,
  anchorViolations,
  describeAnchorViolations,
  unanchoredPaths,
  unfixedHookAnchors,
} from "../src/lib/hooks.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
const TEMPLATE = read("template/.claude/settings.json");
const OWN = read(".claude/settings.json");

// --- the plant -------------------------------------------------------------
// The template as it shipped through 0.26.2. Kept verbatim: this is the
// calibration, and it costs microseconds to re-run forever.
const PLANTED_RELATIVE = Object.freeze({
  hooks: {
    Stop: [
      { matcher: "", hooks: [{ type: "command", command: "node qa/receipt-check.mjs --hook" }] },
    ],
    UserPromptSubmit: [
      {
        matcher: "",
        hooks: [
          {
            type: "command",
            command: "test -f qa/walk-status.mjs && node qa/walk-status.mjs --inject || true",
          },
        ],
      },
    ],
  },
  statusLine: {
    type: "command",
    command: "test -f qa/walk-status.mjs && node qa/walk-status.mjs --statusline || true",
  },
});

const plantedCommand = {
  stop: PLANTED_RELATIVE.hooks.Stop[0].hooks[0].command,
  prompt: PLANTED_RELATIVE.hooks.UserPromptSubmit[0].hooks[0].command,
  statusLine: PLANTED_RELATIVE.statusLine.command,
};

// The SHIPPED commands, read from the template rather than restated here — a
// behavioural test that re-types the command it claims to prove is testing the
// copy in its own source.
const shippedCommand = {
  stop: TEMPLATE.hooks?.Stop?.[0]?.hooks?.[0]?.command,
  prompt: TEMPLATE.hooks?.UserPromptSubmit?.[0]?.hooks?.[0]?.command,
  statusLine: TEMPLATE.statusLine?.command,
};

// --- static ----------------------------------------------------------------

test("PLANT: the template as it shipped through 0.26.2 fails the detector, by surface, on all three commands", () => {
  const found = anchorViolations(PLANTED_RELATIVE);
  assert.deepEqual(
    found.map((v) => v.surface),
    ["hooks.Stop[0].hooks[0]", "hooks.UserPromptSubmit[0].hooks[0]", "statusLine"],
    `the detector no longer catches the violation it was built for:\n${describeAnchorViolations(found)}`
  );
  assert.deepEqual(
    found.map((v) => v.paths),
    [["qa/receipt-check.mjs"], ["qa/walk-status.mjs"], ["qa/walk-status.mjs"]],
    "a violation was found but did not NAME the path that would fail to resolve"
  );
});

test("the shipped template anchors every HOOK command it executes", () => {
  const found = unfixedHookAnchors(TEMPLATE);
  assert.deepEqual(
    found,
    [],
    `template/.claude/settings.json invokes a path that will not resolve from a subdirectory:\n${describeAnchorViolations(found)}`
  );
});

test("the statusLine is the surface the anchor CANNOT fix, and it is pinned as that (KD-90)", () => {
  // CLAUDE_PROJECT_DIR is exported to hook commands (and stdio MCP / plugin LSP
  // servers). statusLine is absent from that list, and the statusline reference
  // names only COLUMNS and LINES as variables Claude Code sets — so the anchor
  // would expand to nothing there and `:-.` would quietly restore exactly the
  // behaviour it claims to fix. An inert anchor is worse than none: it reads as
  // protection. So the statusLine keeps the relative form, and this test exists
  // to make that a DECISION rather than an oversight.
  //
  // It receives the project root on STDIN as `workspace.project_dir` instead —
  // a different mechanism, not a different spelling, so the fix is its own slice.
  // When that lands, this test is the thing that tells you to delete it.
  assert.equal(ANCHORABLE_SURFACES.statusLine, false, "the contract changed — re-read the statusline reference");
  const statusLineViolations = anchorViolations(TEMPLATE).filter((v) => v.event === null);
  assert.deepEqual(
    statusLineViolations.map((v) => v.paths),
    [["qa/walk-status.mjs"]],
    "the statusLine stopped being the known gap — if it was fixed, fix this test and KD-90 with it"
  );
});

test("create-cmp's own settings.json is anchored too — the template must not lag the practice this repo proved", () => {
  const found = anchorViolations(OWN);
  assert.deepEqual(found, [], describeAnchorViolations(found));
});

test("narration is not invocation: a lane path inside single quotes is advice, and must not be flagged", () => {
  const mentions = Object.entries(TEMPLATE.hooks)
    .flatMap(([event, groups]) => groups.flatMap((g) => (g.hooks ?? []).map((h) => ({ event, command: h.command }))))
    .filter(({ event, command }) => !["Stop", "UserPromptSubmit"].includes(event) && command.includes("qa/"));

  // Without this, the negative control is vacuous — it would "pass" simply
  // because no command names a lane path at all.
  assert.ok(
    mentions.length >= 3,
    `expected the SessionStart banner and both PreToolUse nudges to still NAME lane paths; found ${mentions.length}`
  );
  for (const { event, command } of mentions) {
    assert.deepEqual(
      unanchoredPaths(command),
      [],
      `${event} narration was flagged as an invocation — anchoring advice addressed to an agent standing at the project root would be wrong: ${command.slice(0, 90)}`
    );
  }
});

test("a bare ${CLAUDE_PROJECT_DIR} is NOT anchored — unset, it expands to an absolute path at the filesystem root", () => {
  assert.deepEqual(unanchoredPaths('node "${CLAUDE_PROJECT_DIR}/qa/receipt-check.mjs"'), [
    "qa/receipt-check.mjs",
  ]);
  assert.deepEqual(unanchoredPaths(`node "${PROJECT_DIR_ANCHOR}/qa/receipt-check.mjs"`), []);
});

test("the detector reads a half-fix as a violation — anchoring one occurrence is not anchoring the command", () => {
  const halfFixed = `test -f "${PROJECT_DIR_ANCHOR}/qa/walk-status.mjs" && node qa/walk-status.mjs --inject || true`;
  assert.deepEqual(unanchoredPaths(halfFixed), ["qa/walk-status.mjs"]);
});

// --- behavioural -----------------------------------------------------------
// The part a static check cannot reach: does the command actually work?

const MARKERS = { "receipt-check.mjs": "RECEIPT-CHECK-RAN", "walk-status.mjs": "WALK-STATUS-RAN" };

/** A throwaway stamped-app shape: qa/ scripts that announce themselves, and a nested dir to run from. */
function appDir() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cmp-hook-anchor-")));
  fs.mkdirSync(path.join(dir, "qa"), { recursive: true });
  for (const [name, marker] of Object.entries(MARKERS)) {
    fs.writeFileSync(path.join(dir, "qa", name), `process.stdout.write(${JSON.stringify(marker)});\n`);
  }
  // The shape payment-blueprint was in when it hit this: a project root whose
  // sessions are opened one directory down.
  fs.mkdirSync(path.join(dir, "services", "app"), { recursive: true });
  return dir;
}

/**
 * Run a hook command the way Claude Code does — `sh -c`, in the session's cwd,
 * with CLAUDE_PROJECT_DIR naming the project root. Bounded: a hook that hangs is
 * a failure, not something to wait out.
 */
function runHook(command, { cwd, projectDir }) {
  const env = { ...process.env };
  // This suite runs inside a session that sets CLAUDE_PROJECT_DIR itself, so the
  // unset case has to be made, not assumed.
  if (projectDir === undefined) delete env.CLAUDE_PROJECT_DIR;
  else env.CLAUDE_PROJECT_DIR = projectDir;
  const res = spawnSync("sh", ["-c", command], {
    cwd,
    env,
    encoding: "utf8",
    timeout: 20_000,
    killSignal: "SIGKILL",
  });
  return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

test("behavioural: the Stop hook reaches its script from a SUBDIRECTORY only because it is anchored", () => {
  const dir = appDir();
  const sub = path.join(dir, "services", "app");
  try {
    // Control: the relative form is not broken in general — it works at the root.
    // Without this, a subdirectory failure proves nothing about the cwd.
    const atRoot = runHook(plantedCommand.stop, { cwd: dir, projectDir: dir });
    assert.equal(atRoot.status, 0, `the relative form failed even at the project root: ${atRoot.stderr}`);
    assert.match(atRoot.stdout, /RECEIPT-CHECK-RAN/);

    // The defect, reproduced: from one directory down, the script is unreachable.
    const relative = runHook(plantedCommand.stop, { cwd: sub, projectDir: dir });
    assert.notEqual(
      relative.status,
      0,
      "the relative Stop hook SURVIVED a subdirectory — the defect is not reproduced, so this test is not covering the fix"
    );
    assert.match(relative.stderr, /Cannot find module/, "failed for some reason other than resolution");
    assert.doesNotMatch(relative.stdout, /RECEIPT-CHECK-RAN/);

    // The fix: the command the template actually ships, same subdirectory.
    const anchored = runHook(shippedCommand.stop, { cwd: sub, projectDir: dir });
    assert.equal(anchored.status, 0, `the shipped Stop hook failed from a subdirectory: ${anchored.stderr}`);
    assert.match(anchored.stdout, /RECEIPT-CHECK-RAN/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

for (const surface of ["prompt"]) {
  test(`behavioural: the ${surface} hook fails SILENTLY when relative — same exit code, no output`, () => {
    const dir = appDir();
    const sub = path.join(dir, "services", "app");
    try {
      const atRoot = runHook(plantedCommand[surface], { cwd: dir, projectDir: dir });
      assert.match(atRoot.stdout, /WALK-STATUS-RAN/, "the control did not run even at the project root");

      // This is why these two are worse than the Stop hook: `test -f … || true`
      // turns a wrong directory into a clean exit with nothing to notice.
      const relative = runHook(plantedCommand[surface], { cwd: sub, projectDir: dir });
      assert.equal(relative.status, 0, "the guarded command reported failure — the silence IS the defect under test");
      assert.equal(relative.stdout, "", "the relative guarded command somehow produced output from a subdirectory");

      const anchored = runHook(shippedCommand[surface], { cwd: sub, projectDir: dir });
      assert.equal(anchored.status, 0, `the shipped ${surface} command errored: ${anchored.stderr}`);
      assert.match(
        anchored.stdout,
        /WALK-STATUS-RAN/,
        `the shipped ${surface} command still produced nothing from a subdirectory`
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

test("behavioural: the shipped statusLine STILL fails silently one directory down — the gap KD-90 names, measured", () => {
  // Not a wish: the honest current state, executed. The env anchor cannot reach a
  // statusLine command, so this surface is exactly as broken as before the slice
  // — and pinning it here is what stops the next reader assuming all three
  // surfaces were fixed because two of them were.
  const dir = appDir();
  try {
    const atRoot = runHook(shippedCommand.statusLine, { cwd: dir, projectDir: dir });
    assert.match(atRoot.stdout, /WALK-STATUS-RAN/, "the statusLine does not even work at the project root");

    const sub = runHook(shippedCommand.statusLine, { cwd: path.join(dir, "services", "app"), projectDir: dir });
    assert.equal(sub.status, 0, "silence with a clean exit IS the defect — a non-zero exit would be an improvement");
    assert.equal(
      sub.stdout,
      "",
      "the statusLine started surviving a subdirectory — if it was fixed, delete this test and close KD-90"
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("behavioural: with CLAUDE_PROJECT_DIR unset the anchor degrades to the relative form — it never makes things worse", () => {
  const dir = appDir();
  try {
    // `:-.` is the whole reason this is a safe change: no env var, no regression.
    const atRoot = runHook(shippedCommand.stop, { cwd: dir, projectDir: undefined });
    assert.equal(atRoot.status, 0, `anchored Stop hook broke at the root with no CLAUDE_PROJECT_DIR: ${atRoot.stderr}`);
    assert.match(atRoot.stdout, /RECEIPT-CHECK-RAN/);

    // And it degrades to exactly the old failure, not to a worse one: `/qa/...`
    // at the filesystem root is what a bare ${CLAUDE_PROJECT_DIR} would give.
    const subDir = path.join(dir, "services", "app");
    const sub = runHook(shippedCommand.stop, { cwd: subDir, projectDir: undefined });
    assert.notEqual(sub.status, 0);
    assert.ok(
      sub.stderr.includes(path.join(subDir, "qa", "receipt-check.mjs")),
      `unset CLAUDE_PROJECT_DIR resolved somewhere other than the cwd — the ':-.' default is not doing its job: ${sub.stderr.slice(0, 200)}`
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
