import type {
  EarningAsset,
  NexusAgentSuggestion,
  NexusCryptoAcquisitionCandidate,
  Opportunity
} from './types';

import type { MarketStats } from './market-stats';
import type { CryptoAcquisitionAgentRun } from './crypto-acquisition-agent';

export type AgentSuggestionInput = {
  assets?: EarningAsset[];
  opportunities?: Opportunity[];
  market_stats?: MarketStats | null;
  crypto_acquisition_run?: CryptoAcquisitionAgentRun | null;
  existing_suggestions?: NexusAgentSuggestion[];
  now?: number;
};

type SuggestionExecutionClassification = 'auto_executable' | 'external_blocked';

type SuggestionExecutionStatus =
  | 'suggested'
  | 'queued'
  | 'approved'
  | 'executing'
  | 'executed'
  | 'external_blocked'
  | 'failed'
  | 'implemented'
  | 'rejected';

type SuggestionExecutionMetadata = {
  execution_classification: SuggestionExecutionClassification;
  execution_status: SuggestionExecutionStatus;
  execution_kind:
    | 'autonomous_ingestion'
    | 'internal_distribution_check'
    | 'internal_payment_boundary_check'
    | 'internal_runtime_check'
    | 'runtime_state_update'
    | 'external_code_change'
    | 'external_env_configuration'
    | 'external_reward_flow';
  executor_route?: string;
  approval_behavior:
    | 'enqueue_and_execute_when_route_exists'
    | 'record_external_blocker_without_fake_execution';
  execution_blockers: string[];
  execution_truth: string;
  should_auto_execute_on_approval: boolean;
};

export type AgentSuggestionSummary = {
  success: true;
  kind: 'nexus_agent_suggestions';
  generated_at: number;
  generated_at_iso: string;
  accounting_policy: {
    projected_values_are_not_revenue: true;
    expected_values_are_not_revenue: true;
    verified_revenue_only: true;
    suggestions_do_not_mutate_treasury: true;
    projected_value_label: 'projected_market_value_only_not_verified_revenue';
    expected_value_label: 'expected_value_only_not_verified_revenue';
  };
  execution_policy: {
    approved_suggestions_must_not_disappear: true;
    approval_creates_or_updates_execution_ledger: true;
    auto_execute_only_when_no_external_blocker: true;
    blocked_items_remain_visible: true;
    no_fake_execution: true;
    repeated_suggestions_are_deduplicated: true;
    implemented_items_are_preserved: true;
  };
  count: number;
  execution_counts: {
    auto_executable: number;
    external_blocked: number;
    approved: number;
    executed: number;
    failed: number;
    implemented: number;
    rejected: number;
  };
  suggestions: NexusAgentSuggestion[];
};

const MAX_SUGGESTIONS = 150;

const LOCKED_SOURCE_CODE_FILES = new Set([
  'worker/public-market-renderer.ts',
  'worker/public-sanitizer.ts',
  'worker/public-feed-renderer.ts',
  'worker/seo.ts',
  'worker/report-builder.ts',
  'worker/market-stats.ts',
  'worker/performance-scoring.ts',
  'worker/acquisition-sources.ts',
  'worker/crypto-acquisition-agent.ts',
  'worker/monetization-logic.ts',
  'worker/agent-suggestions.ts'
]);

function cleanText(value: unknown): string {
  return String(value ?? '')
    .replace(/\uFFFD/g, '')
    .replace(/�/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp01(value: unknown): number {
  return Math.max(0, Math.min(1, safeNumber(value, 0)));
}

function slugify(value: unknown, fallback = 'suggestion'): string {
  const slug = cleanText(value || fallback)
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || fallback;
}

function stableHash(value: unknown): string {
  const text = JSON.stringify(value ?? '');
  let hash = 2166136261;

  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }

  return Math.abs(hash >>> 0).toString(36);
}

function suggestionId(seed: string): string {
  return `suggest-${slugify(seed)}-${stableHash(seed)}`.slice(0, 180);
}

function textIncludesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function canonicalSuggestionKey(suggestion: NexusAgentSuggestion): string {
  const files = asArray<string>(suggestion.files_to_change)
    .map(cleanText)
    .filter(Boolean)
    .sort()
    .join(',');

  return [
    cleanText(suggestion.category).toLowerCase(),
    slugify(suggestion.title),
    files
  ].join('|');
}

function getSuggestionText(input: {
  title: string;
  category: NexusAgentSuggestion['category'];
  implementation_summary: string;
  files_to_change: string[];
}): string {
  return [
    input.title,
    input.category,
    input.implementation_summary,
    input.files_to_change.join(' ')
  ]
    .join(' ')
    .toLowerCase();
}

function hasSourceCodeFiles(files: string[]): boolean {
  return files.some((file) => {
    const normalized = cleanText(file).toLowerCase();

    return (
      normalized.startsWith('src/') ||
      normalized.startsWith('worker/') ||
      normalized.startsWith('scripts/') ||
      normalized === 'package.json' ||
      normalized === 'wrangler.jsonc'
    );
  });
}

function classifySuggestionForExecution(input: {
  title: string;
  category: NexusAgentSuggestion['category'];
  implementation_summary: string;
  files_to_change: string[];
}): SuggestionExecutionMetadata {
  const text = getSuggestionText(input);
  const files = input.files_to_change.map((file) => cleanText(file).toLowerCase());
  const touchesSourceCode = hasSourceCodeFiles(files);

  if (
    textIncludesAny(text, [
      'public crypto payment address',
      'public_payment_address',
      'crypto_treasury_address',
      'paypal',
      'stripe',
      'api key',
      'secret',
      'credential',
      'wrangler secret',
      'env var',
      'environment variable'
    ])
  ) {
    return {
      execution_classification: 'external_blocked',
      execution_status: 'external_blocked',
      execution_kind: 'external_env_configuration',
      approval_behavior: 'record_external_blocker_without_fake_execution',
      execution_blockers: ['owner_configuration_or_secret_required'],
      execution_truth:
        'This cannot be autonomously completed by the deployed Worker because it requires owner configuration, credentials, secrets, payout accounts, or environment changes.',
      should_auto_execute_on_approval: false
    };
  }

  if (
    input.category === 'revenue' &&
    textIncludesAny(text, [
      'trigger autonomous ingestion',
      'ingestion cycle',
      'create first public report',
      'generate locked report assets'
    ])
  ) {
    return {
      execution_classification: 'auto_executable',
      execution_status: 'queued',
      execution_kind: 'autonomous_ingestion',
      executor_route: '/api/system/ingest',
      approval_behavior: 'enqueue_and_execute_when_route_exists',
      execution_blockers: [],
      execution_truth:
        'This can be executed by the runtime by triggering the autonomous ingestion cycle. It creates inventory only; it cannot invent buyers or verified revenue.',
      should_auto_execute_on_approval: true
    };
  }

  if (
    input.category === 'seo' &&
    textIncludesAny(text, [
      'sitemap',
      'feed',
      'robots',
      'reports.json',
      'signals.json',
      'opportunities.json',
      'public distribution',
      'discovery'
    ])
  ) {
    return {
      execution_classification: 'auto_executable',
      execution_status: 'queued',
      execution_kind: 'internal_distribution_check',
      executor_route: '/api/system/suggestions/action',
      approval_behavior: 'enqueue_and_execute_when_route_exists',
      execution_blockers: [],
      execution_truth:
        'This can be executed as a live distribution and discovery verification bundle without credentials, wallet signatures, captcha, KYC, or cash cost.',
      should_auto_execute_on_approval: true
    };
  }

  if (
    input.category === 'product' &&
    textIncludesAny(text, [
      'locked report',
      'conversion path',
      'payment boundary',
      'verify-payment',
      'full.json',
      'payment request'
    ])
  ) {
    return {
      execution_classification: 'auto_executable',
      execution_status: 'queued',
      execution_kind: 'internal_payment_boundary_check',
      executor_route: '/api/system/suggestions/action',
      approval_behavior: 'enqueue_and_execute_when_route_exists',
      execution_blockers: [],
      execution_truth:
        'This can be executed as a live payment-boundary and locked-report verification check. It cannot invent payment, buyers, or revenue.',
      should_auto_execute_on_approval: true
    };
  }

  if (
    input.category === 'risk' &&
    textIncludesAny(text, [
      'projected-value',
      'projected value',
      'verified-revenue',
      'verified revenue',
      'expected value',
      'wording',
      'audit dashboards'
    ])
  ) {
    return {
      execution_classification: 'auto_executable',
      execution_status: 'queued',
      execution_kind: 'internal_runtime_check',
      executor_route: '/api/system/suggestions/action',
      approval_behavior: 'enqueue_and_execute_when_route_exists',
      execution_blockers: [],
      execution_truth:
        'This can be recorded and checked against runtime accounting labels. It must not mutate treasury or ledger revenue.',
      should_auto_execute_on_approval: true
    };
  }

  if (
    input.category === 'crypto_acquisition' &&
    textIncludesAny(text, [
      'internal runtime check',
      'public distribution',
      'seo distribution',
      'conversion integrity check',
      'payment boundary check',
      'crawler discovery check'
    ])
  ) {
    return {
      execution_classification: 'auto_executable',
      execution_status: 'queued',
      execution_kind: 'internal_runtime_check',
      executor_route: '/api/system/agent/crypto-acquisition/run',
      approval_behavior: 'enqueue_and_execute_when_route_exists',
      execution_blockers: [],
      execution_truth:
        'This is a Worker-executable internal check. It can produce logs and state, but it cannot credit treasury without verified external receipt.',
      should_auto_execute_on_approval: true
    };
  }

  if (touchesSourceCode) {
    return {
      execution_classification: 'external_blocked',
      execution_status: 'external_blocked',
      execution_kind: 'external_code_change',
      approval_behavior: 'record_external_blocker_without_fake_execution',
      execution_blockers: ['repository_write_build_deploy_step_required'],
      execution_truth:
        'The deployed Worker cannot safely rewrite, commit, build, and redeploy its own source without a configured repository/CI execution rail.',
      should_auto_execute_on_approval: false
    };
  }

  return {
    execution_classification: 'auto_executable',
    execution_status: 'queued',
    execution_kind: 'internal_runtime_check',
    executor_route: '/api/system/suggestions/action',
    approval_behavior: 'enqueue_and_execute_when_route_exists',
    execution_blockers: [],
    execution_truth:
      'This is eligible for runtime execution because no external account, captcha, wallet signature, KYC, paid API, credentials, or repository deployment step was detected.',
    should_auto_execute_on_approval: true
  };
}

function normalizeSuggestionStatus(
  suggestion: NexusAgentSuggestion,
  fallback: SuggestionExecutionStatus
): SuggestionExecutionStatus {
  const existing = cleanText((suggestion as any).execution_status) as SuggestionExecutionStatus;

  if (existing) return existing;
  if (suggestion.status === 'approved') return 'approved';
  if (suggestion.status === 'implemented') return 'implemented';
  if (suggestion.status === 'rejected') return 'rejected';

  return fallback;
}

function preserveExecutionFields(
  preferred: NexusAgentSuggestion,
  previous?: NexusAgentSuggestion
): NexusAgentSuggestion {
  if (!previous) return preferred;

  const terminalPrevious =
    previous.status === 'implemented' ||
    previous.status === 'rejected' ||
    cleanText((previous as any).execution_status) === 'executed' ||
    cleanText((previous as any).execution_status) === 'failed' ||
    cleanText((previous as any).execution_status) === 'external_blocked';

  if (!terminalPrevious && previous.status === 'suggested') {
    return {
      ...previous,
      ...preferred,
      created_at: Math.min(previous.created_at || preferred.created_at, preferred.created_at || previous.created_at),
      updated_at: Math.max(previous.updated_at || 0, preferred.updated_at || 0)
    } as NexusAgentSuggestion;
  }

  return {
    ...preferred,
    ...previous,
    created_at: Math.min(previous.created_at || preferred.created_at, preferred.created_at || previous.created_at),
    updated_at: Math.max(previous.updated_at || 0, preferred.updated_at || 0),
    execution_classification:
      (previous as any).execution_classification || (preferred as any).execution_classification,
    execution_status:
      (previous as any).execution_status || (preferred as any).execution_status,
    execution_kind:
      (previous as any).execution_kind || (preferred as any).execution_kind,
    executor_route:
      (previous as any).executor_route || (preferred as any).executor_route,
    approval_behavior:
      (previous as any).approval_behavior || (preferred as any).approval_behavior,
    execution_blockers:
      asArray((previous as any).execution_blockers).length > 0
        ? (previous as any).execution_blockers
        : (preferred as any).execution_blockers,
    execution_truth:
      (previous as any).execution_truth || (preferred as any).execution_truth,
    should_auto_execute_on_approval:
      (previous as any).should_auto_execute_on_approval ??
      (preferred as any).should_auto_execute_on_approval,
    execution_ledger_id:
      (previous as any).execution_ledger_id || (preferred as any).execution_ledger_id,
    last_execution_at:
      (previous as any).last_execution_at || (preferred as any).last_execution_at,
    last_execution_result:
      (previous as any).last_execution_result || (preferred as any).last_execution_result,
    approval_result:
      (previous as any).approval_result || (preferred as any).approval_result,
    approved_at:
      (previous as any).approved_at || (preferred as any).approved_at,
    implementation_marked_at:
      (previous as any).implementation_marked_at || (preferred as any).implementation_marked_at,
    implementation_note:
      (previous as any).implementation_note || (preferred as any).implementation_note
  } as NexusAgentSuggestion;
}

function withExecutionMetadata(
  suggestion: NexusAgentSuggestion,
  metadata: SuggestionExecutionMetadata
): NexusAgentSuggestion {
  const status = normalizeSuggestionStatus(suggestion, metadata.execution_status);

  return {
    ...suggestion,
    execution_classification: metadata.execution_classification,
    execution_status: status,
    execution_kind: metadata.execution_kind,
    executor_route: metadata.executor_route,
    approval_behavior: metadata.approval_behavior,
    execution_blockers: metadata.execution_blockers,
    execution_truth: metadata.execution_truth,
    should_auto_execute_on_approval: metadata.should_auto_execute_on_approval,
    expected_value_label: 'expected_value_only_not_verified_revenue',
    projected_value_label: 'projected_market_value_only_not_verified_revenue',
    treasury_credit: 'verified_receipt_only',
    verified_revenue_nok: safeNumber((suggestion as any).verified_revenue_nok, 0)
  } as NexusAgentSuggestion;
}

function makeSuggestion(input: {
  title: string;
  category: NexusAgentSuggestion['category'];
  priority: NexusAgentSuggestion['priority'];
  why: string;
  expected_impact: string;
  implementation_summary: string;
  files_to_change: string[];
  estimated_complexity?: NexusAgentSuggestion['estimated_complexity'];
  requires_owner_confirmation?: boolean;
  now: number;
  stable_seed?: string;
}): NexusAgentSuggestion {
  const files = input.files_to_change.map(cleanText).filter(Boolean);
  const seed = input.stable_seed || `${input.category}:${input.title}:${files.sort().join(',')}`;

  const base: NexusAgentSuggestion = {
    id: suggestionId(seed),
    title: cleanText(input.title),
    category: input.category,
    priority: input.priority,
    why: cleanText(input.why),
    expected_impact: cleanText(input.expected_impact),
    implementation_summary: cleanText(input.implementation_summary),
    files_to_change: files,
    estimated_complexity: input.estimated_complexity || 'small',
    requires_owner_confirmation: input.requires_owner_confirmation ?? false,
    status: 'suggested',
    created_at: input.now,
    updated_at: input.now
  };

  return withExecutionMetadata(
    base,
    classifySuggestionForExecution({
      title: base.title,
      category: base.category,
      implementation_summary: base.implementation_summary,
      files_to_change: base.files_to_change
    })
  );
}

function priorityWeight(priority: NexusAgentSuggestion['priority']): number {
  if (priority === 'urgent') return 4;
  if (priority === 'high') return 3;
  if (priority === 'medium') return 2;
  return 1;
}

function categoryWeight(category: NexusAgentSuggestion['category']): number {
  if (category === 'payment') return 10;
  if (category === 'revenue') return 9;
  if (category === 'seo') return 8;
  if (category === 'pricing') return 7;
  if (category === 'crypto_acquisition') return 6;
  if (category === 'product') return 5;
  if (category === 'risk') return 4;
  if (category === 'infrastructure') return 3;
  if (category === 'ui') return 2;
  return 1;
}

function statusWeight(suggestion: NexusAgentSuggestion): number {
  const executionStatus = cleanText((suggestion as any).execution_status);

  if (executionStatus === 'executing') return 9;
  if (suggestion.status === 'approved' || executionStatus === 'approved') return 8;
  if (executionStatus === 'queued') return 7;
  if (executionStatus === 'failed') return 6;
  if (executionStatus === 'external_blocked') return 5;
  if (suggestion.status === 'suggested') return 4;
  if (suggestion.status === 'implemented' || executionStatus === 'executed') return 3;
  if (suggestion.status === 'rejected') return 1;

  return 0;
}

function rankSuggestions(suggestions: NexusAgentSuggestion[]): NexusAgentSuggestion[] {
  return [...suggestions].sort((a, b) => {
    const statusDelta = statusWeight(b) - statusWeight(a);
    if (statusDelta !== 0) return statusDelta;

    const priorityDelta = priorityWeight(b.priority) - priorityWeight(a.priority);
    if (priorityDelta !== 0) return priorityDelta;

    const categoryDelta = categoryWeight(b.category) - categoryWeight(a.category);
    if (categoryDelta !== 0) return categoryDelta;

    return safeNumber(b.updated_at || b.created_at, 0) - safeNumber(a.updated_at || a.created_at, 0);
  });
}

function refreshExecutionMetadata(suggestion: NexusAgentSuggestion): NexusAgentSuggestion {
  const metadata = classifySuggestionForExecution({
    title: suggestion.title,
    category: suggestion.category,
    implementation_summary: suggestion.implementation_summary,
    files_to_change: asArray<string>(suggestion.files_to_change)
  });

  return withExecutionMetadata(suggestion, metadata);
}

function shouldSuppressRepeatedIncomingSuggestion(
  suggestion: NexusAgentSuggestion,
  existingByCanonicalKey: Map<string, NexusAgentSuggestion>
): boolean {
  const key = canonicalSuggestionKey(suggestion);
  const previous = existingByCanonicalKey.get(key);

  if (!previous) return false;

  const previousExecutionStatus = cleanText((previous as any).execution_status);

  return (
    previous.status === 'implemented' ||
    previous.status === 'rejected' ||
    previousExecutionStatus === 'executed' ||
    previousExecutionStatus === 'failed'
  );
}

function mergeSuggestions(input: {
  existing?: NexusAgentSuggestion[];
  incoming?: NexusAgentSuggestion[];
}): NexusAgentSuggestion[] {
  const byId = new Map<string, NexusAgentSuggestion>();
  const existingByCanonicalKey = new Map<string, NexusAgentSuggestion>();

  for (const suggestion of input.existing || []) {
    const enriched = refreshExecutionMetadata(suggestion);
    byId.set(enriched.id, enriched);
    existingByCanonicalKey.set(canonicalSuggestionKey(enriched), enriched);
  }

  for (const suggestion of input.incoming || []) {
    const enriched = refreshExecutionMetadata(suggestion);

    if (shouldSuppressRepeatedIncomingSuggestion(enriched, existingByCanonicalKey)) {
      continue;
    }

    const previousById = byId.get(enriched.id);
    const previousByCanonical = existingByCanonicalKey.get(canonicalSuggestionKey(enriched));
    const previous = previousById || previousByCanonical;

    const merged = preserveExecutionFields(enriched, previous);

    byId.set(merged.id, merged);
    existingByCanonicalKey.set(canonicalSuggestionKey(merged), merged);
  }

  return rankSuggestions([...byId.values()]).slice(0, MAX_SUGGESTIONS);
}

function assetHasPaymentAddress(asset: EarningAsset): boolean {
  return Boolean(
    cleanText(asset.payment_config?.address) ||
    cleanText((asset as any).payment?.address) ||
    cleanText((asset as any).payment_request?.address)
  );
}

function assetProjectedValueUsd(asset: EarningAsset): number {
  const value = Number(
    (asset as any).projected_market_value_usd ??
      (asset as any).full_report_json?.projected_market_value_usd ??
      (asset as any).full_report_json?.pricing?.projected_market_value_usd ??
      (asset as any).full_report_json?.opportunity_score_breakdown?.projected_market_value_usd ??
      0
  );

  return Number.isFinite(value) && value > 0 ? value : 0;
}

function assetMarketValueScore(asset: EarningAsset): number {
  return clamp01(
    (asset as any).market_value_score ??
      (asset as any).full_report_json?.market_value_score ??
      (asset as any).full_report_json?.pricing?.market_value_score ??
      (asset as any).full_report_json?.opportunity_score_breakdown?.market_value_score ??
      0
  );
}

function assetIsUnlocked(asset: EarningAsset): boolean {
  return asset.unlock_status === 'unlocked' || asset.status === 'paid' || asset.status === 'verified';
}

function assetHasVerifiedRevenue(asset: EarningAsset): boolean {
  return (
    safeNumber(asset.verified_revenue_nok, 0) > 0 ||
    asset.payout_status === 'verified' ||
    asset.status === 'verified' ||
    (asset as any).payment_verification?.success === true
  );
}

function buildNoReportsSuggestion(now: number): NexusAgentSuggestion {
  return makeSuggestion({
    now,
    stable_seed: 'revenue:create-first-public-report-inventory',
    title: 'Trigger autonomous ingestion to create first public report inventory',
    category: 'revenue',
    priority: 'urgent',
    why:
      'No earning assets exist yet, so the public market has no inventory for crawlers, autonomous buyers, or human buyers.',
    expected_impact:
      'Creates locked public report inventory that can be indexed, previewed, priced, and unlocked only after verified payment.',
    implementation_summary:
      'Run the autonomous ingestion cycle and generate locked report assets from detected opportunities. Keep projected values separate from ledger revenue.',
    files_to_change: [
      'worker/agent.ts',
      'worker/acquisition-sources.ts',
      'worker/public-market-renderer.ts'
    ],
    estimated_complexity: 'medium'
  });
}

function buildPaymentConfigSuggestion(now: number): NexusAgentSuggestion {
  return makeSuggestion({
    now,
    stable_seed: 'payment:configure-public-report-unlock-address',
    title: 'Configure public crypto payment address for report unlocks',
    category: 'payment',
    priority: 'urgent',
    why:
      'At least one public report lacks a usable payment address. Buyers cannot unlock full payloads without a payment request.',
    expected_impact:
      'Allows buyers and autonomous agents to submit on-chain payments for locked reports.',
    implementation_summary:
      'Ensure PUBLIC_PAYMENT_ADDRESS or CRYPTO_TREASURY_ADDRESS is configured and report payment requests expose chain, asset, address, verification URL, and required amount.',
    files_to_change: [
      'wrangler.jsonc',
      'worker/payment-request.ts',
      'worker/crypto-treasury.ts'
    ],
    estimated_complexity: 'small'
  });
}

function buildNoVerifiedRevenueSuggestion(now: number): NexusAgentSuggestion {
  return makeSuggestion({
    now,
    stable_seed: 'seo:increase-public-distribution-before-verified-revenue',
    title: 'Increase public distribution before expecting verified revenue',
    category: 'seo',
    priority: 'high',
    why:
      'There are no verified payments yet. Revenue must remain zero until external payment verification succeeds.',
    expected_impact:
      'Improves public discovery of paid reports without misclassifying projected or expected values as real revenue.',
    implementation_summary:
      'Run live checks for sitemap, feed, JSON discovery, report metadata, preview JSON, and machine-readable payment instructions. Keep treasury untouched until verified receipt exists.',
    files_to_change: [
      'worker/public-feed-renderer.ts',
      'worker/seo.ts',
      'worker/public-routes.ts',
      'worker/agent.ts'
    ],
    estimated_complexity: 'medium'
  });
}

function buildPricingSuggestion(asset: EarningAsset, now: number): NexusAgentSuggestion {
  const assetId = cleanText(asset.id || asset.slug || asset.title);

  return makeSuggestion({
    now,
    stable_seed: `pricing:review-high-value-report:${assetId}`,
    title: `Review pricing for high-value report: ${asset.title}`,
    category: 'pricing',
    priority: assetMarketValueScore(asset) >= 0.85 ? 'high' : 'medium',
    why:
      `Report has market score ${assetMarketValueScore(asset)} and projected market value ${assetProjectedValueUsd(asset)} USD. Projected value is not revenue.`,
    expected_impact:
      'May improve conversion probability and price capture while preserving verified-revenue-only accounting.',
    implementation_summary:
      'Compare dynamic price against projected market value, buyer friction, and payment availability. Adjust report pricing metadata only; do not mutate treasury or ledger values.',
    files_to_change: [
      'worker/pricing-engine.ts',
      'worker/report-builder.ts',
      'worker/public-sanitizer.ts'
    ],
    estimated_complexity: 'small'
  });
}

function buildLockedInventorySuggestion(count: number, now: number): NexusAgentSuggestion {
  return makeSuggestion({
    now,
    stable_seed: 'product:improve-locked-report-conversion-path',
    title: 'Improve locked report conversion path',
    category: 'product',
    priority: count >= 10 ? 'high' : 'medium',
    why:
      `${count} report(s) are locked. Locked inventory needs clear previews, payment instructions, and verification UX to convert.`,
    expected_impact:
      'Improves the chance that crawlers, agents, or humans understand the value and payment path.',
    implementation_summary:
      'Verify preview JSON, metadata JSON, public HTML copy, payment request summaries, full.json lock behavior, and verify-payment instructions.',
    files_to_change: [
      'worker/public-sanitizer.ts',
      'worker/public-market-renderer.ts',
      'worker/payment-request.ts'
    ],
    estimated_complexity: 'medium'
  });
}

function candidateMethod(candidate: any): string {
  return cleanText(candidate?.method).toLowerCase();
}

function candidateBlockers(candidate: any): string[] {
  const explicitBlockers = Array.isArray(candidate?.blockers)
    ? candidate.blockers.map(cleanText).filter(Boolean)
    : [];

  if (explicitBlockers.length > 0) {
    return explicitBlockers;
  }

  const method = candidateMethod(candidate);
  const text = [
    candidate?.title,
    candidate?.eligibility_notes,
    ...(Array.isArray(candidate?.action_plan) ? candidate.action_plan : [])
  ]
    .map(cleanText)
    .join(' ')
    .toLowerCase();

  if (
    textIncludesAny(method, [
      'learn_to_earn',
      'quest',
      'bug_bounty',
      'content_bounty',
      'grant',
      'airdrop',
      'testnet',
      'open_source_reward'
    ]) ||
    textIncludesAny(text, [
      'account',
      'wallet',
      'signature',
      'kyc',
      'captcha',
      'approval',
      'submit',
      'claim',
      'bounty',
      'quest',
      'login',
      'sign in'
    ])
  ) {
    return ['external_reward_flow_requires_account_or_manual_review'];
  }

  return [];
}

function candidateIsRuntimeExecutable(candidate: any): boolean {
  const classification = cleanText(candidate?.classification);
  const executionKind = cleanText(candidate?.execution_kind);
  const method = candidateMethod(candidate);

  if (classification === 'auto_executable' && executionKind.startsWith('internal_')) {
    return true;
  }

  return textIncludesAny(method, [
    'public_distribution',
    'seo_distribution',
    'conversion_integrity_check',
    'crawler_discovery_check',
    'internal_runtime_check',
    'payment_boundary_check',
    'report_feed_check'
  ]);
}

function buildCryptoAcquisitionSuggestion(
  candidate: NexusCryptoAcquisitionCandidate | any,
  now: number
): NexusAgentSuggestion {
  const blockers = candidateBlockers(candidate);
  const autoExecutable = candidateIsRuntimeExecutable(candidate) && blockers.length === 0;

  const suggestion = makeSuggestion({
    now,
    stable_seed: `crypto-acquisition:${candidateMethod(candidate)}:${cleanText(candidate.id || candidate.title)}`,
    title: autoExecutable
      ? `Execute zero-cost internal acquisition action: ${candidate.title}`
      : `Keep externally blocked acquisition path visible: ${candidate.title}`,
    category: 'crypto_acquisition',
    priority:
      autoExecutable
        ? 'high'
        : safeNumber(candidate.expected_value_nok, 0) >= 750 && safeNumber(candidate.risk_score, 1) <= 0.45
          ? 'medium'
          : 'low',
    why: autoExecutable
      ? 'This candidate can be executed by the Worker as an internal runtime/distribution/payment-boundary check. It does not claim revenue.'
      : `Candidate has expected value ${safeNumber(candidate.expected_value_nok, 0)} NOK but is blocked from autonomous completion. Expected value is not verified revenue.`,
    expected_impact: autoExecutable
      ? 'Produces real execution logs/results for distribution, crawler-discovery, or payment-boundary surfaces.'
      : 'Remains visible as blocked context without fake execution, fake payout, or fake treasury credit.',
    implementation_summary:
      Array.isArray(candidate.action_plan)
        ? candidate.action_plan.join(' ')
        : cleanText(candidate.eligibility_notes),
    files_to_change: autoExecutable
      ? ['worker/crypto-acquisition-agent.ts', 'worker/agent.ts']
      : ['worker/acquisition-sources.ts', 'worker/crypto-acquisition-agent.ts'],
    estimated_complexity:
      safeNumber(candidate.time_cost_minutes, 0) >= 300
        ? 'large'
        : safeNumber(candidate.time_cost_minutes, 0) >= 120
          ? 'medium'
          : 'small'
  });

  return withExecutionMetadata(suggestion, {
    execution_classification: autoExecutable ? 'auto_executable' : 'external_blocked',
    execution_status: autoExecutable ? 'queued' : 'external_blocked',
    execution_kind: autoExecutable ? 'internal_runtime_check' : 'external_reward_flow',
    executor_route: autoExecutable ? '/api/system/agent/crypto-acquisition/run' : undefined,
    approval_behavior: autoExecutable
      ? 'enqueue_and_execute_when_route_exists'
      : 'record_external_blocker_without_fake_execution',
    execution_blockers: autoExecutable
      ? []
      : blockers.length > 0
        ? blockers
        : ['external_reward_flow_requires_account_or_manual_review'],
    execution_truth: autoExecutable
      ? 'This acquisition candidate can be executed by the Worker now because it only performs internal runtime checks. It cannot credit treasury.'
      : 'This candidate may be real, but it cannot be completed by the Worker without an external account, manual approval, wallet signature, KYC, captcha, credentials, or payout review.',
    should_auto_execute_on_approval: autoExecutable
  });
}

function buildRiskSuggestion(now: number): NexusAgentSuggestion {
  return makeSuggestion({
    now,
    stable_seed: 'risk:audit-projected-value-versus-verified-revenue-wording',
    title: 'Audit dashboards for projected-value versus verified-revenue wording',
    category: 'risk',
    priority: 'high',
    why:
      'Projected and expected values are useful for prioritization, but must never appear as actual ledger revenue, verified revenue, treasury balance, or owner-withdrawable funds.',
    expected_impact:
      'Prevents misleading accounting displays and keeps the single-user autonomous system financially clean.',
    implementation_summary:
      'Check frontend store, Agent page, Vault page, Treasury page, public stats, reports, and ledger rendering for revenue-label correctness.',
    files_to_change: [
      'src/lib/store.ts',
      'src/pages/AgentPage.tsx',
      'src/pages/VaultPage.tsx',
      'src/pages/TreasuryPage.tsx',
      'worker/market-stats.ts'
    ],
    estimated_complexity: 'medium'
  });
}

function buildInfrastructureSuggestion(now: number): NexusAgentSuggestion {
  return makeSuggestion({
    now,
    stable_seed: 'infrastructure:add-smoke-checks-public-market-payment-routes',
    title: 'Add deploy and smoke checks for public market/payment routes',
    category: 'infrastructure',
    priority: 'medium',
    why:
      'The public market depends on machine-readable routes, payment verification paths, and owner-only guardrails. These need repeatable checks.',
    expected_impact:
      'Reduces regression risk before deployment and verifies that public routes stay public while owner/system routes stay private.',
    implementation_summary:
      'Add smoke tests for health, reports, feed, sitemap, robots, metadata, full report lock, verify-payment route behavior, and admin 401 behavior.',
    files_to_change: [
      'scripts/smoke-test.ps1',
      'scripts/deploy-check.ps1'
    ],
    estimated_complexity: 'medium'
  });
}

function buildFinalAgentWiringSuggestion(now: number): NexusAgentSuggestion {
  return makeSuggestion({
    now,
    stable_seed: 'product:final-agent-route-wiring-public-buyer-flow',
    title: 'Wire public buyer routes and suggestion execution ledger',
    category: 'product',
    priority: 'urgent',
    why:
      'The conversion modules are now patched, but the Worker route layer must expose public buyer routes and preserve admin/system route protection.',
    expected_impact:
      'Makes the public payment/unlock flow reachable while preventing fake suggestion execution and keeping admin routes protected.',
    implementation_summary:
      'Confirm public routes for /reports, /reports.json, /signals.json, /opportunities.json, /feed.xml, /sitemap.xml, /reports/:slug, metadata, preview, full.json, and verify-payment. Confirm /api/system routes return 401 without admin token.',
    files_to_change: [
      'worker/agent.ts'
    ],
    estimated_complexity: 'medium'
  });
}

function cryptoRunSuggestions(cryptoRun: CryptoAcquisitionAgentRun | null, now: number): NexusAgentSuggestion[] {
  if (!cryptoRun) return [];

  const directSuggestions = asArray<NexusAgentSuggestion>((cryptoRun as any).suggestions).map((suggestion) =>
    refreshExecutionMetadata({
      ...suggestion,
      updated_at: now
    })
  );

  const approvedCandidates = asArray<any>((cryptoRun as any).approved_candidates);
  const executableCandidates = asArray<any>((cryptoRun as any).auto_executable_candidates);
  const blockedCandidates = asArray<any>((cryptoRun as any).external_blocked_candidates)
    .filter((candidate) => safeNumber(candidate.expected_value_nok, 0) >= 500)
    .slice(0, 3);

  const candidateSuggestions = [
    ...approvedCandidates,
    ...executableCandidates,
    ...blockedCandidates
  ]
    .filter(Boolean)
    .slice(0, 12)
    .map((candidate) => buildCryptoAcquisitionSuggestion(candidate, now));

  return [...directSuggestions, ...candidateSuggestions];
}

function isSourceCodeSuggestionAlreadyImplemented(existing: NexusAgentSuggestion[] | undefined, file: string): boolean {
  const normalized = cleanText(file).toLowerCase();

  return (existing || []).some((suggestion) => {
    const files = asArray<string>(suggestion.files_to_change).map((item) => cleanText(item).toLowerCase());
    const status = cleanText((suggestion as any).execution_status);

    return (
      files.includes(normalized) &&
      (suggestion.status === 'implemented' || status === 'executed' || status === 'implemented')
    );
  });
}

function shouldAddInfrastructureSuggestion(input: AgentSuggestionInput): boolean {
  return !(input.existing_suggestions || []).some((suggestion) => {
    const key = canonicalSuggestionKey(suggestion);
    const status = cleanText((suggestion as any).execution_status);

    return (
      key.includes('infrastructure') &&
      (suggestion.status === 'implemented' || status === 'executed' || status === 'implemented')
    );
  });
}

export function buildAgentSuggestions(input: AgentSuggestionInput = {}): NexusAgentSuggestion[] {
  const now = input.now || Date.now();
  const assets = Array.isArray(input.assets) ? input.assets : [];
  const opportunities = Array.isArray(input.opportunities) ? input.opportunities : [];
  const stats = input.market_stats || null;
  const cryptoRun = input.crypto_acquisition_run || null;

  const suggestions: NexusAgentSuggestion[] = [];

  if (assets.length === 0) {
    suggestions.push(buildNoReportsSuggestion(now));
  }

  const assetsMissingPayment = assets.filter((asset) => !assetHasPaymentAddress(asset));

  if (assets.length > 0 && assetsMissingPayment.length > 0) {
    suggestions.push(buildPaymentConfigSuggestion(now));
  }

  const verifiedRevenue = safeNumber(
    stats?.totals?.verified_revenue_nok ??
      assets.reduce((sum, asset) => sum + (assetHasVerifiedRevenue(asset) ? safeNumber(asset.verified_revenue_nok, 0) : 0), 0),
    0
  );

  if (assets.length > 0 && verifiedRevenue <= 0) {
    suggestions.push(buildNoVerifiedRevenueSuggestion(now));
  }

  const lockedCount = assets.filter((asset) => !assetIsUnlocked(asset)).length;

  if (lockedCount > 0) {
    suggestions.push(buildLockedInventorySuggestion(lockedCount, now));
  }

  const highValueUnderpriced = assets
    .filter((asset) => assetProjectedValueUsd(asset) >= 5000 || assetMarketValueScore(asset) >= 0.75)
    .filter((asset) => safeNumber(asset.price_nok, 0) <= 199)
    .slice(0, 5);

  for (const asset of highValueUnderpriced) {
    suggestions.push(buildPricingSuggestion(asset, now));
  }

  suggestions.push(...cryptoRunSuggestions(cryptoRun, now));

  const hasProjectedOrExpectedValues =
    assets.some((asset) => assetProjectedValueUsd(asset) > 0 || safeNumber((asset as any).estimated_revenue_nok, 0) > 0) ||
    opportunities.some((opp) => safeNumber((opp as any).potential_profit ?? (opp as any).projected_market_value_usd, 0) > 0);

  if (hasProjectedOrExpectedValues) {
    suggestions.push(buildRiskSuggestion(now));
  }

  const agentSuggestionsDone = isSourceCodeSuggestionAlreadyImplemented(input.existing_suggestions, 'worker/agent-suggestions.ts');

  if (!agentSuggestionsDone) {
    suggestions.push(buildFinalAgentWiringSuggestion(now));
  }

  if (shouldAddInfrastructureSuggestion(input)) {
    suggestions.push(buildInfrastructureSuggestion(now));
  }

  const filteredSuggestions = suggestions.filter((suggestion) => {
    const files = asArray<string>(suggestion.files_to_change).map((file) => cleanText(file).toLowerCase());

    if (files.length !== 1) return true;

    const onlyFile = files[0];

    if (!LOCKED_SOURCE_CODE_FILES.has(onlyFile)) return true;

    return !isSourceCodeSuggestionAlreadyImplemented(input.existing_suggestions, onlyFile);
  });

  return mergeSuggestions({
    existing: input.existing_suggestions,
    incoming: filteredSuggestions
  });
}

function buildExecutionCounts(suggestions: NexusAgentSuggestion[]) {
  return {
    auto_executable: suggestions.filter((item) => (item as any).execution_classification === 'auto_executable').length,
    external_blocked: suggestions.filter((item) => (item as any).execution_classification === 'external_blocked').length,
    approved: suggestions.filter((item) => item.status === 'approved' || (item as any).execution_status === 'approved').length,
    executed: suggestions.filter((item) => item.status === 'implemented' || (item as any).execution_status === 'executed').length,
    failed: suggestions.filter((item) => (item as any).execution_status === 'failed').length,
    implemented: suggestions.filter((item) => item.status === 'implemented' || (item as any).execution_status === 'implemented').length,
    rejected: suggestions.filter((item) => item.status === 'rejected' || (item as any).execution_status === 'rejected').length
  };
}

export function buildAgentSuggestionSummary(
  input: AgentSuggestionInput = {}
): AgentSuggestionSummary {
  const now = input.now || Date.now();
  const suggestions = buildAgentSuggestions({
    ...input,
    now
  });

  return {
    success: true,
    kind: 'nexus_agent_suggestions',
    generated_at: now,
    generated_at_iso: new Date(now).toISOString(),
    accounting_policy: {
      projected_values_are_not_revenue: true,
      expected_values_are_not_revenue: true,
      verified_revenue_only: true,
      suggestions_do_not_mutate_treasury: true,
      projected_value_label: 'projected_market_value_only_not_verified_revenue',
      expected_value_label: 'expected_value_only_not_verified_revenue'
    },
    execution_policy: {
      approved_suggestions_must_not_disappear: true,
      approval_creates_or_updates_execution_ledger: true,
      auto_execute_only_when_no_external_blocker: true,
      blocked_items_remain_visible: true,
      no_fake_execution: true,
      repeated_suggestions_are_deduplicated: true,
      implemented_items_are_preserved: true
    },
    count: suggestions.length,
    execution_counts: buildExecutionCounts(suggestions),
    suggestions
  };
}

export function approveSuggestion(
  suggestions: NexusAgentSuggestion[],
  suggestionId: string,
  now = Date.now()
): NexusAgentSuggestion[] {
  return suggestions.map((suggestion) => {
    if (suggestion.id !== suggestionId) return suggestion;

    const enriched = refreshExecutionMetadata(suggestion);
    const autoExecutable = (enriched as any).execution_classification === 'auto_executable';

    return {
      ...enriched,
      status: 'approved',
      execution_status: autoExecutable ? 'approved' : 'external_blocked',
      approved_at: now,
      updated_at: now,
      approval_result: autoExecutable
        ? 'approved_for_autonomous_execution'
        : 'approved_but_external_blocked_not_fake_executed'
    } as NexusAgentSuggestion;
  });
}

export function rejectSuggestion(
  suggestions: NexusAgentSuggestion[],
  suggestionId: string,
  now = Date.now()
): NexusAgentSuggestion[] {
  return suggestions.map((suggestion) =>
    suggestion.id === suggestionId
      ? ({
          ...suggestion,
          status: 'rejected',
          execution_status: 'rejected',
          updated_at: now,
          rejection_note:
            'Rejected by owner/user action. This item should remain visible in history and must not be regenerated as a fresh duplicate with the same canonical key.'
        } as NexusAgentSuggestion)
      : suggestion
  );
}

export function markSuggestionImplemented(
  suggestions: NexusAgentSuggestion[],
  suggestionId: string,
  now = Date.now()
): NexusAgentSuggestion[] {
  return suggestions.map((suggestion) => {
    if (suggestion.id !== suggestionId) return suggestion;

    const previousExecutionStatus = cleanText((suggestion as any).execution_status);

    return {
      ...suggestion,
      status: 'implemented',
      execution_status:
        previousExecutionStatus === 'executed'
          ? 'executed'
          : previousExecutionStatus === 'failed'
            ? 'failed'
            : 'implemented',
      updated_at: now,
      implementation_marked_at: now,
      implementation_note:
        previousExecutionStatus === 'executed'
          ? 'Marked implemented after actual execution.'
          : 'Marked implemented without converting it into fake executed status.'
    } as NexusAgentSuggestion;
  });
}

export function markSuggestionExecutionResult(input: {
  suggestions: NexusAgentSuggestion[];
  suggestionId: string;
  success: boolean;
  result?: unknown;
  ledger_id?: string;
  now?: number;
}): NexusAgentSuggestion[] {
  const now = input.now || Date.now();

  return input.suggestions.map((suggestion) => {
    if (suggestion.id !== input.suggestionId) return suggestion;

    return {
      ...suggestion,
      status: input.success ? 'implemented' : suggestion.status,
      execution_status: input.success ? 'executed' : 'failed',
      execution_ledger_id: input.ledger_id || (suggestion as any).execution_ledger_id,
      last_execution_at: now,
      last_execution_result: input.result,
      updated_at: now,
      verified_revenue_nok: 0,
      treasury_credit: 'verified_receipt_only'
    } as NexusAgentSuggestion;
  });
}

export function buildAgentSuggestionTextSummary(summary: AgentSuggestionSummary): string {
  const urgent = summary.suggestions.filter((item) => item.priority === 'urgent').length;
  const high = summary.suggestions.filter((item) => item.priority === 'high').length;
  const payment = summary.suggestions.filter((item) => item.category === 'payment').length;
  const seo = summary.suggestions.filter((item) => item.category === 'seo').length;
  const crypto = summary.suggestions.filter((item) => item.category === 'crypto_acquisition').length;
  const approved = summary.suggestions.filter((item) => item.status === 'approved').length;
  const executed = summary.suggestions.filter((item) => (item as any).execution_status === 'executed').length;
  const implemented = summary.suggestions.filter((item) => item.status === 'implemented').length;
  const rejected = summary.suggestions.filter((item) => item.status === 'rejected').length;
  const autoExecutable = summary.execution_counts.auto_executable;
  const externalBlocked = summary.execution_counts.external_blocked;

  return [
    `suggestions=${summary.count}`,
    `urgent=${urgent}`,
    `high=${high}`,
    `payment=${payment}`,
    `seo=${seo}`,
    `crypto_acquisition=${crypto}`,
    `approved=${approved}`,
    `auto_executable=${autoExecutable}`,
    `external_blocked=${externalBlocked}`,
    `executed=${executed}`,
    `implemented=${implemented}`,
    `rejected=${rejected}`,
    `projected_value_label=${summary.accounting_policy.projected_value_label}`,
    `expected_value_label=${summary.accounting_policy.expected_value_label}`,
    'treasury_mutation=false',
    'approved_suggestions_do_not_disappear=true',
    'implemented_items_are_preserved=true',
    'repeated_suggestions_are_deduplicated=true',
    'no_fake_execution=true'
  ].join(' ');
}