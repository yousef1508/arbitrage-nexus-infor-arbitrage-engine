import { Agent } from 'agents';
import type { Env } from './core-utils';
import type {
  ChatState,
  Opportunity,
  LedgerEntry,
  TaxReceipt,
  EarningAsset,
  AgentRole,
  AgentStatus,
  AgentTask,
  TreasurySplitPolicy,
  AiBackoffSource,
  AiQuotaMode
} from './types';

import { buildMarketStats, buildMarketStatsTextSummary } from './market-stats';
import { buildDynamicPriceFromOpportunity } from './pricing-engine';
import {
  runCryptoAcquisitionAgent,
  buildCryptoAcquisitionAgentStatus
} from './crypto-acquisition-agent';
import {
  buildAgentSuggestionSummary,
  approveSuggestion,
  rejectSuggestion,
  markSuggestionImplemented,
  buildAgentSuggestionTextSummary
} from './agent-suggestions';
import {
  buildDefaultPatchPlan,
  buildPatchPlanPublicSummary,
  buildPatchPlanTextSummary,
  markPatchPlanItemStatus,
  setPatchPlanCurrentItem,
  blockPatchPlanItem,
  unblockPatchPlanItem
} from './patch-planner';

import { SOURCE_REGISTRY, getEnabledSources } from './source-registry';
import {
  absoluteUrl,
  asArray,
  escapeHtml,
  makeReportSlug,
  safeIso,
  shortText,
  xmlEscape
} from './market-utils';

import {
  selectSourcesForCycle,
  updateNichePerformanceFromAsset,
  updateSourcePerformanceFromAsset,
  summarizePerformance,
  scoreNichePerformance,
  type NichePerformance,
  type SourcePerformance
} from './performance-scoring';

import {
  buildExecutionPlan,
  getProductionLimits,
  parseProductionMode,
  rankSignalsForAnalysis,
  type ProductionMode,
  type RankedOpportunity
} from './opportunity-ranking';

import { buildIntelligenceReportPayload } from './report-builder';
import { buildCatalogJsonLd, buildJsonLdScript, buildReportJsonLd, buildDiscoveryJson as buildSeoDiscoveryJson, buildLlmsTxt, buildAgentsTxt } from './seo';

import { buildAffiliateOfferLinks } from './affiliate-offers';
import {
  quoteNativePaymentForNokLive,
  verifyNativeCryptoDepositWithLiveValuation,
  verifyNativeCryptoDepositAgainstLivePrice,
  type CryptoReceipt,
  type NativePaymentQuote
} from './crypto-treasury';

import { ContentEngine } from './content-engine';
import { ChatHandler } from './chat';
import { monetizationLogic } from './monetization-logic';
import { CONFIG } from './config';
import { createMessage, createStreamResponse, createEncoder } from './utils';
import { executeTool } from './tools';

type TreasuryBucket =
  | 'reserve'
  | 'operating'
  | 'reinvestment'
  | 'tax_buffer'
  | 'owner_withdrawable';

type PriceTier = 'micro' | 'low' | 'standard' | 'premium' | 'high_value' | 'urgent' | 'enterprise';

type DynamicPricing = {
  price_nok: number;
  price_usd: number;
  price_tier: PriceTier;
  market_value_score: number;
  projected_market_value_usd: number;
  pricing_reasoning: string;
};

type PaymentEnforcementMetadata =
  | {
      enabled: true;
      pricing_mode: 'live_oracle';
      required_price_nok: number;
      native_symbol: string;
      native_price_nok: number;
      required_amount_crypto: number;
      required_amount_crypto_string: string;
      required_amount_wei: string;
      decimals: number;
      min_confirmations: number;
      allowed_underpayment_nok: number;
      message: string;

      quote_provider?: string;
      quote_source?: string;
      quote_source_id?: string;
      quote_source_url?: string;
      quote_fetched_at?: number;
      quote_fetched_at_iso?: string;
      quote_stale?: boolean;
      quote_fallback?: boolean;

      payment_sufficient?: boolean;
      received_value_nok?: number;
      received_amount_crypto?: number;
      received_amount_crypto_string?: string;
      received_amount_wei?: string;
      overpayment_nok?: number;
    }
  | {
      enabled: false;
      pricing_mode: 'live_oracle';
      reason: string;
      required_price_nok: number;
      message: string;
    };

type ProviderBackoff = {
  retryAfterMs: number;
  source: AiBackoffSource;
  status?: number;
  dailyQuotaExhaustedUntil?: number;
};

type AiCompletionResult = {
  content: string;
  toolCalls?: any;
  model: string;
};

type ModelRuntimeRecord = {
  until: number;
  until_iso: string;
  context: string;
  status?: number;
  source?: AiBackoffSource | 'model_unavailable';
  message?: string;
};

const AGENT_MODELS: Record<AgentRole, string> = {
  scout: 'gemini-2.5-flash-lite',
  analyst: 'gemini-3.1-flash-lite',
  router: 'gemini-2.5-flash-lite',
  content_arb: 'gemini-3.1-flash-lite',
  affiliate: 'gemini-3.1-flash-lite',
  lead_gen: 'gemini-2.5-flash-lite',
  resale: 'gemini-2.5-flash-lite',
  referral: 'gemini-2.5-flash-lite',
  trading: 'gemini-2.5-flash'
};

const FREE_MODEL_POOLS: Record<AgentRole, string[]> = {
  scout: [
    'gemini-2.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash',
    'gemini-3-flash',
    'gemma-3-27b-it',
    'gemma-3-12b-it',
    'gemma-3-4b-it',
    'gemma-3-1b-it'
  ],
  analyst: [
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-3-flash',
    'gemma-3-27b-it',
    'gemma-3-12b-it',
    'gemma-3-4b-it'
  ],
  router: [
    'gemini-2.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash',
    'gemini-3-flash',
    'gemma-3-12b-it',
    'gemma-3-4b-it'
  ],
  content_arb: [
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-3-flash',
    'gemma-3-27b-it',
    'gemma-3-12b-it'
  ],
  affiliate: [
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-3-flash',
    'gemma-3-12b-it',
    'gemma-3-4b-it'
  ],
  lead_gen: [
    'gemini-2.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash',
    'gemini-3-flash',
    'gemma-3-12b-it'
  ],
  resale: [
    'gemini-2.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash',
    'gemma-3-12b-it'
  ],
  referral: [
    'gemini-2.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash',
    'gemma-3-12b-it'
  ],
  trading: [
    'gemini-2.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash-lite',
    'gemini-3-flash'
  ]
};

const DEFAULT_SCANNER_NICHES = [
  'SaaS_Affiliate',
  'B2B_LeadGen',
  'Content_Arb',
  'Market_Trading'
];

const LEGACY_MANUAL_CRYPTO_TEXT = 'Manual POL equivalent at payment time';

const DEFAULT_TREASURY_SPLIT: TreasurySplitPolicy = {
  reserve_percent: 40,
  operating_percent: 20,
  reinvest_percent: 15,
  tax_percent: 15,
  owner_percent: 10
};

function cleanText(value: unknown): string {
  return String(value ?? '')
    .replace(/\uFFFD/g, '')
    .replace(/ï¿½/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = safeNumber(value, fallback);
  return Math.max(min, Math.min(max, parsed));
}

function truthy(value: unknown): boolean {
  return ['true', '1', 'yes', 'y', 'on'].includes(
    String(value || '').trim().toLowerCase()
  );
}

function uniqueStrings(values: unknown[]): string[] {
  return Array.from(
    new Set(
      values
        .flatMap((value) => String(value ?? '').split(','))
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

function hashString(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash >>> 0).toString(16);
}

function nextPacificMidnightMs(now = Date.now()): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(now)).map((part) => [part.type, part.value])
  );

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);

  const approxTomorrowPacificMidnightUtc = Date.UTC(year, month - 1, day + 1, 8, 0, 0);

  return approxTomorrowPacificMidnightUtc <= now
    ? approxTomorrowPacificMidnightUtc + 86400000
    : approxTomorrowPacificMidnightUtc;
}

export class ChatAgent extends Agent<Env, ChatState> {
  private chatHandler?: ChatHandler;
  private contentEngine?: ContentEngine;

  initialState: ChatState = {
    messages: [],
    sessionId: 'nexus-core-singleton-v3',
    isProcessing: false,
    model: AGENT_MODELS.analyst,
    setup_complete: false,
    proposals: [],
    opportunities: [],
    tasks: [],
    niche_performance: [],
    source_performance: [],
    daily_spend: 0,
    last_spend_reset: Date.now(),
    current_niche_index: 0,
    last_withdrawal_at: 0,
    policy_audit_logs: [],
    treasury: {
      reserve: 0,
      operating: 0,
      reinvestment: 0,
      tax_buffer: 0,
      owner_withdrawable: 0,
      total: 0
    },
    ledger: [],
    tax_receipts: [],
    earning_assets: [],
    policy: {
      max_spend_per_day: 0,
      max_risk_score: 0.75,
      reserve_floor: 0,
      emergency_stop: false,
      cooldown_period_ms: 300000,
      trading_enabled: false,
      min_profit_margin: 0.15,
      treasury_split: DEFAULT_TREASURY_SPLIT,
      production_mode: 'stability',
      autonomous_ingestion_enabled: true,
      max_ai_requests_per_cycle: 1,
      max_ai_tokens_per_cycle: 12000,
      min_minutes_between_ai_cycles: 10,
      max_reports_per_day: 24,
      max_sources_per_cycle: 3,
      max_signals_analyzed_per_cycle: 1,
      max_opportunities_executed_per_cycle: 1
    },
    agents: [
      { role: 'scout', status: 'idle', health: 100, totalProfit: 0, activeTasks: 0, lastActive: 0, successRate: 0, hourlyRevenue: 0, capital_allocated: 0 },
      { role: 'analyst', status: 'idle', health: 100, totalProfit: 0, activeTasks: 0, lastActive: 0, successRate: 0, hourlyRevenue: 0, capital_allocated: 0 },
      { role: 'router', status: 'idle', health: 100, totalProfit: 0, activeTasks: 0, lastActive: 0, successRate: 0, hourlyRevenue: 0, capital_allocated: 0 },
      { role: 'content_arb', status: 'idle', health: 100, totalProfit: 0, activeTasks: 0, lastActive: 0, successRate: 0, hourlyRevenue: 0, capital_allocated: 0 },
      { role: 'affiliate', status: 'idle', health: 100, totalProfit: 0, activeTasks: 0, lastActive: 0, successRate: 0, hourlyRevenue: 0, capital_allocated: 0 },
      { role: 'lead_gen', status: 'idle', health: 100, totalProfit: 0, activeTasks: 0, lastActive: 0, successRate: 0, hourlyRevenue: 0, capital_allocated: 0 },
      { role: 'resale', status: 'idle', health: 100, totalProfit: 0, activeTasks: 0, lastActive: 0, successRate: 0, hourlyRevenue: 0, capital_allocated: 0 },
      { role: 'referral', status: 'idle', health: 100, totalProfit: 0, activeTasks: 0, lastActive: 0, successRate: 0, hourlyRevenue: 0, capital_allocated: 0 },
      { role: 'trading', status: 'idle', health: 100, totalProfit: 0, activeTasks: 0, lastActive: 0, successRate: 0, hourlyRevenue: 0, capital_allocated: 0 }
    ],
    system_health: {
      cpu_usage: 0,
      active_agents: 0,
      last_scan: Date.now(),
      status: 'healthy',
      last_check: Date.now(),
      issues: [],
      kernel_logs: [],
      last_run: {
        triggeredAt: 0,
        status: 'idle',
        sources: [],
        signalsCreated: 0
      },
      ai_quota_mode: 'available',
      ai_rate_limit_backoff_source: 'none',
      ai_quota: {
        mode: 'available',
        backoff_source: 'none',
        requests_this_window: 0,
        estimated_input_tokens_this_window: 0,
        estimated_output_tokens_this_window: 0,
        estimated_total_tokens_this_window: 0,
        window_started_at: Date.now(),
        window_started_at_iso: new Date().toISOString()
      },
      autonomous_ingestion_enabled: true,
      failure_count: {
        scout: 0,
        analyst: 0,
        router: 0,
        content_arb: 0,
        affiliate: 0,
        lead_gen: 0,
        resale: 0,
        referral: 0,
        trading: 0
      }
    },
    ingest_lock_until: 0,
    ingest_lock_reason: undefined
  };

  async onStart(): Promise<void> {
    const analystModel = this.selectPreferredModelForRole('analyst');

    const hydratedAssets = await Promise.all(
      asArray<any>(this.state.earning_assets || []).map((asset) =>
        this.hydrateAssetPaymentFields(asset)
      )
    );

    await this.setState({
      ...this.state,
      sessionId: 'nexus-core-singleton-v3',
      model: analystModel,
      tax_receipts: this.state.tax_receipts || [],
      earning_assets: hydratedAssets,
      niche_performance: this.state.niche_performance || [],
      source_performance: this.state.source_performance || [],
      policy: {
        ...this.state.policy,
        treasury_split: this.getTreasurySplit(),
        autonomous_ingestion_enabled: this.state.policy.autonomous_ingestion_enabled ?? true,
        max_ai_requests_per_cycle: this.getMaxAiRequestsPerCycle(),
        max_ai_tokens_per_cycle: this.getMaxAiTokensPerCycle(),
        min_minutes_between_ai_cycles: this.getMinMinutesBetweenAiCycles()
      },
      system_health: {
        ...this.state.system_health,
        autonomous_ingestion_enabled: this.state.policy.autonomous_ingestion_enabled ?? true,
        ai_quota_mode: this.state.system_health.ai_quota_mode || 'available',
        ai_quota: {
          mode: this.state.system_health.ai_quota?.mode || 'available',
          backoff_source: this.state.system_health.ai_quota?.backoff_source || 'none',
          requests_this_window: this.state.system_health.ai_quota?.requests_this_window || 0,
          estimated_input_tokens_this_window: this.state.system_health.ai_quota?.estimated_input_tokens_this_window || 0,
          estimated_output_tokens_this_window: this.state.system_health.ai_quota?.estimated_output_tokens_this_window || 0,
          estimated_total_tokens_this_window: this.state.system_health.ai_quota?.estimated_total_tokens_this_window || 0,
          window_started_at: this.state.system_health.ai_quota?.window_started_at || Date.now(),
          window_started_at_iso: this.state.system_health.ai_quota?.window_started_at_iso || new Date().toISOString(),
          ...this.state.system_health.ai_quota
        }
      }
    });

    const apiKey = this.env.CF_AI_API_KEY || CONFIG.DEFAULT_GEMINI_API_KEY;
    const baseUrl = this.env.CF_AI_BASE_URL || '';

    if (apiKey && baseUrl) {
      this.chatHandler = new ChatHandler(baseUrl, apiKey, analystModel);
      this.contentEngine = new ContentEngine(baseUrl, apiKey, this.selectPreferredModelForRole('content_arb'));
    }

    await this.pushKernelLog(`[SYSTEM] BOOT: KERNEL_CONSOLIDATED_ON_GATEWAY`);

    const alarm = await this.ctx.storage.getAlarm();

    if (alarm === null) {
      await this.ctx.storage.setAlarm(Date.now() + 5000);
    }
  }

  async onAlarm(): Promise<void> {
    await this.performAutonomousTick('alarm');
  }

  async performAutonomousTick(trigger: 'alarm' | 'scheduled' | 'manual' = 'scheduled'): Promise<void> {
    const now = Date.now();
    const autonomousEnabled = this.state.policy.autonomous_ingestion_enabled !== false;

    await this.performAutonomousMaintenance();

    if (!autonomousEnabled && trigger !== 'manual') {
      await this.pushKernelLog(`[SCHEDULER] AUTONOMOUS_INGESTION_DISABLED`);
      await this.scheduleNextCycle(this.state.policy.cooldown_period_ms || 300000);
      return;
    }

    if (this.state.policy.emergency_stop) {
      await this.pushKernelLog(`[SCHEDULER] SKIP_EXECUTION: EMERGENCY_STOP_ACTIVE`);
      await this.scheduleNextCycle(this.state.policy.cooldown_period_ms || 300000);
      return;
    }

    const lockUntil = safeNumber((this.state as any).ingest_lock_until, 0);

    if (lockUntil > now) {
      await this.pushKernelLog(
        `[SCHEDULER] SKIP_EXECUTION: INGEST_LOCK_ACTIVE UNTIL=${new Date(lockUntil).toISOString()}`
      );
      await this.scheduleNextCycle(Math.max(15000, lockUntil - now));
      return;
    }

    const aiBackoffRemaining = this.getAiBackoffRemainingMs('analyst');

    if (aiBackoffRemaining > 0) {
      await this.pushKernelLog(
        `[AI] BACKOFF_ACTIVE: SKIPPING_AI_ONLY REMAINING_MS=${aiBackoffRemaining} UNTIL=${new Date(this.getAiNextSafeAttemptAt('analyst')).toISOString()}`
      );

      await this.setDeferredRun('AI_BACKOFF_ACTIVE', this.getAiNextSafeAttemptAt('analyst'));
      await this.scheduleNextCycle(aiBackoffRemaining);
      return;
    }

    if (!this.isAiCyclePacingSatisfied()) {
      const nextSafe = this.getNextPacedAiAttemptAt();
      const waitMs = Math.max(15000, nextSafe - now);

      await this.pushKernelLog(
        `[AI] QUOTA_PACING_ACTIVE: SKIPPING_AI_ONLY NEXT_SAFE_AT=${new Date(nextSafe).toISOString()}`
      );

      await this.setDeferredRun('AI_QUOTA_PACING_ACTIVE', nextSafe);
      await this.scheduleNextCycle(waitMs);
      return;
    }

    await this.performFullCycle(false);

    const nextBackoff = this.getAiBackoffRemainingMs('analyst');

    if (nextBackoff > 0) {
      await this.scheduleNextCycle(nextBackoff);
      return;
    }

    await this.scheduleNextCycle(this.getAutonomousCycleCooldownMs());
  }

  private async scheduleNextCycle(delayMs: number) {
    const safeDelay = Math.max(15000, Math.floor(delayMs || 300000));
    const nextAt = Date.now() + safeDelay;

    try {
      await this.ctx.storage.setAlarm(nextAt);
    } catch {
      // Non-fatal in local/dev runtimes.
    }

    await this.setState({
      ...this.state,
      system_health: {
        ...this.state.system_health,
        next_scheduled_cycle_at: nextAt,
        next_scheduled_cycle_at_iso: new Date(nextAt).toISOString()
      }
    });
  }

  private async performAutonomousMaintenance() {
    const now = Date.now();

    const hydratedAssets = await Promise.all(
      asArray<any>(this.state.earning_assets || []).map((asset) =>
        this.hydrateAssetPaymentFields(asset)
      )
    );

    await this.setState({
      ...this.state,
      earning_assets: hydratedAssets,
      system_health: {
        ...this.state.system_health,
        last_maintenance_at: now,
        last_maintenance_at_iso: new Date(now).toISOString(),
        last_check: now
      }
    });

    await this.performAutonomousExecutionMaintenance(now);
  }

  private async setDeferredRun(reason: string, nextAttemptAt: number) {
    await this.setState({
      ...this.state,
      system_health: {
        ...this.state.system_health,
        status: 'warning',
        last_run: {
          ...(this.state.system_health.last_run || {
            triggeredAt: Date.now(),
            sources: [],
            signalsCreated: 0
          }),
          completedAt: Date.now(),
          status: 'deferred',
          deferred_reason: reason,
          error: reason,
          next_attempt_at: nextAttemptAt,
          next_attempt_at_iso: new Date(nextAttemptAt).toISOString()
        }
      }
    });
  }

  private getProductionMode(): ProductionMode {
    const envAny = this.env as any;
    const policyAny = this.state.policy as any;

    return parseProductionMode(
      envAny.PRODUCTION_MODE ||
        policyAny.production_mode ||
        'stability'
    );
  }

  private getAutonomousCycleCooldownMs(): number {
    const policyMinutes = this.getMinMinutesBetweenAiCycles();
    const policyMs = policyMinutes * 60_000;
    const base = safeNumber(this.state.policy.cooldown_period_ms, 300000);

    return Math.max(60_000, Math.min(Math.max(policyMs, base), 60 * 60_000));
  }

  private getInitialAiBackoffMs(): number {
    const envAny = this.env as any;
    return clampNumber(envAny.AI_INITIAL_BACKOFF_MS, 250, 30_000, 1000);
  }

  private getMaxAiBackoffMs(): number {
    const envAny = this.env as any;
    return clampNumber(envAny.AI_MAX_BACKOFF_MS, 1000, 10 * 60_000, 60_000);
  }

  private getMaxAiRequestsPerCycle(): number {
    const envAny = this.env as any;
    const policyAny = this.state.policy as any;

    return Math.max(
      1,
      Math.floor(
        safeNumber(
          envAny.AI_MAX_REQUESTS_PER_CYCLE ??
            policyAny.max_ai_requests_per_cycle,
          1
        )
      )
    );
  }

  private getMaxAiTokensPerCycle(): number {
    const envAny = this.env as any;
    const policyAny = this.state.policy as any;

    return Math.max(
      1000,
      Math.floor(
        safeNumber(
          envAny.AI_MAX_TOKENS_PER_CYCLE ??
            policyAny.max_ai_tokens_per_cycle,
          12000
        )
      )
    );
  }

  private getMinMinutesBetweenAiCycles(): number {
    const envAny = this.env as any;
    const policyAny = this.state.policy as any;

    return Math.max(
      1,
      Math.floor(
        safeNumber(
          envAny.AI_MIN_MINUTES_BETWEEN_CYCLES ??
            policyAny.min_minutes_between_ai_cycles,
          10
        )
      )
    );
  }

  private getEnvModelPoolKey(role: AgentRole): string {
    return `AI_MODEL_POOL_${role.toUpperCase()}`;
  }

  private getConfiguredModelPool(role: AgentRole): string[] {
    const envAny = this.env as any;
    const roleKey = this.getEnvModelPoolKey(role);

    const rolePool = uniqueStrings([envAny[roleKey]]);
    const defaultPool = uniqueStrings([envAny.AI_MODEL_POOL_DEFAULT]);

    const explicitPreferred = uniqueStrings([
      envAny.CF_AI_MODEL,
      envAny.AI_MODEL,
      envAny.GEMINI_MODEL
    ]);

    return uniqueStrings([
      ...rolePool,
      ...explicitPreferred,
      ...defaultPool,
      ...(FREE_MODEL_POOLS[role] || []),
      AGENT_MODELS[role]
    ]);
  }

  private getModelCooldowns(): Record<string, ModelRuntimeRecord> {
    return {
      ...(((this.state as any).ai_model_cooldowns || {}) as Record<string, ModelRuntimeRecord>)
    };
  }

  private getModelUnavailableRecords(): Record<string, ModelRuntimeRecord> {
    return {
      ...(((this.state as any).ai_model_unavailable || {}) as Record<string, ModelRuntimeRecord>)
    };
  }

  private isModelCoolingDown(model: string): boolean {
    const record = this.getModelCooldowns()[model];
    return Boolean(record && safeNumber(record.until, 0) > Date.now());
  }

  private isModelUnavailable(model: string): boolean {
    const record = this.getModelUnavailableRecords()[model];
    return Boolean(record && safeNumber(record.until, 0) > Date.now());
  }

  private getModelRuntimeUntil(model: string): number {
    const cooldown = this.getModelCooldowns()[model];
    const unavailable = this.getModelUnavailableRecords()[model];

    return Math.max(
      safeNumber(cooldown?.until, 0),
      safeNumber(unavailable?.until, 0)
    );
  }

  private getAvailableModelsForRole(role: AgentRole): string[] {
    return this.getConfiguredModelPool(role).filter((model) => {
      return !this.isModelCoolingDown(model) && !this.isModelUnavailable(model);
    });
  }

  private selectPreferredModelForRole(role: AgentRole): string {
    return this.getAvailableModelsForRole(role)[0] || this.getConfiguredModelPool(role)[0] || AGENT_MODELS[role];
  }

  private getNextModelCandidateAvailableAt(role: AgentRole): number {
    const now = Date.now();
    const candidates = this.getConfiguredModelPool(role);

    if (candidates.some((model) => !this.isModelCoolingDown(model) && !this.isModelUnavailable(model))) {
      return now;
    }

    const next = candidates
      .map((model) => this.getModelRuntimeUntil(model))
      .filter((until) => until > now)
      .sort((a, b) => a - b)[0];

    return next || now;
  }

  private getAiNextSafeAttemptAt(role: AgentRole = 'analyst'): number {
    const quota = this.state.system_health.ai_quota;
    const globalNext = Math.max(
      safeNumber(this.state.system_health.ai_next_safe_attempt_at, 0),
      safeNumber(quota?.next_safe_attempt_at, 0),
      safeNumber(this.state.system_health.ai_rate_limited_until, 0),
      safeNumber(quota?.rate_limited_until, 0),
      safeNumber(quota?.daily_quota_exhausted_until, 0)
    );

    const modelNext = this.getNextModelCandidateAvailableAt(role);

    return Math.max(globalNext, modelNext);
  }

  private getAiBackoffRemainingMs(role: AgentRole = 'analyst'): number {
    return Math.max(0, this.getAiNextSafeAttemptAt(role) - Date.now());
  }

  private isAiCyclePacingSatisfied(): boolean {
    const lastRequest = safeNumber(this.state.system_health.ai_quota?.last_request_at, 0);

    if (!lastRequest) return true;

    return Date.now() - lastRequest >= this.getMinMinutesBetweenAiCycles() * 60_000;
  }

  private getNextPacedAiAttemptAt(): number {
    const lastRequest = safeNumber(this.state.system_health.ai_quota?.last_request_at, 0);

    if (!lastRequest) return Date.now();

    return lastRequest + this.getMinMinutesBetweenAiCycles() * 60_000;
  }

  private estimateTokens(text: unknown): number {
    return Math.ceil(cleanText(text).length / 4);
  }

  private async recordAiRequest(context: string, model: string, inputText: string, outputText = '') {
    const now = Date.now();
    const health = this.state.system_health;
    const quota = health.ai_quota || { mode: 'available' as AiQuotaMode };

    const windowStarted = safeNumber(quota.window_started_at, now);
    const resetWindow = now - windowStarted > 60_000;

    const inputTokens = this.estimateTokens(inputText);
    const outputTokens = this.estimateTokens(outputText);

    await this.setState({
      ...this.state,
      model,
      system_health: {
        ...health,
        ai_quota_mode: 'available',
        ai_quota: {
          ...quota,
          mode: 'available',
          last_context: context,
          last_model: model,
          last_request_at: now,
          last_request_at_iso: new Date(now).toISOString(),
          window_started_at: resetWindow ? now : windowStarted,
          window_started_at_iso: new Date(resetWindow ? now : windowStarted).toISOString(),
          requests_this_window: (resetWindow ? 0 : safeNumber(quota.requests_this_window, 0)) + 1,
          estimated_input_tokens_this_window:
            (resetWindow ? 0 : safeNumber(quota.estimated_input_tokens_this_window, 0)) + inputTokens,
          estimated_output_tokens_this_window:
            (resetWindow ? 0 : safeNumber(quota.estimated_output_tokens_this_window, 0)) + outputTokens,
          estimated_total_tokens_this_window:
            (resetWindow ? 0 : safeNumber(quota.estimated_total_tokens_this_window, 0)) +
            inputTokens +
            outputTokens
        }
      }
    });
  }

  private parseRetryAfterHeader(value: unknown): number | null {
    if (!value) return null;

    const raw = String(value).trim();

    if (!raw) return null;

    const seconds = Number(raw);

    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.max(1000, Math.floor(seconds * 1000));
    }

    const dateMs = Date.parse(raw);

    if (Number.isFinite(dateMs)) {
      return Math.max(1000, dateMs - Date.now());
    }

    return null;
  }

  private getHeaderLike(headers: any, key: string): string {
    if (!headers) return '';

    try {
      if (typeof headers.get === 'function') {
        return headers.get(key) || headers.get(key.toLowerCase()) || '';
      }

      return headers[key] || headers[key.toLowerCase()] || '';
    } catch {
      return '';
    }
  }

  private parseProviderRetryDelayMs(error: unknown): number | null {
    const errAny = error as any;
    const containers = [
      errAny,
      errAny?.response,
      errAny?.error,
      errAny?.cause,
      errAny?.data,
      errAny?.body
    ];

    const stack: any[] = [...containers];

    while (stack.length > 0) {
      const item = stack.shift();

      if (!item || typeof item !== 'object') continue;

      const retryDelay = item.retryDelay || item.retry_delay || item.retry_after || item.retryAfter;

      if (retryDelay) {
        const asText = String(retryDelay);
        const secondsMatch = asText.match(/(\d+(?:\.\d+)?)s/);

        if (secondsMatch) return Math.max(1000, Math.floor(Number(secondsMatch[1]) * 1000));

        const numeric = Number(retryDelay);

        if (Number.isFinite(numeric) && numeric >= 0) {
          return numeric > 1000 ? Math.floor(numeric) : Math.floor(numeric * 1000);
        }
      }

      for (const value of Object.values(item)) {
        if (Array.isArray(value)) {
          stack.push(...value);
        } else if (value && typeof value === 'object') {
          stack.push(value);
        }
      }
    }

    return null;
  }

  private parseRetryTextMs(message: string): number | null {
    const patterns = [
      /retry(?:\s+again)?\s+in\s+(\d+(?:\.\d+)?)\s*(ms|milliseconds|s|sec|secs|second|seconds|m|min|minute|minutes)/i,
      /try(?:\s+again)?\s+in\s+(\d+(?:\.\d+)?)\s*(ms|milliseconds|s|sec|secs|second|seconds|m|min|minute|minutes)/i,
      /wait\s+(\d+(?:\.\d+)?)\s*(ms|milliseconds|s|sec|secs|second|seconds|m|min|minute|minutes)/i
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);

      if (!match) continue;

      const value = Number(match[1]);
      const unit = String(match[2] || 's').toLowerCase();

      if (!Number.isFinite(value)) continue;

      if (unit.startsWith('ms') || unit.startsWith('millisecond')) return Math.max(1000, Math.floor(value));
      if (unit.startsWith('m') && !unit.startsWith('ms')) return Math.max(1000, Math.floor(value * 60_000));

      return Math.max(1000, Math.floor(value * 1000));
    }

    return null;
  }

  private isDailyQuotaError(message: string): boolean {
    const text = message.toLowerCase();

    return (
      text.includes('per day') ||
      text.includes('requests per day') ||
      text.includes('daily') ||
      text.includes('rpd') ||
      text.includes('quota exceeded') ||
      text.includes('resource_exhausted')
    );
  }

  private getErrorStatus(error: unknown): number | undefined {
    const errAny = error as any;
    const candidates = [
      errAny?.status,
      errAny?.statusCode,
      errAny?.response?.status,
      errAny?.response?.statusCode,
      errAny?.error?.code,
      errAny?.code
    ];

    const status = candidates.map(Number).find((value) => Number.isFinite(value) && value >= 100);

    return status ? Math.floor(status) : undefined;
  }

  private getProviderBackoff(error: unknown): ProviderBackoff {
    const message = error instanceof Error ? error.message : String(error || '');
    const status = this.getErrorStatus(error);
    const errAny = error as any;

    const retryAfterHeader =
      this.getHeaderLike(errAny?.headers, 'retry-after') ||
      this.getHeaderLike(errAny?.response?.headers, 'retry-after');

    const retryAfterMs = this.parseRetryAfterHeader(retryAfterHeader);

    if (retryAfterMs) {
      return {
        retryAfterMs,
        source: 'provider_retry_after',
        status
      };
    }

    const retryDelayMs = this.parseProviderRetryDelayMs(error);

    if (retryDelayMs) {
      return {
        retryAfterMs: retryDelayMs,
        source: 'provider_retry_delay',
        status
      };
    }

    const textDelayMs = this.parseRetryTextMs(message);

    if (textDelayMs) {
      return {
        retryAfterMs: textDelayMs,
        source: 'provider_error_text',
        status
      };
    }

    if (this.isDailyQuotaError(message)) {
      const until = nextPacificMidnightMs();

      return {
        retryAfterMs: Math.max(60_000, until - Date.now()),
        source: 'provider_error_text',
        status,
        dailyQuotaExhaustedUntil: until
      };
    }

    const previousFailures = safeNumber((this.state.system_health.failure_count as any)?.analyst, 0);
    const exponential = Math.min(
      this.getMaxAiBackoffMs(),
      this.getInitialAiBackoffMs() * Math.pow(2, Math.min(previousFailures, 6))
    );
    const jitter = Math.floor(Math.random() * Math.max(250, exponential * 0.25));

    return {
      retryAfterMs: Math.max(1000, exponential + jitter),
      source: 'exponential_jitter',
      status
    };
  }

  private isAiRateLimitError(error: unknown): boolean {
    const errAny = error as any;
    const message = String(errAny?.message || error || '').toLowerCase();

    return (
      Number(errAny?.status) === 429 ||
      Number(errAny?.response?.status) === 429 ||
      Number(errAny?.statusCode) === 429 ||
      message.includes('429') ||
      message.includes('rate limit') ||
      message.includes('ratelimit') ||
      message.includes('resource_exhausted') ||
      message.includes('quota')
    );
  }

  private isAiModelUnavailableError(error: unknown): boolean {
    const message = String((error as any)?.message || error || '').toLowerCase();

    return (
      message.includes('model not found') ||
      (message.includes('models/') && message.includes('not found')) ||
      message.includes('unsupported model') ||
      message.includes('not supported') ||
      message.includes('invalid model') ||
      message.includes('model is not available') ||
      message.includes('permission denied') ||
      message.includes('not enabled')
    );
  }

  private async markAiModelRateLimited(model: string, context: string, error: unknown) {
    const providerBackoff = this.getProviderBackoff(error);
    const until = Date.now() + providerBackoff.retryAfterMs;
    const message = error instanceof Error ? error.message : String(error || 'AI_RATE_LIMITED');
    const status = providerBackoff.status || 429;

    const cooldowns = this.getModelCooldowns();

    cooldowns[model] = {
      until,
      until_iso: new Date(until).toISOString(),
      context,
      status,
      source: providerBackoff.source,
      message: message.slice(0, 500)
    };

    await this.pushKernelLog(
      `[AI] MODEL_RATE_LIMITED: MODEL=${model} CONTEXT=${context} STATUS=${status} RETRY_AFTER_MS=${providerBackoff.retryAfterMs} SOURCE=${providerBackoff.source}`
    );

    await this.setState({
      ...(this.state as any),
      ai_model_cooldowns: cooldowns,
      system_health: {
        ...this.state.system_health,
        status: 'warning',
        ai_quota_mode: 'pacing',
        ai_quota: {
          ...(this.state.system_health.ai_quota || { mode: 'pacing' }),
          mode: 'pacing',
          last_context: context,
          last_model: model,
          last_status: status,
          last_message: message.slice(0, 500),
          backoff_source: providerBackoff.source
        }
      }
    } as any);
  }

  private async markAiModelUnavailable(model: string, context: string, error: unknown) {
    const until = Date.now() + 6 * 60 * 60_000;
    const message = error instanceof Error ? error.message : String(error || 'AI_MODEL_UNAVAILABLE');
    const unavailable = this.getModelUnavailableRecords();

    unavailable[model] = {
      until,
      until_iso: new Date(until).toISOString(),
      context,
      status: this.getErrorStatus(error),
      source: 'model_unavailable',
      message: message.slice(0, 500)
    };

    await this.pushKernelLog(
      `[AI] MODEL_UNAVAILABLE: MODEL=${model} CONTEXT=${context} UNTIL=${new Date(until).toISOString()} MESSAGE=${message.slice(0, 180)}`
    );

    await this.setState({
      ...(this.state as any),
      ai_model_unavailable: unavailable
    } as any);
  }

  private async markAiRateLimited(context: string, error: unknown, model?: string) {
    const providerBackoff = this.getProviderBackoff(error);
    const backoffMs = providerBackoff.retryAfterMs;
    const nextSafeAt = Date.now() + backoffMs;
    const message = error instanceof Error ? error.message : String(error || 'AI_RATE_LIMITED');
    const status = providerBackoff.status || 429;
    const mode: AiQuotaMode = providerBackoff.dailyQuotaExhaustedUntil
      ? 'daily_quota_exhausted'
      : 'provider_backoff';

    const issues = [
      `AI provider rate-limited ${context}. Next safe AI attempt ${new Date(nextSafeAt).toISOString()}. Source=${providerBackoff.source}.`,
      ...(this.state.system_health.issues || [])
    ];

    await this.pushKernelLog(
      `[AI] RATE_LIMITED: ${context} STATUS=${status} RETRY_AFTER_MS=${backoffMs} SOURCE=${providerBackoff.source} MESSAGE=${message.slice(0, 220)}`
    );

    await this.setState({
      ...this.state,
      system_health: {
        ...this.state.system_health,
        status: 'warning',
        issues: Array.from(new Set(issues)).slice(0, 10),

        ai_quota_mode: mode,
        ai_rate_limited_until: nextSafeAt,
        ai_rate_limited_until_iso: new Date(nextSafeAt).toISOString(),
        ai_rate_limit_backoff_source: providerBackoff.source,
        ai_rate_limit_last_status: status,
        ai_rate_limit_last_message: message.slice(0, 500),
        ai_next_safe_attempt_at: nextSafeAt,
        ai_next_safe_attempt_at_iso: new Date(nextSafeAt).toISOString(),

        ai_quota: {
          ...(this.state.system_health.ai_quota || { mode }),
          mode,
          rate_limited_until: nextSafeAt,
          rate_limited_until_iso: new Date(nextSafeAt).toISOString(),
          next_safe_attempt_at: nextSafeAt,
          next_safe_attempt_at_iso: new Date(nextSafeAt).toISOString(),
          backoff_source: providerBackoff.source,
          last_status: status,
          last_message: message.slice(0, 500),
          last_context: context,
          last_model: model || this.selectPreferredModelForRole('analyst'),
          daily_quota_exhausted_until: providerBackoff.dailyQuotaExhaustedUntil,
          daily_quota_exhausted_until_iso: providerBackoff.dailyQuotaExhaustedUntil
            ? new Date(providerBackoff.dailyQuotaExhaustedUntil).toISOString()
            : undefined
        },

        last_run: {
          ...(this.state.system_health.last_run || {
            triggeredAt: Date.now(),
            sources: [],
            signalsCreated: 0
          }),
          completedAt: Date.now(),
          status: 'deferred',
          error: 'AI_RATE_LIMITED',
          deferred_reason: 'AI_RATE_LIMITED',
          next_attempt_at: nextSafeAt,
          next_attempt_at_iso: new Date(nextSafeAt).toISOString()
        }
      }
    });

    try {
      await this.ctx.storage.setAlarm(nextSafeAt);
    } catch {
      // Non-fatal in local/dev runtimes.
    }
  }

  private async runAiCompletionWithModelFallback(input: {
    role: AgentRole;
    context: string;
    prompt: string;
    messages?: any[];
    streamCallback?: (chunk: string) => void;
  }): Promise<AiCompletionResult> {
    if (!this.chatHandler) {
      throw new Error('AI_HANDLER_NOT_READY');
    }

    const candidates = this.getConfiguredModelPool(input.role);
    let lastError: unknown = null;
    let attempted = 0;

    for (const model of candidates) {
      if (this.isModelCoolingDown(model) || this.isModelUnavailable(model)) {
        continue;
      }

      attempted++;

      try {
        await this.pushKernelLog(
          `[AI] MODEL_ATTEMPT: ROLE=${input.role} CONTEXT=${input.context} MODEL=${model}`
        );

        const res = await this.chatHandler.processMessage(
          input.prompt,
          input.messages || [],
          input.streamCallback,
          model
        );

        const content = String(res?.content || '');

        await this.recordAiRequest(input.context, model, input.prompt, content);

        return {
          content,
          toolCalls: res?.toolCalls,
          model
        };
      } catch (error) {
        lastError = error;

        if (this.isAiRateLimitError(error)) {
          await this.markAiModelRateLimited(model, input.context, error);
          continue;
        }

        if (this.isAiModelUnavailableError(error)) {
          await this.markAiModelUnavailable(model, input.context, error);
          continue;
        }

        throw error;
      }
    }

    if (attempted === 0) {
      const nextSafe = this.getNextModelCandidateAvailableAt(input.role);
      const waitMs = Math.max(1000, nextSafe - Date.now());

      await this.pushKernelLog(
        `[AI] NO_MODEL_AVAILABLE: ROLE=${input.role} CONTEXT=${input.context} WAIT_MS=${waitMs}`
      );

      await this.setDeferredRun('AI_MODEL_POOL_COOLDOWN_ACTIVE', nextSafe);
      throw new Error('AI_RATE_LIMITED');
    }

    if (lastError && this.isAiRateLimitError(lastError)) {
      await this.markAiRateLimited(input.context, lastError);
      throw new Error('AI_RATE_LIMITED');
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError || 'AI_MODEL_POOL_FAILED'));
  }

  private getNativeDecimals(): number {
    const envAny = this.env as any;
    const value = Number(envAny.CRYPTO_NATIVE_DECIMALS ?? 18);

    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 18;
  }

  private getMinConfirmations(): number {
    const envAny = this.env as any;
    const value = Number(envAny.CRYPTO_MIN_CONFIRMATIONS ?? 1);

    return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;
  }

  private getAllowedUnderpaymentNok(): number {
    const envAny = this.env as any;
    const value = Number(envAny.CRYPTO_ALLOWED_UNDERPAYMENT_NOK ?? 0);

    return Number.isFinite(value) && value >= 0 ? value : 0;
  }

  private allowConfiguredCryptoPriceFallback(): boolean {
    const envAny = this.env as any;
    const raw = [
      envAny.CRYPTO_ALLOW_CONFIGURED_PRICE_FALLBACK,
      envAny.CRYPTO_PRICE_ALLOW_CONFIGURED_FALLBACK,
      envAny.PUBLIC_PAYMENT_ALLOW_CONFIGURED_PRICE_FALLBACK
    ]
      .map((value) => String(value || '').trim())
      .find(Boolean);

    return truthy(raw);
  }

  private async getLiveNativePaymentQuoteForPrice(
    priceNok: number,
    options: {
      forceRefresh?: boolean;
    } = {}
  ): Promise<NativePaymentQuote | null> {
    try {
      return await quoteNativePaymentForNokLive({
        env: {
          ...(this.env as any)
        },
        priceNok,
        nativeSymbol: this.env.CRYPTO_NATIVE_SYMBOL || 'POL',
        decimals: this.getNativeDecimals(),
        forceRefresh: options.forceRefresh ?? false,
        allowStale: true,
        allowConfiguredFallback: this.allowConfiguredCryptoPriceFallback()
      } as any);
    } catch (error) {
      await this.pushKernelLog(
        `[PRICE_ORACLE] LIVE_QUOTE_FAILED: ${(error instanceof Error ? error.message : String(error)).slice(0, 500)}`
      );

      return null;
    }
  }

  private async buildPaymentEnforcementMetadata(priceNok: number): Promise<PaymentEnforcementMetadata> {
    const safePriceNok = Number(priceNok || 0);

    if (!Number.isFinite(safePriceNok) || safePriceNok <= 0) {
      return {
        enabled: false,
        pricing_mode: 'live_oracle',
        reason: 'REPORT_PRICE_NOK_INVALID',
        required_price_nok: 0,
        message: 'Report price is invalid, so payment enforcement cannot be calculated.'
      };
    }

    const quote = await this.getLiveNativePaymentQuoteForPrice(safePriceNok, {
      forceRefresh: false
    });

    if (!quote) {
      return {
        enabled: false,
        pricing_mode: 'live_oracle',
        reason: 'LIVE_NATIVE_PRICE_QUOTE_UNAVAILABLE',
        required_price_nok: safePriceNok,
        message:
          'Live POL/NOK quote is currently unavailable. Payment unlock is paused until the price oracle responds.'
      };
    }

    return {
      enabled: true,
      pricing_mode: 'live_oracle',
      required_price_nok: safePriceNok,

      native_symbol: quote.native_symbol,
      native_price_nok: quote.native_price_nok,

      required_amount_crypto: quote.required_amount_crypto,
      required_amount_crypto_string: quote.required_amount_crypto_string,
      required_amount_wei: quote.required_amount_wei,

      decimals: quote.decimals,
      min_confirmations: this.getMinConfirmations(),
      allowed_underpayment_nok: this.getAllowedUnderpaymentNok(),

      message: `Send at least ${quote.required_amount_crypto_string} ${quote.native_symbol} to unlock this report.`,

      quote_provider: quote.provider,
      quote_source: quote.source,
      quote_source_id: quote.source_id,
      quote_source_url: quote.source_url,
      quote_fetched_at: quote.fetched_at,
      quote_fetched_at_iso: quote.fetched_at_iso,
      quote_stale: Boolean(quote.stale),
      quote_fallback: Boolean(quote.fallback)
    };
  }

  private getCryptoEstimateText(paymentEnforcement: PaymentEnforcementMetadata): string {
    if (paymentEnforcement.enabled) {
      return `${paymentEnforcement.required_amount_crypto_string} ${paymentEnforcement.native_symbol}`;
    }

    return 'Live crypto amount temporarily unavailable.';
  }

  private async hydrateAssetPaymentFields(asset: any): Promise<any> {
    if (!asset) return asset;

    const priceNok = Number(asset.price_nok ?? 49);
    const isPaid =
      asset.unlock_status === 'unlocked' ||
      asset.status === 'paid' ||
      Boolean(asset.paid_tx_hash);

    const shouldRebuildEnforcement =
      !isPaid ||
      !asset.payment_enforcement ||
      asset.payment_enforcement.enabled === false ||
      String(asset.price_crypto_estimate || '') === LEGACY_MANUAL_CRYPTO_TEXT;

    const paymentEnforcement: PaymentEnforcementMetadata = shouldRebuildEnforcement
      ? await this.buildPaymentEnforcementMetadata(priceNok)
      : asset.payment_enforcement;

    const chain =
      asset.payment_config?.chain ||
      (this.env as any).PUBLIC_PAYMENT_CHAIN ||
      'Polygon';

    const assetSymbol =
      asset.payment_config?.asset ||
      (this.env as any).PUBLIC_PAYMENT_ASSET ||
      this.env.CRYPTO_NATIVE_SYMBOL ||
      'POL';

    const slug = asset.slug || makeReportSlug(asset.title, asset.id);

    const paymentConfig = {
      ...(asset.payment_config || {}),
      chain,
      asset: assetSymbol,
      address:
        asset.payment_config?.address ||
        (this.env as any).PUBLIC_PAYMENT_ADDRESS ||
        this.env.CRYPTO_TREASURY_ADDRESS ||
        '',
      note:
        paymentEnforcement.enabled
          ? `Send at least ${paymentEnforcement.required_amount_crypto_string} ${paymentEnforcement.native_symbol} on ${chain} to unlock.`
          : asset.payment_config?.note ||
            (this.env as any).PUBLIC_PAYMENT_NOTE ||
            'Payment unlock is temporarily paused until the live crypto price oracle responds.',
      amount_enforcement: paymentEnforcement
    };

    return {
      ...asset,
      slug,
      local_url: asset.local_url || `/reports/${slug}`,
      public_url: asset.public_url || `/reports/${slug}`,
      published_url: asset.published_url || `/reports/${slug}`,
      metadata_url: asset.metadata_url || `/reports/${slug}/metadata.json`,
      preview_url: asset.preview_url || `/reports/${slug}/preview.json`,
      full_json_url: asset.full_json_url || `/reports/${slug}/full.json`,
      verify_payment_url: asset.verify_payment_url || `/reports/${slug}/verify-payment`,
      payment_config: paymentConfig,
      payment_enforcement: paymentEnforcement,
      price_crypto_estimate: this.getCryptoEstimateText(paymentEnforcement),
      full_report_json: {
        ...(asset.full_report_json || {}),
        payment_enforcement: paymentEnforcement
      }
    };
  }

  private mapDiscoveredNicheToScannerNiche(niche: string): string {
    const text = String(niche || '').toLowerCase();

    if (
      text.includes('affiliate') ||
      text.includes('saas') ||
      text.includes('referral') ||
      text.includes('bounty')
    ) {
      return 'SaaS_Affiliate';
    }

    if (
      text.includes('lead') ||
      text.includes('hiring') ||
      text.includes('sales') ||
      text.includes('agency') ||
      text.includes('b2b')
    ) {
      return 'B2B_LeadGen';
    }

    if (
      text.includes('market') ||
      text.includes('trading') ||
      text.includes('liquidity') ||
      text.includes('price') ||
      text.includes('macro')
    ) {
      return 'Market_Trading';
    }

    return 'Content_Arb';
  }

  private selectNicheForCycle(): { niche: string; reason: string } {
    const index = this.state.current_niche_index || 0;
    const rotationNiche = DEFAULT_SCANNER_NICHES[index % DEFAULT_SCANNER_NICHES.length];

    const topNiche = [...(this.state.niche_performance || [])]
      .sort((a, b) => scoreNichePerformance(b) - scoreNichePerformance(a))[0];

    if (topNiche && index % 3 !== 1) {
      const reinforcedNiche = this.mapDiscoveredNicheToScannerNiche(topNiche.niche);

      return {
        niche: reinforcedNiche,
        reason: `reinforced_from_top_niche:${topNiche.niche}`
      };
    }

    return {
      niche: rotationNiche,
      reason: 'baseline_rotation'
    };
  }

  private async performFullCycle(skipInitialStateUpdate = false) {
    const now = Date.now();
    const productionMode = this.getProductionMode();
    const limits = getProductionLimits(productionMode);

    const effectiveMaxSources = Math.max(
      1,
      Math.min(
        safeNumber((this.state.policy as any).max_sources_per_cycle, limits.max_sources_per_cycle),
        limits.max_sources_per_cycle
      )
    );

    const effectiveMaxSignals = Math.max(
      1,
      Math.min(
        safeNumber((this.state.policy as any).max_signals_analyzed_per_cycle, limits.max_signals_analyzed_per_cycle),
        limits.max_signals_analyzed_per_cycle,
        this.getMaxAiRequestsPerCycle()
      )
    );

    const effectiveMaxExecute = Math.max(
      1,
      Math.min(
        safeNumber((this.state.policy as any).max_opportunities_executed_per_cycle, limits.max_opportunities_executed_per_cycle),
        limits.max_opportunities_executed_per_cycle
      )
    );

    await this.pushKernelLog(
      `[KERNEL] INITIATING_CYCLE_EXECUTION MODE=${limits.mode} SOURCES=${effectiveMaxSources} ANALYZE=${effectiveMaxSignals} EXECUTE=${effectiveMaxExecute}`
    );

    const aiBackoffRemainingMs = this.getAiBackoffRemainingMs('analyst');

    if (aiBackoffRemainingMs > 0) {
      await this.setDeferredRun('AI_BACKOFF_ACTIVE', this.getAiNextSafeAttemptAt('analyst'));
      await this.pushKernelLog(
        `[AI] BACKOFF_ACTIVE: SKIPPING_CYCLE REMAINING_MS=${aiBackoffRemainingMs} UNTIL=${new Date(this.getAiNextSafeAttemptAt('analyst')).toISOString()}`
      );
      return;
    }

    if (!this.env.CF_AI_API_KEY || !this.env.CF_AI_BASE_URL) {
      await this.pushKernelLog(`[CRITICAL] AI_CONFIG_MISSING: KERNEL_SUSPENDED`);

      await this.setState({
        ...this.state,
        system_health: {
          ...this.state.system_health,
          status: 'warning',
          last_run: {
            triggeredAt: now,
            status: 'failed',
            sources: [],
            signalsCreated: 0,
            error: 'AI_CONFIG_MISSING'
          }
        }
      });

      return;
    }

    if (!this.chatHandler || !this.contentEngine) {
      const apiKey = this.env.CF_AI_API_KEY || CONFIG.DEFAULT_GEMINI_API_KEY;
      const baseUrl = this.env.CF_AI_BASE_URL || '';

      if (apiKey && baseUrl) {
        this.chatHandler = new ChatHandler(baseUrl, apiKey, this.selectPreferredModelForRole('analyst'));
        this.contentEngine = new ContentEngine(baseUrl, apiKey, this.selectPreferredModelForRole('content_arb'));
      }
    }

    if (!this.state.setup_complete || this.state.policy.emergency_stop) {
      return;
    }

    if (!skipInitialStateUpdate) {
      const currentStatus = this.state.system_health.last_run?.status as string;
      const lastTriggeredAt = safeNumber(this.state.system_health.last_run?.triggeredAt, 0);
      const staleRunning =
        currentStatus === 'running' &&
        lastTriggeredAt > 0 &&
        Date.now() - lastTriggeredAt > 15 * 60_000;

      if (currentStatus === 'running' && !staleRunning) {
        await this.pushKernelLog(`[SYSTEM] INGEST_ALREADY_RUNNING: SKIPPING_OVERLAPPING_CYCLE`);
        return;
      }

      if (staleRunning) {
        await this.pushKernelLog(
          `[SYSTEM] STALE_RUNNING_STATE_RECOVERED: AGE_MS=${Date.now() - lastTriggeredAt}`
        );

        await this.setState({
          ...this.state,
          ingest_lock_until: 0,
          ingest_lock_reason: undefined,
          agents: this.state.agents.map((agent) =>
            ['scout', 'analyst', 'router'].includes(agent.role)
              ? { ...agent, status: 'idle' }
              : agent
          ),
          system_health: {
            ...this.state.system_health,
            status: 'warning',
            last_run: {
              ...(this.state.system_health.last_run || {
                triggeredAt: Date.now(),
                sources: [],
                signalsCreated: 0
              }),
              completedAt: Date.now(),
              status: 'failed',
              error: 'STALE_RUNNING_STATE_RECOVERED'
            }
          }
        });
      }
    }

    await this.performAnomalyDetection();

    const lastReset = this.state.last_spend_reset || 0;

    if (now - lastReset > 86400000) {
      await this.setState({
        ...this.state,
        daily_spend: 0,
        last_spend_reset: now
      });

      await this.pushKernelLog(`[GOVERNOR] DAILY_BUDGET_RESET_EXECUTED`);
    }

    const runStartTime = now;
    const lockUntil = now + 10 * 60_000;
    const nicheSelection = this.selectNicheForCycle();
    const currentNiche = nicheSelection.niche;

    await this.pushKernelLog(`[SCOUT] NICHE_SELECTION: ${currentNiche} | ${nicheSelection.reason}`);

    if (!skipInitialStateUpdate) {
      await this.setState({
        ...this.state,
        ingest_lock_until: lockUntil,
        ingest_lock_reason: 'performFullCycle',
        system_health: {
          ...this.state.system_health,
          last_run: {
            triggeredAt: runStartTime,
            status: 'running',
            sources: ['source_registry_pending'],
            signalsCreated: 0,
            niche: currentNiche
          }
        }
      });
    }

    try {
      await this.updateAgentStatus('scout', 'scanning');

      const signals = await this.performScoutScan(currentNiche, effectiveMaxSources);
      const eligibleSignals = this.filterPreviouslyAnalyzedSignals(signals);
      const rankedSignals = rankSignalsForAnalysis(
        eligibleSignals,
        this.state.source_performance || [],
        effectiveMaxSignals
      );

      let opportunitiesCreatedCount = 0;
      const cycleOpportunities: Opportunity[] = [];

      if (rankedSignals.length > 0) {
        await this.updateAgentStatus('analyst', 'analyzing');

        for (const rankedSignal of rankedSignals.slice(0, effectiveMaxSignals)) {
          await this.pushKernelLog(
            `[ANALYST] SIGNAL_SELECTED: ${rankedSignal.metadata.source_id || 'unknown'} SCORE=${rankedSignal.ranking_score} ${rankedSignal.ranking_reason}`
          );

          const opp = await this.performAnalystReview(rankedSignal.signal);

          await this.rememberAnalyzedSignal(rankedSignal.signal);

          if (!opp) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            continue;
          }

          opportunitiesCreatedCount += 1;
          cycleOpportunities.push(opp);

          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } else {
        await this.pushKernelLog(`[ANALYST] SKIP: NO_NEW_ELIGIBLE_SIGNALS_AFTER_DEDUPLICATION`);
      }

      if (cycleOpportunities.length > 0) {
        await this.updateAgentStatus('router', 'routing');

        const executionPlan = buildExecutionPlan(cycleOpportunities, {
          niche_performance: this.state.niche_performance || [],
          source_performance: this.state.source_performance || [],
          production_mode: productionMode
        });

        const planSummary = {
          mode: limits.mode,
          selected_count: executionPlan.opportunities.length,
          selected: executionPlan.opportunities.slice(0, effectiveMaxExecute).map((opp) => ({
            id: opp.id,
            title: opp.title,
            ranking_score: (opp as any).ranking_score,
            selected_agents: (opp as any).selected_agents,
            projected_market_value_usd: (opp as any).projected_market_value_usd,
            recommended_price_nok: (opp as any).recommended_price_nok
          }))
        };

        await this.pushKernelLog(
          `[ROUTER] EXECUTION_PLAN: ${JSON.stringify(planSummary).slice(0, 900)}`
        );

        for (const rankedOpp of executionPlan.opportunities.slice(0, effectiveMaxExecute)) {
          if (this.checkGovernor(rankedOpp)) {
            await this.performRouterAssignment(rankedOpp);
          } else {
            await this.pushKernelLog(
              `[GOVERNOR] REJECTED: OPP_${rankedOpp.id.slice(-4)}_EXCEEDS_POLICY`
            );
          }
        }
      }

      await this.setState({
        ...this.state,
        ingest_lock_until: 0,
        ingest_lock_reason: undefined,
        current_niche_index: (this.state.current_niche_index || 0) + 1,
        system_health: {
          ...this.state.system_health,
          last_scan: Date.now(),
          status: this.state.system_health.status === 'down' ? 'warning' : 'healthy',
          ai_quota_mode: 'available',
          ai_quota: {
            ...(this.state.system_health.ai_quota || { mode: 'available' }),
            mode: 'available'
          },
          last_run: {
            ...(this.state.system_health.last_run || {
              triggeredAt: Date.now(),
              status: 'running',
              sources: [],
              signalsCreated: 0
            }),
            completedAt: Date.now(),
            status: 'success',
            signalsCreated: opportunitiesCreatedCount,
            error: undefined
          }
        }
      });
    } catch (error: any) {
      const rateLimited = this.isAiRateLimitError(error) || String(error?.message || '') === 'AI_RATE_LIMITED';
      const errorMessage = rateLimited ? 'AI_RATE_LIMITED' : error.message || 'KERNEL_EXCEPTION';

      if (rateLimited) {
        await this.markAiRateLimited('performFullCycle', error);
      } else {
        await this.pushKernelLog(`[CRITICAL] KERNEL_HALT: ${errorMessage}`);
      }

      await this.setState({
        ...this.state,
        ingest_lock_until: 0,
        ingest_lock_reason: undefined,
        system_health: {
          ...this.state.system_health,
          status: rateLimited ? 'warning' : 'degraded',
          last_run: {
            ...(this.state.system_health.last_run || {
              triggeredAt: Date.now(),
              status: 'failed',
              sources: [],
              signalsCreated: 0
            }),
            completedAt: Date.now(),
            status: rateLimited ? 'deferred' : 'failed',
            error: errorMessage
          }
        }
      });
    } finally {
      await this.resetAgentStatuses();
    }
  }

  private getSignalHash(signal: string): string {
    return hashString(this.normalizeSignalFingerprint(signal));
  }

  private getAnalyzedSignalHashes(): string[] {
    return asArray<string>((this.state as any).analyzed_signal_hashes).slice(0, 500);
  }

  private filterPreviouslyAnalyzedSignals(signals: string[]): string[] {
    const seen = new Set(this.getAnalyzedSignalHashes());
    const deduped: string[] = [];
    const localSeen = new Set<string>();

    for (const signal of signals) {
      const hash = this.getSignalHash(signal);

      if (seen.has(hash) || localSeen.has(hash)) continue;

      localSeen.add(hash);
      deduped.push(signal);
    }

    return deduped;
  }

  private async rememberAnalyzedSignal(signal: string) {
    const hash = this.getSignalHash(signal);
    const hashes = [hash, ...this.getAnalyzedSignalHashes().filter((item) => item !== hash)].slice(0, 500);

    await this.setState({
      ...(this.state as any),
      analyzed_signal_hashes: hashes
    } as any);
  }

  private async performAnomalyDetection() {
    const health = this.state.system_health;
    const agents = [...this.state.agents];
    let healthUpdated = false;
    const issues = [...(health.issues || [])];

    for (const agent of agents) {
      const failures = health.failure_count[agent.role] || 0;

      if (failures >= 3 && agent.status !== 'error') {
        await this.pushKernelLog(
          `[ANOMALY] CRITICAL_FAILURE_DETECTED: ${agent.role.toUpperCase()} (Consecutive: ${failures})`
        );

        agent.status = 'error';
        agent.health = Math.max(0, agent.health - 20);
        issues.push(`Agent ${agent.role} flagged for anomaly: ${failures} consecutive failures.`);
        healthUpdated = true;
      }
    }

    if (healthUpdated) {
      await this.setState({
        ...this.state,
        agents,
        system_health: {
          ...health,
          issues: Array.from(new Set(issues)).slice(-10),
          status: 'warning'
        }
      });
    }
  }

  private async pushKernelLog(message: string) {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false });
    const formatted = `${timestamp} ${message}`;
    const health = this.state.system_health;
    const kernel_logs = [formatted, ...(health.kernel_logs || [])].slice(0, 100);

    await this.setState({
      ...this.state,
      system_health: {
        ...health,
        kernel_logs
      }
    });
  }

  private async updateAgentStatus(role: AgentRole, status: AgentStatus) {
    await this.setState({
      ...this.state,
      agents: this.state.agents.map((agent) =>
        agent.role === role
          ? {
              ...agent,
              status,
              lastActive: Date.now()
            }
          : agent
      )
    });
  }

  private async resetAgentStatuses() {
    await this.setState({
      ...this.state,
      agents: this.state.agents.map((agent) =>
        ['scout', 'analyst', 'router'].includes(agent.role)
          ? {
              ...agent,
              status: 'idle'
            }
          : agent
      )
    });
  }

  private checkGovernor(opp: Opportunity): boolean {
    if (this.state.policy.emergency_stop) return false;

    const maxRisk = this.state.policy.max_risk_score ?? 1;
    const withinRisk = (opp.risk_score || 0) <= maxRisk;

    if (!withinRisk) return false;

    const requiredCapital = Number(opp.required_capital || 0);

    if (requiredCapital <= 0) return true;

    const maxSpend = this.state.policy.max_spend_per_day ?? 0;

    return this.state.daily_spend + requiredCapital <= maxSpend;
  }

  private async performScoutScan(niche: string, maxSources: number): Promise<string[]> {
    const categoryByNiche: Record<string, string[]> = {
      SaaS_Affiliate: ['startup', 'developer_tools', 'ai', 'tech_news'],
      B2B_LeadGen: ['startup', 'jobs', 'market', 'developer_tools', 'tech_news'],
      Content_Arb: ['tech_news', 'developer_tools', 'ai', 'security', 'research', 'open_source'],
      Market_Trading: ['market', 'security', 'tech_news', 'ai', 'developer_tools']
    };

    const wantedCategories = categoryByNiche[niche] || ['tech_news', 'developer_tools'];

    const enabledSources = getEnabledSources();
    const candidateSources = enabledSources.filter((source) =>
      wantedCategories.includes(source.category)
    );

    const sourceSelection = selectSourcesForCycle({
      niche,
      allSources: candidateSources.length > 0 ? candidateSources : enabledSources,
      sourcePerformance: this.state.source_performance || [],
      maxSources
    });

    const selectedSources = sourceSelection.selectedSources;
    const selectedSourceIds = selectedSources.map((source) => source.id);

    await this.pushKernelLog(
      `[SCOUT] SOURCE_SELECTION: ${selectedSourceIds.join(', ') || 'none'} | ${sourceSelection.reason}`
    );

    await this.setState({
      ...this.state,
      system_health: {
        ...this.state.system_health,
        last_run: {
          ...(this.state.system_health.last_run || {
            triggeredAt: Date.now(),
            status: 'running',
            signalsCreated: 0
          }),
          sources: selectedSourceIds
        }
      }
    });

    const signals: string[] = [];

    for (const source of selectedSources) {
      try {
        const result = await executeTool('web_search', { url: source.url });

        console.log('[SCOUT_SOURCE_RESULT]', source.url, result);

        if (result && 'content' in result && result.content) {
          signals.push(
            [
              `Source ID: ${source.id}`,
              `Source Name: ${source.name}`,
              `Source URL: ${source.url}`,
              `Source Category: ${source.category}`,
              `Source Priority: ${source.priority}`,
              `Niche: ${niche}`,
              '',
              String(result.content).slice(0, 3000)
            ].join('\n')
          );
        }
      } catch (error: any) {
        await this.pushKernelLog(
          `[SCOUT] SOURCE_FAILED: ${source.id} ${error?.message || String(error)}`
        );
      }
    }

    return signals;
  }

    private normalizeSignalFingerprint(value: unknown): string {
    return String(value || '')
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/github\.com\/[a-z0-9_.-]+\/[a-z0-9_.-]+/gi, ' ')
      .replace(/\b\d+(?:\.\d+)?\s*(points?|comments?|hours?|hrs?|minutes?|mins?)\b/gi, ' ')
      .replace(/\bby\s+[a-z0-9_.-]+\b/gi, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\b(points?|comments?|hide|hours?|hrs?|minutes?|mins?|ago|by|source|id|url|content)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240);
  }

  private opportunityFingerprint(item: any): string {
    return this.normalizeSignalFingerprint(
      [
        item?.title,
        item?.summary,
        item?.evidence,
        item?.notes,
        item?.opportunity_title,
        item?.source_evidence,
        item?.full_report_json?.title,
        item?.full_report_json?.executive_summary?.summary,
        item?.full_report_json?.source_evidence?.evidence,
        Array.isArray(item?.source_refs) ? item.source_refs.join(' ') : item?.source_refs,
        Array.isArray(item?.full_report_json?.source_evidence?.source_refs)
          ? item.full_report_json.source_evidence.source_refs.join(' ')
          : undefined
      ]
        .filter(Boolean)
        .join(' ')
    );
  }

  private fingerprintsMatch(a: string, b: string): boolean {
    const left = cleanText(a).toLowerCase();
    const right = cleanText(b).toLowerCase();

    if (!left || !right || left.length < 24 || right.length < 24) {
      return false;
    }

    if (
      left === right ||
      left.includes(right.slice(0, 80)) ||
      right.includes(left.slice(0, 80))
    ) {
      return true;
    }

    const stopWords = new Set([
      'the',
      'and',
      'for',
      'with',
      'from',
      'this',
      'that',
      'into',
      'report',
      'alert',
      'urgent',
      'critical',
      'analysis',
      'intelligence',
      'source',
      'signal',
      'market',
      'buyer',
      'paid',
      'payload'
    ]);

    const tokenize = (value: string) =>
      new Set(
        value
          .split(/\s+/)
          .map((token) => token.trim())
          .filter((token) => token.length >= 3 && !stopWords.has(token))
      );

    const leftTokens = tokenize(left);
    const rightTokens = tokenize(right);

    if (leftTokens.size < 4 || rightTokens.size < 4) {
      return false;
    }

    let shared = 0;

    for (const token of leftTokens) {
      if (rightTokens.has(token)) {
        shared += 1;
      }
    }

    const overlap = shared / Math.min(leftTokens.size, rightTokens.size);

    return shared >= 6 && overlap >= 0.62;
  }

  private isDuplicateOpportunityCandidate(candidate: any): boolean {
    const candidateKey = this.opportunityFingerprint(candidate);

    if (!candidateKey || candidateKey.length < 24) {
      return false;
    }

    const existingItems = [
      ...(this.state.opportunities || []),
      ...(this.state.earning_assets || [])
    ];

    return existingItems.some((item: any) => {
      if (candidate?.id && item?.id === candidate.id) {
        return false;
      }

      return this.fingerprintsMatch(candidateKey, this.opportunityFingerprint(item));
    });
  }

  private findExistingAssetForOpportunity(opp: any): EarningAsset | null {
    const oppKey = this.opportunityFingerprint(opp);

    for (const asset of this.state.earning_assets || []) {
      const assetAny = asset as any;

      if (opp?.id && assetAny?.opportunity_id === opp.id) {
        return asset as EarningAsset;
      }

      if (opp?.report_asset_id && assetAny?.id === opp.report_asset_id) {
        return asset as EarningAsset;
      }

      if (opp?.report_slug && assetAny?.slug === opp.report_slug) {
        return asset as EarningAsset;
      }

      if (this.fingerprintsMatch(oppKey, this.opportunityFingerprint(assetAny))) {
        return asset as EarningAsset;
      }
    }

    return null;
  }

  private async performAnalystReview(signal: string): Promise<Opportunity | null> {
    console.log('[ANALYST_INPUT_SIGNAL]', signal.slice(0, 500));

    if (!this.chatHandler) return null;

    const prompt = `You are the Analyst Agent in a zero-capital autonomous synthesis arbitrage engine.

Your job is to infer one practical paid intelligence product from public trend signals.

The system is single-owner and must operate with:
- 0 upfront cost
- no manual sales
- no fake revenue
- no user accounts
- no multi-user SaaS
- machine-readable public products
- crypto payment unlock
- verified treasury credit only after payment

Given the source data, identify one actionable intelligence product that can be created and sold automatically.

Return ONLY valid JSON with these fields:
{
  "title": string,
  "summary": string,
  "niche": string,
  "evidence": string,
  "confidence_score": number between 0 and 1,
  "novelty_score": number between 0 and 1,
  "urgency_score": number between 0 and 1,
  "monetization_score": number between 0 and 1,
  "risk_score": number between 0 and 1,
  "market_value_score": number between 0 and 1,
  "projected_market_value_usd": number,
  "potential_profit": number,
  "recommended_price_nok": number,
  "recommended_price_usd": number,
  "buyer_type": string,
  "product_type": string,
  "pricing_reasoning": string,
  "required_capital": 0,
  "recommended_agents": array of one or more of ["content_arb","affiliate","lead_gen","referral"]
}

Meaning of values:
- projected_market_value_usd is projected market upside only, not earned revenue.
- potential_profit is a legacy compatibility copy of projected_market_value_usd.
- recommended_price_nok is the sale price for this specific generated intelligence report.
- verified revenue must only come from external payment verification.

Pricing rules:
- recommended_price_nok must reflect expected market value of the information.
- Use higher prices for urgent, commercial, security, legal, AI infrastructure, devtool, vulnerability, or business-critical intelligence.
- Use lower prices for generic commentary or weak signals.
- Suggested NOK range:
  - 19 NOK: weak/generic signal
  - 49 NOK: normal trend report
  - 99 NOK: useful niche intelligence
  - 199 NOK: strong commercial or technical intelligence
  - 499 NOK: urgent/high-value business, security, or agent-consumable intelligence
- Do not claim guaranteed profit.
- required_capital must be 0.
- evidence must quote or summarize the exact source signal that caused the opportunity.

Source data:
"${signal.slice(0, 2200)}"`;

    try {
      const completion = await this.runAiCompletionWithModelFallback({
        role: 'analyst',
        context: 'analyst',
        prompt,
        messages: []
      });

      console.log('[ANALYST_RAW_RESPONSE]', completion.content);

      if (!completion.content) {
        return null;
      }

      const jsonMatch = completion.content.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        console.log('[ANALYST_NO_JSON_FOUND]', completion.content);
        return null;
      }

      let oppData: any;

      try {
        oppData = JSON.parse(jsonMatch[0]);
      } catch {
        console.log('[ANALYST_JSON_PARSE_FAILED]', jsonMatch[0]);
        return null;
      }

      const noOpportunity =
        String(oppData.title || '').toLowerCase().includes('no arbitrage') ||
        String(oppData.title || '').toLowerCase().includes('no opportunity') ||
        String(oppData.summary || '').toLowerCase().includes('web search failure') ||
        Number(oppData.confidence_score || 0) <= 0 ||
        !Array.isArray(oppData.recommended_agents) ||
        oppData.recommended_agents.length === 0;

      if (noOpportunity) {
        console.log('[ANALYST_REJECTED_NON_ACTIONABLE]', oppData);
        return null;
      }

      const projectedMarketValueUsd = Number(
        oppData.projected_market_value_usd ??
          oppData.potential_profit ??
          0
      );

      const sourceRefsFromSignal = signal
        .split('\n')
        .filter((line) =>
          line.startsWith('Source ID:') ||
          line.startsWith('Source URL:') ||
          line.startsWith('Source Name:') ||
          line.startsWith('Source Category:') ||
          line.startsWith('Source Priority:')
        )
        .map((line) => line.trim());

      const opportunity = {
        id: `arb-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        title: cleanText(oppData.title || 'Untitled Opportunity'),
        summary: cleanText(oppData.summary || ''),
        niche: cleanText(oppData.niche || 'General'),
        signal_type: 'public_web_signal',
        evidence: cleanText(oppData.evidence || 'Evidence unavailable'),
        source_refs: sourceRefsFromSignal.length > 0 ? sourceRefsFromSignal : ['source_registry_signal'],
        intelligence_source: 'source_registry_scraper_analyst_pipeline',
        analyst_reasoning: cleanText(oppData.evidence || ''),
        confidence_score: Number(oppData.confidence_score || 0.5),
        novelty_score: Number(oppData.novelty_score || 0.5),
        urgency_score: Number(oppData.urgency_score || 0.5),
        monetization_score: Number(oppData.monetization_score || 0.5),
        market_value_score: Number(oppData.market_value_score || 0.5),
        risk_score: Number(oppData.risk_score || 0.25),
        required_capital: 0,
        potential_profit: projectedMarketValueUsd,
        projected_market_value_usd: projectedMarketValueUsd,
        recommended_price_nok: Number(oppData.recommended_price_nok || 49),
        recommended_price_usd: Number(oppData.recommended_price_usd || 0),
        buyer_type: cleanText(oppData.buyer_type || 'agent_or_automated_intelligence_consumer'),
        product_type: cleanText(oppData.product_type || 'paid_intelligence_payload'),
        pricing_reasoning: cleanText(oppData.pricing_reasoning || 'Default dynamic pricing fallback.'),
        recommended_agents: oppData.recommended_agents as AgentRole[],
        status: 'validated',
        created_at: Date.now(),
        updated_at: Date.now(),
        expiry_time: Date.now() + 86400000
      } as any as Opportunity;

      if (this.isDuplicateOpportunityCandidate(opportunity)) {
        await this.pushKernelLog(
          `[ANALYST] DUPLICATE_SIGNAL_SKIPPED: ${opportunity.title || opportunity.id}`
        );

        return null;
      }

      await this.setState({
        ...this.state,
        opportunities: [opportunity, ...(this.state.opportunities || [])].slice(0, 250)
      });

      return opportunity;
    } catch (error) {
      console.error('[ANALYST_FAILED]', error);

      if (this.isAiRateLimitError(error)) {
        await this.markAiRateLimited('analyst', error);
        throw new Error('AI_RATE_LIMITED');
      }

      return null;
    }
  }

  private async performRouterAssignment(opp: Opportunity | RankedOpportunity) {
    const productionMode = this.getProductionMode();
    const limits = getProductionLimits(productionMode);
    const oppAny = opp as any;

    const agentsToTrigger: AgentRole[] = Array.isArray(oppAny.selected_agents)
      ? oppAny.selected_agents.slice(0, limits.max_agents_per_opportunity)
      : Array.isArray(opp.recommended_agents)
        ? opp.recommended_agents.slice(0, limits.max_agents_per_opportunity)
        : [];

    for (const role of agentsToTrigger) {
      if (role === 'trading' && !this.state.policy.trading_enabled) continue;
      await this.executeAgentTask(role as AgentRole, opp as Opportunity);
    }
  }

  private async executeAgentTask(role: AgentRole, opp: Opportunity) {
    const taskId = `task-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const selectedModel = this.selectPreferredModelForRole(role);

    const newTask: AgentTask = {
      id: taskId,
      agent_role: role,
      opportunity_id: opp.id,
      opportunity_title: opp.title,
      status: 'executing',
      started_at: Date.now(),
      logs: [`[KERNEL] DISPATCHED_${role.toUpperCase()} USING_MODEL_${selectedModel}`]
    };

    await this.setState({
      ...this.state,
      tasks: [newTask, ...(this.state.tasks || [])].slice(0, 100),
      daily_spend: Number((this.state.daily_spend + (opp.required_capital || 0)).toFixed(2))
    });

    await this.updateAgentStatus(role, 'executing');

    let result: {
      success: boolean;
      profit: number;
      logs: string[];
      latency_ms?: number;
    } = {
      success: false,
      profit: 0,
      logs: []
    };

    const start = Date.now();

    try {
      if (role === 'content_arb') {
        const asset = await this.createEarningAssetFromOpportunity(role, opp);
        await this.updatePerformanceFromAsset(asset);

        result = {
          success: true,
          profit: 0,
          logs: [
            `ContentArb: Monetized intelligence product created at ${asset.local_url}`,
            `ContentArb: Dynamic price set at ${asset.price_nok} NOK`,
            'ContentArb: Report generation is deterministic and does not consume extra AI quota',
            'ContentArb: Awaiting verified external payment before treasury credit'
          ]
        };
      } else if (role === 'affiliate') {
        result = await monetizationLogic.executeAffiliate(opp);
      } else if (role === 'lead_gen') {
        result = await monetizationLogic.executeLeadGen(opp);
      } else if (role === 'trading' && this.state.policy.trading_enabled) {
        result = await monetizationLogic.executeTrading(opp);
      } else {
        result = {
          success: false,
          profit: 0,
          logs: [`${role}: NO_EXECUTION_HANDLER_AVAILABLE`]
        };
      }

      const latency = Date.now() - start;
      const failCount = { ...this.state.system_health.failure_count };

      if (!result.success) {
        failCount[role] = (failCount[role] || 0) + 1;
      } else {
        failCount[role] = 0;
      }

      await this.setState({
        ...this.state,
        system_health: {
          ...this.state.system_health,
          failure_count: failCount
        },
        tasks: (this.state.tasks || []).map((task) =>
          task.id === taskId
            ? {
                ...task,
                status: result.success ? 'completed' : 'failed',
                completed_at: Date.now(),
                result_profit: 0,
                latency_ms: latency,
                logs: [...(task.logs || []), ...(result.logs || [])]
              }
            : task
        )
      });

      if (result.success && result.profit > 0) {
        await this.pushKernelLog(
          `[TREASURY] VERIFIED_REVENUE_REQUIRED: ${role.toUpperCase()} reported projected profit ${result.profit}, treasury not credited`
        );
      }
    } catch (error: any) {
      const rateLimited = this.isAiRateLimitError(error);
      const latency = Date.now() - start;
      const failCount = { ...this.state.system_health.failure_count };
      failCount[role] = (failCount[role] || 0) + 1;

      await this.pushKernelLog(`[${role.toUpperCase()}] CRASH: ${error.message || String(error)}`);

      await this.setState({
        ...this.state,
        system_health: {
          ...this.state.system_health,
          status: rateLimited ? 'warning' : this.state.system_health.status,
          failure_count: failCount
        },
        tasks: (this.state.tasks || []).map((task) =>
          task.id === taskId
            ? {
                ...task,
                status: 'failed',
                completed_at: Date.now(),
                result_profit: 0,
                latency_ms: latency,
                logs: [
                  ...(task.logs || []),
                  rateLimited
                    ? `${role}: AI_RATE_LIMITED`
                    : `${role}: CRASH ${error.message || String(error)}`
                ]
              }
            : task
        )
      });

      if (rateLimited) {
        await this.markAiRateLimited(role, error, selectedModel);
        throw new Error('AI_RATE_LIMITED');
      }
    } finally {
      await this.updateAgentStatus(role, 'idle');
    }
  }

  private getTreasurySplit(): TreasurySplitPolicy {
    const raw = (this.state.policy as any).treasury_split || DEFAULT_TREASURY_SPLIT;

    return {
      reserve_percent: safeNumber(raw.reserve_percent, DEFAULT_TREASURY_SPLIT.reserve_percent),
      operating_percent: safeNumber(raw.operating_percent, DEFAULT_TREASURY_SPLIT.operating_percent),
      reinvest_percent: safeNumber(raw.reinvest_percent, DEFAULT_TREASURY_SPLIT.reinvest_percent),
      tax_percent: safeNumber(raw.tax_percent, DEFAULT_TREASURY_SPLIT.tax_percent),
      owner_percent: safeNumber(raw.owner_percent, DEFAULT_TREASURY_SPLIT.owner_percent)
    };
  }

  private validateTreasurySplit(split: TreasurySplitPolicy): string | null {
    const values = [
      split.reserve_percent,
      split.operating_percent,
      split.reinvest_percent,
      split.tax_percent,
      split.owner_percent
    ];

    if (values.some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) {
      return 'TREASURY_SPLIT_VALUES_MUST_BE_NON_NEGATIVE';
    }

    const total = values.reduce((sum, value) => sum + Number(value), 0);

    if (Math.abs(total - 100) > 0.001) {
      return 'TREASURY_SPLIT_MUST_TOTAL_100';
    }

    return null;
  }

  private getTreasuryDistributionMap(): Record<TreasuryBucket, number> {
    const split = this.getTreasurySplit();

    return {
      reserve: split.reserve_percent / 100,
      operating: split.operating_percent / 100,
      reinvestment: split.reinvest_percent / 100,
      tax_buffer: split.tax_percent / 100,
      owner_withdrawable: split.owner_percent / 100
    };
  }

  private async updateTreasuryFromProfit(profit: number, role: string, opportunityId: string) {
    await this.pushKernelLog(
      `[TREASURY] LEGACY_PROFIT_CREDIT_BLOCKED: role=${role} opportunity=${opportunityId} amount=${profit}. Only verified external payment receipts may credit treasury.`
    );
  }

  private async creditTreasuryFromVerifiedCryptoReceipt(receipt: CryptoReceipt) {
    const amount = receipt.estimated_value_nok ?? 0;
    const now = Date.now();

    if (amount <= 0) {
      await this.pushKernelLog(
        `[TREASURY] CRYPTO_RECEIPT_VERIFIED_BUT_NOK_VALUE_MISSING: ${receipt.tx_hash}`
      );

      const pendingEntry = {
        id: crypto.randomUUID(),
        timestamp: now,
        amount: 0,
        type: 'credit',
        bucket: 'operating',
        description: `CRYPTO_DEPOSIT_VERIFIED_VALUE_PENDING: ${receipt.asset_symbol} ${receipt.amount_crypto} TX:${receipt.tx_hash}`,
        agent_id: 'crypto_treasury',
        opportunity_id: receipt.tx_hash,
        tx_hash: receipt.tx_hash,
        verified: true
      } as any as LedgerEntry;

      const taxReceipt: TaxReceipt = {
        id: `tax-${crypto.randomUUID()}`,
        created_at: now,
        type: 'crypto_deposit',
        status: 'pending_value',
        tx_hash: receipt.tx_hash,
        chain_id: receipt.chain_id,
        from_address: receipt.from_address,
        to_address: receipt.to_address,
        asset_symbol: receipt.asset_symbol,
        amount_crypto: String(receipt.amount_crypto),
        fiat_currency: 'NOK',
        fiat_value_nok: null,
        valuation_status: 'pending',
        treasury_bucket: 'operating',
        ledger_entry_id: pendingEntry.id,
        source: 'onchain_verifier',
        notes:
          'Native crypto deposit verified on-chain. NOK value is pending and must be valued using market price at transaction time for Norwegian tax records.'
      };

      await this.setState({
        ...this.state,
        ledger: [pendingEntry, ...this.state.ledger].slice(0, 500),
        tax_receipts: [taxReceipt, ...(this.state.tax_receipts || [])].slice(0, 1000)
      });

      return;
    }

    const distributionMap = this.getTreasuryDistributionMap();
    const newTreasury = { ...this.state.treasury };
    const ledgerEntries: LedgerEntry[] = [];

    (Object.keys(distributionMap) as TreasuryBucket[]).forEach((bucket) => {
      const share = Number((amount * distributionMap[bucket]).toFixed(2));

      newTreasury[bucket] = Number(((newTreasury[bucket] || 0) + share).toFixed(2));

      ledgerEntries.push({
        id: crypto.randomUUID(),
        timestamp: now,
        amount: share,
        type: 'credit',
        bucket,
        description: `VERIFIED_CRYPTO_DEPOSIT: ${receipt.asset_symbol} ${receipt.amount_crypto} TX:${receipt.tx_hash}`,
        agent_id: 'crypto_treasury',
        opportunity_id: receipt.tx_hash,
        tx_hash: receipt.tx_hash,
        verified: true
      } as any as LedgerEntry);
    });

    newTreasury.total = Number(((this.state.treasury.total || 0) + amount).toFixed(2));

    const taxReceipt: TaxReceipt = {
      id: `tax-${crypto.randomUUID()}`,
      created_at: now,
      type: 'crypto_deposit',
      status: 'verified',
      tx_hash: receipt.tx_hash,
      chain_id: receipt.chain_id,
      from_address: receipt.from_address,
      to_address: receipt.to_address,
      asset_symbol: receipt.asset_symbol,
      amount_crypto: String(receipt.amount_crypto),
      fiat_currency: 'NOK',
      fiat_value_nok: amount,
      valuation_status: 'final',
      treasury_bucket: 'operating',
      ledger_entry_id: ledgerEntries[0]?.id,
      source: 'onchain_verifier',
      notes: receipt.notes || 'Native crypto deposit verified on-chain and credited using configured treasury split.'
    };

    await this.setState({
      ...this.state,
      treasury: newTreasury,
      ledger: [...ledgerEntries, ...this.state.ledger].slice(0, 500),
      tax_receipts: [taxReceipt, ...(this.state.tax_receipts || [])].slice(0, 1000)
    });

    await this.pushKernelLog(
      `[TREASURY] VERIFIED_CRYPTO_DEPOSIT_CREDITED: ${amount} NOK SPLIT=${JSON.stringify(this.getTreasurySplit())}`
    );
  }

  private calculateDynamicPriceNok(opp: Opportunity): DynamicPricing {
    const price = buildDynamicPriceFromOpportunity(opp, {
      env: this.env as any,
      now: Date.now()
    });

    return {
      price_nok: price.price_nok,
      price_usd: price.price_usd,
      price_tier: price.price_tier as PriceTier,
      market_value_score: price.market_value_score,
      projected_market_value_usd: price.projected_market_value_usd,
      pricing_reasoning: price.pricing_reasoning
    };
  }

  private getPublicBaseUrlFromEnv(): string {
    const envAny = this.env as any;
    return String(envAny.PUBLIC_BASE_URL || envAny.SITE_URL || '').replace(/\/+$/, '');
  }

  private async createEarningAssetFromOpportunity(role: AgentRole, opp: Opportunity): Promise<EarningAsset> {
    const now = Date.now();
    const envAny = this.env as any;
    const oppAny = opp as any;

    const existingAsset = this.findExistingAssetForOpportunity(opp);

    if (existingAsset) {
      const hydratedExistingAsset = await this.hydrateAssetPaymentFields(existingAsset);
      const existingSlug = hydratedExistingAsset.slug || makeReportSlug(hydratedExistingAsset.title, hydratedExistingAsset.id);

      await this.setState({
        ...this.state,
        earning_assets: (this.state.earning_assets || []).map((asset) =>
          (asset as any).id === hydratedExistingAsset.id
            ? hydratedExistingAsset
            : asset
        ),
        opportunities: (this.state.opportunities || []).map((item) =>
          item.id === opp.id
            ? {
                ...(item as any),
                report_asset_id: hydratedExistingAsset.id,
                report_slug: existingSlug,
                report_url: hydratedExistingAsset.local_url || `/reports/${existingSlug}`,
                metadata_url: hydratedExistingAsset.metadata_url || `/reports/${existingSlug}/metadata.json`,
                preview_url: hydratedExistingAsset.preview_url || `/reports/${existingSlug}/preview.json`,
                full_json_url: hydratedExistingAsset.full_json_url || `/reports/${existingSlug}/full.json`,
                verify_payment_url:
                  hydratedExistingAsset.verify_payment_url || `/reports/${existingSlug}/verify-payment`,
                price_nok: hydratedExistingAsset.price_nok,
                price_crypto_estimate: hydratedExistingAsset.price_crypto_estimate,
                payment_enforcement: hydratedExistingAsset.payment_enforcement,
                updated_at: now,
                status: 'completed'
              }
            : item
        )
      });

      await this.pushKernelLog(
        `[EARNING_ASSET] DUPLICATE_REUSED: ${hydratedExistingAsset.id} FOR_OPP_${opp.id.slice(-4)}`
      );

      return hydratedExistingAsset as EarningAsset;
    }

    const assetId = `asset-${crypto.randomUUID().slice(0, 8)}`;
    const slug = makeReportSlug(opp.title, assetId);
    const pricing = this.calculateDynamicPriceNok(opp);
    const paymentEnforcement = await this.buildPaymentEnforcementMetadata(pricing.price_nok);

    const paymentConfig = {
      chain: envAny.PUBLIC_PAYMENT_CHAIN || 'Polygon',
      asset: envAny.PUBLIC_PAYMENT_ASSET || this.env.CRYPTO_NATIVE_SYMBOL || 'POL',
      address: envAny.PUBLIC_PAYMENT_ADDRESS || this.env.CRYPTO_TREASURY_ADDRESS || '',
      note:
        paymentEnforcement.enabled
          ? `Send at least ${paymentEnforcement.required_amount_crypto_string} ${paymentEnforcement.native_symbol} on ${envAny.PUBLIC_PAYMENT_CHAIN || 'Polygon'} to unlock.`
          : envAny.PUBLIC_PAYMENT_NOTE || 'Payment unlock is temporarily paused until the live crypto price oracle responds.',
      amount_enforcement: paymentEnforcement
    } as any;

    const affiliateOfferLinks = buildAffiliateOfferLinks({
      env: this.env as any,
      title: opp.title,
      niche: opp.niche,
      summary: opp.summary,
      evidence: opp.evidence,
      buyer_type: opp.buyer_type,
      product_type: opp.product_type,
      source_refs: opp.source_refs,
      limit: 3
    } as any);

    if (affiliateOfferLinks.length > 0) {
      await this.pushKernelLog(
        `[AFFILIATE] MATCHED_OFFERS: ${affiliateOfferLinks.map((link) => link.label).join(', ')}`
      );
    }

    const offerLinks = [
      ...affiliateOfferLinks,
      {
        label: `Pay with ${paymentConfig.asset} on ${paymentConfig.chain}`,
        url: paymentConfig.address,
        type: 'payment' as const
      }
    ];

    const monetizationChannel = affiliateOfferLinks.length > 0 ? 'hybrid' as const : 'crypto_payment' as const;

    const reportPayload = buildIntelligenceReportPayload({
      assetId,
      slug,
      opportunity: opp,
      pricing,
      paymentConfig,
      offerLinks,
      generatedAt: now,
      publicBaseUrl: this.getPublicBaseUrlFromEnv()
    } as any);

    const reportUrl = `/reports/${slug}`;
    const metadataUrl = `/reports/${slug}/metadata.json`;
    const previewUrl = `/reports/${slug}/preview.json`;
    const fullJsonUrl = `/reports/${slug}/full.json`;
    const verifyPaymentUrl = `/reports/${slug}/verify-payment`;

    const fullReportJson = {
      ...(reportPayload.full_report_json || {}),
      payment_enforcement: paymentEnforcement
    };

    const earningAsset = {
      id: assetId,
      slug,
      created_at: now,
      updated_at: now,

      opportunity_id: opp.id,
      opportunity_title: opp.title,
      agent_role: role,

      title: opp.title,
      niche: opp.niche,
      status: 'published_local',

      monetization_channel: monetizationChannel,
      payment_config: paymentConfig,

      price_nok: pricing.price_nok,
      price_usd: pricing.price_usd,
      price_tier: pricing.price_tier,
      price_crypto_estimate: this.getCryptoEstimateText(paymentEnforcement),
      payment_enforcement: paymentEnforcement,

      market_value_score: pricing.market_value_score,
      projected_market_value_usd: pricing.projected_market_value_usd,
      buyer_type: oppAny.buyer_type || 'agent_or_automated_intelligence_consumer',
      product_type: oppAny.product_type || 'paid_intelligence_payload',
      pricing_reasoning: pricing.pricing_reasoning,

      unlock_status: 'locked',
      full_report_html: reportPayload.full_report_html,
      full_report_json: fullReportJson,
      paid_tx_hash: undefined,
      paid_at: undefined,

      offer_links: offerLinks,
      local_url: reportUrl,
      public_url: reportUrl,
      published_url: reportUrl,
      metadata_url: metadataUrl,
      preview_url: previewUrl,
      full_json_url: fullJsonUrl,
      verify_payment_url: verifyPaymentUrl,

      page_html: reportPayload.page_html,

      seo_title: reportPayload.seo_title,
      seo_description: reportPayload.seo_description,
      canonical_url: reportUrl,

      estimated_revenue_nok: 0,
      verified_revenue_nok: 0,
      payout_status: 'awaiting_conversion',

      source: 'content_arb',
      source_refs: opp.source_refs || [],
      source_evidence: opp.evidence,
      notes:
        `Locked paid intelligence product created with dynamic price ${pricing.price_nok} NOK. ${pricing.pricing_reasoning}`
    } as any as EarningAsset;

    const updatedOpportunityFields = {
      report_asset_id: assetId,
      report_slug: slug,
      report_url: reportUrl,
      metadata_url: metadataUrl,
      preview_url: previewUrl,
      full_json_url: fullJsonUrl,
      verify_payment_url: verifyPaymentUrl,
      price_nok: pricing.price_nok,
      price_crypto_estimate: this.getCryptoEstimateText(paymentEnforcement),
      payment_enforcement: paymentEnforcement,
      offer_links: affiliateOfferLinks,
      updated_at: now,
      status: 'completed'
    };

    await this.setState({
      ...this.state,
      earning_assets: [earningAsset, ...(this.state.earning_assets || [])].slice(0, 500),
      opportunities: (this.state.opportunities || []).map((item) =>
        item.id === opp.id
          ? {
              ...(item as any),
              ...updatedOpportunityFields
            }
          : item
      )
    });

    await this.pushKernelLog(
      `[EARNING_ASSET] CREATED: ${assetId} SLUG_${slug} PRICE_${pricing.price_nok}_NOK FOR_OPP_${opp.id.slice(-4)}`
    );

    return earningAsset;
  }

  private async updatePerformanceFromAsset(asset: EarningAsset) {
    const nichePerformance = updateNichePerformanceFromAsset(
      this.state.niche_performance || [],
      asset
    );

    const sourcePerformance = updateSourcePerformanceFromAsset(
      this.state.source_performance || [],
      asset
    );

    const summary = summarizePerformance({
      niche_performance: nichePerformance,
      source_performance: sourcePerformance
    });

    const timestamp = new Date().toLocaleTimeString([], { hour12: false });
    const topNiche = summary.top_niche?.niche || 'none';
    const topSource = summary.top_source?.source_id || 'none';
    const formatted = `${timestamp} [PERFORMANCE] UPDATED_FROM_ASSET: ${asset.id} TOP_NICHE=${topNiche} TOP_SOURCE=${topSource}`;

    await this.setState({
      ...this.state,
      niche_performance: nichePerformance,
      source_performance: sourcePerformance,
      system_health: {
        ...this.state.system_health,
        kernel_logs: [formatted, ...(this.state.system_health.kernel_logs || [])].slice(0, 100)
      }
    });
  }

  private parseSourceRefsFromAsset(asset: any): Array<{
    source_id: string;
    source_name?: string;
    source_url?: string;
    source_category?: string;
    source_priority?: number;
  }> {
    const refs = Array.isArray(asset?.full_report_json?.source_evidence?.source_refs)
      ? asset.full_report_json.source_evidence.source_refs
      : Array.isArray(asset?.full_report_json?.source_refs)
        ? asset.full_report_json.source_refs
        : Array.isArray(asset?.source_refs)
          ? asset.source_refs
          : [];

    const parsed: {
      source_id?: string;
      source_name?: string;
      source_url?: string;
      source_category?: string;
      source_priority?: number;
    } = {};

    for (const raw of refs) {
      const line = String(raw || '').trim();

      if (line.startsWith('Source ID:')) {
        parsed.source_id = line.replace('Source ID:', '').trim();
      } else if (line.startsWith('Source Name:')) {
        parsed.source_name = line.replace('Source Name:', '').trim();
      } else if (line.startsWith('Source URL:')) {
        parsed.source_url = line.replace('Source URL:', '').trim();
      } else if (line.startsWith('Source Category:')) {
        parsed.source_category = line.replace('Source Category:', '').trim();
      } else if (line.startsWith('Source Priority:')) {
        parsed.source_priority = Number(line.replace('Source Priority:', '').trim());
      }
    }

    if (!parsed.source_id) return [];

    return [
      {
        source_id: parsed.source_id,
        source_name: parsed.source_name,
        source_url: parsed.source_url,
        source_category: parsed.source_category,
        source_priority: parsed.source_priority
      }
    ];
  }

  private async updatePerformanceFromVerifiedAsset(asset: EarningAsset) {
    const now = Date.now();
    const assetAny = asset as any;
    const revenue = Number(asset.verified_revenue_nok || 0);
    const niche = String(asset.niche || 'General');

    const currentNichePerformance = [...(this.state.niche_performance || [])];
    const existingNiche = currentNichePerformance.find((item) => item.niche === niche);

    let nextNichePerformance: NichePerformance[];

    if (existingNiche) {
      const updatedNiche: NichePerformance = {
        ...existingNiche,
        verified_unlocks: existingNiche.verified_unlocks + 1,
        verified_revenue_nok: Number((existingNiche.verified_revenue_nok + revenue).toFixed(2)),
        last_seen_at: now
      };

      nextNichePerformance = [
        updatedNiche,
        ...currentNichePerformance.filter((item) => item.niche !== niche)
      ].sort((a, b) => scoreNichePerformance(b) - scoreNichePerformance(a));
    } else {
      nextNichePerformance = updateNichePerformanceFromAsset([], asset);
    }

    const sourceRefs = this.parseSourceRefsFromAsset(asset);
    let nextSourcePerformance = [...(this.state.source_performance || [])];

    for (const ref of sourceRefs) {
      const existingSource = nextSourcePerformance.find((item) => item.source_id === ref.source_id);

      if (existingSource) {
        const updatedSource: SourcePerformance = {
          ...existingSource,
          verified_unlocks: existingSource.verified_unlocks + 1,
          verified_revenue_nok: Number((existingSource.verified_revenue_nok + revenue).toFixed(2)),
          last_seen_at: now
        };

        nextSourcePerformance = [
          updatedSource,
          ...nextSourcePerformance.filter((item) => item.source_id !== ref.source_id)
        ];
      } else {
        nextSourcePerformance = updateSourcePerformanceFromAsset(nextSourcePerformance, asset);
      }
    }

    const summary = summarizePerformance({
      niche_performance: nextNichePerformance,
      source_performance: nextSourcePerformance
    });

    const timestamp = new Date().toLocaleTimeString([], { hour12: false });
    const topNiche = summary.top_niche?.niche || 'none';
    const topSource = summary.top_source?.source_id || 'none';
    const formatted = `${timestamp} [PERFORMANCE] VERIFIED_UNLOCK_REINFORCED: ${asset.id} REVENUE_NOK=${revenue} TOP_NICHE=${topNiche} TOP_SOURCE=${topSource}`;

    await this.setState({
      ...this.state,
      niche_performance: nextNichePerformance,
      source_performance: nextSourcePerformance,
      system_health: {
        ...this.state.system_health,
        kernel_logs: [formatted, ...(this.state.system_health.kernel_logs || [])].slice(0, 100)
      }
    });

    await this.pushKernelLog(
      `[PERFORMANCE] PAYMENT_REINFORCEMENT_COMPLETE: ASSET=${asset.id} PRICE=${asset.price_nok} VERIFIED=${assetAny.verified_revenue_nok || 0}`
    );
  }

  private getPublicOrigin(request: Request): string {
    const forwardedOrigin = request.headers.get('x-public-origin');
    const forwardedPrefix = request.headers.get('x-public-path-prefix') || '';

    if (forwardedOrigin) {
      return `${forwardedOrigin.replace(/\/+$/, '')}${forwardedPrefix}`;
    }

    const envBase = this.getPublicBaseUrlFromEnv();

    if (envBase) return envBase;

    const url = new URL(request.url);
return `${url.protocol}//${url.host}`;
  }

  private getAssetsNewestFirst() {
    return asArray<any>(this.state.earning_assets)
      .slice()
      .sort((a, b) => {
        return Number(b.created_at || 0) - Number(a.created_at || 0);
      });
  }

  private getPublicAssetsNewestFirst() {
    return this.getAssetsNewestFirst().filter((asset) => {
      return Number(asset.price_nok || 0) > 0 && Boolean(asset.slug || asset.id);
    });
  }

  private findAssetBySlugOrId(slugOrId: string) {
    return this.getAssetsNewestFirst().find((asset) => {
      return asset.slug === slugOrId || asset.id === slugOrId;
    });
  }

  private isAdminRequest(request: Request): boolean {
    const expected = String((this.env as any).ADMIN_API_TOKEN || '').trim();

    if (!expected) return false;

    const auth = request.headers.get('authorization') || '';
    const bearer = auth.replace(/^Bearer\s+/i, '').trim();
    const xAdminToken = request.headers.get('x-admin-api-token') || '';

    return bearer === expected || xAdminToken === expected;
  }

  private getCleanPublicTitle(value: unknown): string {
    return cleanText(value)
      .replace(/\bURGENT\b:?/gi, '')
      .replace(/\bCRITICAL\b:?/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private getPublicSeoTitle(asset: any): string {
    const title = this.getCleanPublicTitle(asset?.title || asset?.opportunity_title || 'Intelligence Brief');
    return `${title} | Arbitrage Nexus`;
  }

  private getPublicSeoDescription(asset: any): string {
    const text = cleanText(
      asset?.seo_description ||
        asset?.full_report_json?.executive_summary?.summary ||
        asset?.full_report_json?.summary ||
        asset?.opportunity_title ||
        asset?.title ||
        ''
    );

    return shortText(
      text ||
        'Independent machine-readable intelligence brief for developers, operators, researchers, and automated buyers.',
      155
    );
  }

  private async publicAssetMetadata(asset: any, origin: string) {
    const hydratedAsset = await this.hydrateAssetPaymentFields(asset);
    const slug = hydratedAsset.slug || makeReportSlug(hydratedAsset.title, hydratedAsset.id);
    const priceNok = Number(hydratedAsset.price_nok ?? 49);
    const paymentEnforcement: PaymentEnforcementMetadata =
      hydratedAsset.payment_enforcement || await this.buildPaymentEnforcementMetadata(priceNok);

    const publicPayment = {
      chain:
        hydratedAsset.payment_config?.chain ||
        (this.env as any).PUBLIC_PAYMENT_CHAIN ||
        'Polygon',
      asset:
        hydratedAsset.payment_config?.asset ||
        (this.env as any).PUBLIC_PAYMENT_ASSET ||
        this.env.CRYPTO_NATIVE_SYMBOL ||
        'POL',
      address:
        hydratedAsset.payment_config?.address ||
        (this.env as any).PUBLIC_PAYMENT_ADDRESS ||
        this.env.CRYPTO_TREASURY_ADDRESS ||
        '',
      required_amount:
        paymentEnforcement.enabled
          ? `${paymentEnforcement.required_amount_crypto_string} ${paymentEnforcement.native_symbol}`
          : 'temporarily unavailable',
      note:
        paymentEnforcement.enabled
          ? `Send exactly or above the listed amount, then verify the transaction hash to unlock the full report.`
          : 'Payment unlock is temporarily paused until the live crypto price oracle responds.'
    };

    return {
      asset_id: hydratedAsset.id,
      slug,
      type: 'intelligence_report',
      title: this.getCleanPublicTitle(hydratedAsset.title),
      niche: cleanText(hydratedAsset.niche || 'Market Intelligence'),
      created_at: hydratedAsset.created_at,
      updated_at: hydratedAsset.updated_at,
      freshness_iso: safeIso(hydratedAsset.updated_at || hydratedAsset.created_at),
      preview: shortText(
        hydratedAsset.full_report_json?.executive_summary?.summary ||
          hydratedAsset.seo_description ||
          hydratedAsset.opportunity_title ||
          hydratedAsset.title,
        260
      ),
      seo_title: this.getPublicSeoTitle(hydratedAsset),
      seo_description: this.getPublicSeoDescription(hydratedAsset),

      projected_market_value_usd:
        hydratedAsset.projected_market_value_usd ??
        hydratedAsset.full_report_json?.projected_market_value_usd ??
        hydratedAsset.full_report_json?.pricing?.projected_market_value_usd ??
        null,

      price_nok: priceNok,
      price_usd: hydratedAsset.price_usd ?? hydratedAsset.full_report_json?.pricing?.price_usd,
      price_tier: hydratedAsset.price_tier ?? hydratedAsset.full_report_json?.pricing?.price_tier,
      buyer_type:
        hydratedAsset.buyer_type ||
        hydratedAsset.full_report_json?.pricing?.buyer_type ||
        hydratedAsset.full_report_json?.executive_summary?.buyer_type ||
        'technical and commercial intelligence buyers',
      product_type:
        hydratedAsset.product_type ||
        hydratedAsset.full_report_json?.pricing?.product_type ||
        hydratedAsset.full_report_json?.executive_summary?.product_type ||
        'paid intelligence report',

      price_crypto_estimate: this.getCryptoEstimateText(paymentEnforcement),
      payment_available: Boolean(paymentEnforcement.enabled),
      unlock_status: hydratedAsset.unlock_status === 'unlocked' ? 'unlocked' : 'locked',
      offer_links: asArray<any>(hydratedAsset.offer_links || []).filter((link) => {
        const url = String(link?.url || '');
        return link?.type !== 'payment' && /^https?:\/\//i.test(url) && !url.includes('example.com');
      }),
      payment: publicPayment,
      urls: {
        page: absoluteUrl(origin, `/reports/${slug}`),
        metadata_json: absoluteUrl(origin, `/reports/${slug}/metadata.json`),
        preview_json: absoluteUrl(origin, `/reports/${slug}/preview.json`),
        full_json: absoluteUrl(origin, `/reports/${slug}/full.json`),
        verify_payment: absoluteUrl(origin, `/reports/${slug}/verify-payment`)
      }
    };
  }

  private signalPageCss(): string {
    return `
      :root {
        color-scheme: dark;
        --bg: #060913;
        --bg2: #0a1020;
        --panel: rgba(12, 18, 34, 0.92);
        --panel2: rgba(18, 27, 50, 0.9);
        --text: #f8fafc;
        --muted: #a9b4c7;
        --soft: #dbeafe;
        --border: rgba(148, 163, 184, 0.22);
        --accent: #22e6b8;
        --accent2: #38bdf8;
        --warning: #facc15;
      }

      * { box-sizing: border-box; }

      html {
        scroll-behavior: smooth;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at 16% 0%, rgba(56, 189, 248, 0.16), transparent 28%),
          radial-gradient(circle at 88% 12%, rgba(34, 230, 184, 0.12), transparent 30%),
          linear-gradient(180deg, var(--bg) 0%, var(--bg2) 56%, #030712 100%);
        color: var(--text);
        line-height: 1.65;
      }

      a {
        color: #b8fff0;
        font-weight: 800;
        text-decoration-thickness: 1px;
        text-underline-offset: 4px;
      }

      .shell {
        width: min(1120px, calc(100% - 36px));
        margin: 0 auto;
        padding: 34px 0 72px;
      }

      .nav {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 18px;
        margin-bottom: 28px;
      }

      .brand {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        color: #eef7ff;
        font-size: 13px;
        font-weight: 950;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }

      .brand-mark {
        width: 34px;
        height: 34px;
        border-radius: 12px;
        background: linear-gradient(135deg, var(--accent2), var(--accent));
        box-shadow: 0 0 34px rgba(34, 230, 184, 0.22);
      }

      .feed-links {
        display: flex;
        flex-wrap: wrap;
        gap: 9px;
        justify-content: flex-end;
      }

      .feed-links a,
      .button-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(56, 189, 248, 0.22);
        background: rgba(7, 12, 25, 0.72);
        color: var(--text);
        text-decoration: none;
        border-radius: 999px;
        padding: 9px 13px;
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .hero {
        position: relative;
        overflow: hidden;
        border: 1px solid var(--border);
        border-radius: 28px;
        background:
          linear-gradient(135deg, rgba(56, 189, 248, 0.12), transparent 44%),
          linear-gradient(180deg, rgba(18, 27, 50, 0.96), rgba(8, 13, 28, 0.96));
        padding: clamp(26px, 5vw, 56px);
        box-shadow: 0 28px 80px rgba(0,0,0,0.34);
      }

      .hero::after {
        content: "";
        position: absolute;
        right: -110px;
        top: -110px;
        width: 300px;
        height: 300px;
        border-radius: 999px;
        background: rgba(34, 230, 184, 0.09);
        filter: blur(28px);
      }

      .eyebrow {
        position: relative;
        z-index: 1;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 18px;
      }

      .badge,
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border: 1px solid rgba(148, 163, 184, 0.26);
        background: rgba(7, 12, 25, 0.66);
        color: #d8e6ff;
        border-radius: 999px;
        padding: 7px 10px;
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .badge.live {
        color: #a7f3d0;
        border-color: rgba(34, 230, 184, 0.36);
      }

      .badge.hot {
        color: #fde68a;
        border-color: rgba(250, 204, 21, 0.32);
      }

      h1 {
        position: relative;
        z-index: 1;
        margin: 0;
        max-width: 880px;
        font-size: clamp(40px, 7vw, 82px);
        line-height: 0.96;
        letter-spacing: -0.065em;
      }

      h2 {
        margin: 0 0 10px;
        font-size: 22px;
        line-height: 1.15;
        letter-spacing: -0.025em;
      }

      h3 {
        margin: 0 0 10px;
        font-size: 16px;
      }

      p { margin: 0 0 14px; }

      .summary {
        position: relative;
        z-index: 1;
        max-width: 820px;
        margin-top: 18px;
        color: #d4deed;
        font-size: clamp(16px, 2vw, 19px);
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(12, 1fr);
        gap: 16px;
        margin-top: 16px;
      }

      .card {
        border: 1px solid var(--border);
        border-radius: 22px;
        background: var(--panel);
        padding: clamp(18px, 3vw, 26px);
        box-shadow: 0 16px 48px rgba(0,0,0,0.24);
      }

      .card.highlight {
        background:
          linear-gradient(135deg, rgba(56, 189, 248, 0.09), transparent 42%),
          var(--panel2);
      }

      .span-12 { grid-column: span 12; }
      .span-8 { grid-column: span 8; }
      .span-6 { grid-column: span 6; }
      .span-4 { grid-column: span 4; }

      .metrics {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        margin-top: 22px;
      }

      .metric {
        min-width: 0;
        border: 1px solid rgba(148, 163, 184, 0.18);
        border-radius: 18px;
        padding: 14px;
        background: rgba(3, 7, 18, 0.58);
      }

      .metric span {
        display: block;
        color: var(--muted);
        font-size: 11px;
        font-weight: 950;
        text-transform: uppercase;
        letter-spacing: 0.1em;
      }

      .metric strong {
        display: block;
        margin-top: 6px;
        font-size: 19px;
        line-height: 1.22;
        overflow-wrap: anywhere;
      }

      .meta {
        color: #93a4bf;
        font-size: 12px;
        font-weight: 850;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .report-card h2 a {
        color: var(--text);
      }

      .report-card p {
        color: #cad6e8;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 18px;
      }

      .primary-action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, var(--accent2), var(--accent));
        color: #03111a;
        border: 0;
        border-radius: 999px;
        padding: 11px 16px;
        font-size: 13px;
        font-weight: 950;
        text-decoration: none;
      }

      ul { margin: 0; padding-left: 20px; }
      li { margin: 8px 0; color: #d4e3fa; }

      code {
        word-break: break-all;
        color: #d8f8ff;
        background: rgba(56, 189, 248, 0.08);
        border: 1px solid rgba(56, 189, 248, 0.18);
        padding: 3px 7px;
        border-radius: 8px;
      }

      pre {
        white-space: pre-wrap;
        overflow-x: auto;
        background: #020617;
        border: 1px solid rgba(148, 163, 184, 0.2);
        color: #d9f6ff;
        border-radius: 16px;
        padding: 16px;
        font-size: 13px;
      }

      input {
        width: 100%;
        box-sizing: border-box;
        padding: 13px 14px;
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 12px;
        background: rgba(3, 7, 18, 0.72);
        color: var(--text);
        margin: 8px 0;
      }

      button {
        padding: 12px 16px;
        border: 0;
        border-radius: 999px;
        background: linear-gradient(135deg, var(--accent2), var(--accent));
        color: #03111a;
        font-weight: 950;
        cursor: pointer;
      }

      .muted { color: var(--muted); }
      .small { font-size: 12px; }

      .payment-box {
        border: 1px solid rgba(34, 230, 184, 0.28);
        background: rgba(34, 230, 184, 0.07);
        border-radius: 18px;
        padding: 16px;
      }

      .payment-box strong { color: #a7f3d0; }

      .notice {
        border: 1px solid rgba(250, 204, 21, 0.22);
        background: rgba(250, 204, 21, 0.06);
        border-radius: 18px;
        padding: 16px;
        color: #f8e7a5;
      }

      @media (max-width: 880px) {
        .nav {
          align-items: flex-start;
          flex-direction: column;
        }

        .grid {
          grid-template-columns: 1fr;
        }

        .span-12,
        .span-8,
        .span-6,
        .span-4 {
          grid-column: span 1;
        }

        .metrics {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 560px) {
        .shell {
          width: min(100% - 22px, 1180px);
          padding-top: 24px;
        }

        .feed-links a,
        .button-link {
          width: 100%;
        }

        .feed-links {
          width: 100%;
        }
      }
    `;
  }

  private async buildReportsCatalogHtml(request: Request): Promise<Response> {
    const origin = this.getPublicOrigin(request);
    const assets = this.getPublicAssetsNewestFirst();

    const latestAsset = assets[0];
    const categories = Array.from(
      new Set(
        assets
          .map((asset) => cleanText(asset.niche || 'Market Intelligence'))
          .filter(Boolean)
          .slice(0, 8)
      )
    );

    const prices = assets
      .map((asset) => Number(asset.price_nok || 0))
      .filter((price) => Number.isFinite(price) && price > 0);

    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

    const rows = (
      await Promise.all(
        assets.map(async (asset) => {
          const meta = await this.publicAssetMetadata(asset, origin);

          return `
      <article class="card highlight report-card">
        <div class="meta">${escapeHtml(String(meta.niche))} Â· ${escapeHtml(String(meta.freshness_iso))}</div>
        <h2><a href="${escapeHtml(String(meta.urls.page))}">${escapeHtml(String(meta.title))}</a></h2>
        <p>${escapeHtml(String(meta.seo_description))}</p>

        <div class="metrics">
          <div class="metric"><span>Brief price</span><strong>${escapeHtml(String(meta.price_nok))} NOK</strong></div>
          <div class="metric"><span>Unlock payment</span><strong>${escapeHtml(String(meta.price_crypto_estimate))}</strong></div>
          <div class="metric"><span>Format</span><strong>HTML + JSON</strong></div>
        </div>

        <div class="actions">
          <a class="primary-action" href="${escapeHtml(String(meta.urls.page))}">Open intelligence brief</a>
          <a class="button-link" href="${escapeHtml(String(meta.urls.preview_json))}">Preview JSON</a>
        </div>
      </article>
    `;
        })
      )
    ).join('\n');

    const catalogJsonLd = buildJsonLdScript(
      buildCatalogJsonLd({
        origin,
        assets: assets as EarningAsset[]
      })
    );

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Arbitrage Nexus | Machine-Readable Intelligence Briefs</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="Arbitrage Nexus publishes machine-readable intelligence briefs for developers, operators, researchers, agents, and automated buyers." />
  <link rel="canonical" href="${escapeHtml(absoluteUrl(origin, '/reports'))}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="Arbitrage Nexus | Machine-Readable Intelligence Briefs" />
  <meta property="og:description" content="Fresh intelligence briefs generated from public technical, security, AI, developer, and market signals." />
  <meta property="og:url" content="${escapeHtml(absoluteUrl(origin, '/reports'))}" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="Arbitrage Nexus | Machine-Readable Intelligence Briefs" />
  <meta name="twitter:description" content="Fresh machine-readable intelligence briefs for technical and commercial buyers." />
  ${catalogJsonLd}
  <style>${this.signalPageCss()}</style>
</head>
<body>
  <main class="shell">
    <nav class="nav">
      <a class="brand" href="${escapeHtml(absoluteUrl(origin, '/reports'))}">
        <span class="brand-mark"></span>
        <span>Arbitrage Nexus</span>
      </a>
      <div class="feed-links">
        <a href="${escapeHtml(absoluteUrl(origin, '/reports.json'))}">Reports JSON</a>
        <a href="${escapeHtml(absoluteUrl(origin, '/signals.json'))}">Signals JSON</a>
        <a href="${escapeHtml(absoluteUrl(origin, '/feed.xml'))}">RSS</a>
      </div>
    </nav>

    <section class="hero">
      <div class="eyebrow">
        <span class="badge live">Live intelligence feed</span>
        <span class="badge">Machine-readable</span>
        <span class="badge hot">Crypto unlock</span>
      </div>
      <h1>Actionable intelligence briefs for technical buyers.</h1>
      <p class="summary">
        Arbitrage Nexus tracks public technical, AI, security, developer, and market signals,
        then packages concise intelligence briefs with HTML and JSON endpoints.
      </p>

      <div class="metrics">
        <div class="metric"><span>Published briefs</span><strong>${assets.length}</strong></div>
        <div class="metric"><span>Price range</span><strong>${minPrice && maxPrice ? `${minPrice}-${maxPrice} NOK` : 'Loading'}</strong></div>
        <div class="metric"><span>Latest update</span><strong>${escapeHtml(String(latestAsset ? safeIso(latestAsset.updated_at || latestAsset.created_at) : 'Pending'))}</strong></div>
      </div>
    </section>

    ${
      categories.length > 0
        ? `<section class="grid">
      <article class="card span-12">
        <h2>Coverage</h2>
        <p class="muted">${escapeHtml(categories.join(' Â· '))}</p>
      </article>
    </section>`
        : ''
    }

    <section class="grid">
      <section class="span-12">
        ${rows || '<article class="card"><p>No public briefs are published yet.</p></article>'}
      </section>
    </section>
  </main>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  }
    private formatPriceTierLabel(value: unknown): string {
    const raw = String(value || 'standard').trim().toLowerCase();

    const labels: Record<string, string> = {
      low: 'Entry',
      standard: 'Standard',
      premium: 'Premium',
      high_value: 'High value',
      urgent: 'Time-sensitive'
    };

    return labels[raw] || raw.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private async buildReportPageHtml(asset: any, request: Request): Promise<Response> {
    const origin = this.getPublicOrigin(request);
    const meta = await this.publicAssetMetadata(asset, origin);

    const summary = shortText(
      String(
        asset.full_report_json?.executive_summary?.summary ||
          asset.full_report_json?.summary ||
          asset.seo_description ||
          asset.opportunity_title ||
          asset.title ||
          ''
      ),
      950
    );

    const tierLabel = this.formatPriceTierLabel(meta.price_tier);
    const verifyUrlJson = JSON.stringify(meta.urls.verify_payment);
    const fullJsonUrlJson = JSON.stringify(meta.urls.full_json);

    const relatedResources = asArray<any>(meta.offer_links)
      .filter((link) => link?.type !== 'payment' && /^https?:\/\//i.test(String(link?.url || '')))
      .map(
        (link) =>
          `<li><a href="${escapeHtml(String(link.url))}" rel="nofollow sponsored" target="_blank">${escapeHtml(String(link.label))}</a></li>`
      )
      .join('');

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(String(meta.seo_title))}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="${escapeHtml(String(meta.seo_description))}" />
  <link rel="canonical" href="${escapeHtml(String(meta.urls.page))}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(String(meta.seo_title))}" />
  <meta property="og:description" content="${escapeHtml(String(meta.seo_description))}" />
  <meta property="og:url" content="${escapeHtml(String(meta.urls.page))}" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${escapeHtml(String(meta.seo_title))}" />
  <meta name="twitter:description" content="${escapeHtml(String(meta.seo_description))}" />
  ${buildJsonLdScript(
    buildReportJsonLd({
      asset: asset as EarningAsset,
      origin,
      slug: meta.slug
    })
  )}
  <style>${this.signalPageCss()}</style>
</head>
<body>
  <main class="shell">
    <nav class="nav">
      <a class="brand" href="${escapeHtml(absoluteUrl(origin, '/reports'))}">
        <span class="brand-mark"></span>
        <span>Arbitrage Nexus</span>
      </a>
      <div class="feed-links">
        <a href="${escapeHtml(absoluteUrl(origin, '/reports'))}">Briefs</a>
        <a href="${escapeHtml(String(meta.urls.preview_json))}">Preview JSON</a>
        <a href="${escapeHtml(absoluteUrl(origin, '/feed.xml'))}">RSS</a>
      </div>
    </nav>

    <section class="hero">
      <div class="eyebrow">
        <span class="badge live">${escapeHtml(String(meta.niche))}</span>
        <span class="badge hot">${escapeHtml(tierLabel)}</span>
        <span class="badge">${escapeHtml(String(meta.unlock_status || 'locked'))}</span>
      </div>

      <h1>${escapeHtml(String(meta.title))}</h1>
      <p class="summary">${escapeHtml(String(summary))}</p>

      <div class="metrics">
        <div class="metric"><span>Brief price</span><strong>${escapeHtml(String(meta.price_nok))} NOK</strong></div>
        <div class="metric"><span>Payment</span><strong>${escapeHtml(String(meta.price_crypto_estimate))}</strong></div>
        <div class="metric"><span>Format</span><strong>HTML + JSON</strong></div>
      </div>
    </section>

    <section class="grid">
      <article class="card span-8 highlight">
        <h2>What this brief contains</h2>
        <p>${escapeHtml(String(meta.seo_description))}</p>
        <p class="muted">
          The full payload is delivered as a structured JSON and HTML intelligence brief after payment verification.
        </p>
      </article>

      <article class="card span-4">
        <h2>Unlock</h2>
        <div class="payment-box">
          <p><strong>${escapeHtml(String(meta.price_nok))} NOK</strong></p>
          <p>${escapeHtml(String(meta.price_crypto_estimate))}</p>
          <p class="muted">${escapeHtml(String(meta.payment?.asset || 'POL'))} on ${escapeHtml(String(meta.payment?.chain || 'Polygon'))}</p>
        </div>
        <p style="margin-top:14px;">
          <a class="primary-action" href="#unlock">Unlock full brief</a>
        </p>
      </article>

      ${
        relatedResources
          ? `<article class="card span-12">
        <h2>Related resources</h2>
        <p class="muted">External resources may include affiliate or referral links.</p>
        <ul>${relatedResources}</ul>
      </article>`
          : ''
      }

      <article class="card span-12">
        <h2>Machine-readable preview</h2>
        <p class="muted">
          Agents, crawlers, and researchers can inspect the public metadata and preview endpoints before unlocking the full payload.
        </p>
        <div class="actions">
          <a class="button-link" href="${escapeHtml(String(meta.urls.metadata_json))}">Metadata JSON</a>
          <a class="button-link" href="${escapeHtml(String(meta.urls.preview_json))}">Preview JSON</a>
        </div>
      </article>

      <article class="card span-12" id="unlock">
        <h2>Unlock full intelligence payload</h2>
        <p><strong>Price:</strong> ${escapeHtml(String(meta.price_nok))} NOK</p>
        <p><strong>Network:</strong> ${escapeHtml(String(meta.payment?.chain || 'Polygon'))}</p>
        <p><strong>Asset:</strong> ${escapeHtml(String(meta.payment?.asset || 'POL'))}</p>
        <p><strong>Required payment:</strong> ${escapeHtml(String(meta.payment?.required_amount || meta.price_crypto_estimate))}</p>

        <p>Send payment to:</p>
        <p><code>${escapeHtml(String(meta.payment?.address || ''))}</code></p>

        <div class="notice">
          <p>${escapeHtml(String(meta.payment?.note || 'After payment, paste the transaction hash below to unlock the full brief.'))}</p>
        </div>

        <hr />

        <h3>Verify payment</h3>
        <p class="muted">After sending payment, paste the transaction hash below. Verification checks the chain payment before opening the full payload.</p>

        <input id="txHash" placeholder="0x transaction hash" />

        <button onclick="verifyPayment()">Verify payment and unlock</button>

        <pre id="verifyResult"></pre>

        <script>
          async function verifyPayment() {
            const txHash = document.getElementById("txHash").value.trim();
            const resultBox = document.getElementById("verifyResult");

            if (!txHash) {
              resultBox.textContent = "Transaction hash required.";
              return;
            }

            resultBox.textContent = "Verifying payment...";

            try {
              const res = await fetch(${verifyUrlJson}, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ txHash })
              });

              const data = await res.json();

              if (!res.ok || !data.success) {
                resultBox.textContent = "Verification failed: " + (data.error || "Unknown error");
                return;
              }

              resultBox.textContent = "Payment verified. Opening full JSON payload...";
              window.location.href = data.full_json_url || ${fullJsonUrlJson};
            } catch (err) {
              resultBox.textContent = "Verification error: " + String(err);
            }
          }
        </script>
      </article>
    </section>
  </main>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  }

  private async buildReportsJson(request: Request): Promise<Response> {
    const origin = this.getPublicOrigin(request);
    const assets = this.getPublicAssetsNewestFirst();

    return Response.json(
      {
        success: true,
        kind: 'arbitrage_nexus_public_report_catalog',
        generated_at: Date.now(),
        generated_at_iso: new Date().toISOString(),
        count: assets.length,
        reports: await Promise.all(
          assets.map((asset) => this.publicAssetMetadata(asset, origin))
        )
      },
      {
        headers: {
          'Cache-Control': 'no-store'
        }
      }
    );
  }

  private buildSignalsJson(request: Request): Response {
    const origin = this.getPublicOrigin(request);

    const signals = asArray<any>(this.state.opportunities)
      .slice(0, 250)
      .map((opp) => {
        const slug = opp.report_slug || '';
        const pageUrl = slug ? absoluteUrl(origin, `/reports/${slug}`) : undefined;

        return {
          id: `signal-${opp.id}`,
          opportunity_id: opp.id,
          title: this.getCleanPublicTitle(opp.title),
          summary: shortText(opp.summary || opp.evidence || '', 320),
          niche: cleanText(opp.niche || 'Market Intelligence'),
          created_at: opp.created_at,
          updated_at: opp.updated_at,
          report_url: opp.report_url ? absoluteUrl(origin, opp.report_url) : pageUrl,
          metadata_url: opp.metadata_url ? absoluteUrl(origin, opp.metadata_url) : undefined,
          preview_url: opp.preview_url ? absoluteUrl(origin, opp.preview_url) : undefined,
          price_nok: opp.price_nok || opp.recommended_price_nok,
          source: 'arbitrage_nexus_public_signal_feed'
        };
      });

    return Response.json({
      success: true,
      kind: 'arbitrage_nexus_public_signal_feed',
      generated_at: Date.now(),
      generated_at_iso: new Date().toISOString(),
      count: signals.length,
      signals
    });
  }

  private buildOpportunitiesJson(request: Request): Response {
    const origin = this.getPublicOrigin(request);

    const opportunities = asArray<any>(this.state.opportunities)
      .slice(0, 250)
      .map((opp) => {
        const slug = opp.report_slug || '';
        const pageUrl = slug ? absoluteUrl(origin, `/reports/${slug}`) : undefined;

        return {
          id: opp.id,
          title: this.getCleanPublicTitle(opp.title),
          niche: cleanText(opp.niche || 'Market Intelligence'),
          summary: shortText(opp.summary || opp.evidence || '', 420),
          buyer_type: opp.buyer_type || 'technical and commercial intelligence buyers',
          product_type: opp.product_type || 'paid intelligence report',
          created_at: opp.created_at,
          updated_at: opp.updated_at,
          report_url: opp.report_url ? absoluteUrl(origin, opp.report_url) : pageUrl,
          metadata_url: opp.metadata_url ? absoluteUrl(origin, opp.metadata_url) : undefined,
          preview_url: opp.preview_url ? absoluteUrl(origin, opp.preview_url) : undefined,
          price_nok: opp.price_nok || opp.recommended_price_nok || 49
        };
      });

    return Response.json({
      success: true,
      kind: 'arbitrage_nexus_public_opportunity_feed',
      generated_at: Date.now(),
      generated_at_iso: new Date().toISOString(),
      count: opportunities.length,
      opportunities
    });
  }

  private buildSourcesJson(): Response {
    return Response.json({
      success: true,
      kind: 'arbitrage_nexus_source_directory',
      generated_at: Date.now(),
      generated_at_iso: new Date().toISOString(),
      sources: SOURCE_REGISTRY.map((source) => ({
        id: source.id,
        name: source.name,
        url: source.url,
        category: source.category
      }))
    });
  }
  private buildDiscoveryJsonRoute(request: Request): Response {
    const origin = this.getPublicOrigin(request);
    const assets = this.getPublicAssetsNewestFirst();

    return Response.json(
      buildSeoDiscoveryJson({
        origin,
        assets: assets as EarningAsset[]
      }),
      {
        headers: {
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'index, follow'
        }
      }
    );
  }

  private buildLlmsTxtRoute(request: Request): Response {
    const origin = this.getPublicOrigin(request);
    const assets = this.getPublicAssetsNewestFirst();

    return new Response(
      buildLlmsTxt({
        origin,
        assets: assets as EarningAsset[]
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'index, follow'
        }
      }
    );
  }

  private buildAgentsTxtRoute(request: Request): Response {
    const origin = this.getPublicOrigin(request);
    const assets = this.getPublicAssetsNewestFirst();

    return new Response(
      buildAgentsTxt({
        origin,
        assets: assets as EarningAsset[]
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'index, follow'
        }
      }
    );
  }


  private buildAdminMarketStatsJson(request: Request): Response {
    if (!this.isAdminRequest(request)) {
      return Response.json(
        {
          success: false,
          error: 'ADMIN_TOKEN_REQUIRED'
        },
        { status: 401 }
      );
    }

    const stats = buildMarketStats({
      earning_assets: this.state.earning_assets || [],
      opportunities: this.state.opportunities || [],
      niche_performance: this.state.niche_performance || [],
      source_performance: this.state.source_performance || []
    });

    return Response.json({
      success: true,
      kind: 'admin_market_stats',
      summary: buildMarketStatsTextSummary(stats),
      stats
    });
  }

  private buildSitemapXml(request: Request): Response {
    const origin = this.getPublicOrigin(request);
    const assets = this.getPublicAssetsNewestFirst();

    const staticUrls = [
      { loc: absoluteUrl(origin, '/reports'), priority: '1.0' },
      { loc: absoluteUrl(origin, '/reports.json'), priority: '0.8' },
      { loc: absoluteUrl(origin, '/signals.json'), priority: '0.7' },
      { loc: absoluteUrl(origin, '/opportunities.json'), priority: '0.7' },
      { loc: absoluteUrl(origin, '/feed.xml'), priority: '0.7' },
      { loc: absoluteUrl(origin, '/discovery.json'), priority: '0.8' },
      { loc: absoluteUrl(origin, '/llms.txt'), priority: '0.6' },
      { loc: absoluteUrl(origin, '/agents.txt'), priority: '0.6' }
    ];

    const reportUrls = assets.map((asset) => {
      const slug = asset.slug || makeReportSlug(asset.title, asset.id);

      return {
        loc: absoluteUrl(origin, `/reports/${slug}`),
        lastmod: safeIso(asset.updated_at || asset.created_at),
        priority: '0.9'
      };
    });

    const urls = [...staticUrls, ...reportUrls]
      .map(
        (item) => `
  <url>
    <loc>${xmlEscape(item.loc)}</loc>
    ${'lastmod' in item ? `<lastmod>${xmlEscape((item as any).lastmod)}</lastmod>` : ''}
    <priority>${xmlEscape(item.priority)}</priority>
  </url>`
      )
      .join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

    return new Response(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  }

  private async buildFeedXml(request: Request): Promise<Response> {
    const origin = this.getPublicOrigin(request);
    const assets = this.getPublicAssetsNewestFirst().slice(0, 50);

    const items = (
      await Promise.all(
        assets.map(async (asset) => {
          const meta = await this.publicAssetMetadata(asset, origin);

          return `
    <item>
      <title>${xmlEscape(String(meta.title))}</title>
      <link>${xmlEscape(String(meta.urls.page))}</link>
      <guid>${xmlEscape(String(meta.urls.page))}</guid>
      <pubDate>${new Date(asset.created_at || Date.now()).toUTCString()}</pubDate>
      <description>${xmlEscape(String(meta.seo_description))}</description>
    </item>`;
        })
      )
    ).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Arbitrage Nexus Intelligence Briefs</title>
    <link>${xmlEscape(absoluteUrl(origin, '/reports'))}</link>
    <description>Fresh machine-readable intelligence briefs for technical and commercial buyers.</description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${items}
  </channel>
</rss>`;

    return new Response(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  }

  private buildRobotsTxt(request: Request): Response {
    const origin = this.getPublicOrigin(request);

    const body = `User-agent: *
Allow: /
Allow: /reports
Allow: /reports/
Allow: /reports.json
Allow: /signals.json
Allow: /opportunities.json
Allow: /feed.xml
Allow: /sitemap.xml
Allow: /discovery.json
Allow: /llms.txt
Allow: /agents.txt

Disallow: /messages
Disallow: /market-stats.json
Disallow: /sources.json
Disallow: /api/system/
Disallow: /api/treasury/
Disallow: /api/admin/
Disallow: /admin
Disallow: /admin-login
Disallow: /dashboard
Disallow: /setup
Disallow: /governor
Disallow: /treasury
Disallow: /policy
Disallow: /withdraw
Disallow: /ingest
Disallow: /crypto/

Sitemap: ${absoluteUrl(origin, '/sitemap.xml')}
`;

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  }


  // BEGIN_EXECUTION_RAIL_PATCH
  private getExecutionRailNow(): number {
    return Date.now();
  }

  private getExecutionRailId(prefix: string): string {
    return `${prefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  }

  private getExecutionRailBaseUrl(): string {
    return this.getPublicBaseUrlFromEnv() || 'https://arbitragenexus.net';
  }

  private getExecutionRailState(): any {
    return this.state as any;
  }

  private getExecutionLedger(): any[] {
    return asArray<any>(this.getExecutionRailState().execution_ledger).slice(0, 500);
  }

  private getCryptoAcquisitionLedger(): any[] {
    const stateAny = this.getExecutionRailState();

    return asArray<any>(
      stateAny.crypto_acquisition?.execution_ledger ||
        stateAny.crypto_acquisition_execution_ledger ||
        []
    ).slice(0, 500);
  }

  private getSuggestionExecutionLedger(): any[] {
    return asArray<any>(this.getExecutionRailState().agent_suggestion_execution_ledger).slice(0, 500);
  }

  private getDefaultAcquisitionCandidates(): any[] {
    return [
      {
        id: 'auto-public-report-feed-distribution',
        method: 'public_distribution',
        title: 'Verify public paid-report feeds are crawler-discoverable',
        url: '/reports.json',
        network: 'web',
        asset: 'intelligence_report',
        cash_cost_nok: 0,
        expected_value_nok: 0,
        risk_score: 0.08,
        enabled: true,
        notes: 'Auto-executable. Verifies live public endpoints that can convert crawlers/buyers into paid unlocks.'
      },
      {
        id: 'auto-seo-surface-refresh',
        method: 'seo_distribution',
        title: 'Verify sitemap, RSS, robots, reports and signals endpoints',
        url: '/sitemap.xml',
        network: 'web',
        asset: 'crawler_discovery',
        cash_cost_nok: 0,
        expected_value_nok: 0,
        risk_score: 0.08,
        enabled: true,
        notes: 'Auto-executable. Does not create fake revenue; only checks and strengthens discovery surface.'
      },
      {
        id: 'auto-locked-report-conversion-check',
        method: 'conversion_integrity_check',
        title: 'Verify locked full payload and payment boundary are active',
        url: '/reports.json',
        network: 'web',
        asset: 'paid_unlock_flow',
        cash_cost_nok: 0,
        expected_value_nok: 0,
        risk_score: 0.12,
        enabled: true,
        notes: 'Auto-executable. Checks payment-gated report flow.'
      },
      {
        id: 'blocked-learn-to-earn-wallet-claims',
        method: 'learn_to_earn',
        title: 'Complete Web3 learn-to-earn modules and claim rewards',
        url: '',
        network: 'external',
        asset: 'crypto_reward',
        cash_cost_nok: 0,
        expected_value_nok: 0,
        risk_score: 0.45,
        enabled: true,
        requires_account: true,
        requires_wallet_signature: true,
        notes: 'Real category, but blocked for zero-input autonomous execution because claims require account and wallet signing.'
      },
      {
        id: 'blocked-bug-bounty-disclosure',
        method: 'bug_bounty',
        title: 'Submit low-risk documentation or validation bounty reports',
        url: '',
        network: 'external',
        asset: 'bounty_reward',
        cash_cost_nok: 0,
        expected_value_nok: 0,
        risk_score: 0.6,
        enabled: true,
        requires_account: true,
        requires_manual_identity_step: true,
        notes: 'Real category, but blocked because bounty platforms require account, identity, scope review, and manual submission.'
      },
      {
        id: 'blocked-content-bounty-applications',
        method: 'content_bounty',
        title: 'Claim ecosystem writeup and research content bounties',
        url: '',
        network: 'external',
        asset: 'bounty_reward',
        cash_cost_nok: 0,
        expected_value_nok: 0,
        risk_score: 0.4,
        enabled: true,
        requires_account: true,
        requires_approval: true,
        notes: 'Real category, but usually requires account, approval, payout setup, and manual review.'
      }
    ];
  }

  private getAcquisitionCandidates(): any[] {
    const stateAny = this.getExecutionRailState();

    const pools = [
      stateAny.crypto_acquisition?.candidates,
      stateAny.crypto_acquisition_candidates,
      stateAny.candidate_planner?.candidates,
      stateAny.acquisition_candidates
    ];

    const existing = pools.flatMap((pool) => asArray<any>(pool));

    const merged = [...existing, ...this.getDefaultAcquisitionCandidates()];
    const seen = new Set<string>();
    const unique: any[] = [];

    for (const raw of merged) {
      const id = cleanText(raw?.id || raw?.title || raw?.url || this.getExecutionRailId('candidate'));

      if (!id || seen.has(id)) continue;

      seen.add(id);

      unique.push({
        ...raw,
        id,
        title: cleanText(raw?.title || id),
        method: cleanText(raw?.method || raw?.type || 'unknown'),
        url: cleanText(raw?.url || raw?.source_url || ''),
        cash_cost_nok: safeNumber(raw?.cash_cost_nok, 0),
        expected_value_nok: safeNumber(raw?.expected_value_nok ?? raw?.base_expected_value_nok, 0),
        risk_score: safeNumber(raw?.risk_score, 0.25),
        enabled: raw?.enabled !== false
      });
    }

    return unique.slice(0, 100);
  }

  private classifyAcquisitionCandidate(candidate: any): {
    classification: 'auto_executable' | 'external_blocked';
    blockers: string[];
    reason: string;
  } {
    const text = [
      candidate?.id,
      candidate?.title,
      candidate?.method,
      candidate?.url,
      candidate?.notes,
      candidate?.description,
      candidate?.eligibility_notes,
      ...(Array.isArray(candidate?.action_plan) ? candidate.action_plan : [])
    ].join(' ').toLowerCase();

    const blockers: string[] = [];
    const method = cleanText(candidate.method).toLowerCase();

    const externalRewardMethods = new Set([
      'learn_to_earn',
      'testnet_reward',
      'bug_bounty',
      'airdrop_research',
      'faucet',
      'quest',
      'grant',
      'open_source_reward',
      'content_bounty',
      'compute_mining_estimate'
    ]);

    const autoMethods = new Set([
      'public_distribution',
      'seo_distribution',
      'conversion_integrity_check',
      'crawler_discovery',
      'crawler_discovery_check',
      'public_feed_check',
      'report_market_check',
      'payment_boundary_check',
      'report_feed_check'
    ]);

    if (candidate.enabled === false) blockers.push('candidate_disabled');
    if (safeNumber(candidate.cash_cost_nok, 0) > 0) blockers.push('cash_cost_required');

    if (externalRewardMethods.has(method)) {
      blockers.push('external_reward_flow_requires_account_or_manual_review');
      blockers.push('payout_not_under_worker_control');
      blockers.push('platform_terms_or_reward_review_required');
    }

    if (candidate.requires_account === true) blockers.push('account_required');
    if (candidate.requires_login === true) blockers.push('login_required');
    if (candidate.requires_approval === true) blockers.push('external_approval_required');
    if (candidate.requires_kyc === true) blockers.push('kyc_required');
    if (candidate.requires_captcha === true) blockers.push('captcha_required');
    if (candidate.requires_wallet_signature === true) blockers.push('manual_wallet_signature_required');
    if (candidate.requires_manual_identity_step === true) blockers.push('manual_identity_step_required');
    if (candidate.requires_credentials === true) blockers.push('credentials_required');
    if (candidate.requires_paid_api === true) blockers.push('paid_api_required');

    if (/\b(login|sign in|signup|sign up|account|kyc|captcha|metamask|wallet signature|connect wallet|manual approval|apply|application|discord|telegram|oauth|claim|submit|review)\b/i.test(text)) {
      blockers.push('detected_external_human_or_account_step');
    }

    if (/\b(bug bounty|bounty|learn.?to.?earn|airdrop|quest|claim reward|content bounty|grant application|grant|testnet campaign|reward review)\b/i.test(text)) {
      blockers.push('external_reward_flow_requires_account_or_manual_review');
    }

    if (blockers.length > 0) {
      return {
        classification: 'external_blocked',
        blockers: Array.from(new Set(blockers)),
        reason: 'Candidate is real but cannot be executed without a human/account/wallet/approval/payout-review step.'
      };
    }

    const hasHttpUrl = /^https?:\/\//i.test(String(candidate.url || ''));
    const hasInternalUrl = String(candidate.url || '').startsWith('/');

    if (autoMethods.has(method) || hasInternalUrl) {
      return {
        classification: 'auto_executable',
        blockers: [],
        reason: 'Candidate can be executed by the worker with zero cash cost and no human credential step.'
      };
    }

    if (hasHttpUrl) {
      return {
        classification: 'external_blocked',
        blockers: ['external_url_not_whitelisted_for_autonomous_execution'],
        reason: 'External URL exists, but it is not a known internal zero-cost execution rail.'
      };
    }

    return {
      classification: 'external_blocked',
      blockers: ['no_auto_executable_action_or_url'],
      reason: 'No safe autonomous action was available.'
    };
  }

  private async fetchExecutionUrl(pathOrUrl: string): Promise<{
    url: string;
    status: number;
    ok: boolean;
    content_type: string;
    bytes: number;
    preview: string;
  }>
  
  {
    const base = this.getExecutionRailBaseUrl();
    const rawTarget = cleanText(pathOrUrl || '/reports.json');
    const targetUrl = /^https?:\/\//i.test(rawTarget)
      ? rawTarget
      : absoluteUrl(base, rawTarget);

    const target = new URL(targetUrl);
    const baseUrl = new URL(base);

    const isOwnOrigin =
      target.hostname === baseUrl.hostname ||
      target.hostname === 'arbitragenexus.net' ||
      target.hostname === 'www.arbitragenexus.net';

    let response: Response;

    if (isOwnOrigin) {
      response = await this.onRequest(
        new Request(`http://agent${target.pathname}${target.search}`, {
          method: 'GET',
          headers: {
            Accept: 'text/html,application/json,application/xml,text/plain,*/*',
            'User-Agent': 'ArbitrageNexusAutonomousExecutor/1.0',
            'x-public-origin': `${baseUrl.protocol}//${baseUrl.host}`
          }
        })
      );
    } else {
      response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          Accept: 'text/html,application/json,application/xml,text/plain,*/*',
          'User-Agent': 'ArbitrageNexusAutonomousExecutor/1.0'
        }
      });
    }

    const text = await response.text();

    return {
      url: targetUrl,
      status: response.status,
      ok: response.ok,
      content_type: response.headers.get('content-type') || '',
      bytes: text.length,
      preview: shortText(text, 500)
    };
  }

  private async executeInternalDiscoveryBundle(candidate: any): Promise<any[]> {
    const targets = Array.from(
      new Set([
        candidate.url || '/reports.json',
        '/reports',
        '/reports.json',
        '/signals.json',
        '/opportunities.json',
        '/feed.xml',
        '/sitemap.xml',
        '/robots.txt'
      ])
    );

    const results: any[] = [];

    for (const target of targets) {
      try {
        results.push(await this.fetchExecutionUrl(String(target)));
      } catch (error) {
        results.push({
          url: target,
          status: 0,
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return results;
  }

  private hasRecentExecution(candidateId: string, ledger: any[], windowMs: number): boolean {
    const now = Date.now();

    return ledger.some((entry) => {
      return (
        entry?.candidate_id === candidateId &&
        ['executed', 'external_blocked'].includes(String(entry?.status || '')) &&
        now - safeNumber(entry?.completed_at || entry?.created_at, 0) < windowMs
      );
    });
  }

  private async executeAcquisitionCandidate(candidate: any, trigger: string): Promise<any> {
    const now = this.getExecutionRailNow();
    const classification = this.classifyAcquisitionCandidate(candidate);

    const baseEntry = {
      id: this.getExecutionRailId('exec'),
      kind: 'crypto_acquisition_candidate',
      candidate_id: candidate.id,
      candidate_title: candidate.title,
      method: candidate.method,
      trigger,
      classification: classification.classification,
      blockers: classification.blockers,
      classification_reason: classification.reason,
      expected_value_nok: safeNumber(candidate.expected_value_nok, 0),
      expected_value_label: 'expected_value_only_not_verified_revenue',
      treasury_credit: 'verified_receipt_only',
      created_at: now,
      created_at_iso: new Date(now).toISOString(),
      logs: [] as string[]
    };

    if (classification.classification === 'external_blocked') {
      return {
        ...baseEntry,
        status: 'external_blocked',
        completed_at: now,
        completed_at_iso: new Date(now).toISOString(),
        logs: [
          'Execution blocked before action.',
          `Reason: ${classification.reason}`,
          `Blockers: ${classification.blockers.join(', ')}`
        ]
      };
    }

    const startedAt = Date.now();

    try {
      const method = cleanText(candidate.method).toLowerCase();
      const results =
        ['public_distribution', 'seo_distribution', 'conversion_integrity_check', 'crawler_discovery', 'public_feed_check', 'report_market_check'].includes(method)
          ? await this.executeInternalDiscoveryBundle(candidate)
          : [await this.fetchExecutionUrl(candidate.url)];

      const okCount = results.filter((item) => item.ok).length;
      const failed = results.filter((item) => !item.ok);

      return {
        ...baseEntry,
        status: okCount > 0 ? 'executed' : 'failed',
        started_at: startedAt,
        started_at_iso: new Date(startedAt).toISOString(),
        completed_at: Date.now(),
        completed_at_iso: new Date().toISOString(),
        result: {
          checked_urls: results.length,
          ok_urls: okCount,
          failed_urls: failed.length,
          results
        },
        logs: [
          `Executed autonomous candidate with ${results.length} network checks.`,
          `Successful checks: ${okCount}.`,
          failed.length > 0 ? `Failed checks: ${failed.map((item) => `${item.url}:${item.status || item.error}`).join(', ')}` : 'No failed checks.',
          'No treasury credit was created. Revenue still requires external payment verification.'
        ]
      };
    } catch (error) {
      return {
        ...baseEntry,
        status: 'failed',
        started_at: startedAt,
        started_at_iso: new Date(startedAt).toISOString(),
        completed_at: Date.now(),
        completed_at_iso: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        logs: [
          'Execution crashed.',
          error instanceof Error ? error.message : String(error)
        ]
      };
    }
  }

  private async runCryptoAcquisitionExecutor(input: {
    trigger: 'manual' | 'scheduler' | 'suggestion_approval';
    force?: boolean;
  }): Promise<any> {
    const now = Date.now();
    const stateAny = this.getExecutionRailState();
    const candidates = this.getAcquisitionCandidates();
    const previousLedger = this.getCryptoAcquisitionLedger();
    const previousUnifiedLedger = this.getExecutionLedger();

    const nextCandidateStates: any[] = [];
    const newEntries: any[] = [];

    for (const candidate of candidates) {
      const classification = this.classifyAcquisitionCandidate(candidate);

      if (!input.force && this.hasRecentExecution(candidate.id, previousLedger, 60 * 60_000)) {
        nextCandidateStates.push({
          ...candidate,
          execution_classification: classification.classification,
          execution_status: 'skipped_recent',
          blockers: classification.blockers,
          last_checked_at: now
        });

        continue;
      }

      const entry = await this.executeAcquisitionCandidate(candidate, input.trigger);

      newEntries.push(entry);

      nextCandidateStates.push({
        ...candidate,
        execution_classification: classification.classification,
        execution_status: entry.status,
        blockers: classification.blockers,
        last_execution_id: entry.id,
        last_executed_at: entry.completed_at,
        last_executed_at_iso: entry.completed_at_iso
      });
    }

    const executed = newEntries.filter((entry) => entry.status === 'executed');
    const blocked = newEntries.filter((entry) => entry.status === 'external_blocked');
    const failed = newEntries.filter((entry) => entry.status === 'failed');

    const nextLedger = [...newEntries, ...previousLedger].slice(0, 500);
    const nextUnifiedLedger = [...newEntries, ...previousUnifiedLedger].slice(0, 500);

    const summary = {
      enabled: true,
      trigger: input.trigger,
      generated_at: now,
      generated_at_iso: new Date(now).toISOString(),
      candidates: nextCandidateStates.length,
      auto_executable: nextCandidateStates.filter((item) => item.execution_classification === 'auto_executable').length,
      external_blocked: nextCandidateStates.filter((item) => item.execution_classification === 'external_blocked').length,
      executed: executed.length,
      failed: failed.length,
      blocked: blocked.length,
      expected_value_nok: nextCandidateStates.reduce((sum, item) => sum + safeNumber(item.expected_value_nok, 0), 0),
      expected_value_label: 'expected_value_only_not_verified_revenue',
      verified_revenue_nok: 0,
      treasury_credit: 'verified_receipt_only'
    };

    await this.setCompactState({
      ...(this.state as any),
      execution_ledger: nextUnifiedLedger,
      crypto_acquisition_execution_ledger: nextLedger,
      crypto_acquisition: {
        ...(stateAny.crypto_acquisition || {}),
        enabled: true,
        candidates: nextCandidateStates,
        execution_ledger: nextLedger,
        last_run: summary
      },
      system_health: {
        ...this.state.system_health,
        last_crypto_acquisition_run_at: now,
        last_crypto_acquisition_run_at_iso: new Date(now).toISOString()
      }
    });

    await this.pushKernelLog(
      `[CRYPTO_ACQUISITION] EXECUTOR_COMPLETE: trigger=${input.trigger} candidates=${summary.candidates} auto_executable=${summary.auto_executable} executed=${summary.executed} external_blocked=${summary.external_blocked} failed=${summary.failed} treasury_credit=verified_receipt_only`
    );

    return {
      success: true,
      summary,
      candidates: nextCandidateStates,
      execution_ledger: nextLedger
    };
  }

  private async getCryptoAcquisitionExecutionSnapshot(): Promise<any> {
    const candidates = this.getAcquisitionCandidates().map((candidate) => {
      const classification = this.classifyAcquisitionCandidate(candidate);

      return {
        ...candidate,
        execution_classification: classification.classification,
        blockers: classification.blockers,
        classification_reason: classification.reason
      };
    });

    const ledger = this.getCryptoAcquisitionLedger();

    return {
      success: true,
      crypto_acquisition: {
        enabled: true,
        candidates,
        execution_ledger: ledger,
        last_run: this.getExecutionRailState().crypto_acquisition?.last_run || null,
        summary: {
          candidates: candidates.length,
          auto_executable: candidates.filter((item) => item.execution_classification === 'auto_executable').length,
          external_blocked: candidates.filter((item) => item.execution_classification === 'external_blocked').length,
          executed: ledger.filter((item) => item.status === 'executed').length,
          verified_revenue: ledger.filter((item) => item.status === 'verified_revenue').length,
          expected_value_label: 'expected_value_only_not_verified_revenue',
          treasury_credit: 'verified_receipt_only'
        }
      }
    };
  }

  private inferSuggestionTitle(id: string, body: any): string {
    return cleanText(
      body?.title ||
        body?.suggestion?.title ||
        id.replace(/^suggest-/, '').replace(/-/g, ' ')
    );
  }

  private async executeApprovedSuggestion(input: {
    suggestionId: string;
    action: string;
    title: string;
    body: any;
  }): Promise<any> {
    const now = Date.now();
    const text = `${input.suggestionId} ${input.title}`.toLowerCase();

    const base = {
      id: this.getExecutionRailId('suggestion-exec'),
      kind: 'agent_suggestion',
      suggestion_id: input.suggestionId,
      title: input.title,
      action: input.action,
      created_at: now,
      created_at_iso: new Date(now).toISOString(),
      treasury_credit: 'verified_receipt_only',
      logs: [] as string[]
    };

    if (input.action !== 'approve' && input.action !== 'approved') {
      return {
        ...base,
        status: input.action,
        completed_at: now,
        completed_at_iso: new Date(now).toISOString(),
        logs: [`Suggestion marked ${input.action}.`]
      };
    }

    if (text.includes('crypto-acquisition') || text.includes('zero-cost acquisition') || text.includes('candidate')) {
      const run = await this.runCryptoAcquisitionExecutor({
        trigger: 'suggestion_approval',
        force: true
      });

      return {
        ...base,
        status: 'executed',
        completed_at: Date.now(),
        completed_at_iso: new Date().toISOString(),
        result: run.summary,
        logs: [
          'Approved crypto-acquisition suggestion was routed directly into the real executor.',
          `Executed=${run.summary.executed}; external_blocked=${run.summary.external_blocked}; failed=${run.summary.failed}.`
        ]
      };
    }

    if (text.includes('seo') || text.includes('public distribution') || text.includes('feed') || text.includes('sitemap')) {
      const results = await this.executeInternalDiscoveryBundle({
        id: input.suggestionId,
        method: 'seo_distribution',
        title: input.title,
        url: '/sitemap.xml'
      });

      return {
        ...base,
        status: results.some((item) => item.ok) ? 'executed' : 'failed',
        completed_at: Date.now(),
        completed_at_iso: new Date().toISOString(),
        result: {
          checked_urls: results.length,
          ok_urls: results.filter((item) => item.ok).length,
          results
        },
        logs: [
          'Approved SEO/public-distribution suggestion executed as live endpoint verification.',
          'This does not create ledger revenue; it improves discovery and conversion surface.'
        ]
      };
    }

    if (text.includes('deploy') || text.includes('patch') || text.includes('script') || text.includes('worker') || text.includes('src/')) {
      return {
        ...base,
        status: 'external_blocked',
        blockers: ['source_code_write_or_deploy_requires_repository_ci_credentials'],
        completed_at: now,
        completed_at_iso: new Date(now).toISOString(),
        logs: [
          'Suggestion approved but not executed inside the Worker runtime.',
          'Reason: self-modifying source code/deploy requires a configured repository CI credential.',
          'No fake execution was recorded.'
        ]
      };
    }

    return {
      ...base,
      status: 'external_blocked',
      blockers: ['no_safe_autonomous_executor_for_suggestion'],
      completed_at: now,
      completed_at_iso: new Date(now).toISOString(),
      logs: [
        'Suggestion approved and moved into execution ledger.',
        'No safe autonomous executor matched this suggestion.'
      ]
    };
  }

  private async handleSuggestionExecutionAction(request: Request): Promise<Response> {
    const body: any = await request.json().catch(() => ({}));
    const suggestionId = cleanText(body?.suggestionId || body?.id || body?.suggestion_id);
    const action = cleanText(body?.action || 'approve').toLowerCase();

    if (!suggestionId) {
      return Response.json(
        {
          success: false,
          error: 'SUGGESTION_ID_REQUIRED'
        },
        { status: 400 }
      );
    }

    const title = this.inferSuggestionTitle(suggestionId, body);
    const text = `${suggestionId} ${title}`.toLowerCase();

    const entry = await this.executeApprovedSuggestion({
      suggestionId,
      action,
      title,
      body
    });

    const stateAny = this.getExecutionRailState();
    const previousLedger = this.getSuggestionExecutionLedger();
    const nextLedger = [entry, ...previousLedger].slice(0, 500);

    const currentSuggestions = asArray<any>(stateAny.agent_suggestions || stateAny.suggestions);

    const nextSuggestions = currentSuggestions.map((suggestion) => {
      if (suggestion?.id !== suggestionId) return suggestion;

      return {
        ...suggestion,
        status: action === 'approve' ? 'approved' : action,
        execution_status: entry.status,
        execution_id: entry.id,
        approved_at: Date.now(),
        approved_at_iso: new Date().toISOString()
      };
    });

    await this.setCompactState({
      ...(this.state as any),
      agent_suggestions: nextSuggestions.some((suggestion) => suggestion?.id === suggestionId)
        ? nextSuggestions
        : [
            {
              id: suggestionId,
              title,
              category: text.includes('crypto') || text.includes('acquisition')
                ? 'crypto_acquisition'
                : text.includes('seo') || text.includes('feed') || text.includes('sitemap')
                  ? 'seo'
                  : text.includes('payment')
                    ? 'payment'
                    : text.includes('risk')
                      ? 'risk'
                      : 'infrastructure',
              priority: 'medium',
              why: 'Approved autonomous improvement was persisted because it was not present in the current suggestion list.',
              expected_impact: 'Keeps approved work visible and tied to a real execution ledger entry.',
              implementation_summary: 'Classified and executed by the autonomous execution rail when safe; otherwise preserved as external_blocked.',
              files_to_change: [],
              estimated_complexity: 'medium',
              requires_owner_confirmation: false,
              status: action === 'approve' ? 'approved' : action,
              created_at: Date.now(),
              updated_at: Date.now(),
              execution_status: entry.status,
              execution_id: entry.id,
              approved_at: Date.now(),
              approved_at_iso: new Date().toISOString()
            },
            ...currentSuggestions
          ],
      agent_suggestion_execution_ledger: nextLedger,
      execution_ledger: [entry, ...this.getExecutionLedger()].slice(0, 500)
    });

    await this.pushKernelLog(
      `[SUGGESTIONS] ACTION=${action} ID=${suggestionId} EXECUTION_STATUS=${entry.status}`
    );

    return Response.json({
      success: true,
      suggestion_id: suggestionId,
      action,
      execution: entry,
      execution_ledger: nextLedger
    });
  }

  private getPatchPlanExecutionSnapshot(): any {
    const stateAny = this.getExecutionRailState();
    const ledger = asArray<any>(stateAny.patch_plan_execution_ledger).slice(0, 500);

    const defaultItems = [
      {
        order: 1,
        file_path: 'worker/agent-access.ts',
        purpose: 'Durable Object singleton access',
        status: 'done'
      },
      {
        order: 2,
        file_path: 'worker/index.ts',
        purpose: 'Gateway routing',
        status: 'done'
      },
      {
        order: 3,
        file_path: 'worker/userRoutes.ts',
        purpose: 'User/API route bridge',
        status: 'done'
      },
      {
        order: 4,
        file_path: 'worker/agent.ts',
        purpose: 'Runtime execution kernel',
        status: 'in_progress'
      },
      {
        order: 5,
        file_path: 'dist/**',
        purpose: 'Regenerated build output',
        status: 'done'
      }
    ];

    const items = asArray<any>(stateAny.patch_plan?.items).length > 0
      ? asArray<any>(stateAny.patch_plan.items)
      : defaultItems;

    const statusSummary = items.reduce((acc: Record<string, number>, item: any) => {
      const status = cleanText(item.status || 'pending');
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    return {
      success: true,
      patch_plan: {
        items,
        execution_ledger: ledger,
        current_item: items.find((item: any) => !['done', 'executed'].includes(cleanText(item.status))) || null,
        status_summary: {
          done: statusSummary.done || statusSummary.executed || 0,
          in_progress: statusSummary.in_progress || 0,
          pending: statusSummary.pending || 0,
          blocked: statusSummary.blocked || statusSummary.external_blocked || 0
        }
      }
    };
  }

  private async runPatchPlanExecutor(input: {
    trigger: 'manual' | 'scheduler';
  }): Promise<any> {
    const snapshot = this.getPatchPlanExecutionSnapshot();
    const item = snapshot.patch_plan.current_item;
    const now = Date.now();

    if (!item) {
      return {
        success: true,
        message: 'PATCH_PLAN_COMPLETE',
        execution: null,
        patch_plan: snapshot.patch_plan
      };
    }

    const text = `${item.file_path || ''} ${item.purpose || ''}`.toLowerCase();

    let execution: any;

    if (text.includes('dist') || text.includes('deploy') || text.includes('src/') || text.includes('worker/')) {
      execution = {
        id: this.getExecutionRailId('patch-exec'),
        kind: 'patch_plan_item',
        trigger: input.trigger,
        file_path: item.file_path,
        purpose: item.purpose,
        status: 'external_blocked',
        blockers: ['source_code_patch_or_build_requires_local_filesystem_or_repository_ci'],
        created_at: now,
        created_at_iso: new Date(now).toISOString(),
        completed_at: now,
        completed_at_iso: new Date(now).toISOString(),
        logs: [
          'Patch-plan item was not fake-executed.',
          'The live Worker runtime cannot safely rewrite and redeploy its own source unless repository CI credentials are configured.',
          'This item remains visible in the execution ledger instead of vanishing.'
        ]
      };
    } else {
      execution = {
        id: this.getExecutionRailId('patch-exec'),
        kind: 'patch_plan_item',
        trigger: input.trigger,
        file_path: item.file_path,
        purpose: item.purpose,
        status: 'executed',
        created_at: now,
        created_at_iso: new Date(now).toISOString(),
        completed_at: now,
        completed_at_iso: new Date(now).toISOString(),
        logs: ['Runtime-verifiable patch-plan item executed.']
      };
    }

    const stateAny = this.getExecutionRailState();
    const ledger = [execution, ...asArray<any>(stateAny.patch_plan_execution_ledger)].slice(0, 500);

    await this.setState({
      ...(this.state as any),
      patch_plan_execution_ledger: ledger,
      execution_ledger: [execution, ...this.getExecutionLedger()].slice(0, 500)
    } as any);

    await this.pushKernelLog(
      `[PATCH_PLAN] EXECUTION_STATUS=${execution.status} ITEM=${item.file_path || 'unknown'}`
    );

    return {
      success: true,
      execution,
      patch_plan: this.getPatchPlanExecutionSnapshot().patch_plan
    };
  }

  private async performAutonomousExecutionMaintenance(now: number): Promise<void> {
    const envAny = this.env as any;
    const stateAny = this.getExecutionRailState();

    const enabledRaw = String(
      envAny.AUTONOMOUS_EXECUTION_ENABLED ??
        envAny.CRYPTO_ACQUISITION_AUTO_EXECUTE ??
        'true'
    ).toLowerCase();

    if (['false', '0', 'off', 'no'].includes(enabledRaw)) return;

    const suggestionLedger = this.getSuggestionExecutionLedger();
    const approvedSuggestions = asArray<any>(stateAny.agent_suggestions || stateAny.suggestions)
      .filter((suggestion) => cleanText(suggestion?.status).toLowerCase() === 'approved')
      .filter((suggestion) => cleanText(suggestion?.id))
      .filter((suggestion) => {
        const suggestionId = cleanText(suggestion?.id);

        if (suggestion?.execution_id) return false;

        return !suggestionLedger.some((entry) => {
          return (
            cleanText(entry?.suggestion_id) === suggestionId &&
            ['executed', 'external_blocked', 'failed'].includes(cleanText(entry?.status)) &&
            now - safeNumber(entry?.created_at || entry?.completed_at, 0) < 24 * 60 * 60_000
          );
        });
      })
      .slice(0, 5);

    const suggestionEntries: any[] = [];

    for (const suggestion of approvedSuggestions) {
      const suggestionId = cleanText(suggestion.id);
      const title = cleanText(suggestion.title || suggestionId);

      const entry = await this.executeApprovedSuggestion({
        suggestionId,
        action: 'approve',
        title,
        body: {
          suggestion,
          trigger: 'scheduler'
        }
      });

      suggestionEntries.push(entry);
    }

    if (suggestionEntries.length > 0) {
      const latestStateAny = this.getExecutionRailState();
      const latestSuggestions = asArray<any>(latestStateAny.agent_suggestions || latestStateAny.suggestions);

      const nextSuggestions = latestSuggestions.map((suggestion) => {
        const entry = suggestionEntries.find(
          (candidateEntry) => cleanText(candidateEntry?.suggestion_id) === cleanText(suggestion?.id)
        );

        if (!entry) return suggestion;

        return {
          ...suggestion,
          execution_status: entry.status,
          execution_id: entry.id,
          executed_at: entry.completed_at || Date.now(),
          executed_at_iso: entry.completed_at_iso || new Date().toISOString(),
          updated_at: Date.now()
        };
      });

      await this.setState({
        ...(this.state as any),
        agent_suggestions: nextSuggestions,
        agent_suggestion_execution_ledger: [
          ...suggestionEntries,
          ...this.getSuggestionExecutionLedger()
        ].slice(0, 500),
        execution_ledger: [
          ...suggestionEntries,
          ...this.getExecutionLedger()
        ].slice(0, 500)
      } as any);

      await this.pushKernelLog(
        `[AUTONOMOUS_EXECUTION] APPROVED_SUGGESTIONS_EXECUTED: count=${suggestionEntries.length}`
      );
    }

    const intervalMinutes = Math.max(
      15,
      Math.floor(safeNumber(envAny.CRYPTO_ACQUISITION_EXECUTION_INTERVAL_MINUTES, 60))
    );

    const refreshedStateAny = this.getExecutionRailState();

    const lastRunAt = safeNumber(
      refreshedStateAny.crypto_acquisition?.last_run?.generated_at ||
        refreshedStateAny.system_health?.last_crypto_acquisition_run_at,
      0
    );

    if (lastRunAt && now - lastRunAt < intervalMinutes * 60_000) return;

    await this.runCryptoAcquisitionExecutor({
      trigger: 'scheduler',
      force: false
    });
  }

private async tryHandleExecutionRoutes(request: Request, url: URL): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method.toUpperCase();

  const isCryptoAcquisitionRoute =
    path === '/crypto-acquisition' ||
    path === '/crypto-acquisition.json' ||
    path === '/crypto-acquisition/run' ||
    path === '/api/crypto-acquisition' ||
    path === '/api/crypto-acquisition.json' ||
    path === '/api/crypto-acquisition/run' ||
    path === '/api/system/crypto-acquisition' ||
    path === '/api/system/crypto-acquisition.json' ||
    path === '/api/system/crypto-acquisition/run' ||
    path === '/api/system/agent/crypto-acquisition' ||
    path === '/api/system/agent/crypto-acquisition.json' ||
    path === '/api/system/agent/crypto-acquisition/run';

  const isSuggestionActionRoute =
    path === '/suggestions/action' ||
    path === '/agent-suggestions/action' ||
    path === '/api/suggestions/action' ||
    path === '/api/agent-suggestions/action' ||
    path === '/api/system/suggestions/action' ||
    path === '/api/system/agent-suggestions/action' ||
    path === '/api/system/agent/suggestions/action' ||
    path === '/api/system/agent/agent-suggestions/action';

  const isPatchPlanRoute =
    path === '/patch-plan' ||
    path === '/patch-plan.json' ||
    path === '/patch-plan/run' ||
    path === '/api/patch-plan' ||
    path === '/api/patch-plan.json' ||
    path === '/api/patch-plan/run' ||
    path === '/api/system/patch-plan' ||
    path === '/api/system/patch-plan.json' ||
    path === '/api/system/patch-plan/run' ||
    path === '/api/system/agent/patch-plan' ||
    path === '/api/system/agent/patch-plan.json' ||
    path === '/api/system/agent/patch-plan/run';

  if (!isCryptoAcquisitionRoute && !isSuggestionActionRoute && !isPatchPlanRoute) {
    return null;
  }

  if (!this.isAdminRequest(request)) {
    return Response.json(
      {
        success: false,
        error: 'ADMIN_TOKEN_REQUIRED'
      },
      { status: 401 }
    );
  }

  try {
    if (isCryptoAcquisitionRoute) {
      if (method === 'GET') {
        return Response.json(await this.getCryptoAcquisitionExecutionSnapshot());
      }

      if (method === 'POST') {
        const body: any = await request.json().catch(() => ({}));

        return Response.json(
          await this.runCryptoAcquisitionExecutor({
            trigger: 'manual',
            force: body?.force !== false
          })
        );
      }
    }

    if (isSuggestionActionRoute) {
      if (method === 'POST') {
        return await this.handleSuggestionExecutionAction(request);
      }
    }

    if (isPatchPlanRoute) {
      if (method === 'GET') {
        return Response.json(this.getPatchPlanExecutionSnapshot());
      }

      if (method === 'POST') {
        return Response.json(
          await this.runPatchPlanExecutor({
            trigger: 'manual'
          })
        );
      }
    }

    return Response.json(
      {
        success: false,
        error: 'METHOD_NOT_ALLOWED',
        path,
        method
      },
      { status: 405 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    await this.pushKernelLog(
      `[EXECUTION_ROUTE] ROUTE_FAILED path=${path} method=${method} error=${message.slice(0, 300)}`
    );

    return Response.json(
      {
        success: false,
        error: 'EXECUTION_ROUTE_FAILED',
        path,
        method,
        message
      },
      { status: 500 }
    );
  }
}

  private compactLargeText(value: unknown, max = 12000): string | undefined {
    const text = String(value || '');

    if (!text) return undefined;

    return text.length > max
      ? `${text.slice(0, max)}\n\n[TRUNCATED_FOR_DURABLE_OBJECT_STORAGE:${text.length}]`
      : text;
  }

  private compactFullReportJson(value: any): any {
    if (!value || typeof value !== 'object') return value;

    const compact = {
      title: value.title,
      slug: value.slug,
      executive_summary: value.executive_summary,
      summary: value.summary,
      pricing: value.pricing,
      source_evidence: value.source_evidence,
      source_refs: value.source_refs,
      payment_enforcement: value.payment_enforcement,
      payment_verification: value.payment_verification,
      sections: Array.isArray(value.sections)
        ? value.sections.slice(0, 8).map((section: any) => ({
            ...section,
            body: this.compactLargeText(section?.body, 2500),
            content: this.compactLargeText(section?.content, 2500)
          }))
        : undefined
    };

    return JSON.parse(JSON.stringify(compact));
  }

  private compactEarningAssetForStorage(asset: any): any {
    if (!asset || typeof asset !== 'object') return asset;

    return {
      ...asset,

      // These are the main storage killers. Public report pages can be rebuilt dynamically.
      page_html: undefined,
      full_report_html: undefined,

      // Keep JSON useful, but prevent giant report payloads from breaking DO state writes.
      full_report_json: this.compactFullReportJson(asset.full_report_json),

      // Keep notes/evidence bounded.
      notes: this.compactLargeText(asset.notes, 2000),
      source_evidence: this.compactLargeText(asset.source_evidence, 3000)
    };
  }

  private compactExecutionEntryForStorage(entry: any): any {
    if (!entry || typeof entry !== 'object') return entry;

    const compactResult = entry.result && typeof entry.result === 'object'
      ? {
          ...entry.result,
          results: Array.isArray(entry.result.results)
            ? entry.result.results.slice(0, 12).map((result: any) => ({
                url: result.url,
                status: result.status,
                ok: result.ok,
                content_type: result.content_type,
                bytes: result.bytes,
                error: result.error,
                preview: this.compactLargeText(result.preview, 220)
              }))
            : undefined
        }
      : entry.result;

    return {
      ...entry,
      result: compactResult,
      logs: asArray<string>(entry.logs)
        .slice(0, 12)
        .map((line) => this.compactLargeText(line, 500) || '')
    };
  }

  private compactStateForStorage(nextState: any): any {
    const compacted = {
      ...nextState,

      // Hard cap noisy collections.
      messages: asArray<any>(nextState.messages).slice(-20),
      kernel_logs: undefined,

      opportunities: asArray<any>(nextState.opportunities).slice(0, 200).map((opp: any) => ({
        ...opp,
        evidence: this.compactLargeText(opp.evidence, 2500),
        summary: this.compactLargeText(opp.summary, 1500),
        analyst_reasoning: this.compactLargeText(opp.analyst_reasoning, 1500)
      })),

      earning_assets: asArray<any>(nextState.earning_assets)
        .slice(0, 250)
        .map((asset) => this.compactEarningAssetForStorage(asset)),

      tasks: asArray<any>(nextState.tasks).slice(0, 80).map((task: any) => ({
        ...task,
        logs: asArray<string>(task.logs)
          .slice(0, 20)
          .map((line) => this.compactLargeText(line, 500) || '')
      })),

      execution_ledger: asArray<any>(nextState.execution_ledger)
        .slice(0, 120)
        .map((entry) => this.compactExecutionEntryForStorage(entry)),

      crypto_acquisition_execution_ledger: asArray<any>(nextState.crypto_acquisition_execution_ledger)
        .slice(0, 120)
        .map((entry) => this.compactExecutionEntryForStorage(entry)),

      agent_suggestion_execution_ledger: asArray<any>(nextState.agent_suggestion_execution_ledger)
        .slice(0, 120)
        .map((entry) => this.compactExecutionEntryForStorage(entry)),

      patch_plan_execution_ledger: asArray<any>(nextState.patch_plan_execution_ledger)
        .slice(0, 120)
        .map((entry) => this.compactExecutionEntryForStorage(entry))
    };

    compacted.system_health = {
      ...(nextState.system_health || {}),
      kernel_logs: asArray<string>(nextState.system_health?.kernel_logs)
        .slice(0, 80)
        .map((line) => this.compactLargeText(line, 700) || '')
    };

    if (compacted.crypto_acquisition) {
      compacted.crypto_acquisition = {
        ...compacted.crypto_acquisition,
        execution_ledger: asArray<any>(compacted.crypto_acquisition.execution_ledger)
          .slice(0, 120)
          .map((entry) => this.compactExecutionEntryForStorage(entry)),
        candidates: asArray<any>(compacted.crypto_acquisition.candidates).slice(0, 80)
      };
    }

    return compacted;
  }

  private async setCompactState(nextState: any): Promise<void> {
    await this.setState(this.compactStateForStorage(nextState) as any);
  }

  // END_EXECUTION_RAIL_PATCH
  public async rpcFetchPlain(input: {
    url?: string;
    path?: string;
    method?: string;
    headers?: Array<[string, string]> | Record<string, string>;
    body?: string | null;
  }): Promise<{
    status: number;
    statusText: string;
    headers: Array<[string, string]>;
    body: string;
  }> {
    const method = String(input.method || 'GET').toUpperCase();
    const path = input.path || '/';
    const url = input.url || `http://agent${path}`;

    const headers = new Headers(input.headers || {});
    const body =
      method === 'GET' || method === 'HEAD'
        ? undefined
        : input.body ?? undefined;

    const response = await this.onRequest(
      new Request(url, {
        method,
        headers,
        body
      })
    );

    const responseHeaders: Array<[string, string]> = [];
    response.headers.forEach((value, key) => {
      responseHeaders.push([key, value]);
    });

    return {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: await response.text()
    };
  }


  private async buildCryptoAcquisitionRouteResponse(request: Request): Promise<Response> {
    if (!this.isAdminRequest(request)) {
      return Response.json(
        {
          success: false,
          error: 'ADMIN_TOKEN_REQUIRED'
        },
        { status: 401 }
      );
    }

    return Response.json(await this.getCryptoAcquisitionExecutionSnapshot());
  }

  private async runCryptoAcquisitionRoute(request: Request): Promise<Response> {
    try {
      if (!this.isAdminRequest(request)) {
        return Response.json(
          {
            success: false,
            error: 'ADMIN_TOKEN_REQUIRED'
          },
          { status: 401 }
        );
      }


      
      const body = request.method === 'POST'
        ? await request.json().catch(() => ({}))
        : {};

      return Response.json(
        await this.runCryptoAcquisitionExecutor({
          trigger: 'manual',
          force: (body as any)?.force !== false
        })
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      await this.pushKernelLog(
        '[CRYPTO_ACQUISITION] RUN_ROUTE_FAILED: ' + message.slice(0, 400)
      );

      return Response.json(
        {
          success: false,
          error: 'CRYPTO_ACQUISITION_RUN_FAILED',
          error_detail: message,
          message: 'The executor route crashed before completion. No revenue was credited.'
        },
        { status: 500 }
      );
    }
  }

  private async buildSuggestionsRouteResponse(): Promise<Response> {
    try {
      const now = Date.now();
      const marketStats = buildMarketStats({
        earning_assets: this.state.earning_assets || [],
        opportunities: this.state.opportunities || [],
        niche_performance: this.state.niche_performance || [],
        source_performance: this.state.source_performance || [],
        now
      });

      const summary = buildAgentSuggestionSummary({
        assets: this.state.earning_assets || [],
        opportunities: this.state.opportunities || [],
        market_stats: marketStats,
        crypto_acquisition_run: (this.state as any).crypto_acquisition_run || null,
        existing_suggestions: asArray<any>((this.state as any).agent_suggestions),
        now
      });

      await this.setState({
        ...(this.state as any),
        agent_suggestions: summary.suggestions
      } as any);

      return Response.json({
        success: true,
        summary_text: buildAgentSuggestionTextSummary(summary),
        suggestions: summary
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      await this.pushKernelLog(
        '[SUGGESTIONS] ROUTE_FAILED: ' + message.slice(0, 400)
      );

      const fallbackSuggestions = asArray<any>((this.state as any).agent_suggestions);

      return Response.json({
        success: true,
        warning: 'SUGGESTIONS_FALLBACK_USED',
        error_detail: message,
        summary_text: 'Suggestion builder failed; persisted suggestions returned.',
        suggestions: {
          generated_at: Date.now(),
          generated_at_iso: new Date().toISOString(),
          suggestions: fallbackSuggestions,
          summary: {
            total: fallbackSuggestions.length,
            pending: fallbackSuggestions.filter((item: any) => {
              const status = cleanText(item?.status || 'suggested').toLowerCase();
              return status === 'suggested' || status === 'pending';
            }).length,
            approved: fallbackSuggestions.filter((item: any) => cleanText(item?.status).toLowerCase() === 'approved').length,
            implemented: fallbackSuggestions.filter((item: any) => cleanText(item?.status).toLowerCase() === 'implemented').length,
            rejected: fallbackSuggestions.filter((item: any) => cleanText(item?.status).toLowerCase() === 'rejected').length
          }
        }
      });
    }
  }

  private async handleSuggestionAction(request: Request): Promise<Response> {
    const body: any = await request.json().catch(() => ({}));
    const now = Date.now();
    const suggestionId = cleanText(
      (body as any).suggestion_id ||
        (body as any).suggestionId ||
        (body as any).id
    );
    const action = cleanText((body as any).action).toLowerCase();

    if (!suggestionId) {
      return Response.json(
        {
          success: false,
          error: 'SUGGESTION_ID_REQUIRED'
        },
        { status: 400 }
      );
    }

    let suggestions = asArray<any>((this.state as any).agent_suggestions);

    if (action === 'approve' || action === 'approved') {
      suggestions = approveSuggestion(suggestions, suggestionId, now);
    } else if (action === 'reject' || action === 'rejected') {
      suggestions = rejectSuggestion(suggestions, suggestionId, now);
    } else if (action === 'implemented' || action === 'mark_implemented') {
      suggestions = markSuggestionImplemented(suggestions, suggestionId, now);
    } else {
      return Response.json(
        {
          success: false,
          error: 'INVALID_SUGGESTION_ACTION',
          allowed_actions: ['approve', 'reject', 'implemented']
        },
        { status: 400 }
      );
    }

    await this.setState({
      ...(this.state as any),
      agent_suggestions: suggestions
    } as any);

    await this.pushKernelLog(
      `[SUGGESTIONS] ACTION=${action} ID=${suggestionId}`
    );

    return Response.json({
      success: true,
      action,
      suggestion_id: suggestionId,
      suggestions
    });
  }

  private getPatchPlanState(now = Date.now()) {
    return (this.state as any).patch_plan || buildDefaultPatchPlan(now);
  }

  private async buildPatchPlanRouteResponse(): Promise<Response> {
    try {
      const now = Date.now();
      const plan = this.getPatchPlanState(now);
      const summary = buildPatchPlanPublicSummary(plan, now);

      await this.setState({
        ...(this.state as any),
        patch_plan: summary.plan
      } as any);

      return Response.json({
        ...summary,
        text_summary: buildPatchPlanTextSummary(summary.plan)
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      await this.pushKernelLog(
        '[PATCH_PLAN] ROUTE_FAILED: ' + message.slice(0, 400)
      );

      const now = Date.now();
      const plan = buildDefaultPatchPlan(now);
      const summary = buildPatchPlanPublicSummary(plan, now);

      return Response.json({
        ...summary,
        warning: 'PATCH_PLAN_FALLBACK_USED',
        error_detail: message,
        text_summary: buildPatchPlanTextSummary(summary.plan)
      });
    }
  }

  private async handlePatchPlanAction(request: Request): Promise<Response> {
    const now = Date.now();
    const body: any = await request.json().catch(() => ({}));
    const action = cleanText((body as any).action).toLowerCase();
    const filePath = cleanText(
      (body as any).file_path ||
        (body as any).filePath ||
        (body as any).path
    );

    let plan = this.getPatchPlanState(now);

    if (action === 'current' || action === 'set_current' || action === 'in_progress') {
      if (!filePath) {
        return Response.json(
          { success: false, error: 'FILE_PATH_REQUIRED' },
          { status: 400 }
        );
      }

      plan = setPatchPlanCurrentItem(plan, filePath, now);
    } else if (action === 'done' || action === 'mark_done') {
      if (!filePath) {
        return Response.json(
          { success: false, error: 'FILE_PATH_REQUIRED' },
          { status: 400 }
        );
      }

      plan = markPatchPlanItemStatus(plan, filePath, 'done', now);
    } else if (action === 'pending') {
      if (!filePath) {
        return Response.json(
          { success: false, error: 'FILE_PATH_REQUIRED' },
          { status: 400 }
        );
      }

      plan = markPatchPlanItemStatus(plan, filePath, 'pending', now);
    } else if (action === 'block' || action === 'blocked') {
      if (!filePath) {
        return Response.json(
          { success: false, error: 'FILE_PATH_REQUIRED' },
          { status: 400 }
        );
      }

      plan = blockPatchPlanItem(plan, filePath, now);
    } else if (action === 'unblock') {
      if (!filePath) {
        return Response.json(
          { success: false, error: 'FILE_PATH_REQUIRED' },
          { status: 400 }
        );
      }

      plan = unblockPatchPlanItem(plan, filePath, now);
    } else {
      return Response.json(
        {
          success: false,
          error: 'INVALID_PATCH_PLAN_ACTION',
          allowed_actions: ['current', 'done', 'pending', 'block', 'unblock']
        },
        { status: 400 }
      );
    }

    const summary = buildPatchPlanPublicSummary(plan, now);

    await this.setState({
      ...(this.state as any),
      patch_plan: summary.plan
    } as any);

    await this.pushKernelLog(
      '[PATCH_PLAN] ACTION=' + action + ' FILE=' + (filePath || 'none')
    );

    return Response.json({
      ...summary,
      text_summary: buildPatchPlanTextSummary(summary.plan)
    });
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
const executionRouteResponse = await this.tryHandleExecutionRoutes(request, url);

if (executionRouteResponse) {
  return executionRouteResponse;
}

const ownerOnlyPublicPaths = new Set([
  '/messages',
  '/ingest',
  '/proposals/action',
  '/withdraw',
  '/policy',
  '/setup',
  '/chat',
  '/sources.json',
  '/suggestions',
  '/suggestions.json',
  '/suggestions/action',
  '/patch-plan/action'
]);

if (ownerOnlyPublicPaths.has(url.pathname) && !this.isAdminRequest(request)) {
  return Response.json(
    {
      success: false,
      error: 'ADMIN_TOKEN_REQUIRED'
    },
    { status: 401 }
  );
}

if ((url.pathname === '/suggestions' || url.pathname === '/suggestions.json') && request.method === 'GET') {
  return this.buildSuggestionsRouteResponse();
}

if (url.pathname === '/suggestions/action' && request.method === 'POST') {
  return this.handleSuggestionExecutionAction(request);
}

if (url.pathname === '/patch-plan/action' && request.method === 'POST') {
  return this.handlePatchPlanAction(request);
}
    if (url.pathname === '/' && request.method === 'GET') {
      return await this.buildReportsCatalogHtml(request);
    }

    if (url.pathname === '/reports' && request.method === 'GET') {
      return await this.buildReportsCatalogHtml(request);
    }

    if (url.pathname === '/reports.json' && request.method === 'GET') {
      return await this.buildReportsJson(request);
    }

    if (url.pathname === '/signals.json' && request.method === 'GET') {
      return this.buildSignalsJson(request);
    }

    if (url.pathname === '/opportunities.json' && request.method === 'GET') {
      return this.buildOpportunitiesJson(request);
    }

    if (url.pathname === '/sources.json' && request.method === 'GET') {
      return this.buildSourcesJson();
    }
    if (url.pathname === '/discovery.json' && request.method === 'GET') {
      return this.buildDiscoveryJsonRoute(request);
    }

    if (url.pathname === '/llms.txt' && request.method === 'GET') {
      return this.buildLlmsTxtRoute(request);
    }

    if (url.pathname === '/agents.txt' && request.method === 'GET') {
      return this.buildAgentsTxtRoute(request);
    }


    if (url.pathname === '/market-stats.json' && request.method === 'GET') {
      return this.buildAdminMarketStatsJson(request);
    }

    if (url.pathname === '/sitemap.xml' && request.method === 'GET') {
      return this.buildSitemapXml(request);
    }

    if (url.pathname === '/feed.xml' && request.method === 'GET') {
      return await this.buildFeedXml(request);
    }

    if (url.pathname === '/robots.txt' && request.method === 'GET') {
      return this.buildRobotsTxt(request);
    }

    if (url.pathname.startsWith('/reports/') && request.method === 'GET') {
      const parts = url.pathname.split('/').filter(Boolean);
      const slug = parts[1];
      const suffix = parts[2];

      const asset = this.findAssetBySlugOrId(slug);

      if (!asset) {
        return new Response('Report not found', { status: 404 });
      }

      if (!suffix) {
        return await this.buildReportPageHtml(asset, request);
      }

      const origin = this.getPublicOrigin(request);

      if (suffix === 'metadata.json') {
        return Response.json({
          success: true,
          report: await this.publicAssetMetadata(asset, origin)
        });
      }

      if (suffix === 'preview.json') {
        const metadata = await this.publicAssetMetadata(asset, origin);

        return Response.json({
          success: true,
          report: {
            ...metadata,
            preview_html: shortText(String(asset.page_html || ''), 2200),
            full_report_locked: asset.unlock_status !== 'unlocked'
          }
        });
      }

      if (suffix === 'full.json') {
        const adminAccess = this.isAdminRequest(request);

        if (asset.unlock_status !== 'unlocked' && !adminAccess) {
          const lockedReport = await this.publicAssetMetadata(asset, origin);

          return Response.json(
            {
              success: false,
              error: 'PAYMENT_REQUIRED',
              kind: 'nexus_locked_report',
              message:
                'This report is locked. Send the required payment, then POST the transaction hash to the public verify-payment URL.',
              report: lockedReport,
              card: lockedReport,
              payment_request: lockedReport.payment,
              verify_payment_url: lockedReport.urls.verify_payment,
              report_url: lockedReport.urls.page,
              metadata_json_url: lockedReport.urls.metadata_json,
              preview_json_url: lockedReport.urls.preview_json,
              full_json_url: lockedReport.urls.full_json,
              projected_value_label: 'projected_market_value_only_not_verified_revenue',
              full_report_locked: true
            },
            {
              status: 402,
              headers: {
                'Cache-Control': 'no-store'
              }
            }
          );
        }

        return Response.json({
          success: true,
          admin_access: adminAccess,
          asset_id: asset.id,
          slug: asset.slug,
          full_report_json: asset.full_report_json || {
            title: asset.title,
            niche: asset.niche,
            html: asset.full_report_html || asset.page_html
          },
          full_report_html: asset.full_report_html || asset.page_html
        });
      }
    }

    if (
      url.pathname.startsWith('/reports/') &&
      url.pathname.endsWith('/verify-payment') &&
      request.method === 'POST'
    ) {
      try {
        const parts = url.pathname.split('/').filter(Boolean);
        const slug = parts[1];

        const body = (await request.json()) as { txHash?: string };

        if (!body.txHash) {
          return Response.json(
            { success: false, error: 'TX_HASH_REQUIRED' },
            { status: 400 }
          );
        }

        const asset = this.findAssetBySlugOrId(slug);

        if (!asset) {
          return Response.json(
            { success: false, error: 'REPORT_NOT_FOUND' },
            { status: 404 }
          );
        }

        const requestedTxHash = String(body.txHash).toLowerCase();

        const alreadyUsed =
          asArray<any>(this.state.earning_assets).some((a) =>
            String(a.paid_tx_hash || '').toLowerCase() === requestedTxHash
          ) ||
          asArray<TaxReceipt>(this.state.tax_receipts).some((receipt) =>
            String(receipt.tx_hash || '').toLowerCase() === requestedTxHash
          );

        if (alreadyUsed) {
          return Response.json(
            { success: false, error: 'TX_HASH_ALREADY_USED' },
            { status: 409 }
          );
        }

        const verification = await verifyNativeCryptoDepositAgainstLivePrice({
          env: {
            ...(this.env as any)
          },
          rpcUrl: this.env.CRYPTO_RPC_URL,
          treasuryAddress: this.env.CRYPTO_TREASURY_ADDRESS,
          txHash: body.txHash,
          chainId: Number(this.env.CRYPTO_CHAIN_ID || 137),
          nativeSymbol: this.env.CRYPTO_NATIVE_SYMBOL || 'POL',
          requiredPriceNok: Number(asset.price_nok || 0),
          nativeDecimals: this.getNativeDecimals(),
          minConfirmations: this.getMinConfirmations(),
          allowedUnderpaymentNok: this.getAllowedUnderpaymentNok(),
          forceQuoteRefresh: true,
          allowStaleQuote: true,
          allowConfiguredFallback: this.allowConfiguredCryptoPriceFallback()
        } as any);

        const receipt = verification.receipt;

        await this.creditTreasuryFromVerifiedCryptoReceipt(receipt);

        const now = Date.now();

        const updatedAssets = asArray<any>(this.state.earning_assets).map((a) => {
          if (a.id !== asset.id) return a;

          const updatedEnforcement = {
            ...(a.payment_enforcement || {}),
            enabled: true,
            pricing_mode: 'live_oracle',
            payment_sufficient: true,
            required_price_nok: verification.required_price_nok,
            received_value_nok: verification.received_value_nok,
            required_amount_crypto: verification.required_amount_crypto,
            required_amount_crypto_string: verification.required_amount_crypto_string,
            required_amount_wei: verification.required_amount_wei,
            received_amount_crypto: verification.received_amount_crypto,
            received_amount_crypto_string: verification.received_amount_crypto_string,
            received_amount_wei: verification.received_amount_wei,
            overpayment_nok: verification.overpayment_nok
          };

          return {
            ...a,
            updated_at: now,
            unlock_status: 'unlocked' as const,
            status: 'paid' as const,
            payout_status: 'verified' as const,
            paid_tx_hash: receipt.tx_hash,
            paid_at: now,
            verified_revenue_nok: receipt.estimated_value_nok ?? 0,
            payment_verification: verification,
            payment_enforcement: updatedEnforcement,
            full_report_json: {
              ...(a.full_report_json || {}),
              payment_enforcement: updatedEnforcement,
              payment_verification: verification
            }
          };
        });

        const updatedAsset = updatedAssets.find((a) => a.id === asset.id);

        await this.setState({
          ...this.state,
          earning_assets: updatedAssets
        });

        if (updatedAsset) {
          await this.updatePerformanceFromVerifiedAsset(updatedAsset as EarningAsset);
        }

        const origin = this.getPublicOrigin(request);
        const assetSlug = asset.slug || slug;

        return Response.json({
          success: true,
          unlocked: true,
          asset_id: asset.id,
          slug: assetSlug,
          receipt,
          payment_verification: verification,
          full_json_url: absoluteUrl(origin, `/reports/${assetSlug}/full.json`)
        });
      } catch (error: any) {
        const message = error?.message || String(error);

        return Response.json(
          {
            success: false,
            error: message
          },
          {
            status: message.includes('LIVE_NATIVE_PRICE_QUOTE_UNAVAILABLE') ? 503 : 400
          }
        );
      }
    }

    if (url.pathname.startsWith('/earning-assets/') && request.method === 'GET') {
      const assetId = url.pathname.split('/').pop() || '';
      const asset = (this.state.earning_assets || []).find((a) => a.id === assetId);

      if (!asset) {
        return new Response('Asset not found', { status: 404 });
      }

      return new Response(asset.page_html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store'
        }
      });
    }

    if (
      url.pathname.startsWith('/earning-assets/') &&
      url.pathname.endsWith('/verify-payment') &&
      request.method === 'POST'
    ) {
      try {
        const parts = url.pathname.split('/').filter(Boolean);
        const assetId = parts[1];

        const asset = this.findAssetBySlugOrId(assetId);

        if (!asset) {
          return Response.json(
            { success: false, error: 'ASSET_NOT_FOUND' },
            { status: 404 }
          );
        }

        const slug = asset.slug || asset.id;
        const body = await request.json();

        return this.onRequest(
          new Request(`http://agent/reports/${slug}/verify-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          })
        );
      } catch (error: any) {
        return Response.json(
          { success: false, error: error?.message || String(error) },
          { status: 400 }
        );
      }
    }

    if (url.pathname === '/messages') {
      const now = Date.now();
      const hydratedAssets = await Promise.all(
        asArray<any>(this.state.earning_assets || []).map((asset) =>
          this.hydrateAssetPaymentFields(asset)
        )
      );

      const marketStats = buildMarketStats({
        earning_assets: hydratedAssets,
        opportunities: this.state.opportunities || [],
        niche_performance: this.state.niche_performance || [],
        source_performance: this.state.source_performance || [],
        now
      });

      const cryptoRun = (this.state as any).crypto_acquisition_run || runCryptoAcquisitionAgent({
        env: this.env as any,
        now,
        existing_candidates: asArray<any>((this.state as any).crypto_acquisition_candidates)
      });

      const suggestions = buildAgentSuggestionSummary({
        assets: hydratedAssets,
        opportunities: this.state.opportunities || [],
        market_stats: marketStats,
        crypto_acquisition_run: cryptoRun,
        existing_suggestions: asArray<any>((this.state as any).agent_suggestions),
        now
      });

      const patchPlanSummary = buildPatchPlanPublicSummary(
        this.getPatchPlanState(now),
        now
      );

      const cryptoExecutionSnapshot = await this.getCryptoAcquisitionExecutionSnapshot();
      const executionStateAny = this.getExecutionRailState();

      return Response.json({
        success: true,
        data: {
          ...this.state,
          earning_assets: hydratedAssets,
          market_stats: marketStats,
          agent_suggestions: suggestions.suggestions,
          agent_suggestion_summary: suggestions,
          crypto_acquisition_run: cryptoRun,
          crypto_acquisition_status: buildCryptoAcquisitionAgentStatus(cryptoRun),
          crypto_acquisition: cryptoExecutionSnapshot.crypto_acquisition,
          execution_ledger: asArray<any>(executionStateAny.execution_ledger).slice(0, 500),
          crypto_acquisition_execution_ledger: asArray<any>(executionStateAny.crypto_acquisition_execution_ledger).slice(0, 500),
          agent_suggestion_execution_ledger: asArray<any>(executionStateAny.agent_suggestion_execution_ledger).slice(0, 500),
          patch_plan_execution_ledger: asArray<any>(executionStateAny.patch_plan_execution_ledger).slice(0, 500),
          patch_plan: patchPlanSummary.plan,
          patch_plan_summary: patchPlanSummary,
          accounting_policy: {
            projected_values_are_not_revenue: true,
            expected_values_are_not_revenue: true,
            verified_revenue_only: true,
            treasury_credit_requires_verified_receipt: true
          }
        }
      });
    }

    if (url.pathname === '/ingest' && request.method === 'POST') {
      const currentStatus = String(this.state.system_health.last_run?.status || '');
      const lastTriggeredAt = safeNumber(this.state.system_health.last_run?.triggeredAt, 0);
      const runningAgeMs = lastTriggeredAt > 0 ? Date.now() - lastTriggeredAt : 0;

      const staleRunning =
        currentStatus === 'running' &&
        lastTriggeredAt > 0 &&
        runningAgeMs > 15 * 60_000;

      if (currentStatus === 'running' && !staleRunning) {
        return Response.json(
          {
            success: false,
            error: 'ALREADY_RUNNING',
            age_ms: runningAgeMs,
            triggered_at: lastTriggeredAt
          },
          { status: 409 }
        );
      }

      if (staleRunning) {
        await this.pushKernelLog(
          `[SYSTEM] STALE_RUNNING_STATE_RECOVERED AGE_MS=${runningAgeMs}`
        );

        await this.setState({
          ...this.state,
          ingest_lock_until: 0,
          ingest_lock_reason: undefined,
          agents: this.state.agents.map((agent) =>
            ['scout', 'analyst', 'router'].includes(agent.role)
              ? { ...agent, status: 'idle', activeTasks: 0 }
              : agent
          ),
          system_health: {
            ...this.state.system_health,
            status: 'warning',
            last_check: Date.now(),
            last_run: {
              ...(this.state.system_health.last_run || {
                triggeredAt: Date.now(),
                sources: [],
                signalsCreated: 0
              }),
              completedAt: Date.now(),
              status: 'failed',
              error: 'STALE_RUNNING_STATE_RECOVERED'
            }
          }
        });
      }

      const aiBackoffRemaining = this.getAiBackoffRemainingMs('analyst');

      if (aiBackoffRemaining > 0) {
        await this.performAutonomousMaintenance();
        await this.setDeferredRun('AI_BACKOFF_ACTIVE', this.getAiNextSafeAttemptAt('analyst'));

        return Response.json({
          success: true,
          message: 'INGESTION_DEFERRED_AI_BACKOFF_ACTIVE',
          ai_backoff_remaining_ms: aiBackoffRemaining,
          next_safe_attempt_at: this.getAiNextSafeAttemptAt('analyst'),
          next_safe_attempt_at_iso: new Date(this.getAiNextSafeAttemptAt('analyst')).toISOString()
        });
      }

      const runStartTime = Date.now();

      await this.setState({
        ...this.state,
        ingest_lock_until: runStartTime + 10 * 60_000,
        ingest_lock_reason: 'manual_ingest',
        agents: this.state.agents.map((agent) =>
          agent.role === 'scout'
            ? {
                ...agent,
                status: 'scanning',
                lastActive: runStartTime
              }
            : agent
        ),
        system_health: {
          ...this.state.system_health,
          last_run: {
            triggeredAt: runStartTime,
            status: 'running',
            sources: ['manual_trigger', 'source_registry'],
            signalsCreated: 0
          }
        }
      });

      this.ctx.waitUntil(this.performFullCycle(true));

      return Response.json({
        success: true,
        message: staleRunning
          ? 'STALE_RUNNING_STATE_RECOVERED_AND_INGESTION_CYCLE_TRIGGERED'
          : 'INGESTION_CYCLE_TRIGGERED'
      });
    }

    if (url.pathname === '/proposals/action' && request.method === 'POST') {
      const { proposalId, action } = await request.json() as {
        proposalId: string;
        action: 'approved' | 'rejected';
      };

      const proposal = this.state.proposals.find((item) => item.id === proposalId);

      if (!proposal || proposal.status !== 'pending') {
        return Response.json(
          { success: false, error: 'INVALID_PROPOSAL' },
          { status: 400 }
        );
      }

      const newTreasury = { ...this.state.treasury };

      if (action === 'approved') {
        if (newTreasury.reinvestment < proposal.cost) {
          return Response.json(
            { success: false, error: 'INSUFFICIENT_REINVESTMENT_FUNDS' },
            { status: 400 }
          );
        }

        newTreasury.reinvestment = Number((newTreasury.reinvestment - proposal.cost).toFixed(2));
        newTreasury.total = Number((newTreasury.total - proposal.cost).toFixed(2));

        await this.pushKernelLog(`[REINVESTMENT] APPROVED: ${proposal.title} (-${proposal.cost})`);
      }

      await this.setState({
        ...this.state,
        treasury: newTreasury,
        proposals: this.state.proposals.map((proposalItem) =>
          proposalItem.id === proposalId
            ? {
                ...proposalItem,
                status: action === 'approved' ? 'implemented' : 'rejected'
              }
            : proposalItem
        )
      });

      return Response.json({
        success: true,
        data: {
          treasury: this.state.treasury,
          proposals: this.state.proposals
        }
      });
    }

    if (url.pathname === '/withdraw' && request.method === 'POST') {
      const { amount, email } = await request.json() as any;

      if (typeof amount !== 'number' || amount <= 0) {
        return Response.json(
          { success: false, error: 'INVALID_AMOUNT' },
          { status: 400 }
        );
      }

      const now = Date.now();
      const lastWithdrawal = this.state.last_withdrawal_at || 0;

      if (now - lastWithdrawal < 86400000) {
        return Response.json(
          { success: false, error: 'WITHDRAWAL_COOLDOWN_ACTIVE' },
          { status: 429 }
        );
      }

      if (amount > this.state.treasury.owner_withdrawable) {
        return Response.json(
          { success: false, error: 'INSUFFICIENT_FUNDS' },
          { status: 400 }
        );
      }

      const payoutRes = await this.executePayPalPayout(amount, email);

      if (!payoutRes.success) {
        return Response.json(
          { success: false, error: 'PAYPAL_API_REJECTION' },
          { status: 502 }
        );
      }

      const newTreasury = {
        ...this.state.treasury,
        owner_withdrawable: Number((this.state.treasury.owner_withdrawable - amount).toFixed(2)),
        total: Number((this.state.treasury.total - amount).toFixed(2))
      };

      const entry: LedgerEntry = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        amount,
        type: 'debit',
        bucket: 'owner_withdrawable',
        description: `PAYPAL_WITHDRAWAL: ${email} (REF: ${payoutRes.ref})`,
        agent_id: 'treasury'
      };

      await this.setState({
        ...this.state,
        treasury: newTreasury,
        ledger: [entry, ...this.state.ledger].slice(0, 500),
        last_withdrawal_at: now
      });

      return Response.json({
        success: true,
        data: newTreasury
      });
    }

    if (url.pathname === '/policy' && request.method === 'POST') {
      const body = await request.json() as any;

      if (body.treasury_split) {
        const validationError = this.validateTreasurySplit(body.treasury_split);

        if (validationError) {
          return Response.json(
            { success: false, error: validationError },
            { status: 400 }
          );
        }
      }

      const timestamp = new Date().toISOString().split('T')[0];
      const audit = `[${timestamp}] POLICY_UPDATE: ${Object.keys(body).join(', ').toUpperCase()}`;

      await this.setState({
        ...this.state,
        policy: {
          ...this.state.policy,
          ...body
        },
        policy_audit_logs: [audit, ...(this.state.policy_audit_logs || [])].slice(0, 100)
      });

      return Response.json({ success: true });
    }

    if (url.pathname === '/setup' && request.method === 'POST') {
      const payload = await request.json() as any;

      const incomingPolicy = payload.policy || {};

      if (incomingPolicy.treasury_split) {
        const validationError = this.validateTreasurySplit(incomingPolicy.treasury_split);

        if (validationError) {
          return Response.json(
            { success: false, error: validationError },
            { status: 400 }
          );
        }
      }

      await this.setState({
        ...this.state,
        owner_email: payload.owner_email,
        policy: {
          ...this.state.policy,
          ...incomingPolicy,
          treasury_split: incomingPolicy.treasury_split || this.getTreasurySplit(),
          autonomous_ingestion_enabled: incomingPolicy.autonomous_ingestion_enabled ?? true
        },
        setup_complete: true,
        tax_receipts: this.state.tax_receipts || [],
        earning_assets: await Promise.all(
          asArray<any>(this.state.earning_assets || []).map((asset) =>
            this.hydrateAssetPaymentFields(asset)
          )
        ),
        niche_performance: this.state.niche_performance || [],
        source_performance: this.state.source_performance || []
      });

      return Response.json({ success: true });
    }

    if (url.pathname === '/chat') {
      const body = await request.json() as any;
      return this.handleChatMessage(body);
    }

    if (url.pathname === '/crypto/verify-deposit' && request.method === 'POST') {
      try {
        const body = (await request.json()) as { txHash?: string };

        if (!body.txHash) {
          return Response.json(
            { success: false, error: 'TX_HASH_REQUIRED' },
            { status: 400 }
          );
        }

        const receipt = await verifyNativeCryptoDepositWithLiveValuation({
          env: {
            ...(this.env as any)
          },
          rpcUrl: this.env.CRYPTO_RPC_URL,
          treasuryAddress: this.env.CRYPTO_TREASURY_ADDRESS,
          txHash: body.txHash,
          chainId: Number(this.env.CRYPTO_CHAIN_ID || 137),
          nativeSymbol: this.env.CRYPTO_NATIVE_SYMBOL || 'POL',
          nativeDecimals: this.getNativeDecimals(),
          minConfirmations: this.getMinConfirmations(),
          forceQuoteRefresh: true,
          allowStaleQuote: true,
          allowConfiguredFallback: this.allowConfiguredCryptoPriceFallback()
        } as any);

        const existing =
          this.state.ledger.some((entry) =>
            String(entry.description || '').toLowerCase().includes(String(receipt.tx_hash || '').toLowerCase())
          ) ||
          (this.state.tax_receipts || []).some((taxReceipt) =>
            String(taxReceipt.tx_hash || '').toLowerCase() === String(receipt.tx_hash || '').toLowerCase()
          );

        if (existing) {
          return Response.json({
            success: true,
            duplicate: true,
            receipt,
            message: 'Transaction already recorded'
          });
        }

        await this.creditTreasuryFromVerifiedCryptoReceipt(receipt);

        return Response.json({
          success: true,
          receipt
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        return Response.json(
          {
            success: false,
            error: message
          },
          {
            status: message.includes('LIVE_NATIVE_PRICE_QUOTE_UNAVAILABLE') ? 503 : 400
          }
        );
      }
    }

    return Response.json({ success: false }, { status: 404 });
  }

  private async executePayPalPayout(amount: number, email: string) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    return {
      success: true,
      ref: `PAY-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
    };
  }

  private async handleChatMessage(body: any): Promise<Response> {
    if (!this.chatHandler) {
      return Response.json({ success: false }, { status: 500 });
    }

    const { message, stream } = body;
    const userMsg = createMessage('user', message);
    const updatedMessages = [...this.state.messages, userMsg].slice(-20);

    await this.setState({
      ...this.state,
      messages: updatedMessages,
      isProcessing: true
    });

    try {
      if (stream) {
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const encoder = createEncoder();

        const streamTask = (async () => {
          try {
            const res = await this.runAiCompletionWithModelFallback({
              role: 'analyst',
              context: 'chat',
              prompt: message,
              messages: updatedMessages,
              streamCallback: (chunk) => {
                writer.write(encoder.encode(chunk));
              }
            });

            const assistantMsg = createMessage('assistant', res.content, res.toolCalls);

            await this.setState({
              ...this.state,
              messages: [...updatedMessages, assistantMsg],
              isProcessing: false
            });
          } finally {
            await writer.close();
          }
        })();

        this.ctx.waitUntil?.(streamTask);

        return createStreamResponse(readable);
      }

      const res = await this.runAiCompletionWithModelFallback({
        role: 'analyst',
        context: 'chat',
        prompt: message,
        messages: updatedMessages
      });

      const assistantMsg = createMessage('assistant', res.content, res.toolCalls);

      await this.setState({
        ...this.state,
        messages: [...updatedMessages, assistantMsg],
        isProcessing: false
      });

      return Response.json({
        success: true,
        data: this.state
      });
    } catch (error) {
      if (this.isAiRateLimitError(error)) {
        await this.markAiRateLimited('chat', error);
      }

      await this.setState({
        ...this.state,
        isProcessing: false
      });

      return Response.json({ success: false }, { status: 500 });
    }
  }
}


