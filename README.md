# Kotef

Kotef is a durable coding and research agent for real repositories.
It keeps the thread, the backlog, and the receipts in one place, which saves a surprising amount of grief.

## Quick Start

Run `cp .env.example .env && npm install && npm run build`, then start a task with `./bin/kotef run --root /path/to/repo --goal "Add user login with minimal surface area"`.
Resume later with `./bin/kotef resume <thread-id> --root /path/to/repo` when life or approvals intervene.

## How It Works

Kotef runs a supervisor flow: `planner -> researcher -> coder -> verifier -> janitor`.
It stores durable state in `.sdd/runtime/`, uses MCP when local context is not enough, and keeps the repo conversation grounded in files instead of wishful thinking.

## Perks

- Durable runs with checkpoints, resume, and thread IDs.
- MCP-aware context and tool orchestration without turning the repo into folklore.
- SDD backlog hygiene built in, from open tickets to cleanup.

Built by Alex Chernysh — alex@hireex.ai
