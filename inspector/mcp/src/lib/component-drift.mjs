// component-drift.mjs — per-file "modified since approval" evidence for the
// Components section's drift chips (VERIFICATION-LAYER-DESIGN.md §7.2, CV-1
// W3b brief: "shown ON the affected component cards, not just a banner").
//
// The `components` governed artifact's approval hash covers ALL its files
// combined into one digest (template's qa/lib/approvals.mjs's
// hashArtifactFiles: sha256 over the sorted (path, sha256(content)) list).
// The ledger never stores a per-file breakdown, so which SPECIFIC file
// changed after a "changed-since-approval" verdict cannot be recovered
// exactly from the stored hash alone — and this package never forks that
// hashing model (approvals-bridge.mjs's whole reason for existing).
//
// This module reports the best HONEST signal available without forking that
// model: a file's mtime compared against the artifact's approvedAt
// timestamp. This is evidence, not proof — a file touched without a content
// change (e.g. a checkout that bumps mtime) would read as a false positive;
// a content change landing with an mtime before approvedAt (clock skew,
// or a git operation that preserves mtime) would read as a false negative.
// Every render site that shows this data labels it explicitly as
// "mtime-based" — never presented as an exact per-file diff.

import fs from "node:fs";
import path from "node:path";

/**
 * @param {string} root
 * @param {string[]} files root-relative component file paths (getComponentsData's `component.file` values)
 * @param {{status?: string, approvedAt?: (string|null)}|null|undefined} approvalRecord
 *   the "components" artifact's live status record (approvals-bridge.mjs's
 *   getApprovalsData().statuses, filtered to id === "components")
 * @returns {{available: false, reason: string} | {available: true, byFile: Record<string, {modifiedSinceApproval: (boolean|null), mtime: (string|null)}>}}
 */
export function getComponentDriftInfo(root, files, approvalRecord) {
  if (!approvalRecord) {
    return { available: false, reason: "no approvals record for the components artifact" };
  }
  if (approvalRecord.status !== "changed-since-approval") {
    return {
      available: false,
      reason: `components artifact status is "${approvalRecord.status}" — nothing to attribute per-file`,
    };
  }
  if (!approvalRecord.approvedAt) {
    return { available: false, reason: "no approvedAt timestamp on the stored record — cannot compare file mtimes" };
  }
  const approvedAtMs = Date.parse(approvalRecord.approvedAt);
  if (Number.isNaN(approvedAtMs)) {
    return { available: false, reason: `approvedAt "${approvalRecord.approvedAt}" is not a parseable timestamp` };
  }
  const byFile = {};
  for (const relFile of files) {
    try {
      const stat = fs.statSync(path.join(root, relFile));
      byFile[relFile] = { modifiedSinceApproval: stat.mtimeMs > approvedAtMs, mtime: stat.mtime.toISOString() };
    } catch {
      byFile[relFile] = { modifiedSinceApproval: null, mtime: null }; // file gone — no mtime evidence
    }
  }
  return { available: true, byFile };
}
