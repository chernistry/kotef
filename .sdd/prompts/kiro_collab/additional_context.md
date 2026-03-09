### Technical Implementation: Mapping to Kiro Primitives
These patterns, currently running in Kotef (a LangGraph agent), map directly to Kiro's CLI architecture:

1.  **Intent Contract → Dynamic Steering**
    *   **In Kotef:** The `Planner` node generates an `intent.json` file. Every subsequent tool call is checked against `intent.json`'s constraints.
    *   **In Kiro:** This could be implemented as a **Custom Agent** that uses a `AgentSpawn` hook to generate a temporary `.kiro/steering/session_intent.md` file. A `PreToolUse` hook could then grep this file to block forbidden actions (e.g., preventing edits to protected directories).

2.  **Execution Profiles → Reusable Hook Configurations**
    *   **In Kotef:** A `verifier.ts` node selects a profile (`Strict`/`Fast`) based on `architect.md` signals.
    *   **In Kiro:** This allows for "Agent Modes". Users could switch between profiles using `kiro-cli settings`:
        *   **Strict:** `Stop` hook runs `npm test` and aborts the turn if it fails.
        *   **Fast:** `Stop` hook runs only `npm run lint`.
        *   This turns "Hooks" from a low-level API into a user-facing "Safety Level" toggle.

3.  **Autonomous Research → "Researcher" Agent**
    *   **In Kotef:** A bespoke loop (`deep_research.ts`) that chains `web_search` and `fetch_page` until a quality score is met.
    *   **In Kiro:** A dedicated **Custom Agent** (`kiro-cli agent create research`) configured with `search` and `fetch` tools and a specialized "Deep Research" prompt. This agent can be called by the user to "prep" a workspace before the main coding agent takes over.
