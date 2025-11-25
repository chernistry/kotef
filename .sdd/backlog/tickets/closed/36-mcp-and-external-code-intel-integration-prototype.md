# Ticket: 36 MCP & external code-intel integration prototype

Spec version: v1.0  
Context: `.sdd/architect.md` (Search & Deep Research Layer; Tools Layer), `.sdd/best_practices.md` (security, allowlists), `.sdd/context/arch_refactor.md` (Sections 3, 4.1, 4.5, 5).

## Context
- Kotef currently runs all code understanding and diagnostics locally:
  - FS tools, test runner, planned LSP integration.
- Model Context Protocol (MCP) and external “code-intel” servers (e.g. Serena MCP) are emerging as a standard way to:
  - centralise code indexing, diagnostics, and patching,
  - provide a consistent set of tools shared across agents (Cursor, Claude Code, etc.).
- `arch_refactor.md` suggests:
  - experimenting with an MCP client for code-intel, not replacing our core graph,
  - using it for high-value features like structural diffs, semantic search, and advanced diagnostics.

## Objective & Definition of Done

Add an **experimental MCP integration path** for code-intel that:
- Lets Kotef talk to one or more MCP servers (e.g. a local Serena instance) through a small client.
- Exposes a minimal set of MCP-backed tools to the agent, behind config flags.
- Maintains our existing safety/allowlist rules and does not leak secrets or uncontrolled file access.

DoD:
- A basic MCP client utility capable of:
  - establishing a connection to a configured MCP server (e.g. via `modelcontextprotocol/typescript-sdk`),
  - calling a small set of code-intel tools (e.g. `get_code_context`, `apply_structured_edit`),
  - handling failures and timeouts gracefully.
- At least one optional MCP-backed tool wired into Coder (or Researcher), guarded by config/flags.

## Steps
1. **Define integration boundary**
   - Decide which MCP tools are most valuable for a first prototype:
     - e.g. `readFile`, `listDirectory`, `searchCode`, `applyPatch`, `getDiagnostics`.
   - Ensure they do not overlap dangerously with our own FS tools (we may start with read-only/intel-only tools).

2. **Implement MCP client module**
   - Add `src/tools/mcp_client.ts` using `modelcontextprotocol/typescript-sdk` (or a minimal client) that:
     - can create a client connection based on config (host, auth, tool allowlist),
     - wraps tool calls with timeouts and error handling.

3. **Wire MCP tools into agent**
   - Add one or more new tools to Coder or Researcher, e.g.:
     - `mcp_get_code_context(query)` → uses `searchCode`/`getContext` from the MCP server.
   - Update prompts to mention these tools only when enabled (keep default behaviour unchanged).

4. **Security & configuration**
   - Add config fields in `KotefConfig` and `.sdd/architect.md`:
     - `mcpEnabled`, `mcpServerUrl`, `mcpToolAllowlist`, `mcpTimeoutMs`.
   - Enforce host allowlists and redact sensitive data in logs.

5. **Tests & sandboxing**
   - Add tests under `test/tools/mcp_client.test.ts` that:
     - mock or stub MCP interactions,
     - verify that timeouts, errors, and tool results are handled correctly.
   - Optionally add a scenario that runs against a local MCP dev server in CI (behind a flag).

## Affected files/modules
- `src/tools/mcp_client.ts` (new).
- `src/core/config.ts` / CLI flags for MCP.
- `src/agent/nodes/coder.ts` and/or `src/agent/nodes/researcher.ts` (tool wiring).
- `src/agent/prompts/*` (when documenting MCP-backed tools).
- Tests under `test/tools/*` and `test/agent/*`.

## Tests
- `npm test -- test/tools/mcp_client.test.ts`
- Optional: a tagged integration test that talks to a local MCP server (document how to run it).

## Risks & Edge Cases
- **Security**:
  - Misconfigured MCP servers could expose more of the filesystem than intended; mitigate with strict allowlists and config, and keep default off.
- **Complexity**:
  - Adding another layer of tools increases surface area; keep the initial integration minimal and opt-in.

## Dependencies
- Depends on: stable FS and patching layer (Tickets 26, 35).
- Upstream for: future tickets that offload more code-intel work to MCP servers, and for IDE integrations that want a single code-intel backend.

