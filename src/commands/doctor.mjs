// `create-cmp doctor` — toolchain preflight (existing behavior, preserved) PLUS
// a project-diagnosis section that activates when run inside (or pointed at,
// via --target-dir) a directory with Gradle files. The project section works on
// ANY KMP project — not just ones we scaffolded.
//
//   create-cmp doctor [--yes] [--dry-run] [--no-ios] [--no-install]
//                     [--target-dir <dir>] [--fix]
//
// --fix applies only SAFE heals (write local.properties from ANDROID_HOME, add
// ksp.useKSP2=true, wire the walk into .claude/settings.json); everything else
// prints the exact manual step. Every one of them writes through `healWriter`, so
// --dry-run previews all of them and writes none — it used to reach the toolchain
// installer alone, and a dry run wrote three files.
//
// ONE of those heals rewrites a command that is already there, and it is the only
// one that asks first: `healShippedHookCommands` replaces a hook command that is
// byte-for-byte a form create-cmp itself shipped and has since replaced (the
// relative Stop and UserPromptSubmit hooks of every app stamped through 0.26.2,
// KD-85). Consent-gated, in place, and never a command the app wrote — see the
// function, and src/lib/shipped-hooks.mjs for what "a form create-cmp shipped" is
// allowed to mean.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { flagBool } from "../lib/args.mjs";
import { colors, ok } from "../lib/log.mjs";
import { consent, probe } from "../bootstrap/exec.mjs";
import { doctor as toolchainDoctor } from "../doctor.mjs";
import { anchorViolations, unfixedHookAnchors } from "../lib/hooks.mjs";
import {
  currentForms,
  healableCommands,
  planShippedHookHeal,
  worksFromAnyDirectory,
} from "../lib/shipped-hooks.mjs";
import { diagnoseProject } from "../lib/project-doctor.mjs";
import { parseProperties, upsertProperty, parseVersions } from "../lib/toml.mjs";
import { loadRegistry } from "../lib/registry.mjs";
import { listFiles } from "../lib/fsutil.mjs";

function readIfExists(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

/** Does this dir look like a Gradle project? (activates project diagnosis) */
export function isGradleProjectDir(dir) {
  return (
    fs.existsSync(path.join(dir, "settings.gradle.kts")) ||
    fs.existsSync(path.join(dir, "settings.gradle")) ||
    fs.existsSync(path.join(dir, "build.gradle.kts")) ||
    fs.existsSync(path.join(dir, "build.gradle")) ||
    fs.existsSync(path.join(dir, "gradle", "libs.versions.toml"))
  );
}

function androidHomeDir() {
  const envHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (envHome && fs.existsSync(envHome)) return envHome;
  const conventional = path.join(os.homedir(), "Library", "Android", "sdk");
  if (fs.existsSync(conventional)) return conventional;
  const linux = path.join(os.homedir(), "Android", "Sdk");
  if (fs.existsSync(linux)) return linux;
  return null;
}

/** ~/.konan size in bytes via `du -sk` (null when absent/unknown). */
function konanSizeBytes() {
  const konan = path.join(os.homedir(), ".konan");
  if (!fs.existsSync(konan)) return null;
  const r = probe("du", ["-sk", konan]);
  if (!r.ok) return null;
  const kb = parseInt(r.stdout.split(/\s+/)[0], 10);
  return Number.isFinite(kb) ? kb * 1024 : null;
}

/** Free disk bytes for the home volume (null when undeterminable). */
function freeDiskBytes() {
  try {
    const s = fs.statfsSync(os.homedir());
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

/** This engine checkout root — the template it ships is the wiring of record. */
const ENGINE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * The walk wiring the CURRENT engine template declares: the statusLine object
 * and the UserPromptSubmit hook groups that invoke qa/walk-status.mjs. Read from
 * template/.claude/settings.json rather than duplicated here, so the heal cannot
 * drift from what a fresh scaffold gets.
 * @returns {{statusLine: object|null, promptSubmit: Array|null}}
 */
export function templateWalkWiring() {
  const raw = readIfExists(path.join(ENGINE_ROOT, "template", ".claude", "settings.json"));
  if (raw === null) return { statusLine: null, promptSubmit: null };
  try {
    const t = JSON.parse(raw);
    const statusLine = invokesWalk(t.statusLine) ? t.statusLine : null;
    const groups = (t.hooks?.UserPromptSubmit ?? []).filter((g) =>
      (g?.hooks ?? []).some(invokesWalk)
    );
    return { statusLine, promptSubmit: groups.length > 0 ? groups : null };
  } catch {
    return { statusLine: null, promptSubmit: null };
  }
}

/** Does this settings entry ({type, command}) actually run the walk? */
function invokesWalk(entry) {
  return String(entry?.command ?? "").includes("walk-status.mjs");
}

/** The walk invocations registered on a surface (hook entries, or the statusLine). */
function walkInvocations(settings, surface) {
  if (surface === "statusLine") return invokesWalk(settings?.statusLine) ? [settings.statusLine] : [];
  return (settings?.hooks?.[surface] ?? []).flatMap((g) => (g?.hooks ?? []).filter(invokesWalk));
}

/** The two surfaces the walk is wired from, in the order an adopter reads them. */
const WALK_SURFACES = ["UserPromptSubmit", "statusLine"];

/**
 * The surfaces that invoke the walk with a command that resolves ONLY from the
 * project root. `[]` means no invocation present was JUDGED not to resolve — which
 * is not the same as "every one of them does" (see `unconfirmedWalkSurfaces`).
 *
 * Presence is not wiring, and `invokesWalk` above can only answer presence — it is
 * a substring test, so `node qa/walk-status.mjs --statusline`, the form the template
 * still ships on that surface, satisfies it while resolving against the SESSION's
 * directory rather than this one. That is the whole defect this exists to close: the
 * walk fails by printing nothing (`|| true`), so an `ok` here is the only thing
 * standing between an adopter and a surface that silently does nothing.
 *
 * Asked of `anchorViolations` (src/lib/hooks.mjs) rather than re-derived here,
 * because that detector is SURFACE-AWARE: it credits `${CLAUDE_PROJECT_DIR:-.}` on
 * a hook, where Claude Code sets the variable, and refuses to credit it on a
 * statusLine, where it does not (`ANCHORABLE_SURFACES`). A second opinion written
 * here is exactly how doctor would come to score an inert anchor as protection —
 * the failure `test/inert-anchor-scored-as-protection.test.mjs` forbids one level
 * down, in the detector this call reuses.
 *
 * It may OVER-report (KD-180's absolute path, KD-183's `cd`-anchored hook) and it
 * must never credit: nothing here reads health out of the detector's silence.
 */
function cwdRelativeWalkSurfaces(settings) {
  return [
    ...new Set(
      anchorViolations(settings)
        .filter((v) => v.paths.some((p) => p.endsWith("walk-status.mjs")))
        .map((v) => v.event ?? v.kind)
    ),
  ];
}

/**
 * Surfaces doctor may tell an adopter run from any directory — and the only evidence
 * that earns that sentence is RECOGNITION: every walk invocation on the surface is
 * byte-for-byte a command create-cmp ships, and that command has been executed from a
 * foreign directory in test/shipped-hooks-table.test.mjs.
 *
 * Every parse-derived route to this claim has been deleted, because this repository
 * has now written three of them and each was wrong in a new spelling: the detector's
 * silence credited a shape it cannot see (KD-86's bare basename, KD-87's `sh -c '…'`);
 * the anchor's presence credited a command whose anchor was on another path; the
 * detector's list subtracted from that carried the detector's blind spots straight
 * back in. A parser has an opinion about a command; the shell has the answer, and a
 * table of executed forms is the only way doctor holds one without running anything.
 *
 * A surface counts only when EVERY walk invocation on it is such a form. One that is
 * not is a session that silently gets nothing, and a surface that works sometimes is
 * not one a health check may call working.
 */
function workingWalkSurfaces(settings) {
  const inert = cwdRelativeWalkSurfaces(settings);
  return WALK_SURFACES.filter((surface) => {
    const invocations = walkInvocations(settings, surface);
    return (
      invocations.length > 0 &&
      invocations.every((entry) => worksFromAnyDirectory(surface, String(entry?.command ?? ""))) &&
      // Defensive, and structural: these two lists answer one question about one
      // surface, so a surface in both would be this program disagreeing with itself.
      !inert.includes(surface)
    );
  });
}

/**
 * Surfaces that invoke the walk with a command doctor can neither recognise nor fault:
 * not a form create-cmp ships, and not one the detector judged cwd-relative. Doctor
 * says so rather than picking a side — calling it broken would fail an adopter whose
 * hand-written hook works (KD-183's shape), and calling it working is the defect this
 * whole slice exists to close.
 */
function unconfirmedWalkSurfaces(settings) {
  const inert = cwdRelativeWalkSurfaces(settings);
  const working = workingWalkSurfaces(settings);
  return WALK_SURFACES.filter(
    (surface) =>
      walkInvocations(settings, surface).length > 0 && !inert.includes(surface) && !working.includes(surface)
  );
}

/** Walk surfaces whose command `doctor --fix` can rewrite (a superseded shipped form). */
function healableWalkSurfaces(settings) {
  return [
    ...new Set(
      healableCommands(settings)
        .filter((h) => h.command.includes("walk-status.mjs"))
        .map((h) => h.surface)
    ),
  ];
}

/**
 * Is the walk installed, does .claude/settings.json invoke it, and will those
 * invocations RESOLVE? The machinery and the wiring live in separately-owned files
 * (lane vs app config), so they can and do come apart — see the walk-wiring
 * finding in project-doctor.mjs.
 */
export function gatherWalkInputs(projectDir) {
  const scriptPresent = fs.existsSync(path.join(projectDir, "qa", "walk-status.mjs"));
  if (!scriptPresent) return null; // not a walk-carrying lane — nothing to say
  const raw = readIfExists(path.join(projectDir, ".claude", "settings.json"));
  if (raw === null) {
    return { scriptPresent, settingsPresent: false, statusLine: false, promptHook: false, cwdRelative: [], anchored: [] };
  }
  let settings;
  try {
    settings = JSON.parse(raw);
  } catch {
    // Unparseable settings invoke nothing, which is exactly what we report.
    return { scriptPresent, settingsPresent: true, statusLine: false, promptHook: false, cwdRelative: [], anchored: [] };
  }
  return {
    scriptPresent,
    settingsPresent: true,
    statusLine: invokesWalk(settings.statusLine),
    promptHook: (settings.hooks?.UserPromptSubmit ?? []).some((g) =>
      (g?.hooks ?? []).some(invokesWalk)
    ),
    cwdRelative: cwdRelativeWalkSurfaces(settings),
    anchored: workingWalkSurfaces(settings),
    unconfirmed: unconfirmedWalkSurfaces(settings),
    healable: healableWalkSurfaces(settings),
  };
}

/**
 * What .claude/settings.json carries that create-cmp put there and has since replaced
 * (`healable` — what `--fix` rewrites), and what the app wrote itself that will not
 * resolve from another directory (`unanchored` — reported with the form to paste, and
 * never rewritten: it is the app's command).
 *
 * The walk's own UserPromptSubmit violations are left to the walk-wiring finding, which
 * says more about them; everything else a hook runs — the Stop gate above all, which an
 * app stamped through 0.26.2 still has unanchored and which nothing here used to
 * mention (KD-85) — is reported here.
 *
 * @returns {{healable:Array, unanchored:Array}|null} null = no settings file, or one
 *          this cannot read, which is a state the walk-wiring finding already reports.
 */
export function gatherHookInputs(projectDir) {
  const raw = readIfExists(path.join(projectDir, ".claude", "settings.json"));
  if (raw === null) return null;
  let settings;
  try {
    settings = JSON.parse(raw);
  } catch {
    return null;
  }
  const healable = healableCommands(settings);
  const healableAt = new Set(healable.map((h) => h.location));
  const unanchored = unfixedHookAnchors(settings)
    .filter((v) => !healableAt.has(v.surface))
    .filter((v) => !(v.event === "UserPromptSubmit" && v.paths.some((p) => p.endsWith("walk-status.mjs"))))
    .map((v) => {
      const shipped = currentForms(v.event);
      return {
        surface: v.event,
        location: v.surface,
        command: v.command,
        paths: v.paths,
        // The template's own command for that surface, when it has exactly one AND it
        // runs one of the same scripts — the form to paste, for an adopter who edited
        // create-cmp's hook rather than writing their own. Offering the SessionStart
        // banner to someone whose SessionStart runs a script of their own would be
        // noise, so the path has to match for it to be worth printing.
        shipped:
          shipped.length === 1 && v.paths.some((p) => shipped[0].command.includes(p))
            ? shipped[0].command
            : null,
      };
    });
  return { healable, unanchored };
}

/**
 * The studio console's registry record for this app, when one exists — a
 * CROSS-PACKAGE CONTRACT with the inspector's preview-service.mjs
 * (consoleRegistryPath) and the harness's walk.mjs (consoleState):
 * sha1(resolved projectDir).slice(0,12) keys `cmp-console-<key>.json` in
 * os.tmpdir(), fields {pid, url}. pid-liveness only — no HTTP.
 */
export function gatherConsoleInputs(projectDir) {
  try {
    const key = crypto.createHash("sha1").update(path.resolve(projectDir)).digest("hex").slice(0, 12);
    const rec = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), `cmp-console-${key}.json`), "utf8"));
    if (!rec || typeof rec.pid !== "number") return null;
    let pidAlive = true;
    try {
      process.kill(rec.pid, 0);
    } catch (err) {
      pidAlive = Boolean(err && err.code === "EPERM");
    }
    return { pidAlive, url: typeof rec.url === "string" ? rec.url : null };
  } catch {
    return null; // no record — never started, or stopped cleanly
  }
}

/** Gather filesystem/env inputs for the pure diagnosis. */
export function gatherProjectInputs(projectDir) {
  const toml = readIfExists(path.join(projectDir, "gradle", "libs.versions.toml"));
  const gradleProperties = readIfExists(path.join(projectDir, "gradle.properties"));
  const localProperties = readIfExists(path.join(projectDir, "local.properties"));

  let sdkDirExists = null;
  if (localProperties !== null) {
    const sdkDir = parseProperties(localProperties).get("sdk.dir");
    if (sdkDir) {
      // local.properties escapes ':' and '\' on some platforms.
      const raw = sdkDir.value.replace(/\\(.)/g, "$1");
      sdkDirExists = fs.existsSync(raw);
    }
  }

  const hasIos =
    fs.existsSync(path.join(projectDir, "iosApp")) ||
    fs.existsSync(path.join(projectDir, "composeApp", "src", "iosMain"));

  let registry = null;
  try {
    registry = loadRegistry();
  } catch {
    // corrupt registry should not break doctor — drift check is skipped
  }

  const { inspectorHits, inspectorCatalog } = scanInspectorSources(projectDir);

  return {
    toml,
    gradleProperties,
    localProperties,
    sdkDirExists,
    androidHomeSet: androidHomeDir() !== null,
    hasIos,
    registry,
    konanBytes: konanSizeBytes(),
    freeDiskBytes: freeDiskBytes(),
    inspectorHits,
    inspectorCatalog,
    walk: gatherWalkInputs(projectDir),
    hooks: gatherHookInputs(projectDir),
    consoleRecord: gatherConsoleInputs(projectDir),
  };
}

/**
 * Static scan for the live-inspector release-safety check: which Kotlin sources
 * reference the inspector endpoint, and (for the catalog drift tripwire) the
 * stamped InspectorCatalog.kt + theme sources. Purely filesystem — doctor never
 * probes the network for this (the release guarantee is structural).
 */
function scanInspectorSources(projectDir) {
  const srcRoot = path.join(projectDir, "composeApp", "src");
  if (!fs.existsSync(srcRoot)) return { inspectorHits: null, inspectorCatalog: null };

  const hits = [];
  let catalog = null;
  let theme = "";
  for (const file of listFiles(srcRoot)) {
    if (!file.endsWith(".kt")) continue;
    const content = readIfExists(file);
    if (content === null) continue;
    const rel = path.relative(projectDir, file).split(path.sep).join("/");
    if (content.includes("/inspect/") || content.includes("InspectorHttpServer")) {
      hits.push(rel);
    }
    if (path.basename(file) === "InspectorCatalog.kt") catalog = content;
    if (/\/presentation\/theme\/(Tokens|Theme)\.kt$/.test(rel)) theme += `${content}\n`;
  }
  return {
    inspectorHits: hits,
    inspectorCatalog: catalog && theme ? { catalog, theme } : null,
  };
}

/**
 * THE ONE PLACE A PROJECT HEAL TOUCHES THE ADOPTER'S TREE, and the only thing
 * `--dry-run` has to be remembered in.
 *
 * It was remembered in none of them. `--dry-run` reached the toolchain installer and
 * stopped there, so `create-cmp doctor --fix --dry-run` wrote local.properties from
 * ANDROID_HOME, ksp.useKSP2 into gradle.properties, and CREATED .claude/settings.json in
 * a project that had none — measured, and the same class as KD-16's
 * `upgrade --dry-run true` writing the version catalog. A dry run that changes the tree
 * is the first row of the line docs/KNOWN-DEFECTS.md opens with, whenever it arrived.
 *
 * A check per heal would have been three checks and a fourth thing to remember, which is
 * the shape that produced the defect. So the flag lives here, the heals describe their
 * act and hand it over, and a dry run prints the same words the real run does — the two
 * runs read against each other, and a heal cannot quietly go silent under the flag.
 * `test/a-dry-run-writes-the-tree-it-is-previewing.test.mjs` refuses a heal in this file
 * that reaches around this function.
 *
 * @param {{dryRun?: boolean}} opts
 * @returns {((target:string, content:string, what:string) => boolean) & {wrote:number}}
 *          `what` is a noun phrase completing "wrote …" / "would write …". The return
 *          says whether the tree actually changed; `.wrote` counts the times it did.
 */
export function healWriter({ dryRun = false } = {}) {
  const write = (target, content, what) => {
    if (dryRun) {
      process.stdout.write(`${colors.dim(`[dry-run] --fix: would write ${what}`)}\n`);
      return false;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    write.wrote += 1;
    ok(`--fix: wrote ${what}`);
    return true;
  };
  write.wrote = 0;
  return write;
}

/**
 * Apply the SAFE auto-heals for --fix. Returns ids of findings it healed — under
 * `--dry-run`, the ids it WOULD have healed, since the report is the point of the flag.
 * @param {Function} [write] the tree-touching mechanism (see `healWriter`). Defaults to
 *        one that really writes, so a caller that never heard of the flag cannot get a
 *        silent no-op instead of a heal.
 */
export function applySafeFixes(projectDir, findings, inputs, write = healWriter()) {
  const fixed = [];
  for (const f of findings) {
    if (!f.fix || !f.fix.auto || f.level === "ok") continue;

    if (f.id === "local-properties") {
      const sdk = androidHomeDir();
      if (!sdk) continue;
      const target = path.join(projectDir, "local.properties");
      const existing = readIfExists(target) ?? "";
      const { content, changed } = upsertProperty(existing, "sdk.dir", sdk);
      if (changed) {
        write(target, content, `sdk.dir=${sdk} to local.properties`);
        fixed.push(f.id);
      }
    }

    if (f.id === "walk-wiring") {
      const { statusLine, promptSubmit } = templateWalkWiring();
      const target = path.join(projectDir, ".claude", "settings.json");
      const raw = readIfExists(target);
      let settings = {};
      if (raw !== null) {
        try {
          settings = JSON.parse(raw);
        } catch {
          // Never overwrite settings we could not read — that is the app's file.
          continue;
        }
      }
      let changed = false;
      if (statusLine && !invokesWalk(settings.statusLine)) {
        // Only claim an unclaimed slot: an app that set its OWN status line keeps it.
        if (!settings.statusLine) {
          settings.statusLine = statusLine;
          changed = true;
        }
      }
      if (promptSubmit) {
        settings.hooks = settings.hooks ?? {};
        const existing = settings.hooks.UserPromptSubmit ?? [];
        if (!existing.some((g) => (g?.hooks ?? []).some(invokesWalk))) {
          settings.hooks.UserPromptSubmit = [...existing, ...promptSubmit];
          changed = true;
        }
      }
      if (changed) {
        write(
          target,
          `${JSON.stringify(settings, null, 2)}\n`,
          "the walk into .claude/settings.json (statusLine + UserPromptSubmit)"
        );
        fixed.push(f.id);
      }
    }

    if (f.id === "ksp2-flag") {
      const target = path.join(projectDir, "gradle.properties");
      const existing = inputs.gradleProperties ?? "";
      const { content, changed } = upsertProperty(existing, "ksp.useKSP2", "true");
      if (changed) {
        write(target, content, "ksp.useKSP2=true into gradle.properties");
        fixed.push(f.id);
      }
    }
  }
  return fixed;
}

/**
 * THE ONE HEAL THAT REWRITES A COMMAND, and the only one in this file that asks
 * before writing.
 *
 * `applySafeFixes` above ADDS wiring and never touches a command that is already
 * there — correct, because .claude/settings.json is the app's file, and the reason
 * KD-85 recorded that every app stamped through 0.26.2 keeps its relative hooks with
 * nothing here able to reach them. What makes a rewrite defensible is not a better
 * parser: it is knowing, byte-for-byte, that the command in front of us is one
 * create-cmp itself wrote and has since replaced, and that the replacement differs
 * from it by the anchor alone (src/lib/shipped-hooks.mjs). Anything the app authored
 * is left exactly as it is and reported with the form to paste.
 *
 * It is still a write into someone else's repository, so it is consent-gated the way
 * every mutating act in this CLI is: `--yes` answers yes, a pipe with no `--yes`
 * declines and says what it would have done, `--dry-run` writes nothing at all.
 *
 * @param {string} projectDir
 * @param {{assumeYes?:boolean, dryRun?:boolean, ask?:Function, write?:Function}} opts
 * @returns {Promise<boolean>} did the file change?
 */
export async function healShippedHookCommands(
  projectDir,
  { assumeYes = false, dryRun = false, ask = consent, write = healWriter({ dryRun }) } = {}
) {
  const target = path.join(projectDir, ".claude", "settings.json");
  const raw = readIfExists(target);
  if (raw === null) return false;
  const plan = planShippedHookHeal(raw);
  // null = unreadable, or the in-place edit and JSON.parse disagreed about the
  // result. Never overwrite settings we could not account for — that is the app's file.
  if (plan === null || plan.rewrites.length === 0) return false;

  const n = plan.rewrites.length;
  const s = n === 1 ? "" : "s";
  process.stdout.write(
    `\n--fix: ${n} hook command${s} in .claude/settings.json ${n === 1 ? "is a form" : "are forms"} ` +
      `create-cmp itself shipped and has since replaced.\n` +
      `${colors.dim(`      The rewrite changes ${n === 1 ? "that command string" : "those command strings"} and no other byte of the file.`)}\n`
  );
  for (const r of plan.rewrites) {
    process.stdout.write(`  ${r.location}\n    ${colors.red(`- ${r.from}`)}\n    ${colors.green(`+ ${r.to}`)}\n`);
  }
  // The consent question is skipped under --dry-run rather than asked and ignored: a
  // prompt whose answer cannot matter teaches an adopter that the prompt does not mean
  // anything. The preview above, plus the writer's line below, is what the flag owes.
  if (!dryRun) {
    const approved = await ask(`  Rewrite ${n === 1 ? "it" : "them"} in ${target}?`, { assumeYes });
    if (!approved) {
      process.stdout.write(`  ${colors.dim(".claude/settings.json left exactly as it was.")}\n`);
      return false;
    }
  }
  return write(
    target,
    plan.content,
    `the anchored form of ${n} hook command${s} create-cmp shipped, into .claude/settings.json`
  );
}

function printFindings(findings) {
  for (const f of findings) {
    if (f.level === "ok") {
      process.stdout.write(`${colors.green("✓")} ${f.title} — ${colors.dim(f.detail)}\n`);
    } else if (f.level === "warn") {
      process.stdout.write(`${colors.yellow("!")} ${f.title}\n    ${colors.dim(f.detail)}\n`);
      if (f.fix) process.stdout.write(`    ${colors.cyan(f.fix.auto ? "fix (--fix):" : "fix:")} ${f.fix.description}\n`);
    } else {
      process.stdout.write(`${colors.red("✗")} ${f.title}\n    ${colors.dim(f.detail)}\n`);
      if (f.fix) process.stdout.write(`    ${colors.cyan(f.fix.auto ? "fix (--fix):" : "fix:")} ${f.fix.description}\n`);
    }
  }
}

/**
 * @param {Record<string,string|boolean>} flags
 * @param {string|undefined} positional optional target dir positional
 */
export async function runDoctor(flags, positional) {
  // 1) Toolchain preflight — unchanged existing behavior.
  const toolchain = await toolchainDoctor({
    assumeYes: flags.yes === true,
    dryRun: flags["dry-run"] === true,
    ios: flagBool(flags, "ios", true),
    installMissing: flags["no-install"] !== true,
  });

  // 2) Project diagnosis — only when pointed at / run inside a Gradle project.
  const targetDir =
    (typeof flags["target-dir"] === "string" && flags["target-dir"]) || positional || ".";
  const projectDir = path.resolve(targetDir);

  let projectGreen = true;
  if (isGradleProjectDir(projectDir)) {
    process.stdout.write(
      `\n${colors.bold("Project diagnosis")} — ${colors.cyan(projectDir)}\n` +
        `${colors.dim("(works on any KMP project — not only create-cmp-scaffolded ones)")}\n\n`
    );

    let inputs = gatherProjectInputs(projectDir);
    let findings = diagnoseProject(inputs);

    if (flags.fix === true) {
      // ONE writer for every heal in this command, so `--dry-run` is answered in one
      // place. `write.wrote` counts real writes: under the flag it stays 0, and the
      // report below is therefore the diagnosis of the tree as it still stands — which
      // is what a preview is for.
      const write = healWriter({ dryRun: flags["dry-run"] === true });
      const fixed = applySafeFixes(projectDir, findings, inputs, write);
      const rewrote = await healShippedHookCommands(projectDir, {
        assumeYes: flags.yes === true,
        dryRun: flags["dry-run"] === true,
        write,
      });
      if (write.wrote > 0) {
        // Re-diagnose so the report reflects the healed state.
        inputs = gatherProjectInputs(projectDir);
        findings = diagnoseProject(inputs);
      } else if (fixed.length === 0 && !rewrote && !findings.some((f) => f.id === "shipped-hooks")) {
        // A heal that was offered and declined (or previewed) is not "nothing
        // auto-fixable" — saying so would contradict the lines just printed.
        process.stdout.write(`${colors.dim("--fix: nothing auto-fixable found.")}\n`);
      }
    }

    printFindings(findings);
    projectGreen = !findings.some((f) => f.level === "fail");

    if (!flags.fix && findings.some((f) => f.fix?.auto && f.level !== "ok")) {
      process.stdout.write(
        `\n${colors.cyan("Tip:")} re-run with ${colors.bold("--fix")} to apply the safe heals above automatically.\n`
      );
    }
    if (inputs.toml) {
      const kotlin = parseVersions(inputs.toml).get("kotlin");
      if (kotlin) {
        process.stdout.write(`${colors.dim(`Project kotlin: ${kotlin.value}`)}\n`);
      }
    }
    process.stdout.write(
      projectGreen
        ? `\n${colors.green("Project diagnosis: no blocking issues.")}\n`
        : `\n${colors.red("Project diagnosis: blocking issues found (see ✗ above).")}\n`
    );
  }

  process.exit(toolchain.green && projectGreen ? 0 : 1);
}
