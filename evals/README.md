# Plugin evals — does each skill load when a user asks for it in plain words?

`claude plugin eval` (Claude Code 2.1.269 or later, git 2.31 or later) reads this directory. Each
case is `evals/<case>/prompt.md` (frontmatter, then the prompt) plus `graders/*.md`. It runs
every case 3 times in a fresh, isolated `claude -p` session with only this plugin loaded.
Source: [Test plugins with evals](https://code.claude.com/docs/en/plugin-evals), summarised in
`docs/reference/anthropic-agentic-engineering-2026-09-27/notes/03-claude-code-plugin-system.md` §5.

- **One trigger case per plugin skill**, named `<skill>--natural`. The prompt is how a user would
  ask, never the skill's name. `graders/triggers.md` is a `tool_used` grader on the `Skill` tool
  with `min: 1`. `graders/result.md` is a `regex` over the final reply.
- **Near-miss negatives** for cmp-new (a React Native request), grill-me (a plain comparison
  question) and cmp-doctor (a Rust build failure), named `<skill>--near-miss-*`.
  `graders/not-triggered.md` asserts `min: 0, max: 0`.
- Every grader here is free: `regex` and `tool_used`, with no `llm` or `baseline` grader.
  `test/plugin-evals-are-well-formed.test.mjs` checks the shape in `npm test`. It never runs a case.

## Run it (at release, locally, under the subscription)

```bash
claude plugin eval . --trust-plugin --no-publish --ablation none \
  --model <pinned model id> --judge-model <pinned model id> \
  --max-cost-usd 10
```

- `--trust-plugin` is required. Without it, an untrusted plugin exits 1. The docs' CI recipe passes
  it too. This plugin ships hooks, and hooks run outside the eval sandbox.
- `--no-publish` keeps `report.html` local. Without it, the report is uploaded as a private
  artifact.
- `--ablation none` runs only the with-plugin arm. In the default two-arm run, `tool_used: Skill`
  graders are reported `scored: false`, so a dead trigger could not lower the score. Run the
  default two-arm mode separately if you want the Δ, which is what the plugin adds over no plugin.
- Pin both models to the same ids every release. `claudeVersion` is written into the result.
- `--case <name>` / `--tag <skill>` run a subset, for example `--tag cmp-new`.
- Exit codes: 0 means every case met `--threshold` (default 1.0). 1 means a case fell short, a
  load error, or an untrusted plugin. 2 means a partial run (`cost_ceiling`, `auth_failed`).

The run writes `evals/results/<timestamp>/`, which holds `report.html` and `aggregate-result.json`
(`schemaVersion: 1`, `aggregates.overallScore`, `casesPassed`/`casesTotal`). The directory is
gitignored. The release records its path and `overallScore` (npm-publish step 2).

**Billing.** The docs say every run and judge call is billed against the account. `llm` and
`baseline` graders each add a judge call. Under a subscription the cost is weekly usage, not
dollars (BATCH-2 D3). The ceiling still stops a runaway suite. If the run refuses or comes back
partial with `auth_failed`, or lists graders under `skippedPaidGraders`, keep this suite on
`regex`/`tool_used`/`file_exists` graders only and record the refusal verbatim. Do not add an API
secret to make it pass.

## What a result is, and is not

The result is a record taken at release and when the default model changes. It is not a merge gate
and not evidence: plugin hooks and real MCP servers run outside the sandbox, so "a suite that passes
says nothing about whether the plugin is safe". Before any program refuses on these results,
calibrate with a kept plant. Delete the trigger sentence from one skill's description, run
`--case <that skill>--natural`, and confirm it goes red. Then restore it.
