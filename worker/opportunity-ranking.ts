import type { AgentRole, Opportunity } from './types';
import type { NichePerformance, SourcePerformance } from './performance-scoring';
import {
  scoreNichePerformance,
  scoreSourcePerformance
} from './performance-scoring';

export type ProductionMode =
  | 'stability'
  | 'balanced'
  | 'growth'
  | 'aggressive';

export type ProductionLimits = {
  mode: ProductionMode;
  max_sources_per_cycle: number;
  max_signals_analyzed_per_cycle: number;
  max_opportunities_executed_per_cycle: number;
  max_agents_per_opportunity: number;
  min_confidence_score: number;
  max_risk_score: number;
  min_market_value_score: number;
};

export type OpportunityRankingContext = {
  niche_performance?: NichePerformance[];
  source_performance?: SourcePerformance[];
  production_mode?: ProductionMode;
};

export type RankedOpportunity = Opportunity & {
  ranking_score: number;
  ranking_reason: string;
  projected_market_value_usd: number;
  recommended_price_nok: number;
  selected_agents: AgentRole[];
};

export type ExecutionPlan = {
  opportunities: RankedOpportunity[];
  skipped: Array<{
    id: string;
    title: string;
    reason: string;
  }>;
  limits: ProductionLimits;
};

export type SignalMetadata = {
  source_id?: string;
  source_name?: string;
  source_url?: string;
  source_category?: string;
  source_priority?: number;
  niche?: string;
};

export type RankedSignal = {
  signal: string;
  ranking_score: number;
  metadata: SignalMetadata;
  ranking_reason: string;
};

const DEFAULT_MODE: ProductionMode = 'stability';

const AGENT_PRIORITY: AgentRole[] = [
  'content_arb',
  'affiliate',
  'lead_gen',
  'referral',
  'resale',
  'trading',
  'scout',
  'analyst',
  'router'
];

function round3(value: number): number {
  return Number(Number(value || 0).toFixed(3));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number(value || 0)));
}

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

export function getProductionLimits(mode: ProductionMode = DEFAULT_MODE): ProductionLimits {
  if (mode === 'aggressive') {
    return {
      mode,
      max_sources_per_cycle: 5,
      max_signals_analyzed_per_cycle: 3,
      max_opportunities_executed_per_cycle: 3,
      max_agents_per_opportunity: 2,
      min_confidence_score: 0.45,
      max_risk_score: 0.75,
      min_market_value_score: 0.35
    };
  }

  if (mode === 'growth') {
    return {
      mode,
      max_sources_per_cycle: 5,
      max_signals_analyzed_per_cycle: 2,
      max_opportunities_executed_per_cycle: 2,
      max_agents_per_opportunity: 2,
      min_confidence_score: 0.5,
      max_risk_score: 0.7,
      min_market_value_score: 0.4
    };
  }

  if (mode === 'balanced') {
    return {
      mode,
      max_sources_per_cycle: 3,
      max_signals_analyzed_per_cycle: 2,
      max_opportunities_executed_per_cycle: 1,
      max_agents_per_opportunity: 1,
      min_confidence_score: 0.55,
      max_risk_score: 0.65,
      min_market_value_score: 0.45
    };
  }

  return {
    mode: 'stability',
    max_sources_per_cycle: 3,
    max_signals_analyzed_per_cycle: 1,
    max_opportunities_executed_per_cycle: 1,
    max_agents_per_opportunity: 1,
    min_confidence_score: 0.5,
    max_risk_score: 0.75,
    min_market_value_score: 0.3
  };
}

export function parseProductionMode(value: unknown): ProductionMode {
  const normalized = String(value || '').toLowerCase();

  if (
    normalized === 'stability' ||
    normalized === 'balanced' ||
    normalized === 'growth' ||
    normalized === 'aggressive'
  ) {
    return normalized;
  }

  return DEFAULT_MODE;
}

export function extractSignalMetadata(signal: string): SignalMetadata {
  const metadata: SignalMetadata = {};
  const lines = String(signal || '').split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith('Source ID:')) {
      metadata.source_id = line.replace('Source ID:', '').trim();
    } else if (line.startsWith('Source Name:')) {
      metadata.source_name = line.replace('Source Name:', '').trim();
    } else if (line.startsWith('Source URL:')) {
      metadata.source_url = line.replace('Source URL:', '').trim();
    } else if (line.startsWith('Source Category:')) {
      metadata.source_category = line.replace('Source Category:', '').trim();
    } else if (line.startsWith('Source Priority:')) {
      metadata.source_priority = safeNumber(line.replace('Source Priority:', '').trim(), 0);
    } else if (line.startsWith('Niche:')) {
      metadata.niche = line.replace('Niche:', '').trim();
    }
  }

  return metadata;
}

export function extractSourceIdsFromOpportunity(opp: Partial<Opportunity>): string[] {
  const refs = Array.isArray(opp.source_refs) ? opp.source_refs : [];
  const sourceIds: string[] = [];

  for (const raw of refs) {
    const line = String(raw || '').trim();

    if (line.startsWith('Source ID:')) {
      const sourceId = line.replace('Source ID:', '').trim();

      if (sourceId && !sourceIds.includes(sourceId)) {
        sourceIds.push(sourceId);
      }
    }
  }

  return sourceIds;
}

function findNichePerformance(
  niche: string,
  nichePerformance: NichePerformance[] = []
): NichePerformance | undefined {
  const normalized = niche.toLowerCase();

  return nichePerformance.find((item) => {
    return String(item.niche || '').toLowerCase() === normalized;
  });
}

function findBestSourcePerformance(
  sourceIds: string[],
  sourcePerformance: SourcePerformance[] = []
): SourcePerformance | undefined {
  const matches = sourcePerformance.filter((item) =>
    sourceIds.includes(item.source_id)
  );

  return matches.sort((a, b) => scoreSourcePerformance(b) - scoreSourcePerformance(a))[0];
}

export function scoreSignalForAnalysis(
  signal: string,
  sourcePerformance: SourcePerformance[] = []
): RankedSignal {
  const metadata = extractSignalMetadata(signal);
  const priorityScore = Math.min(1, safeNumber(metadata.source_priority, 0) / 100);

  const matchedPerformance = metadata.source_id
    ? sourcePerformance.find((item) => item.source_id === metadata.source_id)
    : undefined;

  const performanceScore = matchedPerformance
    ? scoreSourcePerformance(matchedPerformance)
    : 0;

  const underusedBoost =
    !matchedPerformance || matchedPerformance.reports_created <= 1 ? 0.15 : 0;

  const sourceText = [
    metadata.source_id,
    metadata.source_name,
    metadata.source_url,
    metadata.source_category,
    metadata.niche,
    signal
  ].join(' ').toLowerCase();

  const intentBoost =
    sourceText.includes('security') ||
    sourceText.includes('vulnerability') ||
    sourceText.includes('ai') ||
    sourceText.includes('llm') ||
    sourceText.includes('agent') ||
    sourceText.includes('startup') ||
    sourceText.includes('github') ||
    sourceText.includes('openai') ||
    sourceText.includes('anthropic')
      ? 0.1
      : 0;

  const rankingScore = round3(
    priorityScore * 0.35 +
      performanceScore * 0.35 +
      underusedBoost +
      intentBoost
  );

  return {
    signal,
    metadata,
    ranking_score: rankingScore,
    ranking_reason:
      `priority=${priorityScore.toFixed(3)}, performance=${performanceScore.toFixed(3)}, underusedBoost=${underusedBoost.toFixed(3)}, intentBoost=${intentBoost.toFixed(3)}`
  };
}

export function rankSignalsForAnalysis(
  signals: string[],
  sourcePerformance: SourcePerformance[] = [],
  limit = 1
): RankedSignal[] {
  return signals
    .map((signal) => scoreSignalForAnalysis(signal, sourcePerformance))
    .sort((a, b) => b.ranking_score - a.ranking_score)
    .slice(0, Math.max(1, limit));
}

export function normalizeRecommendedAgents(
  recommendedAgents: unknown,
  maxAgents = 1
): AgentRole[] {
  const raw = Array.isArray(recommendedAgents) ? recommendedAgents : [];

  const unique = raw
    .map((role) => String(role || '').trim() as AgentRole)
    .filter((role): role is AgentRole => AGENT_PRIORITY.includes(role))
    .filter((role, index, arr) => arr.indexOf(role) === index)
    .sort((a, b) => AGENT_PRIORITY.indexOf(a) - AGENT_PRIORITY.indexOf(b));

  if (unique.length === 0) {
    return ['content_arb'];
  }

  return unique.slice(0, Math.max(1, maxAgents));
}

export function scoreOpportunity(
  opp: Opportunity,
  context: OpportunityRankingContext = {}
): RankedOpportunity {
  const confidence = clamp01(opp.confidence_score);
  const novelty = clamp01(opp.novelty_score ?? 0.5);
  const urgency = clamp01(opp.urgency_score ?? 0.5);
  const monetization = clamp01(opp.monetization_score ?? 0.5);
  const risk = clamp01(opp.risk_score ?? 0.25);
  const marketValueScore = clamp01(opp.market_value_score ?? 0.5);

  const projectedMarketValueUsd = safeNumber(
    opp.projected_market_value_usd ?? opp.potential_profit,
    0
  );

  const recommendedPriceNok = safeNumber(opp.recommended_price_nok, 49);

  const projectedScore =
    projectedMarketValueUsd >= 50000 ? 1 :
    projectedMarketValueUsd >= 25000 ? 0.85 :
    projectedMarketValueUsd >= 10000 ? 0.7 :
    projectedMarketValueUsd >= 5000 ? 0.55 :
    projectedMarketValueUsd >= 1500 ? 0.4 :
    projectedMarketValueUsd >= 500 ? 0.25 :
    0.1;

  const priceScore =
    recommendedPriceNok >= 499 ? 1 :
    recommendedPriceNok >= 199 ? 0.75 :
    recommendedPriceNok >= 99 ? 0.55 :
    recommendedPriceNok >= 49 ? 0.35 :
    0.15;

  const nichePerf = findNichePerformance(
    normalizeText(opp.niche),
    context.niche_performance || []
  );

  const nichePerformanceScore = nichePerf ? scoreNichePerformance(nichePerf) : 0;

  const sourceIds = extractSourceIdsFromOpportunity(opp);
  const sourcePerf = findBestSourcePerformance(
    sourceIds,
    context.source_performance || []
  );

  const sourcePerformanceScore = sourcePerf ? scoreSourcePerformance(sourcePerf) : 0;

  const text = [
    opp.title,
    opp.summary,
    opp.niche,
    opp.evidence,
    ...(opp.source_refs || [])
  ].join(' ').toLowerCase();

  const strategicKeywordBoost =
    text.includes('security') ||
    text.includes('vulnerability') ||
    text.includes('cve') ||
    text.includes('rce') ||
    text.includes('supply chain') ||
    text.includes('ai') ||
    text.includes('llm') ||
    text.includes('agent') ||
    text.includes('enterprise') ||
    text.includes('legal') ||
    text.includes('ownership') ||
    text.includes('cost optimization')
      ? 0.06
      : 0;

  const riskPenalty = risk * 0.2;

  const rankingScore = round3(
    confidence * 0.16 +
      novelty * 0.1 +
      urgency * 0.12 +
      monetization * 0.16 +
      marketValueScore * 0.18 +
      projectedScore * 0.12 +
      priceScore * 0.06 +
      nichePerformanceScore * 0.05 +
      sourcePerformanceScore * 0.05 +
      strategicKeywordBoost -
      riskPenalty
  );

  const limits = getProductionLimits(context.production_mode || DEFAULT_MODE);

  const selectedAgents = normalizeRecommendedAgents(
    opp.recommended_agents,
    limits.max_agents_per_opportunity
  );

  return {
    ...opp,
    projected_market_value_usd: projectedMarketValueUsd,
    recommended_price_nok: recommendedPriceNok,
    selected_agents: selectedAgents,
    ranking_score: rankingScore,
    ranking_reason:
      `confidence=${confidence}, novelty=${novelty}, urgency=${urgency}, monetization=${monetization}, marketValue=${marketValueScore}, projectedScore=${projectedScore}, priceScore=${priceScore}, nichePerf=${nichePerformanceScore}, sourcePerf=${sourcePerformanceScore}, keywordBoost=${strategicKeywordBoost}, riskPenalty=${riskPenalty.toFixed(3)}`
  };
}

export function shouldExecuteOpportunity(
  ranked: RankedOpportunity,
  limits: ProductionLimits
): { execute: boolean; reason: string } {
  if (ranked.confidence_score < limits.min_confidence_score) {
    return {
      execute: false,
      reason: `confidence_score ${ranked.confidence_score} below minimum ${limits.min_confidence_score}`
    };
  }

  if (ranked.risk_score > limits.max_risk_score) {
    return {
      execute: false,
      reason: `risk_score ${ranked.risk_score} above maximum ${limits.max_risk_score}`
    };
  }

  if ((ranked.market_value_score || 0) < limits.min_market_value_score) {
    return {
      execute: false,
      reason: `market_value_score ${ranked.market_value_score || 0} below minimum ${limits.min_market_value_score}`
    };
  }

  if (!ranked.selected_agents || ranked.selected_agents.length === 0) {
    return {
      execute: false,
      reason: 'no executable agents selected'
    };
  }

  return {
    execute: true,
    reason: 'passed ranking execution gate'
  };
}

export function buildExecutionPlan(
  opportunities: Opportunity[],
  context: OpportunityRankingContext = {}
): ExecutionPlan {
  const limits = getProductionLimits(context.production_mode || DEFAULT_MODE);

  const ranked = opportunities
    .map((opp) => scoreOpportunity(opp, context))
    .sort((a, b) => b.ranking_score - a.ranking_score);

  const executable: RankedOpportunity[] = [];
  const skipped: ExecutionPlan['skipped'] = [];

  for (const opp of ranked) {
    const gate = shouldExecuteOpportunity(opp, limits);

    if (!gate.execute) {
      skipped.push({
        id: opp.id,
        title: opp.title,
        reason: gate.reason
      });
      continue;
    }

    if (executable.length >= limits.max_opportunities_executed_per_cycle) {
      skipped.push({
        id: opp.id,
        title: opp.title,
        reason: 'cycle execution limit reached'
      });
      continue;
    }

    executable.push(opp);
  }

  return {
    opportunities: executable,
    skipped,
    limits
  };
}

export function summarizeExecutionPlan(plan: ExecutionPlan) {
  return {
    mode: plan.limits.mode,
    max_sources_per_cycle: plan.limits.max_sources_per_cycle,
    max_signals_analyzed_per_cycle: plan.limits.max_signals_analyzed_per_cycle,
    max_opportunities_executed_per_cycle: plan.limits.max_opportunities_executed_per_cycle,
    selected_count: plan.opportunities.length,
    skipped_count: plan.skipped.length,
    selected: plan.opportunities.map((opp) => ({
      id: opp.id,
      title: opp.title,
      ranking_score: opp.ranking_score,
      selected_agents: opp.selected_agents,
      projected_market_value_usd: opp.projected_market_value_usd,
      recommended_price_nok: opp.recommended_price_nok,
      reason: opp.ranking_reason
    })),
    skipped: plan.skipped
  };
}