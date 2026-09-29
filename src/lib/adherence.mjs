// `create-cmp doctor --adherence` — the report card (U2) and its consent-gated `--fix` (PM1).
//
// Every row is DERIVED from something readable on this machine, and reads PASS, FAIL or
// UNKNOWN with the exact command that fixes it. UNKNOWN is what an unanswered question
// renders as — never PASS (G1): a row whose status is anything but the literal "PASS" or
// "FAIL" prints UNKNOWN.
//
// `--fix` writes only the user-scope block PM1 names — `permissions.deny` for credential
// reads and `permissions.ask` for the release acts — into `~/.claude/settings.json`, one
// yes/no per entry, appended in place (nothing already there is rewritten or removed).
// An `ask` beats an `allow`, so an ask that would shadow an existing `permissions.allow`
// or `autoMode.allow` is NEVER added: the conflict is reported instead (PM1 risk, B H-9 —
// the maintainer's deliberate standing allow is PM2's configuration, not a defect). The
// ruleset is printed and never applied (an outward act on the adopter's GitHub), and the
// sandbox is advised, never written (PM3; the doc base names `sandbox.credentials`
// without its entry schema).

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { requiredFromRules, stopHookWired } from "../../template/qa/gates-status.mjs";
import { tryEditJsonInPlace } from "./json-in-place.mjs";
import { ignoredPaths, sameBytes } from "./plugin-bytes.mjs";

export const PASS = "PASS";
export const FAIL = "FAIL";
export const UNKNOWN = "UNKNOWN";

/** PM1's credential-read denies, verbatim. */
export const CREDENTIAL_DENY = Object.freeze([
  "Read(~/.npmrc)",
  "Read(~/.ssh/**)",
  "Read(~/.aws/**)",
  "Read(~/.config/gh/hosts.yml)",
]);

/** PM1's release acts; `words` is how a prose `autoMode.allow` entry names the act. */
export const RELEASE_ACTS = Object.freeze([
  { rule: "Bash(gh pr merge *)", words: "gh pr merge" },
  { rule: "Bash(npm publish *)", words: "npm publish" },
  { rule: "Bash(git push * main)", words: "git push" },
]);

/** U3: printed, never run by doctor. */
export const RULESET_COMMAND = "gh api -X POST repos/{owner}/{repo}/rulesets --input qa/ruleset.json";
const FIX_SELF = "npx create-cmp-cli doctor --adherence --fix";
// `attach` wires advisory hooks only and never the lane, so the harness comes from `harden`
// (a --minimal scaffold) or `harness init` (any other repo).
const ATTACH = (dir) =>
  `npx create-cmp-cli harden --target-dir ${JSON.stringify(dir)}   # a --minimal scaffold; any other repo: npx create-cmp-cli harness init --target-dir ${JSON.stringify(dir)}`;

const row = (label, status, detail, fix = null) => ({ label, status, detail, fix });

// ---------------------------------------------------------------------------
// Reading settings files: absent, unreadable, or parsed — never guessed.

/** @returns {{path:string, state:"absent"|"unreadable"|"parsed", raw?:string, settings?:any, reason?:string}} */
export function readSettingsFile(p) {
  let raw;
  try {
    raw = fs.readFileSync(p, "utf8");
  } catch (e) {
    return e.code === "ENOENT" ? { path: p, state: "absent" } : { path: p, state: "unreadable", reason: e.code ?? e.message };
  }
  try {
    const settings = JSON.parse(raw);
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      return { path: p, state: "unreadable", raw, reason: "not a JSON object" };
    }
    return { path: p, state: "parsed", raw, settings };
  } catch (e) {
    return { path: p, state: "unreadable", raw, reason: `not JSON (${e.message})` };
  }
}

// ---------------------------------------------------------------------------
// Permission-rule matching, for the never-shadow rule.

function parseRule(rule) {
  const s = String(rule).trim();
  const m = /^([A-Za-z_][\w-]*)(?:\((.*)\))?$/s.exec(s);
  if (!m) return null;
  // `Bash` alone covers every Bash command; the legacy `:*` suffix is the prefix form.
  const pattern = m[2] === undefined ? "*" : m[2].replace(/:\*$/, " *");
  return { tool: m[1], pattern };
}

function patternRegex(pattern) {
  let body = pattern.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  // A trailing ` *` also matches the bare command (`npm publish *` covers `npm publish`).
  if (body.endsWith(" .*")) body = `${body.slice(0, -3)}( .*)?`;
  return new RegExp(`^${body}$`, "s");
}

/**
 * Could the two rules match a common command? Checked both ways, on the patterns as
 * strings — conservative on purpose: a false "overlap" costs one entry doctor does not
 * write; a missed one costs the maintainer's deliberate allow.
 */
export function rulesOverlap(a, b) {
  const ra = parseRule(a);
  const rb = parseRule(b);
  if (!ra || !rb || ra.tool !== rb.tool) return false;
  return patternRegex(ra.pattern).test(rb.pattern) || patternRegex(rb.pattern).test(ra.pattern);
}

/** Does `rule` cover every command `target` names? */
function ruleCovers(rule, target) {
  const r = parseRule(rule);
  const t = parseRule(target);
  return Boolean(r && t && r.tool === t.tool && patternRegex(r.pattern).test(t.pattern));
}

const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);

/**
 * How the user scope decides one release act.
 * @returns {{asked:string[], allowedBy:string[], autoModeBy:string[]}}
 */
export function releaseActDecision(settings, act) {
  const perms = settings?.permissions ?? {};
  return {
    asked: list(perms.ask).filter((r) => ruleCovers(r, act.rule)),
    allowedBy: list(perms.allow).filter((r) => rulesOverlap(r, act.rule)),
    autoModeBy: list(settings?.autoMode?.allow).filter(
      (e) => e !== "$defaults" && e.toLowerCase().includes(act.words.toLowerCase())
    ),
  };
}

// ---------------------------------------------------------------------------
// The rows — each a pure function of what was gathered.

export function hooksRow({ settingsFile, receiptCheckExists, hookRun }) {
  const label = "Project hooks registered and runnable";
  if (settingsFile.state === "absent") {
    return row(label, FAIL, ".claude/settings.json is absent — no project hook is registered", ATTACH(path.dirname(path.dirname(settingsFile.path))));
  }
  if (settingsFile.state !== "parsed") {
    return row(label, FAIL, `.claude/settings.json cannot be loaded (${settingsFile.reason}) — Claude Code registers none of its hooks`, "fix the JSON in .claude/settings.json");
  }
  if (!stopHookWired(settingsFile.settings)) {
    return row(label, FAIL, "no Stop hook in .claude/settings.json runs qa/receipt-check.mjs", ATTACH(path.dirname(path.dirname(settingsFile.path))));
  }
  if (!receiptCheckExists) {
    return row(label, FAIL, "the Stop hook runs qa/receipt-check.mjs, which is absent", ATTACH(path.dirname(path.dirname(settingsFile.path))));
  }
  if (hookRun.status === 0 || hookRun.status === 2) {
    return row(label, PASS, `Stop hook registered; \`qa/receipt-check.mjs --hook\` on a synthetic payload exited ${hookRun.status}`);
  }
  const why = hookRun.status === null ? `did not finish (${hookRun.error ?? "no exit code"})` : `exited ${hookRun.status}`;
  const first = String(hookRun.stderr ?? "").trim().split("\n")[0];
  return row(label, FAIL, `\`qa/receipt-check.mjs --hook\` ${why} — a hook that crashes gates nothing${first ? `: ${first}` : ""}`, "node qa/receipt-check.mjs --hook < /dev/null   # read the error");
}

/** @param {Array<{scope:string} & ReturnType<typeof readSettingsFile>>} scopes */
export function disableHooksRow(scopes) {
  const label = "No scope disables hooks";
  const disabling = scopes.filter((s) => s.state === "parsed" && s.settings.disableAllHooks === true);
  if (disabling.length) {
    const where = disabling.map((s) => `${s.scope} (${s.path})`).join(", ");
    return row(label, FAIL, `disableAllHooks is true at ${where}`, `remove "disableAllHooks" from ${disabling.map((s) => s.path).join(" and ")}`);
  }
  const unread = scopes.filter((s) => s.state === "unreadable");
  const read = scopes.filter((s) => s.state === "parsed").map((s) => s.scope);
  if (unread.length) {
    return row(label, UNKNOWN, `could not read ${unread.map((s) => `${s.scope} (${s.path}: ${s.reason})`).join(", ")}`, `check "disableAllHooks" in ${unread.map((s) => s.path).join(" and ")}`);
  }
  return row(label, PASS, `no disableAllHooks at ${read.length ? read.join(", ") : "any scope"} (absent scopes: ${scopes.filter((s) => s.state === "absent").map((s) => s.scope).join(", ") || "none"})`);
}

export function prePushRow({ gitDir, hooksPath, prePushExists }) {
  const label = "Pre-push gate active";
  if (gitDir === null) return row(label, UNKNOWN, "git did not answer (not installed, or not a git repository)", "git init && node qa/setup-hooks.mjs");
  if (hooksPath === ".githooks" && prePushExists) return row(label, PASS, "core.hooksPath = .githooks, and .githooks/pre-push is present");
  if (hooksPath === ".githooks") return row(label, FAIL, "core.hooksPath = .githooks, but .githooks/pre-push is absent", "npx create-cmp-cli upgrade --harness");
  return row(label, FAIL, `core.hooksPath is ${hooksPath ? `"${hooksPath}"` : "unset"} — the pre-push hook is opt-in (B H-8)`, "node qa/setup-hooks.mjs");
}

export function ciRow({ projectDir, workflow, gh }) {
  const label = "CI Verify present and required";
  if (!workflow) return row(label, FAIL, ".github/workflows/verify.yml is absent", ATTACH(projectDir));
  if (gh.required === "yes") return row(label, PASS, `workflow present; a rule on ${gh.branch} requires Verify`);
  if (gh.required === "no") {
    return row(label, FAIL, `workflow present; no rule on ${gh.branch} requires Verify`, `${RULESET_COMMAND}   # printed, never applied by doctor`);
  }
  const check = `gh api repos/{owner}/{repo}/rules/branches/${gh.branch ?? "<default-branch>"}`;
  return row(label, UNKNOWN, `workflow present; required: unknown locally (${gh.reason})`, `${check}   # then, if Verify is not required: ${RULESET_COMMAND}`);
}

export function receiptRow({ receiptCheckExists, run, projectDir }) {
  const label = "Receipt attests HEAD";
  if (!receiptCheckExists) return row(label, FAIL, "qa/receipt-check.mjs is absent", ATTACH(projectDir));
  if (run.status === 0) return row(label, PASS, "qa/receipt-check.mjs: the committed receipt attests this tree");
  if (run.status === 1) {
    const first = String(run.stdout || run.stderr || "").trim().split("\n")[0];
    return row(label, FAIL, `qa/receipt-check.mjs: the receipt does not attest this tree${first ? ` — ${first}` : ""}`, "node qa/verify.mjs");
  }
  return row(label, UNKNOWN, `qa/receipt-check.mjs ${run.status === null ? "did not finish" : `exited ${run.status}`}`, "node qa/receipt-check.mjs   # read the error");
}

export function credentialRow(userFile) {
  const label = "Credential reads denied";
  if (userFile.state === "unreadable") return row(label, UNKNOWN, `${userFile.path} cannot be read (${userFile.reason})`, `fix ${userFile.path}, then ${FIX_SELF}`);
  const deny = list(userFile.settings?.permissions?.deny);
  const missing = CREDENTIAL_DENY.filter((r) => !deny.some((d) => ruleCovers(d, r)));
  if (!missing.length) return row(label, PASS, `user-scope permissions.deny covers ${CREDENTIAL_DENY.join(", ")}`);
  return row(label, FAIL, `user-scope permissions.deny lacks ${missing.join(", ")}`, FIX_SELF);
}

/**
 * How every scope Claude Code merges decides one release act — an ask at ANY scope beats an
 * allow at any other, so each rule is named with the scope that holds it (D4).
 * @param {Array<{scope:string} & ReturnType<typeof readSettingsFile>>} scopes
 */
export function scopedActDecision(scopes, act) {
  const asked = [];
  const allows = [];
  for (const sc of scopes) {
    if (sc.state !== "parsed") continue;
    const d = releaseActDecision(sc.settings, act);
    asked.push(...d.asked.map((r) => `ask ${r} (${sc.scope} scope)`));
    allows.push(
      ...d.allowedBy.map((r) => `permissions.allow ${r} (${sc.scope} scope)`),
      ...d.autoModeBy.map((e) => `autoMode.allow "${e.length > 60 ? `${e.slice(0, 57)}...` : e}" (${sc.scope} scope)`)
    );
  }
  return { asked, allows };
}

/** Every scope a caller passed, or the user file alone (the older one-argument call). */
const asScopes = (userFile, scopes) => (scopes && scopes.length ? scopes : [{ scope: "user", ...userFile }]);

export function releaseActsRow(userFile, scopes) {
  const label = "Release acts gated";
  if (userFile.state === "unreadable") return row(label, UNKNOWN, `${userFile.path} cannot be read (${userFile.reason})`, `fix ${userFile.path}, then ${FIX_SELF}`);
  const all = asScopes(userFile, scopes);
  const unread = all.filter((sc) => sc.state === "unreadable");
  const parts = [];
  const undecided = [];
  for (const act of RELEASE_ACTS) {
    const { asked, allows } = scopedActDecision(all, act);
    if (asked.length) {
      parts.push(`${act.rule}: ${asked.join(", ")}${allows.length ? ` (shadows ${allows.join(", ")} — ask wins)` : ""}`);
    } else if (allows.length) {
      parts.push(`${act.rule}: allowed by ${allows.join(", ")} — a deliberate decision, reported and never overwritten (PM2)`);
    } else {
      parts.push(`${act.rule}: no rule at any scope read — the auto-mode classifier alone decides`);
      undecided.push(act.rule);
    }
  }
  if (undecided.length && unread.length) {
    const where = unread.map((sc) => `${sc.scope} (${sc.path}: ${sc.reason})`).join(", ");
    return row(label, UNKNOWN, `${parts.join("; ")}; could not read ${where}`, `fix ${unread.map((sc) => sc.path).join(" and ")}, then ${FIX_SELF}`);
  }
  return row(label, undecided.length ? FAIL : PASS, parts.join("; "), undecided.length ? FIX_SELF : null);
}

export function pluginRow(plugin) {
  const label = "Plugin bytes current";
  if (plugin.state === "no-check") return row(label, UNKNOWN, plugin.reason, "claude plugin marketplace update <marketplace> && claude plugin update create-cmp@<marketplace>");
  if (plugin.state === "unreadable") return row(label, UNKNOWN, plugin.reason, "check ~/.claude/plugins/installed_plugins.json");
  if (plugin.state === "not-installed") {
    return row(label, FAIL, "the create-cmp plugin is not installed (no entry in installed_plugins.json)", "/plugin marketplace add kvdm-co-pilot/create-cmp  then  /plugin install create-cmp");
  }
  const refresh = `claude plugin marketplace update ${plugin.marketplace} && claude plugin update create-cmp@${plugin.marketplace}   # then /reload-plugins`;
  if (!plugin.marketplaceExists) return row(label, UNKNOWN, `no marketplace clone at ${plugin.marketplaceDir} to compare against`, refresh);
  const stale = plugin.scopes.filter((s) => s.identical === false);
  const unchecked = plugin.scopes.filter((s) => s.identical === null);
  if (stale.length) {
    const what = stale.map((s) => `${s.scope} scope (${s.installPath}): ${s.differing} differing, ${s.missing} missing${s.extra ? `, ${s.extra} extra` : ""}`).join("; ");
    return row(label, FAIL, `installed bytes differ from the marketplace — ${what}`, refresh);
  }
  if (unchecked.length) return row(label, UNKNOWN, `could not compare ${unchecked.map((s) => `${s.scope} scope (${s.reason})`).join(", ")}`, refresh);
  return row(label, PASS, `every install (${plugin.scopes.map((s) => s.scope).join(", ")}) is byte-identical to ${plugin.marketplaceDir}`);
}

export function inspectorRow(servers) {
  const label = "cmp-inspector reachable";
  const fix = "/plugin install create-cmp   # then, in a session: /cmp-doctor";
  if (!servers.length) {
    return row(label, UNKNOWN, "no MCP config doctor can read names a server containing cmp-inspector (a live session is the only proof: /cmp-doctor)", fix);
  }
  const launchable = servers.filter((s) => s.entry === "present");
  if (launchable.length) {
    return row(label, PASS, `${launchable.map((s) => `${s.name} (${s.source})`).join(", ")}: configured, entry file present — a live call is provable only in session`);
  }
  const missing = servers.filter((s) => s.entry === "missing");
  if (missing.length) {
    return row(label, FAIL, `configured, but the entry file is absent: ${missing.map((s) => `${s.name} (${s.source}) → ${s.entryPath}`).join(", ")}`, "claude plugin update create-cmp@<marketplace>   # then /reload-plugins");
  }
  return row(label, UNKNOWN, `configured (${servers.map((s) => `${s.name} in ${s.source}`).join(", ")}), but its launch command cannot be checked out of session`, "/cmp-doctor   # in a session");
}

// ---------------------------------------------------------------------------
// Gathering — the only part that touches the machine. `run` is injectable.

export function defaultRun(cmd, args, { cwd, input, timeout = 30000 } = {}) {
  const r = spawnSync(cmd, args, { cwd, input: input ?? "", encoding: "utf8", timeout, stdio: ["pipe", "pipe", "pipe"] });
  return { status: r.error || r.signal ? null : r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", error: r.error?.code ?? r.signal ?? null };
}

export function defaultManagedPaths(platform = process.platform) {
  if (platform === "darwin") return ["/Library/Application Support/ClaudeCode/managed-settings.json"];
  if (platform === "win32") return ["C:\\Program Files\\ClaudeCode\\managed-settings.json"];
  return ["/etc/claude-code/managed-settings.json"];
}

function ghRequired(projectDir, run) {
  const auth = run("gh", ["auth", "status"], { cwd: projectDir, timeout: 5000 });
  if (auth.status !== 0) return { required: "unknown", branch: null, reason: auth.status === null ? "gh is not installed" : "gh is not authenticated" };
  const b = run("gh", ["api", "repos/{owner}/{repo}", "--jq", ".default_branch"], { cwd: projectDir, timeout: 8000 });
  const branch = b.status === 0 ? b.stdout.trim() : "";
  if (!branch) return { required: "unknown", branch: null, reason: "gh could not name this repository's default branch" };
  const r = run("gh", ["api", `repos/{owner}/{repo}/rules/branches/${encodeURIComponent(branch)}`], { cwd: projectDir, timeout: 8000 });
  if (r.status !== 0) return { required: "unknown", branch, reason: "gh could not read the branch's rules" };
  let body;
  try {
    body = JSON.parse(r.stdout);
  } catch {
    return { required: "unknown", branch, reason: "gh returned rules that are not JSON" };
  }
  const required = requiredFromRules(body);
  return { required, branch, reason: required === "unknown" ? "gh returned no rule list" : "" };
}

// The same comparison scripts/plugin-refresh.mjs makes — both directions (missing, differing,
// extra) — from src/, which the npm package ships.
const defaultCompareTrees = async () => sameBytes;

async function gatherPlugin(claudeDir, loadCompare) {
  const installedPath = path.join(claudeDir, "plugins", "installed_plugins.json");
  const f = readSettingsFile(installedPath);
  if (f.state === "absent") return { state: "not-installed" };
  if (f.state !== "parsed") return { state: "unreadable", reason: `${installedPath}: ${f.reason}` };
  const key = Object.keys(f.settings.plugins ?? {}).find((k) => k.startsWith("create-cmp@"));
  const entries = key && Array.isArray(f.settings.plugins[key]) ? f.settings.plugins[key] : [];
  if (!key || !entries.length) return { state: "not-installed" };
  const compare = await loadCompare();
  if (!compare) {
    return { state: "no-check", reason: "no byte comparison was available to this run" };
  }
  const marketplace = key.slice("create-cmp@".length);
  const marketplaceDir = path.join(claudeDir, "plugins", "marketplaces", marketplace);
  const marketplaceExists = fs.existsSync(marketplaceDir);
  const ignore = marketplaceExists ? ignoredPaths(marketplaceDir) : new Set();
  const scopes = entries.map((e) => {
    const base = { scope: e.scope ?? "?", installPath: e.installPath };
    if (!marketplaceExists) return { ...base, identical: null, reason: "no marketplace clone" };
    if (!e.installPath || !fs.existsSync(e.installPath)) return { ...base, identical: false, differing: 0, missing: "the whole install" };
    try {
      const c = compare(e.installPath, marketplaceDir, ignore);
      return { ...base, identical: c.identical, differing: c.differing.length, missing: c.missing.length, extra: (c.extra ?? []).length };
    } catch (err) {
      return { ...base, identical: null, reason: err.message };
    }
  });
  return { state: "installed", marketplace, marketplaceDir, marketplaceExists, scopes };
}

function inspectorServers({ projectDir, home, claudeDir }) {
  const found = [];
  const consider = (servers, source, root) => {
    if (!servers || typeof servers !== "object") return;
    for (const [name, cfg] of Object.entries(servers)) {
      if (!name.includes("cmp-inspector")) continue;
      const arg = Array.isArray(cfg?.args) ? cfg.args.find((a) => typeof a === "string" && /\.m?js$/.test(a)) : null;
      let entry = "unchecked";
      let entryPath = null;
      if (cfg?.command === "node" && arg) {
        entryPath = arg.replaceAll("${CLAUDE_PLUGIN_ROOT}", root ?? "${CLAUDE_PLUGIN_ROOT}");
        if (!entryPath.includes("${")) {
          entryPath = path.resolve(root ?? projectDir, entryPath);
          entry = fs.existsSync(entryPath) ? "present" : "missing";
        }
      }
      found.push({ name, source, entry, entryPath });
    }
  };
  const proj = readSettingsFile(path.join(projectDir, ".mcp.json"));
  if (proj.state === "parsed") consider(proj.settings.mcpServers, ".mcp.json", projectDir);
  const cj = readSettingsFile(path.join(home, ".claude.json"));
  if (cj.state === "parsed") {
    consider(cj.settings.mcpServers, "~/.claude.json", projectDir);
    consider(cj.settings.projects?.[projectDir]?.mcpServers, "~/.claude.json (this project)", projectDir);
  }
  const inst = readSettingsFile(path.join(claudeDir, "plugins", "installed_plugins.json"));
  if (inst.state === "parsed") {
    for (const [key, entries] of Object.entries(inst.settings.plugins ?? {})) {
      for (const e of Array.isArray(entries) ? entries : []) {
        if (!e?.installPath) continue;
        const manifest = readSettingsFile(path.join(e.installPath, ".claude-plugin", "plugin.json"));
        let servers = manifest.state === "parsed" ? manifest.settings.mcpServers : undefined;
        if (typeof servers === "string" || servers === undefined) {
          const mcp = readSettingsFile(path.resolve(e.installPath, typeof servers === "string" ? servers : ".mcp.json"));
          servers = mcp.state === "parsed" ? mcp.settings.mcpServers : undefined;
        }
        consider(servers, `plugin ${key} (${e.scope ?? "?"} scope)`, e.installPath);
      }
    }
  }
  return found;
}

/**
 * Every row, from this machine. `home` is the user's home; `claudeDir` its `.claude`.
 * @returns {Promise<{rows:Array, userFile:ReturnType<typeof readSettingsFile>, gh:object, workflow:boolean}>}
 */
export async function gatherAdherence({
  projectDir,
  home = os.homedir(),
  claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(home, ".claude"),
  managedPaths = defaultManagedPaths(),
  run = defaultRun,
  loadCompare = defaultCompareTrees,
} = {}) {
  const proj = (...p) => path.join(projectDir, ...p);
  const settingsFile = readSettingsFile(proj(".claude", "settings.json"));
  const receiptCheckExists = fs.existsSync(proj("qa", "receipt-check.mjs"));
  const payload = JSON.stringify({ session_id: "cmp-doctor-adherence", hook_event_name: "Stop", stop_hook_active: false, cwd: projectDir });
  const hookRun = receiptCheckExists ? run(process.execPath, ["qa/receipt-check.mjs", "--hook"], { cwd: projectDir, input: payload }) : null;
  const plainRun = receiptCheckExists ? run(process.execPath, ["qa/receipt-check.mjs"], { cwd: projectDir }) : null;

  const userFile = readSettingsFile(path.join(claudeDir, "settings.json"));
  const scopes = [
    { scope: "user", ...userFile },
    { scope: "project", ...settingsFile },
    { scope: "local", ...readSettingsFile(proj(".claude", "settings.local.json")) },
    ...managedPaths.map((p) => ({ scope: "managed", ...readSettingsFile(p) })),
  ];

  const gitTop = run("git", ["rev-parse", "--git-dir"], { cwd: projectDir, timeout: 5000 });
  const hp = gitTop.status === 0 ? run("git", ["config", "core.hooksPath"], { cwd: projectDir, timeout: 5000 }) : null;
  const workflow = fs.existsSync(proj(".github", "workflows", "verify.yml"));
  const gh = workflow ? ghRequired(projectDir, run) : { required: "unknown", branch: null, reason: "no workflow" };

  const rows = [
    hooksRow({ settingsFile, receiptCheckExists, hookRun }),
    disableHooksRow(scopes),
    prePushRow({
      gitDir: gitTop.status === 0 ? gitTop.stdout.trim() : null,
      hooksPath: hp && hp.status === 0 ? hp.stdout.trim() : null,
      prePushExists: fs.existsSync(proj(".githooks", "pre-push")),
    }),
    ciRow({ projectDir, workflow, gh }),
    receiptRow({ receiptCheckExists, run: plainRun, projectDir }),
    credentialRow(userFile),
    releaseActsRow(userFile, scopes),
    pluginRow(await gatherPlugin(claudeDir, loadCompare)),
    inspectorRow(inspectorServers({ projectDir, home, claudeDir })),
  ];
  return { rows, userFile, scopes, gh, workflow };
}

// ---------------------------------------------------------------------------
// Rendering. The status word is chosen from the row's literal status — anything that is
// not exactly PASS or FAIL renders as UNKNOWN.

export function statusWord(status) {
  return status === PASS ? PASS : status === FAIL ? FAIL : UNKNOWN;
}

export function renderRows(rows, paint = (_s, t) => t) {
  const w = Math.max(...rows.map((r) => r.label.length));
  const lines = [];
  for (const r of rows) {
    const s = statusWord(r.status);
    lines.push(`${paint(s, s.padEnd(7))}  ${r.label.padEnd(w)}  ${r.detail}`);
    if (r.fix && s !== PASS) lines.push(`${" ".repeat(9 + w + 2)}fix: ${r.fix}`);
  }
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// --fix: the user-scope block, per item, never shadowing an allow.

/**
 * What `--fix` would add to the user scope, and what it refuses to add.
 * @returns {{add:Array<{kind:"deny"|"ask", rule:string}>, conflicts:Array<{kind:string, rule:string, by:string[]}>, blocked:string|null}}
 */
export function planUserFix(userFile, scopes) {
  if (userFile.state === "unreadable") return { add: [], conflicts: [], blocked: `${userFile.path} cannot be read (${userFile.reason}) — nothing is written to it` };
  // Claude Code merges user, project, local and managed rules, and an ask/deny at any scope
  // beats an allow at any other — so an allow anywhere is one --fix must not shadow (D4).
  const all = asScopes(userFile, scopes);
  const unread = all.filter((sc) => sc.state === "unreadable");
  if (unread.length) {
    const where = unread.map((sc) => `${sc.scope} (${sc.path}: ${sc.reason})`).join(", ");
    return { add: [], conflicts: [], blocked: `could not read ${where} — an allow there cannot be ruled out, so nothing is written` };
  }
  const parsed = all.filter((sc) => sc.state === "parsed");
  const deny = parsed.flatMap((sc) => list(sc.settings.permissions?.deny));
  const allow = parsed.flatMap((sc) => list(sc.settings.permissions?.allow).map((a) => ({ scope: sc.scope, rule: a })));
  const add = [];
  const conflicts = [];
  for (const rule of CREDENTIAL_DENY) {
    if (deny.some((d) => ruleCovers(d, rule))) continue;
    const by = allow.filter((a) => rulesOverlap(a.rule, rule));
    if (by.length) conflicts.push({ kind: "deny", rule, by: by.map((a) => `permissions.allow ${a.rule} (${a.scope} scope)`) });
    else add.push({ kind: "deny", rule });
  }
  for (const act of RELEASE_ACTS) {
    const { asked, allows } = scopedActDecision(parsed, act);
    if (asked.length) continue;
    if (allows.length) conflicts.push({ kind: "ask", rule: act.rule, by: allows });
    else add.push({ kind: "ask", rule: act.rule });
  }
  return { add, conflicts, blocked: null };
}

/**
 * The new text of the user settings file with `chosen` appended — in place, so nothing
 * already in the file moves. `{reason}` when the text cannot be edited in place.
 */
export function userSettingsWithAdditions(userFile, chosen) {
  const byKind = { deny: chosen.filter((c) => c.kind === "deny").map((c) => c.rule), ask: chosen.filter((c) => c.kind === "ask").map((c) => c.rule) };
  if (userFile.state === "absent") {
    const permissions = {};
    for (const k of ["deny", "ask"]) if (byKind[k].length) permissions[k] = byKind[k];
    return { content: `${JSON.stringify({ permissions }, null, 2)}\n` };
  }
  const s = userFile.settings;
  const edits = [];
  const perms = s.permissions;
  if (perms === undefined) {
    const value = {};
    for (const k of ["deny", "ask"]) if (byKind[k].length) value[k] = byKind[k];
    edits.push({ at: [], add: "permissions", value });
  } else if (!perms || typeof perms !== "object" || Array.isArray(perms)) {
    return { reason: "its \"permissions\" is not an object" };
  } else {
    for (const k of ["deny", "ask"]) {
      if (!byKind[k].length) continue;
      if (perms[k] === undefined) edits.push({ at: ["permissions"], add: k, value: byKind[k] });
      else if (Array.isArray(perms[k])) edits.push({ at: ["permissions", k], push: byKind[k] });
      else return { reason: `its "permissions.${k}" is not an array` };
    }
  }
  return tryEditJsonInPlace(userFile.raw, edits);
}

export function sandboxAdvice() {
  return (
    "Sandbox (PM3) — advice, not written:\n" +
    "  recommended for review and explore sessions: in that session, /sandbox (or \"sandbox\": { \"enabled\": true } in its settings)\n" +
    "  off for lane runs: the L2 lane needs network for Gradle, adb and the cmp profile's emulator, which the sandbox is expected to block (untested)\n" +
    "  sandbox.credentials deny/mask entries are not written: the doc base (note 07) names the setting but not its entry schema\n"
  );
}

/**
 * The whole `doctor --adherence [--fix]` run. Returns the exit code: 1 when any row FAILs.
 * `prompt(question) → Promise<boolean>` asks one yes/no; there is no auto-yes.
 */
export async function runAdherence({ projectDir, fix = false, prompt, out = (t) => process.stdout.write(t), paint, ...gatherOpts }) {
  const { rows, userFile, scopes } = await gatherAdherence({ projectDir, ...gatherOpts });
  out(`\nAdherence report card — ${projectDir}\n\n`);
  out(renderRows(rows, paint));
  const counts = [PASS, FAIL, UNKNOWN].map((s) => `${rows.filter((r) => statusWord(r.status) === s).length} ${s}`);
  out(`\n${counts.join(" · ")} — UNKNOWN is not a pass: it is a question this machine could not answer.\n`);
  out(`\nThe ruleset (U3) is printed, never applied — it is an outward act on your GitHub:\n  ${RULESET_COMMAND}\n\n`);
  out(sandboxAdvice());

  if (fix) {
    const plan = planUserFix(userFile, scopes);
    out(`\n--fix: user-scope settings (${userFile.path}), one yes/no per entry\n`);
    if (plan.blocked) out(`  ${plan.blocked}\n`);
    for (const c of plan.conflicts) {
      out(`  not adding ${c.kind} ${c.rule} — it would ${c.kind === "ask" ? "shadow" : "override"} ${c.by.join(", ")} (reported, never overwritten)\n`);
    }
    const chosen = [];
    for (const item of plan.add) {
      if (await prompt(`Add permissions.${item.kind} ${item.rule} to ${userFile.path}?`)) chosen.push(item);
    }
    if (!plan.add.length && !plan.blocked) out("  nothing to add\n");
    if (chosen.length) {
      const next = userSettingsWithAdditions(userFile, chosen);
      if (next.content === undefined) {
        out(`  wrote nothing: ${userFile.path} could not be edited in place: ${next.reason}\n`);
      } else {
        fs.mkdirSync(path.dirname(userFile.path), { recursive: true });
        fs.writeFileSync(userFile.path, next.content);
        out(`  wrote ${chosen.map((c) => `permissions.${c.kind} ${c.rule}`).join(", ")} — to reverse, delete those entries from ${userFile.path}\n`);
      }
    } else if (plan.add.length) {
      out("  wrote nothing (every entry declined)\n");
    }
  }
  return rows.some((r) => statusWord(r.status) === FAIL) ? 1 : 0;
}
