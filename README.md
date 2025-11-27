<div align="center">

# kotef — AI developer that actually gets things done

_heb. 'kotef' (קוטף) — 'one who picks/harvests' (wordplay with 'katef' כתף — 'a shoulder to support you')_

> "Give me a repo and a goal. I'll figure out the rest. And document everything."

![kotef in action](assets/screenshot.png)

</div>

**Tired of AI assistants that hallucinate APIs and break your code?** kotef is different. It's a LangGraph-powered coding agent that's **obsessively methodical** about:

<table>
<tr>
<td>📋</td>
<td><strong>Reading real specs</strong><br/><sub>not guessing what you want</sub></td>
</tr>
<tr>
<td>🔍</td>
<td><strong>Fresh research</strong><br/><sub>not cargo-culting 2019 blog posts</sub></td>
</tr>
<tr>
<td>🛡️</td>
<td><strong>Safe, validated changes</strong><br/><sub>not breaking your entire codebase</sub></td>
</tr>
</table>

Built on [synapse](https://chernistry.github.io/synapse/) (adaptive governance) and [sddrush](https://github.com/chernistry/sddrush) (spec-driven dev toolkit).

---

<div align="center">

## 🚀 Quick Start

</div>

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env with your API keys (see .env.example for details)

# 2. Install & build
npm install && npm run build

# 3. Run
node bin/kotef run --root /path/to/repo --goal "Add user login feature"
```

**Interactive mode:**
```bash
node bin/kotef chat --root /path/to/repo
```

---

## Why kotef > other AI coders

<table>
<tr>
<td width="50%">

**Other AI assistants:**
- Hallucinate code based on vague descriptions
- Break existing code (don't read docs)
- Use outdated Stack Overflow answers
- Leave uncommitted mess

</td>
<td width="50%">

**Kotef:**
- Reads your codebase, creates proper spec
- Fresh web research with quality scoring
- Small, safe steps with validation
- Auto-commits per feature
- Learns from mistakes

</td>
</tr>
</table>

---

## How it works

**Brain:** Creates `.sdd/` folder with `project.md`, `architect.md`, `best_practices.md` and ticket backlog. This becomes source of truth.

**Body:** Flow is `planner → researcher → coder → verifier → snitch/ticket_closer`. Thinks before touching repo, does fresh research, validates changes.

**Tech:** Node.js + TypeScript + LangGraph, deep web research, LSP diagnostics, circuit breakers, git integration, execution profiles (`strict`/`fast`/`smoke`/`yolo`).

---

## Perfect for

Solo devs shipping features fast • Tech leads delegating implementation • Agile teams handling tickets • Open source maintainers • Indie hackers building MVPs

**Anyone tired of AI that:** guesses wrong, uses deprecated libs, leaves cleanup mess, costs debugging hours.

---

## Contributing

High-impact areas: smarter research, better planning, bulletproof verification, more language support, performance.

Found a bug? Open an issue. Have an idea? Start a discussion. Want to code? Check `.sdd/backlog/tickets/`.

See `CONTRIBUTING.md` for details. Full docs in `docs/KB.md` 📚

---

## License

Apache 2.0 — see [LICENSE](./LICENSE).
