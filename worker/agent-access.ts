import type { Env } from "./core-utils";

export const CORE_SESSION_ID = "nexus-core-singleton-v3";

function hasChatAgentBinding(value: unknown): value is Env {
  return Boolean(
    value &&
      typeof value === "object" &&
      "CHAT_AGENT" in (value as any) &&
      (value as any).CHAT_AGENT
  );
}

function isRequestLike(value: unknown): value is Request {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as any).url === "string" &&
      typeof (value as any).method === "string"
  );
}

function normalizeSessionId(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }

  if (value && typeof value === "object") {
    const candidate =
      (value as any).sessionId ||
      (value as any).id ||
      (value as any).name;

    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return CORE_SESSION_ID;
}

function normalizeRequest(value: unknown): Request {
  if (isRequestLike(value)) {
    return value as Request;
  }

  if (typeof value === "string" && value.trim()) {
    return new Request(value);
  }

  throw new TypeError("fetchChatAgent requires a Request argument");
}

function getRawChatAgentStub(env: Env, sessionId: unknown = CORE_SESSION_ID): any {
  if (!env?.CHAT_AGENT) {
    throw new Error("CHAT_AGENT binding is missing");
  }

  const safeSessionId = normalizeSessionId(sessionId);
  const id = env.CHAT_AGENT.idFromName(safeSessionId);

  return env.CHAT_AGENT.get(id) as any;
}

/**
 * Safe internal Agent request helper.
 *
 * This intentionally uses Durable Object RPC instead of:
 * - getAgentByName()
 * - getServerByName()
 * - stub.fetch()
 *
 * Reason: the Agent/PartyServer fetch-name bootstrap is currently what is
 * throwing ChatAgent.setName / "undefined is not valid JSON" in production.
 */
export async function fetchChatAgent(
  first: Env | Request,
  second: Request | Env,
  third: unknown = CORE_SESSION_ID
): Promise<Response> {
  let env: Env;
  let request: Request;

  if (hasChatAgentBinding(first)) {
    env = first;
    request = normalizeRequest(second);
  } else if (hasChatAgentBinding(second)) {
    env = second;
    request = normalizeRequest(first);
  } else {
    throw new TypeError("fetchChatAgent requires Env and Request arguments");
  }

  const method = request.method.toUpperCase();
  const requestBody =
    method === "GET" || method === "HEAD"
      ? undefined
      : await request.text();

  const requestHeaders: Array<[string, string]> = [];
  request.headers.forEach((value, key) => {
    requestHeaders.push([key, value]);
  });

  const stub = getRawChatAgentStub(env, third);

  const result = await stub.rpcFetchPlain({
    url: request.url,
    method,
    headers: requestHeaders,
    body: requestBody
  });

  return new Response(result.body, {
    status: result.status,
    statusText: result.statusText,
    headers: new Headers(result.headers || [])
  });
}

export async function fetchCoreChatAgent(
  env: Env,
  request: Request
): Promise<Response> {
  return fetchChatAgent(env, request, CORE_SESSION_ID);
}
