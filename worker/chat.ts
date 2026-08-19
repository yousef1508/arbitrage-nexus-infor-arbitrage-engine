import OpenAI from 'openai';
import type { AgentRole, Message, ToolCall } from './types';
import { getToolDefinitions, executeTool } from './tools';
import {
  recordAiModelFailure,
  recordAiModelSuccess,
  selectAiModelForRole,
  shouldUseModelRouter,
  type AiModelRouterState
} from './ai-model-router';

type ChatHandlerOptions = {
  env?: Record<string, unknown>;
  role?: AgentRole;
  routerState?: AiModelRouterState;
  getRouterState?: () => AiModelRouterState | undefined | Promise<AiModelRouterState | undefined>;
  onRouterStateChange?: (state: AiModelRouterState) => void | Promise<void>;
  maxFallbackAttempts?: number;
  maxTokens?: number;
  toolsEnabled?: boolean;
};

type ChatResult = {
  content: string;
  toolCalls?: ToolCall[];
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

function truthy(value: unknown): boolean {
  return ['true', '1', 'yes', 'y', 'on'].includes(
    String(value || '').trim().toLowerCase()
  );
}

function normalizeModelId(value: unknown): string {
  return cleanText(value).toLowerCase();
}

function getDefaultHeaders(apiKey: string): Record<string, string> {
  return {
    'x-goog-api-key': apiKey
  };
}

function modelLooksLikeGemma(model: string): boolean {
  return normalizeModelId(model).includes('gemma');
}

function modelLooksLikeGemini(model: string): boolean {
  return normalizeModelId(model).includes('gemini');
}

function modelLikelySupportsTools(model: string): boolean {
  const normalized = normalizeModelId(model);

  if (normalized.includes('gemma')) return false;
  if (normalized.includes('embedding')) return false;
  if (normalized.includes('image')) return false;

  return true;
}

function extractStatus(error: unknown): number | undefined {
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
    ? approxTomorrowPacificMidnightUtc + 86_400_000
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
  const errAny = error as any;
  const status = extractStatus(error);
  const message = String(errAny?.message || error || '').toLowerCase();

  return (
    status === 429 ||
    message.includes('429') ||
    message.includes('rate limit') ||
    message.includes('ratelimit') ||
    message.includes('quota') ||
    message.includes('resource_exhausted')
  );
}

function isRecoverableModelError(error: unknown): boolean {
  const status = extractStatus(error);
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
    message.includes('tool') ||
    message.includes('function')
  );
}

function isToolCompatibilityError(error: unknown): boolean {
  const status = extractStatus(error);
  const message = cleanText(error instanceof Error ? error.message : String(error || '')).toLowerCase();

  return (
    status === 400 ||
    status === 422 ||
    message.includes('tool') ||
    message.includes('function calling') ||
    message.includes('function_call') ||
    message.includes('tool_choice') ||
    message.includes('tools is not supported') ||
    message.includes('unsupported parameter')
  );
}

function safeJsonStringify(value: unknown, maxLength = 20_000): string {
  try {
    const text = JSON.stringify(value ?? {});
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  } catch {
    return JSON.stringify({
      error: 'SERIALIZATION_FAILED',
      value: String(value)
    });
  }
}

export class ChatHandler {
  private client: OpenAI;
  private model: string;
  private env: Record<string, unknown>;
  private role: AgentRole;
  private routerState?: AiModelRouterState;
  private getRouterStateCallback?: ChatHandlerOptions['getRouterState'];
  private onRouterStateChange?: ChatHandlerOptions['onRouterStateChange'];
  private maxFallbackAttempts: number;
  private explicitMaxTokens?: number;
  private toolsEnabled: boolean;

  constructor(
    aiGatewayUrl: string,
    apiKey: string,
    model: string,
    options: ChatHandlerOptions = {}
  ) {
    this.model = normalizeModelId(model) || model;
    this.env = options.env || {};
    this.role = options.role || 'analyst';
    this.routerState = options.routerState;
    this.getRouterStateCallback = options.getRouterState;
    this.onRouterStateChange = options.onRouterStateChange;
    this.maxFallbackAttempts = Math.max(1, Math.floor(options.maxFallbackAttempts || 6));
    this.explicitMaxTokens = options.maxTokens;
    this.toolsEnabled = options.toolsEnabled !== false;

    this.client = new OpenAI({
      baseURL: aiGatewayUrl,
      apiKey,
      defaultHeaders: getDefaultHeaders(apiKey)
    });
  }

  async processMessage(
    message: string,
    conversationHistory: Message[],
    onChunk?: (chunk: string) => void,
    modelOverride?: string
  ): Promise<ChatResult> {
    const messages = this.buildConversationMessages(message, conversationHistory);
    const toolDefinitions = await this.safeGetToolDefinitions();
    const modelPlan = await this.buildModelAttemptPlan(modelOverride);

    let lastError: unknown;

    const runAttempt = async (input: {
      targetModel: string;
      attemptIndex: number;
      allowTools: boolean;
    }): Promise<ChatResult> => {
      const { targetModel, attemptIndex, allowTools } = input;

      const result = onChunk
        ? await this.createStreamingCompletion({
            model: targetModel,
            messages,
            toolDefinitions: allowTools ? toolDefinitions : [],
            useTools: allowTools,
            originalMessage: message,
            conversationHistory,
            onChunk
          })
        : await this.createNonStreamingCompletion({
            model: targetModel,
            messages,
            toolDefinitions: allowTools ? toolDefinitions : [],
            useTools: allowTools,
            originalMessage: message,
            conversationHistory
          });

      return {
        ...result,
        model: targetModel,
        fallbackAttempt: attemptIndex
      };
    };

    for (let attemptIndex = 0; attemptIndex < modelPlan.length; attemptIndex++) {
      const targetModel = modelPlan[attemptIndex];
      const useTools = this.shouldSendTools(targetModel, toolDefinitions);

      try {
        const result = await runAttempt({
          targetModel,
          attemptIndex,
          allowTools: useTools
        });

        await this.recordModelSuccess(targetModel);

        return result;
      } catch (error) {
        lastError = error;

        if (useTools && isToolCompatibilityError(error)) {
          try {
            const result = await runAttempt({
              targetModel,
              attemptIndex,
              allowTools: false
            });

            await this.recordModelSuccess(targetModel);

            return result;
          } catch (fallbackError) {
            lastError = fallbackError;
          }
        }

        await this.recordModelFailure(targetModel, lastError);

        console.error('[ChatHandler] Model attempt failed:', {
          model: targetModel,
          attempt: attemptIndex,
          status: extractStatus(lastError),
          message: lastError instanceof Error ? lastError.message : String(lastError)
        });

        if (!isRecoverableModelError(lastError)) {
          throw lastError;
        }
      }
    }

    throw lastError || new Error('AI_MODEL_ROUTER_NO_AVAILABLE_MODEL');
  }

  private async createStreamingCompletion(input: {
    model: string;
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    toolDefinitions: any[];
    useTools: boolean;
    originalMessage: string;
    conversationHistory: Message[];
    onChunk: (chunk: string) => void;
  }): Promise<ChatResult> {
    const streamParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
      model: input.model,
      messages: input.messages,
      max_tokens: this.getMaxTokensForModel(input.model),
      stream: true
    };

    if (input.useTools && input.toolDefinitions.length > 0) {
      (streamParams as any).tools = input.toolDefinitions;
      (streamParams as any).tool_choice = 'auto';
    }

    const stream = await this.client.chat.completions.create(streamParams);

    return this.handleStreamResponse(
      stream as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
      input.originalMessage,
      input.conversationHistory,
      input.onChunk,
      input.model
    );
  }

  private async createNonStreamingCompletion(input: {
    model: string;
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    toolDefinitions: any[];
    useTools: boolean;
    originalMessage: string;
    conversationHistory: Message[];
  }): Promise<ChatResult> {
    const completionParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: input.model,
      messages: input.messages,
      max_tokens: this.getMaxTokensForModel(input.model),
      stream: false
    };

    if (input.useTools && input.toolDefinitions.length > 0) {
      (completionParams as any).tools = input.toolDefinitions;
      (completionParams as any).tool_choice = 'auto';
    }

    const completion = await this.client.chat.completions.create(completionParams);

    return this.handleNonStreamResponse(
      completion as OpenAI.Chat.Completions.ChatCompletion,
      input.originalMessage,
      input.conversationHistory,
      input.model
    );
  }

  private async handleStreamResponse(
    stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
    message: string,
    conversationHistory: Message[],
    onChunk: (chunk: string) => void,
    model: string
  ): Promise<ChatResult> {
    let fullContent = '';
    const accumulatedToolCalls: any[] = [];

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        fullContent += delta.content;
        onChunk(delta.content);
      }

      if (delta?.tool_calls) {
        for (const deltaToolCall of delta.tool_calls) {
          const index = deltaToolCall.index;

          if (typeof index !== 'number') continue;

          if (!accumulatedToolCalls[index]) {
            accumulatedToolCalls[index] = {
              id: deltaToolCall.id || `tool_${Date.now()}_${index}`,
              type: 'function',
              function: {
                name: deltaToolCall.function?.name || '',
                arguments: deltaToolCall.function?.arguments || ''
              }
            };
          } else {
            if (deltaToolCall.function?.name) {
              accumulatedToolCalls[index].function.name = deltaToolCall.function.name;
            }

            if (deltaToolCall.function?.arguments) {
              accumulatedToolCalls[index].function.arguments += deltaToolCall.function.arguments;
            }
          }
        }
      }
    }

    const validToolCalls = accumulatedToolCalls.filter(
      (toolCall) => toolCall?.function?.name
    );

    if (validToolCalls.length > 0) {
      const executedTools = await this.executeToolCalls(
        validToolCalls as OpenAI.Chat.Completions.ChatCompletionMessageToolCall[]
      );

      const finalResponse = await this.generateToolResponse(
        message,
        conversationHistory,
        validToolCalls as OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
        executedTools,
        model
      );

      if (finalResponse) {
        onChunk(finalResponse);
      }

      return {
        content: finalResponse,
        toolCalls: executedTools
      };
    }

    return {
      content: fullContent
    };
  }

  private async handleNonStreamResponse(
    completion: OpenAI.Chat.Completions.ChatCompletion,
    message: string,
    conversationHistory: Message[],
    model: string
  ): Promise<ChatResult> {
    const responseMessage = completion.choices[0]?.message;

    if (!responseMessage) {
      return {
        content: 'No response from AI.'
      };
    }

    if (!responseMessage.tool_calls || responseMessage.tool_calls.length === 0) {
      return {
        content: responseMessage.content || ''
      };
    }

    const toolCalls = await this.executeToolCalls(
      responseMessage.tool_calls as OpenAI.Chat.Completions.ChatCompletionMessageToolCall[]
    );

    const finalResponse = await this.generateToolResponse(
      message,
      conversationHistory,
      responseMessage.tool_calls as OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
      toolCalls,
      model
    );

    return {
      content: finalResponse,
      toolCalls
    };
  }

  private async executeToolCalls(
    openAiToolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[]
  ): Promise<ToolCall[]> {
    return Promise.all(
      openAiToolCalls.map(async (toolCall) => {
        try {
          if (toolCall.type !== 'function' || !toolCall.function) {
            return {
              id: toolCall.id,
              name: 'unknown',
              arguments: {},
              result: {
                error: 'INVALID_TOOL_CALL_TYPE'
              }
            };
          }

          const functionCall = toolCall.function;
          const args = this.parseToolArguments(functionCall.arguments);
          const result = await executeTool(functionCall.name, args);

          return {
            id: toolCall.id,
            name: functionCall.name,
            arguments: args,
            result
          };
        } catch (error) {
          const name = (toolCall as any).function?.name || 'error';

          return {
            id: toolCall.id,
            name,
            arguments: {},
            result: {
              error: error instanceof Error ? error.message : String(error)
            }
          };
        }
      })
    );
  }

  private async generateToolResponse(
    userMessage: string,
    history: Message[],
    openAiToolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
    toolResults: ToolCall[],
    model: string
  ): Promise<string> {
    const messages = this.buildConversationMessages(userMessage, history);

    const completionParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model,
      messages: [
        ...messages,
        {
          role: 'assistant',
          content: '',
          tool_calls: openAiToolCalls
        } as any,
        ...toolResults.map((result) => ({
          role: 'tool' as const,
          content: safeJsonStringify(result.result ?? {}),
          tool_call_id: result.id
        }))
      ],
      max_tokens: this.getMaxTokensForModel(model),
      stream: false
    };

    const followUp = await this.client.chat.completions.create(completionParams);
    const msg = followUp.choices[0]?.message;

    if (msg?.tool_calls && msg.tool_calls.length > 0) {
      return msg.content || 'Processing subsequent steps...';
    }

    return msg?.content || 'Action completed.';
  }

  private buildConversationMessages(
    userMessage: string,
    history: Message[]
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content:
          'You are the core of the Arbitrage Nexus engine. Be precise, technical, and conservative with revenue claims. Treat projected market value as strategic upside only. Never treat projected profit as verified treasury revenue. Use tools only when they materially improve the answer.'
      }
    ];

    history.slice(-10).forEach((historyMessage) => {
      if (historyMessage.role === 'user' || historyMessage.role === 'system') {
        messages.push({
          role: historyMessage.role,
          content: cleanText(historyMessage.content)
        });

        return;
      }

      if (historyMessage.role === 'assistant') {
        const hasToolCalls = Boolean(
          historyMessage.toolCalls && historyMessage.toolCalls.length > 0
        );

        messages.push({
          role: 'assistant',
          content: hasToolCalls ? '' : cleanText(historyMessage.content),
          tool_calls: hasToolCalls
            ? historyMessage.toolCalls?.map((toolCall) => {
                const rawArgs = (toolCall as any).arguments;

                return {
                  id: toolCall.id,
                  type: 'function',
                  function: {
                    name: toolCall.name,
                    arguments:
                      typeof rawArgs === 'string'
                        ? rawArgs
                        : JSON.stringify(rawArgs || {})
                  }
                };
              })
            : undefined
        } as OpenAI.Chat.Completions.ChatCompletionMessageParam);

        return;
      }

      if (historyMessage.role === 'tool') {
        const toolCallId = cleanText(historyMessage.tool_call_id);

        if (!toolCallId) return;

        messages.push({
          role: 'tool',
          content: cleanText(historyMessage.content),
          tool_call_id: toolCallId
        } as any);
      }
    });

    messages.push({
      role: 'user',
      content: cleanText(userMessage)
    });

    return messages;
  }

  private async safeGetToolDefinitions(): Promise<any[]> {
    if (!this.toolsEnabled) return [];

    try {
      const definitions = await getToolDefinitions();
      return Array.isArray(definitions) ? definitions : [];
    } catch (error) {
      console.warn('[ChatHandler] Tool definition loading failed:', error);
      return [];
    }
  }

  private parseToolArguments(rawArguments: string | undefined): Record<string, unknown> {
    if (!rawArguments) return {};

    try {
      const parsed = JSON.parse(rawArguments);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {
        raw_arguments: rawArguments
      };
    }
  }

  private shouldSendTools(model: string, toolDefinitions: any[]): boolean {
    if (!this.toolsEnabled) return false;
    if (toolDefinitions.length === 0) return false;
    if (!modelLikelySupportsTools(model)) return false;

    const envAny = this.env as any;

    if (truthy(envAny.AI_DISABLE_TOOLS)) return false;

    return true;
  }

  private getMaxTokensForModel(model: string): number {
    if (this.explicitMaxTokens && this.explicitMaxTokens > 0) {
      return Math.floor(this.explicitMaxTokens);
    }

    const envAny = this.env as any;
    const globalMax = safeNumber(envAny.AI_RESPONSE_MAX_TOKENS, 0);

    if (globalMax > 0) return Math.floor(globalMax);

    if (modelLooksLikeGemma(model)) {
      return Math.floor(safeNumber(envAny.AI_GEMMA_MAX_TOKENS, 4096));
    }

    if (modelLooksLikeGemini(model)) {
      return Math.floor(safeNumber(envAny.AI_GEMINI_MAX_TOKENS, 8192));
    }

    return 4096;
  }

  private async buildModelAttemptPlan(modelOverride?: string): Promise<string[]> {
    const plan: string[] = [];
    const excluded = new Set<string>();
    const env = this.env;
    const routerEnabled = shouldUseModelRouter(env);
    const state = await this.getCurrentRouterState();

    const addModel = (model: unknown) => {
      const normalized = normalizeModelId(model);

      if (!normalized || excluded.has(normalized)) return;

      excluded.add(normalized);
      plan.push(normalized);
    };

    if (modelOverride) {
      addModel(modelOverride);
    }

    if (routerEnabled) {
      for (let index = 0; index < this.maxFallbackAttempts; index++) {
        const selection = selectAiModelForRole({
          role: this.role,
          env,
          state,
          excludeModelIds: Array.from(excluded)
        });

        addModel(selection.model);
      }
    }

    addModel(this.model);

    if (plan.length === 0) {
      plan.push('gemini-3.1-flash-lite');
    }

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
        console.warn('[ChatHandler] Router state callback failed:', error);
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
        console.warn('[ChatHandler] Router state save callback failed:', error);
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
      status: extractStatus(error),
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