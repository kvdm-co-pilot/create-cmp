// The static anchoring detector, checked against EXECUTION — for every command
// in every `.claude/settings.json` this repo ships, not for three named by hand.
//
// `unanchoredPaths()` (src/lib/hooks.mjs) decides "anchored" by parsing a shell
// command. test/hook-anchoring.test.mjs already runs THREE commands, reached by
// literal index (`TEMPLATE.hooks.Stop[0].hooks[0].command`), and that is the part
// that does not scale: a fourth invoking command added to either file tomorrow —
// a new event, a second hook in an existing group — inherits static coverage only,
// and the static reader has measured blind spots (KD-87). This file closes that by
// enumerating the files instead of the commands.
//
// THE INVARIANT, and it is the under-report direction on purpose:
//
//     unanchoredPaths(command) === []   ⟹   every script the command reaches from
//                                            the project root, it also reaches from
//                                            a subdirectory of it.
//
// Over-report is annoying; under-report is a hook that silently stops running in a
// stamped app, which is the defect the whole slice exists to close. Ground truth is
// not a second parser — it is `sh -c`, twice, with stand-in scripts that announce
// themselves, so nothing here can agree with the detector by sharing its opinion.
//
// The second test keeps the blind spot a NUMBER rather than a paragraph: the
// shapes where the detector says "anchored" and execution disagrees, each with the
// disagreement MEASURED rather than argued. They are logged as KD-87 and none of
// them is written anywhere in this repo — which is the claim the first test is the
// standing gate for.
//
// Worth recording what did NOT survive execution, because the reasoning was
// convincing and wrong: an odd apostrophe in narration copy (`'it's advice'`) does
// not fool the masker into hiding a following invocation, because `sh` pairs quotes
// by exactly the same rule and refuses the whole command with a syntax error. The
// masker's single-quote handling is faithful to POSIX quoting, so there is no
// "phase shift" to exploit. Measured, not assumed.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { unanchoredPaths } from "../src/lib/hooks.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Every settings.json this repo ships or stamps from. */
const SETTINGS_FILES = ["template/.claude/settings.json", ".claude/settings.json"];

/** Deliberately WIDER than SCRIPT_PATH: this only decides what stand-ins to plant. */
const ANY_SCRIPT_PATH = /(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.(?:mjs|cjs|js|sh)\b/g;

/** `[{file, surface, command}]` for every command surface in a settings object. */
function commandSurfaces(file) {
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
  const out = [];
  for (const [event, groups] of Object.entries(settings.hooks ?? {})) {
    (groups ?? []).forEach((group, g) => {
      (group?.hooks ?? []).forEach((hook, h) => {
        if (typeof hook?.command === "string") {
          out.push({ file, surface: `hooks.${event}[${g}].hooks[${h}]`, command: hook.command });
        }
      });
    });
  }
  if (typeof settings.statusLine?.command === "string") {
    out.push({ file, surface: "statusLine", command: settings.statusLine.command });
  }
  return out;
}

/**
 * A stand-in project: every script path any of `commands` NAMES exists and prints
 * `RESOLVED:<relpath>` when node runs it, plus a subdirectory to open a session in.
 * Planting narration paths too is harmless — narration executes nothing, so it
 * announces nothing, and a command that reaches no script is skipped as vacuous.
 */
function fixture(commands) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cmp-anchor-diff-")));
  const planted = new Set();
  for (const command of commands) {
    for (const m of command.matchAll(ANY_SCRIPT_PATH)) planted.add(m[0]);
  }
  for (const rel of planted) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, `process.stdout.write("RESOLVED:${rel}\\n");\n`);
  }
  fs.mkdirSync(path.join(dir, "services", "app"), { recursive: true });
  return { dir, sub: path.join(dir, "services", "app"), planted };
}

/** Run a command the way Claude Code does, and report WHICH stand-ins announced. */
function reached(command, { cwd, projectDir }) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: projectDir };
  const res = spawnSync("sh", ["-c", command], {
    cwd,
    env,
    input: "", // several template commands read stdin (`in=$(cat)`); never hang on one
    encoding: "utf8",
    timeout: 30_000,
    killSignal: "SIGKILL",
  });
  const markers = [...String(res.stdout ?? "").matchAll(/^RESOLVED:(.+)$/gm)].map((m) => m[1]);
  return new Set(markers);
}

test("differential: a command the detector calls ANCHORED reaches, from a subdirectory, every script it reaches from the project root", () => {
  const surfaces = SETTINGS_FILES.flatMap(commandSurfaces);
  const { dir, sub } = fixture(surfaces.map((s) => s.command));
  try {
    let invoking = 0;
    for (const { file, surface, command } of surfaces) {
      if (unanchoredPaths(command).length > 0) continue; // the detector already refuses it
      const atRoot = reached(command, { cwd: dir, projectDir: dir });
      if (atRoot.size === 0) continue; // narration, or a guard that fired — nothing to lose
      invoking += 1;
      const fromSub = reached(command, { cwd: sub, projectDir: dir });
      const lost = [...atRoot].filter((p) => !fromSub.has(p));
      assert.deepEqual(
        lost,
        [],
        `${file} ${surface} reads as ANCHORED but loses ${lost.join(", ")} when the session is opened ` +
          `one directory down — a stamped app would lose this hook, silently if it is guarded ` +
          `(\`test -f … || true\`). Command: ${JSON.stringify(command)}`
      );
    }
    // Without this the gate is vacuous the day every command stops invoking anything.
    assert.ok(
      invoking >= 3,
      `expected at least the Stop, UserPromptSubmit and statusLine commands to actually run a ` +
        `script; only ${invoking} of ${surfaces.length} surfaces did — the differential is measuring nothing`
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// The measured edge of the static reader (KD-87). Two kinds, and the distinction
// is the finding rather than a detail:
//
//   "cwd-sensitive" — the detector says anchored, the command runs at the project
//     root and does NOT run one directory down. This is the under-report the gate
//     exists to prevent, arriving through the one door the masker cannot see: a
//     payload the shell hands to ANOTHER interpreter. `sh -c '…'` and `eval '…'`
//     are single-quoted spans that execute.
//
//   "broken-everywhere" — the detector says anchored and the command reaches
//     nothing from anywhere, because the anchor was written in single quotes and
//     the shell never expands it. `unanchoredPaths` reads each match's prefix from
//     the UNMASKED command, so literal anchor text counts as anchoring. Today the
//     behavioural tests in test/hook-anchoring.test.mjs catch this for the three
//     commands the template ships; the two consumer gates added alongside them
//     (the stamped settings.json, and what `doctor --fix` writes) are static-only
//     and would not.
const KD87_BLIND_SPOTS = [
  {
    kind: "cwd-sensitive",
    why: "a subshell payload is masked as narration, but `sh -c` executes it",
    command: "sh -c 'node qa/walk-status.mjs'",
  },
  {
    kind: "cwd-sensitive",
    why: "`eval` is the same door without a second process",
    command: "eval 'node qa/walk-status.mjs'",
  },
  {
    kind: "broken-everywhere",
    why: "an anchor inside SINGLE quotes is literal text the shell never expands, but the prefix is read from the unmasked command so it counts as anchoring",
    command: "node '${CLAUDE_PROJECT_DIR:-.}/qa/walk-status.mjs'",
  },
];

test("KD-87: the detector's blind spot is these measured shapes — each reads ANCHORED where execution disagrees", () => {
  const { dir, sub } = fixture(KD87_BLIND_SPOTS.map((c) => c.command));
  try {
    for (const { kind, why, command } of KD87_BLIND_SPOTS) {
      const note = `${kind} — ${why}: ${command}`;
      assert.deepEqual(
        unanchoredPaths(command),
        [],
        `this shape is no longer a blind spot — the detector refuses it now, so KD-87 has been ` +
          `narrowed and this calibration must be re-measured. ${note}`
      );
      const atRoot = reached(command, { cwd: dir, projectDir: dir });
      const fromSub = reached(command, { cwd: sub, projectDir: dir });
      if (kind === "cwd-sensitive") {
        assert.deepEqual([...atRoot], ["qa/walk-status.mjs"], `expected it to RUN at the root. ${note}`);
        assert.deepEqual(
          [...fromSub],
          [],
          `it survived a subdirectory, so it is not an under-report and KD-87 overstates the gap. ${note}`
        );
      } else {
        assert.deepEqual(
          [...atRoot],
          [],
          `the inert anchor resolved after all — the shell expanded a single-quoted variable, ` +
            `which would make this entry wrong. ${note}`
        );
        assert.deepEqual([...fromSub], [], `and nowhere else either. ${note}`);
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
