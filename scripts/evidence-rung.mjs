// The rung ladder, as a LEAF — L0 scaffold / L1 desktop / L2 device / L3 release
// (docs/NORTH-STAR.md §10 item 2).
//
// WHY IT IS ITS OWN FILE. It lived in `scripts/fleet-check.mjs`, which is the
// right home for reading a receipt and the wrong one for being imported: that
// module registers SIGTERM/SIGINT/SIGHUP handlers at load, because it owns
// child processes it must take down with it. `scripts/proof-plan.mjs` has to
// compare a recorded rung against the rung its tier declares, and it runs
// inside the PreToolUse hook — a hook that quietly acquired signal handlers
// which kill children and `process.exit` would be a change to the one code path
// whose failure mode is a decision never delivered, which is a PERMITTED
// command rather than a refusal.
//
// So the three functions with no dependencies move here and `fleet-check`
// re-exports them, leaving one definition of the ladder for every reader that
// has to hold a record to a level.

/** The ladder, lowest first. Order IS the comparison. */
export const LEVELS = ["L0", "L1", "L2", "L3"];

/**
 * "l2", "L2 (device)", or the receipt's own `{ rung: "L2", name, satisfiedBy }`
 * object → "L2"; unknown → null.
 *
 * The object form is what qa/lib/evidence-level.mjs actually returns and what
 * verify.mjs writes onto the receipt. Reading only the string form silently
 * degraded every real receipt to fleet-check's strength fallback — caught by
 * the 0.12.0 fleet check, which reported "receipt names no evidenceLevel"
 * against a receipt that named one perfectly well.
 */
export function normalizeLevel(v) {
  const raw = v && typeof v === "object" && !Array.isArray(v) ? v.rung : v;
  const m = String(raw ?? "").match(/L[0-3]/i);
  return m ? m[0].toUpperCase() : null;
}

/** Numeric ordering for rungs: negative when a < b, 0 when equal, positive when a > b. */
export function compareLevels(a, b) {
  const ia = LEVELS.indexOf(normalizeLevel(a));
  const ib = LEVELS.indexOf(normalizeLevel(b));
  if (ia === -1 || ib === -1) throw new Error(`unknown evidence level: ${ia === -1 ? a : b}`);
  return ia - ib;
}

/**
 * Whether `rung` reaches `required` — the one predicate behind every "is this
 * record good enough" question in this repository.
 *
 * A rung this ladder does not know is NOT enough. `compareLevels` throws on
 * one, and a gate that threw would take its caller down; here the unknown
 * answers the only safe thing it can, which is no.
 */
export function rungMeets(rung, required) {
  const at = normalizeLevel(rung);
  const bar = normalizeLevel(required);
  if (at === null || bar === null) return false;
  return compareLevels(at, bar) >= 0;
}
