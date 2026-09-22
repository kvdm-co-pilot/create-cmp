// Tiny shared arg parser for the CLI (moved verbatim from bin/create-cmp.mjs
// when the bin became a thin subcommand dispatcher). No new behavior.

/**
 * The flags that take NO value, so the token after them belongs to the user.
 *
 * DERIVED FROM `flagBool`'S CALL SITES, which is where this list went wrong the
 * first time: reading `flags.x === true` found eight names and missed thirteen
 * more reached through `flagBool` and `flagBoolWithAlias` — `--inspector
 * ./my-app` ate the directory AND silently fell back to the default.
 * `test/a-flag-is-boolean-to-one-reader-and-not-to-the-other.test.mjs` derives
 * the same set by scanning and refuses this list when the two disagree, so it
 * cannot drift again by hand.
 *
 * Value flags stay absent and are checked at their call sites with `typeof ===
 * "string"`: profile, target-dir, base-dir, set, specs, receipt, citation-roots,
 * name, package, bundle-id, region, theme-prefix, auth, tabs.
 */
export const BOOLEAN_FLAGS = new Set([
  "help", "h", "version", "v",
  // `y` is read by neither CLI any more, and is declared anyway: an undeclared
  // name is one that EATS the token after it, so a dead alias left off this list
  // is `create-cmp harness init --y ../app` writing 52 files into the cwd. That
  // was still true on this branch after KD-7 was "fixed", through this door only
  // — declaring a flag boolean protects the user's positional whether or not
  // anything reads the flag.
  "yes", "y", "force", "fix", "harness",
  // every name `flagBool`/`flagBoolWithAlias` reads
  "minimal", "verify", "ios", "firebase", "firestore", "storage", "functions",
  "fcm", "room", "e2e", "appium", "inspector", "dev-client",
  // the installer's own, so both front doors into it classify alike
  "dry-run", "dry-run-verify", "no-install", "new-profile", "no-interview",
]);

/**
 * The flags this front door documents, in any command.
 *
 * A name absent from here is REFUSED rather than guessed at. That is the whole
 * of the fix for six log entries that were really one defect: an argument the
 * CLI does not recognise was parsed as best it could be and the command ran
 * anyway — usually by eating the directory that followed it. A longer list of
 * booleans could never reach `--verfiy` (a typo) or `-y` (a single dash), and a
 * refusal reaches all of them.
 *
 * It is one set for every command rather than one per command on purpose: a
 * per-command set refuses a flag that IS documented elsewhere, which trades a
 * swallowed directory for a rejected valid invocation. Accepting a meaningless
 * but real flag is the cheaper mistake.
 */
export const KNOWN_FLAGS = new Set([
  "help", "h", "version", "v",
  // scaffold
  "name", "package", "bundle-id", "base-dir", "target-dir", "theme-prefix",
  "set", "specs", "receipt", "citation-roots", "region", "auth", "tabs",
  "minimal", "yes", "y", "force", "fix", "verify", "no-install",
  // the feature toggles `flagBool`/`flagBoolWithAlias` read (their `no-` twins
  // are known by construction, not by being listed twice)
  "ios", "firebase", "firestore", "storage", "functions", "fcm", "room",
  "e2e", "appium", "inspector", "dev-client",
  // the harness subcommand, which shares an installer with prooflane
  "harness", "profile", "dry-run", "dry-run-verify", "new-profile", "no-interview",
  // takes a VALUE (the manifest path) — never a boolean, see args.mjs in the
  // harness package for why that distinction is load-bearing
  "fleet",
]);

/**
 * The argument names this door cannot account for. `no-x` is known when `x` is,
 * because `flagBool` reads them as one flag.
 */
export function unknownFlags(flags, known = KNOWN_FLAGS) {
  return Object.keys(flags).filter((k) => {
    const base = k.startsWith("no-") ? k.slice(3) : k;
    return !known.has(k) && !known.has(base);
  });
}

/** Is this flag one that takes no value? `no-` is boolean by construction. */
export function takesNoValue(key, booleans = BOOLEAN_FLAGS) {
  return booleans.has(key) || key.startsWith("no-");
}

/**
 * Should `next` be read as this flag's value?
 *
 * A value flag takes whatever follows. A BOOLEAN flag takes only `true` or
 * `false` — because `flagBool` below is tri-state by contract, and refusing the
 * value form outright makes `--verify false ./my-app` mean verify ON with a
 * directory named `false`: the flag inverted, and the wrong-directory defect
 * re-created by its own removal. Anything else after a boolean is a positional.
 */
export function consumesNext(key, next, booleans = BOOLEAN_FLAGS) {
  if (next === undefined || next.startsWith("--")) return false;
  if (!takesNoValue(key, booleans)) return true;
  return next === "true" || next === "false";
}

/**
 * A declared boolean's VALUE form, as the boolean it MEANS.
 *
 * `consumesNext` lets `--dry-run true` past because `flagBool` is tri-state by
 * contract. What arrived at the readers was the STRING, and it was wrong in
 * both directions at once (KD-16). Measured on `8bd782a`, 2026-09-19:
 *
 *   Boolean("false") === true
 *     create-cmp my-app --no-firebase true   → firebase: true, scaffolded anyway
 *     prooflane init --new-profile false <claimed tree>
 *                                           → the claimed-tree refusal never fired
 *   "true" !== true, and ~24 readers spell `=== true`
 *     create-cmp upgrade --dry-run true --yes → "(auto-yes)", "✓ wrote
 *                                              gradle/libs.versions.toml", "Applied."
 *
 * Normalizing HERE, at the parser, is what makes every one of those readers —
 * `=== true`, `!== true`, `Boolean(...)`, bare truthiness — correct at both
 * front doors without touching a single one of them. A fix at the read sites
 * has to find all of them today and again tomorrow.
 *
 * ANYTHING ELSE IS LEFT EXACTLY AS IT ARRIVED. `--minimal my-app` must keep
 * meaning a directory called `my-app`, and an adopter may legitimately have one
 * called `no` — refusing the space form here is how KD-7 comes back.
 */
export function coerceDeclaredBoolean(key, value, booleans = BOOLEAN_FLAGS) {
  if (!takesNoValue(key, booleans)) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

/**
 * Declared booleans that reached the flag set still holding a STRING.
 *
 * After `coerceDeclaredBoolean` a boolean can only still hold a string when its
 * value was ATTACHED with `=`, which never consults `consumesNext` —
 * `create-cmp upgrade --dry-run=maybe`, which would otherwise run as a REAL
 * upgrade because `"maybe"` is not `true`. Until `parseArgs` split `=` (KD-14)
 * this door could not produce the shape and this reader found nothing here
 * (KD-153); it is the same function as the harness door's, and now reachable at
 * both.
 *
 * `=`-only is the whole safety argument: an attached value has no positional to
 * lose, where refusing the SPACE form would make `--dry-run maybe ../app` an
 * error instead of a directory named `maybe` — KD-7's shape, re-created.
 */
export function unreadableBooleanValues(flags, booleans = BOOLEAN_FLAGS) {
  return Object.keys(flags).filter((k) => takesNoValue(k, booleans) && typeof flags[k] === "string");
}

/**
 * Parse argv into positionals + flags. `--flag value` captures the value, unless
 * `--flag` takes none — then `value` stays the user's positional. `--flag=value`
 * attaches it, whatever the flag.
 *
 * THE SAME LOOP AS `packages/harness/install/args.mjs`'s, token for token, and
 * pinned so by `test/a-declared-booleans-value-arrives-as-a-string.test.mjs`
 * with only the return set aside — this door names its positionals `_`.
 * @param {string[]} argv
 * @returns {{_: string[], flags: Record<string, string|boolean>}}
 */
export function parseArgs(argv) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      positionals.push(a);
      continue;
    }
    // `--` IS NOT A FLAG NAME, it is the POSIX end-of-options separator, and npx
    // forwards it verbatim: `npm create <pkg> my-app -- --flag` is the shape
    // every create-* CLI teaches, and both doors advertise `npx …` in their own
    // help. `a.slice(2)` turns it into the EMPTY key, which the unknown-argument
    // check then named back at the user as a flag they had never typed — a
    // working invocation became exit 2.
    //
    // It is dropped rather than honoured as strict POSIX, because the intent in
    // that shape is the opposite of POSIX's: the user writing `-- --dry-run`
    // means `--dry-run` to be a FLAG, not a positional. Inert is what makes the
    // separator change nothing.
    if (a === "--") continue;

    const body = a.slice(2);
    const eq = body.indexOf("=");
    if (eq !== -1) {
      // `--name=value` IS SPLIT HERE, at the first `=`, as prooflane's door
      // always has (KD-14). Before, `--dry-run=true` arrived as a flag literally
      // named `dry-run=true` and was refused as unknown — `create-cmp upgrade
      // --dry-run=true` exit 2, the same line a dry run at the other door.
      //
      // It never consults `consumesNext`: an attached value has no positional
      // to lose, so it is the flag's whatever it says. A declared boolean still
      // gets the coercion its space form gets (`--dry-run=false` is false), and
      // anything else it carries stays a STRING, which the bin refuses by what
      // was typed (`unreadableBooleanValues`, KD-153).
      const key = body.slice(0, eq);
      flags[key] = coerceDeclaredBoolean(key, body.slice(eq + 1));
      continue;
    }
    if (consumesNext(body, argv[i + 1])) {
      flags[body] = coerceDeclaredBoolean(body, argv[i + 1]);
      i += 1;
    } else {
      flags[body] = true;
    }
  }
  return { _: positionals, flags };
}

/** One name's value as a tri-state: true, false, or "this name said nothing". */
function triState(value) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return undefined;
}

/**
 * Tri-state boolean flag. The whole truth table, both spellings:
 *
 *   --x        --x true    --no-x false   → true
 *   --no-x     --x false   --no-x true    → false
 *   absent                                → the default
 *
 * BOTH NAMES GO THROUGH ONE HELPER, which is the half of KD-16 that lived here
 * rather than in the parser: the old body read the value form of `x` and never
 * of `no-x`, while `consumesNext` consumed it either way — so `--no-ios true`
 * resolved to the DEFAULT and the flag the user typed did nothing at all.
 *
 * THE STRINGS ARE STILL READ, though `parseArgs` no longer produces one: this
 * is also called with flag objects assembled in code and in tests, and a helper
 * that answered two of its own three inputs would be the next KD-16.
 *
 * PRECEDENCE IS THE AFFIRMATIVE NAME'S, unchanged from the body it replaces and
 * now pinned by test: on a contradictory line — `--ios false --no-ios false`,
 * which neither door refuses — `x` answers and `no-x` is never consulted.
 */
export function flagBool(flags, name, dflt) {
  const stated = triState(flags[name]);
  if (stated !== undefined) return stated;
  const negated = triState(flags[`no-${name}`]);
  if (negated !== undefined) return !negated;
  return dflt;
}
