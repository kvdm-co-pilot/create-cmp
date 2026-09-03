// evidence-level.mjs — the ladder is the PACK's. A backend vendoring the spine
// was graded by Compose step names: its strongest run L0, L1 unreachable by
// construction. A pack declares its ladder or earns no rung.
import { test } from "node:test";
import assert from "node:assert/strict";
import { evidenceLevel, CMP_LADDER } from "../packages/harness/src/lib/evidence-level.mjs";

const pass = (...names) => names.map((name) => ({ name, verdict: "PASS", durationMs: 1 }));
const CMP_L1 = pass(...CMP_LADDER.scaffoldCore, ...CMP_LADDER.l1Required);

test("no ladder argument → the Compose ladder, unchanged for every existing caller", () => {
  const level = evidenceLevel(CMP_L1, "local", { mode: "full" });
  assert.equal(level.rung, "L1");
  assert.equal(level.name, "desktop");
});

test("ladder: null → no rung at all: a pack that declares none is not graded by another pack's step names", () => {
  assert.equal(evidenceLevel(CMP_L1, "local", { mode: "full", ladder: null }), null);
  const backend = pass("harnessIntegrity", "compositeBuild", "detekt", "konsist", "gitleaks");
  assert.equal(evidenceLevel(backend, "local", { mode: "full", ladder: null }), null);
  // PLANTED: the same backend run under the Compose ladder is the wrong grade this closes.
  assert.equal(evidenceLevel(backend, "local", { mode: "full" }), null, "no build/unitTests → not even L0 under the Compose ladder");
});

test("a pack's own ladder grades its own steps, with its own rung names", () => {
  const ladder = {
    scaffoldCore: ["compositeBuild", "unitTests"],
    l0Required: ["compositeBuild", "unitTests"],
    l1Required: ["detekt", "archTests", "gitleaks"],
    deviceExecution: ["contractTests"],
    release: "loadTest",
    names: { L0: "builds", L1: "static", L2: "integrated", L3: "load-proven" },
  };
  const l1 = evidenceLevel(pass("compositeBuild", "unitTests", "detekt", "archTests", "gitleaks"), "local", { mode: "full", ladder });
  assert.deepEqual([l1.rung, l1.name], ["L1", "static"]);
  assert.deepEqual(l1.satisfiedBy, ["compositeBuild", "unitTests", "detekt", "archTests", "gitleaks"]);
  const l3 = evidenceLevel(pass("compositeBuild", "unitTests", "detekt", "archTests", "gitleaks", "contractTests", "loadTest"), "release", { mode: "full", ladder });
  assert.deepEqual([l3.rung, l3.name], ["L3", "load-proven"]);
  const failed = evidenceLevel([...pass("compositeBuild", "unitTests"), { name: "detekt", verdict: "FAIL", durationMs: 1 }], "local", { mode: "full", ladder });
  assert.equal(failed, null, "a failed lane has no rung under any ladder");
});
