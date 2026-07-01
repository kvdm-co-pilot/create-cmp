// Thin logging helper with optional color. Falls back gracefully if picocolors
// isn't installed (so the engine still works zero-dep in a pinch).

let pc;
try {
  pc = (await import("picocolors")).default;
} catch {
  const identity = (s) => s;
  pc = {
    green: identity, red: identity, yellow: identity, cyan: identity,
    dim: identity, bold: identity, blue: identity, magenta: identity,
    gray: identity,
  };
}

export const colors = pc;

export function info(msg) {
  process.stdout.write(`${msg}\n`);
}

export function ok(msg) {
  process.stdout.write(`${pc.green("✓")} ${msg}\n`);
}

export function warn(msg) {
  process.stdout.write(`${pc.yellow("!")} ${msg}\n`);
}

export function fail(msg) {
  process.stdout.write(`${pc.red("✗")} ${msg}\n`);
}

export function step(msg) {
  process.stdout.write(`${pc.cyan("›")} ${msg}\n`);
}

export function dim(msg) {
  process.stdout.write(`${pc.dim(msg)}\n`);
}
