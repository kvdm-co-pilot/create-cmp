// jdk.mjs — resolve a usable JAVA_HOME for MCP-spawned Gradle.
//
// The MCP server (and its preview daemon) is often spawned OUTSIDE a login shell —
// no ~/.zshrc, no sdkman init — so `./gradlew` dies with "JAVA_HOME is not set"
// on a machine that builds fine from a terminal. The historical workaround was
// hand-editing an `export JAVA_HOME=…` into the TRACKED `gradlew`, leaving the
// repo permanently dirty and one `git add -A` from shipping a machine path
// (DOGFOODING-FINDINGS, Build/eyes reliability P1). The fix is env propagation:
// resolve a JDK here, hand it to the child process env, and NEVER touch a
// tracked file.
//
// Resolution order (first hit wins, memoized):
//   1. process.env.JAVA_HOME, when it actually contains bin/java.
//   2. macOS: `/usr/libexec/java_home` (the OS's own registry of installed JDKs).
//   3. sdkman: ~/.sdkman/candidates/java/current (the user's selected default).
//   4. Android Studio's bundled JBR (macOS path) — present on any Android dev machine.
//
// Pure logic + injectable probes so this unit-tests without a JDK.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** True when `dir` looks like a JDK home (has bin/java). */
export function isJdkHome(dir, { exists = existsSync } = {}) {
  if (!dir || typeof dir !== "string") return false;
  return exists(join(dir, "bin", "java"));
}

/**
 * Resolve a JAVA_HOME candidate. Returns the path, or null when nothing usable
 * exists (the caller then spawns with the env as-is and Gradle's own error
 * message stands — we never fabricate a path).
 */
export function resolveJavaHome({
  env = process.env,
  exists = existsSync,
  platform = process.platform,
  macJavaHome = defaultMacJavaHome,
  home = homedir(),
} = {}) {
  const probe = (dir) => (isJdkHome(dir, { exists }) ? dir : null);

  const fromEnv = probe(env.JAVA_HOME);
  if (fromEnv) return fromEnv;

  if (platform === "darwin") {
    const fromOs = probe(macJavaHome());
    if (fromOs) return fromOs;
  }

  const fromSdkman = probe(join(home, ".sdkman", "candidates", "java", "current"));
  if (fromSdkman) return fromSdkman;

  if (platform === "darwin") {
    const jbr = probe("/Applications/Android Studio.app/Contents/jbr/Contents/Home");
    if (jbr) return jbr;
  }

  return null;
}

function defaultMacJavaHome() {
  try {
    return execFileSync("/usr/libexec/java_home", { encoding: "utf8", timeout: 5000 }).trim();
  } catch {
    return null;
  }
}

let memoized; // undefined = not yet resolved; null = resolved to "nothing found"

/**
 * The env object to spawn Gradle with: the current process env plus a resolved
 * JAVA_HOME (memoized — the JDK does not move mid-session). When JAVA_HOME is
 * already good, this is effectively a pass-through.
 */
export function gradleEnv(base = process.env) {
  if (memoized === undefined) memoized = resolveJavaHome({ env: base });
  return memoized ? { ...base, JAVA_HOME: memoized } : { ...base };
}

/** Test seam: forget the memoized resolution. */
export function resetJdkCache() {
  memoized = undefined;
}
