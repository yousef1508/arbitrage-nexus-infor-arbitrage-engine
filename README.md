# Arbitrage Nexus

**A self-directed project built solo, end to end: autonomous data pipeline,
AI-agent orchestration, and blockchain payment verification, running on
Cloudflare's edge platform.**

[GitHub](#) · [Live case study / notes below](#) — *(add links here)*

---

## What this is, in plain terms

Arbitrage Nexus is a system I designed and built that runs on its own: it
watches free public sources (Hacker News, GitHub Trending, security
advisories, research feeds, and more), turns what it finds into structured
intelligence reports, publishes them publicly in both human- and
machine-readable form, and can accept and verify cryptocurrency payments
on-chain to unlock the full report — without a human doing the selling.

I'm including it here because it's the clearest example I have of how I
actually build things: pick a hard, multi-part problem, learn whatever stack
it needs, and get a working system running end to end rather than a demo of
one piece.

---

## Why this is relevant to the role

The Aquafind ad asks for someone who's a generalist, picks up new tools
fast, uses AI as a real part of their workflow rather than just for
autocomplete, takes initiative instead of waiting for a fully specified
task, and can explain technical decisions to people who aren't technical.
This project is the evidence for all of that, concretely:

| What you're looking for | Where it shows up here |
|---|---|
| Broad, self-taught tool range | Frontend (React/Vite/Tailwind), backend (Cloudflare Workers, Hono), stateful infra (Durable Objects), on-chain payment verification (raw JSON-RPC calls to Polygon), AI model orchestration — none of which I knew going in |
| Comfortable jumping into new platforms | Whole stack (Cloudflare Workers/Agents SDK, Durable Objects) was new to me at the start of this project |
| Uses AI tools to actually solve problems | See "How I used AI" below — not code autocomplete, but a working method for building and auditing a system too large to hold in my head at once |
| Self-directed, takes initiative | No one assigned this. I scoped it, built it, and — see "Engineering judgment" below — went back and audited my own work critically rather than declaring it done |
| Explains technical decisions clearly | This README is written so a non-technical reader can follow what the system does and why, not just a technical one |
| Product-owner mindset, not just execution | The "Known gaps" section exists because I audited my own build against my own original spec and prioritized fixes by actual impact, not by what was easiest |

---

## Architecture

```
scrape public sources (free, no paid APIs)
→ detect a signal
→ synthesize it into a priced intelligence report (AI-assisted)
→ publish to a public catalog (JSON, RSS, sitemap — for both humans and bots)
→ buyer pays in crypto (Polygon)
→ payment verified directly against the blockchain (no third-party processor)
→ report unlocks
→ ledger updated (only from confirmed, verified payments — never estimates)
```

- **Frontend**: React + Vite + Tailwind, Shadcn/UI, Zustand, TanStack Query
- **Backend**: Cloudflare Workers + Hono + Cloudflare Agents SDK
- **State**: Durable Objects — all signals, reports, and financial state persisted server-side
- **AI**: a small multi-agent system (Scout finds sources, Analyst prices and structures the opportunity, a Governor enforces hard spend/risk limits agents can't override) with automatic fallback across multiple AI model providers so the system keeps running if one is rate-limited
- **Payments**: native crypto transactions verified directly via RPC calls — I check transaction status, chain ID, destination address, and confirmation count myself rather than trusting a third-party payment API

---

## How I used AI in building this

Not as autocomplete. I used it as a working partner for two different jobs
in this project:

1. **Building** — designing the agent architecture, writing the payment
   verification logic, working through edge cases in the treasury/ledger
   design (e.g., making sure projected value could never accidentally get
   counted as real revenue).
2. **Auditing my own work** — I had it read through the entire codebase
   against my original design doc and tell me honestly what was actually
   built versus what I'd only described. That's where the "Known gaps"
   section below came from — it caught a gap I'd have otherwise missed
   (a feed that looked complete but was actually just aliasing another
   one) and correctly identified which shortcoming was cosmetic versus
   which one actually mattered for the system to work as intended.

That second use is the one I think matters more day to day: knowing how to
get a second, critical opinion on your own work from a tool, and knowing
which of its findings to act on.

---

## Engineering judgment: known gaps, ranked by what actually matters

I don't think a "finished, no notes" project is a believable one, so here's
my own honest assessment, ranked by real impact rather than by what's
easiest to fix:

1. **Report depth is the real bottleneck.** The AI agent that writes each
   report currently works from a single source, one pass, capped input.
   That's the thing most worth improving — connecting signals across
   multiple sources so the output is genuine synthesis, not a reformatted
   summary. This is next on my list, ahead of anything cosmetic.
2. **Source health isn't tracked live.** If a source's page layout changes
   and scraping silently breaks, nothing surfaces that automatically yet.
3. **One feed endpoint is currently just an alias of another** rather than
   its own distinct data layer, per my original spec. Cosmetic — lowest
   priority of the three.

---

## Running it locally

```bash
bun install
bun run dev          # starts on :3000
bun run typecheck
bun run build
```

Config lives in a local `.dev.vars` file (not committed) — API keys, the
treasury wallet address, and AI provider credentials. Not included here for
obvious reasons.

---

## A note on scope

This isn't a tutorial project — there's no course or template it followed.