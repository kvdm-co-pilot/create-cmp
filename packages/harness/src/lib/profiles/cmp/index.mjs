// profiles/cmp — the Compose Multiplatform stack profile. Mobile, by definition.
//
// This is the first profile and, for now, the only one — and it is loaded the
// same way every other profile ever will be: by id, from qa/harness-manifest.json,
// through qa/lib/profile-loader.mjs. The runner does not know this file exists.
//
// Stage 0 (docs/proposals/AGNOSTIC-HARNESS-ARCHITECTURE.md §11.3): PR 2 made
// this module re-export the step pack; PR 4 added `layout` and `tiers`
// (./declarations.mjs) — the paths and tier names the spec scanner used to
// hardcode. The other declarations — artifacts, architecture, ladder, review,
// plants, providers (§4.2) — still live where they always did and move here
// in the PRs that follow, one at a time, with the mobile fleet-check green
// after each. A profile that claimed all nine today would be claiming code it
// does not own yet.

import { createCmpSteps } from "./steps-cmp.mjs";

export const id = "cmp";
export const protocol = 1;

/** Where specs, sources, tests and flows live; which tiers observe what. */
export { layout, tiers } from "./declarations.mjs";

/** The step pack — today's createCmpSteps, unchanged. */
export function steps(ctx) {
  return createCmpSteps(ctx);
}
