# Ticket: 05 Interactive CLI Session (Voyant-style UX)

Spec version: v1.0  
Context: `.sdd/project.md` (CLI/API goals, auto-SDD), `.sdd/architect.md` (Orchestrator sketch, CLI),  
Tickets 03 (template driver), 04 (SDD orchestrator graph), 07 (bootstrap), 08 (runtime prompts)  
Dependencies: 01-scaffold-core, 02-tools-fs, 03-sddrush-template-driver, 04-interactive-sdd-orchestrator-graph.

## Objective & DoD
Provide an **interactive, coding-agent-style CLI** (similar to Voyant, Claude Code, Gemini Code, Qwen Code, etc.) so that:
- user runs kotef inside a project,
- types a plain “do X” request,
- watches kotef step through:
  1. SDD research (01_research),
  2. SDD architecting (02_architect),
  3. ticket generation (03_agent),
  4. ticket execution (coding graph),
- with a conversational, inspectable experience (logs / status, optional follow-ups).

**Definition of Done:**
- [ ] `src/cli.ts` extended (or new entry added) with a subcommand:
  - `kotef chat` (or `kotef dev`) that:
    - prompts the user for a goal (if not passed as `--goal`),
    - shows high-level status updates for each SDD phase and coding phase,
    - prints a summary (run report path, main diffs, tests) on completion.
- [ ] Interactive loop behavior:
  - [ ] minimal REPL-style loop where the user can:
    - confirm / refine the goal before SDD orchestration,
    - choose to continue to coding after seeing generated tickets (or stop and inspect SDD),
    - optionally run another goal in the same project without restarting the process.
- [ ] Under the hood:
  - [ ] `kotef chat` uses:
    - `runSddOrchestration` (Ticket 04) to build/update `.sdd/*` and tickets,
    - the main coding graph to execute a chosen ticket (or the next ticket),
    - existing logging + run report machinery.
- [ ] User-facing help (`kotef --help` / `kotef chat --help`) documents the flow clearly.

## Implementation Sketch

```ts
// src/cli.ts (sketch)
export async function chat(argv = process.argv): Promise<void> {
  const cfg = loadConfig(process.env, argv);
  const rootDir = resolveRootFromArgsOrCwd(argv);
  const goal = await promptUserForGoalIfMissing(argv);

  // 1) Run SDD orchestration (research → architect → tickets)
  await runSddOrchestration(cfg, rootDir, goal);

  // 2) Show user summary of created/updated SDD and tickets
  // 3) Ask if they want to proceed with coding execution now
  // 4) Invoke coding graph on selected ticket(s)
}
```

UX principles:
- “One command, full flow”: no ручного copy/paste SDD промптов.
- Always show where stuff is written (`.sdd/project.md`, `.sdd/architect.md`, `.sdd/best_practices.md`, tickets).
- Make it trivial to run another goal in the same repo.

You MAY:
- borrow ideas from CLI UX in your other projects (e.g. Voyant, Navan, CallQuest) but keep the surface small and focused.

## Steps
1. Extend `src/cli.ts` to register `chat` (or similar) subcommand.
2. Implement a minimal prompt/REPL (Node readline or a small lib) to:
   - read the user’s goal,
   - optionally confirm/edit it.
3. Wire `chat` to:
   - call `runSddOrchestration` (Ticket 04),
   - then call the coding graph with the resulting SDD/tickets.
4. Print progress updates to stdout so the user sees which phase is running.
5. Integrate run report output (from existing tickets) to show where to inspect details.

## Affected Files
- `src/cli.ts`
- potentially `bin/kotef` (if additional entrypoint wiring is needed)

## Tests
- Manual: `kotef chat` in a toy repo with and without `.sdd/`, verify full flow.
- Optional: small automated smoke test that runs `kotef chat` non-interactively with a pre-set `--goal` and asserts non-zero exit codes and basic output.

## Risks & Edge Cases
- Overcomplicating the UI; keep it minimal and text-based at first.
- Running long SDD phases without feedback; mitigate with progress logs.

## Non‑Goals / Pitfalls to Avoid
- Do **not** build a full TUI/dashboard in this ticket; keep it a simple CLI chat.
- Do **not** bypass SDDRush templates; all SDD phases must use the template driver from Ticket 03. 

