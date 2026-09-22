// Every app stamped through 0.26.2 carries two hook commands that name their script
// relative to the SESSION's directory — `node qa/receipt-check.mjs --hook` (Stop) and
// `test -f qa/walk-status.mjs && node qa/walk-status.mjs --inject || true`
// (UserPromptSubmit). 0.26.3 anchored the template; nothing reached the apps already
// stamped (KD-85). `create-cmp doctor` did not name the Stop hook at all, and
// `doctor --fix` only ever ADDS wiring, so the one command an adopter runs to heal a
// project left both where they were.
//
// The heal this file drives is bounded by a table, not by a parse: a command is
// rewritten only when it is BYTE-EQUAL to a form create-cmp itself shipped and later
// superseded (src/lib/shipped-hooks.mjs), and only to that form's successor. Anything
// the app wrote is left alone and reported with the form to paste. It is a write to
// a file the app owns, so it asks first; `--yes` answers, a pipe with no `--yes`
// declines, and `--dry-run` writes nothing at all.
//
// THE REAL BIN, not the functions under it: each case spawns bin/create-cmp.mjs with
// separate argv tokens, against a project in the OS temp directory (never inside this
// repository), with HOME pointed at an empty directory and PATH cut to node plus the
// system bins — so the toolchain preflight that runs first can neither install
// anything nor find an Android SDK to write into local.properties.
//
// THE OLD BYTES ARE GIT'S, not a reconstruction: the 0.26.2 and 0.26.3 settings files
// are read from the commits that set those versions in package.json. A stamp copies
// that file verbatim — the stamper's tokens are `__NAME__` shapes and the file carries
// none, which the fixture asserts rather than assumes.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "create-cmp.mjs");
const ANCHOR = "${CLAUDE_PROJECT_DIR:-.}";
const SCRIPT = "qa/walk-status.mjs";

// ── git: the bytes each version actually shipped ─────────────────────────────

const git = (...args) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8" });

/** template/.claude/settings.json exactly as the commit that set `version` shipped it. */
function templateAt(version) {
  // A shallow clone would make "the commit that set 0.26.2" unfindable, and this
  // file must say so rather than go quiet. CI checks out with fetch-depth 0.
  assert.notEqual(
    git("rev-parse", "--is-shallow-repository").trim(),
    "true",
    "this test reads what 0.26.2 shipped from git history, and this clone is shallow — fetch the full history"
  );
  const commits = git("log", "--format=%H", "--reverse", `-S"version": "${version}",`, "--", "package.json")
    .split("\n")
    .filter(Boolean);
  assert.ok(commits.length > 0, `no commit in this history set package.json to ${version}`);
  return git("show", `${commits[0]}:template/.claude/settings.json`);
}

const V0262 = templateAt("0.26.2");
const V0263 = templateAt("0.26.3");

// ── the project and the bin ───────────────────────────────────────────────────

/** A throwaway Gradle project outside this repository, carrying the walk and the Stop script. */
function project(settingsText) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cmp-shipped-hooks-")));
  assert.ok(
    !dir.startsWith(`${fs.realpathSync(ROOT)}${path.sep}`),
    `the fixture landed inside the repository (${dir}); it must be a tree create-cmp does not own`
  );
  fs.writeFileSync(path.join(dir, "settings.gradle.kts"), "");
  fs.mkdirSync(path.join(dir, "qa"), { recursive: true });
  fs.writeFileSync(path.join(dir, SCRIPT), "// stand-in for the walk\n");
  fs.writeFileSync(path.join(dir, "qa", "receipt-check.mjs"), "// stand-in for the Stop gate\n");
  fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".claude", "settings.json"), settingsText);
  return dir;
}

const settingsOf = (dir) => fs.readFileSync(path.join(dir, ".claude", "settings.json"), "utf8");
const strip = (s) => String(s ?? "").replace(/\x1b\[[0-9;]*m/g, "");

/** A hermetic environment: an empty HOME and a PATH holding node and the system bins only. */
function hermeticEnv(home) {
  return {
    HOME: home,
    PATH: [path.dirname(process.execPath), "/usr/bin", "/bin"].join(path.delimiter),
    NO_COLOR: "1",
  };
}

/** `create-cmp doctor <args> --no-install --no-ios --target-dir <dir>`, stdin a pipe. */
function doctor(dir, ...args) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-shipped-hooks-home-"));
  try {
    const r = spawnSync(
      process.execPath,
      [BIN, "doctor", ...args, "--no-install", "--no-ios", "--target-dir", dir],
      { env: hermeticEnv(home), input: "", encoding: "utf8", timeout: 60_000 }
    );
    assert.ok(
      r.status === 0 || r.status === 1,
      `doctor did not finish (status ${r.status}, signal ${r.signal}):\n${r.stderr}`
    );
    const out = strip(r.stdout);
    assert.match(out, /Project diagnosis/, `the project section never ran:\n${out}\n${r.stderr}`);
    return out;
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

const STOP_026_2 = "node qa/receipt-check.mjs --hook";
const PROMPT_026_2 = `test -f ${SCRIPT} && node ${SCRIPT} --inject || true`;

test("the fixtures are what they claim: 0.26.2 carries both relative hooks, 0.26.3 both anchored, no stamp tokens", () => {
  const old = JSON.parse(V0262);
  assert.equal(old.hooks.Stop[0].hooks[0].command, STOP_026_2);
  assert.equal(old.hooks.UserPromptSubmit[0].hooks[0].command, PROMPT_026_2);
  assert.notEqual(V0262, V0263, "0.26.3 changed nothing in this file — the premise of this test is gone");
  for (const text of [V0262, V0263]) {
    assert.doesNotMatch(text, /__[A-Z_]+__/, "the file carries a stamp token, so a stamped copy is not these bytes");
  }
});

test("doctor names the Stop hook a 0.26.2 stamp carries, and tells the adopter --fix heals it", () => {
  const dir = project(V0262);
  try {
    const out = doctor(dir);
    assert.ok(out.includes(STOP_026_2), `the 0.26.2 Stop hook is not named anywhere in doctor's report:\n${out}`);
    assert.match(out, /Stop hook/, "the finding does not say which surface it is about");
    assert.match(out, /create-cmp itself shipped/, "the adopter is not told this is create-cmp's own form, not theirs");
    assert.match(out, /doctor --fix/, "the report does not tell the adopter which command heals it");
    assert.equal(settingsOf(dir), V0262, "doctor without --fix changed .claude/settings.json");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("--fix --yes heals a 0.26.2 settings.json to exactly the bytes 0.26.3 shipped, and a second run changes nothing", () => {
  const dir = project(V0262);
  try {
    const out = doctor(dir, "--fix", "--yes");
    assert.equal(
      settingsOf(dir),
      V0263,
      "the healed file is not byte-for-byte what 0.26.3 shipped — either a hook was not rewritten, or a byte " +
        `outside the two commands moved (a re-serialisation un-escapes \\u2014, for one).\n${out}`
    );
    const again = doctor(dir, "--fix", "--yes");
    assert.equal(settingsOf(dir), V0263, "a second --fix moved bytes in an already-healed file");
    assert.ok(!again.includes(`- ${STOP_026_2}`), `the second run offered a rewrite it had already made:\n${again}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a hook the app wrote itself is left byte-for-byte alone, and reported with the anchored form to paste", () => {
  const handStop = "node qa/receipt-check.mjs --hook --verbose";
  const before = V0262.replace(JSON.stringify(STOP_026_2), JSON.stringify(handStop));
  assert.notEqual(before, V0262, "the fixture edit did not land");
  const dir = project(before);
  try {
    const out = doctor(dir, "--fix", "--yes");
    const after = settingsOf(dir);
    assert.ok(after.includes(JSON.stringify(handStop)), `the app's own Stop hook was rewritten:\n${after}`);
    // Everything else is what 0.26.3 shipped: the create-cmp form beside it WAS healed.
    const v0263Stop = JSON.stringify(JSON.parse(V0263).hooks.Stop[0].hooks[0].command);
    assert.equal(
      after.replace(JSON.stringify(handStop), v0263Stop),
      V0263,
      "outside the app's own command, the file is not what 0.26.3 shipped"
    );
    assert.ok(out.includes(handStop), `the app's unanchored Stop hook is not reported:\n${out}`);
    assert.ok(
      out.includes(`"${ANCHOR}/qa/receipt-check.mjs"`),
      `the report does not print the anchored form to paste:\n${out}`
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("--fix with no --yes on a pipe writes nothing, and says what it would have rewritten", () => {
  const dir = project(V0262);
  try {
    const out = doctor(dir, "--fix");
    assert.equal(settingsOf(dir), V0262, "--fix wrote .claude/settings.json with nobody there to consent");
    assert.match(out, /no TTY, declining/, "the refusal is not stated");
    assert.ok(out.includes(STOP_026_2), `the preview does not show the command it would replace:\n${out}`);
    assert.ok(
      out.includes(`node "${ANCHOR}/qa/receipt-check.mjs" --hook`),
      `the preview does not show what it would write:\n${out}`
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("--dry-run writes nothing, even with --yes", () => {
  const dir = project(V0262);
  try {
    const out = doctor(dir, "--fix", "--yes", "--dry-run");
    assert.equal(settingsOf(dir), V0262, "--dry-run rewrote .claude/settings.json");
    assert.match(out, /dry-run/, "the output does not say it was a dry run");
    assert.ok(out.includes(`node "${ANCHOR}/qa/receipt-check.mjs" --hook`), `no preview of the rewrite:\n${out}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("answering no at a terminal writes nothing", (t) => {
  // A pipe never reaches the prompt (the helper declines first), so the refusal a
  // person types needs a terminal. python3's pty is the one portable way to give
  // the real bin one without adding a dependency; where it is absent the case is
  // SKIPPED by name rather than passed.
  const probe = spawnSync("python3", ["-c", "import pty"], { encoding: "utf8" });
  if (probe.error || probe.status !== 0) {
    t.skip("no python3 with a pty module on this machine — the terminal refusal is not exercised here");
    return;
  }
  const driver = [
    "import os, pty, select, sys, time",
    "pid, fd = pty.fork()",
    "if pid == 0:",
    "    os.execvp(sys.argv[1], sys.argv[1:])",
    "buf = b''",
    "answered = False",
    "deadline = time.time() + 60",
    "while time.time() < deadline:",
    "    r, _, _ = select.select([fd], [], [], 0.5)",
    "    if fd not in r:",
    "        continue",
    "    try:",
    "        chunk = os.read(fd, 4096)",
    "    except OSError:",
    "        break",
    "    if not chunk:",
    "        break",
    "    buf += chunk",
    "    if not answered and b'[y/N]' in buf:",
    "        os.write(fd, b'n\\n')",
    "        answered = True",
    "os.waitpid(pid, 0)",
    "sys.stdout.buffer.write(buf)",
    "sys.exit(0 if answered else 3)",
  ].join("\n");
  const dir = project(V0262);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-shipped-hooks-home-"));
  try {
    const r = spawnSync(
      "python3",
      ["-c", driver, process.execPath, BIN, "doctor", "--fix", "--no-install", "--no-ios", "--target-dir", dir],
      { env: hermeticEnv(home), encoding: "utf8", timeout: 90_000 }
    );
    const out = strip(r.stdout);
    assert.equal(r.status, 0, `the consent prompt never appeared at the terminal:\n${out}\n${r.stderr}`);
    assert.equal(settingsOf(dir), V0262, "answering no still rewrote .claude/settings.json");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("the reviewer's five shapes: none is rewritten, and only the shipped one is called working", () => {
  // test/doctor-claims-working-for-a-surface-a-foreign-cwd-cannot-run.test.mjs holds
  // the shell oracle for these; this is the same five through the bin, with --fix
  // --yes, so the heal is shown to leave every hand-written spelling alone.
  const shipped = JSON.parse(V0263).hooks.UserPromptSubmit[0].hooks[0].command;
  const shapes = [
    shipped,
    `test -f "${ANCHOR}/${SCRIPT}" && node ${SCRIPT} --inject || true`,
    `test -f "${ANCHOR}/${SCRIPT}" && sh -c 'node ${SCRIPT} --inject' || true`,
    `test -f "${ANCHOR}/${SCRIPT}" && eval 'node ${SCRIPT} --inject' || true`,
    `test -f "${ANCHOR}/${SCRIPT}" && node walk-status.mjs --inject || true`,
  ];
  const statusLine = JSON.parse(V0263).statusLine.command;
  const wrong = [];
  for (const command of shapes) {
    const text = `${JSON.stringify(
      {
        hooks: { UserPromptSubmit: [{ matcher: "", hooks: [{ type: "command", command }] }] },
        statusLine: { type: "command", command: statusLine },
      },
      null,
      2
    )}\n`;
    const dir = project(text);
    try {
      const out = doctor(dir, "--fix", "--yes");
      if (settingsOf(dir) !== text) wrong.push(`  REWRITTEN: ${command}`);
      const claimed = /UserPromptSubmit[^.\n]*\bstill works?\b/.test(out);
      if (claimed !== (command === shipped)) {
        wrong.push(`  ${claimed ? "claimed working" : "claim withheld from the shipped form"}: ${command}`);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  assert.deepEqual(wrong, [], `doctor --fix --yes, per shape:\n${wrong.join("\n")}`);
});
