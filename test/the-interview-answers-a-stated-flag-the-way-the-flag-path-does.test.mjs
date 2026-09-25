// A FLAG STATED ON THE LINE MEANS THE SAME THING WHETHER OR NOT A TTY IS ATTACHED.
//
// `create-cmp` resolves one command line through two readers: `buildConfigFromFlags`
// when the run is non-interactive, and the interview when a terminal is attached and
// neither `--yes`, `--name` nor `--package` was given. 7ac5cdc made the interview
// pre-answer the four app toggles from the line ("the stated flags now pre-answer the
// questions as --minimal already did"), which is the right rule — but it is a rule
// about the LINE, and the interview still reads only the toggles it was taught. A
// stated `--no-ios`, `--tabs`, `--bundle-id`, `--theme-prefix` or `--target-dir` is
// honoured by one reader and dropped by the other, so an adopter who presses Enter
// through the questions gets an app the line did not ask for — for `--target-dir`, in
// a directory the line did not name.
//
// The invariant, not the instance: for every line of stated flags, the interview with
// every question left at its pre-answer records the same app as the same line with
// `--yes`. The lines are derived from the default record — every boolean in it,
// flipped — plus the value flags the flag path reads, so a toggle added later is held
// without editing this file.
//
// The interview is driven for real: the bin runs with `prompts` replaced by a stub that
// answers every question with its `initial`, which is exactly what Enter does, and with
// stdin reporting a TTY so the interview is the path taken.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "create-cmp.mjs");

const STUB_PROMPTS = `export default async function prompts(qs) {
  const out = {}; let prev;
  for (const q of [].concat(qs)) {
    const v = typeof q.initial === "function" ? q.initial(prev, out) : q.initial;
    out[q.name] = v; prev = v;
  }
  return out;
}`;
const PRELOAD = `import { register } from "node:module";
process.stdin.isTTY = true;
const stub = "data:text/javascript," + ${JSON.stringify(encodeURIComponent(STUB_PROMPTS))};
register("data:text/javascript," + encodeURIComponent(
  "export async function resolve(s, c, next) { return s === 'prompts' ? { url: " + JSON.stringify(stub) + ", shortCircuit: true } : next(s, c); }"
));`;

function run(cwd, args, { interview }) {
  const pre = interview ? ["--import", path.join(cwd, "preload.mjs")] : [];
  const r = spawnSync(process.execPath, [...pre, BIN, ...args, "--no-verify", ...(interview ? [] : ["--yes"])], {
    cwd,
    encoding: "utf8",
    timeout: 120_000,
  });
  assert.equal(r.status, 0, `${interview ? "interview" : "--yes"} ${args.join(" ")} exited ${r.status}:\n${r.stdout}${r.stderr}`);
}

/** The app a stamp recorded, without what differs between any two stamps. */
function recordIn(cwd) {
  const found = fs.readdirSync(cwd).filter((d) => fs.existsSync(path.join(cwd, d, "create-cmp.json")));
  assert.equal(found.length, 1, `expected one stamped app under ${cwd}, found: ${found.join(", ") || "none"}`);
  const rec = JSON.parse(fs.readFileSync(path.join(cwd, found[0], "create-cmp.json"), "utf8"));
  delete rec.stampedAt;
  return { dir: found[0], rec };
}

/** Every boolean in the default record, as the line that flips it. */
function flippedToggleLines(defaults) {
  const flagFor = { harness: "--minimal", devClient: "--no-dev-client", "platforms.ios": "--no-ios" };
  const lines = [];
  const walk = (obj, prefix) => {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v)) walk(v, key);
      else if (v === true && key !== "platforms.android") lines.push([flagFor[key] ?? `--no-${k}`]);
    }
  };
  walk(defaults, "");
  return lines;
}

test("the interview, left at every pre-answer, records the app the same line records with --yes", () => {
  const box = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-interview-"));
  try {
    const seed = path.join(box, "seed");
    fs.mkdirSync(seed);
    run(seed, ["app"], { interview: false });
    const defaults = recordIn(seed).rec;

    const lines = [
      ...flippedToggleLines(defaults),
      ["--preset", "lean"],
      ["--preset", "lean", "--room"],
      ["--tabs", "Feed:home"],
      ["--bundle-id", "com.example.other"],
      ["--theme-prefix", "Zed"],
      ["--target-dir", "named-by-flag"],
    ];

    const disagreements = [];
    for (const [i, line] of lines.entries()) {
      const viaFlags = path.join(box, `f${i}`);
      const viaInterview = path.join(box, `i${i}`);
      fs.mkdirSync(viaFlags);
      fs.mkdirSync(viaInterview);
      fs.writeFileSync(path.join(viaInterview, "preload.mjs"), PRELOAD);
      // `--target-dir` names the directory itself; every other line names it positionally.
      const args = line[0] === "--target-dir" ? line : ["app", ...line];
      run(viaFlags, args, { interview: false });
      run(viaInterview, args, { interview: true });
      const f = recordIn(viaFlags);
      const it = recordIn(viaInterview);
      if (f.dir !== it.dir) disagreements.push(`${line.join(" ")}: --yes stamped ./${f.dir}, the interview ./${it.dir}`);
      for (const key of new Set([...Object.keys(f.rec), ...Object.keys(it.rec)])) {
        const a = JSON.stringify(f.rec[key]);
        const b = JSON.stringify(it.rec[key]);
        if (a !== b) disagreements.push(`${line.join(" ")}: ${key} is ${a} with --yes, ${b} through the interview`);
      }
    }
    assert.deepEqual(
      disagreements,
      [],
      "a flag stated on the line was honoured by one reader and dropped by the other:\n  " + disagreements.join("\n  "),
    );
  } finally {
    fs.rmSync(box, { recursive: true, force: true });
  }
});
