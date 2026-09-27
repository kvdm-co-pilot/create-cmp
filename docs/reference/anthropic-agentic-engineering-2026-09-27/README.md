# Anthropic agentic engineering — documentation base (2026-09-27)

State as of **2026-09-27**. A frozen, dated reference artifact (see `docs/DOCUMENTATION.md` → `reference/`): evidence of what Anthropic published and recommended on that date, not living guidance.

Start here → [REPORT.md](./REPORT.md)
(~10,300 words; every claim linked; ends with a prioritized "What create-cmp should revisit" list and a "Known gaps" table).

## Layout

| Path | What it holds |
|---|---|
| `REPORT.md` | The synthesis and entry point. Documentation map, eight thematic sections, 34 prioritized revisit items, known gaps. |
| `notes/01-anthropic-agent-building-guidance.md` | Every Anthropic Engineering/Research post on building agents, Dec 2024 → Sep 2026: patterns, ACI/tool rules, multi-agent research system, Agent SDK loop, Claude 5-family per-model guidance. |
| `.../02-harness-and-context-engineering.md` | What a harness is; context engineering (attention budget, compaction, memory, sub-agents); long-running-agent harness posts (Nov 2025, Mar 2026); cost economics; external comparators (OpenAI, Terminal-Bench, arXiv harness studies). |
| `.../03-claude-code-plugin-system.md` | plugin.json / marketplace.json schema, version-as-cache-key, `enabledPlugins` precedence, every extension surface and its frontmatter, hooks semantics, `claude plugin eval/validate/tag`, headless + cloud loading, 2026 changelog. |
| `.../04-agent-skills-and-claude-md.md` | Agent Skills spec (agentskills.io), Claude Code loading budgets, description-writing rules, skill evals (`claude plugin eval` vs skill-creator), CLAUDE.md / rules / auto-memory best practices, skill security and distribution. |
| `.../05-agentic-sdlc-workflows.md` | Best-practices guide (living page) incl. the four-rung verification ladder, Anthropic internal usage evidence, planning by cost-of-error, review/merge tiers, subagents vs teams vs workflows vs routines, industry comparison. |
| `.../06-evals-and-verification.md` | "Demystifying evals" definitions, pass@k vs pass^k, graders, `claude plugin eval` details, benchmark methodology, self- vs independent verification, reward hacking, SLSA/in-toto/attestation anchors. |
| `.../07-security-permissions-governance.md` | Permission modes and rule syntax, auto mode classifier behaviour, sandboxing, hooks fail-open edges, prompt injection, MCP trust, managed settings, safety research bearing on autonomous coding. |
| `.../08-whats-new-2026.md` | Dated 2026 sweep: models (incl. breaking API changes), Claude Code versions/features, Agent SDK, Managed Agents, platform features, MCP 2026-07-28, usage-limit changes. |

## How the base was built

Eight parallel researchers (five on Fable 5.1, three re-run on Opus 5.5 after an interrupt), each reading primary Anthropic pages live on 2026-09-27 and writing one notes file with a Sources list; one report writer (Opus 5.5) synthesized the report. Coordinated via the `deep-research` skill.

## Reading rules

- Notes carry `UNVERIFIED` flags and per-section "Gaps"; the report keeps them in "Known gaps". Treat those as open, not settled.
- Claude Code docs pages are undated living pages; where a date matters the notes cite a Claude Code version and its npm publish date.
- Before acting on any item in "What create-cmp should revisit", re-check the cited page: the platform moved fast in 2026 and will keep moving.
