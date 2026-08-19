import type {
  NexusCryptoAcquisitionCandidate,
  NexusCryptoAcquisitionMethod
} from './types';

import {
  convertNokToUsd
} from './fx-rates';

type AcquisitionEnv = Record<string, unknown>;

export type NexusAcquisitionExecutionClass =
  | 'auto_executable'
  | 'external_blocked'
  | 'research_only';

export type NexusAcquisitionSource = {
  id: string;
  method: NexusCryptoAcquisitionMethod;
  title: string;
  url?: string;
  network?: string;
  asset?: string;
  base_expected_value_nok: number;
  time_cost_minutes: number;
  risk_score: number;
  friction_score: number;
  eligibility_notes: string;
  action_plan: string[];
  tags: string[];
  enabled: boolean;

  execution_classification?: NexusAcquisitionExecutionClass;
  cash_cost_nok?: number;

  requires_account?: boolean;
  requires_login?: boolean;
  requires_approval?: boolean;
  requires_kyc?: boolean;
  requires_captcha?: boolean;
  requires_wallet_signature?: boolean;
  requires_manual_identity_step?: boolean;
  requires_credentials?: boolean;
  requires_paid_api?: boolean;
  requires_capital?: boolean;

  auto_executable_url?: string;
  external_blockers?: string[];
};

export type AcquisitionSourceSelectionInput = {
  env?: AcquisitionEnv;
  now?: number;
  max_candidates?: number;
  include_methods?: NexusCryptoAcquisitionMethod[];
  exclude_methods?: NexusCryptoAcquisitionMethod[];
  min_expected_value_nok?: number;
  max_risk_score?: number;
  max_friction_score?: number;
  include_external_blocked?: boolean;
};

export type AcquisitionCandidateSummary = {
  generated_at: number;
  generated_at_iso: string;
  count: number;
  auto_executable_count: number;
  external_blocked_count: number;
  research_only_count: number;
  total_expected_value_nok: number;
  total_expected_value_usd: number;
  zero_cash_cost_only: true;
  expected_value_label: 'expected_value_only_not_verified_revenue';
  revenue_policy: 'verified_external_payment_only';
  candidates: NexusCryptoAcquisitionCandidate[];
};

const DEFAULT_MAX_CANDIDATES = 16;

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

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = safeNumber(value, fallback);
  return Math.max(min, Math.min(max, parsed));
}

function slugify(value: unknown, fallback = 'candidate'): string {
  const slug = cleanText(value || fallback)
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || fallback;
}

function round2(value: number): number {
  return Number(Number(value || 0).toFixed(2));
}

function asMethod(value: string): NexusCryptoAcquisitionMethod {
  return value as NexusCryptoAcquisitionMethod;
}

function getEnvNumber(env: AcquisitionEnv | undefined, keys: string[], fallback: number): number {
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

function expectedUsdFromNok(valueNok: number, env?: AcquisitionEnv, now = Date.now()): number {
  return convertNokToUsd(valueNok, env, now).amount;
}

function inferExternalBlockers(source: NexusAcquisitionSource): string[] {
  const blockers: string[] = [];

  if (source.enabled === false) blockers.push('candidate_disabled');
  if (safeNumber(source.cash_cost_nok, 0) > 0) blockers.push('cash_cost_required');
  if (source.requires_capital) blockers.push('capital_required');
  if (source.requires_account) blockers.push('account_required');
  if (source.requires_login) blockers.push('login_required');
  if (source.requires_approval) blockers.push('external_approval_required');
  if (source.requires_kyc) blockers.push('kyc_required');
  if (source.requires_captcha) blockers.push('captcha_required');
  if (source.requires_wallet_signature) blockers.push('manual_wallet_signature_required');
  if (source.requires_manual_identity_step) blockers.push('manual_identity_step_required');
  if (source.requires_credentials) blockers.push('credentials_required');
  if (source.requires_paid_api) blockers.push('paid_api_required');

  return Array.from(new Set([
    ...blockers,
    ...(source.external_blockers || []).map(cleanText).filter(Boolean)
  ]));
}

function inferExecutionClassification(source: NexusAcquisitionSource): NexusAcquisitionExecutionClass {
  if (source.execution_classification) {
    return source.execution_classification;
  }

  const blockers = inferExternalBlockers(source);

  if (blockers.length > 0) {
    return 'external_blocked';
  }

  const method = cleanText(source.method).toLowerCase();

  if (
    [
      'public_distribution',
      'seo_distribution',
      'conversion_integrity_check',
      'crawler_discovery',
      'public_feed_check',
      'report_market_check'
    ].includes(method)
  ) {
    return 'auto_executable';
  }

  if (source.url && /^https?:\/\//i.test(source.url)) {
    return 'research_only';
  }

  return 'external_blocked';
}

function sourceScore(source: NexusAcquisitionSource): number {
  const normalized = normalizeSource(source);
  const classification = inferExecutionClassification(normalized);

  const expectedScore = Math.min(1, normalized.base_expected_value_nok / 1500);
  const timeScore = 1 - Math.min(1, normalized.time_cost_minutes / 480);
  const riskScore = 1 - clampNumber(normalized.risk_score, 0, 1, 0.5);
  const frictionScore = 1 - clampNumber(normalized.friction_score, 0, 1, 0.5);

  const executableBonus =
    classification === 'auto_executable'
      ? 0.34
      : classification === 'research_only'
        ? 0.08
        : -0.18;

  return round2(
    expectedScore * 0.24 +
      timeScore * 0.16 +
      riskScore * 0.2 +
      frictionScore * 0.22 +
      executableBonus
  );
}

function normalizeSource(source: NexusAcquisitionSource): NexusAcquisitionSource {
  const normalized: NexusAcquisitionSource = {
    ...source,
    id: slugify(source.id || source.title),
    title: cleanText(source.title),
    url: cleanText(source.url) || undefined,
    network: cleanText(source.network) || undefined,
    asset: cleanText(source.asset) || undefined,
    base_expected_value_nok: Math.max(0, round2(source.base_expected_value_nok)),
    time_cost_minutes: Math.max(1, Math.floor(safeNumber(source.time_cost_minutes, 60))),
    risk_score: clampNumber(source.risk_score, 0, 1, 0.35),
    friction_score: clampNumber(source.friction_score, 0, 1, 0.5),
    eligibility_notes: cleanText(source.eligibility_notes),
    action_plan: source.action_plan.map(cleanText).filter(Boolean).slice(0, 14),
    tags: source.tags.map(cleanText).filter(Boolean).slice(0, 24),
    enabled: source.enabled !== false,
    cash_cost_nok: Math.max(0, round2(safeNumber(source.cash_cost_nok, 0))),
    auto_executable_url: cleanText(source.auto_executable_url || source.url) || undefined
  };

  normalized.external_blockers = inferExternalBlockers(normalized);
  normalized.execution_classification = inferExecutionClassification(normalized);

  return normalized;
}

export function getDefaultAcquisitionSources(): NexusAcquisitionSource[] {
  const sources: NexusAcquisitionSource[] = [
    {
      id: 'auto-public-report-market-distribution',
      method: asMethod('public_distribution'),
      title: 'Expose public paid-report market to crawlers and machine buyers',
      url: '/reports',
      auto_executable_url: '/reports',
      network: 'web',
      asset: 'paid_intelligence_report',
      base_expected_value_nok: 0,
      time_cost_minutes: 5,
      risk_score: 0.04,
      friction_score: 0.03,
      cash_cost_nok: 0,
      execution_classification: 'auto_executable',
      eligibility_notes:
        'Auto-executable. Verifies the public buyer page exists and routes buyers to report unlock pages.',
      action_plan: [
        'Fetch /reports from the Worker runtime.',
        'Confirm public report cards link to /reports/:slug.',
        'Confirm cards expose buy/unlock CTAs.',
        'Record execution evidence only; do not credit treasury.'
      ],
      tags: ['public_distribution', 'auto_executable', 'buyer_surface', 'zero_cash_cost'],
      enabled: true
    },
    {
      id: 'auto-public-report-feed-distribution',
      method: asMethod('public_feed_check'),
      title: 'Verify reports.json, signals.json, and opportunities.json expose public buyer links',
      url: '/reports.json',
      auto_executable_url: '/reports.json',
      network: 'web',
      asset: 'machine_readable_market_feed',
      base_expected_value_nok: 0,
      time_cost_minutes: 5,
      risk_score: 0.04,
      friction_score: 0.03,
      cash_cost_nok: 0,
      execution_classification: 'auto_executable',
      eligibility_notes:
        'Auto-executable. Confirms machine-readable discovery endpoints point to public report pages, not admin routes.',
      action_plan: [
        'Fetch /reports.json.',
        'Fetch /signals.json.',
        'Fetch /opportunities.json.',
        'Validate report_url, metadata_url, preview_url, full_json, and verify_payment URLs are public.',
        'Record broken routes as execution failures, not revenue.'
      ],
      tags: ['feed', 'json', 'auto_executable', 'crawler_discovery'],
      enabled: true
    },
    {
      id: 'auto-seo-surface-refresh',
      method: asMethod('seo_distribution'),
      title: 'Verify sitemap, RSS, robots, and report discovery surface',
      url: '/sitemap.xml',
      auto_executable_url: '/sitemap.xml',
      network: 'web',
      asset: 'crawler_discovery',
      base_expected_value_nok: 0,
      time_cost_minutes: 5,
      risk_score: 0.05,
      friction_score: 0.03,
      cash_cost_nok: 0,
      execution_classification: 'auto_executable',
      eligibility_notes:
        'Auto-executable. Strengthens public discovery and confirms crawlers are directed to buyer pages.',
      action_plan: [
        'Fetch /sitemap.xml.',
        'Fetch /feed.xml.',
        'Fetch /robots.txt.',
        'Confirm crawler-visible links point to /reports and /reports/:slug paths.',
        'Confirm admin/system paths are not advertised as buyer paths.'
      ],
      tags: ['seo', 'rss', 'sitemap', 'robots', 'auto_executable'],
      enabled: true
    },
    {
      id: 'auto-locked-report-conversion-integrity',
      method: asMethod('conversion_integrity_check'),
      title: 'Verify locked full report and public payment verification boundary',
      url: '/reports.json',
      auto_executable_url: '/reports.json',
      network: 'web',
      asset: 'paid_unlock_flow',
      base_expected_value_nok: 0,
      time_cost_minutes: 7,
      risk_score: 0.05,
      friction_score: 0.04,
      cash_cost_nok: 0,
      execution_classification: 'auto_executable',
      eligibility_notes:
        'Auto-executable. Confirms the report sales path is capable of taking a buyer from discovery to payment verification.',
      action_plan: [
        'Find public report URLs from /reports.json.',
        'Confirm /reports/:slug exists.',
        'Confirm /reports/:slug/full.json stays locked until payment.',
        'Confirm /reports/:slug/verify-payment is the public verification target.',
        'Never unlock or credit revenue without verified payment evidence.'
      ],
      tags: ['conversion', 'payment_unlock', 'auto_executable', 'verified_revenue_only'],
      enabled: true
    },
    {
      id: 'auto-machine-buyer-discovery-json',
      method: asMethod('crawler_discovery'),
      title: 'Expose machine-buyer discovery document for autonomous consumers',
      url: '/discovery.json',
      auto_executable_url: '/discovery.json',
      network: 'web',
      asset: 'machine_buyer_discovery',
      base_expected_value_nok: 0,
      time_cost_minutes: 5,
      risk_score: 0.06,
      friction_score: 0.04,
      cash_cost_nok: 0,
      execution_classification: 'auto_executable',
      eligibility_notes:
        'Auto-executable when routed. If /discovery.json is not wired yet, the executor should record failed route evidence.',
      action_plan: [
        'Fetch /discovery.json.',
        'Confirm it lists public report, feed, sitemap, and payment policy URLs.',
        'If route is missing, record as a conversion-surface gap for agent.ts integration.',
        'Do not represent route checks as income.'
      ],
      tags: ['discovery_json', 'machine_buyer', 'auto_executable'],
      enabled: true
    },
    {
      id: 'open-source-crypto-bounties',
      method: 'open_source_reward',
      title: 'Find open-source crypto ecosystem issues labeled bounty, good first issue, or reward',
      url: 'https://github.com/search?q=crypto+bounty+good+first+issue&type=issues',
      network: 'multi-chain',
      asset: 'mixed',
      base_expected_value_nok: 450,
      time_cost_minutes: 240,
      risk_score: 0.28,
      friction_score: 0.62,
      cash_cost_nok: 0,
      execution_classification: 'external_blocked',
      requires_account: true,
      requires_login: true,
      requires_approval: true,
      external_blockers: ['repository_account_required', 'maintainer_acceptance_required', 'payout_terms_external'],
      eligibility_notes:
        'Requires useful contribution and maintainer acceptance. The Worker can research candidates but cannot autonomously submit code or claim payouts without repository identity/credentials.',
      action_plan: [
        'Search public repositories for reward, bounty, grant, or good-first-issue labels.',
        'Filter for documentation, testing, translation, UI, and bug reproduction tasks requiring no cash cost.',
        'Classify as external_blocked until repository credentials and maintainer acceptance exist.',
        'Treat all reward estimates as expected value until maintainers confirm payout.'
      ],
      tags: ['open_source', 'bounty', 'contribution', 'zero_cash_cost', 'external_blocked'],
      enabled: true
    },
    {
      id: 'content-bounty-research-synthesis',
      method: 'content_bounty',
      title: 'Find content bounties for crypto research, tutorials, and ecosystem writeups',
      url: 'https://github.com/search?q=content+bounty+crypto&type=issues',
      network: 'multi-chain',
      asset: 'mixed',
      base_expected_value_nok: 350,
      time_cost_minutes: 180,
      risk_score: 0.2,
      friction_score: 0.48,
      cash_cost_nok: 0,
      execution_classification: 'external_blocked',
      requires_account: true,
      requires_approval: true,
      external_blockers: ['submission_account_required', 'editorial_acceptance_required', 'external_payout_required'],
      eligibility_notes:
        'Only original research is acceptable. The system may draft material from public signals, but external submission/acceptance/payout remains blocked without account access.',
      action_plan: [
        'Search public content bounty boards and ecosystem issue trackers.',
        'Match existing intelligence reports to requested topics.',
        'Generate original outline, sources, and draft deliverable.',
        'Keep as expected value until acceptance and verified settlement.'
      ],
      tags: ['content_bounty', 'research', 'writing', 'zero_cash_cost', 'external_blocked'],
      enabled: true
    },
    {
      id: 'ecosystem-grants-microtasks',
      method: 'grant',
      title: 'Track ecosystem grant microtasks and non-capital contributor programs',
      url: 'https://github.com/search?q=ecosystem+grant+crypto+contributor&type=repositories',
      network: 'multi-chain',
      asset: 'mixed',
      base_expected_value_nok: 650,
      time_cost_minutes: 300,
      risk_score: 0.26,
      friction_score: 0.66,
      cash_cost_nok: 0,
      execution_classification: 'external_blocked',
      requires_account: true,
      requires_approval: true,
      requires_manual_identity_step: true,
      external_blockers: ['grant_application_required', 'external_approval_required', 'payout_setup_required'],
      eligibility_notes:
        'Grant outcome is uncertain. Only include tasks with zero cash cost; application and payout remain external-blocked.',
      action_plan: [
        'Search for ecosystem contributor programs with open applications.',
        'Prioritize documentation, research, dataset, localization, and developer-relations tasks.',
        'Generate application drafts from existing Arbitrage Nexus intelligence assets.',
        'Keep grant amounts out of treasury until awarded, received, and verified.'
      ],
      tags: ['grant', 'contributor', 'research', 'zero_cash_cost', 'external_blocked'],
      enabled: true
    },
    {
      id: 'testnet-ecosystem-campaigns',
      method: 'testnet_reward',
      title: 'Track testnet campaigns that reward useful bug reports, feedback, or usage',
      url: 'https://github.com/topics/testnet',
      network: 'multi-chain',
      asset: 'mixed',
      base_expected_value_nok: 120,
      time_cost_minutes: 90,
      risk_score: 0.34,
      friction_score: 0.58,
      cash_cost_nok: 0,
      execution_classification: 'external_blocked',
      requires_account: true,
      requires_wallet_signature: true,
      external_blockers: ['wallet_or_account_required', 'reward_not_guaranteed', 'external_claim_required'],
      eligibility_notes:
        'Expected value is uncertain. Avoid spam farming. Claims usually require accounts, wallets, or signatures.',
      action_plan: [
        'Scan public testnet campaign pages and GitHub repositories.',
        'Prioritize projects that explicitly mention rewards, grants, points, or feedback bounties.',
        'Perform only legitimate testnet usage when allowed and manually authorized.',
        'Do not count points, badges, or projected airdrops as revenue.'
      ],
      tags: ['testnet', 'feedback', 'zero_cash_cost', 'external_blocked'],
      enabled: true
    },
    {
      id: 'learn-web3-foundational-rewards',
      method: 'learn_to_earn',
      title: 'Complete zero-cost Web3 learn-to-earn modules and claim eligible rewards',
      url: 'https://www.coinbase.com/learning-rewards',
      network: 'multi-chain',
      asset: 'mixed',
      base_expected_value_nok: 75,
      time_cost_minutes: 45,
      risk_score: 0.18,
      friction_score: 0.35,
      cash_cost_nok: 0,
      execution_classification: 'external_blocked',
      requires_account: true,
      requires_login: true,
      requires_kyc: true,
      external_blockers: ['account_required', 'eligibility_required', 'identity_or_region_rules_may_apply'],
      eligibility_notes:
        'Only use if the account is already eligible. Do not bypass geo, identity, or platform rules.',
      action_plan: [
        'Check whether the platform exposes currently available zero-cost learning rewards.',
        'Skip any task requiring paid deposit, trading volume, leverage, or identity circumvention.',
        'Classify as blocked unless the owner has already authorized an account/session.',
        'Record expected value only until a real reward is received and verified.'
      ],
      tags: ['education', 'learn_to_earn', 'zero_cash_cost', 'external_blocked'],
      enabled: true
    },
    {
      id: 'quest-platform-zero-cost',
      method: 'quest',
      title: 'Identify zero-cost crypto quests that do not require deposits, swaps, or gas spend',
      url: 'https://github.com/search?q=web3+quest+rewards&type=repositories',
      network: 'multi-chain',
      asset: 'mixed',
      base_expected_value_nok: 55,
      time_cost_minutes: 40,
      risk_score: 0.38,
      friction_score: 0.5,
      cash_cost_nok: 0,
      execution_classification: 'external_blocked',
      requires_account: true,
      requires_wallet_signature: true,
      external_blockers: ['quest_account_required', 'wallet_connection_often_required', 'reward_not_guaranteed'],
      eligibility_notes:
        'Reject quests requiring capital, token purchase, paid gas, suspicious wallet signatures, or private key exposure.',
      action_plan: [
        'Scan quest listings for explicitly free educational or social tasks.',
        'Filter out deposit, trading, swap, bridge, and paid gas requirements.',
        'Classify as external_blocked unless no account, wallet signature, captcha, or manual claim is required.',
        'Only track expected value until a real reward is received.'
      ],
      tags: ['quest', 'zero_cash_cost', 'expected_value_only', 'external_blocked'],
      enabled: true
    },
    {
      id: 'airdrop-research-legitimate-eligibility',
      method: 'airdrop_research',
      title: 'Research legitimate airdrop eligibility signals without paid farming',
      url: 'https://github.com/search?q=airdrop+eligibility+criteria&type=repositories',
      network: 'multi-chain',
      asset: 'mixed',
      base_expected_value_nok: 80,
      time_cost_minutes: 75,
      risk_score: 0.55,
      friction_score: 0.7,
      cash_cost_nok: 0,
      execution_classification: 'research_only',
      external_blockers: ['reward_uncertain', 'manual_wallet_review_required_before_any_action'],
      eligibility_notes:
        'High uncertainty. Do not pay gas, buy tokens, bridge assets, or spam transactions. Research only.',
      action_plan: [
        'Collect public eligibility criteria and official announcements.',
        'Reject any task requiring capital, suspicious signatures, seed phrases, or wallet-draining permissions.',
        'Produce a ranked watchlist of legitimate zero-cost eligibility paths.',
        'Do not count projected airdrops as revenue.'
      ],
      tags: ['airdrop_research', 'watchlist', 'zero_cash_cost', 'research_only'],
      enabled: true
    },
    {
      id: 'faucet-devnet-only',
      method: 'faucet',
      title: 'Track developer faucets for testnet/devnet access only',
      url: 'https://github.com/search?q=testnet+faucet+developer&type=repositories',
      network: 'testnet',
      asset: 'test tokens',
      base_expected_value_nok: 0,
      time_cost_minutes: 20,
      risk_score: 0.12,
      friction_score: 0.25,
      cash_cost_nok: 0,
      execution_classification: 'research_only',
      eligibility_notes:
        'Testnet tokens are not revenue and should never be represented as treasury assets.',
      action_plan: [
        'Find official project faucets only.',
        'Use testnet tokens only for legitimate development, testing, or bug reporting.',
        'Never display testnet balances as revenue, treasury, or owner-withdrawable value.'
      ],
      tags: ['faucet', 'testnet', 'development', 'not_revenue', 'research_only'],
      enabled: true
    },
    {
      id: 'security-bug-bounty-low-risk',
      method: 'bug_bounty',
      title: 'Monitor low-risk bug bounty scopes for documentation, disclosure, and validation rewards',
      url: 'https://hackerone.com/directory/programs',
      network: 'multi-chain',
      asset: 'mixed',
      base_expected_value_nok: 900,
      time_cost_minutes: 360,
      risk_score: 0.42,
      friction_score: 0.72,
      cash_cost_nok: 0,
      execution_classification: 'external_blocked',
      requires_account: true,
      requires_login: true,
      requires_approval: true,
      requires_manual_identity_step: true,
      external_blockers: ['platform_account_required', 'program_scope_review_required', 'manual_submission_required'],
      eligibility_notes:
        'Only test within explicit program scope. Do not exploit, exfiltrate, disrupt, or access private systems.',
      action_plan: [
        'Find public programs with clear safe-harbor and crypto/Web3 relevance.',
        'Prefer documentation issues, misconfiguration reports, broken links, stale contract references, and reproducible low-risk findings.',
        'Stay strictly within published scope and rate limits.',
        'Record a candidate only as expected value until a bounty is awarded and paid.'
      ],
      tags: ['bug_bounty', 'security', 'safe_scope', 'zero_cash_cost', 'external_blocked'],
      enabled: true
    }
  ];

  return sources.map(normalizeSource);
}

export function buildCryptoAcquisitionCandidateFromSource(input: {
  source: NexusAcquisitionSource;
  env?: AcquisitionEnv;
  now?: number;
}): NexusCryptoAcquisitionCandidate {
  const now = input.now || Date.now();
  const source = normalizeSource(input.source);
  const expectedValueNok = round2(source.base_expected_value_nok);
  const classification = inferExecutionClassification(source);
  const blockers = inferExternalBlockers(source);

  const candidate: Record<string, unknown> = {
    id: `acq-${source.id}-${now}`.slice(0, 180),
    method: source.method,
    title: source.title,
    url: source.auto_executable_url || source.url,
    network: source.network,
    asset: source.asset,
    expected_value_nok: expectedValueNok,
    expected_value_usd: expectedUsdFromNok(expectedValueNok, input.env, now),
    time_cost_minutes: source.time_cost_minutes,
    cash_cost_nok: 0,
    risk_score: source.risk_score,
    friction_score: source.friction_score,

    execution_classification: classification,
    blockers,
    external_blockers: blockers,
    auto_executable: classification === 'auto_executable',
    expected_value_label: 'expected_value_only_not_verified_revenue',
    revenue_policy: 'verified_external_payment_only',
    treasury_credit: 'verified_receipt_only',

    requires_account: Boolean(source.requires_account),
    requires_login: Boolean(source.requires_login),
    requires_approval: Boolean(source.requires_approval),
    requires_kyc: Boolean(source.requires_kyc),
    requires_captcha: Boolean(source.requires_captcha),
    requires_wallet_signature: Boolean(source.requires_wallet_signature),
    requires_manual_identity_step: Boolean(source.requires_manual_identity_step),
    requires_credentials: Boolean(source.requires_credentials),
    requires_paid_api: Boolean(source.requires_paid_api),
    requires_capital: Boolean(source.requires_capital),

    eligibility_notes: [
      source.eligibility_notes,
      classification === 'auto_executable'
        ? 'This candidate can be executed by the Worker with zero cash cost and no account/wallet/manual identity step.'
        : classification === 'research_only'
          ? 'This candidate is research-only unless a later executor can perform it without credentials, payment, captcha, wallet signature, or manual approval.'
          : 'This candidate is real but externally blocked; it must not be marked executed until the blocker is removed.',
      'Expected value is not verified revenue. Treasury stays unchanged until a real reward or payment is received and verified.'
    ]
      .map(cleanText)
      .filter(Boolean)
      .join(' '),

    action_plan: [
      ...source.action_plan,
      classification === 'auto_executable'
        ? 'Execute only the public zero-cost network check or public discovery workflow.'
        : 'Do not execute automatically while blockers remain.',
      'Keep result in candidate/external_blocked status until externally confirmed.',
      'Do not credit ledger, tax receipts, treasury, or verified revenue from expected value.'
    ].slice(0, 16),

    status: 'candidate',
    created_at: now,
    updated_at: now
  };

  return candidate as NexusCryptoAcquisitionCandidate;
}

export function rankAcquisitionSources(
  sources: NexusAcquisitionSource[]
): NexusAcquisitionSource[] {
  return sources
    .map(normalizeSource)
    .filter((source) => source.enabled)
    .sort((a, b) => {
      const classA = inferExecutionClassification(a);
      const classB = inferExecutionClassification(b);

      const classWeight = (classification: NexusAcquisitionExecutionClass) => {
        if (classification === 'auto_executable') return 3;
        if (classification === 'research_only') return 2;
        return 1;
      };

      const classDelta = classWeight(classB) - classWeight(classA);
      if (classDelta !== 0) return classDelta;

      const scoreDelta = sourceScore(b) - sourceScore(a);
      if (scoreDelta !== 0) return scoreDelta;

      const valueDelta = b.base_expected_value_nok - a.base_expected_value_nok;
      if (valueDelta !== 0) return valueDelta;

      return a.time_cost_minutes - b.time_cost_minutes;
    });
}

export function buildZeroCostAcquisitionCandidates(
  input: AcquisitionSourceSelectionInput = {}
): NexusCryptoAcquisitionCandidate[] {
  const now = input.now || Date.now();
  const maxCandidates = Math.max(
    1,
    Math.min(
      100,
      Math.floor(
        safeNumber(
          input.max_candidates ??
            getEnvNumber(input.env, ['CRYPTO_ACQUISITION_MAX_CANDIDATES'], DEFAULT_MAX_CANDIDATES),
          DEFAULT_MAX_CANDIDATES
        )
      )
    )
  );

  const includeMethods = new Set(input.include_methods || []);
  const excludeMethods = new Set(input.exclude_methods || []);
  const minExpectedValueNok = Math.max(0, safeNumber(input.min_expected_value_nok, 0));
  const maxRiskScore = clampNumber(input.max_risk_score, 0, 1, 1);
  const maxFrictionScore = clampNumber(input.max_friction_score, 0, 1, 1);
  const includeExternalBlocked = input.include_external_blocked !== false;

  return rankAcquisitionSources(getDefaultAcquisitionSources())
    .filter((source) => {
      const classification = inferExecutionClassification(source);

      if (!includeExternalBlocked && classification === 'external_blocked') return false;
      if (includeMethods.size > 0 && !includeMethods.has(source.method)) return false;
      if (excludeMethods.has(source.method)) return false;
      if (source.base_expected_value_nok < minExpectedValueNok) return false;
      if (source.risk_score > maxRiskScore) return false;
      if (source.friction_score > maxFrictionScore) return false;
      if (safeNumber(source.cash_cost_nok, 0) !== 0) return false;

      return true;
    })
    .slice(0, maxCandidates)
    .map((source) =>
      buildCryptoAcquisitionCandidateFromSource({
        source,
        env: input.env,
        now
      })
    );
}

export function rankCryptoAcquisitionCandidates(
  candidates: NexusCryptoAcquisitionCandidate[]
): NexusCryptoAcquisitionCandidate[] {
  return [...candidates].sort((a: any, b: any) => {
    const classWeight = (candidate: any) => {
      const classification = cleanText(candidate.execution_classification);

      if (classification === 'auto_executable') return 3;
      if (classification === 'research_only') return 2;
      return 1;
    };

    const classDelta = classWeight(b) - classWeight(a);
    if (classDelta !== 0) return classDelta;

    const scoreA =
      Math.min(1, safeNumber(a.expected_value_nok, 0) / 1500) * 0.24 +
      (1 - Math.min(1, safeNumber(a.time_cost_minutes, 0) / 480)) * 0.16 +
      (1 - clampNumber(a.risk_score, 0, 1, 0.5)) * 0.22 +
      (1 - clampNumber(a.friction_score, 0, 1, 0.5)) * 0.22 +
      (a.auto_executable ? 0.16 : 0);

    const scoreB =
      Math.min(1, safeNumber(b.expected_value_nok, 0) / 1500) * 0.24 +
      (1 - Math.min(1, safeNumber(b.time_cost_minutes, 0) / 480)) * 0.16 +
      (1 - clampNumber(b.risk_score, 0, 1, 0.5)) * 0.22 +
      (1 - clampNumber(b.friction_score, 0, 1, 0.5)) * 0.22 +
      (b.auto_executable ? 0.16 : 0);

    const scoreDelta = scoreB - scoreA;
    if (scoreDelta !== 0) return scoreDelta;

    return safeNumber(b.expected_value_nok, 0) - safeNumber(a.expected_value_nok, 0);
  });
}

export function summarizeAcquisitionCandidates(
  candidates: NexusCryptoAcquisitionCandidate[],
  now = Date.now()
): AcquisitionCandidateSummary {
  const ranked = rankCryptoAcquisitionCandidates(candidates);
  const totalExpectedNok = round2(
    ranked.reduce((sum: number, candidate: any) => sum + Math.max(0, safeNumber(candidate.expected_value_nok, 0)), 0)
  );
  const totalExpectedUsd = round2(
    ranked.reduce((sum: number, candidate: any) => sum + Math.max(0, safeNumber(candidate.expected_value_usd, 0)), 0)
  );

  return {
    generated_at: now,
    generated_at_iso: new Date(now).toISOString(),
    count: ranked.length,
    auto_executable_count: ranked.filter((candidate: any) => candidate.execution_classification === 'auto_executable').length,
    external_blocked_count: ranked.filter((candidate: any) => candidate.execution_classification === 'external_blocked').length,
    research_only_count: ranked.filter((candidate: any) => candidate.execution_classification === 'research_only').length,
    total_expected_value_nok: totalExpectedNok,
    total_expected_value_usd: totalExpectedUsd,
    zero_cash_cost_only: true,
    expected_value_label: 'expected_value_only_not_verified_revenue',
    revenue_policy: 'verified_external_payment_only',
    candidates: ranked
  };
}

export function buildAcquisitionCandidateSummary(
  input: AcquisitionSourceSelectionInput = {}
): AcquisitionCandidateSummary {
  const now = input.now || Date.now();
  const candidates = buildZeroCostAcquisitionCandidates({
    ...input,
    now
  });

  return summarizeAcquisitionCandidates(candidates, now);
}

export function shouldAttemptAcquisitionCandidate(
  candidate: NexusCryptoAcquisitionCandidate,
  options: {
    max_risk_score?: number;
    max_friction_score?: number;
    min_expected_value_nok?: number;
    allow_zero_expected_value?: boolean;
    allow_research_only?: boolean;
  } = {}
): boolean {
  const candidateAny = candidate as any;
  const maxRisk = clampNumber(options.max_risk_score, 0, 1, 0.65);
  const maxFriction = clampNumber(options.max_friction_score, 0, 1, 0.75);
  const minExpected = Math.max(0, safeNumber(options.min_expected_value_nok, 1));
  const classification = cleanText(candidateAny.execution_classification);

  if (safeNumber(candidateAny.cash_cost_nok, 0) !== 0) return false;
  if (candidateAny.requires_capital) return false;
  if (candidateAny.requires_account) return false;
  if (candidateAny.requires_login) return false;
  if (candidateAny.requires_approval) return false;
  if (candidateAny.requires_kyc) return false;
  if (candidateAny.requires_captcha) return false;
  if (candidateAny.requires_wallet_signature) return false;
  if (candidateAny.requires_manual_identity_step) return false;
  if (candidateAny.requires_credentials) return false;
  if (candidateAny.requires_paid_api) return false;

  if (classification === 'external_blocked') return false;

  if (classification === 'research_only' && !options.allow_research_only) {
    return false;
  }

  if (!options.allow_zero_expected_value && safeNumber(candidateAny.expected_value_nok, 0) < minExpected) {
    return false;
  }

  if (safeNumber(candidateAny.risk_score, 0) > maxRisk) {
    return false;
  }

  if (safeNumber(candidateAny.friction_score, 0) > maxFriction) {
    return false;
  }

  if (candidateAny.status !== 'candidate' && candidateAny.status !== 'approved') {
    return false;
  }

  return true;
}