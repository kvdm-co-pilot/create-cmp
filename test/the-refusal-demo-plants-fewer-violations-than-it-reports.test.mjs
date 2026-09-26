// KD-267 — the shipped refusal demo (qa/refusal-demo.mjs) reported 2/4 on 0.28.3
// because two of its injectors anchored on literals the template no longer had:
// #2 took the alphabetically first data/ file and required a class in it (the
// first is now a file of top-level functions), and #4 looked for `text = "Home"`
// (the Home title is now an AppHeader). The violation was never planted, no gate
// was asked, and the demo told the adopter a gate had failed to catch it.
//
// Whether each GATE refuses its violation needs Gradle and stays with the demo's
// re-record. What this pins, with no Gradle: stamp an app from this tree's
// template, run each of the four injectors the stamped app ships against it, and
// check each actually planted its violation — so the next template change that
// moves an anchor reds here, by name, instead of in front of an audience.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { scaffold } from "../src/scaffold.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let app;
let demo;

before(async () => {
  app = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-refusal-plant-"));
  await scaffold(
    {
      appName: "Acme",
      package: "com.acme.demo",
      iosBundleId: "com.acme.demo",
      themePrefix: "Acme",
      platforms: { android: true, ios: false },
      room: true,
      e2e: true,
      inspector: true,
      devClient: true,
      tabs: [
        { label: "Home", icon: "home" },
        { label: "Profile", icon: "person" },
      ],
      targetDir: app,
    },
    { verify: false },
  );
  // The copy the stamped app ships — what an adopter's `node qa/refusal-demo.mjs` runs.
  demo = await import(pathToFileURL(path.join(app, "qa", "refusal-demo.mjs")).href);
});

after(() => {
  if (app) fs.rmSync(app, { recursive: true, force: true });
});

const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/** Run an injector and hand back what it touched, with the file's bytes before and after. */
function plant(inject, fileOf = (info) => info.file) {
  // Snapshot every source file first: the injector names its file only on return.
  const src = path.join(app, "composeApp", "src");
  const beforeBytes = new Map(walk(src).map((p) => [path.relative(app, p), fs.readFileSync(p, "utf8")]));
  const info = inject(app);
  const rel = fileOf(info);
  return { info, rel, was: beforeBytes.get(rel), now: read(rel) };
}

test("#1 hardcoded color literal is planted in a screen composable", () => {
  const { rel, was, now } = plant(demo.injectColorLiteral);
  assert.notEqual(now, was, `${rel} changed`);
  assert.match(now, /Color\(0xFF123456\)/, `the literal is in ${rel}`);
});

test("#2 UI→data import is planted, and names a type a data/ file really declares", () => {
  const { info, rel, was, now } = plant(demo.injectUiToDataImport);
  assert.notEqual(now, was, `${rel} changed`);
  assert.ok(rel.replace(/\\/g, "/").includes("/presentation/"), `the import lands in the UI layer: ${rel}`);
  assert.ok(now.includes(`${info.importLine} // injected violation`), `the import line is in ${rel}`);
  const m = info.importLine.match(/^import ([\w.]+)\.(\w+)$/);
  assert.ok(m, `a single-type import: ${info.importLine}`);
  const [, pkg, type] = m;
  const declares = walk(path.join(app, "composeApp", "src", "commonMain", "kotlin"))
    .filter((p) => p.replace(/\\/g, "/").includes("/data/") && p.endsWith(".kt"))
    .some((p) => {
      const t = fs.readFileSync(p, "utf8");
      return new RegExp(`^package ${pkg.replace(/\./g, "\\.")}\\s*$`, "m").test(t) && new RegExp(`\\b(class|interface|object)\\s+${type}\\b`).test(t);
    });
  assert.ok(declares, `${pkg}.${type} is declared in a data/ file, so the import resolves`);
});

test("#3 a singly-bound spec test is deleted", () => {
  const { info, rel, was, now } = plant(demo.injectDeletedSpecTest);
  assert.notEqual(now, was, `${rel} changed`);
  assert.ok(was.includes(info.test), `the test existed before: ${info.test}`);
  assert.ok(!now.includes(info.test), `the test is gone: ${info.test}`);
});

test("#4 undeclared structural regression is planted in the screen the golden test renders", () => {
  const { info, rel, was, now } = plant(demo.injectStructuralRegression);
  assert.notEqual(now, was, `${rel} changed`);
  assert.equal(path.basename(rel), `${info.screen}.kt`);
  const golden = walk(path.join(app, "composeApp", "src", "desktopTest", "kotlin")).find((p) => /GoldenTreeTest\.kt$/.test(p));
  assert.ok(golden && fs.readFileSync(golden, "utf8").includes(`${info.screen}(`), `the golden test renders ${info.screen}`);
  assert.match(now, /Text\(text = "Injected structural regression"\)/, `the extra node is in ${rel}`);
  assert.match(now, /^import androidx\.compose\.material3\.Text$/m, `${rel} imports the Text it now calls`);
});

// The guard that makes the file importable must not make running it a no-op
// (an entry-point guard comparing raw paths once did exactly that to every
// npm-installed `prooflane`). Run it through a symlink, beside a stub engine
// that refuses at once, so main() is observed without scaffolding or Gradle.
test("`node qa/refusal-demo.mjs` still reaches main(), even through a symlink", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-refusal-entry-"));
  try {
    fs.mkdirSync(path.join(root, "bin"));
    fs.writeFileSync(path.join(root, "bin", "create-cmp.mjs"), 'process.stderr.write("stub engine refuses\\n"); process.exit(3);\n');
    fs.mkdirSync(path.join(root, "template", "qa"), { recursive: true });
    const real = path.join(root, "template", "qa", "refusal-demo.mjs");
    fs.copyFileSync(path.join(REPO, "template", "qa", "refusal-demo.mjs"), real);
    const link = path.join(root, "entry.mjs");
    fs.symlinkSync(real, link);
    const r = spawnSync(process.execPath, [link], { encoding: "utf8", timeout: 60_000 });
    assert.match(r.stdout, /Scaffolding a throwaway app/, `main() ran: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /refusal-demo aborted: Scaffold failed/, r.stderr);
    assert.equal(r.status, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
