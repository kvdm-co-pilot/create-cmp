// trust-bridge.mjs — the console's link to Rule 0's LAST RESULT.
//
// File ownership, as receipt-bridge.mjs and steps-bridge.mjs both state it:
// this package owns inspector/mcp/**, not the lane. `qa/evidence/
// framework-check.json` is written by the project's own `qa/framework-check.mjs
// --record` (docs/proposals/LIVE-CONSOLE.md D4a). This file READS those bytes
// and hands them to qa/lib/framework-record.mjs, which owns what they mean.
// Nothing here plants, nothing here runs the instrument, and nothing here
// decides whether a lane is trustworthy.
//
// WHY IT READS INSTEAD OF ASKING. D4b — "re-run framework-check when the
// console asks" — was rejected at signing for two reasons, and the second is
// the one this file exists to honour: the instrument PLANTS INTO REAL FILES,
// so asking it a question behind a page load would mutate the tree of whoever
// happened to open a browser tab. The record is how the answer outlives the run
// that produced it, exactly as the step stream is how a lane run outlives the
// console being down.
//
// ABSENCE IS AN ANSWER. A tree where nobody has run Rule 0 has no record, and
// that reads as the open question it is — never as reassurance, and never as a
// failure of the lane either.

import { readFrameworkRecord, trustState } from "prooflane-harness/lib/framework-record.mjs";

/**
 * Rule 0's last result for this project, as the console's *trust* row reads it.
 *
 * @param {string} root project root
 * @param {{now?: number}} [opts] the reader's clock, injected for the same
 *   reason console-now.mjs takes one: "two hours ago" cannot be tested against
 *   a real clock without waiting two hours.
 * @returns {object} trustState()'s result — always shaped, never thrown
 */
export function readTrustRecord(root, { now = Date.now() } = {}) {
  return trustState(readFrameworkRecord(root), { now });
}
