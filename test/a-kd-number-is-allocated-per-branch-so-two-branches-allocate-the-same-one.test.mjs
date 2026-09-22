// A KD NUMBER IS ALLOCATED PER BRANCH, SO TWO BRANCHES ALLOCATE THE SAME ONE.
//
// KD-119, measured 2026-09-18 between one slice branch and `origin/main`: FIVE
// numbers named two unrelated defects each, because each file numbers its new
// entries from the highest number its own branch can see. The rule that avoids it
// — "take the number from a place both branches can see" — was a convention, and
// a convention is a thing a tired author skips at 2am. `scripts/kd-next.mjs` is
// that rule as a program.
//
// TWO PROPERTIES, and the second is the one worth the file:
//
//   1. the number is one past the highest number ANY of the places holds — the
//      working tree, origin's main, and every open PR's head, all of them, not
//      the branch this happens to be run on;
//   2. a place it could not reach is NAMED. A deriver that quietly answers from
//      half the evidence is the defect it was written to close, wearing a
//      program's authority: the number looks derived and is not.
//
// The readers are injected here, so every branch — including offline, no `gh`,
// and a head commit this clone does not have — is driven without a network. The
// end-to-end test at the bottom runs the real program against a real git
// repository whose `origin` is a bare repo on disk, and a `gh` on PATH that is a
// four-line shell script.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { nextKd, account, highestIn, LOGS } from "../scripts/kd-next.mjs";

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts/kd-next.mjs");
const OPEN = LOGS[0];
const CLOSED = LOGS[1];

/** A KD log with one entry at `n`, in the shape both files carry: a table row, a heading, and prose that cites it. */
const log = (n) => `| **KD-${n}** | something | logged |\n\n### KD-${n} — a defect\n\nKD-${n} is cited in prose as well.\n`;

const ok = (out) => ({ ok: true, out, why: null });
const no = (why) => ({ ok: false, out: "", why });

/** A git that knows a fixed set of commits and what each of them carries. */
const gitOver = (commits, { remote = null, localRef = null } = {}) =>
  function git(args) {
    if (args[0] === "ls-remote") return remote ? ok(`${remote}\trefs/heads/main\n`) : no("git exited 128: could not read from remote repository");
    if (args[0] === "rev-parse") return localRef ? ok(`${localRef}\n`) : no("git exited 1");
    if (args[0] === "cat-file") return commits[args[2].replace("^{commit}", "")] ? ok("") : no("git exited 1: Not a valid object name");
    if (args[0] === "show") {
      const [sha, file] = args[1].split(":");
      const text = commits[sha]?.[file];
      return text === undefined ? no(`git exited 128: path '${file}' does not exist in '${sha}'`) : ok(text);
    }
    throw new Error(`the fixture git was asked something the program does not ask: ${args.join(" ")}`);
  };

const sha = (c) => c.repeat(40);

test("the number is one past the highest number ANY of the places holds — not the branch this is run on", () => {
  // The working tree is BEHIND all of them, which is exactly the shape KD-119
  // measured: the branch allocating has the lowest view of the world.
  const r = nextKd({
    root: "/fixture",
    read: (p) => (p.endsWith(CLOSED) ? log(42) : log(100)),
    git: gitOver(
      {
        [sha("a")]: { [OPEN]: log(105), [CLOSED]: log(7) },
        [sha("b")]: { [OPEN]: log(110), [CLOSED]: log(9) },
        [sha("c")]: { [OPEN]: log(108) },
      },
      { remote: sha("a") },
    ),
    gh: (args) =>
      args[0] === "pr"
        ? ok(JSON.stringify([
            { number: 167, headRefName: "one-branch", headRefOid: sha("b") },
            { number: 165, headRefName: "another-branch", headRefOid: sha("c") },
          ]))
        : no("the fixture gh was asked for a commit this clone already has"),
    });
  assert.equal(r.highest, 110, "the highest is the PR head's, which no other place can see");
  assert.equal(r.next, 111);
  assert.deepEqual(r.blind, [], "every place answered, so nothing is unseen");
  // And it says where each number came from, because a derived number that
  // cannot be checked is a declared one.
  const where = r.seen.map((s) => s.where).join("\n");
  for (const expected of ["the working tree's", "origin/main@aaaaaaa", "PR #167 (one-branch)", "PR #165 (another-branch)"]) {
    assert.ok(where.includes(expected), `the account must name ${expected}:\n${where}`);
  }
  // A ref that carries only one of the two files is a fact about that ref, not a
  // gap in what this could see: PR #165 has no closed log and nothing is claimed.
  assert.ok(where.includes(`PR #165 (another-branch) at ccccccc carries no ${CLOSED}`), where);
});

test("a place it could not see is NAMED, and the answer still comes from the rest", () => {
  // No `gh` at all — the shape on a machine that never installed it, and the one
  // that matters most: every number allocated on a branch in flight is invisible,
  // so the number this prints can still collide. It says so in those words.
  const r = nextKd({
    root: "/fixture",
    read: () => log(100),
    git: gitOver({ [sha("a")]: { [OPEN]: log(105), [CLOSED]: log(7) } }, { remote: sha("a") }),
    gh: () => no("gh could not be run (ENOENT)"),
  });
  assert.equal(r.next, 106, "it still answers from the working tree and origin/main");
  assert.equal(r.blind.length, 1, r.blind.join("\n"));
  assert.match(r.blind[0], /open pull requests/);
  assert.match(r.blind[0], /ENOENT/, "and it says WHY, not just that something failed");
  assert.match(account(r), /COULD NOT SEE/, "stderr says it in a word a reader cannot skim past");
  assert.match(account(r), /next one FREE IN WHAT IT COULD SEE/);
});

test("offline, the local origin/main ref answers and is named as the stale thing it is", () => {
  // `ls-remote` is the only reach for the network in the program. When it cannot,
  // the clone's own remote-tracking ref is the best available and is used — and
  // the difference between "origin/main" and "origin/main as of the last fetch"
  // is exactly the difference KD-119 is about, so it is stated.
  const r = nextKd({
    root: "/fixture",
    read: () => log(100),
    git: gitOver({ [sha("d")]: { [OPEN]: log(120), [CLOSED]: log(3) } }, { remote: null, localRef: sha("d") }),
    gh: () => ok("[]"),
  });
  assert.equal(r.next, 121, "the stale ref is still evidence, and it is counted");
  assert.equal(r.blind.length, 1);
  assert.match(r.blind[0], /AS IT IS NOW/);
  assert.match(r.blind[0], /as old as the last fetch/);
  assert.match(r.seen.map((s) => s.where).join("\n"), /this clone's ref, not the remote's/);
});

test("a head commit this clone does not have is read from GitHub, and is a gap only when that fails too", () => {
  const prs = ok(JSON.stringify([{ number: 9, headRefName: "a-fork-branch", headRefOid: sha("e") }]));
  const reachable = nextKd({
    root: "/fixture",
    read: () => log(10),
    git: gitOver({}, { remote: null, localRef: null }),
    gh: (args) => (args[0] === "pr" ? prs : ok(log(200))),
  });
  assert.equal(reachable.next, 201, "the PR head was read over the API, so its numbers count");
  assert.ok(
    reachable.blind.some((b) => /origin\/main at all/.test(b)),
    `and the missing origin/main is still named: ${reachable.blind.join("\n")}`,
  );

  const unreachable = nextKd({
    root: "/fixture",
    read: () => log(10),
    git: gitOver({}, { remote: null, localRef: null }),
    gh: (args) => (args[0] === "pr" ? prs : no("gh exited 1: HTTP 404")),
  });
  assert.equal(unreachable.next, 11, "it answers from the working tree alone");
  assert.ok(
    unreachable.blind.some((b) => b.includes("PR #9 (a-fork-branch)") && b.includes("404")),
    `the PR it could not read must be named with its reason: ${unreachable.blind.join("\n")}`,
  );
});

test("every `KD-<n>` counts, wherever it is written, and a placeholder id is not a number", () => {
  assert.equal(highestIn("| **KD-7** | row |\n### KD-12 — heading\ncited KD-9 in prose"), 12);
  assert.equal(highestIn("KD-NEW-tooling-1 and KD-NEW-doors-2 are placeholders"), 0);
  assert.equal(highestIn("ADR-0014 is not a KD number"), 0);
  assert.equal(highestIn(""), 0);
});

test("end to end: the real program, a real repository, a bare origin on disk and a four-line gh", () => {
  // No network anywhere: `origin` is a bare repo in the same temp directory, so
  // `ls-remote` is a real ls-remote and `git show` reads real objects.
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "kd-next-")));
  try {
    const work = path.join(tmp, "work");
    const bare = path.join(tmp, "origin.git");
    const bin = path.join(tmp, "bin");
    const git = (cwd, ...args) => {
      const r = spawnSync("git", args, { cwd, encoding: "utf8" });
      assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
      return r.stdout.trim();
    };
    const commit = (cwd, m) => git(cwd, "-c", "user.email=f@x", "-c", "user.name=f", "-c", "commit.gpgsign=false", "commit", "-qm", m);

    fs.mkdirSync(path.join(work, "docs"), { recursive: true });
    spawnSync("git", ["init", "-q", "--bare", bare]);
    git(work, "init", "-q", "-b", "main");
    fs.writeFileSync(path.join(work, OPEN), log(50));
    fs.writeFileSync(path.join(work, CLOSED), log(20));
    git(work, "add", "-A");
    commit(work, "main's copies");
    git(work, "remote", "add", "origin", bare);
    git(work, "push", "-q", "origin", "main");

    // A branch in flight: it allocated 77, it is not merged, and `origin/main`
    // cannot see it. This is the branch whose number the next author reuses.
    git(work, "checkout", "-q", "-b", "in-flight");
    fs.writeFileSync(path.join(work, OPEN), log(77));
    git(work, "add", "-A");
    commit(work, "a branch's own entry");
    const head = git(work, "rev-parse", "HEAD");
    git(work, "checkout", "-q", "main");

    fs.mkdirSync(bin, { recursive: true });
    fs.writeFileSync(
      path.join(bin, "gh"),
      `#!/bin/sh\n[ "$1" = "pr" ] && printf '%s' '[{"number":1,"headRefName":"in-flight","headRefOid":"${head}"}]' && exit 0\nexit 1\n`,
      { mode: 0o755 },
    );
    // A PATH with git on it and no `gh` at all — the second half of the run
    // below. Built from the git this test already used, so it is the same git.
    const noGh = path.join(tmp, "no-gh");
    fs.mkdirSync(noGh, { recursive: true });
    const gitPath = spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
    assert.ok(gitPath, "this test needs a git on PATH to build a PATH with only git on it");
    fs.symlinkSync(gitPath, path.join(noGh, "git"));

    const r = spawnSync(process.execPath, [SCRIPT], { cwd: work, encoding: "utf8", env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` } });
    assert.equal(r.status, 0, `the program failed: ${r.stderr}`);
    assert.equal(r.stdout.trim(), "KD-78", `the branch in flight holds 77 and nothing else does:\n${r.stderr}`);
    assert.doesNotMatch(r.stderr, /COULD NOT SEE/, `everything was reachable here:\n${r.stderr}`);
    assert.match(r.stderr, /PR #1 \(in-flight\)/, "and the account names the PR whose number decided it");

    // The same run with no `gh` on PATH: the branch in flight goes unseen, the
    // number drops to main's, and the drop is stated rather than shipped.
    const blind = spawnSync(process.execPath, [SCRIPT], { cwd: work, encoding: "utf8", env: { ...process.env, PATH: noGh } });
    assert.equal(blind.status, 0, blind.stderr);
    assert.equal(blind.stdout.trim(), "KD-51", `main's own copies hold 50:\n${blind.stderr}`);
    assert.match(blind.stderr, /COULD NOT SEE the open pull requests/, blind.stderr);
    assert.doesNotMatch(blind.stderr, /COULD NOT SEE origin\/main/, `the git half still reached the bare origin:\n${blind.stderr}`);

    // And where nothing carries a KD number at all, it prints NO number rather
    // than "KD-1", which would be a fabricated allocation.
    const empty = path.join(tmp, "not-a-log");
    fs.mkdirSync(path.join(empty, "docs"), { recursive: true });
    for (const f of LOGS) fs.writeFileSync(path.join(empty, f), "no numbers here\n");
    git(empty, "init", "-q", "-b", "main");
    const none = spawnSync(process.execPath, [SCRIPT], { cwd: empty, encoding: "utf8", env: { ...process.env, PATH: noGh } });
    assert.equal(none.status, 1);
    assert.equal(none.stdout, "", "nothing on stdout means nothing a script can mistake for an answer");
    assert.match(none.stderr, /no source carried a single KD number/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
