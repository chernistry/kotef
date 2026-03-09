# Collaboration Proposal: Kotef -> Kiro (spec-driven agents)

## Goal
You are an expert engineer + DevRel writer. Analyze my local repo "kotef" and the public Kiro ecosystem, then produce:
1) A recommended outreach channel (GitHub issue vs Discord vs other) with a short rationale
2) A ready-to-send collaboration pitch (<= 500 words) tailored to how Kiro frames its product
3) A supporting evidence matrix mapping Kotef features -> Kiro equivalents -> concrete collaboration value
4) 2-3 concrete "first contributions" that are realistic given what's public/open in Kiro today

## Why this matters
I already work in an AI role, but it's fairly trivial. I want to build credibility through an open, high-signal collaboration with Kiro (and ideally become a strong candidate for similar teams later). The outreach must be respectful, low-noise, and grounded in evidence.

## Inputs (local)
- Kotef: `/Users/sasha/IdeaProjects/personal_projects/kotef`
- Kiro clone: `/Users/sasha/IdeaProjects/cloned/Kiro`

### Kiro reality check (important)
Kiro's main public repo is mostly docs + issue templates. Do NOT assume access to Kiro's internal code. Base any "Kiro has X" claims only on what is public (docs/README/issues).

## Public Kiro references (use if you have web access; otherwise rely on the local Kiro clone)
- Kiro main repo (docs/issues): https://github.com/kirodotdev/Kiro
- Kiro website + product framing: https://kiro.dev/
- "Introducing Kiro" blog post (vision + community pointers): https://kiro.dev/blog/introducing-kiro/
- AWS documentation overview (specs/hooks/steering/security): https://aws.amazon.com/documentation-overview/kiro/
- Powers concept + how to build/share a Power: https://kiro.dev/docs/powers/create/
- Kiro "powers" repository (actual shareable artifacts): https://github.com/kirodotdev/powers

## Communication channels (decide what's best)
- Primary: open a GitHub issue using the repo's feature request template if the pitch is product/idea/collaboration.
- Secondary: Discord/social mentions if the blog/docs explicitly point there.
- Explicitly DO NOT use opensource-codeofconduct@amazon.com for this pitch; that address is for Code of Conduct reports, not product feedback. If you recommend any email outreach, it must be an explicitly documented "contact us" / team channel for Kiro (and you must cite where it came from).

Deliverable #1 must include: "Best channel" + "Backup channel" + "1-line opener per channel".

---

# Phase 1: Kotef discovery (evidence-driven)
Scan Kotef and extract ONLY what is actually implemented. For each item, capture:
- What it does (1 sentence)
- Where it lives (file paths; if a public GitHub URL exists, include permalinks; if not, include paths and note "repo currently private")
- Why it matters (1 sentence)

Start by looking for these (but don't assume they exist unless you verify):
- `.sdd/` system (project.md, architect.md, best_practices.md, tickets)
- LangGraph-style agent graph (planner -> researcher -> coder -> verifier -> ticket_closer)
- "Intent Contract" (goal/constraints/DoD/forbidden paths)
- Research mode with quality scoring + citations
- Project memory (cross-run learning)
- Execution profiles (strict/fast/smoke/yolo or equivalent)
- Verification loop (syntax/type/semantic sanity checks)
- Run reports (DORA-proxy or similar)

Also note: language/runtime (TS/Node/Python), dependency choices, eval harnesses, and any "safety/guardrails" patterns.

---

# Phase 2: Kiro discovery (public-surface only)
From the public sources above, summarize Kiro's public primitives in a compact list:
- Specs (requirements/design/tasks style artifacts)
- Agent hooks (event-driven triggers on file save, task completion, etc.)
- Steering files (persistent project rules via markdown)
- MCP servers (external tool integrations)
- Powers (packaged workflows: POWER.md + optional steering/ + optional mcp.json)

Also capture Kiro's positioning phrases and product goals so the pitch speaks their language (e.g., "prototype -> production", "spec-driven development", "automation via hooks", "your code, your rules").

---

# Phase 3: Gap analysis + collaboration map
Create a table for each Kotef capability:
- Kiro equivalent? (Yes / Partial / No / Unknown-publicly)
- If Partial/No: what is the unique value proposition in one crisp sentence?
- Suggested integration surface in Kiro terms (specs vs steering vs hooks vs powers vs MCP)
- Effort estimate (Low/Med/High) and risk notes
- What "first PR" could look like (if relevant)

---

# Phase 4: Outreach strategy + message drafting
## 4A) Choose outreach channel
Decide the best channel based on:
- Is it an idea/feature request? -> likely GitHub issue
- Is it a shareable artifact (like a Power) that can be PR'd? -> likely PR to kirodotdev/powers + an issue linking to it
- Is it early relationship-building? -> Discord short message + link to the issue/PR

Output a short recommendation and include "why this is not a Code of Conduct email".

## 4B) Produce the message (<= 500 words)
Write a professional, friendly, engineer-to-engineer message that includes:
1. Intro (2-3 sentences): who I am, what I built, why I'm reaching out
2. 3-5 feature highlights framed specifically as additions to Kiro's public primitives (specs/hooks/steering/powers/MCP)
3. Optional technical details (very short): architecture / files / patterns
4. Call to action: propose one concrete next step (15-min chat, review a PR, point me to the right channel)

Hard rules:
- No hype. No "revolutionary". No claims about Kiro internals.
- No fabricated features on either side.
- Every highlighted Kotef feature must have a file-path evidence pointer.
- If Kotef isn't public, acknowledge and offer a minimal repro/demo or a redacted snippet.
- Keep it skimmable (short paragraphs + bullets).

## 4C) Produce a companion "public GitHub issue" version
Same content but formatted as a GitHub issue:
- Title (<= 80 chars)
- Problem statement
- Proposed solution
- Evidence / links
- What I'm willing to contribute

---

# Output format
Return:

## Channel Recommendation
- Best channel:
- Backup channel:
- 1-line opener per channel:

## Message Draft (Email/DM/Discord)
[<= 500 words]

## GitHub Issue Draft
[issue template style]

## Supporting Evidence
| Feature | Kotef evidence (paths/links) | Kiro equivalent (public) | Proposed integration surface | Value proposition |
|---|---|---|---|---|
| ... | ... | ... | ... | ... |
