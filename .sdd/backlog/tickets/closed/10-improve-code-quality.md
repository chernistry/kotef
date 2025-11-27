# Ticket: 10 Improve Code Quality Standards (Structure & Styling)

Spec version: v1.0
Context: `best_practices.md` generation, `coder.md`

## Problem
Analysis of the generated "Pomotimer" project shows "Junior" patterns:
1.  **Flat Structure**: All files in `src/` root (no `components/`, `hooks/`, `utils/`).
2.  **Hardcoded Styles**: CSS colors are hardcoded hex values instead of CSS variables/tokens.
3.  **Missing Error Boundaries**: No React Error Boundary.

## Objective & DoD
Ensure the agent produces "Senior" level code structure and styling by default.

**DoD:**
-   Agent creates `src/components`, `src/hooks`, `src/utils` directories for new React projects.
-   Agent uses CSS variables (custom properties) for theme colors (e.g., `--primary-color`, `--bg-color`).
-   Agent includes an Error Boundary in the root App component.

## Steps
1.  Update `src/agent/prompts/body/sdd_summary_best_practices.md` (or relevant generator):
    -   Add explicit "Senior Patterns" section:
        -   "Use Feature-Folder or Layered architecture (components, hooks, utils)."
        -   "Define design tokens in `:root` and use `var(--token)`."
        -   "Wrap app in ErrorBoundary."
2.  Update `src/agent/prompts/body/coder.md`:
    -   Add instruction: "Refuse to create flat file structures for non-trivial apps. Organize by feature or type."

## Affected Files
-   `src/agent/prompts/body/sdd_summary_best_practices.md`
-   `src/agent/prompts/body/coder.md`

## Risks
-   Over-engineering for tiny scripts. Mitigation: Apply these rules only when `projectType` is "web app" or "react".
