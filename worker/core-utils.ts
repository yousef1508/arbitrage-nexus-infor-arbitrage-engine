/**
 * Core utilities for the Cloudflare Agents template
 */
import type { AppController } from './app-controller';
import type { ChatAgent } from './agent';
export interface Env {
    // AI & Intelligence
    // Canonical credentials for LLM inference (OpenAI compatible or AI Gateway)
    CF_AI_BASE_URL: string;
    CF_AI_API_KEY: string;
    // External Data Connectors
    SERPAPI_KEY: string;
    OPENROUTER_API_KEY: string;
    // Durable Object Bindings
    CHAT_AGENT: DurableObjectNamespace<ChatAgent>;
    APP_CONTROLLER: DurableObjectNamespace<AppController>;
    // PayPal Integration
    PAYPAL_CLIENT_ID: string;
    PAYPAL_CLIENT_SECRET: string;
    PAYPAL_MODE: 'sandbox' | 'live';
}
/**
 * Get AppController stub for session management
 */
export function getAppController(env: Env): DurableObjectStub<AppController> {
  const id = env.APP_CONTROLLER.idFromName("controller");
  return env.APP_CONTROLLER.get(id);
}
/**
 * Register a new chat session with the control plane
 */
export async function registerSession(env: Env, sessionId: string, title?: string): Promise<void> {
  try {
    const controller = getAppController(env);
    await controller.addSession(sessionId, title);
  } catch (error) {
    console.error('Failed to register session:', error);
  }
}
/**
 * Update session activity timestamp
 */
export async function updateSessionActivity(env: Env, sessionId: string): Promise<void> {
  try {
    const controller = getAppController(env);
    await controller.updateSessionActivity(sessionId);
  } catch (error) {
    console.error('Failed to update session activity:', error);
  }
}
/**
 * Unregister a session from the control plane
 */
export async function unregisterSession(env: Env, sessionId: string): Promise<boolean> {
  try {
    const controller = getAppController(env);
    return await controller.removeSession(sessionId);
  } catch (error) {
    console.error('Failed to unregister session:', error);
    return false;
  }
}