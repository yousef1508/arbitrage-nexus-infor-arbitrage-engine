import type {
  EarningAsset,
  OfferLink,
  Opportunity,
  PaymentEnforcementMetadata
} from './types';

export type BuiltReportPayload = {
  full_report_html: string;
  full_report_json: Record<string, any>;
  page_html: string;
  seo_title: string;
  seo_description: string;
};

type PricingInput = {
  price_nok: number;
  price_usd?: number;
  price_tier?: string;
  market_value_score?: number;
  projected_market_value_usd?: number;
  pricing_reasoning?: string;
};

type PaymentConfigInput = {
  chain: string;
  asset: string;
  address: string;
  note: string;
  amount_enforcement?: PaymentEnforcementMetadata | null;
};

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
    .replace(/'/g, '&#039;');
}

function escapeAttr(value: unknown): string {
  return escapeHtml(value);
}

function escapeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function stripHtml(value: unknown): string {
  return cleanText(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shortText(value: unknown, max = 155): string {
  const text = stripHtml(value);
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(value: unknown, fallback = 0): number {
  const n = safeNumber(value, fallback);
  return Math.max(0, Math.min(1, n));
}

function percent(value: unknown): string {
  return `${Math.round(clamp01(value) * 100)}%`;
}

function formatMoney(value: unknown, currency = 'NOK'): string {
  const n = safeNumber(value, 0);

  if (currency === 'USD') {
    return `$${Math.round(n).toLocaleString('en-US')}`;
  }

  if (currency === 'NOK') {
    return `${Math.round(n).toLocaleString('nb-NO')} NOK`;
  }

  return `${Math.round(n).toLocaleString('en-US')} ${currency}`;
}

// NEXUS_REPORT_BUILDER_REVENUE_POLICY_PATCH_V2
// Public report policy:
// - projected market value is only a strategic estimate
// - full payload stays locked until verified payment
// - public buyer flow must use /reports/:slug/verify-payment
// - admin/system routes must not be used for buyers

function publicUrl(publicBaseUrl: string | undefined, path: string): string {
  const cleanPath = String(path || '').startsWith('/') ? String(path || '') : `/${path}`;

  if (!publicBaseUrl) {
    return cleanPath;
  }

  return `${String(publicBaseUrl).replace(/\/+$/, '')}${cleanPath}`;
}

function buildRevenuePolicyJson() {
  return {
    verified_external_payment_only: true,
    projected_market_value_is_not_revenue: true,
    projected_values_must_not_credit_ledger: true,
    treasury_credit_requires_verified_onchain_payment: true,
    ledger_credit_requires_verified_receipt: true,
    tax_receipt_requires_verified_payment_or_pending_valuation: true,
    full_report_requires_payment: true,
    public_verify_route: '/reports/:slug/verify-payment',
    locked_full_report_status: '402_PAYMENT_REQUIRED',
    admin_system_routes_are_not_public_buyer_routes: true,
    policy_label: 'projected_market_value_only_not_verified_revenue'
  };
}

function buildProjectedValueNotice(): string {
  return 'Projected market value is a strategic estimate only. It is not verified revenue, ledger income, or treasury balance.';
}

function splitSentenceLike(value: unknown): string[] {
  const text = cleanText(value);
  if (!text) return [];

  const parts = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((item) => cleanText(item))
    .filter(Boolean);

  if (parts.length <= 1) return [text];

  return parts.slice(0, 8);
}

function sourceEvidenceFromOpportunity(opp: Opportunity): string[] {
  return asArray<string>((opp as any).source_refs)
    .map((ref) => cleanText(ref))
    .filter(Boolean)
    .slice(0, 20);
}

function getEvidenceBullets(opp: Opportunity): string[] {
  const evidence = splitSentenceLike((opp as any).evidence);

  if (evidence.length > 0) {
    return evidence.slice(0, 5);
  }

  return sourceEvidenceFromOpportunity(opp).slice(0, 5);
}

function getCleanSummary(opp: Opportunity): string {
  const summary = cleanText((opp as any).summary);

  if (summary) return summary;

  const evidence = cleanText((opp as any).evidence);
  if (evidence) return shortText(evidence, 500);

  return `Synthesized intelligence report for ${cleanText((opp as any).title || 'this market signal')}.`;
}

function getSignalText(opp: Opportunity): string {
  return [
    (opp as any).title,
    (opp as any).summary,
    (opp as any).niche,
    (opp as any).evidence,
    ...sourceEvidenceFromOpportunity(opp)
  ]
    .join(' ')
    .toLowerCase();
}

function classifyOpportunity(opp: Opportunity): {
  category: string;
  urgency_label: string;
  buyer_intent: string;
  why_now: string[];
} {
  const text = getSignalText(opp);
  const urgency = clamp01((opp as any).urgency_score, 0.5);

  let category = 'Market intelligence';
  let buyerIntent = 'Strategic monitoring and downstream agent consumption';

  if (
    text.includes('security') ||
    text.includes('vulnerability') ||
    text.includes('cve') ||
    text.includes('exploit') ||
    text.includes('rce') ||
    text.includes('exfiltration') ||
    text.includes('breach')
  ) {
    category = 'Security intelligence';
    buyerIntent = 'Security monitoring, advisory workflows, remediation planning, and tooling prioritization';
  } else if (
    text.includes('ai') ||
    text.includes('llm') ||
    text.includes('agent') ||
    text.includes('openai') ||
    text.includes('anthropic') ||
    text.includes('gemini')
  ) {
    category = 'AI market intelligence';
    buyerIntent = 'AI product strategy, infrastructure planning, content production, and agentic research';
  } else if (
    text.includes('legal') ||
    text.includes('ownership') ||
    text.includes('ip') ||
    text.includes('compliance') ||
    text.includes('copyright')
  ) {
    category = 'Legal and compliance intelligence';
    buyerIntent = 'Policy monitoring, legal research triage, compliance planning, and IP risk review';
  } else if (
    text.includes('startup') ||
    text.includes('saas') ||
    text.includes('affiliate') ||
    text.includes('lead')
  ) {
    category = 'Commercial opportunity intelligence';
    buyerIntent = 'Lead generation, affiliate positioning, sales research, and niche content planning';
  } else if (
    text.includes('cloud') ||
    text.includes('aws') ||
    text.includes('bedrock') ||
    text.includes('infrastructure') ||
    text.includes('hosting')
  ) {
    category = 'Cloud infrastructure intelligence';
    buyerIntent = 'Cloud strategy, vendor monitoring, developer tooling, and enterprise adoption planning';
  }

  const urgencyLabel =
    urgency >= 0.8 ? 'High urgency' :
      urgency >= 0.55 ? 'Moderate urgency' :
        'Watchlist';

  const whyNow = [
    'The source signal has enough public traction to justify immediate monitoring.',
    'The opportunity is time-sensitive because buyer attention tends to decay after the initial signal window.',
    'The structured JSON payload lets downstream systems evaluate the signal without manual extraction.'
  ];

  if (text.includes('security') || text.includes('vulnerability') || text.includes('cve')) {
    whyNow.push('Security-related signals can create immediate demand from remediation, advisory, and monitoring workflows.');
  }

  if (text.includes('ai') || text.includes('llm') || text.includes('agent')) {
    whyNow.push('AI infrastructure and tooling signals move quickly; early synthesis can be useful for product and market decisions.');
  }

  if (text.includes('aws') || text.includes('bedrock') || text.includes('cloud')) {
    whyNow.push('Cloud platform signals can affect enterprise roadmap, procurement, and developer ecosystem decisions.');
  }

  return {
    category,
    urgency_label: urgencyLabel,
    buyer_intent: buyerIntent,
    why_now: Array.from(new Set(whyNow)).slice(0, 6)
  };
}

function buildRecommendedNextQueries(opp: Opportunity): string[] {
  const niche = cleanText((opp as any).niche);
  const title = cleanText((opp as any).title);

  const queries = [
    `${title} market analysis`,
    `${title} buyer demand`,
    `${title} competitive intelligence`,
    `${niche} trend data`,
    `${niche} commercial demand`,
    `${niche} pricing research`,
    `${niche} buyer segments`,
    `${niche} risk analysis`
  ];

  return Array.from(new Set(queries.map(cleanText).filter(Boolean))).slice(0, 8);
}

function buildMachineReadableActions(opp: Opportunity) {
  return [
    {
      action: 'evaluate_market_demand',
      priority: 'high',
      input: {
        niche: (opp as any).niche,
        title: (opp as any).title,
        evidence: (opp as any).evidence
      },
      expected_output: 'ranked demand evidence, buyer segments, and confidence score'
    },
    {
      action: 'compare_against_existing_reports',
      priority: 'medium',
      input: {
        niche: (opp as any).niche,
        source_refs: (opp as any).source_refs
      },
      expected_output: 'novelty estimate and duplication risk score'
    },
    {
      action: 'route_to_buyer_or_agent',
      priority: 'high',
      input: {
        buyer_type: (opp as any).buyer_type || 'agent_or_automated_intelligence_consumer',
        product_type: (opp as any).product_type || 'paid_intelligence_payload'
      },
      expected_output: 'recommended machine buyer, crawler, indexer, or downstream agent target'
    },
    {
      action: 'monitor_for_follow_up_signals',
      priority: 'medium',
      input: {
        title: (opp as any).title,
        niche: (opp as any).niche,
        recommended_queries: buildRecommendedNextQueries(opp)
      },
      expected_output: 'fresh follow-up signals and update triggers'
    }
  ];
}

function buildBuyerSegments(opp: Opportunity): string[] {
  const provided = cleanText((opp as any).buyer_type);

  if (provided && provided !== 'agent_or_automated_intelligence_consumer') {
    return provided
      .split(',')
      .map((item) => cleanText(item))
      .filter(Boolean)
      .slice(0, 8);
  }

  const text = getSignalText(opp);
  const segments = [
    'Automated market intelligence agents',
    'Research teams tracking emerging public signals',
    'Operators prioritizing commercial content or product research'
  ];

  if (text.includes('ai') || text.includes('llm') || text.includes('agent')) {
    segments.push('AI founders and infrastructure teams');
    segments.push('LLM application builders');
  }

  if (text.includes('security') || text.includes('vulnerability') || text.includes('cve')) {
    segments.push('Security analysts');
    segments.push('DevSecOps teams');
  }

  if (text.includes('cloud') || text.includes('aws') || text.includes('bedrock')) {
    segments.push('Cloud architects');
    segments.push('Enterprise AI strategists');
  }

  if (text.includes('legal') || text.includes('ip') || text.includes('ownership')) {
    segments.push('Legal operations teams');
    segments.push('IP and compliance researchers');
  }

  if (text.includes('startup') || text.includes('saas') || text.includes('lead')) {
    segments.push('B2B lead generation operators');
    segments.push('SaaS affiliate researchers');
  }

  return Array.from(new Set(segments)).slice(0, 10);
}

function buildBuyerUseCases(opp: Opportunity): string[] {
  const text = getSignalText(opp);

  const useCases = [
    'Feed this intelligence into an automated market-monitoring agent.',
    'Use the structured evidence to prioritize content, product, or research production.',
    'Use the pricing and score breakdown to decide whether the opportunity deserves deeper investigation.',
    'Use the source references as a starting point for independent verification.'
  ];

  if (text.includes('security') || text.includes('vulnerability') || text.includes('cve')) {
    useCases.push('Use the signal as early-warning security intelligence for remediation, tooling, or advisory workflows.');
  }

  if (text.includes('ai') || text.includes('llm') || text.includes('agent')) {
    useCases.push('Use the trend as input for AI tooling, agent infrastructure, or LLM cost/opportunity analysis.');
  }

  if (text.includes('legal') || text.includes('ownership') || text.includes('ip')) {
    useCases.push('Use the report as a starting point for legal, compliance, or intellectual-property monitoring.');
  }

  if (text.includes('startup') || text.includes('saas') || text.includes('affiliate')) {
    useCases.push('Use the intelligence to identify SaaS positioning, affiliate demand, or commercial content angles.');
  }

  if (text.includes('cloud') || text.includes('aws') || text.includes('bedrock')) {
    useCases.push('Use the signal for cloud platform positioning, developer ecosystem monitoring, or enterprise roadmap research.');
  }

  return Array.from(new Set(useCases)).slice(0, 8);
}

function buildRiskNotes(opp: Opportunity): string[] {
  const risk = safeNumber((opp as any).risk_score, 0.25);

  const notes = [
    'Projected market value is not verified revenue.',
    'Treasury should only be credited after external payment verification.',
    'The report is generated from public signals and should be treated as synthesized intelligence, not a guaranteed outcome.',
    'Buyers should independently verify source claims before taking high-risk operational, legal, financial, or security action.'
  ];

  if (risk >= 0.65) {
    notes.push('Risk score is elevated; downstream agents should verify evidence before acting.');
  }

  if (risk <= 0.25) {
    notes.push('Risk score is relatively low, but buyer demand is still not guaranteed.');
  }

  return notes;
}

function buildScoreBreakdown(opp: Opportunity, pricing: PricingInput) {
  return {
    confidence_score: clamp01((opp as any).confidence_score),
    novelty_score: clamp01((opp as any).novelty_score),
    urgency_score: clamp01((opp as any).urgency_score),
    monetization_score: clamp01((opp as any).monetization_score),
    market_value_score: clamp01(pricing.market_value_score ?? (opp as any).market_value_score),
    risk_score: clamp01((opp as any).risk_score),
    projected_market_value_usd: safeNumber(
      pricing.projected_market_value_usd ??
        (opp as any).projected_market_value_usd ??
        (opp as any).potential_profit
    ),
    recommended_price_nok: pricing.price_nok,
    recommended_price_usd: pricing.price_usd,
    price_tier: pricing.price_tier,
    pricing_reasoning: pricing.pricing_reasoning || (opp as any).pricing_reasoning || ''
  };
}

function getCryptoEstimateFromPaymentConfig(paymentConfig: PaymentConfigInput): string {
  const enforcement = paymentConfig.amount_enforcement;

  if (enforcement?.enabled && enforcement?.required_amount_crypto_string && enforcement?.native_symbol) {
    return `${enforcement.required_amount_crypto_string} ${enforcement.native_symbol}`;
  }

  if (enforcement?.enabled && enforcement?.required_amount_crypto && enforcement?.native_symbol) {
    return `${enforcement.required_amount_crypto} ${enforcement.native_symbol}`;
  }

  if (enforcement?.message) return enforcement.message;

  return 'Live crypto amount calculated by payment oracle.';
}

function buildPaymentJson(paymentConfig: PaymentConfigInput, pricing: PricingInput) {
  const enforcement = paymentConfig.amount_enforcement || null;

  return {
    chain: paymentConfig.chain,
    asset: paymentConfig.asset,
    address: paymentConfig.address,
    note: paymentConfig.note,
    pricing_mode: enforcement?.pricing_mode || 'live_oracle',
    amount_enforcement: enforcement,
    displayed_crypto_estimate: getCryptoEstimateFromPaymentConfig(paymentConfig),
    required_price_nok: pricing.price_nok
  };
}

function buildPaymentRequestJson(input: {
  paymentConfig: PaymentConfigInput;
  pricing: PricingInput;
  publicPath: string;
  metadataUrl: string;
  previewUrl: string;
  fullUrl: string;
  verifyUrl: string;
  absoluteReportUrl: string;
}) {
  const cryptoEstimate = getCryptoEstimateFromPaymentConfig(input.paymentConfig);

  return {
    payment_required: true,
    payment_available: Boolean(input.paymentConfig.address),
    method: 'native_crypto',
    chain: input.paymentConfig.chain,
    asset: input.paymentConfig.asset,
    address: input.paymentConfig.address,
    required_amount_crypto: cryptoEstimate,
    required_price_nok: input.pricing.price_nok,
    required_price_usd: input.pricing.price_usd,
    pricing_mode: input.paymentConfig.amount_enforcement?.pricing_mode || 'live_oracle',
    public_report_url: input.absoluteReportUrl,
    metadata_json_url: input.metadataUrl,
    preview_json_url: input.previewUrl,
    full_json_url: input.fullUrl,
    verify_payment_url: input.verifyUrl,
    verify_payment_method: 'POST',
    verify_payment_body_schema: {
      txHash: 'string'
    },
    locked_full_report_status: '402_PAYMENT_REQUIRED',
    buyer_route_policy: {
      use_public_verify_route: true,
      do_not_use_admin_or_system_routes: true,
      public_verify_route_pattern: '/reports/:slug/verify-payment'
    },
    human_readable_instructions:
      input.paymentConfig.address
        ? `Send at least ${cryptoEstimate} on ${input.paymentConfig.chain} to ${input.paymentConfig.address}, then paste the transaction hash into the public verification form.`
        : 'Payment address is not configured. Full report unlock is unavailable until a public payment address is configured.',
    note: input.paymentConfig.note
  };
}

function renderMetric(label: string, value: unknown): string {
  return `
    <div class="metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>`;
}

function renderScore(label: string, value: unknown): string {
  const score = clamp01(value);

  return `
    <div class="score-row">
      <div class="score-label">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(percent(score))}</strong>
      </div>
      <div class="score-track"><div class="score-fill" style="width:${Math.round(score * 100)}%"></div></div>
    </div>`;
}

function renderList(items: unknown[], emptyText = 'No items available.'): string {
  const normalized = items.map((item) => cleanText(item)).filter(Boolean);

  if (normalized.length === 0) {
    return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  }

  return `<ul>${normalized.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderCodeList(items: unknown[], emptyText = 'No source references available.'): string {
  const normalized = items.map((item) => cleanText(item)).filter(Boolean);

  if (normalized.length === 0) {
    return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  }

  return `<ul>${normalized.map((item) => `<li><code>${escapeHtml(item)}</code></li>`).join('')}</ul>`;
}

function renderOfferLinks(offerLinks: OfferLink[]): string {
  const links = offerLinks
    .filter((link) => link && link.type !== 'payment' && cleanText(link.url))
    .filter((link) => /^https?:\/\//i.test(cleanText(link.url)));

  if (links.length === 0) return '';

  return `<article class="card span-12">
    <div class="section-kicker">Monetization layer</div>
    <h2>Related resources</h2>
    <p class="muted">Some links may be affiliate or referral links. Treasury revenue is only credited after verified external payment or confirmed settlement.</p>
    <ul class="resource-list">
      ${links
        .map((link) => {
          const meta = [
            link.type ? `type: ${link.type}` : '',
            typeof link.match_score === 'number' ? `match: ${link.match_score}` : ''
          ].filter(Boolean).join(' · ');

          return `<li>
            <a href="${escapeAttr(link.url)}" rel="nofollow sponsored" target="_blank">${escapeHtml(link.label)}</a>
            ${meta ? `<span class="muted small"> ${escapeHtml(meta)}</span>` : ''}
          </li>`;
        })
        .join('')}
    </ul>
  </article>`;
}

function renderUrlBlock(label: string, url?: string): string {
  if (!url) return '';
  return `<p><strong>${escapeHtml(label)}:</strong> <code>${escapeHtml(url)}</code></p>`;
}

function renderCopyableCode(value: unknown): string {
  const text = cleanText(value);

  if (!text) {
    return '<code>not configured</code>';
  }

  return `<code>${escapeHtml(text)}</code>`;
}

function tierClass(tier: unknown): string {
  const value = cleanText(tier || 'standard').toLowerCase();
  if (value === 'urgent') return 'tier-urgent';
  if (value === 'high_value') return 'tier-high';
  if (value === 'premium') return 'tier-premium';
  if (value === 'low') return 'tier-low';
  return 'tier-standard';
}

function renderBuyerConversionPanel(input: {
  pricing: PricingInput;
  paymentConfig: PaymentConfigInput;
  cryptoEstimate: string;
  previewUrl: string;
  verifyUrl: string;
}): string {
  return `<article class="card span-12 conversion-panel">
    <div class="section-kicker">Buyer unlock flow</div>
    <h2>Buy the full machine-readable payload</h2>
    <p>
      The public preview is visible. The full JSON payload remains locked until the payment verifier confirms an on-chain transaction.
      No dashboard, admin token, or system route is required for buyers.
    </p>

    <div class="metrics">
      ${renderMetric('Price', formatMoney(input.pricing.price_nok, 'NOK'))}
      ${renderMetric('Required crypto', input.cryptoEstimate)}
      ${renderMetric('Network', input.paymentConfig.chain)}
      ${renderMetric('Asset', input.paymentConfig.asset)}
    </div>

    <div class="actions">
      <a class="cta" href="#unlock">Pay and verify transaction</a>
      <a class="button-link" href="${escapeAttr(input.previewUrl)}">Inspect preview JSON</a>
      <a class="button-link" href="${escapeAttr(input.verifyUrl)}">Public verify endpoint</a>
    </div>
  </article>`;
}

function renderPaymentRequestPanel(input: {
  paymentConfig: PaymentConfigInput;
  pricing: PricingInput;
  cryptoEstimate: string;
  verifyUrl: string;
  fullUrl: string;
}): string {
  const verifyUrlJson = escapeJsonForScript(input.verifyUrl);
  const fullUrlJson = escapeJsonForScript(input.fullUrl);

  return `<article class="card span-12" id="unlock">
    <div class="section-kicker">Public payment request</div>
    <h2>Unlock full report</h2>

    <div class="payment-box">
      <p><strong>${escapeHtml(formatMoney(input.pricing.price_nok, 'NOK'))}</strong></p>
      <p>${escapeHtml(input.cryptoEstimate)}</p>
      <p class="muted">${escapeHtml(input.paymentConfig.asset)} on ${escapeHtml(input.paymentConfig.chain)}</p>
    </div>

    <p style="margin-top:14px;"><strong>Send payment to:</strong> ${renderCopyableCode(input.paymentConfig.address)}</p>
    <p><strong>Required amount:</strong> ${renderCopyableCode(input.cryptoEstimate)}</p>
    <p><strong>Public verification route:</strong> ${renderCopyableCode(input.verifyUrl)}</p>

    <p class="muted">
      After payment, paste the transaction hash below. The verifier checks the public report payment route:
      <code>POST /reports/:slug/verify-payment</code>.
    </p>

    <label for="txHash"><strong>Transaction hash</strong></label>
    <input
      id="txHash"
      name="txHash"
      placeholder="0x..."
      autocomplete="off"
      style="width:100%;margin:10px 0 12px;padding:12px 14px;border-radius:14px;border:1px solid var(--border);background:#020617;color:var(--text);"
    />

    <button class="cta" type="button" onclick="verifyNexusPayment()" style="border:0;cursor:pointer;">
      Verify payment and unlock full JSON
    </button>

    <pre id="verifyResult" aria-live="polite" style="margin-top:14px;"></pre>

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
            body: JSON.stringify({ txHash })
          });

          const data = await response.json().catch(() => ({}));

          if (!response.ok || !data.success) {
            result.textContent = "Verification failed: " + (data.error || data.message || "Unknown error");
            return;
          }

          result.textContent = "Payment verified. Opening full JSON payload...";
          window.location.href = data.full_json_url || ${fullUrlJson};
        } catch (error) {
          result.textContent = "Verification error: " + String(error);
        }
      }
    </script>
  </article>`;
}

function baseStyles(): string {
  return `
    :root {
      color-scheme: dark;
      --bg: #060913;
      --panel: rgba(15, 23, 42, 0.86);
      --panel-strong: rgba(2, 6, 23, 0.94);
      --text: #e5edf8;
      --muted: #93a4bb;
      --faint: #5b6b82;
      --border: rgba(148, 163, 184, 0.22);
      --border-strong: rgba(56, 189, 248, 0.45);
      --soft: rgba(15, 23, 42, 0.78);
      --accent: #38bdf8;
      --accent-2: #22c55e;
      --warning: #f59e0b;
      --danger: #fb7185;
      --violet: #a78bfa;
      --success: #34d399;
      --shadow: 0 26px 90px rgba(0, 0, 0, 0.42);
    }

    * { box-sizing: border-box; }

    html { scroll-behavior: smooth; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at 12% 0%, rgba(56, 189, 248, 0.16), transparent 28%),
        radial-gradient(circle at 88% 12%, rgba(34, 197, 94, 0.12), transparent 26%),
        radial-gradient(circle at 50% 88%, rgba(167, 139, 250, 0.13), transparent 30%),
        linear-gradient(180deg, #020617 0%, #07111f 45%, #060913 100%);
      color: var(--text);
      line-height: 1.62;
    }

    body::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      background-image:
        linear-gradient(rgba(148, 163, 184, 0.045) 1px, transparent 1px),
        linear-gradient(90deg, rgba(148, 163, 184, 0.045) 1px, transparent 1px);
      background-size: 44px 44px;
      mask-image: linear-gradient(to bottom, black, transparent 78%);
    }

    a {
      color: #7dd3fc;
      font-weight: 800;
      text-decoration-thickness: 2px;
      text-underline-offset: 3px;
    }

    .wrap {
      max-width: 1180px;
      margin: 0 auto;
      padding: 38px 20px 70px;
      position: relative;
      z-index: 1;
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 18px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.12em;
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: 10px;
    }

    .brand-dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: var(--accent-2);
      box-shadow: 0 0 20px rgba(34, 197, 94, 0.9);
    }

    .hero {
      position: relative;
      overflow: hidden;
      background:
        linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(2, 6, 23, 0.9)),
        radial-gradient(circle at top right, rgba(56, 189, 248, 0.2), transparent 40%);
      border: 1px solid var(--border-strong);
      border-radius: 30px;
      padding: 34px;
      box-shadow: var(--shadow);
    }

    .hero::after {
      content: "";
      position: absolute;
      inset: auto -20% -35% 30%;
      height: 220px;
      background: radial-gradient(circle, rgba(56, 189, 248, 0.2), transparent 60%);
      pointer-events: none;
    }

    .eyebrow {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 18px;
      position: relative;
      z-index: 1;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 7px 11px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.74);
      color: #cbd5e1;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0.045em;
    }

    .badge::before {
      content: "";
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: var(--accent);
      box-shadow: 0 0 14px rgba(56, 189, 248, 0.8);
    }

    .tier-urgent::before { background: var(--danger); box-shadow: 0 0 14px rgba(251, 113, 133, 0.8); }
    .tier-high::before { background: var(--warning); box-shadow: 0 0 14px rgba(245, 158, 11, 0.8); }
    .tier-premium::before { background: var(--violet); box-shadow: 0 0 14px rgba(167, 139, 250, 0.8); }
    .tier-low::before { background: var(--faint); box-shadow: none; }

    h1 {
      margin: 0;
      max-width: 980px;
      font-size: clamp(34px, 5vw, 64px);
      line-height: 0.98;
      letter-spacing: -0.055em;
      position: relative;
      z-index: 1;
    }

    h2 {
      margin: 0 0 14px;
      font-size: 22px;
      line-height: 1.2;
      letter-spacing: -0.025em;
    }

    h3 {
      margin: 0 0 10px;
      font-size: 18px;
      letter-spacing: -0.01em;
    }

    p { margin: 0 0 14px; }

    .summary {
      max-width: 890px;
      margin-top: 20px;
      color: #cbd5e1;
      font-size: 18px;
      position: relative;
      z-index: 1;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 18px;
      margin-top: 18px;
    }

    .card {
      background:
        linear-gradient(180deg, rgba(15, 23, 42, 0.9), rgba(2, 6, 23, 0.82));
      border: 1px solid var(--border);
      border-radius: 24px;
      padding: 22px;
      box-shadow: 0 16px 50px rgba(0, 0, 0, 0.26);
      overflow: hidden;
    }

    .card:hover {
      border-color: rgba(56, 189, 248, 0.32);
    }

    .conversion-panel {
      border-color: rgba(52, 211, 153, 0.36);
      background:
        radial-gradient(circle at top left, rgba(52, 211, 153, 0.13), transparent 38%),
        linear-gradient(180deg, rgba(15, 23, 42, 0.94), rgba(2, 6, 23, 0.86));
    }

    .section-kicker {
      margin-bottom: 8px;
      color: var(--accent);
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }

    .span-12 { grid-column: span 12; }
    .span-8 { grid-column: span 8; }
    .span-7 { grid-column: span 7; }
    .span-6 { grid-column: span 6; }
    .span-5 { grid-column: span 5; }
    .span-4 { grid-column: span 4; }

    .metrics {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-top: 24px;
      position: relative;
      z-index: 1;
    }

    .metric {
      border: 1px solid var(--border);
      background: rgba(2, 6, 23, 0.58);
      border-radius: 18px;
      padding: 14px;
    }

    .metric span {
      display: block;
      color: var(--faint);
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .metric strong {
      display: block;
      margin-top: 5px;
      font-size: 19px;
      line-height: 1.2;
      letter-spacing: -0.02em;
      overflow-wrap: anywhere;
    }

    .score-row { margin: 14px 0; }

    .score-label {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 6px;
      color: var(--muted);
      font-size: 14px;
      font-weight: 800;
    }

    .score-label strong { color: var(--text); }

    .score-track {
      width: 100%;
      height: 9px;
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.9);
      overflow: hidden;
      border: 1px solid var(--border);
    }

    .score-fill {
      height: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--accent), var(--accent-2));
      box-shadow: 0 0 18px rgba(56, 189, 248, 0.5);
    }

    ul {
      margin: 0;
      padding-left: 20px;
    }

    li { margin: 9px 0; }

    code {
      word-break: break-all;
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid var(--border);
      color: #bae6fd;
      padding: 2px 6px;
      border-radius: 8px;
      font-size: 0.93em;
    }

    pre {
      white-space: pre-wrap;
      overflow-x: auto;
      background: #020617;
      color: #dbeafe;
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 18px;
      font-size: 13px;
      line-height: 1.5;
    }

    button {
      font-family: inherit;
    }

    .muted { color: var(--muted); }
    .small { font-size: 12px; }

    .payment-box {
      border: 1px solid rgba(52, 211, 153, 0.34);
      background: linear-gradient(180deg, rgba(6, 78, 59, 0.28), rgba(15, 23, 42, 0.74));
      border-radius: 20px;
      padding: 18px;
    }

    .payment-box strong {
      color: var(--success);
      font-size: 24px;
    }

    .cta,
    .button-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-top: 12px;
      padding: 12px 16px;
      border-radius: 14px;
      font-weight: 900;
      text-decoration: none;
    }

    .cta {
      background: linear-gradient(135deg, #0284c7, #16a34a);
      color: #fff;
      box-shadow: 0 14px 35px rgba(14, 165, 233, 0.2);
    }

    .button-link {
      border: 1px solid var(--border);
      background: rgba(15, 23, 42, 0.86);
      color: #dbeafe;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 12px;
    }

    .table {
      width: 100%;
      border-collapse: collapse;
      overflow: hidden;
      border-radius: 18px;
      border: 1px solid var(--border);
    }

    .table th,
    .table td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }

    .table th {
      background: rgba(15, 23, 42, 0.95);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
    }

    .table tr:last-child td { border-bottom: 0; }

    .resource-list a {
      color: #86efac;
    }

    @media (max-width: 860px) {
      .topbar { align-items: flex-start; flex-direction: column; }
      .hero { padding: 24px; }
      .grid { grid-template-columns: 1fr; }
      .span-12, .span-8, .span-7, .span-6, .span-5, .span-4 { grid-column: span 1; }
      .metrics { grid-template-columns: 1fr 1fr; }
    }

    @media (max-width: 520px) {
      .metrics { grid-template-columns: 1fr; }
      .wrap { padding: 22px 14px 44px; }
    }
  `;
}

function pageShell(content: string): string {
  return `<!doctype html>
<html lang="en">
${content}
</html>`;
}

export function buildIntelligenceReportPayload(params: {
  assetId: string;
  slug: string;
  opportunity: Opportunity;
  pricing: PricingInput;
  paymentConfig: PaymentConfigInput;
  offerLinks?: OfferLink[];
  generatedAt?: number;
  publicBaseUrl?: string;
}): BuiltReportPayload {
  const generatedAt = params.generatedAt || Date.now();
  const opp = params.opportunity;
  const pricing = params.pricing;
  const paymentConfig = params.paymentConfig;
  const offerLinks = params.offerLinks || [];

  const summary = getCleanSummary(opp);
  const sourceEvidence = sourceEvidenceFromOpportunity(opp);
  const evidenceBullets = getEvidenceBullets(opp);
  const classification = classifyOpportunity(opp);
  const scoreBreakdown = buildScoreBreakdown(opp, pricing);
  const buyerSegments = buildBuyerSegments(opp);
  const buyerUseCases = buildBuyerUseCases(opp);
  const machineReadableActions = buildMachineReadableActions(opp);
  const recommendedNextQueries = buildRecommendedNextQueries(opp);
  const riskNotes = buildRiskNotes(opp);
  const paymentJson = buildPaymentJson(paymentConfig, pricing);
  const cryptoEstimate = getCryptoEstimateFromPaymentConfig(paymentConfig);

  const publicPath = `/reports/${params.slug}`;
  const metadataPath = `${publicPath}/metadata.json`;
  const previewPath = `${publicPath}/preview.json`;
  const fullPath = `${publicPath}/full.json`;
  const verifyPath = `${publicPath}/verify-payment`;

  const metadataUrl = publicUrl(params.publicBaseUrl, metadataPath);
  const previewUrl = publicUrl(params.publicBaseUrl, previewPath);
  const fullUrl = publicUrl(params.publicBaseUrl, fullPath);
  const verifyUrl = publicUrl(params.publicBaseUrl, verifyPath);

  const absoluteReportUrl = params.publicBaseUrl
    ? `${params.publicBaseUrl.replace(/\/+$/, '')}${publicPath}`
    : publicPath;

  const paymentRequest = buildPaymentRequestJson({
    paymentConfig,
    pricing,
    publicPath,
    metadataUrl,
    previewUrl,
    fullUrl,
    verifyUrl,
    absoluteReportUrl
  });

  const seoTitle = `${cleanText((opp as any).title)} | Paid Machine-Readable Intelligence Report`;
  const seoDescription = shortText(
    `${summary} Unlock the full machine-readable intelligence payload after verified crypto payment. Price ${pricing.price_nok} NOK.`,
    155
  );

  const fullReportJson = {
    schema_version: '2026-05-07.autonomous-intelligence-report.v5',
    asset_id: params.assetId,
    slug: params.slug,
    type: 'paid_intelligence_payload',
    title: cleanText((opp as any).title),
    niche: cleanText((opp as any).niche),
    generated_at: generatedAt,
    generated_at_iso: new Date(generatedAt).toISOString(),

    revenue_policy: buildRevenuePolicyJson(),
    projected_value_notice: buildProjectedValueNotice(),

    urls: {
      page: absoluteReportUrl,
      page_path: publicPath,
      metadata_json: metadataUrl,
      metadata_json_path: metadataPath,
      preview_json: previewUrl,
      preview_json_path: previewPath,
      full_json: fullUrl,
      full_json_path: fullPath,
      verify_payment: verifyUrl,
      verify_payment_path: verifyPath
    },

    payment_request: paymentRequest,

    executive_summary: {
      title: cleanText((opp as any).title),
      summary,
      category: classification.category,
      urgency_label: classification.urgency_label,
      buyer_intent: classification.buyer_intent,
      buyer_type: cleanText((opp as any).buyer_type || 'agent_or_automated_intelligence_consumer'),
      product_type: cleanText((opp as any).product_type || 'paid_intelligence_payload'),
      intelligence_source: cleanText((opp as any).intelligence_source || 'source_registry_scraper_analyst_pipeline')
    },

    source_evidence: {
      evidence: cleanText((opp as any).evidence),
      evidence_bullets: evidenceBullets,
      source_refs: sourceEvidence
    },

    trend_analysis: {
      title: cleanText((opp as any).title),
      niche: cleanText((opp as any).niche),
      signal_type: cleanText((opp as any).signal_type),
      analyst_reasoning: cleanText((opp as any).analyst_reasoning || (opp as any).evidence),
      why_now: classification.why_now,
      expiry_time: (opp as any).expiry_time,
      expiry_time_iso: (opp as any).expiry_time ? new Date((opp as any).expiry_time).toISOString() : null
    },

    buyer_segments: buyerSegments,
    buyer_use_cases: buyerUseCases,
    machine_readable_actions: machineReadableActions,
    opportunity_score_breakdown: scoreBreakdown,

    pricing: {
      price_nok: pricing.price_nok,
      price_usd: pricing.price_usd,
      price_tier: pricing.price_tier,
      price_crypto_estimate: cryptoEstimate,
      market_value_score: scoreBreakdown.market_value_score,
      projected_market_value_usd: scoreBreakdown.projected_market_value_usd,
      pricing_reasoning: pricing.pricing_reasoning || (opp as any).pricing_reasoning || '',
      projected_value_label: 'projected_market_value_only_not_verified_revenue',
      projected_value_notice: buildProjectedValueNotice(),
      payment: paymentJson
    },

    payment: paymentJson,
    accounting: buildRevenuePolicyJson(),
    risk_notes: riskNotes,
    recommended_next_queries: recommendedNextQueries,

    public_sales_contract: {
      public_buyer_page: absoluteReportUrl,
      public_verify_endpoint: verifyUrl,
      public_full_json_endpoint: fullUrl,
      locked_status_before_payment: '402_PAYMENT_REQUIRED',
      unlock_after_verified_payment: true,
      admin_token_required: false,
      system_routes_required: false
    },

    agent_consumption_schema: {
      recommended_parser: 'json',
      primary_fields: [
        'urls',
        'payment_request',
        'executive_summary',
        'source_evidence',
        'trend_analysis',
        'buyer_segments',
        'buyer_use_cases',
        'machine_readable_actions',
        'opportunity_score_breakdown',
        'pricing',
        'payment',
        'risk_notes',
        'recommended_next_queries',
        'offer_links'
      ],
      unlock_required: true,
      payment_required_for_full_report: true,
      locked_full_report_status: '402_PAYMENT_REQUIRED',
      public_verify_route: '/reports/:slug/verify-payment',
      revenue_policy: 'verified_external_payment_only',
      projected_value_policy: 'projected_market_value_only_not_verified_revenue'
    },

    offer_links: offerLinks
  };

  const relatedResourcesHtml = renderOfferLinks(offerLinks);

  const pageHtml = pageShell(`
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(seoTitle)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="${escapeAttr(seoDescription)}" />
  <link rel="canonical" href="${escapeAttr(absoluteReportUrl)}" />
  <meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large" />
  <meta name="nexus:payment_required" content="true" />
  <meta name="nexus:verify_payment" content="${escapeAttr(verifyUrl)}" />
  <meta name="nexus:full_json" content="${escapeAttr(fullUrl)}" />
  <meta name="nexus:locked_full_json_status" content="402_PAYMENT_REQUIRED" />
  <meta name="nexus:projected_values_are_not_revenue" content="true" />
  <style>${baseStyles()}</style>
</head>
<body>
  <main class="wrap">
    <div class="topbar">
      <div class="brand"><span class="brand-dot"></span> Autonomous Signal Market</div>
      <div>Asset ${escapeHtml(params.assetId)} · ${escapeHtml(new Date(generatedAt).toISOString())}</div>
    </div>

    <section class="hero">
      <div class="eyebrow">
        <span class="badge">${escapeHtml(classification.category)}</span>
        <span class="badge">${escapeHtml(classification.urgency_label)}</span>
        <span class="badge ${escapeHtml(tierClass(pricing.price_tier))}">${escapeHtml(pricing.price_tier || 'standard')}</span>
        <span class="badge">${escapeHtml((opp as any).niche)}</span>
      </div>

      <h1>${escapeHtml((opp as any).title)}</h1>
      <p class="summary">${escapeHtml(summary)}</p>

      <div class="metrics">
        ${renderMetric('Signal price', formatMoney(pricing.price_nok, 'NOK'))}
        ${renderMetric('Crypto required', cryptoEstimate)}
        ${renderMetric('Projected value, not revenue', formatMoney(scoreBreakdown.projected_market_value_usd, 'USD'))}
        ${renderMetric('Market score', percent(scoreBreakdown.market_value_score))}
      </div>

      <div class="actions" style="position:relative;z-index:1;">
        <a class="cta" href="#unlock">Buy / unlock full payload</a>
        <a class="button-link" href="${escapeAttr(previewUrl)}">Preview JSON</a>
        <a class="button-link" href="${escapeAttr(metadataUrl)}">Metadata JSON</a>
      </div>

      <p class="muted small" style="margin-top:14px;position:relative;z-index:1;">
        ${escapeHtml(buildProjectedValueNotice())}
      </p>
    </section>

    <section class="grid">
      ${renderBuyerConversionPanel({
        pricing,
        paymentConfig,
        cryptoEstimate,
        previewUrl,
        verifyUrl
      })}

      <article class="card span-7">
        <div class="section-kicker">Signal brief</div>
        <h2>Why this signal matters</h2>
        ${renderList(classification.why_now)}
      </article>

      <article class="card span-5">
        <div class="section-kicker">Scoring matrix</div>
        <h2>Opportunity scores</h2>
        ${renderScore('Confidence', scoreBreakdown.confidence_score)}
        ${renderScore('Novelty', scoreBreakdown.novelty_score)}
        ${renderScore('Urgency', scoreBreakdown.urgency_score)}
        ${renderScore('Monetization', scoreBreakdown.monetization_score)}
        ${renderScore('Market value', scoreBreakdown.market_value_score)}
        ${renderScore('Risk', scoreBreakdown.risk_score)}
      </article>

      <article class="card span-6">
        <div class="section-kicker">Demand layer</div>
        <h2>Buyer segments</h2>
        ${renderList(buyerSegments)}
      </article>

      <article class="card span-6">
        <div class="section-kicker">Payload contents</div>
        <h2>Included in the full payload</h2>
        <ul>
          <li>Executive summary</li>
          <li>Source evidence and source references</li>
          <li>Trend analysis and why-now reasoning</li>
          <li>Buyer segments and use cases</li>
          <li>Machine-readable actions</li>
          <li>Opportunity score breakdown</li>
          <li>Payment request and pricing metadata</li>
          <li>Risk notes and recommended next queries</li>
        </ul>
      </article>

      <article class="card span-8">
        <div class="section-kicker">Evidence preview</div>
        <h2>Public evidence preview</h2>
        ${renderList(evidenceBullets, 'Evidence is included in the locked full payload.')}
      </article>

      <article class="card span-4">
        <div class="section-kicker">Unlock rail</div>
        <h2>Payment unlock</h2>
        <div class="payment-box">
          <p><strong>${escapeHtml(formatMoney(pricing.price_nok, 'NOK'))}</strong></p>
          <p>${escapeHtml(cryptoEstimate)}</p>
          <p class="muted">${escapeHtml(paymentConfig.asset)} on ${escapeHtml(paymentConfig.chain)}</p>
        </div>
        <p class="muted" style="margin-top:14px;">Full JSON remains locked until a verified on-chain payment covers the report price. Only verified payments may become treasury or ledger revenue.</p>
        <a class="cta" href="#unlock">Open verification</a>
      </article>

      ${renderPaymentRequestPanel({
        paymentConfig,
        pricing,
        cryptoEstimate,
        verifyUrl,
        fullUrl
      })}

      <article class="card span-12">
        <div class="section-kicker">Machine endpoints</div>
        <h2>Public report links</h2>
        ${renderUrlBlock('Public report', absoluteReportUrl)}
        ${renderUrlBlock('Metadata JSON', metadataUrl)}
        ${renderUrlBlock('Preview JSON', previewUrl)}
        ${renderUrlBlock('Full JSON', fullUrl)}
        ${renderUrlBlock('Verify payment', verifyUrl)}
      </article>

      ${relatedResourcesHtml}
    </section>
  </main>
</body>`);

  const fullReportHtml = pageShell(`
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml((opp as any).title)} | Full Intelligence Payload</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <style>${baseStyles()}</style>
</head>
<body>
  <main class="wrap">
    <div class="topbar">
      <div class="brand"><span class="brand-dot"></span> Unlocked Intelligence Payload</div>
      <div>Asset ${escapeHtml(params.assetId)} · ${escapeHtml(new Date(generatedAt).toISOString())}</div>
    </div>

    <section class="hero">
      <div class="eyebrow">
        <span class="badge">Unlocked payload</span>
        <span class="badge">${escapeHtml(classification.category)}</span>
        <span class="badge ${escapeHtml(tierClass(pricing.price_tier))}">${escapeHtml(pricing.price_tier || 'standard')}</span>
        <span class="badge">${escapeHtml((opp as any).niche)}</span>
      </div>

      <h1>${escapeHtml((opp as any).title)}</h1>
      <p class="summary">${escapeHtml(summary)}</p>

      <div class="metrics">
        ${renderMetric('Asset ID', params.assetId)}
        ${renderMetric('Price', formatMoney(pricing.price_nok, 'NOK'))}
        ${renderMetric('Crypto required', cryptoEstimate)}
        ${renderMetric('Generated', new Date(generatedAt).toISOString())}
      </div>
      <p class="muted small" style="margin-top:14px;position:relative;z-index:1;">
        This payload is available only after verified payment unlock. Treasury credit still requires verified external payment.
      </p>
    </section>

    <section class="grid">
      <article class="card span-7">
        <div class="section-kicker">Unlocked brief</div>
        <h2>Executive summary</h2>
        <p>${escapeHtml(summary)}</p>
        <table class="table">
          <tr><th>Field</th><th>Value</th></tr>
          <tr><td>Category</td><td>${escapeHtml(classification.category)}</td></tr>
          <tr><td>Urgency</td><td>${escapeHtml(classification.urgency_label)}</td></tr>
          <tr><td>Buyer intent</td><td>${escapeHtml(classification.buyer_intent)}</td></tr>
          <tr><td>Product type</td><td>${escapeHtml((opp as any).product_type || 'paid_intelligence_payload')}</td></tr>
        </table>
      </article>

      <article class="card span-5">
        <div class="section-kicker">Scoring matrix</div>
        <h2>Score breakdown</h2>
        ${renderScore('Confidence', scoreBreakdown.confidence_score)}
        ${renderScore('Novelty', scoreBreakdown.novelty_score)}
        ${renderScore('Urgency', scoreBreakdown.urgency_score)}
        ${renderScore('Monetization', scoreBreakdown.monetization_score)}
        ${renderScore('Market value', scoreBreakdown.market_value_score)}
        ${renderScore('Risk', scoreBreakdown.risk_score)}
      </article>

      <article class="card span-6">
        <div class="section-kicker">Source trace</div>
        <h2>Source evidence</h2>
        <p>${escapeHtml((opp as any).evidence)}</p>
        ${renderCodeList(sourceEvidence)}
      </article>

      <article class="card span-6">
        <div class="section-kicker">Timing logic</div>
        <h2>Why now</h2>
        ${renderList(classification.why_now)}
      </article>

      <article class="card span-6">
        <div class="section-kicker">Demand layer</div>
        <h2>Buyer segments</h2>
        ${renderList(buyerSegments)}
      </article>

      <article class="card span-6">
        <div class="section-kicker">Execution use</div>
        <h2>Buyer use cases</h2>
        ${renderList(buyerUseCases)}
      </article>

      <article class="card span-6">
        <div class="section-kicker">Agent schema</div>
        <h2>Machine-readable actions</h2>
        <table class="table">
          <tr><th>Action</th><th>Priority</th><th>Expected output</th></tr>
          ${machineReadableActions.map((action) => `
            <tr>
              <td><code>${escapeHtml(action.action)}</code></td>
              <td>${escapeHtml(action.priority)}</td>
              <td>${escapeHtml(action.expected_output)}</td>
            </tr>
          `).join('')}
        </table>
      </article>

      <article class="card span-6">
        <div class="section-kicker">Controls</div>
        <h2>Risk notes</h2>
        ${renderList(riskNotes)}
      </article>

      <article class="card span-12">
        <div class="section-kicker">Next crawl targets</div>
        <h2>Recommended next queries</h2>
        ${renderCodeList(recommendedNextQueries)}
      </article>

      ${relatedResourcesHtml}

      <article class="card span-12">
        <div class="section-kicker">JSON payload</div>
        <h2>Machine-readable JSON</h2>
        <pre>${escapeHtml(JSON.stringify(fullReportJson, null, 2))}</pre>
      </article>
    </section>
  </main>
</body>`);

  return {
    full_report_html: fullReportHtml,
    full_report_json: fullReportJson,
    page_html: pageHtml,
    seo_title: seoTitle,
    seo_description: seoDescription
  };
}

export function rebuildUnlockedReportFromAsset(asset: EarningAsset): string {
  const payload = (asset as any).full_report_json || {
    title: (asset as any).title,
    niche: (asset as any).niche,
    html: (asset as any).full_report_html || (asset as any).page_html
  };

  const title = cleanText((asset as any).title || payload.title || 'Full Intelligence Payload');
  const summary =
    payload?.executive_summary?.summary ||
    payload?.summary ||
    (asset as any).seo_description ||
    '';

  return pageShell(`
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)} | Full Intelligence Payload</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <style>${baseStyles()}</style>
</head>
<body>
  <main class="wrap">
    <div class="topbar">
      <div class="brand"><span class="brand-dot"></span> Unlocked Intelligence Payload</div>
      <div>${escapeHtml((asset as any).id || 'asset')}</div>
    </div>

    <section class="hero">
      <div class="eyebrow">
        <span class="badge">Unlocked payload</span>
        <span class="badge">${escapeHtml((asset as any).niche || payload.niche || 'Intelligence')}</span>
      </div>
      <h1>${escapeHtml(title)}</h1>
      ${summary ? `<p class="summary">${escapeHtml(summary)}</p>` : ''}
    </section>

    <section class="grid">
      <article class="card span-12">
        <div class="section-kicker">JSON payload</div>
        <h2>Machine-readable JSON</h2>
        <pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre>
      </article>
    </section>
  </main>
</body>`);
}