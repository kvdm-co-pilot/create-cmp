// Genesis-flow engine coverage (GENESIS-FLOW-DESIGN.md §1/§2, DoD §4.1–4.4):
// the extended registry (intent, components, configurable exemplar), the
// stamper's configurable clone source + extras warning, the express lane
// (--accept-defaults / approveAllDefaults), and reopen-for-redesign — including
// the sanctioned-redesign-vs-drift asymmetry, pinned with BOTH states in one
// gate run.
//
// Mirrors test/approvals-gate.test.mjs's approach: scaffold the REAL template
// with `verify: false` (fast, gradle-free), import the generated project's own
// qa/lib/approvals.mjs directly for library behavior, and exercise the CLIs via
// execFileSync where the point IS the CLI surface.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { scaffold } from "../src/scaffold.mjs";

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
    e2e: true,
    inspector: true,
    devClient: true,
    tabs: [{ label: "Home", icon: "home" }],
    targetDir,
    ...overrides,
  };
}

async function makeProject(prefix, overrides = {}) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  await scaffold(baseConfig(out, overrides), { verify: false });
  return out;
}

async function loadLib(projectRoot) {
  return import(pathToFileURL(path.join(projectRoot, "qa/lib/approvals.mjs")));
}

function runApprove(root, args) {
  return execFileSync(process.execPath, [path.join(root, "qa/approve.mjs"), ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function runApproveExpectFail(root, args) {
  try {
    execFileSync(process.execPath, [path.join(root, "qa/approve.mjs"), ...args], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    assert.fail("expected qa/approve.mjs to exit non-zero");
  } catch (err) {
    return { status: err.status, stdout: err.stdout, stderr: err.stderr };
  }
}

function runStamper(root, args) {
  return execFileSync(process.execPath, [path.join(root, "qa/scaffold-feature.mjs"), ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function readLedger(root) {
  return JSON.parse(fs.readFileSync(path.join(root, "qa/approvals.json"), "utf8"));
}

function writeLedger(root, ledger) {
  fs.writeFileSync(path.join(root, "qa/approvals.json"), `${JSON.stringify(ledger, null, 2)}\n`);
}

const PKG_DIR = "com/acme/demo";

// ── §1: registry — intent + components ────────────────────────────────────────

test("intent artifact: order 0, resolves specs/intent.md, approvable; deletion refuses with the missing-files flavor", async () => {
  const out = await makeProject("cmp-gen-intent-");
  try {
    const { listGovernedArtifacts, approveArtifact } = await loadLib(out);

    const registry = listGovernedArtifacts(out);
    assert.equal(registry[0].id, "intent", "intent is order 0 — the root artifact everything traces to");
    assert.deepEqual(registry[0].files, ["specs/intent.md"]);
    assert.ok(fs.existsSync(path.join(out, "specs/intent.md")), "template ships the intent seed");

    // The seed's placeholder prose is clearly marked unfilled.
    const seed = fs.readFileSync(path.join(out, "specs/intent.md"), "utf8");
    assert.match(seed, /not yet captured — filled by the cmp-new interview/);

    const ok = approveArtifact(out, "intent");
    assert.equal(ok.ok, true, "a present intent brief is approvable");

    fs.rmSync(path.join(out, "specs/intent.md"));
    const refused = approveArtifact(out, "intent");
    assert.equal(refused.ok, false);
    assert.match(refused.reason, /resolves to 0 files/);
    assert.match(refused.reason, /specs\/intent\.md/);
    assert.match(refused.reason, /vacuous/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("components artifact: order 3, dynamic sorted glob; zero-glob is unresolvable (refused), approved-then-emptied FAILs", async () => {
  const out = await makeProject("cmp-gen-components-");
  try {
    const { listGovernedArtifacts, approveArtifact, evaluateApprovalsGate } = await loadLib(out);

    const registry = listGovernedArtifacts(out);
    assert.equal(registry[3].id, "components", "components is order 3");

    const componentsDir = path.join(out, "composeApp/src/commonMain/kotlin", PKG_DIR, "presentation/components");
    const onDisk = fs
      .readdirSync(componentsDir)
      .filter((n) => n.endsWith(".kt"))
      .map((n) => `composeApp/src/commonMain/kotlin/${PKG_DIR}/presentation/components/${n}`)
      .sort((a, b) => a.localeCompare(b));
    assert.ok(onDisk.length > 0, "sanity: the template ships common components");
    assert.deepEqual(registry[3].files, onDisk, "components resolves the sorted presentation/components/*.kt glob");

    const ok = approveArtifact(out, "components");
    assert.equal(ok.ok, true);

    // Empty the glob: the artifact is now unresolvable — the standing approval
    // must degrade to changed-since-approval (FAIL), and a fresh approval over
    // the empty glob must be refused ("unresolvable, not approvable-empty").
    for (const n of fs.readdirSync(componentsDir)) fs.rmSync(path.join(componentsDir, n));
    const gate = evaluateApprovalsGate(out);
    assert.equal(gate.verdict, "FAIL", "approved components emptied afterwards must FAIL, never PASS");
    const comp = gate.statuses.find((s) => s.id === "components");
    assert.equal(comp.status, "changed-since-approval");
    assert.equal(comp.resolvable, false);

    const refused = approveArtifact(out, "components");
    assert.equal(refused.ok, false, "a components glob matching zero files is unresolvable, not approvable-empty");
    assert.match(refused.reason, /nothing currently matches this artifact's pattern/);
    assert.match(refused.reason, /vacuous/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

// ── §1: legacy-ledger equivalence + configurable exemplar ────────────────────

test("legacy ledger equivalence: a ledger WITHOUT exemplarFeature behaves byte-identically to the shipped 'home' config", async () => {
  const out = await makeProject("cmp-gen-legacy-");
  try {
    const { getApprovalStatuses, getExemplarFeature, listGovernedArtifacts } = await loadLib(out);

    assert.equal(getExemplarFeature(out), "home", "shipped seed configures home explicitly");
    const withKey = getApprovalStatuses(out);
    const registryWithKey = listGovernedArtifacts(out);

    // Strip the config key — the pre-genesis ledger shape.
    const ledger = readLedger(out);
    assert.equal(ledger.exemplarFeature, "home");
    delete ledger.exemplarFeature;
    writeLedger(out, ledger);

    assert.equal(getExemplarFeature(out), "home", "absent key ⇒ home (every legacy ledger keeps meaning what it meant)");
    assert.deepEqual(getApprovalStatuses(out), withKey, "statuses are identical with and without the key");
    assert.deepEqual(listGovernedArtifacts(out), registryWithKey, "registry is identical with and without the key");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("exemplar reconfigure: registry hashes the CONFIGURED feature's 11-file set; feature-spec excludes the configured exemplar, not hardcoded home", async () => {
  const out = await makeProject("cmp-gen-reconf-");
  try {
    runStamper(out, ["Favorites"]);

    const ledger = readLedger(out);
    ledger.exemplarFeature = "favorites";
    writeLedger(out, ledger);

    const { listGovernedArtifacts, hashArtifactFiles, approveArtifact, resolveExemplarNames } = await loadLib(out);

    assert.deepEqual(resolveExemplarNames(out), { f: "favorites", F: "Favorites", F_UPPER: "FAVORITES", E: "Favorite" });

    const registry = listGovernedArtifacts(out);
    const exemplar = registry.find((a) => a.id === "exemplar-feature");
    assert.match(exemplar.label, /favorites/);
    assert.equal(exemplar.files.length, 11, "10 kotlin files + the spec");
    assert.ok(exemplar.files.includes(`composeApp/src/commonMain/kotlin/${PKG_DIR}/presentation/favorites/FavoritesScreen.kt`));
    assert.ok(exemplar.files.includes(`composeApp/src/commonMain/kotlin/${PKG_DIR}/domain/model/Favorite.kt`));
    assert.ok(exemplar.files.includes("specs/favorites.spec.md"));
    assert.ok(!exemplar.files.some((f) => f.includes("/home/") || f.endsWith("home.spec.md")), "nothing of home remains in the exemplar set");

    const exemplarSpec = registry.find((a) => a.id === "exemplar-spec");
    assert.deepEqual(exemplarSpec.files, ["specs/favorites.spec.md"]);

    // feature-spec enumeration excludes the CONFIGURED exemplar's spec — and
    // the DEMOTED old exemplar (home) is now an ordinary feature spec.
    const featureSpecIds = registry.filter((a) => a.id.startsWith("feature-spec:")).map((a) => a.id);
    assert.deepEqual(featureSpecIds, ["feature-spec:home"], "favorites.spec.md is the exemplar's; home.spec.md is now a plain feature spec");

    // Approving the exemplar records the hash over THAT set.
    const approved = approveArtifact(out, "exemplar-feature");
    assert.equal(approved.ok, true);
    assert.equal(approved.hash, hashArtifactFiles(out, exemplar.files).hash, "the stored hash is the recompute over the configured set");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

// ── §1: stamper — clone-source refactor ──────────────────────────────────────

// The reference rename map exactly as the stamper hardcoded it BEFORE the
// clone source became configurable (whole-word, longest-key-first), extended
// with the `_loading`/`_retry` tag families the component-vocabulary wave
// (docs/proposals/component-system-deep-dive.md §6.2) added to the production
// RENAME_MAP alongside `_title`/`_error`/`_empty`, and with the `_item_`
// family (§6.4/W3): HomeScreen's per-row `home_item_${item.id}` tag was a
// pre-existing gap in the map — a stamped feature kept the SOURCE exemplar's
// `home_item_` prefix on its list rows until this entry closed it. Stamping
// from `home` must still be byte-identical to this transform — the pin that
// the generated-from-source-names map degenerates to the historical literals.
function referenceHomeRename(text, F, f, F_UPPER, E) {
  const map = [
    ["HomeScreenTest", `${F}ScreenTest`],
    ["HomeViewModelTest", `${F}ViewModelTest`],
    ["HomeGoldenTreeTest", `${F}GoldenTreeTest`],
    ["HomeScreen", `${F}Screen`],
    ["HomeViewModel", `${F}ViewModel`],
    ["HomeUiState", `${F}UiState`],
    ["home_title", `${f}_title`],
    ["home_error", `${f}_error`],
    ["home_empty", `${f}_empty`],
    ["home_loading", `${f}_loading`],
    ["home_retry", `${f}_retry`],
    ["home_item_", `${f}_item_`],
    ["FakeItemRepository", `Fake${E}Repository`],
    ["ItemRepositoryImpl", `${E}RepositoryImpl`],
    ["ItemRepository", `${E}Repository`],
    ["GetItemsUseCase", `Get${E}sUseCase`],
    ["getItemsCallCount", `get${E}sCallCount`],
    ["getItems", `get${E}s`],
    ["Item", E],
    ["HOME-0", `${F_UPPER}-0`],
    ["HOME", F_UPPER],
    ["home", f],
    ["Home", F],
  ].sort((a, b) => b[0].length - a[0].length);
  let outText = text;
  for (const [from, to] of map) {
    outText = outText.replace(new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), to);
  }
  return outText;
}

test("stamping from home is byte-identical to the historical hardcoded rename (parity pin)", async () => {
  const out = await makeProject("cmp-gen-parity-");
  try {
    // No WARNING for the shipped exemplar: DetailScreen.kt shares home's
    // presentation directory by design (a deliberately not-cloned fixture) and
    // must never be flagged as an extra.
    const dryRun = runStamper(out, ["Favorites", "--dry-run"]);
    assert.ok(!dryRun.includes("WARNING"), "the pristine home exemplar produces no extras warning");

    runStamper(out, ["Favorites"]);

    // The 9 renamed-but-not-wrapped kotlin files must equal the reference
    // transform byte-for-byte. (FavoritesScreen.kt additionally gets the
    // BaseScreen wrap — unchanged logic, asserted structurally below.)
    const renamedOnly = [
      ["commonMain", "domain/model/Item.kt", "domain/model/Favorite.kt"],
      ["commonMain", "domain/repository/ItemRepository.kt", "domain/repository/FavoriteRepository.kt"],
      ["commonMain", "domain/usecase/GetItemsUseCase.kt", "domain/usecase/GetFavoritesUseCase.kt"],
      ["commonMain", "data/remote/ItemRepositoryImpl.kt", "data/remote/FavoriteRepositoryImpl.kt"],
      ["commonTest", "testing/fakes/FakeItemRepository.kt", "testing/fakes/FakeFavoriteRepository.kt"],
      ["commonMain", "presentation/home/HomeViewModel.kt", "presentation/favorites/FavoritesViewModel.kt"],
      ["commonTest", "presentation/home/HomeViewModelTest.kt", "presentation/favorites/FavoritesViewModelTest.kt"],
      ["desktopTest", "presentation/home/HomeScreenTest.kt", "presentation/favorites/FavoritesScreenTest.kt"],
      ["desktopTest", "presentation/home/HomeGoldenTreeTest.kt", "presentation/favorites/FavoritesGoldenTreeTest.kt"],
    ];
    for (const [sourceSet, fromRel, toRel] of renamedOnly) {
      const src = fs.readFileSync(path.join(out, "composeApp/src", sourceSet, "kotlin", PKG_DIR, fromRel), "utf8");
      const stamped = fs.readFileSync(path.join(out, "composeApp/src", sourceSet, "kotlin", PKG_DIR, toRel), "utf8");
      assert.equal(stamped, referenceHomeRename(src, "Favorites", "favorites", "FAVORITES", "Favorite"), `byte parity broken for ${toRel}`);
    }

    // The wrapped screen: renamed + BaseScreen-wrapped, no home tokens left.
    const screen = fs.readFileSync(
      path.join(out, "composeApp/src/commonMain/kotlin", PKG_DIR, "presentation/favorites/FavoritesScreen.kt"),
      "utf8",
    );
    assert.match(screen, /BaseScreen \{/);
    assert.match(screen, /fun FavoritesScreen\(/);
    assert.ok(!/\b(Home|home|Item)\b/.test(screen), "no stray source-exemplar tokens in the stamped screen");
    // The pre-existing gap this wave closes: the per-row testTag renames too, not just the
    // bare `home_item_` package/word-boundary-immune prefix.
    assert.match(screen, /testTag = "favorites_item_\$\{item\.id\}"/, "the per-row tag family renames (RENAME_MAP _item_ entry)");
    assert.ok(!screen.includes("home_item_"), "no stale home_item_ prefix survives the stamp");

    // The generated spec still says it came from the `home` exemplar shape.
    const spec = fs.readFileSync(path.join(out, "specs/favorites.spec.md"), "utf8");
    assert.match(spec, /from the `home` exemplar shape/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("stamping from a renamed source: a feature stamped from a reconfigured exemplar carries the new names, no source tokens", async () => {
  const out = await makeProject("cmp-gen-stamp2-");
  try {
    runStamper(out, ["Favorites"]);
    const ledger = readLedger(out);
    ledger.exemplarFeature = "favorites";
    writeLedger(out, ledger);

    const stdout = runStamper(out, ["Bookmarks"]);
    assert.match(stdout, /Scaffolded feature "Bookmarks"/);
    assert.match(stdout, /specs\/bookmarks\.spec\.md written/);

    const vmPath = path.join(out, "composeApp/src/commonMain/kotlin", PKG_DIR, "presentation/bookmarks/BookmarksViewModel.kt");
    assert.ok(fs.existsSync(vmPath), "presentation slice cloned from the favorites exemplar");
    const vm = fs.readFileSync(vmPath, "utf8");
    assert.match(vm, /package com\.acme\.demo\.presentation\.bookmarks/);
    assert.match(vm, /GetBookmarksUseCase/);
    assert.ok(!/\b(Favorites|favorites|Favorite|Home|home|Item)\b/.test(vm), "no source-exemplar tokens survive the rename");

    const spec = fs.readFileSync(path.join(out, "specs/bookmarks.spec.md"), "utf8");
    assert.match(spec, /from the `favorites` exemplar shape/, "the spec names its real clone source");
    assert.match(spec, /\*\*BOOKMARKS-01\*\*/);

    // The stamped feature is seeded unreviewed like any other.
    const entry = readLedger(out).artifacts.find((a) => a.artifact === "feature-spec:bookmarks");
    assert.equal(entry.status, "unreviewed");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("extras warning: a source exemplar with files beyond the canonical shape stamps the canonical set and WARNs, listing what it skipped", async () => {
  const out = await makeProject("cmp-gen-extras-");
  try {
    runStamper(out, ["Favorites"]);
    const ledger = readLedger(out);
    ledger.exemplarFeature = "favorites";
    writeLedger(out, ledger);

    const extraRel = `composeApp/src/commonMain/kotlin/${PKG_DIR}/presentation/favorites/FavoritesFilterViewModel.kt`;
    fs.writeFileSync(path.join(out, extraRel), "package com.acme.demo.presentation.favorites\n");

    const stdout = runStamper(out, ["Wishlist", "--dry-run"]);
    assert.match(stdout, /WARNING: the "favorites" exemplar has files beyond the canonical 11-file shape/);
    assert.ok(stdout.includes(extraRel), "the warning lists exactly the skipped file");
    assert.ok(!stdout.includes("FavoritesFilterViewModel.kt\n    ->"), "the extra is not in the clone plan");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

// ── §2: express lane ─────────────────────────────────────────────────────────

test("express lane: approveAllDefaults approves every resolvable artifact with mode recorded, skips unresolvable with the standard refusal, and a later real approval clears the mode", async () => {
  const out = await makeProject("cmp-gen-express-");
  try {
    const { approveAllDefaults, approveArtifact, getApprovalStatuses } = await loadLib(out);

    // Give design-system a REAL approval first: the express lane must never
    // overwrite a standing approval.
    assert.equal(approveArtifact(out, "design-system").ok, true);

    // Make intent unresolvable: the skip path (never a silent skip).
    fs.rmSync(path.join(out, "specs/intent.md"));

    const result = approveAllDefaults(out);
    assert.equal(result.ok, true);
    assert.deepEqual(
      result.approved.sort(),
      ["architecture", "components", "exemplar-feature", "exemplar-spec"].sort(),
      "everything resolvable and not already approved gets the defaults-accepted approval",
    );
    assert.equal(result.skipped.length, 1);
    assert.equal(result.skipped[0].id, "intent");
    assert.match(result.skipped[0].reason, /resolves to 0 files/, "the skip carries approveArtifact's own refusal verbatim");

    // Modes: express entries carry it, the pre-existing real approval does not.
    const ledger = readLedger(out);
    for (const id of result.approved) {
      const entry = ledger.artifacts.find((a) => a.artifact === id);
      assert.equal(entry.status, "approved");
      assert.equal(entry.mode, "defaults-accepted", `${id} is stamped defaults-accepted`);
    }
    assert.equal(ledger.artifacts.find((a) => a.artifact === "design-system").mode, undefined, "the real approval is untouched");

    // resolveArtifactStatus surfaces the mode.
    const statuses = getApprovalStatuses(out);
    assert.equal(statuses.find((s) => s.id === "architecture").mode, "defaults-accepted");
    assert.equal(statuses.find((s) => s.id === "design-system").mode, undefined);

    // A later real approval CLEARS the mode.
    assert.equal(approveArtifact(out, "architecture").ok, true);
    assert.equal(readLedger(out).artifacts.find((a) => a.artifact === "architecture").mode, undefined, "shaping clears defaults-accepted");
    assert.equal(getApprovalStatuses(out).find((s) => s.id === "architecture").mode, undefined);

    // Idempotence: a second run approves nothing new (all settled or skipped).
    const again = approveAllDefaults(out);
    assert.deepEqual(again.approved, []);
    assert.equal(again.skipped.length, 1, "intent is still honestly skipped, not silently dropped");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("express lane CLI: --accept-defaults prints per-artifact results incl. the skip refusal; --status shows the [defaults-accepted] badge", async () => {
  const out = await makeProject("cmp-gen-express-cli-");
  try {
    fs.rmSync(path.join(out, "specs/intent.md"));

    const stdout = runApprove(out, ["--accept-defaults"]);
    assert.match(stdout, /✓ approved design-system \[defaults-accepted\]/);
    assert.match(stdout, /✓ approved exemplar-spec \[defaults-accepted\]/);
    assert.match(stdout, /→ skipped intent: cannot approve "intent"/, "the skip prints the standard refusal — never silent");
    assert.match(stdout, /5 approved \(defaults-accepted\), 1 skipped \(unresolvable\)\./);

    const status = runApprove(out, ["--status"]);
    assert.match(status, /design-system: approved \([0-9a-f]{8}\) \[defaults-accepted\]/, "--status surfaces the mode");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

// ── §2: reopen for redesign ──────────────────────────────────────────────────

test("reopen: refusals are precise (unknown id, unreviewed, already-reopened, drifted), and only approved artifacts reopen", async () => {
  const out = await makeProject("cmp-gen-reopen-refusals-");
  try {
    const { reopenArtifact, approveArtifact } = await loadLib(out);

    const unknown = reopenArtifact(out, "not-a-thing");
    assert.equal(unknown.ok, false);
    assert.match(unknown.reason, /unknown artifact "not-a-thing"/);
    assert.match(unknown.reason, /valid ids: intent, design-system/);

    const unreviewed = reopenArtifact(out, "design-system");
    assert.equal(unreviewed.ok, false);
    assert.match(unreviewed.reason, /it is "unreviewed", not "approved"/);

    // Approved -> reopened works; the result's `artifact` is the ID STRING
    // (same convention as approveArtifact — the console bridge relies on it).
    assert.equal(approveArtifact(out, "design-system").ok, true);
    const reopened = reopenArtifact(out, "design-system");
    assert.equal(reopened.ok, true);
    assert.equal(reopened.artifact, "design-system", "reopenArtifact returns the artifact id string, like approveArtifact");
    assert.match(reopened.reopenedAt, /^\d{4}-\d{2}-\d{2}T/);

    const again = reopenArtifact(out, "design-system");
    assert.equal(again.ok, false);
    assert.match(again.reason, /it is "reopened", not "approved"/);

    // A drifted (changed-since-approval) artifact cannot be reopened either —
    // there is nothing sanctioned to walk back from.
    assert.equal(approveArtifact(out, "architecture").ok, true);
    fs.appendFileSync(path.join(out, "specs/app-base.spec.md"), "\n<!-- drift -->\n");
    const drifted = reopenArtifact(out, "architecture");
    assert.equal(drifted.ok, false);
    assert.match(drifted.reason, /it is "changed-since-approval", not "approved"/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("reopen: status surfaces reopened+reopenedAt; edits while reopened stay reopened; re-approval closes it and clears reopenedAt", async () => {
  const out = await makeProject("cmp-gen-reopen-status-");
  try {
    const { approveArtifact, reopenArtifact, getApprovalStatuses } = await loadLib(out);

    // Both flavors reopen: a real approval and a defaults-accepted one.
    assert.equal(approveArtifact(out, "design-system").ok, true);
    assert.equal(approveArtifact(out, "components", { mode: "defaults-accepted" }).ok, true);
    assert.equal(reopenArtifact(out, "design-system").ok, true);
    assert.equal(reopenArtifact(out, "components").ok, true, "a defaults-accepted approval is reopenable too");

    let statuses = getApprovalStatuses(out);
    const ds = statuses.find((s) => s.id === "design-system");
    assert.equal(ds.status, "reopened");
    assert.match(ds.reopenedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(statuses.find((s) => s.id === "components").status, "reopened");
    assert.equal(readLedger(out).artifacts.find((a) => a.artifact === "components").mode, undefined, "reopening clears the defaults-accepted mode");

    // Redesign edits while reopened NEVER become drift — that's the point.
    const themeFile = path.join(out, "composeApp/src/commonMain/kotlin", PKG_DIR, "presentation/theme/Theme.kt");
    fs.appendFileSync(themeFile, "\n// redesign in progress\n");
    statuses = getApprovalStatuses(out);
    assert.equal(statuses.find((s) => s.id === "design-system").status, "reopened", "a reopened artifact stays reopened through edits");

    // Re-approval closes the genesis loop: approved again, reopenedAt gone.
    assert.equal(approveArtifact(out, "design-system").ok, true);
    const after = getApprovalStatuses(out).find((s) => s.id === "design-system");
    assert.equal(after.status, "approved");
    assert.equal(after.reopenedAt, undefined);
    assert.equal(readLedger(out).artifacts.find((a) => a.artifact === "design-system").reopenedAt, undefined);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("THE asymmetry, one run: a reopened artifact + a drifted artifact ⇒ gate FAILs naming ONLY the drifted one", async () => {
  const out = await makeProject("cmp-gen-asymmetry-");
  try {
    const { approveArtifact, reopenArtifact, evaluateApprovalsGate } = await loadLib(out);

    // design-system: approved then REOPENED (sanctioned redesign)…
    assert.equal(approveArtifact(out, "design-system").ok, true);
    assert.equal(reopenArtifact(out, "design-system").ok, true);
    const themeFile = path.join(out, "composeApp/src/commonMain/kotlin", PKG_DIR, "presentation/theme/Theme.kt");
    fs.appendFileSync(themeFile, "\n// sanctioned redesign edit\n");

    // …architecture: approved then MUTATED without reopening (drift).
    assert.equal(approveArtifact(out, "architecture").ok, true);
    fs.appendFileSync(path.join(out, "specs/app-base.spec.md"), "\n<!-- unsanctioned drift -->\n");

    const gate = evaluateApprovalsGate(out);
    assert.equal(gate.verdict, "FAIL", "drift always FAILs, even while another artifact is legitimately reopened");
    assert.match(gate.reason, /\[architecture\]/, "the FAIL names the drifted artifact");
    assert.ok(!gate.reason.includes("[design-system]"), "the FAIL does NOT name the merely-reopened artifact");
    assert.equal(gate.statuses.find((s) => s.id === "design-system").status, "reopened");
    assert.equal(gate.statuses.find((s) => s.id === "architecture").status, "changed-since-approval");

    // Fix the drift: the reopened artifact alone downgrades the verdict to a
    // non-blocking SKIP that names it as pending.
    assert.equal(approveArtifact(out, "architecture").ok, true);
    const gate2 = evaluateApprovalsGate(out);
    assert.equal(gate2.verdict, "SKIP", "reopened behaves exactly like unreviewed: SKIP with warning, non-blocking");
    assert.match(gate2.reason, /\[design-system\].*reopened for redesign/, "the SKIP warning explains the reopened state");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("reopen CLI: --reopen writes the same ledger the library writes; refusals exit non-zero with the library's reason", async () => {
  const out = await makeProject("cmp-gen-reopen-cli-");
  try {
    runApprove(out, ["exemplar-spec"]);
    const stdout = runApprove(out, ["--reopen", "exemplar-spec"]);
    assert.match(stdout, /↺ reopened exemplar-spec for redesign — at \d{4}-/);

    const entry = readLedger(out).artifacts.find((a) => a.artifact === "exemplar-spec");
    assert.equal(entry.status, "reopened");
    assert.ok(entry.reopenedAt);

    const status = runApprove(out, ["--status"]);
    assert.match(status, /↺ exemplar-spec: reopened \(reopened at /);

    const fail = runApproveExpectFail(out, ["--reopen", "design-system"]);
    assert.equal(fail.status, 1);
    assert.match(fail.stderr, /cannot reopen "design-system" — it is "unreviewed", not "approved"/);

    const noArg = runApproveExpectFail(out, ["--reopen"]);
    assert.equal(noArg.status, 1);
    assert.match(noArg.stderr, /usage: node qa\/approve\.mjs --reopen <artifact>/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});
