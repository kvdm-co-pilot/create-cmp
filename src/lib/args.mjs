// Tiny shared arg parser for the CLI (moved verbatim from bin/create-cmp.mjs
// when the bin became a thin subcommand dispatcher). No new behavior.

/**
 * Parse argv into positionals + flags. `--flag value` captures the value;
 * `--flag` followed by another `--flag` (or nothing) is boolean true.
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
      if (next === undefined || next.startsWith("--")) {
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
