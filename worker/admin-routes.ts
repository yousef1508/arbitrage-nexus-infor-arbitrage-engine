import { Hono } from 'hono';

import { CORE_SESSION_ID, fetchChatAgent } from './agent-access';
import type { Env } from './core-utils';

import {
  ADMIN_AUTH_HEADERS,
  adminCorsJsonResponse,
  adminPreflightResponse,
  authRequiredResponse,
  authorizeOwnerRequest,
  requireOwnerRequest,
  type AdminAuthEnv
} from './admin-auth';

import {
  blockPatchPlanItem,
  buildDefaultPatchPlan,
  buildPatchPlanPublicSummary,
  buildPatchPlanTextSummary,
  markCurrentPatchPlanItemDone,
  markPatchPlanItemStatus,
  setPatchPlanCurrentItem,
  unblockPatchPlanItem
} from './patch-planner';

type AdminRouteBindings = {
  Bindings: Env;
};

type AdminContext = {
  req: {
    url: string;
    method: string;
    path: string;
    raw: Request;
    header(name: string): string | undefined;
    json<T = any>(): Promise<T>;
  };
  env: Env;
  json(data: unknown, status?: number): Response;
  header(name: string, value: string): void;
};

type SuggestionAction =
  | 'approve'
  | 'approved'
  | 'reject'
  | 'rejected'
  | 'implemented'
  | 'done';

const adminSubApp = new Hono<AdminRouteBindings>().basePath('/api/admin');

function cleanText(value: unknown): string {
  return String(value ?? '')
    .replace(/\uFFFD/g, '')
    .replace(/�/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getAdminEnv(env: Env): AdminAuthEnv {
  return env as unknown as AdminAuthEnv;
}

function isHtmlResponse(response: Response): boolean {
  return cleanText(response.headers.get('content-type')).toLowerCase().includes('text/html');
}

function buildProxyHeaders(c: AdminContext): Headers {
  const headers = new Headers();

  headers.set('Accept', 'application/json');
  headers.set('Content-Type', 'application/json');
  headers.set('x-admin-route', 'true');
  headers.set('x-core-session-id', CORE_SESSION_ID);

  const incomingUrl = new URL(c.req.url);
  headers.set('x-public-origin', `${incomingUrl.protocol}//${incomingUrl.host}`);
  headers.set('x-public-path-prefix', '/api');

  const authorization = c.req.header(ADMIN_AUTH_HEADERS.authorization);
  const adminToken = c.req.header(ADMIN_AUTH_HEADERS.admin_token);
  const legacyToken = c.req.header(ADMIN_AUTH_HEADERS.legacy_admin_token);
  const cfAccessEmail = c.req.header(ADMIN_AUTH_HEADERS.cloudflare_access_email);

  if (authorization) headers.set(ADMIN_AUTH_HEADERS.authorization, authorization);
  if (adminToken) headers.set(ADMIN_AUTH_HEADERS.admin_token, adminToken);
  if (legacyToken) headers.set(ADMIN_AUTH_HEADERS.legacy_admin_token, legacyToken);
  if (cfAccessEmail) headers.set(ADMIN_AUTH_HEADERS.cloudflare_access_email, cfAccessEmail);

  return headers;
}

function targetWithSearch(c: AdminContext, path: string): string {
  const incomingUrl = new URL(c.req.url);
  const safePath = path.startsWith('/') ? path : `/${path}`;

  return `${safePath}${incomingUrl.search || ''}`;
}

async function readJsonBody(c: AdminContext): Promise<Record<string, unknown>> {
  const parsed = await c.req.json<unknown>().catch(() => null);

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }

  return parsed as Record<string, unknown>;
}

async function proxyToCoreAgent(
  c: AdminContext,
  path: string,
  method = 'GET',
  body?: unknown
): Promise<Response> {
  const targetPath = targetWithSearch(c, path);

  return fetchChatAgent(
    c.env,
    new Request(`http://agent${targetPath}`, {
      method,
      headers: buildProxyHeaders(c),
      body: body === undefined ? undefined : JSON.stringify(body)
    }),
    CORE_SESSION_ID
  );
}

async function proxyJsonToCoreAgent(
  c: AdminContext,
  path: string,
  method = 'GET',
  body?: unknown,
  fallback?: () => Response
): Promise<Response> {
  const response = await proxyToCoreAgent(c, path, method, body);

  if (response.status === 404 && fallback) {
    return fallback();
  }

  if (response.ok && isHtmlResponse(response)) {
    if (fallback) {
      return fallback();
    }

    return adminCorsJsonResponse(
      {
        success: false,
        error: 'CORE_ROUTE_FELL_THROUGH_TO_SPA',
        target_path: path,
        message:
          'The core agent returned HTML for an admin JSON route. This means the route is not wired to the Durable Object handler yet.'
      },
      { status: 502 }
    );
  }

  return response;
}

async function proxyRawToCoreAgent(
  c: AdminContext,
  path: string
): Promise<Response> {
  const method = c.req.method.toUpperCase();
  const targetPath = targetWithSearch(c, path);

  return fetchChatAgent(
    c.env,
    new Request(`http://agent${targetPath}`, {
      method: c.req.method,
      headers: buildProxyHeaders(c),
      body:
        method === 'GET' ||
        method === 'HEAD' ||
        method === 'DELETE' ||
        method === 'OPTIONS'
          ? undefined
          : c.req.raw.body
    }),
    CORE_SESSION_ID
  );
}

function localPatchPlanResponse(now = Date.now()): Response {
  const plan = buildDefaultPatchPlan(now);
  const summary = buildPatchPlanPublicSummary(plan, now);

  return adminCorsJsonResponse({
    ...summary,
    text_summary: buildPatchPlanTextSummary(plan),
    persistence: 'local_admin_route_fallback_only',
    execution_truth:
      'This fallback reports the canonical chronological plan. Persistent execution state should come from the core agent once worker/agent.ts route wiring is active.'
  });
}

function localPatchPlanActionResponse(input: {
  action: string;
  file_path?: string;
  now?: number;
}): Response {
  const now = input.now || Date.now();
  const filePath = cleanText(input.file_path);
  const basePlan = buildDefaultPatchPlan(now);

  let plan = basePlan;

  if (input.action === 'current') {
    if (!filePath) {
      return adminCorsJsonResponse(
        {
          success: false,
          error: 'FILE_PATH_REQUIRED'
        },
        { status: 400 }
      );
    }

    plan = setPatchPlanCurrentItem(basePlan, filePath, now);
  } else if (input.action === 'done') {
    plan = filePath
      ? markPatchPlanItemStatus(basePlan, filePath, 'done', now)
      : markCurrentPatchPlanItemDone(basePlan, now);
  } else if (input.action === 'block') {
    if (!filePath) {
      return adminCorsJsonResponse(
        {
          success: false,
          error: 'FILE_PATH_REQUIRED'
        },
        { status: 400 }
      );
    }

    plan = blockPatchPlanItem(basePlan, filePath, now);
  } else if (input.action === 'unblock') {
    if (!filePath) {
      return adminCorsJsonResponse(
        {
          success: false,
          error: 'FILE_PATH_REQUIRED'
        },
        { status: 400 }
      );
    }

    plan = unblockPatchPlanItem(basePlan, filePath, now);
  }

  return adminCorsJsonResponse({
    ...buildPatchPlanPublicSummary(plan, now),
    text_summary: buildPatchPlanTextSummary(plan),
    persistence: 'local_admin_route_fallback_only',
    execution_truth:
      'Patch-plan source changes are not fake-executed by the Worker. They remain source patches until repository/build/deploy execution completes.'
  });
}

function normalizeSuggestionAction(value: unknown): SuggestionAction {
  const action = cleanText(value).toLowerCase();

  if (action === 'approve' || action === 'approved') return 'approve';
  if (action === 'reject' || action === 'rejected') return 'reject';
  if (action === 'implemented' || action === 'done') return 'implemented';

  return 'approve';
}

function buildSuggestionActionBody(
  body: Record<string, unknown>,
  fallbackSuggestionId?: string,
  fallbackAction?: SuggestionAction
): Record<string, unknown> {
  const suggestionId = cleanText(
    body.suggestion_id ||
      body.suggestionId ||
      body.id ||
      fallbackSuggestionId
  );

  const action = normalizeSuggestionAction(body.action || fallbackAction || 'approve');

  return {
    ...body,
    suggestion_id: suggestionId,
    suggestionId,
    action,
    execute_approved: body.execute_approved ?? action === 'approve',
    record_execution: body.record_execution ?? true,
    trigger: cleanText(body.trigger) || 'admin_suggestion_action'
  };
}

function buildAcquisitionRunBody(body: Record<string, unknown>): Record<string, unknown> {
  return {
    ...body,
    trigger: cleanText(body.trigger) || 'admin_crypto_acquisition_executor',
    force: body.force ?? true,
    execute: body.execute ?? true,
    record_execution: body.record_execution ?? true
  };
}

adminSubApp.use('*', async (c, next) => {
  if (c.req.method.toUpperCase() === 'OPTIONS') {
    return adminPreflightResponse();
  }

  const auth = await requireOwnerRequest(c.req.raw, getAdminEnv(c.env), {
    allow_options: true,
    drain_body_on_denial: true
  });

  if (auth) {
    return auth;
  }

  const result = authorizeOwnerRequest(c.req.raw, getAdminEnv(c.env));
  c.header(ADMIN_AUTH_HEADERS.owner_auth_mode, result.mode);

  return next();
});

adminSubApp.get('/auth/check', async (c) => {
  const result = authorizeOwnerRequest(c.req.raw, getAdminEnv(c.env));

  if (!result.authorized) {
    return authRequiredResponse(c.req.raw, result);
  }

  return adminCorsJsonResponse({
    success: true,
    kind: 'nexus_admin_auth_check',
    authorized: true,
    mode: result.mode,
    admin_email: result.admin_email,
    local_request: result.local_request,
    core_session_id: CORE_SESSION_ID,
    generated_at: Date.now(),
    generated_at_iso: new Date().toISOString()
  });
});

adminSubApp.get('/state', async (c) => {
  return proxyJsonToCoreAgent(c as unknown as AdminContext, '/messages');
});

adminSubApp.get('/health', async (c) => {
  return proxyJsonToCoreAgent(c as unknown as AdminContext, '/messages');
});

adminSubApp.get('/stats', async (c) => {
  return proxyJsonToCoreAgent(c as unknown as AdminContext, '/messages');
});

adminSubApp.get('/system/stats', async (c) => {
  return proxyJsonToCoreAgent(c as unknown as AdminContext, '/messages');
});

adminSubApp.post('/ingest', async (c) => {
  const body = await readJsonBody(c as unknown as AdminContext);

  return proxyJsonToCoreAgent(c as unknown as AdminContext, '/ingest', 'POST', {
    ...body,
    trigger: cleanText(body.trigger) || 'admin_route',
    autonomous: body.autonomous ?? true,
    timestamp: Date.now()
  });
});

adminSubApp.post('/policy', async (c) => {
  const body = await readJsonBody(c as unknown as AdminContext);

  return proxyJsonToCoreAgent(c as unknown as AdminContext, '/policy', 'POST', body);
});

adminSubApp.get('/market-stats', async (c) => {
  return proxyJsonToCoreAgent(c as unknown as AdminContext, '/market-stats.json');
});

adminSubApp.get('/market-stats.json', async (c) => {
  return proxyJsonToCoreAgent(c as unknown as AdminContext, '/market-stats.json');
});

adminSubApp.get('/sources', async (c) => {
  return proxyJsonToCoreAgent(c as unknown as AdminContext, '/sources.json');
});

adminSubApp.get('/sources.json', async (c) => {
  return proxyJsonToCoreAgent(c as unknown as AdminContext, '/sources.json');
});

adminSubApp.get('/suggestions', async (c) => {
  return proxyJsonToCoreAgent(c as unknown as AdminContext, '/suggestions');
});

adminSubApp.get('/suggestions.json', async (c) => {
  return proxyJsonToCoreAgent(c as unknown as AdminContext, '/suggestions.json');
});

adminSubApp.post('/suggestions/action', async (c) => {
  const body = await readJsonBody(c as unknown as AdminContext);

  return proxyJsonToCoreAgent(
    c as unknown as AdminContext,
    '/suggestions/action',
    'POST',
    buildSuggestionActionBody(body)
  );
});

adminSubApp.post('/suggestions/:suggestionId/approve', async (c) => {
  const body = await readJsonBody(c as unknown as AdminContext);
  const suggestionId = c.req.param('suggestionId');

  return proxyJsonToCoreAgent(
    c as unknown as AdminContext,
    '/suggestions/action',
    'POST',
    buildSuggestionActionBody(body, suggestionId, 'approve')
  );
});

adminSubApp.post('/suggestions/:suggestionId/reject', async (c) => {
  const body = await readJsonBody(c as unknown as AdminContext);
  const suggestionId = c.req.param('suggestionId');

  return proxyJsonToCoreAgent(
    c as unknown as AdminContext,
    '/suggestions/action',
    'POST',
    buildSuggestionActionBody(body, suggestionId, 'reject')
  );
});

adminSubApp.post('/suggestions/:suggestionId/implemented', async (c) => {
  const body = await readJsonBody(c as unknown as AdminContext);
  const suggestionId = c.req.param('suggestionId');

  return proxyJsonToCoreAgent(
    c as unknown as AdminContext,
    '/suggestions/action',
    'POST',
    buildSuggestionActionBody(body, suggestionId, 'implemented')
  );
});

adminSubApp.get('/crypto-acquisition', async (c) => {
  return proxyJsonToCoreAgent(c as unknown as AdminContext, '/crypto-acquisition');
});

adminSubApp.get('/crypto-acquisition.json', async (c) => {
  return proxyJsonToCoreAgent(c as unknown as AdminContext, '/crypto-acquisition.json');
});

adminSubApp.get('/crypto-acquisition/execution-ledger', async (c) => {
  return proxyJsonToCoreAgent(c as unknown as AdminContext, '/crypto-acquisition/execution-ledger');
});

adminSubApp.get('/crypto-acquisition/execution-ledger.json', async (c) => {
  return proxyJsonToCoreAgent(c as unknown as AdminContext, '/crypto-acquisition/execution-ledger.json');
});

adminSubApp.post('/crypto-acquisition/run', async (c) => {
  const body = await readJsonBody(c as unknown as AdminContext);

  return proxyJsonToCoreAgent(
    c as unknown as AdminContext,
    '/crypto-acquisition/run',
    'POST',
    buildAcquisitionRunBody(body)
  );
});

adminSubApp.post('/crypto/verify-deposit', async (c) => {
  const body = await readJsonBody(c as unknown as AdminContext);

  return proxyJsonToCoreAgent(c as unknown as AdminContext, '/crypto/verify-deposit', 'POST', body);
});

adminSubApp.post('/treasury/withdraw', async (c) => {
  const body = await readJsonBody(c as unknown as AdminContext);

  return proxyJsonToCoreAgent(c as unknown as AdminContext, '/withdraw', 'POST', body);
});

adminSubApp.get('/patch-plan', async (c) => {
  return proxyJsonToCoreAgent(
    c as unknown as AdminContext,
    '/patch-plan',
    'GET',
    undefined,
    () => localPatchPlanResponse()
  );
});

adminSubApp.get('/patch-plan.json', async (c) => {
  return proxyJsonToCoreAgent(
    c as unknown as AdminContext,
    '/patch-plan.json',
    'GET',
    undefined,
    () => localPatchPlanResponse()
  );
});

adminSubApp.get('/patch-plan/execution-ledger', async (c) => {
  return proxyJsonToCoreAgent(c as unknown as AdminContext, '/patch-plan/execution-ledger');
});

adminSubApp.get('/patch-plan/execution-ledger.json', async (c) => {
  return proxyJsonToCoreAgent(c as unknown as AdminContext, '/patch-plan/execution-ledger.json');
});

adminSubApp.post('/patch-plan/action', async (c) => {
  const body = await readJsonBody(c as unknown as AdminContext);

  return proxyJsonToCoreAgent(
    c as unknown as AdminContext,
    '/patch-plan/action',
    'POST',
    {
      ...body,
      record_execution: body.record_execution ?? true,
      trigger: cleanText(body.trigger) || 'admin_patch_plan_action'
    },
    () =>
      localPatchPlanActionResponse({
        action: cleanText(body.action || 'current'),
        file_path: cleanText(body.file_path || body.filePath)
      })
  );
});

adminSubApp.post('/patch-plan/current', async (c) => {
  const body = await readJsonBody(c as unknown as AdminContext);
  const filePath = cleanText(body.file_path || body.filePath);

  if (!filePath) {
    return adminCorsJsonResponse(
      {
        success: false,
        error: 'FILE_PATH_REQUIRED'
      },
      { status: 400 }
    );
  }

  return proxyJsonToCoreAgent(
    c as unknown as AdminContext,
    '/patch-plan/action',
    'POST',
    {
      ...body,
      action: 'current',
      file_path: filePath,
      record_execution: true,
      trigger: cleanText(body.trigger) || 'admin_patch_plan_current'
    },
    () =>
      localPatchPlanActionResponse({
        action: 'current',
        file_path: filePath
      })
  );
});

adminSubApp.post('/patch-plan/done', async (c) => {
  const body = await readJsonBody(c as unknown as AdminContext);
  const filePath = cleanText(body.file_path || body.filePath);

  return proxyJsonToCoreAgent(
    c as unknown as AdminContext,
    '/patch-plan/action',
    'POST',
    {
      ...body,
      action: 'done',
      file_path: filePath || undefined,
      record_execution: true,
      trigger: cleanText(body.trigger) || 'admin_patch_plan_done'
    },
    () =>
      localPatchPlanActionResponse({
        action: 'done',
        file_path: filePath || undefined
      })
  );
});

adminSubApp.post('/patch-plan/block', async (c) => {
  const body = await readJsonBody(c as unknown as AdminContext);
  const filePath = cleanText(body.file_path || body.filePath);

  if (!filePath) {
    return adminCorsJsonResponse(
      {
        success: false,
        error: 'FILE_PATH_REQUIRED'
      },
      { status: 400 }
    );
  }

  return proxyJsonToCoreAgent(
    c as unknown as AdminContext,
    '/patch-plan/action',
    'POST',
    {
      ...body,
      action: 'block',
      file_path: filePath,
      record_execution: true,
      trigger: cleanText(body.trigger) || 'admin_patch_plan_block'
    },
    () =>
      localPatchPlanActionResponse({
        action: 'block',
        file_path: filePath
      })
  );
});

adminSubApp.post('/patch-plan/unblock', async (c) => {
  const body = await readJsonBody(c as unknown as AdminContext);
  const filePath = cleanText(body.file_path || body.filePath);

  if (!filePath) {
    return adminCorsJsonResponse(
      {
        success: false,
        error: 'FILE_PATH_REQUIRED'
      },
      { status: 400 }
    );
  }

  return proxyJsonToCoreAgent(
    c as unknown as AdminContext,
    '/patch-plan/action',
    'POST',
    {
      ...body,
      action: 'unblock',
      file_path: filePath,
      record_execution: true,
      trigger: cleanText(body.trigger) || 'admin_patch_plan_unblock'
    },
    () =>
      localPatchPlanActionResponse({
        action: 'unblock',
        file_path: filePath
      })
  );
});

adminSubApp.get('/execution-ledger', async (c) => {
  return proxyJsonToCoreAgent(c as unknown as AdminContext, '/execution-ledger');
});

adminSubApp.get('/execution-ledger.json', async (c) => {
  return proxyJsonToCoreAgent(c as unknown as AdminContext, '/execution-ledger.json');
});

adminSubApp.all('/agent/*', async (c) => {
  const suffix = c.req.path.replace(/^\/api\/admin\/agent/, '') || '/';

  return proxyRawToCoreAgent(c as unknown as AdminContext, suffix);
});

const REGISTERED_ADMIN_APPS = new WeakMap<Hono<any>, boolean>();

export function registerAdminRoutes(app: Hono<AdminRouteBindings>) {
  if (REGISTERED_ADMIN_APPS.get(app)) return;

  app.route('/', adminSubApp);
  REGISTERED_ADMIN_APPS.set(app, true);
}

export function adminRoutes(app: Hono<AdminRouteBindings>) {
  registerAdminRoutes(app);
}

export { adminSubApp };

