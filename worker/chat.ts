import OpenAI from 'openai';
import type { Message, ToolCall } from './types';
import { getToolDefinitions, executeTool } from './tools';

/**
 * ChatHandler
 * Handles conversational state and tool orchestration.
 * Updated with strict type checking for OpenAI tool calls.
 */
export class ChatHandler {
  private client: OpenAI;
  private model: string;
  constructor(aiGatewayUrl: string, apiKey: string, model: string) {
    this.model = model;
    // For Gemini via Cloudflare AI Gateway, we may need to pass the key in a specific header 
    // depending on gateway configuration, but standard practice is 'apiKey' as Bearer.
    // If it's a Google-specific endpoint, we inject the header.
    const isGoogle = model.toLowerCase().includes('gemini');
    this.client = new OpenAI({
      baseURL: aiGatewayUrl,
      apiKey: apiKey,
      defaultHeaders: isGoogle ? { 'x-goog-api-key': apiKey } : undefined
    });
  }
  async processMessage(
    message: string,
    conversationHistory: Message[],
    onChunk?: (chunk: string) => void,
    modelOverride?: string
  ): Promise<{
    content: string;
    toolCalls?: ToolCall[];
  }> {
    const targetModel = modelOverride || this.model;
    const messages = this.buildConversationMessages(message, conversationHistory);
    const toolDefinitions = await getToolDefinitions();
    if (onChunk) {
      try {
        const stream = await this.client.chat.completions.create({
          model: targetModel,
          messages,
          tools: toolDefinitions as any,
          tool_choice: 'auto',
          max_tokens: 16000,
          stream: true,
        });
        return this.handleStreamResponse(stream, message, conversationHistory, onChunk, targetModel);
      } catch (error: any) {
        console.error('[ChatHandler] Stream Error:', error);
        throw error;
      }
    }
    try {
      const completion = await this.client.chat.completions.create({
        model: targetModel,
        messages,
        tools: toolDefinitions as any,
        tool_choice: 'auto',
        max_tokens: 16000,
        stream: false
      });
      return this.handleNonStreamResponse(completion, message, conversationHistory, targetModel);
    } catch (error: any) {
      console.error('[ChatHandler] Completion Error:', error);
      throw error;
    }
  }
  private async handleStreamResponse(
    stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
    message: string,
    conversationHistory: Message[],
    onChunk: (chunk: string) => void,
    model: string
  ) {
    let fullContent = '';
    const accumulatedToolCalls: any[] = [];
    try {
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          fullContent += delta.content;
          onChunk(delta.content);
        }
        if (delta?.tool_calls) {
          for (const dtc of delta.tool_calls) {
            const idx = dtc.index;
            if (typeof idx !== 'number') continue;
            if (!accumulatedToolCalls[idx]) {
              accumulatedToolCalls[idx] = {
                id: dtc.id || `tool_${Date.now()}_${idx}`,
                type: 'function',
                function: { name: dtc.function?.name || '', arguments: dtc.function?.arguments || '' }
              };
            } else {
              if (dtc.function?.name) accumulatedToolCalls[idx].function.name = dtc.function.name;
              if (dtc.function?.arguments) accumulatedToolCalls[idx].function.arguments += dtc.function.arguments;
            }
          }
        }
      }
    } catch (error: any) {
      console.error('[ChatHandler] Stream loop error:', error);
      throw error;
    }
    const validToolCalls = accumulatedToolCalls.filter(Boolean);
    if (validToolCalls.length > 0) {
      const executedTools = await this.executeToolCalls(validToolCalls as OpenAI.Chat.Completions.ChatCompletionMessageToolCall[]);
      const finalResponse = await this.generateToolResponse(message, conversationHistory, validToolCalls as any, executedTools, model);
      return { content: finalResponse, toolCalls: executedTools };
    }
    return { content: fullContent };
  }
  private async handleNonStreamResponse(
    completion: OpenAI.Chat.Completions.ChatCompletion,
    message: string,
    conversationHistory: Message[],
    model: string
  ) {
    const responseMessage = completion.choices[0]?.message;
    if (!responseMessage) return { content: 'No response from AI.' };
    if (!responseMessage.tool_calls) return { content: responseMessage.content || '' };
    const toolCalls = await this.executeToolCalls(responseMessage.tool_calls as OpenAI.Chat.Completions.ChatCompletionMessageToolCall[]);
    const finalResponse = await this.generateToolResponse(
      message,
      conversationHistory,
      responseMessage.tool_calls as OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
      toolCalls,
      model
    );
    return { content: finalResponse, toolCalls };
  }
  private async executeToolCalls(openAiToolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[]): Promise<ToolCall[]> {
    return Promise.all(
      openAiToolCalls.map(async (tc) => {
        try {
          // Narrowing type to ensure tc is a function tool call
          if (tc.type !== 'function' || !tc.function) {
            return { id: tc.id, name: 'unknown', arguments: {}, result: { error: 'Invalid tool type' } };
          }
          const functionCall = tc.function;
          const args = functionCall.arguments ? JSON.parse(functionCall.arguments) : {};
          const result = await executeTool(functionCall.name, args);
          return { id: tc.id, name: functionCall.name, arguments: args, result };
        } catch (error) {
          const name = (tc as any).function?.name || 'error';
          return { id: tc.id, name, arguments: {}, result: { error: String(error) } };
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
    const followUp = await this.client.chat.completions.create({
      model: model,
      messages: [
        ...messages,
        { 
          role: 'assistant', 
          content: '', // Using empty string instead of null for better compatibility with Gemini/Vertex via Gateway
          tool_calls: openAiToolCalls 
        } as any,
        ...toolResults.map((result) => ({
          role: 'tool' as const,
          content: JSON.stringify(result.result),
          tool_call_id: result.id
        }))
      ],
      max_tokens: 16000
    });
    const msg = followUp.choices[0]?.message;
    if (msg?.tool_calls && msg.tool_calls.length > 0) {
      return msg.content || 'Processing subsequent steps...';
    }
    return msg?.content || 'Action completed.';
  }
  private buildConversationMessages(userMessage: string, history: Message[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: 'You are the core of the Arbitrage Nexus engine. Be precise and technical. You have access to specialized tools for web search and data analysis.' }
    ];
    history.slice(-10).forEach(m => {
      if (m.role === 'user' || m.role === 'system') {
        messages.push({ role: m.role, content: m.content as string });
      } else if (m.role === 'assistant') {
        const hasToolCalls = m.toolCalls && m.toolCalls.length > 0;
        messages.push({
          role: 'assistant',
          content: hasToolCalls ? null : (m.content as string || null),
          tool_calls: hasToolCalls ? m.toolCalls?.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments)
            }
          })) : undefined
        } as OpenAI.Chat.Completions.ChatCompletionMessageParam);
      } else if (m.role === 'tool') {
        messages.push({ role: 'tool', content: m.content as string, tool_call_id: m.tool_call_id as string } as any);
      }
    });
    messages.push({ role: 'user', content: userMessage });
    return messages;
  }
  updateModel(newModel: string): void {
    this.model = newModel;
  }
}