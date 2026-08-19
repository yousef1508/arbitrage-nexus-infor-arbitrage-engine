import type {
  NexusDynamicPrice,
  NexusPricingSignal
} from './types';

import {
  buildFxSnapshot,
  convertNokToUsd,
  convertUsdToNok,
  formatNok,
  formatUsd,
  normalizeProjectedValues
} from './fx-rates';

type PricingEnv = Record<string, unknown>;

type PricingOptions = {
  env?: PricingEnv;
  now?: number;
};

type PricingPolicy = {
  min_price_nok: number;
  max_price_nok: number;
  min_capture_rate: number;
  max_capture_rate: number;
  ai_anchor_weight: number;
};

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = safeNumber(value, fallback);
  return Math.max(min, Math.min(max, parsed));
}

function cleanText(value: unknown): string {
  return String(value ?? '')
    .replace(/\uFFFD/g, '')
    .replace(/�/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function joinedSignalText(signal: NexusPricingSignal): string {
  return [
    signal.title,
    signal.summary,
    signal.niche,
    signal.evidence,
    signal.buyer_type,
    signal.product_type,
    signal.pricing_reasoning
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function keywordScore(text: string, keywords: string[], weight: number): number {
  let score = 0;

  for (const keyword of keywords) {
    if (text.includes(keyword)) {
      score += weight;
    }
  }

  return score;
}

function getPricingPolicy(env?: PricingEnv): PricingPolicy {
  return {
    min_price_nok: clampNumber(
      env?.NEXUS_PRICE_MIN_NOK ?? env?.PUBLIC_PRICE_MIN_NOK,
      1,
      10000,
      19
    ),
    max_price_nok: clampNumber(
      env?.NEXUS_PRICE_MAX_NOK ?? env?.PUBLIC_PRICE_MAX_NOK,
      49,
      100000,
      4990
    ),
    min_capture_rate: clampNumber(
      env?.NEXUS_MIN_CAPTURE_RATE ?? env?.PUBLIC_MIN_CAPTURE_RATE,
      0.0001,
      0.2,
      0.004
    ),
    max_capture_rate: clampNumber(
      env?.NEXUS_MAX_CAPTURE_RATE ?? env?.PUBLIC_MAX_CAPTURE_RATE,
      0.0005,
      0.35,
      0.035
    ),
    ai_anchor_weight: clampNumber(
      env?.NEXUS_AI_PRICE_ANCHOR_WEIGHT ?? env?.PUBLIC_AI_PRICE_ANCHOR_WEIGHT,
      0,
      1,
      0.78
    )
  };
}

function inferMarketValueScore(signal: NexusPricingSignal): number {
  const text = joinedSignalText(signal);

  const explicit = safeNumber(signal.market_value_score, NaN);

  if (Number.isFinite(explicit) && explicit > 0) {
    return clampNumber(explicit, 0, 1, 0.5);
  }

  const confidence = clampNumber(signal.confidence_score, 0, 1, 0.5);
  const novelty = clampNumber(signal.novelty_score, 0, 1, 0.5);
  const urgency = clampNumber(signal.urgency_score, 0, 1, 0.5);
  const monetization = clampNumber(signal.monetization_score, 0, 1, 0.5);
  const risk = clampNumber(signal.risk_score, 0, 1, 0.25);

  const commercialBoost = keywordScore(
    text,
    [
      'enterprise',
      'security team',
      'it department',
      'finops',
      'developer team',
      'engineering manager',
      'cto',
      'legal',
      'compliance',
      'procurement',
      'managed security',
      'b2b',
      'api',
      'cloud',
      'infrastructure'
    ],
    0.025
  );

  const urgencyBoost = keywordScore(
    text,
    [
      'critical',
      'urgent',
      'vulnerability',
      'exploit',
      'breach',
      'password',
      'clear text',
      'billing',
      'cost',
      'lawsuit',
      'copyright',
      'compliance',
      'zero-day',
      'supply chain'
    ],
    0.025
  );

  const genericPenalty = keywordScore(
    text,
    [
      'general overview',
      'commentary',
      'introductory',
      'basic guide',
      'opinion',
      'trend summary'
    ],
    0.04
  );

  const raw =
    confidence * 0.2 +
    novelty * 0.15 +
    urgency * 0.22 +
    monetization * 0.25 +
    Math.max(0, 1 - risk) * 0.1 +
    commercialBoost +
    urgencyBoost -
    genericPenalty;

  return Number(clampNumber(raw, 0, 1, 0.5).toFixed(3));
}

function getAiRecommendedPriceNok(
  signal: NexusPricingSignal,
  env?: PricingEnv,
  now = Date.now()
): number {
  const nok = safeNumber(signal.recommended_price_nok, 0);

  if (nok > 0) {
    return nok;
  }

  const usd = safeNumber(signal.recommended_price_usd, 0);

  if (usd > 0) {
    return convertUsdToNok(usd, env, now).amount;
  }

  return 0;
}

function psychologicalRoundNok(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;

  if (value < 50) {
    return Math.max(1, Math.round(value));
  }

  if (value < 250) {
    const rounded = Math.round(value / 10) * 10;
    return Math.max(1, rounded - 1);
  }

  if (value < 1000) {
    const rounded = Math.round(value / 25) * 25;
    return Math.max(1, rounded - 1);
  }

  const rounded = Math.round(value / 100) * 100;
  return Math.max(1, rounded - 10);
}

function inferPriceTier(priceNok: number, marketValueScore: number): NexusDynamicPrice['price_tier'] {
  if (priceNok >= 2500 || marketValueScore >= 0.96) return 'enterprise';
  if (priceNok >= 1000 || marketValueScore >= 0.9) return 'urgent';
  if (priceNok >= 500 || marketValueScore >= 0.82) return 'high_value';
  if (priceNok >= 200 || marketValueScore >= 0.68) return 'premium';
  if (priceNok >= 75 || marketValueScore >= 0.45) return 'standard';
  if (priceNok >= 25) return 'low';
  return 'micro';
}

function inferBuyerFrictionScore(priceNok: number, projectedValueNok: number, marketValueScore: number): number {
  const priceToValueRatio =
    projectedValueNok > 0 ? priceNok / projectedValueNok : priceNok / 1000;

  const priceFriction =
    priceNok >= 5000 ? 0.95 :
    priceNok >= 2500 ? 0.82 :
    priceNok >= 1000 ? 0.68 :
    priceNok >= 500 ? 0.48 :
    priceNok >= 200 ? 0.32 :
    priceNok >= 75 ? 0.18 :
    0.08;

  const ratioFriction =
    priceToValueRatio >= 0.1 ? 0.9 :
    priceToValueRatio >= 0.05 ? 0.65 :
    priceToValueRatio >= 0.025 ? 0.4 :
    priceToValueRatio >= 0.01 ? 0.22 :
    0.1;

  const trustDiscount = marketValueScore >= 0.85 ? 0.12 : marketValueScore >= 0.65 ? 0.06 : 0;

  return Number(clampNumber((priceFriction + ratioFriction) / 2 - trustDiscount, 0, 1, 0.35).toFixed(3));
}

function inferCrawlerPurchaseScore(params: {
  marketValueScore: number;
  buyerFrictionScore: number;
  paymentAvailable: boolean;
  title: string;
  summary?: string;
  productType?: string;
}): number {
  const text = [
    params.title,
    params.summary,
    params.productType
  ]
    .map(cleanText)
    .join(' ')
    .toLowerCase();

  const machineReadableBoost = keywordScore(
    text,
    [
      'machine-readable',
      'json',
      'api',
      'metadata',
      'signal',
      'dataset',
      'payload',
      'agent',
      'crawler',
      'automated'
    ],
    0.035
  );

  const paymentPenalty = params.paymentAvailable ? 0 : 0.35;

  const raw =
    params.marketValueScore * 0.62 +
    (1 - params.buyerFrictionScore) * 0.25 +
    machineReadableBoost -
    paymentPenalty;

  return Number(clampNumber(raw, 0, 1, 0.5).toFixed(3));
}

function buildPricingReasoning(input: {
  signal: NexusPricingSignal;
  aiRecommendedNok: number;
  derivedNok: number;
  finalNok: number;
  marketValueScore: number;
  projectedNok: number;
  policy: PricingPolicy;
}): string {
  const aiText =
    input.aiRecommendedNok > 0
      ? `AI analyst price anchor=${Math.round(input.aiRecommendedNok)} NOK`
      : 'No AI analyst price anchor was provided; deterministic fallback derived the price';

  return [
    aiText,
    `derived_price=${Math.round(input.derivedNok)} NOK`,
    `final_price=${Math.round(input.finalNok)} NOK`,
    `market_value_score=${input.marketValueScore}`,
    `projected_market_value_nok=${Math.round(input.projectedNok)}`,
    `capture_rate_bounds=${input.policy.min_capture_rate}-${input.policy.max_capture_rate}`,
    `guardrails=${input.policy.min_price_nok}-${input.policy.max_price_nok} NOK`,
    cleanText(input.signal.pricing_reasoning)
  ]
    .filter(Boolean)
    .join('. ');
}

export function buildDynamicPrice(
  signal: NexusPricingSignal,
  options: PricingOptions = {}
): NexusDynamicPrice {
  const now = options.now || Date.now();
  const env = options.env;
  const policy = getPricingPolicy(env);
  const fx = buildFxSnapshot(env, now);
  const marketValueScore = inferMarketValueScore(signal);

  const projected = normalizeProjectedValues({
    projected_market_value_usd: signal.projected_market_value_usd,
    env,
    now
  });

  const projectedNok = projected.projected_market_value_nok;
  const aiRecommendedNok = getAiRecommendedPriceNok(signal, env, now);

  const captureRate =
    policy.min_capture_rate +
    (policy.max_capture_rate - policy.min_capture_rate) * Math.pow(marketValueScore, 1.45);

  const projectedValuePrice =
    projectedNok > 0
      ? projectedNok * captureRate
      : policy.min_price_nok + Math.pow(marketValueScore, 2.15) * 1200;

  const confidence = clampNumber(signal.confidence_score, 0, 1, 0.5);
  const risk = clampNumber(signal.risk_score, 0, 1, 0.25);

  const riskDiscount = risk >= 0.75 ? 0.55 : risk >= 0.55 ? 0.72 : risk >= 0.35 ? 0.88 : 1;
  const confidenceMultiplier = 0.72 + confidence * 0.42;

  const derivedNok = projectedValuePrice * confidenceMultiplier * riskDiscount;

  const blended =
    aiRecommendedNok > 0
      ? aiRecommendedNok * policy.ai_anchor_weight + derivedNok * (1 - policy.ai_anchor_weight)
      : derivedNok;

  const guarded = clampNumber(
    blended,
    policy.min_price_nok,
    policy.max_price_nok,
    policy.min_price_nok
  );

  const roundedNok = psychologicalRoundNok(guarded);
  const finalNok = clampNumber(
    roundedNok,
    policy.min_price_nok,
    policy.max_price_nok,
    policy.min_price_nok
  );

  const usd = convertNokToUsd(finalNok, env, now).amount;
  const buyerFrictionScore = inferBuyerFrictionScore(finalNok, projectedNok, marketValueScore);
  const crawlerPurchaseScore = inferCrawlerPurchaseScore({
    marketValueScore,
    buyerFrictionScore,
    paymentAvailable: true,
    title: signal.title,
    summary: signal.summary,
    productType: signal.product_type
  });

  return {
    price_nok: Number(finalNok.toFixed(2)),
    price_usd: Number(usd.toFixed(2)),
    price_display_nok: formatNok(finalNok),
    price_display_usd: formatUsd(usd),
    price_tier: inferPriceTier(finalNok, marketValueScore),
    market_value_score: marketValueScore,
    projected_market_value_nok: projected.projected_market_value_nok,
    projected_market_value_usd: projected.projected_market_value_usd,
    projected_value_display_nok: projected.projected_value_display_nok,
    projected_value_display_usd: projected.projected_value_display_usd,
    buyer_friction_score: buyerFrictionScore,
    crawler_purchase_score: crawlerPurchaseScore,
    pricing_reasoning: buildPricingReasoning({
      signal,
      aiRecommendedNok,
      derivedNok,
      finalNok,
      marketValueScore,
      projectedNok,
      policy
    }),
    fx,
    generated_at: now,
    generated_at_iso: new Date(now).toISOString()
  };
}

export function buildDynamicPriceFromOpportunity(
  opportunity: any,
  options: PricingOptions = {}
): NexusDynamicPrice {
  return buildDynamicPrice(
    {
      title: cleanText(opportunity?.title || opportunity?.opportunity_title || 'Untitled intelligence report'),
      summary: cleanText(opportunity?.summary || ''),
      niche: cleanText(opportunity?.niche || 'General'),
      evidence: cleanText(opportunity?.evidence || opportunity?.source_evidence || ''),
      buyer_type: cleanText(opportunity?.buyer_type || ''),
      product_type: cleanText(opportunity?.product_type || ''),
      confidence_score: opportunity?.confidence_score,
      novelty_score: opportunity?.novelty_score,
      urgency_score: opportunity?.urgency_score,
      monetization_score: opportunity?.monetization_score,
      risk_score: opportunity?.risk_score,
      market_value_score: opportunity?.market_value_score,
      projected_market_value_usd:
        opportunity?.projected_market_value_usd ??
        opportunity?.potential_profit,
      recommended_price_nok:
        opportunity?.recommended_price_nok ??
        opportunity?.price_nok,
      recommended_price_usd: opportunity?.recommended_price_usd,
      pricing_reasoning: opportunity?.pricing_reasoning
    },
    options
  );
}

export function buildLegacyDynamicPricingShape(
  opportunity: any,
  options: PricingOptions = {}
): {
  price_nok: number;
  price_usd: number;
  price_tier: NexusDynamicPrice['price_tier'];
  market_value_score: number;
  projected_market_value_usd: number;
  projected_market_value_nok: number;
  pricing_reasoning: string;
} {
  const price = buildDynamicPriceFromOpportunity(opportunity, options);

  return {
    price_nok: price.price_nok,
    price_usd: price.price_usd,
    price_tier: price.price_tier,
    market_value_score: price.market_value_score,
    projected_market_value_usd: price.projected_market_value_usd,
    projected_market_value_nok: price.projected_market_value_nok,
    pricing_reasoning: price.pricing_reasoning
  };
}
