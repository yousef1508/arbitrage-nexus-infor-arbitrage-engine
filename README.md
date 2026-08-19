# Arbitrage Nexus

Personal reference doc. Single-owner, zero-cost, autonomous synthesis-arbitrage
broker — not a SaaS, not a client-service business, not for anyone but Yousef.

Full vision/constraints/history live in `handoff.md`. This README is the
practical "what actually exists and how do I run it" doc.

---

## What this system does

```
scrape public sources
→ detect signal
→ synthesize into a paid intelligence report
→ publish to a public, machine-readable catalog
→ external buyer (human or agent) pays crypto (Polygon POL)
→ payment verified on-chain
→ report unlocks
→ treasury credited (verified revenue only)
```

The public surface exists only to expose inventory to the outside world.
Visitors/bots/crawlers/agents are counterparties, not app users. The private
core (dashboard, treasury, admin routes) is for Yousef only — no accounts,
no logins for buyers, no multi-tenant anything.

---

## Architecture

- **Frontend**: React + Vite + Tailwind, Shadcn/UI, Zustand, TanStack Query — owner dashboard only.
- **Backend**: Cloudflare Workers + Hono + Cloudflare Agents SDK.
- **Persistence**: Durable Objects (`ChatAgent`, `AppController`) hold all state — signals, opportunities, earning assets, treasury, ledger.
- **AI**: Model-agnostic router with fallback pools (`AI_MODEL_POOL_*` per agent role). Gemini 2.5 Flash Lite is the preferred default to avoid 429s.
- **Payment**: Native crypto (Polygon POL) sent to a configured treasury address, verified directly against an RPC endpoint. No payment processor, no PayPal dependency for the core loop.

### Agent roles
- **Scout** — selects sources per niche and pulls raw content via free `fetch()` (no paid scraping API).
- **Analyst** — turns one scraped signal into one priced opportunity (JSON), with confidence/novelty/urgency/monetization/risk scores.
- **Governor** — deterministic policy gate (risk ceiling, daily spend cap, emergency stop). Agents cannot bypass it.
- **ContentArb** — turns an approved opportunity into an earning asset (the actual report).
- **Crypto verifier** — validates a submitted tx hash on-chain before anything is credited.

---

## Public routes (discoverable, no auth)

```
GET  /                          landing
GET  /reports                   human-readable catalog
GET  /reports/:slug              individual report page (locked until paid)
GET  /reports/:slug/metadata.json
GET  /reports/:slug/preview.json
GET  /reports/:slug/full.json    payload, gated by unlock status
POST /reports/:slug/verify-payment
GET  /reports.json               full report catalog, machine-readable
GET  /signals.json               ⚠️ currently an alias of /opportunities.json — see Known Gaps
GET  /opportunities.json
GET  /sitemap.xml
GET  /robots.txt
GET  /feed.xml                   RSS
GET  /discovery.json / /llms.txt / /agents.txt   agent-oriented discovery (bonus, not in original spec)
```

All of the above are also mirrored under `/api/...`.

## Private routes (owner only — token or Cloudflare Access)

```
/api/system/*
/api/treasury/*
/api/chat/*
/api/admin/*
/api/governor/*
dashboard UI, agent logs, tax receipts, policy controls, withdrawal controls
```

Guarded in `worker/admin-auth.ts` via `isOwnerControlPlaneRoute` /
`isPublicMarketRoute` classification + a pre-route guard in `worker/index.ts`.
Auth is `ADMIN_API_TOKEN` (bearer or `x-admin-api-token` header) or Cloudflare
Access email header. `ALLOW_LOCAL_ADMIN_BYPASS` exists for local dev only —
confirm it's unset/false before anything is ever exposed publicly.

---

## Local development

Runtime: **Bun**.

```bash
bun install
bun run dev        # vite dev server on :3000
```

`.dev.vars` in the project root holds all local secrets/config (see
`env-vars.md` below). It is already populated locally — **do not commit it,
do not paste its contents anywhere, and rotate any key that leaves this
machine.**

Useful commands:

```bash
bun run typecheck        # tsc --noEmit
bun run build            # vite build
bun run verify            # typecheck + build
bun run deploy            # build + wrangler deploy
```

PowerShell helpers in `scripts/`:
- `deploy-production.ps1` — scripted prod deploy
- `check-production.ps1` — post-deploy smoke checks
- `set-cloudflare-secrets.ps1` — pushes `.dev.vars` values to Cloudflare secrets
- `smoke-test.ps1` — hits key routes and checks responses

Local stats / debugging (PowerShell):

```powershell
$data = Invoke-RestMethod http://localhost:3000/api/system/stats
$data.data.treasury | ConvertTo-Json -Depth 10
$data.data.earning_assets | Select-Object -First 1 | ConvertTo-Json -Depth 10

Invoke-WebRequest -Uri http://localhost:3000/api/system/ingest -Method POST | Select-Object -ExpandProperty Content

Invoke-WebRequest -Uri http://localhost:3000/api/treasury/crypto/verify-deposit -Method POST -ContentType "application/json" -Body '{"txHash":"not-a-hash"}'
```

---

## Environment variables

Full values live only in `.dev.vars` (local) / Cloudflare secrets (prod) —
never in this file. Categories, for reference:

- **Admin/auth**: `ADMIN_API_TOKEN`, `ADMIN_EMAIL`, `ALLOW_LOCAL_ADMIN_BYPASS`
- **AI routing**: `AI_MODEL`, `AI_MODEL_POOL_*` (per role), `AI_MODEL_ROUTER_ENABLED`, `AI_MAX_REQUESTS_PER_CYCLE`, `AI_MAX_TOKENS_PER_CYCLE`, `AI_MIN_MINUTES_BETWEEN_CYCLES`, backoff/retry settings, `CF_AI_BASE_URL` / `CF_AI_API_KEY` / `CF_AI_MODEL`, `GEMINI_MODEL`, `OPENROUTER_API_KEY`
- **Crypto payment**: `CRYPTO_RPC_URL`, `CRYPTO_TREASURY_ADDRESS`, `CRYPTO_CHAIN_ID`, `CRYPTO_NATIVE_SYMBOL`, `CRYPTO_NATIVE_DECIMALS`, `CRYPTO_MIN_CONFIRMATIONS`, `CRYPTO_ALLOWED_UNDERPAYMENT_NOK`, price oracle config (`CRYPTO_PRICE_PROVIDER`, `CRYPTO_COINGECKO_ID`, cache/staleness settings, fallback controls)
- **Public payment mirror**: `PUBLIC_PAYMENT_*` — what's shown to buyers on report pages
- **Affiliate (optional, not core rail)**: `AFFILIATE_*_URL` / `_LABEL`, `PUBLIC_AFFILIATE_*_URL`, `AFFILIATE_OFFERS_JSON`
- **PayPal (legacy/optional owner withdrawal path)**: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MODE`
- **Misc**: `SITE_URL`, `PUBLIC_BASE_URL`, `PRODUCTION_MODE`, `AUTONOMOUS_INGESTION_ENABLED`, `SERPAPI_KEY` (only used for query-based search fallback, not the main free-fetch scraping path)

**Security note:** the `.dev.vars` currently in this project has live-looking
values for `CF_AI_API_KEY`, `ADMIN_API_TOKEN`, `PAYPAL_CLIENT_SECRET`, and
`CRYPTO_TREASURY_ADDRESS`. If this file or its contents are ever shared,
uploaded, or pasted anywhere outside this machine, rotate all of them
immediately.

---

## Deployment

Not deployed yet as of this writing (custom domain `arbitragenexus.net` is
configured in `wrangler.jsonc` but not live/indexed).

**Do not deploy until every item below is true:**

- [x] public/private route boundaries correct and enforced
- [x] admin/owner routes protected (token or CF Access)
- [x] clean report slugs (`/reports/:slug`, not raw `/api/earning-assets/:id`)
- [x] `/reports.json`
- [ ] `/signals.json` as a *genuine* normalized signal layer (currently aliases `/opportunities.json` — see Known Gaps)
- [x] `/opportunities.json`
- [x] `/sitemap.xml`
- [x] `/robots.txt`
- [x] `/feed.xml`
- [x] crypto payment verification works (on-chain, chain-ID checked, treasury-address checked)
- [x] reused tx hashes are blocked (`TX_HASH_ALREADY_USED`, checked against both earning assets and tax receipts)
- [x] full payload unlock works
- [x] treasury only credits verified revenue (`canCreditTreasuryFromVerifiedCryptoReceipt` hard-gates on `status === 'verified'`, `valuation_status === 'final'`, positive NOK value)

To deploy manually once ready:

```bash
bun run deploy
# or
bun run deploy:prod
```

---

## Known gaps (as of last audit)

1. **`/signals.json` is not a real signal layer.** No `Signal` type exists in
   the codebase — the route just relabels `this.state.opportunities`. The
   original design called for raw per-signal traceability
   (`source_id`, `source_name`, `source_url`, `confidence`, `freshness_score`,
   `tags`) separate from synthesized opportunities. Low priority to fix —
   cosmetic vs. functional impact.

2. **Source registry has no live health tracking.** `source-registry.ts` is a
   static array — no `last_checked_at`, `last_success_at`, `last_error`,
   `health_status` per source. If a source silently breaks (site redesign,
   UA block), there's no automatic signal of that; only Scout's kernel logs
   would show it.

3. **Report synthesis is shallow — this is the one that actually matters for
   revenue.** The Analyst prompt (`worker/agent.ts`, ~line 2245) generates one
   opportunity from a single scraped snippet (max ~2,200 chars) from a single
   source, in one pass. There is no cross-source correlation, no
   competitive/contextual reasoning, no "signal A + signal B implies C."
   Pricing logic and revenue-honesty constraints in the prompt are solid; the
   actual informational depth of what gets sold is currently closer to
   reformatted raw data than genuine synthesis. This is the highest-leverage
   thing to improve before expecting anyone (human or agent) to pay for a
   report.

## Things that are already solid (don't re-litigate these)

- Crypto verify-payment flow: proper on-chain checks (tx success, chain ID,
  treasury address match, hash match, confirmation count), reused-hash
  rejection, treasury purity gating.
- Admin/owner route protection.
- Discovery layer (sitemap/robots/feed + bonus `llms.txt`/`agents.txt` for
  agent discovery, which wasn't even in the original spec).
- Treasury/ledger types explicitly separate "projected market value" from
  "verified revenue" at the type level, not just in application logic.

---

## Guardrails (do not drift from these)

- Single-owner only — no customer accounts, no buyer logins, no multi-tenant state.
- Zero paid dependencies unless explicitly approved.
- Zero manual input after setup — no manual selling/messaging/publishing.
- Treasury credits only verified, on-chain-confirmed payments. Projected value is ranking/prioritization data only, never shown as earned revenue.
- Primary monetization rail is crypto payment/unlock — affiliate links are optional, never the core dependency.
- Everything private by default; only explicitly listed routes are public.
