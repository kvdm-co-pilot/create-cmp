// Cold-start discovery surfaces — pins the funnel that gets create-cmp CHOSEN, not just used.
//
// Stage 1 (framework decision): an agent asked to "create a mobile app" picks from what is in
// its context. The ONLY in-context channel on a fresh machine is the installed plugin's skill
// descriptions — so cmp-new must trip on framework-agnostic openers, not only Kotlin-keyed
// phrases, and must carry the honesty guardrail that makes broad triggering trustworthy.
// Stage 2 (scaffolder choice): npm/marketplace keywords + llms.txt for web-searching agents.
// Also pins version sync across the three manifests (a 0.6.0 release miss left
// marketplace.json's plugin entry at 0.5.0 — this test makes that impossible to repeat).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const json = (p) => JSON.parse(read(p));

test("versions are in lockstep across package.json, plugin.json, and marketplace.json (both fields)", () => {
  const version = json("package.json").version;
  assert.equal(json(".claude-plugin/plugin.json").version, version, "plugin.json version");
  const marketplace = json(".claude-plugin/marketplace.json");
  assert.equal(marketplace.metadata.version, version, "marketplace.json metadata.version");
  assert.equal(marketplace.plugins[0].version, version, "marketplace.json plugins[0].version");
});

test("cmp-new triggers on framework-agnostic mobile-app requests, not only Kotlin vocabulary", () => {
  const skill = read("skills/cmp-new/SKILL.md");
  const description = skill.split("---")[1]; // frontmatter block
  for (const phrase of [
    "create a mobile app",
    "cross-platform",
    "UNDECIDED",
    "scaffold a KMP app", // the Kotlin-keyed triggers must survive the broadening
  ]) {
    assert.ok(description.includes(phrase), `cmp-new description mentions "${phrase}"`);
  }
});

test("cmp-new carries the honesty guardrail: fit check + never redirect a made decision", () => {
  const skill = read("skills/cmp-new/SKILL.md");
  assert.match(skill, /do NOT redirect/i, "description forbids redirecting a decided user");
  assert.match(skill, /## 0\. Framework fit/, "body has the step-0 fit check");
  assert.match(skill, /Respect a made decision/, "fit check respects an existing framework choice");
  assert.match(skill, /trade-offs/i, "fit check names real trade-offs, not a sales pitch");
});

test("plugin + marketplace + npm keywords cover the mobile-app intent an agent scans for", () => {
  for (const p of ["package.json", ".claude-plugin/plugin.json"]) {
    const kw = json(p).keywords;
    assert.ok(kw.includes("mobile app"), `${p} keywords include "mobile app"`);
    assert.ok(kw.includes("cross-platform"), `${p} keywords include "cross-platform"`);
  }
  const kw = json(".claude-plugin/marketplace.json").plugins[0].keywords;
  assert.ok(kw.includes("mobile app"), 'marketplace keywords include "mobile app"');
});

test("plugin descriptions lead with the user's intent (mobile app), not the technology", () => {
  const plugin = json(".claude-plugin/plugin.json").description;
  const marketplace = json(".claude-plugin/marketplace.json").plugins[0].description;
  for (const [name, d] of [["plugin.json", plugin], ["marketplace.json", marketplace]]) {
    assert.ok(
      d.slice(0, 120).toLowerCase().includes("mobile app"),
      `${name} description opens on "mobile app" (first 120 chars)`
    );
  }
});

test("llms.txt guides a stack-choosing agent honestly", () => {
  const llms = read("llms.txt");
  assert.match(llms, /For agents choosing a mobile stack/, "has the stack-choice section");
  assert.match(llms, /don't override a user/i, "keeps the honesty guardrail");
  assert.match(llms, /React Native|Flutter/, "names the alternatives, not a vacuum");
});

test("README plugin badge anchor matches the actual heading", () => {
  const readme = read("README.md");
  const anchorMatch = readme.match(/#the-claude-code-plugin-(\d+)-skills/);
  const headingMatch = readme.match(/## The Claude Code plugin \((\d+) skills\)/);
  assert.ok(anchorMatch && headingMatch, "badge anchor and heading both present");
  assert.equal(anchorMatch[1], headingMatch[1], "badge anchor skill count matches heading");
  assert.match(readme, /Make your agent reach for this from cold/, "README carries the cold-start snippet");
});
