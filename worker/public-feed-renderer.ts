import type {
  EarningAsset,
  NexusPublicReportCard,
  Opportunity
} from './types';

import {
  buildPublicReportCards,
  sanitizeOpportunityForPublic
} from './public-sanitizer';

export type PublicFeedRendererEnv = Record<string, unknown>;

export type PublicFeedRendererOptions = {
  origin: string;
  env?: PublicFeedRendererEnv;
  now?: number;
  site_title?: string;
  site_description?: string;
  language?: string;
  max_items?: number;
};

export type NexusJsonFeedAuthor = {
  name: string;
  url: string;
};

export type NexusJsonFeedItem = {
  id: string;
  url: string;
  external_url?: string;
  title: string;
  summary: string;
  content_text: string;
  date_published: string;
  date_modified: string;
  tags: string[];
  price_nok: number;
  price_usd: number;
  payment_available: boolean;
  unlock_status: string;
  urls: NexusPublicReportCard['urls'];
  payment_instruction: string;
  projected_market_value_nok?: number;
  projected_market_value_usd?: number;
  projected_value_label: 'projected_market_value_only_not_verified_revenue';
};

export type NexusJsonFeed = {
  version: 'https://jsonfeed.org/version/1.1';
  title: string;
  home_page_url: string;
  feed_url: string;
  description: string;
  language: string;
  authors: NexusJsonFeedAuthor[];
  items: NexusJsonFeedItem[];
};

export type NexusDiscoveryDocument = {
  success: true;
  kind: 'nexus_machine_readable_discovery';
  generated_at: number;
  generated_at_iso: string;
  site: {
    title: string;
    description: string;
    origin: string;
    reports_url: string;
    reports_json_url: string;
    signals_json_url: string;
    opportunities_json_url: string;
    discovery_json_url: string;
    feed_xml_url: string;
    feed_atom_url: string;
    feed_json_url: string;
    sitemap_url: string;
    robots_url: string;
  };
  public_routes: {
    reports_catalog: string;
    report_page_pattern: '/reports/:slug';
    report_metadata_pattern: '/reports/:slug/metadata.json';
    report_preview_pattern: '/reports/:slug/preview.json';
    report_full_pattern: '/reports/:slug/full.json';
    report_verify_payment_pattern: '/reports/:slug/verify-payment';
  };
  payment_policy: {
    payment_required_for_full_reports: true;
    locked_full_reports_return_402: true;
    verified_onchain_payment_only: true;
    projected_values_are_not_revenue: true;
    treasury_credit_requires_verified_receipt: true;
  };
  counts: {
    reports: number;
    opportunities: number;
  };
  reports: NexusPublicReportCard[];
  opportunities: Record<string, unknown>[];
};

const DEFAULT_SITE_TITLE = 'Arbitrage Nexus Intelligence Market';
const DEFAULT_SITE_DESCRIPTION =
  'Machine-readable market intelligence, arbitrage signals, and locked reports for autonomous buyers and AI agents.';
const DEFAULT_ORIGIN = 'https://arbitragenexus.net';

function cleanText(value: unknown): string {
  return String(value ?? '')
    .replace(/\uFFFD/g, '')
    .replace(/�/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function absoluteUrl(origin: string, path: string): string {
  const safeOrigin = stripTrailingSlash(cleanText(origin) || DEFAULT_ORIGIN);
  const safePath = path.startsWith('/') ? path : `/${path}`;

  return `${safeOrigin}${safePath}`;
}

function nowFromOptions(options: PublicFeedRendererOptions): number {
  return options.now || Date.now();
}

function maxItemsFromOptions(options: PublicFeedRendererOptions): number {
  const parsed = Number(options.max_items || 100);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 100;
  }

  return Math.max(1, Math.min(500, Math.floor(parsed)));
}

function siteTitle(options: PublicFeedRendererOptions): string {
  return cleanText(options.site_title) || DEFAULT_SITE_TITLE;
}

function siteDescription(options: PublicFeedRendererOptions): string {
  return cleanText(options.site_description) || DEFAULT_SITE_DESCRIPTION;
}

function siteLanguage(options: PublicFeedRendererOptions): string {
  return cleanText(options.language) || 'en';
}

function xmlEscape(value: unknown): string {
  return cleanText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function jsonHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);

  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', headers.get('Cache-Control') || 'public, max-age=120');
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('X-Robots-Tag', headers.get('X-Robots-Tag') || 'index, follow');

  return headers;
}

function xmlHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);

  headers.set('Content-Type', 'application/xml; charset=utf-8');
  headers.set('Cache-Control', headers.get('Cache-Control') || 'public, max-age=300');
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('X-Robots-Tag', headers.get('X-Robots-Tag') || 'index, follow');

  return headers;
}

function textHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);

  headers.set('Content-Type', 'text/plain; charset=utf-8');
  headers.set('Cache-Control', headers.get('Cache-Control') || 'public, max-age=300');
  headers.set('Access-Control-Allow-Origin', '*');

  return headers;
}

function cardTags(card: NexusPublicReportCard): string[] {
  return [
    card.niche,
    card.buyer_type,
    card.product_type,
    card.unlock_status,
    card.payment_available ? 'payment_available' : 'payment_unavailable',
    'paid_intelligence_report',
    'machine_readable_json',
    'crypto_unlock'
  ]
    .map(cleanText)
    .filter(Boolean)
    .slice(0, 12);
}

function cardPaymentInstruction(card: NexusPublicReportCard): string {
  if (!card.payment_available) {
    return 'Payment is temporarily unavailable for this report.';
  }

  return `Open ${card.urls.page}, send the required payment, then POST the transaction hash to ${card.urls.verify_payment}. Locked full reports return 402 PAYMENT_REQUIRED until verified.`;
}

function cardToJsonFeedItem(card: NexusPublicReportCard): NexusJsonFeedItem {
  const datePublished = new Date(card.created_at || card.updated_at).toISOString();
  const dateModified = new Date(card.updated_at || card.created_at).toISOString();

  return {
    id: card.asset_id,
    url: card.urls.page,
    external_url: card.urls.page,
    title: card.title,
    summary: card.preview,
    content_text: [
      card.preview,
      `Public report page: ${card.urls.page}`,
      `Metadata JSON: ${card.urls.metadata_json}`,
      `Preview JSON: ${card.urls.preview_json}`,
      `Full JSON: ${card.urls.full_json}`,
      `Verify payment: ${card.urls.verify_payment}`,
      `Price: ${card.price_display_nok} / ${card.price_display_usd}.`,
      cardPaymentInstruction(card),
      'Projected market values are strategic estimates only, not verified revenue.'
    ].join('\n\n'),
    date_published: datePublished,
    date_modified: dateModified,
    tags: cardTags(card),
    price_nok: card.price_nok,
    price_usd: card.price_usd,
    payment_available: card.payment_available,
    unlock_status: card.unlock_status,
    urls: card.urls,
    payment_instruction: cardPaymentInstruction(card),
    projected_market_value_nok: card.projected_market_value_nok,
    projected_market_value_usd: card.projected_market_value_usd,
    projected_value_label: 'projected_market_value_only_not_verified_revenue'
  };
}

function sortedCards(input: {
  assets: Array<Partial<EarningAsset> & Record<string, any>>;
  options: PublicFeedRendererOptions;
}): NexusPublicReportCard[] {
  const now = nowFromOptions(input.options);

  return buildPublicReportCards(input.assets, {
    origin: input.options.origin,
    env: input.options.env,
    now
  }).slice(0, maxItemsFromOptions(input.options));
}

export function renderNexusRssFeedXml(input: {
  assets: Array<Partial<EarningAsset> & Record<string, any>>;
  options: PublicFeedRendererOptions;
}): string {
  const now = nowFromOptions(input.options);
  const cards = sortedCards(input);

  const items = cards
    .map((card) => {
      const categories = cardTags(card)
        .map((tag) => `<category>${xmlEscape(tag)}</category>`)
        .join('');

      return `<item>
  <title>${xmlEscape(card.title)}</title>
  <link>${xmlEscape(card.urls.page)}</link>
  <guid isPermaLink="true">${xmlEscape(card.urls.page)}</guid>
  <description>${xmlEscape([
    card.preview,
    `Price: ${card.price_display_nok}.`,
    `Unlock: ${card.urls.page}#unlock`,
    `Preview JSON: ${card.urls.preview_json}`
  ].join(' '))}</description>
  <pubDate>${xmlEscape(new Date(card.created_at || card.updated_at).toUTCString())}</pubDate>
  <source url="${xmlEscape(absoluteUrl(input.options.origin, '/feed.xml'))}">${xmlEscape(siteTitle(input.options))}</source>
  ${categories}
</item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>${xmlEscape(siteTitle(input.options))}</title>
<link>${xmlEscape(absoluteUrl(input.options.origin, '/reports'))}</link>
<description>${xmlEscape(siteDescription(input.options))}</description>
<language>${xmlEscape(siteLanguage(input.options))}</language>
<lastBuildDate>${xmlEscape(new Date(now).toUTCString())}</lastBuildDate>
<ttl>5</ttl>
${items}
</channel>
</rss>`;
}

export function renderNexusAtomFeedXml(input: {
  assets: Array<Partial<EarningAsset> & Record<string, any>>;
  options: PublicFeedRendererOptions;
}): string {
  const now = nowFromOptions(input.options);
  const cards = sortedCards(input);
  const feedUrl = absoluteUrl(input.options.origin, '/feed.atom');

  const entries = cards
    .map((card) => `<entry>
  <id>${xmlEscape(card.urls.page)}</id>
  <title>${xmlEscape(card.title)}</title>
  <link href="${xmlEscape(card.urls.page)}" />
  <link rel="alternate" type="text/html" href="${xmlEscape(card.urls.page)}" />
  <link rel="related" type="application/json" href="${xmlEscape(card.urls.metadata_json)}" />
  <updated>${xmlEscape(new Date(card.updated_at || card.created_at).toISOString())}</updated>
  <published>${xmlEscape(new Date(card.created_at || card.updated_at).toISOString())}</published>
  <summary>${xmlEscape(card.preview)}</summary>
  <category term="${xmlEscape(card.niche)}" />
  <content type="text">${xmlEscape([
    card.preview,
    `Price: ${card.price_display_nok}.`,
    `Payment verification: ${card.urls.verify_payment}`,
    'Full report JSON is locked until verified payment.'
  ].join('\n\n'))}</content>
</entry>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<title>${xmlEscape(siteTitle(input.options))}</title>
<id>${xmlEscape(absoluteUrl(input.options.origin, '/reports'))}</id>
<link href="${xmlEscape(absoluteUrl(input.options.origin, '/reports'))}" />
<link rel="self" href="${xmlEscape(feedUrl)}" />
<updated>${xmlEscape(new Date(now).toISOString())}</updated>
<subtitle>${xmlEscape(siteDescription(input.options))}</subtitle>
${entries}
</feed>`;
}

export function renderNexusJsonFeed(input: {
  assets: Array<Partial<EarningAsset> & Record<string, any>>;
  options: PublicFeedRendererOptions;
}): NexusJsonFeed {
  const cards = sortedCards(input);

  return {
    version: 'https://jsonfeed.org/version/1.1',
    title: siteTitle(input.options),
    home_page_url: absoluteUrl(input.options.origin, '/reports'),
    feed_url: absoluteUrl(input.options.origin, '/feed.json'),
    description: siteDescription(input.options),
    language: siteLanguage(input.options),
    authors: [
      {
        name: siteTitle(input.options),
        url: absoluteUrl(input.options.origin, '/')
      }
    ],
    items: cards.map(cardToJsonFeedItem)
  };
}

export function renderNexusSitemapXml(input: {
  assets: Array<Partial<EarningAsset> & Record<string, any>>;
  options: PublicFeedRendererOptions;
}): string {
  const now = nowFromOptions(input.options);
  const cards = sortedCards(input);

  const staticUrls = [
    { loc: absoluteUrl(input.options.origin, '/'), priority: '1.0', changefreq: 'hourly' },
    { loc: absoluteUrl(input.options.origin, '/reports'), priority: '1.0', changefreq: 'hourly' },
    { loc: absoluteUrl(input.options.origin, '/reports.json'), priority: '0.9', changefreq: 'hourly' },
    { loc: absoluteUrl(input.options.origin, '/signals.json'), priority: '0.8', changefreq: 'hourly' },
    { loc: absoluteUrl(input.options.origin, '/opportunities.json'), priority: '0.8', changefreq: 'hourly' },
    { loc: absoluteUrl(input.options.origin, '/discovery.json'), priority: '0.8', changefreq: 'hourly' },
    { loc: absoluteUrl(input.options.origin, '/feed.xml'), priority: '0.7', changefreq: 'hourly' },
    { loc: absoluteUrl(input.options.origin, '/feed.atom'), priority: '0.7', changefreq: 'hourly' },
    { loc: absoluteUrl(input.options.origin, '/feed.json'), priority: '0.7', changefreq: 'hourly' }
  ];

  const reportUrls = cards.flatMap((card) => [
    {
      loc: card.urls.page,
      lastmod: card.freshness_iso,
      priority: '0.9',
      changefreq: 'daily'
    },
    {
      loc: card.urls.metadata_json,
      lastmod: card.freshness_iso,
      priority: '0.7',
      changefreq: 'daily'
    },
    {
      loc: card.urls.preview_json,
      lastmod: card.freshness_iso,
      priority: '0.7',
      changefreq: 'daily'
    }
  ]);

  const urls = [
    ...staticUrls.map((entry) => ({
      ...entry,
      lastmod: new Date(now).toISOString()
    })),
    ...reportUrls
  ];

  const body = urls
    .map((entry) => `<url>
  <loc>${xmlEscape(entry.loc)}</loc>
  <lastmod>${xmlEscape(entry.lastmod)}</lastmod>
  <changefreq>${xmlEscape(entry.changefreq)}</changefreq>
  <priority>${xmlEscape(entry.priority)}</priority>
</url>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;
}

export function renderNexusRobotsTxt(options: PublicFeedRendererOptions): string {
  return [
    'User-agent: *',
    'Allow: /',
    'Allow: /reports',
    'Allow: /reports/',
    'Allow: /reports.json',
    'Allow: /signals.json',
    'Allow: /opportunities.json',
    'Allow: /discovery.json',
    'Allow: /feed.xml',
    'Allow: /feed.atom',
    'Allow: /feed.json',
    'Allow: /sitemap.xml',
    '',
    '# Owner/private API surfaces are protected server-side, but crawlers should not index them.',
    'Disallow: /api/system/',
    'Disallow: /api/treasury/',
    'Disallow: /api/chat/',
    'Disallow: /api/admin/',
    'Disallow: /api/governor/',
    'Disallow: /admin',
    'Disallow: /admin-login',
    'Disallow: /dashboard',
    'Disallow: /setup',
    'Disallow: /policy',
    'Disallow: /withdraw',
    'Disallow: /ingest',
    'Disallow: /messages',
    'Disallow: /market-stats.json',
    'Disallow: /sources.json',
    '',
    `Sitemap: ${absoluteUrl(options.origin, '/sitemap.xml')}`,
    ''
  ].join('\n');
}

export function renderNexusDiscoveryJson(input: {
  assets: Array<Partial<EarningAsset> & Record<string, any>>;
  opportunities?: Array<Partial<Opportunity> & Record<string, any>>;
  options: PublicFeedRendererOptions;
}): NexusDiscoveryDocument {
  const now = nowFromOptions(input.options);
  const reports = sortedCards(input);
  const opportunities = (input.opportunities || [])
    .filter(Boolean)
    .map(sanitizeOpportunityForPublic)
    .slice(0, maxItemsFromOptions(input.options));

  return {
    success: true,
    kind: 'nexus_machine_readable_discovery',
    generated_at: now,
    generated_at_iso: new Date(now).toISOString(),
    site: {
      title: siteTitle(input.options),
      description: siteDescription(input.options),
      origin: absoluteUrl(input.options.origin, '/'),
      reports_url: absoluteUrl(input.options.origin, '/reports'),
      reports_json_url: absoluteUrl(input.options.origin, '/reports.json'),
      signals_json_url: absoluteUrl(input.options.origin, '/signals.json'),
      opportunities_json_url: absoluteUrl(input.options.origin, '/opportunities.json'),
      discovery_json_url: absoluteUrl(input.options.origin, '/discovery.json'),
      feed_xml_url: absoluteUrl(input.options.origin, '/feed.xml'),
      feed_atom_url: absoluteUrl(input.options.origin, '/feed.atom'),
      feed_json_url: absoluteUrl(input.options.origin, '/feed.json'),
      sitemap_url: absoluteUrl(input.options.origin, '/sitemap.xml'),
      robots_url: absoluteUrl(input.options.origin, '/robots.txt')
    },
    public_routes: {
      reports_catalog: absoluteUrl(input.options.origin, '/reports'),
      report_page_pattern: '/reports/:slug',
      report_metadata_pattern: '/reports/:slug/metadata.json',
      report_preview_pattern: '/reports/:slug/preview.json',
      report_full_pattern: '/reports/:slug/full.json',
      report_verify_payment_pattern: '/reports/:slug/verify-payment'
    },
    payment_policy: {
      payment_required_for_full_reports: true,
      locked_full_reports_return_402: true,
      verified_onchain_payment_only: true,
      projected_values_are_not_revenue: true,
      treasury_credit_requires_verified_receipt: true
    },
    counts: {
      reports: reports.length,
      opportunities: opportunities.length
    },
    reports,
    opportunities
  };
}

export function publicFeedJsonResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: jsonHeaders(init?.headers)
  });
}

export function publicFeedXmlResponse(xml: string, init?: ResponseInit): Response {
  return new Response(xml, {
    ...init,
    headers: xmlHeaders(init?.headers)
  });
}

export function publicFeedTextResponse(text: string, init?: ResponseInit): Response {
  return new Response(text, {
    ...init,
    headers: textHeaders(init?.headers)
  });
}

export function makeNexusRssFeedResponse(input: {
  assets: Array<Partial<EarningAsset> & Record<string, any>>;
  options: PublicFeedRendererOptions;
}): Response {
  return publicFeedXmlResponse(renderNexusRssFeedXml(input));
}

export function makeNexusAtomFeedResponse(input: {
  assets: Array<Partial<EarningAsset> & Record<string, any>>;
  options: PublicFeedRendererOptions;
}): Response {
  return publicFeedXmlResponse(renderNexusAtomFeedXml(input));
}

export function makeNexusJsonFeedResponse(input: {
  assets: Array<Partial<EarningAsset> & Record<string, any>>;
  options: PublicFeedRendererOptions;
}): Response {
  return publicFeedJsonResponse(renderNexusJsonFeed(input));
}

export function makeNexusSitemapResponse(input: {
  assets: Array<Partial<EarningAsset> & Record<string, any>>;
  options: PublicFeedRendererOptions;
}): Response {
  return publicFeedXmlResponse(renderNexusSitemapXml(input));
}

export function makeNexusRobotsResponse(options: PublicFeedRendererOptions): Response {
  return publicFeedTextResponse(renderNexusRobotsTxt(options));
}

export function makeNexusDiscoveryResponse(input: {
  assets: Array<Partial<EarningAsset> & Record<string, any>>;
  opportunities?: Array<Partial<Opportunity> & Record<string, any>>;
  options: PublicFeedRendererOptions;
}): Response {
  return publicFeedJsonResponse(renderNexusDiscoveryJson(input));
}