// console-trust.mjs — CAN I TRUST THE LANE THAT SAYS SO?
//
// The fourth of docs/proposals/LIVE-CONSOLE.md's five questions, and the only
// one that is about the INSTRUMENT rather than about the tree. Every other row
// on the front door leans on the lane's word; this row is where the lane's word
// is itself checked, by the one thing that checks it: GATE-RULES Rule 0, whose
// instrument plants a violation per guard and watches each one refuse BY NAME.
//
// IT READS A RECORD. IT NEVER RUNS ANYTHING. D4b — "re-run framework-check when
// the console asks" — was rejected at signing for two reasons this file keeps:
// seconds of latency behind a page load, and a MUTATION OF THE TREE behind a
// page load (the instrument plants into real files). So `qa/framework-check.mjs
// --record` leaves the answer behind and this renders it. Nothing here spawns,
// nothing here plants, and nothing here can change a verdict.
//
// AN ABSENT RECORD RENDERS AS ABSENCE. Never as reassurance, and never as a
// failure either: a tree where nobody has run Rule 0 is a tree where the
// question is open, which is exactly what the row says, plus the command that
// closes it. This is §4's evidence-or-silence with the emphasis where a live
// page needs it — the reassuring reading of silence is the one that costs
// something.
//
// ONE QUESTION, ONE ROW (§3.4). The row carries the Rule 0 verdict and nothing
// else. Which plants ran, and what each one made refuse, is the SAME question
// in more detail, so it expands in place (§2 — "one line when idle and expands
// in place") rather than becoming a second line or a second row.
//
// WHAT IT MEANS is not decided here: qa/lib/framework-record.mjs owns that, so
// the `--html` snapshot and this page cannot come to disagree about what Rule 0
// said. This file owns the MARKUP, which is the same split console-now.mjs
// keeps between the stream's meaning and a step row's HTML.

import { formatDurationMs } from "./console-data.mjs";
import { FRAMEWORK_RECORD_COMMAND, trustLine } from "../lib/framework-record.mjs";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => esc(s).replace(/"/g, "&quot;");

/**
 * The *trust* row.
 *
 * @param {object|null} state qa/lib/framework-record.mjs `trustState()`
 * @param {{age?: string|null}} [opts] the age as this console spells it
 *   (console-shell's formatAgeCoarse), passed in for the reason every other
 *   derived value on this page is: the row states what an artifact says, and
 *   how old a thing reads is the shell's vocabulary, not this row's.
 * @returns {string} HTML
 */
export function trustRowHtml(state, { age = null } = {}) {
  // THE ROW *IS* THE DISCLOSURE. It used to be a block with a nested <details>
  // inside it, which put the plants two clicks and two indents from the line
  // they belong to. §2's shape is one line that expands in place, so the
  // expansion is the row's own body and there is exactly one summary.
  if (!state || !state.available) {
    return `  <details class="row" id="trust">
  <summary><span class="k">trust</span><span class="v trust-absent">${esc(trustLine(state))} &mdash; run <code>${esc(FRAMEWORK_RECORD_COMMAND)}</code></span><span class="chev">&rsaquo;</span></summary>
  <div class="body">
  <p>Rule 0 is the instrument that checks the instrument: it plants one violation per guard and watches each guard refuse BY NAME. Nothing on this page has been checked that way until it is run, and it is not run behind a page load &mdash; it plants into your real tree and puts it back.</p>
  </div>
  </details>`;
  }
  const failed = state.verdict !== "PASS";
  // Red is the console's three-colour vocabulary and means "something went
  // wrong" (console-shell.mjs). A Rule 0 that FAILED is that. A tree the
  // instrument did not put back is that too, and it is the finding a reader
  // would least expect to have to look for.
  const bad = failed || state.treeIdentical === false;
  const rows = (state.rows ?? [])
    .map((p) => {
      // The plant's own label and the row that ACTUALLY went red — the
      // instrument prints the observed step rather than the one the plant asked
      // for, because on a pack that named none those are different strings.
      const dur = formatDurationMs(p.durationMs);
      const named = p.names.length ? ` naming ${esc(p.names.join(", "))}` : "";
      // "FAIL ✓" is the design of record's own spelling and it is exact: the
      // gate FAILED, which is what the plant asked it to do. A plant that made
      // nothing go red is the one that reads as a failure here.
      const verdict = p.failedByName
        ? `<span class="step-verdict-pass">FAIL &#10003;</span>`
        : `<span class="step-verdict-fail">no refusal</span>`;
      const why = p.failedByName ? `${esc(p.observed || "the lane")}${named}` : "did NOT refuse by name";
      return `    <tr class="trust-plant"><td class="step">${esc(p.label)}</td><td class="verd">${verdict}</td><td class="dur">${esc(dur || "")}</td><td class="why">${why}</td></tr>`;
    })
    .join("\n");
  const table = rows ? `  <table class="steps"><tbody>\n${rows}\n  </tbody></table>\n` : "";
  const unavailable =
    state.unavailable > 0
      ? `  <p class="trust-note">${state.unavailable} plant${state.unavailable === 1 ? "" : "s"} this tree cannot make &mdash; the record names each one and why</p>\n`
      : "";
  const source = `  <p class="trust-link">reading <code>${esc(state.relPath)}</code>${state.commit ? ` &middot; at ${esc(String(state.commit).slice(0, 7))}` : ""}</p>`;
  return `  <details class="row" id="trust" title="${escAttr(
    "GATE-RULES Rule 0: each plant makes the responsible gate FAIL BY NAME, and the instrument leaves the tree as it found it",
  )}">
  <summary><span class="k">trust</span><span class="v${bad ? " trust-bad" : ""}">${esc(trustLine(state, age))}</span><span class="chev">&rsaquo;</span></summary>
  <div class="body">
${table}${unavailable}  <p>A lane you have not seen refuse is a lane you have not seen. This is the last time it refused, and what it refused by name.</p>
${source}
  </div>
  </details>`;
}
