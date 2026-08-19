import type { KVNamespace, DurableObjectNamespace } from '@cloudflare/workers-types';
import type { NichePerformance, SourcePerformance } from './performance-scoring';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export type AgentRole =
  | 'scout'
  | 'analyst'
  | 'router'
  | 'content_arb'
  | 'affiliate'
  | 'lead_gen'
  | 'resale'
  | 'referral'
  | 'trading';

export type AgentStatus =
  | 'idle'
  | 'scanning'
  | 'analyzing'
  | 'routing'
  | 'executing'
  | 'running'
  | 'processing'
  | 'completed'
  | 'error'
  | 'in_development'
  | 'blocked'
  | 'external_blocked';

export interface AgentPerformance {
  role: AgentRole;
  status: AgentStatus;
  health: number;
  totalProfit: number;
  activeTasks: number;
  lastActive: number;
  successRate: number;
  hourlyRevenue: number;
  capital_allocated: number;
}

export interface AgentTask {
  id: string;
  agent_role: AgentRole;
  opportunity_id: string;
  opportunity_title?: string;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'skipped' | 'external_blocked' | 'verified_revenue';
  started_at: number;
  completed_at?: number;
  result_profit?: number;
  logs: string[];
  latency_ms?: number;
}

export type OpportunityStatus =
  | 'detected'
  | 'analyzing'
  | 'validated'
  | 'routing'
  | 'executing'
  | 'completed'
  | 'expired'
  | 'failed';

export type ReportPriceTier = 'low' | 'standard' | 'premium' | 'high_value' | 'urgent';

export type OfferLinkType = 'affiliate' | 'payment' | 'referral' | 'api' | 'report';

export interface OfferLink {
  id?: string;
  label: string;
  url: string;
  type: OfferLinkType;
  notes?: string;
  match_score?: number;
  matched_keywords?: string[];
}

export interface PaymentEnforcementMetadata {
  enabled: boolean;
  pricing_mode: 'live_oracle' | 'manual' | 'disabled';

  reason?: string;
  required_price_nok: number;

  native_symbol?: string;
  native_price_nok?: number;

  required_amount_crypto?: number;
  required_amount_crypto_string?: string;
  required_amount_wei?: string;

  decimals?: number;
  min_confirmations?: number;
  allowed_underpayment_nok?: number;

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

export interface OpportunityReportLinks {
  report_asset_id?: string;
  report_slug?: string;
  report_url?: string;
  metadata_url?: string;
  preview_url?: string;
  full_json_url?: string;
  verify_payment_url?: string;
}

export interface Opportunity extends OpportunityReportLinks {
  id: string;
  title: string;
  summary: string;
  niche: string;
  signal_type: string;
  evidence: string;
  source_refs: string[];
  intelligence_source?: string;
  analyst_reasoning?: string;

  confidence_score: number;
  novelty_score: number;
  urgency_score: number;
  monetization_score: number;
  market_value_score?: number;
  risk_score: number;

  required_capital: number;

  /**
   * Legacy/display field.
   * Projected market upside only, never verified revenue.
   */
  potential_profit: number;

  /**
   * Canonical projected market upside field.
   * Strategic prioritization data only.
   */
  projected_market_value_usd?: number;

  /**
   * Recommended sale price for the generated intelligence product.
   */
  recommended_price_nok?: number;
  recommended_price_usd?: number;
  price_tier?: ReportPriceTier;

  buyer_type?: string;
  product_type?: string;
  pricing_reasoning?: string;

  recommended_agents: AgentRole[];
  expiry_time: number;
  status: OpportunityStatus;
  created_at: number;
  updated_at?: number;

  price_nok?: number;
  price_crypto_estimate?: string;
  payment_enforcement?: PaymentEnforcementMetadata;
  offer_links?: OfferLink[];
}

export interface ExecutionResult {
  success: boolean;
  profit: number;
  logs: string[];
  task_id?: string;
  agent_role?: AgentRole;
  details?: any;
  latency_ms?: number;
}

export interface TreasuryBuckets {
  reserve: number;
  operating: number;
  reinvestment: number;
  tax_buffer: number;
  owner_withdrawable: number;
  total: number;
}

export interface TreasurySplitPolicy {
  reserve_percent: number;
  operating_percent: number;
  reinvest_percent: number;
  tax_percent: number;
  owner_percent: number;
}

export interface LedgerEntry {
  id: string;
  timestamp: number;
  amount: number;
  type: 'credit' | 'debit';
  bucket: keyof Omit<TreasuryBuckets, 'total'>;
  description: string;
  agent_id?: string;
  opportunity_id?: string;
  asset_id?: string;
  tx_hash?: string;
  verified?: boolean;
}

export interface TaxReceipt {
  id: string;
  created_at: number;
  type: 'crypto_deposit' | 'paypal_withdrawal' | 'revenue_credit' | 'manual_adjustment';
  status: 'verified' | 'pending_value' | 'failed';

  tx_hash?: string;
  chain_id?: number;
  from_address?: string;
  to_address?: string;

  asset_symbol?: string;
  amount_crypto?: string;

  fiat_currency: 'NOK';
  fiat_value_nok: number | null;
  valuation_status: 'pending' | 'final';

  treasury_bucket: keyof Omit<TreasuryBuckets, 'total'>;
  ledger_entry_id?: string;

  source: string;
  notes: string;
}

export type EarningAssetStatus =
  | 'drafted'
  | 'published_local'
  | 'distributed'
  | 'awaiting_conversion'
  | 'paid'
  | 'verified'
  | 'failed';

export type MonetizationChannel =
  | 'affiliate'
  | 'crypto_payment'
  | 'hybrid'
  | 'lead_gen'
  | 'referral'
  | 'resale'
  | 'api_feed'
  | 'intelligence_report';

export interface PaymentConfig {
  chain: string;
  asset: string;
  address: string;
  note: string;
  amount_enforcement?: PaymentEnforcementMetadata;
}

export interface EarningAsset {
  id: string;
  slug?: string;

  created_at: number;
  updated_at: number;

  opportunity_id: string;
  opportunity_title: string;
  agent_role: AgentRole | string;

  title: string;
  niche: string;
  status: EarningAssetStatus;

  monetization_channel: MonetizationChannel;

  payment_config: PaymentConfig;

  price_nok: number;
  price_usd?: number;
  price_tier?: ReportPriceTier;
  price_crypto_estimate: string;

  market_value_score?: number;
  projected_market_value_usd?: number;
  buyer_type?: string;
  product_type?: string;
  pricing_reasoning?: string;

  unlock_status: 'locked' | 'unlocked';

  full_report_html: string;
  full_report_json?: any;

  paid_tx_hash?: string;
  paid_at?: number;

  offer_links: OfferLink[];

  local_url: string;
  public_url?: string;
  published_url?: string;

  metadata_url?: string;
  preview_url?: string;
  full_json_url?: string;
  verify_payment_url?: string;

  page_html: string;

  seo_title?: string;
  seo_description?: string;
  canonical_url?: string;

  estimated_revenue_nok: number;
  verified_revenue_nok: number;
  payout_status: 'none' | 'awaiting_conversion' | 'pending_verification' | 'verified';

  payment_enforcement?: PaymentEnforcementMetadata;
  payment_verification?: any;

  source: string;
  notes: string;
}

export interface AiQuotaPolicy {
  /**
   * API-capacity pacing controls.
   * These are not treasury-money limits and must not block zero-capital ingestion.
   */
  max_ai_requests_per_cycle?: number;
  max_ai_tokens_per_cycle?: number;
  min_minutes_between_ai_cycles?: number;
  max_reports_per_day?: number;
  max_sources_per_cycle?: number;
  max_signals_analyzed_per_cycle?: number;
  max_opportunities_executed_per_cycle?: number;
}

export interface GovernorPolicy extends AiQuotaPolicy {
  max_spend_per_day: number;
  max_risk_score: number;
  reserve_floor: number;
  emergency_stop: boolean;
  cooldown_period_ms: number;
  trading_enabled: boolean;
  min_profit_margin: number;

  /**
   * Verified-revenue distribution only.
   * Must total 100 when provided.
   */
  treasury_split?: TreasurySplitPolicy;

  production_mode?: 'stability' | 'balanced' | 'growth';
  autonomous_ingestion_enabled?: boolean;
  autonomous_acquisition_enabled?: boolean;
  autonomous_suggestions_enabled?: boolean;
  autonomous_patch_planner_enabled?: boolean;
  max_execution_candidates_per_cycle?: number;
  max_external_fetches_per_cycle?: number;
  allow_repo_ci_execution?: boolean;
}

export interface ReinvestmentProposal {
  id: string;
  title: string;
  description: string;
  cost: number;
  expected_benefit: string;
  confidence: number;
  risk_level: 'low' | 'medium' | 'high';
  rollback_plan: string;
  status: 'pending' | 'approved' | 'rejected' | 'implemented';
  created_at: number;
}

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  timestamp: number;
  id: string;
  toolCalls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
}

export type IngestRunStatus =
  | 'idle'
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped'
  | 'deferred';

export interface IngestRun {
  triggeredAt: number;
  completedAt?: number;
  sources: string[];
  signalsCreated: number;
  status: IngestRunStatus;
  niche?: string;
  error?: string;
  skipped_reason?: string;
  deferred_reason?: string;
  next_attempt_at?: number;
  next_attempt_at_iso?: string;
}

export type AiBackoffSource =
  | 'provider_retry_after'
  | 'provider_retry_delay'
  | 'provider_error_text'
  | 'exponential_jitter'
  | 'observed_quota_window'
  | 'none';

export type AiQuotaMode =
  | 'available'
  | 'pacing'
  | 'provider_backoff'
  | 'daily_quota_exhausted'
  | 'disabled'
  | 'unknown';

export interface AiQuotaState {
  mode: AiQuotaMode;

  rate_limited_until?: number;
  rate_limited_until_iso?: string;

  next_safe_attempt_at?: number;
  next_safe_attempt_at_iso?: string;

  backoff_source?: AiBackoffSource;

  last_status?: number;
  last_message?: string;
  last_context?: string;
  last_model?: string;
  last_request_at?: number;
  last_request_at_iso?: string;

  requests_this_window?: number;
  estimated_input_tokens_this_window?: number;
  estimated_output_tokens_this_window?: number;
  estimated_total_tokens_this_window?: number;

  window_started_at?: number;
  window_started_at_iso?: string;

  daily_quota_exhausted_until?: number;
  daily_quota_exhausted_until_iso?: string;
}

export interface ChatState {
  messages: Message[];
  sessionId: string;
  isProcessing: boolean;
  model: string;

  treasury: TreasuryBuckets;
  ledger: LedgerEntry[];
  tax_receipts: TaxReceipt[];
  earning_assets: EarningAsset[];

  policy: GovernorPolicy;
  setup_complete: boolean;
  owner_email?: string;

  proposals: ReinvestmentProposal[];
  opportunities: Opportunity[];
  agents: AgentPerformance[];
  tasks: AgentTask[];

  niche_performance: NichePerformance[];
  source_performance: SourcePerformance[];

  system_health: SystemHealth;

  daily_spend: number;
  last_spend_reset: number;
  current_niche_index: number;
  last_withdrawal_at: number;
  policy_audit_logs: string[];

  ingest_lock_until?: number;
  ingest_lock_reason?: string;
  analyzed_signal_hashes?: string[];

  agent_suggestions?: NexusAgentSuggestion[];
  suggestion_execution_ledger?: NexusExecutionLedgerEntry[];

  crypto_acquisition?: NexusCryptoAcquisitionState;
  crypto_acquisition_candidates?: NexusCryptoAcquisitionCandidate[];
  crypto_acquisition_execution_ledger?: NexusExecutionLedgerEntry[];

  patch_plan?: NexusPatchPlan;
  patch_plan_execution_ledger?: NexusExecutionLedgerEntry[];

  execution_ledger?: NexusExecutionLedgerEntry[];
  autonomous_execution?: NexusAutonomousExecutionState;
}

export interface SystemHealth {
  cpu_usage: number;
  active_agents: number;
  last_scan: number;
  status: 'healthy' | 'warning' | 'degraded' | 'down';
  last_check: number;
  issues: string[];
  last_run?: IngestRun;
  kernel_logs: string[];
  failure_count: Record<AgentRole, number>;

  ai_quota?: AiQuotaState;

  ai_quota_mode?: AiQuotaMode;
  ai_rate_limited_until?: number;
  ai_rate_limited_until_iso?: string;
  ai_rate_limit_backoff_source?: AiBackoffSource;
  ai_rate_limit_last_status?: number;
  ai_rate_limit_last_message?: string;
  ai_next_safe_attempt_at?: number;
  ai_next_safe_attempt_at_iso?: string;

  autonomous_ingestion_enabled?: boolean;
  autonomous_acquisition_enabled?: boolean;
  autonomous_suggestions_enabled?: boolean;
  autonomous_patch_planner_enabled?: boolean;
  max_execution_candidates_per_cycle?: number;
  max_external_fetches_per_cycle?: number;
  allow_repo_ci_execution?: boolean;
  next_scheduled_cycle_at?: number;
  next_scheduled_cycle_at_iso?: string;
  last_maintenance_at?: number;
  last_maintenance_at_iso?: string;

  autonomous_execution_enabled?: boolean;

  last_autonomous_execution_at?: number;
  last_autonomous_execution_at_iso?: string;
  execution_summary?: NexusExecutionSummary;
}

export interface SessionInfo {
  id: string;
  title: string;
  createdAt: number;
  lastActive: number;
}

export interface Env {
  // AI
  CF_AI_BASE_URL: string;
  CF_AI_API_KEY: string;
  CF_AI?: any;
  CF_AI_MODEL?: string;
  AI_MODEL?: string;
  GEMINI_MODEL?: string;

  // Optional AI pacing config
  AI_INITIAL_BACKOFF_MS?: string;
  AI_MAX_BACKOFF_MS?: string;
  AI_MAX_RETRY_ATTEMPTS?: string;
  AI_MAX_REQUESTS_PER_CYCLE?: string;
  AI_MAX_TOKENS_PER_CYCLE?: string;
  AI_MIN_MINUTES_BETWEEN_CYCLES?: string;

  // Autonomous scheduler
  AUTONOMOUS_INGESTION_ENABLED?: string;
  AUTONOMOUS_EXECUTOR_ENABLED?: string;
  AUTONOMOUS_ACQUISITION_ENABLED?: string;
  AUTONOMOUS_SUGGESTIONS_ENABLED?: string;
  AUTONOMOUS_PATCH_PLANNER_ENABLED?: string;
  AUTONOMOUS_MAX_EXECUTIONS_PER_CYCLE?: string;
  AUTONOMOUS_MAX_EXTERNAL_FETCHES_PER_CYCLE?: string;
  PRODUCTION_MODE?: 'stability' | 'balanced' | 'growth' | string;

  // Optional external data/API keys
  SERPAPI_KEY?: string;
  OPENROUTER_API_KEY?: string;

  // Durable Object / KV bindings
  ARB_STATE: KVNamespace;
  CHAT_AGENT: DurableObjectNamespace;
  APP_CONTROLLER: DurableObjectNamespace;

  // PayPal, retained for existing withdrawal code
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_CLIENT_SECRET?: string;
  PAYPAL_MODE?: 'sandbox' | 'live';

  // Crypto treasury verification
  CRYPTO_TREASURY_ADDRESS: string;
  CRYPTO_RPC_URL: string;
  CRYPTO_CHAIN_ID: string;
  CRYPTO_NATIVE_SYMBOL: string;
  CRYPTO_TAX_CURRENCY: string;

  CRYPTO_NATIVE_DECIMALS?: string;
  CRYPTO_MIN_CONFIRMATIONS?: string;
  CRYPTO_ALLOWED_UNDERPAYMENT_NOK?: string;

  // Crypto price oracle
  CRYPTO_PRICE_PROVIDER?: string;
  CRYPTO_NATIVE_COINGECKO_ID?: string;
  CRYPTO_COINGECKO_ID?: string;
  CRYPTO_PRICE_CACHE_SECONDS?: string;
  CRYPTO_PRICE_MAX_STALE_SECONDS?: string;
  CRYPTO_PRICE_REQUEST_TIMEOUT_MS?: string;
  CRYPTO_PRICE_ALLOW_CONFIGURED_FALLBACK?: string;
  CRYPTO_ALLOW_CONFIGURED_PRICE_FALLBACK?: string;
  CRYPTO_PRICE_FALLBACK_NOK?: string;
  COINGECKO_API_KEY?: string;
  CRYPTO_COINGECKO_API_KEY?: string;

  // Public payment display config
  PUBLIC_PAYMENT_CHAIN?: string;
  PUBLIC_PAYMENT_ASSET?: string;
  PUBLIC_PAYMENT_ADDRESS?: string;
  PUBLIC_PAYMENT_NOTE?: string;
  PUBLIC_PAYMENT_COINGECKO_ID?: string;
  PUBLIC_PAYMENT_PRICE_PROVIDER?: string;
  PUBLIC_PAYMENT_PRICE_CACHE_SECONDS?: string;
  PUBLIC_PAYMENT_PRICE_MAX_STALE_SECONDS?: string;
  PUBLIC_PAYMENT_ALLOW_CONFIGURED_PRICE_FALLBACK?: string;
  PUBLIC_PAYMENT_NATIVE_PRICE_NOK?: string;

  // Affiliate/referral offers
  AFFILIATE_OFFERS_JSON?: string;
  AFFILIATE_AI_DEVTOOLS_URL?: string;
  AFFILIATE_AI_DEVTOOLS_LABEL?: string;
  AFFILIATE_CYBERSECURITY_URL?: string;
  AFFILIATE_CYBERSECURITY_LABEL?: string;
  AFFILIATE_SAAS_URL?: string;
  AFFILIATE_SAAS_LABEL?: string;
  AFFILIATE_CLOUD_INFRA_URL?: string;
  AFFILIATE_CLOUD_INFRA_LABEL?: string;
  AFFILIATE_COMPLIANCE_URL?: string;
  AFFILIATE_COMPLIANCE_LABEL?: string;

  PUBLIC_AFFILIATE_AI_DEVTOOLS_URL?: string;
  PUBLIC_AFFILIATE_CYBERSECURITY_URL?: string;
  PUBLIC_AFFILIATE_SAAS_URL?: string;
  PUBLIC_AFFILIATE_CLOUD_INFRA_URL?: string;
  PUBLIC_AFFILIATE_COMPLIANCE_URL?: string;

  // Owner/admin protection
  ADMIN_EMAIL?: string;
  ADMIN_API_TOKEN?: string;
  ALLOW_LOCAL_ADMIN_BYPASS?: string;

  // Optional real self-improvement execution rail.
  // Without these, source-code patch/deploy actions must remain external_blocked.
  NEXUS_REPO_PATCH_CI_URL?: string;
  NEXUS_REPO_PATCH_CI_TOKEN?: string;
  NEXUS_REPO_PATCH_CI_BRANCH?: string;
  NEXUS_EXECUTOR_USER_AGENT?: string;

  // Public site/base URL
  PUBLIC_BASE_URL?: string;
  SITE_URL?: string;
}

// RESTORED TYPES FOR TOOL RESULTS
export interface WeatherResult {
  location: string;
  temperature: number;
  condition: string;
  humidity: number;
}

export interface MCPResult {
  content: string;
}

export interface ErrorResult {
  error: string;
}

// -----------------------------------------------------------------------------
// NEXUS_PUBLIC_MARKET_OVERHAUL_TYPES_V2
// Shared types for public-market rendering, FX conversion, dynamic pricing,
// payment requests, crypto acquisition execution, agent suggestions,
// patch planning, and verified-only accounting.
// -----------------------------------------------------------------------------

export type NexusCurrencyCode = 'NOK' | 'USD';

export type NexusMoneyAmount = {
  amount: number;
  currency: NexusCurrencyCode;
  formatted: string;
  rate_source?: string;
  converted_at?: number;
  converted_at_iso?: string;
};

export type NexusFxRate = {
  base: NexusCurrencyCode;
  quote: NexusCurrencyCode;
  rate: number;
  source: 'env' | 'fallback' | 'live';
  fetched_at: number;
  fetched_at_iso: string;
};

export type NexusFxSnapshot = {
  nok_per_usd: NexusFxRate;
  usd_per_nok: NexusFxRate;
};

export type NexusPricingAudience =
  | 'human_operator'
  | 'ai_agent'
  | 'crawler'
  | 'enterprise_security'
  | 'developer_team'
  | 'legal_compliance'
  | 'finops'
  | 'general_researcher';

export type NexusPricingSignal = {
  title: string;
  summary?: string;
  niche?: string;
  evidence?: string;
  buyer_type?: string;
  product_type?: string;
  confidence_score?: number;
  novelty_score?: number;
  urgency_score?: number;
  monetization_score?: number;
  risk_score?: number;
  market_value_score?: number;
  projected_market_value_usd?: number;
  recommended_price_nok?: number;
  recommended_price_usd?: number;
  pricing_reasoning?: string;
};

export type NexusDynamicPrice = {
  price_nok: number;
  price_usd: number;
  price_display_nok: string;
  price_display_usd: string;
  price_tier:
    | 'micro'
    | 'low'
    | 'standard'
    | 'premium'
    | 'high_value'
    | 'urgent'
    | 'enterprise';
  market_value_score: number;
  projected_market_value_nok: number;
  projected_market_value_usd: number;
  projected_value_display_nok: string;
  projected_value_display_usd: string;
  buyer_friction_score: number;
  crawler_purchase_score: number;
  pricing_reasoning: string;
  fx: NexusFxSnapshot;
  generated_at: number;
  generated_at_iso: string;
};

export type NexusPaymentMethod =
  | 'crypto_native'
  | 'payment_link'
  | 'manual_invoice'
  | 'affiliate'
  | 'external_checkout';

export type NexusPaymentRequest = {
  id: string;
  asset_id: string;
  slug: string;
  title: string;
  price: NexusMoneyAmount;
  price_usd: NexusMoneyAmount;
  method: NexusPaymentMethod;
  chain?: string;
  asset?: string;
  address?: string;
  required_amount_crypto?: string;
  required_amount_wei?: string;
  payment_uri?: string;
  checkout_url?: string;
  verify_url: string;
  success_url: string;
  expires_at?: number;
  expires_at_iso?: string;
  machine_readable: boolean;
  human_readable_instructions: string;
  accounting_policy?: NexusAccountingPolicy;
};

export type NexusPublicReportCard = {
  asset_id: string;
  slug: string;
  title: string;
  niche: string;
  preview: string;
  created_at: number;
  updated_at: number;
  freshness_iso: string;
  price_nok: number;
  price_usd: number;
  price_display_nok: string;
  price_display_usd: string;
  projected_market_value_nok?: number;
  projected_market_value_usd?: number;
  projected_value_display_nok?: string;
  projected_value_display_usd?: string;
  buyer_type?: string;
  product_type?: string;
  payment_available: boolean;
  unlock_status: 'locked' | 'unlocked';
  urls: {
    page: string;
    metadata_json: string;
    preview_json: string;
    full_json: string;
    verify_payment: string;
  };
};

export type NexusExpectedValueLabel = 'expected_value_only_not_verified_revenue';
export type NexusProjectedValueLabel = 'projected_market_value_only_not_verified_revenue';
export type NexusTreasuryCreditPolicy = 'verified_receipt_only';

export type NexusAccountingPolicy = {
  projected_values_are_not_revenue: true;
  expected_values_are_not_revenue: true;
  verified_revenue_only: true;
  suggestions_do_not_mutate_treasury?: true;
  executor_does_not_credit_expected_value?: true;
  projected_value_label: NexusProjectedValueLabel;
  expected_value_label: NexusExpectedValueLabel;
  treasury_credit: NexusTreasuryCreditPolicy;
};

export type NexusExecutionClassification =
  | 'auto_executable'
  | 'external_blocked'
  | 'manual_review'
  | 'unsupported'
  | 'runtime_check';

export type NexusExecutionStatus =
  | 'discovered'
  | 'queued'
  | 'classified'
  | 'approved'
  | 'rejected'
  | 'executing'
  | 'executed'
  | 'implemented'
  | 'failed'
  | 'skipped'
  | 'external_blocked'
  | 'verified_revenue';

export type NexusExecutionKind =
  | 'crypto_acquisition_candidate'
  | 'agent_suggestion'
  | 'patch_plan_item'
  | 'public_distribution'
  | 'seo_distribution'
  | 'conversion_integrity_check'
  | 'payment_verification'
  | 'internal_runtime_check'
  | 'repo_ci_patch'
  | 'scheduler_cycle';

export type NexusExecutionBlocker =
  | 'account_required'
  | 'captcha_required'
  | 'kyc_required'
  | 'wallet_signature_required'
  | 'manual_identity_step_required'
  | 'external_approval_required'
  | 'paid_api_required'
  | 'credentials_required'
  | 'repo_ci_credentials_missing'
  | 'source_code_write_not_available_in_worker_runtime'
  | 'external_reward_flow_requires_account_or_manual_review'
  | 'network_error'
  | 'policy_blocked'
  | 'unsupported_runtime_action'
  | 'detected_external_human_or_account_step';

export type NexusExecutionLedgerEntry = {
  id: string;
  kind: NexusExecutionKind;

  candidate_id?: string;
  candidate_title?: string;

  suggestion_id?: string;
  suggestion_title?: string;

  patch_plan_order?: number;
  patch_plan_file_path?: string;

  title?: string;
  method?: string;
  trigger: 'manual' | 'scheduled' | 'suggestion_approval' | 'patch_plan' | 'autonomous_tick' | string;

  classification: NexusExecutionClassification;
  classification_reason?: string;
  blockers: NexusExecutionBlocker[];
  blocker_reason?: string;

  status: NexusExecutionStatus;

  expected_value_nok?: number;
  expected_value_usd?: number;
  expected_value_label: NexusExpectedValueLabel;
  projected_value_label?: NexusProjectedValueLabel;
  treasury_credit: NexusTreasuryCreditPolicy;

  verified_revenue_nok?: number;
  verified_receipt_id?: string;
  verified_tx_hash?: string;

  created_at: number;
  created_at_iso: string;
  started_at?: number;
  started_at_iso?: string;
  completed_at?: number;
  completed_at_iso?: string;

  latency_ms?: number;
  logs: string[];
  result?: any;
  error?: string;
};

export type NexusExecutionSummary = {
  candidates?: number;
  suggestions?: number;
  patch_plan_items?: number;
  auto_executable: number;
  external_blocked: number;
  executed: number;
  failed: number;
  verified_revenue: number;
  expected_value_nok?: number;
  expected_value_label: NexusExpectedValueLabel;
  treasury_credit: NexusTreasuryCreditPolicy;
};

export type NexusCryptoAcquisitionMethod =
  | 'learn_to_earn'
  | 'testnet_reward'
  | 'bug_bounty'
  | 'airdrop_research'
  | 'faucet'
  | 'quest'
  | 'grant'
  | 'open_source_reward'
  | 'content_bounty'
  | 'compute_mining_estimate'
  | 'public_distribution'
  | 'seo_distribution'
  | 'conversion_integrity_check'
  | 'public_feed_check'
  | 'payment_boundary_check'
  | 'crawler_distribution'
  | 'report_distribution'
  | 'internal_runtime_check'
  | 'manual_external_reward'
  | (string & {});

export type NexusCryptoAcquisitionCandidateStatus =
  | 'candidate'
  | 'approved'
  | 'rejected'
  | 'completed'
  | 'expired'
  | 'discovered'
  | 'auto_executable'
  | 'external_blocked'
  | 'executing'
  | 'executed'
  | 'failed'
  | 'verified_revenue';

export type NexusCryptoAcquisitionCandidate = {
  id: string;
  method: NexusCryptoAcquisitionMethod;
  title: string;
  url?: string;
  network?: string;
  asset?: string;

  expected_value_nok: number;
  expected_value_usd: number;
  expected_value_label?: NexusExpectedValueLabel;

  time_cost_minutes: number;
  cash_cost_nok: number;

  risk_score: number;
  friction_score: number;
  priority?: number;
  enabled?: boolean;

  eligibility_notes: string;
  action_plan: string[];

  classification?: NexusExecutionClassification;
  classification_reason?: string;
  blockers?: NexusExecutionBlocker[];
  blocker_reason?: string;

  execution_status?: NexusExecutionStatus;
  execution_attempts?: number;
  last_execution_id?: string;
  last_execution_at?: number;
  last_execution_at_iso?: string;
  last_execution_logs?: string[];

  verified_revenue_nok?: number;
  verified_receipt_id?: string;
  verified_tx_hash?: string;

  status: NexusCryptoAcquisitionCandidateStatus;
  created_at: number;
  updated_at: number;
};

export type NexusCryptoAcquisitionRunSummary = {
  enabled: boolean;
  trigger: string;
  generated_at: number;
  generated_at_iso: string;
  candidates: number;
  auto_executable: number;
  external_blocked: number;
  executed: number;
  failed: number;
  blocked: number;
  expected_value_nok: number;
  expected_value_label: NexusExpectedValueLabel;
  verified_revenue_nok: number;
  treasury_credit: NexusTreasuryCreditPolicy;
};

export type NexusCryptoAcquisitionState = {
  enabled: boolean;
  candidates: NexusCryptoAcquisitionCandidate[];
  execution_ledger: NexusExecutionLedgerEntry[];
  last_run?: NexusCryptoAcquisitionRunSummary;
  summary: {
    candidates: number;
    auto_executable: number;
    external_blocked: number;
    executed: number;
    verified_revenue: number;
    expected_value_label: NexusExpectedValueLabel;
    treasury_credit: NexusTreasuryCreditPolicy;
  };
};

export type NexusAgentSuggestionCategory =
  | 'revenue'
  | 'seo'
  | 'pricing'
  | 'payment'
  | 'crypto_acquisition'
  | 'product'
  | 'risk'
  | 'infrastructure'
  | 'ui'
  | 'patch_plan'
  | 'execution'
  | (string & {});

export type NexusAgentSuggestionStatus =
  | 'suggested'
  | 'approved'
  | 'rejected'
  | 'implemented'
  | 'queued'
  | 'executing'
  | 'executed'
  | 'failed'
  | 'external_blocked';

export type NexusAgentSuggestion = {
  id: string;
  title: string;
  category: NexusAgentSuggestionCategory;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  why: string;
  expected_impact: string;
  implementation_summary: string;
  files_to_change: string[];
  estimated_complexity: 'small' | 'medium' | 'large';
  requires_owner_confirmation: boolean;

  classification?: NexusExecutionClassification;
  classification_reason?: string;
  blockers?: NexusExecutionBlocker[];
  blocker_reason?: string;

  execution_status?: NexusExecutionStatus;
  execution_id?: string;
  execution_logs?: string[];
  executed_at?: number;
  executed_at_iso?: string;

  status: NexusAgentSuggestionStatus;
  created_at: number;
  updated_at: number;
};

export type NexusPatchPlanItemStatus =
  | 'pending'
  | 'in_progress'
  | 'done'
  | 'blocked'
  | 'executing'
  | 'executed'
  | 'failed'
  | 'external_blocked';

export type NexusPatchPlanItem = {
  order: number;
  file_path: string;
  action: 'create' | 'patch' | 'rewrite' | 'regenerate' | 'verify' | 'execute';
  purpose: string;
  depends_on?: string[];
  status: NexusPatchPlanItemStatus;

  classification?: NexusExecutionClassification;
  classification_reason?: string;
  blockers?: NexusExecutionBlocker[];
  blocker_reason?: string;

  execution_id?: string;
  execution_logs?: string[];
  started_at?: number;
  started_at_iso?: string;
  completed_at?: number;
  completed_at_iso?: string;
};

export type NexusPatchPlanStatusSummary = {
  done: number;
  in_progress: number;
  pending: number;
  blocked: number;
  executed?: number;
  failed?: number;
  external_blocked?: number;
};

export type NexusPatchPlan = {
  id: string;
  title: string;
  items: NexusPatchPlanItem[];
  execution_ledger?: NexusExecutionLedgerEntry[];
  current_item?: NexusPatchPlanItem | null;
  status_summary?: NexusPatchPlanStatusSummary;
  created_at: number;
  updated_at: number;
};

export type NexusAutonomousExecutionState = {
  enabled: boolean;
  acquisition_enabled: boolean;
  suggestions_enabled: boolean;
  patch_planner_enabled: boolean;

  last_run_at?: number;
  last_run_at_iso?: string;
  next_run_at?: number;
  next_run_at_iso?: string;

  max_execution_candidates_per_cycle: number;
  max_external_fetches_per_cycle: number;

  summary?: NexusExecutionSummary;
  ledger?: NexusExecutionLedgerEntry[];
};


