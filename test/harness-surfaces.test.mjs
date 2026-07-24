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
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scaffold } from "../src/scaffold.mjs";

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
      const verify = fs.readFileSync(path.join(out, "qa/verify.mjs"), "utf8");
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
      const verify = fs.readFileSync(path.join(out, "qa/verify.mjs"), "utf8");
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
      const verify = fs.readFileSync(path.join(out, "qa/verify.mjs"), "utf8");
      const testInvocations = verify.split("\n").filter((l) => l.includes(":composeApp:desktopTest"));
      assert.ok(testInvocations.length >= 2, "lane has desktopTest invocations");
      for (const line of testInvocations) {
        assert.match(line, /--rerun/, `desktopTest invocation forces --rerun: ${line.trim()}`);
      }
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
