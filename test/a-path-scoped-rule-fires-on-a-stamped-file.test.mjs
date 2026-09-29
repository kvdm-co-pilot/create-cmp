// FIX-PLAN slice 15 (CX1, BATCH-2 D5) — the template CLAUDE.md moved Approvals and
// Comments into path-scoped `.claude/rules/*.md`, and the walk and the UI feedback
// loop into project skills. A rule loads only when the agent works with a file its
// `paths:` globs match, so a glob that matches nothing in a stamped app is a section
// that never fires. This stamps a real app and proves every glob of every shipped rule
// matches at least one stamped file, and that minimal mode ships none of them.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scaffold } from "../src/scaffold.mjs";
import { listFiles } from "../src/lib/fsutil.mjs";

// Importing minimal-mode.test.mjs for its config would register its tests here too.
const config = (targetDir, harness) => ({
  appName: "Rules App",
  package: "com.rulesapp.app",
  iosBundleId: "com.rulesapp.app",
  themePrefix: "Rules",
  harness,
  platforms: { android: true, ios: false },
  room: true,
  e2e: true,
  inspector: true,
  devClient: true,
  tabs: [
    { label: "Home", icon: "home" },
    { label: "Profile", icon: "person" },
  ],
  targetDir,
});

let tmpRoot;
let full;
let minimal;

before(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-rules-"));
  full = path.join(tmpRoot, "full");
  minimal = path.join(tmpRoot, "minimal");
  await scaffold(config(full, true), { verify: false });
  await scaffold(config(minimal, false), { verify: false });
});

after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

/** The `paths:` list of a rule file's YAML frontmatter (block-list form). */
function rulePaths(text) {
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(fm, "the rule opens with YAML frontmatter");
  const block = fm[1].match(/^paths:\n((?:\s+-\s+.+\n?)+)/m);
  assert.ok(block, "the frontmatter carries a paths: list");
  return [...block[1].matchAll(/-\s+"?([^"\n]+)"?/g)].map((m) => m[1].trim());
}

test("every glob of every shipped rule matches a file in a stamped app", () => {
  const rulesDir = path.join(full, ".claude/rules");
  const rules = fs.readdirSync(rulesDir).filter((f) => f.endsWith(".md")).sort();
  assert.deepEqual(rules, ["approvals.md", "comments.md"], "the rules D5 moved out of CLAUDE.md ship");
  const stamped = listFiles(full).map((f) => path.relative(full, f).split(path.sep).join("/"));
  for (const rule of rules) {
    const globs = rulePaths(fs.readFileSync(path.join(rulesDir, rule), "utf8"));
    for (const glob of globs) {
      const hit = stamped.find((f) => path.matchesGlob(f, glob));
      assert.ok(hit, `.claude/rules/${rule}: paths glob "${glob}" matches no stamped file — the rule never fires`);
    }
  }
});

test("CLAUDE.md names every moved rule and skill, and each exists in the stamp", () => {
  const claude = fs.readFileSync(path.join(full, "CLAUDE.md"), "utf8");
  for (const rel of [".claude/rules/approvals.md", ".claude/rules/comments.md", ".claude/skills/walk/SKILL.md", ".claude/skills/ui-loop/SKILL.md"]) {
    assert.ok(claude.includes(rel), `CLAUDE.md points at ${rel}`);
    assert.ok(fs.existsSync(path.join(full, rel)), `the stamp ships ${rel}`);
  }
});

test("minimal mode ships neither the rules nor the skills, and its CLAUDE.md names none", () => {
  for (const rel of [".claude/rules", ".claude/skills"]) {
    assert.ok(!fs.existsSync(path.join(minimal, rel)), `minimal stamp carries ${rel}`);
  }
  const claude = fs.readFileSync(path.join(minimal, "CLAUDE.md"), "utf8");
  assert.ok(!/\.claude\/(rules|skills)\//.test(claude), "minimal CLAUDE.md points at a file the stamp deletes");
});
