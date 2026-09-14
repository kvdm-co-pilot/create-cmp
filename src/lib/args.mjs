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
 * Parse argv into positionals + flags. `--flag value` captures the value, unless
 * `--flag` takes none — then `value` stays the user's positional.
 * @param {string[]} argv
 * @returns {{_: string[], flags: Record<string, string|boolean>}}
 */
export function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      if (consumesNext(key, argv[i + 1])) {
        args.flags[key] = argv[i + 1];
        i++;
      } else {
        args.flags[key] = true;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

/**
 * Tri-state boolean flag: `--name`/`--name true` → true, `--no-name`/`--name false`
 * → false, otherwise the default.
 */
export function flagBool(flags, name, dflt) {
  if (flags[name] === true || flags[name] === "true") return true;
  if (flags[`no-${name}`] === true || flags[name] === "false") return false;
  return dflt;
}
