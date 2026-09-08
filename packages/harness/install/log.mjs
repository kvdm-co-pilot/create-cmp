// The installer's terminal output — the same surface `create-cmp`'s src/lib/log.mjs
// offers, with no dependency behind it.
//
// WHY A SECOND ONE EXISTS. The lane is dependency-free by rule: a vendored
// `qa/` must run offline in a repo that installed nothing. The installer ships
// in the same package and inherits the same rule, so it cannot reach for
// picocolors the way the scaffolder does. This is fifteen lines of ANSI rather
// than a dependency, and it gates on the two things a dependency would gate on:
// NO_COLOR (the informal standard) and whether stdout is a terminal at all —
// so a log piped into a file or a CI transcript carries no escape codes, which
// is what `--once in human mode` already asserts elsewhere in this repo.

const enabled = !process.env.NO_COLOR && process.env.TERM !== "dumb" && Boolean(process.stdout.isTTY);
const wrap = (open, close) => (s) => (enabled ? `\u001b[${open}m${s}\u001b[${close}m` : String(s));

/** picocolors' shape, so callers move between the two without edits. */
export const colors = Object.freeze({
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  gray: wrap(90, 39),
  dim: wrap(2, 22),
  bold: wrap(1, 22),
});

export function info(msg) {
  process.stdout.write(`${msg}\n`);
}

export function ok(msg) {
  process.stdout.write(`${colors.green("✓")} ${msg}\n`);
}

export function warn(msg) {
  process.stdout.write(`${colors.yellow("!")} ${msg}\n`);
}

export function fail(msg) {
  process.stdout.write(`${colors.red("✗")} ${msg}\n`);
}

export function step(msg) {
  process.stdout.write(`${colors.cyan("›")} ${msg}\n`);
}

export function dim(msg) {
  process.stdout.write(`${colors.dim(msg)}\n`);
}
