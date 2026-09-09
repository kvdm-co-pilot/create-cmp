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
 * THE WORKING FLOW IS SIX STEPS, and the sections are its EVIDENCE.
 *
 * docs/proposals/LIVE-CONSOLE.md §2 names the flow verbatim — `define →
 * preview → approve → verify → report → drive` — and the front door's design of
 * record (docs/reference/live-console-prototype.html) draws exactly those six.
 * Phase A derived the rail from the section list instead, one step per section,
 * and the result was thirteen wrapping section names duplicating the sidebar:
 * not a flow, a second navigation.
 *
 * So the six are named here, and what stays DERIVED is which of them this
 * project HAS: a step is on the rail only when at least one of the sections
 * that evidence it is present. A stack that declares no `live-device` section
 * has no `drive` step, for the same reason Phase A read the declaration at all
 * — a rail may not promise a step the profile never declared.
 *
 * `overview` and `comments` evidence NO step, deliberately: the front door is
 * where the rail is drawn (it cannot be a step in its own flow) and the comment
 * ledger is a cross-cutting margin, not a phase of the work.
 */
export const FLOW_STEPS = Object.freeze([
  Object.freeze({ id: "define", label: "define", sections: Object.freeze(["intent", "features", "architecture", "specs"]) }),
  Object.freeze({ id: "preview", label: "preview", sections: Object.freeze(["screens", "design-system", "components"]) }),
  Object.freeze({ id: "approve", label: "approve", sections: Object.freeze(["approvals"]) }),
  Object.freeze({ id: "verify", label: "verify", sections: Object.freeze(["evidence"]) }),
  Object.freeze({ id: "report", label: "report", sections: Object.freeze(["walkthrough"]) }),
  Object.freeze({ id: "drive", label: "drive", sections: Object.freeze(["live-device"]) }),
]);

/**
 * The six steps, filtered to the ones this console's declared sections
 * evidence, each marked done/here.
 *
 * `done` is the step's evidence settled — EVERY present section that evidences
 * it is signed. One unsigned spec leaves `define` open, which is the honest
 * reading: the step is not finished while any of its own artifacts is not.
 *
 * `here` is the first present step still wanting attention — the next thing to
 * do, not a wizard's cursor. When everything is settled the arc is complete and
 * the marker rests on the last present step.
 *
 * @param {Array<{id:string,label:string,glyph:object|null}>} sections
 * @returns {{ steps: Array<{id:string,label:string,here:boolean,done:boolean}>, here: string|null }}
 */
export function flowRail(sections = []) {
  const usable = sections.filter((s) => s && typeof s.id === "string");
  if (usable.length === 0) return { steps: [], here: null };

  // "Wants attention" is the glyph's own meaning, not a second opinion about it:
  // signed is done, everything else (unsigned, reopened, drifted, absent) is not.
  //
  // EXACT EQUALITY, NOT `includes`. This read `cls.includes("signed")` until
  // 2026-09-09, and `"glyph-unsigned".includes("signed")` is TRUE — so the
  // predicate answered "done" for the very first state its own comment above
  // names as not-done. It was unreachable while `flowRailHtml` had no caller;
  // wiring the rail put the wrong answer on the page, where a project with no
  // receipt at all saw `verify` painted settled one line under a strip reading
  // "no verify receipt yet", and `here` stepped over every unsigned phase to
  // name the wrong next command. The glyph vocabulary is five exact strings
  // (glyph-signed / -unsigned / -drift / -reopen / -attn); only the first is
  // done, and a substring test over a vocabulary where one term contains
  // another is a bug waiting for its caller.
  const settled = (s) => Boolean(s.glyph && s.glyph.cls === "glyph-signed");

  // NO ABSTENTION, AND NO `UNGOVERNED` SET. There was one, briefly, holding
  // `screens` and `walkthrough` — the two sections whose glyph was a literal
  // that never varied. It was the wrong diagnosis of the right symptom: both
  // sections HAD state (a screen count, a walkthrough run) and the rail's input
  // was throwing it away, so a predicate that can only read a glyph was asked a
  // question the glyph could not express. Deriving both glyphs from the state
  // that always existed emptied the set, and an empty special case is one that
  // should not exist. Every section votes; a section with no glyph has nothing
  // settled and says so.
  //
  // This was the same bug three times at three altitudes — `settled()` calling
  // unsigned "signed", then `done` calling never-signed "done", then `done`
  // calling never-run "done" — and each patch moved it rather than killing it.
  // The rule that ends it: a step is settled only by evidence that can actually
  // report being settled, so fix the evidence, never the predicate.
  const byId = new Map(usable.map((s) => [s.id, s]));

  const present = [];
  for (const step of FLOW_STEPS) {
    const evidence = step.sections.map((id) => byId.get(id)).filter(Boolean);
    if (evidence.length === 0) continue; // the profile declared none of it
    // `openSection` is the evidence a command lookup needs and could not have.
    // A step is a PHASE — `define` spans intent, features, architecture and
    // specs — so "what advances this step" has no answer at the step's own
    // altitude; it has one at the section that is actually holding it open.
    // Reporting it here is the same rule this file already records one screen
    // up, applied to the command instead of the verdict: fix the evidence,
    // never the predicate.
    const open = evidence.find((s) => !settled(s));
    present.push({ id: step.id, label: step.label, done: !open, openSection: open ? open.id : null });
  }
  if (present.length === 0) return { steps: [], here: null };

  const firstOpen = present.findIndex((s) => !s.done);
  const hereIdx = firstOpen === -1 ? present.length - 1 : firstOpen;
  return {
    here: present[hereIdx].id,
    steps: present.map((s, i) => ({ ...s, here: i === hereIdx })),
  };
}
