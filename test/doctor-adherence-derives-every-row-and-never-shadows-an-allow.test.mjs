// `doctor --adherence` DERIVES EVERY ROW, RENDERS NOTHING UNANSWERED AS PASS, AND ITS
// `--fix` NEVER ADDS AN ASK THAT SHADOWS AN ALLOW (FIX-PLAN slice 14; U2, PM1, D4).
//
// Each row is checked on fixtures — a temp HOME and a temp project — never the real
// ~/.claude. `gh` is stubbed; git, node and the fixture's own qa/receipt-check.mjs run.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CREDENTIAL_DENY,
  FAIL,
  PASS,
  RULESET_COMMAND,
  UNKNOWN,
  ciRow,
  defaultRun,
  gatherAdherence,
  planUserFix,
  readSettingsFile,
  renderRows,
  runAdherence,
} from "../src/lib/adherence.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = (p) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), p)));
const writeJson = (p, v) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, typeof v === "string" ? v : `${JSON.stringify(v, null, 2)}\n`);
};

const STOP_WIRED = { hooks: { Stop: [{ hooks: [{ type: "command", command: "node qa/receipt-check.mjs --hook" }] }] } };

/** A project whose fake receipt-check exits with what the fixture says, per mode. */
function project({ settings = STOP_WIRED, hookExit = 0, plainExit = 0, git = true, hooksPath = null, workflow = true } = {}) {
  const dir = tmp("cmp-adh-proj-");
  if (settings !== null) writeJson(path.join(dir, ".claude", "settings.json"), settings);
  fs.mkdirSync(path.join(dir, "qa"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "qa", "receipt-check.mjs"),
    `process.exit(process.argv.includes("--hook") ? ${hookExit} : ${plainExit});\n`
  );
  fs.mkdirSync(path.join(dir, ".githooks"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".githooks", "pre-push"), "#!/bin/sh\n");
  if (workflow) {
    fs.mkdirSync(path.join(dir, ".github", "workflows"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".github", "workflows", "verify.yml"), "name: Verify\n");
  }
  if (git) {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    if (hooksPath) spawnSync("git", ["config", "core.hooksPath", hooksPath], { cwd: dir });
  }
  return dir;
}

function home(userSettings) {
  const h = tmp("cmp-adh-home-");
  if (userSettings !== undefined) writeJson(path.join(h, ".claude", "settings.json"), userSettings);
  return h;
}

/** gh answers from the fixture; everything else runs for real. */
function runWith(gh) {
  return (cmd, args, opts) => {
    if (cmd !== "gh") return defaultRun(cmd, args, opts);
    if (args[0] === "auth") return { status: gh ? 0 : 1, stdout: "", stderr: "" };
    if (args[1] === "repos/{owner}/{repo}") return { status: 0, stdout: "main\n", stderr: "" };
    return { status: 0, stdout: JSON.stringify(gh.rules), stderr: "" };
  };
}

async function card({ proj = project(), h = home({}), gh = null, managedPaths = [], loadCompare = async () => null } = {}) {
  const { rows, userFile } = await gatherAdherence({
    projectDir: proj,
    home: h,
    claudeDir: path.join(h, ".claude"),
    managedPaths,
    run: runWith(gh),
    loadCompare,
  });
  const by = Object.fromEntries(rows.map((r) => [r.label, r]));
  return { rows, by, userFile, proj, h };
}

test("hooks row: registered and runnable passes on hook exit 0 or 2, fails on a crash or no registration", async () => {
  for (const hookExit of [0, 2]) {
    const { by } = await card({ proj: project({ hookExit }) });
    assert.equal(by["Project hooks registered and runnable"].status, PASS, `exit ${hookExit}`);
  }
  assert.equal((await card({ proj: project({ hookExit: 1 }) })).by["Project hooks registered and runnable"].status, FAIL);
  const none = (await card({ proj: project({ settings: null }) })).by["Project hooks registered and runnable"];
  assert.equal(none.status, FAIL);
  assert.match(none.fix, /harden --target-dir .*harness init --target-dir/);
  assert.equal((await card({ proj: project({ settings: { hooks: {} } }) })).by["Project hooks registered and runnable"].status, FAIL);
});

test("disableAllHooks row: any scope true fails, an unreadable scope is UNKNOWN, none passes", async () => {
  const L = "No scope disables hooks";
  assert.equal((await card()).by[L].status, PASS);
  assert.equal((await card({ h: home({ disableAllHooks: true }) })).by[L].status, FAIL);
  const managed = path.join(tmp("cmp-adh-managed-"), "managed-settings.json");
  writeJson(managed, "{ not json");
  const u = (await card({ managedPaths: [managed] })).by[L];
  assert.equal(u.status, UNKNOWN);
  assert.match(u.detail, /managed/);
});

test("pre-push row: core.hooksPath = .githooks passes, unset fails with the setup command", async () => {
  const L = "Pre-push gate active";
  assert.equal((await card({ proj: project({ hooksPath: ".githooks" }) })).by[L].status, PASS);
  const off = (await card({ proj: project() })).by[L];
  assert.equal(off.status, FAIL);
  assert.equal(off.fix, "node qa/setup-hooks.mjs");
});

test("CI row: gh unauthenticated is UNKNOWN plus the command; a rule requiring Verify passes; none fails with the printed ruleset", async () => {
  const L = "CI Verify present and required";
  const unk = (await card({ gh: null })).by[L];
  assert.equal(unk.status, UNKNOWN);
  assert.match(unk.fix, /gh api repos\/\{owner\}\/\{repo\}\/rules\/branches\//);
  const req = { rules: [{ type: "required_status_checks", parameters: { required_status_checks: [{ context: "android" }] } }] };
  assert.equal((await card({ gh: req })).by[L].status, PASS);
  const no = (await card({ gh: { rules: [] } })).by[L];
  assert.equal(no.status, FAIL);
  assert.ok(no.fix.includes(RULESET_COMMAND));
  assert.equal(ciRow({ projectDir: "/x", workflow: false, gh: {} }).status, FAIL);
});

test("receipt row: receipt-check exit 0 passes, 1 fails with the lane, anything else is UNKNOWN", async () => {
  const L = "Receipt attests HEAD";
  assert.equal((await card({ proj: project({ plainExit: 0 }) })).by[L].status, PASS);
  const f = (await card({ proj: project({ plainExit: 1 }) })).by[L];
  assert.equal(f.status, FAIL);
  assert.equal(f.fix, "node qa/verify.mjs");
  assert.equal((await card({ proj: project({ plainExit: 7 }) })).by[L].status, UNKNOWN);
});

test("credential row: user-scope permissions.deny must cover all four; an unparseable user file is UNKNOWN", async () => {
  const L = "Credential reads denied";
  assert.equal((await card({ h: home({ permissions: { deny: [...CREDENTIAL_DENY] } }) })).by[L].status, PASS);
  const part = (await card({ h: home({ permissions: { deny: ["Read(~/.npmrc)"] } }) })).by[L];
  assert.equal(part.status, FAIL);
  assert.match(part.detail, /Read\(~\/\.ssh\/\*\*\)/);
  assert.equal((await card({ h: home() })).by[L].status, FAIL, "no user settings at all is a fact, not a question");
  assert.equal((await card({ h: home("{ nope") })).by[L].status, UNKNOWN);
});

test("release-acts row: ask or a deliberate allow/autoMode.allow is reported as decided; no rule fails", async () => {
  const L = "Release acts gated";
  const maintainer = {
    permissions: { allow: ["Bash(npm publish *)", "Bash(gh pr merge *)"], ask: ["Bash(git push * main)"] },
    autoMode: { allow: ["$defaults", "Standing release acts: `npm publish` and `gh pr merge` in my repos."] },
  };
  const m = (await card({ h: home(maintainer) })).by[L];
  assert.equal(m.status, PASS);
  assert.match(m.detail, /never overwritten/);
  const bare = (await card({ h: home({}) })).by[L];
  assert.equal(bare.status, FAIL);
  assert.match(bare.fix, /doctor --adherence --fix/);
});

test("never-shadow: --fix plans no ask over an allow, a broader allow, or a prose autoMode.allow — it reports each", () => {
  const f = readSettingsFile(path.join(home({
    permissions: { allow: ["Bash(gh pr merge *)", "Bash(git push *)"] },
    autoMode: { allow: ["$defaults", "npm publish of my own packages"] },
  }), ".claude", "settings.json"));
  const plan = planUserFix(f);
  assert.deepEqual(plan.add.filter((a) => a.kind === "ask"), []);
  assert.deepEqual(plan.conflicts.map((c) => c.rule).sort(), ["Bash(gh pr merge *)", "Bash(git push * main)", "Bash(npm publish *)"]);
  assert.deepEqual(plan.add.map((a) => a.rule), [...CREDENTIAL_DENY]);
  // A narrower allow that cannot match the act's commands is not a conflict.
  const g = readSettingsFile(path.join(home({ permissions: { allow: ["Bash(git push origin v*)"] } }), ".claude", "settings.json"));
  assert.ok(planUserFix(g).add.some((a) => a.rule === "Bash(git push * main)"));
});

test("--fix asks once per entry, writes only the accepted ones in place, and never the shadowing ask", async () => {
  const raw = '{\n  "model": "opus",\n  "permissions": {\n    "allow": ["Bash(gh pr merge *)"]\n  }\n}\n';
  const h = home(raw);
  const asked = [];
  const out = [];
  await runAdherence({
    projectDir: project(),
    fix: true,
    prompt: async (q) => {
      asked.push(q);
      return !q.includes("Read(~/.aws/**)");
    },
    out: (t) => out.push(t),
    home: h,
    claudeDir: path.join(h, ".claude"),
    managedPaths: [],
    run: runWith(null),
    loadCompare: async () => null,
  });
  assert.equal(asked.length, 6, "4 denies + 2 asks; the gh pr merge ask is never offered");
  assert.ok(!asked.some((q) => q.includes("gh pr merge")));
  const text = out.join("");
  assert.match(text, /not adding ask Bash\(gh pr merge \*\) — it would shadow permissions\.allow Bash\(gh pr merge \*\)/);
  assert.match(text, /printed, never applied/);
  assert.match(text, /entry schema/);
  const after = fs.readFileSync(path.join(h, ".claude", "settings.json"), "utf8");
  assert.ok(after.startsWith('{\n  "model": "opus",'), "the rest of the file is untouched");
  const s = JSON.parse(after);
  assert.deepEqual(s.permissions.allow, ["Bash(gh pr merge *)"]);
  assert.deepEqual(s.permissions.deny, ["Read(~/.npmrc)", "Read(~/.ssh/**)", "Read(~/.config/gh/hosts.yml)"]);
  assert.deepEqual(s.permissions.ask, ["Bash(npm publish *)", "Bash(git push * main)"]);
  assert.equal(s.sandbox, undefined, "no sandbox key is ever written");
});

test("--fix writes nothing into a user file it cannot parse", async () => {
  const h = home("{ broken");
  const out = [];
  await runAdherence({
    projectDir: project(), fix: true, prompt: async () => true, out: (t) => out.push(t),
    home: h, claudeDir: path.join(h, ".claude"), managedPaths: [], run: runWith(null), loadCompare: async () => null,
  });
  assert.equal(fs.readFileSync(path.join(h, ".claude", "settings.json"), "utf8"), "{ broken");
  assert.match(out.join(""), /nothing is written/);
});

test("plugin row: no comparison available is UNKNOWN; identical bytes pass; differing bytes fail", async () => {
  const L = "Plugin bytes current";
  const h = home({});
  const mp = path.join(h, ".claude", "plugins", "marketplaces", "create-cmp");
  const inst = path.join(h, ".claude", "plugins", "cache", "create-cmp", "create-cmp", "1.0.0");
  for (const d of [mp, inst]) writeJson(path.join(d, "skills", "a.md"), "same");
  writeJson(path.join(h, ".claude", "plugins", "installed_plugins.json"), {
    plugins: { "create-cmp@create-cmp": [{ scope: "user", installPath: inst, version: "1.0.0" }] },
  });
  const { compareTrees } = await import(path.join(ROOT, "scripts", "plugin-refresh.mjs"));
  assert.equal((await card({ h, loadCompare: async () => null })).by[L].status, UNKNOWN);
  assert.equal((await card({ h, loadCompare: async () => compareTrees })).by[L].status, PASS);
  fs.writeFileSync(path.join(mp, "skills", "a.md"), "newer");
  const stale = (await card({ h, loadCompare: async () => compareTrees })).by[L];
  assert.equal(stale.status, FAIL);
  assert.match(stale.fix, /claude plugin update create-cmp@create-cmp/);
  assert.equal((await card({ h: home({}) })).by[L].status, FAIL, "not installed");
});

test("cmp-inspector row: prefix-agnostic; entry present passes, absent fails, no config naming it is UNKNOWN", async () => {
  const L = "cmp-inspector reachable";
  assert.equal((await card()).by[L].status, UNKNOWN);
  const h = home({});
  const inst = tmp("cmp-adh-plugin-");
  writeJson(path.join(inst, ".claude-plugin", "plugin.json"), { name: "create-cmp", mcpServers: "./.mcp.json" });
  writeJson(path.join(inst, ".mcp.json"), { mcpServers: { "plugin_create-cmp_cmp-inspector": { command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/inspector/mcp/dist/server.mjs"] } } });
  writeJson(path.join(h, ".claude", "plugins", "installed_plugins.json"), { plugins: { "create-cmp@create-cmp": [{ scope: "user", installPath: inst }] } });
  assert.equal((await card({ h })).by[L].status, FAIL);
  writeJson(path.join(inst, "inspector", "mcp", "dist", "server.mjs"), "// server");
  const ok = (await card({ h })).by[L];
  assert.equal(ok.status, PASS);
  assert.match(ok.detail, /provable only in session/);
});

test("rendering: UNKNOWN, or any status that is not literally PASS or FAIL, never prints PASS", () => {
  const text = renderRows([
    { label: "a", status: UNKNOWN, detail: "d", fix: "f" },
    { label: "b", status: "maybe", detail: "d", fix: "f" },
    { label: "c", status: undefined, detail: "d", fix: null },
    { label: "d", status: true, detail: "d", fix: null },
  ]);
  assert.ok(!text.includes("PASS"), text);
  assert.equal(text.match(/^UNKNOWN/gm).length, 4);
  assert.match(text, /fix: f/);
});
