import type { OfferLink, OfferLinkType } from './types';

export type AffiliateOffer = {
  id: string;
  label: string;
  niche_keywords: string[];
  url: string;
  type: Extract<OfferLinkType, 'affiliate' | 'referral' | 'payment'>;
  notes?: string;
};

export type MatchedAffiliateOffer = AffiliateOffer & {
  match_score: number;
  matched_keywords: string[];
};

export type AffiliateOfferEnv = Record<string, unknown>;

function envString(env: AffiliateOfferEnv | undefined, key: string): string {
  const value = env?.[key];

  if (typeof value === 'string') return value.trim();
  if (value === undefined || value === null) return '';

  return String(value).trim();
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function uniqueStrings(values: unknown[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );
}

function normalizeKeyword(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeOffer(raw: Partial<AffiliateOffer>): AffiliateOffer | null {
  const id = String(raw.id || '').trim();
  const label = String(raw.label || '').trim();
  const url = String(raw.url || '').trim();
  const type = (raw.type || 'affiliate') as AffiliateOffer['type'];

  if (!id || !label || !url) return null;
  if (!['affiliate', 'referral', 'payment'].includes(type)) return null;
  if (!isValidHttpUrl(url)) return null;

  return {
    id,
    label,
    url,
    type,
    niche_keywords: uniqueStrings(raw.niche_keywords || []).map(normalizeKeyword),
    notes: raw.notes ? String(raw.notes) : undefined
  };
}

/**
 * Dormant offer templates.
 * These intentionally have empty URLs, so they never render until configured.
 */
export const AFFILIATE_OFFERS: AffiliateOffer[] = [
  {
    id: 'ai-devtools',
    label: 'AI developer tools offer',
    niche_keywords: [
      'ai',
      'artificial intelligence',
      'developer',
      'development',
      'coding',
      'code',
      'llm',
      'software',
      'github',
      'copilot',
      'agent',
      'open source',
      'devtools',
      'infrastructure',
      'benchmark',
      'model'
    ],
    url: '',
    type: 'affiliate',
    notes: 'Set AFFILIATE_AI_DEVTOOLS_URL when you have a real affiliate URL.'
  },
  {
    id: 'cybersecurity',
    label: 'Cybersecurity tools offer',
    niche_keywords: [
      'security',
      'cybersecurity',
      'vulnerability',
      'cve',
      'supply chain',
      'password',
      'bitwarden',
      'breach',
      'zero day',
      'compliance',
      'exploit',
      'malware',
      'risk',
      'exfiltration'
    ],
    url: '',
    type: 'affiliate',
    notes: 'Set AFFILIATE_CYBERSECURITY_URL when you have a real affiliate URL.'
  },
  {
    id: 'saas-founder-tools',
    label: 'SaaS founder tools offer',
    niche_keywords: [
      'saas',
      'startup',
      'founder',
      'indie',
      'productivity',
      'automation',
      'crm',
      'analytics',
      'marketing',
      'sales',
      'newsletter',
      'email',
      'workflow'
    ],
    url: '',
    type: 'affiliate',
    notes: 'Set AFFILIATE_SAAS_URL when you have a real affiliate URL.'
  },
  {
    id: 'cloud-infrastructure',
    label: 'Cloud infrastructure offer',
    niche_keywords: [
      'cloud',
      'aws',
      'azure',
      'gcp',
      'infrastructure',
      'hosting',
      'server',
      'database',
      'edge',
      'workers',
      'deployment',
      'devops',
      'platform',
      'compute'
    ],
    url: '',
    type: 'affiliate',
    notes: 'Set AFFILIATE_CLOUD_INFRA_URL when you have a real affiliate URL.'
  },
  {
    id: 'business-legal-compliance',
    label: 'Business compliance offer',
    niche_keywords: [
      'legal',
      'ip',
      'intellectual property',
      'copyright',
      'compliance',
      'governance',
      'contract',
      'policy',
      'privacy',
      'gdpr',
      'law',
      'regulation',
      'age verification'
    ],
    url: '',
    type: 'referral',
    notes: 'Set AFFILIATE_COMPLIANCE_URL when you have a real referral URL.'
  }
];

function templateKeywords(id: string): string[] {
  return AFFILIATE_OFFERS.find((offer) => offer.id === id)?.niche_keywords || [];
}

function configuredBuiltInOffers(env?: AffiliateOfferEnv): AffiliateOffer[] {
  const configs: Array<{
    id: string;
    label: string;
    keys: string[];
    type: AffiliateOffer['type'];
    niche_keywords: string[];
    notes?: string;
  }> = [
    {
      id: 'ai-devtools',
      label: envString(env, 'AFFILIATE_AI_DEVTOOLS_LABEL') || 'AI developer tools',
      keys: ['AFFILIATE_AI_DEVTOOLS_URL', 'PUBLIC_AFFILIATE_AI_DEVTOOLS_URL'],
      type: 'affiliate',
      niche_keywords: templateKeywords('ai-devtools')
    },
    {
      id: 'cybersecurity',
      label: envString(env, 'AFFILIATE_CYBERSECURITY_LABEL') || 'Cybersecurity tools',
      keys: ['AFFILIATE_CYBERSECURITY_URL', 'PUBLIC_AFFILIATE_CYBERSECURITY_URL'],
      type: 'affiliate',
      niche_keywords: templateKeywords('cybersecurity')
    },
    {
      id: 'saas-founder-tools',
      label: envString(env, 'AFFILIATE_SAAS_LABEL') || 'SaaS founder tools',
      keys: ['AFFILIATE_SAAS_URL', 'PUBLIC_AFFILIATE_SAAS_URL'],
      type: 'affiliate',
      niche_keywords: templateKeywords('saas-founder-tools')
    },
    {
      id: 'cloud-infrastructure',
      label: envString(env, 'AFFILIATE_CLOUD_INFRA_LABEL') || 'Cloud infrastructure tools',
      keys: ['AFFILIATE_CLOUD_INFRA_URL', 'PUBLIC_AFFILIATE_CLOUD_INFRA_URL'],
      type: 'affiliate',
      niche_keywords: templateKeywords('cloud-infrastructure')
    },
    {
      id: 'business-legal-compliance',
      label: envString(env, 'AFFILIATE_COMPLIANCE_LABEL') || 'Business compliance tools',
      keys: ['AFFILIATE_COMPLIANCE_URL', 'PUBLIC_AFFILIATE_COMPLIANCE_URL'],
      type: 'referral',
      niche_keywords: templateKeywords('business-legal-compliance')
    }
  ];

  return configs
    .map((config) => {
      const url = config.keys.map((key) => envString(env, key)).find(Boolean) || '';

      return normalizeOffer({
        id: config.id,
        label: config.label,
        url,
        type: config.type,
        niche_keywords: config.niche_keywords,
        notes: config.notes
      });
    })
    .filter((offer): offer is AffiliateOffer => Boolean(offer));
}

function configuredJsonOffers(env?: AffiliateOfferEnv): AffiliateOffer[] {
  const raw = envString(env, 'AFFILIATE_OFFERS_JSON');

  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => normalizeOffer(item))
      .filter((offer): offer is AffiliateOffer => Boolean(offer));
  } catch {
    return [];
  }
}

export function getConfiguredAffiliateOffers(env?: AffiliateOfferEnv): AffiliateOffer[] {
  const configured = [
    ...configuredBuiltInOffers(env),
    ...configuredJsonOffers(env),
    ...AFFILIATE_OFFERS.map((offer) => normalizeOffer(offer)).filter(
      (offer): offer is AffiliateOffer => Boolean(offer)
    )
  ];

  const byId = new Map<string, AffiliateOffer>();

  for (const offer of configured) {
    if (!byId.has(offer.id)) {
      byId.set(offer.id, offer);
    }
  }

  return Array.from(byId.values());
}

function keywordWeight(keyword: string): number {
  if (keyword.length >= 18) return 2.5;
  if (keyword.includes(' ')) return 2;
  if (keyword.length >= 8) return 1.35;
  return 1;
}

function scoreOffer(haystack: string, offer: AffiliateOffer): {
  score: number;
  matched_keywords: string[];
} {
  const matchedKeywords = uniqueStrings(offer.niche_keywords).filter((keyword) =>
    haystack.includes(normalizeKeyword(keyword))
  );

  const score = matchedKeywords.reduce((total, keyword) => total + keywordWeight(keyword), 0);

  return {
    score,
    matched_keywords: matchedKeywords
  };
}

export function matchAffiliateOffers(input: {
  env?: AffiliateOfferEnv;
  title?: string;
  niche?: string;
  summary?: string;
  evidence?: string;
  buyer_type?: string;
  product_type?: string;
  source_refs?: string[];
  limit?: number;
}): MatchedAffiliateOffer[] {
  const haystack = [
    input.title || '',
    input.niche || '',
    input.summary || '',
    input.evidence || '',
    input.buyer_type || '',
    input.product_type || '',
    ...(Array.isArray(input.source_refs) ? input.source_refs : [])
  ]
    .join(' ')
    .toLowerCase();

  const limit = Math.max(0, Number(input.limit ?? 3));

  if (!haystack.trim() || limit <= 0) return [];

  return getConfiguredAffiliateOffers(input.env)
    .map((offer) => {
      const scored = scoreOffer(haystack, offer);

      return {
        ...offer,
        match_score: Number(scored.score.toFixed(2)),
        matched_keywords: scored.matched_keywords
      };
    })
    .filter((offer) => offer.match_score > 0)
    .sort((a, b) => {
      if (b.match_score !== a.match_score) return b.match_score - a.match_score;
      return a.label.localeCompare(b.label);
    })
    .slice(0, limit);
}

export function buildAffiliateOfferLinks(input: {
  env?: AffiliateOfferEnv;
  title?: string;
  niche?: string;
  summary?: string;
  evidence?: string;
  buyer_type?: string;
  product_type?: string;
  source_refs?: string[];
  limit?: number;
}): OfferLink[] {
  return matchAffiliateOffers(input).map((offer) => ({
    id: offer.id,
    label: offer.label,
    url: offer.url,
    type: offer.type,
    notes: offer.notes,
    match_score: offer.match_score,
    matched_keywords: offer.matched_keywords
  }));
}