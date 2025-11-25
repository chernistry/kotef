# Ticket: 40 Kiro CLI LLM Backend Integration (Claude Sonnet 4.5)

Spec version: v1.0  
Context: `.sdd/architect.md` (LLM provider abstraction, safety, budgets), `.sdd/best_practices.md` (error-first loops, JSON-only contracts), `src/core/llm.ts` (OpenAI-only implementation), `src/core/config.ts` (env-driven config), `src/cli.ts` (runtime wiring), external tool: `kiro-cli` (formerly Amazon Q Developer CLI) running Claude Sonnet 4.5 and MCP tools.

## Objective & DoD

Allow Kotef to run **with Kiro CLI as the underlying LLM backend** (Claude Sonnet 4.5) instead of OpenAI-compatible APIs, selectable via environment / config, while preserving:

- our SDD “brain” (project/architect/best_practices/tickets),
- our LangGraph orchestration and tools (fs, command runner, diagnostics),
- all existing safety and JSON/prompt contracts.

### Definition of Done

- [ ] Config:
  - [ ] New provider selector, e.g. `CHAT_LLM_PROVIDER` with values `openai` (default) or `kiro`.
  - [ ] New `KIRO_CLI_PATH` (defaults to `kiro-cli` on PATH) and `KIRO_MODEL` (defaults to `claude-sonnet-4.5`).
- [ ] Abstraction:
  - [ ] `src/core/llm.ts` refactored to use a small **LlmBackend** interface (e.g. `callChat(config, messages, options)`), with at least:
    - [ ] `OpenAiLlmBackend` (current behaviour),
    - [ ] `KiroCliLlmBackend` (new).
  - [ ] Selection of backend happens in **one place**, based on config/env.
- [ ] Kiro backend:
  - [ ] Spawns `kiro-cli` in a **non-interactive mode** or equivalent (TBD by research) and:
    - [ ] passes messages/history and target model,
    - [ ] receives response as plain text or JSON,
    - [ ] maps it back into our `ChatMessage[]` structure.
  - [ ] Handles timeouts, non-zero exit codes, and truncated outputs gracefully, surfacing them as `KotefLlmError` with clear diagnostics.
- [ ] Behaviour:
  - [ ] With `CHAT_LLM_PROVIDER=openai`, behaviour is unchanged.
  - [ ] With `CHAT_LLM_PROVIDER=kiro`, planner/researcher/coder/verifier all go through Kiro-backed Claude Sonnet 4.5 and **still respect**:
    - JSON-only response_format for planner/verifier/coder decisions,
    - our tools and error-first workflows.
  - [ ] If `kiro-cli` is missing or misconfigured, Kotef fails fast with a clear error and suggestion to switch back to OpenAI provider.

## Steps

1. **Research Kiro CLI non-interactive/JSON modes**
   - [ ] Inspect `kiro-cli help` / docs:
     - [ ] Look for flags like `--prompt`, `--input`, `--output json`, `--plan-only`, `--non-interactive`, `--single-turn`.
     - [ ] Confirm whether Kiro CLI can:
       - run a single-turn chat (no TUI),
       - accept a serialized conversation history,
       - return machine-readable output (JSON) or plain text.
   - [ ] Document capabilities and limitations (e.g., max tokens, streaming vs buffered).

2. **Introduce LlmBackend abstraction**
   - [ ] In `src/core/llm.ts`, define a small interface, e.g.:
     - [ ] `interface LlmBackend { callChat(config, messages, options): Promise<{ messages, toolCalls? }>; }`
   - [ ] Implement `OpenAiLlmBackend` by moving existing OpenAI-specific logic into a class or function.
   - [ ] Add a factory that picks backend based on config (`CHAT_LLM_PROVIDER`).

3. **Implement KiroCliLlmBackend**
   - [ ] Create `src/core/kiro_client.ts`:
     - [ ] Accepts messages/history and options (model, temperature).
     - [ ] Serializes messages into a Kiro-friendly prompt (likely concatenated system+user text, with markers).
     - [ ] Spawns `kiro-cli` with appropriate flags (e.g. `kiro-cli chat --model <model> --no-tui --input <prompt>` – exact form depends on research).
     - [ ] Captures STDOUT/STDERR, applies timeouts, and logs failures.
   - [ ] Parse Kiro output:
     - [ ] Minimal requirement: extract answer text and map to a single assistant `ChatMessage`.
     - [ ] If Kiro can emit JSON or tool calls, **do not rely on them** in v1; treat Kiro purely as an LLM, and keep tool orchestration on our side.
   - [ ] Integrate with `callChat` by delegating to `KiroCliLlmBackend` when provider is `kiro`.

4. **Config & CLI wiring**
   - [ ] Extend `KotefConfigSchema` in `src/core/config.ts` with `llmProvider?: 'openai' | 'kiro'`, `kiroCliPath?: string`, `kiroModel?: string`.
   - [ ] Read env vars: `CHAT_LLM_PROVIDER`, `KIRO_CLI_PATH`, `KIRO_MODEL`.
   - [ ] Optionally add a CLI flag `--llm-provider` to `src/cli.ts` that overrides env.

5. **Validation**
   - [ ] Add a small CLI smoke command (or documented recipe) that:
     - [ ] runs `kotef run --root /tmp/kotef-demo-app --goal "say hello" --profile smoke` with:
       - [ ] OpenAI provider,
       - [ ] then with Kiro provider,
     - [ ] ensures both complete without errors and log which backend was used.

## Affected Files

- `src/core/llm.ts` (refactor to pluggable backend)
- `src/core/config.ts` (new config/env for provider/kiro)
- `src/core/kiro_client.ts` (new, Kiro CLI wrapper)
- `src/cli.ts` (optional `--llm-provider` flag)
- `docs/KB.md` (configuration / provider selection section)

## Tests

- [ ] Unit tests:
  - [ ] LlmBackend factory returns OpenAI backend by default; Kiro backend when `CHAT_LLM_PROVIDER=kiro`.
  - [ ] Kiro backend:
    - [ ] happy-path: mocked `kiro-cli` returning a simple answer on STDOUT → mapped to `ChatMessage`.
    - [ ] error-path: non-zero exit or timeout → throws `KotefLlmError` with clear info.
- [ ] Integration tests (behind a feature flag or `describe.skip` until Kiro is available in CI):
  - [ ] Simple planner/coder call under `CHAT_LLM_PROVIDER=kiro` completes without blowing up JSON contracts.

## Risks & Edge Cases

- Kiro CLI might not support a clean single-turn, non-interactive mode:
  - Mitigation: start with “best-effort” wrapper; if interactivity cannot be suppressed, document that Kiro backend is experimental and may require manual supervision.
- Kiro output format might change; parsing must be defensive and log issues clearly.
- Latency and cost may differ from OpenAI; budgets should still apply at the planner/profile level.

## Dependencies

- None hard, but this interacts with:
  - Ticket 29 (prompt hardening & policy alignment) to ensure we don’t break JSON contracts when swapping LLMs.
  - Tickets around budgets/stop rules to prevent long-running Kiro calls from hanging the agent.


