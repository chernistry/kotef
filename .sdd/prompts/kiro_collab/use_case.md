### Scenario 1: The "Rabbit Hole" (Dynamic Steering)
**Situation:** User asks: "Fix the button padding."
**Standard Kiro:** The agent reads `.kiro/steering/product.md` (which says "maintain clean code") and deeply refactors the entire button component library, breaking 5 pages.
**With "Intent Contract":** The agent first generates a temporary contract: `"Appetite": "Small", "Non-Goals": ["Refactoring"]`. The agent sees this constraint and restricts itself to a CSS-only fix.

### Scenario 2: The "Confident Hallucination" (Agentic Research)
**Situation:** User asks: "Add a server action for the new Next.js 15 form."
**Standard Kiro:** The agent uses its training data (mostly Next.js 13/14) and writes code that fails at runtime because the API changed.
**With "Research Agent":** The agent recognizes "Next.js 15" as a new topic. It triggers a **Deep Research Loop** (Search -> Fetch Docs -> Verify Syntax) *before* writing any code. It discovers the breaking change in `useActionState` and writes correct code on the first try.

### Scenario 3: The "Broken Build" (Fail-Closed Hooks)
**Situation:** User asks for a quick refactor of a core utility.
**Standard Kiro:** Agent makes the change. The user runs specific tests manually, or relies on a `Stop` hook that just runs the formatter. The build passes locally but breaks integration tests.
**With "Strict Profile":** The user activates the `Strict` profile via `kiro-cli`. The `Stop` hook is configured to run the *full* test suite. It catches the integration failure, and the agent automatically reverts the change and tries a different approach *before* returning control to the user.
