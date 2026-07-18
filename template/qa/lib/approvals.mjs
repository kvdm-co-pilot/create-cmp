// The hash-bound human-approval data model (VERIFICATION-LAYER-DESIGN.md §2).
//
// Reuses ADR-0005's philosophy exactly (docs/adr/0005-evidence-binding-by-inputs-hash.md
// in the create-cmp repo): an approval is valid iff a stored content hash matches a
// recompute of the SAME files, right now. No new hashing idea — just applied to a
// smaller, human-curated surface (one governed artifact) instead of the whole
// verified tree.
//
// Three concerns, kept separable:
//   1. The REGISTRY (`listGovernedArtifacts`) — artifact id -> resolved file list.
//      Static artifacts (design-system, architecture, exemplar-feature, exemplar-spec)
//      plus a DYNAMIC one (`feature-spec:<name>`) per non-base, non-home spec file
//      present in specs/ right now. The registry is recomputed on every call — it
//      reflects the tree as it stands, never a stale snapshot.
//   2. STATE (`loadApprovals`/`saveApprovals`) — qa/approvals.json, the human's
//      decisions: { artifact, status, hash, approvedAt }. Absent or corrupt is
//      TOLERATED (treated as empty / all-unreviewed) — this ledger must never crash
//      the verify lane or the stamper.
//   3. The GATE (`evaluateApprovalsGate`) — combines registry + state into one
//      per-artifact status (unreviewed / approved / changed-since-approval) and one
//      aggregate verdict (PASS/FAIL/SKIP) for the verify-lane step to report.
//
// Consumers: qa/approve.mjs (the CLI — thin shell over this file), qa/verify.mjs
// (the `approvals` gate), qa/scaffold-feature.mjs (seeds a new feature's spec as
// unreviewed). The future console (design doc §4) calls this same library.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const APPROVALS_REL_PATH = "qa/approvals.json";
export const APPROVALS_SCHEMA = "cmp-approvals/1";

// Kotlin source-set roots, relative to project root — mirrors qa/scaffold-feature.mjs's
// SRC() helper (composeApp/src/<sourceSet>/kotlin/<packageDir>).
const KOTLIN_SOURCE_SETS = {
  commonMain: "composeApp/src/commonMain/kotlin",
  commonTest: "composeApp/src/commonTest/kotlin",
  desktopTest: "composeApp/src/desktopTest/kotlin",
};

// The exemplar `home` feature's OWN 11 files — the `from` side of every entry in
// qa/scaffold-feature.mjs's ALL_FILES (:209-221), i.e. the exact file set the
// stamper clones FROM. Kept as a flat sourceSet+rel list (not yet package-resolved)
// so it works against ANY generated project's package.
//
// DRIFT GUARD: test/approvals-exemplar-list.test.mjs regex-extracts ALL_FILES'
// `from:` entries out of the stamper's source and asserts they match this list
// exactly. scaffold-feature.mjs is a script with top-level side effects (argument
// parsing, `die()`/`process.exit`) and is not safely importable, so the guard
// parses its source rather than forking a second copy of the list silently.
// Edit BOTH sides together — the test fails loudly if they diverge.
export const EXEMPLAR_FEATURE_KOTLIN_FILES = [
  { sourceSet: "commonMain", rel: "domain/model/Item.kt" },
  { sourceSet: "commonMain", rel: "domain/repository/ItemRepository.kt" },
  { sourceSet: "commonMain", rel: "domain/usecase/GetItemsUseCase.kt" },
  { sourceSet: "commonMain", rel: "data/remote/ItemRepositoryImpl.kt" },
  { sourceSet: "commonTest", rel: "testing/fakes/FakeItemRepository.kt" },
  { sourceSet: "commonMain", rel: "presentation/home/HomeScreen.kt" },
  { sourceSet: "commonMain", rel: "presentation/home/HomeViewModel.kt" },
  { sourceSet: "commonTest", rel: "presentation/home/HomeViewModelTest.kt" },
  { sourceSet: "desktopTest", rel: "presentation/home/HomeScreenTest.kt" },
  { sourceSet: "desktopTest", rel: "presentation/home/HomeGoldenTreeTest.kt" },
];
export const EXEMPLAR_SPEC_REL = "specs/home.spec.md";
export const ARCHITECTURE_SPEC_REL = "specs/app-base.spec.md";

// ── Package resolution ───────────────────────────────────────────────────────
// Mirrors qa/scaffold-feature.mjs's resolvePackage() primary path (the
// composeApp/build.gradle.kts namespace). Unlike the stamper, this NEVER dies —
// an unresolved package means the kotlin-rooted artifacts resolve to zero files.
// Zero resolution never CRASHES anything (the lane and the stamper stay up),
// but it is NOT benign for decisions: an approval over zero files would be the
// empty-input sha256 attesting nothing — a silent vacuous PASS, the exact
// failure mode this harness exists to kill (evidence must attest execution).
// So: approveArtifact REFUSES zero-file artifacts, and an already-approved
// artifact whose files stop resolving goes to changed-since-approval (FAIL),
// never PASS.
//
// IMPORTANT: detect "unresolved" by TOKEN SHAPE (`/^__[A-Z_]+__$/`), never by
// comparing against the literal string "__PACKAGE__". This file ships through
// the SAME scaffold pipeline that resolves that token — a literal comparison
// string is itself blindly text-substituted at stamp time (`replaceContents`
// does a global `"__PACKAGE__" -> config.package` replace over every template
// file's content, this one included), which would silently rewrite the
// sentinel into the real package and make the check always fail. A shape
// regex never spells the token out, so the pipeline has nothing to match.
const UNRESOLVED_TOKEN_RE = /^__[A-Z_]+__$/;

function resolvePackageDir(root) {
  const gradleFile = path.join(root, "composeApp", "build.gradle.kts");
  if (!fs.existsSync(gradleFile)) return null;
  let contents;
  try {
    contents = fs.readFileSync(gradleFile, "utf8");
  } catch {
    return null;
  }
  const m = contents.match(/namespace\s*=\s*"([^"]+)"/);
  if (!m || UNRESOLVED_TOKEN_RE.test(m[1])) return null;
  return m[1].split(".").join("/");
}

function kotlinFile(root, sourceSet, rel) {
  const packageDir = resolvePackageDir(root);
  if (!packageDir) return null;
  return path.posix.join(KOTLIN_SOURCE_SETS[sourceSet], packageDir, rel);
}

/**
 * Is the project's package resolvable at all? False in the raw template (the
 * namespace is still a placeholder token) and in any pre-stamp tree — the tell
 * that this is not a generated project. The approve CLI refuses to WRITE
 * approvals in such a tree (recording decisions against a template pollutes
 * the template itself); read-only status remains available.
 * @param {string} root
 * @returns {boolean}
 */
export function isPackageResolvable(root) {
  return resolvePackageDir(root) !== null;
}

// ── Registry ─────────────────────────────────────────────────────────────────

/**
 * The governed-artifact registry, resolved against the project at `root` right
 * now (§1 order: design-system, architecture, exemplar-feature, exemplar-spec,
 * then one feature-spec:<name> per non-base, non-home spec present).
 *
 * `complete: false` marks an artifact whose kotlin-rooted files could NOT be
 * resolved (unresolvable package — raw template / pre-stamp tree). Such an
 * artifact's `files` list is empty or partial (spec files only), so hashing it
 * would attest nothing (or only a fraction) of what the artifact governs —
 * approveArtifact refuses it, and the status surfaces treat it as unresolvable.
 * @param {string} root absolute path to the project root
 * @returns {Array<{id: string, label: string, files: string[], complete: boolean}>}
 */
export function listGovernedArtifacts(root) {
  const artifacts = [];
  const packageResolved = resolvePackageDir(root) !== null;

  artifacts.push({
    id: "design-system",
    label: "Design system (presentation/theme/Theme.kt, Tokens.kt)",
    files: [
      kotlinFile(root, "commonMain", "presentation/theme/Theme.kt"),
      kotlinFile(root, "commonMain", "presentation/theme/Tokens.kt"),
    ].filter(Boolean),
    complete: packageResolved,
  });

  artifacts.push({
    id: "architecture",
    label: `Architecture + structure (${ARCHITECTURE_SPEC_REL})`,
    files: [ARCHITECTURE_SPEC_REL],
    complete: true,
  });

  artifacts.push({
    id: "exemplar-feature",
    label: "Exemplar feature (home — the 11-file set the stamper clones)",
    files: [
      ...EXEMPLAR_FEATURE_KOTLIN_FILES.map((f) => kotlinFile(root, f.sourceSet, f.rel)).filter(Boolean),
      EXEMPLAR_SPEC_REL,
    ],
    complete: packageResolved,
  });

  artifacts.push({
    id: "exemplar-spec",
    label: `Exemplar spec (${EXEMPLAR_SPEC_REL})`,
    files: [EXEMPLAR_SPEC_REL],
    complete: true,
  });

  const specsDir = path.join(root, "specs");
  if (fs.existsSync(specsDir)) {
    const featureSpecs = fs
      .readdirSync(specsDir)
      .filter((f) => f.endsWith(".spec.md") && f !== "app-base.spec.md" && f !== "home.spec.md")
      .sort((a, b) => a.localeCompare(b));
    for (const file of featureSpecs) {
      const name = file.slice(0, -".spec.md".length);
      artifacts.push({
        id: `feature-spec:${name}`,
        label: `Feature spec (specs/${file})`,
        files: [`specs/${file}`],
        complete: true,
      });
    }
  }

  return artifacts;
}

// ── Hashing (mirrors qa/lib/inputs-hash.mjs's computeInputsHash style) ───────

/**
 * sha256 over the sorted `(path, sha256(content))` list of `relFiles` that
 * currently exist under `root`. Deterministic; missing files are reported, not
 * fatal — the hash is simply over what's present.
 * @param {string} root
 * @param {string[]} relFiles
 * @returns {{ hash: string, fileCount: number, missing: string[] }}
 */
export function hashArtifactFiles(root, relFiles) {
  const files = [...new Set(relFiles)].sort((a, b) => a.localeCompare(b));
  const present = [];
  const missing = [];
  for (const relPath of files) {
    try {
      if (fs.statSync(path.join(root, relPath)).isFile()) {
        present.push(relPath);
        continue;
      }
    } catch {
      /* fall through to missing */
    }
    missing.push(relPath);
  }

  const overall = createHash("sha256");
  for (const relPath of present) {
    const bytes = fs.readFileSync(path.join(root, relPath));
    const fileSha = createHash("sha256").update(bytes).digest("hex");
    overall.update(`${relPath}\0${fileSha}\n`);
  }
  return { hash: overall.digest("hex"), fileCount: present.length, missing };
}

// ── State (qa/approvals.json) ─────────────────────────────────────────────────

/**
 * Load qa/approvals.json. Absent or corrupt (unparsable JSON, wrong shape) is
 * TOLERATED — returns the empty state, which resolves every artifact as
 * "unreviewed". Never throws.
 * @param {string} root
 * @returns {{ schema: string, artifacts: Array<{artifact: string, status: string, hash: (string|null), approvedAt: (string|null)}> }}
 */
export function loadApprovals(root) {
  const empty = { schema: APPROVALS_SCHEMA, artifacts: [] };
  const p = path.join(root, APPROVALS_REL_PATH);
  let raw;
  try {
    raw = fs.readFileSync(p, "utf8");
  } catch {
    return empty;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.artifacts)) return empty;
    return { schema: parsed.schema ?? APPROVALS_SCHEMA, artifacts: parsed.artifacts };
  } catch {
    return empty;
  }
}

/**
 * Write qa/approvals.json (deterministic key order, trailing newline).
 * @param {string} root
 * @param {{ artifacts: Array<object> }} state
 */
export function saveApprovals(root, state) {
  const p = path.join(root, APPROVALS_REL_PATH);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const out = { schema: APPROVALS_SCHEMA, artifacts: state.artifacts };
  fs.writeFileSync(p, `${JSON.stringify(out, null, 2)}\n`);
}

/**
 * Seed one artifact as unreviewed if it isn't already recorded. Idempotent —
 * a second call for the same id is a no-op. Used by qa/scaffold-feature.mjs to
 * seed a new feature's spec (create-if-missing, tolerant when absent — this
 * never throws, so a stamp is never blocked by the approvals ledger).
 * @param {string} root
 * @param {string} artifactId
 * @returns {{ added: boolean }}
 */
export function seedUnreviewed(root, artifactId) {
  const state = loadApprovals(root);
  if (state.artifacts.some((a) => a.artifact === artifactId)) return { added: false };
  state.artifacts.push({ artifact: artifactId, status: "unreviewed", hash: null, approvedAt: null });
  saveApprovals(root, state);
  return { added: true };
}

// ── Status resolution ─────────────────────────────────────────────────────────

function shortHash(hash) {
  return hash ? hash.slice(0, 8) : "none";
}

/**
 * Resolve one artifact's live status: recompute its hash now and compare
 * against the stored record (if any).
 * - no stored record, or stored status !== "approved" -> "unreviewed"
 * - approved + hash still matches (over >0 files) -> "approved"
 * - approved + hash no longer matches -> "changed-since-approval"
 * - approved + artifact NOW unresolvable (0 files, or an incomplete kotlin
 *   file set) -> "changed-since-approval", UNCONDITIONALLY — even if the
 *   stored hash equals the recompute (a hand-written or legacy vacuous
 *   approval over the degraded set). An approval that covers none (or only a
 *   fraction) of what the artifact governs attests nothing and must never
 *   read as PASS.
 * `resolvable` is false when the artifact resolves to 0 files right now OR its
 * file set is incomplete (kotlin roots unresolvable — see listGovernedArtifacts).
 * @returns {{id: string, label: string, status: string, hash: string, storedHash: (string|null), approvedAt: (string|null), fileCount: number, missing: string[], resolvable: boolean}}
 */
export function resolveArtifactStatus(root, artifact, storedRecord) {
  const recomputed = hashArtifactFiles(root, artifact.files);
  const resolvable = recomputed.fileCount > 0 && artifact.complete !== false;
  if (!storedRecord || storedRecord.status !== "approved") {
    return {
      id: artifact.id,
      label: artifact.label,
      status: "unreviewed",
      hash: recomputed.hash,
      storedHash: null,
      approvedAt: null,
      fileCount: recomputed.fileCount,
      missing: recomputed.missing,
      resolvable,
    };
  }
  const changed = !resolvable || storedRecord.hash !== recomputed.hash;
  return {
    id: artifact.id,
    label: artifact.label,
    status: changed ? "changed-since-approval" : "approved",
    hash: recomputed.hash,
    storedHash: storedRecord.hash,
    approvedAt: storedRecord.approvedAt,
    fileCount: recomputed.fileCount,
    missing: recomputed.missing,
    resolvable,
  };
}

/**
 * Every governed artifact's live status, right now.
 * @param {string} root
 * @returns {Array<ReturnType<typeof resolveArtifactStatus>>}
 */
export function getApprovalStatuses(root) {
  const registry = listGovernedArtifacts(root);
  const state = loadApprovals(root);
  const byId = new Map(state.artifacts.map((a) => [a.artifact, a]));
  return registry.map((artifact) => resolveArtifactStatus(root, artifact, byId.get(artifact.id)));
}

// ── Transitions ────────────────────────────────────────────────────────────────

/**
 * Record an approval: recompute the artifact's hash now, stamp the time,
 * upsert into qa/approvals.json.
 *
 * REFUSES an unresolvable artifact — one that resolves to 0 files, or whose
 * kotlin-rooted file set could not be resolved at all (`complete: false`). An
 * approval over 0 files would record the empty-input sha256; an approval over
 * a partial set would attest only a fraction of what the artifact governs.
 * Both are silently vacuous — the exact failure mode this harness exists to
 * kill (evidence must attest execution). Refusal cases: the project package is
 * unresolvable (raw template / pre-stamp tree), or the artifact's expected
 * files are all missing on disk.
 * @param {string} root
 * @param {string} artifactId
 * @returns {{ok: true, artifact: string, hash: string, approvedAt: string} | {ok: false, reason: string}}
 */
export function approveArtifact(root, artifactId) {
  const registry = listGovernedArtifacts(root);
  const artifact = registry.find((a) => a.id === artifactId);
  if (!artifact) {
    const known = registry.map((a) => a.id).join(", ") || "(none — no governed artifacts resolved in this project)";
    return { ok: false, reason: `unknown artifact "${artifactId}" — valid ids: ${known}` };
  }
  const resolved = hashArtifactFiles(root, artifact.files);
  if (artifact.complete === false) {
    return {
      ok: false,
      reason:
        `cannot approve "${artifactId}" — its file set cannot be fully resolved: the kotlin-rooted files are unresolvable because ` +
        "the project package is not resolvable from composeApp/build.gradle.kts (likely the raw template or a pre-stamp tree — " +
        `run this in a generated project); only ${resolved.fileCount} file(s) resolved. ` +
        "A partial or empty approval is vacuous (it attests nothing for the unresolved files) and is refused.",
    };
  }
  if (resolved.fileCount === 0) {
    return {
      ok: false,
      reason:
        `cannot approve "${artifactId}" — it resolves to 0 files; its expected files are all missing on disk: ` +
        `${artifact.files.join(", ")}. An approval over zero files is vacuous (the empty-input hash attests nothing) and is refused.`,
    };
  }
  const state = loadApprovals(root);
  const others = state.artifacts.filter((a) => a.artifact !== artifactId);
  const approvedAt = new Date().toISOString();
  others.push({ artifact: artifactId, status: "approved", hash: resolved.hash, approvedAt });
  saveApprovals(root, { artifacts: others });
  return { ok: true, artifact: artifactId, hash: resolved.hash, approvedAt };
}

// ── The verify-lane gate ─────────────────────────────────────────────────────

/**
 * The `approvals` verify-lane gate's pure decision function (qa/verify.mjs
 * wraps this in the step's name/duration bookkeeping — same split as
 * compareTokenDrift/qa/lib/token-drift.mjs).
 *
 * Aggregate verdict:
 *   - any artifact "changed-since-approval" -> FAIL (names each + the re-approval command)
 *   - else any artifact "unreviewed"        -> SKIP (warns, non-blocking)
 *   - else (all approved + matching)        -> PASS
 * @param {string} root
 * @returns {{verdict: "PASS"|"FAIL"|"SKIP", reason: (string|undefined), statuses: Array<object>}}
 */
export function evaluateApprovalsGate(root) {
  const statuses = getApprovalStatuses(root);
  const mismatched = statuses.filter((s) => s.status === "changed-since-approval");
  const unreviewed = statuses.filter((s) => s.status === "unreviewed");

  if (mismatched.length > 0) {
    const lines = ["Approval invalidated — a governed artifact changed after sign-off:"];
    for (const s of mismatched) {
      if (!s.resolvable) {
        lines.push(
          `  [${s.id}] ${s.label} — approved at ${shortHash(s.storedHash)}, but its files no longer fully resolve (${s.fileCount} present — deleted or unresolvable). Restore the files, then re-approve if the change was intended (approval over an unresolved file set is refused).`,
        );
      } else {
        lines.push(
          `  [${s.id}] ${s.label} — approved at ${shortHash(s.storedHash)}, now ${shortHash(s.hash)}. Re-approve: node qa/approve.mjs ${s.id}`,
        );
      }
    }
    return { verdict: "FAIL", reason: lines.join("\n"), statuses };
  }

  if (unreviewed.length > 0) {
    const lines = ["Governed artifacts awaiting human approval (non-blocking — approve when ready):"];
    for (const s of unreviewed) {
      if (!s.resolvable) {
        lines.push(`  [${s.id}] ${s.label} — unreviewed, currently unresolvable (${s.fileCount} of expected files resolved) — not approvable in this tree.`);
      } else {
        lines.push(`  [${s.id}] ${s.label} — unreviewed. Approve: node qa/approve.mjs ${s.id}`);
      }
    }
    return { verdict: "SKIP", reason: lines.join("\n"), statuses };
  }

  return { verdict: "PASS", reason: undefined, statuses };
}
