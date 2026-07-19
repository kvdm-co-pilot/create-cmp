// fixture-approvals-lib.mjs — a minimal JSON-file implementation of the
// approvals library's Wave-2 §3 additions (GENESIS-FLOW-DESIGN.md §2/§3:
// reopenArtifact, the `reopened` status, and the `mode` field), used ONLY by
// this package's (inspector/mcp) tests. Agent T builds the REAL
// template/qa/lib/approvals.mjs against the same §3 contract in parallel;
// this fixture exists so the console's reopen tests don't depend on that
// landing first — mirrors fixture-comments-lib.mjs's role for the §7.3
// comments contract (see that file's header for the full rationale).
//
// This is deliberately NOT a full reimplementation of
// template/qa/lib/approvals.mjs's hashing/registry machinery (that's already
// covered against the REAL library elsewhere, e.g. approvals-bridge.test.mjs)
// — just enough surface (two fixed artifacts) to exercise every
// status/mode/reopen transition the console needs to render and POST.
//
// Contract surface exercised here (GENESIS-FLOW-DESIGN.md §3, binding):
//   getApprovalStatuses(root) -> Array<{id,label,status,hash,storedHash,
//     approvedAt,fileCount,missing,resolvable,mode?,reopenedAt?}>
//     status ∈ unreviewed | approved | changed-since-approval | reopened
//     mode ∈ undefined | "defaults-accepted"
//   approveArtifact(root, id) -> {ok:true,artifact,hash,approvedAt} | {ok:false,reason}
//   reopenArtifact(root, id) -> {ok:true, artifact} | {ok:false, reason}
//     — refuses unknown ids and non-approved states (recording reopenedAt).

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const REL_PATH = "qa/approvals.json";
const SCHEMA = "cmp-approvals/1";

// Two fixed, always-resolvable artifacts — enough to exercise transitions
// without reimplementing file-glob resolution.
const REGISTRY = [
  { id: "design-system", label: "Design system", files: ["a.txt"] },
  { id: "architecture", label: "Architecture", files: ["b.txt"] },
];

function load(root) {
  const p = path.join(root, REL_PATH);
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!parsed || !Array.isArray(parsed.artifacts)) return { artifacts: [] };
    return { artifacts: parsed.artifacts };
  } catch {
    return { artifacts: [] };
  }
}

function save(root, state) {
  const p = path.join(root, REL_PATH);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify({ schema: SCHEMA, artifacts: state.artifacts }, null, 2)}\n`);
}

function hashOf(root, artifact) {
  const h = createHash("sha256");
  for (const f of artifact.files) {
    const p = path.join(root, f);
    h.update(fs.existsSync(p) ? fs.readFileSync(p) : "");
  }
  return h.digest("hex");
}

export function getApprovalStatuses(root) {
  const state = load(root);
  const byId = new Map(state.artifacts.map((a) => [a.artifact, a]));
  return REGISTRY.map((artifact) => {
    const stored = byId.get(artifact.id);
    const hash = hashOf(root, artifact);
    if (!stored || stored.status !== "approved") {
      const reopened = stored && stored.status === "reopened";
      return {
        id: artifact.id,
        label: artifact.label,
        status: reopened ? "reopened" : "unreviewed",
        hash,
        storedHash: null,
        approvedAt: null,
        fileCount: artifact.files.length,
        missing: [],
        resolvable: true,
        ...(reopened ? { reopenedAt: stored.reopenedAt } : {}),
      };
    }
    const changed = stored.hash !== hash;
    return {
      id: artifact.id,
      label: artifact.label,
      status: changed ? "changed-since-approval" : "approved",
      hash,
      storedHash: stored.hash,
      approvedAt: stored.approvedAt,
      fileCount: artifact.files.length,
      missing: [],
      resolvable: true,
      ...(stored.mode ? { mode: stored.mode } : {}),
    };
  });
}

export function approveArtifact(root, artifactId) {
  const artifact = REGISTRY.find((a) => a.id === artifactId);
  if (!artifact) {
    const known = REGISTRY.map((a) => a.id).join(", ");
    return { ok: false, reason: `unknown artifact "${artifactId}" — valid ids: ${known}` };
  }
  const hash = hashOf(root, artifact);
  const state = load(root);
  const others = state.artifacts.filter((a) => a.artifact !== artifactId);
  const approvedAt = new Date().toISOString();
  others.push({ artifact: artifactId, status: "approved", hash, approvedAt });
  save(root, { artifacts: others });
  return { ok: true, artifact: artifactId, hash, approvedAt };
}

/**
 * Reopen an approved artifact for redesign (§2 "Reopen for redesign"):
 * refuses unknown ids and any artifact not currently `approved` (reopening
 * the unreviewed, already-reopened, or drifted is meaningless).
 */
export function reopenArtifact(root, artifactId) {
  const artifact = REGISTRY.find((a) => a.id === artifactId);
  if (!artifact) {
    const known = REGISTRY.map((a) => a.id).join(", ");
    return { ok: false, reason: `unknown artifact "${artifactId}" — valid ids: ${known}` };
  }
  const state = load(root);
  const rec = state.artifacts.find((a) => a.artifact === artifactId);
  if (!rec || rec.status !== "approved") {
    return {
      ok: false,
      reason: `cannot reopen "${artifactId}" — it is not currently approved (reopening the unreviewed is meaningless)`,
    };
  }
  rec.status = "reopened";
  rec.reopenedAt = new Date().toISOString();
  delete rec.mode;
  save(root, state);
  return { ok: true, artifact: artifactId };
}
