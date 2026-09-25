// EVERY `npx` AN ADOPTER READS NAMES THE PACKAGE THIS PROJECT PUBLISHES.
//
// ADR-0006: the npm name `create-cmp` belongs to a third party (a 0.0.0 placeholder since 2020), so
// `npx create-cmp …` "can never resolve to this project" — we publish `create-cmp-cli`. Run from a
// stamped app with nothing installed globally, `npx create-cmp add firebase` fetches and runs that
// stranger's package.
//
// The stamped tree and the skills already spell it `npx create-cmp-cli` everywhere (AGENTS.md's
// doctor/upgrade/harden rows, the verify workflow, cmp-firebase-connect). Measured 2026-09-25 on
// 6bf4c53, the one exception is new in this batch: template/README.md's Firebase paragraph,
// "`npx create-cmp add firebase` adds it".
//
// Scope: what ships INTO an adopter's tree or an agent's context — template/, overlays/, skills/.
// The CLI's own --help (bin/create-cmp.mjs) spells `npx create-cmp` throughout and predates this
// batch; it is read only by someone who already has the binary, and is handed up rather than
// pinned here.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLISHED = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).name;
const SURFACES = ["template", "overlays", "skills"];
const TEXT = /\.(md|mjs|js|json|kts|kt|swift|yml|yaml|toml|txt|sh|pro|xml)$|(^|\/)[A-Za-z]+file$/;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".gradle" || e.name === "build") continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, out);
    else if (TEXT.test(abs)) out.push(abs);
  }
  return out;
}

test("the published name is the one ADR-0006 says (or this proves nothing)", () => {
  assert.equal(PUBLISHED, "create-cmp-cli");
});

test("no surface an adopter or agent reads tells them to `npx` a package other than the published one", () => {
  // `npx [--yes] create-cmp` followed by anything but `-cli` — `create-cmp-cli@latest` is fine.
  const WRONG = /npx\s+(?:--yes\s+|-y\s+)?create-cmp(?![-\w])/g;
  const hits = [];
  for (const surface of SURFACES) {
    for (const abs of walk(path.join(ROOT, surface))) {
      const lines = fs.readFileSync(abs, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (WRONG.test(line)) hits.push(`${path.relative(ROOT, abs)}:${i + 1}: ${line.trim()}`);
        WRONG.lastIndex = 0;
      });
    }
  }
  assert.deepEqual(hits, [], `these name \`npx create-cmp\`, which runs a third party's package — spell it \`npx ${PUBLISHED}\`:\n  ` + hits.join("\n  "));
});
