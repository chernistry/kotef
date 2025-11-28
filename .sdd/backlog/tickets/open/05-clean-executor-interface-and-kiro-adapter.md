# Ticket: 05 Clean Executor Interface and Kiro Adapter

Spec version: v1.0  
Context: `src/agent/graph.ts`, `src/agent/nodes/{coder.ts,kiro_coder.ts}`, Kiro integration in `src/core/kiro_session.ts`, architecture review problem **#2 (Context loss OpenRouter→Kiro)** and research doc section **7** (Executor interface). Depends on ticket **01 Intent Contract** (for intent information) and **09 Artifacts** (optional, for future artifacts).

## Objective & DoD

Introduce a small, explicit **Executor interface** for code‑editing backends and refactor the current Kiro integration to use it, so that:

- Kiro becomes just one pluggable executor behind a stable TypeScript interface.
- Planner and other nodes reason in terms of **intent + plan + code context**, not raw prompts.
- Future executors (local LLM, Gemini CLI, Claude Code, etc.) can be added without touching planner/graph logic.

### Definition of Done

- [ ] A new `ExecutorRequest` / `ExecutorResult` interface exists under `src/agent/executors/`.
- [ ] A `KiroExecutor` implementation wraps `runKiroAgentSession` and maps `AgentState` + `IntentContract` → `ExecutorRequest`.
- [ ] `kiro_coder` node becomes a thin adapter that calls `KiroExecutor` instead of embedding Kiro specifics directly.
- [ ] `graph.ts` selects coder implementation via the Executor interface (Kiro vs built‑in coder) based on config.
- [ ] No behaviour regression: existing Kiro‑based flows still run with the same inputs/outputs (plus extra context for later tickets).

## Implementation Sketch

### 1. Define Executor Interfaces

- Add `src/agent/executors/types.ts`:

  ```ts
  import type { IntentContract } from '../state.js';

  export interface ExecutorRequest {
    rootDir: string;
    intent: IntentContract | null;
    ticketMarkdown?: string;
    summary?: string;
    targetFiles?: string[];
  }

  export interface ExecutorResult {
    changedFiles: string[];
    logs?: string[];
    error?: string;
    success: boolean;
  }
  ```

  (Keep intentionally small; more fields can be added later as needed.)

### 2. Implement `KiroExecutor`

- Add `src/agent/executors/kiro_executor.ts`:
  - Export `async function runKiroExecutor(cfg: KotefConfig, state: AgentState): Promise<ExecutorResult>`.
  - Build a natural‑language prompt using the existing `kiro_coder` logic for now (goal + architect + best practices + project summary).
  - Call `runKiroAgentSession` with that prompt and map back to `ExecutorResult`:

    ```ts
    const result = await runKiroAgentSession(cfg, { rootDir: cfg.rootDir, prompt, timeout: cfg.kiroSessionTimeout, trustAllTools: true });
    return {
      success: result.success,
      error: result.error,
      changedFiles: result.changedFiles,
      logs: result.logs, // if available
    };
    ```

### 3. Refactor `kiro_coder` Node

- In `src/agent/nodes/kiro_coder.ts`:
  - Replace direct `runKiroAgentSession` call with `runKiroExecutor`.
  - Keep responsibility limited to:
    - logging start/end,
    - updating `state.fileChanges` from `ExecutorResult.changedFiles`,
    - appending a short assistant message summarizing which files were modified,
    - setting `terminalStatus` appropriately when `success === false`.
  - Ensure `state.intentContract` (ticket 01) is passed into `runKiroExecutor` via `ExecutorRequest`.

### 4. Graph Wiring

- In `src/agent/graph.ts`:
  - Keep existing `coderNode` as the “local diff executor”.
  - Use the Executor interface for Kiro path:

    ```ts
    const coderImpl = cfg.coderMode === 'kiro'
      ? (state: AgentState) => kiroCoderNode(state, cfg) // now thin, calls KiroExecutor
      : coderNode(cfg, chatFn);
    ```

  - No change in external CLI flags; this ticket is purely internal refactor / interface shaping.

## Steps

1. **Define interfaces**
   - [ ] Create `src/agent/executors/types.ts` with `ExecutorRequest` and `ExecutorResult`.
2. **Implement `KiroExecutor`**
   - [ ] Add `runKiroExecutor` wrapper in `src/agent/executors/kiro_executor.ts`.
3. **Refactor `kiro_coder`**
   - [ ] Replace direct `runKiroAgentSession` usage with `runKiroExecutor`.
   - [ ] Ensure `fileChanges` and `messages` updates are unchanged in behaviour.
4. **Graph wiring & smoke check**
   - [ ] Confirm `buildKotefGraph` still routes correctly for `coderMode: 'kiro'`.
   - [ ] Run a small manual scenario to verify Kiro path remains functional.

## Affected Files

- `src/agent/nodes/kiro_coder.ts`
- `src/core/kiro_session.ts` (indirectly, via new adapter)
- `src/agent/graph.ts`
- `src/agent/executors/types.ts` (new)
- `src/agent/executors/kiro_executor.ts` (new)

## Risks & Non‑Goals

- **Risk:** Accidental change of prompt content for Kiro.  
  **Mitigation:** Keep prompt construction identical to existing code; no changes to wording in this ticket.
- **Non‑goal:** Adding a second executor implementation (e.g. local LLM); this ticket only introduces the interface and Kiro adapter.

