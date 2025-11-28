# Ticket: 06 Kiro Context Handoff and Constraint Guardrails

Spec version: v1.0  
Context: `src/agent/nodes/kiro_coder.ts`, Kiro prompt in `src/agent/prompts/body/kiro_coder.md`, state in `src/agent/state.ts`, IntentContract helper from ticket 01, Executor interface from ticket 05. Targets architecture review problems **#2 (Context loss)** and **#7 (Constraint ignoring)**.

## Objective & DoD

Upgrade the Kiro path so that:

- Kiro receives a **richer, structured context** (intent, constraints, risks, impact) instead of just goal+architect+best practices.
- Simple, deterministic **constraint guardrails** prevent Kiro from editing forbidden paths defined in KOTEF.md / IntentContract.
- Planner and Verifier can trust that Kiro respects high‑level constraints, or else fail closed with an explicit `aborted_constraint`.

### Definition of Done

- [ ] Kiro executor prompt includes:
  - Intent summary (goal, appetite, non‑goals, key constraints).
  - A short risk/impact overview when available.
  - ProjectSummary bullet list (frameworks, languages) as today.
- [ ] If `IntentContract.forbiddenPaths` is set, any Kiro result that touches those paths causes the run to:
  - set `terminalStatus = 'aborted_constraint'`,
  - add a diagnostics entry,
  - route planner to `snitch` with a short explanation.
- [ ] Kiro prompt template (`kiro_coder.md`) clearly instructs it to **avoid forbidden paths** and respect appetite/non‑goals.

## Implementation Sketch

### 1. Extend Kiro Prompt Replacements

- In `src/agent/nodes/kiro_coder.ts` (after ticket 05 refactor):
  - Import `IntentContract` type and the helper used to summarize it.
  - Build additional strings:

    ```ts
    const intent = state.intentContract;
    const intentSummary = intent ? summarizeIntent(intent) : 'No explicit intent contract.';
    const riskSummary = state.riskMap
      ? `Risk level: ${state.riskMap.level}. Factors: ${state.riskMap.factors.join(', ')}.`
      : 'No explicit risk map.';
    const impactSummary = state.impactMap
      ? `Files/modules likely impacted: ${[...state.impactMap.files, ...state.impactMap.modules].slice(0, 10).join(', ')}`
      : 'No impact analysis available.';
    ```

  - Add new placeholders to the prompt:

    ```ts
    .replace('{{INTENT_CONTRACT}}', intentSummary)
    .replace('{{RISK_SUMMARY}}', riskSummary)
    .replace('{{IMPACT_SUMMARY}}', impactSummary)
    ```

### 2. Update `kiro_coder.md` Template

- In `src/agent/prompts/body/kiro_coder.md`:
  - Add inputs:

    ```md
    - Intent Contract: `{{INTENT_CONTRACT}}`
    - Risk Summary: `{{RISK_SUMMARY}}`
    - Impact Summary: `{{IMPACT_SUMMARY}}`
    ```

  - Add explicit guardrails:
    - “NEVER modify files under any forbidden path listed in the Intent Contract unless the ticket explicitly overrides it.”
    - “Respect appetite: for `Small`, prefer minimal localized edits; avoid wide refactors.”
    - “Treat non‑goals as strict: do not implement work that belongs to non‑goals.”

### 3. Constraint Guardrails on Changed Files

- In `kiro_coder` / `KiroExecutor` (depending on where file list is handled):
  - After receiving `ExecutorResult`:
    - Determine `forbiddenPaths` from `state.intentContract?.forbiddenPaths || []`.
    - For each `changedFile`, check if it matches any forbidden glob/prefix (start with simple prefix matching, not full glob engine).
    - If any match:

      ```ts
      const reason = `Kiro modified forbidden path(s): ${violations.join(', ')}`;
      return {
        terminalStatus: 'aborted_constraint',
        plan: { ...state.plan, reason, next: 'snitch' },
        diagnosticsLog: [
          ...(state.diagnosticsLog || []),
          { source: 'policy', kind: 'constraint_violation', message: reason, timestamp: Date.now() }
        ]
      };
      ```

    - Do **not** clear `fileChanges` in this case; planner/snitch should see what went wrong.

### 4. Keep Prompt Size Bounded

- Introduce a tiny helper (or reuse from context builder, ticket 09) to bound multi‑line summaries:

  ```ts
  function truncateLines(text: string, maxLines: number): string {
    const lines = text.split('\n');
    return lines.length <= maxLines
      ? text
      : lines.slice(0, maxLines).join('\n') + '\n...[truncated]';
  }
  ```

- Use it for architect/best practices/intent/risk/impact blocks to ensure the prompt stays within a reasonable size without re‑implementing a full context selector.

## Steps

1. **Prompt wiring**
   - [ ] Add `intentSummary`, `riskSummary`, `impactSummary` strings in `kiro_coder` and inject into template.
   - [ ] Update `kiro_coder.md` with new placeholders and text.
2. **Constraint guardrails**
   - [ ] Implement forbidden‑paths check on `ExecutorResult.changedFiles`.
   - [ ] On violation, set `terminalStatus='aborted_constraint'`, route planner to `snitch`, and append a diagnostics entry.
3. **Prompt bounds**
   - [ ] Add simple line‑based truncation helper (or reuse existing) and apply it to large blocks in the Kiro prompt to keep prompts predictable.

## Affected Files

- `src/agent/nodes/kiro_coder.ts`
- `src/agent/executors/kiro_executor.ts`
- `src/agent/state.ts` (uses `diagnosticsLog` / IntentContract)
- `src/agent/prompts/body/kiro_coder.md`
- `src/agent/utils/intent_contract.ts`

## Risks & Non‑Goals

- **Risk:** Over‑eager forbidden path detection blocking legitimate edits.  
  **Mitigation:** Start with coarse patterns, log violations in `.sdd/issues.md` via Snitch, and tune KOTEF.md rules manually.
- **Non‑goal:** Full policy engine for all constraints (deps, API surfaces); this ticket focuses only on path‑level guardrails and context enrichment.

