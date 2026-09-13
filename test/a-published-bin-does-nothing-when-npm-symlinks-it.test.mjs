// A PUBLISHED BIN MUST STILL RUN WHEN IT IS INVOKED THE WAY NPM INSTALLS IT.
//
// npm does not put a `bin` on PATH by copying it. It writes a SYMLINK —
// `node_modules/.bin/prooflane -> ../prooflane-harness/bin/prooflane.mjs` — and
// that is what `npx prooflane` and every `package.json` script execute. Node
// then resolves the symlink for the module graph but NOT for `process.argv[1]`,
// so inside the module those two spellings of "which file am I" disagree:
//
//   process.argv[1]   /tmp/app/node_modules/.bin/prooflane        (the link)
//   import.meta.url   file:///tmp/app/node_modules/prooflane-harness/bin/prooflane.mjs
//
// An entry-point guard written as `import.meta.url === \`file://${argv[1]}\``
// therefore reads FALSE for the one invocation that matters. The module loads,
// defines everything, calls nothing, and the process exits 0 with no output.
// Measured 2026-09-13 against a real `npm pack` + `npm install` of
// packages/harness:
//
//   $ ./node_modules/.bin/prooflane --version
//   $                                              ← nothing. exit 0.
//
// That is worse than a crash: `prooflane init` becomes a silent no-op that
// SUCCEEDS, so a CI step that installs the lane and checks `$?` passes while no
// lane was ever installed.
//
// The class, and why this test compares two invocations rather than grepping
// for the bad comparison: any "am I the entry point" test that compares a URL to
// a path is wrong in more ways than one — a symlink (here), a path holding a
// space or any character percent-encoding touches, a Windows drive letter. The
// invariant is behavioural and covers all of them: EVERY bin every package.json
// declares must produce the same output and the same exit code when reached
// through a link as when reached directly.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Every `bin` target declared by the root package and every workspace. */
function declaredBins() {
  const manifests = [path.join(ROOT, "package.json")];
  const pkgDir = path.join(ROOT, "packages");
  for (const entry of fs.readdirSync(pkgDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const m = path.join(pkgDir, entry.name, "package.json");
    if (fs.existsSync(m)) manifests.push(m);
  }

  const bins = new Map(); // absolute target → the name npm would link it as
  for (const manifest of manifests) {
    const pkg = JSON.parse(fs.readFileSync(manifest, "utf8"));
    const bin = pkg.bin;
    if (!bin) continue;
    const entries = typeof bin === "string" ? [[pkg.name, bin]] : Object.entries(bin);
    for (const [name, rel] of entries) {
      const abs = path.resolve(path.dirname(manifest), rel);
      if (!bins.has(abs)) bins.set(abs, name);
    }
  }
  return [...bins].map(([target, name]) => ({ target, name }));
}

function run(file) {
  const r = spawnSync(process.execPath, [file, "--help"], { encoding: "utf8" });
  return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", status: r.status };
}

test("a bin reached through a symlink behaves as it does reached directly", () => {
  const bins = declaredBins();
  assert.ok(bins.length > 0, "no bins found — the scan is broken, not the tree");

  const dead = [];
  for (const { target, name } of bins) {
    const direct = run(target);
    assert.ok(
      direct.stdout.length > 0,
      `${name}: invoked directly it already prints nothing, so this test cannot tell the two apart`
    );

    // Exactly what `npm install` writes into node_modules/.bin.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bin-symlink-"));
    try {
      const link = path.join(dir, name);
      fs.symlinkSync(target, link);
      const linked = run(link);
      if (linked.stdout !== direct.stdout || linked.status !== direct.status) {
        dead.push(
          `${name} (${path.relative(ROOT, target)}): direct → exit ${direct.status}, ` +
            `${direct.stdout.length} bytes of stdout; through the symlink npm writes → ` +
            `exit ${linked.status}, ${linked.stdout.length} bytes of stdout` +
            (linked.stdout.length === 0 ? " — the command did NOTHING and reported success" : "")
        );
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  assert.deepEqual(
    dead,
    [],
    "each line is a published command that changes behaviour when npm installs it, which is the " +
      "only way an adopter ever runs it:\n  " + dead.join("\n  ")
  );
});
