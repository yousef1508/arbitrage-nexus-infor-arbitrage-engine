import type {
  EarningAsset,
  NexusPaymentRequest,
  NexusPublicReportCard,
  Opportunity,
  PaymentEnforcementMetadata
} from './types';

import {
  convertNokToUsd,
  formatNok,
  formatUsd
} from './fx-rates';

import {
  buildPaymentRequestFromAsset
} from './payment-request';

type PublicSanitizerEnv = Record<string, unknown>;

export type PublicReportUrlSet = NexusPublicReportCard['urls'];

export type PublicSanitizerOptions = {
  origin: string;
  env?: PublicSanitizerEnv;
  now?: number;
  include_payment_request?: boolean;
  unlocked?: boolean;
};

export type NexusPublicPaymentSummary = {
  payment_available: boolean;
  method?: NexusPaymentRequest['method'];
  chain?: string;
  asset?: string;
  address?: string;
  required_amount_crypto?: string;
  required_amount_wei?: string;
  payment_uri?: string;
  verify_url: string;
  success_url: string;
  human_readable_instructions: string;
};

export type NexusPublicReportPreview = {
  success: true;
  kind: 'nexus_public_report_preview';
  card: NexusPublicReportCard;
  payment?: NexusPublicPaymentSummary;
  payment_request?: NexusPublicPaymentSummary;
  verify_payment_url?: string;
};

export type NexusPublicReportMetadata = {
  success: true;
  kind: 'nexus_public_report_metadata';
  card: NexusPublicReportCard;
  pricing: {
    price_nok: number;
    price_usd: number;
    price_display_nok: string;
    price_display_usd: string;
    price_tier?: string;
    market_value_score?: number;
    buyer_type?: string;
    product_type?: string;
  };
  payment?: NexusPublicPaymentSummary;
  payment_request?: NexusPublicPaymentSummary;
  verify_payment_url?: string;
  projected_market_value?: {
    nok?: number;
    usd?: number;
    display_nok?: string;
    display_usd?: string;
    label: 'projected_market_value_only_not_verified_revenue';
  };
};

export type NexusLockedFullReportResponse = {
  success: false;
  status: 402;
  status_code: 402;
  error: 'PAYMENT_REQUIRED';
  kind: 'nexus_locked_report';
  card: NexusPublicReportCard;
  payment: NexusPublicPaymentSummary;
  payment_request: NexusPublicPaymentSummary;
  verify_payment_url: string;
  full_json_url: string;
  message: string;
};

export type NexusUnlockedFullReportResponse = {
  success: true;
  kind: 'nexus_unlocked_report';
  card: NexusPublicReportCard;
  full_report_html?: string;
  full_report_json?: unknown;
  payment?: NexusPublicPaymentSummary;
  payment_request?: NexusPublicPaymentSummary;
  verify_payment_url?: string;
};

const DEFAULT_ORIGIN = 'https://arbitragenexus.net';

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanText(value: unknown): string {
  return String(value ?? '')
    .replace(/\uFFFD/g, '')
    .replace(/�/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function absoluteUrl(origin: string, path: string): string {
  const safeOrigin = stripTrailingSlash(cleanText(origin) || DEFAULT_ORIGIN);
  const safePath = path.startsWith('/') ? path : `/${path}`;

  return `${safeOrigin}${safePath}`;
}

function safeSlug(value: unknown, fallback = 'report'): string {
  const raw = cleanText(value || fallback)
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return raw || fallback;
}

function truncateText(value: unknown, maxLength: number): string {
  const text = cleanText(value);

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function stripHtml(value: unknown): string {
  return cleanText(
    String(value ?? '')
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  );
}

function firstText(values: unknown[], fallback = ''): string {
  for (const value of values) {
    const text = cleanText(value);

    if (text) {
      return text;
    }
  }

  return fallback;
}

function getAssetSlug(asset: Partial<EarningAsset> & Record<string, any>): string {
  return safeSlug(asset.slug || asset.report_slug || asset.id || asset.asset_id || asset.title);
}

function getAssetId(asset: Partial<EarningAsset> & Record<string, any>): string {
  return cleanText(asset.id || asset.asset_id || getAssetSlug(asset));
}

function getAssetCreatedAt(asset: Partial<EarningAsset> & Record<string, any>, now: number): number {
  const created = safeNumber(asset.created_at, 0);

  return created > 0 ? created : now;
}

function getAssetUpdatedAt(asset: Partial<EarningAsset> & Record<string, any>, now: number): number {
  const updated = safeNumber(asset.updated_at, 0);
  const created = getAssetCreatedAt(asset, now);

  return updated > 0 ? updated : created;
}

function inferPreview(asset: Partial<EarningAsset> & Record<string, any>): string {
  return truncateText(
    firstText(
      [
        asset.preview,
        asset.summary,
        asset.notes,
        asset.opportunity_summary,
        asset.full_report_json?.executive_summary?.summary,
        asset.full_report_json?.summary,
        stripHtml(asset.full_report_html),
        stripHtml(asset.page_html),
        asset.title
      ],
      'Public intelligence preview.'
    ),
    420
  );
}

function inferPriceUsd(params: {
  priceNok: number;
  explicitUsd?: unknown;
  env?: PublicSanitizerEnv;
  now: number;
}): number {
  const explicitUsd = safeNumber(params.explicitUsd, 0);

  if (explicitUsd > 0) {
    return Number(explicitUsd.toFixed(2));
  }

  return convertNokToUsd(params.priceNok, params.env, params.now).amount;
}

function buildReportUrls(origin: string, slug: string): PublicReportUrlSet {
  return {
    page: absoluteUrl(origin, `/reports/${slug}`),
    metadata_json: absoluteUrl(origin, `/reports/${slug}/metadata.json`),
    preview_json: absoluteUrl(origin, `/reports/${slug}/preview.json`),
    full_json: absoluteUrl(origin, `/reports/${slug}/full.json`),
    verify_payment: absoluteUrl(origin, `/reports/${slug}/verify-payment`)
  };
}

function sanitizePaymentEnforcementForPublic(
  enforcement?: PaymentEnforcementMetadata
): Partial<PaymentEnforcementMetadata> | undefined {
  if (!enforcement || !enforcement.enabled) {
    return undefined;
  }

  return {
    enabled: true,
    pricing_mode: enforcement.pricing_mode,
    reason: enforcement.reason,
    required_price_nok: enforcement.required_price_nok,
    native_symbol: enforcement.native_symbol,
    native_price_nok: enforcement.native_price_nok,
    required_amount_crypto: enforcement.required_amount_crypto,
    required_amount_crypto_string: enforcement.required_amount_crypto_string,
    required_amount_wei: enforcement.required_amount_wei,
    decimals: enforcement.decimals,
    min_confirmations: enforcement.min_confirmations,
    allowed_underpayment_nok: enforcement.allowed_underpayment_nok,
    message: enforcement.message,
    quote_provider: enforcement.quote_provider,
    quote_source: enforcement.quote_source,
    quote_source_id: enforcement.quote_source_id,
    quote_source_url: enforcement.quote_source_url,
    quote_fetched_at: enforcement.quote_fetched_at,
    quote_fetched_at_iso: enforcement.quote_fetched_at_iso,
    quote_stale: enforcement.quote_stale,
    quote_fallback: enforcement.quote_fallback
  };
}

export function sanitizePaymentRequestForPublic(
  paymentRequest: NexusPaymentRequest
): NexusPublicPaymentSummary {
  return {
    payment_available: Boolean(paymentRequest.address),
    method: paymentRequest.method,
    chain: paymentRequest.chain,
    asset: paymentRequest.asset,
    address: paymentRequest.address,
    required_amount_crypto: paymentRequest.required_amount_crypto,
    required_amount_wei: paymentRequest.required_amount_wei,
    payment_uri: paymentRequest.payment_uri,
    verify_url: paymentRequest.verify_url,
    success_url: paymentRequest.success_url,
    human_readable_instructions: paymentRequest.human_readable_instructions
  };
}

function buildFallbackPaymentSummary(input: {
  asset: Partial<EarningAsset> & Record<string, any>;
  card: NexusPublicReportCard;
  options: PublicSanitizerOptions;
}): NexusPublicPaymentSummary {
  const env = input.options.env || {};
  const paymentConfig = input.asset.payment_config || input.asset.payment || {};
  const enforcement = input.asset.payment_enforcement || paymentConfig.amount_enforcement || {};

  const chain = cleanText(
    paymentConfig.chain ||
      env.PUBLIC_PAYMENT_CHAIN ||
      'Polygon'
  );

  const asset = cleanText(
    paymentConfig.asset ||
      env.PUBLIC_PAYMENT_ASSET ||
      env.CRYPTO_NATIVE_SYMBOL ||
      'POL'
  );

  const address = cleanText(
    paymentConfig.address ||
      env.PUBLIC_PAYMENT_ADDRESS ||
      env.CRYPTO_TREASURY_ADDRESS ||
      ''
  );

  const requiredAmountCrypto = cleanText(
    enforcement.required_amount_crypto_string
      ? `${enforcement.required_amount_crypto_string} ${enforcement.native_symbol || asset}`
      : input.asset.price_crypto_estimate || ''
  );

  const requiredAmountWei = cleanText(enforcement.required_amount_wei || '');

  return {
    payment_available: Boolean(address),
    method: 'native_crypto' as NexusPaymentRequest['method'],
    chain,
    asset,
    address,
    required_amount_crypto: requiredAmountCrypto || 'live quote',
    required_amount_wei: requiredAmountWei || undefined,
    payment_uri: address,
    verify_url: input.card.urls.verify_payment,
    success_url: input.card.urls.full_json,
    human_readable_instructions: address
      ? `Send ${requiredAmountCrypto || 'the required live-quoted amount'} to ${address} on ${chain}, then verify the transaction hash.`
      : 'Payment address is not configured. The report cannot be unlocked until payment configuration is available.'
  };
}

export function buildPublicReportCard(
  asset: Partial<EarningAsset> & Record<string, any>,
  options: PublicSanitizerOptions
): NexusPublicReportCard {
  const now = options.now || Date.now();
  const slug = getAssetSlug(asset);
  const assetId = getAssetId(asset);

  const createdAt = getAssetCreatedAt(asset, now);
  const updatedAt = getAssetUpdatedAt(asset, now);

  const priceNok = Number(Math.max(0, safeNumber(asset.price_nok, 0)).toFixed(2));
  const priceUsd = inferPriceUsd({
    priceNok,
    explicitUsd: asset.price_usd,
    env: options.env,
    now
  });

  const projectedNok = safeNumber(asset.projected_market_value_nok, 0);
  const projectedUsd = safeNumber(asset.projected_market_value_usd, 0);

  return {
    asset_id: assetId,
    slug,
    title: truncateText(
      firstText([asset.title, asset.opportunity_title], 'Untitled intelligence report'),
      140
    ),
    niche: truncateText(firstText([asset.niche], 'General'), 80),
    preview: inferPreview(asset),
    created_at: createdAt,
    updated_at: updatedAt,
    freshness_iso: new Date(updatedAt).toISOString(),

    price_nok: priceNok,
    price_usd: priceUsd,
    price_display_nok: formatNok(priceNok),
    price_display_usd: formatUsd(priceUsd),

    projected_market_value_nok: projectedNok > 0 ? Number(projectedNok.toFixed(2)) : undefined,
    projected_market_value_usd: projectedUsd > 0 ? Number(projectedUsd.toFixed(2)) : undefined,
    projected_value_display_nok: projectedNok > 0 ? formatNok(projectedNok) : undefined,
    projected_value_display_usd: projectedUsd > 0 ? formatUsd(projectedUsd) : undefined,

    buyer_type: truncateText(asset.buyer_type, 80) || undefined,
    product_type: truncateText(asset.product_type, 80) || undefined,

    payment_available: Boolean(
      asset.payment_config?.address ||
      asset.payment?.address ||
      options.env?.PUBLIC_PAYMENT_ADDRESS ||
      options.env?.CRYPTO_TREASURY_ADDRESS
    ),

    unlock_status:
      options.unlocked || asset.unlock_status === 'unlocked'
        ? 'unlocked'
        : 'locked',

    urls: buildReportUrls(options.origin, slug)
  };
}

export function buildPublicReportCards(
  assets: Array<Partial<EarningAsset> & Record<string, any>>,
  options: PublicSanitizerOptions
): NexusPublicReportCard[] {
  return assets
    .filter(Boolean)
    .map((asset) => buildPublicReportCard(asset, options))
    .sort((a, b) => b.updated_at - a.updated_at);
}

export function buildPublicPaymentSummaryForAsset(
  asset: Partial<EarningAsset> & Record<string, any>,
  options: PublicSanitizerOptions
): NexusPublicPaymentSummary | undefined {
  const card = buildPublicReportCard(asset, options);

  try {
    const paymentRequest = buildPaymentRequestFromAsset({
      asset,
      origin: options.origin,
      env: options.env,
      now: options.now
    });

    const payment = sanitizePaymentRequestForPublic(paymentRequest);

    return {
      ...payment,
      verify_url: cleanText(payment.verify_url) || card.urls.verify_payment,
      success_url: cleanText(payment.success_url) || card.urls.full_json
    };
  } catch {
    return buildFallbackPaymentSummary({
      asset,
      card,
      options
    });
  }
}

export function buildPublicReportPreview(
  asset: Partial<EarningAsset> & Record<string, any>,
  options: PublicSanitizerOptions
): NexusPublicReportPreview {
  const card = buildPublicReportCard(asset, options);
  const payment = options.include_payment_request
    ? buildPublicPaymentSummaryForAsset(asset, options)
    : undefined;

  return {
    success: true,
    kind: 'nexus_public_report_preview',
    card,
    payment,
    payment_request: payment,
    verify_payment_url: card.urls.verify_payment
  };
}

export function buildPublicReportMetadata(
  asset: Partial<EarningAsset> & Record<string, any>,
  options: PublicSanitizerOptions
): NexusPublicReportMetadata {
  const card = buildPublicReportCard(asset, options);
  const payment = options.include_payment_request
    ? buildPublicPaymentSummaryForAsset(asset, options)
    : undefined;

  const projectedNok = safeNumber(card.projected_market_value_nok, 0);
  const projectedUsd = safeNumber(card.projected_market_value_usd, 0);

  return {
    success: true,
    kind: 'nexus_public_report_metadata',
    card,
    pricing: {
      price_nok: card.price_nok,
      price_usd: card.price_usd,
      price_display_nok: card.price_display_nok,
      price_display_usd: card.price_display_usd,
      price_tier: cleanText(asset.price_tier) || undefined,
      market_value_score: safeNumber(asset.market_value_score, 0) || undefined,
      buyer_type: card.buyer_type,
      product_type: card.product_type
    },
    payment,
    payment_request: payment,
    verify_payment_url: card.urls.verify_payment,
    projected_market_value:
      projectedNok > 0 || projectedUsd > 0
        ? {
            nok: projectedNok > 0 ? projectedNok : undefined,
            usd: projectedUsd > 0 ? projectedUsd : undefined,
            display_nok: card.projected_value_display_nok,
            display_usd: card.projected_value_display_usd,
            label: 'projected_market_value_only_not_verified_revenue'
          }
        : undefined
  };
}

export function buildLockedFullReportResponse(
  asset: Partial<EarningAsset> & Record<string, any>,
  options: PublicSanitizerOptions
): NexusLockedFullReportResponse {
  const card = buildPublicReportCard(asset, {
    ...options,
    unlocked: false,
    include_payment_request: true
  });

  const payment =
    buildPublicPaymentSummaryForAsset(asset, {
      ...options,
      include_payment_request: true
    }) ||
    buildFallbackPaymentSummary({
      asset,
      card,
      options
    });

  return {
    success: false,
    status: 402,
    status_code: 402,
    error: 'PAYMENT_REQUIRED',
    kind: 'nexus_locked_report',
    card,
    payment,
    payment_request: payment,
    verify_payment_url: card.urls.verify_payment,
    full_json_url: card.urls.full_json,
    message:
      'This intelligence report is locked. Submit a verified crypto payment to unlock the full machine-readable report.'
  };
}

export function buildUnlockedFullReportResponse(
  asset: Partial<EarningAsset> & Record<string, any>,
  options: PublicSanitizerOptions
): NexusUnlockedFullReportResponse {
  const card = buildPublicReportCard(asset, {
    ...options,
    unlocked: true
  });

  const payment = options.include_payment_request
    ? buildPublicPaymentSummaryForAsset(asset, options)
    : undefined;

  return {
    success: true,
    kind: 'nexus_unlocked_report',
    card,
    full_report_html: String(asset.full_report_html || ''),
    full_report_json: asset.full_report_json || undefined,
    payment,
    payment_request: payment,
    verify_payment_url: card.urls.verify_payment
  };
}

export function sanitizeOpportunityForPublic(
  opportunity: Partial<Opportunity> & Record<string, any>
): Record<string, unknown> {
  const projectedUsd = safeNumber(
    opportunity.projected_market_value_usd ?? opportunity.potential_profit,
    0
  );

  return {
    id: cleanText(opportunity.id),
    title: truncateText(opportunity.title, 160),
    summary: truncateText(opportunity.summary, 420),
    niche: truncateText(opportunity.niche, 80),
    signal_type: truncateText(opportunity.signal_type, 80),
    confidence_score: safeNumber(opportunity.confidence_score, 0),
    novelty_score: safeNumber(opportunity.novelty_score, 0),
    urgency_score: safeNumber(opportunity.urgency_score, 0),
    monetization_score: safeNumber(opportunity.monetization_score, 0),
    market_value_score: safeNumber(opportunity.market_value_score, 0) || undefined,
    risk_score: safeNumber(opportunity.risk_score, 0),
    projected_market_value_usd:
      projectedUsd > 0 ? Number(projectedUsd.toFixed(2)) : undefined,
    projected_value_label: 'projected_market_value_only_not_verified_revenue',
    buyer_type: truncateText(opportunity.buyer_type, 80) || undefined,
    product_type: truncateText(opportunity.product_type, 80) || undefined,
    price_nok: safeNumber(opportunity.price_nok, 0) || undefined,
    recommended_price_nok: safeNumber(opportunity.recommended_price_nok, 0) || undefined,
    report_url: cleanText(opportunity.report_url) || undefined,
    metadata_url: cleanText(opportunity.metadata_url) || undefined,
    preview_url: cleanText(opportunity.preview_url) || undefined,
    verify_payment_url: cleanText(opportunity.verify_payment_url) || undefined,
    status: cleanText(opportunity.status),
    created_at: safeNumber(opportunity.created_at, 0),
    updated_at: safeNumber(opportunity.updated_at, 0) || undefined
  };
}

export function sanitizeEarningAssetForPublic(
  asset: Partial<EarningAsset> & Record<string, any>,
  options: PublicSanitizerOptions
): Record<string, unknown> {
  const card = buildPublicReportCard(asset, options);
  const payment = options.include_payment_request
    ? buildPublicPaymentSummaryForAsset(asset, options)
    : undefined;

  return {
    ...card,
    payment,
    payment_request: payment,
    verify_payment_url: card.urls.verify_payment,
    monetization_channel: cleanText(asset.monetization_channel) || undefined,
    payment_enforcement: sanitizePaymentEnforcementForPublic(asset.payment_enforcement),
    projected_value_label: 'projected_market_value_only_not_verified_revenue'
  };
}

export function isAssetUnlockedForPublic(
  asset: Partial<EarningAsset> & Record<string, any>,
  options: { ownerAuthorized?: boolean; txHash?: string } = {}
): boolean {
  if (options.ownerAuthorized) {
    return true;
  }

  if (asset.unlock_status === 'unlocked') {
    return true;
  }

  if (asset.status === 'verified' || asset.status === 'paid') {
    return true;
  }

  const expectedPaidHash = cleanText(asset.paid_tx_hash);
  const suppliedHash = cleanText(options.txHash).toLowerCase();

  if (expectedPaidHash && suppliedHash && expectedPaidHash.toLowerCase() === suppliedHash) {
    return true;
  }

  return false;
}

export function sanitizePublicAssetCollectionResponse(input: {
  assets: Array<Partial<EarningAsset> & Record<string, any>>;
  options: PublicSanitizerOptions;
}): {
  success: true;
  kind: 'nexus_public_report_collection';
  count: number;
  reports: NexusPublicReportCard[];
} {
  const reports = buildPublicReportCards(input.assets, input.options);

  return {
    success: true,
    kind: 'nexus_public_report_collection',
    count: reports.length,
    reports
  };
}