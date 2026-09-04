// The approvals REGISTRY is the profile's; the approvals MECHANIC is the core's.
//
// Stage 0 PR 5 (docs/NORTH-STAR.md §5–6; AGNOSTIC-HARNESS-ARCHITECTURE.md §3.4,
// §11.3 step 5). qa/lib/approvals.mjs used to hardcode mobile's six genesis
// artifacts with their Kotlin roots and namespace lookup. Now the profile the
// manifest names exports `artifacts(root)`, composed from the core's neutral
// helpers; the core keeps hashing, signatures, status derivation, reopen,
// accept and the gate — and applies them to whatever list it is handed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  approveArtifact,
  evaluateApprovalsGate,
  featureBriefArtifacts,
  featureDesignArtifacts,
  featureSpecArtifacts,
  getApprovalStatuses,
  hashArtifactFiles,
  isProjectGovernable,
  listGovernedArtifacts,
} from "../packages/harness/src/lib/approvals.mjs";
import { artifacts as cmpArtifacts, governable as cmpGovernable } from "../packages/harness/src/lib/profiles/cmp/index.mjs";
import { installHarnessLib } from "./helpers/harness-fixture.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SIGNER = "Ada Lovelace <ada@example.com>";

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function write(root, rel, text) {
  const abs = path.join(root, ...rel.split("/"));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text);
}
function stampedApp() {
  const base = tmp("profile-artifacts-app-");
  const dir = path.join(base, "ArtApp");
  const r = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, "bin", "create-cmp.mjs"), dir, "--yes", "--name", "ArtApp", "--package", "com.example.artapp", "--no-ios", "--no-firebase", "--no-verify"],
    { cwd: REPO_ROOT, encoding: "utf8", timeout: 60_000 },
  );
  if (r.status !== 0) throw new Error(`stamp failed: ${r.stdout}${r.stderr}`);
  return dir;
}

/**
 * A backend-shaped profile: two artifacts of its own, one with a custom
 * hasher (an OpenAPI contract hashed with its `info.version` line ignored —
 * the kind of "what the human signs" rule only a profile can know), plus the
 * core's brief and spec helpers.
 */
const BACKEND_PROFILE = `
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { featureBriefArtifacts, featureSpecArtifacts } from "../../approvals.mjs";
export const id = "ktor-backend";
export const protocol = 1;
export const layout = { specs: "specs", citationRoots: ["services"], citationExts: [".kt"], flows: null };
export const tiers = { names: ["unit", "integration"], hostOnly: ["unit"], satisfying: { integration: ["integration"] }, journey: null, forFile: () => "unit" };
export function steps() { return { stepsForProfile: {} }; }
export function governable(root) { return fs.existsSync(path.join(root, "api")) ? { ok: true } : { ok: false, reason: "no api/ directory — not a backend service" }; }
export function artifacts(root) {
  return [
    { id: "context-map", label: "Bounded contexts (docs/CONTEXTS.md)", files: ["docs/CONTEXTS.md"], complete: true },
    ...featureBriefArtifacts(root),
    {
      id: "api-contract", label: "OpenAPI contract (api/openapi.yaml)", files: ["api/openapi.yaml"], complete: true,
      hash: (r) => {
        let text = "";
        try { text = fs.readFileSync(path.join(r, "api", "openapi.yaml"), "utf8"); } catch { return { hash: createHash("sha256").digest("hex"), fileCount: 0, missing: ["api/openapi.yaml"] }; }
        const stripped = text.split("\\n").filter((l) => !/^\\s*version:/.test(l)).join("\\n");
        return { hash: createHash("sha256").update(stripped).digest("hex"), fileCount: 1, missing: [] };
      },
    },
    ...featureSpecArtifacts(root, { specsDir: "specs", exclude: [] }),
  ];
}
`;

function backendProject() {
  const root = tmp("profile-artifacts-backend-");
  installHarnessLib(root);
  write(root, "qa/harness-manifest.json", JSON.stringify({ schema: "harness-manifest/2", profile: { id: "ktor-backend" } }));
  write(root, "qa/lib/profiles/ktor-backend/index.mjs", BACKEND_PROFILE);
  write(root, "docs/CONTEXTS.md", "# Contexts\n\n- payments\n");
  write(root, "api/openapi.yaml", "openapi: 3.1.0\ninfo:\n  title: Pay\n  version: 1.0.0\npaths: {}\n");
  write(root, "docs/features/refunds.md", "# refunds\n\n## Decisions\n\n- partial refunds are allowed.\n");
  write(root, "specs/refunds.spec.md", "- **RF-01** — Given a paid order, When refunded, Then the ledger balances.\n");
  return root;
}

test("the cmp profile's registry is the list the core used to hardcode, in definition order", () => {
  const dir = stampedApp();
  try {
    const ids = listGovernedArtifacts(dir).map((a) => a.id);
    assert.deepEqual(ids, ["intent", "architecture", "exemplar-spec", "exemplar-feature", "design-system", "components"], "a fresh scaffold: the six genesis artifacts, no briefs, no feature specs");
    assert.deepEqual(ids, cmpArtifacts(dir).map((a) => a.id), "the core hands back exactly what the profile returned");
    const arch = listGovernedArtifacts(dir).find((a) => a.id === "architecture");
    assert.equal(typeof arch.hash, "function", "the architecture artifact carries the profile's hasher (spec + stripped doc)");
    assert.deepEqual(arch.files, ["specs/app-base.spec.md", "docs/ARCHITECTURE.md"]);
    assert.deepEqual(cmpGovernable(dir), { ok: true });
    assert.deepEqual(isProjectGovernable(dir), { ok: true });
  } finally {
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  }
});

test("a backend-shaped profile: its own artifacts, its own hasher, the core's briefs and specs, the core's signatures and gate", () => {
  const root = backendProject();
  try {
    const reg = listGovernedArtifacts(root);
    assert.deepEqual(
      reg.map((a) => a.id),
      ["context-map", "feature-brief:refunds", "api-contract", "feature-spec:refunds"],
      "the profile's order, with the neutral entries where it put them",
    );
    assert.equal(isProjectGovernable(root).ok, true);

    // The core signs what the profile lists — and hashes it the profile's way.
    const signed = approveArtifact(root, "api-contract", { approvedBy: SIGNER });
    assert.equal(signed.ok, true, signed.reason);
    write(root, "api/openapi.yaml", "openapi: 3.1.0\ninfo:\n  title: Pay\n  version: 1.0.1\npaths: {}\n");
    assert.equal(getApprovalStatuses(root).find((s) => s.id === "api-contract").status, "approved", "a version bump is not a contract change — the profile's hasher said so");
    write(root, "api/openapi.yaml", "openapi: 3.1.0\ninfo:\n  title: Pay\n  version: 1.0.1\npaths:\n  /refunds: {}\n");
    assert.equal(getApprovalStatuses(root).find((s) => s.id === "api-contract").status, "changed-since-approval", "a new path IS a contract change");
    assert.equal(evaluateApprovalsGate(root).verdict, "FAIL");
    assert.match(evaluateApprovalsGate(root).reason, /api-contract/);

    // The brief is hashed by the core's rule even though the profile listed it.
    const brief = approveArtifact(root, "feature-brief:refunds", { approvedBy: SIGNER });
    assert.equal(brief.ok, true, brief.reason);
    write(root, "docs/features/refunds.md", "# refunds\n\n## Decisions\n\n- partial refunds are allowed.\n\n```json cmp:feature\n{ \"touches\": [] }\n```\n");
    assert.equal(getApprovalStatuses(root).find((s) => s.id === "feature-brief:refunds").status, "approved", "a declaration block never invalidates a signed brief — core rule, any profile");

    // Raw-file artifacts hash raw, exactly as before.
    const ctx = reg.find((a) => a.id === "context-map");
    assert.equal(typeof ctx.hash, "undefined");
    assert.equal(approveArtifact(root, "context-map", { approvedBy: SIGNER }).ok, true);
    assert.equal(getApprovalStatuses(root).find((s) => s.id === "context-map").hash, hashArtifactFiles(root, ["docs/CONTEXTS.md"]).hash);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the profile's governable(root) guards writes: a backend tree without api/ is refused by the profile's own reason", () => {
  const root = backendProject();
  try {
    fs.rmSync(path.join(root, "api"), { recursive: true, force: true });
    const v = isProjectGovernable(root);
    assert.equal(v.ok, false);
    assert.match(v.reason, /no api\/ directory/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a profile with no artifacts(root) still governs its briefs — the Decide layer is the loop's, not a stack's", () => {
  const root = tmp("profile-artifacts-floor-");
  try {
    installHarnessLib(root);
    write(root, "qa/harness-manifest.json", JSON.stringify({ schema: "harness-manifest/2", profile: { id: "bare" } }));
    write(
      root,
      "qa/lib/profiles/bare/index.mjs",
      'export const id = "bare";\nexport const protocol = 1;\nexport const layout = { specs: "specs", citationRoots: ["src"], citationExts: [".kt"], flows: null };\nexport const tiers = { names: ["unit"], hostOnly: ["unit"], satisfying: {}, journey: null, forFile: () => "unit" };\nexport function steps() { return {}; }\n',
    );
    write(root, "docs/features/thing.md", "# thing\n\n## Decisions\n\n- yes.\n");
    assert.deepEqual(listGovernedArtifacts(root).map((a) => a.id), ["feature-brief:thing"]);
    assert.equal(isProjectGovernable(root).ok, true, "no governable(root) means the core's floor: manifest + profile is enough");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("no manifest → the registry refuses by name; it never returns an empty list that looks governed", () => {
  const root = tmp("profile-artifacts-absent-");
  try {
    assert.throws(() => listGovernedArtifacts(root), /harness-manifest\.json is missing/);
    const v = isProjectGovernable(root);
    assert.equal(v.ok, false);
    assert.match(v.reason, /harness-manifest\.json is missing/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the neutral helpers are pure over a root: designs need a surface, specs honour the exclude list", () => {
  const root = tmp("profile-artifacts-helpers-");
  try {
    write(root, "docs/features/a.md", "# a\n\n```json cmp:feature\n{ \"screens\": true }\n```\n");
    write(root, "docs/features/b.md", "# b\n");
    write(root, "specs/base.spec.md", "- **B-01** — x.\n");
    write(root, "specs/a.spec.md", "- **A-01** — x.\n");
    assert.deepEqual(featureBriefArtifacts(root).map((a) => a.id), ["feature-brief:a", "feature-brief:b"]);
    const designs = featureDesignArtifacts(root, { surfaceFiles: (r, name) => (name === "b" ? ["svc/b/BScreen.kt"] : []), declares: (block) => block.screens === true });
    assert.deepEqual(designs.map((d) => [d.id, d.files, d.complete]), [
      ["feature-design:a", [], false],
      ["feature-design:b", ["svc/b/BScreen.kt"], true],
    ]);
    assert.deepEqual(featureSpecArtifacts(root, { exclude: ["base.spec.md"] }).map((a) => a.id), ["feature-spec:a"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
