// approval-diff.mjs — B5: when a governed artifact is `changed-since-approval`,
// show the human the diff AGAINST THE APPROVED BYTES, not just a red chip.
//
// The ledger stores a hash, not a snapshot — deliberately. So the approved
// bytes are LOCATED, not stored: walk recent history, materialize each
// commit's artifact files into a temp root, and hash them with the PROJECT'S
// OWN approvals library (dynamically imported — never a forked hash
// definition, including the architecture artifact's stripped-sections basis).
// The newest commit whose hash equals the stored hash is the approval anchor;
// `git diff <anchor> -- <files>` is then the exact drift the chip is about.
//
// Honesty on failure: if no commit in the window matches (the approval was
// recorded against uncommitted files, or history is deeper than the search),
// the result SAYS that — never a guessed diff against "roughly then".

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SEARCH_DEPTH = 120; // commits per artifact — bounded so the console stays responsive
const MAX_DIFF_LINES = 400;

async function importProjectApprovals(projectDir) {
  const lib = path.join(projectDir, "qa", "lib", "approvals.mjs");
  if (!fs.existsSync(lib)) return null;
  try {
    return await import(pathToFileURL(lib).href);
  } catch {
    return null;
  }
}

/** Materialize `relFiles` as of `sha` under a temp root; returns the temp root (caller cleans). */
async function materialize(git, sha, relFiles, alsoNeeded) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-approval-anchor-"));
  for (const rel of [...relFiles, ...alsoNeeded]) {
    try {
      const { stdout } = await git(["show", `${sha}:${rel}`]);
      const dest = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, stdout);
    } catch {
      /* file absent at that commit — hashArtifactFiles treats it as missing, correctly */
    }
  }
  return tmp;
}

/**
 * @returns {Promise<{available: boolean, reason?: string, anchorSha?: string,
 *   anchorWhen?: string, diff?: string, truncated?: boolean}>}
 */
export async function getApprovalAnchoredDiff(projectDir, artifactId, { execFileAsync } = {}) {
  const git = (args) =>
    execFileAsync("git", args, { cwd: projectDir, timeout: 10_000, maxBuffer: 16 * 1024 * 1024 });

  const lib = await importProjectApprovals(projectDir);
  if (!lib) return { available: false, reason: "project approvals library not importable" };

  const artifacts = lib.listGovernedArtifacts(projectDir);
  const artifact = artifacts.find((a) => a.id === artifactId);
  if (!artifact) return { available: false, reason: `unknown artifact ${artifactId}` };

  // The ledger's `artifacts` is an ARRAY of {artifact, status, hash, …} records
  // (cmp-approvals/1) — keyed lookup by the `artifact` field, not object access.
  const ledger = lib.loadApprovals(projectDir);
  const record = (ledger?.artifacts ?? []).find((r) => r.artifact === artifactId);
  const stored = record?.hash;
  if (!stored) return { available: false, reason: "no stored approval hash to anchor against" };

  // The architecture artifact's hash also reads the arch-doc module's marker
  // definitions; materialize the qa lib alongside so the import chain resolves
  // against the ANCHOR's own files. (Same-tree assumption: the lib rarely
  // changes shape; when it does, the honest-failure path below reports it.)
  const alsoNeeded = ["qa/lib/arch-doc.mjs"];

  let log;
  try {
    const { stdout } = await git(["log", `--max-count=${SEARCH_DEPTH}`, "--pretty=%H%x00%ci", "--", ...artifact.files]);
    log = stdout.split("\n").filter(Boolean).map((l) => l.split("\0"));
  } catch (err) {
    return { available: false, reason: `git log failed: ${err.message}` };
  }

  for (const [sha, when] of log) {
    let tmp = null;
    try {
      tmp = await materialize(git, sha, artifact.files, alsoNeeded);
      const h =
        artifact.id === "architecture"
          ? lib.hashArchitectureArtifact(tmp)
          : lib.hashArtifactFiles(tmp, artifact.files);
      if (h.hash === stored) {
        const { stdout: diff } = await git(["diff", sha, "--", ...artifact.files]);
        const lines = diff.split("\n");
        const truncated = lines.length > MAX_DIFF_LINES;
        return {
          available: true,
          anchorSha: sha.slice(0, 7),
          anchorWhen: when,
          diff: (truncated ? lines.slice(0, MAX_DIFF_LINES) : lines).join("\n"),
          truncated,
        };
      }
    } catch {
      /* a commit that can't be hashed is skipped, not fatal — keep searching */
    } finally {
      if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  return {
    available: false,
    reason:
      `no commit in the last ${SEARCH_DEPTH} touching this artifact matches the approved hash — ` +
      "the approval was likely recorded against uncommitted files. The chip is still correct; " +
      "only the anchored diff is unavailable.",
  };
}
