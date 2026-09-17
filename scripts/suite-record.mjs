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
// lints), built bundles (the inspector's freshness guard) and `git ls-files`
// itself. The device and review hashes skip markdown, dot-entries and `dist/` on
// purpose; a suite hash that skipped them would call a record fresh after an edit
// a doc lint fails on. Tracked plus untracked-not-ignored files is exactly the
// working tree a test run sees. When git cannot answer, there is no hash, and a
// record without one describes no tree.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SUITE_SCHEMA = "prooflane-suite-run/1";

export const suiteRecordPath = (root = REPO_ROOT) => path.join(root, "qa-artifacts", "suite-latest.json");

/**
 * sha256 over every file the working tree shows git — tracked, plus untracked and
 * not ignored — by path and content. `null` when git cannot list the tree.
 */
export function suiteTreeHash(root = REPO_ROOT) {
  const ls = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (ls.status !== 0) return null;
  const files = [...new Set(ls.stdout.split("\0").filter(Boolean))].sort();
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
 *   fresh       same bytes, same Node, and the tree did not move under the run
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
    default:
      return "no run is recorded for this tree — run npm test";
  }
}
