# Coding Task

## Goal
{{GOAL}}

## Architecture Context
{{ARCHITECT}}

## Best Practices
{{BEST_PRACTICES}}

## Current State
{{PROJECT_SUMMARY}}

## Constraints
- Use diff-first approach when modifying files
- Preserve existing architecture and patterns
- Write clean, maintainable code
- Add tests if appropriate

### CRITICAL: Command Execution Rules
- **NEVER** run blocking/long-running commands directly (npm run dev, npm start, servers, watchers)
- **ALWAYS** use timeout for any command that might not exit: `timeout 5s <command>` or `<command> & sleep 2 && kill $!`
- For dev servers: Test with `timeout 3s npm run dev` to verify they start, then kill
- For build verification: `npm run build` is OK (finishes quickly)
- For tests: `npm test` is OK (finishes quickly)
- If you need to verify a server starts, use: `timeout 5s npm run dev 2>&1 | head -20` to see startup logs
- Background processes will cause the session to hang forever - avoid at all costs!

## Instructions
Implement the requested changes following the architecture and best practices above.
Make all necessary file modifications to complete the task.
Verify builds/tests work, but DO NOT start dev servers without timeout.
