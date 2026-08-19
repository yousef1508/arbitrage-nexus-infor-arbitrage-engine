import OpenAI from 'openai';
import type { AgentRole } from './types';
import { executeTool } from './tools';
import {
  recordAiModelFailure,
  recordAiModelSuccess,
  selectAiModelForRole,
  shouldUseModelRouter,
  type AiModelRouterState
} from './ai-model-router';

type ContentEngineOptions = {
  env?: Record<string, unknown>;
  role?: AgentRole;
  routerState?: AiModelRouterState;
  getRouterState?: () => AiModelRouterState | undefined | Promise<AiModelRouterState | undefined>;
  onRouterStateChange?: (state: AiModelRouterState) => void | Promise<void>;
  maxFallbackAttempts?: number;
  maxTokens?: number;
};

type GeneratedContentAsset = {
  title: string;
  body: string;
  model?: string;
  fallbackAttempt?: number;
};

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

function normalizeModelId(value: unknown): string {
  return cleanText(value).toLowerCase();
}

function modelLooksLikeGemma(model: string): boolean {
  return normalizeModelId(model).includes('gemma');
}

function modelLooksLikeGemini(model: string): boolean {
  return normalizeModelId(model).includes('gemini');
}

function getStatus(error: unknown): number | undefined {
  const errAny = error as any;

  const candidates = [
    errAny?.status,
    errAny?.statusCode,
    errAny?.response?.status,
    errAny?.response?.statusCode,
    errAny?.error?.code,
    errAny?.code
  ];

  const status = candidates
    .map(Number)
    .find((value) => Number.isFinite(value) && value >= 100);

  return status ? Math.floor(status) : undefined;
}

function getHeaderLike(headers: any, key: string): string {
  if (!headers) return '';

  try {
    if (typeof headers.get === 'function') {
      return headers.get(key) || headers.get(key.toLowerCase()) || '';
    }

    return headers[key] || headers[key.toLowerCase()] || '';
  } catch {
    return '';
  }
}

function parseRetryAfterHeader(value: unknown): number | undefined {
  if (!value) return undefined;

  const raw = String(value).trim();

  if (!raw) return undefined;

  const seconds = Number(raw);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.max(1000, Math.floor(seconds * 1000));
  }

  const dateMs = Date.parse(raw);

  if (Number.isFinite(dateMs)) {
    return Math.max(1000, dateMs - Date.now());
  }

  return undefined;
}

function parseRetryDelayMs(error: unknown): number | undefined {
  const errAny = error as any;
  const stack: any[] = [
    errAny,
    errAny?.response,
    errAny?.error,
    errAny?.cause,
    errAny?.data,
    errAny?.body
  ];

  while (stack.length > 0) {
    const item = stack.shift();

    if (!item || typeof item !== 'object') continue;

    const retryDelay =
      item.retryDelay ||
      item.retry_delay ||
      item.retry_after ||
      item.retryAfter;

    if (retryDelay) {
      const asText = String(retryDelay);
      const secondsMatch = asText.match(/(\d+(?:\.\d+)?)s/i);

      if (secondsMatch) {
        return Math.max(1000, Math.floor(Number(secondsMatch[1]) * 1000));
      }

      const numeric = Number(retryDelay);

      if (Number.isFinite(numeric) && numeric >= 0) {
        return numeric > 1000 ? Math.floor(numeric) : Math.floor(numeric * 1000);
      }
    }

    for (const value of Object.values(item)) {
      if (Array.isArray(value)) {
        stack.push(...value);
      } else if (value && typeof value === 'object') {
        stack.push(value);
      }
    }
  }

  return undefined;
}

function parseRetryTextMs(message: string): number | undefined {
  const patterns = [
    /retry(?:\s+again)?\s+in\s+(\d+(?:\.\d+)?)\s*(ms|milliseconds|s|sec|secs|second|seconds|m|min|minute|minutes)/i,
    /try(?:\s+again)?\s+in\s+(\d+(?:\.\d+)?)\s*(ms|milliseconds|s|sec|secs|second|seconds|m|min|minute|minutes)/i,
    /wait\s+(\d+(?:\.\d+)?)\s*(ms|milliseconds|s|sec|secs|second|seconds|m|min|minute|minutes)/i
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);

    if (!match) continue;

    const value = Number(match[1]);
    const unit = String(match[2] || 's').toLowerCase();

    if (!Number.isFinite(value)) continue;

    if (unit.startsWith('ms') || unit.startsWith('millisecond')) {
      return Math.max(1000, Math.floor(value));
    }

    if (unit.startsWith('m') && !unit.startsWith('ms')) {
      return Math.max(1000, Math.floor(value * 60_000));
    }

    return Math.max(1000, Math.floor(value * 1000));
  }

  return undefined;
}

function nextPacificMidnightMs(now = Date.now()): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(now)).map((part) => [part.type, part.value])
  );

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);

  const approxTomorrowPacificMidnightUtc = Date.UTC(year, month - 1, day + 1, 8, 0, 0);

  return approxTomorrowPacificMidnightUtc <= now
    ? approxTomorrowPacificMidnightUtc + 86400000
    : approxTomorrowPacificMidnightUtc;
}

function isDailyQuotaMessage(message: string): boolean {
  const text = message.toLowerCase();

  return (
    text.includes('requests per day') ||
    text.includes('per day') ||
    text.includes('daily') ||
    text.includes('rpd') ||
    text.includes('quota exceeded') ||
    text.includes('resource_exhausted')
  );
}

function getRetryAfterMs(error: unknown): number {
  const errAny = error as any;
  const message = error instanceof Error ? error.message : String(error || '');

  const retryAfterHeader =
    getHeaderLike(errAny?.headers, 'retry-after') ||
    getHeaderLike(errAny?.response?.headers, 'retry-after');

  const headerDelay = parseRetryAfterHeader(retryAfterHeader);
  if (headerDelay) return headerDelay;

  const structuredDelay = parseRetryDelayMs(error);
  if (structuredDelay) return structuredDelay;

  const textDelay = parseRetryTextMs(message);
  if (textDelay) return textDelay;

  if (isDailyQuotaMessage(message)) {
    return Math.max(60_000, nextPacificMidnightMs() - Date.now());
  }

  return 30_000;
}

function isAiRateLimitError(error: unknown): boolean {
  const status = getStatus(error);
  const message = cleanText(error instanceof Error ? error.message : String(error || '')).toLowerCase();

  return (
    status === 429 ||
    message.includes('429') ||
    message.includes('rate limit') ||
    message.includes('ratelimit') ||
    message.includes('quota') ||
    message.includes('resource_exhausted')
  );
}

function isResponseFormatCompatibilityError(error: unknown): boolean {
  const status = getStatus(error);
  const message = cleanText(error instanceof Error ? error.message : String(error || '')).toLowerCase();

  return (
    status === 400 ||
    status === 422 ||
    message.includes('response_format') ||
    message.includes('json_object') ||
    message.includes('unsupported parameter') ||
    message.includes('unsupported')
  );
}

function isRecoverableModelError(error: unknown): boolean {
  const status = getStatus(error);
  const message = cleanText(error instanceof Error ? error.message : String(error || '')).toLowerCase();

  return (
    isAiRateLimitError(error) ||
    status === 400 ||
    status === 404 ||
    status === 409 ||
    status === 422 ||
    status === 503 ||
    message.includes('model') ||
    message.includes('not found') ||
    message.includes('unsupported') ||
    message.includes('resource_exhausted')
  );
}

function extractJsonObject(value: string): Record<string, unknown> {
  const raw = cleanText(value);

  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);

    if (!match) return {};

    try {
      const parsed = JSON.parse(match[0]);
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
}

/**
 * ContentEngine
 *
 * Generates content assets from validated opportunities.
 *
 * IMPORTANT:
 * This engine does not verify revenue and does not create treasury credits.
 * It can produce drafts/assets and estimated impact only.
 */
export class ContentEngine {
  private client: OpenAI;
  private model: string;
  private env: Record<string, unknown>;
  private role: AgentRole;
  private routerState?: AiModelRouterState;
  private getRouterStateCallback?: ContentEngineOptions['getRouterState'];
  private onRouterStateChange?: ContentEngineOptions['onRouterStateChange'];
  private maxFallbackAttempts: number;
  private explicitMaxTokens?: number;

  constructor(
    aiGatewayUrl: string,
    apiKey: string,
    model: string = 'gemini-2.5-flash',
    options: ContentEngineOptions = {}
  ) {
    this.client = new OpenAI({
      baseURL: aiGatewayUrl,
      apiKey,
      defaultHeaders: {
        'x-goog-api-key': apiKey
      }
    });

    this.model = normalizeModelId(model) || model;
    this.env = options.env || {};
    this.role = options.role || 'content_arb';
    this.routerState = options.routerState;
    this.getRouterStateCallback = options.getRouterState;
    this.onRouterStateChange = options.onRouterStateChange;
    this.maxFallbackAttempts = Math.max(1, Math.floor(options.maxFallbackAttempts || 6));
    this.explicitMaxTokens = options.maxTokens;
  }

  /**
   * Full execution loop for Content Arbitrage.
   *
   * Success means an asset draft/publish record was created.
   * Success does NOT mean revenue was generated.
   */
  async executeFullLoop(
    topic: string,
    niche: string
  ): Promise<{ success: boolean; profit: number; logs: string[] }> {
    const logs = [`ContentArb: INITIATING_ASSET_GENERATION for "${cleanText(topic)}"`];

    try {
      logs.push('ContentArb: Researching topic context from free/public sources...');

      const searchRes = await executeTool('web_search', {
        url: 'https://news.ycombinator.com/'
      });

      const context =
        searchRes && typeof searchRes === 'object' && 'content' in searchRes
          ? String((searchRes as any).content)
          : 'No context found';

      const asset = await this.generateContent(topic, niche, context);

      logs.push(
        `ContentArb: Synthesized content asset with ${asset.model || this.model}` +
          (typeof asset.fallbackAttempt === 'number' && asset.fallbackAttempt > 0
            ? ` fallback_attempt=${asset.fallbackAttempt}`
            : '')
      );

      logs.push('ContentArb: Creating local publish record...');
      const pub = await this.publishContent(asset, 'webhook');

      if (!pub.success) {
        return {
          success: false,
          profit: 0,
          logs: [...logs, 'ContentArb: Asset publish record failed']
        };
      }

      const metrics = await this.trackEngagement(pub.content_id);

      logs.push(`ContentArb: Asset record created [ID: ${pub.content_id}]`);
      logs.push(
        `ContentArb: Estimated upside ${metrics.estimated_upside} recorded as projection only, not verified revenue`
      );

      return {
        success: true,
        profit: 0,
        logs
      };
    } catch (error) {
      console.error('[CONTENT_ENGINE] Loop failed:', error);

      return {
        success: false,
        profit: 0,
        logs: [
          ...logs,
          `ContentArb: Error - ${
            error instanceof Error ? error.message : String(error)
          }`
        ]
      };
    }
  }

  async generateContent(
    topic: string,
    niche: string,
    context: string
  ): Promise<GeneratedContentAsset> {
    const safeTopic = cleanText(topic || 'Untitled opportunity');
    const safeNiche = cleanText(niche || 'General');
    const safeContext = cleanText(context || '').slice(0, 2500);

    const prompt = `
CONTEXT DATA:
${safeContext}

Generate a useful content asset draft.

NICHE:
${safeNiche}

TOPIC:
${safeTopic}

The asset should be practical and monetizable later through affiliate, lead generation, referral, or paid intelligence-report paths.

Rules:
- Do not claim verified revenue.
- Do not claim guaranteed conversions.
- Do not mention fake users, fake buyers, or fake profit.
- Keep it useful as a downstream intelligence asset.
- Return ONLY valid JSON.

JSON schema:
{
  "title": string,
  "body": string
}
`.trim();

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content:
          'You generate practical content assets. Output only valid JSON. Do not claim revenue, conversions, or verified profit.'
      },
      {
        role: 'user',
        content: prompt
      }
    ];

    const modelPlan = await this.buildModelAttemptPlan();
    let lastError: unknown;

    for (let attemptIndex = 0; attemptIndex < modelPlan.length; attemptIndex++) {
      const targetModel = modelPlan[attemptIndex];

      try {
        const result = await this.createCompletionJson({
          model: targetModel,
          messages,
          responseFormat: true
        });

        await this.recordModelSuccess(targetModel);

        return {
          ...this.normalizeGeneratedAsset(result, safeTopic, safeNiche),
          model: targetModel,
          fallbackAttempt: attemptIndex
        };
      } catch (error) {
        lastError = error;

        if (isResponseFormatCompatibilityError(error)) {
          try {
            const result = await this.createCompletionJson({
              model: targetModel,
              messages,
              responseFormat: false
            });

            await this.recordModelSuccess(targetModel);

            return {
              ...this.normalizeGeneratedAsset(result, safeTopic, safeNiche),
              model: targetModel,
              fallbackAttempt: attemptIndex
            };
          } catch (fallbackError) {
            lastError = fallbackError;
          }
        }

        await this.recordModelFailure(targetModel, lastError);

        console.error('[CONTENT_ENGINE] Model attempt failed:', {
          model: targetModel,
          attempt: attemptIndex,
          status: getStatus(lastError),
          message: lastError instanceof Error ? lastError.message : String(lastError)
        });

        if (!isRecoverableModelError(lastError)) {
          throw lastError;
        }
      }
    }

    throw lastError || new Error('CONTENT_ENGINE_NO_AVAILABLE_MODEL');
  }

  private async createCompletionJson(input: {
    model: string;
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    responseFormat: boolean;
  }): Promise<Record<string, unknown>> {
    const params: any = {
      model: input.model,
      messages: input.messages,
      max_tokens: this.getMaxTokensForModel(input.model),
      stream: false
    };

    if (input.responseFormat) {
      params.response_format = { type: 'json_object' };
    }

    const completion = await this.client.chat.completions.create(params);
    const content = completion.choices?.[0]?.message?.content || '{}';

    return extractJsonObject(content);
  }

  private normalizeGeneratedAsset(
    result: Record<string, unknown>,
    topic: string,
    niche: string
  ): { title: string; body: string } {
    const title = cleanText(result.title || '');

    const body = cleanText(result.body || '');

    return {
      title: title || `Insight: ${topic}`,
      body: body || `Draft analysis of ${topic} in ${niche}.`
    };
  }

  async publishContent(
    content: { title: string; body: string },
    platform: 'webhook'
  ): Promise<{ success: boolean; content_id: string }> {
    await new Promise((resolve) => setTimeout(resolve, 250));

    console.log('[CONTENT_ASSET_CREATED]', {
      platform,
      title: cleanText(content.title),
      bodyPreview: cleanText(content.body).slice(0, 500)
    });

    return {
      success: true,
      content_id: `asset-${crypto.randomUUID().slice(0, 8)}`
    };
  }

  async trackEngagement(contentId: string): Promise<{ estimated_upside: number }> {
    const seed = cleanText(contentId)
      .split('')
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);

    const estimatedUpside = 15 + (seed % 35);

    return {
      estimated_upside: Number(estimatedUpside.toFixed(2))
    };
  }

  private getMaxTokensForModel(model: string): number {
    if (this.explicitMaxTokens && this.explicitMaxTokens > 0) {
      return Math.floor(this.explicitMaxTokens);
    }

    const envAny = this.env as any;
    const globalMax = safeNumber(envAny.AI_RESPONSE_MAX_TOKENS, 0);

    if (globalMax > 0) return Math.floor(globalMax);

    if (modelLooksLikeGemma(model)) {
      return Math.floor(safeNumber(envAny.AI_GEMMA_MAX_TOKENS, 3072));
    }

    if (modelLooksLikeGemini(model)) {
      return Math.floor(safeNumber(envAny.AI_GEMINI_MAX_TOKENS, 4096));
    }

    return 3072;
  }

  private async buildModelAttemptPlan(): Promise<string[]> {
    const plan: string[] = [];
    const excluded = new Set<string>();
    const state = await this.getCurrentRouterState();
    const routerEnabled = shouldUseModelRouter(this.env);

    const addModel = (model: unknown) => {
      const normalized = normalizeModelId(model);

      if (!normalized || excluded.has(normalized)) return;

      excluded.add(normalized);
      plan.push(normalized);
    };

    if (routerEnabled) {
      for (let index = 0; index < this.maxFallbackAttempts; index++) {
        const selection = selectAiModelForRole({
          role: this.role,
          env: this.env,
          state,
          excludeModelIds: Array.from(excluded)
        });

        addModel(selection.model);
      }
    }

    addModel(this.model);
    addModel('gemini-3.1-flash-lite');
    addModel('gemma-3-27b');

    return plan.slice(0, this.maxFallbackAttempts);
  }

  private async getCurrentRouterState(): Promise<AiModelRouterState | undefined> {
    if (this.getRouterStateCallback) {
      try {
        const state = await this.getRouterStateCallback();

        if (state) {
          this.routerState = state;
        }
      } catch (error) {
        console.warn('[CONTENT_ENGINE] Router state callback failed:', error);
      }
    }

    return this.routerState;
  }

  private async saveRouterState(state: AiModelRouterState) {
    this.routerState = state;

    if (this.onRouterStateChange) {
      try {
        await this.onRouterStateChange(state);
      } catch (error) {
        console.warn('[CONTENT_ENGINE] Router state save callback failed:', error);
      }
    }
  }

  private async recordModelSuccess(model: string) {
    const current = await this.getCurrentRouterState();

    const next = recordAiModelSuccess(current, {
      model
    });

    await this.saveRouterState(next);
  }

  private async recordModelFailure(model: string, error: unknown) {
    const current = await this.getCurrentRouterState();

    const next = recordAiModelFailure(current, {
      model,
      status: getStatus(error),
      message: error instanceof Error ? error.message : String(error || ''),
      retryAfterMs: getRetryAfterMs(error)
    });

    await this.saveRouterState(next);
  }

  updateModel(newModel: string): void {
    const normalized = normalizeModelId(newModel);

    if (normalized) {
      this.model = normalized;
    }
  }

  updateRouterState(state: AiModelRouterState): void {
    this.routerState = state;
  }

  getRouterState(): AiModelRouterState | undefined {
    return this.routerState;
  }
}