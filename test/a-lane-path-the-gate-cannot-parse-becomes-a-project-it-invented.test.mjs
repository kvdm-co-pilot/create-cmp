// THE GATE NAMES A PROJECT IT ASSEMBLED FROM A FRAGMENT OF A PATH IT COULD NOT PARSE.
//
// KD-27 closed on this promise: the lane refusal says WHOSE project the lane is
// in, "and says which of those it could not find rather than guessing". That is
// the invariant this file pins, and it is not the same as "the regex handles the
// paths we thought of" — an unparsed argument string must produce `null`, which
// the refusal renders as "in a project this gate could not locate". A path the
// gate half-read and completed against the WRONG cwd is the one answer it must
// never give: it is indistinguishable, in the refusal's sentence, from a project
// the gate actually identified, and it feeds `ours`.
//
// Measured on this tree (2026-09-17), with the lane's own cwd at
// /Users/k/dev/create-cmp:
//
//   args "node /Users/k/my proj/qa/verify.mjs"   -> "/Users/k/dev/create-cmp/proj"
//   args "node \"/Users/k/my proj/qa/verify.mjs\"" -> "/Users/k/dev/create-cmp"
//
// Neither directory is the lane's project, the first does not exist, and both are
// INSIDE repoRoot — so the refusal calls another project's lane "this repository's
// own run", which is the exact move KD-27 exists to stop the reader making. The
// absolute-argument form is not hypothetical: framework-check.mjs spawns the lane
// as `process.execPath, [abs("qa/verify.mjs"), …]`, and a project path with a
// space in it is ordinary on macOS.
import { test } from "node:test";
import assert from "node:assert/strict";

import { decide, describeLane, laneProject } from "../scripts/hooks/proof-gate.mjs";
import { TIERS } from "../scripts/proof-plan.mjs";

// A pid no process holds, so the /proc branch misses on Linux and the injected
// runner answers for the cwd on both platforms.
const NO_SUCH_PID = 4194303;
const cwdRunner = (cwd) => () => `p${NO_SUCH_PID}\nn${cwd}`;

const REPO = "/Users/k/dev/create-cmp";
const OTHER = "/Users/k/my proj";

test("a lane path the gate cannot parse yields NO project, never one completed from a fragment", () => {
  const cases = [
    // args, the lane's own cwd, the project it is really running in
    [`node ${REPO}/qa/verify.mjs`, "/somewhere/else", REPO, "parseable: must be named"],
    [`node qa/verify.mjs`, REPO, REPO, "relative: resolved against the lane's own cwd"],
    [`node ../app/qa/verify.mjs`, `${REPO}/x`, "/Users/k/dev/create-cmp/app", "relative upward"],
    [`node ${OTHER}/qa/verify.mjs`, REPO, OTHER, "a space in the path"],
    [`node "${OTHER}/qa/verify.mjs"`, REPO, OTHER, "a quoted path with a space"],
    [`node\t${OTHER}/qa/verify.mjs`, REPO, OTHER, "tab-separated argv"],
  ];
  for (const [args, cwd, project, why] of cases) {
    const got = laneProject(NO_SUCH_PID, args, cwdRunner(cwd));
    assert.ok(
      got === project || got === null,
      `${why}: laneProject(${JSON.stringify(args)}) with cwd ${cwd} named ${JSON.stringify(got)} — the lane runs in ${project}. A project it cannot read must come back null, not be invented.`,
    );
  }
});

test("a project the gate invented is never claimed as this repository's own run", () => {
  // The lane belongs to /Users/k/my proj. Its cwd happens to be inside this repo
  // (a lane launched from here by absolute path — what framework-check.mjs does).
  const project = laneProject(NO_SUCH_PID, `node ${OTHER}/qa/verify.mjs`, cwdRunner(REPO));
  const lane = { pid: NO_SUCH_PID, args: `node ${OTHER}/qa/verify.mjs`, project, marker: null };
  const { ours, text } = describeLane(lane, { repoRoot: REPO });
  assert.equal(ours, false, `a lane in ${OTHER} is not this repository's — the refusal said: ${text}`);

  const d = decide("device", { state: "owed", plan: { slice: "s", branch: "b" }, need: { reason: "r" }, branch: "b", review: { state: "none" } }, TIERS, { runningLane: lane, repoRoot: REPO });
  assert.match(d.reason, /Do not kill it/, "a lane the gate could not place must never be handed to you as yours to stop");
});
