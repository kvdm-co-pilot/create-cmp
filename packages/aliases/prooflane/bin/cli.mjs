#!/usr/bin/env node
// prooflane — the front door for the harness that installs the verify lane.
//
// IT WAS A PLACEHOLDER, AND THE PLACEHOLDER BECAME FALSE. This package shipped
// as a name reservation whose whole output was "prooflane is not released yet",
// pointing readers at create-cmp-cli. That was true and useful right up until
// `prooflane-harness` grew a binary called `prooflane` (Stage 1, 2026-09-08).
// From that moment the registry held a contradiction about our own product:
// `npx prooflane init` — the exact command the harness README documents —
// resolved to a package insisting the thing did not exist.
//
// So this delegates, in the pattern create-kmp already uses for the CLI: no
// logic of its own, resolve the installed harness's bin, re-execute it,
// forward argv, inherit stdio, propagate the exit code.
//
// NOT A SILENT REDIRECT, and the distinction is the one `create-mobile`'s fit
// check exists to protect. That rule guards FRAMEWORK-NEUTRAL names — a generic
// name must be earned by asking, never by assuming. `prooflane` is this
// project's own product name, and pointing it at this project's own harness is
// the front door rather than a redirect. Nothing is being claimed on anyone
// else's behalf, so nothing is owed an interview.

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);

let pkgJsonPath;
try {
  pkgJsonPath = require.resolve("prooflane-harness/package.json");
} catch {
  process.stderr.write(
    "prooflane: could not find its dependency prooflane-harness.\n" +
      "Your install may be broken — reinstall, or run the harness directly:\n\n" +
      "  npm i -D prooflane-harness && npx prooflane init\n"
  );
  process.exit(1);
}

const pkg = require(pkgJsonPath);
const bin = pkg.bin;
const relBinPath = typeof bin === "string" ? bin : bin.prooflane ?? Object.values(bin ?? {})[0];

if (!relBinPath) {
  process.stderr.write(
    "prooflane: prooflane-harness declares no bin entry.\n" +
      "Install it directly instead:  npm i -D prooflane-harness\n"
  );
  process.exit(1);
}

const cliPath = join(dirname(pkgJsonPath), relBinPath);

// spawnSync, like the other aliases: blocks until the command finishes,
// inherits stdio so anything interactive keeps working, and gives one
// deterministic exit path.
const result = spawnSync(process.execPath, [cliPath, ...process.argv.slice(2)], { stdio: "inherit" });

if (result.error) {
  process.stderr.write(`prooflane: failed to launch prooflane-harness: ${result.error.message}\n`);
  process.exit(1);
}
if (result.signal) {
  process.kill(process.pid, result.signal);
}
process.exit(result.status ?? 1);
