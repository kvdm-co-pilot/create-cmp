// Fast-mode affected-test scoping (template/qa/lib/affected-tests.mjs) — the
// derivation that maps a working-tree change to a Gradle `--tests` filter.
//
// Contracts under test:
//   - the blast-radius escape hatch fires for EVERY broad category (build
//     files, DI, theme, shared components, qa/ itself, anything outside
//     composeApp/src) and disables filtering for the whole run
//   - package→filter mapping: changed .kt → its parent-dir (package last
//     segment) → "*<seg>*", unioned, deduped, sorted
//   - lane outputs (qa/evidence, qa-artifacts) never count as changes — the
//     receipt from run N must not force run N+1 to the full suite forever
//   - fail open, never fail silent: no git → null; empty/unmappable change →
//     mode "all" with an honest reason
//   - changedWorkingTreePaths returns tracked diffs + untracked files against
//     a REAL git repo, and null when git is unusable

import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  LANE_OUTPUT_PREFIXES,
  coreBroadImpactReason,
  changedWorkingTreePaths,
  deriveAffectedFilter,
  deriveTierNeed,
} from "../template/qa/lib/affected-tests.mjs";
// Stage 0 PR 6d: qa/ is the core's blast-radius rule on every stack; WHICH
// other paths fan out, and how a source maps to a test filter, are the
// profile's. The pack hands the core its own mapping — nothing resolves a
// manifest, because the pack already is the profile.
import { affected as cmpAffected, broadImpact as cmpBroadImpact } from "../template/qa/lib/profiles/cmp/affected.mjs";

/** The whole rule as the cmp lane applies it: core first, then the profile's. */
const broadImpactReason = (p) => coreBroadImpactReason(p) ?? cmpBroadImpact(p);

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "affected-engine-"));

const SRC = "composeApp/src/commonMain/kotlin/com/acme/app";

test("blast-radius escape hatch: each broad category disables filtering, named in the reason", () => {
  const cases = [
    ["composeApp/build.gradle.kts", /build files/],
    ["build.gradle.kts", /build files/],
    ["gradle/libs.versions.toml", /build files/],
    ["gradle.properties", /build files/],
    [`${SRC}/di/AppModule.kt`, /DI/],
    [`${SRC}/presentation/theme/Tokens.kt`, /theme/],
    [`${SRC}/presentation/components/AppHeader.kt`, /shared components/],
    ["qa/verify.mjs", /harness itself/],
    ["qa/approvals.json", /harness itself/],
    ["docs/ARCHITECTURE.md", /outside composeApp\/src/],
    ["specs/home.spec.md", /outside composeApp\/src/],
    [".claude/settings.json", /outside composeApp\/src/],
  ];
  for (const [p, reasonRe] of cases) {
    assert.match(broadImpactReason(p) ?? "", reasonRe, `broadImpactReason(${p})`);
    // Even alongside an innocuous scoped edit, one broad path forces the full suite.
    const res = deriveAffectedFilter([`${SRC}/presentation/home/HomeViewModel.kt`, p], cmpAffected);
    assert.equal(res.mode, "all", `deriveAffectedFilter with ${p}`);
    assert.match(res.reason, /broad-impact change/);
    assert.match(res.reason, reasonRe);
  }
});

test("scoped source edits are NOT broad-impact", () => {
  assert.equal(broadImpactReason(`${SRC}/presentation/home/HomeViewModel.kt`), null);
  assert.equal(broadImpactReason(`${SRC}/domain/usecase/GetItemsUseCase.kt`), null);
  assert.equal(broadImpactReason("composeApp/src/commonTest/kotlin/com/acme/app/presentation/home/HomeViewModelTest.kt"), null);
});

test("package→filter mapping: parent-dir segment becomes *seg*, unioned, deduped, sorted", () => {
  const res = deriveAffectedFilter([
    `${SRC}/presentation/home/HomeViewModel.kt`,
    `${SRC}/presentation/home/HomeScreen.kt`, // same segment — deduped
    `${SRC}/presentation/profile/ProfileViewModel.kt`,
    `${SRC}/data/repository/ItemRepositoryImpl.kt`,
  ], cmpAffected);
  assert.equal(res.mode, "filtered");
  assert.deepEqual(res.patterns, ["*home*", "*profile*", "*repository*"]);
  assert.equal(res.sourcePaths.length, 4);
});

test("lane outputs never count as changes: a dirty receipt neither forces the full suite nor drives the filter", () => {
  assert.deepEqual(LANE_OUTPUT_PREFIXES, [
    "qa/evidence",
    "qa-artifacts",
    "qa/flight-recorder.jsonl",
    "qa/.lane-in-progress",
    // Added 2026-09-09 (LIVE-CONSOLE.md Phase B): the running lane's step
    // stream, appended to WHILE the lane runs so the console can render a row
    // as each step lands. Same class as the marker below, and it must be
    // enumerated here for the same reason the marker is — an adopter's
    // .gitignore never learns new entries, so in an upgraded repo this file
    // shows up in the change set as an untracked file under qa/.
    "qa/.lane-steps.ndjson",
  ]);

  // The lane's own in-flight marker (Stage 0 PR 6a moved it under qa/, out of a
  // Compose build directory) is present for exactly the duration of the run
  // that would read it. Uncounted, it matches the qa/** hatch and every
  // in-lane --fast filter falls open — the flight-journal bug, one file over.
  const markerOnly = deriveAffectedFilter(["qa/.lane-in-progress", `${SRC}/presentation/home/HomeViewModel.kt`], cmpAffected);
  assert.equal(markerOnly.mode, "filtered", markerOnly.reason);
  assert.deepEqual(markerOnly.patterns, ["*home*"]);

  // PLANTED: the step stream is written by the very run whose filter this is —
  // `qa/watch.mjs` spawns `--fast --events` on every save. Counted as a change
  // it matches the qa/** hatch, and the inner loop falls open to the full suite
  // from the second save onward: the marker's bug, one file over again.
  const streamOnly = deriveAffectedFilter(["qa/.lane-steps.ndjson", `${SRC}/presentation/home/HomeViewModel.kt`], cmpAffected);
  assert.equal(streamOnly.mode, "filtered", streamOnly.reason);
  assert.deepEqual(streamOnly.patterns, ["*home*"]);

  // PLANTED: the flight journal is appended by every run and committed. Counted
  // as a change it matches the qa/** hatch, and --fast falls open to the full
  // suite forever after the first run. It must be a lane output.
  const journalOnly = deriveAffectedFilter(["qa/flight-recorder.jsonl", `${SRC}/presentation/home/HomeViewModel.kt`], cmpAffected);
  assert.equal(journalOnly.mode, "filtered", "the journal must not widen the filter");
  assert.deepEqual(journalOnly.patterns, ["*home*"]);

  // Receipt + one scoped edit → still filtered (the qa/** hatch must not self-trigger).
  const withEdit = deriveAffectedFilter(["qa/evidence/latest.json", `${SRC}/presentation/home/HomeViewModel.kt`], cmpAffected);
  assert.equal(withEdit.mode, "filtered");
  assert.deepEqual(withEdit.patterns, ["*home*"]);

  // Receipt alone → nothing changed, honestly reported.
  const alone = deriveAffectedFilter(["qa/evidence/latest.json", "qa-artifacts/smoke.png"], cmpAffected);
  assert.equal(alone.mode, "all");
  assert.match(alone.reason, /no working-tree changes/);
});

test("fail open: empty change set and unmappable changes run everything, with the reason named", () => {
  const empty = deriveAffectedFilter([], cmpAffected);
  assert.equal(empty.mode, "all");
  assert.match(empty.reason, /no working-tree changes/);

  // Scoped but non-.kt (a resource) maps to no filter → full suite, never a silent skip.
  const unmappable = deriveAffectedFilter(["composeApp/src/commonMain/composeResources/values/strings.xml"], cmpAffected);
  assert.equal(unmappable.mode, "all");
  assert.match(unmappable.reason, /map to no test filter/);
});

test("changedWorkingTreePaths: null when git is unusable (fail open — the caller runs everything)", () => {
  const failingGit = () => null;
  assert.equal(changedWorkingTreePaths(tmp(), failingGit), null);

  // Real repo with no commits: `git diff HEAD` has no HEAD to diff against →
  // the command fails → null. A fresh scaffold before its first commit fails
  // open into the full suite.
  const root = tmp();
  execSync("git init -q", { cwd: root });
  assert.equal(changedWorkingTreePaths(root), null);
});

test("changedWorkingTreePaths: real repo reports tracked modifications plus untracked files", () => {
  const root = tmp();
  const git = (cmd) => execSync(`git -c user.email=t@t -c user.name=t ${cmd}`, { cwd: root, stdio: ["ignore", "pipe", "ignore"] });
  fs.mkdirSync(path.join(root, "composeApp/src/commonMain/kotlin/com/acme/app/presentation/home"), { recursive: true });
  const tracked = "composeApp/src/commonMain/kotlin/com/acme/app/presentation/home/HomeViewModel.kt";
  fs.writeFileSync(path.join(root, tracked), "class HomeViewModel\n");
  git("init -q");
  git("add -A");
  git("commit -qm seed");

  fs.writeFileSync(path.join(root, tracked), "class HomeViewModel { val edited = true }\n");
  const untracked = "composeApp/src/commonMain/kotlin/com/acme/app/presentation/home/HomeState.kt";
  fs.writeFileSync(path.join(root, untracked), "data class HomeState(val x: Int)\n");

  const changed = changedWorkingTreePaths(root);
  assert.ok(changed, "expected a change list from a real repo");
  assert.ok(changed.includes(tracked), `tracked modification missing: ${changed}`);
  assert.ok(changed.includes(untracked), `untracked file missing: ${changed}`);

  // ...and the derivation over the real change scopes to the feature.
  const res = deriveAffectedFilter(changed, cmpAffected);
  assert.equal(res.mode, "filtered");
  assert.deepEqual(res.patterns, ["*home*"]);
});

// ── The split: the contract is the core's, the rules are the profile's ───────

test("PLANTED: with NO profile mapping the fast lane subsets nothing, and says so — fail open, never fail silent", () => {
  // The failure this prevents: vendored into a repo whose sources are not under
  // composeApp/src, the old hardcoded rules made EVERY path broad-impact, so
  // every fast run fell open to the full suite with the optimisation silently
  // off — visible only in one parenthetical nobody reads.
  const res = deriveAffectedFilter([`${SRC}/presentation/home/HomeViewModel.kt`]);
  assert.equal(res.mode, "all");
  assert.match(res.reason, /this profile declares no affected-test mapping/);
  assert.deepEqual(res.patterns, []);
  for (const half of [{ broadImpact: () => null }, { patternsFor: () => ({ patterns: ["*x*"] }) }]) {
    assert.equal(deriveAffectedFilter([`${SRC}/x/Y.kt`], half).mode, "all", "half a mapping is no mapping");
  }
});

test("a BACKEND-shaped mapping subsets by its own rules — the core supplies only the honesty contract", () => {
  const backend = {
    broadImpact: (p) => (p.endsWith("pom.xml") ? "the reactor rewires every module" : p.startsWith("services/") ? null : "outside services/"),
    patternsFor: (paths) => {
      const modules = [...new Set(paths.filter((p) => p.endsWith(".java")).map((p) => p.split("/")[1]))].sort();
      return { patterns: modules.map((m) => `${m}/**`), sourcePaths: paths };
    },
  };
  const scoped = deriveAffectedFilter(["services/ledger/src/Money.java", "services/api/src/Routes.java"], backend);
  assert.equal(scoped.mode, "filtered", scoped.reason);
  assert.deepEqual(scoped.patterns, ["api/**", "ledger/**"]);

  assert.match(deriveAffectedFilter(["pom.xml"], backend).reason, /reactor rewires every module/);
  assert.match(deriveAffectedFilter(["docs/README.md"], backend).reason, /outside services\//);
  // The core's own rule still applies first, whatever the profile thinks.
  assert.match(deriveAffectedFilter(["qa/verify.mjs"], backend).reason, /qa\/ is the harness itself/);
  // And lane outputs are still never changes.
  assert.equal(deriveAffectedFilter(["qa/evidence/latest.json"], backend).reason, "no working-tree changes to scope by");
});

// ── deriveTierNeed: the declaration is of IRRELEVANCE ────────────────────────
// The first version asked "is any changed path under a root that FEEDS the
// tier?" — an allowlist, so anything nobody listed was silently deferred. The
// falsifying case is concrete and shipped: `cmp` declares
// `sourceRoots: ["composeApp/src"]`, which excludes `build.gradle.kts` and
// `gradle/libs.versions.toml`. A dependency bump changes what runs on the
// device and would have skipped the device tier, confidently.
test("a dependency bump obliges the device tier — the case the allowlist deferred", () => {
  const bump = ["gradle/libs.versions.toml"];

  // What the old shape did, reconstructed: cmp's declared source roots as an
  // allowlist. Nothing matches, so nothing is required. That is the bug.
  const asAllowlist = bump.some((p) => ["composeApp/src"].some((r) => p.startsWith(`${r}/`)));
  assert.equal(asAllowlist, false, "the allowlist could not see a dependency bump — this is what was shipped");

  // Inverted: it is not declared irrelevant, so it obliges.
  const need = deriveTierNeed(bump, { irrelevantRoots: ["docs/", "*.md"], tierName: "the device tier" });
  assert.equal(need.required, true, "a path nobody classified must oblige the tier");
  assert.deepEqual(need.obliging, bump);
  assert.match(need.reason, /not declared irrelevant/);
});

test("only explicitly-declared irrelevance reduces the obligation", () => {
  const decl = { irrelevantRoots: ["docs/", "test/", "*.md"], tierName: "the device tier" };
  assert.equal(deriveTierNeed(["docs/NORTH-STAR.md", "README.md", "test/x.test.mjs"], decl).required, false);
  // One unclassified path among many irrelevant ones is enough to oblige.
  const mixed = deriveTierNeed(["docs/a.md", "composeApp/src/Main.kt"], decl);
  assert.equal(mixed.required, true);
  assert.deepEqual(mixed.obliging, ["composeApp/src/Main.kt"], "and it names WHICH path obliged, so the answer is arguable");
});

test("every uncertain case fails OPEN — being wrong toward running costs minutes", () => {
  const decl = { irrelevantRoots: ["docs/"], tierName: "the device tier" };
  assert.equal(deriveTierNeed(null, decl).required, true, "git could not say");
  assert.equal(deriveTierNeed([], decl).required, true, "nothing to reason about");
  assert.equal(deriveTierNeed(["docs/a.md"], { tierName: "t" }).required, true, "nothing declared irrelevant");
  assert.equal(deriveTierNeed(["docs/a.md"], { irrelevantRoots: [], tierName: "t" }).required, true, "an empty declaration is not a licence");
  // The harness judging itself is always broad impact.
  const core = deriveTierNeed(["qa/verify.mjs"], decl);
  assert.equal(core.required, true);
  assert.match(core.reason, /qa\/ is the harness itself/);
});

test("lane output never obliges anything — a receipt is not a change", () => {
  const decl = { irrelevantRoots: ["docs/"], tierName: "the device tier" };
  // Only lane output changed: nothing real moved, and it fails open rather than
  // pretending the empty set is a licence to skip.
  const r = deriveTierNeed(["qa/evidence/latest.json", "qa-artifacts/x.png"], decl);
  assert.equal(r.required, true);
  assert.match(r.reason, /no change to reason about/);
});
