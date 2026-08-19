// worker/crypto-price-oracle.ts

export type EnvLike = Record<string, unknown>;

export type NativePriceQuote = {
  kind: 'native_price_quote';
  provider: 'coingecko' | 'configured_fallback';
  source: string;
  source_id: string;
  source_url?: string;

  native_symbol: string;
  native_id: string;

  fiat_currency: 'NOK';
  price_nok: number;

  fetched_at: number;
  fetched_at_iso: string;

  last_updated_at?: number;
  last_updated_at_iso?: string;

  cache_ttl_seconds: number;
  max_stale_seconds: number;
  stale: boolean;
  fallback: boolean;

  upstream_error?: string;
  fallback_reason?: string;
};

export type LiveNativePaymentQuote = {
  kind: 'native_payment_quote';
  provider: string;
  source: string;
  source_id: string;
  source_url?: string;

  price_nok: number;
  required_price_nok: number;

  native_price_nok: number;
  native_symbol: string;
  native_id: string;

  required_amount_crypto: number;
  required_amount_crypto_string: string;
  required_amount_wei: string;

  decimals: number;

  fiat_currency: 'NOK';
  fetched_at: number;
  fetched_at_iso: string;

  last_updated_at?: number;
  last_updated_at_iso?: string;

  cache_ttl_seconds: number;
  max_stale_seconds: number;
  stale: boolean;
  fallback: boolean;

  message: string;
  price_quote: NativePriceQuote;
};

type CacheEntry = {
  key: string;
  quote: NativePriceQuote;
};

const cache = new Map<string, CacheEntry>();

const DEFAULT_CACHE_TTL_SECONDS = 60;
const DEFAULT_MAX_STALE_SECONDS = 900;
const DEFAULT_HTTP_TIMEOUT_MS = 8000;
const DEFAULT_DECIMALS = 18;
const DISPLAY_DECIMALS = 8;

function envString(env: EnvLike | undefined, key: string): string {
  const value = env?.[key];

  if (typeof value === 'string') return value.trim();
  if (value === undefined || value === null) return '';

  return String(value).trim();
}

function firstEnvString(env: EnvLike | undefined, keys: string[]): string {
  for (const key of keys) {
    const value = envString(env, key);

    if (value) return value;
  }

  return '';
}

function envNumberAny(env: EnvLike | undefined, keys: string[], fallback: number): number {
  const raw = firstEnvString(env, keys);
  const value = Number(raw);

  return Number.isFinite(value) ? value : fallback;
}

function envBoolAny(env: EnvLike | undefined, keys: string[], fallback = false): boolean {
  for (const key of keys) {
    const raw = envString(env, key).toLowerCase();

    if (!raw) continue;

    return ['true', '1', 'yes', 'y', 'on'].includes(raw);
  }

  return fallback;
}

function normalizeSymbol(symbol?: string): string {
  return String(symbol || 'POL').trim().toUpperCase();
}

function defaultCoinGeckoId(symbol: string): string {
  const normalized = normalizeSymbol(symbol);

  if (normalized === 'POL') return 'polygon-ecosystem-token';
  if (normalized === 'MATIC') return 'matic-network';
  if (normalized === 'ETH') return 'ethereum';
  if (normalized === 'BTC') return 'bitcoin';

  return normalized.toLowerCase();
}

function normalizeCoinGeckoId(rawId: string, symbol: string): string {
  const raw = String(rawId || '').trim();

  if (!raw) {
    return defaultCoinGeckoId(symbol);
  }

  const lower = raw.toLowerCase();

  const aliases: Record<string, string> = {
    polygon: 'polygon-ecosystem-token',
    pol: 'polygon-ecosystem-token',
    'polygon-token': 'polygon-ecosystem-token',
    'polygon-ecosystem-token': 'polygon-ecosystem-token',

    matic: 'matic-network',
    'matic-network': 'matic-network',

    eth: 'ethereum',
    ethereum: 'ethereum',

    btc: 'bitcoin',
    bitcoin: 'bitcoin'
  };

  return aliases[lower] || lower;
}

function getCoinGeckoId(env: EnvLike | undefined, symbol: string): string {
  const configured = firstEnvString(env, [
    'CRYPTO_NATIVE_COINGECKO_ID',
    'CRYPTO_COINGECKO_ID',
    'PUBLIC_PAYMENT_COINGECKO_ID',
    'COINGECKO_ID'
  ]);

  return normalizeCoinGeckoId(configured, symbol);
}

function getManualFallbackPrice(env: EnvLike | undefined): { price: number; sourceId: string } | null {
  const keys = [
    'CRYPTO_PRICE_FALLBACK_NOK',
    'CRYPTO_NATIVE_PRICE_NOK',
    'PUBLIC_PAYMENT_NATIVE_PRICE_NOK',
    'NATIVE_PRICE_NOK'
  ];

  for (const key of keys) {
    const raw = envString(env, key);
    const value = Number(raw);

    if (Number.isFinite(value) && value > 0) {
      return {
        price: value,
        sourceId: key
      };
    }
  }

  return null;
}

function configuredFallbackAllowed(
  env: EnvLike | undefined,
  explicit?: boolean
): boolean {
  if (explicit === true) return true;
  if (explicit === false) {
    return envBoolAny(
      env,
      [
        'CRYPTO_PRICE_ALLOW_CONFIGURED_FALLBACK',
        'CRYPTO_ALLOW_CONFIGURED_PRICE_FALLBACK',
        'PUBLIC_PAYMENT_ALLOW_CONFIGURED_PRICE_FALLBACK'
      ],
      false
    );
  }

  return envBoolAny(
    env,
    [
      'CRYPTO_PRICE_ALLOW_CONFIGURED_FALLBACK',
      'CRYPTO_ALLOW_CONFIGURED_PRICE_FALLBACK',
      'PUBLIC_PAYMENT_ALLOW_CONFIGURED_PRICE_FALLBACK'
    ],
    false
  );
}

function round2(value: number): number {
  return Number(Number(value || 0).toFixed(2));
}

function round8(value: number): number {
  return Number(Number(value || 0).toFixed(8));
}

function formatFixedTrimmed(value: number, decimals = DISPLAY_DECIMALS): string {
  return value.toFixed(decimals).replace(/\.?0+$/, '');
}

function roundUpToDisplayDecimals(value: number, decimals = DISPLAY_DECIMALS): number {
  const factor = 10 ** decimals;
  return Math.ceil(value * factor) / factor;
}

function safeDecimals(value: unknown): number {
  const decimals = Number(value ?? DEFAULT_DECIMALS);

  if (!Number.isFinite(decimals) || decimals < 0 || decimals > 36) {
    throw new Error('CRYPTO_NATIVE_DECIMALS_INVALID');
  }

  return Math.floor(decimals);
}

function decimalToUnits(value: string | number, decimals = DEFAULT_DECIMALS): bigint {
  const raw =
    typeof value === 'number'
      ? value.toFixed(decimals).replace(/0+$/, '').replace(/\.$/, '')
      : String(value || '').trim();

  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new Error('INVALID_DECIMAL_AMOUNT');
  }

  const [wholePart, fractionPart = ''] = raw.split('.');
  const whole = wholePart || '0';
  const fraction = fractionPart.padEnd(decimals, '0').slice(0, decimals);

  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction || '0');
}

function cacheKey(provider: string, nativeId: string): string {
  return `${provider}:${nativeId}:nok`;
}

function isFresh(quote: NativePriceQuote, ttlSeconds: number): boolean {
  return Date.now() - Number(quote.fetched_at || 0) <= ttlSeconds * 1000;
}

function isAcceptablyStale(quote: NativePriceQuote, maxStaleSeconds: number): boolean {
  return Date.now() - Number(quote.fetched_at || 0) <= maxStaleSeconds * 1000;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (
      message.toLowerCase().includes('abort') ||
      message.toLowerCase().includes('timeout')
    ) {
      throw new Error('PRICE_ORACLE_TIMEOUT');
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function responseTextSafe(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return '';
  }
}

function buildCoinGeckoHeaders(env: EnvLike | undefined, baseUrl: string): Record<string, string> {
  const apiKey = firstEnvString(env, [
    'COINGECKO_API_KEY',
    'CRYPTO_COINGECKO_API_KEY'
  ]);

  const apiKeyType = firstEnvString(env, [
    'COINGECKO_API_KEY_TYPE',
    'CRYPTO_COINGECKO_API_KEY_TYPE'
  ]).toLowerCase();

  const userAgent =
    firstEnvString(env, [
      'CRYPTO_PRICE_USER_AGENT',
      'COINGECKO_USER_AGENT'
    ]) || 'arbitrage-nexus-price-oracle/1.0';

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': userAgent
  };

  if (apiKey) {
    const lowerBaseUrl = baseUrl.toLowerCase();

    if (apiKeyType === 'pro' || lowerBaseUrl.includes('pro-api.coingecko.com')) {
      headers['x-cg-pro-api-key'] = apiKey;
    } else {
      headers['x-cg-demo-api-key'] = apiKey;
    }
  }

  return headers;
}

async function fetchCoinGeckoPriceNok(params: {
  env?: EnvLike;
  nativeSymbol: string;
  nativeId: string;
  timeoutMs: number;
  cacheTtlSeconds: number;
  maxStaleSeconds: number;
}): Promise<NativePriceQuote> {
  const baseUrl =
    firstEnvString(params.env, [
      'COINGECKO_SIMPLE_PRICE_URL',
      'CRYPTO_COINGECKO_SIMPLE_PRICE_URL'
    ]) || 'https://api.coingecko.com/api/v3/simple/price';

  const url = new URL(baseUrl);
  url.searchParams.set('ids', params.nativeId);
  url.searchParams.set('vs_currencies', 'nok');
  url.searchParams.set('include_last_updated_at', 'true');

  const response = await fetchWithTimeout(
    url.toString(),
    {
      method: 'GET',
      headers: buildCoinGeckoHeaders(params.env, baseUrl)
    },
    params.timeoutMs
  );

  if (!response.ok) {
    const body = await responseTextSafe(response);
    throw new Error(
      `PRICE_ORACLE_HTTP_${response.status}${body ? `:${body}` : ''}`
    );
  }

  const json = (await response.json()) as any;
  const node = json?.[params.nativeId];

  const priceNok = Number(node?.nok);
  const lastUpdatedAt = Number(node?.last_updated_at || 0) * 1000 || undefined;

  if (!Number.isFinite(priceNok) || priceNok <= 0) {
    const body = JSON.stringify(json).slice(0, 500);
    throw new Error(`PRICE_ORACLE_BAD_RESPONSE:${params.nativeId}:${body}`);
  }

  const now = Date.now();

  return {
    kind: 'native_price_quote',
    provider: 'coingecko',
    source: 'coingecko_simple_price',
    source_id: params.nativeId,
    source_url: url.toString(),

    native_symbol: normalizeSymbol(params.nativeSymbol),
    native_id: params.nativeId,

    fiat_currency: 'NOK',
    price_nok: Number(priceNok.toFixed(8)),

    fetched_at: now,
    fetched_at_iso: new Date(now).toISOString(),

    last_updated_at: lastUpdatedAt,
    last_updated_at_iso: lastUpdatedAt ? new Date(lastUpdatedAt).toISOString() : undefined,

    cache_ttl_seconds: params.cacheTtlSeconds,
    max_stale_seconds: params.maxStaleSeconds,
    stale: false,
    fallback: false
  };
}

function configuredFallbackQuote(params: {
  env?: EnvLike;
  nativeSymbol: string;
  nativeId: string;
  cacheTtlSeconds: number;
  maxStaleSeconds: number;
  upstreamError?: string;
}): NativePriceQuote {
  const fallback = getManualFallbackPrice(params.env);

  if (!fallback) {
    throw new Error(
      `LIVE_NATIVE_PRICE_QUOTE_UNAVAILABLE:NO_CONFIGURED_FALLBACK_PRICE${
        params.upstreamError ? `;upstream=${params.upstreamError}` : ''
      }`
    );
  }

  const now = Date.now();

  return {
    kind: 'native_price_quote',
    provider: 'configured_fallback',
    source: 'configured_native_price_nok',
    source_id: fallback.sourceId,

    native_symbol: normalizeSymbol(params.nativeSymbol),
    native_id: params.nativeId,

    fiat_currency: 'NOK',
    price_nok: Number(fallback.price.toFixed(8)),

    fetched_at: now,
    fetched_at_iso: new Date(now).toISOString(),

    cache_ttl_seconds: params.cacheTtlSeconds,
    max_stale_seconds: params.maxStaleSeconds,
    stale: false,
    fallback: true,
    fallback_reason: 'coingecko_unavailable',
    upstream_error: params.upstreamError
  };
}

export async function getNativePriceQuoteNok(
  env?: EnvLike,
  options: {
    native_symbol?: string;
    force_refresh?: boolean;
    allow_stale?: boolean;
    allow_configured_fallback?: boolean;
  } = {}
): Promise<NativePriceQuote> {
  const nativeSymbol = normalizeSymbol(
    options.native_symbol ||
      envString(env, 'CRYPTO_NATIVE_SYMBOL') ||
      envString(env, 'PUBLIC_PAYMENT_ASSET') ||
      'POL'
  );

  const nativeId = getCoinGeckoId(env, nativeSymbol);

  const provider =
    firstEnvString(env, [
      'CRYPTO_PRICE_PROVIDER',
      'PUBLIC_PAYMENT_PRICE_PROVIDER'
    ]).toLowerCase() || 'coingecko';

  const cacheTtlSeconds = Math.max(
    5,
    envNumberAny(
      env,
      [
        'CRYPTO_PRICE_CACHE_SECONDS',
        'CRYPTO_PRICE_CACHE_TTL_SECONDS',
        'PUBLIC_PAYMENT_PRICE_CACHE_SECONDS'
      ],
      DEFAULT_CACHE_TTL_SECONDS
    )
  );

  const maxStaleSeconds = Math.max(
    cacheTtlSeconds,
    envNumberAny(
      env,
      [
        'CRYPTO_PRICE_MAX_STALE_SECONDS',
        'PUBLIC_PAYMENT_PRICE_MAX_STALE_SECONDS'
      ],
      DEFAULT_MAX_STALE_SECONDS
    )
  );

  const timeoutMs = Math.max(
    1000,
    envNumberAny(
      env,
      [
        'CRYPTO_PRICE_REQUEST_TIMEOUT_MS',
        'CRYPTO_PRICE_HTTP_TIMEOUT_MS',
        'PUBLIC_PAYMENT_PRICE_REQUEST_TIMEOUT_MS'
      ],
      DEFAULT_HTTP_TIMEOUT_MS
    )
  );

  if (
    provider === 'configured_fallback' ||
    provider === 'configured' ||
    provider === 'manual' ||
    provider === 'fallback'
  ) {
    return configuredFallbackQuote({
      env,
      nativeSymbol,
      nativeId,
      cacheTtlSeconds,
      maxStaleSeconds
    });
  }

  if (provider !== 'coingecko') {
    throw new Error(`PRICE_ORACLE_PROVIDER_UNSUPPORTED:${provider}`);
  }

  const key = cacheKey('coingecko', nativeId);
  const existing = cache.get(key)?.quote;

  if (!options.force_refresh && existing && isFresh(existing, cacheTtlSeconds)) {
    return existing;
  }

  try {
    const quote = await fetchCoinGeckoPriceNok({
      env,
      nativeSymbol,
      nativeId,
      timeoutMs,
      cacheTtlSeconds,
      maxStaleSeconds
    });

    cache.set(key, { key, quote });

    return quote;
  } catch (error) {
    const upstreamError = error instanceof Error ? error.message : String(error);

    if (existing && options.allow_stale && isAcceptablyStale(existing, maxStaleSeconds)) {
      return {
        ...existing,
        stale: true,
        max_stale_seconds: maxStaleSeconds,
        upstream_error: upstreamError
      };
    }

    if (configuredFallbackAllowed(env, options.allow_configured_fallback)) {
      return configuredFallbackQuote({
        env,
        nativeSymbol,
        nativeId,
        cacheTtlSeconds,
        maxStaleSeconds,
        upstreamError
      });
    }

    throw new Error(`LIVE_NATIVE_PRICE_QUOTE_UNAVAILABLE:${upstreamError}`);
  }
}

export async function quoteNativePaymentForNokFromLiveOracle(
  env: EnvLike | undefined,
  params: {
    price_nok: number;
    native_symbol?: string;
    decimals?: number;
    force_refresh?: boolean;
    allow_stale?: boolean;
    allow_configured_fallback?: boolean;
  }
): Promise<LiveNativePaymentQuote> {
  const priceNok = round2(Number(params.price_nok || 0));

  if (!Number.isFinite(priceNok) || priceNok <= 0) {
    throw new Error('REPORT_PRICE_NOK_INVALID');
  }

  const decimals = safeDecimals(params.decimals);

  const priceQuote = await getNativePriceQuoteNok(env, {
    native_symbol: params.native_symbol,
    force_refresh: params.force_refresh,
    allow_stale: params.allow_stale,
    allow_configured_fallback: params.allow_configured_fallback
  });

  const requiredAmountCrypto = roundUpToDisplayDecimals(
    priceNok / priceQuote.price_nok,
    DISPLAY_DECIMALS
  );

  const requiredAmountCryptoString = formatFixedTrimmed(requiredAmountCrypto, DISPLAY_DECIMALS);
  const requiredAmountWei = decimalToUnits(requiredAmountCryptoString, decimals);

  return {
    kind: 'native_payment_quote',
    provider: priceQuote.provider,
    source: priceQuote.source,
    source_id: priceQuote.source_id,
    source_url: priceQuote.source_url,

    price_nok: priceNok,
    required_price_nok: priceNok,

    native_price_nok: priceQuote.price_nok,
    native_symbol: priceQuote.native_symbol,
    native_id: priceQuote.native_id,

    required_amount_crypto: round8(requiredAmountCrypto),
    required_amount_crypto_string: requiredAmountCryptoString,
    required_amount_wei: requiredAmountWei.toString(),

    decimals,

    fiat_currency: 'NOK',
    fetched_at: priceQuote.fetched_at,
    fetched_at_iso: priceQuote.fetched_at_iso,

    last_updated_at: priceQuote.last_updated_at,
    last_updated_at_iso: priceQuote.last_updated_at_iso,

    cache_ttl_seconds: priceQuote.cache_ttl_seconds,
    max_stale_seconds: priceQuote.max_stale_seconds,
    stale: priceQuote.stale,
    fallback: priceQuote.fallback,

    message: `Send at least ${requiredAmountCryptoString} ${priceQuote.native_symbol} to unlock this report.`,
    price_quote: priceQuote
  };
}