---
name: plugin-refresh
description: >-
  Refresh the installed Claude Code plugin from its marketplace and PROVE the result by
  content — and answer the question a version number cannot: which running sessions have
  actually loaded which bytes. Use this when a skill behaves like an older version, after
  publishing a release, when the SessionStart line says the plugin is STALE, or when
  someone asks "is my plugin up to date", "reload the plugin", "why is my skill out of
  date", "refresh the marketplace", "did the reload work". The work is a program —
  `node scripts/plugin-refresh.mjs` — because every hand-run step here has a silent
  failure that reports success; this skill exists to say when to run it, how to read
  what it says, and what it deliberately will not do.
---

# plugin-refresh — refresh the plugin, and prove it by content

`node scripts/plugin-refresh.mjs` is the whole procedure. This file is not a copy of it.

```
node scripts/plugin-refresh.mjs --check     # is it stale? changes nothing
node scripts/plugin-refresh.mjs             # refresh, then prove it
node scripts/plugin-refresh.mjs --dry-run   # print the plan, write nothing
```

`--check` also runs at SessionStart, as one line under the proof schedule. If that line says
`current`, there is nothing to do here.

## Why a program and not a checklist

Every step of this has a failure mode that reports success. Measured on this machine over two
days, all four at once:

- `/reload-plugins` re-reads **disk**. It never refetches from GitHub, and will happily rebuild a
  cache directory out of a clone 56 commits stale.
- The cache is keyed by **version**. If a stale snapshot already declares the new number, the
  reinstall records the new sha and **reuses the directory holding the old bytes**.
- `installed_plugins.json` holds one entry **per scope**. Updating the one you thought about
  leaves the other behind — and the one that serves is not necessarily the one you expect. A
  local entry was found pinned to a version whose sha no longer existed, rebased away.
- The version number, the plugin count, and the reload's own "N skills" line are all blind to
  every one of the above.

So the program refuses to call a refresh done unless the installed tree is **byte-identical** to
the source it claims to come from.

## Reading what it prints

The **scope** lines are what is on disk. The **leases** block is what running sessions have
actually loaded — `<cache>/<version>/.in_use/` is a directory of leases, one entry per Claude
process id, and `~/.claude/sessions/<pid>.json` names each one.

```
  loaded by running sessions (.in_use leases — the bytes a session HAS, not what disk says):
    0.24.0   create-cmp-a0 (this repo)
    0.25.0   create-cmp-a0 (this repo)
```

A session under **both** an old and a new generation has reloaded — the old lease is simply not
released until it exits. A session under **only** an older generation has not reloaded yet, and
the program says so by name. This is the one signal that still discriminates when two versions
ship identical skills, because it does not care what the bytes are, only who loaded them.

That `.in_use` is a **directory** and not a marker file is worth knowing: `[ -f .in_use ]` reports
it absent, which produced two confident wrong conclusions in one day before the program existed.

## What it will not do

- **It will not reload a running session.** What a session has loaded is fixed until it reloads;
  the program reports who needs to and prints `/reload-plugins`. Only a human runs that.
- **It will not refresh at SessionStart.** The hook calls `--check` only. A session start that
  silently mutates an install is a session start nobody can trust.
- **It will not tell you two identical generations apart by their content**, because nothing can.
  When only `.claude-plugin/*.json` differs, skills and agents are byte-identical; sentence
  greps, skill counts and the reload's own summary are all blind to it. The leases are the answer.

## When the proof fails

The program exits non-zero and names the differing and missing files. That means the cache and
the clone disagree after a rebuild, which should be impossible — treat it as a real defect. Do
not re-run it hoping for a different answer, and do not hand-copy the files it named.
