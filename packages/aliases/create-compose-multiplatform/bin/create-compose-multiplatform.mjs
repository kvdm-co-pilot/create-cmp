#!/usr/bin/env node
// create-compose-multiplatform — thin official alias for create-cmp-cli.
//
// No logic of its own: resolves the installed create-cmp-cli's bin entry and
// re-executes it in a child node process, forwarding argv, inheriting stdio
// (so interactive prompts keep working), and propagating the exit code.

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);

let pkgJsonPath;
try {
  // package.json is always resolvable, even if the package added an "exports" map.
  pkgJsonPath = require.resolve("create-cmp-cli/package.json");
} catch {
  process.stderr.write(
    "create-compose-multiplatform: could not find its dependency create-cmp-cli.\n" +
      "Your install may be broken — reinstall, or run the real CLI directly:\n\n" +
      "  npx create-cmp-cli@latest\n"
  );
  process.exit(1);
}

const pkg = require(pkgJsonPath);
const bin = pkg.bin;
const relBinPath =
  typeof bin === "string" ? bin : bin["create-cmp"] ?? Object.values(bin)[0];

if (!relBinPath) {
  process.stderr.write(
    "create-compose-multiplatform: create-cmp-cli declares no bin entry.\n" +
      "Run the real CLI directly instead:  npx create-cmp-cli@latest\n"
  );
  process.exit(1);
}

const cliPath = join(dirname(pkgJsonPath), relBinPath);

// spawnSync (not async spawn): blocks until the CLI finishes, inherits stdio so
// interactive prompts keep working, and gives a single deterministic exit path
// (child status/signal in hand, no event-loop races).
const result = spawnSync(process.execPath, [cliPath, ...process.argv.slice(2)], {
  stdio: "inherit",
});

if (result.error) {
  process.stderr.write(`create-compose-multiplatform: failed to launch create-cmp-cli: ${result.error.message}\n`);
  process.exit(1);
}
if (result.signal) {
  process.kill(process.pid, result.signal);
}
process.exit(result.status ?? 1);
