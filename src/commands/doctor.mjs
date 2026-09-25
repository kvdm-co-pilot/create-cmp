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
import { applyJsonEdits, tryEditJsonInPlace } from "../lib/json-in-place.mjs";
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
 * What in a parsed .claude/settings.json the walk's readers cannot read, in words that
 * complete "settings.json has a shape doctor does not read: …" — or null when they can.
 * ONE check for both readers of the file: the diagnosis (`gatherWalkInputs`) threw a
 * TypeError on exactly the shapes the heal (`applySafeFixes`) had its own guards for, so
 * the guards could never be reached through `doctor`.
 */
export function walkSettingsShapeProblem(settings) {
  if (settings === null || typeof settings !== "object" || Array.isArray(settings)) {
    return `its top level is ${jsonKind(settings)}, not an object`;
  }
  const hooks = settings.hooks;
  if (hooks === undefined || hooks === null) return null;
  if (typeof hooks !== "object" || Array.isArray(hooks)) return `"hooks" is ${jsonKind(hooks)}, not an object of events`;
  const groups = hooks.UserPromptSubmit;
  if (groups === undefined || groups === null) return null;
  if (!Array.isArray(groups)) return `"hooks.UserPromptSubmit" is ${jsonKind(groups)}, not an array of hook groups`;
  for (const [n, g] of groups.entries()) {
    const inner = g?.hooks;
    if (inner !== undefined && inner !== null && !Array.isArray(inner)) {
      return `"hooks.UserPromptSubmit[${n}].hooks" is ${jsonKind(inner)}, not an array of hooks`;
    }
  }
  return null;
}

/**
 * Can doctor read this .claude/settings.json text as the walk's wiring, and if not, why.
 * ONE judgement for every place that needs it (KD-237): the diagnosis (`gatherWalkInputs`,
 * which hands it to the walk-wiring finding as `unparseable` / `unreadable`, so the finding
 * offers `--fix` only over a file the heal will write) and the heal's decline
 * (`applySafeFixes`). An offer judged apart from the decline is how `fix (--fix):` came to
 * print one line above the refusal of that very fix.
 * @param {string} raw
 * @returns {{settings:unknown, parseError:(string|null), shape:(string|null)}} `parseError`
 *          is the first line of JSON.parse's refusal; `shape` is `walkSettingsShapeProblem`'s
 *          words for a file that parses into a shape doctor does not read.
 */
export function readWalkSettings(raw) {
  let settings;
  try {
    settings = JSON.parse(raw);
  } catch (err) {
    return { settings: undefined, parseError: String(err?.message ?? err).split("\n")[0], shape: null };
  }
  return { settings, parseError: null, shape: walkSettingsShapeProblem(settings) };
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
  const read = readWalkSettings(raw);
  if (read.parseError !== null) {
    // Unparseable settings invoke nothing, which is exactly what we report — and `--fix`
    // will not write them, which the finding must not promise otherwise (KD-237).
    return {
      scriptPresent, settingsPresent: true, statusLine: false, promptHook: false, cwdRelative: [], anchored: [],
      unparseable: read.parseError,
    };
  }
  const settings = read.settings;
  const unreadable = read.shape;
  if (unreadable !== null) {
    // A shape the readers below would throw on. What doctor cannot read counts as
    // invoking nothing — the status line still counts when the top level is an object
    // — and the shape itself is reported as its own finding (project-doctor.mjs).
    const statusLine = typeof settings === "object" && settings !== null && !Array.isArray(settings) && invokesWalk(settings.statusLine);
    return { scriptPresent, settingsPresent: true, statusLine, promptHook: false, cwdRelative: [], anchored: [], unreadable };
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
 * A WRITE THE SYSTEM REFUSES IS REPORTED, NOT THROWN (KD-214). An unwritable target
 * — a `.claude/` checked out read-only, a read-only mount, a full disk — used to throw
 * out of here, through every heal and past `printFindings`, so one optional heal took
 * the whole project diagnosis down with a raw stack. Now the refusal is printed in
 * words, recorded on `.failed`, and the heal returns false like one that changed
 * nothing; `runDoctor` still prints the diagnosis, names what was already applied, and
 * exits 1. Only an error the operating system raised (one with a `syscall`) is caught:
 * anything else is a defect in this file and still crashes loudly.
 *
 * A WRITE NEVER TRUNCATES THE FILE IT REPLACES (KD-241). `fs.writeFileSync(target)`
 * truncates first, so a full disk or a kill part-way left a truncated settings.json where
 * the app's own was, and KD-214's "could not write" was reported over bytes already gone.
 * Now the content goes to a temporary file in the target's own directory (so the rename
 * is atomic) and is renamed over it; on any failure the temporary file is unlinked, the
 * original keeps its bytes, and the refusal is reported as above. What the truncating
 * write did implicitly is kept explicitly: a symlinked target keeps its link (the file
 * written is the one it points at), the file keeps its mode, and a file this user may
 * not write is still refused (EACCES) rather than replaced, since a rename needs only
 * the directory's permission. The atomic write is inline, not a helper, so every fs call
 * that mutates the tree stays inside this body where the dry-run gate can see it.
 *
 * @param {{dryRun?: boolean}} opts
 * @returns {((target:string, content:string, what:string) => boolean)
 *            & {wrote:number, applied:string[], failed:Array<{what:string,target:string,reason:string}>}}
 *          `what` is a noun phrase completing "wrote …" / "would write …". The return
 *          says whether the tree actually changed; `.wrote` counts the times it did,
 *          `.applied` names them, and `.failed` holds every write the system refused.
 *          `.decline(target, what, reason)` is the other half: a heal that chose to write
 *          nothing says so and why, and `.declined` holds it — a heal offered as
 *          `fix (--fix)` and then skipped without a word is what made "nothing
 *          auto-fixable" print over a finding still offering one.
 */
export function healWriter({ dryRun = false } = {}) {
  const write = (target, content, what) => {
    if (dryRun) {
      process.stdout.write(`${colors.dim(`[dry-run] --fix: would write ${what}`)}\n`);
      return false;
    }
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      // Never truncate the target (KD-241): write a temporary file beside it, then rename
      // it over. See "A WRITE NEVER TRUNCATES" above for what this keeps and why it is here.
      let real = target;
      let mode;
      try {
        real = fs.realpathSync(target);
        mode = fs.statSync(real).mode & 0o7777;
      } catch (err) {
        if (err?.code !== "ENOENT") throw err;
      }
      if (mode !== undefined) fs.accessSync(real, fs.constants.W_OK);
      const tmp = path.join(
        path.dirname(real),
        `.${path.basename(real)}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`
      );
      try {
        fs.writeFileSync(tmp, content, { flag: "wx" });
        if (mode !== undefined) fs.chmodSync(tmp, mode);
        fs.renameSync(tmp, real);
      } catch (err) {
        try {
          fs.unlinkSync(tmp);
        } catch {
          // The write's own refusal is the one to report; a temporary file that will not go is secondary.
        }
        throw err;
      }
    } catch (err) {
      if (typeof err?.syscall !== "string") throw err;
      const reason = writeRefusalInWords(err);
      write.failed.push({ what, target, reason });
      process.stdout.write(
        `${colors.red("✗")} --fix: could not write ${what} — ${reason}\n    ${colors.dim(target)}\n`
      );
      return false;
    }
    write.wrote += 1;
    write.applied.push(what);
    ok(`--fix: wrote ${what}`);
    return true;
  };
  write.wrote = 0;
  write.applied = [];
  write.failed = [];
  write.declined = [];
  write.decline = (target, what, reason) => {
    write.declined.push({ what, target, reason });
    process.stdout.write(`${colors.yellow("!")} --fix: not writing ${what} — ${reason}\n    ${colors.dim(target)}\n`);
  };
  return write;
}

/** What the system said when it refused a write, in words; the code stays as the handle to search. */
const WRITE_REFUSALS = {
  EACCES: "permission denied: this user cannot write the file, or cannot create it in its directory",
  EPERM: "the operating system does not permit this write",
  EROFS: "the file system it is on is mounted read-only",
  ENOSPC: "the disk is full",
  EISDIR: "that path is a directory, not a file",
  ENOTDIR: "part of that path is a file where a directory should be",
};

export function writeRefusalInWords(err) {
  const code = typeof err?.code === "string" ? err.code : null;
  if (code && WRITE_REFUSALS[code]) return `${WRITE_REFUSALS[code]} (${code})`;
  // Never the stack: the first line of the system's own message, which names the call.
  const first = String(err?.message ?? err).split("\n")[0];
  return code && !first.includes(code) ? `${first} (${code})` : first;
}

/** A JSON value's kind, as a sentence names it. */
function jsonKind(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "an array";
  return typeof v === "object" ? "an object" : `a ${typeof v}`;
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
  // A write the system refused is not a heal (KD-214): `healWriter` records it on
  // `.failed` and returns false — which a dry run also returns, so the count is what
  // tells the two apart. A writer that keeps no `.failed` is one that never refuses.
  const refusals = () => write.failed?.length ?? 0;
  const heal = (id, target, content, what) => {
    const before = refusals();
    write(target, content, what);
    if (refusals() === before) fixed.push(id);
  };
  // A heal that writes nothing on purpose names itself and its reason; a writer that
  // keeps no `.declined` (a caller's own) still gets the words on stdout.
  const decline = (target, what, reason) => {
    if (typeof write.decline === "function") write.decline(target, what, reason);
    else process.stdout.write(`--fix: not writing ${what} — ${reason}\n    ${target}\n`);
  };
  for (const f of findings) {
    if (!f.fix || !f.fix.auto || f.level === "ok") continue;

    if (f.id === "local-properties") {
      const sdk = androidHomeDir();
      if (!sdk) continue;
      const target = path.join(projectDir, "local.properties");
      const existing = readIfExists(target) ?? "";
      const { content, changed } = upsertProperty(existing, "sdk.dir", sdk);
      if (changed) heal(f.id, target, content, `sdk.dir=${sdk} to local.properties`);
    }

    if (f.id === "walk-wiring") {
      const { statusLine, promptSubmit } = templateWalkWiring();
      const target = path.join(projectDir, ".claude", "settings.json");
      const what = "the walk into .claude/settings.json (statusLine + UserPromptSubmit)";
      const raw = readIfExists(target);
      let settings = {};
      if (raw !== null) {
        // The same judgement the finding's offer was made from (KD-237).
        const read = readWalkSettings(raw);
        if (read.parseError !== null) {
          // Never overwrite settings we could not read — that is the app's file.
          decline(target, what, `it is not JSON doctor can read (${read.parseError}), and a file doctor cannot read is never overwritten`);
          continue;
        }
        if (read.shape !== null) {
          decline(target, what, read.shape);
          continue;
        }
        settings = read.settings;
      }
      // What to ADD, as edits to the app's own text rather than a re-serialised copy of
      // it (KD-197): `JSON.stringify(settings, null, 2)` rewrote an app's indentation,
      // key order and `\u2014` escapes as a side effect of gaining a status line.
      const edits = [];
      // Only claim an unclaimed slot: an app that set its OWN status line keeps it.
      if (statusLine && !invokesWalk(settings.statusLine) && !settings.statusLine) {
        edits.push(
          Object.hasOwn(settings, "statusLine")
            ? { at: ["statusLine"], set: statusLine }
            : { at: [], add: "statusLine", value: statusLine }
        );
      }
      if (promptSubmit) {
        const hooks = settings.hooks;
        const existing = hooks?.UserPromptSubmit;
        if (!(Array.isArray(existing) && existing.some((g) => (g?.hooks ?? []).some(invokesWalk)))) {
          if (hooks === undefined) edits.push({ at: [], add: "hooks", value: { UserPromptSubmit: promptSubmit } });
          else if (hooks === null) edits.push({ at: ["hooks"], set: { UserPromptSubmit: promptSubmit } });
          // `walkSettingsShapeProblem` above has already declined every other shape.
          else if (existing === undefined) edits.push({ at: ["hooks"], add: "UserPromptSubmit", value: promptSubmit });
          else if (existing === null) edits.push({ at: ["hooks", "UserPromptSubmit"], set: promptSubmit });
          else edits.push({ at: ["hooks", "UserPromptSubmit"], push: promptSubmit });
        }
      }
      if (edits.length > 0) {
        // A file that is not there has no bytes to keep, so it is written in the
        // template's own shape; one that is there is edited where it stands.
        if (raw === null) {
          const content = `${JSON.stringify({ ...(statusLine ? { statusLine } : {}), ...(promptSubmit ? { hooks: { UserPromptSubmit: promptSubmit } } : {}) }, null, 2)}\n`;
          heal(f.id, target, content, what);
          continue;
        }
        const edited = tryEditJsonInPlace(raw, edits);
        if (edited.content !== undefined) {
          heal(f.id, target, edited.content, what);
          continue;
        }
        // A file that parsed, of a shape this heal accounts for, that the in-place editor
        // still declines (a duplicate key, say) is healed the way it was before KD-197:
        // re-serialised whole from what JSON.parse read. That changes bytes the app wrote,
        // so the line that reports the write says so, and why.
        heal(
          f.id,
          target,
          `${JSON.stringify(applyJsonEdits(settings, edits), null, 2)}\n`,
          `${what}, rewriting the whole file, because it could not be edited in place: ${edited.reason}. ` +
            "It is re-serialised from what JSON.parse reads, so its own formatting, and the value of any duplicate key JSON.parse ignores, is not kept"
        );
      }
    }

    if (f.id === "ksp2-flag") {
      const target = path.join(projectDir, "gradle.properties");
      const existing = inputs.gradleProperties ?? "";
      const { content, changed } = upsertProperty(existing, "ksp.useKSP2", "true");
      if (changed) heal(f.id, target, content, "ksp.useKSP2=true into gradle.properties");
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
    assumeYes: flagBool(flags, "yes", false),
    dryRun: flagBool(flags, "dry-run", false),
    ios: flagBool(flags, "ios", true),
    // The negative name is the only one this door documents, and `flagBool`
    // reads the DECLARED name, negated: `--no-install` is false, `--no-install false` is true — never the
    // undeclared `install`, which the parser would hand the next token as a value.
    installMissing: !flagBool(flags, "no-install", false),
  });

  // 2) Project diagnosis — only when pointed at / run inside a Gradle project.
  const targetDir =
    (typeof flags["target-dir"] === "string" && flags["target-dir"]) || positional || ".";
  const projectDir = path.resolve(targetDir);

  let projectGreen = true;
  // What --fix applied and what the system refused to let it write (KD-214), kept past
  // the heal block so the verdict at the bottom can say both.
  let healsApplied = [];
  let healsRefused = [];
  if (isGradleProjectDir(projectDir)) {
    process.stdout.write(
      `\n${colors.bold("Project diagnosis")} — ${colors.cyan(projectDir)}\n` +
        `${colors.dim("(works on any KMP project — not only create-cmp-scaffolded ones)")}\n\n`
    );

    let inputs = gatherProjectInputs(projectDir);
    let findings = diagnoseProject(inputs);

    if (flagBool(flags, "fix", false)) {
      // ONE writer for every heal in this command, so `--dry-run` is answered in one
      // place. `write.wrote` counts real writes: under the flag it stays 0, and the
      // report below is therefore the diagnosis of the tree as it still stands — which
      // is what a preview is for.
      const write = healWriter({ dryRun: flagBool(flags, "dry-run", false) });
      const fixed = applySafeFixes(projectDir, findings, inputs, write);
      const rewrote = await healShippedHookCommands(projectDir, {
        assumeYes: flagBool(flags, "yes", false),
        dryRun: flagBool(flags, "dry-run", false),
        write,
      });
      healsApplied = write.applied;
      healsRefused = write.failed;
      if (write.wrote > 0) {
        // Re-diagnose so the report reflects the healed state.
        inputs = gatherProjectInputs(projectDir);
        findings = diagnoseProject(inputs);
      } else if (
        fixed.length === 0 &&
        !rewrote &&
        healsRefused.length === 0 &&
        write.declined.length === 0 &&
        !findings.some((f) => f.id === "shipped-hooks")
      ) {
        // A heal that was offered and declined (or previewed, or named as one it will
        // not write) is not "nothing auto-fixable" — saying so would contradict the
        // lines just printed.
        process.stdout.write(`${colors.dim("--fix: nothing auto-fixable found.")}\n`);
      }
    }

    printFindings(findings);
    projectGreen = !findings.some((f) => f.level === "fail");

    if (!flagBool(flags, "fix", false) && findings.some((f) => f.fix?.auto && f.level !== "ok")) {
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
    if (healsRefused.length > 0) {
      // The diagnosis above still printed — that is the fix. What is owed on top of it
      // is the state --fix left the tree in, because a run that half-applied must say
      // which half (KD-214).
      const n = healsRefused.length;
      process.stdout.write(
        `\n${colors.red(`--fix: ${n} heal${n === 1 ? "" : "s"} could not be written, so doctor exits 1.`)}\n` +
          healsRefused.map((r) => `  ${colors.red("✗")} ${r.what} — ${r.reason}\n    ${colors.dim(r.target)}\n`).join("") +
          (healsApplied.length > 0
            ? `  Already applied in this run, and left in place (the diagnosis above is of the tree with them):\n` +
              healsApplied.map((w) => `  ${colors.green("✓")} ${w}\n`).join("")
            : `  No heal was applied in this run.\n`) +
          `  Clear what stopped ${n === 1 ? "it" : "them"}, then re-run ${colors.bold("doctor --fix")}.\n`
      );
    }
  }

  process.exit(toolchain.green && projectGreen && healsRefused.length === 0 ? 0 : 1);
}
