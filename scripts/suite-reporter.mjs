// The declared suite's second reporter: it prints nothing and records the run.
//
// Wired in package.json's `test` script beside `spec`, so it runs when `npm test`
// (and `prepublishOnly`, and CI) runs the declared suite. Why the record exists:
// scripts/suite-record.mjs.
//
// Two things it checks rather than assumes:
//   - WHICH TREE. It hashes the tree when the runner loads it and again when the
//     stream ends; a tree that moved in between gets a record with no hash.
//   - WHETHER THIS IS THE SUITE. A reporter wired into `npm test` still runs when
//     `NODE_OPTIONS=--test-name-pattern=…` narrows that same command to one test
//     (KD-61, found by review: it recorded "PASS 1/1" as the suite). So the run's
//     own flags and file operands are compared with what package.json declares,
//     and anything less is recorded `scope: "narrowed"` with the reasons.
//
// `PROOFLANE_SUITE_ROOT` points it at another root, which only a test does.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { REPO_ROOT, SUITE_SCHEMA, suiteRecordPath, suiteTreeHash } from "./suite-record.mjs";
import { appendHistory, historyPath } from "./lib/proof-history.mjs";

const COUNTS = ["tests", "suites", "pass", "fail", "cancelled", "skipped", "todo"];
const NARROWING_FLAG = /^--test-(name-pattern|skip-pattern|only|shard)(=|$)/;

/**
 * The files `npm test` declares, expanded by the shell exactly as npm's shell
 * expands them — so this is not a second glob translation. `null` when there is
 * no `node --test` script, or it holds a token this will not hand to a shell.
 */
export function declaredSuiteFiles(root = REPO_ROOT) {
  let script;
  try {
    script = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts?.test;
  } catch {
    return null;
  }
  if (typeof script !== "string" || !/^node --test\s/.test(script)) return null;
  const patterns = script.replace(/^node --test\s+/, "").split(/\s+/).filter((t) => t && !t.startsWith("-"));
  if (!patterns.length || patterns.some((p) => !/^[\w./*-]+$/.test(p))) return null;
  const r = spawnSync("sh", ["-c", `for f in ${patterns.join(" ")}; do [ -f "$f" ] && printf '%s\\n' "$f"; done; true`], { cwd: root, encoding: "utf8" });
  if (r.status !== 0) return null;
  return r.stdout.split("\n").filter(Boolean);
}

/** Why this run is not the whole declared suite — [] when it is. */
export function narrowing({ root = REPO_ROOT, cwd = process.cwd(), execArgv = process.execArgv, nodeOptions = process.env.NODE_OPTIONS ?? "", argvFiles = process.argv.slice(1) } = {}) {
  const reasons = [];
  for (const flag of [...execArgv, ...nodeOptions.split(/\s+/).filter(Boolean)]) {
    if (NARROWING_FLAG.test(flag)) reasons.push(`runner flag ${flag}`);
  }
  const declared = declaredSuiteFiles(root);
  if (declared === null) {
    reasons.push("no declared suite in package.json to compare this run against");
  } else {
    // Real paths on both sides: a root under macOS's /var is /private/var to the
    // runner's cwd, and two spellings of one file must not read as a missing file.
    const real = (p) => {
      try {
        return fs.realpathSync(p);
      } catch {
        return path.resolve(p);
      }
    };
    const ran = new Set(argvFiles.map((f) => real(path.resolve(cwd, f))));
    const missing = declared.filter((f) => !ran.has(real(path.resolve(root, f))));
    if (missing.length) reasons.push(`${missing.length} declared test file(s) did not run, e.g. ${missing[0]}`);
  }
  return reasons;
}

/** Reduce the runner's event stream to a record. Exported for a test that feeds synthetic events. */
export async function recordRun(source, { root = REPO_ROOT, startedAt = new Date(), hashAtStart = suiteTreeHash(root), clock = () => new Date(), narrowedBy = [] } = {}) {
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
    scope: narrowedBy.length ? "narrowed" : "declared",
    narrowedBy,
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
  await recordRun(source, { root, startedAt: new Date(), hashAtStart: suiteTreeHash(root), narrowedBy: narrowing({ root }) });
}
