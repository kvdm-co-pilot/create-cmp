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

/** Does this hook's command presuppose the verify lane (`qa/`)? */
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
 * second file to hold in sync (light is a filter, not a fork). Three edits:
 *
 *   (a) enforcement goes — the Stop hook is Act 3;
 *   (b) lane-advisory goes — a nudge naming qa/ presupposes the lane;
 *   (c) SessionStart says what is true HERE — `sessionContext` describes what
 *       this scaffold carries and the one command that adds the rest.
 *
 * @param {object} settings parsed .claude/settings.json content
 * @param {object} opts
 * @param {string} opts.sessionContext additionalContext for the SessionStart hook
 */
export function minimalHookSettings(settings, { sessionContext }) {
  const out = filterHooks(settings, (event, hook) => classifyHook(event, hook) !== "advisory");
  if (!out || typeof out.hooks !== "object" || out.hooks === null) return out;
  for (const group of out.hooks.SessionStart ?? []) {
    if (!Array.isArray(group?.hooks)) continue;
    for (const hook of group.hooks) hook.command = sessionStartCommand(sessionContext);
  }
  return out;
}
