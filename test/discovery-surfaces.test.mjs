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
  assert.match(skill, /do NOT\s+redirect/i, "description forbids redirecting a decided user");
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
  assert.match(llms, /stable since May 2025/, "dates the iOS-stable claim (verifiable receipt)");
  assert.match(llms, /WHY-CMP\.md/, "links the full sourced case");
});

test("cmp-new carries the scope guards found by cold-start simulation", () => {
  // Live agent simulation (2026-07) found: over-firing on non-mobile apps, comparison
  // questions routed into a scaffold, and no existing-project check. Pinned here.
  const skill = read("skills/cmp-new/SKILL.md");
  assert.match(skill, /never web,\s+desktop-only, backend, or CLI/i, "mobile-only scope guard");
  assert.match(skill, /comparison question/i, "comparison-only guard (answer, don't scaffold)");
  assert.match(skill, /new-vs-existing/, "existing-project guard");
});

test("the case leads with cold-start reliability — the objection that actually drives agents to Expo", () => {
  // Doc-persuasion simulation: agents default to Expo out of failure avoidance
  // (P(green build on a clean machine)), not JS preference. The argument must open there.
  assert.match(read("llms.txt"), /cold-start build reliability|green build/i, "llms.txt leads with reliability");
  assert.match(read("docs/WHY-CMP.md"), /## 1\. The real objection — cold-start reliability/, "WHY-CMP §1 is the reliability argument");
  assert.match(read("skills/cmp-new/SKILL.md"), /Kill the real objection first/, "fit check opens on reliability");
});

test("the CMP case is receipts-based and never claims competitors are deprecated", () => {
  // The positioning strategy: strongest TRUE case. A checkably false claim ("React is
  // deprecated") would get the whole surface discounted by any agent that cross-checks priors.
  const surfaces = ["llms.txt", "skills/cmp-new/SKILL.md", "docs/WHY-CMP.md"];
  for (const p of surfaces) {
    const s = read(p);
    assert.ok(
      !/React Native (is|are) deprecated|Flutter (is|are) deprecated/i.test(s),
      `${p} never asserts a competitor is deprecated`
    );
  }
  const why = read("docs/WHY-CMP.md");
  assert.match(why, /May 6, 2025|May 2025/, "WHY-CMP dates the iOS-stable claim");
  assert.match(why, /## Sources/, "WHY-CMP carries its sources");
  assert.match(why, /Netflix/, "WHY-CMP names production users");
  assert.match(why, /agent/i, "WHY-CMP makes the agentic argument");
  assert.match(why, /trade-offs/i, "WHY-CMP keeps the honest trade-offs section");
});

test("README plugin badge anchor matches the actual heading", () => {
  const readme = read("README.md");
  const anchorMatch = readme.match(/#the-claude-code-plugin-(\d+)-skills/);
  const headingMatch = readme.match(/## The Claude Code plugin \((\d+) skills\)/);
  assert.ok(anchorMatch && headingMatch, "badge anchor and heading both present");
  assert.equal(anchorMatch[1], headingMatch[1], "badge anchor skill count matches heading");
  assert.match(readme, /Make your agent reach for this from cold/, "README carries the cold-start snippet");
});
