import type {
  NexusCurrencyCode,
  NexusFxRate,
  NexusFxSnapshot,
  NexusMoneyAmount
} from './types';

type FxEnv = Record<string, unknown>;

const DEFAULT_NOK_PER_USD = 10.5;

function safeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = safeNumber(value, fallback);
  return Math.max(min, Math.min(max, parsed));
}

function firstConfiguredNumber(env: FxEnv | undefined, keys: string[]): number | null {
  if (!env) return null;

  for (const key of keys) {
    const raw = env[key];

    if (raw === undefined || raw === null || String(raw).trim() === '') {
      continue;
    }

    const parsed = Number(raw);

    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

export function getConfiguredNokPerUsd(env?: FxEnv): {
  rate: number;
  source: NexusFxRate['source'];
} {
  const configured = firstConfiguredNumber(env, [
    'FX_NOK_PER_USD',
    'PUBLIC_FX_NOK_PER_USD',
    'NOK_PER_USD',
    'USDNOK_RATE',
    'PUBLIC_USDNOK_RATE'
  ]);

  if (configured && configured >= 1 && configured <= 50) {
    return {
      rate: configured,
      source: 'env'
    };
  }

  return {
    rate: DEFAULT_NOK_PER_USD,
    source: 'fallback'
  };
}

export function buildFxSnapshot(env?: FxEnv, now = Date.now()): NexusFxSnapshot {
  const configured = getConfiguredNokPerUsd(env);
  const nokPerUsd = clampNumber(configured.rate, 1, 50, DEFAULT_NOK_PER_USD);
  const usdPerNok = 1 / nokPerUsd;
  const iso = new Date(now).toISOString();

  return {
    nok_per_usd: {
      base: 'USD',
      quote: 'NOK',
      rate: Number(nokPerUsd.toFixed(6)),
      source: configured.source,
      fetched_at: now,
      fetched_at_iso: iso
    },
    usd_per_nok: {
      base: 'NOK',
      quote: 'USD',
      rate: Number(usdPerNok.toFixed(8)),
      source: configured.source,
      fetched_at: now,
      fetched_at_iso: iso
    }
  };
}

export function convertUsdToNok(
  amountUsd: unknown,
  env?: FxEnv,
  now = Date.now()
): NexusMoneyAmount {
  const fx = buildFxSnapshot(env, now);
  const amount = Math.max(0, safeNumber(amountUsd, 0) * fx.nok_per_usd.rate);

  return {
    amount: Number(amount.toFixed(2)),
    currency: 'NOK',
    formatted: formatMoney(amount, 'NOK'),
    rate_source: fx.nok_per_usd.source,
    converted_at: now,
    converted_at_iso: new Date(now).toISOString()
  };
}

export function convertNokToUsd(
  amountNok: unknown,
  env?: FxEnv,
  now = Date.now()
): NexusMoneyAmount {
  const fx = buildFxSnapshot(env, now);
  const amount = Math.max(0, safeNumber(amountNok, 0) * fx.usd_per_nok.rate);

  return {
    amount: Number(amount.toFixed(2)),
    currency: 'USD',
    formatted: formatMoney(amount, 'USD'),
    rate_source: fx.usd_per_nok.source,
    converted_at: now,
    converted_at_iso: new Date(now).toISOString()
  };
}

export function convertMoney(
  amount: unknown,
  from: NexusCurrencyCode,
  to: NexusCurrencyCode,
  env?: FxEnv,
  now = Date.now()
): NexusMoneyAmount {
  if (from === to) {
    const normalized = Math.max(0, safeNumber(amount, 0));

    return {
      amount: Number(normalized.toFixed(2)),
      currency: to,
      formatted: formatMoney(normalized, to),
      converted_at: now,
      converted_at_iso: new Date(now).toISOString()
    };
  }

  if (from === 'USD' && to === 'NOK') {
    return convertUsdToNok(amount, env, now);
  }

  return convertNokToUsd(amount, env, now);
}

export function formatMoney(amount: unknown, currency: NexusCurrencyCode): string {
  const numeric = Math.max(0, safeNumber(amount, 0));

  try {
    return new Intl.NumberFormat(currency === 'NOK' ? 'nb-NO' : 'en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: currency === 'NOK' ? 0 : 2
    }).format(numeric);
  } catch {
    const fixed = currency === 'NOK'
      ? Math.round(numeric).toString()
      : numeric.toFixed(2);

    return currency === 'NOK' ? `${fixed} NOK` : `$${fixed}`;
  }
}

export function formatNok(amount: unknown): string {
  return formatMoney(amount, 'NOK');
}

export function formatUsd(amount: unknown): string {
  return formatMoney(amount, 'USD');
}

export function normalizeProjectedValues(input: {
  projected_market_value_usd?: unknown;
  projected_market_value_nok?: unknown;
  env?: FxEnv;
  now?: number;
}): {
  projected_market_value_usd: number;
  projected_market_value_nok: number;
  projected_value_display_usd: string;
  projected_value_display_nok: string;
  fx: NexusFxSnapshot;
} {
  const now = input.now || Date.now();
  const fx = buildFxSnapshot(input.env, now);

  const explicitUsd = safeNumber(input.projected_market_value_usd, 0);
  const explicitNok = safeNumber(input.projected_market_value_nok, 0);

  let usd = explicitUsd;
  let nok = explicitNok;

  if (usd > 0 && nok <= 0) {
    nok = usd * fx.nok_per_usd.rate;
  } else if (nok > 0 && usd <= 0) {
    usd = nok * fx.usd_per_nok.rate;
  }

  usd = Math.max(0, usd);
  nok = Math.max(0, nok);

  return {
    projected_market_value_usd: Number(usd.toFixed(2)),
    projected_market_value_nok: Number(nok.toFixed(2)),
    projected_value_display_usd: formatUsd(usd),
    projected_value_display_nok: formatNok(nok),
    fx
  };
}
