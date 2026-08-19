import type {
  NexusAgentSuggestion,
  NexusCryptoAcquisitionCandidate,
  NexusCryptoAcquisitionMethod
} from './types';

import {
  buildZeroCostAcquisitionCandidates,
  rankCryptoAcquisitionCandidates,
  shouldAttemptAcquisitionCandidate,
  type AcquisitionCandidateSummary
} from './acquisition-sources';

type CryptoAcquisitionEnv = Record<string, unknown>;

export type NexusAcquisitionClassification =
  | 'auto_executable'
  | 'external_blocked';

export type NexusAcquisitionBlocker =
  | 'cash_cost_required'
  | 'account_required'
  | 'captcha_possible'
  | 'manual_wallet_signature_required'
  | 'manual_identity_step_required'
  | 'kyc_possible'
  | 'external_approval_required'
  | 'credential_required'
  | 'platform_terms_or_reward_review_required'
  | 'payout_not_under_worker_control'
  | 'paid_or_gas_cost_possible'
  | 'external_reward_flow_requires_account_or_manual_review'
  | 'not_safe_for_autonomous_execution'
  | 'expected_value_below_policy'
  | 'risk_score_above_policy'
  | 'friction_score_above_policy'
  | 'cycle_capacity_reached'
  | 'agent_policy_disabled'
  | 'internal_automation_disabled';

export type NexusAcquisitionExecutionStatus =
  | 'queued'
  | 'approved'
  | 'external_blocked'
  | 'executed'
  | 'failed'
  | 'verified_revenue';

export type NexusAcquisitionExecutionKind =
  | 'internal_runtime_check'
  | 'internal_distribution_check'
  | 'internal_payment_boundary_check'
  | 'external_reward_flow';

export type CryptoAcquisitionExecutableCandidate = Omit<
  NexusCryptoAcquisitionCandidate,
  'classification' | 'blockers' | 'execution_status'
> & {
  classification: NexusAcquisitionClassification;
  blockers: NexusAcquisitionBlocker[];
  classification_reason: string;
  execution_status: NexusAcquisitionExecutionStatus;
  execution_kind: NexusAcquisitionExecutionKind;
  expected_value_label: 'expected_value_only_not_verified_revenue';
  treasury_credit: 'verified_receipt_only';
  verified_revenue_nok: number;
  discovered_action?: string;
  execution_targets?: string[];
  success_criteria?: string[];
  failure_criteria?: string[];
  last_execution_at?: number;
  last_execution_at_iso?: string;
};

export type CryptoAcquisitionAgentPolicy = {
  enabled: boolean;
  internal_automation_enabled: boolean;
  max_candidates_per_cycle: number;
  max_approved_per_cycle: number;
  max_risk_score: number;
  max_friction_score: number;
  min_expected_value_nok: number;
  allow_zero_expected_value: boolean;
  include_methods?: NexusCryptoAcquisitionMethod[];
  exclude_methods?: NexusCryptoAcquisitionMethod[];
};

export type CryptoAcquisitionAgentRunInput = {
  env?: CryptoAcquisitionEnv;
  now?: number;
  policy?: Partial<CryptoAcquisitionAgentPolicy>;
  existing_candidates?: Array<NexusCryptoAcquisitionCandidate | CryptoAcquisitionExecutableCandidate>;
};

export type CryptoAcquisitionAgentDecision = {
  candidate: CryptoAcquisitionExecutableCandidate;
  approved: boolean;
  reason: string;
};

export type CryptoAcquisitionAgentSummary = Omit<AcquisitionCandidateSummary, 'candidates'> & {
  count: number;
  candidates: number;
  auto_executable: number;
  external_blocked: number;
  approved_for_execution: number;
  executed: number;
  failed: number;
  verified_revenue: number;
  verified_revenue_nok: number;
  expected_value_label: 'expected_value_only_not_verified_revenue';
  treasury_credit: 'verified_receipt_only';
};

export type CryptoAcquisitionAgentRun = {
  success: true;
  kind: 'nexus_crypto_acquisition_agent_run';
  generated_at: number;
  generated_at_iso: string;
  policy: CryptoAcquisitionAgentPolicy;
  accounting_policy: {
    zero_cash_cost_only: true;
    expected_value_is_not_revenue: true;
    no_treasury_credit_without_verified_receipt: true;
    no_ledger_credit_without_verified_receipt: true;
    expected_value_label: 'expected_value_only_not_verified_revenue';
  };
  summary: CryptoAcquisitionAgentSummary;
  decisions: CryptoAcquisitionAgentDecision[];
  candidates: CryptoAcquisitionExecutableCandidate[];
  auto_executable_candidates: CryptoAcquisitionExecutableCandidate[];
  external_blocked_candidates: CryptoAcquisitionExecutableCandidate[];
  execution_candidates: CryptoAcquisitionExecutableCandidate[];
  approved_candidates: CryptoAcquisitionExecutableCandidate[];
  rejected_candidates: CryptoAcquisitionExecutableCandidate[];
  suggestions: NexusAgentSuggestion[];
  logs: string[];
};

const DEFAULT_POLICY: CryptoAcquisitionAgentPolicy = {
  enabled: true,
  internal_automation_enabled: true,
  max_candidates_per_cycle: 16,
  max_approved_per_cycle: 5,
  max_risk_score: 0.65,
  max_friction_score: 0.75,
  min_expected_value_nok: 1,
  allow_zero_expected_value: false,
  exclude_methods: ['compute_mining_estimate']
};

const EXTERNAL_REWARD_METHODS = new Set<string>([
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

const INTERNAL_AUTO_METHODS = new Set<string>([
  'public_distribution',
  'seo_distribution',
  'conversion_integrity_check',
  'crawler_discovery_check',
  'payment_boundary_check',
  'report_feed_check',
  'x401_boundary_check'
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

function round2(value: number): number {
  return Number(Number(value || 0).toFixed(2));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = safeNumber(value, fallback);
  return Math.max(min, Math.min(max, parsed));
}

function envBool(env: CryptoAcquisitionEnv | undefined, keys: string[], fallback: boolean): boolean {
  if (!env) return fallback;

  for (const key of keys) {
    const raw = env[key];

    if (raw === undefined || raw === null || String(raw).trim() === '') {
      continue;
    }

    const normalized = String(raw).trim().toLowerCase();

    if (['true', '1', 'yes', 'y', 'on', 'enabled'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off', 'disabled'].includes(normalized)) return false;
  }

  return fallback;
}

function envNumber(env: CryptoAcquisitionEnv | undefined, keys: string[], fallback: number): number {
  if (!env) return fallback;

  for (const key of keys) {
    const raw = env[key];

    if (raw === undefined || raw === null || String(raw).trim() === '') {
      continue;
    }

    const parsed = Number(raw);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function envMethodList(
  env: CryptoAcquisitionEnv | undefined,
  keys: string[]
): NexusCryptoAcquisitionMethod[] | undefined {
  if (!env) return undefined;

  for (const key of keys) {
    const raw = env[key];

    if (raw === undefined || raw === null || String(raw).trim() === '') {
      continue;
    }

    const list = String(raw)
      .split(',')
      .map((item) => cleanText(item) as NexusCryptoAcquisitionMethod)
      .filter(Boolean);

    return list.length > 0 ? list : undefined;
  }

  return undefined;
}

function getPublicBaseUrl(env?: CryptoAcquisitionEnv): string {
  return cleanText(env?.PUBLIC_BASE_URL || env?.SITE_URL || 'https://arbitragenexus.net').replace(/\/+$/, '');
}

function absoluteUrl(base: string, path: string): string {
  const cleanBase = cleanText(base || 'https://arbitragenexus.net').replace(/\/+$/, '');
  const cleanPath = String(path || '').startsWith('/') ? String(path || '') : `/${path}`;

  return `${cleanBase}${cleanPath}`;
}

export function getCryptoAcquisitionAgentPolicy(
  env?: CryptoAcquisitionEnv,
  overrides: Partial<CryptoAcquisitionAgentPolicy> = {}
): CryptoAcquisitionAgentPolicy {
  return {
    enabled:
      overrides.enabled ??
      envBool(env, ['CRYPTO_ACQUISITION_ENABLED', 'PUBLIC_CRYPTO_ACQUISITION_ENABLED'], DEFAULT_POLICY.enabled),

    internal_automation_enabled:
      overrides.internal_automation_enabled ??
      envBool(
        env,
        [
          'CRYPTO_ACQUISITION_INTERNAL_AUTOMATION_ENABLED',
          'AUTONOMOUS_ACQUISITION_INTERNAL_EXECUTION_ENABLED'
        ],
        DEFAULT_POLICY.internal_automation_enabled
      ),

    max_candidates_per_cycle: Math.max(
      1,
      Math.min(
        100,
        Math.floor(
          safeNumber(
            overrides.max_candidates_per_cycle ??
              envNumber(env, ['CRYPTO_ACQUISITION_MAX_CANDIDATES'], DEFAULT_POLICY.max_candidates_per_cycle),
            DEFAULT_POLICY.max_candidates_per_cycle
          )
        )
      )
    ),

    max_approved_per_cycle: Math.max(
      0,
      Math.min(
        25,
        Math.floor(
          safeNumber(
            overrides.max_approved_per_cycle ??
              envNumber(env, ['CRYPTO_ACQUISITION_MAX_APPROVED'], DEFAULT_POLICY.max_approved_per_cycle),
            DEFAULT_POLICY.max_approved_per_cycle
          )
        )
      )
    ),

    max_risk_score: clampNumber(
      overrides.max_risk_score ??
        envNumber(env, ['CRYPTO_ACQUISITION_MAX_RISK_SCORE'], DEFAULT_POLICY.max_risk_score),
      0,
      1,
      DEFAULT_POLICY.max_risk_score
    ),

    max_friction_score: clampNumber(
      overrides.max_friction_score ??
        envNumber(env, ['CRYPTO_ACQUISITION_MAX_FRICTION_SCORE'], DEFAULT_POLICY.max_friction_score),
      0,
      1,
      DEFAULT_POLICY.max_friction_score
    ),

    min_expected_value_nok: Math.max(
      0,
      safeNumber(
        overrides.min_expected_value_nok ??
          envNumber(env, ['CRYPTO_ACQUISITION_MIN_EXPECTED_VALUE_NOK'], DEFAULT_POLICY.min_expected_value_nok),
        DEFAULT_POLICY.min_expected_value_nok
      )
    ),

    allow_zero_expected_value:
      overrides.allow_zero_expected_value ??
      envBool(env, ['CRYPTO_ACQUISITION_ALLOW_ZERO_EXPECTED_VALUE'], DEFAULT_POLICY.allow_zero_expected_value),

    include_methods:
      overrides.include_methods ??
      envMethodList(env, ['CRYPTO_ACQUISITION_INCLUDE_METHODS']),

    exclude_methods:
      overrides.exclude_methods ??
      envMethodList(env, ['CRYPTO_ACQUISITION_EXCLUDE_METHODS']) ??
      DEFAULT_POLICY.exclude_methods
  };
}

function candidateKey(candidate: NexusCryptoAcquisitionCandidate | CryptoAcquisitionExecutableCandidate): string {
  return [
    cleanText(candidate.id).toLowerCase(),
    cleanText(candidate.method).toLowerCase(),
    cleanText(candidate.title).toLowerCase(),
    cleanText(candidate.url).toLowerCase(),
    cleanText(candidate.network).toLowerCase()
  ].join('|');
}

function toBaseCandidate(
  candidate: NexusCryptoAcquisitionCandidate | CryptoAcquisitionExecutableCandidate
): NexusCryptoAcquisitionCandidate {
  const base = { ...(candidate as any) };
  delete base.classification;
  delete base.blockers;
  delete base.classification_reason;
  delete base.execution_kind;
  delete base.expected_value_label;
  delete base.treasury_credit;
  delete base.verified_revenue_nok;
  delete base.discovered_action;
  delete base.execution_targets;
  delete base.success_criteria;
  delete base.failure_criteria;
  delete base.last_execution_at;
  delete base.last_execution_at_iso;

  return base as NexusCryptoAcquisitionCandidate;
}

export function mergeAcquisitionCandidates(input: {
  existing?: Array<NexusCryptoAcquisitionCandidate | CryptoAcquisitionExecutableCandidate>;
  incoming?: Array<NexusCryptoAcquisitionCandidate | CryptoAcquisitionExecutableCandidate>;
}): NexusCryptoAcquisitionCandidate[] {
  const byKey = new Map<string, NexusCryptoAcquisitionCandidate>();

  for (const candidate of [...(input.existing || []), ...(input.incoming || [])]) {
    const baseCandidate = toBaseCandidate(candidate);
    const key = candidateKey(baseCandidate);
    const previous = byKey.get(key);

    if (!previous) {
      byKey.set(key, baseCandidate);
      continue;
    }

    const preferred =
      safeNumber(baseCandidate.updated_at) >= safeNumber(previous.updated_at)
        ? baseCandidate
        : previous;

    byKey.set(key, preferred);
  }

  return rankCryptoAcquisitionCandidates([...byKey.values()]);
}

function makeInternalCandidate(input: {
  id: string;
  title: string;
  method: string;
  url: string;
  now: number;
  actionPlan: string[];
  executionTargets: string[];
  successCriteria: string[];
  failureCriteria: string[];
}): NexusCryptoAcquisitionCandidate & {
  execution_targets: string[];
  success_criteria: string[];
  failure_criteria: string[];
} {
  return {
    id: input.id,
    method: input.method as NexusCryptoAcquisitionMethod,
    title: input.title,
    url: input.url,
    network: 'Arbitrage Nexus public surface',
    asset: 'NEXUS_REPORT',
    expected_value_nok: 0,
    expected_value_usd: 0,
    time_cost_minutes: 1,
    cash_cost_nok: 0,
    risk_score: 0.05,
    friction_score: 0.05,
    eligibility_notes:
      'Internal worker-executable action. This can be executed with zero cash cost and no login, captcha, KYC, wallet signature, credentials, paid API, or manual identity step.',
    action_plan: input.actionPlan,
    status: 'candidate',
    created_at: input.now,
    updated_at: input.now,
    execution_targets: input.executionTargets,
    success_criteria: input.successCriteria,
    failure_criteria: input.failureCriteria
  };
}

export function buildInternalAutomationCandidates(input: {
  env?: CryptoAcquisitionEnv;
  now?: number;
} = {}): NexusCryptoAcquisitionCandidate[] {
  const now = input.now || Date.now();
  const base = getPublicBaseUrl(input.env);

  return [
    makeInternalCandidate({
      id: 'auto-public-report-feed-distribution',
      title: 'Verify public paid-report feeds are crawler-discoverable',
      method: 'public_distribution',
      url: absoluteUrl(base, '/reports.json'),
      now,
      executionTargets: [
        absoluteUrl(base, '/reports'),
        absoluteUrl(base, '/reports.json'),
        absoluteUrl(base, '/signals.json'),
        absoluteUrl(base, '/opportunities.json'),
        absoluteUrl(base, '/feed.xml'),
        absoluteUrl(base, '/sitemap.xml'),
        absoluteUrl(base, '/robots.txt')
      ],
      successCriteria: [
        'Public catalog responds 200.',
        'Public report HTML responds 200.',
        'Signals/opportunities feeds respond 200.',
        'RSS/sitemap/robots are reachable.',
        'No admin token is required for public buyer discovery routes.'
      ],
      failureCriteria: [
        'Any public buyer feed returns 401/403.',
        'Any public buyer feed points to /api/system, /messages, /admin, or /market-stats.json.',
        'Catalog has priced reports but no public report page URL.'
      ],
      actionPlan: [
        'Fetch public report catalog JSON.',
        'Fetch public report HTML.',
        'Fetch signals and opportunities JSON.',
        'Fetch RSS, sitemap, and robots endpoints.',
        'Record exact HTTP status, content type, byte count, and preview.',
        'Do not credit treasury; this only verifies acquisition/distribution surface.'
      ]
    }),

    makeInternalCandidate({
      id: 'auto-seo-surface-refresh',
      title: 'Verify sitemap, RSS, robots, reports and signals endpoints',
      method: 'seo_distribution',
      url: absoluteUrl(base, '/sitemap.xml'),
      now,
      executionTargets: [
        absoluteUrl(base, '/sitemap.xml'),
        absoluteUrl(base, '/feed.xml'),
        absoluteUrl(base, '/robots.txt'),
        absoluteUrl(base, '/reports'),
        absoluteUrl(base, '/reports.json'),
        absoluteUrl(base, '/signals.json'),
        absoluteUrl(base, '/opportunities.json')
      ],
      successCriteria: [
        'Sitemap lists /reports and /reports/:slug pages.',
        'Feed links point to public buyer pages.',
        'Robots does not expose private/admin routes for indexing.',
        'Discovery endpoints are public and cacheable.'
      ],
      failureCriteria: [
        'Sitemap/feed links point to /api/system or admin routes.',
        'Robots blocks /reports or /reports.json.',
        'Public buyer endpoints require admin token.'
      ],
      actionPlan: [
        'Fetch sitemap.xml, feed.xml, robots.txt, reports, reports.json, signals.json, and opportunities.json.',
        'Confirm endpoints are machine-readable and crawlable.',
        'Record failures for repair.',
        'Do not credit treasury; this only validates discoverability.'
      ]
    }),

    makeInternalCandidate({
      id: 'auto-locked-report-conversion-check',
      title: 'Verify locked full payload and payment boundary are active',
      method: 'conversion_integrity_check',
      url: absoluteUrl(base, '/reports.json'),
      now,
      executionTargets: [
        absoluteUrl(base, '/reports.json'),
        absoluteUrl(base, '/reports/:slug'),
        absoluteUrl(base, '/reports/:slug/metadata.json'),
        absoluteUrl(base, '/reports/:slug/preview.json'),
        absoluteUrl(base, '/reports/:slug/full.json'),
        absoluteUrl(base, '/reports/:slug/verify-payment')
      ],
      successCriteria: [
        'Metadata and preview are public.',
        'Locked full.json returns 402 PAYMENT_REQUIRED.',
        'Locked response includes payment_request/payment, public page URL, verify URL, metadata URL, preview URL, and full JSON URL.',
        'Verify-payment route is public and rejects missing/invalid tx hash with 400, not 401.',
        'Full paid payload is not exposed while locked.'
      ],
      failureCriteria: [
        'Locked full.json returns 200 without unlock/admin access.',
        'Verify-payment route requires admin token.',
        'Locked response exposes full_report_json/full_report_html.',
        'Locked response does not include payment/verify information.'
      ],
      actionPlan: [
        'Fetch report catalog.',
        'Identify a locked report if present.',
        'Verify preview/metadata routes remain public.',
        'Verify full payload requires payment unless owner/admin access is present.',
        'Verify payment route rejects missing/invalid transaction hashes.',
        'Do not credit treasury; only verified external payment can do that.'
      ]
    }),

    makeInternalCandidate({
      id: 'auto-payment-metadata-check',
      title: 'Verify machine-readable payment metadata exists on priced reports',
      method: 'payment_boundary_check',
      url: absoluteUrl(base, '/reports.json'),
      now,
      executionTargets: [
        absoluteUrl(base, '/reports.json'),
        absoluteUrl(base, '/reports/:slug/metadata.json'),
        absoluteUrl(base, '/reports/:slug/preview.json')
      ],
      successCriteria: [
        'Priced reports include payment_available.',
        'Priced reports include verify_payment URL.',
        'Payment request includes chain, asset, address, required amount when oracle is available, and human-readable instructions.',
        'Projected value remains marked as not revenue.'
      ],
      failureCriteria: [
        'Priced report has no verify_payment URL.',
        'Payment address missing while payment_available is true.',
        'Projected value is labeled or exposed as earned revenue.'
      ],
      actionPlan: [
        'Fetch report catalog JSON.',
        'Inspect report cards for price, payment availability, verify URL, preview URL, and full JSON URL.',
        'Record missing payment metadata as execution failures.',
        'Do not credit treasury from metadata presence.'
      ]
    }),

    makeInternalCandidate({
      id: 'auto-crawler-discovery-check',
      title: 'Verify agent/crawler discovery paths are exposed',
      method: 'crawler_discovery_check',
      url: absoluteUrl(base, '/robots.txt'),
      now,
      executionTargets: [
        absoluteUrl(base, '/robots.txt'),
        absoluteUrl(base, '/reports'),
        absoluteUrl(base, '/reports.json'),
        absoluteUrl(base, '/signals.json'),
        absoluteUrl(base, '/opportunities.json'),
        absoluteUrl(base, '/feed.xml'),
        absoluteUrl(base, '/sitemap.xml')
      ],
      successCriteria: [
        'Crawler-facing endpoints are public.',
        'Public JSON endpoints contain buyer-safe report URLs.',
        'Private/admin/system paths are not advertised as buyer routes.'
      ],
      failureCriteria: [
        'Crawler-facing endpoints return 401/403.',
        'Discovery JSON points buyers to dashboards or system/admin APIs.',
        'Robots/sitemap hides buyer report pages.'
      ],
      actionPlan: [
        'Fetch robots.txt.',
        'Confirm public discovery routes are allowed.',
        'Fetch JSON endpoints that autonomous buyers can inspect.',
        'Record exact result logs for execution ledger.'
      ]
    }),

    makeInternalCandidate({
      id: 'auto-x401-admin-boundary-check',
      title: 'Verify admin/system x401 boundary stays protected while buyer routes stay public',
      method: 'x401_boundary_check',
      url: absoluteUrl(base, '/api/system/agent/crypto-acquisition/run'),
      now,
      executionTargets: [
        absoluteUrl(base, '/api/system/agent/crypto-acquisition/run'),
        absoluteUrl(base, '/api/system/agent/patch-plan/run'),
        absoluteUrl(base, '/api/system/agent/suggestions/action'),
        absoluteUrl(base, '/reports'),
        absoluteUrl(base, '/reports.json'),
        absoluteUrl(base, '/reports/:slug'),
        absoluteUrl(base, '/reports/:slug/full.json'),
        absoluteUrl(base, '/reports/:slug/verify-payment')
      ],
      successCriteria: [
        'Admin/system routes return 401 without admin token.',
        'Crypto-acquisition run route returns 401 without admin token.',
        'Patch-plan and suggestion action routes return 401 without admin token.',
        'Public buyer report routes do not return 401.',
        'Locked public full.json returns 402 PAYMENT_REQUIRED, not 401.'
      ],
      failureCriteria: [
        'Admin/system route returns 200 without token.',
        'Public buyer route returns 401 due to admin-token requirement.',
        'Locked full.json returns 401 instead of 402.',
        'Verify-payment route is accidentally protected by admin token.'
      ],
      actionPlan: [
        'Probe admin/system routes without admin token and expect 401.',
        'Probe buyer routes without admin token and expect public 200 or public 402 for locked full payload.',
        'Record route boundary results.',
        'Do not credit treasury; this is security/conversion boundary verification.'
      ]
    })
  ];
}

function textContainsExternalStep(candidate: NexusCryptoAcquisitionCandidate): boolean {
  const text = [
    candidate.title,
    candidate.url,
    candidate.network,
    candidate.asset,
    candidate.eligibility_notes,
    ...(Array.isArray(candidate.action_plan) ? candidate.action_plan : [])
  ]
    .join(' ')
    .toLowerCase();

  return [
    'login',
    'sign in',
    'oauth',
    'account',
    'discord',
    'telegram',
    'twitter',
    'x.com',
    'wallet',
    'signature',
    'sign message',
    'captcha',
    'kyc',
    'identity',
    'approval',
    'apply',
    'submit',
    'claim',
    'manual',
    'review',
    'airdrop',
    'bounty',
    'grant',
    'quest',
    'deposit',
    'swap',
    'gas',
    'stake'
  ].some((needle) => text.includes(needle));
}

function isInternalAutoCandidate(candidate: NexusCryptoAcquisitionCandidate): boolean {
  const id = cleanText(candidate.id).toLowerCase();
  const method = cleanText(candidate.method).toLowerCase();

  return id.startsWith('auto-') || INTERNAL_AUTO_METHODS.has(method);
}

function inferExternalBlockers(candidate: NexusCryptoAcquisitionCandidate): NexusAcquisitionBlocker[] {
  const blockers = new Set<NexusAcquisitionBlocker>();
  const method = cleanText(candidate.method).toLowerCase();
  const text = [
    candidate.title,
    candidate.url,
    candidate.network,
    candidate.asset,
    candidate.eligibility_notes,
    ...(Array.isArray(candidate.action_plan) ? candidate.action_plan : [])
  ]
    .join(' ')
    .toLowerCase();

  if (safeNumber(candidate.cash_cost_nok) !== 0) {
    blockers.add('cash_cost_required');
  }

  if (text.includes('login') || text.includes('sign in') || text.includes('oauth') || text.includes('account')) {
    blockers.add('account_required');
  }

  if (text.includes('captcha')) {
    blockers.add('captcha_possible');
  }

  if (text.includes('wallet') || text.includes('signature') || text.includes('sign message') || text.includes('claim')) {
    blockers.add('manual_wallet_signature_required');
  }

  if (text.includes('kyc') || text.includes('identity')) {
    blockers.add('kyc_possible');
    blockers.add('manual_identity_step_required');
  }

  if (text.includes('approval') || text.includes('review') || text.includes('apply') || text.includes('submit')) {
    blockers.add('external_approval_required');
  }

  if (text.includes('api key') || text.includes('credential') || text.includes('secret')) {
    blockers.add('credential_required');
  }

  if (text.includes('deposit') || text.includes('swap') || text.includes('gas') || text.includes('stake')) {
    blockers.add('paid_or_gas_cost_possible');
  }

  if (EXTERNAL_REWARD_METHODS.has(method)) {
    blockers.add('external_reward_flow_requires_account_or_manual_review');
    blockers.add('payout_not_under_worker_control');
    blockers.add('platform_terms_or_reward_review_required');
  }

  if (method === 'bug_bounty') {
    blockers.add('account_required');
    blockers.add('external_approval_required');
    blockers.add('manual_identity_step_required');
  }

  if (method === 'learn_to_earn' || method === 'quest' || method === 'faucet' || method === 'airdrop_research') {
    blockers.add('account_required');
    blockers.add('manual_wallet_signature_required');
  }

  if (method === 'grant' || method === 'content_bounty' || method === 'open_source_reward') {
    blockers.add('account_required');
    blockers.add('external_approval_required');
  }

  if (method === 'compute_mining_estimate') {
    blockers.add('not_safe_for_autonomous_execution');
    blockers.add('payout_not_under_worker_control');
  }

  if (textContainsExternalStep(candidate)) {
    blockers.add('external_reward_flow_requires_account_or_manual_review');
  }

  return [...blockers];
}

function getExecutionKind(candidate: NexusCryptoAcquisitionCandidate): NexusAcquisitionExecutionKind {
  const method = cleanText(candidate.method).toLowerCase();

  if (method.includes('payment') || method.includes('conversion') || method.includes('x401')) {
    return 'internal_payment_boundary_check';
  }

  if (
    method.includes('seo') ||
    method.includes('crawler') ||
    method.includes('distribution') ||
    method.includes('feed')
  ) {
    return 'internal_distribution_check';
  }

  return 'internal_runtime_check';
}

function getDiscoveredAction(candidate: NexusCryptoAcquisitionCandidate): string {
  const method = cleanText(candidate.method).toLowerCase();

  if (method.includes('x401')) {
    return 'probe_public_vs_admin_route_boundaries';
  }

  if (method.includes('payment') || method.includes('conversion')) {
    return 'verify_public_payment_unlock_boundary';
  }

  if (method.includes('seo') || method.includes('crawler') || method.includes('distribution') || method.includes('feed')) {
    return 'verify_public_discovery_and_buyer_feed_surface';
  }

  return 'execute_internal_zero_cost_runtime_check';
}

export function classifyCryptoAcquisitionCandidate(
  candidate: NexusCryptoAcquisitionCandidate | CryptoAcquisitionExecutableCandidate
): CryptoAcquisitionExecutableCandidate {
  const current = candidate as CryptoAcquisitionExecutableCandidate;
  const base = toBaseCandidate(candidate);

  if (current.execution_status === 'verified_revenue') {
    return {
      ...base,
      classification: current.classification || 'auto_executable',
      blockers: current.blockers || [],
      classification_reason:
        current.classification_reason || 'Candidate has externally verified revenue evidence.',
      execution_status: 'verified_revenue',
      execution_kind: current.execution_kind || 'external_reward_flow',
      expected_value_label: 'expected_value_only_not_verified_revenue',
      treasury_credit: 'verified_receipt_only',
      verified_revenue_nok: safeNumber(current.verified_revenue_nok, 0),
      discovered_action: current.discovered_action,
      execution_targets: current.execution_targets,
      success_criteria: current.success_criteria,
      failure_criteria: current.failure_criteria,
      last_execution_at: current.last_execution_at,
      last_execution_at_iso: current.last_execution_at_iso
    };
  }

  if (current.execution_status === 'executed') {
    return {
      ...base,
      classification: current.classification || 'auto_executable',
      blockers: current.blockers || [],
      classification_reason:
        current.classification_reason || 'Candidate was actually executed and logged.',
      execution_status: 'executed',
      execution_kind: current.execution_kind || getExecutionKind(base),
      expected_value_label: 'expected_value_only_not_verified_revenue',
      treasury_credit: 'verified_receipt_only',
      verified_revenue_nok: safeNumber(current.verified_revenue_nok, 0),
      discovered_action: current.discovered_action || getDiscoveredAction(base),
      execution_targets: current.execution_targets || (candidate as any).execution_targets,
      success_criteria: current.success_criteria || (candidate as any).success_criteria,
      failure_criteria: current.failure_criteria || (candidate as any).failure_criteria,
      last_execution_at: current.last_execution_at,
      last_execution_at_iso: current.last_execution_at_iso
    };
  }

  if (isInternalAutoCandidate(base)) {
    return {
      ...base,
      classification: 'auto_executable',
      blockers: [],
      classification_reason:
        'Candidate can be executed by the Worker now with zero cash cost and no login, captcha, KYC, wallet signature, paid API, credentials, or manual identity step.',
      execution_status:
        current.execution_status && current.execution_status !== 'queued'
          ? current.execution_status
          : 'queued',
      execution_kind: current.execution_kind || getExecutionKind(base),
      expected_value_label: 'expected_value_only_not_verified_revenue',
      treasury_credit: 'verified_receipt_only',
      verified_revenue_nok: safeNumber(current.verified_revenue_nok, 0),
      discovered_action: current.discovered_action || getDiscoveredAction(base),
      execution_targets: current.execution_targets || (candidate as any).execution_targets,
      success_criteria: current.success_criteria || (candidate as any).success_criteria,
      failure_criteria: current.failure_criteria || (candidate as any).failure_criteria
    };
  }

  const blockers = inferExternalBlockers(base);

  if (blockers.length > 0) {
    return {
      ...base,
      classification: 'external_blocked',
      blockers,
      classification_reason:
        'Candidate is real, but cannot be autonomously completed by this Worker without an external account, approval, captcha, KYC, manual wallet signature, credentials, payout review, or human identity step.',
      execution_status: 'external_blocked',
      execution_kind: 'external_reward_flow',
      expected_value_label: 'expected_value_only_not_verified_revenue',
      treasury_credit: 'verified_receipt_only',
      verified_revenue_nok: safeNumber(current.verified_revenue_nok, 0),
      discovered_action: 'external_flow_blocked_before_execution'
    };
  }

  return {
    ...base,
    classification: 'external_blocked',
    blockers: ['not_safe_for_autonomous_execution'],
    classification_reason:
      'Candidate did not match a known internal auto-executable action and is blocked until explicitly implemented as a safe executor.',
    execution_status: 'external_blocked',
    execution_kind: 'external_reward_flow',
    expected_value_label: 'expected_value_only_not_verified_revenue',
    treasury_credit: 'verified_receipt_only',
    verified_revenue_nok: safeNumber(current.verified_revenue_nok, 0),
    discovered_action: 'blocked_unknown_executor'
  };
}

function policyBlockers(
  candidate: CryptoAcquisitionExecutableCandidate,
  policy: CryptoAcquisitionAgentPolicy
): NexusAcquisitionBlocker[] {
  const blockers = new Set<NexusAcquisitionBlocker>();

  if (!policy.enabled) {
    blockers.add('agent_policy_disabled');
  }

  if (!policy.internal_automation_enabled && candidate.classification === 'auto_executable') {
    blockers.add('internal_automation_disabled');
  }

  if (candidate.cash_cost_nok !== 0) {
    blockers.add('cash_cost_required');
  }

  if (
    candidate.classification !== 'auto_executable' &&
    !policy.allow_zero_expected_value &&
    candidate.expected_value_nok < policy.min_expected_value_nok
  ) {
    blockers.add('expected_value_below_policy');
  }

  if (candidate.risk_score > policy.max_risk_score) {
    blockers.add('risk_score_above_policy');
  }

  if (candidate.friction_score > policy.max_friction_score) {
    blockers.add('friction_score_above_policy');
  }

  return [...blockers];
}

function decisionReason(
  candidate: CryptoAcquisitionExecutableCandidate,
  policy: CryptoAcquisitionAgentPolicy,
  capacityAvailable: boolean
): string {
  if (!policy.enabled) {
    return 'Rejected because crypto acquisition agent is disabled by policy.';
  }

  if (!policy.internal_automation_enabled && candidate.classification === 'auto_executable') {
    return 'Rejected because internal autonomous execution is disabled by policy.';
  }

  if (!capacityAvailable) {
    return 'Rejected because the approved-candidate limit for this cycle has been reached.';
  }

  if (candidate.execution_status === 'executed') {
    return 'Already executed and logged. No fake duplicate execution is required.';
  }

  if (candidate.execution_status === 'verified_revenue') {
    return 'Already has verified revenue evidence.';
  }

  if (candidate.classification === 'external_blocked') {
    return `Blocked from execution: ${candidate.classification_reason} Blockers=${candidate.blockers.join(', ') || 'unknown'}.`;
  }

  const blockers = policyBlockers(candidate, policy);

  if (blockers.length > 0) {
    return `Rejected by policy blockers: ${blockers.join(', ')}.`;
  }

  if (candidate.classification === 'auto_executable') {
    return 'Approved for real autonomous execution. This is an internal zero-cost action and will not credit treasury unless external payment verification later succeeds.';
  }

  return 'Rejected because candidate is not safely executable.';
}

export function buildCryptoAcquisitionDecisions(input: {
  candidates: Array<NexusCryptoAcquisitionCandidate | CryptoAcquisitionExecutableCandidate>;
  policy: CryptoAcquisitionAgentPolicy;
}): CryptoAcquisitionAgentDecision[] {
  let approvedCount = 0;
  const now = Date.now();

  return rankCryptoAcquisitionCandidates(input.candidates.map(toBaseCandidate)).map((candidate) => {
    const classified = classifyCryptoAcquisitionCandidate(candidate);
    const capacityAvailable = approvedCount < input.policy.max_approved_per_cycle;

    const safeByCorePolicy =
      classified.classification === 'auto_executable'
        ? (
            classified.cash_cost_nok === 0 &&
            classified.risk_score <= input.policy.max_risk_score &&
            classified.friction_score <= input.policy.max_friction_score
          )
        : shouldAttemptAcquisitionCandidate(toBaseCandidate(classified), {
            max_risk_score: input.policy.max_risk_score,
            max_friction_score: input.policy.max_friction_score,
            min_expected_value_nok: input.policy.min_expected_value_nok,
            allow_zero_expected_value: input.policy.allow_zero_expected_value
          });

    const alreadyTerminal =
      classified.execution_status === 'executed' ||
      classified.execution_status === 'verified_revenue' ||
      classified.execution_status === 'failed';

    const approved =
      input.policy.enabled &&
      input.policy.internal_automation_enabled &&
      classified.classification === 'auto_executable' &&
      safeByCorePolicy &&
      capacityAvailable &&
      !alreadyTerminal;

    if (approved) {
      approvedCount += 1;
    }

    const policySpecificBlockers = policyBlockers(classified, input.policy);
    const finalBlockers = Array.from(
      new Set([
        ...classified.blockers,
        ...policySpecificBlockers,
        ...(!capacityAvailable && classified.classification === 'auto_executable'
          ? ['cycle_capacity_reached' as NexusAcquisitionBlocker]
          : [])
      ])
    );

    const nextExecutionStatus: NexusAcquisitionExecutionStatus =
      classified.execution_status === 'executed' ||
      classified.execution_status === 'verified_revenue' ||
      classified.execution_status === 'failed' ||
      classified.execution_status === 'external_blocked'
        ? classified.execution_status
        : approved
          ? 'approved'
          : 'queued';

    return {
      candidate: {
        ...classified,
        blockers: finalBlockers,
        status: approved ? 'approved' : classified.status,
        execution_status: nextExecutionStatus,
        updated_at: now
      },
      approved,
      reason: decisionReason(
        {
          ...classified,
          blockers: finalBlockers,
          execution_status: nextExecutionStatus
        },
        input.policy,
        capacityAvailable
      )
    };
  });
}

function buildSuggestionFromCandidate(
  candidate: CryptoAcquisitionExecutableCandidate,
  now: number
): NexusAgentSuggestion {
  const isAuto = candidate.classification === 'auto_executable';

  return {
    id: `suggest-acq-${candidate.id}`.slice(0, 180),
    title: isAuto
      ? `Execute autonomous zero-cost action: ${candidate.title}`
      : `Review externally blocked acquisition path: ${candidate.title}`,
    category: 'crypto_acquisition',
    priority:
      isAuto
        ? 'high'
        : candidate.expected_value_nok >= 750 && candidate.risk_score <= 0.45
          ? 'medium'
          : 'low',
    why:
      isAuto
        ? 'This candidate can be executed by the Worker without login, captcha, wallet signing, KYC, paid API, credentials, or manual identity steps.'
        : `Expected value ${candidate.expected_value_nok} NOK is blocked from autonomous execution. Blockers: ${candidate.blockers.join(', ')}.`,
    expected_impact:
      isAuto
        ? 'Produces real execution logs/results for distribution, x401 route protection, payment-boundary, and crawler-discovery surfaces.'
        : 'May become useful only if a real external account, approval, or verified settlement path is added later.',
    implementation_summary:
      [
        ...candidate.action_plan,
        candidate.execution_targets?.length
          ? `Execution targets: ${candidate.execution_targets.join(', ')}.`
          : '',
        candidate.success_criteria?.length
          ? `Success criteria: ${candidate.success_criteria.join(' ')}`
          : '',
        candidate.failure_criteria?.length
          ? `Failure criteria: ${candidate.failure_criteria.join(' ')}`
          : '',
        `Classification: ${candidate.classification}.`,
        `Execution status: ${candidate.execution_status}.`,
        'Expected value is not verified revenue.',
        'Treasury must only credit verified external payment or settlement evidence.'
      ]
        .map(cleanText)
        .filter(Boolean)
        .join(' '),
    files_to_change: [
      'worker/acquisition-sources.ts',
      'worker/crypto-acquisition-agent.ts',
      'worker/agent.ts'
    ],
    estimated_complexity:
      candidate.time_cost_minutes >= 300
        ? 'large'
        : candidate.time_cost_minutes >= 120
          ? 'medium'
          : 'small',
    requires_owner_confirmation: false,
    status: 'suggested',
    created_at: now,
    updated_at: now
  };
}

export function buildCryptoAcquisitionSuggestions(input: {
  approved_candidates: CryptoAcquisitionExecutableCandidate[];
  external_blocked_candidates?: CryptoAcquisitionExecutableCandidate[];
  now?: number;
}): NexusAgentSuggestion[] {
  const now = input.now || Date.now();

  const autoSuggestions = input.approved_candidates
    .slice(0, 10)
    .map((candidate) => buildSuggestionFromCandidate(candidate, now));

  const blockedContextSuggestions = (input.external_blocked_candidates || [])
    .filter((candidate) => candidate.expected_value_nok >= 500)
    .slice(0, 3)
    .map((candidate) => buildSuggestionFromCandidate(candidate, now));

  return [...autoSuggestions, ...blockedContextSuggestions];
}

function buildBaseSummaryFromCandidates(input: {
  candidates: CryptoAcquisitionExecutableCandidate[];
  now: number;
}): AcquisitionCandidateSummary {
  const totalExpectedNok = round2(
    input.candidates.reduce((sum, candidate) => sum + Math.max(0, safeNumber(candidate.expected_value_nok)), 0)
  );

  const totalExpectedUsd = round2(
    input.candidates.reduce((sum, candidate) => sum + Math.max(0, safeNumber(candidate.expected_value_usd)), 0)
  );

  const autoExecutableCount = input.candidates.filter(
    (candidate) => candidate.classification === 'auto_executable'
  ).length;
  const externalBlockedCount = input.candidates.filter(
    (candidate) => candidate.classification === 'external_blocked'
  ).length;

  return {
    generated_at: input.now,
    generated_at_iso: new Date(input.now).toISOString(),
    count: input.candidates.length,
    auto_executable_count: autoExecutableCount,
    external_blocked_count: externalBlockedCount,
    research_only_count: 0,
    total_expected_value_nok: totalExpectedNok,
    total_expected_value_usd: totalExpectedUsd,
    zero_cash_cost_only: true,
    expected_value_label: 'expected_value_only_not_verified_revenue',
    revenue_policy: 'verified_external_payment_only',
    candidates: input.candidates.map(toBaseCandidate)
  };
}

function buildRunSummary(input: {
  baseSummary: AcquisitionCandidateSummary;
  candidates: CryptoAcquisitionExecutableCandidate[];
  decisions: CryptoAcquisitionAgentDecision[];
}): CryptoAcquisitionAgentSummary {
  const executed = input.candidates.filter((candidate) => candidate.execution_status === 'executed').length;
  const failed = input.candidates.filter((candidate) => candidate.execution_status === 'failed').length;
  const verifiedRevenueCandidates = input.candidates.filter(
    (candidate) => candidate.execution_status === 'verified_revenue'
  );

  return {
    ...input.baseSummary,
    count: input.candidates.length,
    candidates: input.candidates.length,
    auto_executable: input.candidates.filter((candidate) => candidate.classification === 'auto_executable').length,
    external_blocked: input.candidates.filter((candidate) => candidate.classification === 'external_blocked').length,
    approved_for_execution: input.decisions.filter((decision) => decision.approved).length,
    executed,
    failed,
    verified_revenue: verifiedRevenueCandidates.length,
    verified_revenue_nok: round2(
      verifiedRevenueCandidates.reduce(
        (sum, candidate) => sum + safeNumber(candidate.verified_revenue_nok),
        0
      )
    ),
    expected_value_label: 'expected_value_only_not_verified_revenue',
    treasury_credit: 'verified_receipt_only'
  };
}

export function runCryptoAcquisitionAgent(
  input: CryptoAcquisitionAgentRunInput = {}
): CryptoAcquisitionAgentRun {
  const now = input.now || Date.now();
  const policy = getCryptoAcquisitionAgentPolicy(input.env, input.policy);

  const generated = buildZeroCostAcquisitionCandidates({
    env: input.env,
    now,
    max_candidates: policy.max_candidates_per_cycle,
    include_methods: policy.include_methods,
    exclude_methods: policy.exclude_methods,
    min_expected_value_nok: policy.allow_zero_expected_value
      ? 0
      : policy.min_expected_value_nok,
    max_risk_score: 1,
    max_friction_score: 1
  });

  const internalCandidates = policy.internal_automation_enabled
    ? buildInternalAutomationCandidates({
        env: input.env,
        now
      })
    : [];

  const candidates = mergeAcquisitionCandidates({
    existing: input.existing_candidates || [],
    incoming: [...generated, ...internalCandidates]
  }).slice(0, policy.max_candidates_per_cycle);

  const decisions = buildCryptoAcquisitionDecisions({
    candidates,
    policy
  });

  const classifiedCandidates = decisions.map((decision) => decision.candidate);

  const autoExecutableCandidates = classifiedCandidates.filter(
    (candidate) => candidate.classification === 'auto_executable'
  );

  const externalBlockedCandidates = classifiedCandidates.filter(
    (candidate) => candidate.classification === 'external_blocked'
  );

  const approvedCandidates = decisions
    .filter((decision) => decision.approved)
    .map((decision) => decision.candidate);

  const rejectedCandidates = decisions
    .filter((decision) => !decision.approved)
    .map((decision) => decision.candidate);

  const baseSummary = buildBaseSummaryFromCandidates({
    candidates: classifiedCandidates,
    now
  });

  const summary = buildRunSummary({
    baseSummary,
    candidates: classifiedCandidates,
    decisions
  });

  const suggestions = buildCryptoAcquisitionSuggestions({
    approved_candidates: approvedCandidates,
    external_blocked_candidates: externalBlockedCandidates,
    now
  });

  const logs = [
    `generated_external_candidates=${generated.length}`,
    `generated_internal_auto_candidates=${internalCandidates.length}`,
    `merged_candidates=${candidates.length}`,
    `auto_executable=${summary.auto_executable}`,
    `external_blocked=${summary.external_blocked}`,
    `approved_for_execution=${summary.approved_for_execution}`,
    `executed=${summary.executed}`,
    `failed=${summary.failed}`,
    `verified_revenue=${summary.verified_revenue}`,
    `verified_revenue_nok=${summary.verified_revenue_nok}`,
    'policy=zero_cash_cost_only',
    'classification=auto_executable_requires_no_login_no_captcha_no_wallet_signature_no_kyc_no_credentials_no_paid_api',
    'external_blocked=real_opportunity_but_worker_must_not_fake_execution',
    'x401_boundary_check=admin_system_routes_must_401_without_token_public_buyer_routes_must_not_401',
    'locked_full_json_policy=402_payment_required_when_locked',
    'verify_payment_policy=public_post_reports_slug_verify_payment_not_admin_route',
    'expected_value_label=expected_value_only_not_verified_revenue',
    'treasury_policy=no_credit_without_verified_receipt'
  ];

  if (!policy.enabled) {
    logs.push('agent_disabled_by_policy');
  }

  if (!policy.internal_automation_enabled) {
    logs.push('internal_automation_disabled_by_policy');
  }

  if (approvedCandidates.length === 0) {
    logs.push('no_auto_executable_candidates_approved_this_cycle');
  }

  return {
    success: true,
    kind: 'nexus_crypto_acquisition_agent_run',
    generated_at: now,
    generated_at_iso: new Date(now).toISOString(),
    policy,
    accounting_policy: {
      zero_cash_cost_only: true,
      expected_value_is_not_revenue: true,
      no_treasury_credit_without_verified_receipt: true,
      no_ledger_credit_without_verified_receipt: true,
      expected_value_label: 'expected_value_only_not_verified_revenue'
    },
    summary,
    decisions,
    candidates: classifiedCandidates,
    auto_executable_candidates: autoExecutableCandidates,
    external_blocked_candidates: externalBlockedCandidates,
    execution_candidates: approvedCandidates,
    approved_candidates: approvedCandidates,
    rejected_candidates: rejectedCandidates,
    suggestions,
    logs
  };
}

export function buildCryptoAcquisitionAgentStatus(
  run: CryptoAcquisitionAgentRun
): string {
  return [
    `enabled=${run.policy.enabled}`,
    `internal_automation_enabled=${run.policy.internal_automation_enabled}`,
    `candidates=${run.summary.candidates}`,
    `auto_executable=${run.summary.auto_executable}`,
    `external_blocked=${run.summary.external_blocked}`,
    `approved_for_execution=${run.approved_candidates.length}`,
    `executed=${run.summary.executed}`,
    `failed=${run.summary.failed}`,
    `verified_revenue=${run.summary.verified_revenue}`,
    `verified_revenue_nok=${run.summary.verified_revenue_nok}`,
    `expected_value_label=${run.accounting_policy.expected_value_label}`,
    `treasury_credit=verified_receipt_only`,
    'x401_boundary_required=true',
    'locked_full_json_expected_status=402',
    'public_verify_route=/reports/:slug/verify-payment'
  ].join(' ');
}