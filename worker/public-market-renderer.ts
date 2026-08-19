import type {
  EarningAsset,
  NexusPublicReportCard,
  Opportunity
} from './types';

import {
  buildLockedFullReportResponse,
  buildPublicPaymentSummaryForAsset,
  buildPublicReportCard,
  buildPublicReportCards,
  buildPublicReportMetadata,
  buildPublicReportPreview,
  buildUnlockedFullReportResponse,
  isAssetUnlockedForPublic,
  sanitizeOpportunityForPublic,
  sanitizePublicAssetCollectionResponse
} from './public-sanitizer';

type PublicMarketRendererEnv = Record<string, unknown>;

export type PublicMarketRendererOptions = {
  origin: string;
  env?: PublicMarketRendererEnv;
  now?: number;
  owner_authorized?: boolean;
  tx_hash?: string;
  site_title?: string;
  site_description?: string;
};

export type PublicMarketJsonResponse = {
  success: true;
  kind: string;
  generated_at: number;
  generated_at_iso: string;
  [key: string]: unknown;
};

const DEFAULT_SITE_TITLE = 'Arbitrage Nexus Intelligence Market';
const DEFAULT_SITE_DESCRIPTION =
  'Machine-readable market intelligence, arbitrage signals, and locked reports for autonomous buyers and AI agents.';

function cleanText(value: unknown): string {
  return String(value ?? '')
    .replace(/\uFFFD/g, '')
    .replace(/�/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(value: unknown): string {
  return cleanText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value: unknown): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function escapeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function absoluteUrl(origin: string, path: string): string {
  const safeOrigin = stripTrailingSlash(cleanText(origin) || 'https://arbitragenexus.net');
  const safePath = path.startsWith('/') ? path : `/${path}`;

  return `${safeOrigin}${safePath}`;
}

function nowFromOptions(options: PublicMarketRendererOptions): number {
  return options.now || Date.now();
}

function siteTitle(options: PublicMarketRendererOptions): string {
  return cleanText(options.site_title) || DEFAULT_SITE_TITLE;
}

function siteDescription(options: PublicMarketRendererOptions): string {
  return cleanText(options.site_description) || DEFAULT_SITE_DESCRIPTION;
}

function jsonHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);

  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', headers.get('Cache-Control') || 'public, max-age=60');
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('X-Content-Type-Options', 'nosniff');

  return headers;
}

function htmlHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);

  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', headers.get('Cache-Control') || 'public, max-age=60');
  headers.set('X-Content-Type-Options', 'nosniff');

  return headers;
}

function xmlHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);

  headers.set('Content-Type', 'application/xml; charset=utf-8');
  headers.set('Cache-Control', headers.get('Cache-Control') || 'public, max-age=300');
  headers.set('X-Content-Type-Options', 'nosniff');

  return headers;
}

export function publicJsonResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: jsonHeaders(init?.headers)
  });
}

export function publicHtmlResponse(html: string, init?: ResponseInit): Response {
  return new Response(html, {
    ...init,
    headers: htmlHeaders(init?.headers)
  });
}

export function publicXmlResponse(xml: string, init?: ResponseInit): Response {
  return new Response(xml, {
    ...init,
    headers: xmlHeaders(init?.headers)
  });
}

function renderLayout(input: {
  title: string;
  description: string;
  canonicalUrl: string;
  body: string;
  jsonLd?: unknown;
}): string {
  const safeTitle = escapeHtml(input.title);
  const safeDescription = escapeHtml(input.description);
  const canonicalUrl = escapeAttribute(input.canonicalUrl);

  const jsonLd = input.jsonLd
    ? `<script type="application/ld+json">${escapeJsonForScript(input.jsonLd)}</script>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDescription}">
  <link rel="canonical" href="${canonicalUrl}">
  <meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">
  <style>
    :root {
      color-scheme: dark;
      --bg: #070b13;
      --panel: #0f172a;
      --panel2: #111827;
      --text: #e5e7eb;
      --muted: #94a3b8;
      --line: rgba(148, 163, 184, 0.22);
      --line-strong: rgba(56, 189, 248, 0.38);
      --accent: #38bdf8;
      --good: #22c55e;
      --warn: #f59e0b;
      --bad: #fb7185;
      --code: #020617;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at top left, rgba(56,189,248,0.16), transparent 32rem),
        radial-gradient(circle at top right, rgba(34,197,94,0.10), transparent 28rem),
        var(--bg);
      color: var(--text);
      line-height: 1.55;
    }

    a {
      color: var(--accent);
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    main {
      width: min(1120px, calc(100% - 32px));
      margin: 0 auto;
      padding: 44px 0 64px;
    }

    .hero {
      padding: 32px;
      border: 1px solid var(--line-strong);
      border-radius: 24px;
      background:
        linear-gradient(135deg, rgba(15, 23, 42, 0.92), rgba(2, 6, 23, 0.88)),
        radial-gradient(circle at top right, rgba(56, 189, 248, 0.13), transparent 40%);
      box-shadow: 0 24px 70px rgba(0, 0, 0, 0.32);
    }

    .eyebrow {
      margin: 0 0 10px;
      color: var(--accent);
      font-size: 0.78rem;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    h1 {
      margin: 0 0 12px;
      font-size: clamp(2rem, 5vw, 4.2rem);
      line-height: 1.02;
      letter-spacing: -0.05em;
    }

    h2 {
      margin: 0 0 12px;
      font-size: 1.3rem;
      letter-spacing: -0.02em;
    }

    h3 {
      margin: 0 0 10px;
      font-size: 1rem;
    }

    p {
      color: var(--muted);
    }

    code {
      display: inline-block;
      max-width: 100%;
      overflow-wrap: anywhere;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 3px 7px;
      background: var(--code);
      color: #cbd5e1;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(270px, 1fr));
      gap: 18px;
      margin-top: 24px;
    }

    .card {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-height: 100%;
      padding: 20px;
      border: 1px solid var(--line);
      border-radius: 20px;
      background: rgba(15, 23, 42, 0.72);
    }

    .card h2 {
      margin-bottom: 0;
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 5px 9px;
      color: var(--muted);
      font-size: 0.82rem;
      white-space: nowrap;
    }

    .price {
      color: var(--good);
      font-size: 1.1rem;
      font-weight: 900;
    }

    .warning {
      color: var(--warn);
      font-weight: 800;
    }

    .success {
      color: var(--good);
      font-weight: 800;
    }

    .danger {
      color: var(--bad);
      font-weight: 800;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: auto;
    }

    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 10px 14px;
      background: rgba(56, 189, 248, 0.1);
      color: var(--text);
      font-weight: 800;
    }

    button.button {
      cursor: pointer;
    }

    .button.primary {
      border-color: rgba(34, 197, 94, 0.46);
      background: linear-gradient(135deg, rgba(34, 197, 94, 0.24), rgba(56, 189, 248, 0.18));
    }

    .section {
      margin-top: 28px;
    }

    .payment-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      gap: 12px;
    }

    .payment-item {
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 12px;
      background: rgba(2, 6, 23, 0.48);
    }

    .payment-item span {
      display: block;
      color: var(--muted);
      font-size: 0.78rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .payment-item strong {
      display: block;
      margin-top: 6px;
      overflow-wrap: anywhere;
    }

    .tx-input {
      width: 100%;
      margin: 10px 0 12px;
      padding: 12px 14px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--code);
      color: var(--text);
      font: inherit;
    }

    pre {
      overflow: auto;
      padding: 16px;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: var(--code);
      color: #cbd5e1;
      white-space: pre-wrap;
    }

    footer {
      margin-top: 42px;
      color: var(--muted);
      font-size: 0.9rem;
    }
  </style>
  ${jsonLd}
</head>
<body>
  <main>
    ${input.body}
    <footer>
      Projected market values shown here are strategic estimates only. They are not verified revenue, ledger income, or settled treasury balance.
    </footer>
  </main>
</body>
</html>`;
}

function reportJsonLd(card: NexusPublicReportCard, options: PublicMarketRendererOptions): unknown {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: card.title,
    description: card.preview,
    category: card.niche,
    url: card.urls.page,
    dateModified: card.freshness_iso,
    offers: {
      '@type': 'Offer',
      price: card.price_nok,
      priceCurrency: 'NOK',
      availability: card.payment_available
        ? 'https://schema.org/InStock'
        : 'https://schema.org/PreOrder',
      url: card.urls.page
    },
    seller: {
      '@type': 'Organization',
      name: siteTitle(options),
      url: absoluteUrl(options.origin, '/')
    }
  };
}

function collectionJsonLd(cards: NexusPublicReportCard[], options: PublicMarketRendererOptions): unknown {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: siteTitle(options),
    description: siteDescription(options),
    url: absoluteUrl(options.origin, '/reports'),
    hasPart: cards.slice(0, 50).map((card) => ({
      '@type': 'Product',
      name: card.title,
      url: card.urls.page,
      category: card.niche,
      offers: {
        '@type': 'Offer',
        price: card.price_nok,
        priceCurrency: 'NOK',
        url: card.urls.page
      }
    }))
  };
}

function renderReportCard(card: NexusPublicReportCard): string {
  const projected = card.projected_value_display_nok
    ? `<span class="pill">Projected market value: ${escapeHtml(card.projected_value_display_nok)}</span>`
    : '';

  return `<article class="card">
    <h2><a href="${escapeAttribute(card.urls.page)}">${escapeHtml(card.title)}</a></h2>
    <ul class="meta">
      <li class="pill">${escapeHtml(card.niche)}</li>
      <li class="pill">${escapeHtml(card.unlock_status)}</li>
      <li class="pill">${escapeHtml(card.freshness_iso)}</li>
      ${projected}
    </ul>
    <p>${escapeHtml(card.preview)}</p>
    <p class="price">${escapeHtml(card.price_display_nok)} <span class="pill">${escapeHtml(card.price_display_usd)}</span></p>
    <div class="actions">
      <a class="button primary" href="${escapeAttribute(card.urls.page)}#unlock">Buy / unlock</a>
      <a class="button" href="${escapeAttribute(card.urls.page)}">Open report</a>
      <a class="button" href="${escapeAttribute(card.urls.metadata_json)}">Metadata JSON</a>
      <a class="button" href="${escapeAttribute(card.urls.preview_json)}">Preview JSON</a>
    </div>
  </article>`;
}

function renderCopyableCode(value: unknown): string {
  const text = cleanText(value);

  if (!text) return '<code>not configured</code>';

  return `<code>${escapeHtml(text)}</code>`;
}

function getPaymentValue(payment: unknown, key: string): unknown {
  const paymentAny = payment as Record<string, unknown> | null | undefined;
  return paymentAny?.[key];
}

function renderPaymentVerificationWidget(input: {
  verifyUrl: string;
  fullJsonUrl: string;
}): string {
  const verifyUrlJson = escapeJsonForScript(input.verifyUrl);
  const fullJsonUrlJson = escapeJsonForScript(input.fullJsonUrl);

  return `<section class="card section" id="unlock">
    <h2>Verify payment and unlock</h2>
    <p>
      After sending the required crypto payment, paste the transaction hash below.
      This buyer-facing route must stay public. It must not require the admin API token.
    </p>

    <label for="txHash"><strong>Transaction hash</strong></label>
    <input
      id="txHash"
      name="txHash"
      class="tx-input"
      placeholder="0x..."
      autocomplete="off"
      spellcheck="false"
    />

    <div class="actions">
      <button class="button primary" type="button" onclick="verifyNexusPayment()">
        Verify payment and unlock full JSON
      </button>
      <a class="button" href="${escapeAttribute(input.fullJsonUrl)}">Open full JSON endpoint</a>
    </div>

    <pre id="verifyResult" aria-live="polite"></pre>

    <script>
      async function verifyNexusPayment() {
        const input = document.getElementById("txHash");
        const result = document.getElementById("verifyResult");
        const txHash = input && input.value ? input.value.trim() : "";

        if (!txHash) {
          result.textContent = "Transaction hash required.";
          return;
        }

        result.textContent = "Verifying payment on-chain...";

        try {
          const response = await fetch(${verifyUrlJson}, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ txHash: txHash, tx_hash: txHash })
          });

          const data = await response.json().catch(function () { return {}; });

          if (!response.ok || !data.success) {
            result.textContent = JSON.stringify({
              success: false,
              status: response.status,
              error: data.error || data.message || "Verification failed",
              note: response.status === 401
                ? "401 means the route is wrongly requiring admin authorization."
                : response.status === 402
                  ? "402 means payment is still required or insufficient."
                  : "No treasury credit is created unless payment is verified."
            }, null, 2);
            return;
          }

          result.textContent = JSON.stringify({
            success: true,
            message: "Payment verified. Opening full JSON payload...",
            receipt: data.receipt || null,
            full_json_url: data.full_json_url || ${fullJsonUrlJson}
          }, null, 2);

          window.location.href = data.full_json_url || ${fullJsonUrlJson};
        } catch (error) {
          result.textContent = JSON.stringify({
            success: false,
            error: String(error)
          }, null, 2);
        }
      }
    </script>
  </section>`;
}

function renderBuyerAgentBlock(card: NexusPublicReportCard): string {
  return `<section class="card section">
    <h2>For buyers, crawlers, and AI agents</h2>
    <p>
      This report exposes machine-readable metadata and preview endpoints before payment.
      The full payload unlocks only after verified payment.
    </p>
    <ul class="meta">
      <li class="pill">Paid JSON payload</li>
      <li class="pill">Machine-readable preview</li>
      <li class="pill">On-chain unlock</li>
      <li class="pill">Verified revenue only</li>
    </ul>
    <pre>${escapeHtml(JSON.stringify({
      report: card.urls.page,
      metadata_json: card.urls.metadata_json,
      preview_json: card.urls.preview_json,
      full_json: card.urls.full_json,
      verify_payment: card.urls.verify_payment,
      price_nok: card.price_nok,
      unlock_status: card.unlock_status,
      status_rules: {
        unauthenticated_admin_route: 401,
        locked_buyer_full_json: 402,
        buyer_verify_payment_route_requires_admin_token: false
      }
    }, null, 2))}</pre>
  </section>`;
}

export function renderPublicMarketHtml(input: {
  assets: Array<Partial<EarningAsset> & Record<string, any>>;
  options: PublicMarketRendererOptions;
}): string {
  const cards = buildPublicReportCards(input.assets, {
    origin: input.options.origin,
    env: input.options.env,
    now: input.options.now
  });

  const title = siteTitle(input.options);
  const description = siteDescription(input.options);
  const reports = cards.length
    ? cards.map(renderReportCard).join('\n')
    : `<article class="card"><h2>No reports published yet</h2><p>The autonomous market engine has not published public intelligence reports yet.</p></article>`;

  return renderLayout({
    title,
    description,
    canonicalUrl: absoluteUrl(input.options.origin, '/reports'),
    jsonLd: collectionJsonLd(cards, input.options),
    body: `<section class="hero">
      <p class="eyebrow">Autonomous intelligence market</p>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(description)}</p>
      <div class="actions">
        <a class="button primary" href="#reports">Browse paid reports</a>
        <a class="button" href="${escapeAttribute(absoluteUrl(input.options.origin, '/reports.json'))}">reports.json</a>
        <a class="button" href="${escapeAttribute(absoluteUrl(input.options.origin, '/signals.json'))}">signals.json</a>
        <a class="button" href="${escapeAttribute(absoluteUrl(input.options.origin, '/feed.xml'))}">feed.xml</a>
      </div>
    </section>
    <section class="grid section" id="reports">
      ${reports}
    </section>`
  });
}

export function renderPublicReportPageHtml(input: {
  asset: Partial<EarningAsset> & Record<string, any>;
  options: PublicMarketRendererOptions;
}): string {
  const unlocked = isAssetUnlockedForPublic(input.asset, {
    ownerAuthorized: input.options.owner_authorized,
    txHash: input.options.tx_hash
  });

  const card = buildPublicReportCard(input.asset, {
    origin: input.options.origin,
    env: input.options.env,
    now: input.options.now,
    unlocked
  });

  const payment = buildPublicPaymentSummaryForAsset(input.asset, {
    origin: input.options.origin,
    env: input.options.env,
    now: input.options.now,
    include_payment_request: true
  });

  const projected = card.projected_value_display_nok
    ? `<li class="pill">Projected market value only: ${escapeHtml(card.projected_value_display_nok)}</li>`
    : '';

  const paymentAddress = getPaymentValue(payment, 'address');
  const paymentChain = getPaymentValue(payment, 'chain');
  const paymentAsset = getPaymentValue(payment, 'asset');
  const requiredAmountCrypto = getPaymentValue(payment, 'required_amount_crypto');
  const humanInstructions = getPaymentValue(payment, 'human_readable_instructions');

  const paymentBlock = payment
    ? `<section class="card section" id="payment">
        <h2>Payment request</h2>
        <p>${escapeHtml(humanInstructions || 'Send the required crypto payment, then verify the transaction hash to unlock the full report.')}</p>

        <div class="payment-grid">
          <div class="payment-item">
            <span>Network</span>
            <strong>${escapeHtml(paymentChain || '')}</strong>
          </div>
          <div class="payment-item">
            <span>Asset</span>
            <strong>${escapeHtml(paymentAsset || '')}</strong>
          </div>
          <div class="payment-item">
            <span>Required amount</span>
            <strong>${escapeHtml(requiredAmountCrypto || 'live quote')}</strong>
          </div>
          <div class="payment-item">
            <span>Report price</span>
            <strong>${escapeHtml(card.price_display_nok)}</strong>
          </div>
        </div>

        <p><strong>Payment address:</strong> ${renderCopyableCode(paymentAddress)}</p>
        <p><strong>Required amount:</strong> ${renderCopyableCode(requiredAmountCrypto || 'live quote')}</p>

        <div class="actions">
          <a class="button primary" href="#unlock">I have paid — verify transaction</a>
          <a class="button" href="${escapeAttribute(card.urls.preview_json)}">Inspect preview JSON first</a>
        </div>

        <pre>${escapeHtml(JSON.stringify(payment, null, 2))}</pre>
      </section>`
    : `<section class="card section" id="payment">
        <h2>Payment unavailable</h2>
        <p>No public payment address is configured for this report.</p>
      </section>`;

  const fullReport = unlocked
    ? `<section class="card section">
        <h2>Unlocked full report</h2>
        ${String(input.asset.full_report_html || '')
          ? String(input.asset.full_report_html)
          : `<pre>${escapeHtml(JSON.stringify(input.asset.full_report_json || {}, null, 2))}</pre>`}
      </section>`
    : `<section class="card section">
        <h2>Locked report</h2>
        <p class="warning">Full JSON is locked until a verified payment unlocks this report.</p>
        <p>
          Payment verification is automatic. Send the required amount, then paste the transaction hash below.
          A locked full JSON request should return 402 PAYMENT_REQUIRED, not 401.
        </p>
        <div class="actions">
          <a class="button" href="#payment">View payment request</a>
          <a class="button primary" href="#unlock">Verify transaction</a>
        </div>
      </section>`;

  return renderLayout({
    title: `${card.title} | ${siteTitle(input.options)}`,
    description: card.preview,
    canonicalUrl: card.urls.page,
    jsonLd: reportJsonLd(card, input.options),
    body: `<section class="hero">
      <p class="eyebrow">Public intelligence report</p>
      <h1>${escapeHtml(card.title)}</h1>
      <p>${escapeHtml(card.preview)}</p>
      <ul class="meta">
        <li class="pill">${escapeHtml(card.niche)}</li>
        <li class="pill">${escapeHtml(card.unlock_status)}</li>
        <li class="pill">${escapeHtml(card.freshness_iso)}</li>
        ${projected}
      </ul>
      <p class="price">${escapeHtml(card.price_display_nok)} <span class="pill">${escapeHtml(card.price_display_usd)}</span></p>
      <div class="actions">
        <a class="button primary" href="#unlock">Buy / unlock</a>
        <a class="button" href="${escapeAttribute(card.urls.metadata_json)}">Metadata JSON</a>
        <a class="button" href="${escapeAttribute(card.urls.preview_json)}">Preview JSON</a>
        <a class="button" href="${escapeAttribute(card.urls.full_json)}">Full JSON</a>
      </div>
    </section>
    ${renderBuyerAgentBlock(card)}
    ${paymentBlock}
    ${fullReport}
    ${unlocked ? '' : renderPaymentVerificationWidget({
      verifyUrl: card.urls.verify_payment,
      fullJsonUrl: card.urls.full_json
    })}`
  });
}

export function renderPublicReportsJson(input: {
  assets: Array<Partial<EarningAsset> & Record<string, any>>;
  options: PublicMarketRendererOptions;
}): PublicMarketJsonResponse {
  const now = nowFromOptions(input.options);
  const collection = sanitizePublicAssetCollectionResponse({
    assets: input.assets,
    options: {
      origin: input.options.origin,
      env: input.options.env,
      now
    }
  });

  return {
    success: true,
    kind: 'nexus_public_reports',
    generated_at: now,
    generated_at_iso: new Date(now).toISOString(),
    count: collection.count,
    reports: collection.reports
  };
}

export function renderPublicReportPreviewJson(input: {
  asset: Partial<EarningAsset> & Record<string, any>;
  options: PublicMarketRendererOptions;
}): ReturnType<typeof buildPublicReportPreview> {
  return buildPublicReportPreview(input.asset, {
    origin: input.options.origin,
    env: input.options.env,
    now: input.options.now,
    include_payment_request: true
  });
}

export function renderPublicReportMetadataJson(input: {
  asset: Partial<EarningAsset> & Record<string, any>;
  options: PublicMarketRendererOptions;
}): ReturnType<typeof buildPublicReportMetadata> {
  return buildPublicReportMetadata(input.asset, {
    origin: input.options.origin,
    env: input.options.env,
    now: input.options.now,
    include_payment_request: true
  });
}

export function renderPublicFullReportJson(input: {
  asset: Partial<EarningAsset> & Record<string, any>;
  options: PublicMarketRendererOptions;
}): ReturnType<typeof buildLockedFullReportResponse> | ReturnType<typeof buildUnlockedFullReportResponse> {
  const unlocked = isAssetUnlockedForPublic(input.asset, {
    ownerAuthorized: input.options.owner_authorized,
    txHash: input.options.tx_hash
  });

  if (!unlocked) {
    return buildLockedFullReportResponse(input.asset, {
      origin: input.options.origin,
      env: input.options.env,
      now: input.options.now,
      include_payment_request: true
    });
  }

  return buildUnlockedFullReportResponse(input.asset, {
    origin: input.options.origin,
    env: input.options.env,
    now: input.options.now,
    include_payment_request: true,
    unlocked: true
  });
}

export function renderPublicOpportunitiesJson(input: {
  opportunities: Array<Partial<Opportunity> & Record<string, any>>;
  options: PublicMarketRendererOptions;
}): PublicMarketJsonResponse {
  const now = nowFromOptions(input.options);
  const opportunities = input.opportunities
    .filter(Boolean)
    .map(sanitizeOpportunityForPublic)
    .sort((a, b) => Number(b.updated_at || b.created_at || 0) - Number(a.updated_at || a.created_at || 0));

  return {
    success: true,
    kind: 'nexus_public_opportunities',
    generated_at: now,
    generated_at_iso: new Date(now).toISOString(),
    count: opportunities.length,
    opportunities
  };
}

export function renderPublicSignalsJson(input: {
  opportunities: Array<Partial<Opportunity> & Record<string, any>>;
  options: PublicMarketRendererOptions;
}): PublicMarketJsonResponse {
  const now = nowFromOptions(input.options);
  const signals = input.opportunities
    .filter(Boolean)
    .map((opportunity) => {
      const publicOpportunity = sanitizeOpportunityForPublic(opportunity);

      return {
        id: publicOpportunity.id,
        title: publicOpportunity.title,
        summary: publicOpportunity.summary,
        niche: publicOpportunity.niche,
        signal_type: publicOpportunity.signal_type,
        confidence_score: publicOpportunity.confidence_score,
        urgency_score: publicOpportunity.urgency_score,
        monetization_score: publicOpportunity.monetization_score,
        market_value_score: publicOpportunity.market_value_score,
        projected_market_value_usd: publicOpportunity.projected_market_value_usd,
        projected_value_label: 'projected_market_value_only_not_verified_revenue',
        report_url: publicOpportunity.report_url,
        metadata_url: publicOpportunity.metadata_url,
        preview_url: publicOpportunity.preview_url,
        created_at: publicOpportunity.created_at,
        updated_at: publicOpportunity.updated_at
      };
    });

  return {
    success: true,
    kind: 'nexus_public_signals',
    generated_at: now,
    generated_at_iso: new Date(now).toISOString(),
    count: signals.length,
    signals
  };
}

export function renderPublicFeedXml(input: {
  assets: Array<Partial<EarningAsset> & Record<string, any>>;
  options: PublicMarketRendererOptions;
}): string {
  const now = nowFromOptions(input.options);
  const cards = buildPublicReportCards(input.assets, {
    origin: input.options.origin,
    env: input.options.env,
    now
  });

  const items = cards
    .slice(0, 100)
    .map((card) => `<item>
      <title>${escapeHtml(card.title)}</title>
      <link>${escapeHtml(card.urls.page)}</link>
      <guid>${escapeHtml(card.asset_id)}</guid>
      <description>${escapeHtml(card.preview)}</description>
      <pubDate>${escapeHtml(new Date(card.created_at).toUTCString())}</pubDate>
    </item>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeHtml(siteTitle(input.options))}</title>
    <link>${escapeHtml(absoluteUrl(input.options.origin, '/reports'))}</link>
    <description>${escapeHtml(siteDescription(input.options))}</description>
    <lastBuildDate>${escapeHtml(new Date(now).toUTCString())}</lastBuildDate>
    ${items}
  </channel>
</rss>`;
}

export function renderRobotsTxt(options: PublicMarketRendererOptions): string {
  return [
    'User-agent: *',
    'Allow: /',
    'Allow: /reports',
    'Allow: /reports/',
    'Allow: /reports.json',
    'Allow: /signals.json',
    'Allow: /opportunities.json',
    'Allow: /feed.xml',
    '',
    'Disallow: /api/system/',
    'Disallow: /api/admin/',
    'Disallow: /admin',
    'Disallow: /admin-login',
    'Disallow: /dashboard',
    'Disallow: /messages',
    '',
    `Sitemap: ${absoluteUrl(options.origin, '/sitemap.xml')}`,
    ''
  ].join('\n');
}

export function renderPublicSitemapXml(input: {
  assets: Array<Partial<EarningAsset> & Record<string, any>>;
  options: PublicMarketRendererOptions;
}): string {
  const now = nowFromOptions(input.options);
  const cards = buildPublicReportCards(input.assets, {
    origin: input.options.origin,
    env: input.options.env,
    now
  });

  const staticUrls = [
    absoluteUrl(input.options.origin, '/'),
    absoluteUrl(input.options.origin, '/reports'),
    absoluteUrl(input.options.origin, '/reports.json'),
    absoluteUrl(input.options.origin, '/signals.json'),
    absoluteUrl(input.options.origin, '/opportunities.json'),
    absoluteUrl(input.options.origin, '/feed.xml')
  ];

  const urls = [
    ...staticUrls.map((loc) => ({
      loc,
      lastmod: new Date(now).toISOString()
    })),
    ...cards.flatMap((card) => [
      { loc: card.urls.page, lastmod: card.freshness_iso },
      { loc: card.urls.metadata_json, lastmod: card.freshness_iso },
      { loc: card.urls.preview_json, lastmod: card.freshness_iso }
    ])
  ];

  const body = urls
    .map((entry) => `<url>
    <loc>${escapeHtml(entry.loc)}</loc>
    <lastmod>${escapeHtml(entry.lastmod)}</lastmod>
  </url>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;
}

export function makePublicMarketResponse(input: {
  assets: Array<Partial<EarningAsset> & Record<string, any>>;
  options: PublicMarketRendererOptions;
}): Response {
  return publicHtmlResponse(renderPublicMarketHtml(input));
}

export function makePublicReportsJsonResponse(input: {
  assets: Array<Partial<EarningAsset> & Record<string, any>>;
  options: PublicMarketRendererOptions;
}): Response {
  return publicJsonResponse(renderPublicReportsJson(input));
}

export function makePublicReportPageResponse(input: {
  asset: Partial<EarningAsset> & Record<string, any>;
  options: PublicMarketRendererOptions;
}): Response {
  return publicHtmlResponse(renderPublicReportPageHtml(input));
}

export function makePublicReportMetadataResponse(input: {
  asset: Partial<EarningAsset> & Record<string, any>;
  options: PublicMarketRendererOptions;
}): Response {
  return publicJsonResponse(renderPublicReportMetadataJson(input));
}

export function makePublicReportPreviewResponse(input: {
  asset: Partial<EarningAsset> & Record<string, any>;
  options: PublicMarketRendererOptions;
}): Response {
  return publicJsonResponse(renderPublicReportPreviewJson(input));
}

export function makePublicFullReportResponse(input: {
  asset: Partial<EarningAsset> & Record<string, any>;
  options: PublicMarketRendererOptions;
}): Response {
  const payload = renderPublicFullReportJson(input);

  return publicJsonResponse(payload, {
    status: payload.success ? 200 : 402
  });
}