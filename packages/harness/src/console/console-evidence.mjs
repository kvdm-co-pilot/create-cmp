// console-evidence.mjs — THE RUNG'S ONE SPELLING IN THIS CONSOLE.
//
// NORTH-STAR.md §6.5 ends with the rule this file exists to keep: "every
// surface that shows a rung shows the pack". §8.9 says why it is a guarantee
// and not a preference — "a `cmp` L2 and any other pack's L2 are different
// claims and are shown as such". L2 means "a phone drove the app" under one
// pack and "proven against a real database" under another, and the letter alone
// does not say which. A rung with no pack beside it is therefore a claim its
// reader cannot check, which is the one thing this product refuses everywhere
// else; §3 already promises Gatekeeper "shows the pack beside the rung".
//
// WHY A MODULE AND NOT SEVEN EDITS. The console renders a rung in SEVEN places:
// the rail foot, the front door's standing line, the recent-requests rows, the
// Evidence section's status line, its headline chip, the committed-receipt
// timeline, and the digest's lane-run table. NORTH-STAR.md §9.2 says "five",
// lists six locations, and the count under the scan is seven — the miss being
// the recent-requests rows, whose rung OUTLIVES the run that earned it. That
// arithmetic is the argument: §9.2 closes by naming what a list costs — "a fix
// applied to the instances rather than to the class comes back", a price that
// section records this repository paying twice in one file. So the console does
// not hold seven spellings of a rung. It holds one function, every surface
// calls it, and test/evidence-ladder.test.mjs refuses any console module that
// reads a rung another way — so an EIGHTH surface is covered the day it is
// written, by the same inversion the agnostic lint uses, and by nobody
// remembering a list.
//
// ONLY THE ID IS EVER SHOWN. `pack.version` on a receipt is today the harness
// LOCK's version rather than the profile's — the code that writes it says so
// ("its version is the lock's until the profile loader gives it its own") and
// docs/adr/0008-a-resolved-harness-is-still-a-vendored-one.md decided that
// number "must become null, not inherited". Until it does, a surface printing
// it would be naming a version of the wrong thing, so nothing here reads it.
// The id is the part that carries the meaning, and the id is the profile's own.
//
// Pure text, never HTML: every caller already owns an `esc` and its own markup,
// and a derivation that returned tags could not be shared by a rail line, a
// badge span and a table cell without one of them wearing another's chrome —
// which console-shell.mjs's design rules forbid outright.

/**
 * The pack id out of whatever the caller is holding, or null.
 *
 * Three shapes reach the console and all three are honoured, because forcing
 * one on the callers would mean a bridge, a git-history row and a plan-trail
 * entry each having to remember the same normalisation:
 *   - `"cmp"` — the flat id, how the receipt bridge and the plan trail carry it;
 *   - `{id: "cmp", version: …}` — the receipt's own `pack` object, verbatim,
 *     for any caller that holds the parsed receipt rather than a summary of it;
 *   - null/undefined/`{}`/`{id: "  "}` — all of them mean the same thing, that
 *     nothing here names a pack, and all of them are rendered as that rather
 *     than as an absence the reader has to notice for themselves.
 */
function packIdOf(pack) {
  if (typeof pack === "string") return pack.trim() || null;
  if (pack && typeof pack === "object" && typeof pack.id === "string") return pack.id.trim() || null;
  return null;
}

/**
 * The rung as a reader may safely quote it: the grade, its name when there is
 * one, and the pack that graded it — or the statement that no pack is named.
 *
 * `null` when there is no rung to show. That is the honest absence and it has
 * three causes the console must not tell apart: a FAILed lane (the lane itself
 * records no level), a receipt written before the ladder existed, and a
 * malformed field. None of them may be rendered as a rung, so none of them is.
 *
 * @param {{rung?: string, name?: string}|string|null|undefined} level the
 *   receipt's own derived `evidenceLevel`, read verbatim and never re-derived
 *   here — the lane is the law. A bare string is accepted for the two trails
 *   that store only the grade (the plan history's receipt glance, the digest's
 *   lane runs), so those surfaces get the pack without inventing a name.
 * @param {{id?: string}|string|null|undefined} pack the pack id, or the
 *   receipt's `pack` object.
 * @returns {string|null} e.g. `"L2 device · pack cmp"`, or
 *   `"L2 device · pack unnamed"` when the receipt named none. The grade and its
 *   name are joined by a SPACE and the pack by a middle dot, which is the
 *   console's existing spelling of a rung with one clause added rather than a
 *   new grammar: `L2 device` is what the rail foot, the front door and the
 *   Evidence status line already read, and the dot is what the done-gate CLI
 *   already puts before `pack`. A shared derivation is worth having; a shared
 *   derivation that also restyles six pages is two changes wearing one commit.
 */
export function rungWithPack(level, pack) {
  const grade =
    typeof level === "string"
      ? level.trim()
      : level && typeof level === "object" && typeof level.rung === "string"
        ? level.rung.trim()
        : "";
  if (!grade) return null;
  const name =
    level && typeof level === "object" && typeof level.name === "string" && level.name.trim() ? level.name.trim() : "";
  const id = packIdOf(pack);
  // "pack unnamed" is the wording the README badge already uses for this exact
  // state (packages/harness/src/lib/evidence-badge.mjs) and the done-gate CLI
  // says the same thing at greater length. One vocabulary across the surfaces
  // matters more than each one's best phrasing: a reader who learns it on the
  // badge reads it on the console without being taught twice.
  return `${grade}${name ? ` ${name}` : ""} · ${id ? `pack ${id}` : "pack unnamed"}`;
}

/**
 * The sentence that belongs in a `title=` beside a rung — why the pack is
 * there, in the words the badge and the done-gate CLI already use.
 *
 * Two states, and the second is the load-bearing one. A receipt that names no
 * pack is SAID to name none, because an unattributed rung is comparable to
 * nothing and hiding that fact would be the overclaim the whole ladder exists
 * to refuse. `null` when there is no rung, so a caller can build its tooltip
 * without a second absence check.
 *
 * @returns {string|null}
 */
export function rungPackNote(level, pack) {
  if (!rungWithPack(level, pack)) return null;
  const grade = typeof level === "string" ? level.trim() : String(level.rung).trim();
  const id = packIdOf(pack);
  return id
    ? `this rung is pack ${id}'s: a ${id} ${grade} and another pack's ${grade} are different claims`
    : "the receipt names no pack, so this rung is comparable to nothing";
}
