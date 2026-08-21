// hooks.mjs — the advisory/enforcement split for a stamped project's hook set.
//
// The template's .claude/settings.json carries two different kinds of hook, and
// the difference is the exact line between the product's Act 2 and Act 3:
//
//   DISCOVERY (advisory)  — SessionStart context + PreToolUse nudges. Every one
//     resolves to permissionDecision "allow" with a reason: they inform the
//     agent at the moment of a wall and constrain nothing. These ship in EVERY
//     mode: an advisory hook is how a light scaffold tells a stuck agent that
//     better eyes exist, without ever blocking it.
//
//   ENFORCEMENT           — the Stop hook (qa/receipt-check.mjs --hook). It
//     refuses "done" without a fresh PASS receipt. It is the harness's teeth,
//     it presumes qa/ exists, and it ships only with the full harness.
//
// The classifier is BY EVENT, not by inspecting command strings: Stop is where
// Claude Code enforces (it can block the session from ending), so any hook
// registered there is enforcement by construction. SessionStart and PreToolUse
// entries that merely annotate an allow are advisory by construction — and if
// a future PreToolUse hook ever wanted to DENY, that would be an enforcement
// decision to make deliberately here, not a string to pattern-match.

const ENFORCEMENT_EVENTS = new Set(["Stop", "SubagentStop"]);

/** Events whose hooks constrain the agent (vs inform it). Exposed for tests. */
export function isEnforcementEvent(event) {
  return ENFORCEMENT_EVENTS.has(event);
}

/**
 * Return a deep-copied settings object with enforcement hooks removed —
 * the hook set a light-mode scaffold ships. Advisory hooks pass through
 * untouched; an empty hooks object stays valid Claude Code settings.
 *
 * @param {object} settings parsed .claude/settings.json content
 * @returns {object} new settings object, input never mutated
 */
export function stripEnforcementHooks(settings) {
  const out = structuredClone(settings);
  if (!out || typeof out.hooks !== "object" || out.hooks === null) return out;
  for (const event of Object.keys(out.hooks)) {
    if (isEnforcementEvent(event)) delete out.hooks[event];
  }
  return out;
}
