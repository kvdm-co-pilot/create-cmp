// `create-cmp attach` — M0a: the agent contract for an EXISTING Compose/KMP
// repo that create-cmp never scaffolded (docs/features/attach-mode.md is the
// design of record; LADDER §R5).
//
// The honesty constraint IS the design: a foreign repo carries none of the
// stamped machinery our discovery surfaces normally point at, so attach
// writes ONLY surfaces that are true in any Compose/KMP repo — the engine's
// own doctor/upgrade at the toolchain walls, and an advisory SessionStart
// context that says plainly what is and is not wired here. Previews, the
// lane, and enforcement are named as NOT wired (M0b's staged scope), never
// faked. Files are never clobbered: an existing differing file keeps its
// bytes and our content lands beside it as `*.cmp-new` (the same sidecar
// convention as `upgrade --harness` and `harden`).

import fs from "node:fs";
import path from "node:path";

import { colors, ok, warn, fail } from "../lib/log.mjs";
import { consent } from "../bootstrap/exec.mjs";
import { sessionStartCommand } from "../lib/hooks.mjs";
import { SIDECAR_SUFFIX } from "../lib/harness-upgrade.mjs";

const COMPOSE_SIGNALS = [
  "org.jetbrains.compose",
  'kotlin("multiplatform")',
  "org.jetbrains.kotlin.multiplatform",
  "org.jetbrains.kotlin.plugin.compose",
];

/** SessionStart context for an attached repo. No apostrophes (shell-quoted). */
export const ATTACH_SESSION_CONTEXT =
  "This Compose/KMP repo carries the create-cmp attach surfaces: AGENTS.md maps " +
  "toolchain walls to zero-consent commands (doctor diagnoses machine AND project, " +
  "upgrade diffs against a proven-green version set). No verify lane, previews, or " +
  "inspector are wired here — do not assume create-cmp scaffold machinery exists in " +
  "this repo. A new app scaffolded with npx create-cmp-cli would carry all of it.";

/** The attach rendering of the symptom table — only rows true in ANY Compose/KMP repo. */
export function attachAgentsMd() {
  return `# Agent instructions

This is an existing Compose/KMP repository with the create-cmp **attach surfaces**
installed: discovery for the walls every KMP build eventually hits. It was NOT
scaffolded by create-cmp — none of the generated-project machinery (verify lane,
headless previews, live inspector, generators) is wired here.

## Stuck? Symptom → command

Both commands run from the repo root with nothing to install — \`npx\` fetches on demand.

| Symptom | Run |
|---|---|
| Build broken, toolchain suspect | \`npx create-cmp-cli doctor --fix\` — diagnoses machine AND project (kotlin↔ksp lockstep, catalog drift); asks before any repair |
| Dependency versions stale or mismatched | \`npx create-cmp-cli upgrade --dry-run\` — diff against the next proven-green set before touching anything |

Famous build failures (kotlin↔KSP mismatch, the KSP2/iOS catch-22, \`SDK location not
found\`, \`No space left on device\`): \`doctor\` diagnoses all of them offline; the worked
write-ups live upstream at
<https://github.com/kvdm-co-pilot/create-cmp/tree/main/docs/errors>.

## What is NOT wired here

A create-cmp-scaffolded app additionally carries device-free screen previews (structure
for the agent, pixels for the human), a live on-device inspector, feature generators,
and a verify lane with evidence receipts and a machine-checked definition of done. Those
surfaces presuppose scaffold machinery this repo does not have; attach does not fake
them. To see the full contract, scaffold with \`npx create-cmp-cli@latest\`.
`;
}

function attachSettings() {
  return (
    JSON.stringify(
      {
        hooks: {
          SessionStart: [
            {
              matcher: "",
              hooks: [{ type: "command", command: sessionStartCommand(ATTACH_SESSION_CONTEXT) }],
            },
          ],
        },
      },
      null,
      2
    ) + "\n"
  );
}

/**
 * Classify the target directory. Pure; returns {ok:true} or {ok:false, reason}.
 */
export function classifyTarget(projectDir) {
  if (fs.existsSync(path.join(projectDir, "create-cmp.json"))) {
    return {
      ok: false,
      reason:
        "this is a create-cmp-stamped app (create-cmp.json present). Attach is for repos " +
        "create-cmp never scaffolded — use `create-cmp harden` (minimal → full) or " +
        "`create-cmp upgrade --harness` (refresh) here instead.",
    };
  }
  const hasGradleSettings =
    fs.existsSync(path.join(projectDir, "settings.gradle.kts")) ||
    fs.existsSync(path.join(projectDir, "settings.gradle"));
  if (!hasGradleSettings) {
    return {
      ok: false,
      reason: "no settings.gradle(.kts) — attach targets an existing Gradle Compose/KMP project.",
    };
  }
  // A Compose/KMP signal anywhere in the repo's build files (two levels deep
  // covers the conventional module layout without a full tree walk).
  const buildFiles = [];
  const collect = (dir, depth) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === "build" || e.name.startsWith(".")) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory() && depth > 0) collect(abs, depth - 1);
      else if (/^build\.gradle(\.kts)?$|^libs\.versions\.toml$/.test(e.name)) buildFiles.push(abs);
    }
  };
  collect(projectDir, 2);
  collect(path.join(projectDir, "gradle"), 1);
  const signals = buildFiles.some((f) => {
    try {
      const src = fs.readFileSync(f, "utf8");
      return COMPOSE_SIGNALS.some((s) => src.includes(s));
    } catch {
      return false;
    }
  });
  if (!signals) {
    return {
      ok: false,
      reason:
        "no Compose/KMP signal found in the build files (looked for the Compose or Kotlin " +
        "Multiplatform plugins). Attach only claims to help Compose/KMP repos.",
    };
  }
  return { ok: true };
}

/**
 * Plan (and optionally write) the attach surfaces. Testable core: no exit, no
 * prompt. Each unit lands as one of: current | written | sidecar.
 * @param {object} params
 * @param {string} params.projectDir
 * @param {boolean} [params.apply=false]
 * @returns {{units: Array<{relPath:string, action:string}>, notWired: string[]}}
 */
export function attachProject({ projectDir, apply = false }) {
  const target = classifyTarget(projectDir);
  if (!target.ok) throw new Error(target.reason);

  const files = [
    { relPath: "AGENTS.md", content: attachAgentsMd() },
    { relPath: ".claude/settings.json", content: attachSettings() },
  ];
  const units = [];
  for (const { relPath, content } of files) {
    const abs = path.join(projectDir, relPath);
    if (fs.existsSync(abs)) {
      const current = fs.readFileSync(abs, "utf8");
      if (current === content) {
        units.push({ relPath, action: "current" });
        continue;
      }
      if (apply) {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs + SIDECAR_SUFFIX, content);
      }
      units.push({ relPath, action: "sidecar" });
      continue;
    }
    if (apply) {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
    }
    units.push({ relPath, action: "written" });
  }

  return {
    units,
    notWired: [
      "headless screen previews (PreviewRegistry + renderScreens) — staged M0b, needs a per-repo Gradle wiring design",
      "live on-device inspector — ships with scaffolded apps; not injectable into a foreign build yet",
      "verify lane / evidence receipts / enforcement — the lane addresses the stamped layout by name",
    ],
  };
}

/**
 * `create-cmp attach [dir] [--dry-run] [--yes]`
 */
export async function runAttach(flags, positional) {
  const targetDir =
    (typeof flags["target-dir"] === "string" && flags["target-dir"]) || positional || ".";
  const projectDir = path.resolve(targetDir);

  process.stdout.write(
    `\n${colors.bold("create-cmp attach")} — agent contract for an existing Compose/KMP repo\n` +
      `  project: ${colors.cyan(projectDir)}\n\n`
  );

  let plan;
  try {
    plan = attachProject({ projectDir, apply: false });
  } catch (e) {
    fail(e.message);
    process.exit(1);
  }

  for (const u of plan.units) {
    if (u.action === "current") ok(`${u.relPath} — already current`);
    if (u.action === "written") process.stdout.write(`  will write ${u.relPath}\n`);
    if (u.action === "sidecar")
      warn(`${u.relPath} exists and differs — ours will land as ${u.relPath}${SIDECAR_SUFFIX}`);
  }
  process.stdout.write(`\n${colors.bold("Not wired")} (staged, never faked):\n`);
  for (const n of plan.notWired) process.stdout.write(`  · ${n}\n`);

  const actionable = plan.units.filter((u) => u.action !== "current");
  if (actionable.length === 0) {
    ok("\nNothing to do — attach surfaces are current.");
    process.exit(0);
  }
  if (flags["dry-run"] === true) {
    process.stdout.write(`\n${colors.yellow("Dry run")} — nothing written.\n`);
    process.exit(0);
  }
  const approved = await consent("\nWrite the attach surfaces?", { assumeYes: flags.yes === true });
  if (!approved) {
    process.stdout.write(`${colors.yellow("Not applied")} — re-run with --yes to skip the prompt.\n`);
    process.exit(0);
  }

  const applied = attachProject({ projectDir, apply: true });
  for (const u of applied.units) {
    if (u.action === "written") ok(`wrote ${u.relPath}`);
    if (u.action === "sidecar") warn(`wrote ${u.relPath}${SIDECAR_SUFFIX} (yours untouched)`);
  }
  process.exit(0);
}
