// hooks.mjs — the advisory/enforcement split for a stamped project's hook set.
//
// The template's .claude/settings.json is not one thing. It carries three
// kinds of hook, and telling them apart IS the product's Act 2 / Act 3 line:
//
//   ENFORCEMENT — the Stop hook (qa/receipt-check.mjs --hook). It can refuse
//     to let a session claim "done" without a fresh PASS receipt. It is the
//     harness's teeth, it presupposes the lane, and it ships only in full
//     mode. Classified BY EVENT: Stop/SubagentStop are where Claude Code can
//     block, so any hook registered there is enforcement by construction.
//
//   LANE ADVISORY — wall-time nudges whose command text names `qa/` (the
//     verify-fast reminder, the device-lease reminder). They constrain
//     nothing, but they presuppose the lane: in a scaffold without qa/ they
//     would advertise commands the agent cannot run. A discovery surface that
//     lies is worse than one that is absent, so these ship only where the
//     lane does. Classified by reference: naming the lane is depending on it.
//
//   PORTABLE ADVISORY — everything else that informs (the screenshots-lose-
//     structure nudge). True in every mode; ships in every mode. An advisory
//     hook always resolves to permissionDecision "allow" — if a future
//     PreToolUse hook wanted to DENY, that is an enforcement decision to make
//     deliberately here, not a string to pattern-match.
//
// SessionStart is deliberately exempt from the lane-reference rule, and the
// distinction is not a special case but the actual difference between the two
// kinds of hook. A PreToolUse nudge is a fixed instruction that fires at a
// wall: its command IS the advice, so a command naming qa/ can only be kept
// or dropped. SessionStart's command is a `printf` of narration that the
// stamper AUTHORS PER MODE — it is the one hook whose content is a variable,
// so it is never dropped for describing the full mode's lane; it is rewritten
// to describe the mode actually being stamped. Dropping it instead (the first
// cut of this module did) left a minimal scaffold with no opening context at
// all, which is the silence this whole discovery layer exists to prevent.
//
// Every function is pure: settings in, new settings out, input never mutated.

export const ENFORCEMENT_EVENTS = new Set(["Stop", "SubagentStop"]);

/** Events whose hooks can constrain the agent (vs inform it). */
export function isEnforcementEvent(event) {
  return ENFORCEMENT_EVENTS.has(event);
}

/**
 * Does this entry's command presuppose the verify lane (`qa/`)? Takes anything
 * settings.json can hold a command in — a hook, or the top-level `statusLine`.
 */
export function referencesLane(hook) {
  return String(hook?.command ?? "").includes("qa/");
}

/**
 * Events whose hook command is narration the stamper rewrites per mode,
 * rather than a fixed instruction that fires at a wall. These are never
 * dropped for naming the lane — they are re-authored. See the header.
 */
const REWRITTEN_EVENTS = new Set(["SessionStart"]);

/**
 * Classify one hook: "enforcement" | "lane-advisory" | "advisory".
 * @param {string} event the settings.hooks key the hook is registered under
 * @param {object} hook one entry of a group's `hooks` array
 */
export function classifyHook(event, hook) {
  if (isEnforcementEvent(event)) return "enforcement";
  if (REWRITTEN_EVENTS.has(event)) return "advisory";
  if (referencesLane(hook)) return "lane-advisory";
  return "advisory";
}

/**
 * Remove hooks matching `drop(event, hook)`; drop groups and events left
 * empty, so the result is an honest hook set rather than a skeleton of empty
 * arrays. Tolerates malformed shapes by passing them through untouched.
 */
function filterHooks(settings, drop) {
  const out = structuredClone(settings);
  if (!out || typeof out.hooks !== "object" || out.hooks === null) return out;
  for (const [event, groups] of Object.entries(out.hooks)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      if (!Array.isArray(group?.hooks)) continue;
      group.hooks = group.hooks.filter((h) => !drop(event, h));
    }
    out.hooks[event] = groups.filter((g) => !Array.isArray(g?.hooks) || g.hooks.length > 0);
    if (out.hooks[event].length === 0) delete out.hooks[event];
  }
  return out;
}

/**
 * The hook set with enforcement removed — advisory hooks (both kinds) pass
 * through byte-identical. Idempotent; input never mutated.
 * @param {object} settings parsed .claude/settings.json content
 */
export function stripEnforcementHooks(settings) {
  return filterHooks(settings, (event) => isEnforcementEvent(event));
}

/**
 * Build a SessionStart hook command that prints `context` as
 * additionalContext, in the exact shape the template's own hook uses
 * (`printf '%s'` around a single-quoted JSON payload). The payload is
 * single-quoted for the shell, so the copy must carry no apostrophe — that is
 * a constraint on the author of the copy, enforced here rather than escaped
 * around, so the stamped command stays trivially auditable.
 * @param {string} context
 */
export function sessionStartCommand(context) {
  if (context.includes("'")) {
    throw new Error(
      "SessionStart context must not contain an apostrophe (the command is single-quoted for the shell) — reword the copy"
    );
  }
  const payload = JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context },
  });
  return `printf '%s' '${payload}'`;
}

/**
 * The minimal-mode hook set, DERIVED from the full one rather than kept as a
 * second file to hold in sync (light is a filter, not a fork). Four edits:
 *
 *   (a) enforcement goes — the Stop hook is Act 3;
 *   (b) lane-advisory goes — a nudge naming qa/ presupposes the lane;
 *   (c) SessionStart says what is true HERE — `sessionContext` describes what
 *       this scaffold carries and the one command that adds the rest;
 *   (d) a lane-referencing `statusLine` goes. It is not a hook, so the
 *       classifier above never saw it, and the first cut of the walk shipped a
 *       minimal scaffold a status line reading `qa/walk-status.mjs` — a file
 *       minimal deletes. The command is guarded (`test -f … || true`) so it
 *       printed nothing rather than erroring, which is exactly what made it
 *       survive review: dead config that fails silently. The lane-reference
 *       rule is the same one that drops lane-advisory hooks; it just has to be
 *       applied to every surface that carries a command, not only to `hooks`.
 *
 * @param {object} settings parsed .claude/settings.json content
 * @param {object} opts
 * @param {string} opts.sessionContext additionalContext for the SessionStart hook
 */
export function minimalHookSettings(settings, { sessionContext }) {
  const out = filterHooks(settings, (event, hook) => classifyHook(event, hook) !== "advisory");
  if (!out || typeof out !== "object") return out;
  if (referencesLane(out.statusLine)) delete out.statusLine;
  if (typeof out.hooks !== "object" || out.hooks === null) return out;
  for (const group of out.hooks.SessionStart ?? []) {
    if (!Array.isArray(group?.hooks)) continue;
    for (const hook of group.hooks) hook.command = sessionStartCommand(sessionContext);
  }
  return out;
}

// ---------------------------------------------------------------------------
// ANCHORING — a hook command runs in the SESSION's cwd, not the project root.
// ---------------------------------------------------------------------------
//
// Claude Code executes a hook command with the cwd of the session, which is not
// necessarily the directory holding .claude/settings.json. A monorepo session
// opened at `services/` runs a Stop hook written `node qa/receipt-check.mjs`
// against `services/qa/receipt-check.mjs`, which does not exist. payment-blueprint
// hit exactly that on 2026-09-02 and anchored its own copy on 2026-09-10; the
// template it was stamped from was never fixed, so every app stamped since
// carried the defect forward.
//
// Two of the three surfaces fail SILENTLY, which is why this is a gate and not a
// note. `test -f qa/walk-status.mjs && node … || true` does not error from the
// wrong directory — it evaluates to nothing and exits 0. A Stop hook that cannot
// find its script gets diagnosed; a status line that simply stops appearing gets
// shrugged at, and the walk quietly stops injecting.
//
// The remedy is the one this repo's OWN .claude/settings.json already uses:
// `"${CLAUDE_PROJECT_DIR:-.}/<path>"`. Only that exact form counts as anchored.
// A bare `${CLAUDE_PROJECT_DIR}/qa/x.mjs` is WORSE than the relative form — with
// the variable unset it expands to `/qa/x.mjs`, an absolute path at the
// filesystem root — so the detector rejects it rather than treating any mention
// of the variable as good enough. The `:-.` default is what makes anchoring a
// pure addition: unset, it degrades to exactly the relative behaviour.
//
// INVOCATION vs MENTION is the whole difficulty. Most commands in the template
// are `printf`/`grep` narration that NAMES lane paths on purpose — the
// SessionStart banner says "done is `node qa/verify.mjs`", and that advice is
// addressed to an agent standing at the project root, so anchoring it would be
// wrong. Every one of those mentions is inside a single-quoted shell string, and
// every real invocation is not. So the detector masks single-quoted spans before
// it looks.
//
// The obvious worry about that masking is a PHASE SHIFT: one stray apostrophe in
// a payload would re-pair every quote after it, and a real invocation could hide
// inside what the masker then thinks is narration. It cannot, and the reason is
// not the one this comment gave until a review ran it. It is NOT that
// `sessionStartCommand` refuses apostrophes — that guard only covers copy that
// function builds, and the template's SessionStart and PreToolUse commands are
// hand-written JSON it never touches. The actual reason is stronger, because it
// is a property of the interpreter rather than of a helper: `sh` pairs single
// quotes by exactly the rule the masker uses, so a command with an odd number of
// them is a SYNTAX ERROR, not a command that quietly runs something else. A
// phase-shifted command does not execute at all — measured, not reasoned:
// `printf '%s' 'it's advice' ; node qa/x.mjs` dies with "unexpected EOF while
// looking for matching quote" and never reaches the node call.
//
// Where the parse IS genuinely approximate is the converse — a single-quoted
// span that really does get executed, by `sh -c '…'` or `eval '…'`. That is a
// live blind spot, measured and logged as KD-87 rather than guessed at.

/** The one anchoring form this repo has proven. See the note above on `:-.`. */
export const PROJECT_DIR_ANCHOR = "${CLAUDE_PROJECT_DIR:-.}";

/**
 * WHERE THE ANCHOR ACTUALLY WORKS — and it is not everywhere a command can live.
 *
 * `CLAUDE_PROJECT_DIR` is documented as exported to HOOK commands, and the hooks
 * reference additionally names stdio MCP servers and plugin LSP servers as the
 * other places Claude Code sets it. `statusLine` is absent from that list — which
 * is the list that exists precisely to enumerate the non-hook consumers — and the
 * statusline reference names only COLUMNS and LINES as variables it sets.
 *
 * So on a `statusLine` command the anchor EXPANDS TO NOTHING and `:-.` quietly
 * restores the relative behaviour. It is not harmful; it is inert, which is worse
 * in one specific way: it reads as protection. This slice shipped it on all three
 * surfaces before that was checked, and the CHANGELOG claimed three fixes where
 * two were real. The statusLine keeps its relative form and is logged as KD-90
 * rather than wearing an anchor that does nothing.
 *
 * A statusLine command receives the project root on STDIN instead, as
 * `workspace.project_dir` — a different mechanism, not a different spelling, so
 * fixing it is its own change.
 */
export const ANCHORABLE_SURFACES = Object.freeze({
  hooks: true,
  statusLine: false,
});

/**
 * A path to a project script as it appears in a shell command: at least one
 * directory segment, ending in an executable script extension. `settings.json`
 * does not match (the `\b` after `js` fails against the `o`), and neither does a
 * bare `verify.mjs` — a single-segment name is not a path this gate can judge.
 */
const SCRIPT_PATH = /(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.(?:mjs|cjs|js|sh)\b/g;

/**
 * Replace every single-quoted span with spaces of the same length, so what is
 * left is only the shell words that actually EXECUTE — and every index still
 * points where it did, so the caller can read the real prefix of a match.
 *
 * Deliberately conservative in both directions it can be wrong: a single quote
 * inside a double-quoted span is not treated as a delimiter, and an UNTERMINATED
 * quote leaves the remainder unmasked. Both choices over-report rather than
 * under-report, because a missed violation is the failure this exists to catch.
 */
function maskQuotedNarration(command) {
  const s = String(command ?? "");
  let out = "";
  let inDouble = false;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "\\") {
      out += c + (s[i + 1] ?? "");
      i += 2;
      continue;
    }
    if (c === '"') {
      inDouble = !inDouble;
      out += c;
      i += 1;
      continue;
    }
    if (c === "'" && !inDouble) {
      const close = s.indexOf("'", i + 1);
      if (close === -1) {
        out += s.slice(i); // unterminated — scan it rather than swallow it
        break;
      }
      out += `'${" ".repeat(close - i - 1)}'`;
      i = close + 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/**
 * The script paths this command EXECUTES without anchoring them to the project
 * directory — unique, in the order they appear. `[]` means the command is safe
 * to run from any cwd (or names no path at all).
 *
 * `anchorable` is the surface's answer from ANCHORABLE_SURFACES, and passing it
 * is not optional bookkeeping: on a surface where Claude Code never sets
 * CLAUDE_PROJECT_DIR, the anchor is TEXT THAT EXPANDS TO NOTHING. Crediting it
 * there would let writing the anchor clear the violation while the command stayed
 * exactly as broken — scoring an inert anchor as protection, which is the precise
 * failure this module's own note calls worse than no anchor at all.
 *
 * @param {string} command a shell command from settings.json
 * @param {{anchorable?: boolean}} [opts] does the anchor work on this surface?
 */
export function unanchoredPaths(command, { anchorable = true } = {}) {
  const masked = maskQuotedNarration(command);
  const found = [];
  for (const m of masked.matchAll(SCRIPT_PATH)) {
    const prefix = String(command).slice(0, m.index);
    if (anchorable && prefix.endsWith(`${PROJECT_DIR_ANCHOR}/`)) continue;
    if (!found.includes(m[0])) found.push(m[0]);
  }
  return found;
}

/**
 * Every command surface in a settings object that invokes an unanchored path —
 * `hooks` AND the top-level `statusLine`, because the statusLine is not a hook
 * and a rule applied only to `hooks` has already missed it once (see the
 * minimal-mode note above). `[]` is the clean result.
 *
 * @param {object} settings parsed .claude/settings.json content
 * @returns {Array<{surface:string, event:string|null, command:string, paths:string[]}>}
 */
export function anchorViolations(settings) {
  const out = [];
  const consider = (surface, kind, event, command) => {
    if (typeof command !== "string") return;
    // An unknown surface is treated as NOT anchorable on purpose: the safe
    // default is to withhold credit for an anchor nobody has established works
    // there, not to assume the variable reaches a place we have not checked.
    const anchorable = ANCHORABLE_SURFACES[kind] === true;
    const paths = unanchoredPaths(command, { anchorable });
    if (paths.length > 0) out.push({ surface, kind, event, command, paths });
  };
  for (const [event, groups] of Object.entries(settings?.hooks ?? {})) {
    if (!Array.isArray(groups)) continue;
    groups.forEach((group, g) => {
      if (!Array.isArray(group?.hooks)) return;
      group.hooks.forEach((hook, h) => {
        consider(`hooks.${event}[${g}].hooks[${h}]`, "hooks", event, hook?.command);
      });
    });
  }
  consider("statusLine", "statusLine", null, settings?.statusLine?.command);
  return out;
}

/**
 * The violations the anchor can actually FIX — hook commands only.
 *
 * A `statusLine` violation is just as real, and just as unfixable by this
 * mechanism (see ANCHORABLE_SURFACES), so a gate that demands zero must ask THIS
 * rather than `anchorViolations` — otherwise it demands a remedy that does not
 * exist and the only way to go green is to write an anchor that does nothing.
 * `anchorViolations` stays the honest total; this is the actionable subset.
 */
export function unfixedHookAnchors(settings) {
  // Filtering on ANCHORABLE_SURFACES rather than on "is it a hook" (`event !==
  // null`) matters for the surface that does not exist yet. The two spellings
  // agree today, because statusLine is the only non-hook surface read. They stop
  // agreeing the moment KD-88 is closed and `apiKeyHelper` / `awsCredentialExport`
  // join the walk: those carry no event either, so the hook-shaped predicate
  // would silently drop them from every gate that calls this.
  return anchorViolations(settings).filter((v) => ANCHORABLE_SURFACES[v.kind] === true);
}

/** One line per violation, for an assertion message that says what to fix. */
export function describeAnchorViolations(violations) {
  return violations
    .map((v) => `  ${v.surface}: ${v.paths.join(", ")} — in ${JSON.stringify(v.command)}`)
    .join("\n");
}
