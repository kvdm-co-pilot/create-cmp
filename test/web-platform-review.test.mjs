// Review round 1 of the `--web` slice (docs/features/web-platform.md) — the invariants the
// slice's own tests did not hold, each written for its CLASS rather than the one instance found.
//
//   1. W3 refuses Room because Room publishes no wasmJs variant. That is one instance of a
//      class: a library on the wasmJs compile classpath with no browser variant makes the web
//      build unresolvable, whichever door put it there. `create-cmp add firebase` puts the GitLive
//      SDK (variants: android, ios*, jvm, js — no wasm; measured from the 2.1.0 module metadata,
//      and `compileKotlinWasmJs` on a `--web` stamp after `add firebase` fails with "No matching
//      variant of dev.gitlive:firebase-auth:2.1.0") into commonMain and exits 0.
//   2. "Does this app have the web target?" is answered by each door that runs the green-build
//      gate. `create` and `verify` answer yes for a web app; `add firebase` hard-codes
//      `platforms: { ios }`, so its gate never plans verify.web and calls a broken web build GREEN.
//   3. commonMain's contract says `onResult` receives null when the user cancelled. A file
//      input never fires `change` on a cancel (HTML: the dismissal fires `cancel`), so an actual
//      that listens only to `change` never answers a cancel at all.
//
// Files and exit codes, never Gradle.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "create-cmp.mjs");
const APP = ["--name", "Shop Till", "--package", "com.shop.till", "--no-ios", "--yes"];

const cli = (cwd, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8", timeout: 120_000 });

const box = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-web-review-"));
test.after(() => fs.rmSync(box, { recursive: true, force: true }));

function stampWeb(name, ...extra) {
  const dir = path.join(box, name);
  const r = cli(box, dir, ...APP, "--web", "--no-verify", ...extra);
  assert.equal(r.status, 0, `stamp exited ${r.status}:\n${r.stdout}${r.stderr}`);
  return dir;
}

/** Every file under dir, relative, with its bytes — to tell a refusal that wrote nothing. */
function snapshot(dir) {
  const out = new Map();
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.set(path.relative(dir, p), fs.readFileSync(p, "utf8"));
    }
  };
  walk(dir);
  return out;
}

// Modules with no wasmJs variant in the frozen set. Room and sqlite-bundled are the brief's own
// W3 reason; GitLive's is read from its published module metadata (variants android, iosArm64,
// iosSimulatorArm64, iosX64, js, jvm) and confirmed by a wasmJs compile that cannot resolve it.
const NO_WASM_MODULE = [/^androidx\.room:room-runtime$/, /^androidx\.sqlite:sqlite-bundled$/, /^dev\.gitlive:/];

const norm = (alias) => alias.replace(/[-_.]/g, ".");

/** catalog alias (normalised) → module coordinate. */
function catalogModules(dir) {
  const toml = fs.readFileSync(path.join(dir, "gradle/libs.versions.toml"), "utf8");
  const libs = toml.split(/^\[libraries\]$/m)[1]?.split(/^\[/m)[0] ?? "";
  const map = new Map();
  for (const m of libs.matchAll(/^([A-Za-z0-9_.-]+)\s*=\s*\{[^}]*module\s*=\s*"([^"]+)"/gm)) map.set(norm(m[1]), m[2]);
  return map;
}

/** The libraries the wasmJs compile classpath sees: commonMain's and webMain's/wasmJsMain's. */
function webReachableModules(dir) {
  const gradle = fs.readFileSync(path.join(dir, "composeApp/build.gradle.kts"), "utf8");
  const modules = catalogModules(dir);
  const found = [];
  for (const m of gradle.matchAll(/\b(commonMain|webMain|wasmJsMain)\.dependencies\s*\{/g)) {
    // the block body: from the brace to its matching close
    let depth = 0;
    let i = m.index + m[0].length - 1;
    const start = i;
    for (; i < gradle.length; i++) {
      if (gradle[i] === "{") depth++;
      else if (gradle[i] === "}" && --depth === 0) break;
    }
    const body = gradle.slice(start, i);
    for (const d of body.matchAll(/^\s*(?:implementation|api)\(\s*libs\.([A-Za-z0-9_.]+)\s*\)/gm)) {
      found.push({ sourceSet: m[1], alias: d[1], module: modules.get(norm(d[1])) ?? `?${d[1]}` });
    }
    for (const d of body.matchAll(/^\s*(?:implementation|api)\(\s*"([^":]+:[^":]+)(?::[^"]*)?"\s*\)/gm)) {
      found.push({ sourceSet: m[1], alias: d[1], module: d[1] });
    }
  }
  return found;
}

test("a web app is never handed a library with no browser target, whichever door writes it", () => {
  // Door 1: the stamp.
  const dir = stampWeb("doors");
  const atStamp = webReachableModules(dir).filter((d) => NO_WASM_MODULE.some((re) => re.test(d.module)));
  assert.deepEqual(atStamp, [], "the stamp itself put a no-wasm library where wasmJs compiles it");

  // Door 2: `add firebase` on that web app. A refusal that writes nothing honours the
  // invariant; so does an add that keeps every no-wasm library off the web classpath.
  // Writing GitLive into commonMain and exiting 0 does not.
  const before = snapshot(dir);
  const r = cli(box, "add", "firebase", dir, "--no-verify");
  if (r.status !== 0) {
    assert.deepEqual([...snapshot(dir).keys()].sort(), [...before.keys()].sort(), "a refusal wrote files");
    return;
  }
  const offending = webReachableModules(dir).filter((d) => NO_WASM_MODULE.some((re) => re.test(d.module)));
  assert.deepEqual(
    offending.map((d) => `${d.sourceSet}: ${d.module}`),
    [],
    `\`add firebase\` exited 0 on a --web app and left libraries with no wasmJs variant on the web compile classpath — ` +
      `:composeApp:wasmJsBrowserDistribution cannot resolve them`,
  );
});

test("every door that proves a web app green plans its browser build", () => {
  // create --dry-run-verify
  const created = path.join(box, "plan-create");
  const c = cli(box, created, ...APP, "--web", "--dry-run-verify");
  assert.equal(c.status, 0, c.stdout + c.stderr);
  assert.match(c.stdout, /verify\.web:/, "create's gate does not plan the browser build");

  // verify --dry-run
  const v = cli(box, "verify", "--target-dir", created, "--dry-run");
  assert.equal(v.status, 0, v.stdout + v.stderr);
  assert.match(v.stdout, /verify\.web:/, "verify's gate does not plan the browser build");

  // add firebase --dry-run-verify: either refuses the web app (nothing to prove), or its
  // gate plans the same browser build the other two doors do.
  const dir = stampWeb("plan-add");
  const a = cli(box, "add", "firebase", dir, "--dry-run-verify");
  if (a.status !== 0) return;
  assert.match(
    a.stdout,
    /verify\.web:/,
    "`add firebase` ran the green-build gate on a --web app without planning verify.web — " +
      "src/commands/add.mjs passes `platforms: { ios }` only, so a broken browser build reads GREEN",
  );
});

test("the web photo picker answers a cancel, as commonMain's contract says every picker does", () => {
  const common = fs.readFileSync(
    path.join(ROOT, "template/composeApp/src/commonMain/kotlin/com/example/app/core/platform/PhotoPicker.kt"),
    "utf8",
  );
  assert.match(common, /null when the user cancelled/, "the contract this test holds the web actual to");
  const web = fs.readFileSync(
    path.join(ROOT, "template/composeApp/src/webMain/kotlin/com/example/app/core/platform/PhotoPicker.web.kt"),
    "utf8",
  );
  // A dismissed file chooser fires `cancel` on the input and never `change` (HTML spec; Chrome
  // 113+, Firefox 91+, Safari 16.4+), so without a `cancel` listener the callback is never called.
  assert.match(
    web,
    /addEventListener\(\s*"cancel"/,
    "PhotoPicker.web.kt listens only for `change`: a cancelled chooser never calls onResult(null) on the web",
  );
});
