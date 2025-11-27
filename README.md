# kotef — AI developer that actually gets things done

_heb. 'kotef' (קוטף) — 'one who picks/harvests' (wordplay with 'katef' כתף — 'a shoulder to support you')_

> "Give me a repo and a goal. I'll figure out the rest. And document everything."

![kotef in action](assets/screenshot.png)

**Tired of AI assistants that hallucinate APIs and break your code?** kotef is different. It's a LangGraph-powered coding agent that's **obsessively methodical** about:

- 📋 **Reading real specs** (not guessing what you want)
- 🔍 **Fresh research** (not cargo-culting 2019 blog posts)
- 🛡️ **Safe, validated changes** (not breaking your entire codebase)

Built on battle-tested foundations:
- [synapse](https://chernistry.github.io/synapse/) — adaptive governance for AI agents
- [sddrush](https://github.com/chernistry/sddrush) — spec-driven dev toolkit

**Result:** An AI developer that codes like a senior engineer, documents like a tech lead, and learns from every mistake.

---

## TL;DR

One-shot run (brain + tools in one go):

```bash
node bin/kotef run \
  --root /path/to/repo \
  --goal "Create a Python GUI with a Close button" \
  --profile fast
```

Interactive (tickets + progress in a small TUI-style UI):

```bash
node bin/kotef chat --root /path/to/repo
```

---

## Why kotef > other AI coders

**🤖 Other AI assistants:**
- "Here's some code I hallucinated based on your vague description"
- Break your existing code because they don't read the docs
- Use outdated Stack Overflow answers from 2018
- Leave you with a mess of uncommitted changes

**🚀 Kotef:**
- **Reads your actual codebase** and creates a proper project spec
- **Does fresh web research** with quality scoring (not stale bs)
- **Works in small, safe steps** with real validation
- **Auto-commits per feature** so you get clean git history
- **Learns from mistakes** and gets better over time

**Bottom line:** Kotef codes like a senior dev who's actually paid attention in standups.

---

## What it actually does (brain vs body)

- **Brain (project understanding).**
  - If there's no `.sdd/` folder yet, kotef creates a tiny spec brain for your repo: `project.md`, `architect.md`, `best_practices.md` and an initial ticket backlog.
  - That folder becomes the source of truth for goals, constraints, and coding standards — updated via tickets, not vibes.
  - The agent always goes back to this "brain" when deciding what to do next.
- **Body (tools that touch the repo).**
  - Main flow: `planner → researcher → coder → verifier → snitch/ticket_closer`, with budgets and execution profiles.
  - It **thinks before it pokes the repo**: planner decides, researcher fetches fresh context, only then coder touches files.
  - Researcher does web search + deep research with quality scoring, so the agent works off up-to-date docs instead of cargo-culting stale answers.
  - Verifier runs sanity checks so changes aren't just "looks good to me", and Snitch files issues instead of silently looping when something is off.

---

## Perfect for

**Solo developers** who want to ship features without context-switching between 12 browser tabs

**Tech leads** who need to delegate implementation while maintaining code quality

**Agile teams** that want AI to handle tickets like a junior dev (but smarter)

**Open source maintainers** who need help with contributions without the hand-holding

**Indie hackers** building MVPs faster than competitors

**Basically anyone** tired of AI assistants that:
- Guess wrong and break everything
- Use deprecated libraries
- Leave you to clean up their mess
- Cost you hours of debugging

Kotef gives you confidence that **the code will work** and **your repo stays clean**.

### Under the hood

- Node.js 20 + TypeScript + LangGraph, strongly-typed `AgentState`
- **Deep web research** with quality scoring, source diversity tracking, and raw context preservation (`.sdd/context/`)
- **LSP diagnostics** for TypeScript/JS — real-time error detection, not just "tests pass"
- **Functional probes** — "does `npm run dev` actually start?" matters more than lint warnings
- **Circuit breakers** — per-edge loop limits (`planner→researcher`, `planner→coder`, etc.) with automatic abort when stuck
- **Git integration** — auto-commit after each successful ticket, automatic ticket lifecycle (open → closed)
- **Execution profiles** (`strict`/`fast`/`smoke`/`yolo`) — trade off thoroughness vs speed
- Experimental MCP support for external code-intel servers

## Real-world examples

**"Add dark mode toggle to my React app"**
```
Input: Existing Next.js project
Output: Complete feature with proper state management, CSS variables,
        accessibility attributes, and TypeScript types.
        Plus: Documentation of design decisions in .sdd/architecture/adr/
```

**"Create a Python CLI tool for log analysis"**
```
Input: Empty repo with just a README
Output: Full CLI app with argparse, proper error handling,
        unit tests, and setup.py. Research done on latest Python CLI best practices.
```

**"Implement user authentication in my Node.js API"**
```
Input: Express server with basic routes
Output: JWT auth middleware, password hashing, input validation,
        database schema, API docs. Fresh research on security best practices.
```

**Every time:** Clean git commits, updated documentation, and lessons learned for next time.

---

## Try it now

**5 minutes to first working code:**

```bash
# 1. Get API key (OpenAI or compatible)
echo "KOTEF_API_KEY=sk-your-key-here" > .env

# 2. Install & build
npm install && npm run build

# 3. Run on any project
node bin/kotef run --root /path/to/your/repo --goal "Add user login feature"
```

**What happens:**
1. kotef analyzes your codebase
2. Creates `.sdd/` project documentation
3. Breaks goal into manageable tickets
4. Researches current best practices
5. Implements, tests, and commits each feature
6. Updates documentation for future changes

**⚠️ Not magic:** Still needs good prompts and you should review changes. But it eliminates 80% of the boring coding work.

Full technical docs (CLI flags, env, architecture, profiles, safety) live in `docs/KB.md` 📚

---

## Help make kotef even better

**We're building the future of AI-assisted development.** Your contributions matter!

**High-impact areas:**
- 🔍 **Smarter research** — better quality scoring, more sources
- 🧠 **Common sense planning** — fewer stupid loops, better task breakdown
- 🛡️ **Bulletproof verification** — catch more bugs before they hit main
- 🌐 **More language support** — Python, Go, Rust, not just TypeScript
- ⚡ **Performance** — faster research, smarter caching

**How to contribute:**
- Found a bug? Open an issue (bonus points for `.sdd/` reproduction cases)
- Have an idea? Start a discussion
- Want to code? Check `.sdd/backlog/tickets/` for current priorities
- Stress test it on your real projects and share results

**Even better:** "Hey, I tried X and it didn't work, but Y approach would be awesome"

See `CONTRIBUTING.md` for details. Every contribution makes AI development more reliable. 🚀

---

## License

Apache 2.0 — see [LICENSE](./LICENSE). Use it, fork it, ship it inside your own pipelines; just don't imply any kind of "official" endorsement.
