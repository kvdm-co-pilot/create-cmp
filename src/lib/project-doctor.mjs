// Project-level diagnosis for `create-cmp doctor` — works on ANY Gradle/KMP
// project with a gradle/libs.versions.toml, not only ones we scaffolded (this
// is the ecosystem-funnel feature). Pure logic: the command layer gathers
// filesystem/env inputs and passes them in, so every check unit-tests without
// touching disk.

import { PROJECT_DIR_ANCHOR } from "./hooks.mjs";
import { currentForms } from "./shipped-hooks.mjs";
import { parseVersions, parseProperties } from "./toml.mjs";
import { lockstepViolation } from "./upgrade.mjs";
import { nearestSet } from "./registry.mjs";

export const GIB = 1024 ** 3;
export const KONAN_WARN_BYTES = 10 * GIB;
export const DISK_WARN_BYTES = 3 * GIB;

/**
 * @typedef {object} Finding
 * @property {string} id
 * @property {"ok"|"warn"|"fail"} level
 * @property {string} title
 * @property {string} detail
 * @property {{auto:boolean, description:string}} [fix] auto = --fix can heal it
 */

/**
 * Diagnose a project from pre-gathered inputs.
 * @param {object} input
 * @param {string|null} input.toml          gradle/libs.versions.toml content (null = absent)
 * @param {string|null} input.gradleProperties gradle.properties content (null = absent)
 * @param {string|null} input.localProperties  local.properties content (null = absent)
 * @param {boolean|null} input.sdkDirExists  does local.properties sdk.dir point at a real dir (null = no sdk.dir line)
 * @param {boolean} input.androidHomeSet     ANDROID_HOME/ANDROID_SDK_ROOT points at a real dir
 * @param {boolean} input.hasIos             project has an iOS side (iosApp/ or iosMain sources)
 * @param {object|null} input.registry       version-set registry (null = skip drift check)
 * @param {number|null} input.konanBytes     ~/.konan size in bytes (null = unknown/absent)
 * @param {number|null} input.freeDiskBytes  free disk space in bytes (null = unknown)
 * @param {string[]|null} [input.inspectorHits] relative (posix) paths of Kotlin sources that
 *        reference the live-inspector endpoint (`/inspect/` or `InspectorHttpServer`);
 *        null = scan skipped (no composeApp sources), [] = project has no inspector code.
 * @param {{scriptPresent:boolean, settingsPresent:boolean, statusLine:boolean,
 *          promptHook:boolean, cwdRelative:string[], anchored:string[],
 *          unconfirmed:string[], healable:string[]}|null} [input.walk] the walk's
 *        wiring: is qa/walk-status.mjs installed, does .claude/settings.json actually
 *        INVOKE it (statusLine + UserPromptSubmit), and for each surface — judged
 *        cwd-relative, recognised as a shipped form that runs anywhere, or neither?
 *        null = skip the check.
 * @param {{healable:Array<{surface:string, location:string, command:string,
 *          successor:string, why:string}>,
 *          unanchored:Array<{surface:string, location:string, command:string,
 *          paths:string[], shipped:(string|null)}>}|null} [input.hooks] what
 *        .claude/settings.json carries that create-cmp shipped and has replaced, and
 *        what the app wrote that will not resolve from another directory.
 *        null = no settings file, or one that could not be read.
 * @param {{pidAlive:boolean, url:(string|null)}|null} [input.consoleRecord] the studio
 *        console's tmp-dir registry record for this app, when one exists: is its
 *        process still alive, and at what URL? null = no record (never started, or
 *        stopped cleanly — nothing to say).
 * @param {{catalog:string, theme:string}|null} [input.inspectorCatalog] the stamped
 *        InspectorCatalog.kt content + concatenated theme sources (Tokens.kt/Theme.kt) for
 *        the declared-token drift tripwire; null = skip.
 * @returns {Finding[]}
 */
export function diagnoseProject(input) {
  const findings = [];
  const {
    toml,
    gradleProperties,
    localProperties,
    sdkDirExists,
    androidHomeSet,
    hasIos,
    registry,
    konanBytes,
    freeDiskBytes,
    inspectorHits = null,
    inspectorCatalog = null,
    walk = null,
    hooks = null,
    consoleRecord = null,
  } = input;

  // --- version catalog ------------------------------------------------------
  let versions = null;
  if (toml === null) {
    findings.push({
      id: "version-catalog",
      level: "warn",
      title: "No gradle/libs.versions.toml",
      detail:
        "No version catalog found — version checks (kotlin↔ksp lockstep, drift vs proven-green sets) are skipped.",
    });
  } else {
    versions = parseVersions(toml);
    const values = Object.fromEntries([...versions].map(([k, v]) => [k, v.value]));

    // kotlin ↔ ksp lockstep (the classic KMP build-killer).
    if (values.kotlin && values.ksp) {
      const violation = lockstepViolation(values);
      if (violation) {
        findings.push({
          id: "kotlin-ksp-lockstep",
          level: "fail",
          title: "kotlin ↔ ksp lockstep VIOLATED",
          detail: violation.replace(" Refusing to write a broken pairing.", ""),
          fix: {
            auto: false,
            description: `Set ksp = "${values.kotlin}-<kspVersion>" in gradle/libs.versions.toml (or run \`create-cmp upgrade\` to move to a proven-green set).`,
          },
        });
      } else {
        findings.push({
          id: "kotlin-ksp-lockstep",
          level: "ok",
          title: "kotlin ↔ ksp lockstep",
          detail: `kotlin ${values.kotlin} / ksp ${values.ksp} agree.`,
        });
      }
    }

    // Known-bad combo: Room on Kotlin/Native (iOS) needs KSP2.
    if (values.room && hasIos) {
      const props = gradleProperties !== null ? parseProperties(gradleProperties) : new Map();
      const ksp2 = props.get("ksp.useKSP2");
      if (!ksp2 || ksp2.value !== "true") {
        findings.push({
          id: "ksp2-flag",
          level: "fail",
          title: "Room + iOS without ksp.useKSP2=true",
          detail:
            "Room's KSP processor on Kotlin/Native (iOS) requires KSP2. Without ksp.useKSP2=true the iOS " +
            "build dies with `ClassNotFoundException: org.jetbrains.kotlin.cli.utilities.MainKt` (the KSP2/iOS catch-22).",
          fix: { auto: true, description: "Add `ksp.useKSP2=true` to gradle.properties." },
        });
      } else {
        findings.push({
          id: "ksp2-flag",
          level: "ok",
          title: "ksp.useKSP2=true",
          detail: "Room + iOS detected and KSP2 is enabled (the native catch-22 is defused).",
        });
      }
    }

    // Known-bad combo: Room < 2.7 has no Kotlin/Native support at all.
    if (values.room && hasIos) {
      const m = values.room.match(/^(\d+)\.(\d+)/);
      if (m && (Number(m[1]) < 2 || (Number(m[1]) === 2 && Number(m[2]) < 7))) {
        findings.push({
          id: "room-native-support",
          level: "fail",
          title: `Room ${values.room} cannot target iOS`,
          detail: "Room gained Kotlin Multiplatform (native) support in 2.7.0 — upgrade Room to use it from iOS code.",
          fix: { auto: false, description: "Run `create-cmp upgrade` to move Room (and its lockstep partners) to a proven-green set." },
        });
      }
    }

    // Drift vs the nearest proven-green registry set.
    if (registry) {
      const near = nearestSet(registry, versions);
      if (near) {
        const drift = [];
        for (const [k, v] of Object.entries(near.set.versions)) {
          const cur = versions.get(k);
          if (cur && cur.value !== v) drift.push(`${k} ${cur.value} → ${v}`);
        }
        if (drift.length === 0) {
          findings.push({
            id: "registry-drift",
            level: "ok",
            title: `Matches proven-green set ${near.set.id}`,
            detail: "Every catalog version this set pins is at the proven-green value.",
          });
        } else {
          findings.push({
            id: "registry-drift",
            level: "warn",
            title: `Drift vs proven-green set ${near.set.id} (${drift.length} version${drift.length === 1 ? "" : "s"})`,
            detail: drift.join(", "),
            fix: { auto: false, description: `Run \`create-cmp upgrade --set ${near.set.id}\` to align (diff shown before anything is written).` },
          });
        }
      }
    }
  }

  // --- local.properties / SDK ------------------------------------------------
  if (localProperties === null) {
    findings.push({
      id: "local-properties",
      level: androidHomeSet ? "warn" : "fail",
      title: "No local.properties",
      detail: androidHomeSet
        ? "local.properties is missing, but ANDROID_HOME/ANDROID_SDK_ROOT is set so Gradle can still resolve the SDK."
        : "local.properties is missing and ANDROID_HOME/ANDROID_SDK_ROOT is not set — the Android build cannot locate an SDK.",
      fix: {
        auto: androidHomeSet,
        description: androidHomeSet
          ? "Write local.properties with sdk.dir from ANDROID_HOME."
          : "Install the Android SDK (run `create-cmp doctor` toolchain bootstrap), then set ANDROID_HOME or write local.properties with sdk.dir=<sdk path>.",
      },
    });
  } else if (sdkDirExists === null) {
    findings.push({
      id: "local-properties",
      level: androidHomeSet ? "warn" : "fail",
      title: "local.properties has no sdk.dir",
      detail: "local.properties exists but declares no sdk.dir.",
      fix: {
        auto: androidHomeSet,
        description: androidHomeSet
          ? "Add sdk.dir from ANDROID_HOME to local.properties."
          : "Add `sdk.dir=<android sdk path>` to local.properties or export ANDROID_HOME.",
      },
    });
  } else if (sdkDirExists === false) {
    findings.push({
      id: "local-properties",
      level: "fail",
      title: "sdk.dir points at a missing directory",
      detail: "local.properties sdk.dir does not exist on disk — Gradle will fail to resolve the Android SDK.",
      fix: {
        auto: androidHomeSet,
        description: androidHomeSet
          ? "Rewrite sdk.dir from ANDROID_HOME."
          : "Fix sdk.dir in local.properties to point at a real Android SDK install.",
      },
    });
  } else {
    findings.push({
      id: "local-properties",
      level: "ok",
      title: "local.properties sdk.dir",
      detail: "sdk.dir exists and points at a real directory.",
    });
  }

  // --- environment ------------------------------------------------------------
  if (typeof konanBytes === "number") {
    if (konanBytes > KONAN_WARN_BYTES) {
      findings.push({
        id: "konan-size",
        level: "warn",
        title: `~/.konan is ${formatBytes(konanBytes)}`,
        detail:
          "The Kotlin/Native toolchain cache has accumulated old compiler versions. Stale prebuilt toolchains are safe to remove.",
        fix: { auto: false, description: "Run `create-cmp clean` to report and remove stale kotlin-native-prebuilt versions." },
      });
    } else {
      findings.push({
        id: "konan-size",
        level: "ok",
        title: `~/.konan is ${formatBytes(konanBytes)}`,
        detail: "Within the expected footprint.",
      });
    }
  }

  if (typeof freeDiskBytes === "number") {
    if (freeDiskBytes < DISK_WARN_BYTES) {
      findings.push({
        id: "disk-free",
        level: "warn",
        title: `Only ${formatBytes(freeDiskBytes)} free disk space`,
        detail:
          "KMP builds routinely fail mid-package with `No space left on device` below ~3 GB free. Free space before building.",
        fix: { auto: false, description: "Run `create-cmp clean` (project build dirs + stale ~/.konan), and consider `rm -rf ~/.gradle/caches` manually." },
      });
    } else {
      findings.push({
        id: "disk-free",
        level: "ok",
        title: `${formatBytes(freeDiskBytes)} free disk space`,
        detail: "Enough headroom for a KMP build (needs ≥3 GB).",
      });
    }
  }

  // --- live inspector placement (must never be reachable in release) ---------
  // Static check by design: no network probe, no adb — the release guarantee is
  // STRUCTURAL (inspector code lives only in the androidDebug source set), so we
  // verify structure. inspectorHits are Kotlin sources referencing the inspector
  // endpoint ("/inspect/" or InspectorHttpServer).
  if (Array.isArray(inspectorHits) && inspectorHits.length > 0) {
    const leaks = inspectorHits.filter((p) => !normalizePath(p).includes("/androidDebug/"));
    if (leaks.length === 0) {
      findings.push({
        id: "inspector-placement",
        level: "ok",
        title: "Live inspector is debug-only",
        detail:
          "All inspector endpoint code lives in the androidDebug source set — structurally absent from release builds.",
      });
    } else {
      findings.push({
        id: "inspector-placement",
        level: "warn",
        title: "Inspector endpoint may be reachable in RELEASE builds",
        detail:
          `Inspector code referenced outside androidDebug: ${leaks.join(", ")}. ` +
          "The live inspector server must never ship in release — keep the server, root registry " +
          "and catalog in composeApp/src/androidDebug/kotlin only (the androidRelease twin must stay a no-op).",
        fix: {
          auto: false,
          description:
            "Move the offending code back to composeApp/src/androidDebug/kotlin (release keeps only the no-op startInspector() twin).",
        },
      });
    }
  }

  // --- inspector catalog drift tripwire ---------------------------------------
  // The design-system catalog is a hand-registry: a token ADDED to the theme but
  // missing from InspectorCatalog.kt silently vanishes from /inspect/design-system.
  if (inspectorCatalog && inspectorCatalog.catalog && inspectorCatalog.theme) {
    const declared = [...inspectorCatalog.theme.matchAll(/^\s*val\s+([A-Z]\w*)\s*=/gm)].map((m) => m[1]);
    const missing = declared.filter((name) => !inspectorCatalog.catalog.includes(`"${name}"`));
    if (missing.length === 0) {
      findings.push({
        id: "inspector-catalog-drift",
        level: "ok",
        title: "Inspector catalog covers all declared tokens",
        detail: `Every theme token (${declared.length}) appears in InspectorCatalog.kt.`,
      });
    } else {
      findings.push({
        id: "inspector-catalog-drift",
        level: "warn",
        title: `Inspector catalog is missing ${missing.length} declared token${missing.length === 1 ? "" : "s"}`,
        detail:
          `Declared in the theme but absent from InspectorCatalog.kt: ${missing.join(", ")}. ` +
          "These tokens will not appear on /inspect/design-system, so drift on them goes uncaught.",
        fix: { auto: false, description: "Add the missing entries to InspectorCatalog.kt (read from the real theme objects)." },
      });
    }
  }

  // --- the walk: installed but unwired ----------------------------------------
  // qa/walk-status.mjs is inert on its own. What renders it is .claude/settings.json:
  // a statusLine (the ambient "where are we") and a UserPromptSubmit hook (the
  // per-turn position injected into the agent). Both are APP-OWNED config, so an app
  // that hand-edited settings.json can take the machinery on upgrade and lose the
  // wiring — and the failure mode is silence, which is precisely the problem the walk
  // exists to fix. Nothing else in the system can notice, so doctor does.
  //
  // PRESENT IS NOT WIRED, and this check said it was. A command is invoked from
  // the SESSION's directory, so `node qa/walk-status.mjs` reaches the walk only
  // when that directory happens to be this one — and `|| true` makes the miss
  // silent. `walk.cwdRelative` (src/commands/doctor.mjs) names the surfaces that
  // will not resolve; an `ok` handed to one of them is this file's own sentence
  // above turned inside out, since the adopter is then told by the diagnostic
  // that the silence cannot happen. Absence is reported ahead of inertness on
  // purpose: absence is what `--fix` can heal, and a healed project re-diagnoses
  // into the inert warning below rather than skipping it.
  if (walk !== null && walk.scriptPresent) {
    const missing = [
      !walk.statusLine ? "no statusLine" : null,
      !walk.promptHook ? "no UserPromptSubmit hook" : null,
    ].filter(Boolean);
    const inert = walk.cwdRelative ?? [];
    const unconfirmed = walk.unconfirmed ?? [];
    const promptForm = currentForms("UserPromptSubmit")[0]?.command ?? null;
    const named = (s) => (s === "statusLine" ? "the status line" : `the ${s} hook`);
    const joined = (xs) => xs.map(named).join(" and ");
    const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
    if (missing.length === 0 && inert.length === 0 && unconfirmed.length === 0) {
      findings.push({
        id: "walk-wiring",
        level: "ok",
        title: "The walk is wired",
        detail:
          "qa/walk-status.mjs is installed and .claude/settings.json invokes it from both the " +
          "status line and UserPromptSubmit.",
      });
    } else if (missing.length === 0) {
      // Both surfaces invoke the walk; at least one of them cannot reach it, or
      // cannot be shown to. What the remedy is differs by surface, and the
      // difference is not a preference: `${CLAUDE_PROJECT_DIR:-.}` repairs a hook
      // because Claude Code exports that variable to hook commands, and cannot
      // repair a status line because it does not export it there (documented
      // behaviour of the harness this template ships into — a fact this repository
      // cannot re-derive; see ANCHORABLE_SURFACES in src/lib/hooks.mjs and KD-90).
      //
      // THREE ANSWERS, NOT TWO, and the third is the point. `inert` is what the
      // detector JUDGED cwd-relative. `working` is what doctor RECOGNISES: a
      // command byte-for-byte identical to one create-cmp ships, whose own
      // execution from a foreign directory is pinned in
      // test/shipped-hooks-table.test.mjs. Everything else is `unconfirmed` — a
      // command doctor has neither run nor recognised — and saying so is the whole
      // repair here. Reading health out of a detector's silence is what printed
      // "the UserPromptSubmit hook is anchored and still works from any directory"
      // over a hook that produced nothing, three fixes running; the opposite
      // reading would fail an adopter whose hand-written hook works (KD-183).
      const working = (walk.anchored ?? []).filter((s) => (s === "statusLine" ? walk.statusLine : walk.promptHook));
      const healable = (walk.healable ?? []).filter((s) => s !== "statusLine");
      const one = inert.length === 1;
      const unconfirmedOne = unconfirmed.length === 1;
      const hooks = inert.filter((s) => s !== "statusLine" && !healable.includes(s));
      const unconfirmedHooks = unconfirmed.filter((s) => s !== "statusLine");
      const inertTitle = `${joined(inert)} only run${one ? "s" : ""} when the session starts at the project root`;
      const unconfirmedTitle = `doctor cannot confirm ${joined(unconfirmed)} run${unconfirmedOne ? "s" : ""} from any directory`;
      findings.push({
        id: "walk-wiring",
        level: "warn",
        title:
          inert.length > 0
            ? `The walk is wired, but ${inertTitle}${unconfirmed.length > 0 ? `, and ${unconfirmedTitle}` : ""}`
            : `The walk is wired, but ${unconfirmedTitle}`,
        detail:
          (inert.length > 0
            ? `.claude/settings.json invokes qa/walk-status.mjs from both surfaces, but ${joined(inert)} ` +
              `name${one ? "s" : ""} it by a path relative to the SESSION's directory rather than to this ` +
              "project. A session opened anywhere else — the monorepo services/ layout the walk exists to " +
              "serve — finds no script there, and `|| true` turns that into a clean exit with no output, so " +
              "the surface shows nothing instead of reporting an error. "
            : "") +
          (unconfirmed.length > 0
            ? `${cap(joined(unconfirmed))} invoke${unconfirmedOne ? "s" : ""} the walk with a command ` +
              `create-cmp does not ship, so doctor neither recognises ${unconfirmedOne ? "it" : "them"} nor ` +
              `runs ${unconfirmedOne ? "it" : "them"}: whether the walk is reached from a directory other ` +
              "than this one is a question only the shell can answer. "
            : "") +
          // What still works, derived rather than asserted: a warning that reads
          // "your walk is broken" while two thirds of it runs would be its own
          // false statement, in the surface this finding exists to make honest.
          (working.length > 0
            ? `${cap(joined(working))} ${working.length === 1 ? "is" : "are"} anchored and still ` +
              `work${working.length === 1 ? "s" : ""} from any directory, and running ` +
              // "From the project root", not "always": the sentences above exist to say
              // that this relative path finds no script from any other directory (KD-216).
              "node qa/walk-status.mjs by hand from the project root still works."
            : "Running node qa/walk-status.mjs by hand still works."),
        fix: {
          // No automatic heal is offered FROM THIS FINDING even when one exists:
          // what --fix can rewrite is a command create-cmp shipped, and the
          // shipped-hooks finding below is where that is said, once, for every
          // surface rather than only the walk's.
          auto: false,
          description:
            (healable.length > 0
              ? `Anchor ${joined(healable)}: it is the form create-cmp itself shipped before the template was ` +
                "anchored, not one your app wrote, so `create-cmp doctor --fix` rewrites it for you. "
              : "") +
            (hooks.length > 0
              ? `Anchor ${joined(hooks)} in .claude/settings.json as "\${CLAUDE_PROJECT_DIR:-.}/qa/walk-status.mjs" ` +
                "(the form the current engine template ships); doctor never rewrites a command your app already owns. "
              : "") +
            (unconfirmedHooks.length > 0 && promptForm !== null
              ? `If ${joined(unconfirmedHooks)} is meant to run from any directory, the command create-cmp ` +
                `ships is: "command": ${JSON.stringify(promptForm)}. `
              : "") +
            (inert.includes("statusLine") || unconfirmed.includes("statusLine")
              ? "The status line has no such remedy — CLAUDE_PROJECT_DIR is not set for a status line command, so " +
                "writing the anchor there would read as a fix and change nothing. Until that surface is fixed " +
                "upstream, start sessions at the project root, or read the walk with node qa/walk-status.mjs."
              : ""),
        },
      });
    } else {
      findings.push({
        id: "walk-wiring",
        level: "warn",
        title: "The walk is installed but not wired up",
        detail:
          "qa/walk-status.mjs is present, but " +
          (walk.settingsPresent
            ? `.claude/settings.json does not invoke it (${missing.join(", ")}).`
            : "there is no .claude/settings.json to invoke it from.") +
          " Nothing will show which stage a feature is at, or tell the agent where it is — " +
          "the walk runs nowhere. Running node qa/walk-status.mjs by hand still works.",
        fix: {
          auto: true,
          description:
            "Add the statusLine and UserPromptSubmit entries to .claude/settings.json " +
            "(copied from the engine template; existing hooks are left untouched).",
        },
      });
    }
  }

  // --- hook commands: create-cmp's own, and the app's -------------------------
  // Two different questions about the same file, and the difference is who wrote
  // the command. A command byte-for-byte identical to one create-cmp stamped and
  // has since replaced is create-cmp's to correct — that is the whole basis for
  // `--fix` rewriting anything in a file the app owns, and it is why the list is a
  // committed table of shipped bytes rather than a parser's opinion of a shape
  // (src/lib/shipped-hooks.mjs). A command the app wrote is reported and left
  // alone, with the exact form to paste: doctor's job there ends at telling them.
  //
  // The Stop hook is the reason this exists. Every app stamped through 0.26.2 has
  // `node qa/receipt-check.mjs --hook`, which resolves only from the project root —
  // and until this finding, nothing create-cmp could run so much as mentioned it
  // (KD-85, "only two of the three commands are reported").
  if (hooks !== null) {
    const healable = hooks.healable ?? [];
    const unanchored = hooks.unanchored ?? [];
    // The surface as an adopter knows it, with the settings path that locates it:
    // "the Stop hook" is what they recognise, `hooks.Stop[0].hooks[0]` is what they
    // edit, and a report that gives one without the other costs them a search.
    const where = (h) => `${h.surface === "statusLine" ? "the status line" : `the ${h.surface} hook`} (${h.location})`;
    const sentence = (t) => t.charAt(0).toUpperCase() + t.slice(1);
    if (healable.length > 0) {
      const one = healable.length === 1;
      findings.push({
        id: "shipped-hooks",
        level: "warn",
        title:
          `${healable.length} hook command${one ? "" : "s"} in .claude/settings.json ${one ? "is a form" : "are forms"} ` +
          "create-cmp itself shipped and has since replaced",
        detail:
          sentence(`${healable.map((h) => `${where(h)} runs \`${h.command}\`, which ${h.why}`).join("; ")}. `) +
          `The form the current template ships differs by the anchor alone (${PROJECT_DIR_ANCHOR}), which ` +
          "Claude Code sets for every hook command — so the rewrite runs the same script from the project " +
          "root and the right one from every other directory, whatever version of the lane this app carries.",
        fix: {
          auto: true,
          description:
            "`create-cmp doctor --fix` rewrites exactly these commands to the form the current template " +
            "ships, and changes no other byte of .claude/settings.json. It asks first, because the file is " +
            "your app's: --yes approves, --dry-run previews.",
        },
      });
    }
    if (unanchored.length > 0) {
      const one = unanchored.length === 1;
      const first = unanchored[0];
      findings.push({
        id: "unanchored-hooks",
        level: "warn",
        title:
          `${unanchored.length} hook command${one ? "" : "s"} in .claude/settings.json ` +
          `name${one ? "s" : ""} a script by a path relative to the SESSION's directory`,
        detail:
          sentence(`${unanchored.map((u) => `${where(u)} runs ${u.paths.join(", ")} in \`${u.command}\``).join("; ")}. `) +
          "Claude Code runs a hook with the cwd of the SESSION, not the directory holding " +
          ".claude/settings.json, so a session opened in a subdirectory (the monorepo services/ layout) " +
          `reaches no script at that path. ${one ? "This is not a command" : "These are not commands"} ` +
          `create-cmp ships, so doctor does not rewrite ${one ? "it" : "them"}.`,
        fix: {
          auto: false,
          description:
            `Anchor each path in .claude/settings.json as "${PROJECT_DIR_ANCHOR}/<path>" — for ` +
            `${where(first)}: "${PROJECT_DIR_ANCHOR}/${first.paths[0]}". ` +
            (first.shipped !== null
              ? `The command create-cmp ships on ${first.surface} is: "command": ${JSON.stringify(first.shipped)}`
              : ""),
        },
      });
    }
  }

  // The studio console's liveness (walk-legibility L6c). A registry record with
  // a dead pid means the console CRASHED — a clean stop removes the record — and
  // the human's window silently disappeared. The statusline appends "console
  // down" live; doctor is the once-over that says the same thing with the fix.
  if (consoleRecord !== null) {
    if (consoleRecord.pidAlive) {
      findings.push({
        id: "console-liveness",
        level: "ok",
        title: "The studio console is running",
        detail: `A console is registered for this app${consoleRecord.url ? ` at ${consoleRecord.url}` : ""} and its process is alive.`,
      });
    } else {
      findings.push({
        id: "console-liveness",
        level: "warn",
        title: "The studio console crashed",
        detail:
          "A console registry record exists for this app but its process is gone — the " +
          "window died without a clean stop, and every surface that leads with the console " +
          "is now pointing at nothing.",
        fix: {
          auto: false,
          description:
            "Reconnect the cmp-inspector MCP (it ensures a resident console at session " +
            "start), call the preview tool, or start one by hand: " +
            "node inspector/mcp/bin/console.mjs <projectDir> (detached: nohup … &).",
        },
      });
    }
  }

  return findings;
}

function normalizePath(p) {
  return String(p).split("\\").join("/");
}

/** Human-readable byte size (GB/MB). */
export function formatBytes(bytes) {
  if (bytes >= GIB) return `${(bytes / GIB).toFixed(1)} GB`;
  const mib = 1024 ** 2;
  if (bytes >= mib) return `${(bytes / mib).toFixed(0)} MB`;
  return `${bytes} B`;
}
