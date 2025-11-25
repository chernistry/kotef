# Ticket: 36 MCP Code-Tools Pilot Integration

Spec version: v1.3  
Context: `.sdd/architect.md` (Tools & Extensibility), `.sdd/context/arch_refactor.md` (sections 3, 4.1–4.5, 6.7–6.9), Model Context Protocol docs, existing tools in `src/tools/*`.  
Dependencies: 19, 20, 30, 31, 33, 34.

## Objective & Definition of Done

Explore a **lightweight, incremental integration with Model Context Protocol (MCP)** for code‑related tools, to:

- make it easier to plug Kotef into MCP‑aware frontends (Cursor, Claude Code, Gemini CLI, etc.),
- reuse best‑of‑breed MCP servers (e.g. Serena) for complex code understanding tasks instead of re‑implementing everything,
- keep the core LangGraph architecture intact while exposing a thin MCP layer.

### Definition of Done

- [ ] A small design doc (in `.sdd/` or `docs/`) describes:
  - [ ] which existing tools are good candidates for MCP exposure (FS, search, code context),
  - [ ] which external MCP servers (if any) will be consumed (e.g. Serena code server).
- [ ] An initial MCP TypeScript SDK integration exists:
  - [ ] uses `modelcontextprotocol/typescript-sdk` with a minimal client,
  - [ ] can call at least one external MCP server in a safe, sandboxed way.
- [ ] At least one internal tool is wrapped with an MCP‑compatible interface (e.g. `read_file`, `write_file`, `get_code_context`), but:
  - [ ] core LangGraph nodes continue to work without MCP (MCP is additive, not required).
- [ ] Security constraints from `.sdd/architect.md` are preserved:
  - [ ] no expansion of filesystem or network access beyond what Kotef already allows,
  - [ ] clear allowlist of MCP servers/domains.

## Steps

1. **MCP landscape review (short)**
   - [ ] Summarize relevant parts of MCP docs with focus on:
     - [ ] tool schema,
     - [ ] request/response flow,
     - [ ] security considerations.

2. **Select pilot scope**
   - [ ] Choose a minimal subset of functionality for MCP exposure, e.g.:
     - `read_file` (safe, path‑validated),
     - `get_code_context` (from Ticket 33),
     - optionally a search tool.
   - [ ] Decide whether to:
     - [ ] expose Kotef as an MCP server, or
     - [ ] consume an external MCP server (e.g. Serena) from within Kotef.

3. **Implement MCP client/server wrapper**
   - [ ] Add a small MCP client or server module under `src/mcp/` using `modelcontextprotocol/typescript-sdk`.
   - [ ] Ensure configuration (URLs, tokens) comes from `KotefConfig` / env vars, not hard‑coded.

4. **Wire into tools layer**
   - [ ] For the chosen pilot tool(s):
     - [ ] add a code path that goes through MCP when enabled (`enableMcpIntegration` flag),
     - [ ] keep existing local implementation as the default.

5. **Observability & safety**
   - [ ] Log MCP calls with:
     - [ ] tool name,
     - [ ] duration,
     - [ ] truncated inputs/outputs (no secrets).
   - [ ] Add configuration/docs for:
     - [ ] allowed MCP endpoints,
     - [ ] timeouts and retries.

6. **Tests**
   - [ ] Add `test/mcp/mcp_integration.test.ts`:
     - [ ] mocks MCP server responses,
     - [ ] asserts that tools fall back gracefully when MCP is unavailable.

## Affected files/modules

- `.sdd/architect.md` (extensibility / tools section)
- `.sdd/best_practices.md` (security & external integrations)
- `src/core/config.ts` (MCP config flags)
- `src/mcp/*` (new)
- `src/tools/*` (selected tools with MCP path)
- `test/mcp/mcp_integration.test.ts` (new)

## Tests

- `npm test -- test/mcp/mcp_integration.test.ts`

## Risks & Edge Cases

- Over‑tight coupling to specific MCP servers; mitigate by:
  - keeping integration thin and optional,
  - avoiding server‑specific assumptions in core logic.
- Additional network surface; must respect existing allowlists and security posture.

## Dependencies

- Upstream:
  - 19‑performance‑and‑tool‑efficiency‑optimizations
  - 20‑repo‑understanding‑and‑context‑loading
  - 30‑command‑runner‑and‑package‑manager‑detection
  - 31‑diagnostics‑log‑and‑error‑aware‑planning
  - 33‑code‑context‑retrieval‑and‑file‑read‑caching
  - 34‑hybrid‑patch‑pipeline‑and‑ast‑fallback

