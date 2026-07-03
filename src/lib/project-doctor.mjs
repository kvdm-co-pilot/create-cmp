// Project-level diagnosis for `create-cmp doctor` — works on ANY Gradle/KMP
// project with a gradle/libs.versions.toml, not only ones we scaffolded (this
// is the ecosystem-funnel feature). Pure logic: the command layer gathers
// filesystem/env inputs and passes them in, so every check unit-tests without
// touching disk.

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

  return findings;
}

/** Human-readable byte size (GB/MB). */
export function formatBytes(bytes) {
  if (bytes >= GIB) return `${(bytes / GIB).toFixed(1)} GB`;
  const mib = 1024 ** 2;
  if (bytes >= mib) return `${(bytes / mib).toFixed(0)} MB`;
  return `${bytes} B`;
}
