// console-standing.mjs — DOES THE PROOF STILL DESCRIBE THIS TREE?
//
// The rung says how strong the last proof was. It does not say whether that
// proof is about the code in front of you, and those are different questions
// that a single green badge silently merges. A receipt earned three commits ago
// is a true statement about a tree that no longer exists; rendered as PASS with
// nothing beside it, it is the most confident lie the console can tell.
//
// docs/proposals/LIVE-CONSOLE.md makes it a rule: "Stale is not PASS." So the
// strip's last clause is a derived check, never decoration — the receipt's own
// commit against this tree's HEAD, and its recorded dirty set against the
// working tree now.
//
// ONE SPELLING, for the reason console-evidence.mjs holds one for the rung: the
// standing will be read by the strip, by a fleet row when Stage 3 arrives, and
// by whatever surface comes after that. A fix applied to instances rather than
// to the class comes back (NORTH-STAR §9.2), and this file exists so there is
// only ever one instance to fix.
//
// PURE. No clock, no filesystem, no git. The bridge that already reads the
// receipt supplies `head` and the dirty count; this decides what they mean. A
// function that shelled out to git could not be tested against the case that
// matters — a tree that moved — without building a repository to move.

/** The states a proof can stand in, worst first — the order the strip prefers. */
export const STANDING = Object.freeze({
  UNKNOWN: "unknown",
  MOVED: "moved",
  DIRTY: "dirty",
  CURRENT: "current",
});

/**
 * Where a receipt stands against the tree in front of you.
 *
 * @param {object|null} receipt   the parsed evidence receipt
 * @param {object} tree           { head, dirtyCount } — this tree, now
 * @returns {{ state: string, label: string, note: string, ok: boolean }}
 */
export function standing(receipt, { head = null, dirtyCount = 0 } = {}) {
  const sha = typeof receipt?.commit?.sha === "string" ? receipt.commit.sha : null;

  // Absence is stated as absence — never as a pass, and never as a failure.
  // A receipt with no commit, or a tree whose HEAD cannot be read, leaves the
  // question genuinely unanswered, and §4's bar says so in one standard form.
  if (!receipt || receipt.available === false || !sha || !head) {
    return {
      state: STANDING.UNKNOWN,
      label: "standing not derivable",
      note: !sha
        ? "the receipt records no commit — re-run the lane"
        : "this tree's HEAD could not be read",
      ok: false,
    };
  }

  if (sha !== head) {
    return {
      state: STANDING.MOVED,
      label: "tree has MOVED since",
      note: `the receipt proves ${sha.slice(0, 7)}; this tree is ${head.slice(0, 7)}. The verdict is true about a tree you are not looking at.`,
      ok: false,
    };
  }

  // Same commit, but the working tree has since been edited. The proof is about
  // the commit, which is still the right commit — and the edits are not in it.
  if (dirtyCount > 0) {
    return {
      state: STANDING.DIRTY,
      label: `${dirtyCount} file${dirtyCount === 1 ? "" : "s"} changed since`,
      note: "the receipt proves this commit, but the working tree has moved past it. Nothing here covers the uncommitted edits.",
      ok: false,
    };
  }

  return {
    state: STANDING.CURRENT,
    label: "tree unchanged since",
    note: `the receipt proves ${sha.slice(0, 7)}, which is this tree.`,
    ok: true,
  };
}

/**
 * The working flow, DERIVED from the sections the console declares rather than
 * written out as a list of six.
 *
 * The arc is already real: the console's sections are ordered define → … →
 * drive, and preview-service.mjs's own comment calls that ordering deliberate.
 * A stack with no device section therefore has no `drive` step in its rail
 * because it declares none — which is the whole reason this reads the
 * declaration instead of restating it. A hard-coded rail would promise every
 * adopter a step their profile may not have.
 *
 * `here` is the first section still wanting attention — the next thing to do,
 * not a wizard's cursor. When everything is signed the arc is complete and the
 * marker rests on the last step.
 *
 * @param {Array<{id:string,label:string,glyph:object|null}>} sections
 * @returns {{ steps: Array<{id:string,label:string,here:boolean,done:boolean}>, here: string|null }}
 */
export function flowRail(sections = []) {
  const usable = sections.filter((s) => s && typeof s.id === "string" && typeof s.label === "string");
  if (usable.length === 0) return { steps: [], here: null };

  // "Wants attention" is the glyph's own meaning, not a second opinion about it:
  // signed is done, everything else (unsigned, reopened, drifted, absent) is not.
  const settled = (s) => Boolean(s.glyph && typeof s.glyph.cls === "string" && s.glyph.cls.includes("signed"));
  const firstOpen = usable.findIndex((s) => !settled(s));
  const hereIdx = firstOpen === -1 ? usable.length - 1 : firstOpen;

  return {
    here: usable[hereIdx].id,
    steps: usable.map((s, i) => ({ id: s.id, label: s.label, here: i === hereIdx, done: settled(s) })),
  };
}
