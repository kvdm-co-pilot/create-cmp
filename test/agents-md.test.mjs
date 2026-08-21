// template/AGENTS.md is the discovery spine (LADDER §R1): symptom → command,
// read by ANY coding agent at session start and at the wall. Its whole value
// is that every visible row points at something real IN THE MODE IT SHIPS IN —
// one dead command teaches the agent to distrust the file, which kills the
// surface (VISION principle 5: strongest-true-case honesty, test-pinned).
//
// The file is mode-aware via cmp:feature markers, so this test does what the
// stamper does: renders every mode combination with the real toggle machinery
// and holds EACH rendering to evidence-or-silence against the shape that mode
// actually stamps.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { stripFeatureBlocks } from "../src/lib/toggle.mjs";
import { laneKeepSet } from "../src/lib/minimal.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = path.join(ROOT, "template");
const raw = fs.readFileSync(path.join(TEMPLATE, "AGENTS.md"), "utf8");

const render = (...disabled) => stripFeatureBlocks(raw, new Set(disabled)).content;

// The keep-set a minimal stamp derives (entry points + transitive imports),
// computed against the template itself — the same code path the engine runs.
const minimalLane = laneKeepSet(TEMPLATE);

const MODES = [
  { name: "full", disabled: [], lane: "full" },
  { name: "minimal", disabled: ["harness"], lane: "minimal" },
  { name: "full, no inspector", disabled: ["inspector"], lane: "full" },
  { name: "minimal, no inspector", disabled: ["harness", "inspector"], lane: "minimal" },
];

for (const mode of MODES) {
  test(`[${mode.name}] every cited command/path exists in that mode's stamped shape`, () => {
    const body = render(...mode.disabled);

    assert.ok(!body.includes("cmp:feature"), "marker noise survived the strip");

    // `node qa/<script>.mjs` citations.
    const qaCited = new Set([...body.matchAll(/node (qa\/[a-z-]+\.mjs)/g)].map((m) => m[1]));
    for (const rel of qaCited) {
      assert.ok(
        fs.existsSync(path.join(TEMPLATE, rel)),
        `cites \`node ${rel}\` but template/${rel} does not exist`
      );
      if (mode.lane === "minimal") {
        assert.ok(
          minimalLane.has(rel),
          `minimal rendering cites \`node ${rel}\`, which the minimal stamp deletes`
        );
      }
    }

    // Engine subcommands.
    const npxCited = new Set([...body.matchAll(/create-cmp-cli ([a-z-]+)/g)].map((m) => m[1]));
    assert.ok(npxCited.size >= 1, "expected at least one npx command");
    for (const cmd of npxCited) {
      assert.ok(
        fs.existsSync(path.join(ROOT, "src/commands", `${cmd}.mjs`)),
        `cites \`create-cmp-cli ${cmd}\` but src/commands/${cmd}.mjs does not exist`
      );
    }

    // Project-local skills — full mode only; minimal deletes .claude/skills.
    const skillsCited = new Set([...body.matchAll(/`(add-[a-z]+)`/g)].map((m) => m[1]));
    if (mode.lane === "minimal") {
      assert.equal(skillsCited.size, 0, "minimal rendering cites skills the stamp deletes");
      assert.ok(!body.includes("scaffold-feature"), "minimal rendering cites the deleted generator");
    } else {
      for (const name of skillsCited) {
        assert.ok(
          fs.existsSync(path.join(TEMPLATE, ".claude/skills", name, "SKILL.md")),
          `cites skill \`${name}\` but template/.claude/skills/${name}/SKILL.md does not exist`
        );
      }
    }

    // Inspector rows follow the inspector feature, not vibes.
    const inspectorOff = mode.disabled.includes("inspector");
    if (inspectorOff) {
      assert.ok(!body.includes("renderScreens"), "no-inspector rendering advertises renderScreens");
      assert.ok(!body.includes("9500"), "no-inspector rendering advertises the live endpoint");
    } else {
      assert.ok(body.includes("renderScreens"), "inspector rendering lost the preview row");
      assert.ok(body.includes("/inspect/remote"), "inspector rendering lost the live-state row");
    }

    // Mode framing.
    if (mode.lane === "minimal") {
      assert.match(body, /create-cmp-cli harden/, "minimal rendering must name the climb command");
      assert.ok(!body.includes("qa/verify.mjs"), "minimal rendering advertises the deleted lane");
    } else {
      assert.match(body, /machine-owned/, "full rendering lost the machine-owned rule");
      assert.match(body, /node qa\/verify\.mjs/, "full rendering lost the done-gate row");
    }

    // Shared pins.
    assert.match(body, /CLAUDE\.md/, "lost the contract pointer");
    assert.match(body, /UI feedback loop/, "lost the pinned UI-feedback-loop phrase");
    // \s+ not a literal space: the phrase is prose and may wrap across lines.
    assert.match(body, /never\s+a\s+prerequisite/i, "the plugin-is-not-required framing is load-bearing");
  });
}

test("the gradle task and live endpoint the table cites are real", () => {
  const gradle = fs.readFileSync(path.join(TEMPLATE, "composeApp/build.gradle.kts"), "utf8");
  assert.match(gradle, /renderScreens/, "table cites :composeApp:renderScreens but the task is not registered");

  const inspectorDir = path.join(TEMPLATE, "composeApp/src/androidDebug/kotlin/com/example/app/inspector");
  const serves = fs
    .readdirSync(inspectorDir)
    .some((f) => fs.readFileSync(path.join(inspectorDir, f), "utf8").includes("/inspect/remote"));
  assert.ok(serves, "table cites /inspect/remote but no androidDebug inspector source serves that route");
});

test("upstream references are full URLs — stamped projects carry no docs/errors/", () => {
  assert.ok(
    !/\]\((?:\.\/)?docs\/errors/.test(raw),
    "AGENTS.md links docs/errors/ relatively, but stamped projects do not carry it — use the upstream URL"
  );
});
