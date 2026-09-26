// EVERY AT-CLOSE TIER HOLDS THE MERGE IN THE SAME STATES.
//
// The class: a new tier added to the gate by listing the states it refuses on,
// instead of by the rule the existing tiers already follow. The Firebase L2 run
// (KD-45) was wired to hold `gh pr merge` only on OWED and REOPENED. The default
// L2 run and the review also hold it on UNDECLARED — required, no slice
// declared, and no record describing these bytes — which is exactly the state an
// overlay-only edit leaves the Firebase tier in when the default tier is
// discharged by the run already on disk (KD-206: the default digest did not
// move, the Firebase one did). The merge then went through with the template's
// Firebase code proven nowhere.
//
// Asserted as an invariant, not an instance: for every tier and every state,
// that tier ALONE in that state gets the same action from the gate as the
// default L2 run alone in that state. A fourth tier wired the same way fails
// here without anyone writing a test for it.
import test from "node:test";
import assert from "node:assert/strict";

import { decide } from "../scripts/hooks/proof-gate.mjs";
import { TIERS, obligation } from "../scripts/proof-plan.mjs";
import { stampedApps, STAMPED_OUTPUT_RULE } from "../scripts/stamped-output.mjs";

const STATES = ["none", "undeclared", "owed", "discharged", "reopened"];
const need = (state) => ({ required: state !== "none", reason: "1 changed path(s) are not declared irrelevant: template/x.kt", obliging: [] });
const tier = (state) => ({ state, need: need(state) });
const settled = { state: "none", need: need("none") };
const proof = { at: "2026-09-26T00:00:00Z", verdict: "PASS", rung: "L2", requires: "L2" };

/** The default L2 run alone in `state`, every other tier settled. */
const defaultAlone = (state) => ({ ...tier(state), branch: "feat/x", proof: state === "discharged" ? proof : undefined, review: settled, firebase: settled });
/** `name` alone in `state`, the default L2 run discharged by the record on disk and every other tier settled. */
const alone = (name, state) => ({ ...defaultAlone("discharged"), [name]: tier(state) });

// Which kinds each tier is collected at. The review is not a device run, so a
// device command says nothing about it.
const KINDS = { firebase: ["merge", "create", "device"], review: ["merge", "create"] };

for (const [name, kinds] of Object.entries(KINDS)) {
  test(`the ${name} tier alone gets the gate's answer the default L2 run alone gets, in every state`, () => {
    const wrong = [];
    for (const kind of kinds) {
      for (const state of STATES) {
        const want = decide(kind, defaultAlone(state), TIERS, {}).action;
        const got = decide(kind, alone(name, state), TIERS, {}).action;
        if (got !== want) wrong.push(`${kind} with ${name} ${state.toUpperCase()}: ${got}, where the default L2 run ${state.toUpperCase()} gets ${want}`);
      }
    }
    assert.deepEqual(wrong, [], `a tier that is held in fewer states than the default L2 run lets a slice through that the default would stop:\n  ${wrong.join("\n  ")}`);
  });
}

// REACHABLE, not a fixture's invention: no slice declared, a template markdown
// edit (the L2 runs are asked about it; a review is not), the default L2 run
// discharged by a PASS record of this tree's own default app, and no Firebase
// record on disk — which is every branch's state until the first
// `--with-firebase` run exists (KD-257). The default tier in the same position
// without its record is UNDECLARED and holds the merge; the Firebase tier here
// has no record at all, and must hold it too.
test("an undeclared slice with no Firebase record on disk cannot merge on the default record alone", () => {
  const root = new URL("..", import.meta.url).pathname;
  const apps = stampedApps(root);
  const fleetRecord = {
    schema: "cmp-fleet-check/1", ranAt: new Date().toISOString(), verdict: "PASS", rung: "L2", pack: "cmp", requiredLevel: "L2", failures: [],
    stampedOutputHash: apps.default.hash, stampedOutputRule: STAMPED_OUTPUT_RULE, stampedOutputFiles: apps.default.files,
  };
  const o = obligation(null, ["template/AGENTS.md"], "feat/x", { fleetRecord, firebaseRecord: null });
  assert.equal(o.state, "discharged", "the premise: the default app is proven by the record on disk");
  assert.equal(o.review.state, "none", "the premise: markdown obliges no review, so nothing else holds this merge");
  assert.equal(o.firebase.state, "undeclared", "the premise: the Firebase tier is required and nothing proves it");
  const d = decide("merge", o, TIERS, {});
  assert.equal(d.action, "deny", `gh pr merge went through with the Firebase app proven by no record and no slice declared (${d.action})`);
});
