// The fast-mode step cache (template/qa/lib/step-cache.mjs) — the memoization
// that lets `verify --fast` reuse a pure-Node step's PASS when a content hash
// of its declared inputs is unchanged.
//
// Contracts under test, with REAL files in REAL temp dirs (no fs mocking):
//   - hash stability: same paths + same bytes → same hash, independent of
//     declaration order; any content/path change → different hash
//   - cache hit iff last EXECUTED verdict was PASS and the hash matches
//   - a cached FAIL (or SKIP) is NEVER reused — always re-run
//   - memoizeStep in FULL mode never reads the cache (always executes), but
//     writes entries so the next fast run benefits
//   - corrupt/missing cache degrades to a miss, never an error
//   - the cache lands in the gitignored build dir (a CACHE, never evidence)

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  STEP_CACHE_REL_PATH,
  computeStepInputsHash,
  loadStepCache,
  lookupCachedPass,
  memoizeStep,
  writeStepCacheEntry,
} from "../template/qa/lib/step-cache.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "step-cache-engine-"));

function seed(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
}

test("hash stability: same tree hashes identically, independent of input declaration order", () => {
  const a = tmp();
  const b = tmp();
  const files = {
    "specs/home.spec.md": "- **HOME-01** — a clause\n",
    "composeApp/src/commonMain/kotlin/App.kt": "class App\n",
  };
  seed(a, files);
  seed(b, files);
  const ha = computeStepInputsHash(a, ["specs", "composeApp/src"]);
  const hb = computeStepInputsHash(b, ["composeApp/src", "specs"]); // reversed declaration order
  assert.equal(ha.hash, hb.hash);
  assert.equal(ha.fileCount, 2);
});

test("hash changes on byte change, file addition, and file rename; missing inputs are tolerated", () => {
  const root = tmp();
  seed(root, { "specs/home.spec.md": "one\n" });
  const inputs = ["specs", "docs/features"]; // docs/features does not exist — tolerated
  const base = computeStepInputsHash(root, inputs).hash;

  fs.writeFileSync(path.join(root, "specs/home.spec.md"), "two\n");
  const afterEdit = computeStepInputsHash(root, inputs).hash;
  assert.notEqual(afterEdit, base);

  seed(root, { "docs/features/tray.md": "# tray\n" }); // an absent input dir appearing changes the hash
  const afterAdd = computeStepInputsHash(root, inputs).hash;
  assert.notEqual(afterAdd, afterEdit);

  fs.renameSync(path.join(root, "docs/features/tray.md"), path.join(root, "docs/features/cart.md"));
  const afterRename = computeStepInputsHash(root, inputs).hash;
  assert.notEqual(afterRename, afterAdd);
});

test("cache hit iff verdict PASS and hash matches; FAIL and SKIP are never reused; mismatched hash misses", () => {
  const root = tmp();
  writeStepCacheEntry(root, "specCoverage", { inputsHash: "aaa", verdict: "PASS", at: "2026-08-19T00:00:00.000Z" });
  writeStepCacheEntry(root, "approvals", { inputsHash: "bbb", verdict: "FAIL" });
  writeStepCacheEntry(root, "archDoc", { inputsHash: "ccc", verdict: "SKIP" });

  const hit = lookupCachedPass(root, "specCoverage", "aaa");
  assert.ok(hit);
  assert.equal(hit.at, "2026-08-19T00:00:00.000Z");

  assert.equal(lookupCachedPass(root, "specCoverage", "zzz"), null); // hash mismatch
  assert.equal(lookupCachedPass(root, "approvals", "bbb"), null); // FAIL never reused
  assert.equal(lookupCachedPass(root, "archDoc", "ccc"), null); // SKIP never reused
  assert.equal(lookupCachedPass(root, "unknown", "aaa"), null); // no entry
});

test("corrupt or missing cache file degrades to empty — a miss, never an error", () => {
  const root = tmp();
  assert.deepEqual(loadStepCache(root).steps, {}); // missing

  const p = path.join(root, STEP_CACHE_REL_PATH);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, "{not json");
  assert.deepEqual(loadStepCache(root).steps, {}); // corrupt
  assert.equal(lookupCachedPass(root, "specCoverage", "aaa"), null);

  fs.writeFileSync(p, JSON.stringify({ schema: "some-other/1", steps: { x: { inputsHash: "a", verdict: "PASS", at: "t" } } }));
  assert.deepEqual(loadStepCache(root).steps, {}); // wrong schema id refused

  // a corrupt file is recoverable: the next write replaces it wholesale
  writeStepCacheEntry(root, "specCoverage", { inputsHash: "aaa", verdict: "PASS" });
  assert.ok(lookupCachedPass(root, "specCoverage", "aaa"));
});

test("memoizeStep fast mode: warm matching PASS returns CACHED without executing; cold executes and records", () => {
  const root = tmp();
  seed(root, { "specs/home.spec.md": "clause\n" });
  let runs = 0;
  const run = () => {
    runs += 1;
    return { name: "specCoverage", verdict: "PASS", durationMs: 1 };
  };
  const args = { fast: true, root, stepName: "specCoverage", inputs: ["specs"], run };

  const cold = memoizeStep(args);
  assert.equal(cold.verdict, "PASS");
  assert.equal(runs, 1);

  const warm = memoizeStep(args);
  assert.equal(warm.verdict, "CACHED"); // distinct verdict — never mistakable for a fresh PASS
  assert.match(warm.note, /^unchanged since /);
  assert.equal(runs, 1); // the step did NOT execute

  fs.writeFileSync(path.join(root, "specs/home.spec.md"), "edited clause\n");
  const afterEdit = memoizeStep(args);
  assert.equal(afterEdit.verdict, "PASS");
  assert.equal(runs, 2); // input change → real execution
});

test("memoizeStep fast mode: a cached FAIL always re-runs so the failure detail is fresh", () => {
  const root = tmp();
  seed(root, { "specs/home.spec.md": "clause\n" });
  let runs = 0;
  const run = () => {
    runs += 1;
    return { name: "specCoverage", verdict: "FAIL", reason: `broken (run ${runs})`, durationMs: 1 };
  };
  const args = { fast: true, root, stepName: "specCoverage", inputs: ["specs"], run };

  assert.equal(memoizeStep(args).verdict, "FAIL");
  const second = memoizeStep(args); // same inputs, but FAIL is never reused
  assert.equal(second.verdict, "FAIL");
  assert.equal(second.reason, "broken (run 2)");
  assert.equal(runs, 2);
});

test("memoizeStep FULL mode never reads the cache — it always executes — but writes so the next fast run benefits", () => {
  const root = tmp();
  seed(root, { "specs/home.spec.md": "clause\n" });
  let runs = 0;
  const run = () => {
    runs += 1;
    return { name: "specCoverage", verdict: "PASS", durationMs: 1 };
  };

  // Prime a warm, matching PASS entry the full lane could illegitimately reuse.
  memoizeStep({ fast: true, root, stepName: "specCoverage", inputs: ["specs"], run });
  assert.equal(runs, 1);

  const full = memoizeStep({ fast: false, root, stepName: "specCoverage", inputs: ["specs"], run });
  assert.equal(full.verdict, "PASS"); // never CACHED
  assert.equal(runs, 2); // executed despite the warm entry — the integrity property stays absolute

  // ...and the full run's write means the NEXT fast run is a hit.
  const fastAfterFull = memoizeStep({ fast: true, root, stepName: "specCoverage", inputs: ["specs"], run });
  assert.equal(fastAfterFull.verdict, "CACHED");
  assert.equal(runs, 2);
});

test("the cache lives in the gitignored build dir, keyed per step", () => {
  const root = tmp();
  seed(root, { "specs/home.spec.md": "clause\n" });
  memoizeStep({ fast: true, root, stepName: "specCoverage", inputs: ["specs"], run: () => ({ name: "specCoverage", verdict: "PASS", durationMs: 1 }) });

  assert.equal(STEP_CACHE_REL_PATH, "composeApp/build/.cmp-step-cache.json");
  const parsed = JSON.parse(fs.readFileSync(path.join(root, STEP_CACHE_REL_PATH), "utf8"));
  assert.equal(parsed.schema, "cmp-step-cache/1");
  assert.ok(parsed.steps.specCoverage);
  assert.equal(parsed.steps.specCoverage.verdict, "PASS");
});
