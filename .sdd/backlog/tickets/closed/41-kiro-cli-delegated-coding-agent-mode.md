# Ticket: 41 Kiro CLI Delegated Coding-Agent Mode (Brain/Body Hybrid)

Spec version: v1.0  
Context: `.sdd/architect.md` (brain/body separation, SDD as source of truth), `.sdd/best_practices.md` (tool-first, diff-first edits, safety), `src/agent/graph.ts` (planner/researcher/coder/verifier graph), `src/agent/nodes/coder.ts` (our current “body”), Kiro CLI (Claude Sonnet 4.5 + its own tools and agentic flows).

## Objective & DoD

Experiment with a **delegated coding-agent mode** where:

- Kotef’s SDD “brain” (goal, architect, tickets, best practices, verification) remains in control of **what** should be built/fixed, and
- the actual coding/editing work for a ticket (`coder` role) is delegated to **Kiro CLI’s internal coding agent**, operating on the same project workspace.

This should be switchable via config (feature flag / profile) and treated as experimental, not the default path.

### Definition of Done

- [ ] New **delegated coder mode**:
  - [ ] Config/environment flag, e.g. `KOTEF_CODER_MODE=internal|kiro`, defaults to `internal`.
  - [ ] When set to `kiro`, the LangGraph uses a `kiroCoderNode` instead of the internal `coderNode`.
- [ ] `kiroCoderNode` responsibilities:
  - [ ] Assemble a concise, high-signal prompt from:
    - current goal/ticket (`.sdd/project.md`, `.sdd/architect.md`, `.sdd/best_practices.md`, ticket file),
    - detected stack and commands (from `detectCommands`),
    - any existing diagnostics (build/test errors).
  - [ ] Invoke `kiro-cli` in the project root so that Kiro’s agent operates directly on the same workspace.
  - [ ] Wait for Kiro to finish (or for a bounded session) and then:
    - [ ] compute the changed files (e.g. via `git diff` or glob hashing),
    - [ ] update `AgentState.fileChanges` accordingly.
- [ ] Behaviour:
  - [ ] Planner, researcher, and verifier remain **ours**, including error-first and goal-aware verification.
  - [ ] Verifier still runs our own lint/build/tests after Kiro’s changes.
  - [ ] If Kiro fails (non-zero exit, timeout, or empty result), `kiroCoderNode` returns `status: blocked` with a clear reason, and planner can route to Snitch or fallback to internal coder.

## Steps

1. **Feasibility research**
   - [ ] Explore Kiro CLI options:
     - [ ] Is there a “run once on this repo with this goal” mode (e.g. `kiro-cli chat -a -r --goal "<text>"`) that:
       - runs its agentic loop against the given root directory,
       - returns control when done,
       - can be bounded in time or steps?
     - [ ] Confirm how Kiro chooses its own tools and whether we can safely let it write to the same project dir.
   - [ ] Identify non-interactive flags or automation hooks (if any) suitable for embedding in another agent.

2. **Design the brain→Kiro handoff protocol**
   - [ ] Define a compact “handoff packet” containing:
     - [ ] goal/ticket summary,
     - [ ] stack detection summary,
     - [ ] key constraints from `.sdd/architect.md` and `.sdd/best_practices.md` (e.g. Node 20, diff-first, tests to run).
   - [ ] Decide how to feed this into Kiro:
     - [ ] either as a single long prompt argument,
     - [ ] or via a temporary markdown file that Kiro is instructed to read.
   - [ ] Define clear boundaries:
     - [ ] Kiro owns file edits during this phase,
     - [ ] Kotef owns verification and SDD updates afterwards.

3. **Implement `kiroCoderNode`**
   - [ ] Introduce a new node in `src/agent/graph.ts`, e.g. `kiroCoderNode(cfg)`:
     - [ ] Builds the handoff prompt from `AgentState`.
     - [ ] Calls a helper `runKiroAgentSession(rootDir, prompt, options)` (to be implemented in `src/core/kiro_client.ts` or a dedicated module).
   - [ ] `runKiroAgentSession`:
     - [ ] Spawns `kiro-cli` in the project root.
     - [ ] Passes the handoff prompt and any necessary flags.
     - [ ] Enforces a timeout and max runtime.
     - [ ] On completion, computes file changes (e.g. snapshot directory before/after, or rely on git diff if repo is tracked).
   - [ ] Update `AgentState.fileChanges` and any relevant metrics/budgets.

4. **Graph & config wiring**
   - [ ] In `buildKotefGraph`, route planner’s `next: "coder"` decisions to:
     - [ ] `coderNode` when `KOTEF_CODER_MODE=internal`,
     - [ ] `kiroCoderNode` when `KOTEF_CODER_MODE=kiro`.
   - [ ] Ensure existing stop rules (budgets, MAX_STEPS, failureHistory) are still enforced in Kiro mode.
   - [ ] Expose an experimental flag in docs / CLI (`--coder-mode` optional).

5. **Validation**
   - [ ] Dry-run scenario:
     - [ ] On a small demo repo (like the React/Vite portfolio), run Kotef with `coder-mode=kiro` and observe:
       - [ ] Kiro is invoked with the right prompt,
       - [ ] files change in expected places,
       - [ ] verifier runs our `yarn run build`/`lint` afterwards.
   - [ ] Fallback:
     - [ ] If Kiro fails or times out, ensure `kiroCoderNode` surfaces a `blocked` reason and planner does not loop indefinitely.

## Affected Files

- `src/agent/graph.ts` (new node and routing)
- `src/agent/nodes/kiro_coder.ts` (new node implementation)
- `src/core/kiro_client.ts` (extend to run multi-step Kiro agent sessions)
- `src/core/config.ts` (new `coderMode` / env flags)
- `docs/KB.md` (document experimental Kiro coder mode)

## Tests

- [ ] Unit tests:
  - [ ] `kiroCoderNode` with a mocked `runKiroAgentSession` that simulates:
    - [ ] successful run changing some files,
    - [ ] failure / timeout returning error status.
  - [ ] Graph selection logic: with different `KOTEF_CODER_MODE` values, planner routes to correct node.
- [ ] Manual / integration validation:
  - [ ] Run on a throwaway repo with `coder-mode=kiro`, confirm no infinite loops or unsafe writes outside root.

## Risks & Edge Cases

- Kiro CLI interactivity: if it cannot run in a fully non-interactive, bounded mode, this feature may only be suitable for manual/experimental use.
- Conflicting edits: both Kotef and Kiro operating on the same repo could cause conflicting styles or patches; for now, in Kiro mode, Kotef should **not** perform its own diffs in parallel.
- Debuggability: failures may be harder to debug since coding is happening inside another agent; mitigated by:
  - logging the exact handoff prompt,
  - capturing Kiro’s stdout/stderr to `.sdd/runs/*`.

## Dependencies

- Ticket 40 (Kiro CLI LLM backend integration) is not strictly required but helpful:
  - If we already have a robust Kiro client wrapper, `kiroCoderNode` can reuse its process spawning and timeout logic.
- Existing stop rules and budgets (Tickets 14, 19, 30, 35) must remain in place to prevent pathological behaviour when delegating to an external agent.

