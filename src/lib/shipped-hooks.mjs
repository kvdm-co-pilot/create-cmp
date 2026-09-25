// shipped-hooks.mjs — every command create-cmp's template has ever written into an
// app's .claude/settings.json, per surface, and which of them it ships today.
//
// WHY A TABLE, AND NOT A READING OF THE COMMAND. `create-cmp doctor` tells an adopter
// that a surface "is anchored and still works from any directory". It derived that
// sentence from the command's TEXT three times, three ways — the detector's silence,
// the anchor's presence, the detector's list subtracted from the anchor's presence —
// and each was wrong in a new spelling, because the thing that decides whether a
// command runs from another directory is the shell, and a reading of the text is a
// second opinion with its own blind spots (KD-86's bare basename, KD-87's
// `sh -c '…'`). The reviewer's test for it
// (test/doctor-claims-working-for-a-surface-a-foreign-cwd-cannot-run.test.mjs) is an
// execution, not a parse.
//
// So the claim is now made about BYTES doctor can recognise, never about a grammar it
// would have to understand: a surface works from any directory when its command is
// byte-for-byte (surrounding whitespace aside) a form this table marks `current` and
// `anchored` — and `anchored` is itself proven by executing the form from a foreign
// directory, in test/shipped-hooks-table.test.mjs. Any other command is one doctor has
// not run, and it says that instead of guessing in either direction.
//
// HOW THE TABLE STAYS TRUE, all in test/shipped-hooks-table.test.mjs, reading the
// template and git at test time rather than restating either: every command the
// template carries today is here as `current` for its surface; every command the file
// has carried in its git history is here; nothing is `current` that the template no
// longer ships; every superseded form names a current successor on its own surface.
// The strings below were taken from `git show <commit>:template/.claude/settings.json`,
// not typed.
//
// WHAT THE HEAL MAY REWRITE (`healedForm`), which is narrower than "superseded":
//
//   - a superseded form whose successor differs from it ONLY BY THE ANCHOR — derived,
//     not declared: strip `"${CLAUDE_PROJECT_DIR:-.}/…"` back to `…` in the successor
//     and the old command comes back byte-for-byte. That rewrite runs the same script
//     at the project root and the right one everywhere else, whatever lane version the
//     app carries;
//   - on a surface where the anchor works at all (ANCHORABLE_SURFACES). The status line
//     is never rewritten: the variable is not set for it, and no anchored successor
//     exists (KD-90).
//
// The narration forms (SessionStart, PreToolUse) are superseded too, and deliberately
// NOT rewritten. Their successors describe a newer lane — a script path that moved, a
// changed definition of "done" — and an app whose lane predates that change would have
// its agent told something false about its own tree. They are recorded so the history
// test can hold, and so no future heal mistakes them for commands an app wrote.

import { ANCHORABLE_SURFACES, PROJECT_DIR_ANCHOR } from "./hooks.mjs";

/**
 * @typedef {object} ShippedCommand
 * @property {string} id           stable name for this form
 * @property {string} surface      the settings.hooks event, or "statusLine"
 * @property {"current"|"superseded"} status  does the template ship it today?
 * @property {string} command      the exact command string, as git has it
 * @property {string} [successor]  superseded only: the id of the current form that replaced it
 * @property {boolean} [anchored]  current only: proven, by execution, to run its script from any directory
 * @property {string} shipped      the commits that first and last carried it (template/.claude/settings.json)
 * @property {string} [why]        superseded only: what the successor changed, for the adopter-facing report
 */

/** @type {ReadonlyArray<Readonly<ShippedCommand>>} */
export const SHIPPED_COMMANDS = Object.freeze(
  [
    {
      id: "stop-receipt-relative",
      surface: "Stop",
      status: "superseded",
      successor: "stop-receipt-anchored",
      shipped: "fc4dd3e … ff6c304 (through 0.26.2)",
      why: "names qa/receipt-check.mjs relative to the SESSION's directory, so a session started anywhere but the project root loses the Stop gate",
      command: "node qa/receipt-check.mjs --hook",
    },
    {
      id: "stop-receipt-anchored",
      surface: "Stop",
      status: "current",
      anchored: true,
      shipped: "e326c24 (0.26.3) …",
      command: "node \"${CLAUDE_PROJECT_DIR:-.}/qa/receipt-check.mjs\" --hook",
    },
    {
      id: "prompt-walk-relative",
      surface: "UserPromptSubmit",
      status: "superseded",
      successor: "prompt-walk-anchored",
      shipped: "8f09cc7 … ff6c304 (through 0.26.2)",
      why: "names qa/walk-status.mjs relative to the SESSION's directory, and `|| true` turns a session started anywhere but the project root into a hook that prints nothing",
      command: "test -f qa/walk-status.mjs && node qa/walk-status.mjs --inject || true",
    },
    {
      id: "prompt-walk-anchored",
      surface: "UserPromptSubmit",
      status: "current",
      anchored: true,
      shipped: "e326c24 (0.26.3) …",
      command: "test -f \"${CLAUDE_PROJECT_DIR:-.}/qa/walk-status.mjs\" && node \"${CLAUDE_PROJECT_DIR:-.}/qa/walk-status.mjs\" --inject || true",
    },
    {
      // Relative on purpose and still current: the anchor is inert on this surface
      // (KD-90), so there is no anchored form to ship and none to credit.
      id: "statusline-walk",
      surface: "statusLine",
      status: "current",
      anchored: false,
      shipped: "8f09cc7 …",
      command: "test -f qa/walk-status.mjs && node qa/walk-status.mjs --statusline || true",
    },
    {
      id: "session-start-committed-receipt",
      surface: "SessionStart",
      status: "superseded",
      successor: "session-start-attesting-receipt",
      shipped: "0efa131 … 8f09cc7",
      why: "said done is a committed receipt; done is a receipt that attests this tree",
      command: "printf '%s' '{\"hookSpecificOutput\":{\"hookEventName\":\"SessionStart\",\"additionalContext\":\"This app is governed by its delivery contract (CLAUDE.md): behavior starts in specs/, done is `node qa/verify.mjs` with a committed receipt, approvals gate signed artifacts. The cmp-inspector MCP tools (preview loop, live tier) are the expected eyes \u2014 if they are absent from this session, that is a fault to diagnose (plugin disabled, session predates plugin enablement, or stale plugin copy; see cmp-doctor), not a cue to fall back to screenshots or blind adb.\"}}'",
    },
    {
      id: "session-start-attesting-receipt",
      surface: "SessionStart",
      status: "current",
      shipped: "f77e1cf …",
      command: "printf '%s' '{\"hookSpecificOutput\":{\"hookEventName\":\"SessionStart\",\"additionalContext\":\"This app is governed by its delivery contract (CLAUDE.md): behavior starts in specs/, done is `node qa/verify.mjs` with a receipt that attests this tree (commit it with the change), approvals gate signed artifacts. The cmp-inspector MCP tools (preview loop, live tier) are the expected eyes \u2014 if they are absent from this session, that is a fault to diagnose (plugin disabled, session predates plugin enablement, or stale plugin copy; see cmp-doctor), not a cue to fall back to screenshots or blind adb.\"}}'",
    },
    {
      id: "pretooluse-screenshots",
      surface: "PreToolUse",
      status: "current",
      shipped: "0efa131 …",
      command: "grep -qE 'screencap|uiautomator dump' && printf '%s' '{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"allow\",\"permissionDecisionReason\":\"Reminder: raw pixels/blind taps lose structure. If cmp-inspector is connected, inspect_tree reads the semantic tree and navigate_and_inspect gives verified taps; if its tools are missing, diagnose first (cmp-doctor, Inspector MCP section).\"}}' || true",
    },
    {
      id: "pretooluse-device-lease-old-path",
      surface: "PreToolUse",
      status: "superseded",
      successor: "pretooluse-device-lease",
      shipped: "20ca82b … 8f09cc7",
      why: "named qa/lib/device-lease.mjs before the lease moved under qa/lib/profiles/cmp/, and matched no emulator or installDebug command",
      command: "grep -qE 'connected[A-Za-z]*AndroidTest|maestro test|adb (-s [^ ]+ )?(install|uninstall)' && printf '%s' '{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"allow\",\"permissionDecisionReason\":\"Reminder: device evidence is lane-owned and batched. node qa/verify.mjs sequences the device steps once, last, under a machine-global per-serial lease (qa/lib/device-lease.mjs) \u2014 the one device is scarce, slow, and fragile, so device proof is a checkpoint, never an inner loop. Driving it by hand mid-task risks colliding with a running lane (wedged adbd, device offline, false reds, crossed app state). Ad-hoc debugging stays allowed; batch the evidence into the lane.\"}}' || true",
    },
    {
      id: "pretooluse-device-lease",
      surface: "PreToolUse",
      status: "current",
      shipped: "f77e1cf …",
      command: "grep -qE 'connected[A-Za-z]*AndroidTest|maestro test|adb (-s [^ ]+ )?(install|uninstall)|emulator (-avd|@)|:composeApp:installDebug' && printf '%s' '{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"allow\",\"permissionDecisionReason\":\"Reminder: device evidence is lane-owned and batched. node qa/verify.mjs sequences the device steps once, last, under a machine-global per-serial lease (qa/lib/profiles/cmp/device-lease.mjs) \u2014 the one device is scarce, slow, and fragile, so device proof is a checkpoint, never an inner loop. Driving it by hand mid-task risks colliding with a running lane (wedged adbd, device offline, false reds, crossed app state). Ad-hoc debugging stays allowed; batch the evidence into the lane.\"}}' || true",
    },
    {
      id: "pretooluse-fast-lane",
      surface: "PreToolUse",
      status: "current",
      shipped: "20ca82b …",
      command: "in=$(cat); printf '%s' \"$in\" | grep -qE 'node qa/verify\\.mjs' && ! printf '%s' \"$in\" | grep -q -- '--fast' && printf '%s' '{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"allow\",\"permissionDecisionReason\":\"Reminder: for inner-loop iteration, node qa/verify.mjs --fast skips the device/release tier (releaseBuild, tokenDrift, e2eSmoke, androidChecks, releaseSmoke) and is much quicker. Run the full lane once, deliberately, before reporting work done \u2014 never speculatively, and never to re-confirm a result you already have. A --fast receipt never satisfies the done-gate.\"}}' || true",
    },
  ].map((entry) => Object.freeze(entry))
);

/** "statusLine" for the status line, "hooks" for every hook event — the ANCHORABLE_SURFACES key. */
export function surfaceKind(surface) {
  return surface === "statusLine" ? "statusLine" : "hooks";
}

/**
 * The table's entry for this command on this surface, or null. Byte equality after
 * trimming surrounding whitespace — the one allowance, because JSON authors pad and
 * the shell does not care. A command on the wrong surface is not a shipped form.
 * @param {string} surface
 * @param {unknown} command
 * @returns {Readonly<ShippedCommand>|null}
 */
export function shippedForm(surface, command) {
  if (typeof command !== "string") return null;
  const bytes = command.trim();
  return SHIPPED_COMMANDS.find((e) => e.surface === surface && e.command === bytes) ?? null;
}

/** The forms the template ships today on this surface. */
export function currentForms(surface) {
  return SHIPPED_COMMANDS.filter((e) => e.surface === surface && e.status === "current");
}

/** The current form a superseded one was replaced by, or null. */
export function successorOf(form) {
  if (!form || form.status !== "superseded") return null;
  return SHIPPED_COMMANDS.find((e) => e.id === form.successor && e.status === "current") ?? null;
}

/**
 * May doctor say this command runs from any directory? Only when it is byte-for-byte
 * a current form proven to, on a surface where the anchor is set at all. There is no
 * other route to that sentence, and there must never be one: every other route this
 * repository tried was a reading of the command that the shell did not share.
 */
export function worksFromAnyDirectory(surface, command) {
  const form = shippedForm(surface, command);
  return (
    form !== null &&
    form.status === "current" &&
    form.anchored === true &&
    ANCHORABLE_SURFACES[surfaceKind(surface)] === true
  );
}

const ANCHORED_PATH = new RegExp(`"${PROJECT_DIR_ANCHOR.replace(/[$.{}:-]/g, "\\$&")}/([^"]*)"`, "g");

/** The command with every `"${CLAUDE_PROJECT_DIR:-.}/<path>"` written back as `<path>`. */
export function withoutAnchor(command) {
  return String(command).replace(ANCHORED_PATH, "$1");
}

/**
 * The command the heal may write in place of this form, or null when it may not.
 * See the header: superseded, on an anchorable surface, and differing from its
 * successor by the anchor alone — which is checked here, not declared in the table.
 */
export function healedForm(form) {
  const next = successorOf(form);
  if (next === null) return null;
  if (ANCHORABLE_SURFACES[surfaceKind(form.surface)] !== true) return null;
  if (next.command === form.command || withoutAnchor(next.command) !== form.command) return null;
  return next.command;
}

/**
 * Every command a parsed settings object carries, with its surface and location —
 * `hooks.<Event>[g].hooks[h]` or `statusLine`, the spelling `anchorViolations` uses.
 * @returns {Array<{surface:string, location:string, command:unknown}>}
 */
export function settingsCommands(settings) {
  const out = [];
  for (const [event, groups] of Object.entries(settings?.hooks ?? {})) {
    if (!Array.isArray(groups)) continue;
    groups.forEach((group, g) => {
      if (!Array.isArray(group?.hooks)) return;
      group.hooks.forEach((hook, h) => {
        out.push({ surface: event, location: `hooks.${event}[${g}].hooks[${h}]`, command: hook?.command });
      });
    });
  }
  if (settings?.statusLine && typeof settings.statusLine === "object") {
    out.push({ surface: "statusLine", location: "statusLine", command: settings.statusLine.command });
  }
  return out;
}

/**
 * The commands in these settings the heal would rewrite, and to what.
 * @returns {Array<{surface:string, location:string, command:string, successor:string, why:string}>}
 */
export function healableCommands(settings) {
  const out = [];
  for (const { surface, location, command } of settingsCommands(settings)) {
    const form = shippedForm(surface, command);
    const successor = healedForm(form);
    if (successor !== null) out.push({ surface, location, command, successor, why: form.why ?? "" });
  }
  return out;
}

// ---------------------------------------------------------------------------
// THE REWRITE — in place, in the file's own bytes.
// ---------------------------------------------------------------------------
//
// The file is the app's. Parsing it and writing `JSON.stringify(settings, null, 2)`
// back would change bytes nobody asked about — `\u2014` becomes `—`, the app's own
// indentation becomes ours — and a diff an adopter did not ask for is a tree they did
// not ask for. So the rewrite finds each command's string TOKEN in the raw text and
// replaces those bytes and nothing else. The scan below is a small JSON reader that
// records where each string value sits; its result is checked against JSON.parse
// before anything is written, so the two readers cannot silently disagree.

/**
 * Every string value in a JSON text, with its key path and its [start, end) span.
 * Throws on anything JSON.parse would refuse.
 * @param {string} raw
 * @returns {Array<{path:Array<string|number>, start:number, end:number, value:string}>}
 */
function stringTokens(raw) {
  const out = [];
  let i = 0;
  const fail = (what) => {
    throw new SyntaxError(`${what} at offset ${i}`);
  };
  const ws = () => {
    while (i < raw.length && (raw[i] === " " || raw[i] === "\t" || raw[i] === "\n" || raw[i] === "\r")) i += 1;
  };
  const str = () => {
    const start = i;
    i += 1;
    while (i < raw.length) {
      if (raw[i] === "\\") {
        i += 2;
        continue;
      }
      if (raw[i] === '"') {
        i += 1;
        return { start, end: i, value: JSON.parse(raw.slice(start, i)) };
      }
      i += 1;
    }
    return fail("unterminated string");
  };
  const LITERAL = /true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const value = (p) => {
    ws();
    const c = raw[i];
    if (c === '"') {
      out.push({ path: p, ...str() });
      return;
    }
    if (c === "{") {
      i += 1;
      ws();
      if (raw[i] === "}") {
        i += 1;
        return;
      }
      for (;;) {
        ws();
        if (raw[i] !== '"') fail("expected a key");
        const key = str().value;
        ws();
        if (raw[i] !== ":") fail("expected ':'");
        i += 1;
        value([...p, key]);
        ws();
        if (raw[i] === ",") {
          i += 1;
          continue;
        }
        if (raw[i] === "}") {
          i += 1;
          return;
        }
        fail("expected ',' or '}'");
      }
    }
    if (c === "[") {
      i += 1;
      ws();
      if (raw[i] === "]") {
        i += 1;
        return;
      }
      for (let n = 0; ; n += 1) {
        value([...p, n]);
        ws();
        if (raw[i] === ",") {
          i += 1;
          continue;
        }
        if (raw[i] === "]") {
          i += 1;
          return;
        }
        fail("expected ',' or ']'");
      }
    }
    LITERAL.lastIndex = i;
    const m = LITERAL.exec(raw);
    if (!m) fail("unexpected token");
    i += m[0].length;
  };
  value([]);
  ws();
  if (i !== raw.length) fail("trailing content");
  return out;
}

/** `hooks.<Event>[g].hooks[h]` / `statusLine` for a command token's path, or null. */
function commandLocation(p) {
  if (p.length === 6 && p[0] === "hooks" && typeof p[2] === "number" && p[3] === "hooks" && typeof p[4] === "number" && p[5] === "command") {
    return { surface: p[1], location: `hooks.${p[1]}[${p[2]}].hooks[${p[4]}]` };
  }
  if (p.length === 2 && p[0] === "statusLine" && p[1] === "command") return { surface: "statusLine", location: "statusLine" };
  return null;
}

function setAt(obj, p, v) {
  let cur = obj;
  for (const k of p.slice(0, -1)) cur = cur[k];
  cur[p[p.length - 1]] = v;
}

function sameJson(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && sameJson(a[k], b[k]));
}

/**
 * Plan the heal over a settings.json TEXT: which commands it rewrites, and the new
 * text — identical to `raw` outside the replaced string tokens. null when the text
 * is not JSON, or when the in-place edit and JSON.parse disagree about the result
 * (a duplicate key, say), in which case nothing is written. `skipped` names each shipped
 * form it leaves where it stands, and why — the words `--fix` declines with and the
 * finding's by-hand offer both print, so neither states the rule a second time.
 * @param {string} raw
 * @returns {{rewrites: Array<{surface:string, location:string, from:string, to:string, why:string}>,
 *           skipped: Array<{surface:string, location:string, from:string, reason:string}>, content:string}|null}
 */
export function planShippedHookHeal(raw) {
  let settings;
  let tokens;
  try {
    settings = JSON.parse(raw);
    tokens = stringTokens(raw);
  } catch {
    return null;
  }
  const located = tokens
    .map((t) => ({ ...t, at: commandLocation(t.path) }))
    .filter((t) => t.at !== null);
  const seen = new Map();
  for (const t of located) seen.set(t.at.location, (seen.get(t.at.location) ?? 0) + 1);

  const rewrites = [];
  const skipped = [];
  const expected = structuredClone(settings);
  let content = "";
  let cursor = 0;
  for (const t of located) {
    const form = shippedForm(t.at.surface, t.value);
    const to = healedForm(form);
    if (to === null) continue;
    if (seen.get(t.at.location) !== 1) {
      // a duplicate key: which one runs is JSON.parse's call, not ours
      if (!skipped.some((k) => k.location === t.at.location)) {
        skipped.push({ surface: t.at.surface, location: t.at.location, from: t.value, reason: HEAL_SKIPS.duplicate });
      }
      continue;
    }
    content += raw.slice(cursor, t.start) + JSON.stringify(to);
    cursor = t.end;
    setAt(expected, t.path, to);
    rewrites.push({ surface: t.at.surface, location: t.at.location, from: t.value, to, why: form.why ?? "" });
  }
  content += raw.slice(cursor);
  if (rewrites.length === 0) return { rewrites, skipped, content: raw };
  let reparsed;
  try {
    reparsed = JSON.parse(content);
  } catch {
    return null;
  }
  return sameJson(reparsed, expected) ? { rewrites, skipped, content } : null;
}

/**
 * Why the heal leaves a shipped form where it stands, in words that complete
 * "--fix: not writing … — ". Here, beside the planner, and nowhere else.
 */
export const HEAL_SKIPS = {
  duplicate:
    "that location is written more than once in the file (a key on its path is duplicated), and which copy " +
    "runs is JSON.parse's call, not doctor's",
  unplanned:
    "an edit of the file's own bytes cannot be matched to what JSON.parse reads from it (a key on the path is " +
    "duplicated, say), and a file doctor cannot account for is never rewritten",
};

/**
 * THE ONE JUDGEMENT of which shipped forms `--fix` rewrites, for both of its readers:
 * the finding that offers the heal (`gatherHookInputs`) and the heal that performs it
 * (`healShippedHookCommands`). The diagnosis sees commands through JSON.parse and the
 * heal edits the text, and an offer judged by one while the write was judged by the
 * other printed `fix (--fix):` over a file `--fix` then left untouched (KD-237's class).
 * So every command JSON.parse calls healable lands in exactly one list here: `healed`,
 * which the plan rewrites, or `skipped`, which it does not, with the plan's reason.
 * @param {string} raw
 * @returns {{plan: ReturnType<typeof planShippedHookHeal>,
 *           healed: ReturnType<typeof healableCommands>,
 *           skipped: Array<ReturnType<typeof healableCommands>[number] & {reason:string}>}|null}
 *          null = not JSON.
 */
export function shippedHookHealVerdict(raw) {
  let settings;
  try {
    settings = JSON.parse(raw);
  } catch {
    return null;
  }
  let plan;
  try {
    plan = planShippedHookHeal(raw);
  } catch {
    // A planner that cannot plan heals nothing: the diagnosis must not die of it.
    plan = null;
  }
  const rewritten = new Set((plan?.rewrites ?? []).map((r) => r.location));
  const healable = healableCommands(settings);
  return {
    plan,
    healed: healable.filter((h) => rewritten.has(h.location)),
    skipped: healable
      .filter((h) => !rewritten.has(h.location))
      .map((h) => ({ ...h, reason: plan?.skipped.find((k) => k.location === h.location)?.reason ?? HEAL_SKIPS.unplanned })),
  };
}
