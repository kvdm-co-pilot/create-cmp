// The declared suite's second reporter: it prints nothing and records the run.
//
// Wired in package.json's `test` script beside `spec`, so it runs exactly when the
// DECLARED suite runs — `npm test`, `prepublishOnly`, CI — and never for a targeted
// `node --test <file>`, which is not the suite and must not be recorded as one.
// Why the record exists: scripts/suite-record.mjs.
//
// It hashes the tree when the runner loads it and again when the stream ends. A
// tree that moved in between (an edit landed mid-run) gets a record with no hash:
// it describes no single tree, and every reader treats it as such.
//
// `PROOFLANE_SUITE_ROOT` points it at another root, which only a test does.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { REPO_ROOT, SUITE_SCHEMA, suiteRecordPath, suiteTreeHash } from "./suite-record.mjs";
import { appendHistory, historyPath } from "./lib/proof-history.mjs";

const COUNTS = ["tests", "suites", "pass", "fail", "cancelled", "skipped", "todo"];

/** Reduce the runner's event stream to a record. Exported for a test that feeds synthetic events. */
export async function recordRun(source, { root = REPO_ROOT, startedAt = new Date(), hashAtStart = suiteTreeHash(root), clock = () => new Date() } = {}) {
  const counts = {};
  const failing = new Set();
  for await (const ev of source) {
    if (ev?.type === "test:diagnostic" && ev.data?.nesting === 0) {
      const m = /^([a-z_]+) (\d+(?:\.\d+)?)$/.exec(String(ev.data.message ?? ""));
      if (m && COUNTS.includes(m[1])) counts[m[1]] = Number(m[2]);
    }
    if (ev?.type === "test:fail" && ev.data?.details?.type !== "suite" && failing.size < 50) failing.add(String(ev.data?.name ?? "?"));
  }
  const ended = clock();
  const hashAtEnd = suiteTreeHash(root);
  const git = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
  const head = git(["rev-parse", "HEAD"]);
  const branch = git(["branch", "--show-current"]);
  const summarised = typeof counts.tests === "number" && typeof counts.fail === "number";
  const record = {
    schema: SUITE_SCHEMA,
    startedAt: startedAt.toISOString(),
    ranAt: ended.toISOString(),
    durationMs: ended - startedAt,
    node: process.version,
    // A run whose tree moved describes no tree; a run with no summary did not finish.
    observedHash: hashAtStart && hashAtStart === hashAtEnd ? hashAtStart : null,
    treeMovedDuringRun: Boolean(hashAtStart && hashAtEnd && hashAtStart !== hashAtEnd),
    verdict: !summarised ? "INCOMPLETE" : counts.fail > 0 || (counts.cancelled ?? 0) > 0 ? "FAIL" : "PASS",
    counts,
    failing: [...failing],
    commit: head.status === 0 ? head.stdout.trim() : null,
  };
  try {
    fs.mkdirSync(path.dirname(suiteRecordPath(root)), { recursive: true });
    fs.writeFileSync(suiteRecordPath(root), `${JSON.stringify(record, null, 2)}\n`);
  } catch {
    // Bookkeeping never fails a gate — the suite's own exit code is the verdict.
  }
  appendHistory(historyPath(root, "suite"), { ...record, branch: branch.status === 0 ? branch.stdout.trim() || null : null });
  return record;
}

export default async function* suiteReporter(source) {
  const root = process.env.PROOFLANE_SUITE_ROOT || REPO_ROOT;
  await recordRun(source, { root, startedAt: new Date(), hashAtStart: suiteTreeHash(root) });
}
