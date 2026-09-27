# What is new in the Anthropic / Claude platform, 2026-01-01 → 2026-09-27 (for Claude Code plugin and agentic-harness maintainers)

Research date: 2026-09-27. Primary sources: the Claude Platform release notes, the models overview and "choosing a model" pages, the Claude Code CHANGELOG.md (version dates taken from the npm registry publish times of `@anthropic-ai/claude-code`), the Agent SDK CHANGELOGs and GitHub releases, the MCP specification site, and anthropic.com news and engineering posts. A claim is marked **UNVERIFIED** when only a secondary source supports it.

Method note: CHANGELOG.md has no dates. Every "vX (date)" below pairs the CHANGELOG entry with the npm publish date of that version (`npm view @anthropic-ai/claude-code time`), so a date means "first shipped in a public build on".

Prompt premises checked: Opus 4.6 (Feb 2026), Fable 5 / Fable 5.1 (`claude-fable-5-1`), Mythos 5.1, Opus 5, Opus 5.5 (`claude-opus-5-5`) and Sonnet 5 (`claude-sonnet-5`) are all confirmed. The prompt left out four 2026 models that also shipped: **Sonnet 4.6, Opus 4.7, Opus 4.8** and **Mythos Preview**. "Opus 5" and "Opus 5.5" are separate models with separate prices. The "/verify" command exists as a skill, but I found no CHANGELOG entry recording when it was introduced.

## Models: releases, IDs, pricing, agentic implications, deprecations, selection guidance

### Takeaway
Nine new models have shipped since January. Opus went 4.6 → 4.7 → 4.8 → 5 → 5.5. Sonnet went 4.6 → 5. A new "Mythos-class" tier sits above Opus: Mythos Preview, Fable 5/5.1 and Mythos 5/5.1. The whole current lineup except Haiku 4.5 has 1M context and 128K output by default and uses adaptive thinking only, and it rejects parameters that 2025 code routinely sent: sampling params, manual thinking budgets and forced `tool_choice`. Anthropic's current default recommendation is **Opus 5.5 at default `medium` effort**. Escalate to **Fable 5.1** only when Opus 5.5 at `xhigh`/`max` falls short. **Haiku 4.5** is named for sub-agent tasks.

### Cited Findings
**Launch timeline (API model IDs)**
- 2026-02-05 — **Claude Opus 4.6** at $5/$25 per MTok. Adaptive thinking recommended, manual thinking deprecated, no assistant prefill, effort parameter GA, Compaction API beta, 1M context beta — [Release notes](https://platform.claude.com/docs/en/release-notes/overview). Claude Code v2.1.32 (2026-02-05): "Claude Opus 4.6 is now available!" — [CC CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
- 2026-02-07 — Fast mode research preview for Opus 4.6, "up to 2.5x faster output" at premium pricing — [Release notes](https://platform.claude.com/docs/en/release-notes/overview); CC v2.1.36 (2026-02-07) — [CC CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
- 2026-02-17 — **Claude Sonnet 4.6**: better agentic search with fewer tokens, 1M context (beta) — [Release notes](https://platform.claude.com/docs/en/release-notes/overview); CC v2.1.45 (2026-02-17). In CC v2.1.49 (2026-02-19), "Sonnet 4.5 with 1M context is being removed from the Max plan" — [CC CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
- 2026-04-07 — **Claude Mythos Preview**, a gated research preview for defensive cybersecurity (Project Glasswing) — [Release notes](https://platform.claude.com/docs/en/release-notes/overview)
- 2026-04-16 — **Claude Opus 4.7** at $5/$25, with breaking changes vs 4.6. It added the **`xhigh` effort level**, task budgets (beta) and hi-res image input — [Release notes](https://platform.claude.com/docs/en/release-notes/overview). CC v2.1.111 (2026-04-16) added `xhigh` "between `high` and `max`", and auto mode became available to Max subscribers on Opus 4.7 — [CC CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
- 2026-05-28 — **Claude Opus 4.8**: 1M context by default, 128k max output, effort defaults to `high`. Non-default `temperature`/`top_p`/`top_k` return **400**. It also introduced mid-conversation system messages and a 1,024-token minimum cacheable prompt — [Release notes](https://platform.claude.com/docs/en/release-notes/overview). CC v2.1.154 (2026-05-28): "Opus 4.8 is here! Now defaults to high effort · /effort xhigh for your hardest tasks"; Opus 4.8 fast mode at "2x the standard rate for 2.5x the speed" — [CC CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
- 2026-06-09 — **Claude Fable 5** (`claude-fable-5`) and **Claude Mythos 5** (`claude-mythos-5`). Both have 1M context, 128k output and always-on adaptive thinking; `thinking: disabled` is not supported and `thinking.display` defaults to `"omitted"`. Pricing is $10/$50 with cache reads at $0.25/MTok (0.025x). Safety classifiers run during inference, a pre-output refusal is not billed, and a new opt-in `fallbacks` parameter exists. Both require 30-day retention, so there is **no ZDR** — [Release notes](https://platform.claude.com/docs/en/release-notes/overview). Anthropic describes "Mythos-class" as a tier above Opus. Fable is the general-availability version: cyber, bio/chem and distillation classifiers fall back to Opus 4.8, and ">95% of Fable sessions involve no fallback". Mythos 5 is limited to Glasswing partners — [Anthropic news: Fable 5 / Mythos 5](https://www.anthropic.com/news/claude-fable-5-mythos-5). CC v2.1.170 (2026-06-09): "Introducing Claude Fable 5: a Mythos-class model that we've made safe for general use" — [CC CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
- 2026-06-30 — **Claude Sonnet 5** (`claude-sonnet-5`) at an introductory $2/$10, made permanent on 2026-08-10. It has 1M context, 128k output and adaptive thinking on by default. Manual extended thinking and sampling params both return 400. It also brought a **new tokenizer (~30% more tokens)** — [Release notes](https://platform.claude.com/docs/en/release-notes/overview). Anthropic calls it "the most agentic Sonnet model yet" and reports OSWorld-Verified 84.9%. It is the default for Free and Pro in the Claude apps — [Anthropic news: Sonnet 5](https://www.anthropic.com/news/claude-sonnet-5). CC v2.1.197 (2026-06-30): "now the default model in Claude Code" — [CC CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md). *Scope differs between sources:* the news post says Free/Pro default, the CHANGELOG says Claude Code default.
- 2026-07-24 — **Claude Opus 5** (`claude-opus-5`) at $5/$25 with 1M context and 128k output. Thinking is on by default, and it can be disabled only at effort ≤ `high` (at `xhigh`/`max` a disable returns 400). Mid-conversation tool changes (beta) and server-side `fallbacks` (beta) arrived with it, and fast mode was removed for Opus 4.7 — [Release notes](https://platform.claude.com/docs/en/release-notes/overview). Anthropic claims it "more than doubles Opus 4.8's performance" on Frontier-Bench v0.1 — [Anthropic news: Opus 5](https://www.anthropic.com/news/claude-opus-5)
- 2026-09-01 — **Claude Fable 5.1** (`claude-fable-5-1`) and **Claude Mythos 5.1** (`claude-mythos-5-1`) at $10/$50, with cache reads $0.25. **`tool_choice` `any`/`tool` returns 400.** Thinking blocks are preserved only for the same or a newer model. For accounts created on or after 2026-08-31, replayed thinking is prefix-checked, so an edited history returns 400. Per-message effort changes are in beta — [Release notes](https://platform.claude.com/docs/en/release-notes/overview). Mythos 5.1 is for Project Glasswing participants only — [Choosing a model](https://platform.claude.com/docs/en/about-claude/models/choosing-a-model)
- 2026-09-22 — **Claude Opus 5.5** (`claude-opus-5-5`) at **$4/$20** with cache reads $0.20 (0.05x) and cache writes $5. Fast mode costs $8/$40. It has 1M context and 128k output. Thinking cannot be disabled (disable → 400), and **`tool_choice` `any`/`tool` returns 400; the docs say to use `auto` with strict tool use**. Computer use requires `computer_toolset_20260801` — [Release notes](https://platform.claude.com/docs/en/release-notes/overview); [Anthropic news: Opus 5.5](https://www.anthropic.com/news/claude-opus-5-5). Claims: "40% less to run than Opus 5", ">30% faster", Terminal-Bench 4.0 66.4% vs 52.3% for Opus 5, OSWorld 2.0 81.8%, and "Sonnet 5.5/Haiku 5.5 in the coming weeks" — [Anthropic news: Opus 5.5](https://www.anthropic.com/news/claude-opus-5-5). CC v2.1.280 (2026-09-22): "now the default Opus model" — [CC CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)

**Current lineup (models overview, fetched 2026-09-27)**
- Fable 5.1: $10/$50, default effort `high`. Opus 5.5: $4/$20, default effort **`medium`**. Sonnet 5: $2/$10, default `high`. Haiku 4.5 (`claude-haiku-4-5-20251001`): $1/$5, no effort support, 200K context, 64K output, retirement "not sooner than October 15, 2026". "Every Claude model ID is a pinned snapshot, including the dateless IDs used from the 4.6 generation on." Batch output reaches 300k with `output-300k-2026-03-24`. Legacy models still available: Fable 5, Opus 5, Opus 4.8/4.7/4.6/4.5, Sonnet 4.6/4.5 — [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview)

**Deprecations/retirements (2026)**
- Retired Claude Haiku 3 on 2026-04-20. The Sonnet 4.5 / Sonnet 4 1M-context beta was retired on 2026-04-30 (requests over 200k now error). Claude Sonnet 4 and Opus 4 (`-20250514`) were retired on 2026-06-15. Opus 4.1 was retired on 2026-08-05. Opus 4.6 fast mode was removed on 2026-06-29. Opus 4.7 fast mode was removed on 2026-07-24. The legacy Workbench and the prompt-tools APIs were sunset on 2026-07-17, and Workbench was renamed Playground on 2026-08-20 — [Release notes](https://platform.claude.com/docs/en/release-notes/overview)

**Model-selection guidance for agent subtasks**
- "If you're unsure which model to use, start with Claude Opus 5.5… Use Claude Fable 5.1 for demanding reasoning and long-horizon agentic work, or when your evals on Claude Opus 5.5 at higher effort still fall short." — [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview)
- On effort: "Tuning effort is often a better lever than switching models." Fable 5.1 and Opus 5 start at `high`. Opus 5.5 starts at `medium`. On Opus 4.8/4.7, "`xhigh`… is the best setting for most coding and agentic use cases." The selection matrix maps Haiku 4.5 to "sub-agent tasks". It names two multi-model patterns: "an executor that escalates hard decisions to an advisor, and an orchestrator that delegates bulk work to lower-cost workers" — [Choosing a model](https://platform.claude.com/docs/en/about-claude/models/choosing-a-model)
- Anthropic publishes per-model prompting guides, for example "Prompting Claude Opus 5.5" at `/build-with-claude/prompt-engineering/prompting-claude-opus-5-5`, plus "What's new" and migration guides per model — [Choosing a model](https://platform.claude.com/docs/en/about-claude/models/choosing-a-model); [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview)
- **Advisor tool**: public beta on 2026-04-09 (`advisor-tool-2026-03-01`). Opus 4.8 support came on 2026-05-28, and an advisor `max_tokens` parameter on 2026-06-02 — [Release notes](https://platform.claude.com/docs/en/release-notes/overview). In Claude Code it is configured with `/advisor` / `--advisor fable` (v2.1.232, 2026-08-13) — [CC CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)

### Inferences
- Any 2025-era client that pins `temperature`, uses `thinking: {type: "enabled", budget_tokens}`, forces `tool_choice: {type: "tool"}`, or edits and replays thinking blocks will get **400s** on Opus 5.5, Fable 5.1 or Sonnet 5.
- The Sonnet 5 / Opus 4.7+ tokenizer change (~30% more tokens for the same text) silently inflates token budgets, compaction thresholds and any "context used" arithmetic calibrated on 4.5-era models.
- Opus 5.5's default effort is `medium`, lower than Opus 5's `high`. An agent definition that says "Opus at high" meant one thing on Opus 5 and means a deliberate up-shift on Opus 5.5.

### Gaps
- I did not fetch the Opus 4.6/4.7/4.8 and Fable 5.1 launch posts separately. Their details come from the release notes. The benchmark numbers for those models are not captured.
- SWE-bench figures for Opus 5.5 appear only in aggregators (e.g. "89.9% SWE-bench Pro"). **UNVERIFIED**: the Anthropic post I fetched cites Terminal-Bench/FrontierCode/OSWorld, not SWE-bench.

## Claude Code: major 2026 features by version and date, deprecations and removals

### Takeaway
Claude Code moved from a single-agent CLI to a multi-surface, multi-agent product: agent teams, background agents and `claude agents`, dynamic Workflows/`ultracode`, Remote Control, routines, self-hosted runners and cross-session `SendMessage`. **Auto mode**, a classifier-gated permission mode, is now the default in more and more configurations. Several late-2025 primitives changed or went away: commands merged into skills, `Agent{resume}` was replaced by `SendMessage`, and Todo tools were removed on new models.

### Cited Findings
All from [CC CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md) unless another source is named. Dates are npm publish dates.
- v2.1.0 (2026-01-07): skills can run in a forked sub-agent via `context: fork` frontmatter. Plugins can ship **prompt and agent hook types** (previously only command hooks).
- v2.1.3 (2026-01-09): "**Merged slash commands and skills**, simplifying the mental model with no change in behavior."
- v2.1.7 (2026-01-13): **MCP tool search on by default**. When MCP tool descriptions exceed 10% of context they are deferred and discovered via search. v2.1.9 (2026-01-15) added the `auto:N` threshold syntax.
- v2.1.14 (2026-01-20): plugins can be pinned to git commit SHAs in marketplace entries.
- v2.1.32 (2026-02-05): **agent teams** research preview (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, "token-intensive").
- v2.1.49 (2026-02-19): `--worktree` / `-w` flag for an isolated git worktree. The SDK model info gained `supportsEffort`, `supportedEffortLevels` and `supportsAdaptiveThinking`.
- v2.1.51 (2026-02-23): `claude remote-control` subcommand (**Remote Control**).
- v2.1.59 (2026-02-25): **auto-memory**: "Claude automatically saves useful context to auto-memory. Manage with /memory". v2.1.63 (2026-02-28) shares project configs and auto memory across worktrees of one repo, and adds the `/simplify` and `/batch` bundled commands.
- v2.1.68 (2026-03-04): Opus 4.6 defaults to medium effort for Max/Team, and the "ultrathink" keyword is re-introduced. v2.1.69 (2026-03-04) added the `/claude-api` skill. v2.1.71 (2026-03-06) added `/loop` for recurring prompts.
- v2.1.77 (2026-03-16): "The Agent tool **no longer accepts a `resume` parameter** — use `SendMessage({to: agentId})`." `SendMessage` auto-resumes stopped agents.
- v2.1.80 (2026-03-19): `effort` frontmatter for skills and slash commands, and `--channels` (research preview) so MCP servers can push messages into a session.
- v2.1.83 (2026-03-24): plugin options (`manifest.userConfig`) with `sensitive: true` values kept in the keychain.
- **Auto mode** was announced 2026-03-25 — [Engineering: How we built Claude Code auto mode](https://www.anthropic.com/engineering/claude-code-auto-mode). Changelog trail: v2.1.86 (2026-03-27) plan-restriction messaging; v2.1.89 (2026-03-31) a `PermissionDenied` hook after classifier denials; v2.1.91 (2026-04-02) `permissions.defaultMode: "auto"` schema; v2.1.136 (2026-05-08) `settings.autoMode.hard_deny`; v2.1.178 (2026-06-15) subagent spawns classified before launch; v2.1.207 (2026-07-10) available on Bedrock/Vertex/Foundry without opt-in; v2.1.257 (2026-09-01) a "Containment Escape" rule; v2.1.259 (2026-09-02) `--permission-prompts none` for unattended headless hosts; v2.1.283 (2026-09-25) "interactive sessions on third-party providers or with telemetry off … start in auto mode when no permission mode is configured".
- v2.1.94 (2026-04-07): default effort raised from medium to high for API-key, 3P, Team and Enterprise users. v2.1.117 (2026-04-21): Pro/Max default is `high` on Opus 4.6/Sonnet 4.6.
- v2.1.98 (2026-04-09): **Monitor tool** for streaming events from background scripts.
- v2.1.101 (2026-04-10): `/ultraplan` and remote-session features auto-create a default cloud environment.
- v2.1.110 (2026-04-15): push-notification tool (with Remote Control).
- v2.1.111 (2026-04-16): **`/ultrareview`**, a cloud multi-agent code review. Later it became `/code-review ultra`; v2.1.218 (2026-07-22) fixed that form falling back to a local run.
- **Routines** (cloud scheduled/API/GitHub-event-triggered sessions, created with `/schedule` or at claude.ai/code/routines): research preview, dated 2026-04-14 by secondary sources — [claude.com blog: Introducing routines](https://claude.com/blog/introducing-routines-in-claude-code); [Docs: routines](https://code.claude.com/docs/en/routines). **Date UNVERIFIED** against the primary post. v2.1.251 (2026-08-28): MCP servers configured locally in Claude Code **cannot be attached to cloud routines**.
- v2.1.139 (2026-05-11): **`/goal`** ("set a completion condition and Claude keeps working across turns until it's met"; works in `-p` and Remote Control) and **agent view** / `claude agents` (research preview). Remote Control, `/schedule` and claude.ai connectors are disabled when `ANTHROPIC_API_KEY` is set.
- v2.1.152 (2026-05-26): `disallowed-tools` frontmatter for skills and commands.
- v2.1.154 (2026-05-28): "**Introducing dynamic workflows**: … orchestrates work across tens to hundreds of agents in the background… Run `/workflows`." The release notes label Workflows a research preview — [Release notes, 2026-05-28](https://platform.claude.com/docs/en/release-notes/overview). v2.1.160 (2026-06-01) renamed the trigger keyword from `workflow` to **`ultracode`**. v2.1.219 (2026-07-24) set the default size guideline to medium ("fewer than 15 agents") and added `workflowSizeGuideline`. v2.1.248 (2026-08-27) moved the Workflow tool's script reference into a bundled `workflow-authoring` skill. v2.1.269 (2026-09-11) added `CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS` (1–256).
- v2.1.169 (2026-06-08): `disableBundledSkills` / `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS`.
- v2.1.198 (2026-07-01): "Subagents now treat messages from the agent that launched them as normal task direction; an agent's message is still never treated as the user's approval." Background agents from `claude agents` now commit, push and open a draft PR when done.
- v2.1.212 (2026-07-16): `/fork` now creates a background session, and the old in-session behaviour becomes `/subtask`.
- v2.1.215 (2026-07-19): "Claude no longer runs the `/verify` and `/code-review` skills on its own." v2.1.218 (2026-07-22) did the same for `/deep-research`.
- v2.1.224 (2026-08-07): **self-hosted environments** (`claude self-hosted-runner`) for web, mobile and desktop sessions on Team/Enterprise.
- v2.1.233 (2026-08-14): "**Todo/task-tracking tools (TaskCreate/Get/Update/List, TodoWrite) are no longer available on Opus 4.8, Sonnet 5, Fable 5, Mythos 5, and newer models**; set `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` to bring them back."
- v2.1.239 (2026-08-21): cross-session `SendMessage`/`ListAgents` across machines (Windows parity).
- v2.1.251 (2026-08-28): `/effort` is saved **per model**. v2.1.267 (2026-09-09) fixed `effort:` frontmatter on skills and subagents being ignored on models with a pinned default effort (Opus 4.7, Opus 4.8, Fable 5).
- v2.1.261 (2026-09-04): **`/skill-doctor`** shows unused skills and their context cost.
- v2.1.269 (2026-09-11): **`claude plugin eval`** gives scored, reproducible plugin eval suites (JSON + HTML). v2.1.283 requires git ≥2.31.
- v2.1.280 (2026-09-22): Opus 5.5 becomes the default Opus model. An effort saved before per-model effort existed no longer applies to newly released models.
- v2.1.283 (2026-09-25): `/doctor prompt-audit` audits CLAUDE.md, skills, agents and commands "for prompting patterns written for older models". New `availableModelsMatch: "exact"` and `deniedModels` managed settings. `plugin_errors` appears in stream-json init.
- Pre-2026 baselines, for orientation: the LSP tool shipped in v2.0.74 (2025-12-19), output styles in v1.0.81 (2025-08), and the desktop app in v2.0.51 (2025-11-24).

### Inferences
- A plugin that still ships `commands/` works, because the merge was "no change in behavior". New work, though, should be skills with `effort`, `disallowed-tools`, `context: fork` and `userConfig`.
- Agents and skills that list or instruct `TodoWrite`/`Task*` tools, or that spawn with `Agent{resume}`, are now broken or no-ops on default models.

### Gaps
- I could not find the exact CHANGELOG line that first introduced the auto-mode permission mode; the dates come from the engineering post and later entries. The same is true of the introduction of `/verify`.
- Fast mode as the Max default on Opus 4.8 is stated only in the 2026-05-28 release notes. I found no matching CHANGELOG line.

## Agent SDK (Python / TypeScript) changes in 2026

### Takeaway
Both SDKs track the CLI version: TS 0.3.283 and CLI 2.1.283 shipped on 2026-09-25. The breaking changes cluster in TS 0.3.142 (2026-05-14) and Python 0.2.129 (2026-08-04). Python SDK v0.2.160 is the latest (2026-09-25).

### Cited Findings
- TS 0.2.0 was released 2026-01-07. The TS line reached 0.3.x by May 2026, and the latest is v0.3.283 (2026-09-25) — [TS CHANGELOG](https://github.com/anthropics/claude-agent-sdk-typescript/blob/main/CHANGELOG.md); [TS releases](https://github.com/anthropics/claude-agent-sdk-typescript/releases)
- **TS 0.3.142 (npm 2026-05-14), breaking:**
  - Removed the unstable v2 session API (`unstable_v2_createSession`/`resumeSession`/`prompt`); use `query()` with an `AsyncIterable<SDKUserMessage>` or `options.resume`.
  - **MCP servers now connect in the background by default** and report `status: "pending"` until ready; `alwaysLoad: true` requires a server in turn 1.
  - **Headless/SDK sessions use Task tools instead of `TodoWrite`** — [TS CHANGELOG](https://github.com/anthropics/claude-agent-sdk-typescript/blob/main/CHANGELOG.md)
- TS deprecations: passing `'Skill'` in `allowedTools` (use the `skills` option). `updatedMCPToolOutput` is replaced by `updatedToolOutput` in `PostToolUse`. `options.env` "once again replaces `process.env`" (breaking) — [TS CHANGELOG](https://github.com/anthropics/claude-agent-sdk-typescript/blob/main/CHANGELOG.md)
- Python 0.1.77 deprecated `"Skill"` in `allowed_tools` in favour of `ClaudeAgentOptions.skills`. **Python 0.2.129 (2026-08-04), breaking:** malformed skill names raise `ValueError`, and `skills=["*"]` must become `skills="all"`. This also fixed an `--allowedTools` injection. Later, in-process SDK MCP servers gained **MCP 2.x** support (`mcp>=1.23.0,<3.0.0`) — [Python CHANGELOG](https://github.com/anthropics/claude-agent-sdk-python/blob/main/CHANGELOG.md); [Python releases](https://github.com/anthropics/claude-agent-sdk-python/releases)
- The Python `ThinkingConfig` types (adaptive/enabled/disabled) superseded `max_thinking_tokens` (v0.1.36). `rename_session()` was added in v0.1.49 — [Python CHANGELOG](https://github.com/anthropics/claude-agent-sdk-python/blob/main/CHANGELOG.md)
- Separately, the Anthropic *client* SDK (not the Agent SDK) reached **Python SDK v1.0** on 2026-08-19. It moved to `httpx2`, requires Python 3.10+, and removed Text Completions, sampling params and client-side `compaction_control` — [Release notes](https://platform.claude.com/docs/en/release-notes/overview)

### Inferences
- A harness that consumes SDK stream events and keys on `TodoWrite` snapshots, or expects every MCP server connected before turn 1, needs updating to per-task-ID accumulation and `pending` handling.

### Gaps
- I did not enumerate every new SDK option: hooks, structured outputs and permission callbacks all shipped incrementally across 250+ versions. The CHANGELOGs linked above are authoritative.

## Managed Agents, cloud sessions and routines

### Takeaway
**Claude Managed Agents** entered public beta on 2026-04-08. It is Anthropic's hosted agent harness: agents, environments (cloud or self-hosted sandboxes), sessions and events, all behind the `managed-agents-2026-04-01` header. It has grown multi-agent orchestration, Outcomes, memory, Dreams, webhooks, scheduled deployments, session budgets and an `auto` permission policy. It is a separate product from Claude Code's cloud sessions and routines.

### Cited Findings
- Launch timeline, per the [Release notes](https://platform.claude.com/docs/en/release-notes/overview):
  - 2026-04-08: public beta, plus the `ant` CLI.
  - 2026-04-23: memory.
  - 2026-05-06: multiagent orchestration, Outcomes, webhooks, Dreams (research preview).
  - 2026-05-11: Claude Platform on AWS.
  - 2026-05-19: self-hosted sandboxes, MCP tunnels; tool outputs over 100K characters spill to sandbox files.
  - 2026-06-09: scheduled deployments.
  - 2026-07-22: effort setting.
  - 2026-08-07: session budgets (a hard spend cap), an advisor config, skills loaded from GitHub.
  - 2026-09-10: `auto` permission policy.
- The docs describe it as a "Pre-built, configurable agent harness that runs in managed infrastructure", "best for long-running tasks and asynchronous work", in contrast to the Messages API "for custom agent loops and fine-grained control". Its built-in tools are Bash, file operations, web search/fetch and MCP. Because it is stateful, it is **not eligible for ZDR or HIPAA BAA** — [Managed Agents overview](https://platform.claude.com/docs/en/managed-agents/overview)
- Architecture write-up: "Scaling Managed Agents: Decoupling the brain from the hands" (2026-04-08) — [Engineering](https://www.anthropic.com/engineering/managed-agents)
- At Code with Claude 2026 (San Francisco, 2026-05-06; then London 05-19 and Tokyo 06-10) there were no new models. Anthropic announced multiagent orchestration, Outcomes and Dreaming, and "doubl[ed] Claude Code's five hour limit" — [InfoQ](https://www.infoq.com/news/2026/05/code-with-claude/); [Simon Willison live blog](https://simonwillison.net/2026/May/6/code-w-claude-2026/) (secondary sources; the limit claim is **UNVERIFIED** against a primary page)

### Inferences
- For create-cmp, which needs Android SDKs, emulators and Gradle, a self-hosted sandbox or `claude self-hosted-runner` is the only credible managed path. The default cloud sandbox is unlikely to host an emulator. **UNVERIFIED**: I did not check sandbox hardware limits.

### Gaps
- The Managed Agents session-runtime price was not on the overview page. I did not fetch the pricing page for it.

## Developer Platform features for agents

### Takeaway
Most late-2025 betas have gone GA: structured outputs, the effort parameter, tool search, programmatic tool calling, the memory tool, web fetch, code execution, the Files API and the Skills API. 1M context is now standard-priced and default on current models. New agent primitives arrived: server-side compaction, mid-conversation system messages and tool changes, per-message effort, task budgets, fallbacks and cache diagnostics.

### Cited Findings
All from the [Release notes](https://platform.claude.com/docs/en/release-notes/overview) unless noted.
- 2026-01-29: **structured outputs GA** on the Claude API. `output_format` moved to `output_config.format`.
- 2026-02-05: **effort parameter GA**. **Compaction API beta**. `inference_geo` data residency.
- 2026-02-17: **programmatic tool calling** and web search GA. The code execution, web fetch, **tool search tool**, tool use examples and **memory tool** no longer need a beta header. Code execution is free when used with web search or web fetch.
- 2026-03-13: **1M context GA** for Opus 4.6 and Sonnet 4.6 "at standard pricing". The dedicated 1M rate limits were removed.
- 2026-03-16: `thinking.display: "omitted"`. 2026-03-18: the Models API exposes `max_input_tokens`, `max_tokens` and `capabilities`.
- 2026-04-16: **task budgets** beta. 2026-04-24: Rate Limits API. 2026-05-13: cache diagnostics beta, GA 2026-09-23. 2026-05-27: `usage.output_tokens_details.thinking_tokens`.
- 2026-05-28: **prompt caching minimum 1,024 tokens** (Opus 4.8). Cache reads cost 10% of base input generally, 2.5% on Fable 5.1 and Mythos 5.1, and 5% on Opus 5.5 — [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview)
- 2026-06-26: rate limits raised. Sonnet and Haiku now match Opus at every tier, and the usage tiers were consolidated to Start, Build and Scale.
- 2026-08-18: **Files API GA**, **Agent Skills API GA** (`/v1/skills`), computer use GA as `computer_toolset_20260801`, and a new browser-use toolset.
- 2026-09-14: **compaction on demand** beta (`compact-2026-09-04`, top-level `compaction` parameter, signed `compaction` block). 2026-09-22: inline tools in mid-conversation system messages (beta), and the MCP connector header `mcp-client-2026-09-15`.
- 2026-09-24: refusal billing resumed for pre-output refusals in the categories `bio`, `frontier_llm` and `reasoning_extraction`.

### Inferences
- Tool search is GA both in the API and on by default in Claude Code (2.1.7). Large MCP tool surfaces are now cheap to expose, but a tool is only reached if its description is discoverable by search.

### Gaps
- I did not fetch the pricing page separately. The per-model prices above come from the models overview, release notes and launch posts.

## MCP ecosystem changes

### Takeaway
The MCP spec's current revision is **2026-07-28**. It is a large, backwards-incompatible redesign: MCP becomes **stateless**, with no `initialize` handshake and no `Mcp-Session-Id`. It adds a mandatory `server/discover`. The Multi Round-Trip Request pattern replaces server-initiated sampling and elicitation requests. Roots, Sampling and Logging are deprecated, Tasks moved to an extension, and OAuth Dynamic Client Registration is deprecated in favour of Client ID Metadata Documents.

### Cited Findings
- "The **current** protocol version is **2026-07-28**." Version negotiation is now per request via `_meta` `io.modelcontextprotocol/protocolVersion`, and `server/discover` is "a mandatory RPC" — [MCP versioning](https://modelcontextprotocol.io/specification/versioning)
- Major changes vs 2025-11-25:
  - removed protocol sessions and the `initialize`/`initialized` handshake (SEP-2567/2575);
  - `subscriptions/listen` replaces the GET stream and resource subscribe;
  - removed `ping` and `logging/setLevel`;
  - tasks became the `io.modelcontextprotocol/tasks` extension;
  - the MRTR `input_required` results pattern (SEP-2322);
  - SSE resumability removed.
  - Minor: servers "SHOULD return tools from `tools/list` in a deterministic order to enable … LLM prompt cache hit rates", and required `ttlMs`/`cacheScope`.
  - Deprecated: Roots, Sampling, Logging (SEP-2577), HTTP+SSE, and DCR (use Client ID Metadata Documents). The spec also adopted a 12-month deprecation policy.
  - [MCP 2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- Claude Code-side MCP changes: tool-search deferral on by default (v2.1.7, 2026-01-13); `--channels` push (v2.1.80, 2026-03-19); plugin MCP servers reconnect after an idle web session wakes (v2.1.211) — [CC CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md). On the API side there are MCP tunnels (research preview, 2026-05-19) and the `mcp-client-2026-09-15` connector — [Release notes](https://platform.claude.com/docs/en/release-notes/overview)

### Gaps
- I did not confirm when Claude Code started speaking the 2026-07-28 revision, or whether it still falls back to `initialize`. The spec documents backward compatibility with handshake-based revisions.
- MCP registry changes in 2026 were not researched.

## Usage-limit and policy changes affecting heavy autonomous sessions

### Takeaway
Subscription limits moved several times. The five-hour limit was doubled around 2026-05-06, weekly limits had a temporary +50% boost from May, and on 2026-09-14 weekly limits settled at a permanent +25% over the original baseline. That is about 17% below the summer level. On the API, rate limits were raised and tiers consolidated on 2026-06-26.

### Cited Findings
- "Starting September 14, we're permanently raising standard weekly limits in Claude Code by 25% for Pro, Max, Team, and seat-based Enterprise plans. Until then, the current 50% increase will be in place." — [@ClaudeDevs on X](https://x.com/ClaudeDevs/status/2093742321473065266). Net effect: about 17% below the promo level — [BleepingComputer](https://www.bleepingcomputer.com/news/artificial-intelligence/anthropic-is-cutting-claude-codes-current-weekly-limits-by-17-percent/)
- The five-hour limit was doubled at Code with Claude on 2026-05-06 — [InfoQ](https://www.infoq.com/news/2026/05/code-with-claude/) (**UNVERIFIED** against a primary page)
- API: 2026-06-26 rate-limit raise and tier consolidation — [Release notes](https://platform.claude.com/docs/en/release-notes/overview)
- Postmortem: "An update on recent Claude Code quality reports" (2026-04-23) — [Engineering](https://www.anthropic.com/engineering/april-23-postmortem)

### Gaps
- I found no primary support.claude.com page giving the absolute weekly numbers.

## Anthropic events and publications, 2026

### Cited Findings
- Engineering posts visible on the index — [anthropic.com/engineering](https://www.anthropic.com/engineering):
  - "Demystifying evals for AI agents" (2026-01-09)
  - "Designing AI-resistant technical evaluations" (2026-01-21)
  - "Building a C compiler with a team of parallel Claudes" (2026-02-05)
  - "Quantifying infrastructure noise in agentic coding evals" (2026-02-05)
  - "Eval awareness in Claude Opus 4.6's BrowseComp performance" (2026-03-06)
  - "Harness design for long-running application development" (2026-03-24)
  - "How we built Claude Code auto mode" (2026-03-25)
  - "Scaling Managed Agents" (2026-04-08)
  - "An update on recent Claude Code quality reports" (2026-04-23)
  - "How we contain Claude across products" (featured, undated)
- News posts from 2026-08 to 2026-09 are mostly safety and science items, e.g. "Improving Fable 5's biology safeguards" (2026-08-07) and "How Claude's text watermark works" (2026-08-14) — [anthropic.com/news](https://www.anthropic.com/news)
- Code with Claude 2026: SF 2026-05-06, London 2026-05-19, Tokyo 2026-06-10 — [InfoQ](https://www.infoq.com/news/2026/05/code-with-claude/)

### Gaps
- The engineering index I fetched showed only 10 posts, the latest dated 2026-04-23. Posts from May to September may exist and were not captured.
- I did not find the Anthropic Academy course updates or the 2026 Agentic Coding Trends Report; both are unresearched.

## Implications for a Claude Code plugin repo (create-cmp) built on late-2025 assumptions

### Inferences (each tied to a cited change above)
1. **Model IDs and effort in agent frontmatter.** Opus 5.5 is the default Opus with default effort `medium` (CC v2.1.280). Effort is now stored per model (v2.1.251), and before v2.1.267 `effort:` frontmatter was ignored on pinned-default models. Re-check `agents/*.md` and `.claude/agents/*.md` ("Opus 5 at xhigh", "Opus, high") against what actually runs, and run `/doctor prompt-audit` (v2.1.283).
2. **Remove `TodoWrite` and `Task` from agent `tools:` lists.** Todo/Task tools are unavailable on Opus 4.8+, Sonnet 5 and Fable 5+ unless `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` (v2.1.233). The `cmp-orchestrator` agent's tool list includes `TodoWrite` and `Task`. Also replace any `Agent{resume}` instruction with `SendMessage` (v2.1.77).
3. **Skills over commands, and use the new frontmatter.** Commands merged into skills (v2.1.3). Adopt `effort`, `disallowed-tools`, `context: fork` and `userConfig` for sensitive config, where the plugin currently handles those by hand.
4. **Adopt plugin evaluation tooling.** `claude plugin eval` (v2.1.269, 2026-09-11) and `/skill-doctor` (v2.1.261) map directly onto the repo's "program not prose" gates and give the skill-context-cost measurement the session-budget rule asks for.
5. **Headless and unattended lanes.** Auto mode is the default for 3P/telemetry-off interactive sessions (v2.1.283). `--permission-prompts none` (v2.1.259) and the `PermissionDenied` hook (v2.1.89) are the supported ways to run gates unattended. Review the proof-gate hook against auto-mode classifier behaviour, including the new "Containment Escape" and transcript-tamper rules (v2.1.205, v2.1.257).
6. **The cmp-inspector MCP server and MCP 2026-07-28.** Plan for stateless request handling, `server/discover`, deterministic `tools/list` order (it helps prompt caching) and `ttlMs`/`cacheScope`. Stop relying on Roots, Sampling or Logging, all deprecated. With tool search on by default (v2.1.7), inspector tool descriptions must be searchable, because tools may be deferred.
7. **Anything that calls the API directly** (npm CLI, gatekeeper, eval scripts). Remove `temperature`/`top_p`/`top_k`, `budget_tokens` thinking and forced `tool_choice` (400 on Opus 5.5 / Fable 5.1). Move to `output_config.format` and to Python SDK v1.0 semantics.
8. **Orchestration model.** Dynamic Workflows/`ultracode` (v2.1.154, research preview, default fewer than 15 agents) and agent teams now overlap with the plugin's own orchestrator-and-executor pattern. Decide which to keep. Note that `/verify` and `/code-review` no longer auto-run (v2.1.215).
9. **Cost and budget arithmetic.** The new tokenizer adds about 30% more tokens. Cache reads cost 0.05x on Opus 5.5 and the cacheable minimum is 1,024 tokens. Weekly limits were reset on 2026-09-14. Any recorded "tokens per hour" baselines need recalibrating.
10. **Cloud execution.** Routines cannot use locally configured MCP servers (v2.1.251). `claude self-hosted-runner` (v2.1.224) or Managed Agents self-hosted sandboxes are the route for a runtime tier that needs an Android toolchain.

## Sources
- Claude Platform release notes — https://platform.claude.com/docs/en/release-notes/overview
- Models overview — https://platform.claude.com/docs/en/about-claude/models/overview
- Choosing a model — https://platform.claude.com/docs/en/about-claude/models/choosing-a-model
- Managed Agents overview — https://platform.claude.com/docs/en/managed-agents/overview
- Claude Code CHANGELOG — https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md (dates: npm registry `@anthropic-ai/claude-code` publish times)
- Agent SDK TypeScript CHANGELOG / releases — https://github.com/anthropics/claude-agent-sdk-typescript/blob/main/CHANGELOG.md ; https://github.com/anthropics/claude-agent-sdk-typescript/releases
- Agent SDK Python CHANGELOG / releases — https://github.com/anthropics/claude-agent-sdk-python/blob/main/CHANGELOG.md ; https://github.com/anthropics/claude-agent-sdk-python/releases
- MCP versioning — https://modelcontextprotocol.io/specification/versioning
- MCP 2026-07-28 changelog — https://modelcontextprotocol.io/specification/2026-07-28/changelog
- Anthropic news: Opus 5.5 — https://www.anthropic.com/news/claude-opus-5-5
- Anthropic news: Opus 5 — https://www.anthropic.com/news/claude-opus-5
- Anthropic news: Sonnet 5 — https://www.anthropic.com/news/claude-sonnet-5
- Anthropic news: Fable 5 / Mythos 5 — https://www.anthropic.com/news/claude-fable-5-mythos-5
- Anthropic news index — https://www.anthropic.com/news
- Anthropic engineering index — https://www.anthropic.com/engineering
- Engineering: auto mode — https://www.anthropic.com/engineering/claude-code-auto-mode
- Engineering: Managed Agents — https://www.anthropic.com/engineering/managed-agents
- Engineering: April 23 postmortem — https://www.anthropic.com/engineering/april-23-postmortem
- claude.com blog: routines — https://claude.com/blog/introducing-routines-in-claude-code
- Claude Code docs: routines — https://code.claude.com/docs/en/routines
- @ClaudeDevs weekly-limit post — https://x.com/ClaudeDevs/status/2093742321473065266
- BleepingComputer (weekly limits, secondary) — https://www.bleepingcomputer.com/news/artificial-intelligence/anthropic-is-cutting-claude-codes-current-weekly-limits-by-17-percent/
- InfoQ, Code with Claude 2026 (secondary) — https://www.infoq.com/news/2026/05/code-with-claude/
- Simon Willison live blog (secondary) — https://simonwillison.net/2026/May/6/code-w-claude-2026/
