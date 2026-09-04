// Roadmap C9 — engine tests cover the new stamping surfaces (CLAUDE.md, skills,
// hooks, qa/*, specs/, CI workflow) so a regression that silently drops one of
// them from the template is caught here instead of by a human noticing a
// generated project is missing its harness.
//
// One DEFAULT scaffold of the REAL template (mirrors feature-strip.test.mjs's
// stamp() pattern), then many assertions against the single output dir — kept
// fast (verify: false, no Gradle) since we only need the stamped FILES, not a
// green build.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scaffold } from "../src/scaffold.mjs";
import { evidenceLevel } from "../template/qa/lib/evidence-level.mjs";
import { CMP_LADDER } from "../packages/harness/src/lib/profiles/cmp/ladder.mjs";
import { isHarnessFile } from "../packages/harness/src/lib/harness-region.mjs";

// S8b: the lane is TWO files now — qa/verify.mjs (the spine) and
// qa/lib/profiles/cmp/steps-cmp.mjs (the step pack). A structural read of "the lane's
// source" must see both, or it pins a file that no longer holds the steps.
const laneSrc = (dir) =>
  `${fs.readFileSync(path.join(dir, "qa/verify.mjs"), "utf8")}\n${fs.readFileSync(path.join(dir, "qa/lib/profiles/cmp/steps-cmp.mjs"), "utf8")}`;


// A parallel lane is mid-flight renaming the device-E2E feature key
// `appium` -> `e2e` (CLI flags + manifest key). Detect which key the CURRENT
// options.schema.json actually accepts so this file's config is valid on
// either side of that rename — we intentionally never hardcode or assert on
// the literal key name (see task brief: stay collision-free).
const SCHEMA_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "options.schema.json");
const optionsSchema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));
const E2E_FEATURE_KEY = optionsSchema.properties && "e2e" in optionsSchema.properties ? "e2e" : "appium";

function baseConfig(targetDir, overrides = {}) {
  return {
    appName: "Acme",
    package: "com.acme.demo",
    iosBundleId: "com.acme.demo",
    region: "us-central1",
    themePrefix: "Acme",
    platforms: { android: true, ios: true },
    firebase: { enabled: true, auth: "both", firestore: true, storage: true, functions: true, fcm: true },
    room: true,
    [E2E_FEATURE_KEY]: true,
    inspector: true,
    devClient: true,
    // The CLI's default tabs — smoke.yaml's nav taps are now GENERATED from
    // this list (src/lib/tabs.mjs), so the nav_home/nav_profile assertions
    // below require the default two-tab config.
    tabs: [
      { label: "Home", icon: "home" },
      { label: "Profile", icon: "person" },
    ],
    targetDir,
    ...overrides,
  };
}

async function stampDefault() {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-harness-"));
  await scaffold(baseConfig(out), { verify: false });
  return out;
}

/** Every asserted file, relative to the scaffold output root. */
const ASSERTED_FILES = [
  "CLAUDE.md",
  "AGENTS.md",
  ".claude/skills/add-feature/SKILL.md",
  ".claude/skills/add-screen/SKILL.md",
  ".claude/skills/add-repository/SKILL.md",
  ".claude/settings.json",
  "qa/verify.mjs",
  "qa/watch.mjs",
  "qa/receipt-check.mjs",
  "qa/lib/inputs-hash.mjs",
  "qa/scaffold-feature.mjs",
  "qa/setup-hooks.mjs",
  ".githooks/pre-push",
  "qa/refusal-demo.mjs",
  "qa/e2e/smoke.yaml",
  "qa/evidence/schema.json",
  "specs/README.md",
  "specs/app-base.spec.md",
  "specs/home.spec.md",
  ".github/workflows/verify.yml",
];

test("harness surfaces: default scaffold contains the HARNESS surfaces", async (t) => {
  const out = await stampDefault();

  try {
    await t.test("CLAUDE.md documents the definition of done", () => {
      const claudeMd = fs.readFileSync(path.join(out, "CLAUDE.md"), "utf8");
      assert.match(claudeMd, /Definition of done/);
      assert.match(claudeMd, /qa\/verify\.mjs/);
    });

    await t.test("CLAUDE.md teaches the UI feedback loop; AGENTS.md points at it", () => {
      const claudeMd = fs.readFileSync(path.join(out, "CLAUDE.md"), "utf8");
      assert.match(claudeMd, /UI feedback loop/);
      assert.match(claudeMd, /preview_status \{ waitForRender: true \}/);
      assert.match(claudeMd, /renderScreens/, "no-plugin fallback documented");
      const agentsMd = fs.readFileSync(path.join(out, "AGENTS.md"), "utf8");
      assert.match(agentsMd, /CLAUDE\.md/);
      assert.match(agentsMd, /UI feedback loop/);
    });

    await t.test("skills exist, non-empty, with name: frontmatter", () => {
      for (const skill of ["add-feature", "add-screen", "add-repository"]) {
        const p = path.join(out, ".claude/skills", skill, "SKILL.md");
        assert.ok(fs.existsSync(p), `${p} exists`);
        const content = fs.readFileSync(p, "utf8");
        assert.ok(content.trim().length > 0, `${p} is non-empty`);
        assert.match(content, /^---\n[\s\S]*?name:\s*\S+/, `${p} has name: frontmatter`);
      }
    });

    await t.test(".claude/settings.json has a Stop hook wired to receipt-check.mjs --hook", () => {
      const raw = fs.readFileSync(path.join(out, ".claude/settings.json"), "utf8");
      const settings = JSON.parse(raw);
      const stopHooks = settings.hooks?.Stop;
      assert.ok(Array.isArray(stopHooks) && stopHooks.length > 0, "has a Stop hook entry");
      const commands = stopHooks.flatMap((entry) => (entry.hooks || []).map((h) => h.command));
      assert.ok(
        commands.some((c) => typeof c === "string" && c.includes("qa/receipt-check.mjs --hook")),
        `Stop hook command references qa/receipt-check.mjs --hook (got: ${JSON.stringify(commands)})`
      );
    });

    await t.test(".claude/settings.json carries the session-contract and drift-deterrent hooks", () => {
      const settings = JSON.parse(fs.readFileSync(path.join(out, ".claude/settings.json"), "utf8"));
      // SessionStart: the governed-app banner reaches every session's context — the
      // capability contract must not depend on a skill being invoked first (a whole
      // production app was built in a session that never learned its tools were missing).
      const sessionCmds = (settings.hooks?.SessionStart || []).flatMap((e) => (e.hooks || []).map((h) => h.command));
      assert.ok(
        sessionCmds.some((c) => typeof c === "string" && c.includes("cmp-inspector") && c.includes("additionalContext")),
        "SessionStart hook injects the capability-contract banner"
      );
      // PreToolUse on Bash: pixel/blind-tap fallbacks get a structured-eyes reminder —
      // allow (never block), silent on every non-matching command.
      const preEntries = settings.hooks?.PreToolUse || [];
      const bashEntry = preEntries.find((e) => e.matcher === "Bash");
      assert.ok(bashEntry, "PreToolUse has a Bash matcher entry");
      assert.equal(
        preEntries.filter((e) => e.matcher === "Bash").length,
        1,
        "exactly ONE Bash matcher entry — the deterrents extend it, never compete with it"
      );
      const preCmd = (bashEntry.hooks || []).map((h) => h.command).join("\n");
      assert.ok(/screencap\|uiautomator dump/.test(preCmd), "reminder triggers on screencap/uiautomator dump");
      assert.ok(preCmd.includes('"permissionDecision\":\"allow'), "reminder allows — it never blocks");
      assert.ok(preCmd.includes("|| true"), "non-matching commands stay silent and successful");
      // The device-evidence deterrent: hand-driven device commands get the
      // lane-owned-and-batched reminder (machine-global lease; device proof is a
      // checkpoint, never an inner loop) — same properties as the pixel reminder.
      assert.ok(/connected\[A-Za-z\]\*AndroidTest/.test(preCmd), "reminder triggers on gradlew connected*AndroidTest");
      assert.ok(preCmd.includes("maestro test"), "reminder triggers on hand-run maestro test");
      assert.ok(/adb \(-s \[\^ \]\+ \)\?\(install\|uninstall\)/.test(preCmd), "reminder triggers on adb install/uninstall (with or without -s)");
      assert.ok(preCmd.includes("device-lease.mjs"), "the reason names the machine-global lease");
      // EVERY hook under the Bash matcher carries the allow + silent-no-match
      // properties individually — joining must not hide a blocking or noisy one.
      for (const h of bashEntry.hooks || []) {
        assert.ok(h.command.includes('"permissionDecision\":\"allow'), "every Bash reminder allows — never blocks/denies");
        assert.ok(h.command.trimEnd().endsWith("|| true"), "every Bash reminder is silent and successful on no match");
      }
    });

    await t.test("qa/ harness scripts exist and reference their collaborators", () => {
      for (const rel of [
        "qa/verify.mjs",
        "qa/receipt-check.mjs",
        "qa/lib/inputs-hash.mjs",
        "qa/scaffold-feature.mjs",
        "qa/refusal-demo.mjs",
      ]) {
        assert.ok(fs.existsSync(path.join(out, rel)), `${rel} exists`);
      }
      const verify = laneSrc(out);
      assert.match(verify, /specCoverage/);
      const receiptCheck = fs.readFileSync(path.join(out, "qa/receipt-check.mjs"), "utf8");
      assert.match(receiptCheck, /\.\/lib\/inputs-hash\.mjs/);
    });

    await t.test("receipt's commit.dirty keeps whole paths — porcelain's leading space is not trimmed away", async () => {
      // Regression guard for a corrupted audit record: commit.dirty was built from
      // tryGit("status --porcelain"), and tryGit trims the WHOLE blob. An unstaged
      // modification is " M path", so the trim ate the first line's leading space and
      // the fixed slice(3) then swallowed that path's first character — the receipt
      // named "omposeApp/.../InspectorCatalog.kt", a file that does not exist. Always
      // the first entry, always silently. Exercised for real: a git repo whose first
      // porcelain line is an unstaged modification.
      const verify = laneSrc(out);
      const dirtyLine = verify.split("\n").find((l) => l.includes("dirty:"));
      assert.ok(dirtyLine, "the receipt still records commit.dirty");
      assert.doesNotMatch(
        dirtyLine,
        /tryGit\("status --porcelain"\)/,
        `commit.dirty must not read the trimmed blob (got: ${dirtyLine.trim()})`,
      );

      const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-dirty-"));
      try {
        const { execSync } = await import("node:child_process");
        const git = (cmd) => execSync(`git ${cmd}`, { cwd: repo, stdio: ["ignore", "pipe", "ignore"] });
        git("init -q");
        git("config user.email t@t.t");
        git("config user.name t");
        fs.writeFileSync(path.join(repo, "aaa-first.txt"), "one\n");
        git("add -A");
        git("commit -qm seed");
        fs.writeFileSync(path.join(repo, "aaa-first.txt"), "two\n"); // unstaged -> " M aaa-first.txt"

        const raw = execSync("git status --porcelain", { cwd: repo, encoding: "utf8" });
        assert.match(raw, /^ M aaa-first\.txt/, "the first porcelain line really does lead with a space");

        // The OLD shape, reproduced here so the bug it hid stays visible.
        const trimmed = raw.trim().split("\n").filter(Boolean).map((l) => l.slice(3));
        assert.deepEqual(trimmed, ["aa-first.txt"], "the trimmed parse loses a character (the bug)");

        // The shipped shape.
        const kept = raw.replace(/\n+$/, "").split("\n").filter(Boolean).map((l) => l.slice(3));
        assert.deepEqual(kept, ["aaa-first.txt"], "the untrimmed parse keeps the whole path");
      } finally {
        fs.rmSync(repo, { recursive: true, force: true });
      }
    });

    await t.test("evidence attests EXECUTION: lane forces --rerun, build script declares golden/UPDATE_GOLDEN as test inputs", () => {
      // Regression guard for the cache-poisoning bug: Gradle's build cache replayed a PASS
      // from a different tree state (byte-identical re-scaffold; golden baselines and the
      // UPDATE_GOLDEN env var were undeclared inputs), so a lane receipt attested tests that
      // never ran and a missing golden baseline sailed through locally while failing in CI.
      //
      // The flag is MODE-SCOPED, not dropped: `RERUN` resolves to " --rerun" for every
      // full-lane (receipt-bearing) run and to "" only under --fast, whose receipt is
      // already declared non-evidence (mode "fast", no rung, refused by receipt-check) —
      // the integrity mechanism stays with the runs that produce integrity-bearing
      // artifacts. Every desktopTest invocation must carry the scoped flag.
      const verify = laneSrc(out);
      assert.match(verify, /const RERUN = fast \? "" : " --rerun";/, "the rerun flag is mode-scoped: full forces execution, fast omits it");
      const testInvocations = verify.split("\n").filter((l) => l.includes(":composeApp:desktopTest"));
      assert.ok(testInvocations.length >= 2, "lane has desktopTest invocations");
      for (const line of testInvocations) {
        assert.match(line, /\$\{RERUN\}/, `desktopTest invocation carries the mode-scoped rerun flag: ${line.trim()}`);
      }
      // The device tier never runs under --fast, so its instrumented invocation keeps the
      // unconditional flag.
      assert.match(verify, /connectedDebugAndroidTest --rerun/, "instrumented invocation forces --rerun unconditionally");
      const buildGradle = fs.readFileSync(path.join(out, "composeApp/build.gradle.kts"), "utf8");
      assert.match(buildGradle, /goldenBaselines/, "golden baselines declared as a Test input");
      assert.match(buildGradle, /inputs\.property\("updateGolden"/, "UPDATE_GOLDEN declared as a Test input");
    });

    await t.test("verification is tiered: CLAUDE.md teaches inner-loop vs checkpoint, and the pre-push gate ships", () => {
      const claudeMd = fs.readFileSync(path.join(out, "CLAUDE.md"), "utf8");
      assert.match(claudeMd, /checkpoint, not an inner loop/i, "CLAUDE.md frames the full lane as a checkpoint");
      assert.match(claudeMd, /desktopTest/, "the inner loop names the fast unit-test command");
      assert.match(claudeMd, /setup-hooks\.mjs/, "CLAUDE.md points humans at the pre-push setup");
      // The pre-push hook runs the CHEAP receipt check (not the full lane) and documents the bypass.
      const hook = fs.readFileSync(path.join(out, ".githooks/pre-push"), "utf8");
      assert.match(hook, /if node qa\/receipt-check\.mjs/, "pre-push gates on the cheap receipt check, not the full lane");
      assert.match(hook, /no-verify/, "pre-push documents the bypass; CI still enforces");
      const setup = fs.readFileSync(path.join(out, "qa/setup-hooks.mjs"), "utf8");
      assert.match(setup, /core\.hooksPath/, "setup-hooks points git at .githooks");
    });

    await t.test("latest.json is the committed receipt-of-record — never gitignored", () => {
      // The Evidence audit trail is the git history of this one file, so it must stay tracked.
      const gitignore = fs.readFileSync(path.join(out, ".gitignore"), "utf8");
      const ignoreRules = gitignore.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
      assert.ok(!ignoreRules.some((l) => l.includes("qa/evidence")), "nothing under qa/evidence is gitignored");
    });

    await t.test("qa/e2e/smoke.yaml cites SHELL-01 and uses extendedWaitUntil", () => {
      const smoke = fs.readFileSync(path.join(out, "qa/e2e/smoke.yaml"), "utf8");
      assert.match(smoke, /SPEC:\s*SHELL-01/);
      assert.match(smoke, /extendedWaitUntil/);
    });

    await t.test("qa/e2e/smoke.yaml nav taps select by nav_<slug> testTag id, never display text", () => {
      // Durable-test rule (template CLAUDE.md): E2E selectors go by testTag. The nav
      // tags are derived in AppShell.kt (navItemTag: "nav_" + label slug) — this pins
      // the smoke flow to that id scheme so a regression back to text taps is caught.
      const smoke = fs.readFileSync(path.join(out, "qa/e2e/smoke.yaml"), "utf8");
      assert.match(smoke, /id:\s*"nav_profile"/, "taps the Profile tab by nav_profile id");
      assert.match(smoke, /id:\s*"nav_home"/, "taps the Home tab by nav_home id");
      assert.ok(!/tapOn:\s*"/.test(smoke), "no tapOn by bare display text remains");
    });

    await t.test("qa/evidence/schema.json parses and identifies as cmp-evidence", () => {
      const raw = fs.readFileSync(path.join(out, "qa/evidence/schema.json"), "utf8");
      const schema = JSON.parse(raw);
      const id = schema.$id ?? schema.id ?? "";
      assert.match(String(id), /cmp-evidence/);
    });

    await t.test("qa/evidence/schema.json declares the evidence ladder (nullable evidenceLevel) and accepts the release profile", () => {
      const schema = JSON.parse(fs.readFileSync(path.join(out, "qa/evidence/schema.json"), "utf8"));
      const level = schema.properties?.evidenceLevel;
      assert.ok(level, "schema declares evidenceLevel");
      assert.deepEqual(level.type, ["object", "null"], "evidenceLevel is nullable (a FAILed lane has no rung)");
      assert.deepEqual(level.properties.rung.enum, ["L0", "L1", "L2", "L3"]);
      assert.deepEqual(level.properties.name.enum, ["scaffold", "desktop", "device", "release"]);
      // A release-profile receipt (the only way to reach L3) must not violate its own schema.
      assert.ok(schema.properties.profile.enum.includes("release"), "profile enum accepts 'release'");
    });

    await t.test("verify.mjs derives the rung via qa/lib/evidence-level.mjs and writes it onto the receipt + verdict line", () => {
      const verify = laneSrc(out);
      assert.match(verify, /from "\.\/lib\/evidence-level\.mjs"/, "the rung derivation lives in the lib, imported by the lane");
      assert.match(verify, /evidenceLevel: level/, "the receipt carries evidenceLevel");
      assert.match(verify, /\$\{level\.rung\} \$\{level\.name\}/, "the verdict line names the rung alongside the strength label");
      assert.match(verify, /strength: \{ onDeviceSteps \}/, "the existing fine-print strength field is untouched — the rung is added alongside, never in place of it");
      assert.ok(fs.existsSync(path.join(out, "qa/lib/evidence-level.mjs")), "qa/lib/evidence-level.mjs ships in the scaffold");
    });

    await t.test("--fast is the inner loop: exclusion derived from DEVICE_STEPS, mode stamped, banner loud, docs honest", () => {
      const verify = laneSrc(out);
      // The slow-tier list is DERIVED from DEVICE_STEPS (+ releaseBuild) — one
      // source of truth with the receipt-strength/lease feature, never a
      // second hand-maintained list that can drift.
      assert.match(verify, /\[\.\.\.DEVICE_STEPS, "releaseBuild"\]/, "fast exclusion reuses DEVICE_STEPS as source of truth");
      assert.match(verify, /--fast/, "verify.mjs recognizes --fast");
      assert.match(verify, /mode: fast \? "fast" : "full"|const mode = fast \? "fast" : "full"/, "the receipt records mode fast/full distinctly");
      assert.match(verify, /INNER LOOP ONLY, NOT THE DONE-GATE/, "the start banner is loud and unambiguous");
      assert.match(verify, /FAST — INNER LOOP ONLY, NOT DONE/, "the fast verdict line is visually distinct from done-green");
      assert.match(verify, /evidenceLevel\(steps, profile, \{ mode, ladder: pack\.evidenceLadder \?\? null \}\)/, "the rung derivation is told the mode — fast derives no rung");
      // Docs: CLAUDE.md commands table + TESTING.md both teach the flag honestly.
      const claudeMd = fs.readFileSync(path.join(out, "CLAUDE.md"), "utf8");
      assert.match(claudeMd, /node qa\/verify\.mjs --fast/, "CLAUDE.md commands table lists --fast");
      assert.match(claudeMd, /Inner loop — NOT the done-gate/, "CLAUDE.md labels --fast as not the done-gate");
      const testingMd = fs.readFileSync(path.join(out, "docs/TESTING.md"), "utf8");
      assert.match(testingMd, /--fast/, "TESTING.md documents --fast");
      // Schema: mode is declared, optional (older receipts predate it).
      const schema = JSON.parse(fs.readFileSync(path.join(out, "qa/evidence/schema.json"), "utf8"));
      assert.deepEqual(schema.properties.mode.enum, ["full", "fast"], "schema declares the mode field");
      assert.ok(!schema.required.includes("mode"), "mode stays optional — receipts predating the flag remain valid");
    });

    await t.test("receipt-check REFUSES a fast-mode receipt — a session cannot end 'done' on --fast evidence", () => {
      const receiptPath = path.join(out, "qa/evidence/latest.json");
      const baseReceipt = {
        schema: "cmp-evidence/1",
        profile: "local",
        verdict: "PASS",
        commit: { sha: null, dirty: [] },
        inputs: { hash: "a".repeat(64), fileCount: 1 },
        steps: [{ name: "build", verdict: "PASS", durationMs: 60_000 }, { name: "unitTests", verdict: "PASS", durationMs: 30_000 }],
        strength: { onDeviceSteps: [] },
        evidenceLevel: null,
        artifacts: [],
        toolVersions: {},
        generatedAt: new Date().toISOString(),
      };
      try {
        // 1. mode "fast" → refused BY NAME, exit 2 (the Stop-hook block signal),
        //    before any hash recompute (the bogus inputs.hash never matters).
        fs.writeFileSync(receiptPath, JSON.stringify({ ...baseReceipt, mode: "fast" }, null, 2));
        try {
          execFileSync(process.execPath, [path.join(out, "qa/receipt-check.mjs"), "--hook"], { input: "{}", encoding: "utf8" });
          assert.fail("expected --hook to exit 2 over a fast-mode receipt");
        } catch (err) {
          assert.equal(err.status, 2, "hook mode blocks with exit 2");
          assert.match(String(err.stderr), /--fast \(inner-loop only\)/, "the refusal names --fast");
          assert.match(String(err.stderr), /run the full lane/, "the refusal names the fix");
        }
        // 2. A legacy receipt WITHOUT mode is never refused as fast — it falls
        //    through to the normal predicate (here: hash mismatch), proving the
        //    fast refusal cannot misfire on pre-flag receipts.
        fs.writeFileSync(receiptPath, JSON.stringify(baseReceipt, null, 2));
        try {
          execFileSync(process.execPath, [path.join(out, "qa/receipt-check.mjs"), "--hook"], { input: "{}", encoding: "utf8" });
          assert.fail("expected --hook to exit 2 over a stale-hash receipt");
        } catch (err) {
          assert.equal(err.status, 2);
          assert.doesNotMatch(String(err.stderr), /--fast/, "a mode-less receipt is never refused for fast-mode reasons");
        }
      } finally {
        fs.rmSync(receiptPath, { force: true });
      }
    });

    // The gate must still refuse while a lane runs — no receipt yet is not done —
    // but "run the lane" is the wrong instruction when one is already running,
    // and it fired ~8 times in one observed session. The refusal stays; the
    // instruction changes.
    // evidence-economics S8 follow-up (peer finding): the spine used to hash a
    // surface it could not see and return the sha256 of the empty set —
    // e3b0c442…, a valid-looking digest attesting NOTHING. It now throws, and
    // the Stop hook must turn that into a refusal with the reason, never a
    // stack trace: this runs on every turn end.
    await t.test("receipt-check REFUSES cleanly when the verified surface cannot be resolved — never an unhandled crash", () => {
      const receiptPath = path.join(out, "qa/evidence/latest.json");
      const surfacePath = path.join(out, "qa/verified-surface.json");
      try {
        fs.writeFileSync(receiptPath, JSON.stringify({ schema: "cmp-evidence/1", profile: "local", mode: "full", verdict: "PASS", inputs: { hash: "a".repeat(64), fileCount: 1 }, steps: [{ name: "build", verdict: "PASS", durationMs: 60_000 }] }));
        fs.writeFileSync(surfacePath, '{ "surface": [] }');
        try {
          execFileSync(process.execPath, [path.join(out, "qa/receipt-check.mjs"), "--hook"], { input: "{}", encoding: "utf8" });
          assert.fail("expected the hook to refuse");
        } catch (err) {
          assert.equal(err.status, 2, "a refusal, not a crash (a crash would exit 1 with a stack trace)");
          assert.match(String(err.stderr), /cannot verify this receipt/);
          assert.match(String(err.stderr), /declares no surface/, "and it names what is wrong");
          assert.doesNotMatch(String(err.stderr), /at Module\._load|node:internal/, "no stack trace reaches the human");
        }
      } finally {
        fs.rmSync(receiptPath, { force: true });
        fs.rmSync(surfacePath, { force: true });
      }
    });

    await t.test("receipt-check REFUSES a smoke-stage receipt — it proves the framework returns, never the change (Rule 0)", () => {
      const receiptPath = path.join(out, "qa/evidence/latest.json");
      try {
        fs.writeFileSync(receiptPath, JSON.stringify({ schema: "cmp-evidence/1", profile: "smoke", stage: "smoke", mode: "full", verdict: "PASS", inputs: { hash: "a".repeat(64) }, steps: [{ name: "harnessIntegrity", verdict: "PASS", durationMs: 5 }] }));
        try {
          execFileSync(process.execPath, [path.join(out, "qa/receipt-check.mjs"), "--hook"], { input: "{}", encoding: "utf8" });
          assert.fail("a smoke receipt must not end a session as done");
        } catch (err) {
          assert.equal(err.status, 2);
          assert.match(String(err.stderr), /smoke profile/);
          assert.match(String(err.stderr), /proves the instrument, not this change/);
        }
      } finally {
        fs.rmSync(receiptPath, { force: true });
      }
    });

    await t.test("receipt-check REFUSES a receipt whose device tier was skipped for an ENVIRONMENTAL reason; a structural skip is honest and allowed", () => {
      const receiptPath = path.join(out, "qa/evidence/latest.json");
      const base = { schema: "cmp-evidence/1", profile: "local", stage: "change", mode: "full", verdict: "PASS", inputs: { hash: "a".repeat(64) } };
      try {
        // Environmental: the one explicit opt-out. Visible on the receipt, never done.
        fs.writeFileSync(receiptPath, JSON.stringify({ ...base, steps: [{ name: "build", verdict: "PASS", durationMs: 5 }, { name: "e2eSmoke", verdict: "SKIP", skipKind: "environment", reason: "device tier disabled by CMP_DEVICE=none", durationMs: 0 }] }));
        try {
          execFileSync(process.execPath, [path.join(out, "qa/receipt-check.mjs"), "--hook"], { input: "{}", encoding: "utf8" });
          assert.fail("an opted-out device tier must not end a session as done");
        } catch (err) {
          assert.equal(err.status, 2);
          assert.match(String(err.stderr), /device tier did not run — e2eSmoke: device tier disabled by CMP_DEVICE=none/);
          assert.match(String(err.stderr), /boots a headless emulator itself/);
        }
        // A receipt predating skipKind is read by its reason text.
        fs.writeFileSync(receiptPath, JSON.stringify({ ...base, steps: [{ name: "androidChecks", verdict: "SKIP", reason: "no Android device/emulator attached (adb)", durationMs: 0 }] }));
        try {
          execFileSync(process.execPath, [path.join(out, "qa/receipt-check.mjs"), "--hook"], { input: "{}", encoding: "utf8" });
          assert.fail("an old-style 'no device' skip is the same gap");
        } catch (err) {
          assert.equal(err.status, 2);
          assert.match(String(err.stderr), /device tier did not run — androidChecks: no Android device/);
        }
        // Structural: the project has no instrumented sources / no e2e harness. Not a gap the environment can close — the check moves on to the hash.
        fs.writeFileSync(receiptPath, JSON.stringify({ ...base, steps: [{ name: "androidChecks", verdict: "SKIP", skipKind: "structure", reason: "no instrumented tests", durationMs: 0 }, { name: "e2eSmoke", verdict: "SKIP", skipKind: "structure", reason: "e2e harness not included in this project (--no-e2e)", durationMs: 0 }] }));
        try {
          execFileSync(process.execPath, [path.join(out, "qa/receipt-check.mjs"), "--hook"], { input: "{}", encoding: "utf8" });
          assert.fail("the hash is wrong on purpose, so this still refuses — but for the hash");
        } catch (err) {
          assert.equal(err.status, 2);
          assert.doesNotMatch(String(err.stderr), /device tier did not run/, "a structural skip is not the device-tier refusal");
        }
      } finally {
        fs.rmSync(receiptPath, { force: true });
      }
    });

    await t.test("receipt-check REFUSES a nightly-stage receipt — it proves the harness, never this change", () => {
      const receiptPath = path.join(out, "qa/evidence/latest.json");
      try {
        fs.writeFileSync(
          receiptPath,
          JSON.stringify({ schema: "cmp-evidence/1", profile: "nightly", stage: "nightly", mode: "full", verdict: "PASS", inputs: { hash: "a".repeat(64) }, steps: [{ name: "build", verdict: "PASS", durationMs: 60_000 }] }),
        );
        try {
          execFileSync(process.execPath, [path.join(out, "qa/receipt-check.mjs"), "--hook"], { input: "{}", encoding: "utf8" });
          assert.fail("a nightly receipt must not end a session as done");
        } catch (err) {
          assert.equal(err.status, 2);
          assert.match(String(err.stderr), /nightly stage/, "refused by name");
          assert.match(String(err.stderr), /proves the harness, not this change/);
        }
      } finally {
        fs.rmSync(receiptPath, { force: true });
      }
    });

    await t.test("receipt-check with a lane IN FLIGHT still refuses, but says WAIT — never 'run the lane' at a running lane", () => {
      const receiptPath = path.join(out, "qa/evidence/latest.json");
      const markerPath = path.join(out, "qa/.lane-in-progress");
      fs.mkdirSync(path.dirname(markerPath), { recursive: true });
      try {
        fs.writeFileSync(receiptPath, JSON.stringify({ schema: "cmp-evidence/1", profile: "local", verdict: "FAIL", inputs: { hash: "a".repeat(64) }, steps: [] }));
        fs.writeFileSync(markerPath, JSON.stringify({ pid: process.pid, step: "releaseBuild", index: 9, total: 16, stepStartedAt: new Date().toISOString() }));
        try {
          execFileSync(process.execPath, [path.join(out, "qa/receipt-check.mjs"), "--hook"], { input: "{}", encoding: "utf8" });
          assert.fail("a running lane has produced no receipt — the hook must still block");
        } catch (err) {
          assert.equal(err.status, 2, "still refused");
          assert.match(String(err.stderr), /ALREADY RUNNING/, "names the fact");
          assert.match(String(err.stderr), /releaseBuild, step 9 of 16/, "and the step, from the marker the lane stamps");
          assert.match(String(err.stderr), /Do NOT start a second one/);
          assert.doesNotMatch(String(err.stderr), /Run `node qa\/verify\.mjs`/, "the wrong instruction is gone");
        }
        // A STALE marker (a crashed lane, long ago) is not a running lane.
        const old = Date.now() / 1000 - 60 * 60;
        fs.utimesSync(markerPath, old, old);
        try {
          execFileSync(process.execPath, [path.join(out, "qa/receipt-check.mjs"), "--hook"], { input: "{}", encoding: "utf8" });
          assert.fail("expected refusal");
        } catch (err) {
          assert.equal(err.status, 2);
          assert.match(String(err.stderr), /Run `node qa\/verify\.mjs`/, "back to the normal instruction");
          assert.doesNotMatch(String(err.stderr), /ALREADY RUNNING/);
        }
      } finally {
        fs.rmSync(receiptPath, { force: true });
        fs.rmSync(markerPath, { force: true });
      }
    });

    await t.test("the Bash reminder hook nudges bare full-lane runs toward --fast — allow-only, silent when --fast is present", () => {
      const settings = JSON.parse(fs.readFileSync(path.join(out, ".claude/settings.json"), "utf8"));
      const bashEntry = (settings.hooks?.PreToolUse || []).find((e) => e.matcher === "Bash");
      const cmd = (bashEntry?.hooks || []).map((h) => h.command).find((c) => c.includes("qa/verify\\.mjs"));
      assert.ok(cmd, "the fast-nudge hook ships under the SAME Bash matcher entry");
      assert.ok(cmd.includes("--fast"), "the nudge names the flag");
      // Functional proof against the REAL hook-input shape: JSON on stdin.
      const run = (json) => spawnSync("sh", ["-c", cmd], { input: json, encoding: "utf8" });
      const fired = run('{"tool_input":{"command":"node qa/verify.mjs"}}');
      assert.equal(fired.status, 0);
      assert.match(fired.stdout, /permissionDecision.*allow/, "fires (allow-only) on a bare full-lane run");
      assert.match(fired.stdout, /--fast/, "the reminder points at --fast");
      const silentFast = run('{"tool_input":{"command":"node qa/verify.mjs --fast"}}');
      assert.equal(silentFast.status, 0);
      assert.equal(silentFast.stdout, "", "must NOT fire when --fast is already present");
      const silentOther = run('{"tool_input":{"command":"ls -la"}}');
      assert.equal(silentOther.status, 0);
      assert.equal(silentOther.stdout, "", "silent and successful on every non-matching command");
    });

    await t.test("specs/ has README + app-base + home specs with their clause ids", () => {
      for (const rel of ["specs/README.md", "specs/app-base.spec.md", "specs/home.spec.md"]) {
        assert.ok(fs.existsSync(path.join(out, rel)), `${rel} exists`);
      }
      const appBase = fs.readFileSync(path.join(out, "specs/app-base.spec.md"), "utf8");
      assert.match(appBase, /ARCH-01/);
      const home = fs.readFileSync(path.join(out, "specs/home.spec.md"), "utf8");
      assert.match(home, /HOME-01/);
    });

    await t.test("no unreplaced __PACKAGE__/__APP_NAME__ tokens remain in the asserted surfaces", () => {
      for (const rel of ASSERTED_FILES) {
        // The machine-owned lane is COPIED, never stamped, so a token inside it
        // is a deliberate literal — qa/lib/approvals.mjs and
        // qa/scaffold-feature.mjs both need to name `__PACKAGE__` to detect or
        // describe an UNRESOLVED one. Stamping used to rewrite those literals
        // out from under them; the region rule is what fixed it, so excluding
        // the region here is the assertion agreeing with that fix, not a hole.
        if (isHarnessFile(rel)) continue;
        const p = path.join(out, rel);
        const content = fs.readFileSync(p, "utf8");
        assert.ok(!content.includes("__PACKAGE__"), `${rel} has no leftover __PACKAGE__ token`);
        assert.ok(!content.includes("__APP_NAME__"), `${rel} has no leftover __APP_NAME__ token`);
      }
    });

    await t.test(".github/workflows/verify.yml enforces the receipt-attests-HEAD gate", () => {
      const workflow = fs.readFileSync(path.join(out, ".github/workflows/verify.yml"), "utf8");
      assert.match(workflow, /Receipt attests HEAD/);
      assert.match(workflow, /qa\/receipt-check\.mjs/);
    });
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

// --- The evidence ladder: rung derivation honesty (qa/lib/evidence-level.mjs) --
//
// The rung is the vocabulary the Evidence business sells in, so it must be
// honest to a fault: DERIVED from which steps actually ran and PASSed, never
// declared by a profile flag, and a SKIP can never buy a rung — the key pin
// here is releaseSmoke SKIP (e.g. unsigned keystore) staying L2, never L3.

/** A synthetic green desktop lane (local profile, no device attached). */
function desktopPassSteps() {
  const pass = (name) => ({ name, verdict: "PASS", durationMs: 100 });
  const skip = (name, reason) => ({ name, verdict: "SKIP", reason, durationMs: 1 });
  return [
    pass("specCoverage"),
    skip("approvals", "unreviewed artifacts"),
    pass("componentStories"),
    pass("reachability"),
    pass("archDoc"),
    pass("schemaHistory"),
    pass("build"),
    pass("releaseBuild"),
    pass("unitTests"),
    pass("conformance"),
    pass("goldenTrees"),
    skip("tokenDrift", "no device"),
    pass("a11y"),
    skip("e2eSmoke", "no device"),
    skip("androidChecks", "no device"),
  ];
}

test("evidence ladder: a green desktop lane (device steps all SKIP) is L1 — SKIPs are visible fine print, not rungs", () => {
  const level = evidenceLevel(desktopPassSteps(), "local", { ladder: CMP_LADDER });
  assert.equal(level.rung, "L1");
  assert.equal(level.name, "desktop");
  assert.ok(level.satisfiedBy.includes("conformance") && level.satisfiedBy.includes("releaseBuild"));
  assert.ok(!level.satisfiedBy.includes("e2eSmoke"), "a SKIPped device step is never counted as evidence");
});

test("evidence ladder: one on-device execution step PASSed lifts to L2 device", () => {
  const steps = desktopPassSteps().map((s) => (s.name === "e2eSmoke" ? { name: "e2eSmoke", verdict: "PASS", durationMs: 60_000 } : s));
  const level = evidenceLevel(steps, "local", { ladder: CMP_LADDER });
  assert.equal(level.rung, "L2");
  assert.equal(level.name, "device");
  assert.ok(level.satisfiedBy.includes("e2eSmoke"));
});

test("evidence ladder: THE key pin — releaseSmoke SKIP (unsigned keystore) never upgrades L2 to L3", () => {
  const steps = desktopPassSteps().map((s) => (s.name === "e2eSmoke" ? { name: "e2eSmoke", verdict: "PASS", durationMs: 60_000 } : s));
  steps.push({ name: "releaseSmoke", verdict: "SKIP", reason: "release APK is unsigned — no signingConfig", durationMs: 0 });
  const level = evidenceLevel(steps, "release", { ladder: CMP_LADDER });
  assert.equal(level.rung, "L2", "a SKIP can never buy a rung — the label must not overclaim");
  assert.ok(!level.satisfiedBy.includes("releaseSmoke"));
});

test("evidence ladder: releaseSmoke PASSed on top of L2 is L3 release", () => {
  const steps = desktopPassSteps().map((s) => (s.name === "e2eSmoke" ? { name: "e2eSmoke", verdict: "PASS", durationMs: 60_000 } : s));
  steps.push({ name: "releaseSmoke", verdict: "PASS", durationMs: 90_000 });
  const level = evidenceLevel(steps, "release", { ladder: CMP_LADDER });
  assert.equal(level.rung, "L3");
  assert.equal(level.name, "release");
  assert.ok(level.satisfiedBy.includes("releaseSmoke"));
});

test("evidence ladder: a step that could not run (ERROR) earns no rung either — 'could not check' is not evidence", () => {
  const steps = [
    { name: "harnessIntegrity", verdict: "PASS" }, { name: "specCoverage", verdict: "PASS" }, { name: "approvals", verdict: "PASS" },
    { name: "componentStories", verdict: "PASS" }, { name: "reachability", verdict: "PASS" }, { name: "archDoc", verdict: "PASS" },
    { name: "schemaHistory", verdict: "PASS" }, { name: "build", verdict: "PASS" }, { name: "unitTests", verdict: "PASS" },
    { name: "conformance", verdict: "PASS" }, { name: "goldenTrees", verdict: "PASS" }, { name: "a11y", verdict: "PASS" },
    { name: "releaseBuild", verdict: "ERROR", reason: "DID NOT COMPLETE — deadline" },
  ];
  assert.equal(evidenceLevel(steps, "local", { ladder: CMP_LADDER }), null);
});

test("evidence ladder: a FAILed lane has no rung — evidenceLevel is null", () => {
  const steps = desktopPassSteps().map((s) => (s.name === "goldenTrees" ? { name: "goldenTrees", verdict: "FAIL", reason: "drift", durationMs: 100 } : s));
  assert.equal(evidenceLevel(steps, "local", { ladder: CMP_LADDER }), null);
  // Even a FAIL in a device step nulls the rung — the lane verdict is FAIL.
  const deviceFail = desktopPassSteps().map((s) => (s.name === "e2eSmoke" ? { name: "e2eSmoke", verdict: "FAIL", reason: "smoke red", durationMs: 100 } : s));
  assert.equal(evidenceLevel(deviceFail, "local", { ladder: CMP_LADDER }), null);
});

test("evidence ladder: a fast-mode run derives NO rung — the inner loop is a signal, never evidence", () => {
  // Even a fully green step list buys nothing under mode "fast": a fast receipt
  // must never be silently reused as if it were a full-lane result.
  assert.equal(evidenceLevel(desktopPassSteps(), "local", { mode: "fast", ladder: CMP_LADDER }), null);
  // The same steps under full mode (or with mode unstated — legacy callers)
  // still derive their honest rung.
  assert.equal(evidenceLevel(desktopPassSteps(), "local", { mode: "full", ladder: CMP_LADDER }).rung, "L1");
  assert.equal(evidenceLevel(desktopPassSteps(), "local", { ladder: CMP_LADDER }).rung, "L1");
});

test("evidence ladder: a green scaffold-profile lane is L0 — and the profile flag never buys a higher rung", () => {
  const pass = (name) => ({ name, verdict: "PASS", durationMs: 100 });
  const scaffoldSteps = [
    pass("specCoverage"),
    { name: "approvals", verdict: "SKIP", reason: "unreviewed", durationMs: 1 },
    pass("componentStories"),
    pass("reachability"),
    pass("archDoc"),
    pass("schemaHistory"),
    pass("build"),
    pass("unitTests"),
  ];
  // The same steps claim the same rung under any requested profile: derived, never declared.
  for (const profile of ["scaffold", "local", "ci", "release"]) {
    const level = evidenceLevel(scaffoldSteps, profile, { ladder: CMP_LADDER });
    assert.equal(level.rung, "L0", `profile "${profile}" cannot declare a rung the steps did not earn`);
    assert.equal(level.name, "scaffold");
  }
});
