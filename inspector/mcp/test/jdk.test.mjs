// jdk.mjs — JAVA_HOME resolution for MCP-spawned Gradle. Pure logic with
// injectable probes; the contract under test is the resolution ORDER and the
// never-fabricate rule (no usable JDK -> null, caller spawns env-as-is).
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { isJdkHome, resolveJavaHome, gradleEnv, resetJdkCache } from "../src/lib/jdk.mjs";

const HOME = "/Users/dev";
const sdkman = path.join(HOME, ".sdkman", "candidates", "java", "current");
const JBR = "/Applications/Android Studio.app/Contents/jbr/Contents/Home";
const existsIn = (...jdkHomes) => (p) => jdkHomes.some((h) => p === path.join(h, "bin", "java"));

test("isJdkHome: true only when bin/java exists under the dir", () => {
  assert.equal(isJdkHome("/jdk", { exists: existsIn("/jdk") }), true);
  assert.equal(isJdkHome("/jdk", { exists: () => false }), false);
  assert.equal(isJdkHome(null, { exists: () => true }), false);
});

test("resolveJavaHome: env JAVA_HOME wins when it actually holds a JDK", () => {
  const got = resolveJavaHome({
    env: { JAVA_HOME: "/env/jdk" },
    exists: existsIn("/env/jdk", sdkman),
    platform: "darwin",
    macJavaHome: () => "/os/jdk",
    home: HOME,
  });
  assert.equal(got, "/env/jdk");
});

test("resolveJavaHome: a BROKEN env JAVA_HOME is skipped, not trusted — /usr/libexec/java_home is next", () => {
  const got = resolveJavaHome({
    env: { JAVA_HOME: "/env/broken" },
    exists: existsIn("/os/jdk"),
    platform: "darwin",
    macJavaHome: () => "/os/jdk",
    home: HOME,
  });
  assert.equal(got, "/os/jdk");
});

test("resolveJavaHome: sdkman current, then the Android Studio JBR, complete the darwin chain", () => {
  const viaSdkman = resolveJavaHome({
    env: {},
    exists: existsIn(sdkman, JBR),
    platform: "darwin",
    macJavaHome: () => null,
    home: HOME,
  });
  assert.equal(viaSdkman, sdkman);
  const viaJbr = resolveJavaHome({
    env: {},
    exists: existsIn(JBR),
    platform: "darwin",
    macJavaHome: () => null,
    home: HOME,
  });
  assert.equal(viaJbr, JBR);
});

test("resolveJavaHome: nothing usable -> null, never a fabricated path", () => {
  const got = resolveJavaHome({
    env: { JAVA_HOME: "/env/broken" },
    exists: () => false,
    platform: "darwin",
    macJavaHome: () => "/os/broken",
    home: HOME,
  });
  assert.equal(got, null);
});

test("resolveJavaHome: non-darwin skips the mac-only probes (no /usr/libexec call, no JBR)", () => {
  let macProbed = false;
  const got = resolveJavaHome({
    env: {},
    exists: existsIn(JBR), // JBR "exists" but must not be considered on linux
    platform: "linux",
    macJavaHome: () => { macProbed = true; return "/os/jdk"; },
    home: HOME,
  });
  assert.equal(got, null);
  assert.equal(macProbed, false);
});

test("gradleEnv: memoizes and never drops the rest of the env", () => {
  resetJdkCache();
  const base = { PATH: "/usr/bin", JAVA_HOME: process.env.JAVA_HOME ?? "" };
  const env = gradleEnv(base);
  assert.equal(env.PATH, "/usr/bin", "base env keys pass through");
  // Memoized: a second call returns the same JAVA_HOME decision.
  assert.equal(gradleEnv(base).JAVA_HOME, env.JAVA_HOME);
  resetJdkCache();
});
