Below is a CLI-focused "spec sheet" of Kiro features you can hand to another AI to compare against Kotef. Everything is based on Kiro's public CLI docs and CLI reference. ([Kiro][1])

---

## Kiro CLI: feature inventory

### 0) Install + auth

* Installation (macOS curl installer; Linux AppImage/.deb/zip flows). ([Kiro][2])
* Auth providers: GitHub, Google, AWS Builder ID, AWS IAM Identity Center. ([Kiro][3])
* CLI auth commands: `login`, `logout`, `whoami`. ([Kiro][4])

### 1) Interactive chat mode (terminal)

* Start chat: `kiro-cli` (no subcommand) or `kiro-cli chat`. ([Kiro][4])
* Multi-line prompts: `/editor` (opens $EDITOR); newline insertion via Ctrl+J; `/reply` opens editor with quoted last assistant message. ([Kiro][5])
* Conversation persistence:

  * Directory-based persistence (resume in same folder); explicit resume: `kiro-cli chat --resume`. ([Kiro][5])
  * Manual save/load: `/save [path]` and `/load [path]` (JSON). ([Kiro][5])
* Conversation summarization / auto-compaction is a configurable CLI setting (`chat.disableAutoCompaction`). ([Kiro][6])
* Notifications and context-usage indicator are configurable settings. ([Kiro][6])

### 2) Model selection (CLI)

Available models in CLI chat:

* Auto (router), Claude Sonnet 4.0, Claude Sonnet 4.5, Claude Opus 4.5, Claude Haiku 4.5. ([Kiro][7])
  How to switch / persist:
* In-chat: `/model` and `/model set-current-as-default` (persists in `~/.kiro/settings/cli.json`). ([Kiro][8])
* CLI setting: `kiro-cli settings chat.defaultModel ...`. ([Kiro][6])

### 3) Configuration scopes and locations

Kiro CLI supports global + project scopes (and agent scope for some items), with precedence rules:

* MCP: Agent > Project > Global
* Prompts: Project > Global
* Custom agents: Project > Global
* Steering: Project > Global ([Kiro][9])

Key locations:

* MCP: `~/.kiro/settings/mcp.json` and `.kiro/settings/mcp.json`
* Prompts: `~/.kiro/prompts` and `.kiro/prompts`
* Custom agents: `~/.kiro/agents` and `.kiro/agents`
* Steering: `~/.kiro/steering` and `.kiro/steering` ([Kiro][9])

### 4) Steering (persistent project guidance)

* Markdown steering files under `.kiro/steering/` (workspace) or `~/.kiro/steering/` (global), auto-loaded into CLI chat sessions. ([Kiro][10])
* Foundational steering file convention: `product.md`, `tech.md`, `structure.md`. ([Kiro][10])
* Supports the `AGENTS.md` standard; always included when present (global or workspace root). ([Kiro][10])

### 5) Custom agents (CLI)

Core capabilities:

* Create agents via CLI (`kiro-cli agent create ...`) or in-chat (`/agent generate`). ([Kiro][11])
* Agent config: JSON with name/description, prompt, model, tool allowlists, resources (persistent context), MCP servers, hooks, aliases. ([Kiro][11])
* Tool access control: choose built-in tools and/or MCP tools; control exact tool set; manage naming conflicts via aliases. ([Kiro][12])

CLI command surface:

* `kiro-cli agent create|list|show|delete ...` (plus other reference-listed options). ([Kiro][4])

### 6) Hooks (runtime automation points)

Hooks run custom commands at lifecycle/tool boundaries; hook event JSON passed via stdin. ([Kiro][13])
Hook types:

* `AgentSpawn` (agent activated)
* `UserPromptSubmit` (user submits prompt)
* `PreToolUse` (before a tool; can block with exit code 2)
* `PostToolUse` (after a tool; sees tool response)
* `Stop` (end of each turn; good for tests/format/cleanup)
  Plus: timeout (`timeout_ms`) and caching (`cache_ttl_seconds`). ([Kiro][13])
  Tool matching supports built-ins and MCP namespaces (e.g. `"write"`, `"@git"`, `"@git/status"`, `"*"`, `"@builtin"`). ([Kiro][13])

### 7) MCP servers (Model Context Protocol)

What it enables:

* External tools/knowledge/services via local/remote MCP servers; extend Kiro with domain-specific tools; build custom tools. ([Kiro][14])
  Configuration:
* JSON config files; local/remote server options; loading priority; disabling servers/tools; viewing loaded servers. ([Kiro][15])
  Security model highlights: explicit permission before tool execution, local execution as separate processes, transparency of available tools. ([Kiro][16])
  Governance (org allow-list) exists for certain subscriptions. ([Kiro][17])
  CLI commands:
* `kiro-cli mcp list|status|add|remove|import` (exact subcommands per reference). ([Kiro][4])

### 8) Built-in tools available to the agent (CLI)

Kiro CLI exposes built-in tools (agent can be allowed/blocked per agent config and via permissions):

* File ops: `read`, `write`, `edit`, `glob`, `grep`, `ls`
* Command exec: `shell`
* Web: `search`, `fetch`
* Git: `git`
* AWS: `aws` ([Kiro][18])
  Experimental / optional tools (toggleable via settings):
* `thinking`, `delegate`, `knowledge`, `todo` and related UX features (see Settings + Experimental docs). ([Kiro][6])

### 9) Slash commands (in-chat UX surface)

Core chat controls:

* `/help`, `/quit`, `/clear`, `/editor`, `/reply` ([Kiro][19])
  Context/tools visibility:
* `/context` (manage session context)
* `/tools` (list tools)
* `/checkpoint` (create/list/restore checkpoints; feature flag exists)
* `/save`, `/load` (conversation persistence) ([Kiro][19])
  Agent/model:
* `/agent` (manage/switch/generate agents)
* `/model` (+ `set-current-as-default`)
* `/chat` (chat UI toggles) ([Kiro][19])
  Diagnostics/meta:
* `/issue` (create issue bundle)
* `/logdump`, `/changelog`, `/experiments`
* `/tangent` (toggle tangent mode)
* `/todo` (view/resume todo lists) ([Kiro][19])

### 10) Settings surface (CLI)

Settings command: `kiro-cli settings [path] [value]` + a documented catalog of keys for chat UX, experimental toggles, knowledge indexing params, MCP timeouts, telemetry, etc. ([Kiro][6])

Notable toggles (documented):

* `chat.enableThinking`, `chat.enableDelegate`, `chat.enableTangentMode`, `chat.enableTodoList`, `chat.enableCheckpoint`
* `chat.enableNotifications`, `chat.enableContextUsageIndicator`
* Knowledge indexing defaults (include/exclude patterns, chunking, max files) ([Kiro][6])

### 11) Other CLI commands (non-chat)

From the CLI commands reference (top-level):

* `chat`, `context`, `agent`, `settings`, `mcp`
* `doctor` (troubleshooting), `diagnostic`, `issue`
* `update`, `version`
* `theme`
* `integrations`
* `translate` ([Kiro][4])

### 12) Privacy/security guidance (CLI)

* Docs explicitly warn that the agent operates in your local environment and can access local files, env vars, AWS creds in env, and other sensitive configs; recommends protective practices. ([Kiro][20])

---

## Minimal "diff checklist" for your other AI (copy/paste)

Have it compare Kotef to Kiro CLI along these axes:

1. Chat UX + persistence (/save, /load, resume) ([Kiro][5])
2. Steering (.kiro/steering + AGENTS.md) ([Kiro][10])
3. Hooks lifecycle (AgentSpawn/UserPromptSubmit/PreToolUse/PostToolUse/Stop) ([Kiro][13])
4. Custom agents (JSON config: tools/resources/prompt/model/mcpServers/hooks/aliases) ([Kiro][11])
5. MCP servers + governance/security + CLI subcommands ([Kiro][15])
6. Built-in tools list and which ones overlap with Kotef equivalents ([Kiro][18])
7. Experimental features (todo lists, knowledge, thinking, delegate, tangent, checkpoint) ([Kiro][6])
8. Model selection & persistence ([Kiro][7])

If you want, paste the Kiro CLI agent config schema fields you plan to target (from your local Kiro repo docs), and I will map your 3 proposals (Intent Contract / Execution Profiles / Autonomous Research) onto Kiro's existing primitives (steering + hooks + custom agents + MCP), and mark what is already covered vs truly additive.

[1]: https://kiro.dev/docs/cli/?utm_source=chatgpt.com "Get started - CLI - Docs"
[2]: https://kiro.dev/docs/cli/installation/?utm_source=chatgpt.com "Installation - CLI - Docs"
[3]: https://kiro.dev/docs/cli/authentication/?utm_source=chatgpt.com "Authentication methods - CLI - Docs"
[4]: https://kiro.dev/docs/cli/reference/cli-commands/?utm_source=chatgpt.com "CLI commands - CLI - Docs"
[5]: https://kiro.dev/docs/cli/chat/ "Chat - CLI - Docs - Kiro"
[6]: https://kiro.dev/docs/cli/reference/settings/?utm_source=chatgpt.com "Settings - CLI - Docs"
[7]: https://kiro.dev/docs/cli/chat/model-selection/?utm_source=chatgpt.com "Model selection - CLI - Docs"
[8]: https://kiro.dev/docs/cli/reference/slash-commands/?utm_source=chatgpt.com "Slash commands - CLI - Docs"
[9]: https://kiro.dev/docs/cli/chat/configuration/?utm_source=chatgpt.com "Configuration - CLI - Docs"
[10]: https://kiro.dev/docs/cli/steering/ "Steering - CLI - Docs - Kiro"
[11]: https://kiro.dev/docs/cli/custom-agents/creating/?utm_source=chatgpt.com "Creating custom agents - CLI - Docs"
[12]: https://kiro.dev/docs/cli/custom-agents/?utm_source=chatgpt.com "Custom agents - CLI - Docs"
[13]: https://kiro.dev/docs/cli/hooks/ "Hooks - CLI - Docs - Kiro"
[14]: https://kiro.dev/docs/cli/mcp/?utm_source=chatgpt.com "Model Context Protocol (MCP) - CLI - Docs"
[15]: https://kiro.dev/docs/cli/mcp/configuration/?utm_source=chatgpt.com "Configuration - CLI - Docs"
[16]: https://kiro.dev/docs/cli/mcp/security/?utm_source=chatgpt.com "Security - CLI - Docs"
[17]: https://kiro.dev/docs/cli/mcp/governance?utm_source=chatgpt.com "Governance - CLI - Docs"
[18]: https://kiro.dev/docs/cli/reference/built-in-tools/ "Built-in tools - CLI - Docs - Kiro"
[19]: https://kiro.dev/docs/cli/reference/slash-commands/ "Slash commands - CLI - Docs - Kiro"
[20]: https://kiro.dev/docs/cli/privacy-and-security/?utm_source=chatgpt.com "Privacy and security - CLI - Docs"
