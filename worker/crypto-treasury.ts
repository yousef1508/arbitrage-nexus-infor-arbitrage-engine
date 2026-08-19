import {
  getNativePriceQuoteNok,
  quoteNativePaymentForNokFromLiveOracle,
  type EnvLike,
  type LiveNativePaymentQuote,
  type NativePriceQuote
} from './crypto-price-oracle';

import type {
  LedgerEntry,
  PaymentEnforcementMetadata,
  TaxReceipt
} from './types';

type JsonRpcResponse<T> = {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
  };
};

type TransactionReceipt = {
  transactionHash: string;
  blockHash: string;
  blockNumber: string;
  from: string;
  to: string | null;
  status: string;
  effectiveGasPrice?: string;
  gasUsed?: string;
  logs?: Array<{
    address: string;
    topics: string[];
    data: string;
  }>;
};

type Transaction = {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  input: string;
  blockNumber: string | null;
};

export type CryptoReceipt = {
  id: string;
  type: 'crypto_deposit';
  status: 'verified';
  created_at: number;

  chain_id: number;
  tx_hash: string;
  block_number: number;
  confirmations: number;

  from_address: string;
  to_address: string;

  asset_symbol: string;
  asset_type: 'native';
  amount_crypto: number;
  amount_crypto_string: string;
  amount_wei: string;

  estimated_value_nok: number | null;
  native_price_nok: number | null;
  valuation_status: 'pending' | 'final';

  tax_currency: 'NOK';
  treasury_bucket: 'operating';
  source: 'onchain_verifier';

  price_quote?: NativePriceQuote;
  payment_quote?: NativePaymentQuote | LiveNativePaymentQuote;

  quote_provider?: string;
  quote_source?: string;
  quote_source_id?: string;
  quote_fetched_at?: number;
  quote_fetched_at_iso?: string;
  quote_stale?: boolean;
  quote_fallback?: boolean;

  required_price_nok?: number;
  required_amount_crypto?: number;
  required_amount_crypto_string?: string;
  required_amount_wei?: string;

  payment_sufficient?: boolean;
  underpayment_nok?: number;
  overpayment_nok?: number;

  notes: string;
};

export type NativePaymentQuote = {
  kind?: 'native_payment_quote';
  provider?: string;
  source?: string;
  source_id?: string;
  source_url?: string;

  price_nok: number;
  required_price_nok?: number;

  native_price_nok: number;
  native_symbol: string;
  native_id?: string;

  required_amount_crypto: number;
  required_amount_crypto_string: string;
  required_amount_wei: string;

  decimals: number;

  fiat_currency?: 'NOK';
  fetched_at?: number;
  fetched_at_iso?: string;
  last_updated_at?: number;
  last_updated_at_iso?: string;
  cache_ttl_seconds?: number;
  max_stale_seconds?: number;
  stale?: boolean;
  fallback?: boolean;
  message?: string;
  price_quote?: NativePriceQuote;
};

export type CryptoPaymentVerification = {
  success: true;
  receipt: CryptoReceipt;

  required_price_nok: number;
  received_value_nok: number;

  required_amount_crypto: number;
  required_amount_crypto_string: string;
  required_amount_wei: string;

  received_amount_crypto: number;
  received_amount_crypto_string: string;
  received_amount_wei: string;

  overpayment_nok: number;
  underpayment_nok: number;

  payment_quote: NativePaymentQuote | LiveNativePaymentQuote;
  price_quote?: NativePriceQuote;
};

export type VerifyNativeCryptoDepositParams = {
  rpcUrl: string;
  treasuryAddress: string;
  txHash: string;
  chainId: number;
  nativeSymbol: string;

  nativeDecimals?: number;
  nativePriceNok?: number | null;
  priceQuote?: NativePriceQuote;
  paymentQuote?: NativePaymentQuote | LiveNativePaymentQuote;
  minConfirmations?: number;
};

export type VerifyNativeCryptoDepositAgainstPriceParams = {
  rpcUrl: string;
  treasuryAddress: string;
  txHash: string;
  chainId: number;
  nativeSymbol: string;

  requiredPriceNok: number;

  nativePriceNok?: number | null;
  paymentQuote?: NativePaymentQuote | LiveNativePaymentQuote;

  nativeDecimals?: number;
  minConfirmations?: number;
  allowedUnderpaymentNok?: number;
};

export type VerifyNativeCryptoDepositAgainstLivePriceParams = {
  env?: EnvLike;

  rpcUrl: string;
  treasuryAddress: string;
  txHash: string;
  chainId: number;
  nativeSymbol: string;

  requiredPriceNok: number;

  nativeDecimals?: number;
  minConfirmations?: number;
  allowedUnderpaymentNok?: number;

  forceQuoteRefresh?: boolean;
  allowStaleQuote?: boolean;
  allowConfiguredFallback?: boolean;
};

const DEFAULT_NATIVE_DECIMALS = 18;
const DEFAULT_MIN_CONFIRMATIONS = 1;
const DEFAULT_DISPLAY_DECIMALS = 8;

const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

const round2 = (value: number): number => Number(Number(value || 0).toFixed(2));
const round8 = (value: number): number => Number(Number(value || 0).toFixed(8));

const hexToBigInt = (hex: string): bigint => {
  if (!hex || hex === '0x') return 0n;
  return BigInt(hex);
};

const normalizeAddress = (address: string): string =>
  String(address || '').trim().toLowerCase();

function assertValidAddress(address: string, label: string) {
  if (!address || !ADDRESS_RE.test(address)) {
    throw new Error(`${label}_INVALID`);
  }
}

function assertValidTxHash(txHash: string) {
  if (!txHash || !TX_HASH_RE.test(txHash)) {
    throw new Error('INVALID_TX_HASH');
  }
}

function assertPositiveNumber(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label}_INVALID`);
  }
}

function safeNativeDecimals(value?: number): number {
  const decimals = Number(value ?? DEFAULT_NATIVE_DECIMALS);

  if (!Number.isFinite(decimals) || decimals < 0 || decimals > 36) {
    throw new Error('NATIVE_DECIMALS_INVALID');
  }

  return Math.floor(decimals);
}

function safeMinConfirmations(value?: number): number {
  const confirmations = Number(value ?? DEFAULT_MIN_CONFIRMATIONS);

  if (!Number.isFinite(confirmations) || confirmations < 1) {
    return DEFAULT_MIN_CONFIRMATIONS;
  }

  return Math.floor(confirmations);
}

function decimalNumberToSafeString(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return '0';

  const fixed = value.toFixed(decimals);

  return fixed.replace(/0+$/, '').replace(/\.$/, '');
}

function decimalToUnits(value: string | number, decimals = DEFAULT_NATIVE_DECIMALS): bigint {
  const raw =
    typeof value === 'number'
      ? decimalNumberToSafeString(value, decimals)
      : String(value || '').trim();

  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new Error('INVALID_DECIMAL_AMOUNT');
  }

  const [wholePart, fractionPart = ''] = raw.split('.');
  const safeWhole = wholePart || '0';
  const safeFraction = fractionPart.padEnd(decimals, '0').slice(0, decimals);

  return BigInt(safeWhole) * 10n ** BigInt(decimals) + BigInt(safeFraction || '0');
}

function unitsToDecimalString(
  value: bigint,
  decimals = DEFAULT_NATIVE_DECIMALS,
  maxFractionDigits = DEFAULT_DISPLAY_DECIMALS
): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = value / divisor;
  const fraction = value % divisor;

  const fractionString = fraction
    .toString()
    .padStart(decimals, '0')
    .slice(0, maxFractionDigits)
    .replace(/0+$/, '');

  return fractionString.length > 0
    ? `${whole.toString()}.${fractionString}`
    : whole.toString();
}

function unitsToDecimalNumber(value: bigint, decimals = DEFAULT_NATIVE_DECIMALS): number {
  return Number(unitsToDecimalString(value, decimals, DEFAULT_DISPLAY_DECIMALS));
}

function roundUpToDisplayDecimals(value: number, displayDecimals = DEFAULT_DISPLAY_DECIMALS): number {
  const factor = 10 ** displayDecimals;
  return Math.ceil(value * factor) / factor;
}

function formatFixedTrimmed(value: number, decimals = DEFAULT_DISPLAY_DECIMALS): string {
  return value.toFixed(decimals).replace(/\.?0+$/, '');
}

function estimateNokFromWei(params: {
  amountWei: bigint;
  nativePriceNok?: number | null;
  decimals?: number;
}): number | null {
  const { amountWei, nativePriceNok, decimals = DEFAULT_NATIVE_DECIMALS } = params;

  if (!nativePriceNok || !Number.isFinite(nativePriceNok) || nativePriceNok <= 0) {
    return null;
  }

  const amountCrypto = unitsToDecimalNumber(amountWei, decimals);

  return round2(amountCrypto * nativePriceNok);
}

async function rpcCall<T>(
  rpcUrl: string,
  method: string,
  params: unknown[]
): Promise<T> {
  if (!rpcUrl) {
    throw new Error('CRYPTO_RPC_URL_MISSING');
  }

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    })
  });

  if (!response.ok) {
    throw new Error(`RPC_HTTP_${response.status}`);
  }

  const json = (await response.json()) as JsonRpcResponse<T>;

  if (json.error) {
    throw new Error(`RPC_ERROR_${json.error.code}: ${json.error.message}`);
  }

  if (json.result === undefined || json.result === null) {
    throw new Error(`RPC_EMPTY_RESULT_${method}`);
  }

  return json.result;
}

async function getTransactionReceiptOrThrow(
  rpcUrl: string,
  txHash: string
): Promise<TransactionReceipt> {
  try {
    return await rpcCall<TransactionReceipt>(rpcUrl, 'eth_getTransactionReceipt', [txHash]);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);

    if (msg.includes('RPC_EMPTY_RESULT_eth_getTransactionReceipt')) {
      throw new Error('TX_NOT_FOUND');
    }

    throw error;
  }
}

async function getTransactionOrThrow(rpcUrl: string, txHash: string): Promise<Transaction> {
  try {
    return await rpcCall<Transaction>(rpcUrl, 'eth_getTransactionByHash', [txHash]);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);

    if (msg.includes('RPC_EMPTY_RESULT_eth_getTransactionByHash')) {
      throw new Error('TX_NOT_FOUND');
    }

    throw error;
  }
}

async function assertRpcChainMatches(params: {
  rpcUrl: string;
  expectedChainId: number;
}) {
  const chainIdHex = await rpcCall<string>(params.rpcUrl, 'eth_chainId', []);
  const actualChainId = Number(hexToBigInt(chainIdHex));

  if (actualChainId !== Number(params.expectedChainId)) {
    throw new Error(`RPC_CHAIN_ID_MISMATCH:expected=${params.expectedChainId};actual=${actualChainId}`);
  }
}

async function getConfirmations(params: {
  rpcUrl: string;
  txBlockNumber: bigint;
}): Promise<number> {
  const latestBlockHex = await rpcCall<string>(params.rpcUrl, 'eth_blockNumber', []);
  const latestBlock = hexToBigInt(latestBlockHex);

  if (latestBlock < params.txBlockNumber) {
    return 0;
  }

  return Number(latestBlock - params.txBlockNumber + 1n);
}

function paymentQuoteFromManualPrice(params: {
  priceNok: number;
  nativePriceNok: number;
  nativeSymbol: string;
  decimals?: number;
}): NativePaymentQuote {
  const decimals = safeNativeDecimals(params.decimals);
  const priceNok = round2(Number(params.priceNok || 0));
  const nativePriceNok = Number(params.nativePriceNok || 0);

  assertPositiveNumber(priceNok, 'REPORT_PRICE_NOK');
  assertPositiveNumber(nativePriceNok, 'NATIVE_PRICE_NOK');

  const requiredAmountCrypto = roundUpToDisplayDecimals(
    priceNok / nativePriceNok,
    DEFAULT_DISPLAY_DECIMALS
  );
  const requiredAmountCryptoString = formatFixedTrimmed(
    requiredAmountCrypto,
    DEFAULT_DISPLAY_DECIMALS
  );
  const requiredAmountWei = decimalToUnits(requiredAmountCryptoString, decimals);

  return {
    kind: 'native_payment_quote',
    provider: 'manual',
    source: 'manual_native_price',
    source_id: 'manual_native_price_nok',
    price_nok: priceNok,
    required_price_nok: priceNok,
    native_price_nok: nativePriceNok,
    native_symbol: params.nativeSymbol,
    required_amount_crypto: round8(requiredAmountCrypto),
    required_amount_crypto_string: requiredAmountCryptoString,
    required_amount_wei: requiredAmountWei.toString(),
    decimals,
    fiat_currency: 'NOK',
    fetched_at: Date.now(),
    fetched_at_iso: new Date().toISOString(),
    stale: false,
    fallback: false,
    message: `Send at least ${requiredAmountCryptoString} ${params.nativeSymbol} to unlock this report.`
  };
}

export function quoteNativePaymentForNok(params: {
  priceNok: number;
  nativePriceNok: number;
  nativeSymbol: string;
  decimals?: number;
}): NativePaymentQuote {
  return paymentQuoteFromManualPrice(params);
}

export async function quoteNativePaymentForNokLive(params: {
  env?: EnvLike;
  priceNok: number;
  nativeSymbol?: string;
  decimals?: number;
  forceRefresh?: boolean;
  allowStale?: boolean;
  allowConfiguredFallback?: boolean;
}): Promise<LiveNativePaymentQuote> {
  return quoteNativePaymentForNokFromLiveOracle(params.env, {
    price_nok: params.priceNok,
    native_symbol: params.nativeSymbol,
    decimals: params.decimals,
    force_refresh: params.forceRefresh,
    allow_stale: params.allowStale,
    allow_configured_fallback: params.allowConfiguredFallback
  });
}


function getNativePriceFromQuote(
  quote?: NativePaymentQuote | LiveNativePaymentQuote | null
): number | null {
  if (!quote) return null;

  const value = Number(quote.native_price_nok);

  return Number.isFinite(value) && value > 0 ? value : null;
}

function getPriceQuoteFromPaymentQuote(
  quote?: NativePaymentQuote | LiveNativePaymentQuote | null
): NativePriceQuote | undefined {
  if (!quote) return undefined;

  const maybeQuote = (quote as LiveNativePaymentQuote).price_quote;

  return maybeQuote;
}

function enrichReceiptWithQuoteMetadata(
  receipt: CryptoReceipt,
  paymentQuote?: NativePaymentQuote | LiveNativePaymentQuote,
  priceQuote?: NativePriceQuote
): CryptoReceipt {
  const quote = priceQuote || getPriceQuoteFromPaymentQuote(paymentQuote);

  if (!paymentQuote && !quote) return receipt;

  return {
    ...receipt,
    payment_quote: paymentQuote,
    price_quote: quote,
    quote_provider: String(paymentQuote?.provider || quote?.provider || ''),
    quote_source: String(paymentQuote?.source || quote?.source || ''),
    quote_source_id: String(paymentQuote?.source_id || quote?.source_id || ''),
    quote_fetched_at: Number(paymentQuote?.fetched_at || quote?.fetched_at || 0) || undefined,
    quote_fetched_at_iso: paymentQuote?.fetched_at_iso || quote?.fetched_at_iso,
    quote_stale: Boolean(paymentQuote?.stale || quote?.stale),
    quote_fallback: Boolean(paymentQuote?.fallback || quote?.fallback)
  };
}

export async function verifyNativeCryptoDeposit(
  params: VerifyNativeCryptoDepositParams
): Promise<CryptoReceipt> {
  const {
    rpcUrl,
    treasuryAddress,
    txHash,
    chainId,
    nativeSymbol,
    nativeDecimals = DEFAULT_NATIVE_DECIMALS,
    nativePriceNok = null,
    priceQuote,
    paymentQuote,
    minConfirmations = DEFAULT_MIN_CONFIRMATIONS
  } = params;

  if (!rpcUrl) throw new Error('CRYPTO_RPC_URL_MISSING');
  if (!treasuryAddress) throw new Error('CRYPTO_TREASURY_ADDRESS_MISSING');

  assertValidAddress(treasuryAddress, 'CRYPTO_TREASURY_ADDRESS');
  assertValidTxHash(txHash);

  const decimals = safeNativeDecimals(nativeDecimals);
  const requiredConfirmations = safeMinConfirmations(minConfirmations);

  await assertRpcChainMatches({
    rpcUrl,
    expectedChainId: chainId
  });

  const receipt = await getTransactionReceiptOrThrow(rpcUrl, txHash);

  if (hexToBigInt(receipt.status || '0x0') !== 1n) {
    throw new Error('TX_NOT_SUCCESSFUL');
  }

  const tx = await getTransactionOrThrow(rpcUrl, txHash);

  if (!tx.blockNumber) {
    throw new Error('TX_NOT_CONFIRMED');
  }

  if (!tx.to) {
    throw new Error('TX_HAS_NO_TO_ADDRESS');
  }

  const expectedTo = normalizeAddress(treasuryAddress);
  const actualTo = normalizeAddress(tx.to);

  if (actualTo !== expectedTo) {
    throw new Error(`TX_NOT_TO_TREASURY_ADDRESS:${tx.to}`);
  }

  const txHashActual = normalizeAddress(tx.hash);
  const txHashExpected = normalizeAddress(txHash);

  if (txHashActual !== txHashExpected) {
    throw new Error('TX_HASH_MISMATCH');
  }

  const amountWei = hexToBigInt(tx.value);

  if (amountWei <= 0n) {
    throw new Error('TX_AMOUNT_ZERO');
  }

  const blockNumber = hexToBigInt(tx.blockNumber);
  const confirmations = await getConfirmations({
    rpcUrl,
    txBlockNumber: blockNumber
  });

  if (confirmations < requiredConfirmations) {
    throw new Error(`TX_CONFIRMATIONS_PENDING:${confirmations}/${requiredConfirmations}`);
  }

  const quoteNativePrice =
    getNativePriceFromQuote(paymentQuote) ||
    Number(priceQuote?.price_nok || 0) ||
    Number(nativePriceNok || 0) ||
    null;

  const estimatedValueNok = estimateNokFromWei({
    amountWei,
    nativePriceNok: quoteNativePrice,
    decimals
  });

  const valuationStatus = estimatedValueNok === null ? 'pending' : 'final';
  const amountCryptoString = unitsToDecimalString(amountWei, decimals, DEFAULT_DISPLAY_DECIMALS);
  const amountCrypto = unitsToDecimalNumber(amountWei, decimals);

  const baseReceipt: CryptoReceipt = {
    id: crypto.randomUUID(),
    type: 'crypto_deposit',
    status: 'verified',
    created_at: Date.now(),

    chain_id: chainId,
    tx_hash: tx.hash,
    block_number: Number(blockNumber),
    confirmations,

    from_address: tx.from,
    to_address: tx.to,

    asset_symbol: nativeSymbol,
    asset_type: 'native',
    amount_crypto: amountCrypto,
    amount_crypto_string: amountCryptoString,
    amount_wei: amountWei.toString(),

    estimated_value_nok: estimatedValueNok,
    native_price_nok:
      quoteNativePrice && quoteNativePrice > 0
        ? Number(Number(quoteNativePrice).toFixed(8))
        : null,
    valuation_status: valuationStatus,

    tax_currency: 'NOK',
    treasury_bucket: 'operating',
    source: 'onchain_verifier',
    notes:
      valuationStatus === 'final'
        ? 'Verified native crypto deposit. NOK value estimated using native-token NOK quote at verification time.'
        : 'Verified native crypto deposit. NOK value is pending because no trusted native-token NOK quote was supplied.'
  };

  return enrichReceiptWithQuoteMetadata(baseReceipt, paymentQuote, priceQuote);
}

function resolvePaymentQuoteForPrice(params: VerifyNativeCryptoDepositAgainstPriceParams): NativePaymentQuote | LiveNativePaymentQuote {
  if (params.paymentQuote) {
    return params.paymentQuote;
  }

  const nativePriceNok = Number(params.nativePriceNok || 0);

  if (!Number.isFinite(nativePriceNok) || nativePriceNok <= 0) {
    throw new Error('NATIVE_PRICE_NOK_REQUIRED_FOR_AMOUNT_ENFORCEMENT');
  }

  return quoteNativePaymentForNok({
    priceNok: params.requiredPriceNok,
    nativePriceNok,
    nativeSymbol: params.nativeSymbol,
    decimals: params.nativeDecimals
  });
}

export async function verifyNativeCryptoDepositAgainstPrice(
  params: VerifyNativeCryptoDepositAgainstPriceParams
): Promise<CryptoPaymentVerification> {
  const requiredPriceNok = round2(Number(params.requiredPriceNok || 0));
  const nativeDecimals = safeNativeDecimals(params.nativeDecimals);
  const allowedUnderpaymentNok = Math.max(0, Number(params.allowedUnderpaymentNok || 0));

  assertPositiveNumber(requiredPriceNok, 'REPORT_PRICE_NOK');

  const paymentQuote = resolvePaymentQuoteForPrice({
    ...params,
    requiredPriceNok,
    nativeDecimals
  });

  const nativePriceNok = getNativePriceFromQuote(paymentQuote);

  if (!nativePriceNok) {
    throw new Error('NATIVE_PRICE_NOK_REQUIRED_FOR_AMOUNT_ENFORCEMENT');
  }

  const receipt = await verifyNativeCryptoDeposit({
    rpcUrl: params.rpcUrl,
    treasuryAddress: params.treasuryAddress,
    txHash: params.txHash,
    chainId: params.chainId,
    nativeSymbol: params.nativeSymbol,
    nativeDecimals,
    nativePriceNok,
    minConfirmations: params.minConfirmations,
    paymentQuote,
    priceQuote: getPriceQuoteFromPaymentQuote(paymentQuote)
  });

  const receivedValueNok = receipt.estimated_value_nok;

  if (receivedValueNok === null) {
    throw new Error('NATIVE_PRICE_NOK_REQUIRED_FOR_AMOUNT_ENFORCEMENT');
  }

  const requiredWei = BigInt(paymentQuote.required_amount_wei);
  const receivedWei = BigInt(receipt.amount_wei);

  const minimumAcceptedNok = round2(requiredPriceNok - allowedUnderpaymentNok);
  const sufficientByWei = receivedWei >= requiredWei;
  const sufficientByTolerance =
    allowedUnderpaymentNok > 0 && receivedValueNok >= minimumAcceptedNok;

  const paymentSufficient = sufficientByWei || sufficientByTolerance;
  const underpaymentNok = paymentSufficient ? 0 : round2(requiredPriceNok - receivedValueNok);
  const overpaymentNok = Math.max(0, round2(receivedValueNok - requiredPriceNok));

  const enrichedReceipt: CryptoReceipt = {
    ...receipt,
    required_price_nok: requiredPriceNok,
    required_amount_crypto: paymentQuote.required_amount_crypto,
    required_amount_crypto_string: paymentQuote.required_amount_crypto_string,
    required_amount_wei: paymentQuote.required_amount_wei,
    payment_sufficient: paymentSufficient,
    underpayment_nok: underpaymentNok,
    overpayment_nok: overpaymentNok,
    payment_quote: paymentQuote,
    price_quote: getPriceQuoteFromPaymentQuote(paymentQuote),
    notes: paymentSufficient
      ? `Verified native crypto payment covers required report price. Required ${requiredPriceNok} NOK, received estimated ${receivedValueNok} NOK.`
      : `Verified native crypto payment is under required report price. Required ${requiredPriceNok} NOK, received estimated ${receivedValueNok} NOK.`
  };

  if (!paymentSufficient) {
    throw new Error(
      `UNDERPAID_PAYMENT:required_nok=${requiredPriceNok};received_nok=${receivedValueNok};missing_nok=${underpaymentNok}`
    );
  }

  return {
    success: true,
    receipt: enrichedReceipt,
    required_price_nok: requiredPriceNok,
    received_value_nok: receivedValueNok,
    required_amount_crypto: paymentQuote.required_amount_crypto,
    required_amount_crypto_string: paymentQuote.required_amount_crypto_string,
    required_amount_wei: paymentQuote.required_amount_wei,
    received_amount_crypto: receipt.amount_crypto,
    received_amount_crypto_string: receipt.amount_crypto_string,
    received_amount_wei: receipt.amount_wei,
    overpayment_nok: overpaymentNok,
    underpayment_nok: underpaymentNok,
    payment_quote: paymentQuote,
    price_quote: getPriceQuoteFromPaymentQuote(paymentQuote)
  };
}

export async function verifyNativeCryptoDepositAgainstLivePrice(
  params: VerifyNativeCryptoDepositAgainstLivePriceParams
): Promise<CryptoPaymentVerification> {
  const decimals = safeNativeDecimals(params.nativeDecimals);
  const requiredPriceNok = round2(Number(params.requiredPriceNok || 0));

  assertPositiveNumber(requiredPriceNok, 'REPORT_PRICE_NOK');

  const paymentQuote = await quoteNativePaymentForNokFromLiveOracle(params.env, {
    price_nok: requiredPriceNok,
    native_symbol: params.nativeSymbol,
    decimals,
    force_refresh: params.forceQuoteRefresh ?? true,
    allow_stale: params.allowStaleQuote ?? true,
    allow_configured_fallback: params.allowConfiguredFallback ?? true
  });

  return verifyNativeCryptoDepositAgainstPrice({
    rpcUrl: params.rpcUrl,
    treasuryAddress: params.treasuryAddress,
    txHash: params.txHash,
    chainId: params.chainId,
    nativeSymbol: params.nativeSymbol,
    requiredPriceNok,
    nativeDecimals: decimals,
    minConfirmations: params.minConfirmations,
    allowedUnderpaymentNok: params.allowedUnderpaymentNok,
    paymentQuote
  });
}

export async function verifyNativeCryptoDepositWithLiveValuation(params: {
  env?: EnvLike;

  rpcUrl: string;
  treasuryAddress: string;
  txHash: string;
  chainId: number;
  nativeSymbol: string;

  nativeDecimals?: number;
  minConfirmations?: number;

  forceQuoteRefresh?: boolean;
  allowStaleQuote?: boolean;
  allowConfiguredFallback?: boolean;
}): Promise<CryptoReceipt> {
  const priceQuote = await getNativePriceQuoteNok(params.env, {
    native_symbol: params.nativeSymbol,
    force_refresh: params.forceQuoteRefresh ?? true,
    allow_stale: params.allowStaleQuote ?? true,
    allow_configured_fallback: params.allowConfiguredFallback ?? true
  });

  return verifyNativeCryptoDeposit({
    rpcUrl: params.rpcUrl,
    treasuryAddress: params.treasuryAddress,
    txHash: params.txHash,
    chainId: params.chainId,
    nativeSymbol: params.nativeSymbol,
    nativeDecimals: params.nativeDecimals,
    minConfirmations: params.minConfirmations,
    nativePriceNok: priceQuote.price_nok,
    priceQuote
  });
}

// -----------------------------------------------------------------------------
// NEXUS_CRYPTO_TREASURY_ACCOUNTING_PATCH_V1
// High-level helpers for payment enforcement, verified revenue accounting,
// and safe ledger/tax receipt creation.
// -----------------------------------------------------------------------------

type CryptoTreasuryEnv = EnvLike & Record<string, unknown>;

export type CryptoTreasuryRuntimeConfig = {
  rpc_url: string;
  treasury_address: string;
  chain_id: number;
  native_symbol: string;
  native_decimals: number;
  min_confirmations: number;
  allowed_underpayment_nok: number;
};

export type CryptoPaymentAccountingEntries = {
  should_credit_treasury: boolean;
  receipt: CryptoReceipt;
  ledger_entry?: LedgerEntry;
  tax_receipt: TaxReceipt;
};

function envString(
  env: CryptoTreasuryEnv | undefined,
  keys: string[],
  fallback = ''
): string {
  if (!env) return fallback;

  for (const key of keys) {
    const value = env[key];

    if (value === undefined || value === null) {
      continue;
    }

    const text = String(value).trim();

    if (text) {
      return text;
    }
  }

  return fallback;
}

function envNumber(
  env: CryptoTreasuryEnv | undefined,
  keys: string[],
  fallback: number
): number {
  const raw = envString(env, keys, '');

  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);

  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getCryptoTreasuryRuntimeConfig(
  env?: CryptoTreasuryEnv
): CryptoTreasuryRuntimeConfig {
  const rpcUrl = envString(env, ['CRYPTO_RPC_URL']);
  const treasuryAddress = envString(env, [
    'CRYPTO_TREASURY_ADDRESS',
    'PUBLIC_PAYMENT_ADDRESS'
  ]);
  const chainId = envNumber(env, [
    'CRYPTO_CHAIN_ID',
    'PUBLIC_PAYMENT_CHAIN_ID'
  ], 137);
  const nativeSymbol = envString(env, [
    'CRYPTO_NATIVE_SYMBOL',
    'PUBLIC_PAYMENT_ASSET'
  ], 'POL');

  if (!rpcUrl) {
    throw new Error('CRYPTO_RPC_URL_MISSING');
  }

  if (!treasuryAddress) {
    throw new Error('CRYPTO_TREASURY_ADDRESS_MISSING');
  }

  if (!Number.isFinite(chainId) || chainId <= 0) {
    throw new Error('CRYPTO_CHAIN_ID_INVALID');
  }

  return {
    rpc_url: rpcUrl,
    treasury_address: treasuryAddress,
    chain_id: Math.floor(chainId),
    native_symbol: nativeSymbol,
    native_decimals: safeNativeDecimals(
      envNumber(env, ['CRYPTO_NATIVE_DECIMALS'], DEFAULT_NATIVE_DECIMALS)
    ),
    min_confirmations: safeMinConfirmations(
      envNumber(env, ['CRYPTO_MIN_CONFIRMATIONS'], DEFAULT_MIN_CONFIRMATIONS)
    ),
    allowed_underpayment_nok: Math.max(
      0,
      envNumber(env, ['CRYPTO_ALLOWED_UNDERPAYMENT_NOK'], 0)
    )
  };
}

export function buildPaymentEnforcementMetadataFromQuote(params: {
  requiredPriceNok: number;
  quote: NativePaymentQuote | LiveNativePaymentQuote;
  reason?: string;
  minConfirmations?: number;
  allowedUnderpaymentNok?: number;
}): PaymentEnforcementMetadata {
  const requiredPriceNok = round2(Number(params.requiredPriceNok || 0));

  assertPositiveNumber(requiredPriceNok, 'REPORT_PRICE_NOK');

  const quote = params.quote;
  const priceQuote = getPriceQuoteFromPaymentQuote(quote);
  const fetchedAt = Number(quote.fetched_at || priceQuote?.fetched_at || Date.now());
  const fetchedAtIso =
    quote.fetched_at_iso ||
    priceQuote?.fetched_at_iso ||
    new Date(fetchedAt).toISOString();

  const pricingMode: PaymentEnforcementMetadata['pricing_mode'] =
    quote.provider === 'manual' || quote.source === 'manual_native_price'
      ? 'manual'
      : 'live_oracle';

  const nativeSymbol = String(quote.native_symbol || '').trim() || 'POL';
  const nativePriceNok = Number(quote.native_price_nok || 0);
  const requiredAmountCrypto = Number(quote.required_amount_crypto || 0);
  const requiredAmountCryptoString = String(
    quote.required_amount_crypto_string || ''
  ).trim();
  const requiredAmountWei = String(quote.required_amount_wei || '').trim();

  return {
    enabled: true,
    pricing_mode: pricingMode,
    reason:
      params.reason ||
      'Native crypto payment amount was quoted for this report price.',
    required_price_nok: requiredPriceNok,

    native_symbol: nativeSymbol,
    native_price_nok:
      Number.isFinite(nativePriceNok) && nativePriceNok > 0
        ? Number(nativePriceNok.toFixed(8))
        : undefined,

    required_amount_crypto:
      Number.isFinite(requiredAmountCrypto) && requiredAmountCrypto > 0
        ? round8(requiredAmountCrypto)
        : undefined,
    required_amount_crypto_string: requiredAmountCryptoString || undefined,
    required_amount_wei: requiredAmountWei || undefined,

    decimals: safeNativeDecimals(quote.decimals),
    min_confirmations: safeMinConfirmations(params.minConfirmations),
    allowed_underpayment_nok: Math.max(
      0,
      Number(params.allowedUnderpaymentNok || 0)
    ),

    message:
      quote.message ||
      `Send at least ${requiredAmountCryptoString} ${nativeSymbol} to unlock this report.`,

    quote_provider: String(quote.provider || priceQuote?.provider || ''),
    quote_source: String(quote.source || priceQuote?.source || ''),
    quote_source_id: String(quote.source_id || priceQuote?.source_id || ''),
    quote_source_url:
      String((quote as any).source_url || (priceQuote as any)?.source_url || '') ||
      undefined,
    quote_fetched_at: fetchedAt,
    quote_fetched_at_iso: fetchedAtIso,
    quote_stale: Boolean(quote.stale || priceQuote?.stale),
    quote_fallback: Boolean(quote.fallback || priceQuote?.fallback)
  };
}

export async function quoteLivePaymentEnforcementForNok(params: {
  env?: CryptoTreasuryEnv;
  priceNok: number;
  nativeSymbol?: string;
  decimals?: number;
  minConfirmations?: number;
  allowedUnderpaymentNok?: number;
  reason?: string;
  forceRefresh?: boolean;
  allowStale?: boolean;
  allowConfiguredFallback?: boolean;
}): Promise<PaymentEnforcementMetadata> {
  const config = params.env
    ? getCryptoTreasuryRuntimeConfig(params.env)
    : undefined;

  const nativeSymbol =
    params.nativeSymbol ||
    config?.native_symbol ||
    envString(params.env, ['PUBLIC_PAYMENT_ASSET'], 'POL');

  const decimals = safeNativeDecimals(
    params.decimals ?? config?.native_decimals ?? DEFAULT_NATIVE_DECIMALS
  );

  const quote = await quoteNativePaymentForNokLive({
    env: params.env,
    priceNok: params.priceNok,
    nativeSymbol,
    decimals,
    forceRefresh: params.forceRefresh ?? true,
    allowStale: params.allowStale ?? true,
    allowConfiguredFallback: params.allowConfiguredFallback ?? true
  });

  return buildPaymentEnforcementMetadataFromQuote({
    requiredPriceNok: params.priceNok,
    quote,
    reason: params.reason,
    minConfirmations:
      params.minConfirmations ??
      config?.min_confirmations ??
      DEFAULT_MIN_CONFIRMATIONS,
    allowedUnderpaymentNok:
      params.allowedUnderpaymentNok ??
      config?.allowed_underpayment_nok ??
      0
  });
}

export async function verifyNativeCryptoPaymentFromEnv(params: {
  env: CryptoTreasuryEnv;
  txHash: string;
  requiredPriceNok: number;
  nativeDecimals?: number;
  minConfirmations?: number;
  allowedUnderpaymentNok?: number;
  forceQuoteRefresh?: boolean;
  allowStaleQuote?: boolean;
  allowConfiguredFallback?: boolean;
}): Promise<CryptoPaymentVerification> {
  const config = getCryptoTreasuryRuntimeConfig(params.env);

  return verifyNativeCryptoDepositAgainstLivePrice({
    env: params.env,

    rpcUrl: config.rpc_url,
    treasuryAddress: config.treasury_address,
    txHash: params.txHash,
    chainId: config.chain_id,
    nativeSymbol: config.native_symbol,

    requiredPriceNok: params.requiredPriceNok,

    nativeDecimals: params.nativeDecimals ?? config.native_decimals,
    minConfirmations: params.minConfirmations ?? config.min_confirmations,
    allowedUnderpaymentNok:
      params.allowedUnderpaymentNok ?? config.allowed_underpayment_nok,

    forceQuoteRefresh: params.forceQuoteRefresh ?? true,
    allowStaleQuote: params.allowStaleQuote ?? true,
    allowConfiguredFallback: params.allowConfiguredFallback ?? true
  });
}

export function canCreditTreasuryFromVerifiedCryptoReceipt(
  receipt: CryptoReceipt
): boolean {
  if (!receipt || receipt.status !== 'verified') {
    return false;
  }

  if (receipt.payment_sufficient === false) {
    return false;
  }

  if (receipt.valuation_status !== 'final') {
    return false;
  }

  if (!Number.isFinite(Number(receipt.estimated_value_nok))) {
    return false;
  }

  if (Number(receipt.estimated_value_nok) <= 0) {
    return false;
  }

  return true;
}

export function buildLedgerEntryFromVerifiedCryptoReceipt(params: {
  receipt: CryptoReceipt;
  assetId?: string;
  opportunityId?: string;
  agentId?: string;
  description?: string;
  bucket?: LedgerEntry['bucket'];
  timestamp?: number;
}): LedgerEntry | null {
  const receipt = params.receipt;

  if (!canCreditTreasuryFromVerifiedCryptoReceipt(receipt)) {
    return null;
  }

  const amount = round2(Number(receipt.estimated_value_nok || 0));
  const timestamp = params.timestamp || receipt.created_at || Date.now();

  return {
    id: `ledger-${receipt.tx_hash}-${timestamp}`.slice(0, 180),
    timestamp,
    amount,
    type: 'credit',
    bucket: params.bucket || 'operating',
    description:
      params.description ||
      `Verified crypto payment received: ${receipt.amount_crypto_string} ${receipt.asset_symbol}`,
    agent_id: params.agentId,
    opportunity_id: params.opportunityId,
    asset_id: params.assetId,
    tx_hash: receipt.tx_hash,
    verified: true
  };
}

export function buildTaxReceiptFromCryptoReceipt(params: {
  receipt: CryptoReceipt;
  ledgerEntryId?: string;
  notes?: string;
}): TaxReceipt {
  const receipt = params.receipt;
  const hasFinalValue =
    receipt.valuation_status === 'final' &&
    receipt.estimated_value_nok !== null &&
    Number.isFinite(Number(receipt.estimated_value_nok));

  return {
    id: `tax-${receipt.tx_hash}-${receipt.created_at}`.slice(0, 180),
    created_at: receipt.created_at || Date.now(),
    type: 'crypto_deposit',
    status: hasFinalValue ? 'verified' : 'pending_value',

    tx_hash: receipt.tx_hash,
    chain_id: receipt.chain_id,
    from_address: receipt.from_address,
    to_address: receipt.to_address,

    asset_symbol: receipt.asset_symbol,
    amount_crypto: receipt.amount_crypto_string,

    fiat_currency: 'NOK',
    fiat_value_nok: hasFinalValue
      ? round2(Number(receipt.estimated_value_nok || 0))
      : null,
    valuation_status: hasFinalValue ? 'final' : 'pending',

    treasury_bucket: 'operating',
    ledger_entry_id: params.ledgerEntryId,

    source: receipt.source,
    notes:
      params.notes ||
      receipt.notes ||
      'Verified native crypto deposit tax receipt.'
  };
}

export function buildCryptoPaymentAccountingEntries(params: {
  receipt: CryptoReceipt;
  assetId?: string;
  opportunityId?: string;
  agentId?: string;
  description?: string;
  bucket?: LedgerEntry['bucket'];
}): CryptoPaymentAccountingEntries {
  const ledgerEntry = buildLedgerEntryFromVerifiedCryptoReceipt({
    receipt: params.receipt,
    assetId: params.assetId,
    opportunityId: params.opportunityId,
    agentId: params.agentId,
    description: params.description,
    bucket: params.bucket
  });

  const taxReceipt = buildTaxReceiptFromCryptoReceipt({
    receipt: params.receipt,
    ledgerEntryId: ledgerEntry?.id
  });

  return {
    should_credit_treasury: Boolean(ledgerEntry),
    receipt: params.receipt,
    ledger_entry: ledgerEntry || undefined,
    tax_receipt: taxReceipt
  };
}

