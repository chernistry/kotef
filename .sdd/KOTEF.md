# KOTEF Project Policy

This file defines project-level constraints and policies for the kotef agent.

## Constraints
- DO NOT rewrite entire architecture unless ticket explicitly requires it
- Prefer minimal diffs over large refactors
- Keep existing public APIs stable
- DO NOT add new dependencies without explicit approval in ticket

## Forbidden Paths
- node_modules/**
- dist/**
- .git/**

## Notes
- Tests in test/** may be freely refactored
- Prompts in src/agent/prompts/** should be updated carefully (they are part of the architecture contract)
- SDD files in .sdd/** should only be modified by the agent when explicitly instructed
