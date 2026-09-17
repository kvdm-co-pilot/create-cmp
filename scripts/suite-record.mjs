// A GREEN SUITE WAS RUN AGAIN BECAUSE NOTHING RECORDED IT.
//
// `npm test` printed its verdict to a terminal and kept nothing, so every reader
// that needed it ran it again. Measured from this repo's own sessions
// (docs/research/g2-measure/, 2026-09-07 → 09-17): 295 full-suite runs, 4.6 to 6.6
// per merged change, 4.5 hours; `scripts/fit-test.mjs` re-ran the suite the author
// had just run, and reviewers spent 4–8% of their time re-establishing a baseline
// the author already had. The fleet record solved the same problem for the device
// tier on 2026-09-06 — "a sentence a human typed with nothing behind it" — and the
// suite never got the same treatment.
//
// So the declared suite records itself: `npm test` runs a second reporter
// (scripts/suite-reporter.mjs) that writes what the run found, bound to the bytes
// it ran over. A reader that finds a PASS for THIS tree, on THIS Node, reads it
// instead of spending a minute re-deriving it; any other record is named for what
// it is (stale, moved, another Node) and the reader runs the suite as before.
//
// WHY A GIT VIEW OF THE TREE, and not `observed-tree.mjs`'s walk. The suite can
// observe everything the tests can read, and the tests read markdown (the doc
// lints), built bundles (the inspector's freshness guard), `git ls-files` itself,
// and at least one gitignored file (KD-62). The device and review hashes skip
// markdown, dot-entries and `dist/` on purpose; a suite hash that skipped them
// would call a record fresh after an edit a doc lint fails on. So the hash is
// everything git can list — tracked, untracked, ignored — minus generated output
// (SUITE_HASH_SKIP), and it errs toward re-running. When git cannot answer, there
// is no hash, and a record without one describes no tree.
//
// AND ONLY THE DECLARED SUITE SPEAKS FOR A TREE. A run narrowed by a name pattern,
// `--test-only`, or fewer files than package.json declares is recorded as such and
// never read as the suite's verdict (KD-61).
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SUITE_SCHEMA = "prooflane-suite-run/1";

export const suiteRecordPath = (root = REPO_ROOT) => path.join(root, "qa-artifacts", "suite-latest.json");

/**
 * What a test can read and this hash deliberately does not see: generated output
 * and machine-local noise. Everything ELSE on disk is hashed — ignored files
 * included, because a test reads at least one (KD-62: test/ground-truth-derivation
 * reads the gitignored docs/research/launch/GROUND-TRUTH.md when it exists). A
 * directory missing from this list costs a re-run, never a false "fresh".
 */
export const SUITE_HASH_SKIP = /(^|\/)(node_modules|build|out|\.gradle|\.kotlin|qa-artifacts)(\/|$)|^\.claude\/(worktrees\/|settings\.local\.json$)|(^|\/)\.DS_Store$/;

/**
 * sha256 over every file the suite could read — tracked, untracked, and ignored
 * minus SUITE_HASH_SKIP — by path and content. `null` when git cannot list the tree.
 */
export function suiteTreeHash(root = REPO_ROOT) {
  const list = (args) => spawnSync("git", ["ls-files", "-z", ...args], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const seen = list(["--cached", "--others", "--exclude-standard"]);
  const ignored = list(["--others", "--ignored", "--exclude-standard"]);
  if (seen.status !== 0 || ignored.status !== 0) return null;
  const files = [...new Set([...seen.stdout.split("\0"), ...ignored.stdout.split("\0")].filter((p) => p && !SUITE_HASH_SKIP.test(p)))].sort();
  const outer = createHash("sha256");
  for (const rel of files) {
    let digest;
    try {
      digest = createHash("sha256").update(fs.readFileSync(path.join(root, rel))).digest("hex");
    } catch {
      // Listed but gone (a deletion not yet staged): its absence is part of the tree.
      digest = "absent";
    }
    outer.update(`${rel}\n${digest}\n`);
  }
  return outer.digest("hex");
}

export function readSuiteRecord(root = REPO_ROOT) {
  try {
    const r = JSON.parse(fs.readFileSync(suiteRecordPath(root), "utf8"));
    return r && r.schema === SUITE_SCHEMA ? r : null;
  } catch {
    return null;
  }
}

/**
 * Does a recorded run speak for this tree, on this Node?
 *
 *   fresh       the declared suite, finished, over the same bytes, on the same Node,
 *               and the tree did not move under the run
 *   narrowed    not the whole declared suite (a name pattern, --test-only, fewer files)
 *   incomplete  the run ended without its summary
 *   stale       the bytes changed since the run
 *   moved       the tree changed WHILE it ran, so it describes no single tree
 *   other-node  same bytes, different Node — the suite's counts are Node-dependent
 *               (KD-57: Node 20 reported nine fewer tests than 22 and 24)
 *   absent      no record, or git could not hash the tree
 *
 * Pure apart from the hash, which is passed in for tests.
 */
export function suiteStatus({ record = readSuiteRecord(), now = suiteTreeHash(), node = process.version } = {}) {
  if (!record || !now) return { state: "absent", record: record ?? null, now: now ?? null };
  // Not the declared suite, or not a finished run of it: neither speaks for a tree,
  // whatever it passed (KD-61 — a name pattern in NODE_OPTIONS recorded "PASS 1/1").
  if (record.scope !== "declared") return { state: "narrowed", record, now };
  if (record.verdict !== "PASS" && record.verdict !== "FAIL") return { state: "incomplete", record, now };
  if (!record.observedHash) return { state: "moved", record, now };
  if (record.observedHash !== now) return { state: "stale", record, now };
  if (record.node !== node) return { state: "other-node", record, now };
  return { state: "fresh", record, now };
}

/** The one-line account a reader prints. */
export function describeSuiteStatus(s) {
  const r = s.record;
  const counts = r?.counts ? `${r.counts.pass}/${r.counts.tests}${r.counts.fail ? `, ${r.counts.fail} failing` : ""}` : "";
  switch (s.state) {
    case "fresh":
      return `${r.verdict} ${counts} recorded ${String(r.ranAt).slice(0, 16)} for this exact tree — read it, do not re-run it`;
    case "stale":
      return `the recorded run (${r.verdict} ${counts}, ${String(r.ranAt).slice(0, 16)}) describes another tree — run npm test`;
    case "moved":
      return "the tree changed while the last run was in flight, so its record describes no tree — run npm test";
    case "other-node":
      return `recorded on Node ${r.node}, this is ${process.version} — the counts are Node-dependent; run npm test`;
    case "narrowed":
      return `the last run was narrowed (${(r.narrowedBy ?? []).join("; ") || "not the declared suite"}), so it speaks for no tree — run npm test`;
    case "incomplete":
      return `the last run did not finish (${r.verdict}) — run npm test`;
    default:
      return "no run is recorded for this tree — run npm test";
  }
}
