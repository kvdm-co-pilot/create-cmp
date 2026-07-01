import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { renamePackageDirs } from "../src/lib/rename.mjs";

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cmp-rename-"));
}

function writeFile(p, content = "x") {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

function makeProject(roots) {
  const dir = mkTmp();
  for (const root of roots) {
    writeFile(path.join(dir, root, "com/example/app/Main.kt"), "package com.example.app");
    writeFile(path.join(dir, root, "com/example/app/sub/Helper.kt"), "package com.example.app.sub");
  }
  return dir;
}

const ROOTS = [
  "composeApp/src/commonMain/kotlin",
  "composeApp/src/androidMain/kotlin",
];

test("renames package dir to a disjoint package", () => {
  const dir = makeProject(ROOTS);
  const res = renamePackageDirs(dir, ROOTS, "com/acme/app");
  assert.deepEqual(res.moved.sort(), ROOTS.slice().sort());
  for (const root of ROOTS) {
    assert.ok(fs.existsSync(path.join(dir, root, "com/acme/app/Main.kt")));
    assert.ok(fs.existsSync(path.join(dir, root, "com/acme/app/sub/Helper.kt")));
    assert.ok(!fs.existsSync(path.join(dir, root, "com/example")), "old example dir pruned");
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test("renames to a package sharing the 'com' prefix without corruption", () => {
  const dir = makeProject(ROOTS);
  renamePackageDirs(dir, ROOTS, "com/example/demo"); // shares com/example
  for (const root of ROOTS) {
    assert.ok(fs.existsSync(path.join(dir, root, "com/example/demo/Main.kt")));
    assert.ok(fs.existsSync(path.join(dir, root, "com/example/demo/sub/Helper.kt")));
    assert.ok(!fs.existsSync(path.join(dir, root, "com/example/app")), "old leaf gone");
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test("renames to a deeper package (more segments)", () => {
  const dir = makeProject(ROOTS);
  renamePackageDirs(dir, ROOTS, "io/example/team/myapp");
  for (const root of ROOTS) {
    assert.ok(fs.existsSync(path.join(dir, root, "io/example/team/myapp/Main.kt")));
    assert.ok(fs.existsSync(path.join(dir, root, "io/example/team/myapp/sub/Helper.kt")));
    assert.ok(!fs.existsSync(path.join(dir, root, "com")), "old com tree pruned");
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test("renames to a shallower package (fewer segments)", () => {
  const dir = makeProject(ROOTS);
  renamePackageDirs(dir, ROOTS, "app");
  for (const root of ROOTS) {
    assert.ok(fs.existsSync(path.join(dir, root, "app/Main.kt")));
    assert.ok(fs.existsSync(path.join(dir, root, "app/sub/Helper.kt")));
    assert.ok(!fs.existsSync(path.join(dir, root, "com")), "old com tree pruned");
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test("is idempotent — second run is a no-op, files intact", () => {
  const dir = makeProject(ROOTS);
  renamePackageDirs(dir, ROOTS, "com/acme/app");
  const res2 = renamePackageDirs(dir, ROOTS, "com/acme/app");
  assert.equal(res2.moved.length, 0, "nothing moved on re-run");
  assert.deepEqual(res2.skipped.sort(), ROOTS.slice().sort());
  for (const root of ROOTS) {
    assert.ok(fs.existsSync(path.join(dir, root, "com/acme/app/Main.kt")));
    assert.ok(fs.existsSync(path.join(dir, root, "com/acme/app/sub/Helper.kt")));
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test("preserves file contents across rename", () => {
  const dir = makeProject(["src"]);
  renamePackageDirs(dir, ["src"], "com/acme/app");
  const content = fs.readFileSync(path.join(dir, "src/com/acme/app/Main.kt"), "utf8");
  assert.equal(content, "package com.example.app"); // content untouched by rename
  fs.rmSync(dir, { recursive: true, force: true });
});

test("skips a root that lacks the source dir without throwing", () => {
  const dir = makeProject(["a/kotlin"]);
  const res = renamePackageDirs(dir, ["a/kotlin", "b/kotlin"], "com/acme/app");
  assert.ok(res.moved.includes("a/kotlin"));
  assert.ok(res.skipped.includes("b/kotlin"));
  fs.rmSync(dir, { recursive: true, force: true });
});
