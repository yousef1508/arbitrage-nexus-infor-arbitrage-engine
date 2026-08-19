import type { AgentRole } from './types';

export type AiModelFamily = 'gemini' | 'gemma' | 'unknown';

export type AiModelRuntimeState = {
  id: string;
  day_key?: string;
  requests_today?: number;
  last_used_at?: number;
  last_used_at_iso?: string;
  disabled_until?: number;
  disabled_until_iso?: string;
  consecutive_rate_limits?: number;
  last_status?: number;
  last_error?: string;
  last_error_at?: number;
  last_error_at_iso?: string;
};

export type AiModelRouterState = Record<string, AiModelRuntimeState>;

export type AiModelCandidate = {
  id: string;
  label: string;
  family: AiModelFamily;
  roles: AgentRole[] | '*';

  /**
   * Lower number wins.
   * Quality tie-breaker is applied after priority.
   */
  priority: number;

  /**
   * Internal quality score only.
   * Higher number wins within same priority band.
   */
  quality_score: number;

  /**
   * Free-tier limits from your observed Google AI Studio quota page.
   * These are used for local routing/pacing only.
   */
  free_rpm?: number;
  free_tpm?: number;
  free_rpd?: number;

  /**
   * Set false to keep the model in the catalog but skip it.
   */
  enabled: boolean;

  notes?: string;
};

export type AiModelSelection = {
  model: string;
  candidate: AiModelCandidate;
  fallback_rank: number;
  reason: string;
};

export type AiModelFailureInput = {
  model: string;
  status?: number;
  message?: string;
  retryAfterMs?: number;
  now?: number;
};

export type AiModelSuccessInput = {
  model: string;
  now?: number;
};

function cleanText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function truthy(value: unknown): boolean {
  return ['true', '1', 'yes', 'y', 'on'].includes(
    String(value || '').trim().toLowerCase()
  );
}

function dayKeyPacific(now = Date.now()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  return formatter.format(new Date(now));
}

function normalizeModelId(value: unknown): string {
  return cleanText(value).toLowerCase();
}

function normalizeRoleEnvKey(role: AgentRole): string {
  return `AI_MODEL_POOL_${role.toUpperCase()}`;
}

function modelSupportsRole(candidate: AiModelCandidate, role: AgentRole): boolean {
  return candidate.roles === '*' || candidate.roles.includes(role);
}

function runtimeForModel(
  state: AiModelRouterState | undefined,
  model: string,
  now = Date.now()
): AiModelRuntimeState {
  const existing = state?.[model];
  const currentDayKey = dayKeyPacific(now);

  if (!existing) {
    return {
      id: model,
      day_key: currentDayKey,
      requests_today: 0,
      consecutive_rate_limits: 0
    };
  }

  if (existing.day_key !== currentDayKey) {
    return {
      ...existing,
      id: model,
      day_key: currentDayKey,
      requests_today: 0,
      consecutive_rate_limits: 0,
      disabled_until: existing.disabled_until && existing.disabled_until > now
        ? existing.disabled_until
        : undefined,
      disabled_until_iso: existing.disabled_until && existing.disabled_until > now
        ? existing.disabled_until_iso
        : undefined
    };
  }

  return {
    ...existing,
    id: model
  };
}

function parseCsv(value: unknown): string[] {
  return cleanText(value)
    .split(',')
    .map((item) => normalizeModelId(item))
    .filter(Boolean);
}

function parseModelOverrides(env?: Record<string, unknown>): Partial<AiModelCandidate>[] {
  const raw = cleanText(env?.AI_MODEL_CATALOG_JSON);

  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((item) => item as Partial<AiModelCandidate>);
  } catch {
    return [];
  }
}

function mergeCatalogOverrides(
  baseCatalog: AiModelCandidate[],
  overrides: Partial<AiModelCandidate>[]
): AiModelCandidate[] {
  const byId = new Map<string, AiModelCandidate>();

  for (const candidate of baseCatalog) {
    byId.set(candidate.id, candidate);
  }

  for (const override of overrides) {
    const id = normalizeModelId(override.id);

    if (!id) continue;

    const existing = byId.get(id);

    if (!existing) {
      byId.set(id, {
        id,
        label: cleanText(override.label || id),
        family: override.family || 'unknown',
        roles: override.roles || '*',
        priority: safeNumber(override.priority, 999),
        quality_score: safeNumber(override.quality_score, 50),
        free_rpm: override.free_rpm,
        free_tpm: override.free_tpm,
        free_rpd: override.free_rpd,
        enabled: override.enabled !== false,
        notes: override.notes
      });

      continue;
    }

    byId.set(id, {
      ...existing,
      ...override,
      id,
      label: cleanText(override.label || existing.label),
      family: override.family || existing.family,
      roles: override.roles || existing.roles,
      priority: safeNumber(override.priority, existing.priority),
      quality_score: safeNumber(override.quality_score, existing.quality_score),
      enabled: override.enabled ?? existing.enabled
    });
  }

  return Array.from(byId.values());
}

/**
 * Default free-model routing catalog based on the quota table you showed.
 * Keep it conservative: analyst/chat get better models first, high-RPD Gemma/Gemini Lite
 * models are used as fallback capacity instead of burning the 20-RPD models immediately.
 */
export function getDefaultAiModelCatalog(env?: Record<string, unknown>): AiModelCandidate[] {
  const base: AiModelCandidate[] = [
    {
      id: 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash',
      family: 'gemini',
      roles: ['analyst', 'router', 'content_arb', 'chat' as AgentRole, 'trading'].filter(Boolean) as AgentRole[],
      priority: 10,
      quality_score: 96,
      free_rpm: 5,
      free_tpm: 250000,
      free_rpd: 20,
      enabled: true,
      notes: 'Highest-quality default for analysis when daily quota remains.'
    },
    {
      id: 'gemini-2.5-flash-lite',
      label: 'Gemini 2.5 Flash Lite',
      family: 'gemini',
      roles: '*',
      priority: 20,
      quality_score: 90,
      free_rpm: 10,
      free_tpm: 250000,
      free_rpd: 20,
      enabled: true,
      notes: 'Fast primary fallback for most agents.'
    },
    {
      id: 'gemini-3.1-flash-lite',
      label: 'Gemini 3.1 Flash Lite',
      family: 'gemini',
      roles: '*',
      priority: 30,
      quality_score: 88,
      free_rpm: 15,
      free_tpm: 250000,
      free_rpd: 500,
      enabled: true,
      notes: 'High daily request allowance; strong autonomous fallback.'
    },
    {
      id: 'gemini-3-flash',
      label: 'Gemini 3 Flash',
      family: 'gemini',
      roles: ['analyst', 'router', 'content_arb', 'chat' as AgentRole].filter(Boolean) as AgentRole[],
      priority: 40,
      quality_score: 92,
      free_rpm: 5,
      free_tpm: 250000,
      free_rpd: 20,
      enabled: true,
      notes: 'Quality fallback when 2.5 Flash is unavailable.'
    },
    {
      id: 'gemma-3-27b',
      label: 'Gemma 3 27B',
      family: 'gemma',
      roles: '*',
      priority: 50,
      quality_score: 82,
      free_rpm: 30,
      free_tpm: 15000,
      free_rpd: 14400,
      enabled: true,
      notes: 'High-RPD fallback for keeping autonomous cycles alive.'
    },
    {
      id: 'gemma-3-12b',
      label: 'Gemma 3 12B',
      family: 'gemma',
      roles: '*',
      priority: 60,
      quality_score: 76,
      free_rpm: 30,
      free_tpm: 15000,
      free_rpd: 14400,
      enabled: true,
      notes: 'Secondary high-RPD fallback.'
    },
    {
      id: 'gemma-4-31b',
      label: 'Gemma 4 31B',
      family: 'gemma',
      roles: '*',
      priority: 70,
      quality_score: 84,
      free_rpm: 15,
      free_rpd: 1500,
      enabled: true,
      notes: 'Useful fallback if available on the same API key.'
    },
    {
      id: 'gemma-4-26b',
      label: 'Gemma 4 26B',
      family: 'gemma',
      roles: '*',
      priority: 80,
      quality_score: 80,
      free_rpm: 15,
      free_rpd: 1500,
      enabled: true,
      notes: 'Useful fallback if available on the same API key.'
    },
    {
      id: 'gemma-3-4b',
      label: 'Gemma 3 4B',
      family: 'gemma',
      roles: ['scout', 'affiliate', 'lead_gen', 'referral', 'resale'],
      priority: 90,
      quality_score: 62,
      free_rpm: 30,
      free_tpm: 15000,
      free_rpd: 14400,
      enabled: true,
      notes: 'Cheap/simple fallback for non-critical agent tasks.'
    },
    {
      id: 'gemma-3-1b',
      label: 'Gemma 3 1B',
      family: 'gemma',
      roles: ['scout', 'affiliate', 'lead_gen', 'referral', 'resale'],
      priority: 100,
      quality_score: 48,
      free_rpm: 30,
      free_tpm: 15000,
      free_rpd: 14400,
      enabled: true,
      notes: 'Last-resort simple fallback.'
    }
  ];

  const disabledCsv = parseCsv(env?.AI_DISABLED_MODELS);
  const overrides = parseModelOverrides(env);

  return mergeCatalogOverrides(base, overrides)
    .map((candidate) => ({
      ...candidate,
      enabled: candidate.enabled && !disabledCsv.includes(candidate.id)
    }))
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.quality_score - a.quality_score;
    });
}

export function getRoleModelPool(
  role: AgentRole,
  env?: Record<string, unknown>,
  catalog = getDefaultAiModelCatalog(env)
): AiModelCandidate[] {
  const roleKey = normalizeRoleEnvKey(role);
  const globalPool = parseCsv(env?.AI_MODEL_POOL);
  const rolePool = parseCsv(env?.[roleKey]);

  const explicitPool = rolePool.length > 0 ? rolePool : globalPool;

  let candidates = catalog.filter((candidate) =>
    candidate.enabled && modelSupportsRole(candidate, role)
  );

  if (explicitPool.length > 0) {
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));

    candidates = explicitPool
      .map((id, index) => {
        const existing = byId.get(id);

        if (existing) {
          return {
            ...existing,
            priority: index + 1
          };
        }

        return {
          id,
          label: id,
          family: id.includes('gemma') ? 'gemma' : id.includes('gemini') ? 'gemini' : 'unknown',
          roles: '*',
          priority: index + 1,
          quality_score: Math.max(10, 70 - index),
          enabled: true,
          notes: 'Explicitly configured by environment.'
        } satisfies AiModelCandidate;
      })
      .filter((candidate) => candidate.enabled);
  }

  return candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.quality_score - a.quality_score;
  });
}

export function isModelAvailable(input: {
  candidate: AiModelCandidate;
  state?: AiModelRouterState;
  now?: number;
}): boolean {
  const now = input.now ?? Date.now();
  const runtime = runtimeForModel(input.state, input.candidate.id, now);

  if (!input.candidate.enabled) return false;

  if (runtime.disabled_until && runtime.disabled_until > now) {
    return false;
  }

  if (
    input.candidate.free_rpd &&
    safeNumber(runtime.requests_today, 0) >= input.candidate.free_rpd
  ) {
    return false;
  }

  return true;
}

export function selectAiModelForRole(input: {
  role: AgentRole;
  env?: Record<string, unknown>;
  state?: AiModelRouterState;
  excludeModelIds?: string[];
  now?: number;
}): AiModelSelection {
  const now = input.now ?? Date.now();
  const excluded = new Set((input.excludeModelIds || []).map(normalizeModelId));
  const pool = getRoleModelPool(input.role, input.env);

  const available = pool.filter((candidate) =>
    !excluded.has(candidate.id) &&
    isModelAvailable({
      candidate,
      state: input.state,
      now
    })
  );

  const chosen = available[0] || pool.find((candidate) => !excluded.has(candidate.id)) || pool[0];

  if (!chosen) {
    return {
      model: 'gemini-3.1-flash-lite',
      candidate: {
        id: 'gemini-3.1-flash-lite',
        label: 'Gemini 3.1 Flash Lite',
        family: 'gemini',
        roles: '*',
        priority: 1,
        quality_score: 80,
        free_rpd: 500,
        enabled: true
      },
      fallback_rank: 0,
      reason: 'EMPTY_POOL_DEFAULT'
    };
  }

  const rank = Math.max(0, pool.findIndex((candidate) => candidate.id === chosen.id));

  return {
    model: chosen.id,
    candidate: chosen,
    fallback_rank: rank,
    reason:
      available.length > 0
        ? rank === 0
          ? 'PRIMARY_MODEL_AVAILABLE'
          : 'PRIMARY_LIMITED_USING_FALLBACK'
        : 'ALL_MODELS_LIMITED_USING_BEST_EFFORT'
  };
}

export function recordAiModelSuccess(
  state: AiModelRouterState | undefined,
  input: AiModelSuccessInput
): AiModelRouterState {
  const now = input.now ?? Date.now();
  const model = normalizeModelId(input.model);
  const runtime = runtimeForModel(state, model, now);

  return {
    ...(state || {}),
    [model]: {
      ...runtime,
      id: model,
      day_key: dayKeyPacific(now),
      requests_today: safeNumber(runtime.requests_today, 0) + 1,
      last_used_at: now,
      last_used_at_iso: new Date(now).toISOString(),
      consecutive_rate_limits: 0,
      last_error: undefined,
      last_status: undefined
    }
  };
}

export function recordAiModelFailure(
  state: AiModelRouterState | undefined,
  input: AiModelFailureInput
): AiModelRouterState {
  const now = input.now ?? Date.now();
  const model = normalizeModelId(input.model);
  const runtime = runtimeForModel(state, model, now);
  const retryAfterMs = Math.max(0, Math.floor(input.retryAfterMs || 0));
  const disabledUntil = retryAfterMs > 0 ? now + retryAfterMs : runtime.disabled_until;

  return {
    ...(state || {}),
    [model]: {
      ...runtime,
      id: model,
      day_key: dayKeyPacific(now),
      disabled_until: disabledUntil,
      disabled_until_iso: disabledUntil ? new Date(disabledUntil).toISOString() : undefined,
      consecutive_rate_limits: safeNumber(runtime.consecutive_rate_limits, 0) + 1,
      last_status: input.status,
      last_error: cleanText(input.message).slice(0, 500),
      last_error_at: now,
      last_error_at_iso: new Date(now).toISOString()
    }
  };
}

export function getNextModelSafeAttemptAt(
  state: AiModelRouterState | undefined,
  role: AgentRole,
  env?: Record<string, unknown>,
  now = Date.now()
): number {
  const pool = getRoleModelPool(role, env);

  const blockedUntil = pool
    .map((candidate) => runtimeForModel(state, candidate.id, now).disabled_until || 0)
    .filter((value) => value > now);

  if (pool.some((candidate) => isModelAvailable({ candidate, state, now }))) {
    return now;
  }

  if (blockedUntil.length === 0) {
    return now;
  }

  return Math.min(...blockedUntil);
}

export function summarizeAiModelRouter(input: {
  state?: AiModelRouterState;
  env?: Record<string, unknown>;
  roles?: AgentRole[];
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const roles = input.roles || [
    'scout',
    'analyst',
    'router',
    'content_arb',
    'affiliate',
    'lead_gen',
    'referral',
    'resale',
    'trading'
  ];

  return {
    generated_at: now,
    generated_at_iso: new Date(now).toISOString(),
    roles: roles.map((role) => {
      const selection = selectAiModelForRole({
        role,
        env: input.env,
        state: input.state,
        now
      });

      return {
        role,
        selected_model: selection.model,
        fallback_rank: selection.fallback_rank,
        reason: selection.reason,
        next_safe_attempt_at: getNextModelSafeAttemptAt(input.state, role, input.env, now)
      };
    }),
    models: Object.values(input.state || {})
  };
}

export function shouldUseModelRouter(env?: Record<string, unknown>): boolean {
  const raw = env?.AI_MODEL_ROUTER_ENABLED;

  if (raw === undefined || raw === null || cleanText(raw) === '') {
    return true;
  }

  return truthy(raw);
}