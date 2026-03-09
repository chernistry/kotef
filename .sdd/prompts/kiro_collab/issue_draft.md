**Problem Statement**
Kiro has excellent foundational primitives: **Steering** (`.kiro/steering/`) sets global project context, and **Hooks** provide powerful runtime control.

However, based on my collaborative agent experiments ("Kotef"), I've found that global steering isn't enough to prevent "agent drift" during specific tasks. Agents often:
1.  Suffering from **Task Creep**: Steering says "Prefer small changes", but the agent decides *this specific ticket* requires a total refactor.
2.  Getting stuck in **Verification Loops**: Spending hours debugging a minor CSS fix because they are treating it with the same rigor as a core API change.
3.  **Confident Hallucination**: Using "remembered" patterns instead of looking up the latest documentation for a specific library version.

**Proposed Solution: Patterns on top of Kiro Primitives**
I propose standardizing three "Agent Design Patterns" that leverage Kiro's existing architecture to solve these problems:

1.  **Intent Contract (Dynamic Steering)**
    *   *Concept:* Instead of just static `.kiro/steering/product.md`, the agent generates a temporary, task-specific **Intent Contract** (JSON) at the start of a session.
    *   *Implementation:* A custom agent that defines `Non-Goals` (e.g., "Do not touch `src/legacy`") and `Appetite` (e.g., "Small - max 5 tool calls") for *just this run*.
    *   *Kiro Fit:* This acts as a "Session Steering" layer.

2.  **Execution Profiles (Hook Configurations)**
    *   *Concept:* A standard library of **Hooks** (`Stop`, `PreToolUse`) that toggle verification rigor based on the task.
    *   *Implementation:*
        *   `Strict Profile`: Enforces `git` checkpoints on green tests (Fail-Closed).
        *   `Fast Profile`: Runs standard linting but allows minor failures.
        *   `Yolo Profile`: Minimal checks for prototyping.
    *   *Kiro Fit:* Pre-packaged `post_tool` and `stop` hook configurations that users can swap via CLI settings.

3.  **Autonomous Research (Agentic Loop)**
    *   *Concept:* A "Look before you leap" workflow that uses Kiro's `search` and `fetch` tools *before* attempting code.
    *   *Implementation:* An agent loop that scores research quality (Relevance, Recency) and refines queries until it has a solid plan, preventing hallucination.
    *   *Kiro Fit:* A specialized "Research Agent" or `thinking` model prompt strategy.

**Evidence / Links**
I have implemented these patterns in a standalone LangGraph agent ("Kotef") and verified their impact.

*   **Intent Contract Logic:** [intent_contract.ts](https://github.com/sasha/kotef/blob/main/src/agent/utils/intent_contract.ts)
*   **Execution Profiles:** [profiles.ts](https://github.com/sasha/kotef/blob/main/src/agent/profiles.ts)
*   **Research Node:** [researcher.ts](https://github.com/sasha/kotef/blob/main/src/agent/nodes/researcher.ts)

**What I'm willing to contribute**
*   Porting the "Intent Contract" logic into a Kiro Custom Agent template.
*   Sharing the "Deep Research" prompt patterns for Kiro's `thinking` models.
*   Documenting "Execution Profiles" as a best practice for Kiro Hooks.
