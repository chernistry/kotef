# Ticket: 05 CLI Entrypoint & Run Reports

Spec version: v1.0  
Context: `.sdd/project.md` (Core, Definition of Done: CLI/API), `.sdd/architect.md` Sections 5, 6.4, 7 (CLI, Observability)  
Dependencies: 01-scaffold-core, 02-tools-fs, 03-tools-search, 04-agent-graph.

## Objective & DoD
Create the CLI entry point to run the agent from the command line, wire it to the LangGraph graph, and generate human-readable run reports.

**Definition of Done:**
- [ ] `bin/kotef` executable created and wired in `package.json` (`"bin"` field).
- [ ] `src/cli.ts` parses arguments (`run <ticket-id>`, `init`, optional flags like `--root`, `--dry-run`, `--max-time`, `--max-tokens`).
- [ ] CLI initializes `KotefConfig`, including performance & cost guardrails (`maxRunSeconds`, `maxTokensPerRun`, `maxWebRequestsPerRun`), loads SDD files for the target repo, and starts the LangGraph runner (`buildKotefGraph`).
- [ ] Output is streamed to stdout via `logger` and a run report is written to `.sdd/runs/YYYY-MM-DD_HH-MM-SS_<runId>.md`.
- [ ] If a run hits time/token budgets, the agent stops gracefully and records partial progress and reason in the run report.
- [ ] Errors exit with non-zero status and a short diagnostic.

## Implementation Sketch

```ts
// src/cli.ts
#!/usr/bin/env node
import { loadConfig } from './core/config';
import { createLogger } from './core/logger';
import { buildKotefGraph } from './agent/graph';

export async function main(argv = process.argv): Promise<void> {
  const cfg = loadConfig(process.env, argv);
  const log = createLogger(/* runId */);
  // parse args; load SDD files into SddContext; invoke LangGraph runner.
}
```

```ts
// src/agent/run_report.ts
export async function writeRunReport(
  sddRoot: string,
  runId: string,
  summary: { plan: string; filesChanged: string[]; tests: string; issues?: string },
): Promise<void> {
  // create .sdd/runs if needed; write markdown file.
}
```

`bin/kotef` should be a small JS/TS shim that calls `main()` and forwards exit codes.

## Steps
1. Add `"bin": { "kotef": "dist/bin/kotef.js" }` (or equivalent) to `package.json`.
2. Implement `src/cli.ts`:
   - use `commander`/`yargs` or a minimal parser to support:
     - `kotef run --ticket <id> [--root <path>] [--dry-run] [--max-time <sec>] [--max-tokens <n>]`
     - `kotef init` (scaffold `.sdd` if not present; can be a stub for now).
   - resolve `rootDir` and SDD paths from args + `KotefConfig`.
   - load `.sdd/project.md`, `.sdd/architect.md`, `.sdd/best_practices.md`, and the chosen ticket Markdown.
3. Integrate with LangGraph:
   - create a `buildKotefGraph(cfg)` instance (Ticket 04);
   - run the graph with an initial `AgentState` seeded from SDD and user intent.
4. Implement `writeRunReport` utility and call it at the end of a successful or failed run:
   - include plan outline, key decisions, list of touched files, and test summary.
5. Create `bin/kotef` that:
   - resolves to the built JS file in `dist`;
   - calls `main()` and exits with appropriate status.

## Affected Files
- `src/cli.ts`
- `src/agent/run_report.ts`
- `bin/kotef`
- `package.json`

## Tests
- Manual: `npm link && kotef --help`.
- Add a small integration test (optional in this ticket, or in 06-evaluation) that runs `node dist/bin/kotef.js --help` and asserts exit code 0.

## Risks & Edge Cases
- Running kotef in a repo without `.sdd/` (should fail with a clear, actionable message or offer `init`).
- Run report directory not writable or missing (should fail gracefully but not corrupt user repo).

## Non‑Goals / Pitfalls to Avoid
- Do **not** assume `process.cwd()` is always the project root; respect the `--root` flag and `KotefConfig.rootDir` consistently.
- Do **not** let CLI flags silently conflict with environment variables; define a clear precedence (e.g. CLI > env > defaults) and document it in help text.
- Do **not** start background daemons or long-lived processes in this ticket; the focus is a single-run CLI with clear start/finish semantics.*** End Patch ***!
