import { Hono } from "hono";
import { getAgentByName } from 'agents';
import { ChatAgent } from './agent';
import { API_RESPONSES } from './config';
import { Env, getAppController } from "./core-utils";
/**
 * Information Arbitrage Engine - API Router
 * CANONICAL SINGLETON PATTERN: All critical state is stored in "nexus-core-singleton".
 */
const apiSubApp = new Hono<{ Bindings: Env }>().basePath('/api');
const CORE_SESSION_ID = "nexus-core-singleton";
// --- AGENT INTERACTION ROUTES ---
apiSubApp.all('/chat/:sessionId/*', async (c) => {
    try {
        const sessionId = c.req.param('sessionId');
        const agent = await getAgentByName<Env, ChatAgent>(c.env.CHAT_AGENT, sessionId);
        const url = new URL(c.req.url);
        const pathSegments = c.req.path.split(`/chat/${sessionId}`);
        const wildcard = pathSegments.length > 1 ? pathSegments[1] : '/';
        url.pathname = wildcard || '/';
        return agent.fetch(new Request(url.toString(), {
            method: c.req.method,
            headers: c.req.raw.headers,
            body: c.req.method === 'GET' || c.req.method === 'DELETE' ? undefined : c.req.raw.body
        }));
    } catch (error) {
        console.error('[Router] Agent routing error:', error);
        return c.json({ success: false, error: API_RESPONSES.AGENT_ROUTING_FAILED }, 500);
    }
});
// --- SYSTEM OVERSIGHT ROUTES (CANONICAL SINGLETON) ---
apiSubApp.get('/system/stats', async (c) => {
    try {
        const agent = await getAgentByName<Env, ChatAgent>(c.env.CHAT_AGENT, CORE_SESSION_ID);
        const resp = await agent.fetch(new Request('http://agent/messages'));
        if (resp.ok) {
            const json = await resp.json() as any;
            const state = json?.data || {};
            return c.json({
                success: true,
                data: {
                    isSetup: !!state?.setup_complete,
                    treasury: state?.treasury || {
                        reserve: 0, operating: 0, reinvestment: 0, tax_buffer: 0, owner_withdrawable: 0, total: 0
                    },
                    proposals: state?.proposals || [],
                    opportunities: state?.opportunities || [],
                    agents: state?.agents || [],
                    ledger: state?.ledger || [],
                    policy: state?.policy || {},
                    system_health: state?.system_health || { status: 'healthy', checks: [], last_scan: Date.now() }
                }
            });
        }
        return c.json({ success: true, data: { isSetup: false, status: 'awaiting_initialization' } });
    } catch (error: any) {
        console.error('[Router] Stats fetch failed:', error);
        return c.json({ success: false, error: 'Stats unavailable', details: error.message }, 500);
    }
});
apiSubApp.post('/system/ingest', async (c) => {
    try {
        const agent = await getAgentByName<Env, ChatAgent>(c.env.CHAT_AGENT, CORE_SESSION_ID);
        const resp = await agent.fetch(new Request('http://agent/ingest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }));
        return resp;
    } catch (error: any) {
        return c.json({ success: false, error: 'Ingestion trigger failed', details: error.message }, 500);
    }
});
apiSubApp.post('/system/setup', async (c) => {
    try {
        const payload = await c.req.json();
        const controller = getAppController(c.env);
        // Register the singleton in the controller for observability
        await controller.addSession(CORE_SESSION_ID, 'Nexus Core Engine');
        const agent = await getAgentByName<Env, ChatAgent>(c.env.CHAT_AGENT, CORE_SESSION_ID);
        return agent.fetch(new Request('http://agent/setup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }));
    } catch (error: any) {
        console.error('[Router] Setup command failed:', error);
        return c.json({ success: false, error: 'Initialization failure', details: error.message }, 500);
    }
});
apiSubApp.post('/system/policy', async (c) => {
    try {
        const body = await c.req.json();
        const agent = await getAgentByName<Env, ChatAgent>(c.env.CHAT_AGENT, CORE_SESSION_ID);
        return agent.fetch(new Request('http://agent/policy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }));
    } catch (error) {
        return c.json({ success: false, error: 'Policy update failed' }, 500);
    }
});
apiSubApp.post('/system/proposals/action', async (c) => {
    try {
        const body = await c.req.json();
        const agent = await getAgentByName<Env, ChatAgent>(c.env.CHAT_AGENT, CORE_SESSION_ID);
        return agent.fetch(new Request('http://agent/proposals/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }));
    } catch (error) {
        return c.json({ success: false, error: 'Proposal action failed' }, 500);
    }
});
apiSubApp.post('/treasury/withdraw', async (c) => {
    try {
        const body = await c.req.json();
        const agent = await getAgentByName<Env, ChatAgent>(c.env.CHAT_AGENT, CORE_SESSION_ID);
        return agent.fetch(new Request('http://agent/withdraw', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }));
    } catch (error) {
        return c.json({ success: false, error: 'Withdrawal processing failed' }, 500);
    }
});
const INITIALIZED_APPS = new WeakMap<Hono<any>, boolean>();
function registerRoutesIdempotently(app: Hono<{ Bindings: Env }>) {
    // Only register if the app hasn't been initialized and hasn't started processing
    if (INITIALIZED_APPS.get(app)) return;
    
    try {
        app.route('/', apiSubApp);
        INITIALIZED_APPS.set(app, true);
    } catch (e: any) {
        // Hono throws if routes are added after the app starts or is already built
        console.warn('[Router] Could not register routes (already built or registered):', e.message);
        INITIALIZED_APPS.set(app, true); // Mark as handled to prevent retry
    }
}
export function coreRoutes(app: Hono<{ Bindings: Env }>) { registerRoutesIdempotently(app); }
export function userRoutes(app: Hono<{ Bindings: Env }>) { registerRoutesIdempotently(app); }