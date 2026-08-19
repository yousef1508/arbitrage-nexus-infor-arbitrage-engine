# Cloudflare Secrets Setup

This project uses Cloudflare Worker secrets for production values.

Do not put real API keys, admin tokens, RPC URLs with private keys, PayPal credentials, or oracle keys in `wrangler.toml`.

Local development uses `.dev.vars`.

Production uses:

```bash
wrangler secret put SECRET_NAME