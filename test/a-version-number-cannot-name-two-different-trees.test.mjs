// A VERSION NUMBER IS A NAME FOR BYTES. Two different trees may not share one.
//
// Measured 2026-09-16, and the measurement is why this file exists:
// `node scripts/ground-truth.mjs --registry` printed
//
//     ✓ create-cmp-cli@0.25.0   registry serves this exact version
//     every name this repo owns is live at the version this tree holds.
//
// while the registry's `0.25.0` and this tree's `0.25.0` were SIXTY-SIX shipped
// files apart. Among them were the two Kotlin files fixed hours earlier, whose
// `configureFirebaseEmulators()` swallowed a failed emulator redirect and let a
// debug build talk to the real Firebase project. The fix was on main. Every
// `npx create-cmp-cli` that day still scaffolded the defect, and the one command
// whose job is to answer "is what this tree holds the thing the registry
// serves?" said yes.
//
// IT COMPARED NUMBERS AND REPORTED THE ANSWER AS THOUGH IT HAD COMPARED BYTES.
// That is this repo's recurring shape — a guard written against ABSENCE does not
// catch VACUITY — arriving in the version spine. An unpublished name was caught
// (`absent`); a moved one was caught (`differs`). Present-and-equal over
// different content is the state that looks exactly like a release that shipped.
//
// SEVEN OF TWELVE NAMES WERE IN IT, not one: the CLI by 66 files,
// `prooflane-harness` by 39, `@create-cmp/inspector` by 24 and for three weeks,
// `prooflane-receipts` by 1, and three aliases by a README each. A fix aimed at
// the package that happened to be noticed would have been the
// instance-over-class move this header exists to refuse.
//
// WHAT THIS ASKS, AND WHAT IT DELIBERATELY DOES NOT. Main being ahead of the
// registry is not a defect — that is trunk working, and `--registry` already has
// an honest word for it (`differs`). This asks the narrow question ADR-0008
// makes load-bearing: did anything a package SHIPS change after the commit that
// last SET its version? If so, the number no longer names these bytes, and the
// remedy is a bump — free, and not the same act as a publish.
//
// THE ANCHOR IS THE MANIFEST'S OWN HISTORY, NOT A RELEASE TAG. `npm version`
// does write `vX.Y.Z`, and a tag would have answered for `create-cmp-cli`. The
// other three libraries publish independently (docs/PUBLISHING.md, "Version
// relationships") and carry no tag at all — so a tag-anchored guard would have
// closed this for one package of four and reported the rest green.
import { test } from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { groundTruth, publishedBytesDrift, driftingPackages } from "../scripts/ground-truth.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Derived ONCE. Each call walks every manifest's history with a `git show` per
// commit, which is ~3s — cheap for one answer and wasteful three times over for
// the same one. The refusal test below builds its own, because it is measuring
// the derivation rather than reading its answer.
const DRIFT = publishedBytesDrift(groundTruth());

test("the drift derivation could actually look — NOT DERIVABLE is a failure, never a pass", () => {
  // The whole file rests on this. A derivation that answers "nothing drifted"
  // when it could not run is the same vacuity one level up, and it is how a
  // guard like this normally dies: git absent in some future runner, or a
  // `files` entry it refuses to translate, and every assertion below passes
  // over an empty list.
  assert.ok(
    DRIFT.derivable,
    `the published-bytes derivation could not run, so nothing below measured anything: ${DRIFT.why}`,
  );
});

test("it covers every published name this repo owns — including the ones outside packages/", () => {
  // THE CLASS, NOT THE INSTANCE. `@create-cmp/inspector` is published and live,
  // and `ownedNames()` never listed it, because that list was built by reading
  // `packages/` and the inspector lives at `inspector/mcp`. So `--registry`
  // printed "every name this repo owns" over eleven of twelve names for weeks.
  // Deriving the expected set from git rather than from a directory convention
  // is what stops the next package from escaping the same way.
  const tracked = execFileSync("git", ["ls-files", "*package.json"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .filter((rel) => !rel.includes("node_modules/"))
    .map((rel) => ({ rel, manifest: JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")) }))
    .filter(({ manifest }) => !manifest.private && typeof manifest.name === "string");

  assert.ok(tracked.length >= 2, `only ${tracked.length} publishable package.json tracked — this scan found nothing to check`);

  const covered = new Set(DRIFT.packages.map((p) => p.name));
  const missed = tracked.filter(({ manifest }) => !covered.has(manifest.name));
  assert.deepEqual(
    missed.map(({ rel, manifest }) => `${manifest.name} (${rel})`),
    [],
    `these packages are publishable and tracked, and no drift check asks about them — so their version ` +
      `numbers may name any bytes at all:\n    ${missed.map(({ rel }) => rel).join("\n    ")}\n` +
      `  Add them to \`npmNames()\` in scripts/ground-truth.mjs, or mark them \`"private": true\`.`,
  );
});

test("no package's published version number names bytes other than these", () => {
  const stale = driftingPackages(DRIFT);
  assert.deepEqual(
    stale.map((p) => `${p.name}@${p.version}`),
    [],
    `${stale.length} package(s) changed what they SHIP without changing the number that names it:\n` +
      stale
        .map((p) => `    ${p.name}@${p.version} — ${p.changed.length} shipped file(s) changed since ${p.setDate}, e.g. ${p.changed.slice(0, 3).join(", ")}`)
        .join("\n") +
      `\n  Bump each package's version. That is not the same act as publishing — a bump costs nothing and ` +
      `\n  the registry check will simply read "ahead", which is true. What must never happen is a second ` +
      `\n  tree wearing a number the registry already serves (ADR-0008).`,
  );
});

test("a `files` entry it cannot translate is REFUSED, not guessed at", () => {
  // The refusal is not decorative: npm and git disagree about `*`, and git
  // needs `:(glob)` before `*` will stop crossing a `/`. A silent mistranslation
  // would report a package CLEAN because it looked in the wrong place — the
  // unsafe direction, and the exact defect KD-41 and KD-42 were logged for.
  const real = groundTruth();
  const planted = {
    ...real,
    npm: { ...real.npm, primary: { name: "planted", version: "9.9.9", dir: "packages/receipts" }, independent: [], aliases: [] },
  };
  const manifest = path.join(ROOT, "packages/receipts/package.json");
  const before = fs.readFileSync(manifest, "utf8");
  try {
    const edited = JSON.parse(before);
    edited.files = ["src/**/*.mjs"];
    fs.writeFileSync(manifest, `${JSON.stringify(edited, null, 2)}\n`);
    const drift = publishedBytesDrift(planted);
    assert.equal(drift.derivable, false, "a wildcard files entry was translated rather than refused");
    assert.match(drift.why, /wildcard this derivation does not translate/);
    assert.deepEqual(drift.packages, [], "a refusal must report no packages, or a caller could read it as clean");
  } finally {
    fs.writeFileSync(manifest, before);
  }
});

// ── Two more routes to a clean answer over bytes nobody compared ────────────
//
// Both were logged by review (KD-53, KD-54) as holes the next person to touch
// the walk should close. The walk was being rewritten in the same round, so
// they are closed here, each with a positive control first — a fixture that
// silently built the wrong repo would otherwise pass by measuring nothing.

/** A throwaway repo holding one package, and the synthetic `gt` that names it. */
function fixtureRepo({ files, version = "1.0.0" }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-walk-"));
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  const write = (rel, body) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  };
  const manifest = (v) => `${JSON.stringify({ name: "fixture-pkg", version: v, files }, null, 2)}\n`;
  const commit = (msg) => {
    git("add", "-A");
    git("commit", "-q", "-m", msg);
  };
  git("init", "-q", "-b", "main");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "user.name", "fixture");
  write("pkg/package.json", manifest(version));
  for (const f of files) write(`pkg/${f}/a.mjs`, "export const a = 1;\n");
  commit(`set ${version}`);
  const gt = { npm: { primary: { name: "fixture-pkg", version, dir: "pkg" }, independent: [], aliases: [] } };
  return {
    dir,
    write,
    manifest,
    commit,
    ask: () => publishedBytesDrift(gt, { cwd: dir }),
    rm: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

test("a version bumped away and REVERTED onto still anchors on its first commit (KD-53)", () => {
  const repo = fixtureRepo({ files: ["src"] });
  try {
    repo.write("pkg/src/a.mjs", "export const a = 2;\n");
    repo.commit("change a shipped file under 1.0.0, no bump");
    const control = repo.ask();
    assert.ok(control.derivable, `fixture could not be measured at all: ${control.why}`);
    assert.deepEqual(
      driftingPackages(control).map((p) => p.name),
      ["fixture-pkg"],
      "the fixture is not wired — a committed shipped change under an unchanged version went unreported",
    );

    // The hole: bump away, then revert onto the published number. The run-form
    // walk anchored on the revert and forgave the change above.
    repo.write("pkg/package.json", repo.manifest("9.9.9"));
    repo.commit("bump");
    repo.write("pkg/package.json", repo.manifest("1.0.0"));
    repo.commit("revert the bump");

    const drift = repo.ask();
    assert.deepEqual(
      driftingPackages(drift).map((p) => p.name),
      ["fixture-pkg"],
      `1.0.0 was set, a shipped file changed under it, and a bump-and-revert returned to 1.0.0 — so the ` +
        `registry's 1.0.0 is the FIRST tree and this is another. Anchoring on the revert forgives everything ` +
        `older than it. Got derivable=${drift.derivable} drifting=${JSON.stringify(driftingPackages(drift).map((p) => p.changed))}`,
    );
  } finally {
    repo.rm();
  }
});

test("the manifest is read from the tree being measured, not from this repo (KD-54)", () => {
  // The fixture's `files` is ["lib"]. No package in THIS repo ships a `lib`,
  // so a derivation reading manifests from its own ROOT would watch the wrong
  // paths entirely and report the change below as clean.
  const repo = fixtureRepo({ files: ["lib"] });
  try {
    const control = repo.ask();
    assert.ok(control.derivable, `fixture could not be measured at all: ${control.why}`);
    assert.deepEqual(driftingPackages(control), [], "the fixture drifted before anything was planted");

    repo.write("pkg/lib/a.mjs", "export const a = 2;\n");
    const drift = repo.ask();
    assert.deepEqual(
      driftingPackages(drift).map((p) => p.changed),
      [["pkg/lib/a.mjs"]],
      `a shipped change under the fixture's own \`files\` entry was not reported — the derivation read some ` +
        `other tree's declarations. Got derivable=${drift.derivable} ${drift.why ?? ""}`,
    );
  } finally {
    repo.rm();
  }
});
