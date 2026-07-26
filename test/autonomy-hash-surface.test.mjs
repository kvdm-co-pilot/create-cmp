// Regression: the two hash-surface autonomy gaps (docs/AUTONOMY-GAPS.md §1–§2,
// observed live on the showcase 2026-07-25/26).
//
//   §2 — closing the loop must not cost the proof of the loop: resolving an
//   advisory comment or recording a human's acceptance (ledger bookkeeping)
//   invalidated the receipt for a tree whose code had not changed. Fix:
//   qa/comments.json leaves the verified surface; qa/approvals.json is hashed
//   by gating-field projection (artifact, status, hash, exemplarFeature).
//
//   §1 — machine-read metadata inside the human's signed bytes: adding the
//   required `"screens": true` declaration to a signed brief forced a human
//   re-approval of unchanged reasoning. Fix: the feature-brief hash strips the
//   cmp:feature block (same stance as architecture's cmp:generated stripping),
//   with a permanent raw-bytes fallback so legacy approvals keep verifying.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATE_LIB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "template", "qa", "lib");

function write(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

function makeSurface(root) {
  write(root, "composeApp/src/commonMain/kotlin/Main.kt", "fun main() {}\n");
  write(root, "specs/app-base.spec.md", "## [BASE-01] Given/When/Then\n");
  write(root, "qa/verify.mjs", "// lane stub\n");
  write(root, "gradle/libs.versions.toml", "[versions]\nkotlin = \"2.2.20\"\n");
  write(root, "build.gradle.kts", "// root\n");
  write(root, "settings.gradle.kts", "rootProject.name = \"fake\"\n");
  write(root, "gradle.properties", "org.gradle.jvmargs=-Xmx2g\n");
}

const APPROVED_ROW = {
  artifact: "feature-brief:meal",
  status: "approved",
  hash: "abc123",
  approvedAt: "2026-07-25T10:00:00.000Z",
};

test("inputs-hash: comment-ledger writes and approvals bookkeeping never move the hash; gating fields do", async () => {
  const { computeInputsHash } = await import(path.join(TEMPLATE_LIB, "inputs-hash.mjs"));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-hash-surface-"));
  try {
    makeSurface(root);
    write(root, "qa/approvals.json", `${JSON.stringify({ schema: "cmp-approvals/1", artifacts: [APPROVED_ROW] }, null, 2)}\n`);
    write(root, "qa/comments.json", `${JSON.stringify({ schema: "cmp-comments/1", comments: [] }, null, 2)}\n`);
    const before = computeInputsHash(root).hash;

    // A human comments; the agent resolves with a note — advisory, no lane step
    // reads it, must not invalidate evidence.
    write(root, "qa/comments.json", `${JSON.stringify({ schema: "cmp-comments/1", comments: [{ id: "c1", status: "resolved", note: "done" }] }, null, 2)}\n`);
    assert.equal(computeInputsHash(root).hash, before, "resolving a comment moved the inputs hash");

    // The human accepts the proven feature — bookkeeping on the ledger row.
    write(
      root,
      "qa/approvals.json",
      `${JSON.stringify({ schema: "cmp-approvals/1", artifacts: [{ ...APPROVED_ROW, accepted: true, acceptedAt: "2026-07-26T09:00:00.000Z", via: "console", mode: "defaults-accepted" }] }, null, 2)}\n`,
    );
    assert.equal(computeInputsHash(root).hash, before, "acceptance bookkeeping moved the inputs hash");

    // Pretty-printing / key order is also non-gating.
    write(root, "qa/approvals.json", `${JSON.stringify({ artifacts: [APPROVED_ROW], schema: "cmp-approvals/1" })}\n`);
    assert.equal(computeInputsHash(root).hash, before, "formatting-only approvals rewrite moved the inputs hash");

    // GATING changes must move it: status…
    write(root, "qa/approvals.json", `${JSON.stringify({ schema: "cmp-approvals/1", artifacts: [{ ...APPROVED_ROW, status: "reopened" }] }, null, 2)}\n`);
    const reopened = computeInputsHash(root).hash;
    assert.notEqual(reopened, before, "a status flip (approved→reopened) must move the inputs hash");

    // …hash…
    write(root, "qa/approvals.json", `${JSON.stringify({ schema: "cmp-approvals/1", artifacts: [{ ...APPROVED_ROW, hash: "def456" }] }, null, 2)}\n`);
    assert.notEqual(computeInputsHash(root).hash, before, "a stored-hash change must move the inputs hash");

    // …and exemplarFeature (it selects the exemplar artifact's file set).
    write(root, "qa/approvals.json", `${JSON.stringify({ schema: "cmp-approvals/1", artifacts: [APPROVED_ROW], exemplarFeature: "meal" }, null, 2)}\n`);
    assert.notEqual(computeInputsHash(root).hash, before, "an exemplarFeature change must move the inputs hash");

    // An unparsable ledger falls back to raw bytes — never treated as empty.
    write(root, "qa/approvals.json", "{ not json\n");
    const broken1 = computeInputsHash(root).hash;
    write(root, "qa/approvals.json", "{ still not json\n");
    assert.notEqual(computeInputsHash(root).hash, broken1, "unparsable ledgers must hash raw bytes");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const BRIEF_PROSE = [
  "# Feature: meal",
  "",
  "## Decisions",
  "",
  "- The day boundary is configurable, default 04:00 — not midnight.",
  "",
].join("\n");

const BLOCK_V1 = '```json cmp:feature\n{ "touches": ["components"] }\n```\n';
const BLOCK_V2 = '```json cmp:feature\n{ "touches": ["components"], "screens": true }\n```\n';

function briefArtifact() {
  return { id: "feature-brief:meal", label: "Feature brief (docs/features/meal.md)", files: ["docs/features/meal.md"], complete: true };
}

test("feature-brief hash: editing the cmp:feature block never invalidates a signature; editing prose does", async () => {
  const { resolveArtifactStatus } = await import(path.join(TEMPLATE_LIB, "approvals.mjs"));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-brief-hash-"));
  try {
    write(root, "docs/features/meal.md", BRIEF_PROSE + BLOCK_V1);
    const artifact = briefArtifact();
    const signedHash = resolveArtifactStatus(root, artifact, undefined).hash;
    const stored = { artifact: artifact.id, status: "approved", hash: signedHash, approvedAt: "2026-07-25T10:00:00.000Z" };

    // Agent adds the required screens declaration — mechanical, enforced
    // elsewhere; the signed reasoning is untouched.
    write(root, "docs/features/meal.md", BRIEF_PROSE + BLOCK_V2);
    assert.equal(resolveArtifactStatus(root, artifact, stored).status, "approved", "a cmp:feature block edit invalidated the brief's signature");

    // Removing the block entirely is also declaration-only.
    write(root, "docs/features/meal.md", BRIEF_PROSE);
    assert.equal(resolveArtifactStatus(root, artifact, stored).status, "approved", "removing the cmp:feature block invalidated the brief's signature");

    // A checkout-induced EOL flip in prose must never read as authored drift.
    write(root, "docs/features/meal.md", (BRIEF_PROSE + BLOCK_V1).replace(/\n/g, "\r\n"));
    assert.equal(resolveArtifactStatus(root, artifact, stored).status, "approved", "an EOL flip invalidated the brief's signature");

    // But the PROSE is exactly what the human signed — an edit there is drift.
    write(root, "docs/features/meal.md", BRIEF_PROSE.replace("04:00", "00:00") + BLOCK_V1);
    assert.equal(resolveArtifactStatus(root, artifact, stored).status, "changed-since-approval", "a prose edit must invalidate the signature");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("feature-brief hash: a legacy raw-bytes approval still verifies while the bytes are untouched", async () => {
  const { resolveArtifactStatus, hashArtifactFiles } = await import(path.join(TEMPLATE_LIB, "approvals.mjs"));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-brief-legacy-"));
  try {
    write(root, "docs/features/meal.md", BRIEF_PROSE + BLOCK_V1);
    const artifact = briefArtifact();
    // What a pre-stripping ledger stored: the raw-bytes hash.
    const legacyHash = hashArtifactFiles(root, artifact.files).hash;
    const stored = { artifact: artifact.id, status: "approved", hash: legacyHash, approvedAt: "2026-07-01T10:00:00.000Z" };

    assert.equal(resolveArtifactStatus(root, artifact, stored).status, "approved", "a legacy raw-bytes approval must keep verifying on untouched bytes");

    // Any edit — even a block-only edit — moves the raw bytes off the legacy
    // hash, so the fallback correctly stops vouching. (The stripped-basis hash
    // never matched a legacy record; that is exactly why the fallback exists.)
    write(root, "docs/features/meal.md", BRIEF_PROSE + BLOCK_V2);
    assert.equal(resolveArtifactStatus(root, artifact, stored).status, "changed-since-approval", "the legacy fallback must only accept byte-identical content");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
