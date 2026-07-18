#!/usr/bin/env node
// The approvals CLI — thin shell over qa/lib/approvals.mjs.
//
//   node qa/approve.mjs <artifact>     records approval (recomputes the artifact's
//                                       hash now, stamps the time, writes qa/approvals.json)
//   node qa/approve.mjs --status       lists every governed artifact + live state
//                                       (unreviewed / approved / changed-since-approval) + short hash
//
// This file has NO logic of its own — every decision (the registry, hashing,
// state, the transition) lives in qa/lib/approvals.mjs. That's deliberate: the
// future console (VERIFICATION-LAYER-DESIGN.md §4, `POST /api/approve`) calls the
// SAME library this CLI calls, so this file is the API surface, kept intentionally
// thin and easy to keep in lockstep.

import path from "node:path";
import { fileURLToPath } from "node:url";

import { approveArtifact, getApprovalStatuses, isPackageResolvable, listGovernedArtifacts } from "./lib/approvals.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

function shortHash(hash) {
  return hash ? hash.slice(0, 8) : "none";
}

function printStatus() {
  const statuses = getApprovalStatuses(ROOT);
  if (statuses.length === 0) {
    console.log("No governed artifacts resolved in this project (no specs/, or the package could not be resolved).");
    return;
  }
  console.log("Approval status:\n");
  for (const s of statuses) {
    const mark = s.status === "approved" ? "✓" : s.status === "changed-since-approval" ? "✗" : "→";
    // An unresolvable artifact (0 files, or a partial kotlin set in a
    // pre-stamp tree) must never display its degraded hash as if it were
    // approvable — approval over an unresolved file set is refused.
    const hashInfo =
      s.status === "changed-since-approval"
        ? s.resolvable
          ? `approved ${shortHash(s.storedHash)} -> now ${shortHash(s.hash)}`
          : `approved ${shortHash(s.storedHash)} -> unresolvable (${s.fileCount} of expected files resolved)`
        : s.status === "approved"
          ? shortHash(s.hash)
          : s.resolvable
            ? `would approve at ${shortHash(s.hash)}`
            : `unresolvable (${s.fileCount} of expected files resolved) — not approvable`;
    console.log(`${mark} ${s.id}: ${s.status} (${hashInfo}) — ${s.label}`);
    if (s.missing.length > 0) {
      console.log(`    missing: ${s.missing.join(", ")}`);
    }
  }
}

if (args.includes("--status")) {
  printStatus();
  process.exit(0);
}

if (args.length === 0) {
  const ids = listGovernedArtifacts(ROOT).map((a) => a.id);
  console.error(
    "usage: node qa/approve.mjs <artifact> | --status\n" +
      `  valid artifacts: ${ids.length > 0 ? ids.join(", ") : "(none resolved in this project)"}`,
  );
  process.exit(1);
}

// Write guard: refuse to RECORD approvals in a tree whose package is not
// resolvable (the raw template / a pre-stamp tree). Approvals belong to a
// generated project; writing qa/approvals.json into the template pollutes the
// template itself. Read-only --status (above) stays available anywhere.
if (!isPackageResolvable(ROOT)) {
  console.error(
    "error: this tree's package is not resolvable (composeApp/build.gradle.kts namespace is missing or still a placeholder) — " +
      "this looks like the raw template or a pre-stamp tree. Approvals are recorded in a generated project; refusing to write qa/approvals.json here.",
  );
  process.exit(1);
}

const artifactId = args[0];
const result = approveArtifact(ROOT, artifactId);
if (!result.ok) {
  console.error(`error: ${result.reason}`);
  process.exit(1);
}
console.log(`✓ approved ${result.artifact} — hash ${shortHash(result.hash)}, at ${result.approvedAt}`);
