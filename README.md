# kotef

Kotef is a durable coding and research agent for spec-driven delivery.

It is built for real repository work, not one-shot demos: `OpenAI Responses` by default, `LangGraph` checkpoints and resume, `MCP` for tools/resources/prompts, and an SDD loop that keeps specs, tickets, verification, and cleanup in sync.

## Why Kotef

- Runs as a supervisor graph: `planner -> researcher -> coder -> verifier -> janitor`
- Survives long tasks with resumable checkpoints and thread IDs
- Uses MCP as a context layer, not just a tool bridge
- Maintains canonical backlog state in `.sdd/backlog/open` and `.sdd/backlog/closed`
- Ships with evals, prompt contracts, and ticket lifecycle tests

## Quick Start

Requirements:

- Node `>=24`
- an LLM API key via `OPENAI_API_KEY` or `CHAT_LLM_API_KEY`
- optional web research key via `TAVILY_API_KEY`

```bash
cp .env.example .env
npm install
npm run build

./bin/kotef run \
  --root /path/to/repo \
  --goal "Add user login with minimal surface area"
```

## Core Commands

```bash
# run a durable agent thread
./bin/kotef run --root /path/to/repo --thread auth-login

# resume after an interrupt or approval gate
./bin/kotef resume auth-login --root /path/to/repo

# inspect checkpoints, state, and runtime events
./bin/kotef inspect run auth-login --root /path/to/repo

# inspect MCP connectivity and capabilities
./bin/kotef mcp doctor --root /path/to/repo

# migrate old SDD backlog layout into the 2026 canonical layout
./bin/kotef migrate sdd --root /path/to/repo

# run the eval harness
./bin/kotef eval --root /path/to/repo
```

## What It Maintains

```text
.sdd/
  project.md
  architect.md
  best_practices.md
  backlog/
    open/
    closed/
  context/mcp/
  runtime/
    kotef.sqlite
    events/
    memory/
```

Each run writes durable graph state into `.sdd/runtime/kotef.sqlite`, JSONL events into `.sdd/runtime/events/`, and memory artifacts into `.sdd/runtime/memory/`.

## Runtime Defaults

- `KOTEF_MODEL_RUNTIME=responses`
- `KOTEF_REASONING_EFFORT=medium`
- `KOTEF_STRUCTURED_OUTPUTS=true`
- `KOTEF_MCP_MODE=off|tools|context|full`
- `KOTEF_MCP_APPROVAL=auto|human-gate`

Legacy layers still exist as fallback, but the primary path is the new runtime.

## Development

```bash
npm run build
npm test
```

License: Apache-2.0.
