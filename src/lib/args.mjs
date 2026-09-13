// Tiny shared arg parser for the CLI (moved verbatim from bin/create-cmp.mjs
// when the bin became a thin subcommand dispatcher). No new behavior.

/**
 * The flags that take NO value, so the token after them belongs to the user.
 *
 * Derived by reading every call site rather than by taste: `specs`, `receipt`,
 * `set`, `region`, `auth` and `tabs` are each guarded by `typeof === "string"`,
 * so they take values and are absent here; `minimal` and `harness` are compared
 * against `true` and are present.
 *
 * See prooflane.mjs's copy for why the list names BOOLEANS and not value flags:
 * a name missing here leaves one flag as it behaves today, where a name missing
 * from a value list would break a flag that works.
 */
export const BOOLEAN_FLAGS = new Set([
  "help", "h", "version", "v",
  "yes", "force", "fix", "minimal", "harness", "verify",
  "dry-run", "dry-run-verify", "no-install",
]);

/**
 * Parse argv into positionals + flags. `--flag value` captures the value, unless
 * `--flag` is one that takes none — then `value` stays the user's positional.
 * A trailing flag, or one followed by another flag, is boolean true.
 * @param {string[]} argv
 * @returns {{_: string[], flags: Record<string, string|boolean>}}
 */
export function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      // `no-` is boolean by construction — `flagBool` below reads `--no-x` as
      // the negation of `x` — so it needs no entry in the list above.
      const takesValue = !BOOLEAN_FLAGS.has(key) && !key.startsWith("no-");
      if (!takesValue || next === undefined || next.startsWith("--")) {
        args.flags[key] = true; // boolean flag
      } else {
        args.flags[key] = next;
        i++;
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
