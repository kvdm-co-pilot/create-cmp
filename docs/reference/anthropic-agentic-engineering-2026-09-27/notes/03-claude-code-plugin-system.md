# Claude Code plugin and extension system (state as of 2026-09-27)

Method note: every docs claim below was read from the live markdown of the Claude Code docs, fetched 2026-09-27 (`https://code.claude.com/docs/en/<page>.md`; the rendered page is the same path without `.md`). Plugin docs moved into a `plugins/` sub-tree during 2026: the old `plugins-reference` URL now serves the manifest reference. Changelog entries come from `anthropics/claude-code` `CHANGELOG.md` (HEAD = v2.1.283). The changelog has no dates, so the dates below are the **npm publish dates** of `@anthropic-ai/claude-code` from the npm registry. Treat them as release dates, not exact changelog dates. Anything I did not confirm against a live page is marked UNVERIFIED.

---

## 1. Plugin manifest, marketplace, versioning, install/update/enable, scopes, caches, official directory

### Takeaway
A plugin is a directory. `.claude-plugin/plugin.json` is optional and `name` is its only required field. A marketplace is a `.claude-plugin/marketplace.json` catalog. Claude Code computes a **version** for every install, and that version does two jobs: it names the cache directory (`cache/<marketplace>/<plugin>/<version>/`) and it decides whether an update happens. The version is read from **plugin.json first**, then the marketplace entry, then the source (a git SHA, or `unknown` for npm and local sources). So a pinned `version` that is never bumped keeps every user on the old cached bytes, however many commits you push. `enabledPlugins` is merged key by key across six sources, from `--add-dir` (lowest) up to managed (highest). A running session never changes what it loaded until you run `/reload-plugins` or restart.

### Cited Findings
**plugin.json schema**
- The manifest is optional. Without it, components load from the standard layout and the name comes from the marketplace entry or the directory name. It lives at `.claude-plugin/plugin.json`, and every other file sits at the plugin root, not inside `.claude-plugin/` — [Manifest reference](https://code.claude.com/docs/en/plugins/manifest-reference#manifest-file)
- Full top-level field list:
  - `$schema`, `name` (required, kebab-case; every component is namespaced under it), `displayName`, `version`, `description`, `author` (object with required `name`; `email` and `url` optional)
  - `homepage` (must parse as a URL or the plugin fails to load), `repository` (not validated), `license`, `keywords`
  - `metadata` (free-form, not read by Claude Code; v2.1.222+), `defaultEnabled` (default `true`), `dependencies`
  - `settings` (only `agent` and `subagentStatusLine` take effect), `userConfig`, `channels`
  - Component keys: `skills`, `commands`, `agents`, `hooks`, `mcpServers`, `lspServers`, `outputStyles`, `workflows`
  - `experimental` (holds `themes`, `monitors`, `evals`)
  - Source: [Manifest reference — Fields](https://code.claude.com/docs/en/plugins/manifest-reference#fields)
- Unknown top-level keys are stripped with a validate warning. Unknown keys inside `userConfig`, `channels`, `lspServers` or `monitors` entries are errors, and the plugin doesn't load — [Manifest reference — Unrecognized fields](https://code.claude.com/docs/en/plugins/manifest-reference#unrecognized-fields)
- `name` must have no spaces, `@`, `:`, path separators, control characters or bidi characters. Agent `reviewer` in plugin `deploy-tools` becomes `deploy-tools:reviewer` — [Manifest reference — name](https://code.claude.com/docs/en/plugins/manifest-reference#name)
- `version` is "not checked against semver. Setting it pins the plugin to that version until you change it." It does not pin `command`-source plugins, claude.ai-hosted marketplace plugins, or plugins loaded in place from a local-directory marketplace — [Manifest reference — version](https://code.claude.com/docs/en/plugins/manifest-reference#version)
- How each component key combines with its default folder:
  - Replaces the default: `commands`, `agents`, `outputStyles`, `workflows`, `experimental.themes`, `experimental.monitors`
  - Adds to the default: `skills`
  - Merges with the default file: `hooks`, `mcpServers`, `lspServers`
  - Every path must start with `./`, stay inside the plugin root, and exist. `..` fails validation.
  - Source: [Manifest reference — Path rules](https://code.claude.com/docs/en/plugins/manifest-reference#path-rules)
- Standard layout:

  | Location | Holds |
  | :--- | :--- |
  | `skills/<name>/SKILL.md` | Skills |
  | `commands/` | Commands ("Prefer `skills/` for new plugins") |
  | `agents/` | Agents (subfolders become part of the name) |
  | `hooks/hooks.json` | Hooks |
  | `.mcp.json` | MCP servers |
  | `.lsp.json` | LSP servers |
  | `output-styles/` | Output styles |
  | `workflows/*.js` | Workflows |
  | `themes/` | Themes |
  | `monitors/monitors.json` | Monitors |
  | `bin/` | Executables, put on the Bash tool's PATH |
  | `settings.json` | Default settings |

  A `CLAUDE.md` at the plugin root is **not loaded**, and validate warns about it — [Manifest reference — Standard layout](https://code.claude.com/docs/en/plugins/manifest-reference#standard-layout)
- `bin/`: "claude.ai and Cowork don't install a plugin that has this directory" — [Manifest reference — Standard layout](https://code.claude.com/docs/en/plugins/manifest-reference#standard-layout)
- `userConfig` option fields: `type` (string/number/boolean/directory/file), `title`, `description`, `required`, `default`, `options` (v2.1.271+), `multiple`, `sensitive`, `min`/`max`.
  - Non-sensitive values are stored under `pluginConfigs` in the user's settings.json. Sensitive values go to the OS secure store.
  - Values are referenced as `${user_config.KEY}` in MCP/LSP config, exec-form hook `args`, and skill/agent content (non-sensitive only), or as the env var `CLAUDE_PLUGIN_OPTION_<KEY>` in hooks.
  - Shell-form hooks, monitor commands and MCP `headersHelper` **reject** `${user_config.*}`.
  - Source: [Manifest reference — User configuration](https://code.claude.com/docs/en/plugins/manifest-reference#user-configuration)
- Path variables:
  - `${CLAUDE_PLUGIN_ROOT}` is the installed version's directory and changes on every update, so don't write state there.
  - `${CLAUDE_PLUGIN_DATA}` is `~/.claude/plugins/data/<id>/`, kept across updates and deleted on the last uninstall unless you pass `--keep-data`.
  - `${CLAUDE_PROJECT_DIR}` is the project root.
  - None of these are in the environment of Bash-tool commands. In skill and agent bodies they are substituted inline.
  - Source: [Manifest reference — Environment variables](https://code.claude.com/docs/en/plugins/manifest-reference#environment-variables)

**marketplace.json schema and sources**
- Required fields: `name`, `owner` (`name` required), `plugins`. Optional: `$schema`, `description`, `version`, `metadata.{description,version,pluginRoot}` (pluginRoot is v2.1.239+), `forceRemoveDeletedPlugins`, `allowCrossMarketplaceDependenciesOn`, `renames` (v2.1.193+). Unknown keys are ignored silently at load and produce a validate warning — [Marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference#top-level-fields)
- A plugin entry has required `name` and `source`, plus `description`, `version`, `category`, `tags`, `strict` (default `true`), `relevance`, `dependencies`, `defaultEnabled`, `displayName`, `metadata`, `headers`, and `headersHelper` (v2.1.238+). An entry can also carry any plugin.json field — [Marketplace reference — Plugin entries](https://code.claude.com/docs/en/plugins/marketplace-reference#plugin-entries)
- Plugin source types:

  | Type | Fields | Min version |
  | :--- | :--- | :--- |
  | relative path (`./…`, or a bare name under `pluginRoot`) | the string | — |
  | `github` | `repo`, `ref`, `sha` | — |
  | `url` (any git URL) | `url`, `ref`, `sha` | — |
  | `git-subdir` | `url`, `path`, `ref`, `sha` | — |
  | `npm` | `package`, `version`, `registry` | — |
  | `archive` (HTTPS zip) | `url`, `sha256` | v2.1.224 |
  | `command` | `command`, `timeout`, `mode: copy\|link` | v2.1.229 |

  Source: [Marketplace reference — Plugin sources](https://code.claude.com/docs/en/plugins/marketplace-reference#plugin-sources)
- Marketplace source types for `marketplace add` and `extraKnownMarketplaces`: `url` (a direct link to marketplace.json, so relative plugin paths can't resolve), `github`, `git`, `file`, `directory`, `settings` (an inline catalog). An **npm marketplace source "Fails to load: `NPM marketplace sources not yet implemented`"**. `hostPattern`, `pathPattern`, `skills-dir` and `owner/*` are valid only in the policy lists — [Marketplace reference — Marketplace sources](https://code.claude.com/docs/en/plugins/marketplace-reference#marketplace-sources)
- npm plugin source: fetched with your npm client, install scripts never run, and dependencies are not installed during the fetch — [Marketplace reference — npm](https://code.claude.com/docs/en/plugins/marketplace-reference#npm-plugin-source). Since v2.1.275 the fetch uses `npm pack --ignore-scripts` with an integrity check — [CHANGELOG 2.1.275](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
- Strict mode: with `plugin.json` present and `strict:true` (the default), the entry's commands, agents, skills, outputStyles and themes are appended to the manifest's. Entry hooks replace the manifest's matchers per event. With `strict:false`, any entry component field is a conflict and the plugin fails to load. **The manifest's `version` wins over the entry's.** The entry's display fields and `defaultEnabled` win over the manifest's — [Marketplace reference — Strict mode](https://code.claude.com/docs/en/plugins/marketplace-reference#strict-mode); [Manifest reference — Metadata precedence](https://code.claude.com/docs/en/plugins/manifest-reference#metadata-precedence)
- Reserved marketplace names:
  - `claude-plugins-official`, `anthropic-plugins`, `agent-skills` and others, plus names that impersonate them or contain non-ASCII characters
  - `inline`, `builtin`, `skills-dir`, `synced`, `claude-plugin-test`
  - `npm`, `pip`, `uv`, `cargo`, `github`, `gh` (v2.1.275+)
  - the `claudeai-` prefix
  - Source: [Marketplace reference — Reserved names](https://code.claude.com/docs/en/plugins/marketplace-reference#reserved-names)

**Versions, caches, updates**
- Version resolution for every source type except `command`:
  1. `version` in plugin.json
  2. `version` in the marketplace entry
  3. From the source:
     - `github`, `url`, `git-subdir`: 12-character commit SHA
     - `archive`: 12-character sha256
     - relative path inside a git-hosted marketplace: commit SHA of the installed directory
     - local directory that is not a git repo: `unknown`
     - `npm`: `unknown`
  - "Claude Code doesn't take the version from a repository that encloses the install path, such as a git-managed `~/.claude`."
  - Source: [Plugin loading reference — How Claude Code computes the version](https://code.claude.com/docs/en/plugins/loading#how-claude-code-computes-the-version)
- "The version also names the plugin's cache directory." `claude plugin update` and auto-update skip a plugin whose computed version matches `installed_plugins.json`, printing `<name> is already at the latest version (<version>).` — [Plugin loading — Versions and updates](https://code.claude.com/docs/en/plugins/loading#versions-and-updates)
- On-disk layout under `~/.claude/plugins` (overridable with `CLAUDE_CODE_PLUGIN_CACHE_DIR`):
  - `cache/<marketplace>/<plugin>/<version>/`
  - `data/<plugin-id>/`
  - `marketplaces/<name>/`
  - `synced/`, `.trash/`
  - `installed_plugins.json`, `known_marketplaces.json` (one per user)
  - `flagged-plugins.json`
  - Source: [Plugin loading — Find plugins on disk](https://code.claude.com/docs/en/plugins/loading#find-plugins-on-disk)
- In-place vs copied:
  - `--plugin-dir` plugins and skills-directory plugins load in place.
  - Relative-path plugins in a marketplace **added from a local directory** load in place. Edits apply at the next session start or `/reload-plugins`, with no version bump.
  - Every other marketplace plugin is copied into the cache, and files outside the plugin directory are not copied.
  - Source: [Plugin loading — In-place and copied plugins](https://code.claude.com/docs/en/plugins/loading#in-place-and-copied-plugins)
- Old version directories get an `.orphaned_at` marker and are removed 14 days later, "so a session that already loaded the old version keeps running" — [Plugin loading — Cleanup of previous versions](https://code.claude.com/docs/en/plugins/loading#cleanup-of-previous-versions)
- Node dependencies install into the copied version directory only when the plugin root has `package.json` **and** a lockfile. `bun.lock`/`bun.lockb` runs `bun install --frozen-lockfile --ignore-scripts`; `npm-shrinkwrap.json`/`package-lock.json` runs `npm ci --ignore-scripts`. There is a 60-second timeout and no lifecycle scripts. Yarn and pnpm lockfiles are skipped. For npm-sourced plugins, use `npm-shrinkwrap.json`, because npm excludes `package-lock.json` from published packages. The install can't be turned off — [Plugin loading — Node.js package dependencies](https://code.claude.com/docs/en/plugins/loading#node-js-package-dependencies)
- Marketplace refresh before an install:
  - `name@marketplace` refreshes that marketplace first.
  - A bare `name` via `claude plugin install` refreshes nothing.
  - A bare `name` via `/plugin install` refreshes only auto-update marketplaces, and only after a miss.
  - The refresh is skipped for local file/directory sources and when the marketplace was refreshed within 30 s.
  - Source: [Plugin loading — When Claude Code refreshes a marketplace](https://code.claude.com/docs/en/plugins/loading#when-claude-code-refreshes-a-marketplace-before-an-install)
- Auto-update:
  - In interactive sessions it runs after the first message plus a random delay of up to 10 minutes.
  - The default is on for Anthropic official marketplaces and **off for every third-party marketplace** unless `autoUpdate` is set.
  - `DISABLE_AUTOUPDATER`, `DISABLE_UPDATES` or `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` disable it unless `FORCE_AUTOUPDATE_PLUGINS=1`.
  - When a copied plugin updates mid-session, hooks, MCP and LSP servers keep the old path until `/reload-plugins`. **Monitors need a restart.**
  - Source: [Plugin loading — When auto-update runs](https://code.claude.com/docs/en/plugins/loading#when-auto-update-runs)
- The three stages a plugin passes through:
  - Declared: `enabledPlugins` and `extraKnownMarketplaces` in settings.
  - Fetched: under `~/.claude/plugins/`.
  - Loaded: the running session, which changes only on `/reload-plugins` or a new session. "That is why `claude plugin update` ends with `Restart to apply changes.`"
  - Source: [Plugin loading — Check which stage](https://code.claude.com/docs/en/plugins/loading#check-which-stage-a-plugin-reached)

**enabledPlugins scopes and precedence**
- Six sources, from lowest to highest precedence:
  1. `--add-dir` (only `true` has an effect)
  2. `user` (`~/.claude/settings.json`)
  3. `project` (`.claude/settings.json`)
  4. `local` (`.claude/settings.local.json`)
  5. `flag` (`--settings`)
  6. `managed` (`true` force-enables, `false` blocks, and nothing overrides it)

  Values merge per plugin id, and the highest source that mentions the id wins. To opt out of a project-enabled plugin, set it to `false` in `.claude/settings.local.json` — [Plugin loading — Find where a plugin is enabled](https://code.claude.com/docs/en/plugins/loading#find-where-a-plugin-is-enabled)
- A project-only `true` doesn't fetch an externally sourced plugin onto a machine that lacks it (`is enabled in project settings but isn't installed here`). Relative-path plugins are the exception. Fetching happens only when user, untracked local, `--settings` or managed settings set the plugin to `true` — [Plugin loading](https://code.claude.com/docs/en/plugins/loading#enabled-in-project-settings-but-not-installed)
- Plugin id origins are `@<marketplace>`, `@inline` (`--plugin-dir`, `--plugin-url`, `CLAUDE_CODE_PLUGIN_DIRS`, SDK), `@skills-dir` (a plugin dir under `.claude/skills/`) and `@synced` (claude.ai account, v2.1.273+). The entry name is the enable key and the cache directory name. The manifest name is the component namespace — [Plugin loading — Find where a plugin came from](https://code.claude.com/docs/en/plugins/loading#find-where-a-plugin-came-from)
- Name-conflict order, highest first:
  1. managed-listed plugins
  2. `--plugin-dir`, which *silently* replaces an installed marketplace plugin with the same manifest name
  3. installed marketplace plugins
  4. skills-dir plugins
  5. synced plugins

  Source: [Plugin loading — Name conflicts](https://code.claude.com/docs/en/plugins/loading#name-conflicts)

**CLI commands**
- `claude plugin` subcommands: `init`, `install|i`, `uninstall`, `enable`, `disable`, `update`, `list`, `details`, `prune`, `eval`, `eval init`, `tag`, `validate`, plus `marketplace add|list|remove|update`.
  - `--scope user|project|local`, defaulting to user; `update` also accepts `managed`.
  - Exit codes: 0 success, 1 failure. `validate` adds 2 for an unexpected error.
  - `--json` on install/uninstall/update/enable/disable needs v2.1.268+.
  - `install --config key=value` sets a userConfig value; `-y` or `--accept-command <sha256>` accepts command sources.
  - Source: [Plugin commands reference](https://code.claude.com/docs/en/plugins/cli-reference)
- `claude plugin tag` creates an annotated tag `<name>--v<version>` after checking that plugin.json and the marketplace entry agree on the version — [Plugin commands — plugin tag](https://code.claude.com/docs/en/plugins/cli-reference#plugin-tag)
- `claude plugin marketplace update [name]` refreshes one or all marketplaces. A marketplace added with a `ref` follows that ref — [Plugin commands — marketplace update](https://code.claude.com/docs/en/plugins/cli-reference#plugin-marketplace-update)
- `/reload-plugins [--force]` applies pending changes and prints `Reloaded: N plugins · N skills · N agents · N hooks · N plugin MCP servers · N plugin LSP servers`.
  - It refuses a reload that would add or remove MCP tools and so invalidate the prompt cache, unless you pass `--force`.
  - It works in `-p`, Desktop and SDK sessions since v2.1.260, but only when typed by the user. It is refused over Remote Control.
  - Source: [Plugin commands — /reload-plugins](https://code.claude.com/docs/en/plugins/cli-reference#reload-plugins)
- Flags that load a plugin for one session: `--plugin-dir <dir|zip>`, which can also point at a folder of plugins, and `--plugin-url <zip-url>` — [Plugin commands — Flags](https://code.claude.com/docs/en/plugins/cli-reference#flags-that-load-a-plugin-for-one-session)

**Release mechanics and the official directory**
- "Don't set `version` in both `plugin.json` and the marketplace entry. If you do, Claude Code uses the `plugin.json` value without warning." Either bump `version` every release or omit it so the commit SHA tracks releases — [Host a marketplace — Release a new version](https://code.claude.com/docs/en/plugins/host-marketplace)
- "Claude Code has no release-channel concept." For stable and early-access tracks, host two marketplaces pointing at different refs — [Host a marketplace — Run release channels](https://code.claude.com/docs/en/plugins/host-marketplace)
- Distribution routes:

  | Route | Auto-update for users |
  | :--- | :--- |
  | No marketplace (folder or zip) | None |
  | Your own marketplace | Off by default |
  | Anthropic's directory | On once published; loads in Claude Code via account sync |

  Anthropic's directory is submitted at claude.ai/directory/manage and needs a paid plan. The official `claude-plugins-official` marketplace "doesn't take submissions through the directory portal" — you ask an Anthropic partner contact — [Publish and distribute a plugin](https://code.claude.com/docs/en/plugins/publish)
- The pre-release checklist: permanent kebab-case name; a versioning decision; `claude plugin validate --strict` (drop `--strict` if you omit `version`); install from a local marketplace; fill metadata and a README; run `claude plugin eval` — [Publish — Prepare your plugin for release](https://code.claude.com/docs/en/plugins/publish#prepare-your-plugin-for-release)
- `claude-plugins-official` (repo `anthropics/claude-plugins-official`) is added automatically on the first interactive session unless policy or `CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL` blocks it — [Anthropic's marketplaces](https://code.claude.com/docs/en/plugins/anthropic-marketplaces)
- Plugins were announced on October 9, 2025 — [Anthropic news: Customize Claude Code with plugins](https://www.anthropic.com/news/claude-code-plugins)

### Inferences
- For create-cmp, `version` in plugin.json is the whole update signal. A content change without a bump reaches nobody who installed from the marketplace. A bump that isn't mirrored consistently, for example a different string left in marketplace.json, gives a validate warning, and plugin.json silently wins.
- The "stale bytes under the right number" pattern in the maintainer's session memory is consistent with the documented design. The cache is keyed on the version string alone, and a session that loaded the old version keeps its old path (for up to 14 days on disk) until `/reload-plugins`. Monitors keep it until a restart.
- Using the npm package as a plugin *source* would give version `unknown` unless plugin.json sets it. It would also need `npm-shrinkwrap.json` for dependency install. npm *marketplace* sources are not implemented, so the marketplace itself must stay git, url or local.

### Gaps
- Not documented: whether re-installing a version string whose `cache/.../<version>/` directory already exists (for example, an orphaned directory inside its 14-day window) re-copies or reuses the existing bytes. UNVERIFIED; this is the likely mechanism behind "stale bytes under a bumped number" if a version string was reused.
- I did not read `anthropics/claude-plugins-official` or the claude.com directory review pages directly. Listing criteria are only as summarized on the publish page.

---

## 2. Extension surfaces a plugin can ship (skills, agents, hooks, commands, MCP, LSP, output styles, workflows, monitors, settings, channels, bin)

### Takeaway
A plugin can ship every surface, with these limits:
- Skills are the primary unit; commands were merged into skills.
- Plugin agents support most frontmatter but **ignore `permissionMode`, `hooks`, `mcpServers` and `initialPrompt`**.
- Hooks are registered for the whole session as soon as the plugin loads.
- MCP tools are named `mcp__plugin_<plugin>_<server>__<tool>`.
- The plugin `settings.json` can only set `agent` and `subagentStatusLine`.

### Cited Findings
**Skills**
- "Custom commands have been merged into skills." `.claude/commands/deploy.md` and `.claude/skills/deploy/SKILL.md` both create `/deploy`. Skills follow the Agent Skills open standard (agentskills.io) — [Skills](https://code.claude.com/docs/en/skills)
- SKILL.md frontmatter:
  - `name`
  - `description` (recommended; `description` + `when_to_use` are **capped at 1,536 characters** in the listing), `when_to_use`
  - `argument-hint`, `arguments`
  - `disable-model-invocation`, `user-invocable`
  - `allowed-tools` (the grant clears on the next user message), `disallowed-tools`
  - `model`, `effort` (low/medium/high/xhigh/max)
  - `context: fork`, `agent`, `background` (v2.1.218+)
  - `hooks`, `paths`, `shell`
  - `metadata`, `license`, `compatibility`
  - Source: [Skills — Frontmatter reference](https://code.claude.com/docs/en/skills#frontmatter-reference)
- Only `name`, `description`, `license`, `compatibility`, `metadata` and `allowed-tools` are portable to claude.ai uploads and the Skills API — [Skills — Using skill frontmatter outside Claude Code](https://code.claude.com/docs/en/skills#using-skill-frontmatter-outside-claude-code)
- Plugin skill command name is `/<plugin>:<dir>`, or `/<plugin>:<name>` when frontmatter sets `name`. A root-level `SKILL.md` loads as a single skill — [Plugin components — Skills](https://code.claude.com/docs/en/plugins/components#skills)
- Lifecycle:
  - The rendered SKILL.md enters the conversation once and stays; it isn't re-read.
  - After compaction, the first 5,000 tokens of each recently invoked skill are re-attached, within a combined 25,000-token budget.
  - The skill listing budget is 1% of the model's context window. When it overflows, descriptions are dropped starting with the least-used skills. Adjust with `skillListingBudgetFraction`, `SLASH_COMMAND_TOOL_CHAR_BUDGET`, or `skillOverrides` `"name-only"`.
  - Source: [Skills — Skill content lifecycle](https://code.claude.com/docs/en/skills#skill-content-lifecycle); [Skill descriptions are cut short](https://code.claude.com/docs/en/skills#skill-descriptions-are-cut-short)
- `context: fork` runs the skill in a fresh subagent that has no conversation history. It runs in the background by default since v2.1.218 — [Skills — Run skills in a subagent](https://code.claude.com/docs/en/skills#run-skills-in-a-subagent)

**Agents (subagents)**
- General frontmatter:
  - `name` and `description` (both required)
  - `tools`, `disallowedTools`
  - `model` (sonnet/opus/haiku/fable, a full ID, or inherit)
  - `permissionMode`, `maxTurns`, `skills` (preloads the full content), `mcpServers`, `hooks`, `memory` (user/project/local)
  - `background`, `omitClaudeMd` (v2.1.271+), `effort`, `isolation: worktree`, `color`, `initialPrompt`, `experimental.cacheTtl` (5m/1h, v2.1.248+)
  - Unknown fields are ignored silently. Field names are camelCase.
  - Source: [Subagents — Frontmatter reference](https://code.claude.com/docs/en/sub-agents#supported-frontmatter-fields)
- **Plugin agents** support `name`, `description`, `model`, `effort`, `maxTurns`, `tools`, `disallowedTools`, `skills`, `memory`, `background`, `omitClaudeMd`, `isolation`, `color` and `experimental.cacheTtl`. They **ignore** `permissionMode`, `hooks`, `mcpServers` and `initialPrompt`. Frontmatter that fails to parse still loads, named after the file — [Plugin components — Frontmatter fields in plugin agents](https://code.claude.com/docs/en/plugins/components#frontmatter-fields-in-plugin-agents)
- Subagent scope priority, highest first: managed; `--agents`; `.claude/agents/`; `~/.claude/agents/`; plugin `agents/` (**lowest**). Plugin agents are named `<plugin>:<subdir>:<name>` — [Subagents — Choose the subagent scope](https://code.claude.com/docs/en/sub-agents#choose-the-subagent-scope); [Plugin components — Agents](https://code.claude.com/docs/en/plugins/components#agents)

**Hooks**
- Plugin hooks live in `hooks/hooks.json` under a top-level `"hooks"` key, in the settings.json shape. They register when the plugin loads, not when one of its skills runs — [Plugin components — Hooks](https://code.claude.com/docs/en/plugins/components#hooks)
- Events:
  - Session: `SessionStart`, `Setup`, `SessionEnd`, `InstructionsLoaded`, `ConfigChange`, `CwdChanged`, `DirectoryAdded`, `FileChanged`
  - Prompt: `UserPromptSubmit`, `UserPromptExpansion`, `MessageDisplay`, `Notification`
  - Tool: `PreToolUse`, `PermissionRequest`, `PermissionDenied`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`
  - Agents and tasks: `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `TeammateIdle`
  - Turn: `Stop`, `StopFailure`
  - Worktrees: `WorktreeCreate`, `WorktreeRemove`
  - Compaction and model: `PreCompact`, `PostCompact`, `PreModelSwitch`, `PostModelSwitch`
  - MCP: `Elicitation`, `ElicitationResult`
  - Source: [Hooks reference — Hook lifecycle](https://code.claude.com/docs/en/hooks#hook-lifecycle)
- Handler types are `command`, `http`, `mcp_tool`, `prompt` and `agent` (agent is experimental).
  - Common fields: `type`, `if` (one permission-rule filter), `timeout`, `statusMessage`, `once` (skill frontmatter only).
  - Default timeouts: 600 s for command, http and mcp_tool; 30 s for prompt; 60 s for agent. The command default drops to 30 s on `UserPromptSubmit`/`PreModelSwitch`/`PostModelSwitch`.
  - Command hooks also take `command`, `args` (exec form, no shell), `async`, `asyncRewake` and `shell`.
  - All matching hooks run in parallel.
  - Source: [Hooks reference — Hook handler fields](https://code.claude.com/docs/en/hooks#hook-handler-fields)
- Exit codes:
  - **Exit 2 blocks** on events that can block. stderr, or the JSON reason, becomes the message.
  - **Exit 1 is non-blocking** ("Without valid JSON on stdout, Claude Code treats exit code 1 as a non-blocking error and proceeds").
  - stdout on exit 0 becomes context only for `UserPromptSubmit`, `UserPromptExpansion`, `SessionStart` and `PostModelSwitch`.
  - Source: [Hooks reference — Exit code output](https://code.claude.com/docs/en/hooks#exit-code-output)
- A timed-out command, http or mcp_tool `PreToolUse` hook **does not block**; the call continues through normal permissions — [Hooks reference — Timeouts](https://code.claude.com/docs/en/hooks#timeouts)
- JSON output:
  - Universal fields: `continue`, `stopReason`, `suppressOutput` ("has no effect"), `systemMessage`, `terminalSequence`.
  - Decision fields: top-level `decision:"block"` + `reason` for UserPromptSubmit, PostToolUse, Stop, SubagentStop, PreCompact and others. `hookSpecificOutput.permissionDecision` (allow/deny/ask/defer) for PreToolUse.
  - `additionalContext` is wrapped in a system reminder.
  - `additionalContext`, `systemMessage` and plain stdout are each capped at 10,000 characters, with overflow written to a file plus a 2,000-character preview.
  - Source: [Hooks reference — JSON output](https://code.claude.com/docs/en/hooks#json-output); [Decision control](https://code.claude.com/docs/en/hooks#decision-control)
- Async hooks (`async: true`, command hooks only) can't block. Their output is delivered on the next turn. In `-p` mode they are killed at teardown as `cancelled`. `asyncRewake` wakes Claude on exit 2 — [Hooks reference — Run hooks in the background](https://code.claude.com/docs/en/hooks#run-hooks-in-the-background)
- Plugin hook processes receive `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA` and `CLAUDE_PLUGIN_OPTION_<KEY>`. Quote `"${CLAUDE_PLUGIN_ROOT}"` in shell form, or use `args`. A matcher for the plugin's own MCP tool must use the full `mcp__plugin_<plugin>_<server>__<tool>` name — [Plugin components — Environment, quoting, and matching MCP tools](https://code.claude.com/docs/en/plugins/components#environment-quoting-and-matching-mcp-tools)
- Settings, managed and plugin hooks also fire inside subagents, carrying `agent_id` and `agent_type`. `allowManagedHooksOnly` blocks plugin hooks except those of managed force-enabled plugins — [Hooks reference — Hook locations](https://code.claude.com/docs/en/hooks#hook-locations)

**MCP, LSP, output styles, workflows, monitors, bin, settings, channels**
- MCP servers:
  - Declared in `.mcp.json` at the plugin root (the `mcpServers` wrapper is optional) or in the manifest `mcpServers` key (inline, a JSON path, or a `.mcpb`/`.dxt` bundle).
  - The server is named `plugin:<plugin>:<server>` and its tools `mcp__plugin_<plugin>_<server>__<tool>`.
  - `${CLAUDE_PLUGIN_ROOT}` is substituted in `command`, `args` and `env`.
  - Local stdio servers don't run on claude.ai; use an https remote for that.
  - Source: [Plugin components — MCP servers](https://code.claude.com/docs/en/plugins/components#mcp-servers)
- LSP servers go in `.lsp.json` (strict fields). The binary is not installed by the plugin. `claude plugin validate` doesn't read this file — [Plugin components — LSP servers](https://code.claude.com/docs/en/plugins/components#lsp-servers)
- Output styles live in `output-styles/`. Frontmatter: `name`, `description`, `keep-coding-instructions`, and `force-for-plugin` (plugin-only; auto-applies the style and overrides the user's `outputStyle`) — [Output styles — Frontmatter reference](https://code.claude.com/docs/en/output-styles#frontmatter)
- Workflows are `.js` files in `workflows/`, namespaced `/<plugin>:<meta.name>` — [Workflows — Distribute a workflow in a plugin](https://code.claude.com/docs/en/workflows#distribute-a-workflow-in-a-plugin)
- Monitors are declared under `experimental.monitors` (a top-level key still works with a warning).
  - Fields: `name`, `command`, `description`, `when: always | on-skill-invoke:<skill>`.
  - They run only in interactive sessions and never on Bedrock, Vertex or Foundry.
  - Source: [Manifest reference — monitors](https://code.claude.com/docs/en/plugins/manifest-reference#monitors)
- `bin/` is appended to the Bash PATH **after** the user's PATH, so it can't shadow system commands — [Plugin components — Executables](https://code.claude.com/docs/en/plugins/components#executables)
- Default settings (`settings.json`, or the `settings` key): only `agent` (runs a plugin agent as the main thread) and `subagentStatusLine`. Plugin defaults are the lowest layer — [Plugin components — Default settings](https://code.claude.com/docs/en/plugins/components#default-settings)
- `channels` bind a message channel to one of the plugin's MCP servers, with its own `userConfig` — [Manifest reference — Channels](https://code.claude.com/docs/en/plugins/manifest-reference#channels)
- Dependencies are declared as `"name"`, `"name@marketplace"` or `{name, marketplace, version}`, where version is a semver range resolved against `<plugin>--v<version>` git tags — [Plugin dependencies](https://code.claude.com/docs/en/plugins/dependencies)

### Inferences
- A create-cmp agent that needs its own MCP server, hooks or permission mode can't get them from agent frontmatter inside the plugin. Those must be plugin-level hooks and `.mcp.json`, or a prompt-level instruction. The plugin's `executor` agent relies only on `model`, `effort`, `maxTurns` and `tools`, all of which are supported.
- A proof-gate PreToolUse hook that must *enforce* has to exit 2 or emit `permissionDecision:"deny"`. Exit 1, a crash (127) or a timeout all let the call through.

### Gaps
- I did not verify the platform-support table on claude.com (which components load on claude.ai and Cowork) beyond the `bin/` and stdio statements.

---

## 3. Settings precedence, permissions, auto mode and its classifier, --permission-mode, sandboxing

### Takeaway
Settings precedence, highest first: managed > command line (`--settings`/flags) > local > project > user. List keys such as `permissions.allow` merge across files, and deny beats allow at every scope. Auto mode runs matching allow/ask/deny rules first, then a classifier. Entering auto mode **drops broad code-execution allow rules**. `autoMode` config is read only from user settings, managed settings and `--settings`, **never from project files**. The classifier blocks, by default, force pushes, merging PRs no human approved, and secret or sensitive outbound content.

### Cited Findings
- Settings precedence, highest first:
  1. Managed (file, MDM, or server-managed)
  2. Command line (`--settings` merges key by key)
  3. `.claude/settings.local.json`
  4. `.claude/settings.json`
  5. `~/.claude/settings.json`

  Environment variables are not a level. Lists merge — [Settings — Settings precedence](https://code.claude.com/docs/en/settings#settings-precedence)
- Some keys honor a *stricter* value from a lower scope over managed settings: `syncClaudeAiPlugins:false`, `syncClaudeAiSkills:false`, `maxEffortLevel`, `enableArtifact:false`, and others — [Settings — Exceptions](https://code.claude.com/docs/en/settings#exceptions-to-managed-settings-precedence)
- Rule syntax is `Tool` or `Tool(specifier)`:
  - `Bash(npm run build)`, `Read(./.env)`, `WebFetch(domain:example.com)`
  - MCP: `mcp__server`, `mcp__server__*`, `mcp__server__tool`
  - Subagents: `Agent(Name)`
  - "If a tool is denied at any level, no other level can allow it"; a managed deny can't be overridden by `--allowedTools`.
  - Source: [Permissions — Permission rule syntax](https://code.claude.com/docs/en/permissions#permission-rule-syntax); [Permissions — Settings precedence](https://code.claude.com/docs/en/permissions#settings-precedence)
- Project `permissions.allow` and `additionalDirectories` apply only after the workspace trust dialog. `-p`/SDK sessions never show the dialog and count as trusted for hooks. Project-subagent frontmatter hooks, project `@skills-dir` plugins and repo `extraKnownMarketplaces` are *not used* without explicit trust — [Permissions — Project allow rules and workspace trust](https://code.claude.com/docs/en/permissions#project-allow-rules-and-workspace-trust); [What runs before you trust a folder](https://code.claude.com/docs/en/permissions#what-runs-before-you-trust-a-folder)
- Modes:

  | Mode | What runs without asking |
  | :--- | :--- |
  | `default` (Manual) | Reads |
  | `acceptEdits` | Reads, edits, common filesystem commands |
  | `plan` | Reads |
  | `auto` | Most actions, after classifier review |
  | `dontAsk` | Only pre-approved actions; the rest are denied |
  | `bypassPermissions` | Everything (containers only) |

  Since v2.1.283, auto is the built-in starting mode for interactive terminal and VS Code sessions on every plan. For `-p` the starting mode is Manual — [Permission modes](https://code.claude.com/docs/en/permission-modes); [Headless — Auto-approve tools](https://code.claude.com/docs/en/headless#auto-approve-tools)
- Classifier decision order:
  1. Allow, ask and deny rules resolve first. Exceptions: protected-path writes, critical-path `rm`, `requiresUserInteraction` MCP tools, and content-scoped ask rules.
  2. Reads and working-directory edits are auto-approved.
  3. Everything else goes to the classifier.
  4. If blocked, Claude gets the reason and tries an alternative.
- On entering auto mode, these allow rules are **dropped**: `Bash(*)`, wildcarded interpreters, package-manager run commands, `Agent` allow rules, and Monitor allow rules. Narrow rules such as `Bash(npm test)` stay.
- The classifier sees user messages, tool calls and CLAUDE.md. Tool results are stripped.
- Source for the three points above: [Permission modes — How the classifier evaluates actions](https://code.claude.com/docs/en/permission-modes#eliminate-prompts-with-auto-mode)
- Blocked by default (partial list):
  - `curl | bash`; production deploys; force push; `git reset --hard`
  - "Merging a pull request no human has approved, approving Claude's own pull request, or disabling CI checks" (v2.1.195+)
  - Sensitive details in outbound PR, issue or commit text when the repo is public or outside the trust boundary (v2.1.198+)
  - Sensitive-file content entering "a package publish" unless the user named source and destination (v2.1.203+)
  - Opening PRs against another org's repo unless named
  - Launching agent loops with `--dangerously-skip-permissions`
- Allowed by default: pushing to any branch of the working repo (except deploy-named branches); installing locked dependencies.
- After 3 consecutive or 20 total blocks, auto mode pauses to prompting. In `-p` without a prompt tool, the action simply doesn't run.
- Source for the three points above: [Permission modes — What the classifier blocks by default](https://code.claude.com/docs/en/permission-modes#what-the-classifier-blocks-by-default); [When auto mode falls back](https://code.claude.com/docs/en/permission-modes#when-auto-mode-falls-back)
- Approval stated in conversation clears a block only if it "name[s] the action and the specific thing that makes it dangerous". It covers one action; for routine patterns use `autoMode.allow` — [Permission modes — Approvals you state in conversation](https://code.claude.com/docs/en/permission-modes#approvals-you-state-in-conversation)
- `autoMode` is read from `~/.claude/settings.json`, managed settings, or `--settings`/SDK. "The classifier doesn't read `autoMode` from project settings in `.claude/settings.json` or `.claude/settings.local.json`." `claude auto-mode defaults` prints the rules — [Configure auto mode](https://code.claude.com/docs/en/auto-mode-config)
- In auto mode, subagent frontmatter `permissionMode` is ignored. The classifier checks the delegated task at spawn, every action, and the final report — [Permission modes — How auto mode handles subagents](https://code.claude.com/docs/en/permission-modes#eliminate-prompts-with-auto-mode)
- The sandbox uses Seatbelt on macOS and bubblewrap on Linux/WSL2, covering Bash, PowerShell and Monitor commands and their children.
  - Auto-allow mode auto-approves sandboxable commands, but deny rules and content-scoped ask rules still apply.
  - `sandbox.filesystem.allowWrite` arrays merge across scopes.
  - `allowUnsandboxedCommands:false` removes the unsandboxed-retry escape hatch.
  - Source: [Sandboxing](https://code.claude.com/docs/en/sandboxing)

### Inferences
- The memory note "classifier blocks release acts" matches documented default blocks. "Merge a PR no human approved" is blocked by default, and a publish can trip the sensitive-content rule. A chat approval must name the specific act, such as "merge PR #N with rebase", and it covers only one act. Standing permission belongs in `autoMode.allow` in `~/.claude/settings.json`. Putting it in project `.claude/settings.json` has no effect on the classifier.

### Gaps
- I did not read the full `autoMode` rule-override precedence (which blocks an `allow` can't clear) on the auto-mode-config page.

---

## 4. Subagent semantics, background agents, worktree isolation, SendMessage, agent teams

### Takeaway
A non-fork subagent starts with a fresh context containing its own system prompt (not Claude Code's), the delegation message, all CLAUDE.md levels (unless `omitClaudeMd`), git status and any preloaded skills. It does **not** get conversation history, output style or auto memory. Its result comes back as a summary. Continuation uses `SendMessage` to its ID or name, which works without agent teams. Agent teams are still experimental.

### Cited Findings
- Initial context:
  - Included: the system prompt plus environment details, the task message, CLAUDE.md levels (skipped by Explore and Plan), a git status snapshot, preloaded skills, and a sibling roster (v2.1.206+).
  - Never included: output style, auto memory, the parent's context-window size.
  - Source: [Subagents — What loads at startup](https://code.claude.com/docs/en/sub-agents#what-loads-at-startup)
- Model resolution order:
  1. The per-invocation `model` parameter
  2. Frontmatter `model`
  3. `CLAUDE_CODE_SUBAGENT_MODEL` (this took precedence before v2.1.251)
  4. The main model

  A family alias equal to the main model's family resolves to the main model exactly, including `[1m]`. Subagents inherit the extended-thinking setting since v2.1.198 — [Subagents — Choose a model](https://code.claude.com/docs/en/sub-agents#choose-a-model)
- `permissionMode` is ignored when the parent is in bypass, acceptEdits or auto. A subagent can't escalate to bypass (v2.1.267+) — [Subagents — Permission modes](https://code.claude.com/docs/en/sub-agents#permission-modes)
- Foreground vs background:
  - Fork mode is on by default in interactive sessions, and there all subagents run in the background.
  - In `-p` and the SDK, fork mode is off.
  - Background subagents surface permission prompts in the main session and have a smaller tool set.
  - Results arrive as a completion notification.
  - Source: [Subagents — Run subagents in foreground or background](https://code.claude.com/docs/en/sub-agents#run-subagents-in-foreground-or-background)
- Nesting defaults to 3 layers (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`). The concurrent limit is 20 (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`). In `-p` and the SDK, a launching subagent doesn't wait for nested background subagents — [Subagents — Let subagents spawn their own subagents](https://code.claude.com/docs/en/sub-agents#let-subagents-spawn-their-own-subagents); [Concurrent subagent limit](https://code.claude.com/docs/en/sub-agents#concurrent-subagent-limit)
- `isolation: worktree` branches from the default branch, not the parent's HEAD, and is cleaned up automatically if nothing changed. Commands that resolve into the main checkout fail (v2.1.203+) — [Subagents — Write subagent files](https://code.claude.com/docs/en/sub-agents#write-subagent-files)
- Resume:
  - `SendMessage` to an agent ID or name resumes a completed subagent in the background with its full history. Explore and Plan are one-shot.
  - A `maxTurns` stop returns output marked partial and can be resumed.
  - Messages from the launching agent count as task direction but never as user approval (v2.1.198).
  - Transcripts are stored at `~/.claude/projects/{project}/{sessionId}/subagents/agent-{id}.jsonl`.
  - Source: [Subagents — Resume subagents](https://code.claude.com/docs/en/sub-agents#resume-subagents)
- Forks inherit the full conversation, system prompt, tools, model and prompt cache. A fork can't spawn further forks — [Subagents — How forks differ](https://code.claude.com/docs/en/sub-agents#how-forks-differ-from-other-subagents)
- "Agent teams are experimental and disabled by default. Enable them by setting `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`" — [Agent teams](https://code.claude.com/docs/en/agent-teams). The research preview was added in v2.1.32 (2026-02-05) — [CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)

### Inferences
- The maintainer's "orchestrator subagents stall on review" session note fits two documented facts. In `-p`/SDK a launching subagent doesn't wait for nested background subagents. And Claude must wait for the completion notification before it can report results.

### Gaps
- I did not verify cross-session messaging semantics in depth.

---

## 5. `claude plugin eval`, `/skill-doctor`, `claude plugin validate`

### Takeaway
`claude plugin eval` (v2.1.269+, 2026-09-11) runs cases from `evals/<case>/prompt.md` plus `graders/*.md`. Each case runs 3 times in an isolated `claude -p` sandbox, both **with and without the plugin**, and the output is a score and Δ, `aggregate-result.json` (schemaVersion 1) and a self-contained `report.html`. `/skill-doctor` reports the context cost and usage of loaded skills. `claude plugin validate --strict --json` is the CI gate for manifests.

### Cited Findings
- Requirements: v2.1.269+, git ≥ 2.31 (enforced from v2.1.283), and a plugin with a manifest. Every run and judge call is billed — [Plugin evals — Requirements](https://code.claude.com/docs/en/plugin-evals#requirements)
- Case layout:
  - `evals/<case>/prompt.md`. Frontmatter: `schema_version` ("1.1"), `name`, `description`, `tags`, `plugins`, `runs` (default 3, max 50), `expected_outcome`, `model`, `max_turns` (default 10, max 200), `timeout_seconds` (default 300, max 3600), `allowed_tools`, `append_system_prompt`, `env` (`EVAL_*` keys only). Unknown keys are errors.
  - `case.yaml` optionally adds `context.scaffold_script`, `context.history_file`, `context.add_dirs`, `execution.prompt` and inline `graders`.
  - Source: [Plugin evals — Eval suite reference](https://code.claude.com/docs/en/plugin-evals#eval-suite-reference)
- Grader types:

  | Type | Cost | Options |
  | :--- | :--- | :--- |
  | `regex` | free | `pattern`, `flags`, `match` (contains/not_contains/count:N), `target` |
  | `tool_used` | free | `tool`, `input_match`, `min`, `max` |
  | `tool_order` | free | `before`, `after` |
  | `file_exists` | free | `path`, `exists` |
  | `llm` | judge call | criteria; 2 of 3 votes |
  | `baseline` | judge call | vs a reference `.jsonl` |

  - Common keys: `weight`, `arm` (with-only/both).
  - Targets: `last_message`, `trace`, `files`, `{source:file,path}`, `mock_calls`.
  - There are no custom-code graders. `tool_used: Skill` graders are excluded from the score in two-arm runs.
  - Source: [Plugin evals — Grader types](https://code.claude.com/docs/en/plugin-evals#grader-types); [No-plugin baseline](https://code.claude.com/docs/en/plugin-evals#compare-against-a-no-plugin-baseline)
- Isolation:
  - Each run gets a temporary home, working directory and config, and runs as `claude -p` with only the plugin loaded.
  - No user settings, CLAUDE.md, other plugins or memory are loaded. Managed policy still applies. The Artifact tool is off. Case files are hidden from the agent.
  - Only read-only tools are available unless granted with `--allow-tools`. Granting Bash runs it under the OS sandbox. Real MCP servers need `--allow-real-servers` or `--mocks off`; otherwise mocks live in `evals/mocks/<server>/<tool>.md`.
  - Plugin hooks and real servers run *outside* the agent sandbox, so their scores are advisory.
  - Source: [Plugin evals — What a run can access](https://code.claude.com/docs/en/plugin-evals#security)
- CI recipe: `claude plugin eval . --trust-plugin --json results.json --threshold 0.8 --model <pinned> --judge-model <pinned> --no-publish --max-cost-usd 20`.
  - Exit codes: 0 pass, 1 failing/load error/untrusted, 2 partial (cost ceiling or auth), 130, 143.
  - Δ never affects the exit code.
  - In CI, `init` requires `--bare`.
  - Add `results/` to `.gitignore`.
  - Source: [Plugin evals — Run evals in CI](https://code.claude.com/docs/en/plugin-evals#run-evals-in-ci)
- JSON result fields: `schemaVersion: 1`, `partial`/`partialReason`, `aggregates.overallScore|casesPassed|casesTotal|meanDelta`, `cases[].aggregates.score|delta`, `cases[].arms.with[].error|aborted|skippedPaidGraders`, `costUsd`, `durationSeconds`, `claudeVersion`. The HTML report is published as a private artifact unless `--no-publish` — [Plugin evals — JSON result](https://code.claude.com/docs/en/plugin-evals#json-result)
- The eval directory can be moved with `experimental.evals` in plugin.json or `--eval-dir` — [Plugin evals — Use a different eval directory](https://code.claude.com/docs/en/plugin-evals#use-a-different-eval-directory)
- The skill-creator plugin's `evals/evals.json` format is separate. "Neither tool reads the other's case files" — [Plugin evals](https://code.claude.com/docs/en/plugin-evals)
- `/skill-doctor`:
  - Reports each skill's context cost and usage and flags never-invoked skills, including plugin skills.
  - Opens in the `/plugin` **Stats** tab; prints text under `-p`.
  - Unavailable over Remote Control and in sessions without feature-flag fetching.
  - The docs say it "requires Claude Code v2.1.252 or later" — [Skills — Find unused skills](https://code.claude.com/docs/en/skills#find-unused-skills). This conflicts with the CHANGELOG, which lists "Added `/skill-doctor`" under **2.1.261** (2026-09-04) — [CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
- `claude plugin validate <path>`:
  - Accepts a plugin dir, a marketplace root or file, or a skills/agents/commands dir.
  - `--strict` turns warnings into failures (v2.1.145+). `--json` gives `{success, strict, target, manifest, contents[]}` (v2.1.259+).
  - Exit codes: 0 pass, 1 fail, 2 validator error.
  - It doesn't catch entry `hooks` written as a file path, or source-fetch errors.
  - Source: [Plugin commands — plugin validate](https://code.claude.com/docs/en/plugins/cli-reference#plugin-validate); [Marketplace reference — Failures that validation doesn't catch](https://code.claude.com/docs/en/plugins/marketplace-reference#failures-that-validation-doesnt-catch)

### Inferences
- For create-cmp's 11 skills, `claude plugin eval` with `tool_used: Skill` graders measures whether each skill triggers, and Δ measures whether it helps. Keep judge-free graders for the every-PR run and pin both models.

### Gaps
- I did not run `claude plugin eval --help` locally, so options listed only as "see --help" (`--case`, `--tag`, `--output-dir`, `--report`, `--keep-temp`, `--verbose`) are not described beyond their names.

---

## 6. Headless / programmatic use, Agent SDK, GitHub Action, cloud sessions and routines

### Takeaway
- **`claude -p`** loads installed plugins, hooks and project settings exactly like an interactive session, but runs untrusted project hooks without a trust dialog. `--bare` skips all of that and loads plugins only via `--plugin-dir`/`--plugin-url`.
- **Agent SDK** loads plugins only as local paths (`type:"local"`).
- **GitHub Action** installs plugins with `plugin_marketplaces` + `plugins` inputs.
- **Cloud sessions and routines** don't install plugins that a repo enables or that sit in user settings. They use committed `.claude/skills|agents|commands` and claude.ai-enabled skills.

### Cited Findings
- `-p` flags:
  - `--output-format text|json|stream-json`; `--json-schema`. `json` includes `total_cost_usd`.
  - `--allowedTools`, `--permission-mode`, `--permission-prompts none` (v2.1.259+)
  - `--append-system-prompt[-file]`, `--system-prompt`
  - `--bare`, which skips hooks, skills, commands, subagents, installed plugins, MCP, auto memory and CLAUDE.md. It requires `ANTHROPIC_API_KEY` or `apiKeyHelper`, and "will become the default for `-p` in a future release".
  - Source: [Headless](https://code.claude.com/docs/en/headless); [Start faster with bare mode](https://code.claude.com/docs/en/headless#start-faster-with-bare-mode)
- The stream-json `system/init` event carries `plugins` (name, path) and `plugin_errors` (plugin, type, message, and `path` since v2.1.283), which lets CI fail when a plugin didn't load. `CLAUDE_CODE_SYNC_PLUGIN_INSTALL` emits `system/plugin_install` events — [Headless — Fail CI when a plugin or MCP server doesn't load](https://code.claude.com/docs/en/headless#fail-ci-when-a-plugin-or-mcp-server-doesnt-load)
- Without `--bare`, a `-p` session runs project `.claude/settings.json` hooks and `.mcp.json` servers in untrusted folders. Mitigations: `--setting-sources user`, `--bare`, `--settings '{"disableAllHooks": true}'` — [Permissions — What runs before you trust a folder](https://code.claude.com/docs/en/permissions#what-runs-before-you-trust-a-folder)
- Agent SDK: `plugins: [{type:"local", path}]` is the only type accepted. "To use a plugin distributed through a marketplace … download it first" — [Agent SDK — Plugins](https://code.claude.com/docs/en/agent-sdk/plugins)
- GitHub Action (`anthropics/claude-code-action`):
  - Inputs include `prompt`, `claude_args`, `plugin_marketplaces` (newline-separated git URLs), `plugins` (`name@marketplace`) and `settings`.
  - A plugin skill runs via `prompt: /plugin-name:skill-name`.
  - Tools the skill needs must still go in `claude_args: --allowedTools …`; the action only starts the MCP server named there.
  - Source: [GitHub Actions — Run a skill](https://code.claude.com/docs/en/github-actions#run-a-skill)
- Cloud sessions:
  - "Plugins and marketplaces declared in your repo's `.claude/settings.json`" — **No**. "Plugins enabled only in your user settings" — **No**.
  - Committed `.claude/skills/`, `.claude/agents/`, `.claude/commands/`, `.mcp.json` (single-repo) and CLAUDE.md — Yes. Claude.ai-enabled skills load.
  - `/plugin` is unavailable in cloud sessions.
  - Source: [Cloud environments — What carries over](https://code.claude.com/docs/en/cloud-environments); [Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web)
- Two partial conflicts on cloud sessions:
  - [Settings — Settings in cloud sessions](https://code.claude.com/docs/en/settings#settings-in-cloud-sessions) says a multi-repo session "reads only the `enabledPlugins` and `extraKnownMarketplaces` keys from each repository's `.claude/settings.json`".
  - [Plugin loading](https://code.claude.com/docs/en/plugins/loading#plugins-shared-through-a-repository) says "A cloud session doesn't add the marketplaces a repository lists under `extraKnownMarketplaces`" because it requires the trust dialog.
  - Net: repo-declared marketplace plugins should be treated as not available in cloud.
- Routines "run autonomously as full Claude Code cloud sessions … uses skills committed to the cloned repository, and calls any connectors you include". There is no permission-mode picker — [Routines](https://code.claude.com/docs/en/routines)
- Synced plugins (enabled on claude.ai) load in Cowork and in terminal sessions signed in with claude.ai (v2.1.273+) — [Plugin loading — Plugins synced from claude.ai](https://code.claude.com/docs/en/plugins/loading#synced-plugins)

### Inferences
- The only documented way to get create-cmp's plugin (not just its skills) into cloud sessions and routines is the claude.ai/directory route (synced plugins). Whether synced plugins load inside *cloud* Claude Code sessions (as opposed to terminal and Cowork) is not stated — UNVERIFIED.

### Gaps
- I did not read the `anthropics/claude-code-action` README directly; the details above are from the docs page.

---

## 7. What changed in the plugin system, Jan–Sept 2026

### Takeaway
Across 2026 the system went from a basic install model to a full packaging platform. Key releases:
- Reload without restart (2.1.69, Mar)
- userConfig and keychain storage (2.1.83, Mar)
- `bin/` executables (2.1.91, Apr)
- Monitors (2.1.105, Apr)
- Dependencies, tag and prune (2.1.117–2.1.143, Apr–May)
- skills-dir plugins and `plugin init` (2.1.157, May)
- Security hardening of `${user_config}` and project pluginConfigs (2.1.207, Jul)
- archive and command sources (2.1.224/2.1.229, Aug)
- claude.ai sync (2.1.273–2.1.275, Sep)
- `plugin eval` (2.1.269, Sep)

Dates below are npm publish dates.

### Cited Findings
All entries below are from the [CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md), with dates from the [npm registry](https://registry.npmjs.org/@anthropic-ai/claude-code).

**January–February**
- 2.1.0 (2026-01-07): prompt and agent hook types supported from plugins; `context: fork` for skills.
- 2.1.2 (2026-01-08): `FORCE_AUTOUPDATE_PLUGINS`.
- 2.1.14 (2026-01-20): pinning plugins to git commit SHAs.
- 2.1.32 (2026-02-05): agent teams research preview.
- 2.1.33 (2026-02-06): `TeammateIdle` and `TaskCompleted` hook events.
- 2.1.45 (2026-02-17): `enabledPlugins` and `extraKnownMarketplaces` read from `--add-dir`.
- 2.1.49 (2026-02-19): plugins can ship `settings.json`.
- 2.1.51 (2026-02-23): custom npm registries and version pinning for npm sources.

**March**
- 2.1.69 (2026-03-04): `/reload-plugins`; `git-subdir` source; `pathPattern`; `pluginTrustMessage`.
- 2.1.74 (2026-03-11): **`--plugin-dir` now overrides an installed marketplace plugin with the same name**.
- 2.1.78 (2026-03-17): `${CLAUDE_PLUGIN_DATA}`; `effort`, `maxTurns` and `disallowedTools` for plugin agents.
- 2.1.80 (2026-03-19): `source: 'settings'` inline marketplace.
- 2.1.81 (2026-03-20): `--bare`.
- 2.1.83 (2026-03-24): `userConfig` with keychain storage; plugin MCP servers that duplicate an org connector are suppressed.
- 2.1.85 (2026-03-26): plugins blocked by policy can't be installed.

**April**
- 2.1.91 (2026-04-02): `bin/` executables; `disableSkillShellExecution`.
- 2.1.94 (2026-04-07): output-style `keep-coding-instructions`; `"skills": ["./"]` uses the frontmatter name.
- 2.1.105 (2026-04-13): monitors.
- 2.1.117 (2026-04-21): dependency auto-resolve.
- 2.1.118 (2026-04-22): `claude plugin tag`.
- 2.1.119 (2026-04-23): version-constrained dependencies auto-update to the highest satisfying tag.
- 2.1.121 (2026-04-27): `claude plugin prune`.
- 2.1.129 (2026-05-05): `--plugin-url`; `themes` and `monitors` move under `experimental`.

**May**
- 2.1.139 (2026-05-11): `claude plugin details`; hook `args` exec form.
- 2.1.140 (2026-05-12): warning when a default folder is ignored because the manifest sets the key.
- 2.1.142 (2026-05-14): root `SKILL.md` plugins.
- 2.1.143 (2026-05-15): dependency enforcement on enable/disable.
- 2.1.154 (2026-05-28): `defaultEnabled:false`.
- 2.1.157 (2026-05-29): plugins in `.claude/skills` auto-load; `claude plugin init`.

**June–July**
- 2.1.163 (2026-06-04): `/plugin list`.
- 2.1.169 (2026-06-08): `--safe-mode`.
- 2.1.207 (2026-07-10), **breaking**:
  - `${user_config.*}` in shell-form hook, monitor and headersHelper commands is rejected (shell-injection fix).
  - `pluginConfigs` are no longer read from project `.claude/settings.json`.
- 2.1.218 (2026-07-22): agent names containing `:` rejected; yes/no/on/off booleans accepted.
- 2.1.221 (2026-08-03): `"."` accepted as a skills path; `/plugin` installs activate immediately when safe.

**August**
- 2.1.223 (2026-08-05): `owner/*` in policy lists.
- 2.1.224 (2026-08-07): `archive` source.
- 2.1.229 (2026-08-12): `command` source.
- 2.1.232 (2026-08-13): GitLab marketplaces.
- 2.1.238 (2026-08-20): `headersHelper`.

**September**
- 2.1.259 (2026-09-02): `validate --json`.
- 2.1.260 (2026-09-03): `/reload-plugins` in headless sessions.
- 2.1.261 (2026-09-04): `/skill-doctor`.
- 2.1.265 (2026-09-08): `--plugin-dir` accepts a folder of plugins; marketplace-entry display metadata preferred.
- 2.1.268 (2026-09-10): `--json` on install, uninstall, update, enable and disable.
- 2.1.269 (2026-09-11): `claude plugin eval`.
- 2.1.271 (2026-09-14): `omitClaudeMd`; `--accept-command`.
- 2.1.274 (2026-09-16): Git LFS files left as pointers in plugin clones; `"type":"sdk"` MCP entries skipped.
- 2.1.275 (2026-09-17): claude.ai skills and plugins sync to the terminal; `/plugin install --marketplace`; npm sources fetched via `npm pack --ignore-scripts`.
- 2.1.280 (2026-09-22): marketplace names that imitate reserved names are refused.
- 2.1.281 (2026-09-23): `validate` checks `.mcp.json`.
- 2.1.282 (2026-09-24): `anthropic-skills` / `claude-ai` namespaces reserved.
- 2.1.283 (2026-09-25): eval requires git ≥ 2.31; `plugin_errors.path`; auto mode becomes the default starting mode for all plans.

### Inferences
- The changes that break existing plugins are:
  - 2.1.207 (`${user_config}` in shell hooks; project-level pluginConfigs ignored)
  - 2.1.74 (`--plugin-dir` shadowing)
  - 2.1.218 (`:` in agent names)
  - 2.1.274 (LFS pointers)
  - 2.1.280/2.1.282 (reserved names)

### Gaps
- The changelog has no dates. The dates here are npm publish times, which can lag the changelog commit.
- I filtered only "Added/Changed" lines mentioning plugin or marketplace, plus a targeted pass for skills, hooks, agents and workflows. Bug-fix lines were not surveyed.

---

## Implications for a Claude Code plugin repo (create-cmp)

**Do**
1. Bump `version` in `.claude-plugin/plugin.json` on every release that changes bytes, and keep it out of the marketplace.json entry (or keep the two identical). The manifest version wins silently, it is the cache key, and it is the update signal. — [Plugin loading — Versions and updates](https://code.claude.com/docs/en/plugins/loading#versions-and-updates); [Host a marketplace — Release a new version](https://code.claude.com/docs/en/plugins/host-marketplace)
2. Tag releases with `claude plugin tag --push`, which produces `create-cmp--v<version>` and checks that manifest and entry agree. Dependents resolve ranges against these tags. — [Plugin commands — plugin tag](https://code.claude.com/docs/en/plugins/cli-reference#plugin-tag); [Plugin dependencies](https://code.claude.com/docs/en/plugins/dependencies)
3. Gate CI with `claude plugin validate --strict --json .`. Also check `plugin_errors` in `claude -p --output-format stream-json` `system/init`, because validate misses fetch-time and entry-hook failures. — [Plugin validate](https://code.claude.com/docs/en/plugins/cli-reference#plugin-validate); [Headless — Fail CI when a plugin doesn't load](https://code.claude.com/docs/en/headless#fail-ci-when-a-plugin-or-mcp-server-doesnt-load)
4. After a release, verify by content. Run `claude plugin marketplace update <mkt>`, then `claude plugin update create-cmp@<mkt>`, then `/reload-plugins`, and check `installed_plugins.json` version and `installPath`. A running session keeps old bytes until reload, and monitors keep them until a restart. — [Plugin loading — Check which stage](https://code.claude.com/docs/en/plugins/loading#check-which-stage-a-plugin-reached); [When auto-update runs](https://code.claude.com/docs/en/plugins/loading#when-auto-update-runs)
5. Reference bundled files as `"${CLAUDE_PLUGIN_ROOT}"/…` (quoted), or use exec-form `args`. Put the MCP server's `node_modules` and any state in `${CLAUDE_PLUGIN_DATA}`, or ship `package.json` plus `package-lock.json` at the plugin root so the automatic `npm ci --ignore-scripts` runs. — [Manifest reference — Environment variables](https://code.claude.com/docs/en/plugins/manifest-reference#environment-variables); [Plugin loading — Node.js package dependencies](https://code.claude.com/docs/en/plugins/loading#node-js-package-dependencies)
6. Make enforcing hooks (for example the proof gate) exit 2 or emit `permissionDecision:"deny"`. Exit 1, a missing script (127) and a timeout all fail open. — [Hooks reference — Exit code output](https://code.claude.com/docs/en/hooks#exit-code-output); [Timeouts](https://code.claude.com/docs/en/hooks#timeouts)
7. Keep SessionStart output factual and under 10,000 characters. It becomes model context, and imperative "system" phrasing can trigger prompt-injection defenses. — [Hooks reference — Add context for Claude](https://code.claude.com/docs/en/hooks#json-output)
8. Write skill descriptions with the trigger first, and keep `description` + `when_to_use` well under 1,536 characters. Watch `/skill-doctor` for never-invoked skills among the 11. — [Skills — Skill descriptions are cut short](https://code.claude.com/docs/en/skills#skill-descriptions-are-cut-short); [Find unused skills](https://code.claude.com/docs/en/skills#find-unused-skills)
9. Add an `evals/` suite. Pair a free `tool_used: Skill` grader (does it trigger) with a result grader. In CI run `--trust-plugin --no-publish --max-cost-usd`, pin `--model` and `--judge-model`, and gitignore `evals/results/`. — [Plugin evals — Run evals in CI](https://code.claude.com/docs/en/plugin-evals#run-evals-in-ci)
10. Use full MCP tool names in hook matchers and permission rules: `mcp__plugin_create-cmp_cmp-inspector__*`. — [Plugin components — Server names, tool names, and reloads](https://code.claude.com/docs/en/plugins/components#server-names-tool-names-and-reloads)
11. For standing release permission under auto mode, add `autoMode.allow` entries in `~/.claude/settings.json` (not the project files). A chat approval must name the exact act and covers only one act. — [Configure auto mode](https://code.claude.com/docs/en/auto-mode-config); [Permission modes — Approvals you state in conversation](https://code.claude.com/docs/en/permission-modes#approvals-you-state-in-conversation)

**Don't**
1. Don't rely on `permissionMode`, `hooks`, `mcpServers` or `initialPrompt` in the plugin's agent frontmatter; they are ignored for plugin agents. — [Plugin components — Frontmatter fields in plugin agents](https://code.claude.com/docs/en/plugins/components#frontmatter-fields-in-plugin-agents)
2. Don't put instructions in a plugin-root `CLAUDE.md`; it isn't loaded. Use a skill. — [Manifest reference — Standard layout](https://code.claude.com/docs/en/plugins/manifest-reference#standard-layout)
3. Don't use `${user_config.*}` in shell-form hooks, monitors or `headersHelper` (rejected since 2.1.207). Don't expect `pluginConfigs` from project `.claude/settings.json`. — [Manifest reference — Fields that run through a shell](https://code.claude.com/docs/en/plugins/manifest-reference#fields-that-run-through-a-shell); [CHANGELOG 2.1.207](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
4. Don't ship a top-level `bin/` if the plugin should ever install on claude.ai or Cowork; those surfaces refuse it. — [Plugin components — Executables](https://code.claude.com/docs/en/plugins/components#executables)
5. Don't set a manifest key such as `commands` or `agents` without listing the default folder too, or `commands/` and `agents/` get ignored with a warning. `skills` is the only key that adds. — [Manifest reference — How each key combines](https://code.claude.com/docs/en/plugins/manifest-reference#how-each-key-combines-with-its-default-location)
6. Don't use `..`, backslashes or symlinks out of the plugin in component paths. Don't read `../shared` from scripts: copied installs don't include it. — [Plugin loading — Paths that escape the plugin directory](https://code.claude.com/docs/en/plugins/loading#paths-that-escape-the-plugin-directory)
7. Don't assume repo-level `enabledPlugins` installs the plugin for collaborators, or reaches cloud sessions and routines. It enables but doesn't fetch external sources, and cloud sessions skip it. Commit skills to `.claude/skills/` if cloud coverage matters. — [Plugin loading — Enabled in project settings but not installed](https://code.claude.com/docs/en/plugins/loading#enabled-in-project-settings-but-not-installed); [Cloud environments](https://code.claude.com/docs/en/cloud-environments)
8. Don't use an npm *marketplace* source (not implemented). If you use an npm *plugin* source, set `version` (otherwise it resolves to `unknown`) and ship `npm-shrinkwrap.json`. — [Marketplace reference — Marketplace sources](https://code.claude.com/docs/en/plugins/marketplace-reference#marketplace-sources); [Plugin loading — How Claude Code computes the version](https://code.claude.com/docs/en/plugins/loading#how-claude-code-computes-the-version)
9. Don't leave a `--plugin-dir` dev copy active when proving the installed plugin. It silently shadows the marketplace install, and `claude plugin list` still shows the marketplace row as enabled. — [Plugin loading — Name conflicts](https://code.claude.com/docs/en/plugins/loading#name-conflicts)
10. Don't treat `claude plugin eval` scores as security evidence. Plugin hooks and real MCP servers run outside the eval sandbox. — [Plugin evals — What a run can access](https://code.claude.com/docs/en/plugin-evals#security)
11. Don't run `claude -p` over untrusted repositories without `--bare` or `--settings '{"disableAllHooks":true}'`. Project hooks run with no trust dialog. — [Permissions — What runs before you trust a folder](https://code.claude.com/docs/en/permissions#what-runs-before-you-trust-a-folder)

---

## Sources
- https://code.claude.com/docs/en/plugins/overview
- https://code.claude.com/docs/en/plugins/manifest-reference
- https://code.claude.com/docs/en/plugins/marketplace-reference
- https://code.claude.com/docs/en/plugins/loading
- https://code.claude.com/docs/en/plugins/cli-reference
- https://code.claude.com/docs/en/plugins/components
- https://code.claude.com/docs/en/plugins/dependencies
- https://code.claude.com/docs/en/plugins/publish
- https://code.claude.com/docs/en/plugins/host-marketplace
- https://code.claude.com/docs/en/plugins/install
- https://code.claude.com/docs/en/plugins/anthropic-marketplaces
- https://code.claude.com/docs/en/plugins/troubleshooting
- https://code.claude.com/docs/en/plugin-evals
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/settings
- https://code.claude.com/docs/en/permissions
- https://code.claude.com/docs/en/permission-modes
- https://code.claude.com/docs/en/auto-mode-config
- https://code.claude.com/docs/en/sandboxing
- https://code.claude.com/docs/en/headless
- https://code.claude.com/docs/en/github-actions
- https://code.claude.com/docs/en/cloud-environments
- https://code.claude.com/docs/en/claude-code-on-the-web
- https://code.claude.com/docs/en/routines
- https://code.claude.com/docs/en/agent-teams
- https://code.claude.com/docs/en/workflows
- https://code.claude.com/docs/en/output-styles
- https://code.claude.com/docs/en/agent-sdk/plugins
- https://code.claude.com/docs/llms.txt (docs index, used to locate the restructured plugins/ pages)
- https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md (HEAD 2.1.283)
- https://registry.npmjs.org/@anthropic-ai/claude-code (publish dates used to date changelog versions)
- https://www.anthropic.com/news/claude-code-plugins (October 9, 2025 announcement)
