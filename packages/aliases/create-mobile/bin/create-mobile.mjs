#!/usr/bin/env node
// create-mobile — the honest front door to a new mobile app.
//
// The other create-cmp aliases (create-kmp, create-compose-multiplatform) are pure
// pass-throughs: their name already names the framework, so they just re-exec
// create-cmp-cli. This one is deliberately NOT a silent pass-through. "mobile" is
// framework-neutral, so a package that quietly scaffolds Compose Multiplatform under
// that name would be a bait-and-switch. Instead it opens with an HONEST fit check —
// CMP as the modern default, the real trade-offs vs React Native / Flutter, and a
// genuine choice — and only then delegates to create-cmp-cli. The generic name
// raises the honesty bar; this is how it's earned (the CLI analogue of the cmp-new
// skill's step-0 fit check). Everything after the choice is create-cmp-cli, verbatim.

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { stdin, stdout } from "node:process";

const require = createRequire(import.meta.url);
const argv = process.argv.slice(2);

// --help / --version: pure info passthrough — no banner, no prompt.
const INFO = new Set(["--help", "-h", "--version", "-v"]);
const infoOnly = argv.some((a) => INFO.has(a));

function resolveCliPath() {
  let pkgJsonPath;
  try {
    // package.json is always resolvable, even behind an "exports" map.
    pkgJsonPath = require.resolve("create-cmp-cli/package.json");
  } catch {
    process.stderr.write(
      "create-mobile: could not find its dependency create-cmp-cli.\n" +
        "Your install may be broken — reinstall, or run the real CLI directly:\n\n" +
        "  npx create-cmp-cli@latest\n",
    );
    process.exit(1);
  }
  const pkg = require(pkgJsonPath);
  const bin = pkg.bin;
  const relBinPath = typeof bin === "string" ? bin : (bin["create-cmp"] ?? Object.values(bin)[0]);
  if (!relBinPath) {
    process.stderr.write(
      "create-mobile: create-cmp-cli declares no bin entry.\n" +
        "Run the real CLI directly instead:  npx create-cmp-cli@latest\n",
    );
    process.exit(1);
  }
  return join(dirname(pkgJsonPath), relBinPath);
}

// Re-exec create-cmp-cli: block until it finishes, inherit stdio so interactive
// prompts keep working, propagate the exit code. Never returns (calls process.exit).
function delegate() {
  const cliPath = resolveCliPath();
  const result = spawnSync(process.execPath, [cliPath, ...argv], { stdio: "inherit" });
  if (result.error) {
    process.stderr.write(`create-mobile: failed to launch create-cmp-cli: ${result.error.message}\n`);
    process.exit(1);
  }
  if (result.signal) process.kill(process.pid, result.signal);
  process.exit(result.status ?? 1);
}

if (infoOnly) delegate(); // exits

// The honest positioning. To stderr so a piped stdout stays clean; both stream to
// the terminal in an interactive run, so the user always sees it.
const banner = [
  "",
  "  create-mobile — the honest front door to a new mobile app.",
  "",
  "  Recommended default: Kotlin / Compose Multiplatform (KMP)",
  "    - one statically-typed codebase, REAL native Android + iOS UI, no JS bridge",
  "    - Google-backed; Compose for iOS stable since May 2025",
  "",
  "  The real trade-offs — know these before you choose:",
  "    - React Native / Expo: bigger ecosystem, more libraries and hiring pool,",
  "      but a JS<->native bridge and two languages at the edges",
  "    - Flutter: mature tooling and widgets, but Dart and a non-native render layer",
  "    - CMP is the youngest of the three: smaller community, newer iOS story",
  "",
  "  Full sourced case: https://github.com/kvdm-co-pilot/create-cmp/blob/main/docs/WHY-CMP.md",
  "",
].join("\n");

process.stderr.write(banner + "\n");

// Flags-driven / --yes / no TTY => the caller already chose by how they invoked it
// (scripts, CI, an agent passing flags). Print the banner and proceed. A real
// interactive run gets a real choice.
const nonInteractive = argv.includes("--yes") || argv.includes("-y") || !stdin.isTTY || !stdout.isTTY;

if (nonInteractive) {
  delegate(); // exits
}

const { createInterface } = await import("node:readline/promises");
const rl = createInterface({ input: stdin, output: stdout });
const answer = (await rl.question("  Continue with Compose Multiplatform? [Y/n] ")).trim().toLowerCase();
rl.close();

if (answer === "" || answer === "y" || answer === "yes") {
  delegate(); // exits
}

process.stdout.write(
  "\n  No problem — nothing was written.\n" +
    "  Prefer another stack? React Native: npm create expo@latest  ·  Flutter: flutter create my_app\n\n",
);
process.exit(0);
