// A report-card row that names `doctor --adherence --fix` as its remedy must be a row --fix acts
// on. The report and --fix are two readers of one declaration — which rules the settings already
// hold — and they must read it at the same scopes. If they do not, the row FAILs, tells the person
// to run --fix, and --fix prints "nothing to add": a remedy that does not exist, named by the tool.
//
// Found by batch 2 review round 2: after round 1, planUserFix counts a credential `deny` held at
// ANY scope (src/lib/adherence.mjs planUserFix, `deny = parsed.flatMap(...)`), while
// credentialRow still reads the user file alone ("user-scope permissions.deny lacks …").
//
// Invariant: for every scope a rule can sit at, after --fix with every prompt answered yes, no row
// whose remedy is --fix still FAILs unless --fix's own output said why it could not act.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CREDENTIAL_DENY, RELEASE_ACTS, gatherAdherence, runAdherence } from "../src/lib/adherence.mjs";

const run = () => ({ status: 1, stdout: "", stderr: "" });
const FIX = /doctor --adherence --fix/;

// What a person or an org may already hold, at one scope: the credential denies, the release asks.
const HELD = {
  deny: { permissions: { deny: [...CREDENTIAL_DENY] } },
  ask: { permissions: { ask: RELEASE_ACTS.map((a) => a.rule) } },
};

async function afterFix(scope, held) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-adh-remedy-"));
  const proj = path.join(root, "app");
  const home = path.join(root, "home");
  fs.mkdirSync(path.join(proj, ".claude"), { recursive: true });
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  const managed = path.join(root, "managed-settings.json");
  const at = {
    project: path.join(proj, ".claude", "settings.json"),
    local: path.join(proj, ".claude", "settings.local.json"),
    managed,
  };
  if (at[scope]) fs.writeFileSync(at[scope], JSON.stringify(held));
  const opts = { projectDir: proj, home, claudeDir: path.join(home, ".claude"), managedPaths: scope === "managed" ? [managed] : [], run, loadCompare: async () => null };
  let said = "";
  try {
    await runAdherence({ ...opts, fix: true, prompt: async () => true, out: (t) => (said += t) });
    const { rows } = await gatherAdherence(opts);
    return { rows, said };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

for (const scope of ["none", "project", "local", "managed"]) {
  for (const kind of Object.keys(HELD)) {
    test(`a row naming --fix is a row --fix acts on — ${kind} rules held at the ${scope} scope`, async () => {
      const { rows, said } = await afterFix(scope, HELD[kind]);
      const fixSection = said.slice(said.indexOf("--fix:"));
      const explained = /not adding|could not read|cannot be read|wrote nothing/.test(fixSection);
      const stillFailing = rows.filter((r) => String(r.status).includes("FAIL") && FIX.test(r.fix ?? ""));
      assert.deepEqual(
        explained ? [] : stillFailing.map((r) => `${r.label}: ${r.detail}`),
        [],
        `after --fix answered yes to everything, these rows still FAIL and still name --fix as the remedy, ` +
          `while --fix said:\n${fixSection.trim()}`,
      );
    });
  }
}
