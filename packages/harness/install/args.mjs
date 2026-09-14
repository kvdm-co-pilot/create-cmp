// The CLI's argument parser. It lives here, and not in `bin/prooflane.mjs`, for
// a reason worth keeping: a bin is reached through a SYMLINK once npm installs
// it (`node_modules/.bin/prooflane`), and any "am I the entry point?" guard
// added so a test could import the bin compares a realpathed module URL against
// an un-realpathed `process.argv[1]`. Those never match through a link, so the
// guard turns every `prooflane init | relock | upgrade` into a silent no-op that
// EXITS 0 — a CI step that installs the lane and checks `$?` passes with no lane
// installed. Measured 2026-09-13 against a real `npm pack` + `npm install`.
//
// So the bin keeps no guard and stays a bin. Logic that needs testing lives in a
// module, which is the thing that needed moving all along.

/**
 * The flags that take NO value, so the token after them is the user's.
 *
 * Without this a bare boolean ate the positional after it: `prooflane init
 * --new-profile ../app` installed into the CURRENT directory, 52 files, exit 0,
 * against a tree nobody named (KD-7). `--profile foo` and `--new-profile foo`
 * are syntactically identical, so no parser separates them unaided.
 *
 * IT NAMES THE BOOLEANS, NOT THE VALUE FLAGS. A name missing from this list
 * leaves that one flag behaving as it did — the old bug, no worse. A name
 * missing from a value list would turn a working `--profile svc` into a boolean
 * and drop `svc` into the positionals, a NEW break. Only one direction invents a
 * defect. Declaring a name is not free either, which is what the `true`/`false`
 * rule in `parseArgs` is for.
 */
export const BOOLEAN_FLAGS = new Set([
  "help", "h", "version", "v",
  "dry-run", "new-profile",
  "no-interview", "yes", "y",
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
  "profile", "target-dir",
  "dry-run", "new-profile", "no-interview", "yes", "y",
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
 * A value flag takes whatever follows. A BOOLEAN flag takes only the two words
 * that can mean anything to it — because `flagBool` is tri-state by contract
 * (`--x`, `--x true`, `--x false`, `--no-x`), and refusing the value form
 * outright makes `--verify false ./app` mean verify ON with a directory named
 * `false`: the flag inverted, and the wrong-directory defect re-created by its
 * own removal. Anything else after a boolean is the user's positional.
 */
export function consumesNext(key, next, booleans = BOOLEAN_FLAGS) {
  if (next === undefined || next.startsWith("--")) return false;
  if (!takesNoValue(key, booleans)) return true;
  return next === "true" || next === "false";
}

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
      flags[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }
    if (consumesNext(body, argv[i + 1])) {
      flags[body] = argv[i + 1];
      i += 1;
    } else {
      flags[body] = true;
    }
  }
  return { flags, positionals };
}
