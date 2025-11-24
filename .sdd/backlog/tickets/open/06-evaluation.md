# Ticket: 06 Evaluation, Scenarios & CI

Spec version: v1.0  
Context: `.sdd/project.md` (Definition of Done: evaluation harness), `.sdd/best_practices.md` Sections on evaluation/metrics, `.sdd/architect.md` Sections 8–10  
Dependencies: 01–05 (core runtime, SDD driver, orchestrator graph, interactive CLI).

## Objective & DoD
Set up evaluation scenarios and CI integration to ensure agent quality and prevent regressions as kotef evolves.

**Definition of Done:**
- [ ] `test/scenarios/hello-world/` created (sample repo with `.sdd/` and simple coding task).
- [ ] At least one additional scenario created for a repo **without** `.sdd/` where kotef must bootstrap SDD from a natural-language goal.
- [ ] E2E test script implemented: runs kotef on both scenarios and asserts:
  - [ ] agent reads or bootstraps `.sdd` correctly,
  - [ ] agent proposes at least one diff,
  - [ ] agent runs tests (even if they are trivial) and reports status.
- [ ] GitHub Actions workflow (`.github/workflows/ci.yml`) configured to run lint, unit tests, and E2E tests on push/PR.
- [ ] Basic metrics (runtime, token usage if available, success/failure) are logged for each scenario.

## Implementation Sketch

```ts
// test/e2e_hello_world.test.ts (Node test runner)
import test from 'node:test';
import assert from 'node:assert';

test('kotef solves hello-world ticket', async () => {
  // 1) copy scenario to temp dir
  // 2) run `kotef run --ticket 01-hello-world` via child_process
  // 3) assert expected file changes and exit code
});
```

Scenario repo should be minimal (e.g. `hello-world` TS project with `.sdd/` and a simple ticket such as “implement add(a,b)”).

## Steps
1. Create a dummy project under `test/scenarios/hello-world/`:
   - minimal `package.json`, `tsconfig.json`, `src/index.ts`, `test/index.test.ts`;
   - a `.sdd/` with `project.md`, `architect.md`, and one ticket.
2. Write `test/e2e_hello_world.test.ts` using Node’s `node:test`:
   - copy the dummy project to a temporary directory;
   - run `kotef run --ticket <id>` via `child_process.spawn`;
   - verify exit code and that at least one source file and/or test file was modified as expected.
3. Add a second scenario (e.g. `test/scenarios/hello-world-nosdd/`) with a similar tiny TS project **without any `.sdd/` directory** and a simple natural-language goal stored in a fixture. Extend the E2E test to:
   - run `kotef run --root <nosdd-path> --goal "<goal>"`,
   - assert that `.sdd/` is created and that the agent proposes at least one diff.
4. Add a `npm run test:e2e` script to `package.json` that runs this E2E test file.
5. Create `.github/workflows/ci.yml`:
   - install dependencies;
   - run `npm run lint`, `npm test`, and `npm run test:e2e`.
5. Optionally (stretch): capture simple metrics (duration, exit code, whether tests passed) and log them in a machine-readable format (JSON) for future dashboards.

## Affected Files
- `test/scenarios/hello-world/**`
- `test/e2e_hello_world.test.ts`
- `.github/workflows/ci.yml`
- `package.json` (scripts)

## Tests
```bash
npm run test:e2e
```

## Risks & Edge Cases
- Flaky E2E test due to network or LLM variability (mitigate using a cheap mock model or fixed seed for CI).
- Overly complex scenario that hides real regressions behind noisy failures – keep the initial scenario simple and deterministic. 

## Non‑Goals / Pitfalls to Avoid
- Do **not** hit real external LLM/search APIs in CI by default; introduce a mock or “offline” mode (e.g. env flag) so E2E tests remain cheap and stable.
- Do **not** overfit scenarios to a single project layout; keep the hello‑world repo minimal but representative of common patterns (SDD + small TS app).
- Do **not** assert on fragile details like exact wording of agent output; focus on structural checks (exit code, files changed, tests run) to avoid brittle tests.
