import { adminFetch } from '@/lib/admin-auth';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type {
  Opportunity,
  TreasuryBuckets,
  AgentPerformance,
  LedgerEntry,
  GovernorPolicy,
  AgentTask,
  ReinvestmentProposal,
  IngestRun,
  AgentRole,
  EarningAsset,
  TaxReceipt,
  TreasurySplitPolicy,
  AiQuotaState,
  AiQuotaMode,
  NexusAgentSuggestion,
  NexusCryptoAcquisitionCandidate,
  NexusPatchPlan,
  NexusPatchPlanItem
} from '../../worker/types';
import type {
  NichePerformance,
  SourcePerformance
} from '../../worker/performance-scoring';
import type { MarketStats } from '../../worker/market-stats';
import type { AgentSuggestionSummary } from '../../worker/agent-suggestions';
import type { CryptoAcquisitionAgentRun } from '../../worker/crypto-acquisition-agent';
import type { PatchPlanPublicSummary } from '../../worker/patch-planner';
import { toast } from 'sonner';

/**
 * Information Arbitrage Engine - Centralized State Store
 * Stable selectors + admin-authenticated API calls + normalized server state.
 */

export type ExtendedOpportunity = Opportunity & {
  projected_market_value_usd?: number;
  recommended_price_nok?: number;
  recommended_price_usd?: number;
  market_value_score?: number;
  price_nok?: number;
  price_usd?: number;
  price_tier?: string;
  buyer_type?: string;
  product_type?: string;
  pricing_reasoning?: string;
  ranking_score?: number;
  ranking_reason?: string;
  selected_agents?: AgentRole[];

  report_asset_id?: string;
  report_slug?: string;
  report_url?: string;
  metadata_url?: string;
  preview_url?: string;
  full_json_url?: string;
  verify_payment_url?: string;
  price_crypto_estimate?: string;
  payment_enforcement?: any;
  offer_links?: any[];
  updated_at?: number;
};

export type ExtendedAgentPerformance = AgentPerformance & {
  verifiedRevenue?: number;
};

export type ExtendedGovernorPolicy = Omit<GovernorPolicy, 'production_mode'> & {
  production_mode?: 'stability' | 'balanced' | 'growth' | 'aggressive';
};

export type ManualIngestResult = {
  success: boolean;
  message?: string;
  error?: string;
  deferred?: boolean;
  ai_backoff_remaining_ms?: number;
  next_safe_attempt_at?: number;
  next_safe_attempt_at_iso?: string;
};

interface SystemHealthState {
  status: 'healthy' | 'warning' | 'degraded' | 'down';
  last_check: number;
  last_scan: number;
  issues: string[];
  last_run?: IngestRun;
  kernel_logs: string[];
  failure_count: Record<string, number>;

  ai_quota?: AiQuotaState;
  ai_quota_mode?: AiQuotaMode;
  ai_rate_limited_until?: number;
  ai_rate_limited_until_iso?: string;
  ai_rate_limit_backoff_source?: string;
  ai_rate_limit_last_status?: number;
  ai_rate_limit_last_message?: string;
  ai_next_safe_attempt_at?: number;
  ai_next_safe_attempt_at_iso?: string;

  autonomous_ingestion_enabled?: boolean;
  next_scheduled_cycle_at?: number;
  next_scheduled_cycle_at_iso?: string;
  last_maintenance_at?: number;
  last_maintenance_at_iso?: string;

  ai_model_router?: any;
}

interface SystemState {
  treasury: TreasuryBuckets;
  opportunities: ExtendedOpportunity[];
  agents: ExtendedAgentPerformance[];
  tasks: AgentTask[];
  ledger: LedgerEntry[];
  tax_receipts: TaxReceipt[];
  earning_assets: EarningAsset[];

  niche_performance: NichePerformance[];
  source_performance: SourcePerformance[];
  market_stats: MarketStats | null;

  agent_suggestions: NexusAgentSuggestion[];
  agent_suggestion_summary: AgentSuggestionSummary | null;

  crypto_acquisition_run: CryptoAcquisitionAgentRun | null;
  crypto_acquisition_candidates: NexusCryptoAcquisitionCandidate[];
  crypto_acquisition_snapshot: any | null;
  crypto_acquisition_execution_ledger: any[];

  execution_ledger: any[];
  agent_suggestion_execution_ledger: any[];
  patch_plan_execution_ledger: any[];

  patch_plan: NexusPatchPlan | null;
  patch_plan_summary: PatchPlanPublicSummary | null;

  accounting_policy: {
    projected_values_are_not_revenue: boolean;
    expected_values_are_not_revenue: boolean;
    verified_revenue_only: boolean;
    treasury_credit_requires_verified_receipt: boolean;
  } | null;

  policy: ExtendedGovernorPolicy;
  isInitialLoad: boolean;
  isSetup: boolean | undefined;
  proposals: ReinvestmentProposal[];
  policy_audit_logs: string[];
  system_health: SystemHealthState;
  daily_spend: number;
  last_withdrawal_at: number;
  owner_email?: string;
  rawDebugData: any;

  setTreasury: (buckets: TreasuryBuckets) => void;
  setInitialLoad: (loaded: boolean) => void;

  fetchSystemState: (isManualIngest?: boolean) => Promise<void>;
  fetchMarketStats: () => Promise<void>;
  fetchAgentSuggestions: () => Promise<void>;
  resolveSuggestion: (suggestionId: string, action: 'approve' | 'reject' | 'implemented') => Promise<void>;
  fetchCryptoAcquisition: () => Promise<void>;
  runCryptoAcquisition: () => Promise<void>;
  fetchPatchPlan: () => Promise<void>;
  updatePatchPlanItem: (
    filePath: string,
    action: 'current' | 'done' | 'pending' | 'block' | 'unblock'
  ) => Promise<void>;
  triggerIngest: () => Promise<ManualIngestResult>;
  persistPolicy: (policy: Partial<ExtendedGovernorPolicy>) => Promise<void>;
  withdrawFunds: (amount: number, email: string) => Promise<{ success: boolean; error?: string }>;
  completeSetup: (config: { policy: Partial<ExtendedGovernorPolicy>; owner_email: string }) => Promise<boolean>;
  handleProposal: (proposalId: string, action: 'approved' | 'rejected') => Promise<void>;
}

const EMPTY_ARRAY: any[] = [];

const DEFAULT_TREASURY: TreasuryBuckets = Object.freeze({
  reserve: 0,
  operating: 0,
  reinvestment: 0,
  tax_buffer: 0,
  owner_withdrawable: 0,
  total: 0
});

const DEFAULT_TREASURY_SPLIT: TreasurySplitPolicy = Object.freeze({
  reserve_percent: 40,
  operating_percent: 20,
  reinvest_percent: 15,
  tax_percent: 15,
  owner_percent: 10
});

const DEFAULT_POLICY: ExtendedGovernorPolicy = Object.freeze({
  max_spend_per_day: 0,
  max_risk_score: 0.75,
  reserve_floor: 0,
  emergency_stop: false,
  cooldown_period_ms: 300000,
  trading_enabled: false,
  min_profit_margin: 0.15,
  production_mode: 'stability',
  autonomous_ingestion_enabled: true,
  treasury_split: DEFAULT_TREASURY_SPLIT,
  max_ai_requests_per_cycle: 1,
  max_ai_tokens_per_cycle: 12000,
  min_minutes_between_ai_cycles: 10,
  max_reports_per_day: 24,
  max_sources_per_cycle: 3,
  max_signals_analyzed_per_cycle: 1,
  max_opportunities_executed_per_cycle: 1
});

const DEFAULT_SYSTEM_HEALTH: SystemHealthState = Object.freeze({
  status: 'degraded',
  last_check: 0,
  last_scan: 0,
  issues: [],
  kernel_logs: [],
  failure_count: {},
  ai_quota_mode: 'unknown',
  autonomous_ingestion_enabled: true
});

function cleanText(value: unknown): string {
  return String(value ?? '')
    .replace(/\uFFFD/g, '')
    .replace(/ï¿½/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeTreasury(value: any): TreasuryBuckets {
  return {
    reserve: safeNumber(value?.reserve, 0),
    operating: safeNumber(value?.operating, 0),
    reinvestment: safeNumber(value?.reinvestment, 0),
    tax_buffer: safeNumber(value?.tax_buffer, 0),
    owner_withdrawable: safeNumber(value?.owner_withdrawable, 0),
    total: safeNumber(value?.total, 0)
  };
}

function normalizeTreasurySplit(value: any): TreasurySplitPolicy {
  return {
    reserve_percent: safeNumber(value?.reserve_percent, DEFAULT_TREASURY_SPLIT.reserve_percent),
    operating_percent: safeNumber(value?.operating_percent, DEFAULT_TREASURY_SPLIT.operating_percent),
    reinvest_percent: safeNumber(value?.reinvest_percent, DEFAULT_TREASURY_SPLIT.reinvest_percent),
    tax_percent: safeNumber(value?.tax_percent, DEFAULT_TREASURY_SPLIT.tax_percent),
    owner_percent: safeNumber(value?.owner_percent, DEFAULT_TREASURY_SPLIT.owner_percent)
  };
}

function normalizePolicy(value: any): ExtendedGovernorPolicy {
  return {
    ...DEFAULT_POLICY,
    ...(value || {}),
    treasury_split: normalizeTreasurySplit(value?.treasury_split)
  };
}

function normalizeAsset(asset: any): EarningAsset {
  const slug = cleanText(asset?.slug);
  const fallbackReportPath = slug ? `/reports/${slug}` : cleanText(asset?.public_url || asset?.published_url || asset?.local_url);

  return {
    ...asset,
    title: cleanText(asset?.title),
    niche: cleanText(asset?.niche || 'General'),
    opportunity_title: cleanText(asset?.opportunity_title || asset?.title),
    seo_title: cleanText(asset?.seo_title || asset?.title),
    seo_description: cleanText(asset?.seo_description),
    notes: cleanText(asset?.notes),
    local_url: cleanText(asset?.local_url || fallbackReportPath),
    public_url: cleanText(asset?.public_url || fallbackReportPath),
    published_url: cleanText(asset?.published_url || fallbackReportPath),
    metadata_url: cleanText(asset?.metadata_url || (slug ? `/reports/${slug}/metadata.json` : '')),
    preview_url: cleanText(asset?.preview_url || (slug ? `/reports/${slug}/preview.json` : '')),
    full_json_url: cleanText(asset?.full_json_url || (slug ? `/reports/${slug}/full.json` : '')),
    verify_payment_url: cleanText(asset?.verify_payment_url || (slug ? `/reports/${slug}/verify-payment` : '')),
    price_crypto_estimate: cleanText(asset?.price_crypto_estimate),
    offer_links: asArray(asset?.offer_links)
  } as EarningAsset;
}

function normalizeAssets(value: unknown): EarningAsset[] {
  return asArray<any>(value)
    .map(normalizeAsset)
    .sort((a, b) => safeNumber((b as any).created_at) - safeNumber((a as any).created_at));
}

function buildAssetByOpportunityId(assets: EarningAsset[]) {
  const map = new Map<string, EarningAsset>();

  for (const asset of assets) {
    const opportunityId = cleanText((asset as any).opportunity_id);

    if (opportunityId && !map.has(opportunityId)) {
      map.set(opportunityId, asset);
    }
  }

  return map;
}

function normalizeOpportunity(opp: any, linkedAsset?: EarningAsset): ExtendedOpportunity {
  const slug = cleanText(opp?.report_slug || linkedAsset?.slug);
  const reportUrl = cleanText(
    opp?.report_url ||
      linkedAsset?.public_url ||
      linkedAsset?.published_url ||
      linkedAsset?.local_url ||
      (slug ? `/reports/${slug}` : '')
  );

  return {
    ...opp,
    title: cleanText(opp?.title || 'Untitled Opportunity'),
    summary: cleanText(opp?.summary),
    niche: cleanText(opp?.niche || 'General'),
    evidence: cleanText(opp?.evidence),
    analyst_reasoning: cleanText(opp?.analyst_reasoning),
    pricing_reasoning: cleanText(opp?.pricing_reasoning),
    buyer_type: cleanText(opp?.buyer_type || 'agent_or_automated_intelligence_consumer'),
    product_type: cleanText(opp?.product_type || 'paid_intelligence_payload'),

    report_asset_id: cleanText(opp?.report_asset_id || linkedAsset?.id),
    report_slug: slug || undefined,
    report_url: reportUrl || undefined,
    metadata_url: cleanText(
      opp?.metadata_url ||
        (linkedAsset as any)?.metadata_url ||
        (slug ? `/reports/${slug}/metadata.json` : '')
    ) || undefined,
    preview_url: cleanText(
      opp?.preview_url ||
        (linkedAsset as any)?.preview_url ||
        (slug ? `/reports/${slug}/preview.json` : '')
    ) || undefined,
    full_json_url: cleanText(
      opp?.full_json_url ||
        (linkedAsset as any)?.full_json_url ||
        (slug ? `/reports/${slug}/full.json` : '')
    ) || undefined,
    verify_payment_url: cleanText(
      opp?.verify_payment_url ||
        (linkedAsset as any)?.verify_payment_url ||
        (slug ? `/reports/${slug}/verify-payment` : '')
    ) || undefined,

    price_nok: safeNumber(opp?.price_nok ?? linkedAsset?.price_nok ?? opp?.recommended_price_nok, undefined as any),
    price_crypto_estimate: cleanText(opp?.price_crypto_estimate || linkedAsset?.price_crypto_estimate),
    payment_enforcement: opp?.payment_enforcement || (linkedAsset as any)?.payment_enforcement,
    offer_links: asArray(opp?.offer_links?.length ? opp.offer_links : linkedAsset?.offer_links),
    updated_at: safeNumber(opp?.updated_at || linkedAsset?.updated_at || opp?.created_at, 0) || undefined
  } as ExtendedOpportunity;
}

function normalizeOpportunities(value: unknown, assets: EarningAsset[]): ExtendedOpportunity[] {
  const byOpportunityId = buildAssetByOpportunityId(assets);

  return asArray<any>(value)
    .map((opp) => normalizeOpportunity(opp, byOpportunityId.get(cleanText(opp?.id))))
    .sort((a, b) => safeNumber(b.created_at) - safeNumber(a.created_at));
}

function normalizeSystemHealth(value: any, previous?: SystemHealthState): SystemHealthState {
  const merged = {
    ...DEFAULT_SYSTEM_HEALTH,
    ...(previous || {}),
    ...(value || {})
  };

  return {
    ...merged,
    status: merged.status || 'degraded',
    issues: asArray<string>(merged.issues).map(cleanText).filter(Boolean),
    kernel_logs: asArray<string>(merged.kernel_logs).map(cleanText).filter(Boolean),
    failure_count: merged.failure_count || {},
    last_run: merged.last_run
      ? {
          ...merged.last_run,
          error: cleanText(merged.last_run.error),
          skipped_reason: cleanText((merged.last_run as any).skipped_reason),
          deferred_reason: cleanText((merged.last_run as any).deferred_reason)
        }
      : previous?.last_run
  };
}

function normalizeAgents(value: unknown): ExtendedAgentPerformance[] {
  return asArray<any>(value).map((agent) => ({
    ...agent,
    verifiedRevenue: safeNumber(agent.verifiedRevenue ?? agent.totalProfit, 0)
  }));
}

function normalizeLedger(value: unknown): LedgerEntry[] {
  return asArray<LedgerEntry>(value).sort((a, b) => safeNumber(b.timestamp) - safeNumber(a.timestamp));
}

async function fetchJsonSafe(url: string): Promise<any | null> {
  try {
    const safeUrl = url.startsWith('/') ? url : `/${url}`;
    const requiresAdminFetch =
      safeUrl.startsWith('/api/system/') ||
      safeUrl.startsWith('/api/admin/') ||
      safeUrl.startsWith('/api/treasury/');

    const resp = requiresAdminFetch
      ? await adminFetch(safeUrl, {
          method: 'GET',
          headers: { Accept: 'application/json' }
        })
      : await fetch(safeUrl, {
          method: 'GET',
          headers: { Accept: 'application/json' }
        });

    if (!resp.ok) return null;

    return await resp.json();
  } catch {
    return null;
  }
}

async function fetchMarketStatsSafe(): Promise<MarketStats | null> {
  const candidates = [
    '/api/system/market-stats.json',
    '/api/system/agent/market-stats.json'
  ];

  for (const url of candidates) {
    const data = await fetchJsonSafe(url);

    if (data?.success && data?.stats) {
      return data.stats as MarketStats;
    }

    if (data?.success && data?.data?.market_stats) {
      return data.data.market_stats as MarketStats;
    }
  }

  return null;
}

function normalizeSuggestions(value: unknown): NexusAgentSuggestion[] {
  return asArray<NexusAgentSuggestion>(value)
    .map((suggestion: any) => ({
      ...suggestion,
      title: cleanText(suggestion?.title),
      why: cleanText(suggestion?.why),
      expected_impact: cleanText(suggestion?.expected_impact),
      implementation_summary: cleanText(suggestion?.implementation_summary),
      files_to_change: asArray<string>(suggestion?.files_to_change).map(cleanText).filter(Boolean)
    }))
    .sort((a, b) => {
      const priorityWeight: Record<string, number> = {
        urgent: 4,
        high: 3,
        medium: 2,
        low: 1
      };

      const priorityDelta =
        (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);

      if (priorityDelta !== 0) return priorityDelta;

      return safeNumber(b.created_at) - safeNumber(a.created_at);
    });
}

function extractAgentSuggestionSummary(payload: any): AgentSuggestionSummary | null {
  const summary = payload?.suggestions || payload?.agent_suggestion_summary || payload;

  if (summary?.kind === 'nexus_agent_suggestions' && Array.isArray(summary?.suggestions)) {
    return {
      ...summary,
      suggestions: normalizeSuggestions(summary.suggestions)
    } as AgentSuggestionSummary;
  }

  return null;
}

function extractCryptoAcquisitionRun(payload: any): CryptoAcquisitionAgentRun | null {
  const run = payload?.run || payload?.crypto_acquisition_run || payload;

  if (run?.kind === 'nexus_crypto_acquisition_agent_run') {
    return run as CryptoAcquisitionAgentRun;
  }

  return null;
}

function normalizeExecutionLedger(value: unknown): any[] {
  return asArray<any>(value)
    .map((entry, index) => ({
      ...entry,
      id: cleanText(entry?.id || `ledger-${index}`),
      kind: cleanText(entry?.kind || 'execution'),
      status: cleanText(entry?.status || 'unknown'),
      title: cleanText(entry?.title || entry?.candidate_title || entry?.file_path || entry?.suggestion_id || ''),
      created_at: safeNumber(entry?.created_at || entry?.timestamp, 0),
      completed_at: safeNumber(entry?.completed_at, 0),
      created_at_iso: cleanText(entry?.created_at_iso),
      completed_at_iso: cleanText(entry?.completed_at_iso),
      logs: asArray<string>(entry?.logs).map(cleanText).filter(Boolean),
      blockers: asArray<string>(entry?.blockers).map(cleanText).filter(Boolean)
    }))
    .sort((a, b) => safeNumber(b.completed_at || b.created_at) - safeNumber(a.completed_at || a.created_at));
}

function normalizeCryptoAcquisitionCandidates(value: unknown): NexusCryptoAcquisitionCandidate[] {
  return asArray<any>(value)
    .map((candidate) => ({
      ...candidate,
      id: cleanText(candidate?.id || candidate?.candidate_id || candidate?.title),
      title: cleanText(candidate?.title || candidate?.candidate_title || candidate?.id),
      method: cleanText(candidate?.method || 'unknown'),
      url: cleanText(candidate?.url),
      network: cleanText(candidate?.network),
      asset: cleanText(candidate?.asset),
      eligibility_notes: cleanText(candidate?.eligibility_notes || candidate?.notes),
      action_plan: asArray<string>(candidate?.action_plan).map(cleanText).filter(Boolean),
      blockers: asArray<string>(candidate?.blockers).map(cleanText).filter(Boolean),
      classification: cleanText(candidate?.classification || candidate?.execution_classification),
      execution_classification: cleanText(candidate?.execution_classification || candidate?.classification),
      execution_status: cleanText(candidate?.execution_status || candidate?.status),
      classification_reason: cleanText(candidate?.classification_reason),
      expected_value_label: cleanText(candidate?.expected_value_label || 'expected_value_only_not_verified_revenue'),
      treasury_credit: cleanText(candidate?.treasury_credit || 'verified_receipt_only')
    })) as NexusCryptoAcquisitionCandidate[];
}

function extractCryptoAcquisitionSnapshot(payload: any): any | null {
  const source =
    payload?.crypto_acquisition ||
    payload?.data?.crypto_acquisition ||
    null;

  if (
    source &&
    (
      Array.isArray(source?.candidates) ||
      Array.isArray(source?.execution_ledger) ||
      source?.summary ||
      source?.last_run
    )
  ) {
    return {
      ...source,
      candidates: normalizeCryptoAcquisitionCandidates(source.candidates),
      execution_ledger: normalizeExecutionLedger(source.execution_ledger),
      summary: source.summary || source.last_run || null
    };
  }

  if (
    payload?.success &&
    (
      Array.isArray(payload?.candidates) ||
      Array.isArray(payload?.execution_ledger) ||
      payload?.summary
    )
  ) {
    return {
      enabled: true,
      candidates: normalizeCryptoAcquisitionCandidates(payload.candidates),
      execution_ledger: normalizeExecutionLedger(payload.execution_ledger),
      last_run: payload.summary || null,
      summary: payload.summary || null
    };
  }

  return null;
}

function extractCryptoAcquisitionCandidates(
  payload: any,
  run: CryptoAcquisitionAgentRun | null
): NexusCryptoAcquisitionCandidate[] {
  const snapshot = extractCryptoAcquisitionSnapshot(payload);

  if (snapshot?.candidates?.length) {
    return normalizeCryptoAcquisitionCandidates(snapshot.candidates);
  }

  if (run) {
    return normalizeCryptoAcquisitionCandidates([
      ...asArray<NexusCryptoAcquisitionCandidate>(run.approved_candidates),
      ...asArray<NexusCryptoAcquisitionCandidate>(run.rejected_candidates)
    ]);
  }

  return [];
}

function extractPatchPlanSummary(payload: any): PatchPlanPublicSummary | null {
  const summary = payload?.patch_plan_summary || payload;

  if (summary?.kind === 'nexus_patch_plan' && summary?.plan) {
    return summary as PatchPlanPublicSummary;
  }

  return null;
}

async function fetchAgentRouteJsonSafe(path: string, init: RequestInit = {}): Promise<any | null> {
  try {
    const safePath = path.startsWith('/') ? path : `/${path}`;

    const resp = await adminFetch(`/api/system/agent${safePath}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init.headers || {})
      }
    });

    if (!resp.ok) return null;

    return await resp.json();
  } catch {
    return null;
  }
}

function readErrorMessage(payload: any, fallback: string): string {
  return cleanText(payload?.message || payload?.error || fallback);
}

export const useStore = create<SystemState>((set, get) => ({
  treasury: { ...DEFAULT_TREASURY },
  opportunities: [],
  tasks: [],
  agents: [],
  ledger: [],
  tax_receipts: [],
  earning_assets: [],

  niche_performance: [],
  source_performance: [],
  market_stats: null,

  agent_suggestions: [],
  agent_suggestion_summary: null,

  crypto_acquisition_run: null,
  crypto_acquisition_candidates: [],
  crypto_acquisition_snapshot: null,
  crypto_acquisition_execution_ledger: [],

  execution_ledger: [],
  agent_suggestion_execution_ledger: [],
  patch_plan_execution_ledger: [],

  patch_plan: null,
  patch_plan_summary: null,

  accounting_policy: {
    projected_values_are_not_revenue: true,
    expected_values_are_not_revenue: true,
    verified_revenue_only: true,
    treasury_credit_requires_verified_receipt: true
  },

  policy: { ...DEFAULT_POLICY },
  isInitialLoad: true,
  isSetup: undefined,
  proposals: [],
  policy_audit_logs: [],
  system_health: { ...DEFAULT_SYSTEM_HEALTH },

  daily_spend: 0,
  last_withdrawal_at: 0,
  rawDebugData: null,

  setTreasury: (treasury) => set({ treasury: normalizeTreasury(treasury) }),
  setInitialLoad: (isInitialLoad) => set({ isInitialLoad }),

  fetchMarketStats: async () => {
    const stats = await fetchMarketStatsSafe();

    if (stats) {
      set({ market_stats: stats });
    }
  },

  fetchAgentSuggestions: async () => {
    const payload = await fetchAgentRouteJsonSafe('/api/system/suggestions.json');
    const summary = extractAgentSuggestionSummary(payload);

    if (!summary) return;

    set({
      agent_suggestions: normalizeSuggestions(summary.suggestions),
      agent_suggestion_summary: summary,
      accounting_policy: {
        projected_values_are_not_revenue: summary.accounting_policy.projected_values_are_not_revenue,
        expected_values_are_not_revenue: summary.accounting_policy.expected_values_are_not_revenue,
        verified_revenue_only: summary.accounting_policy.verified_revenue_only,
        treasury_credit_requires_verified_receipt: true
      }
    });
  },

  resolveSuggestion: async (suggestionId, action) => {
    const payload = await fetchAgentRouteJsonSafe('/api/system/suggestions/action', {
      method: 'POST',
      body: JSON.stringify({
        suggestion_id: suggestionId,
        action
      })
    });

    if (!payload?.success) {
      toast.error('Suggestion action failed', {
        description: readErrorMessage(payload, 'The kernel rejected the suggestion action.')
      });
      return;
    }

    const execution = payload?.execution || null;
    const returnedLedger = normalizeExecutionLedger(payload?.execution_ledger);

    set((state) => {
      const status =
        action === 'approve'
          ? 'approved'
          : action === 'reject'
            ? 'rejected'
            : 'implemented';

      const serverSuggestions = Array.isArray(payload?.suggestions)
        ? normalizeSuggestions(payload.suggestions)
        : null;

      const localSuggestions = normalizeSuggestions(
        (state.agent_suggestions || []).map((suggestion) =>
          suggestion.id === suggestionId
            ? {
                ...suggestion,
                status,
                execution_status: execution?.status,
                execution_id: execution?.id,
                approved_at: action === 'approve' ? Date.now() : (suggestion as any).approved_at,
                approved_at_iso: action === 'approve' ? new Date().toISOString() : (suggestion as any).approved_at_iso,
                updated_at: Date.now()
              } as any
            : suggestion
        )
      );

      const nextSuggestionLedger =
        returnedLedger.length > 0
          ? returnedLedger
          : execution
            ? normalizeExecutionLedger([execution, ...state.agent_suggestion_execution_ledger])
            : state.agent_suggestion_execution_ledger;

      return {
        agent_suggestions: serverSuggestions || localSuggestions,
        agent_suggestion_execution_ledger: nextSuggestionLedger.slice(0, 500),
        execution_ledger: execution
          ? normalizeExecutionLedger([execution, ...state.execution_ledger]).slice(0, 500)
          : state.execution_ledger
      };
    });

    toast.success(action === 'approve' ? 'Suggestion routed to executor' : 'Suggestion updated', {
      description:
        execution?.status
          ? `Execution status: ${execution.status}`
          : 'The suggestion state was updated without removing it from the queue.'
    });
  },

  fetchCryptoAcquisition: async () => {
    const payload = await fetchAgentRouteJsonSafe('/api/system/agent/crypto-acquisition');
    const run = extractCryptoAcquisitionRun(payload);
    const snapshot = extractCryptoAcquisitionSnapshot(payload);

    if (!run && !snapshot) return;

    const candidates = extractCryptoAcquisitionCandidates(payload, run);
    const executionLedger = normalizeExecutionLedger(snapshot?.execution_ledger);

    set({
      crypto_acquisition_run: run || get().crypto_acquisition_run,
      crypto_acquisition_snapshot: snapshot || get().crypto_acquisition_snapshot,
      crypto_acquisition_candidates: candidates.length > 0
        ? candidates
        : get().crypto_acquisition_candidates,
      crypto_acquisition_execution_ledger: executionLedger.length > 0
        ? executionLedger
        : get().crypto_acquisition_execution_ledger,
      accounting_policy: {
        projected_values_are_not_revenue: true,
        expected_values_are_not_revenue:
          run?.accounting_policy?.expected_value_is_not_revenue ?? true,
        verified_revenue_only:
          run?.accounting_policy?.no_treasury_credit_without_verified_receipt ?? true,
        treasury_credit_requires_verified_receipt:
          run?.accounting_policy?.no_treasury_credit_without_verified_receipt ?? true
      }
    });
  },

  runCryptoAcquisition: async () => {
    const payload = await fetchAgentRouteJsonSafe('/api/system/agent/crypto-acquisition/run', {
      method: 'POST',
      body: JSON.stringify({
        trigger: 'dashboard_manual',
        force: true,
        timestamp: Date.now()
      })
    });

    const run = extractCryptoAcquisitionRun(payload);
    const snapshot = extractCryptoAcquisitionSnapshot(payload);
    const candidates = extractCryptoAcquisitionCandidates(payload, run);
    const executionLedger = normalizeExecutionLedger(
      snapshot?.execution_ledger || payload?.execution_ledger
    );

    if (!payload?.success || (!run && !snapshot)) {
      toast.error('Zero-cost acquisition executor failed', {
        description: readErrorMessage(payload, 'The kernel could not run the acquisition executor.')
      });
      return;
    }

    const suggestionSummary = extractAgentSuggestionSummary(payload?.suggestions);
    const summary = snapshot?.summary || payload?.summary || {};
    const executed = safeNumber(summary.executed, executionLedger.filter((entry) => entry.status === 'executed').length);
    const blocked = safeNumber(summary.external_blocked ?? summary.blocked, executionLedger.filter((entry) => entry.status === 'external_blocked').length);
    const failed = safeNumber(summary.failed, executionLedger.filter((entry) => entry.status === 'failed').length);

    set({
      crypto_acquisition_run: run || get().crypto_acquisition_run,
      crypto_acquisition_snapshot: snapshot || get().crypto_acquisition_snapshot,
      crypto_acquisition_candidates: candidates.length > 0
        ? candidates
        : get().crypto_acquisition_candidates,
      crypto_acquisition_execution_ledger: executionLedger.length > 0
        ? executionLedger
        : get().crypto_acquisition_execution_ledger,
      execution_ledger: executionLedger.length > 0
        ? normalizeExecutionLedger([...executionLedger, ...get().execution_ledger]).slice(0, 500)
        : get().execution_ledger,
      agent_suggestions: suggestionSummary
        ? normalizeSuggestions(suggestionSummary.suggestions)
        : get().agent_suggestions,
      agent_suggestion_summary: suggestionSummary || get().agent_suggestion_summary,
      accounting_policy: {
        projected_values_are_not_revenue: true,
        expected_values_are_not_revenue:
          run?.accounting_policy?.expected_value_is_not_revenue ?? true,
        verified_revenue_only:
          run?.accounting_policy?.no_treasury_credit_without_verified_receipt ?? true,
        treasury_credit_requires_verified_receipt:
          run?.accounting_policy?.no_treasury_credit_without_verified_receipt ?? true
      }
    });

    toast.success('Zero-cost acquisition executor ran', {
      description: `Executed: ${executed}. External-blocked: ${blocked}. Failed: ${failed}. Treasury credit still requires verified payment.`
    });
  },

  fetchPatchPlan: async () => {
    const payload = await fetchAgentRouteJsonSafe('/api/system/patch-plan.json');
    const summary = extractPatchPlanSummary(payload);

    if (!summary) return;

    set({
      patch_plan: summary.plan,
      patch_plan_summary: summary,
      accounting_policy: {
        projected_values_are_not_revenue: summary.accounting_policy.projected_values_are_not_revenue,
        expected_values_are_not_revenue: summary.accounting_policy.expected_values_are_not_revenue,
        verified_revenue_only: summary.accounting_policy.verified_revenue_only,
        treasury_credit_requires_verified_receipt: true
      }
    });
  },

  updatePatchPlanItem: async (filePath, action) => {
    const payload = await fetchAgentRouteJsonSafe('/api/system/patch-plan/action', {
      method: 'POST',
      body: JSON.stringify({
        file_path: filePath,
        action
      })
    });

    const summary = extractPatchPlanSummary(payload);

    if (!payload?.success || !summary) {
      toast.error('Patch plan update failed', {
        description: readErrorMessage(payload, 'The kernel rejected the patch plan update.')
      });
      return;
    }

    set({
      patch_plan: summary.plan,
      patch_plan_summary: summary
    });

    toast.success('Patch plan updated');
  },

  triggerIngest: async () => {
    const runStart = Date.now();

    set((state) => ({
      system_health: {
        ...state.system_health,
        last_run: {
          triggeredAt: runStart,
          status: 'running',
          sources: state.system_health.last_run?.sources ?? ['manual_trigger'],
          signalsCreated: state.system_health.last_run?.signalsCreated ?? 0
        }
      }
    }));

    try {
      const resp = await adminFetch('/api/system/ingest', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          trigger: 'dashboard_manual',
          timestamp: runStart
        })
      });

      const data = await resp.json().catch(() => null);

      if (resp.status === 409) {
        toast.info('Ingestion cycle locked', {
          description: 'Kernel is currently processing a signal cycle.'
        });

        await get().fetchSystemState(false);

        return {
          success: false,
          error: 'ALREADY_RUNNING'
        };
      }

      if (!resp.ok || data?.success === false) {
        const message = readErrorMessage(data, 'Ingestion trigger failed.');

        toast.error('Ingestion failed', {
          description: message
        });

        await get().fetchSystemState(false);

        return {
          success: false,
          error: message
        };
      }

      if (String(data?.message || '').includes('DEFERRED')) {
        toast.info('Ingestion deferred', {
          description:
            data?.next_safe_attempt_at_iso
              ? `AI backoff is active. Next safe attempt: ${data.next_safe_attempt_at_iso}`
              : 'AI backoff or quota pacing is active.'
        });

        await get().fetchSystemState(false);

        return {
          success: true,
          message: data?.message,
          deferred: true,
          ai_backoff_remaining_ms: data?.ai_backoff_remaining_ms,
          next_safe_attempt_at: data?.next_safe_attempt_at,
          next_safe_attempt_at_iso: data?.next_safe_attempt_at_iso
        };
      }

      toast.success('Ingestion triggered', {
        description: 'The autonomous kernel accepted the signal cycle.'
      });

      await get().fetchSystemState(false);

      return {
        success: true,
        message: data?.message || 'INGESTION_CYCLE_TRIGGERED'
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      toast.error('Ingestion request failed', {
        description: message
      });

      await get().fetchSystemState(false);

      return {
        success: false,
        error: message
      };
    }
  },

  fetchSystemState: async (isManualIngest = false) => {
    if (isManualIngest) {
      await get().triggerIngest();
      return;
    }

    try {
      const resp = await adminFetch('/api/system/messages', {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });

      if (!resp.ok) return;

      const data = await resp.json();

      if (data.success && data.data) {
        set((state) => {
          const nextAssets = normalizeAssets(
            Array.isArray(data.data.earning_assets)
              ? data.data.earning_assets
              : state.earning_assets
          );

          const nextOpportunities = normalizeOpportunities(
            Array.isArray(data.data.opportunities)
              ? data.data.opportunities
              : state.opportunities,
            nextAssets
          );

          const nextCryptoSnapshot =
            extractCryptoAcquisitionSnapshot(data.data) || state.crypto_acquisition_snapshot;

          const nextCryptoCandidates =
            Array.isArray(nextCryptoSnapshot?.candidates)
              ? normalizeCryptoAcquisitionCandidates(nextCryptoSnapshot.candidates)
              : Array.isArray(data.data.crypto_acquisition_candidates)
                ? normalizeCryptoAcquisitionCandidates(data.data.crypto_acquisition_candidates)
                : state.crypto_acquisition_candidates;

          const nextCryptoExecutionLedger = normalizeExecutionLedger(
            nextCryptoSnapshot?.execution_ledger ||
              data.data.crypto_acquisition_execution_ledger ||
              state.crypto_acquisition_execution_ledger
          );

          const nextUnifiedExecutionLedger = normalizeExecutionLedger(
            data.data.execution_ledger || state.execution_ledger
          );

          const nextSuggestionExecutionLedger = normalizeExecutionLedger(
            data.data.agent_suggestion_execution_ledger || state.agent_suggestion_execution_ledger
          );

          const nextPatchPlanExecutionLedger = normalizeExecutionLedger(
            data.data.patch_plan_execution_ledger ||
              data.data.patch_plan?.execution_ledger ||
              state.patch_plan_execution_ledger
          );

          return {
            treasury: normalizeTreasury(data.data.treasury || state.treasury),
            isSetup: typeof data.data.isSetup === 'boolean' ? data.data.isSetup : state.isSetup,

            proposals: Array.isArray(data.data.proposals) ? data.data.proposals : state.proposals,
            opportunities: nextOpportunities,
            agents: normalizeAgents(Array.isArray(data.data.agents) ? data.data.agents : state.agents),
            tasks: Array.isArray(data.data.tasks) ? data.data.tasks : state.tasks,
            ledger: normalizeLedger(Array.isArray(data.data.ledger) ? data.data.ledger : state.ledger),
            tax_receipts: Array.isArray(data.data.tax_receipts) ? data.data.tax_receipts : state.tax_receipts,
            earning_assets: nextAssets,

            niche_performance: Array.isArray(data.data.niche_performance)
              ? data.data.niche_performance
              : state.niche_performance,

            source_performance: Array.isArray(data.data.source_performance)
              ? data.data.source_performance
              : state.source_performance,

            market_stats: data.data.market_stats || state.market_stats,

            agent_suggestions: Array.isArray(data.data.agent_suggestions)
              ? normalizeSuggestions(data.data.agent_suggestions)
              : state.agent_suggestions,

            agent_suggestion_summary:
              data.data.agent_suggestion_summary || state.agent_suggestion_summary,

            crypto_acquisition_run:
              data.data.crypto_acquisition_run || state.crypto_acquisition_run,

            crypto_acquisition_snapshot: nextCryptoSnapshot,

            crypto_acquisition_candidates: nextCryptoCandidates,

            crypto_acquisition_execution_ledger: nextCryptoExecutionLedger,
            execution_ledger: nextUnifiedExecutionLedger,
            agent_suggestion_execution_ledger: nextSuggestionExecutionLedger,
            patch_plan_execution_ledger: nextPatchPlanExecutionLedger,

            patch_plan:
              data.data.patch_plan || state.patch_plan,

            patch_plan_summary:
              data.data.patch_plan_summary || state.patch_plan_summary,

            accounting_policy:
              data.data.accounting_policy || state.accounting_policy,

            policy: normalizePolicy(data.data.policy || state.policy),
            policy_audit_logs: Array.isArray(data.data.policy_audit_logs)
              ? data.data.policy_audit_logs.map(cleanText).filter(Boolean)
              : state.policy_audit_logs,

            system_health: normalizeSystemHealth(data.data.system_health, state.system_health),

            daily_spend: data.data.daily_spend ?? state.daily_spend,
            last_withdrawal_at: data.data.last_withdrawal_at ?? state.last_withdrawal_at,
            owner_email: data.data.owner_email || state.owner_email,
            rawDebugData: data.data,
            isInitialLoad: false
          };
        });

        const stats = await fetchMarketStatsSafe();

        if (stats) {
          set({ market_stats: stats });
        }

        const health = data.data.system_health;

        if (health?.last_run?.error === 'AI_CONFIG_MISSING') {
          toast.error('AI Configuration Missing', {
            description: 'CF_AI_BASE_URL and CF_AI_API_KEY must be configured.',
            duration: 0
          });
        }

        if (health?.ai_quota_mode === 'daily_quota_exhausted') {
          toast.warning('Daily AI quota exhausted', {
            description:
              health?.ai_next_safe_attempt_at_iso
                ? `Next safe attempt: ${health.ai_next_safe_attempt_at_iso}`
                : 'The scheduler will resume automatically when quota resets.'
          });
        }
      }
    } catch (e) {
      console.warn('[STORE] State fetch rejected:', e);
    } finally {
      set({ isInitialLoad: false });
    }
  },

  persistPolicy: async (policyUpdate) => {
    const previousPolicy = get().policy;
    const updated = normalizePolicy({ ...previousPolicy, ...policyUpdate });

    set({ policy: updated });

    try {
      const resp = await adminFetch('/api/system/policy', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updated)
      });

      const data = await resp.json().catch(() => null);

      if (!resp.ok || data?.success === false) {
        set({ policy: previousPolicy });

        toast.error('Policy update rejected', {
          description: readErrorMessage(data, 'The governor rejected the policy update.')
        });

        return;
      }

      toast.success('Governor policy updated');
      await get().fetchSystemState(false);
    } catch (e) {
      set({ policy: previousPolicy });

      toast.error('Policy sync failed', {
        description: e instanceof Error ? e.message : String(e)
      });
    }
  },

  withdrawFunds: async (amount, email) => {
    try {
      const resp = await adminFetch('/api/treasury/withdraw', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ amount, email })
      });

      if (resp.status === 429) {
        return { success: false, error: 'Cooldown active. One withdrawal per 24h allowed.' };
      }

      const data = await resp.json().catch(() => null);

      if (!resp.ok) {
        return { success: false, error: readErrorMessage(data, 'Withdrawal failed.') };
      }

      if (data?.success && data.data) {
        set({ treasury: normalizeTreasury(data.data), last_withdrawal_at: Date.now() });
        await get().fetchSystemState(false);
        return { success: true };
      }

      return { success: false, error: 'Kernel returned invalid treasury state.' };
    } catch {
      return { success: false, error: 'Network failure during withdrawal.' };
    }
  },

  completeSetup: async (config) => {
    try {
      const payload = {
        ...config,
        policy: normalizePolicy(config.policy)
      };

      const resp = await adminFetch('/api/system/setup', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) return false;

      const data = await resp.json().catch(() => null);

      if (data?.success) {
        set({
          isSetup: true,
          owner_email: config.owner_email,
          policy: normalizePolicy(payload.policy)
        });

        await get().fetchSystemState(false);
        return true;
      }

      return false;
    } catch {
      return false;
    }
  },

  handleProposal: async (proposalId, action) => {
    try {
      const resp = await adminFetch('/api/system/proposals/action', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ proposalId, action })
      });

      if (!resp.ok) return;

      const data = await resp.json().catch(() => null);

      if (data?.success) {
        set((state) => ({
          proposals: state.proposals.map((proposal) =>
            proposal.id === proposalId
              ? { ...proposal, status: action === 'approved' ? 'implemented' : 'rejected' }
              : proposal
          ),
          treasury: data.data?.treasury ? normalizeTreasury(data.data.treasury) : state.treasury
        }));

        await get().fetchSystemState(false);
      }
    } catch (e) {
      console.error('[STORE] Proposal resolution failed:', e);
    }
  }
}));

/**
 * STABLE SELECTORS - PRIMITIVES
 */
export const useReserve = () => useStore((s) => s.treasury?.reserve ?? 0);
export const useOperating = () => useStore((s) => s.treasury?.operating ?? 0);
export const useReinvestment = () => useStore((s) => s.treasury?.reinvestment ?? 0);
export const useTaxBuffer = () => useStore((s) => s.treasury?.tax_buffer ?? 0);
export const useWithdrawable = () => useStore((s) => s.treasury?.owner_withdrawable ?? 0);
export const useTotalTreasury = () => useStore((s) => s.treasury?.total ?? 0);

export const useIsSetup = () => useStore((s) => s.isSetup);
export const useEmergencyStop = () => useStore((s) => s.policy?.emergency_stop ?? false);
export const useMaxRiskScore = () => useStore((s) => s.policy?.max_risk_score ?? 0);
export const useReserveFloor = () => useStore((s) => s.policy?.reserve_floor ?? 0);
export const useMaxSpendPerDay = () => useStore((s) => s.policy?.max_spend_per_day ?? 0);
export const useTradingEnabled = () => useStore((s) => s.policy?.trading_enabled ?? false);
export const useProductionMode = () => useStore((s) => s.policy?.production_mode ?? 'stability');
export const useAutonomousIngestionEnabled = () =>
  useStore((s) => s.policy?.autonomous_ingestion_enabled ?? true);
export const useTreasurySplit = () =>
  useStore((s) => s.policy?.treasury_split ?? DEFAULT_TREASURY_SPLIT);
export const usePolicy = () => useStore((s) => s.policy);

export const useSystemStatusLabel = () => useStore((s) => s.system_health?.status ?? 'unknown');
export const useLastScanTime = () => useStore((s) => s.system_health?.last_scan ?? 0);
export const useDailySpend = () => useStore((s) => s.daily_spend ?? 0);
export const useLastWithdrawalAt = () => useStore((s) => s.last_withdrawal_at ?? 0);

/**
 * AI / SCHEDULER SELECTORS
 */
export const useAiQuota = () => useStore((s) => s.system_health?.ai_quota ?? null);
export const useAiQuotaMode = () =>
  useStore((s) => s.system_health?.ai_quota_mode ?? s.system_health?.ai_quota?.mode ?? 'unknown');
export const useAiRateLimitedUntil = () =>
  useStore((s) => s.system_health?.ai_rate_limited_until ?? s.system_health?.ai_quota?.rate_limited_until ?? 0);
export const useAiRateLimitedUntilIso = () =>
  useStore((s) => s.system_health?.ai_rate_limited_until_iso ?? s.system_health?.ai_quota?.rate_limited_until_iso ?? '');
export const useAiNextSafeAttemptAt = () =>
  useStore((s) => s.system_health?.ai_next_safe_attempt_at ?? s.system_health?.ai_quota?.next_safe_attempt_at ?? 0);
export const useAiNextSafeAttemptAtIso = () =>
  useStore((s) => s.system_health?.ai_next_safe_attempt_at_iso ?? s.system_health?.ai_quota?.next_safe_attempt_at_iso ?? '');
export const useAiRateLimitLastMessage = () =>
  useStore((s) => s.system_health?.ai_rate_limit_last_message ?? s.system_health?.ai_quota?.last_message ?? '');
export const useNextScheduledCycleAt = () => useStore((s) => s.system_health?.next_scheduled_cycle_at ?? 0);
export const useNextScheduledCycleAtIso = () => useStore((s) => s.system_health?.next_scheduled_cycle_at_iso ?? '');
export const useAiModelRouterSummary = () =>
  useStore((s) => s.system_health?.ai_model_router ?? s.rawDebugData?.ai_model_router ?? null);

/**
 * STABLE SELECTORS - COLLECTIONS
 */
export const useOpportunitiesList = () => useStore(useShallow((s) => s.opportunities ?? EMPTY_ARRAY));
export const useAgentsList = () => useStore(useShallow((s) => s.agents ?? EMPTY_ARRAY));
export const useLedgerEntries = () => useStore(useShallow((s) => s.ledger ?? EMPTY_ARRAY));
export const useTaxReceiptsList = () => useStore(useShallow((s) => s.tax_receipts ?? EMPTY_ARRAY));
export const useEarningAssetsList = () => useStore(useShallow((s) => s.earning_assets ?? EMPTY_ARRAY));
export const useProposalsList = () => useStore(useShallow((s) => s.proposals ?? EMPTY_ARRAY));
export const usePolicyAuditLogs = () => useStore(useShallow((s) => s.policy_audit_logs ?? EMPTY_ARRAY));
export const useKernelLogs = () => useStore(useShallow((s) => s.system_health?.kernel_logs ?? EMPTY_ARRAY));
export const useSystemIssues = () => useStore(useShallow((s) => s.system_health?.issues ?? EMPTY_ARRAY));
export const useTasksList = () => useStore(useShallow((s) => s.tasks ?? EMPTY_ARRAY));
export const useNichePerformanceList = () => useStore(useShallow((s) => s.niche_performance ?? EMPTY_ARRAY));
export const useSourcePerformanceList = () => useStore(useShallow((s) => s.source_performance ?? EMPTY_ARRAY));
/**
 * SUGGESTIONS / ACQUISITION / PATCH PLAN SELECTORS
 */
export const useAgentSuggestionsList = () => useStore(useShallow((s) => s.agent_suggestions ?? EMPTY_ARRAY));
export const useAgentSuggestionSummary = () => useStore((s) => s.agent_suggestion_summary);
export const useUrgentAgentSuggestions = () =>
  useStore(useShallow((s) => (s.agent_suggestions ?? EMPTY_ARRAY).filter((item) => item.priority === 'urgent')));
export const useHighPriorityAgentSuggestions = () =>
  useStore(useShallow((s) => (s.agent_suggestions ?? EMPTY_ARRAY).filter((item) => item.priority === 'high')));
export const useResolveSuggestion = () => useStore((s) => s.resolveSuggestion);

export const useCryptoAcquisitionRun = () => useStore((s) => s.crypto_acquisition_run);
export const useCryptoAcquisitionCandidates = () =>
  useStore(useShallow((s) => s.crypto_acquisition_candidates ?? EMPTY_ARRAY));
export const useApprovedCryptoAcquisitionCandidates = () =>
  useStore(
    useShallow((s) => {
      const approved = s.crypto_acquisition_run?.approved_candidates;

      if (Array.isArray(approved)) {
        return approved;
      }

      return (s.crypto_acquisition_candidates ?? EMPTY_ARRAY).filter((item: any) =>
        item.status === 'approved' ||
        item.execution_status === 'approved' ||
        item.execution_classification === 'auto_executable'
      );
    })
  );
export const useCryptoAcquisitionExpectedValueNok = () =>
  useStore((s) =>
    s.crypto_acquisition_snapshot?.summary?.expected_value_nok ??
    s.crypto_acquisition_snapshot?.summary?.total_expected_value_nok ??
    s.crypto_acquisition_run?.summary?.total_expected_value_nok ??
    0
  );
export const useFetchCryptoAcquisition = () => useStore((s) => s.fetchCryptoAcquisition);
export const useRunCryptoAcquisition = () => useStore((s) => s.runCryptoAcquisition);

export const usePatchPlan = () => useStore((s) => s.patch_plan);
export const usePatchPlanSummary = () => useStore((s) => s.patch_plan_summary);
export const usePatchPlanItems = () => useStore(useShallow((s) => s.patch_plan?.items ?? EMPTY_ARRAY));
export const useCurrentPatchPlanItem = () =>
  useStore((s) => s.patch_plan_summary?.status_summary?.next_item ?? null);
export const useUpdatePatchPlanItem = () => useStore((s) => s.updatePatchPlanItem);
export const useFetchPatchPlan = () => useStore((s) => s.fetchPatchPlan);

export const useAccountingPolicy = () => useStore((s) => s.accounting_policy);
export const useProjectedValuesAreRevenue = () => useStore(() => false);
export const useExpectedValuesAreRevenue = () => useStore(() => false);
export const useVerifiedRevenueOnly = () =>
  useStore((s) => s.accounting_policy?.verified_revenue_only ?? true);

/**
 * MARKET / VERIFIED-ONLY SELECTORS
 */
export const useMarketStats = () => useStore((s) => s.market_stats);
export const useMarketStatsSummary = () => useStore((s) => s.market_stats?.production ?? null);

export const useVerifiedRevenueNok = () =>
  useStore((s) => s.market_stats?.totals?.verified_revenue_nok ?? 0);

export const useVerifiedUnlocks = () =>
  useStore((s) => s.market_stats?.totals?.verified_unlocks ?? 0);

export const useReportsCreated = () =>
  useStore((s) => s.market_stats?.totals?.reports_created ?? s.earning_assets?.length ?? 0);

export const useReportsCreatedToday = () =>
  useStore((s) => s.market_stats?.today?.reports_created_today ?? 0);

export const useAverageDynamicPriceNok = () =>
  useStore((s) => s.market_stats?.averages?.average_dynamic_price_nok ?? 0);

export const useAverageProjectedMarketValueUsd = () =>
  useStore((s) => s.market_stats?.averages?.average_projected_market_value_usd ?? 0);

export const useTopNiche = () =>
  useStore((s) => s.market_stats?.top?.top_niche ?? null);

export const useTopSource = () =>
  useStore((s) => s.market_stats?.top?.top_source ?? null);

export const useScannerHealth = () =>
  useStore((s) => s.market_stats?.production?.scanner_health ?? 'warming_up');

export const useRecommendedProductionMode = () =>
  useStore((s) => s.market_stats?.production?.recommended_mode ?? 'stability');

/**
 * STATUS SELECTORS
 */
export const useLastRunStatus = () => useStore((s) => s.system_health?.last_run?.status ?? 'idle');
export const useLastRunSignals = () => useStore((s) => s.system_health?.last_run?.signalsCreated ?? 0);
export const useLastRunSources = () => useStore(useShallow((s) => s.system_health?.last_run?.sources ?? EMPTY_ARRAY));
export const useLastRunTriggeredAt = () => useStore((s) => s.system_health?.last_run?.triggeredAt ?? 0);
export const useLastRunCompletedAt = () => useStore((s) => s.system_health?.last_run?.completedAt ?? 0);
export const useLastRunError = () => useStore((s) => s.system_health?.last_run?.error);
export const useLastRunDeferredReason = () =>
  useStore((s) => s.system_health?.last_run?.deferred_reason);
export const useLastRunNextAttemptAt = () =>
  useStore((s) => s.system_health?.last_run?.next_attempt_at ?? 0);
export const useAgentFailureCount = (role: AgentRole) =>
  useStore((s) => s.system_health?.failure_count?.[role] ?? 0);

/**
 * ACTION SELECTORS
 */
export const useFetchSystemState = () => useStore((s) => s.fetchSystemState);
export const useTriggerIngest = () => useStore((s) => s.triggerIngest);
export const usePersistPolicy = () => useStore((s) => s.persistPolicy);
export const useCompleteSetup = () => useStore((s) => s.completeSetup);
export const useFetchAgentSuggestions = () => useStore((s) => s.fetchAgentSuggestions);


/**
 * EXECUTION LEDGER SELECTORS
 */
export const useExecutionLedger = () => useStore((s) => s.execution_ledger ?? EMPTY_ARRAY);
export const useCryptoAcquisitionSnapshot = () => useStore((s) => s.crypto_acquisition_snapshot);
export const useCryptoAcquisitionExecutionLedger = () =>
  useStore((s) => s.crypto_acquisition_execution_ledger ?? EMPTY_ARRAY);
export const useAgentSuggestionExecutionLedger = () =>
  useStore((s) => s.agent_suggestion_execution_ledger ?? EMPTY_ARRAY);
export const usePatchPlanExecutionLedger = () =>
  useStore((s) => s.patch_plan_execution_ledger ?? EMPTY_ARRAY);
export const useExecutedCryptoAcquisitionCount = () =>
  useStore((s) =>
    (s.crypto_acquisition_execution_ledger ?? EMPTY_ARRAY).filter((entry: any) => entry.status === 'executed').length
  );
export const useExternalBlockedCryptoAcquisitionCount = () =>
  useStore((s) =>
    (s.crypto_acquisition_execution_ledger ?? EMPTY_ARRAY).filter((entry: any) => entry.status === 'external_blocked').length
  );
export const useFailedCryptoAcquisitionCount = () =>
  useStore((s) =>
    (s.crypto_acquisition_execution_ledger ?? EMPTY_ARRAY).filter((entry: any) => entry.status === 'failed').length
  );



