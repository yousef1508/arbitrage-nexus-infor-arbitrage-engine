import { Hono } from 'hono';

import type {
  EarningAsset,
  Opportunity
} from './types';

import {
  makePublicFullReportResponse,
  makePublicMarketResponse,
  makePublicReportMetadataResponse,
  makePublicReportPageResponse,
  makePublicReportPreviewResponse,
  makePublicReportsJsonResponse,
  publicJsonResponse,
  renderPublicOpportunitiesJson,
  renderPublicSignalsJson
} from './public-market-renderer';

import {
  makeNexusAtomFeedResponse,
  makeNexusDiscoveryResponse,
  makeNexusJsonFeedResponse,
  makeNexusRobotsResponse,
  makeNexusRssFeedResponse,
  makeNexusSitemapResponse
} from './public-feed-renderer';

import {
  buildPaymentRequestPublicJson
} from './payment-request';

import {
  buildCryptoPaymentAccountingEntries,
  verifyNativeCryptoPaymentFromEnv
} from './crypto-treasury';

export type PublicRouteState = {
  earning_assets?: EarningAsset[];
  opportunities?: Opportunity[];
};

export type PublicRouteContext = any;

export type PublicPaymentVerifiedEvent = {
  asset: EarningAsset;
  tx_hash: string;
  verification: Awaited<ReturnType<typeof verifyNativeCryptoPaymentFromEnv>>;
  accounting: ReturnType<typeof buildCryptoPaymentAccountingEntries>;
  request: Request;
};

export type PublicRoutesOptions = {
  getState?: (c: PublicRouteContext) => PublicRouteState | Promise<PublicRouteState>;
  onPaymentVerified?: (
    event: PublicPaymentVerifiedEvent,
    c: PublicRouteContext
  ) => unknown | Promise<unknown>;
  ownerAuthorized?: (c: PublicRouteContext) => boolean | Promise<boolean>;
  site_title?: string;
  site_description?: string;
  default_origin?: string;
};

export type PublicRouteResponseKind =
  | 'nexus_public_market'
  | 'nexus_public_reports_json'
  | 'nexus_public_report_page'
  | 'nexus_public_report_metadata'
  | 'nexus_public_report_preview'
  | 'nexus_public_full_report'
  | 'nexus_public_payment_request'
  | 'nexus_public_payment_verification'
  | 'nexus_public_feed'
  | 'nexus_public_discovery';

const DEFAULT_ORIGIN = 'https://arbitragenexus.net';
const DEFAULT_SITE_TITLE = 'Arbitrage Nexus Intelligence Market';
const DEFAULT_SITE_DESCRIPTION =
  'Machine-readable market intelligence, arbitrage signals, and locked reports for autonomous buyers and AI agents.';

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

function slugify(value: unknown, fallback = 'report'): string {
  const slug = cleanText(value || fallback)
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || fallback;
}

function getRequestOrigin(c: PublicRouteContext, fallback = DEFAULT_ORIGIN): string {
  try {
    const url = new URL(c.req.url);
    return `${url.protocol}//${url.host}`;
  } catch {
    return fallback;
  }
}

function getRouteOrigin(c: PublicRouteContext, options: PublicRoutesOptions): string {
  const env = c?.env || {};
  const configured = cleanText(
    env.PUBLIC_BASE_URL ||
      env.SITE_URL ||
      options.default_origin
  );

  return configured || getRequestOrigin(c, DEFAULT_ORIGIN);
}

function getRouteOptions(c: PublicRouteContext, options: PublicRoutesOptions) {
  return {
    origin: getRouteOrigin(c, options),
    env: c?.env || {},
    now: Date.now(),
    site_title: options.site_title || DEFAULT_SITE_TITLE,
    site_description: options.site_description || DEFAULT_SITE_DESCRIPTION
  };
}

async function getState(c: PublicRouteContext, options: PublicRoutesOptions): Promise<PublicRouteState> {
  const state = options.getState
    ? await options.getState(c)
    : {};

  return {
    earning_assets: Array.isArray(state?.earning_assets) ? state.earning_assets : [],
    opportunities: Array.isArray(state?.opportunities) ? state.opportunities : []
  };
}

function getAssetSlug(asset: Partial<EarningAsset> & Record<string, any>): string {
  return slugify(asset.slug || asset.id || asset.title || 'report');
}

function findAssetBySlug(
  assets: EarningAsset[],
  slug: string
): EarningAsset | null {
  const safeSlug = slugify(slug);

  return assets.find((asset) => {
    const assetSlug = getAssetSlug(asset as any);

    return (
      assetSlug === safeSlug ||
      cleanText(asset.slug) === slug ||
      cleanText(asset.id) === slug ||
      cleanText((asset as any).asset_id) === slug
    );
  }) || null;
}

function findAssetById(
  assets: EarningAsset[],
  assetId: string
): EarningAsset | null {
  const cleanId = cleanText(assetId);

  return assets.find((asset) =>
    cleanText(asset.id) === cleanId ||
    cleanText((asset as any).asset_id) === cleanId ||
    cleanText(asset.slug) === cleanId ||
    getAssetSlug(asset as any) === slugify(cleanId)
  ) || null;
}

function notFoundJson(resource: string): Response {
  return publicJsonResponse(
    {
      success: false,
      error: 'NOT_FOUND',
      resource
    },
    { status: 404 }
  );
}

function badRequestJson(error: string, details?: unknown): Response {
  return publicJsonResponse(
    {
      success: false,
      error,
      details
    },
    { status: 400 }
  );
}

function paymentRequiredJson(error: string, details?: unknown): Response {
  return publicJsonResponse(
    {
      success: false,
      error,
      details
    },
    { status: 402 }
  );
}

function serverErrorJson(error: unknown): Response {
  return publicJsonResponse(
    {
      success: false,
      error: 'PUBLIC_ROUTE_ERROR',
      message: error instanceof Error ? error.message : String(error)
    },
    { status: 500 }
  );
}

function getTxHashFromRequest(c: PublicRouteContext, body?: any): string {
  const fromBody = cleanText(
    body?.tx_hash ||
      body?.txHash ||
      body?.transaction_hash ||
      body?.transactionHash
  );

  if (fromBody) {
    return fromBody;
  }

  try {
    const url = new URL(c.req.url);
    return cleanText(
      url.searchParams.get('tx_hash') ||
        url.searchParams.get('txHash') ||
        url.searchParams.get('transaction_hash') ||
        url.searchParams.get('transactionHash')
    );
  } catch {
    return '';
  }
}

async function isOwnerAuthorizedForPublicRoute(
  c: PublicRouteContext,
  options: PublicRoutesOptions
): Promise<boolean> {
  if (!options.ownerAuthorized) {
    return false;
  }

  try {
    return Boolean(await options.ownerAuthorized(c));
  } catch {
    return false;
  }
}

async function renderMarket(c: PublicRouteContext, options: PublicRoutesOptions): Promise<Response> {
  const state = await getState(c, options);

  return makePublicMarketResponse({
    assets: state.earning_assets || [],
    options: getRouteOptions(c, options)
  });
}

async function renderReportsJson(c: PublicRouteContext, options: PublicRoutesOptions): Promise<Response> {
  const state = await getState(c, options);

  return makePublicReportsJsonResponse({
    assets: state.earning_assets || [],
    options: getRouteOptions(c, options)
  });
}

async function renderSignalsJson(c: PublicRouteContext, options: PublicRoutesOptions): Promise<Response> {
  const state = await getState(c, options);

  return publicJsonResponse(
    renderPublicSignalsJson({
      opportunities: state.opportunities || [],
      options: getRouteOptions(c, options)
    })
  );
}

async function renderOpportunitiesJson(c: PublicRouteContext, options: PublicRoutesOptions): Promise<Response> {
  const state = await getState(c, options);

  return publicJsonResponse(
    renderPublicOpportunitiesJson({
      opportunities: state.opportunities || [],
      options: getRouteOptions(c, options)
    })
  );
}

async function renderReportPage(
  c: PublicRouteContext,
  options: PublicRoutesOptions,
  slug: string
): Promise<Response> {
  const state = await getState(c, options);
  const asset = findAssetBySlug(state.earning_assets || [], slug);

  if (!asset) {
    return notFoundJson('report');
  }

  const ownerAuthorized = await isOwnerAuthorizedForPublicRoute(c, options);
  const txHash = getTxHashFromRequest(c);

  return makePublicReportPageResponse({
    asset,
    options: {
      ...getRouteOptions(c, options),
      owner_authorized: ownerAuthorized,
      tx_hash: txHash
    }
  });
}

async function renderReportMetadata(
  c: PublicRouteContext,
  options: PublicRoutesOptions,
  slug: string
): Promise<Response> {
  const state = await getState(c, options);
  const asset = findAssetBySlug(state.earning_assets || [], slug);

  if (!asset) {
    return notFoundJson('report_metadata');
  }

  return makePublicReportMetadataResponse({
    asset,
    options: getRouteOptions(c, options)
  });
}

async function renderReportPreview(
  c: PublicRouteContext,
  options: PublicRoutesOptions,
  slug: string
): Promise<Response> {
  const state = await getState(c, options);
  const asset = findAssetBySlug(state.earning_assets || [], slug);

  if (!asset) {
    return notFoundJson('report_preview');
  }

  return makePublicReportPreviewResponse({
    asset,
    options: getRouteOptions(c, options)
  });
}

async function renderFullReport(
  c: PublicRouteContext,
  options: PublicRoutesOptions,
  slug: string
): Promise<Response> {
  const state = await getState(c, options);
  const asset = findAssetBySlug(state.earning_assets || [], slug);

  if (!asset) {
    return notFoundJson('full_report');
  }

  const ownerAuthorized = await isOwnerAuthorizedForPublicRoute(c, options);
  const txHash = getTxHashFromRequest(c);

  return makePublicFullReportResponse({
    asset,
    options: {
      ...getRouteOptions(c, options),
      owner_authorized: ownerAuthorized,
      tx_hash: txHash
    }
  });
}

async function renderPaymentRequest(
  c: PublicRouteContext,
  options: PublicRoutesOptions,
  slug: string
): Promise<Response> {
  const state = await getState(c, options);
  const asset = findAssetBySlug(state.earning_assets || [], slug);

  if (!asset) {
    return notFoundJson('payment_request');
  }

  return publicJsonResponse(
    buildPaymentRequestPublicJson({
      asset,
      origin: getRouteOrigin(c, options),
      env: c?.env || {},
      now: Date.now()
    })
  );
}

async function verifyPaymentForAsset(
  c: PublicRouteContext,
  options: PublicRoutesOptions,
  asset: EarningAsset,
  body?: any
): Promise<Response> {
  const txHash = getTxHashFromRequest(c, body);

  if (!txHash) {
    return badRequestJson('TX_HASH_REQUIRED');
  }

  const priceNok = safeNumber(
    body?.required_price_nok ??
      body?.price_nok ??
      asset.price_nok,
    0
  );

  if (!priceNok || priceNok <= 0) {
    return paymentRequiredJson('REPORT_PRICE_NOK_REQUIRED');
  }

  if (!c?.env) {
    return badRequestJson('ENV_REQUIRED_FOR_PAYMENT_VERIFICATION');
  }

  const verification = await verifyNativeCryptoPaymentFromEnv({
    env: c.env,
    txHash,
    requiredPriceNok: priceNok,
    nativeDecimals: body?.native_decimals,
    minConfirmations: body?.min_confirmations,
    allowedUnderpaymentNok: body?.allowed_underpayment_nok,
    forceQuoteRefresh: body?.force_quote_refresh ?? true,
    allowStaleQuote: body?.allow_stale_quote ?? true,
    allowConfiguredFallback: body?.allow_configured_fallback ?? true
  });

  const accounting = buildCryptoPaymentAccountingEntries({
    receipt: verification.receipt,
    assetId: asset.id,
    opportunityId: asset.opportunity_id,
    agentId: cleanText(asset.agent_role),
    description: `Verified payment for report ${asset.title}`
  });

  let mutationResult: unknown = null;

  if (options.onPaymentVerified) {
    mutationResult = await options.onPaymentVerified(
      {
        asset,
        tx_hash: txHash,
        verification,
        accounting,
        request: c.req.raw
      },
      c
    );
  }

  return publicJsonResponse({
    success: true,
    kind: 'nexus_public_payment_verification',
    asset_id: asset.id,
    slug: asset.slug || getAssetSlug(asset as any),
    tx_hash: txHash,
    verification,
    accounting,
    state_mutation_requested: Boolean(options.onPaymentVerified),
    state_mutation_result: mutationResult,
    accounting_policy: {
      verified_revenue_only: true,
      projected_values_are_not_revenue: true,
      payment_request_is_not_revenue: true,
      treasury_credit_requires_verified_receipt: true
    }
  });
}

async function verifyReportPayment(
  c: PublicRouteContext,
  options: PublicRoutesOptions,
  slug: string
): Promise<Response> {
  try {
    const state = await getState(c, options);
    const asset = findAssetBySlug(state.earning_assets || [], slug);

    if (!asset) {
      return notFoundJson('report');
    }

    const body = await c.req.json().catch(() => ({}));

    return verifyPaymentForAsset(c, options, asset, body);
  } catch (error) {
    return serverErrorJson(error);
  }
}

async function verifyAssetPayment(
  c: PublicRouteContext,
  options: PublicRoutesOptions,
  assetId: string
): Promise<Response> {
  try {
    const state = await getState(c, options);
    const asset = findAssetById(state.earning_assets || [], assetId);

    if (!asset) {
      return notFoundJson('earning_asset');
    }

    const body = await c.req.json().catch(() => ({}));

    return verifyPaymentForAsset(c, options, asset, body);
  } catch (error) {
    return serverErrorJson(error);
  }
}

async function renderAssetById(
  c: PublicRouteContext,
  options: PublicRoutesOptions,
  assetId: string
): Promise<Response> {
  const state = await getState(c, options);
  const asset = findAssetById(state.earning_assets || [], assetId);

  if (!asset) {
    return notFoundJson('earning_asset');
  }

  return makePublicReportMetadataResponse({
    asset,
    options: getRouteOptions(c, options)
  });
}

async function renderRssFeed(c: PublicRouteContext, options: PublicRoutesOptions): Promise<Response> {
  const state = await getState(c, options);

  return makeNexusRssFeedResponse({
    assets: state.earning_assets || [],
    options: getRouteOptions(c, options)
  });
}

async function renderAtomFeed(c: PublicRouteContext, options: PublicRoutesOptions): Promise<Response> {
  const state = await getState(c, options);

  return makeNexusAtomFeedResponse({
    assets: state.earning_assets || [],
    options: getRouteOptions(c, options)
  });
}

async function renderJsonFeed(c: PublicRouteContext, options: PublicRoutesOptions): Promise<Response> {
  const state = await getState(c, options);

  return makeNexusJsonFeedResponse({
    assets: state.earning_assets || [],
    options: getRouteOptions(c, options)
  });
}

async function renderSitemap(c: PublicRouteContext, options: PublicRoutesOptions): Promise<Response> {
  const state = await getState(c, options);

  return makeNexusSitemapResponse({
    assets: state.earning_assets || [],
    options: getRouteOptions(c, options)
  });
}

async function renderDiscovery(c: PublicRouteContext, options: PublicRoutesOptions): Promise<Response> {
  const state = await getState(c, options);

  return makeNexusDiscoveryResponse({
    assets: state.earning_assets || [],
    opportunities: state.opportunities || [],
    options: getRouteOptions(c, options)
  });
}

function registerRoutes(app: Hono<any>, options: PublicRoutesOptions = {}) {
  app.get('/', async (c) => renderMarket(c, options));
  app.get('/reports', async (c) => renderMarket(c, options));
  app.get('/reports.json', async (c) => renderReportsJson(c, options));
  app.get('/signals.json', async (c) => renderSignalsJson(c, options));
  app.get('/opportunities.json', async (c) => renderOpportunitiesJson(c, options));

  app.get('/feed.xml', async (c) => renderRssFeed(c, options));
  app.get('/feed.atom', async (c) => renderAtomFeed(c, options));
  app.get('/feed.json', async (c) => renderJsonFeed(c, options));
  app.get('/sitemap.xml', async (c) => renderSitemap(c, options));
  app.get('/robots.txt', async (c) => makeNexusRobotsResponse(getRouteOptions(c, options)));
  app.get('/discovery.json', async (c) => renderDiscovery(c, options));

  app.get('/reports/:slug', async (c) => renderReportPage(c, options, c.req.param('slug')));
  app.get('/reports/:slug/metadata.json', async (c) => renderReportMetadata(c, options, c.req.param('slug')));
  app.get('/reports/:slug/preview.json', async (c) => renderReportPreview(c, options, c.req.param('slug')));
  app.get('/reports/:slug/full.json', async (c) => renderFullReport(c, options, c.req.param('slug')));
  app.get('/reports/:slug/payment.json', async (c) => renderPaymentRequest(c, options, c.req.param('slug')));
  app.post('/reports/:slug/verify-payment', async (c) => verifyReportPayment(c, options, c.req.param('slug')));

  app.get('/earning-assets/:assetId', async (c) => renderAssetById(c, options, c.req.param('assetId')));
  app.post('/earning-assets/:assetId/verify-payment', async (c) => verifyAssetPayment(c, options, c.req.param('assetId')));

  // API-prefixed mirrors are useful when public-routes.ts is mounted directly
  // instead of being reached through worker/userRoutes.ts.
  app.get('/api/reports', async (c) => renderMarket(c, options));
  app.get('/api/reports.json', async (c) => renderReportsJson(c, options));
  app.get('/api/signals.json', async (c) => renderSignalsJson(c, options));
  app.get('/api/opportunities.json', async (c) => renderOpportunitiesJson(c, options));

  app.get('/api/feed.xml', async (c) => renderRssFeed(c, options));
  app.get('/api/feed.atom', async (c) => renderAtomFeed(c, options));
  app.get('/api/feed.json', async (c) => renderJsonFeed(c, options));
  app.get('/api/sitemap.xml', async (c) => renderSitemap(c, options));
  app.get('/api/robots.txt', async (c) => makeNexusRobotsResponse(getRouteOptions(c, options)));
  app.get('/api/discovery.json', async (c) => renderDiscovery(c, options));

  app.get('/api/reports/:slug', async (c) => renderReportPage(c, options, c.req.param('slug')));
  app.get('/api/reports/:slug/metadata.json', async (c) => renderReportMetadata(c, options, c.req.param('slug')));
  app.get('/api/reports/:slug/preview.json', async (c) => renderReportPreview(c, options, c.req.param('slug')));
  app.get('/api/reports/:slug/full.json', async (c) => renderFullReport(c, options, c.req.param('slug')));
  app.get('/api/reports/:slug/payment.json', async (c) => renderPaymentRequest(c, options, c.req.param('slug')));
  app.post('/api/reports/:slug/verify-payment', async (c) => verifyReportPayment(c, options, c.req.param('slug')));

  app.get('/api/earning-assets/:assetId', async (c) => renderAssetById(c, options, c.req.param('assetId')));
  app.post('/api/earning-assets/:assetId/verify-payment', async (c) => verifyAssetPayment(c, options, c.req.param('assetId')));
}

const REGISTERED_PUBLIC_APPS = new WeakMap<Hono<any>, boolean>();

export function registerPublicRoutes(
  app: Hono<any>,
  options: PublicRoutesOptions = {}
) {
  if (REGISTERED_PUBLIC_APPS.get(app)) return;

  registerRoutes(app, options);
  REGISTERED_PUBLIC_APPS.set(app, true);
}

export function publicRoutes(
  app: Hono<any>,
  options: PublicRoutesOptions = {}
) {
  registerPublicRoutes(app, options);
}

export function createPublicRoutesApp(
  options: PublicRoutesOptions = {}
): Hono<any> {
  const app = new Hono<any>();
  registerPublicRoutes(app, options);
  return app;
}
