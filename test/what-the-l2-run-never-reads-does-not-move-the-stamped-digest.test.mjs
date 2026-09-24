// A PASS L2 RUN OVER AN IDENTICAL EXECUTING APP READ AS "ANOTHER APP".
//
// Measured 2026-09-24: the fleet record at e21fc3d is PASS at L2, and the next
// tree, ddf86b3, stamped an app that differed from it in exactly four files —
// `AGENTS.md` (one sentence), `create-cmp.json`, `qa/harness-source.json` and
// `qa/harness.lock.json` (a release bump). No program in the L2 run opens the
// first, and the other three differ only in release numbers the stamp writes.
// Under rule 1 the digest moved and the tier asked for a fresh L2 run.
//
// Rule 2 (scripts/stamped-output.mjs) hashes what the L2 run executes or reads.
// Each case below asserts BOTH directions where it can: rule 2 holds still for
// what the run never reads, rule 1 did not (so the case is not vacuous), and
// rule 2 still moves for every byte the run does read. A digest that stopped
// moving for a `.kt` byte would be a tier that proves nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

import { stampScratchApp, hashStampedTree, stampedOutput, STAMPED_OUTPUT_RULE } from "../scripts/stamped-output.mjs";
import { deviceTierNeed } from "../scripts/observed-tree.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = (b) => createHash("sha256").update(b).digest("hex");

/**
 * A small app whose rule-1 digest was computed by the module BEFORE rule 2
 * existed (scripts/stamped-output.mjs at ddf86b3, 2026-09-24):
 * 6444e30c094a49b9bfcf4c27d4a1a44edb13331a89e4be8e83614455861f51c9. It carries
 * every shape rule 1 treats specially — a stampedAt, an ADR Date line, an
 * executable, a symlink, an absent local.properties — so a rule 1 that drifted
 * in any of them would miss the constant.
 */
function fixtureApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stamped-rule-1-"));
  const put = (rel, body, mode) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
    if (mode) fs.chmodSync(path.join(dir, rel), mode);
  };
  put("create-cmp.json", `${JSON.stringify({ name: "Fixture", engineVersion: "0.26.0", stampedAt: "2026-09-01T12:00:00.000Z" }, null, 2)}\n`);
  put("docs/adr/0001-record-architecture-decisions.md", "# 1. Record decisions\n\n- **Date:** 2026-09-01\n- **Status:** Accepted\n");
  put("gradlew", "#!/bin/sh\nexec java \"$@\"\n", 0o755);
  put("AGENTS.md", "# Agents\n\nRead specs/ first.\n");
  put(".claude/skills/add-screen/SKILL.md", "# add-screen\n");
  put("qa/harness-manifest.json", `${JSON.stringify({ schema: "harness-manifest/2", profile: { id: "cmp" } }, null, 2)}\n`);
  put("qa/harness-source.json", `${JSON.stringify({ schema: "prooflane-harness-source/1", name: "prooflane-harness", version: "0.23.0", source: "local" }, null, 2)}\n`);
  put("composeApp/src/commonMain/kotlin/App.kt", "fun app() = Unit\n");
  fs.symlinkSync("gradlew", path.join(dir, "gradlew-link"));
  return dir;
}

test("rule 1 reproduces the digest the pre-rule-2 module computed, byte for byte", () => {
  const dir = fixtureApp();
  try {
    assert.equal(
      hashStampedTree(dir, { rule: 1 }).hash,
      "6444e30c094a49b9bfcf4c27d4a1a44edb13331a89e4be8e83614455861f51c9",
      "rule 1 no longer computes what every record before 2026-09-24 carries, so `proof-plan --rekey` can no longer prove it is re-deriving the record's own app",
    );
    assert.notEqual(hashStampedTree(dir).hash, hashStampedTree(dir, { rule: 1 }).hash, "the default is rule 2, and on this fixture rule 2 is a different digest");
    assert.equal(hashStampedTree(dir).rule, STAMPED_OUTPUT_RULE);
    assert.throws(() => hashStampedTree(dir, { rule: 3 }), /no stamped-output rule 3/, "a rule this module cannot compute is refused, never approximated");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ONE real stamp of this tree, copied per case: every case is then about the
// bytes it changes and nothing else.
const stamp = stampScratchApp(ROOT, { timeoutMs: 60_000 });
test.after(() => stamp.dispose());

function variant(mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stamped-variant-"));
  const app = path.join(dir, "FleetCheck");
  fs.cpSync(stamp.appDir, app, { recursive: true, verbatimSymlinks: true });
  try {
    mutate(app);
    return { rule2: hashStampedTree(app).hash, rule1: hashStampedTree(app, { rule: 1 }).hash, files: hashStampedTree(app).files };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const BASE = variant(() => {});
const edit = (rel, fn) => (app) => {
  const p = path.join(app, rel);
  fs.writeFileSync(p, fn(fs.readFileSync(p)));
};
const append = (rel, text) => edit(rel, (b) => Buffer.concat([b, Buffer.from(text)]));
const firstUnder = (dir, pred) => {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(path.join(stamp.appDir, d), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const rel = `${d}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (e.isFile() && pred(rel)) out.push(rel);
    }
  };
  walk(dir);
  assert.ok(out.length, `the stamp has no file under ${dir} matching the case — this file is aimed at nothing`);
  return out[0];
};

test("prose in a file the cmp L2 run never opens does not move the digest — and did under rule 1", () => {
  for (const rel of ["AGENTS.md", "CLAUDE.md", ".claude/skills/add-screen/SKILL.md"]) {
    assert.ok(fs.existsSync(path.join(stamp.appDir, rel)), `premise: the stamp writes ${rel}`);
    const v = variant(append(rel, "\nOne more sentence an agent reads and no program in the L2 run opens.\n"));
    assert.notEqual(v.rule1, BASE.rule1, `premise: rule 1 saw the edit to ${rel}`);
    assert.equal(v.rule2, BASE.rule2, `rule 2 moved for prose in ${rel}, which the cmp profile's L2 run never reads (scripts/stamped-output.mjs UNOBSERVED_BY_PROFILE)`);
  }
});

test("a stamp-written release bump does not move the digest — create-cmp.json, harness-source and a TRUE lock together", () => {
  const bump = (app) => {
    const json = (rel) => JSON.parse(fs.readFileSync(path.join(app, rel), "utf8"));
    const write = (rel, v) => fs.writeFileSync(path.join(app, rel), `${JSON.stringify(v, null, 2)}\n`);
    const cc = json("create-cmp.json");
    cc.engineVersion = "9.9.9";
    write("create-cmp.json", cc);
    const src = json("qa/harness-source.json");
    src.version = "8.8.8";
    write("qa/harness-source.json", src);
    // The lock the stamp would write for that source: the per-file hash of the
    // bumped file, and the top-level hash recomputed the way
    // packages/harness/src/lib/harness-region.mjs does it.
    const lock = json("qa/harness.lock.json");
    lock.version = "8.8.8";
    lock.files["qa/harness-source.json"] = sha(fs.readFileSync(path.join(app, "qa/harness-source.json")));
    const d = createHash("sha256");
    for (const rel of Object.keys(lock.files).sort()) d.update(rel, "utf8").update("\0").update(lock.files[rel], "utf8").update("\n");
    lock.sha256 = d.digest("hex");
    write("qa/harness.lock.json", lock);
  };
  const v = variant(bump);
  assert.notEqual(v.rule1, BASE.rule1, "premise: rule 1 saw the bump");
  assert.equal(v.rule2, BASE.rule2, "rule 2 moved for release numbers the stamp writes and no verdict reads");
});

test("every byte the L2 run reads still moves the digest: a .kt byte, a resource byte, a spec, the README the badge rewrites", () => {
  const kt = firstUnder("composeApp/src/commonMain", (r) => r.endsWith(".kt"));
  const res = firstUnder("composeApp/src", (r) => r.includes("/composeResources/") || r.includes("/res/"));
  const cases = {
    [kt]: append(kt, "\n// one byte\n"),
    [res]: edit(res, (b) => Buffer.concat([b, Buffer.from([0])])),
    "specs/home.spec.md": append("specs/home.spec.md", "\n- a clause the lane's spec-coverage step reads\n"),
    "README.md": append("README.md", "\nqa/verify.mjs rewrites this file's badge on every run.\n"),
  };
  for (const [rel, mutate] of Object.entries(cases)) {
    assert.notEqual(variant(mutate).rule2, BASE.rule2, `rule 2 did not move for ${rel} — a digest that cannot see what the L2 run reads proves nothing about it`);
  }
});

test("a lock that LIES is not normalised: a false per-file hash, or a false top-level hash, moves the digest", () => {
  const lie = (fn) => (app) => {
    const p = path.join(app, "qa/harness.lock.json");
    const lock = JSON.parse(fs.readFileSync(p, "utf8"));
    fn(lock);
    fs.writeFileSync(p, `${JSON.stringify(lock, null, 2)}\n`);
  };
  const recompute = (lock) => {
    const d = createHash("sha256");
    for (const rel of Object.keys(lock.files).sort()) d.update(rel, "utf8").update("\0").update(lock.files[rel], "utf8").update("\n");
    lock.sha256 = d.digest("hex");
  };
  // A per-file hash that is false, with a top-level hash that agrees with the lie.
  const perFile = variant(lie((lock) => {
    const first = Object.keys(lock.files).sort()[0];
    lock.files[first] = "0".repeat(64);
    recompute(lock);
  }));
  assert.notEqual(perFile.rule2, BASE.rule2, "a lock whose per-file hash is false was normalised to look like the true one — the lane would FAIL on it");
  // Every per-file hash true, and a top-level hash that is not.
  const top = variant(lie((lock) => {
    lock.sha256 = "f".repeat(64);
  }));
  assert.notEqual(top.rule2, BASE.rule2, "a lock whose top-level hash is false was normalised to look like the true one");
});

test("an unobserved file added, removed or made executable still moves the digest — only its CONTENT is held", () => {
  const added = variant((app) => {
    fs.mkdirSync(path.join(app, ".claude/skills/new-skill"), { recursive: true });
    fs.writeFileSync(path.join(app, ".claude/skills/new-skill/SKILL.md"), "# new\n");
  });
  assert.notEqual(added.rule2, BASE.rule2, "a new unobserved file is a new entry in the manifest");
  assert.ok(".claude/skills/new-skill/SKILL.md" in added.files, "and it is listed, not excluded");
  assert.notEqual(variant((app) => fs.rmSync(path.join(app, "CLAUDE.md"))).rule2, BASE.rule2, "a removed unobserved file is a missing entry");
  assert.notEqual(variant((app) => fs.chmodSync(path.join(app, "AGENTS.md"), 0o755)).rule2, BASE.rule2, "the mode bit rides on the value, unobserved or not");
});

test("the unobserved list is the STAMP'S OWN profile's: another profile, or no manifest, hashes every byte", () => {
  const prose = append("AGENTS.md", "\nprose\n");
  const setProfile = (id) => (app) => {
    const p = path.join(app, "qa/harness-manifest.json");
    const m = JSON.parse(fs.readFileSync(p, "utf8"));
    m.profile.id = id;
    fs.writeFileSync(p, `${JSON.stringify(m, null, 2)}\n`);
  };
  const other = variant(setProfile("another-stack"));
  const otherWithProse = variant((app) => {
    setProfile("another-stack")(app);
    prose(app);
  });
  assert.notEqual(otherWithProse.rule2, other.rule2, "a profile that declares nothing unobserved hashes AGENTS.md like any other byte");
  const bare = variant((app) => fs.rmSync(path.join(app, "qa/harness-manifest.json")));
  const bareWithProse = variant((app) => {
    fs.rmSync(path.join(app, "qa/harness-manifest.json"));
    prose(app);
  });
  assert.notEqual(bareWithProse.rule2, bare.rule2, "no manifest is the core default: nothing unobserved");
});

test("a version file NOT in the stamp's own JSON form keeps its raw bytes — the clock is still held, the version is not", () => {
  const reindent = (engineVersion, stampedAt) => (app) => {
    const p = path.join(app, "create-cmp.json");
    const v = JSON.parse(fs.readFileSync(p, "utf8"));
    fs.writeFileSync(p, `${JSON.stringify({ ...v, engineVersion, stampedAt }, null, 4)}\n`);
  };
  const a = variant(reindent("1.0.0", "2026-01-01T00:00:00.000Z"));
  assert.equal(variant(reindent("1.0.0", "2026-02-02T00:00:00.000Z")).rule2, a.rule2, "stampedAt is still normalised in a form the JSON rule does not recognise");
  assert.notEqual(variant(reindent("2.0.0", "2026-01-01T00:00:00.000Z")).rule2, a.rule2, "but the version is not: an unrecognised form moves the digest");
});

test("the real stamp: rule 2 of this tree is what stampedOutput() reports, and it is the default every reader compares", () => {
  const now = stampedOutput(ROOT, { timeoutMs: 60_000 });
  assert.equal(now.rule, STAMPED_OUTPUT_RULE);
  assert.equal(now.hash, BASE.rule2, "two stamps of one tree hash the same under rule 2");
});

// KD-207, closed: markdown under template/ ships, so it is ASKED about, and
// the digest — not a suffix rule — says whether it moved the app.
test("KD-207: markdown under template/ obliges the question; markdown anywhere else does not", () => {
  assert.equal(deviceTierNeed(["template/specs/home.spec.md"]).required, true, "a shipped spec was declared unable to reach the L2 run");
  assert.equal(deviceTierNeed(["template/AGENTS.md"]).required, true);
  assert.equal(deviceTierNeed(["docs/NORTH-STAR.md", "AGENTS.md", ".claude/agents/x.md"]).required, false, "this repo's own prose still costs nothing");
  const mixed = deviceTierNeed(["docs/x.md", "template/README.md"]);
  assert.deepEqual(mixed.obliging, ["template/README.md"]);
  assert.match(mixed.reason, /ship into the stamped app/, "and the reason says why a markdown file obliged it");
});

/** A copy of what stamps and what schedules — enough for `obligation()` to stamp the COPY, never this tree. */
const COPIED = ["bin", "src", "template", "packages", "scripts", "options.schema.json", "package.json"];
function treeCopy() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "kd-207-")));
  for (const entry of COPIED) fs.cpSync(path.join(ROOT, entry), path.join(dir, entry), { recursive: true, verbatimSymlinks: true });
  return { dir, dispose: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test("KD-207 both ways: a template spec edit is required AND moves the digest → OWED; a template AGENTS.md edit is required AND holds it → DISCHARGED by the matching record", async () => {
  const tree = treeCopy();
  try {
    const { obligation } = await import(pathToFileURL(path.join(tree.dir, "scripts", "proof-plan.mjs")).href);
    const { stampedOutput: stampCopy, STAMPED_OUTPUT_RULE: rule } = await import(pathToFileURL(path.join(tree.dir, "scripts", "stamped-output.mjs")).href);
    const proven = stampCopy(tree.dir, { timeoutMs: 60_000 });
    const fleetRecord = {
      schema: "cmp-fleet-check/1",
      ranAt: "2026-09-24T09:00:00.000Z",
      verdict: "PASS",
      rung: "L2",
      requiredLevel: "L2",
      stampedOutputHash: proven.hash,
      stampedOutputRule: rule,
      stampedOutputFiles: proven.files,
      commit: null,
      treeWasDirty: false,
    };
    const BRANCH = "slice/kd-207";
    const plan = { schema: "prooflane-proof-plan/1", slice: "kd-207", branch: BRANCH, openedAt: "2026-09-24T08:00:00.000Z", base: null, declared: { device: "at-close", review: "at-close" }, discharged: null, reviewDischarged: null };
    const specRel = "template/specs/home.spec.md";
    const agentsRel = "template/AGENTS.md";
    const original = { spec: fs.readFileSync(path.join(tree.dir, specRel)), agents: fs.readFileSync(path.join(tree.dir, agentsRel)) };

    fs.appendFileSync(path.join(tree.dir, specRel), "\n- a clause the lane's spec-coverage step reads\n");
    const spec = obligation(plan, [specRel], BRANCH, { fleetRecord });
    assert.equal(spec.need.required, true, "a template spec edit obliges the question");
    assert.notEqual(stampCopy(tree.dir, { timeoutMs: 60_000 }).hash, proven.hash, "premise: the spec ships, so the digest moved");
    assert.equal(spec.state, "owed", `the spec edit must be owed an L2 run: ${JSON.stringify({ state: spec.state, reason: spec.need.reason })}`);
    fs.writeFileSync(path.join(tree.dir, specRel), original.spec);

    fs.appendFileSync(path.join(tree.dir, agentsRel), "\nOne more sentence the L2 run never opens.\n");
    const agents = obligation(plan, [agentsRel], BRANCH, { fleetRecord });
    assert.equal(agents.need.required, true, "a template AGENTS.md edit obliges the question too — the digest answers it");
    assert.equal(stampCopy(tree.dir, { timeoutMs: 60_000 }).hash, proven.hash, "premise: AGENTS.md is unobserved by the cmp L2 run, so the digest held");
    assert.equal(agents.state, "discharged", `a matching PASS record discharges it for the price of one stamp: ${agents.state}`);
    assert.equal(agents.proof?.from, "qa-artifacts/fleet-latest.json");
    fs.writeFileSync(path.join(tree.dir, agentsRel), original.agents);
  } finally {
    tree.dispose();
  }
});
