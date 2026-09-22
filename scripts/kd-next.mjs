#!/usr/bin/env node
// kd-next.mjs — the next KD number, from every place a KD number is already taken.
//
//   node scripts/kd-next.mjs
//
// KD-119, measured 2026-09-18: a KD number is allocated from the highest number
// the ALLOCATING BRANCH can see, and a branch cannot see another branch. Between
// one slice branch and `origin/main`, five numbers named two unrelated defects
// each — KD-109..113 twice over, one set the preflight guarding `npm test` and
// the other `COMMAND_PREFIX`'s three alternatives. A rebase puts the colliding
// table rows and entry bodies in front of whoever does it; what it never puts in
// front of anybody is a KD number cited in a code comment, and there were three.
//
// So this asks the places, rather than the branch:
//
//   the working tree          docs/KNOWN-DEFECTS.md and docs/KNOWN-DEFECTS-CLOSED.md as they are
//   origin's main            asked over the wire (`ls-remote`, which moves no ref), falling back
//                            to the local refs/remotes/origin/main, which is as old as the last fetch
//   every open PR's head     `gh pr list`, then each head's copies of both files
//
// THE ANSWER IS THE MAXIMUM PLUS ONE, and the maximum is over every `KD-<n>`
// token in those files — the table rows, the entry headings and the prose alike.
// A number mentioned anywhere is a number a reader can be sent to.
//
// WHAT IT CANNOT SEE, IT SAYS. Offline, without `gh`, or with a ref it cannot
// read, it still answers from what it reached and names what it did not on
// stderr — because the silent version of this program is the defect it closes,
// one layer up: a number that looks derived and was allocated from half the
// evidence. The answer is on stdout and nothing else is, so `$(node
// scripts/kd-next.mjs)` is the number and the gaps are still in front of you.
//
// It is NOT a gate and nothing routes on it. `scripts/proof-plan.mjs` deliberately
// never reaches the network because a gate that fetched would move the baseline it
// judges; this one reaches it because a number is not a verdict, and it writes
// nothing — no fetch, no ref, no file.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The two files a KD number is spelled in. Both, because a number is taken whether the entry is open or closed. */
export const LOGS = Object.freeze(["docs/KNOWN-DEFECTS.md", "docs/KNOWN-DEFECTS-CLOSED.md"]);

const SHA = /^[0-9a-f]{40}$/;
const short = (sha) => String(sha).slice(0, 7);

/** Every `KD-<n>` in a text, highest first — 0 when there is none. A placeholder id (`KD-NEW-x`) carries no number and is not one. */
export function highestIn(text) {
  let high = 0;
  for (const m of String(text ?? "").matchAll(/\bKD-(\d+)\b/g)) high = Math.max(high, Number(m[1]));
  return high;
}

/**
 * One external program, bounded, read-only, and never a throw: every failure
 * comes back as a `why` this program can print, because the failures are the
 * output that matters most here.
 */
function runner(bin, cwd, defaultMs) {
  return (args, ms = defaultMs) => {
    const r = spawnSync(bin, args, {
      cwd,
      encoding: "utf8",
      timeout: ms,
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
    });
    if (r.error) {
      const code = r.error.code ?? r.error.message;
      return { ok: false, out: "", why: code === "ETIMEDOUT" ? `${bin} did not answer inside ${ms}ms` : `${bin} could not be run (${code})` };
    }
    if (typeof r.status !== "number") return { ok: false, out: "", why: `${bin} produced no exit code${r.signal ? `, killed by ${r.signal}` : ""}` };
    const first = String(r.stderr ?? "").trim().split("\n")[0];
    return { ok: r.status === 0, out: String(r.stdout ?? ""), why: r.status === 0 ? null : `${bin} exited ${r.status}${first ? `: ${first}` : ""}` };
  };
}

/**
 * The next free number, and the account of how it was reached.
 *
 * `git`, `gh` and `read` are injected so the tests can drive every branch of
 * this — including the ones that matter, where a source is not there — without
 * a network, a clone or a GitHub account.
 */
export function nextKd({ root = REPO_ROOT, git = runner("git", root, 5000), gh = runner("gh", root, 15000), read = (p) => fs.readFileSync(p, "utf8") } = {}) {
  const seen = [];
  const blind = [];
  const note = (where, text) => seen.push({ where, high: highestIn(text) });

  for (const f of LOGS) {
    try {
      note(`the working tree's ${f}`, read(path.join(root, f)));
    } catch (e) {
      blind.push(`${f} in the working tree — ${e?.code ?? e?.message ?? e}`);
    }
  }

  /** Both files at one commit: from this clone when the object is here, and from GitHub when it is not. */
  const atCommit = (sha, label) => {
    const here = git(["cat-file", "-e", `${sha}^{commit}`]).ok;
    for (const f of LOGS) {
      if (here) {
        const r = git(["show", `${sha}:${f}`]);
        // The commit IS readable, so a file missing from it is a fact about that
        // ref — nothing there holds a number — and not a thing this could not see.
        if (r.ok) note(`${label}'s ${f}`, r.out);
        else seen.push({ where: `${label} carries no ${f}`, high: 0 });
        continue;
      }
      const r = gh(["api", "-H", "Accept: application/vnd.github.raw", `repos/{owner}/{repo}/contents/${f}?ref=${sha}`]);
      if (r.ok) note(`${label}'s ${f}, read from GitHub`, r.out);
      else blind.push(`${label}'s ${f} at ${short(sha)} — the commit is not in this clone and ${r.why}`);
    }
  };

  // ORIGIN'S MAIN AS IT IS NOW, not as this clone last heard. `ls-remote` asks
  // the remote and moves nothing: a program that fetched to answer a question
  // would change what every other worktree's scheduler measures against.
  const ls = git(["ls-remote", "origin", "refs/heads/main"], 10000);
  const remote = ls.ok ? /^([0-9a-f]{40})/.exec(ls.out.trim())?.[1] : null;
  if (remote) {
    atCommit(remote, `origin/main@${short(remote)}`);
  } else {
    const local = git(["rev-parse", "--verify", "--quiet", "refs/remotes/origin/main"]);
    const sha = local.ok ? local.out.trim() : null;
    if (sha && SHA.test(sha)) {
      blind.push(`origin/main AS IT IS NOW — ${ls.why ?? "ls-remote named no sha"}. This clone's refs/remotes/origin/main at ${short(sha)} was read instead, and it is as old as the last fetch`);
      atCommit(sha, `origin/main@${short(sha)} (this clone's ref, not the remote's)`);
    } else {
      blind.push(`origin/main at all — ${ls.why ?? "ls-remote named no sha"}, and this clone has no refs/remotes/origin/main either`);
    }
  }

  // EVERY OPEN PR'S HEAD, which is the half `origin/main` cannot cover: a branch
  // in flight has allocated its numbers and merged none of them.
  const list = gh(["pr", "list", "--state", "open", "--json", "number,headRefName,headRefOid", "--limit", "200"]);
  if (!list.ok) {
    blind.push(`the open pull requests — ${list.why}. Any branch in flight may already hold the number below`);
  } else {
    let prs = null;
    try {
      prs = JSON.parse(list.out || "[]");
    } catch (e) {
      blind.push(`the open pull requests — gh answered something this could not read as JSON (${e?.message ?? e})`);
    }
    if (Array.isArray(prs)) {
      for (const pr of prs) {
        const sha = String(pr?.headRefOid ?? "");
        const label = `PR #${pr?.number} (${pr?.headRefName})`;
        if (SHA.test(sha)) atCommit(sha, `${label} at ${short(sha)}`);
        else blind.push(`${label} — gh named no head commit for it`);
      }
    }
  }

  const highest = seen.reduce((h, s) => Math.max(h, s.high), 0);
  return { next: highest + 1, highest, seen, blind, answered: seen.some((s) => s.high > 0) };
}

/**
 * The worktree a directory sits in — the tree whose log is "the working tree's".
 * This repo is worked several worktrees at once, and the answer must be about the
 * one the author is standing in, not the one this file happens to have been
 * copied into (KD-79 is that mistake, made by the gate).
 */
export function treeAt(dir) {
  const r = runner("git", dir, 5000)(["rev-parse", "--show-toplevel"]);
  return r.ok && r.out.trim() ? r.out.trim() : null;
}

/** The account, for stderr: what was read, then what was not — never the other way round, because the gaps are the last thing a reader should see. */
export function account({ seen, blind, highest }) {
  const lines = [`kd-next: highest number seen ${highest}, across ${seen.length} place(s):`];
  for (const s of seen) lines.push(`  ${s.high || "none"}  ${s.where}`);
  for (const b of blind) lines.push(`kd-next: COULD NOT SEE ${b}`);
  if (blind.length) lines.push("kd-next: so the number below is the next one FREE IN WHAT IT COULD SEE. Widen it or say so in the entry.");
  return lines.join("\n");
}

function main() {
  const here = treeAt(process.cwd());
  const root = here ?? REPO_ROOT;
  if (!here) process.stderr.write(`kd-next: ${process.cwd()} is not inside a git worktree, so the logs were read from this program's own checkout (${root}).\n`);
  const r = nextKd({ root });
  process.stderr.write(`${account(r)}\n`);
  if (!r.answered) {
    process.stderr.write("kd-next: no source carried a single KD number, so there is no maximum to count from and nothing is printed.\n");
    process.exit(1);
  }
  process.stdout.write(`KD-${r.next}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
