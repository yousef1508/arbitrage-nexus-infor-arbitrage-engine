import type { EarningAsset, Opportunity } from './types';
import type { NichePerformance, SourcePerformance } from './performance-scoring';
import {
  scoreNichePerformance,
  scoreSourcePerformance,
  summarizePerformance
} from './performance-scoring';

export type MarketStatsInput = {
  earning_assets?: EarningAsset[];
  opportunities?: Opportunity[];
  niche_performance?: NichePerformance[];
  source_performance?: SourcePerformance[];
  now?: number;
};

export type MarketStats = {
  generated_at: number;
  generated_at_iso: string;

  accounting_policy: {
    verified_revenue_only: true;
    projected_values_are_not_revenue: true;
    estimated_revenue_excluded_from_ledger: true;
    treasury_credit_requires_verified_payment: true;
    projected_value_label: 'projected_market_value_only_not_verified_revenue';
    revenue_label: 'verified_external_payment_only';
  };

  totals: {
    reports_created: number;
    opportunities_created: number;
    verified_unlocks: number;
    verified_revenue_nok: number;
    awaiting_conversion: number;
    pending_verification: number;
    locked_reports: number;
    unlocked_reports: number;
    projected_inventory_value_usd: number;
    projected_inventory_value_nok: number;
    estimated_revenue_nok_excluded: number;
  };

  conversion: {
    sellable_reports: number;
    unsellable_reports: number;
    payment_configured_reports: number;
    payment_available_reports: number;
    payment_unavailable_reports: number;
    verify_route_ready_reports: number;
    full_json_route_ready_reports: number;
    public_page_ready_reports: number;
    reports_missing_payment_address: number;
    reports_missing_verify_payment_url: number;
    reports_missing_full_json_url: number;
    reports_missing_public_page_url: number;
    locked_sellable_reports: number;
    unlocked_without_verified_payment: number;
    conversion_ready: boolean;
    conversion_blockers: string[];
  };

  today: {
    reports_created_today: number;
    opportunities_created_today: number;
    verified_unlocks_today: number;
    verified_revenue_today_nok: number;
    average_dynamic_price_nok_today: number;
    average_projected_market_value_usd_today: number;
  };

  averages: {
    average_dynamic_price_nok: number;
    average_projected_market_value_usd: number;
    average_projected_market_value_nok: number;
    average_market_value_score: number;
    average_verified_revenue_nok: number;
  };

  top: {
    top_niche: ReturnType<typeof summarizePerformance>['top_niche'];
    top_source: ReturnType<typeof summarizePerformance>['top_source'];
    top_reports: Array<{
      id: string;
      slug?: string;
      title: string;
      niche: string;
      price_nok: number;
      projected_market_value_usd: number;
      projected_market_value_nok: number;
      projected_value_label: 'projected_market_value_only_not_verified_revenue';
      market_value_score: number;
      verified_revenue_nok: number;
      verified_payment: boolean;
      unlock_status: string;
      payout_status: string;
      created_at: number;

      public_page_url?: string;
      metadata_url?: string;
      preview_url?: string;
      full_json_url?: string;
      verify_payment_url?: string;
      payment_available: boolean;
      conversion_ready: boolean;
    }>;
  };

  production: {
    scanner_health: 'healthy' | 'warming_up' | 'no_reports' | 'needs_attention';
    reinforcement_ready: boolean;
    verified_revenue_ready: boolean;
    conversion_ready: boolean;
    recommended_mode: 'stability' | 'balanced' | 'growth' | 'aggressive';
    notes: string[];
  };

  niche_performance: Array<NichePerformance & { score: number }>;
  source_performance: Array<SourcePerformance & { score: number }>;
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

function safeAverage(values: number[]): number {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length === 0) return 0;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function cleanText(value: unknown): string {
  return String(value ?? '')
    .replace(/\uFFFD/g, '')
    .replace(/�/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getProjectedMarketValueUsd(assetOrOpp: any): number {
  const value = Number(
    assetOrOpp?.projected_market_value_usd ??
      assetOrOpp?.full_report_json?.projected_market_value_usd ??
      assetOrOpp?.full_report_json?.pricing?.projected_market_value_usd ??
      assetOrOpp?.potential_profit ??
      0
  );

  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getProjectedMarketValueNok(assetOrOpp: any): number {
  const value = Number(
    assetOrOpp?.projected_market_value_nok ??
      assetOrOpp?.full_report_json?.projected_market_value_nok ??
      assetOrOpp?.full_report_json?.pricing?.projected_market_value_nok ??
      0
  );

  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getMarketValueScore(assetOrOpp: any): number {
  const value = Number(
    assetOrOpp?.market_value_score ??
      assetOrOpp?.full_report_json?.market_value_score ??
      assetOrOpp?.full_report_json?.pricing?.market_value_score ??
      0
  );

  return Number.isFinite(value) && value > 0 ? value : 0;
}

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function hasVerifiedPayment(asset: EarningAsset): boolean {
  const verifiedRevenue = safeNumber((asset as any).verified_revenue_nok, 0);
  const paymentVerification = (asset as any).payment_verification || {};
  const paidTxHash = String((asset as any).paid_tx_hash || '').trim();

  if ((asset as any).payout_status === 'verified') {
    return true;
  }

  if ((asset as any).status === 'verified') {
    return true;
  }

  if (paymentVerification.success === true) {
    return true;
  }

  if (paidTxHash && verifiedRevenue > 0) {
    return true;
  }

  return false;
}

function getVerifiedRevenueNok(asset: EarningAsset): number {
  if (!hasVerifiedPayment(asset)) {
    return 0;
  }

  return Math.max(0, safeNumber((asset as any).verified_revenue_nok, 0));
}

function getExcludedEstimatedRevenueNok(asset: EarningAsset): number {
  const estimated = Math.max(0, safeNumber((asset as any).estimated_revenue_nok, 0));
  const verified = getVerifiedRevenueNok(asset);

  return Math.max(0, estimated - verified);
}

function getAssetSlug(asset: any): string {
  return cleanText(asset?.slug || asset?.report_slug || asset?.id || '');
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

function getMetadataUrl(asset: any): string {
  return cleanText(
    asset?.metadata_url ||
      asset?.full_report_json?.urls?.metadata_json ||
      ''
  );
}

function getPreviewUrl(asset: any): string {
  return cleanText(
    asset?.preview_url ||
      asset?.full_report_json?.urls?.preview_json ||
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

function hasPublicReportRoute(asset: any): boolean {
  const pageUrl = getPublicPageUrl(asset);
  const slug = getAssetSlug(asset);

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

function hasPaymentAvailable(asset: any): boolean {
  const address = getPaymentAddress(asset);
  const paymentAvailable =
    asset?.payment_available === true ||
    asset?.full_report_json?.payment_request?.payment_available === true ||
    asset?.payment_request?.payment_available === true;

  return Boolean(address || paymentAvailable);
}

function isReportSellable(asset: any): boolean {
  return (
    Number(asset?.price_nok || 0) > 0 &&
    hasPublicReportRoute(asset) &&
    hasFullJsonRoute(asset) &&
    hasVerifyPaymentRoute(asset) &&
    hasPaymentAvailable(asset)
  );
}

function determineRecommendedMode(params: {
  reports: number;
  verifiedUnlocks: number;
  avgMarketValue: number;
  avgPrice: number;
  sourcePerfCount: number;
  nichePerfCount: number;
  sellableReports: number;
}): 'stability' | 'balanced' | 'growth' | 'aggressive' {
  const {
    reports,
    verifiedUnlocks,
    avgMarketValue,
    avgPrice,
    sourcePerfCount,
    nichePerfCount,
    sellableReports
  } = params;

  if (reports < 5 || sellableReports === 0 || sourcePerfCount < 2 || nichePerfCount < 2) {
    return 'stability';
  }

  if (verifiedUnlocks >= 5 && avgMarketValue >= 0.7 && avgPrice >= 99) {
    return 'aggressive';
  }

  if (reports >= 15 && sellableReports >= 10 && avgMarketValue >= 0.6 && avgPrice >= 99) {
    return 'growth';
  }

  return 'balanced';
}

function determineScannerHealth(params: {
  reports: number;
  sourcePerfCount: number;
  nichePerfCount: number;
  recentReports: number;
  sellableReports: number;
}): MarketStats['production']['scanner_health'] {
  if (params.reports === 0) return 'no_reports';
  if (params.sourcePerfCount === 0 || params.nichePerfCount === 0) return 'warming_up';
  if (params.sellableReports === 0) return 'needs_attention';
  if (params.recentReports === 0 && params.reports > 0) return 'needs_attention';
  return 'healthy';
}

function buildConversionStats(assets: EarningAsset[]): MarketStats['conversion'] {
  const paymentConfigured = assets.filter((asset) => Boolean(getPaymentAddress(asset)));
  const paymentAvailable = assets.filter(hasPaymentAvailable);
  const verifyReady = assets.filter(hasVerifyPaymentRoute);
  const fullJsonReady = assets.filter(hasFullJsonRoute);
  const publicPageReady = assets.filter(hasPublicReportRoute);
  const sellable = assets.filter(isReportSellable);

  const unlockedWithoutVerifiedPayment = assets.filter((asset) => {
    return (asset as any).unlock_status === 'unlocked' && !hasVerifiedPayment(asset);
  });

  const lockedSellable = sellable.filter((asset) => (asset as any).unlock_status !== 'unlocked');

  const blockers: string[] = [];

  if (assets.length === 0) {
    blockers.push('NO_REPORT_INVENTORY');
  }

  if (paymentAvailable.length === 0 && assets.length > 0) {
    blockers.push('NO_REPORT_HAS_PUBLIC_PAYMENT_AVAILABLE');
  }

  if (verifyReady.length === 0 && assets.length > 0) {
    blockers.push('NO_REPORT_HAS_PUBLIC_VERIFY_PAYMENT_ROUTE');
  }

  if (fullJsonReady.length === 0 && assets.length > 0) {
    blockers.push('NO_REPORT_HAS_FULL_JSON_ROUTE');
  }

  if (publicPageReady.length === 0 && assets.length > 0) {
    blockers.push('NO_REPORT_HAS_PUBLIC_PAGE_ROUTE');
  }

  if (sellable.length === 0 && assets.length > 0) {
    blockers.push('NO_SELLABLE_REPORTS');
  }

  if (unlockedWithoutVerifiedPayment.length > 0) {
    blockers.push('UNLOCKED_REPORTS_WITHOUT_VERIFIED_PAYMENT');
  }

  return {
    sellable_reports: sellable.length,
    unsellable_reports: Math.max(0, assets.length - sellable.length),
    payment_configured_reports: paymentConfigured.length,
    payment_available_reports: paymentAvailable.length,
    payment_unavailable_reports: Math.max(0, assets.length - paymentAvailable.length),
    verify_route_ready_reports: verifyReady.length,
    full_json_route_ready_reports: fullJsonReady.length,
    public_page_ready_reports: publicPageReady.length,
    reports_missing_payment_address: Math.max(0, assets.length - paymentConfigured.length),
    reports_missing_verify_payment_url: Math.max(0, assets.length - verifyReady.length),
    reports_missing_full_json_url: Math.max(0, assets.length - fullJsonReady.length),
    reports_missing_public_page_url: Math.max(0, assets.length - publicPageReady.length),
    locked_sellable_reports: lockedSellable.length,
    unlocked_without_verified_payment: unlockedWithoutVerifiedPayment.length,
    conversion_ready: sellable.length > 0 && blockers.filter((item) => item !== 'UNLOCKED_REPORTS_WITHOUT_VERIFIED_PAYMENT').length === 0,
    conversion_blockers: Array.from(new Set(blockers))
  };
}

export function buildMarketStats(input: MarketStatsInput): MarketStats {
  const now = input.now || Date.now();
  const dayStart = startOfDay(now);

  const assets = Array.isArray(input.earning_assets) ? input.earning_assets : [];
  const opportunities = Array.isArray(input.opportunities) ? input.opportunities : [];
  const nichePerformance = Array.isArray(input.niche_performance) ? input.niche_performance : [];
  const sourcePerformance = Array.isArray(input.source_performance) ? input.source_performance : [];

  const reportsToday = assets.filter((asset) => Number((asset as any).created_at || 0) >= dayStart);
  const opportunitiesToday = opportunities.filter((opp) => Number((opp as any).created_at || 0) >= dayStart);

  const verifiedPaymentAssets = assets.filter(hasVerifiedPayment);

  const verifiedPaymentAssetsToday = verifiedPaymentAssets.filter((asset) =>
    Number((asset as any).paid_at || (asset as any).updated_at || (asset as any).created_at || 0) >= dayStart
  );

  const lockedAssets = assets.filter((asset) => (asset as any).unlock_status !== 'unlocked');
  const unlockedAssets = assets.filter((asset) => (asset as any).unlock_status === 'unlocked');

  const awaitingConversion = assets.filter((asset) =>
    (asset as any).payout_status === 'awaiting_conversion'
  );

  const pendingVerification = assets.filter((asset) =>
    (asset as any).payout_status === 'pending_verification'
  );

  const conversion = buildConversionStats(assets);

  const avgPrice = round2(
    safeAverage(assets.map((asset) => Number((asset as any).price_nok || 0)))
  );

  const avgPriceToday = round2(
    safeAverage(reportsToday.map((asset) => Number((asset as any).price_nok || 0)))
  );

  const avgProjectedUsd = round2(
    safeAverage(assets.map((asset) => getProjectedMarketValueUsd(asset)))
  );

  const avgProjectedNok = round2(
    safeAverage(assets.map((asset) => getProjectedMarketValueNok(asset)))
  );

  const avgProjectedToday = round2(
    safeAverage(reportsToday.map((asset) => getProjectedMarketValueUsd(asset)))
  );

  const avgMarketValueScore = round3(
    safeAverage(assets.map((asset) => getMarketValueScore(asset)))
  );

  const projectedInventoryValueUsd = round2(
    assets.reduce((sum, asset) => sum + getProjectedMarketValueUsd(asset), 0)
  );

  const projectedInventoryValueNok = round2(
    assets.reduce((sum, asset) => sum + getProjectedMarketValueNok(asset), 0)
  );

  const totalVerifiedRevenue = round2(
    assets.reduce((sum, asset) => sum + getVerifiedRevenueNok(asset), 0)
  );

  const totalVerifiedRevenueToday = round2(
    verifiedPaymentAssetsToday.reduce((sum, asset) => sum + getVerifiedRevenueNok(asset), 0)
  );

  const averageVerifiedRevenue = round2(
    safeAverage(verifiedPaymentAssets.map((asset) => getVerifiedRevenueNok(asset)))
  );

  const estimatedRevenueExcluded = round2(
    assets.reduce((sum, asset) => sum + getExcludedEstimatedRevenueNok(asset), 0)
  );

  const performanceSummary = summarizePerformance({
    niche_performance: nichePerformance,
    source_performance: sourcePerformance
  });

  const rankedNiches = nichePerformance
    .map((item) => ({
      ...item,
      score: scoreNichePerformance(item)
    }))
    .sort((a, b) => b.score - a.score);

  const rankedSources = sourcePerformance
    .map((item) => ({
      ...item,
      score: scoreSourcePerformance(item)
    }))
    .sort((a, b) => b.score - a.score);

  const topReports = [...assets]
    .sort((a, b) => {
      const sellableDelta = Number(isReportSellable(b)) - Number(isReportSellable(a));
      if (sellableDelta !== 0) return sellableDelta;

      const marketDelta = getMarketValueScore(b) - getMarketValueScore(a);
      if (marketDelta !== 0) return marketDelta;

      const projectedDelta = getProjectedMarketValueUsd(b) - getProjectedMarketValueUsd(a);
      if (projectedDelta !== 0) return projectedDelta;

      return Number((b as any).price_nok || 0) - Number((a as any).price_nok || 0);
    })
    .slice(0, 10)
    .map((asset) => ({
      id: (asset as any).id,
      slug: (asset as any).slug,
      title: (asset as any).title,
      niche: (asset as any).niche,
      price_nok: Number((asset as any).price_nok || 0),
      projected_market_value_usd: round2(getProjectedMarketValueUsd(asset)),
      projected_market_value_nok: round2(getProjectedMarketValueNok(asset)),
      projected_value_label: 'projected_market_value_only_not_verified_revenue' as const,
      market_value_score: round3(getMarketValueScore(asset)),
      verified_revenue_nok: round2(getVerifiedRevenueNok(asset)),
      verified_payment: hasVerifiedPayment(asset),
      unlock_status: cleanText((asset as any).unlock_status || 'locked'),
      payout_status: cleanText((asset as any).payout_status || 'awaiting_conversion'),
      created_at: Number((asset as any).created_at || 0),

      public_page_url: getPublicPageUrl(asset) || undefined,
      metadata_url: getMetadataUrl(asset) || undefined,
      preview_url: getPreviewUrl(asset) || undefined,
      full_json_url: getFullJsonUrl(asset) || undefined,
      verify_payment_url: getVerifyPaymentUrl(asset) || undefined,
      payment_available: hasPaymentAvailable(asset),
      conversion_ready: isReportSellable(asset)
    }));

  const recentReports = assets.filter((asset) => {
    return now - Number((asset as any).created_at || 0) <= 24 * 60 * 60 * 1000;
  }).length;

  const scannerHealth = determineScannerHealth({
    reports: assets.length,
    sourcePerfCount: sourcePerformance.length,
    nichePerfCount: nichePerformance.length,
    recentReports,
    sellableReports: conversion.sellable_reports
  });

  const recommendedMode = determineRecommendedMode({
    reports: assets.length,
    verifiedUnlocks: verifiedPaymentAssets.length,
    avgMarketValue: avgMarketValueScore,
    avgPrice,
    sourcePerfCount: sourcePerformance.length,
    nichePerfCount: nichePerformance.length,
    sellableReports: conversion.sellable_reports
  });

  const notes: string[] = [
    'Projected market value is strategic prioritization data only, not verified revenue.',
    'Estimated revenue is excluded from treasury and ledger totals.',
    'Verified revenue is counted only from assets with verified payment evidence.',
    'Conversion readiness requires public report page, full JSON route, verify-payment route, positive price, and public payment address.'
  ];

  if (assets.length === 0) {
    notes.push('No reports created yet. Run ingestion to generate market inventory.');
  }

  if (conversion.sellable_reports === 0 && assets.length > 0) {
    notes.push(`No sellable reports detected. Blockers: ${conversion.conversion_blockers.join(', ') || 'unknown'}.`);
  }

  if (conversion.locked_sellable_reports > 0) {
    notes.push(`${conversion.locked_sellable_reports} locked reports are sellable through the public payment/unlock flow.`);
  }

  if (sourcePerformance.length === 0 || nichePerformance.length === 0) {
    notes.push('Reinforcement memory is still warming up.');
  }

  if (verifiedPaymentAssets.length === 0) {
    notes.push('No verified unlocks yet. Keep treasury revenue at zero until external payment verification.');
  }

  if (unlockedAssets.length > verifiedPaymentAssets.length) {
    notes.push('Some reports are unlocked without verified payment evidence; do not count those unlocks as revenue.');
  }

  if (avgMarketValueScore >= 0.7 && avgPrice >= 99 && conversion.sellable_reports > 0) {
    notes.push('Generated inventory has strong market-value indicators and at least one sellable report. Continue reinforcement and indexing.');
  }

  return {
    generated_at: now,
    generated_at_iso: new Date(now).toISOString(),

    accounting_policy: {
      verified_revenue_only: true,
      projected_values_are_not_revenue: true,
      estimated_revenue_excluded_from_ledger: true,
      treasury_credit_requires_verified_payment: true,
      projected_value_label: 'projected_market_value_only_not_verified_revenue',
      revenue_label: 'verified_external_payment_only'
    },

    totals: {
      reports_created: assets.length,
      opportunities_created: opportunities.length,
      verified_unlocks: verifiedPaymentAssets.length,
      verified_revenue_nok: totalVerifiedRevenue,
      awaiting_conversion: awaitingConversion.length,
      pending_verification: pendingVerification.length,
      locked_reports: lockedAssets.length,
      unlocked_reports: unlockedAssets.length,
      projected_inventory_value_usd: projectedInventoryValueUsd,
      projected_inventory_value_nok: projectedInventoryValueNok,
      estimated_revenue_nok_excluded: estimatedRevenueExcluded
    },

    conversion,

    today: {
      reports_created_today: reportsToday.length,
      opportunities_created_today: opportunitiesToday.length,
      verified_unlocks_today: verifiedPaymentAssetsToday.length,
      verified_revenue_today_nok: totalVerifiedRevenueToday,
      average_dynamic_price_nok_today: avgPriceToday,
      average_projected_market_value_usd_today: avgProjectedToday
    },

    averages: {
      average_dynamic_price_nok: avgPrice,
      average_projected_market_value_usd: avgProjectedUsd,
      average_projected_market_value_nok: avgProjectedNok,
      average_market_value_score: avgMarketValueScore,
      average_verified_revenue_nok: averageVerifiedRevenue
    },

    top: {
      top_niche: performanceSummary.top_niche,
      top_source: performanceSummary.top_source,
      top_reports: topReports
    },

    production: {
      scanner_health: scannerHealth,
      reinforcement_ready: nichePerformance.length > 0 && sourcePerformance.length > 0,
      verified_revenue_ready: verifiedPaymentAssets.length > 0,
      conversion_ready: conversion.conversion_ready,
      recommended_mode: recommendedMode,
      notes
    },

    niche_performance: rankedNiches,
    source_performance: rankedSources
  };
}

export function buildMarketStatsTextSummary(stats: MarketStats): string {
  return [
    `reports=${stats.totals.reports_created}`,
    `today=${stats.today.reports_created_today}`,
    `avg_price_nok=${stats.averages.average_dynamic_price_nok}`,
    `avg_projected_usd=${stats.averages.average_projected_market_value_usd}`,
    `projected_label=${stats.accounting_policy.projected_value_label}`,
    `top_niche=${stats.top.top_niche?.niche || 'none'}`,
    `top_source=${stats.top.top_source?.source_id || 'none'}`,
    `sellable_reports=${stats.conversion.sellable_reports}`,
    `conversion_ready=${stats.conversion.conversion_ready}`,
    `conversion_blockers=${stats.conversion.conversion_blockers.join('|') || 'none'}`,
    `verified_unlocks=${stats.totals.verified_unlocks}`,
    `verified_revenue_nok=${stats.totals.verified_revenue_nok}`,
    `estimated_revenue_excluded_nok=${stats.totals.estimated_revenue_nok_excluded}`,
    `revenue_policy=${stats.accounting_policy.revenue_label}`,
    `scanner_health=${stats.production.scanner_health}`,
    `recommended_mode=${stats.production.recommended_mode}`
  ].join(' ');
}