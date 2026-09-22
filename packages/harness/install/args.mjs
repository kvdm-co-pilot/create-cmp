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
  "no-interview",
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
  "dry-run", "new-profile", "no-interview",
  // `--fleet <manifest>` takes a VALUE, so it is known here and deliberately
  // absent from BOOLEAN_FLAGS — declaring it boolean would make
  // `upgrade --fleet ./fleet.json` mean "upgrade the fleet" plus a positional
  // directory called ./fleet.json, which is the KD-16 shape exactly.
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

/**
 * A declared boolean's VALUE form, as the boolean it MEANS.
 *
 * `consumesNext` lets `--dry-run true` past because the tri-state contract
 * promises it. What arrived at the readers was the STRING, and every reader in
 * this package was truthiness — `Boolean("false")` is `true` (KD-16). Measured
 * on `8bd782a`, 2026-09-19, against a tree the `cmp` profile claims:
 *
 *   prooflane init --new-profile false --dry-run --no-interview <claimed tree>
 *     → "51 files written", exit 0. The claimed-tree refusal at init.mjs:950
 *       never fired: `--new-profile false` said "no" and was read as "yes".
 *
 * Normalizing HERE, at the parser, makes every reader — truthiness, `=== true`,
 * `!== true` — correct without touching one of them, at whichever front door
 * the adopter came through.
 *
 * ANYTHING ELSE IS LEFT EXACTLY AS IT ARRIVED. `--dry-run maybe ../app` must
 * keep meaning a directory, not an error: refusing the space form here is how
 * KD-7 comes back.
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
 * After `coerceDeclaredBoolean` there is exactly one way to be here: a value
 * ATTACHED with `=`, which is split off above without ever consulting
 * `consumesNext` — `prooflane init --dry-run=maybe`, which used to run as a dry
 * run because a non-empty string is truthy, and after the coercion would run as
 * a REAL install because it is not `true`. Neither is what was typed.
 *
 * `=`-only is the whole safety argument: an attached value has no positional to
 * lose, where refusing the SPACE form would turn `--dry-run maybe ../app` into
 * an error instead of a directory named `maybe` — KD-7's shape, re-created by
 * its own guard.
 */
export function unreadableBooleanValues(flags, booleans = BOOLEAN_FLAGS) {
  return Object.keys(flags).filter((k) => takesNoValue(k, booleans) && typeof flags[k] === "string");
}

/**
 * Value-taking flags given an EMPTY value — `--target-dir=`, `--profile ""`.
 *
 * `init`, `relock` and `upgrade` all resolve their tree with `(typeof v ===
 * "string" && v) || positional || "."`, and `""` is falsy: an empty value is
 * indistinguishable from the flag not being there, so the install goes to the
 * CWD. Measured 2026-09-22 from an empty directory:
 *
 *   prooflane init --target-dir= --no-interview   → the lane's files into the cwd
 *
 * The line that produces it is a script's — `--target-dir=$DIR` or
 * `--target-dir "$DIR"` with `DIR` unset — which is KD-7 (fifty-two files into
 * the wrong repository, exit 0) reached by an empty value instead of a
 * swallowed one.
 *
 * REPORTED HERE AND REFUSED AT THE BIN, like `unreadableBooleanValues`: the
 * parser says what arrived, the door decides. `--fleet` has refused its own
 * empty value since fleet upgrades landed (`fleet.mjs`, "--fleet needs the path
 * to a fleet manifest") — this is that refusal for the class, before any
 * command runs, at both doors.
 *
 * A DECLARED BOOLEAN IS NOT HERE: `--dry-run=` is refused by
 * `unreadableBooleanValues` as a value it cannot mean, and the space form
 * `--dry-run ""` leaves `""` a positional, which is the user's to own (KD-7).
 */
export function emptyValues(flags, booleans = BOOLEAN_FLAGS) {
  return Object.keys(flags).filter((k) => !takesNoValue(k, booleans) && flags[k] === "");
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
 * THIS PACKAGE HAD NO SUCH READER AT ALL, which was the other half of KD-16:
 * `consumesNext` consumed `--dry-run false` on the strength of a contract that
 * only the other door implemented, and every reader here was `Boolean(...)`.
 * The six that matter now call this — init's dry run, its claimed-tree refusal
 * and its interview, and the dry run of relock, upgrade and fleet.
 *
 * It is the SAME function as `src/lib/args.mjs`'s, pinned equal by
 * `test/a-declared-booleans-value-arrives-as-a-string.test.mjs` rather than
 * shared through an import: neither package depends on the other, and the
 * published root tarball carries no copy of this directory
 * (`docs/proposals/PACKAGE-SPLIT.md` holds that decision).
 */
export function flagBool(flags, name, dflt) {
  const stated = triState(flags[name]);
  if (stated !== undefined) return stated;
  const negated = triState(flags[`no-${name}`]);
  if (negated !== undefined) return !negated;
  return dflt;
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
      // The `=` form splits BEFORE `consumesNext` is asked anything, so it is a
      // second door into the same flag set and it needs the same coercion —
      // `--dry-run=false` is the identical promise to `--dry-run false`.
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
  return { flags, positionals };
}
