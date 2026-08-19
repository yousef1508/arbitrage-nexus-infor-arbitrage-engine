import type { Opportunity, ExecutionResult } from './types';

type MonetizationClassification = 'auto_executable' | 'external_blocked';

type MonetizationBlocker =
  | 'affiliate_paused'
  | 'account_required'
  | 'login_required'
  | 'captcha_possible'
  | 'credential_required'
  | 'manual_email_or_dm_required'
  | 'external_approval_required'
  | 'manual_signup_required'
  | 'payout_not_under_worker_control'
  | 'no_configured_referral_url'
  | 'no_public_contact_route'
  | 'no_safe_autonomous_executor'
  | 'low_confidence'
  | 'low_monetization_score'
  | 'external_platform_required'
  | 'verified_revenue_required';

type MonetizationExecutionStatus =
  | 'queued'
  | 'prepared'
  | 'executed'
  | 'external_blocked'
  | 'failed'
  | 'verified_revenue';

type MonetizationTarget = {
  id: string;
  role: 'affiliate' | 'lead_gen' | 'referral' | 'resale' | 'trading';
  title: string;
  url?: string;
  method: string;
  classification: MonetizationClassification;
  blockers: MonetizationBlocker[];
  execution_status: MonetizationExecutionStatus;
  expected_value_label: 'expected_value_only_not_verified_revenue';
  revenue_label: 'verified_external_payment_only';
  treasury_credit: 'verified_receipt_only';
  notes: string;
};

type MonetizationDetails = {
  role: string;
  classification: MonetizationClassification;
  execution_status: MonetizationExecutionStatus;
  targets: MonetizationTarget[];
  blockers: MonetizationBlocker[];
  verified_revenue: false;
  revenue_status: 'not_verified';
  expected_value_label: 'expected_value_only_not_verified_revenue';
  revenue_label: 'verified_external_payment_only';
  treasury_credit: 'verified_receipt_only';
  files_or_routes_needed?: string[];
  next_action?: string;
  [key: string]: unknown;
};

const PUBLIC_BASE_URL = 'https://arbitragenexus.net';

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

function clamp01(value: unknown, fallback = 0): number {
  return Math.max(0, Math.min(1, safeNumber(value, fallback)));
}

function slugify(value: unknown, fallback = 'target'): string {
  const slug = cleanText(value || fallback)
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || fallback;
}

function shortText(value: unknown, max = 180): string {
  const text = cleanText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function opportunityText(opp: Opportunity): string {
  return [
    opp.id,
    opp.title,
    opp.summary,
    opp.niche,
    (opp as any).evidence,
    (opp as any).buyer_type,
    (opp as any).product_type,
    Array.isArray((opp as any).source_refs) ? (opp as any).source_refs.join(' ') : ''
  ]
    .join(' ')
    .toLowerCase();
}

function getReportSlug(opp: Opportunity): string {
  const existing =
    cleanText((opp as any).report_slug) ||
    cleanText((opp as any).slug) ||
    slugify(opp.title || opp.id || 'report');

  return existing;
}

function getReportUrl(opp: Opportunity): string {
  const explicit = cleanText((opp as any).report_url);

  if (explicit) {
    return explicit.startsWith('http') ? explicit : `${PUBLIC_BASE_URL}${explicit.startsWith('/') ? explicit : `/${explicit}`}`;
  }

  return `${PUBLIC_BASE_URL}/reports/${getReportSlug(opp)}`;
}

function getVerifyPaymentUrl(opp: Opportunity): string {
  const explicit = cleanText((opp as any).verify_payment_url);

  if (explicit) {
    return explicit.startsWith('http') ? explicit : `${PUBLIC_BASE_URL}${explicit.startsWith('/') ? explicit : `/${explicit}`}`;
  }

  return `${PUBLIC_BASE_URL}/reports/${getReportSlug(opp)}/verify-payment`;
}

function getMetadataUrl(opp: Opportunity): string {
  const explicit = cleanText((opp as any).metadata_url);

  if (explicit) {
    return explicit.startsWith('http') ? explicit : `${PUBLIC_BASE_URL}${explicit.startsWith('/') ? explicit : `/${explicit}`}`;
  }

  return `${PUBLIC_BASE_URL}/reports/${getReportSlug(opp)}/metadata.json`;
}

function getPreviewUrl(opp: Opportunity): string {
  const explicit = cleanText((opp as any).preview_url);

  if (explicit) {
    return explicit.startsWith('http') ? explicit : `${PUBLIC_BASE_URL}${explicit.startsWith('/') ? explicit : `/${explicit}`}`;
  }

  return `${PUBLIC_BASE_URL}/reports/${getReportSlug(opp)}/preview.json`;
}

function getFullJsonUrl(opp: Opportunity): string {
  const explicit = cleanText((opp as any).full_json_url);

  if (explicit) {
    return explicit.startsWith('http') ? explicit : `${PUBLIC_BASE_URL}${explicit.startsWith('/') ? explicit : `/${explicit}`}`;
  }

  return `${PUBLIC_BASE_URL}/reports/${getReportSlug(opp)}/full.json`;
}

function detectBuyerSegments(opp: Opportunity): string[] {
  const text = opportunityText(opp);
  const segments = new Set<string>();

  segments.add('autonomous_market_intelligence_buyers');
  segments.add('research_operators');
  segments.add('ai_agent_builders');

  if (text.includes('security') || text.includes('cve') || text.includes('vulnerability') || text.includes('exploit')) {
    segments.add('security_research_teams');
    segments.add('devsecops_operators');
    segments.add('security_newsletter_operators');
  }

  if (text.includes('ai') || text.includes('llm') || text.includes('agent') || text.includes('openai') || text.includes('gemini')) {
    segments.add('ai_founders');
    segments.add('llm_tool_builders');
    segments.add('ai_infrastructure_researchers');
  }

  if (text.includes('cloud') || text.includes('aws') || text.includes('bedrock') || text.includes('infrastructure')) {
    segments.add('cloud_architects');
    segments.add('enterprise_ai_teams');
  }

  if (text.includes('legal') || text.includes('ip') || text.includes('copyright') || text.includes('compliance')) {
    segments.add('legal_ops_researchers');
    segments.add('compliance_monitoring_teams');
  }

  if (text.includes('startup') || text.includes('saas') || text.includes('lead') || text.includes('affiliate')) {
    segments.add('b2b_growth_operators');
    segments.add('saas_market_researchers');
  }

  return [...segments].slice(0, 12);
}

function buildPublicLeadTargets(opp: Opportunity): MonetizationTarget[] {
  const slug = getReportSlug(opp);
  const reportUrl = getReportUrl(opp);
  const metadataUrl = getMetadataUrl(opp);
  const previewUrl = getPreviewUrl(opp);
  const fullJsonUrl = getFullJsonUrl(opp);
  const verifyUrl = getVerifyPaymentUrl(opp);
  const segments = detectBuyerSegments(opp);

  return segments.slice(0, 8).map((segment, index) => ({
    id: `lead-${slug}-${segment}-${index}`.slice(0, 180),
    role: 'lead_gen',
    title: `Public buyer route for ${segment}`,
    url: reportUrl,
    method: 'public_report_conversion_surface',
    classification: 'auto_executable',
    blockers: [],
    execution_status: 'prepared',
    expected_value_label: 'expected_value_only_not_verified_revenue',
    revenue_label: 'verified_external_payment_only',
    treasury_credit: 'verified_receipt_only',
    notes: [
      `Buyer segment: ${segment}.`,
      `Public report page: ${reportUrl}.`,
      `Metadata endpoint: ${metadataUrl}.`,
      `Preview endpoint: ${previewUrl}.`,
      `Locked full JSON endpoint: ${fullJsonUrl}.`,
      `Payment verification endpoint: ${verifyUrl}.`,
      'This target is executable only as public discovery/conversion surface; no email, DM, login, scraping account, or manual outreach is claimed.'
    ].join(' ')
  }));
}

function getConfiguredReferralUrls(opp: Opportunity): string[] {
  const anyOpp = opp as any;

  const rawValues = [
    anyOpp.referral_url,
    anyOpp.referral_link,
    anyOpp.configured_referral_url,
    anyOpp.referral_program_url,
    anyOpp.full_report_json?.referral_url,
    anyOpp.full_report_json?.referral_link,
    ...(Array.isArray(anyOpp.offer_links)
      ? anyOpp.offer_links
          .filter((link: any) => cleanText(link?.type).toLowerCase().includes('referral'))
          .map((link: any) => link?.url)
      : [])
  ];

  return unique(
    rawValues
      .map(cleanText)
      .filter((url) => /^https?:\/\//i.test(url))
  ).slice(0, 10);
}

function externalReferralBlockers(opp: Opportunity): MonetizationBlocker[] {
  const text = opportunityText(opp);
  const blockers = new Set<MonetizationBlocker>();

  blockers.add('no_configured_referral_url');

  if (text.includes('signup') || text.includes('sign up')) blockers.add('manual_signup_required');
  if (text.includes('login') || text.includes('sign in') || text.includes('account')) blockers.add('account_required');
  if (text.includes('approval') || text.includes('apply') || text.includes('review')) blockers.add('external_approval_required');
  if (text.includes('captcha')) blockers.add('captcha_possible');
  if (text.includes('api key') || text.includes('credential')) blockers.add('credential_required');

  blockers.add('payout_not_under_worker_control');
  blockers.add('verified_revenue_required');

  return [...blockers];
}

function makeBlockedTarget(input: {
  id: string;
  role: MonetizationTarget['role'];
  title: string;
  method: string;
  blockers: MonetizationBlocker[];
  notes: string;
  url?: string;
}): MonetizationTarget {
  return {
    id: input.id.slice(0, 180),
    role: input.role,
    title: input.title,
    url: input.url,
    method: input.method,
    classification: 'external_blocked',
    blockers: unique(input.blockers),
    execution_status: 'external_blocked',
    expected_value_label: 'expected_value_only_not_verified_revenue',
    revenue_label: 'verified_external_payment_only',
    treasury_credit: 'verified_receipt_only',
    notes: input.notes
  };
}

function baseDetails(role: string, targets: MonetizationTarget[], extra: Record<string, unknown> = {}): MonetizationDetails {
  const blockers = unique(targets.flatMap((target) => target.blockers));
  const hasAuto = targets.some((target) => target.classification === 'auto_executable');
  const hasExecuted = targets.some((target) => target.execution_status === 'executed' || target.execution_status === 'prepared');

  return {
    role,
    classification: hasAuto ? 'auto_executable' : 'external_blocked',
    execution_status: hasExecuted ? 'prepared' : 'external_blocked',
    targets,
    blockers,
    verified_revenue: false,
    revenue_status: 'not_verified',
    expected_value_label: 'expected_value_only_not_verified_revenue',
    revenue_label: 'verified_external_payment_only',
    treasury_credit: 'verified_receipt_only',
    ...extra
  };
}

function successFromTargets(targets: MonetizationTarget[]): boolean {
  return targets.some(
    (target) =>
      target.classification === 'auto_executable' &&
      ['prepared', 'executed', 'queued'].includes(target.execution_status)
  );
}

/**
 * MonetizationLogic
 *
 * Layer 3 specialized agent execution strategies.
 *
 * These agents must not fake revenue.
 * They may prepare public buyer routes, referral targets, lead targets, or execution records.
 *
 * Real treasury credit must only come from verified external revenue:
 * - crypto payment verification
 * - settlement/payout API
 * - signed webhook
 * - externally confirmed receipt
 */
export class MonetizationLogic {
  /**
   * Affiliate Agent
   *
   * Paused by policy until affiliate programs are configured/approved.
   * This must not pretend that the Worker signed up to affiliate programs.
   */
  async executeAffiliate(opp: Opportunity): Promise<ExecutionResult> {
    const start = Date.now();
    const logs = [`AffiliateAgent: PAUSED_BY_POLICY [NICHE: ${opp.niche}]`];

    const target = makeBlockedTarget({
      id: `affiliate-paused-${slugify(opp.id || opp.title)}`,
      role: 'affiliate',
      title: `Affiliate path paused for ${shortText(opp.title, 80)}`,
      method: 'affiliate_program_requires_external_signup_or_approval',
      blockers: [
        'affiliate_paused',
        'manual_signup_required',
        'account_required',
        'external_approval_required',
        'payout_not_under_worker_control',
        'verified_revenue_required'
      ],
      notes:
        'Affiliate execution is paused. The Worker must not claim signup, approval, conversion, payout, or revenue without configured affiliate credentials and verified external settlement.'
    });

    logs.push('AffiliateAgent: EXTERNAL_BLOCKED - AFFILIATE_SIGNUP_APPROVAL_NOT_AUTONOMOUS');
    logs.push('AffiliateAgent: NO_REVENUE_CREDITED - VERIFIED_PAYOUT_REQUIRED');

    return {
      success: false,
      profit: 0,
      logs,
      latency_ms: Date.now() - start,
      details: baseDetails('affiliate', [target], {
        paused: true,
        next_action:
          'Configure already-approved affiliate/referral links later, or keep affiliate paused.'
      })
    };
  }

  /**
   * Lead Generation Agent
   *
   * Creates execution-ready public buyer/conversion targets.
   * It does not claim emails sent, DMs sent, closed leads, sales, or revenue.
   */
  async executeLeadGen(opp: Opportunity): Promise<ExecutionResult> {
    const start = Date.now();
    const logs = [`LeadGenAgent: BUILDING_PUBLIC_BUYER_TARGETS [NICHE: ${opp.niche}]`];

    const monetizationScore = clamp01(opp.monetization_score || opp.confidence_score || 0);
    const confidence = clamp01(opp.confidence_score || 0);

    if (monetizationScore < 0.4 || confidence < 0.35) {
      const target = makeBlockedTarget({
        id: `lead-low-score-${slugify(opp.id || opp.title)}`,
        role: 'lead_gen',
        title: `Lead-gen rejected for ${shortText(opp.title, 80)}`,
        method: 'lead_generation_policy_filter',
        blockers: monetizationScore < 0.4 ? ['low_monetization_score'] : ['low_confidence'],
        notes:
          'Opportunity score is too weak for lead-gen execution. No outreach or revenue was claimed.'
      });

      logs.push('LeadGenAgent: ABORTED - LOW_SCORE');
      logs.push('LeadGenAgent: NO_REVENUE_CREDITED');

      return {
        success: false,
        profit: 0,
        logs,
        latency_ms: Date.now() - start,
        details: baseDetails('lead_gen', [target], {
          monetization_score: monetizationScore,
          confidence_score: confidence
        })
      };
    }

    const targets = buildPublicLeadTargets(opp);

    logs.push(`LeadGenAgent: PUBLIC_BUYER_TARGETS_PREPARED count=${targets.length}`);
    logs.push(`LeadGenAgent: REPORT_URL ${getReportUrl(opp)}`);
    logs.push(`LeadGenAgent: VERIFY_URL ${getVerifyPaymentUrl(opp)}`);
    logs.push('LeadGenAgent: NO_EMAIL_OR_DM_SENT - NO_ACCOUNT_OR_CREDENTIAL_ASSUMED');
    logs.push('LeadGenAgent: NO_REVENUE_CREDITED - PAYMENT_VERIFICATION_REQUIRED');

    return {
      success: successFromTargets(targets),
      profit: 0,
      logs,
      latency_ms: Date.now() - start,
      details: baseDetails('lead_gen', targets, {
        monetization_score: monetizationScore,
        confidence_score: confidence,
        estimated_target_count: targets.length,
        report_url: getReportUrl(opp),
        metadata_url: getMetadataUrl(opp),
        preview_url: getPreviewUrl(opp),
        full_json_url: getFullJsonUrl(opp),
        verify_payment_url: getVerifyPaymentUrl(opp),
        files_or_routes_needed: [
          'worker/public-market-renderer.ts',
          'worker/public-sanitizer.ts',
          'worker/public-feed-renderer.ts',
          'worker/agent.ts'
        ],
        next_action:
          'Public discovery/feed routes should expose these report URLs to crawlers and autonomous buyers.'
      })
    };
  }

  /**
   * Resale / Arbitrage Agent
   *
   * Detects pricing-spread candidates.
   * Does not claim purchase, resale, spread capture, or profit.
   */
  async executeResale(opp: Opportunity): Promise<ExecutionResult> {
    const start = Date.now();
    const logs = [`ResaleAgent: ANALYZING_PRICING_SPREAD_CANDIDATES [NICHE: ${opp.niche}]`];

    const monetizationScore = clamp01(opp.monetization_score || opp.confidence_score || 0);

    if (monetizationScore < 0.7) {
      const target = makeBlockedTarget({
        id: `resale-low-score-${slugify(opp.id || opp.title)}`,
        role: 'resale',
        title: `Resale rejected for ${shortText(opp.title, 80)}`,
        method: 'resale_policy_filter',
        blockers: ['low_monetization_score'],
        notes:
          'Spread confidence is too low. No purchase, listing, resale, or revenue was executed.'
      });

      logs.push('ResaleAgent: ABORTED - INSUFFICIENT_SPREAD_CONFIDENCE');

      return {
        success: false,
        profit: 0,
        logs,
        latency_ms: Date.now() - start,
        details: baseDetails('resale', [target], {
          reason: 'insufficient_spread_confidence'
        })
      };
    }

    const estimatedSpread = Math.max(0, monetizationScore - 0.5);
    const candidateFound = estimatedSpread > 0.2;

    const target = candidateFound
      ? {
          id: `resale-candidate-${slugify(opp.id || opp.title)}`,
          role: 'resale' as const,
          title: `Resale spread candidate for ${shortText(opp.title, 80)}`,
          url: getReportUrl(opp),
          method: 'spread_candidate_record_only',
          classification: 'external_blocked' as const,
          blockers: ['no_safe_autonomous_executor', 'verified_revenue_required'] as MonetizationBlocker[],
          execution_status: 'external_blocked' as const,
          expected_value_label: 'expected_value_only_not_verified_revenue' as const,
          revenue_label: 'verified_external_payment_only' as const,
          treasury_credit: 'verified_receipt_only' as const,
          notes:
            'Spread candidate recorded only. No purchase, resale listing, order execution, or revenue is claimed.'
        }
      : makeBlockedTarget({
          id: `resale-no-candidate-${slugify(opp.id || opp.title)}`,
          role: 'resale',
          title: `No resale candidate for ${shortText(opp.title, 80)}`,
          method: 'spread_candidate_record_only',
          blockers: ['no_safe_autonomous_executor'],
          notes: 'No actionable pricing-spread execution path exists.'
        });

    logs.push(
      candidateFound
        ? `ResaleAgent: PRICING_SPREAD_CANDIDATE_FOUND spread_score=${estimatedSpread.toFixed(2)} NO_PURCHASE_EXECUTED`
        : 'ResaleAgent: NO_ACTIONABLE_PRICING_SPREAD_FOUND'
    );

    return {
      success: candidateFound,
      profit: 0,
      logs,
      latency_ms: Date.now() - start,
      details: baseDetails('resale', [target], {
        estimated_spread_score: estimatedSpread,
        purchase_executed: false,
        resale_executed: false
      })
    };
  }

  /**
   * Referral / Bounty Agent
   *
   * Only executable if an already-configured referral URL exists.
   * It must not pretend to sign up, get approved, or receive payout.
   */
  async executeReferral(opp: Opportunity): Promise<ExecutionResult> {
    const start = Date.now();
    const logs = [`ReferralAgent: CHECKING_CONFIGURED_REFERRAL_URLS [ID: ${opp.id}]`];

    const confidence = clamp01(opp.confidence_score || 0);

    if (confidence < 0.6) {
      const target = makeBlockedTarget({
        id: `referral-low-confidence-${slugify(opp.id || opp.title)}`,
        role: 'referral',
        title: `Referral rejected for ${shortText(opp.title, 80)}`,
        method: 'referral_policy_filter',
        blockers: ['low_confidence'],
        notes:
          'Confidence is too low for referral routing. No referral action or payout is claimed.'
      });

      logs.push('ReferralAgent: ABORTED - LOW_CONFIDENCE_OR_COMPLIANCE_RISK');

      return {
        success: false,
        profit: 0,
        logs,
        latency_ms: Date.now() - start,
        details: baseDetails('referral', [target], {
          confidence_score: confidence
        })
      };
    }

    const referralUrls = getConfiguredReferralUrls(opp);

    if (referralUrls.length === 0) {
      const target = makeBlockedTarget({
        id: `referral-missing-url-${slugify(opp.id || opp.title)}`,
        role: 'referral',
        title: `Referral blocked for ${shortText(opp.title, 80)}`,
        method: 'referral_requires_preconfigured_url',
        blockers: externalReferralBlockers(opp),
        notes:
          'No already-approved referral URL is configured. The Worker must not sign up, apply, pass approval, or claim payout by itself.'
      });

      logs.push('ReferralAgent: EXTERNAL_BLOCKED - NO_CONFIGURED_REFERRAL_URL');
      logs.push('ReferralAgent: NO_REVENUE_CREDITED - PAYOUT_VERIFICATION_REQUIRED');

      return {
        success: false,
        profit: 0,
        logs,
        latency_ms: Date.now() - start,
        details: baseDetails('referral', [target], {
          confidence_score: confidence,
          referral_candidate_found: false,
          next_action:
            'Only add referral execution after an already-approved public referral URL exists.'
        })
      };
    }

    const targets: MonetizationTarget[] = referralUrls.map((url, index) => ({
      id: `referral-${slugify(opp.id || opp.title)}-${index}`,
      role: 'referral',
      title: `Configured referral route for ${shortText(opp.title, 80)}`,
      url,
      method: 'configured_referral_link_distribution',
      classification: 'auto_executable',
      blockers: [],
      execution_status: 'prepared',
      expected_value_label: 'expected_value_only_not_verified_revenue',
      revenue_label: 'verified_external_payment_only',
      treasury_credit: 'verified_receipt_only',
      notes:
        'Referral link is already configured. The Worker may expose/route this URL, but payout remains unverified until external settlement evidence exists.'
    }));

    logs.push(`ReferralAgent: CONFIGURED_REFERRAL_URLS_PREPARED count=${targets.length}`);
    logs.push('ReferralAgent: NO_SIGNUP_OR_APPROVAL_CLAIMED');
    logs.push('ReferralAgent: NO_REVENUE_CREDITED - VERIFIED_SETTLEMENT_REQUIRED');

    return {
      success: true,
      profit: 0,
      logs,
      latency_ms: Date.now() - start,
      details: baseDetails('referral', targets, {
        confidence_score: confidence,
        referral_candidate_found: true,
        configured_referral_urls: referralUrls
      })
    };
  }

  /**
   * Trading Agent
   *
   * Detects market/information-gap candidates.
   * Does not execute trades in this implementation.
   */
  async executeTrading(opp: Opportunity): Promise<ExecutionResult> {
    const start = Date.now();
    const logs = [`TradingAgent: ANALYZING_MARKET_GAP_CANDIDATE [ID: ${opp.id}]`];

    const confidence = clamp01(opp.confidence_score || 0);
    const monetizationScore = clamp01(opp.monetization_score || 0);
    const spreadScore = confidence * monetizationScore;
    const candidateDetected = spreadScore > 0.4;

    const target = candidateDetected
      ? makeBlockedTarget({
          id: `trading-candidate-${slugify(opp.id || opp.title)}`,
          role: 'trading',
          title: `Trading signal candidate for ${shortText(opp.title, 80)}`,
          method: 'market_gap_detection_only',
          blockers: ['external_platform_required', 'credential_required', 'verified_revenue_required'],
          notes:
            'Trading signal detected only. No exchange account, wallet balance, trade, fill, settlement, or profit is claimed.'
        })
      : makeBlockedTarget({
          id: `trading-rejected-${slugify(opp.id || opp.title)}`,
          role: 'trading',
          title: `Trading signal rejected for ${shortText(opp.title, 80)}`,
          method: 'market_gap_detection_only',
          blockers: ['low_monetization_score'],
          notes: 'No accepted trade candidate.'
        });

    logs.push(
      candidateDetected
        ? `TradingAgent: MARKET_GAP_CANDIDATE_DETECTED spread_score=${spreadScore.toFixed(2)} NO_TRADE_EXECUTED`
        : 'TradingAgent: NO_TRADE_CANDIDATE_ACCEPTED'
    );

    return {
      success: candidateDetected,
      profit: 0,
      logs,
      latency_ms: Date.now() - start,
      details: baseDetails('trading', [target], {
        spread_score: spreadScore,
        trade_executed: false,
        strategy: 'market_gap_detection_only'
      })
    };
  }
}

export const monetizationLogic = new MonetizationLogic();