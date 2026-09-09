// console-ladder.mjs — WHAT WOULD EARN THE NEXT RUNG?
//
// The fifth of docs/proposals/LIVE-CONSOLE.md's five questions, and the only
// one about the future. §4's gap says how it must be answered: "the profile's
// unmet requirement is DERIVED and NAMED, not summarised". So this row never
// says "run more tests" or "get a device" — it names the step the profile's own
// ladder names, in the profile's own spelling, and if that spelling is
// `py_release_smoke` then that is what the row says.
//
// IT IS NOT A SECOND OPINION ABOUT A RUNG, and that is the hardest rule this
// file keeps. The rung a tree has EARNED is the receipt's, graded once by
// qa/lib/evidence-level.mjs when the lane ran; `ladderStanding` (in that same
// grader file, beside `rungFor`) reads the ladder forward and is TOLD what was
// earned rather than working it out. Nothing here counts a step verdict, and
// nothing here decides a grade — if this row and the strip above it could ever
// disagree about a rung, this module would be the defect NORTH-STAR.md §9.2
// catalogues, drawn as a picture.
//
// THE PACK TRAVELS WITH THE RUNGS (§6.5, §8.9). The row draws one pack's
// ladder; the same four marks under another pack are four other claims. The
// grade in words is the strip's job (`rungWithPack`), so this row carries the
// pack clause alone — console-evidence.mjs owns both spellings so they cannot
// drift apart.
//
// §7's refusals, in the one place they are most tempting: no percentage of a
// ladder climbed, no "3 of 4", no progress bar, no green for a rung nobody
// earned. A rung is earned or it is not, and the mark says which.

import { packClause, rungPackNote } from "./console-evidence.mjs";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => esc(s).replace(/"/g, "&quot;");

/** Earned and not-earned, in the glyph vocabulary the rail already speaks. */
const MARK = { earned: "&#9679;", open: "&#9675;" }; // ● ○

/**
 * The *ladder* row.
 *
 * @param {object|null} state qa/lib/evidence-level.mjs `ladderStanding()`
 * @param {{pack?: object|string|null}} [opts] the receipt's pack, so the rungs
 *   are attributable
 * @returns {string} HTML
 */
export function ladderRowHtml(state, { pack = null } = {}) {
  if (!state || !state.available) {
    // A profile with no ladder earns no rung, which is the honest grade and not
    // a failure — the grader's own words, not a rewriting of them.
    return `  <div class="ladder" id="ladder">
  <p class="ladder-line ladder-absent">${esc((state && state.reason) || "no ladder is derivable for this project")}</p>
  </div>`;
  }
  const marks = state.rungs
    .map(
      (r) =>
        `<span class="ladder-rung${r.earned ? " ladder-earned" : ""}" title="${escAttr(
          `${r.id} ${r.name} — ${r.mode === "any" ? "any one of" : "every one of"}: ${r.requires.join(", ") || "(nothing declared)"}`,
        )}">${esc(r.id)} ${r.earned ? MARK.earned : MARK.open}</span>`,
    )
    .join(" ");

  let needs;
  if (state.orphanRung) {
    // The receipt names a rung this ladder does not declare. Said plainly:
    // deciding which of the two moved is not a console's question.
    needs = `<span class="ladder-needs">the receipt records ${esc(state.earned)}, which this profile's ladder does not declare</span>`;
  } else if (state.atTop) {
    needs = `<span class="ladder-needs">${esc(state.earned)} is the top rung this pack declares</span>`;
  } else if (state.next) {
    const n = state.next;
    const named = (list) => list.map((s) => `<code>${esc(s)}</code>`).join(n.mode === "any" ? " or " : " &middot; ");
    needs = n.unmet.length
      ? `<span class="ladder-needs">${esc(n.id)} needs ${named(n.unmet)}</span>`
      : // Every step the next rung names PASSed in the run the receipt
        // describes, and the receipt still records no such rung. That is a real
        // state (the badge floor refuses to grade a profile whose plants cannot
        // be planted, whatever its steps did), and inventing a requirement to
        // fill the sentence would be worse than saying it.
        `<span class="ladder-needs">${esc(n.id)} needs ${named(n.requires)} &mdash; the last run records ${n.requires.length === 1 ? "it" : "them"} PASSed and the receipt still names no ${esc(n.id)}</span>`;
  } else {
    needs = `<span class="ladder-needs">this ladder declares no rungs</span>`;
  }

  // The pack clause is a TITLE away from its full sentence, the same one every
  // other rung surface carries.
  const note = state.earned ? rungPackNote(state.earned, pack) : null;
  return `  <div class="ladder" id="ladder">
  <p class="ladder-line"><span class="ladder-pack"${note ? ` title="${escAttr(note)}"` : ""}>${esc(packClause(pack))}</span> &middot; ${marks} &middot; ${needs}</p>
  </div>`;
}
