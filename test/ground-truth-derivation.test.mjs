// The deriver's own drift gate.
//
// scripts/ground-truth.mjs exists because prose cannot be trusted to count.
// It then carried, for months, a hand-written list of which packages were
// unpublished — inside the one file whose entire premise is that a claim about
// a tree must be derived from it. The list was correct until 0.25.0 published
// both names, and the very next run of the deriver reported two live packages
// as unpublished. A hand-written claim in the deriver is the drift the deriver
// exists to remove, one layer in.
//
// So this file gates two things the fix depends on:
//
//   1. Ownership is DERIVED — add a package under packages/ and it appears
//      without anyone editing a list.
//   2. The default path never reaches the network, and never asserts registry
//      state. `groundTruth()` is consumed by the suite (doc-counts.test.mjs),
//      which must pass air-gapped; and a registry claim is not a tree fact.
//
// The registry answer itself is tested against an injected fetch, never the
// real network — a test that needs the registry to be up is a test that fails
// for reasons that are not defects.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { formatSpine, groundTruth, registryStatus, versionSpine } from "../scripts/ground-truth.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("ownership is derived from every manifest in the tree, not from a directory convention", () => {
  // THIS USED TO ASK ONLY ABOUT `packages/`, and so did the deriver — which is
  // how `@create-cmp/inspector` stayed published, live, and in no list for
  // weeks: it sits at `inspector/mcp`, the deriver read `packages/`, and this
  // test agreed with it. Two mirrors of one convention are not a check.
  //
  // So the expected set comes from git, a DIFFERENT mechanism than the
  // deriver's filesystem walk. If the two ever disagree, one of them is wrong
  // about what this repo publishes, which is the only fact either is for.
  const gt = groundTruth();
  const tracked = execFileSync("git", ["ls-files", "*package.json"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .filter((rel) => !rel.includes("node_modules/"))
    .map((rel) => ({ rel, p: JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")) }))
    .filter(({ p }) => !p.private);

  assert.deepEqual(
    [...gt.npm.independent, ...gt.npm.aliases, gt.npm.primary].map((p) => p.name).sort(),
    tracked.map(({ p }) => p.name).sort(),
    "what the deriver owns must equal what this repo tracks and publishes — if this fails, either a " +
      "hand-written list came back or a publishable package is invisible to `--registry`",
  );
  assert.ok(tracked.length > 1, "the fixture is vacuous if the tree tracks no publishable package");
});

test("no package name is hard-coded in the deriver's source", () => {
  const src = fs.readFileSync(path.join(ROOT, "scripts/ground-truth.mjs"), "utf8");
  const gt = groundTruth();
  // The primary is legitimately read from the root manifest by path, not by name.
  for (const p of [...gt.npm.independent, ...gt.npm.aliases]) {
    assert.ok(
      !src.includes(`"${p.name}"`),
      `${p.name} is written literally into scripts/ground-truth.mjs — derive it from the manifest instead`,
    );
  }
});

test("the deriver states no registry claim, and the word that was the bug is gone", () => {
  const gt = groundTruth();
  assert.ok(!("unpublished" in gt.npm), "gt.npm.unpublished was a hand-written registry claim; it must not return");

  const generated = path.join(ROOT, "docs/research/launch/GROUND-TRUTH.md");
  if (fs.existsSync(generated)) {
    const md = fs.readFileSync(generated, "utf8");
    assert.ok(
      !/unpublished|Not yet published/i.test(md),
      "the generated facts file asserts publication status it cannot derive — regenerate with --markdown",
    );
    assert.ok(!md.includes("\\`"), "backtick escaping leaked into the generated markdown");
  }
});

test("groundTruth() does not reach the network", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("groundTruth() fetched — it is consumed by the suite and must work air-gapped");
  };
  try {
    assert.ok(groundTruth().npm.independent.length > 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("registryStatus reports each name against what the registry serves", async () => {
  const gt = groundTruth();
  const first = gt.npm.independent[0].name;
  const held = gt.npm.independent[0].version;

  const fake = async (url) => {
    if (url.endsWith(`/${first}`)) return { ok: true, status: 200, json: async () => ({ "dist-tags": { latest: held } }) };
    if (url.includes("create-cmp-cli")) return { ok: true, status: 200, json: async () => ({ "dist-tags": { latest: "0.0.0" } }) };
    return { ok: false, status: 404 };
  };

  const status = await registryStatus(gt, fake);
  const by = (n) => status.find((p) => p.name === n);

  assert.equal(by(first).state, "published", "a name the registry serves at this tree's version is published");
  assert.equal(by("create-cmp-cli").state, "differs", "a registry version that is not this tree's is a difference, not a pass");
  assert.equal(by("create-cmp-cli").latest, "0.0.0", "the difference must carry what the registry actually serves");
  assert.ok(
    status.some((p) => p.state === "absent"),
    "a 404 is absent — a name the registry does not have at all",
  );
});

test("a registry that cannot be reached is reported as unknown, never as absent", async () => {
  const gt = groundTruth();
  const status = await registryStatus(gt, async () => {
    throw new Error("ENOTFOUND registry.npmjs.org");
  });
  assert.ok(status.length > 0);
  for (const p of status) {
    assert.equal(p.state, "unknown", "an offline machine must not be told its packages are missing");
    assert.match(p.why, /ENOTFOUND/, "the reason the answer is unknown must survive into the report");
  }
});

// ── Which surfaces a version bump must move (KD-134) ────────────────────────
//
// `CLAUDE.md` sends every agent here for "counts and versions, never by hand",
// and the answer was cli / plugin / marketplace. A bump must move FOUR files:
// those three and `package-lock.json`, which records the root manifest's own
// version twice. Measured on the packaging slice — the author moved exactly
// what the deriver listed, and the suite still red with
// `actual: '0.26.4', expected: '0.26.5'`. Nobody is served a wrong TREE by
// that (test/workspace-lock-sync.test.mjs refuses the stale lock by name), but
// the one program written so nobody hand-counts this answered with three of
// four, which is the drift it exists to abolish, in the deriver.

/** The fields a release bump moves, spelled where a release manager would look. */
function surfacesABumpMustMove() {
  const marketplace = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude-plugin/marketplace.json"), "utf8"));
  return [
    'package.json version',
    'package-lock.json version',
    'package-lock.json packages[""].version',
    '.claude-plugin/plugin.json version',
    '.claude-plugin/marketplace.json metadata.version',
    // Every entry, not `plugins[0]`: a marketplace may list more than one and
    // a second one left behind is exactly the lag this spine is for.
    ...marketplace.plugins.map((_, i) => `.claude-plugin/marketplace.json plugins[${i}].version`),
  ].sort();
}

test("the deriver names every surface a version bump must move, including the lock", () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, "scripts/ground-truth.mjs"), "--json"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const spine = JSON.parse(out).spine ?? { surfaces: [] };
  const named = spine.surfaces.map((s) => `${s.file} ${s.field}`).sort();
  const missing = surfacesABumpMustMove().filter((s) => !named.includes(s));
  assert.deepEqual(
    missing,
    [],
    `a reader who moves exactly what this program names is still wrong: it never mentions\n    ` +
      `${missing.join("\n    ")}\n  and finds out from a red suite.`,
  );
  assert.equal(
    spine.version,
    JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version,
    "the spine must lead with the version the root manifest holds — that is the number the others follow",
  );
});

test("the table a human is told to run prints the spine, and says whether it is in step", () => {
  // READ FROM THE SOURCE, not from a run of it. `node scripts/ground-truth.mjs`
  // with no flag walks every manifest's git history for the published-bytes
  // section — 13s on this tree — and spawning it here to grep four lines would
  // put that on every suite run. What the printed lines SAY is pinned by the
  // fixtures below, against the same function main calls; this pins that main
  // still calls it. Measured by hand 2026-09-22 on this commit:
  //
  //   version spine (every field a release bump moves)
  //       package.json  version                                0.26.6
  //       package-lock.json  version                           0.26.6
  //       package-lock.json  packages[""].version              0.26.6
  //       .claude-plugin/plugin.json  version                  0.26.6
  //       .claude-plugin/marketplace.json  metadata.version    0.26.6
  //       .claude-plugin/marketplace.json  plugins[0].version  0.26.6
  //     in step: all 6 fields read 0.26.6
  const src = fs.readFileSync(path.join(ROOT, "scripts/ground-truth.mjs"), "utf8");
  assert.match(
    src,
    /formatSpine\(gt\.spine\)/,
    "the human table no longer prints the version spine — `node scripts/ground-truth.mjs` is what CLAUDE.md " +
      "tells an agent to ask about versions, and the answer would again name fewer surfaces than a bump moves",
  );
});

/** A four-file tree holding exactly the fields a bump moves. */
function spineFixture({ pkg, lock, lockRoot, plugin, metadata, plugins }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "version-spine-"));
  fs.mkdirSync(path.join(dir, ".claude-plugin"));
  const write = (rel, value) => fs.writeFileSync(path.join(dir, rel), JSON.stringify(value, null, 2));
  write("package.json", { name: "create-cmp-cli", version: pkg });
  write("package-lock.json", { name: "create-cmp-cli", version: lock, packages: { "": { version: lockRoot }, "node_modules/x": { version: "9.9.9" } } });
  write(".claude-plugin/plugin.json", { name: "create-cmp", version: plugin });
  write(".claude-plugin/marketplace.json", { metadata: { version: metadata }, plugins: plugins.map((v, i) => ({ name: `p${i}`, version: v })) });
  return dir;
}

const IN_STEP = { pkg: "0.26.5", lock: "0.26.5", lockRoot: "0.26.5", plugin: "0.26.5", metadata: "0.26.5", plugins: ["0.26.5"] };

test("a tree where every surface moved together is in step, and the fixture is not vacuous", () => {
  const dir = spineFixture(IN_STEP);
  try {
    const spine = versionSpine(dir);
    assert.deepEqual(spine.lagging, [], "nothing lags when every field holds the same version");
    assert.equal(spine.inStep, true);
    assert.equal(spine.surfaces.length, 6, "six fields across four files — the control for the lagging cases below");
    assert.match(formatSpine(spine).at(-1), /in step: all 6 fields read 0\.26\.5/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a bump that moved the other three and left the LOCK behind is not in step", () => {
  // KD-134's measurement, as a tree: package.json, plugin.json and
  // marketplace.json at the new number, package-lock.json at the old one.
  const dir = spineFixture({ ...IN_STEP, lock: "0.26.4", lockRoot: "0.26.4" });
  try {
    const spine = versionSpine(dir);
    assert.equal(spine.inStep, false, "the lock trails by a version and the deriver calls the spine in step");
    assert.deepEqual(
      spine.lagging.map((s) => `${s.file} ${s.field}`),
      ["package-lock.json version", 'package-lock.json packages[""].version'],
      "the two fields that trail must be named where a reader is looking",
    );
    const printed = formatSpine(spine).join("\n");
    assert.match(printed, /NOT IN STEP: 2 field\(s\)/);
    assert.match(printed, /✗ package-lock\.json {2}version/);
    assert.match(printed, /✗ package-lock\.json {2}packages\[""\]\.version/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the lock's two version fields are judged separately — one moving does not excuse the other", () => {
  const dir = spineFixture({ ...IN_STEP, lockRoot: "0.26.4" });
  try {
    const spine = versionSpine(dir);
    assert.deepEqual(spine.lagging.map((s) => s.field), ['packages[""].version']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a second marketplace plugin entry left behind is named, not averaged away", () => {
  const dir = spineFixture({ ...IN_STEP, plugins: ["0.26.5", "0.26.4"] });
  try {
    const spine = versionSpine(dir);
    assert.deepEqual(spine.lagging.map((s) => s.field), ["plugins[1].version"]);
    assert.equal(spine.surfaces.length, 7, "every plugins[] entry is a surface, not just the first");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a field that is absent altogether lags — it does not silently pass", () => {
  const dir = spineFixture(IN_STEP);
  try {
    const lock = JSON.parse(fs.readFileSync(path.join(dir, "package-lock.json"), "utf8"));
    delete lock.packages[""].version;
    fs.writeFileSync(path.join(dir, "package-lock.json"), JSON.stringify(lock, null, 2));
    const spine = versionSpine(dir);
    assert.equal(spine.inStep, false, "a missing field is the worst form of trailing, never a pass");
    assert.deepEqual(spine.lagging.map((s) => s.field), ['packages[""].version']);
    assert.match(formatSpine(spine).join("\n"), /no such field/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
