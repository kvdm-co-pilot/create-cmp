// Two readers of one fact: "are the installed plugin bytes the marketplace clone's bytes?"
// scripts/plugin-refresh.mjs answers it with sameBytes() — BOTH directions, because a file the
// clone gained (a new skill, a new hook) is missing from a stale install. `doctor --adherence`
// answers it for its "plugin bytes current" row through the same module, and must reach the
// same answer: a PASS row that says "byte-identical" over an install missing a file the clone
// has tells the adopter their plugin is current when it is not.
//
// Invariant: over every planted difference (a file only the clone has, a file only the install
// has, a file whose bytes differ, none), the doctor row PASSes exactly when sameBytes() says
// identical.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { gatherAdherence, PASS } from "../src/lib/adherence.mjs";
import { sameBytes } from "../scripts/plugin-refresh.mjs";

const run = () => ({ status: 1, stdout: "", stderr: "" });
const write = (p, s) => (fs.mkdirSync(path.dirname(p), { recursive: true }), fs.writeFileSync(p, s));

const PLANTS = {
  none: () => {},
  "a file only the clone has (a new skill)": (clone) => write(path.join(clone, "skills", "new-skill", "SKILL.md"), "new\n"),
  "a file only the install has": (_c, install) => write(path.join(install, "skills", "gone", "SKILL.md"), "gone\n"),
  "a file whose bytes differ": (clone) => write(path.join(clone, "skills", "a", "SKILL.md"), "moved\n"),
};

for (const [name, plant] of Object.entries(PLANTS)) {
  test(`doctor's plugin row and plugin-refresh's sameBytes agree — ${name}`, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-adh-plugin-"));
    const claudeDir = path.join(root, "home", ".claude");
    const clone = path.join(claudeDir, "plugins", "marketplaces", "cmp-mkt");
    const install = path.join(claudeDir, "plugins", "cache", "cmp-mkt", "create-cmp", "1.0.0");
    for (const d of [clone, install]) {
      write(path.join(d, "skills", "a", "SKILL.md"), "a\n");
      write(path.join(d, ".claude-plugin", "plugin.json"), "{}\n");
    }
    plant(clone, install);
    write(
      path.join(claudeDir, "plugins", "installed_plugins.json"),
      JSON.stringify({ version: 2, plugins: { "create-cmp@cmp-mkt": [{ scope: "user", installPath: install }] } }),
    );
    const proj = path.join(root, "app");
    fs.mkdirSync(proj, { recursive: true });
    try {
      const { rows } = await gatherAdherence({ projectDir: proj, home: path.join(root, "home"), claudeDir, managedPaths: [], run });
      const r = rows.find((x) => /plugin/i.test(x.label));
      assert.ok(r, "the card carries a plugin row");
      const truth = sameBytes(install, clone).identical;
      assert.equal(
        r.status === PASS,
        truth,
        `plugin-refresh says identical=${truth}; doctor's row reads ${r.status}: ${r.detail}`,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
