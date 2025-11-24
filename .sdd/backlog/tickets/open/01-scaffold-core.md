# Ticket: 01 Scaffold Core & LLM Adapter

Spec version: v1.0  
Context: `.sdd/project.md` (Definition of Done), `.sdd/architect.md` Sections 2, 6.1  
Dependencies: none (root ticket; must run before 02–06).

## Objective & DoD
Initialize the kotef runtime project structure and implement the core configuration, logging, and LLM adapter modules, reusing patterns from Navan/CallQuest where sensible.

**Definition of Done:**
- [ ] `package.json` initialized with minimal, **intentional** dependencies (typescript, langgraph, openai-compatible SDK, zod, dotenv, commander/yargs, node:test typings) – no unused frameworks.
- [ ] `tsconfig.json` configured for Node 20 + strict mode (`"target": "ES2022"`, `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`, `"allowImportingTsExtensions": true`).
- [ ] `src/core/config.ts` implemented: loads env vars, parses CLI args, validates config via zod, exposes a typed `KotefConfig`.
- [ ] `src/core/logger.ts` implemented: structured JSON logging with levels and runId support.
- [ ] `src/core/llm.ts` implemented: generic adapter for OpenAI-compatible providers with retries, timeouts and streaming hooks; **API surface sketched below**.
- [ ] Unit tests for `config` and `logger` pass via Node’s built-in `node:test`.
- [ ] No hard-coded model/baseUrl/API key; all come from `KotefConfig`.

## Implementation Sketch (non-binding but prescriptive)

**Config module**
```ts
// src/core/config.ts
export interface KotefConfig {
  rootDir: string;
  /** Generic OpenAI-compatible API key (OpenAI, Anthropic via proxy, etc.) */
  apiKey: string;
  /** Base URL for the LLM provider (OpenAI, OpenRouter, custom gateway, etc.). */
  baseUrl: string;
  /** Default cheaper/faster model for planning, research, and non-critical calls. */
  modelFast: string;
  /** Top-tier frontier model (ChatGPT 5.1 / Claude Sonnet 4.5 / Gemini 3 Pro class) for final codegen or critical steps. */
  modelStrong: string;
  searchApiKey?: string;
  dryRun: boolean;
  /** Soft budget for a single run; used for guardrails, not hard guarantees. */
  maxTokensPerRun: number;
  /** Max number of outbound web requests per run (search + fetch). */
  maxWebRequestsPerRun: number;
  /** Max wall-clock seconds per run before graceful stop. */
  maxRunSeconds: number;
}

export function loadConfig(env = process.env, argv = process.argv): KotefConfig {
  // Use dotenv.config() once at startup, then validate via zod schema.
}
```

**Logger module**
```ts
// src/core/logger.ts
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  component?: string;
  event?: string;
  runId?: string;
  [key: string]: unknown;
}

export function createLogger(runId: string) {
  return function log(level: LogLevel, message: string, fields: LogFields = {}): void {
    // JSON.stringify({ ts: new Date().toISOString(), level, message, ...fields })
  };
}
```

**LLM adapter (inspired by `navan/root/src/core/llm.ts` and `callquest/root/src/core/llm.ts`)**
```ts
// src/core/llm.ts
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface ToolCallResult {
  toolName: string;
  args: unknown;
  result: unknown;
}

export interface ChatCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export async function callChat(
  cfg: KotefConfig,
  messages: ChatMessage[],
  options?: ChatCompletionOptions,
): Promise<{ messages: ChatMessage[]; toolCalls?: ToolCallResult[] }> {
  // Thin wrapper around OpenAI-compatible SDK; reuse resilience patterns from Navan.
}
```

The ticket implementer MUST:
- inspect `navan/root/src/core/llm.ts` and `finearts/callquest/root/src/core/llm.ts` and explicitly note which resilience/metrics patterns are reused vs intentionally omitted;
- avoid embedding any Navan/CallQuest domain-specific logic (intents/slots/travel/callquest notions).

## Steps
1. Initialize `package.json` and install only the minimal dependencies needed for this ticket (`typescript`, `ts-node` or `tsx`, `zod`, `dotenv`, `commander` or `yargs`, `openai` or equivalent, `@types/node`).
2. Create `tsconfig.json` for Node 20 as per DoD and ensure `rootDir` / `outDir` are set for `src` and `dist`.
3. Implement `src/core/logger.ts` following the sketch above, including a simple `createLogger` factory and at least one unit test asserting JSON shape.
4. Implement `src/core/config.ts`:
   - use `dotenv` to load `.env` once;
   - define a zod schema for `KotefConfig` with sane defaults (e.g. `dryRun` default `true`, `maxRunSeconds` default ≈300, `maxWebRequestsPerRun` default ≈30);
   - derive `rootDir` from `process.cwd()` or a `--root` CLI flag;
   - throw a clear error if required keys (API keys, model) are missing.
5. Implement `src/core/llm.ts`:
   - design the public API surface exactly (interfaces + `callChat` signature);
   - implement a first version using an OpenAI-compatible SDK with explicit timeout and retry policy;
   - ensure all network errors are wrapped in a typed error (e.g. `KotefLlmError`) with `cause`.
6. Add unit tests in `test/core/` for `config` and `logger` (LLM adapter can be partially stubbed/mocked; full integration tests may be added in later tickets).

## Affected Files
- `package.json`
- `tsconfig.json`
- `src/core/config.ts`
- `src/core/llm.ts`
- `src/core/logger.ts`
- `test/core/config.test.ts`
- `test/core/logger.test.ts`

## Tests
```bash
npm test test/core/config.test.ts
npm test test/core/logger.test.ts
```

## Risks & Edge Cases
- Misconfigured `rootDir` leading to the agent accessing wrong workspace.
- Silent fallback to default models/APIs instead of failing fast when config is incomplete.
- Overly tight or missing timeouts in `callChat` causing hung processes.
