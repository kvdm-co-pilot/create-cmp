#!/bin/sh
# fail-closed.sh — run a PreToolUse gate so that a gate which CANNOT answer refuses.
#
#   sh fail-closed.sh <gate.mjs> [prefilter-regex] [deadline-seconds]
#
# An empty or absent prefilter is the fixed one: gh|npm|pnpm|bun|yarn|git push|fleet-check.
#
# WHY. Claude Code blocks a PreToolUse call only on exit 2 (or a JSON deny). Any
# other exit is non-blocking, so a gate that crashes lets the command it was
# judging run: `node` missing from a GUI-launched PATH (127), a segfault (139),
# an out-of-memory kill, a broken gate file (1). B-L-1 in the 2026-09-28 pattern
# review, which traced each of those to an ungated `gh pr merge`.
#
# WHAT IT DOES. The payload is read from stdin and handed to `node <gate.mjs>`.
# The gate's stdout and stderr pass straight through, and so do its exits 0 and
# 2 — those are answers. Any other exit, including this wrapper's own deadline
# killing the gate, is a gate that did not answer, and then:
#
#   - the payload matches <prefilter-regex> as a word (gh, npm, git push, …):
#     exit 2, "gate could not run (rc=N) — refusing". "I could not check" is
#     not "I checked".
#   - it does not: exit 0. An unmatched command never blocks — the rule at the
#     head of proof-gate.mjs; a gate that blocked every Bash call because node
#     was missing would be removed within the hour, and rightly.
#
# The prefilter is deliberately cheap and over-broad (it reads the whole
# payload, description included): it only ever turns a crash into a refusal.
#
# THE DEADLINE. The wrapper kills the gate at [deadline-seconds] (default 9),
# shorter than the 10 s the settings file registers, so a gate that hangs is a
# gate that did not answer — refused — rather than a hook Claude Code kills.
# GNU `timeout` is absent on macOS, so it is a background sleep and a kill.
#
# WHAT IT CANNOT DO. If Claude Code itself kills THIS process at the registered
# timeout, nothing here runs and the command is permitted: that residue is
# fail-open, which is why the landing is also checked where the model cannot
# reach — git's pre-push hook (.githooks/pre-push) and CI.

gate=$1
prefilter=${2:-'gh|npm|pnpm|bun|yarn|git push|fleet-check'}
limit=${3:-9}

if [ -z "$gate" ]; then
  echo "fail-closed.sh: usage: fail-closed.sh <gate.mjs> [prefilter-regex] [deadline-seconds]" >&2
  exit 2
fi

payload=$(mktemp "${TMPDIR:-/tmp}/fail-closed.XXXXXX") || exit 2
trap 'rm -f "$payload"' EXIT
cat > "$payload"

# Explicit stdin: a background job's stdin is /dev/null otherwise.
node "$gate" < "$payload" &
pid=$!
(
  sleep "$limit" &
  sp=$!
  trap 'kill "$sp" 2>/dev/null; exit 0' TERM
  wait "$sp"
  kill -9 "$pid" 2>/dev/null
) >/dev/null 2>&1 </dev/null &
watchdog=$!

wait "$pid"
rc=$?
kill "$watchdog" 2>/dev/null
wait "$watchdog" 2>/dev/null

case "$rc" in
  0 | 2) exit "$rc" ;;
esac

if grep -Eq "(^|[^[:alnum:]_-])(${prefilter})([^[:alnum:]_-]|\$)" "$payload"; then
  echo "gate could not run (rc=$rc) — refusing: $gate gave no answer, and this command is one it gates. Fix the gate (is node on PATH?) rather than routing around it." >&2
  exit 2
fi
exit 0
