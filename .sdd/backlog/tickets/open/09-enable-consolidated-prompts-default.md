# Ticket 09: Enable Consolidated Prompts by Default

## Context
Ticket 02 implemented consolidated prompts that reduce SDD bootstrap from 4+ LLM calls to 2. However, `useConsolidatedPrompts` defaults to `false` in config.ts, meaning users don't benefit from this optimization unless they explicitly enable it.

## Problem
- LLM calls are expensive (time + cost)
- The consolidated flow is implemented and tested
- But it's not enabled by default, so users pay the cost of 4+ calls unnecessarily

## Solution
Change the default value of `useConsolidatedPrompts` from `false` to `true` in `src/core/config.ts`.

## Files to Modify
- `src/core/config.ts` - Change default value

## DoD
- [ ] `useConsolidatedPrompts` defaults to `true`
- [ ] `npm run build` passes
- [ ] `npm test` passes

## Appetite
Small (5 minutes)

## Risks
- Low: The consolidated flow was already implemented and tested in Ticket 02
