// The symptom table in template/AGENTS.md is a discovery surface: symptom → command,
// read by ANY coding agent (not only Claude) at session start. Its whole value is that
// every row points at something that exists — a row naming a command that isn't there
// teaches the agent to distrust the file, which kills the surface.
//
// So this test enforces evidence-or-silence: every command, skill, path, and endpoint
// the table cites is asserted against the tree it ships in. Add a row → it must point
// at something real, or the suite fails. Remove a capability → its row must go too.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = path.join(ROOT, "template");
const agentsMd = fs.readFileSync(path.join(TEMPLATE, "AGENTS.md"), "utf8");

test("every `node qa/<script>.mjs` the table cites ships in the template", () => {
  const cited = [...agentsMd.matchAll(/node (qa\/[a-z-]+\.mjs)/g)].map((m) => m[1]);
  assert.ok(cited.length >= 5, `expected a real table, found ${cited.length} qa/ commands`);
  for (const rel of new Set(cited)) {
    assert.ok(
      fs.existsSync(path.join(TEMPLATE, rel)),
      `AGENTS.md cites \`node ${rel}\` but template/${rel} does not exist`,
    );
  }
});

test("every project-local skill the table cites ships in the template", () => {
  const cited = [...agentsMd.matchAll(/`(?:\.\/)?\.claude\/skills\/([a-z-]+)`|`(add-[a-z]+)`/g)]
    .map((m) => m[1] ?? m[2])
    .filter(Boolean);
  assert.ok(cited.length >= 1, "expected at least one skill reference");
  for (const name of new Set(cited)) {
    assert.ok(
      fs.existsSync(path.join(TEMPLATE, ".claude/skills", name, "SKILL.md")),
      `AGENTS.md cites skill \`${name}\` but template/.claude/skills/${name}/SKILL.md does not exist`,
    );
  }
});

test("every engine subcommand the table cites exists in src/commands", () => {
  const cited = [...agentsMd.matchAll(/npx create-cmp-cli ([a-z]+)/g)].map((m) => m[1]);
  assert.ok(cited.length >= 1, "expected at least one npx command");
  for (const cmd of new Set(cited)) {
    assert.ok(
      fs.existsSync(path.join(ROOT, "src/commands", `${cmd}.mjs`)),
      `AGENTS.md cites \`npx create-cmp-cli ${cmd}\` but src/commands/${cmd}.mjs does not exist`,
    );
  }
});

test("the gradle task and live endpoint the table cites are real", () => {
  if (agentsMd.includes(":composeApp:renderScreens")) {
    const gradle = fs.readFileSync(path.join(TEMPLATE, "composeApp/build.gradle.kts"), "utf8");
    assert.match(gradle, /renderScreens/, "table cites :composeApp:renderScreens but the task is not registered");
  }
  if (agentsMd.includes("/inspect/remote")) {
    const hits = fs
      .readdirSync(path.join(TEMPLATE, "composeApp/src/androidDebug/kotlin/com/example/app/inspector"))
      .map((f) => fs.readFileSync(path.join(TEMPLATE, "composeApp/src/androidDebug/kotlin/com/example/app/inspector", f), "utf8"))
      .filter((src) => src.includes("/inspect/remote"));
    assert.ok(hits.length > 0, "table cites /inspect/remote but no androidDebug inspector source serves that route");
  }
});

test("path claims resolve and the pinned framing survives", () => {
  // Relative links must resolve inside the STAMPED tree; upstream references must be
  // full URLs (a stamped project does not carry the engine repo's docs/errors/).
  assert.ok(!/\]\((?:\.\/)?docs\/errors/.test(agentsMd),
    "AGENTS.md links docs/errors/ relatively, but stamped projects do not carry it — use the upstream URL");
  // Phrases other suites already rely on — kept here as a fast, named guard so an
  // AGENTS.md rewrite fails HERE with a reason, not in a distant surface test.
  for (const phrase of ["CLAUDE.md", "UI feedback loop", "machine-owned"]) {
    assert.ok(agentsMd.includes(phrase), `AGENTS.md lost the pinned phrase "${phrase}"`);
  }
  // The plugin must read as accelerator, never prerequisite.
  assert.match(agentsMd, /never a prerequisite/i, "the plugin-is-not-required framing is load-bearing");
});
