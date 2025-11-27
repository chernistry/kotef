Summarize the provided `best_practices.md` file into 200-400 words.

## Content
<content>
{{CONTENT}}
</content>

## Extraction Goals
Prioritize actionable rules that the Coder must follow.
1. **Code Quality**: Standards for style, structure, and readability.
2. **Testing**: Required testing approach and coverage expectations.
3. **Security**: Mandatory security guardrails.
3. **Security**: Mandatory security guardrails.
4. **Performance/Cost**: Any specific constraints on performance or resource usage.
5. **Senior Patterns**: Enforce professional standards:
   - **Structure**: Feature-folder or layered architecture (components, hooks, utils) for non-trivial apps.
   - **Styling**: Use design tokens/CSS variables (e.g., `:root { --primary: ... }`) instead of hardcoded values.
   - **Resilience**: Mandatory Error Boundaries for UI roots.

## Output Format
Provide a concise markdown summary.
<negative_constraints>
- Do NOT include generic advice (e.g., "write good code") unless specifically defined.
</negative_constraints>

