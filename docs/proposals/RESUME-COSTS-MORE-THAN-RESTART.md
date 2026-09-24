# Brief — a resumed helper costs more than a fresh one; the plugin should say so at the moment it matters

**Status:** approved in principle by Karel 2026-09-23 ("can we codify that and add it to the plugin
as well"). Not built. First slice AFTER the wave (`wave-adopter-truth`) merges, in a fresh session.

## The measurement that motivates it (2026-09-23, this repo's own wave)

Last 3 hours of one orchestration session: 19.8M cost-weighted tokens, an estimated ~9–10M of it
buying nothing. The dominant cause was one move: **resuming a stalled or finished helper with
`SendMessage` instead of starting a fresh one from its hand-off.** A resumed helper re-reads its whole
history on every step:

| helper | carried context | spent | steps | per step |
|---|---|---|---|---|
| proofs fixer | ~428k (last `cache_read_input_tokens`) | 4.0M | 18 | ~220k |
| docs integrator (resumed pass after pass) | growing | 3.1M | 40 | ~78k |
| doors fixer (hung twice, work then done by the lead) | large | 1.3M | 18 | — |

A fresh helper briefed from the same commits and hand-off file starts at ~30–50k. Stalls (host
sleeping, rate limit, hangs) turned into expensive resumes every time.

And the shipped plugin currently **recommends the costly move**: `agents/cmp-orchestrator.md`,
section "RE-DELEGATE, DON'T ABSORB", step 2: *"Re-brief the same agent (`SendMessage`) or spawn a
fresh one"* — resume listed first.

## What to build

### 1. A program at the moment of decision — `resume-price` (advisory, refuses nothing)

- A `PreToolUse` hook matching `SendMessage`, shipped with the plugin (plugin `hooks/`). This repo
  gets it through the plugin it enables, as every adopter does — not through a second copy in
  `.claude/settings.json`, which would run beside the plugin's and print the note twice (decided
  2026-09-24, at build).
- It reads the target helper's transcript — `<session transcript dir>/subagents/agent-<id>.jsonl`,
  where `<id>` is `tool_input.to` — takes the last assistant turn's
  `input + cache_read_input_tokens + cache_creation_input_tokens` as the context the helper carries,
  and, above a threshold (start at 150k; declare it once), adds context to the sender:
  carried size · what each step will re-read · "its commits and hand-off are on disk — a fresh
  helper briefed from them starts at ~Nk; resume only if it holds unsaved state you need."
- Never denies, never blocks (the `change-price.mjs` stance). Fails open and silent when the
  transcript cannot be read — say so in the code.
- **Premise to verify FIRST, by execution, before building anything else:** that Claude Code fires
  `PreToolUse` for `SendMessage`, and what `tool_input` carries (the recipient id). If it does not
  fire, the slice is prose-only (part 2) and says why.
- Tests: fixtures of subagent transcripts at sizes below/above threshold; an unreadable transcript;
  a recipient that is a peer session rather than a subagent (no transcript → silent).

### 2. The guidance, rewritten (plugin agent + this repo's agents)

`agents/cmp-orchestrator.md` (ships), `.claude/agents/deep-worker.md`, `.claude/agents/staff-reviewer.md`:
- A stalled, hung, hollow or finished helper gets a **fresh** helper briefed from its hand-off file
  and commits. Resume only when it holds unsaved state that cannot be recovered from disk — and
  the hook prices that choice.
- Every brief requires a **hand-off file** and a **commit the moment work exists**, so a restart
  loses nothing. (This wave's rule "commit each red test and each fix the moment it exists" is the
  model.)
- **One job per helper.** A second job is a new helper, not another pass on the old one.
- **A question about cost is answered with numbers and options** — never by stopping approved work
  (Karel, 2026-09-23: "I did not ask you to kill it").
- Before a fan-out: hold the machine awake, and put worktrees where the host's cleanup of
  unchanged worktrees cannot delete them.
- Hand the orchestrating session off at the budget point (the user-level rule; point at it, do not
  restate a number).
- Point, don't restate: the review rule stays in `docs/KNOWN-DEFECTS.md`'s header —
  `test/the-review-rule-is-stated-twice.test.mjs` refuses copies.

### Not in scope
- "Version bump last" — create-cmp's own release rule, already enforced by
  `test/a-version-number-cannot-name-two-different-trees.test.mjs`; adopters have no npm spine.

## How it is proven
- The hook's tests (above), plus one real `SendMessage` in a scratch session showing the added
  context appears.
- `test/agents-md.test.mjs`-style checks for any command the rewritten guidance cites.
- The usual slice gates: suite; review; device tier only if the stamped app moves (the agents file
  is plugin-side, so it should not).
