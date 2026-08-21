// `create-cmp attach` (M0a — docs/features/attach-mode.md): the agent
// contract for a foreign Compose/KMP repo. What these tests pin is the
// honesty envelope: attach refuses targets it cannot help, writes only
// surfaces that are true in a repo we never stamped, reports what is NOT
// wired, and never clobbers.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, before, after } from "node:test";

import { attachProject, classifyTarget, attachAgentsMd } from "../src/commands/attach.mjs";

let tmpRoot;

function makeForeignRepo(name, { compose = true } = {}) {
  const dir = path.join(tmpRoot, name);
  fs.mkdirSync(path.join(dir, "app"), { recursive: true });
  fs.writeFileSync(path.join(dir, "settings.gradle.kts"), 'rootProject.name = "foreign"\n');
  fs.writeFileSync(
    path.join(dir, "app", "build.gradle.kts"),
    compose
      ? 'plugins { id("org.jetbrains.compose") }\n'
      : 'plugins { id("java-library") }\n'
  );
  return dir;
}

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-attach-"));
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test("attach writes the contract into a bare Compose repo and is idempotent", () => {
  const repo = makeForeignRepo("bare");
  const first = attachProject({ projectDir: repo, apply: true });
  assert.deepEqual(
    first.units.map((u) => [u.relPath, u.action]),
    [
      ["AGENTS.md", "written"],
      [".claude/settings.json", "written"],
    ],
    "expected both surfaces written"
  );

  const agents = fs.readFileSync(path.join(repo, "AGENTS.md"), "utf8");
  assert.match(agents, /create-cmp-cli doctor/);
  assert.match(agents, /What is NOT wired here/);
  assert.ok(!agents.includes("node qa/"), "attach AGENTS.md cites scaffold machinery a foreign repo lacks");

  const settings = JSON.parse(fs.readFileSync(path.join(repo, ".claude/settings.json"), "utf8"));
  assert.equal(settings.hooks.Stop, undefined, "attach shipped enforcement into a foreign repo");
  const commands = settings.hooks.SessionStart.flatMap((g) => g.hooks).map((h) => h.command);
  assert.equal(commands.length, 1);
  const payload = JSON.parse(commands[0].match(/^printf '%s' '(.*)'$/s)[1]);
  assert.match(payload.hookSpecificOutput.additionalContext, /NOT? wired|No verify lane/i);

  const second = attachProject({ projectDir: repo, apply: true });
  assert.ok(
    second.units.every((u) => u.action === "current"),
    "second attach was not a no-op"
  );
});

test("an existing differing AGENTS.md is never clobbered — sidecar instead", () => {
  const repo = makeForeignRepo("owned");
  fs.writeFileSync(path.join(repo, "AGENTS.md"), "# Our own agent rules\n");
  const outcome = attachProject({ projectDir: repo, apply: true });
  const agentsUnit = outcome.units.find((u) => u.relPath === "AGENTS.md");
  assert.equal(agentsUnit.action, "sidecar");
  assert.equal(fs.readFileSync(path.join(repo, "AGENTS.md"), "utf8"), "# Our own agent rules\n");
  assert.equal(fs.readFileSync(path.join(repo, "AGENTS.md.cmp-new"), "utf8"), attachAgentsMd());
});

test("attach reports the staged remainder rather than faking it", () => {
  const repo = makeForeignRepo("staged");
  const outcome = attachProject({ projectDir: repo, apply: false });
  assert.ok(outcome.notWired.length >= 3, "the not-wired report lost its content");
  assert.ok(outcome.notWired.some((n) => /preview/i.test(n)));
  assert.ok(outcome.notWired.some((n) => /verify lane/i.test(n)));
});

test("attach refuses targets it cannot honestly help", () => {
  const plainJava = makeForeignRepo("java-only", { compose: false });
  assert.match(classifyTarget(plainJava).reason ?? "", /Compose\/KMP signal/);

  const notGradle = path.join(tmpRoot, "not-gradle");
  fs.mkdirSync(notGradle, { recursive: true });
  assert.match(classifyTarget(notGradle).reason ?? "", /settings\.gradle/);

  const stamped = makeForeignRepo("stamped");
  fs.writeFileSync(path.join(stamped, "create-cmp.json"), "{}\n");
  assert.match(classifyTarget(stamped).reason ?? "", /harden/);

  assert.throws(() => attachProject({ projectDir: plainJava }), /Compose\/KMP signal/);
});
