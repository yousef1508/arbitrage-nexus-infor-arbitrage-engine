import type { EarningAsset, Opportunity } from './types';

type PerformanceSubject = Partial<EarningAsset> | Partial<Opportunity> | Record<string, any>;

export type NichePerformance = {
  niche: string;
  reports_created: number;
  total_projected_market_value_usd: number;
  average_projected_market_value_usd: number;
  total_market_value_score: number;
  average_market_value_score: number;
  total_price_nok: number;
  average_price_nok: number;
  verified_unlocks: number;
  verified_revenue_nok: number;

  sellable_reports?: number;
  payment_available_reports?: number;
  verify_ready_reports?: number;
  full_json_ready_reports?: number;
  public_page_ready_reports?: number;
  conversion_ready_reports?: number;
  conversion_rate_proxy?: number;

  last_seen_at: number;
};

export type SourcePerformance = {
  source_id: string;
  source_name?: string;
  source_url?: string;
  source_category?: string;
  source_priority?: number;
  reports_created: number;
  total_projected_market_value_usd: number;
  average_projected_market_value_usd: number;
  total_market_value_score: number;
  average_market_value_score: number;
  total_price_nok: number;
  average_price_nok: number;
  verified_unlocks: number;
  verified_revenue_nok: number;

  sellable_reports?: number;
  payment_available_reports?: number;
  verify_ready_reports?: number;
  full_json_ready_reports?: number;
  public_page_ready_reports?: number;
  conversion_ready_reports?: number;
  conversion_rate_proxy?: number;

  last_seen_at: number;
};

export type PerformanceState = {
  niche_performance?: NichePerformance[];
  source_performance?: SourcePerformance[];
};

export type SourceLike = {
  id: string;
  name: string;
  url: string;
  category: string;
  enabled: boolean;
  scrape_interval_minutes: number;
  priority: number;
  notes?: string;
};

export type SourceSelectionInput = {
  niche: string;
  allSources: SourceLike[];
  sourcePerformance?: SourcePerformance[];
  maxSources: number;
};

export type SourceSelectionResult = {
  selectedSources: SourceLike[];
  reason: string;
};

function round2(value: number): number {
  return Number(Number(value || 0).toFixed(2));
}

function round3(value: number): number {
  return Number(Number(value || 0).toFixed(3));
}

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp01(value: unknown): number {
  return Math.max(0, Math.min(1, safeNumber(value, 0)));
}

function safeAverage(total: number, count: number): number {
  if (!count || count <= 0) return 0;
  return total / count;
}

function cleanText(value: unknown): string {
  return String(value ?? '')
    .replace(/\uFFFD/g, '')
    .replace(/�/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getProjectedMarketValueUsd(assetOrOpp: PerformanceSubject): number {
  const value = Number(
    (assetOrOpp as any).projected_market_value_usd ??
      (assetOrOpp as any).full_report_json?.projected_market_value_usd ??
      (assetOrOpp as any).full_report_json?.pricing?.projected_market_value_usd ??
      (assetOrOpp as any).full_report_json?.opportunity_score_breakdown?.projected_market_value_usd ??
      (assetOrOpp as any).potential_profit ??
      0
  );

  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getMarketValueScore(assetOrOpp: PerformanceSubject): number {
  return clamp01(
    (assetOrOpp as any).market_value_score ??
      (assetOrOpp as any).full_report_json?.market_value_score ??
      (assetOrOpp as any).full_report_json?.pricing?.market_value_score ??
      (assetOrOpp as any).full_report_json?.opportunity_score_breakdown?.market_value_score ??
      0
  );
}

function getPriceNok(asset: Partial<EarningAsset>): number {
  const value = Number((asset as any).price_nok || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getPublicPageUrl(asset: any): string {
  return cleanText(
    asset?.public_url ||
      asset?.published_url ||
      asset?.local_url ||
      asset?.report_url ||
      asset?.full_report_json?.urls?.page ||
      ''
  );
}

function getFullJsonUrl(asset: any): string {
  return cleanText(
    asset?.full_json_url ||
      asset?.full_report_json?.urls?.full_json ||
      ''
  );
}

function getVerifyPaymentUrl(asset: any): string {
  return cleanText(
    asset?.verify_payment_url ||
      asset?.payment_request?.verify_payment_url ||
      asset?.full_report_json?.payment_request?.verify_payment_url ||
      asset?.full_report_json?.urls?.verify_payment ||
      ''
  );
}

function getPaymentAddress(asset: any): string {
  return cleanText(
    asset?.payment_config?.address ||
      asset?.payment?.address ||
      asset?.payment_request?.address ||
      asset?.full_report_json?.payment_request?.address ||
      asset?.full_report_json?.payment?.address ||
      ''
  );
}

function hasPublicReportRoute(asset: any): boolean {
  const pageUrl = getPublicPageUrl(asset);
  const slug = cleanText(asset?.slug || asset?.report_slug || asset?.id || '');

  return (
    pageUrl.includes('/reports/') ||
    Boolean(slug && !pageUrl.includes('/api/') && !pageUrl.includes('/admin'))
  );
}

function hasFullJsonRoute(asset: any): boolean {
  const fullUrl = getFullJsonUrl(asset);
  return fullUrl.includes('/reports/') && fullUrl.endsWith('/full.json');
}

function hasVerifyPaymentRoute(asset: any): boolean {
  const verifyUrl = getVerifyPaymentUrl(asset);
  return verifyUrl.includes('/reports/') && verifyUrl.endsWith('/verify-payment');
}

function hasPaymentAvailable(asset: any): boolean {
  const address = getPaymentAddress(asset);
  const paymentAvailable =
    asset?.payment_available === true ||
    asset?.full_report_json?.payment_request?.payment_available === true ||
    asset?.payment_request?.payment_available === true;

  return Boolean(address || paymentAvailable);
}

function isSellableReport(asset: any): boolean {
  return (
    getPriceNok(asset) > 0 &&
    hasPublicReportRoute(asset) &&
    hasFullJsonRoute(asset) &&
    hasVerifyPaymentRoute(asset) &&
    hasPaymentAvailable(asset)
  );
}

function hasVerifiedPaymentEvidence(asset: Partial<EarningAsset> & Record<string, any>): boolean {
  const verifiedRevenue = safeNumber(asset.verified_revenue_nok, 0);
  const paymentVerification = asset.payment_verification || {};
  const paidTxHash = cleanText(asset.paid_tx_hash);
  const receipt = paymentVerification.receipt || asset.receipt || {};

  if (asset.payout_status === 'verified') return true;
  if (asset.status === 'verified') return true;
  if (paymentVerification.success === true) return true;
  if (receipt.status === 'verified' || receipt.tx_hash) return true;
  if (paidTxHash && verifiedRevenue > 0) return true;

  return false;
}

function getVerifiedRevenueNok(asset: Partial<EarningAsset> & Record<string, any>): number {
  if (!hasVerifiedPaymentEvidence(asset)) return 0;
  return Math.max(0, safeNumber(asset.verified_revenue_nok, 0));
}

function getVerifiedUnlockCount(asset: Partial<EarningAsset> & Record<string, any>): number {
  return hasVerifiedPaymentEvidence(asset) ? 1 : 0;
}

function getConversionStats(asset: EarningAsset): {
  sellable: number;
  paymentAvailable: number;
  verifyReady: number;
  fullJsonReady: number;
  publicPageReady: number;
  conversionReady: number;
} {
  const paymentAvailable = hasPaymentAvailable(asset) ? 1 : 0;
  const verifyReady = hasVerifyPaymentRoute(asset) ? 1 : 0;
  const fullJsonReady = hasFullJsonRoute(asset) ? 1 : 0;
  const publicPageReady = hasPublicReportRoute(asset) ? 1 : 0;
  const sellable = isSellableReport(asset) ? 1 : 0;

  return {
    sellable,
    paymentAvailable,
    verifyReady,
    fullJsonReady,
    publicPageReady,
    conversionReady: sellable
  };
}

function extractSourceRefs(assetOrOpp: PerformanceSubject): Array<{
  source_id: string;
  source_name?: string;
  source_url?: string;
  source_category?: string;
  source_priority?: number;
}> {
  const refs = Array.isArray((assetOrOpp as any).source_refs)
    ? (assetOrOpp as any).source_refs
    : Array.isArray((assetOrOpp as any).full_report_json?.source_refs)
      ? (assetOrOpp as any).full_report_json.source_refs
      : Array.isArray((assetOrOpp as any).full_report_json?.source_evidence?.source_refs)
        ? (assetOrOpp as any).full_report_json.source_evidence.source_refs
        : [];

  const structuredRefs = refs
    .filter((ref: any) => ref && typeof ref === 'object')
    .map((ref: any) => ({
      source_id: cleanText(ref.source_id || ref.id || ref.source || ref.url),
      source_name: cleanText(ref.source_name || ref.name || ref.title) || undefined,
      source_url: cleanText(ref.source_url || ref.url) || undefined,
      source_category: cleanText(ref.source_category || ref.category) || undefined,
      source_priority: Number.isFinite(Number(ref.source_priority || ref.priority))
        ? Number(ref.source_priority || ref.priority)
        : undefined
    }))
    .filter((ref: any) => ref.source_id);

  if (structuredRefs.length > 0) {
    return structuredRefs.slice(0, 10);
  }

  const source: {
    source_id?: string;
    source_name?: string;
    source_url?: string;
    source_category?: string;
    source_priority?: number;
  } = {};

  const fallbackSources: Array<{
    source_id: string;
    source_name?: string;
    source_url?: string;
    source_category?: string;
    source_priority?: number;
  }> = [];

  for (const raw of refs) {
    const line = cleanText(raw);

    if (!line) continue;

    if (/^https?:\/\//i.test(line)) {
      fallbackSources.push({
        source_id: line,
        source_url: line
      });
      continue;
    }

    if (line.startsWith('Source ID:')) {
      source.source_id = line.replace('Source ID:', '').trim();
    } else if (line.startsWith('Source Name:')) {
      source.source_name = line.replace('Source Name:', '').trim();
    } else if (line.startsWith('Source URL:')) {
      source.source_url = line.replace('Source URL:', '').trim();
    } else if (line.startsWith('Source Category:')) {
      source.source_category = line.replace('Source Category:', '').trim();
    } else if (line.startsWith('Source Priority:')) {
      source.source_priority = Number(line.replace('Source Priority:', '').trim());
    }
  }

  if (source.source_id) {
    fallbackSources.push({
      source_id: source.source_id,
      source_name: source.source_name,
      source_url: source.source_url,
      source_category: source.source_category,
      source_priority: source.source_priority
    });
  }

  return fallbackSources
    .filter((ref, index, arr) =>
      ref.source_id &&
      arr.findIndex((candidate) => candidate.source_id === ref.source_id) === index
    )
    .slice(0, 10);
}

function recalculateNicheAverages(item: NichePerformance): NichePerformance {
  const reports = item.reports_created || 0;

  return {
    ...item,
    average_projected_market_value_usd: round2(
      safeAverage(item.total_projected_market_value_usd, reports)
    ),
    average_market_value_score: round3(
      safeAverage(item.total_market_value_score, reports)
    ),
    average_price_nok: round2(
      safeAverage(item.total_price_nok, reports)
    ),
    conversion_rate_proxy: round3(
      safeAverage(item.conversion_ready_reports || item.sellable_reports || 0, reports)
    )
  };
}

function recalculateSourceAverages(item: SourcePerformance): SourcePerformance {
  const reports = item.reports_created || 0;

  return {
    ...item,
    average_projected_market_value_usd: round2(
      safeAverage(item.total_projected_market_value_usd, reports)
    ),
    average_market_value_score: round3(
      safeAverage(item.total_market_value_score, reports)
    ),
    average_price_nok: round2(
      safeAverage(item.total_price_nok, reports)
    ),
    conversion_rate_proxy: round3(
      safeAverage(item.conversion_ready_reports || item.sellable_reports || 0, reports)
    )
  };
}

export function updateNichePerformanceFromAsset(
  current: NichePerformance[] = [],
  asset: EarningAsset
): NichePerformance[] {
  const now = Date.now();
  const niche = cleanText((asset as any).niche || 'General') || 'General';
  const projected = getProjectedMarketValueUsd(asset);
  const marketScore = getMarketValueScore(asset);
  const price = getPriceNok(asset);
  const verifiedRevenue = getVerifiedRevenueNok(asset);
  const verifiedUnlock = getVerifiedUnlockCount(asset);
  const conversion = getConversionStats(asset);

  const existing = current.find((item) => item.niche === niche);

  const nextBase: NichePerformance = existing
    ? {
        ...existing,
        reports_created: existing.reports_created + 1,
        total_projected_market_value_usd: round2(existing.total_projected_market_value_usd + projected),
        total_market_value_score: round3(existing.total_market_value_score + marketScore),
        total_price_nok: round2(existing.total_price_nok + price),
        verified_unlocks: existing.verified_unlocks + verifiedUnlock,
        verified_revenue_nok: round2(existing.verified_revenue_nok + verifiedRevenue),

        sellable_reports: safeNumber(existing.sellable_reports, 0) + conversion.sellable,
        payment_available_reports: safeNumber(existing.payment_available_reports, 0) + conversion.paymentAvailable,
        verify_ready_reports: safeNumber(existing.verify_ready_reports, 0) + conversion.verifyReady,
        full_json_ready_reports: safeNumber(existing.full_json_ready_reports, 0) + conversion.fullJsonReady,
        public_page_ready_reports: safeNumber(existing.public_page_ready_reports, 0) + conversion.publicPageReady,
        conversion_ready_reports: safeNumber(existing.conversion_ready_reports, 0) + conversion.conversionReady,

        last_seen_at: now
      }
    : {
        niche,
        reports_created: 1,
        total_projected_market_value_usd: round2(projected),
        average_projected_market_value_usd: 0,
        total_market_value_score: round3(marketScore),
        average_market_value_score: 0,
        total_price_nok: round2(price),
        average_price_nok: 0,
        verified_unlocks: verifiedUnlock,
        verified_revenue_nok: round2(verifiedRevenue),

        sellable_reports: conversion.sellable,
        payment_available_reports: conversion.paymentAvailable,
        verify_ready_reports: conversion.verifyReady,
        full_json_ready_reports: conversion.fullJsonReady,
        public_page_ready_reports: conversion.publicPageReady,
        conversion_ready_reports: conversion.conversionReady,
        conversion_rate_proxy: 0,

        last_seen_at: now
      };

  const next = recalculateNicheAverages(nextBase);

  return [
    next,
    ...current.filter((item) => item.niche !== niche)
  ]
    .sort((a, b) => scoreNichePerformance(b) - scoreNichePerformance(a))
    .slice(0, 100);
}

export function updateSourcePerformanceFromAsset(
  current: SourcePerformance[] = [],
  asset: EarningAsset
): SourcePerformance[] {
  const now = Date.now();
  const sourceRefs = extractSourceRefs(asset);

  if (sourceRefs.length === 0) return current;

  let nextState = [...current];

  for (const ref of sourceRefs) {
    const projected = getProjectedMarketValueUsd(asset);
    const marketScore = getMarketValueScore(asset);
    const price = getPriceNok(asset);
    const verifiedRevenue = getVerifiedRevenueNok(asset);
    const verifiedUnlock = getVerifiedUnlockCount(asset);
    const conversion = getConversionStats(asset);

    const existing = nextState.find((item) => item.source_id === ref.source_id);

    const nextBase: SourcePerformance = existing
      ? {
          ...existing,
          source_name: existing.source_name || ref.source_name,
          source_url: existing.source_url || ref.source_url,
          source_category: existing.source_category || ref.source_category,
          source_priority: existing.source_priority || ref.source_priority,
          reports_created: existing.reports_created + 1,
          total_projected_market_value_usd: round2(existing.total_projected_market_value_usd + projected),
          total_market_value_score: round3(existing.total_market_value_score + marketScore),
          total_price_nok: round2(existing.total_price_nok + price),
          verified_unlocks: existing.verified_unlocks + verifiedUnlock,
          verified_revenue_nok: round2(existing.verified_revenue_nok + verifiedRevenue),

          sellable_reports: safeNumber(existing.sellable_reports, 0) + conversion.sellable,
          payment_available_reports: safeNumber(existing.payment_available_reports, 0) + conversion.paymentAvailable,
          verify_ready_reports: safeNumber(existing.verify_ready_reports, 0) + conversion.verifyReady,
          full_json_ready_reports: safeNumber(existing.full_json_ready_reports, 0) + conversion.fullJsonReady,
          public_page_ready_reports: safeNumber(existing.public_page_ready_reports, 0) + conversion.publicPageReady,
          conversion_ready_reports: safeNumber(existing.conversion_ready_reports, 0) + conversion.conversionReady,

          last_seen_at: now
        }
      : {
          source_id: ref.source_id,
          source_name: ref.source_name,
          source_url: ref.source_url,
          source_category: ref.source_category,
          source_priority: ref.source_priority,
          reports_created: 1,
          total_projected_market_value_usd: round2(projected),
          average_projected_market_value_usd: 0,
          total_market_value_score: round3(marketScore),
          average_market_value_score: 0,
          total_price_nok: round2(price),
          average_price_nok: 0,
          verified_unlocks: verifiedUnlock,
          verified_revenue_nok: round2(verifiedRevenue),

          sellable_reports: conversion.sellable,
          payment_available_reports: conversion.paymentAvailable,
          verify_ready_reports: conversion.verifyReady,
          full_json_ready_reports: conversion.fullJsonReady,
          public_page_ready_reports: conversion.publicPageReady,
          conversion_ready_reports: conversion.conversionReady,
          conversion_rate_proxy: 0,

          last_seen_at: now
        };

    const next = recalculateSourceAverages(nextBase);

    nextState = [
      next,
      ...nextState.filter((item) => item.source_id !== ref.source_id)
    ];
  }

  return nextState
    .sort((a, b) => scoreSourcePerformance(b) - scoreSourcePerformance(a))
    .slice(0, 200);
}

export function scoreNichePerformance(item: NichePerformance): number {
  const projectedScore = Math.min(1, item.average_projected_market_value_usd / 50000);
  const marketScore = clamp01(item.average_market_value_score);
  const priceScore = Math.min(1, item.average_price_nok / 499);
  const verifiedUnlockScore = Math.min(1, item.verified_unlocks / 10);
  const verifiedRevenueScore = Math.min(1, item.verified_revenue_nok / 5000);
  const activityScore = Math.min(1, item.reports_created / 20);

  const conversionReadyScore = Math.min(1, safeNumber(item.conversion_ready_reports ?? item.sellable_reports, 0) / 10);
  const conversionRateScore = clamp01(item.conversion_rate_proxy);
  const paymentReadyScore = Math.min(1, safeNumber(item.payment_available_reports, 0) / Math.max(1, item.reports_created));
  const verifyReadyScore = Math.min(1, safeNumber(item.verify_ready_reports, 0) / Math.max(1, item.reports_created));

  return round3(
    projectedScore * 0.14 +
      marketScore * 0.18 +
      priceScore * 0.12 +
      conversionReadyScore * 0.17 +
      conversionRateScore * 0.11 +
      paymentReadyScore * 0.08 +
      verifyReadyScore * 0.07 +
      verifiedUnlockScore * 0.08 +
      verifiedRevenueScore * 0.03 +
      activityScore * 0.02
  );
}

export function scoreSourcePerformance(item: SourcePerformance): number {
  const projectedScore = Math.min(1, item.average_projected_market_value_usd / 50000);
  const marketScore = clamp01(item.average_market_value_score);
  const priceScore = Math.min(1, item.average_price_nok / 499);
  const verifiedUnlockScore = Math.min(1, item.verified_unlocks / 10);
  const verifiedRevenueScore = Math.min(1, item.verified_revenue_nok / 5000);
  const priorityScore = Math.min(1, Number(item.source_priority || 0) / 100);
  const activityScore = Math.min(1, item.reports_created / 20);

  const conversionReadyScore = Math.min(1, safeNumber(item.conversion_ready_reports ?? item.sellable_reports, 0) / 10);
  const conversionRateScore = clamp01(item.conversion_rate_proxy);
  const paymentReadyScore = Math.min(1, safeNumber(item.payment_available_reports, 0) / Math.max(1, item.reports_created));
  const verifyReadyScore = Math.min(1, safeNumber(item.verify_ready_reports, 0) / Math.max(1, item.reports_created));

  return round3(
    projectedScore * 0.13 +
      marketScore * 0.16 +
      priceScore * 0.1 +
      conversionReadyScore * 0.17 +
      conversionRateScore * 0.1 +
      paymentReadyScore * 0.07 +
      verifyReadyScore * 0.07 +
      verifiedUnlockScore * 0.07 +
      verifiedRevenueScore * 0.03 +
      priorityScore * 0.08 +
      activityScore * 0.02
  );
}

export function selectSourcesForCycle(input: SourceSelectionInput): SourceSelectionResult {
  const enabled = input.allSources
    .filter((source) => source.enabled)
    .sort((a, b) => b.priority - a.priority);

  if (enabled.length === 0) {
    return {
      selectedSources: [],
      reason: 'No enabled sources available.'
    };
  }

  const sourcePerformance = input.sourcePerformance || [];
  const maxSources = Math.max(1, input.maxSources || 3);

  const performanceById = new Map(
    sourcePerformance.map((item) => [item.source_id, item])
  );

  const topPriority = enabled[0];

  const reinforcedConversion = enabled
    .filter((source) => {
      const perf = performanceById.get(source.id);
      return perf && safeNumber(perf.conversion_ready_reports ?? perf.sellable_reports, 0) > 0;
    })
    .sort((a, b) => {
      const perfA = performanceById.get(a.id) as SourcePerformance;
      const perfB = performanceById.get(b.id) as SourcePerformance;

      return scoreSourcePerformance(perfB) - scoreSourcePerformance(perfA);
    })[0];

  const reinforcedProjected = enabled
    .filter((source) => performanceById.has(source.id))
    .sort((a, b) => {
      const perfA = performanceById.get(a.id) as SourcePerformance;
      const perfB = performanceById.get(b.id) as SourcePerformance;

      return scoreSourcePerformance(perfB) - scoreSourcePerformance(perfA);
    })[0];

  const underused = enabled
    .filter((source) => {
      const perf = performanceById.get(source.id);
      return !perf || perf.reports_created <= 1;
    })
    .sort((a, b) => b.priority - a.priority)[0];

  const selected: SourceLike[] = [];

  for (const source of [reinforcedConversion, topPriority, reinforcedProjected, underused]) {
    if (!source) continue;
    if (selected.some((item) => item.id === source.id)) continue;
    selected.push(source);
    if (selected.length >= maxSources) break;
  }

  for (const source of enabled) {
    if (selected.length >= maxSources) break;
    if (selected.some((item) => item.id === source.id)) continue;
    selected.push(source);
  }

  return {
    selectedSources: selected.slice(0, maxSources),
    reason:
      'Selected mix of conversion-ready reinforced sources, top-priority sources, projected-value performers, and underused sources. Projected value is prioritization only; treasury revenue still requires verified external payment.'
  };
}

export function summarizePerformance(state: PerformanceState) {
  const topNiche = [...(state.niche_performance || [])]
    .sort((a, b) => scoreNichePerformance(b) - scoreNichePerformance(a))[0];

  const topSource = [...(state.source_performance || [])]
    .sort((a, b) => scoreSourcePerformance(b) - scoreSourcePerformance(a))[0];

  return {
    accounting_policy: {
      projected_values_are_not_revenue: true,
      verified_revenue_only: true,
      projected_value_label: 'projected_market_value_only_not_verified_revenue',
      revenue_label: 'verified_external_payment_only'
    },
    top_niche: topNiche
      ? {
          niche: topNiche.niche,
          score: scoreNichePerformance(topNiche),
          reports_created: topNiche.reports_created,
          average_projected_market_value_usd: topNiche.average_projected_market_value_usd,
          projected_value_label: 'projected_market_value_only_not_verified_revenue',
          average_market_value_score: topNiche.average_market_value_score,
          average_price_nok: topNiche.average_price_nok,
          sellable_reports: topNiche.sellable_reports || 0,
          conversion_ready_reports: topNiche.conversion_ready_reports || topNiche.sellable_reports || 0,
          conversion_rate_proxy: topNiche.conversion_rate_proxy || 0,
          payment_available_reports: topNiche.payment_available_reports || 0,
          verify_ready_reports: topNiche.verify_ready_reports || 0,
          verified_unlocks: topNiche.verified_unlocks,
          verified_revenue_nok: topNiche.verified_revenue_nok,
          revenue_label: 'verified_external_payment_only'
        }
      : null,
    top_source: topSource
      ? {
          source_id: topSource.source_id,
          source_name: topSource.source_name,
          score: scoreSourcePerformance(topSource),
          reports_created: topSource.reports_created,
          average_projected_market_value_usd: topSource.average_projected_market_value_usd,
          projected_value_label: 'projected_market_value_only_not_verified_revenue',
          average_market_value_score: topSource.average_market_value_score,
          average_price_nok: topSource.average_price_nok,
          sellable_reports: topSource.sellable_reports || 0,
          conversion_ready_reports: topSource.conversion_ready_reports || topSource.sellable_reports || 0,
          conversion_rate_proxy: topSource.conversion_rate_proxy || 0,
          payment_available_reports: topSource.payment_available_reports || 0,
          verify_ready_reports: topSource.verify_ready_reports || 0,
          verified_unlocks: topSource.verified_unlocks,
          verified_revenue_nok: topSource.verified_revenue_nok,
          revenue_label: 'verified_external_payment_only'
        }
      : null
  };
}