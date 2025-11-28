# Ticket 10: Add Simple Code Search Tool (search_code)

## Context
The critique document (`.sdd/context/critique.md`) identified "Code Map + embeddings + search_code" as a P0 priority. Currently, kotef has:
- `get_code_context` - ts-morph based symbol lookup (requires knowing the file/symbol)
- `list_files` - directory listing
- `read_file` - read specific file

But there's no way to search for code by keyword/pattern across the codebase.

## Problem
- Planner/Coder can't search for "where is X used?" or "find all files mentioning Y"
- Must guess file names or read many files manually
- Cursor and other tools use semantic search; we need at least basic keyword search

## Solution
Add a `search_code` tool that does simple grep-style search across the codebase.

**Keep it simple (no embeddings):**
- Use ripgrep (`rg`) or Node.js glob + string matching
- Return file paths + line numbers + snippets
- Limit results to avoid context bloat

## Files to Modify
- `src/agent/tools/definitions.ts` - Add tool definition
- `src/agent/tools/handlers.ts` - Add handler
- `src/tools/code_search.ts` - New file with search implementation

## Interface
```typescript
interface SearchCodeArgs {
  query: string;      // Search pattern (literal or regex)
  glob?: string;      // File pattern (default: "**/*.{ts,tsx,js,jsx,py}")
  maxResults?: number; // Limit (default: 20)
}

interface SearchResult {
  file: string;
  line: number;
  snippet: string;
}
```

## DoD
- [ ] `search_code` tool available in coder
- [ ] Returns file, line, snippet for matches
- [ ] Respects maxResults limit
- [ ] `npm run build` passes
- [ ] `npm test` passes

## Appetite
Batch (1-2 hours)

## Risks
- Medium: Could return too many results for common patterns
- Mitigation: Enforce maxResults limit, prefer specific queries
