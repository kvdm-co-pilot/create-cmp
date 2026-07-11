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
    tabs: [{ label: "Home", icon: "home" }],
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
  ".claude/skills/add-feature/SKILL.md",
  ".claude/skills/add-screen/SKILL.md",
  ".claude/skills/add-repository/SKILL.md",
  ".claude/settings.json",
  "qa/verify.mjs",
  "qa/receipt-check.mjs",
  "qa/lib/inputs-hash.mjs",
  "qa/scaffold-feature.mjs",
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

    await t.test("qa/e2e/smoke.yaml cites SHELL-01 and uses extendedWaitUntil", () => {
      const smoke = fs.readFileSync(path.join(out, "qa/e2e/smoke.yaml"), "utf8");
      assert.match(smoke, /SPEC:\s*SHELL-01/);
      assert.match(smoke, /extendedWaitUntil/);
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
