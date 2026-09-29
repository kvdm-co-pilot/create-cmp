// `doctor --adherence --fix` must never add a user-scope `ask` that shadows an existing
// `allow`, nor a `deny` that overrides one (BATCH-2-DECISIONS D4). Claude Code merges
// permission rules across user, project, local and managed settings, and an ask/deny at
// ANY scope beats an allow at any other — so "an existing allow" is an allow at any scope
// the session reads, not only the file --fix writes. This repo's own maintainer allow for
// `npm publish` and `gh pr merge` lives in .claude/settings.local.json.
//
// Invariant: for every scope Claude Code merges, an allow there is never shadowed by what
// --fix writes, even when the person answers yes to every prompt.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { RELEASE_ACTS, CREDENTIAL_DENY, rulesOverlap, runAdherence } from "../src/lib/adherence.mjs";

const run = () => ({ status: 1, stdout: "", stderr: "" });

const ALLOWS = [
  "Bash(npm publish:*)",
  "Bash(gh pr merge:*)",
  "Bash(git push origin main)",
  "Read(~/.npmrc)",
];
const TARGETS = [...RELEASE_ACTS.map((a) => a.rule), ...CREDENTIAL_DENY];

async function fixWithAllowAt(scope) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-adh-scope-"));
  const proj = path.join(root, "app");
  const home = path.join(root, "home");
  fs.mkdirSync(path.join(proj, ".claude"), { recursive: true });
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  const allowFile = { permissions: { allow: ALLOWS } };
  const managed = path.join(root, "managed-settings.json");
  if (scope === "project") fs.writeFileSync(path.join(proj, ".claude", "settings.json"), JSON.stringify(allowFile));
  if (scope === "local") fs.writeFileSync(path.join(proj, ".claude", "settings.local.json"), JSON.stringify(allowFile));
  if (scope === "managed") fs.writeFileSync(managed, JSON.stringify(allowFile));
  await runAdherence({
    projectDir: proj,
    fix: true,
    prompt: async () => true,
    out: () => {},
    home,
    claudeDir: path.join(home, ".claude"),
    managedPaths: scope === "managed" ? [managed] : [],
    run,
    loadCompare: async () => null,
  });
  const userPath = path.join(home, ".claude", "settings.json");
  const written = fs.existsSync(userPath) ? JSON.parse(fs.readFileSync(userPath, "utf8")) : {};
  fs.rmSync(root, { recursive: true, force: true });
  return [...(written.permissions?.ask ?? []), ...(written.permissions?.deny ?? [])];
}

for (const scope of ["project", "local", "managed"]) {
  test(`--fix writes no ask or deny that shadows an allow held at the ${scope} scope`, async () => {
    const written = await fixWithAllowAt(scope);
    const shadowing = written.filter((w) => TARGETS.includes(w) && ALLOWS.some((a) => rulesOverlap(a, w)));
    assert.deepEqual(
      shadowing,
      [],
      `--fix wrote ${shadowing.join(", ")} to the user scope over the ${scope}-scope allow — ` +
        "an ask/deny at any scope beats an allow at any other, so the deliberate allow now prompts or is refused",
    );
  });
}
