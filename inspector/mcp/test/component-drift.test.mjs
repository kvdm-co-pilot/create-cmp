// component-drift.mjs — mtime-based "modified since approval" evidence for
// the Components section's per-card drift chips (CV-1 W3b).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getComponentDriftInfo } from "../src/lib/component-drift.mjs";

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-drift-"));
  fs.writeFileSync(path.join(root, "a.kt"), "old");
  fs.writeFileSync(path.join(root, "b.kt"), "old");
  return root;
}

test("getComponentDriftInfo: {available:false} when there's no approval record at all", () => {
  const root = makeProject();
  try {
    assert.deepEqual(getComponentDriftInfo(root, ["a.kt"], null), {
      available: false,
      reason: "no approvals record for the components artifact",
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getComponentDriftInfo: {available:false} when the artifact isn't changed-since-approval — nothing to attribute", () => {
  const root = makeProject();
  try {
    const approved = getComponentDriftInfo(root, ["a.kt"], { status: "approved", approvedAt: "2026-07-19T00:00:00.000Z" });
    assert.equal(approved.available, false);
    assert.match(approved.reason, /status is "approved"/);

    const unreviewed = getComponentDriftInfo(root, ["a.kt"], { status: "unreviewed" });
    assert.equal(unreviewed.available, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getComponentDriftInfo: {available:false} when approvedAt is missing or unparseable", () => {
  const root = makeProject();
  try {
    const noTimestamp = getComponentDriftInfo(root, ["a.kt"], { status: "changed-since-approval", approvedAt: null });
    assert.equal(noTimestamp.available, false);
    assert.match(noTimestamp.reason, /no approvedAt/);

    const badTimestamp = getComponentDriftInfo(root, ["a.kt"], {
      status: "changed-since-approval",
      approvedAt: "not-a-date",
    });
    assert.equal(badTimestamp.available, false);
    assert.match(badTimestamp.reason, /not a parseable timestamp/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getComponentDriftInfo: flags a file whose mtime is AFTER approvedAt, clears one whose mtime is before, and reports missing files honestly", () => {
  const root = makeProject();
  try {
    const approvedAt = "2026-07-19T00:00:00.000Z";
    // a.kt: touched AFTER approval.
    fs.utimesSync(path.join(root, "a.kt"), new Date("2026-07-19T02:00:00.000Z"), new Date("2026-07-19T02:00:00.000Z"));
    // b.kt: untouched since well before approval.
    fs.utimesSync(path.join(root, "b.kt"), new Date("2026-07-01T00:00:00.000Z"), new Date("2026-07-01T00:00:00.000Z"));

    const info = getComponentDriftInfo(root, ["a.kt", "b.kt", "missing.kt"], {
      status: "changed-since-approval",
      approvedAt,
    });
    assert.equal(info.available, true);
    assert.equal(info.byFile["a.kt"].modifiedSinceApproval, true);
    assert.equal(info.byFile["b.kt"].modifiedSinceApproval, false);
    assert.deepEqual(info.byFile["missing.kt"], { modifiedSinceApproval: null, mtime: null });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
