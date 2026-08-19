import type {
  NexusMoneyAmount,
  NexusPaymentMethod,
  NexusPaymentRequest
} from './types';

import {
  convertNokToUsd,
  formatNok,
  formatUsd
} from './fx-rates';

type PaymentEnv = Record<string, unknown>;

type PaymentRequestInput = {
  env?: PaymentEnv;
  origin: string;
  asset_id: string;
  slug: string;
  title: string;
  price_nok: number;
  price_usd?: number;
  payment_config?: any;
  payment_enforcement?: any;
  method?: NexusPaymentMethod;
  expires_in_ms?: number;
  now?: number;
};

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

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
  const safeOrigin = stripTrailingSlash(origin || 'https://arbitragenexus.net');
  const safePath = path.startsWith('/') ? path : `/${path}`;

  return `${safeOrigin}${safePath}`;
}

function getPaymentChainId(env?: PaymentEnv, paymentConfig?: any): number {
  const configured =
    paymentConfig?.chain_id ??
    paymentConfig?.chainId ??
    env?.PUBLIC_PAYMENT_CHAIN_ID ??
    env?.CRYPTO_CHAIN_ID;

  const parsed = Number(configured);

  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }

  const chain = cleanText(
    paymentConfig?.chain ||
      env?.PUBLIC_PAYMENT_CHAIN ||
      env?.CRYPTO_CHAIN ||
      'Polygon'
  ).toLowerCase();

  if (chain.includes('polygon') || chain.includes('pol')) return 137;
  if (chain.includes('ethereum') || chain.includes('mainnet')) return 1;
  if (chain.includes('base')) return 8453;
  if (chain.includes('arbitrum')) return 42161;
  if (chain.includes('optimism')) return 10;
  if (chain.includes('bsc') || chain.includes('binance')) return 56;

  return 137;
}

function getPaymentAddress(env?: PaymentEnv, paymentConfig?: any): string {
  return cleanText(
    paymentConfig?.address ||
      env?.PUBLIC_PAYMENT_ADDRESS ||
      env?.CRYPTO_TREASURY_ADDRESS ||
      ''
  );
}

function getPaymentChain(env?: PaymentEnv, paymentConfig?: any): string {
  return cleanText(
    paymentConfig?.chain ||
      env?.PUBLIC_PAYMENT_CHAIN ||
      'Polygon'
  ) || 'Polygon';
}

function getPaymentAsset(env?: PaymentEnv, paymentConfig?: any): string {
  return cleanText(
    paymentConfig?.asset ||
      env?.PUBLIC_PAYMENT_ASSET ||
      env?.CRYPTO_NATIVE_SYMBOL ||
      'POL'
  ) || 'POL';
}

function getRequiredAmountCrypto(paymentEnforcement?: any): string {
  if (paymentEnforcement?.enabled && paymentEnforcement?.required_amount_crypto_string) {
    return cleanText(paymentEnforcement.required_amount_crypto_string);
  }

  if (paymentEnforcement?.required_amount_crypto) {
    return cleanText(paymentEnforcement.required_amount_crypto);
  }

  return '';
}

function getRequiredAmountWei(paymentEnforcement?: any): string {
  if (paymentEnforcement?.enabled && paymentEnforcement?.required_amount_wei) {
    return cleanText(paymentEnforcement.required_amount_wei);
  }

  return '';
}

function buildNativePaymentUri(input: {
  address: string;
  chainId: number;
  requiredAmountWei?: string;
}): string {
  if (!input.address) return '';

  const base = `ethereum:${input.address}@${input.chainId}`;

  if (!input.requiredAmountWei) {
    return base;
  }

  return `${base}?value=${encodeURIComponent(input.requiredAmountWei)}`;
}

function buildPriceMoney(priceNok: number): NexusMoneyAmount {
  return {
    amount: Number(Math.max(0, safeNumber(priceNok, 0)).toFixed(2)),
    currency: 'NOK',
    formatted: formatNok(priceNok)
  };
}

function buildUsdMoney(priceNok: number, env?: PaymentEnv, now = Date.now(), explicitUsd?: number): NexusMoneyAmount {
  const usd = explicitUsd && explicitUsd > 0
    ? explicitUsd
    : convertNokToUsd(priceNok, env, now).amount;

  return {
    amount: Number(Math.max(0, usd).toFixed(2)),
    currency: 'USD',
    formatted: formatUsd(usd),
    converted_at: now,
    converted_at_iso: new Date(now).toISOString()
  };
}

export function buildNexusPaymentRequest(input: PaymentRequestInput): NexusPaymentRequest {
  const now = input.now || Date.now();
  const method = input.method || 'crypto_native';
  const paymentConfig = input.payment_config || {};
  const paymentEnforcement = input.payment_enforcement || paymentConfig.amount_enforcement || {};

  const chain = getPaymentChain(input.env, paymentConfig);
  const asset = getPaymentAsset(input.env, paymentConfig);
  const address = getPaymentAddress(input.env, paymentConfig);
  const chainId = getPaymentChainId(input.env, paymentConfig);

  const requiredAmountCrypto = getRequiredAmountCrypto(paymentEnforcement);
  const requiredAmountWei = getRequiredAmountWei(paymentEnforcement);

  const verifyUrl = absoluteUrl(input.origin, `/reports/${input.slug}/verify-payment`);
  const successUrl = absoluteUrl(input.origin, `/reports/${input.slug}/full.json`);
  const paymentUri = buildNativePaymentUri({
    address,
    chainId,
    requiredAmountWei
  });

  const expiresAt =
    input.expires_in_ms && input.expires_in_ms > 0
      ? now + input.expires_in_ms
      : undefined;

  const cryptoText = requiredAmountCrypto
    ? `${requiredAmountCrypto} ${asset}`
    : `the live quoted ${asset} amount`;

  return {
    id: `payreq-${input.asset_id}-${input.slug}`.slice(0, 180),
    asset_id: input.asset_id,
    slug: input.slug,
    title: cleanText(input.title),
    price: buildPriceMoney(input.price_nok),
    price_usd: buildUsdMoney(input.price_nok, input.env, now, input.price_usd),
    method,
    chain,
    asset,
    address,
    required_amount_crypto: requiredAmountCrypto || undefined,
    required_amount_wei: requiredAmountWei || undefined,
    payment_uri: paymentUri || undefined,
    verify_url: verifyUrl,
    success_url: successUrl,
    expires_at: expiresAt,
    expires_at_iso: expiresAt ? new Date(expiresAt).toISOString() : undefined,
    machine_readable: true,
    human_readable_instructions:
      `Send ${cryptoText} on ${chain} to ${address}, then POST the transaction hash to ${verifyUrl}.`
  };
}

export function buildPaymentRequestFromAsset(input: {
  asset: any;
  origin: string;
  env?: PaymentEnv;
  now?: number;
}): NexusPaymentRequest {
  const asset = input.asset || {};
  const slug = cleanText(asset.slug || asset.id || 'report');
  const priceNok = safeNumber(asset.price_nok, 0);

  return buildNexusPaymentRequest({
    env: input.env,
    origin: input.origin,
    asset_id: cleanText(asset.id || asset.asset_id || slug),
    slug,
    title: cleanText(asset.title || asset.opportunity_title || 'Intelligence report'),
    price_nok: priceNok,
    price_usd: safeNumber(asset.price_usd, 0),
    payment_config: asset.payment_config || asset.payment || {},
    payment_enforcement:
      asset.payment_enforcement ||
      asset.payment_config?.amount_enforcement ||
      asset.payment?.amount_enforcement,
    method: 'crypto_native',
    now: input.now
  });
}

export function buildPaymentRequestPublicJson(input: {
  asset: any;
  origin: string;
  env?: PaymentEnv;
  now?: number;
}): {
  success: true;
  kind: 'nexus_payment_request';
  payment_request: NexusPaymentRequest;
} {
  return {
    success: true,
    kind: 'nexus_payment_request',
    payment_request: buildPaymentRequestFromAsset(input)
  };
}

export function buildPublicPaymentSummary(input: {
  asset: any;
  origin: string;
  env?: PaymentEnv;
  now?: number;
}): {
  payment_available: boolean;
  payment_request: NexusPaymentRequest;
  payment_uri?: string;
  required_amount?: string;
} {
  const paymentRequest = buildPaymentRequestFromAsset(input);

  const requiredAmount =
    paymentRequest.required_amount_crypto && paymentRequest.asset
      ? `${paymentRequest.required_amount_crypto} ${paymentRequest.asset}`
      : undefined;

  return {
    payment_available: Boolean(paymentRequest.address),
    payment_request: paymentRequest,
    payment_uri: paymentRequest.payment_uri,
    required_amount: requiredAmount
  };
}
