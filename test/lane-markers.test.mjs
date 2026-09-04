// The lane says "I am running" in CORE state; the eyes say "I am building" in
// the PROFILE's build directory.
//
// Stage 0 PR 6a (docs/NORTH-STAR.md §6; AGNOSTIC-HARNESS-ARCHITECTURE.md §11.3
// step 6). The lane marker lived at composeApp/build/.cmp-lane-in-progress —
// inside a Compose app's Gradle output — and six readers carried that path as a
// constant: the Stop hook, the narrator, the watcher, the chain view, the
// console, the runner. A backend has no composeApp/build, so a lane there
// stamped a marker nobody read and every reader reported an honest-looking
// "nothing running". The marker is the LANE's, so it moved to qa/, beside the
// agent hold. The render marker stays the PROVIDER's: it lives under whatever
// `layout.buildDir` the profile declares, and a profile that declares none has
// no render marker at all.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LANE_MARKER_REL,
  LANE_MARKER_STALE_MS,
  RENDER_MARKER_FRESH_MS,
  RENDER_MARKER_NAME,
  laneMarkerPath,
  markerMtimeMs,
  renderMarkerPath,
} from "../packages/harness/src/lib/lane-markers.mjs";
import { LANE_OUTPUT_PREFIXES } from "../packages/harness/src/lib/affected-tests.mjs";
import { computeInputsHash } from "../packages/harness/src/lib/inputs-hash.mjs";
import { installHarnessLib } from "./helpers/harness-fixture.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
function write(root, rel, text) {
  const abs = path.join(root, ...rel.split("/"));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text);
}

test("the lane marker is core state under qa/ — no stack, no build directory, resolvable with nothing installed", () => {
  assert.equal(LANE_MARKER_REL, "qa/.lane-in-progress");
  const root = tmp("lane-marker-bare-");
  try {
    assert.equal(laneMarkerPath(root), path.join(root, "qa", ".lane-in-progress"));
    assert.equal(markerMtimeMs(laneMarkerPath(root)), null, "absent is null, never a throw");
    write(root, "qa/.lane-in-progress", "1 2026-09-04T00:00:00.000Z\n");
    assert.ok(markerMtimeMs(laneMarkerPath(root)) > 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the render marker comes from the profile's buildDir — the eyes' marker is the eyes' to place", () => {
  const root = tmp("lane-marker-cmp-");
  try {
    installHarnessLib(root);
    assert.equal(renderMarkerPath(root), path.join(root, "composeApp", "build", RENDER_MARKER_NAME));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a profile with no buildDir has no render marker; neither does a root with no manifest — null, never a throw", () => {
  const noBuildDir = tmp("lane-marker-backend-");
  try {
    installHarnessLib(noBuildDir);
    write(noBuildDir, "qa/harness-manifest.json", JSON.stringify({ schema: "harness-manifest/2", profile: { id: "ktor-backend" } }));
    write(
      noBuildDir,
      "qa/lib/profiles/ktor-backend/index.mjs",
      'export const id = "ktor-backend";\nexport const protocol = 1;\n' +
        'export const layout = { specs: "specs", citationRoots: ["services"], citationExts: [".kt"], flows: null };\n' +
        'export const tiers = { names: ["unit"], hostOnly: ["unit"], satisfying: {}, journey: null, forFile: () => "unit" };\n' +
        "export function steps() { return {}; }\n",
    );
    assert.equal(renderMarkerPath(noBuildDir), null, "a backend has no render to defer around");
    assert.equal(markerMtimeMs(null), null, "every reader takes null as 'nothing to wait for'");
    // The lane marker still resolves: it is the lane's, not the stack's.
    assert.equal(laneMarkerPath(noBuildDir), path.join(noBuildDir, "qa", ".lane-in-progress"));
  } finally {
    fs.rmSync(noBuildDir, { recursive: true, force: true });
  }

  const bare = tmp("lane-marker-nomanifest-");
  try {
    assert.equal(renderMarkerPath(bare), null, "a coexistence courtesy never refuses a lane");
  } finally {
    fs.rmSync(bare, { recursive: true, force: true });
  }
});

test("PLANTED: stamping the marker does not move the inputs hash — a running lane never un-proves its own tree", () => {
  const root = tmp("lane-marker-hash-");
  try {
    installHarnessLib(root);
    write(root, "specs/app-base.spec.md", "- **BASE-01** — Given a tree, Then it hashes.\n");
    const before = computeInputsHash(root).hash;
    // The lane stamps its marker under qa/ — inside the verified surface. If it
    // were hashed, the lane would invalidate the very receipt it is writing.
    write(root, LANE_MARKER_REL, JSON.stringify({ pid: 1, step: "build", index: 3, total: 9 }));
    assert.equal(computeInputsHash(root).hash, before, "the marker moved the hash — the lane now invalidates its own receipt mid-run");
    // And the fast filter must not read it as a change, or every --fast run
    // after the first falls open to the full suite (the flight-journal bug).
    assert.ok(LANE_OUTPUT_PREFIXES.includes(LANE_MARKER_REL));
    const ignore = fs.readFileSync(path.join(REPO_ROOT, "template", "gitignore"), "utf8");
    assert.match(ignore, /^qa\/\.lane-in-progress$/m, "transient state is never committed");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the bounds are one definition — a reader that waits longer than the stamper holds would wedge on a crash", () => {
  assert.equal(LANE_MARKER_STALE_MS, 30 * 60 * 1000);
  assert.equal(RENDER_MARKER_FRESH_MS, 5 * 60 * 1000);
  // Every reader takes the path from here rather than restating it.
  const READERS = ["src/watch.mjs", "src/receipt-check.mjs", "src/lib/plan.mjs", "src/lib/lane-narrator.mjs"];
  for (const rel of READERS) {
    const src = fs.readFileSync(path.join(REPO_ROOT, "packages", "harness", rel), "utf8").replace(/^[ \t]*\/\/.*$/gm, "");
    assert.doesNotMatch(src, /\.cmp-lane-in-progress/, `${rel} must not carry the old Compose-rooted marker path`);
  }

  // NAMED RESIDUE, pinned so it cannot grow: two readers still hardcode which
  // SOURCE ROOTS they watch, and those are a stack's, not the lane's. They come
  // from the profile's layout in a later Stage 0 PR; until then this test says
  // exactly which lines are left, so a third one cannot appear unnoticed.
  const stillNamesRoots = {
    "src/watch.mjs": /export const WATCH_ROOTS = \["composeApp\/src", "specs", "qa"\];/,
    "src/lib/plan.mjs": /const ACTIVITY_ROOTS = \["composeApp\/src", "specs", "qa", "docs"\];/,
  };
  for (const rel of READERS) {
    const code = fs.readFileSync(path.join(REPO_ROOT, "packages", "harness", rel), "utf8").replace(/^[ \t]*\/\/.*$/gm, "");
    const hits = code.split("\n").filter((l) => l.includes("composeApp"));
    if (!stillNamesRoots[rel]) {
      assert.deepEqual(hits, [], `${rel} names a stack directory — the marker move left it clean, keep it that way`);
      continue;
    }
    assert.equal(hits.length, 1, `${rel}: exactly one known stack reference remains (the source roots), found ${hits.length}`);
    assert.match(hits[0], stillNamesRoots[rel], `${rel}: the remaining stack reference must be the declared source-roots line`);
  }
});
