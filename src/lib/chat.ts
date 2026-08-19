import type { Message, ChatState, ToolCall, WeatherResult, MCPResult, ErrorResult } from '../../worker/types';
export interface ChatResponse {
  success: boolean;
  data?: ChatState;
  error?: string;
}
export const MODELS = [
  { id: 'google-ai-studio/gemini-2.0-flash', name: 'Gemini 2.0 Flash (Managed)' },
  { id: 'google-ai-studio/gemini-2.5-pro', name: 'Gemini 2.5 Pro (Audit)' },
  { id: 'google-ai-studio/gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
];
class ChatService {
  private sessionId: string;
  private baseUrl: string;
  constructor() {
    this.sessionId = crypto.randomUUID();
    this.baseUrl = `/api/chat/${this.sessionId}`;
    this.sendMessage = this.sendMessage.bind(this);
    this.getMessages = this.getMessages.bind(this);
    this.clearMessages = this.clearMessages.bind(this);
  }
  async sendMessage(
    message: string,
    model?: string,
    onChunk?: (chunk: string) => void
  ): Promise<ChatResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, model, stream: !!onChunk }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (onChunk && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            if (chunk) onChunk(chunk);
          }
        } finally {
          reader.releaseLock();
        }
        return { success: true };
      }
      return await response.json();
    } catch (error) {
      console.error('Chat error:', error);
      return { success: false, error: 'Request failed' };
    }
  }
  async getMessages(): Promise<ChatResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/system/messages`);
      return await response.json();
    } catch (error) {
      return { success: false, error: 'Load failed' };
    }
  }
  async clearMessages(): Promise<ChatResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/clear`, { method: 'DELETE' });
      return await response.json();
    } catch (error) {
      return { success: false, error: 'Clear failed' };
    }
  }
  getSessionId(): string { return this.sessionId; }
  newSession(): void {
    this.sessionId = crypto.randomUUID();
    this.baseUrl = `/api/chat/${this.sessionId}`;
  }
}
export const chatService = new ChatService();
export const renderToolCall = (toolCall: ToolCall): string => {
  const result = toolCall.result as WeatherResult | MCPResult | ErrorResult | undefined;
  if (!result || typeof result !== 'object') return `ðŸ”§ ${toolCall.name}: Pending`;
  if ('error' in result) return `âŒ ${toolCall.name}: Error`;
  if ('condition' in result) return `ðŸŒ¤ï¸ ${result.location}: ${result.temperature}Â°C`;
  if ('content' in result) return `ðŸ”§ ${toolCall.name}: Executed`;
  return `ðŸ”§ ${toolCall.name}: Completed`;
};