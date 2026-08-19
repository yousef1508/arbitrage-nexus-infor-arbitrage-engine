import type { EarningAsset } from './types';

const DEFAULT_ORIGIN = 'https://arbitragenexus.net';
const DEFAULT_SITE_NAME = 'Arbitrage Nexus Intelligence Market';
const DEFAULT_SITE_DESCRIPTION =
  'Machine-readable autonomous intelligence reports generated from public market signals. Full paid reports unlock only after verified on-chain payment.';

type SeoAsset = Partial<EarningAsset> & Record<string, any>;

function cleanText(value: unknown): string {
  return String(value ?? '')
    .replace(/\uFFFD/g, '')
    .replace(/�/g, '')
    .replace(/â€¦/g, '...')
    .replace(/â¦/g, '...')
    .replace(/…/g, '...')
    .replace(/â€“/g, '-')
    .replace(/â€”/g, '-')
    .replace(/â€˜/g, "'")
    .replace(/â€™/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(value: unknown): string {
  return cleanText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function stripHtml(value: unknown): string {
  return cleanText(
    String(value ?? '')
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  );
}

function shortText(value: unknown, max = 155): string {
  const text = stripHtml(value);

  if (text.length <= max) {
    return text;
  }

  return `${text.slice(0, Math.max(0, max - 3)).trim()}...`;
}

function safeIso(value: unknown): string {
  const n = Number(value);

  if (!Number.isFinite(n) || n <= 0) {
    return new Date().toISOString();
  }

  return new Date(n).toISOString();
}

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function absoluteUrl(origin: string, path: string): string {
  const cleanOrigin = cleanText(origin || DEFAULT_ORIGIN).replace(/\/+$/, '') || DEFAULT_ORIGIN;
  const cleanPath = String(path || '').startsWith('/') ? String(path || '') : `/${path}`;

  return `${cleanOrigin}${cleanPath}`;
}

function safeSlug(value: unknown, fallback = 'report'): string {
  const raw = cleanText(value || fallback)
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return raw || fallback;
}

function getSlug(asset: SeoAsset, explicitSlug?: string): string {
  return safeSlug(explicitSlug || asset.slug || asset.report_slug || asset.id || asset.asset_id || asset.title || 'report');
}

function getAssetId(asset: SeoAsset): string {
  return cleanText(asset.id || asset.asset_id || getSlug(asset));
}

function getProjectedMarketValueUsd(asset: SeoAsset): number {
  const value = Number(
    asset?.projected_market_value_usd ??
      asset?.full_report_json?.projected_market_value_usd ??
      asset?.full_report_json?.pricing?.projected_market_value_usd ??
      asset?.potential_profit ??
      0
  );

  return Number.isFinite(value) && value > 0 ? Number(value.toFixed(2)) : 0;
}

function getProjectedMarketValueNok(asset: SeoAsset): number {
  const value = Number(
    asset?.projected_market_value_nok ??
      asset?.full_report_json?.projected_market_value_nok ??
      asset?.full_report_json?.pricing?.projected_market_value_nok ??
      0
  );

  return Number.isFinite(value) && value > 0 ? Number(value.toFixed(2)) : 0;
}

function getMarketValueScore(asset: SeoAsset): number {
  const value = Number(
    asset?.market_value_score ??
      asset?.full_report_json?.market_value_score ??
      asset?.full_report_json?.pricing?.market_value_score ??
      0
  );

  return Number.isFinite(value) && value > 0 ? Number(value.toFixed(3)) : 0;
}

function getPriceNok(asset: SeoAsset): number {
  return Math.max(0, Number(safeNumber(asset.price_nok, 0).toFixed(2)));
}

function getReportTitle(asset: SeoAsset): string {
  const explicit = cleanText(asset.seo_title);

  if (explicit) {
    return shortText(explicit, 90);
  }

  const base = cleanText(asset.title || asset.opportunity_title || 'Autonomous Intelligence Report');

  return shortText(`${base} | Paid Machine-Readable Intelligence Report`, 90);
}

function getReportDescription(asset: SeoAsset): string {
  const explicit = cleanText(asset.seo_description);

  if (explicit) {
    return shortText(explicit, 155);
  }

  const executiveSummary = asset.full_report_json?.executive_summary;

  const jsonSummary = cleanText(
    typeof executiveSummary === 'string'
      ? executiveSummary
      : executiveSummary?.summary ||
          asset.full_report_json?.summary ||
          asset.full_report_json?.preview ||
          asset.summary ||
          asset.notes
  );

  if (jsonSummary) {
    return shortText(jsonSummary, 155);
  }

  const parts = [
    asset.title || asset.opportunity_title,
    asset.niche ? `Niche: ${asset.niche}` : '',
    asset.buyer_type ? `Buyer: ${asset.buyer_type}` : '',
    asset.product_type ? `Product: ${asset.product_type}` : '',
    'Machine-readable paid intelligence report with public metadata, preview JSON, and verified crypto unlock.'
  ]
    .map(cleanText)
    .filter(Boolean);

  return shortText(parts.join('. '), 155);
}

function getReportKeywords(asset: SeoAsset): string[] {
  return Array.from(
    new Set(
      [
        asset.niche,
        asset.buyer_type,
        asset.product_type,
        asset.price_tier,
        asset.monetization_channel,
        'autonomous intelligence',
        'market intelligence',
        'machine-readable report',
        'AI agent commerce',
        'arbitrage signal',
        'paid intelligence payload',
        'crypto unlock',
        'on-chain payment verification',
        'public report metadata',
        'intelligence marketplace'
      ]
        .map(cleanText)
        .filter(Boolean)
    )
  ).slice(0, 20);
}

function buildReportPublicUrls(origin: string, slug: string) {
  return {
    page: absoluteUrl(origin, `/reports/${slug}`),
    metadata_json: absoluteUrl(origin, `/reports/${slug}/metadata.json`),
    preview_json: absoluteUrl(origin, `/reports/${slug}/preview.json`),
    full_json: absoluteUrl(origin, `/reports/${slug}/full.json`),
    verify_payment: absoluteUrl(origin, `/reports/${slug}/verify-payment`)
  };
}

function assertPublicUrl(url: string): string {
  const text = cleanText(url);

  if (
    text.includes('/api/system') ||
    text.includes('/api/admin') ||
    text.includes('/api/treasury') ||
    text.includes('/messages') ||
    text.includes('/admin') ||
    text.includes('/market-stats.json') ||
    text.includes('/dashboard') ||
    text.includes('/setup') ||
    text.includes('/policy') ||
    text.includes('/withdraw')
  ) {
    return DEFAULT_ORIGIN;
  }

  return text;
}

function buildAdditionalProperties(asset: SeoAsset): Array<Record<string, unknown>> {
  const projectedUsd = getProjectedMarketValueUsd(asset);
  const projectedNok = getProjectedMarketValueNok(asset);
  const marketValueScore = getMarketValueScore(asset);

  const properties: Array<Record<string, unknown>> = [
    {
      '@type': 'PropertyValue',
      name: 'projected_value_label',
      value: 'projected_market_value_only_not_verified_revenue'
    },
    {
      '@type': 'PropertyValue',
      name: 'projected_values_are_not_revenue',
      value: true
    },
    {
      '@type': 'PropertyValue',
      name: 'payment_required_for_full_report',
      value: true
    },
    {
      '@type': 'PropertyValue',
      name: 'verified_revenue_only_after_onchain_payment',
      value: true
    },
    {
      '@type': 'PropertyValue',
      name: 'admin_token_required_for_system_routes',
      value: true
    },
    {
      '@type': 'PropertyValue',
      name: 'public_buyer_unlock_route',
      value: '/reports/:slug/verify-payment'
    },
    {
      '@type': 'PropertyValue',
      name: 'locked_full_json_status',
      value: '402_PAYMENT_REQUIRED'
    },
    {
      '@type': 'PropertyValue',
      name: 'unlock_status',
      value: cleanText(asset.unlock_status || asset.status || 'locked')
    }
  ];

  if (projectedUsd > 0) {
    properties.push({
      '@type': 'PropertyValue',
      name: 'projected_market_value_usd',
      value: projectedUsd
    });
  }

  if (projectedNok > 0) {
    properties.push({
      '@type': 'PropertyValue',
      name: 'projected_market_value_nok',
      value: projectedNok
    });
  }

  if (marketValueScore > 0) {
    properties.push({
      '@type': 'PropertyValue',
      name: 'market_value_score',
      value: marketValueScore
    });
  }

  return properties;
}

export function buildReportJsonLd(params: {
  asset: EarningAsset;
  origin: string;
  slug: string;
}) {
  const { asset, origin } = params;
  const seoAsset = asset as SeoAsset;
  const slug = getSlug(seoAsset, params.slug);
  const urls = buildReportPublicUrls(origin, slug);

  const pageUrl = assertPublicUrl(urls.page);
  const metadataUrl = assertPublicUrl(urls.metadata_json);
  const previewUrl = assertPublicUrl(urls.preview_json);
  const fullJsonUrl = assertPublicUrl(urls.full_json);
  const verifyPaymentUrl = assertPublicUrl(urls.verify_payment);

  const price = getPriceNok(seoAsset);
  const title = getReportTitle(seoAsset);
  const description = getReportDescription(seoAsset);
  const keywords = getReportKeywords(seoAsset);

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${absoluteUrl(origin, '/reports')}#website`,
        name: DEFAULT_SITE_NAME,
        description: DEFAULT_SITE_DESCRIPTION,
        url: absoluteUrl(origin, '/reports')
      },
      {
        '@type': 'WebPage',
        '@id': `${pageUrl}#webpage`,
        url: pageUrl,
        name: title,
        description,
        datePublished: safeIso(seoAsset.created_at),
        dateModified: safeIso(seoAsset.updated_at || seoAsset.created_at),
        isPartOf: {
          '@id': `${absoluteUrl(origin, '/reports')}#website`
        },
        mainEntity: {
          '@id': `${pageUrl}#report`
        },
        potentialAction: {
          '@type': 'ViewAction',
          target: pageUrl,
          name: 'Open public report page'
        }
      },
      {
        '@type': 'Product',
        '@id': `${pageUrl}#product`,
        name: title,
        description,
        category: cleanText(seoAsset.product_type || 'paid_intelligence_payload'),
        url: pageUrl,
        offers: {
          '@type': 'Offer',
          priceCurrency: 'NOK',
          price,
          availability: 'https://schema.org/InStock',
          url: pageUrl,
          itemCondition: 'https://schema.org/NewCondition'
        },
        additionalProperty: buildAdditionalProperties(seoAsset)
      },
      {
        '@type': 'Dataset',
        '@id': `${pageUrl}#report`,
        identifier: getAssetId(seoAsset),
        name: cleanText(seoAsset.title || title),
        description,
        url: pageUrl,
        sameAs: [metadataUrl, previewUrl],
        distribution: [
          {
            '@type': 'DataDownload',
            encodingFormat: 'application/json',
            contentUrl: metadataUrl,
            name: 'Public report metadata'
          },
          {
            '@type': 'DataDownload',
            encodingFormat: 'application/json',
            contentUrl: previewUrl,
            name: 'Public report preview'
          },
          {
            '@type': 'DataDownload',
            encodingFormat: 'application/json',
            contentUrl: fullJsonUrl,
            name: 'Locked full report payload',
            description: 'Returns 402 PAYMENT_REQUIRED until verified payment unlocks the report.'
          }
        ],
        dateCreated: safeIso(seoAsset.created_at),
        dateModified: safeIso(seoAsset.updated_at || seoAsset.created_at),
        keywords,
        isAccessibleForFree: false,
        offers: {
          '@type': 'Offer',
          priceCurrency: 'NOK',
          price,
          availability: 'https://schema.org/InStock',
          url: pageUrl,
          category: cleanText(seoAsset.product_type || 'paid_intelligence_payload')
        },
        potentialAction: {
          '@type': 'PayAction',
          target: verifyPaymentUrl,
          name: 'Verify public on-chain crypto payment'
        },
        additionalProperty: buildAdditionalProperties(seoAsset)
      }
    ]
  };
}

export function buildReportMetaTags(params: {
  asset: EarningAsset;
  origin: string;
  slug: string;
}) {
  const { asset, origin } = params;
  const seoAsset = asset as SeoAsset;
  const slug = getSlug(seoAsset, params.slug);
  const urls = buildReportPublicUrls(origin, slug);
  const pageUrl = assertPublicUrl(urls.page);

  const title = getReportTitle(seoAsset);
  const description = getReportDescription(seoAsset);

  return [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${escapeHtml(pageUrl)}" />`,
    `<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large" />`,

    `<meta property="og:type" content="article" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(pageUrl)}" />`,
    `<meta property="og:site_name" content="${escapeHtml(DEFAULT_SITE_NAME)}" />`,

    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,

    `<meta name="nexus:public_report_url" content="${escapeHtml(pageUrl)}" />`,
    `<meta name="nexus:metadata_json" content="${escapeHtml(assertPublicUrl(urls.metadata_json))}" />`,
    `<meta name="nexus:preview_json" content="${escapeHtml(assertPublicUrl(urls.preview_json))}" />`,
    `<meta name="nexus:full_json" content="${escapeHtml(assertPublicUrl(urls.full_json))}" />`,
    `<meta name="nexus:verify_payment" content="${escapeHtml(assertPublicUrl(urls.verify_payment))}" />`,
    `<meta name="nexus:payment_required" content="true" />`,
    `<meta name="nexus:locked_full_json_status" content="402_PAYMENT_REQUIRED" />`,
    `<meta name="nexus:projected_values_are_not_revenue" content="true" />`,
    `<meta name="nexus:verified_revenue_requires_onchain_payment" content="true" />`
  ].join('\n  ');
}

export function buildJsonLdScript(jsonLd: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(jsonLd)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')}</script>`;
}

export function injectJsonLdIntoHead(html: string, jsonLd: unknown): string {
  const script = buildJsonLdScript(jsonLd);

  if (html.includes('</head>')) {
    return html.replace('</head>', `  ${script}\n</head>`);
  }

  return `${script}\n${html}`;
}

export function injectMetaAndJsonLdIntoHead(params: {
  html: string;
  asset: EarningAsset;
  origin: string;
  slug: string;
}): string {
  const { html, asset, origin, slug } = params;

  const jsonLd = buildReportJsonLd({ asset, origin, slug });
  const metaTags = buildReportMetaTags({ asset, origin, slug });
  const jsonLdScript = buildJsonLdScript(jsonLd);

  const injection = `${metaTags}\n  ${jsonLdScript}`;

  if (html.includes('</head>')) {
    return html.replace('</head>', `  ${injection}\n</head>`);
  }

  return `${injection}\n${html}`;
}

export function buildCatalogJsonLd(params: {
  origin: string;
  assets: EarningAsset[];
}) {
  const { origin, assets } = params;

  const reportsUrl = absoluteUrl(origin, '/reports');

  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${reportsUrl}#collection`,
    name: DEFAULT_SITE_NAME,
    description: DEFAULT_SITE_DESCRIPTION,
    url: reportsUrl,
    isPartOf: {
      '@type': 'WebSite',
      name: DEFAULT_SITE_NAME,
      url: reportsUrl
    },
    hasPart: assets.slice(0, 100).map((asset) => {
      const seoAsset = asset as SeoAsset;
      const slug = getSlug(seoAsset);
      const urls = buildReportPublicUrls(origin, slug);
      const pageUrl = assertPublicUrl(urls.page);

      return {
        '@type': 'Dataset',
        '@id': `${pageUrl}#report`,
        name: cleanText(seoAsset.title || 'Paid intelligence report'),
        description: getReportDescription(seoAsset),
        url: pageUrl,
        sameAs: [
          assertPublicUrl(urls.metadata_json),
          assertPublicUrl(urls.preview_json)
        ],
        dateCreated: safeIso(seoAsset.created_at),
        dateModified: safeIso(seoAsset.updated_at || seoAsset.created_at),
        isAccessibleForFree: false,
        offers: {
          '@type': 'Offer',
          priceCurrency: 'NOK',
          price: getPriceNok(seoAsset),
          availability: 'https://schema.org/InStock',
          url: pageUrl
        },
        potentialAction: {
          '@type': 'PayAction',
          target: assertPublicUrl(urls.verify_payment),
          name: 'Verify public on-chain crypto payment'
        },
        additionalProperty: [
          {
            '@type': 'PropertyValue',
            name: 'projected_value_label',
            value: 'projected_market_value_only_not_verified_revenue'
          },
          {
            '@type': 'PropertyValue',
            name: 'payment_required_for_full_report',
            value: true
          },
          {
            '@type': 'PropertyValue',
            name: 'locked_full_json_status',
            value: '402_PAYMENT_REQUIRED'
          }
        ]
      };
    })
  };
}

export function buildCatalogMetaTags(params: {
  origin: string;
  title?: string;
  description?: string;
}) {
  const title = cleanText(params.title) || DEFAULT_SITE_NAME;
  const description = cleanText(params.description) || DEFAULT_SITE_DESCRIPTION;
  const pageUrl = absoluteUrl(params.origin, '/reports');

  return [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(shortText(description, 155))}" />`,
    `<link rel="canonical" href="${escapeHtml(pageUrl)}" />`,
    `<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large" />`,

    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(shortText(description, 155))}" />`,
    `<meta property="og:url" content="${escapeHtml(pageUrl)}" />`,
    `<meta property="og:site_name" content="${escapeHtml(DEFAULT_SITE_NAME)}" />`,

    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(shortText(description, 155))}" />`,

    `<meta name="nexus:public_catalog_url" content="${escapeHtml(pageUrl)}" />`,
    `<meta name="nexus:reports_json" content="${escapeHtml(absoluteUrl(params.origin, '/reports.json'))}" />`,
    `<meta name="nexus:signals_json" content="${escapeHtml(absoluteUrl(params.origin, '/signals.json'))}" />`,
    `<meta name="nexus:opportunities_json" content="${escapeHtml(absoluteUrl(params.origin, '/opportunities.json'))}" />`,
    `<meta name="nexus:feed_xml" content="${escapeHtml(absoluteUrl(params.origin, '/feed.xml'))}" />`,
    `<meta name="nexus:sitemap_xml" content="${escapeHtml(absoluteUrl(params.origin, '/sitemap.xml'))}" />`,
    `<meta name="nexus:projected_values_are_not_revenue" content="true" />`,
    `<meta name="nexus:verified_revenue_requires_onchain_payment" content="true" />`
  ].join('\n  ');
}

export function injectCatalogMetaAndJsonLdIntoHead(params: {
  html: string;
  origin: string;
  assets: EarningAsset[];
  title?: string;
  description?: string;
}): string {
  const jsonLd = buildCatalogJsonLd({
    origin: params.origin,
    assets: params.assets
  });

  const metaTags = buildCatalogMetaTags({
    origin: params.origin,
    title: params.title,
    description: params.description
  });

  const jsonLdScript = buildJsonLdScript(jsonLd);
  const injection = `${metaTags}\n  ${jsonLdScript}`;

  if (params.html.includes('</head>')) {
    return params.html.replace('</head>', `  ${injection}\n</head>`);
  }

  return `${injection}\n${params.html}`;
}

export function buildDiscoveryJson(params: {
  origin: string;
  assets: EarningAsset[];
}) {
  const { origin, assets } = params;

  const reports = assets.slice(0, 250).map((asset) => {
    const seoAsset = asset as SeoAsset;
    const slug = getSlug(seoAsset);
    const urls = buildReportPublicUrls(origin, slug);

    return {
      id: getAssetId(seoAsset),
      slug,
      title: cleanText(seoAsset.title || seoAsset.opportunity_title || 'Paid intelligence report'),
      description: getReportDescription(seoAsset),
      niche: cleanText(seoAsset.niche || 'Market Intelligence'),
      product_type: cleanText(seoAsset.product_type || 'paid_intelligence_payload'),
      buyer_type: cleanText(seoAsset.buyer_type || 'technical and commercial intelligence buyers'),
      price_nok: getPriceNok(seoAsset),
      projected_market_value_usd: getProjectedMarketValueUsd(seoAsset),
      projected_value_label: 'projected_market_value_only_not_verified_revenue',
      unlock_status: cleanText(seoAsset.unlock_status || 'locked'),
      payment_required: true,
      verified_revenue_required: true,
      urls: {
        page: assertPublicUrl(urls.page),
        metadata_json: assertPublicUrl(urls.metadata_json),
        preview_json: assertPublicUrl(urls.preview_json),
        full_json: assertPublicUrl(urls.full_json),
        verify_payment: assertPublicUrl(urls.verify_payment)
      }
    };
  });

  return {
    success: true,
    kind: 'arbitrage_nexus_discovery',
    generated_at: Date.now(),
    generated_at_iso: new Date().toISOString(),
    site: {
      name: DEFAULT_SITE_NAME,
      description: DEFAULT_SITE_DESCRIPTION,
      origin,
      public_catalog_url: absoluteUrl(origin, '/reports'),
      reports_json_url: absoluteUrl(origin, '/reports.json'),
      signals_json_url: absoluteUrl(origin, '/signals.json'),
      opportunities_json_url: absoluteUrl(origin, '/opportunities.json'),
      sitemap_url: absoluteUrl(origin, '/sitemap.xml'),
      feed_url: absoluteUrl(origin, '/feed.xml'),
      llms_txt_url: absoluteUrl(origin, '/llms.txt'),
      agents_txt_url: absoluteUrl(origin, '/agents.txt')
    },
    policy: {
      public_buyer_routes_do_not_require_admin_token: true,
      admin_system_routes_are_not_buyer_routes: true,
      full_report_json_locked_until_payment: true,
      locked_full_json_status: '402_PAYMENT_REQUIRED',
      verify_payment_route: '/reports/:slug/verify-payment',
      projected_values_are_not_revenue: true,
      verified_revenue_only_after_onchain_payment: true
    },
    public_routes: [
      '/reports',
      '/reports.json',
      '/signals.json',
      '/opportunities.json',
      '/feed.xml',
      '/sitemap.xml',
      '/robots.txt',
      '/discovery.json',
      '/llms.txt',
      '/agents.txt',
      '/reports/:slug',
      '/reports/:slug/metadata.json',
      '/reports/:slug/preview.json',
      '/reports/:slug/full.json',
      '/reports/:slug/verify-payment'
    ],
    private_routes_not_for_buyers: [
      '/api/system/*',
      '/api/admin/*',
      '/messages',
      '/ingest',
      '/market-stats.json',
      '/admin',
      '/dashboard',
      '/setup',
      '/policy',
      '/withdraw'
    ],
    count: reports.length,
    reports
  };
}

export function buildLlmsTxt(params: {
  origin: string;
  assets: EarningAsset[];
}): string {
  const { origin, assets } = params;
  const topReports = assets.slice(0, 40).map((asset) => {
    const seoAsset = asset as SeoAsset;
    const slug = getSlug(seoAsset);
    const urls = buildReportPublicUrls(origin, slug);
    const title = cleanText(seoAsset.title || seoAsset.opportunity_title || 'Paid intelligence report');
    const description = getReportDescription(seoAsset);

    return `- [${title}](${assertPublicUrl(urls.page)}): ${description}`;
  });

  return [
    '# Arbitrage Nexus',
    '',
    '> Machine-readable autonomous intelligence reports generated from public market signals.',
    '',
    '## Public discovery',
    '',
    `- Catalog: ${absoluteUrl(origin, '/reports')}`,
    `- Reports JSON: ${absoluteUrl(origin, '/reports.json')}`,
    `- Signals JSON: ${absoluteUrl(origin, '/signals.json')}`,
    `- Opportunities JSON: ${absoluteUrl(origin, '/opportunities.json')}`,
    `- Discovery JSON: ${absoluteUrl(origin, '/discovery.json')}`,
    `- RSS: ${absoluteUrl(origin, '/feed.xml')}`,
    `- Sitemap: ${absoluteUrl(origin, '/sitemap.xml')}`,
    '',
    '## Payment and access policy',
    '',
    '- Public metadata and previews are free to inspect.',
    '- Full report JSON returns 402 PAYMENT_REQUIRED until verified on-chain payment unlocks the report.',
    '- Projected market values are not revenue.',
    '- Treasury revenue is counted only after external payment verification.',
    '- Buyers should use /reports/:slug/verify-payment, not admin or system routes.',
    '',
    '## Current reports',
    '',
    ...(topReports.length > 0 ? topReports : ['No public reports are currently listed.'])
  ].join('\n');
}

export function buildAgentsTxt(params: {
  origin: string;
  assets: EarningAsset[];
}): string {
  const { origin, assets } = params;

  return [
    '# Arbitrage Nexus Agent Instructions',
    '',
    'Purpose: discover, evaluate, and unlock paid machine-readable intelligence reports.',
    '',
    'Allowed public routes:',
    `GET ${absoluteUrl(origin, '/reports')}`,
    `GET ${absoluteUrl(origin, '/reports.json')}`,
    `GET ${absoluteUrl(origin, '/signals.json')}`,
    `GET ${absoluteUrl(origin, '/opportunities.json')}`,
    `GET ${absoluteUrl(origin, '/discovery.json')}`,
    `GET ${absoluteUrl(origin, '/feed.xml')}`,
    `GET ${absoluteUrl(origin, '/sitemap.xml')}`,
    `GET ${absoluteUrl(origin, '/reports/:slug')}`,
    `GET ${absoluteUrl(origin, '/reports/:slug/metadata.json')}`,
    `GET ${absoluteUrl(origin, '/reports/:slug/preview.json')}`,
    `GET ${absoluteUrl(origin, '/reports/:slug/full.json')}`,
    `POST ${absoluteUrl(origin, '/reports/:slug/verify-payment')}`,
    '',
    'Do not use these as buyer routes:',
    '- /api/system/*',
    '- /api/admin/*',
    '- /messages',
    '- /ingest',
    '- /market-stats.json',
    '- /admin',
    '- /dashboard',
    '- /setup',
    '- /policy',
    '- /withdraw',
    '',
    'Payment policy:',
    '- full.json may return 402 PAYMENT_REQUIRED when locked.',
    '- Submit a real transaction hash to /reports/:slug/verify-payment after payment.',
    '- Projected value is prioritization metadata only, not verified revenue.',
    '- Verified revenue exists only after on-chain payment verification.',
    '',
    `Current public report count: ${assets.length}`
  ].join('\n');
}


