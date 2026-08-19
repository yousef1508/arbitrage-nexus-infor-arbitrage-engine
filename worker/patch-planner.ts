import type {
  NexusPatchPlan,
  NexusPatchPlanItem
} from './types';

export type PatchPlanStatusSummary = {
  total: number;
  pending: number;
  in_progress: number;
  done: number;
  blocked: number;
  next_item: NexusPatchPlanItem | null;
};

export type PatchPlanExecutionClass =
  | 'source_patch'
  | 'runtime_verification'
  | 'build_regeneration'
  | 'deploy_verification'
  | 'external_blocked';

export type PatchPlanExecutionMetadata = {
  execution_classification: PatchPlanExecutionClass;
  can_runtime_execute: boolean;
  can_worker_self_modify: false;
  approval_behavior:
    | 'record_and_require_local_patch'
    | 'record_and_verify_runtime_route'
    | 'record_and_run_local_script'
    | 'record_external_blocker_without_fake_execution';
  execution_blockers: string[];
  execution_truth: string;
};

export type PatchPlanExecutionReadiness = {
  source_patch_items: number;
  runtime_verification_items: number;
  build_regeneration_items: number;
  deploy_verification_items: number;
  external_blocked_items: number;
  self_modification_supported: false;
  no_fake_execution: true;
};

export type PatchPlanPublicSummary = {
  success: true;
  kind: 'nexus_patch_plan';
  plan: NexusPatchPlan;
  status_summary: PatchPlanStatusSummary;
  execution_readiness: PatchPlanExecutionReadiness;
  invariant_check: {
    ok: boolean;
    errors: string[];
  };
  accounting_policy: {
    projected_values_are_not_revenue: true;
    expected_values_are_not_revenue: true;
    verified_revenue_only: true;
    patch_planner_does_not_mutate_treasury: true;
    projected_value_label: 'projected_market_value_only_not_verified_revenue';
    expected_value_label: 'expected_value_only_not_verified_revenue';
  };
  execution_policy: {
    chronological_execution_required: true;
    approved_items_must_not_disappear: true;
    source_patches_require_local_repository_or_ci: true;
    runtime_items_may_execute_in_worker: true;
    no_fake_execution: true;
  };
};

export type PatchPlanKnownFile =
  | 'worker/agent-access.ts'
  | 'worker/index.ts'
  | 'worker/userRoutes.ts'
  | 'wrangler.jsonc'
  | 'package.json'
  | 'worker/types.ts'
  | 'worker/fx-rates.ts'
  | 'worker/pricing-engine.ts'
  | 'worker/payment-request.ts'
  | 'worker/crypto-treasury.ts'
  | 'worker/public-sanitizer.ts'
  | 'worker/public-market-renderer.ts'
  | 'worker/public-feed-renderer.ts'
  | 'worker/seo.ts'
  | 'worker/report-builder.ts'
  | 'worker/performance-scoring.ts'
  | 'worker/market-stats.ts'
  | 'worker/acquisition-sources.ts'
  | 'worker/crypto-acquisition-agent.ts'
  | 'worker/agent-suggestions.ts'
  | 'worker/patch-planner.ts'
  | 'worker/admin-auth.ts'
  | 'worker/admin-routes.ts'
  | 'worker/public-routes.ts'
  | 'worker/agent.ts'
  | 'src/lib/store.ts'
  | 'src/pages/AgentPage.tsx'
  | 'src/pages/VaultPage.tsx'
  | 'src/pages/TreasuryPage.tsx'
  | 'src/main.tsx'
  | 'scripts/smoke-test.ps1'
  | 'scripts/deploy-check.ps1'
  | 'dist/**';

const PLAN_ID = 'arbitrage-nexus-autonomous-market-patch-plan-v2';
const PLAN_TITLE = 'Arbitrage Nexus autonomous single-user market execution plan';

function cleanText(value: unknown): string {
  return String(value ?? '')
    .replace(/\uFFFD/g, '')
    .replace(/�/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePath(value: unknown): string {
  return cleanText(value).replace(/\\/g, '/');
}

function createItem(input: {
  order: number;
  file_path: PatchPlanKnownFile | string;
  action: NexusPatchPlanItem['action'];
  purpose: string;
  depends_on?: string[];
  status?: NexusPatchPlanItem['status'];
}): NexusPatchPlanItem {
  return {
    order: input.order,
    file_path: normalizePath(input.file_path),
    action: input.action,
    purpose: cleanText(input.purpose),
    depends_on: input.depends_on?.map(normalizePath).filter(Boolean),
    status: input.status || 'pending'
  };
}

function sortItems(items: NexusPatchPlanItem[]): NexusPatchPlanItem[] {
  return [...items].sort((a, b) => a.order - b.order);
}

function statusRank(status: NexusPatchPlanItem['status']): number {
  if (status === 'done') return 4;
  if (status === 'in_progress') return 3;
  if (status === 'blocked') return 2;
  return 1;
}

function mergeItemStatus(
  a: NexusPatchPlanItem['status'],
  b: NexusPatchPlanItem['status']
): NexusPatchPlanItem['status'] {
  return statusRank(a) >= statusRank(b) ? a : b;
}

function uniqueStrings(values: string[] = []): string[] {
  return [...new Set(values.map(normalizePath).filter(Boolean))];
}

function uniqueItems(items: NexusPatchPlanItem[]): NexusPatchPlanItem[] {
  const byPath = new Map<string, NexusPatchPlanItem>();

  for (const item of sortItems(items)) {
    const key = normalizePath(item.file_path);
    const existing = byPath.get(key);

    if (!existing) {
      byPath.set(key, {
        ...item,
        file_path: key,
        depends_on: uniqueStrings(item.depends_on || [])
      });
      continue;
    }

    byPath.set(key, {
      ...existing,
      ...item,
      file_path: key,
      order: Math.min(existing.order, item.order),
      depends_on: uniqueStrings([
        ...(existing.depends_on || []),
        ...(item.depends_on || [])
      ]),
      status: mergeItemStatus(existing.status, item.status)
    });
  }

  return sortItems([...byPath.values()]).map((item, index) => ({
    ...item,
    order: index + 1
  }));
}

function getPathExecutionMetadata(item: NexusPatchPlanItem): PatchPlanExecutionMetadata {
  const path = normalizePath(item.file_path);

  if (path === 'dist/**') {
    return {
      execution_classification: 'build_regeneration',
      can_runtime_execute: false,
      can_worker_self_modify: false,
      approval_behavior: 'record_and_run_local_script',
      execution_blockers: ['local_build_required'],
      execution_truth:
        'Built assets must be regenerated by the local build pipeline or CI. The deployed Worker must not fake this step.'
    };
  }

  if (path.startsWith('scripts/')) {
    return {
      execution_classification: 'deploy_verification',
      can_runtime_execute: false,
      can_worker_self_modify: false,
      approval_behavior: 'record_and_run_local_script',
      execution_blockers: ['local_shell_execution_required'],
      execution_truth:
        'PowerShell verification scripts run locally or in CI, not inside the deployed Worker runtime.'
    };
  }

  if (
    item.action === 'verify' ||
    path.includes('smoke') ||
    path.includes('deploy-check')
  ) {
    return {
      execution_classification: 'deploy_verification',
      can_runtime_execute: false,
      can_worker_self_modify: false,
      approval_behavior: 'record_and_run_local_script',
      execution_blockers: ['local_or_ci_execution_required'],
      execution_truth:
        'Verification can be executed by local shell or CI. Runtime should record status but not pretend it ran shell commands.'
    };
  }

  if (
    path === 'worker/agent.ts' ||
    path === 'worker/admin-routes.ts' ||
    path === 'worker/userRoutes.ts' ||
    path === 'src/lib/store.ts' ||
    path === 'src/pages/AgentPage.tsx'
  ) {
    return {
      execution_classification: 'source_patch',
      can_runtime_execute: false,
      can_worker_self_modify: false,
      approval_behavior: 'record_and_require_local_patch',
      execution_blockers: ['repository_write_and_deploy_required'],
      execution_truth:
        'This is a real source patch. The Worker cannot safely rewrite, commit, build, and deploy itself unless a repository/CI execution rail is explicitly configured.'
    };
  }

  return {
    execution_classification: 'source_patch',
    can_runtime_execute: false,
    can_worker_self_modify: false,
    approval_behavior: 'record_and_require_local_patch',
    execution_blockers: ['source_patch_required'],
    execution_truth:
      'This item changes source-controlled files. It must be patched in the repository and deployed before it is considered executed.'
  };
}

function findItem(plan: NexusPatchPlan, filePath: string): NexusPatchPlanItem | null {
  const normalized = normalizePath(filePath);

  return (
    (Array.isArray(plan.items) ? plan.items : []).find(
      (item) => normalizePath(item.file_path) === normalized
    ) || null
  );
}

function dependenciesSatisfied(plan: NexusPatchPlan, item: NexusPatchPlanItem): boolean {
  return (item.depends_on || []).every((dep) => {
    const depItem = findItem(plan, dep);

    return Boolean(depItem && depItem.status === 'done');
  });
}

export function buildDefaultPatchPlan(now = Date.now()): NexusPatchPlan {
  const items: NexusPatchPlanItem[] = [
    createItem({
      order: 1,
      file_path: 'worker/agent-access.ts',
      action: 'create',
      status: 'done',
      purpose:
        'Create stable singleton Durable Object / Agents SDK access using the canonical core session.'
    }),
    createItem({
      order: 2,
      file_path: 'worker/index.ts',
      action: 'patch',
      status: 'done',
      depends_on: ['worker/agent-access.ts'],
      purpose:
        'Patch worker entrypoint, public/private route guard, canonical domain behavior, and scheduled ingestion proxy.'
    }),
    createItem({
      order: 3,
      file_path: 'worker/userRoutes.ts',
      action: 'patch',
      status: 'done',
      depends_on: ['worker/agent-access.ts', 'worker/index.ts'],
      purpose:
        'Patch public API routing, owner-only API boundary, and core-agent proxy routes.'
    }),
    createItem({
      order: 4,
      file_path: 'wrangler.jsonc',
      action: 'patch',
      status: 'done',
      purpose:
        'Ensure bindings, Durable Objects, cron triggers, vars, and deployment configuration align with the singleton core agent.'
    }),
    createItem({
      order: 5,
      file_path: 'package.json',
      action: 'patch',
      status: 'done',
      purpose:
        'Patch dependencies only when required by the worker/runtime architecture.'
    }),
    createItem({
      order: 6,
      file_path: 'worker/types.ts',
      action: 'patch',
      status: 'done',
      purpose:
        'Add shared types for public market, FX, dynamic pricing, payment requests, execution classifications, acquisition candidates, suggestions, patch planning, and verified-only accounting.'
    }),
    createItem({
      order: 7,
      file_path: 'worker/fx-rates.ts',
      action: 'create',
      status: 'done',
      depends_on: ['worker/types.ts'],
      purpose:
        'Create deterministic NOK/USD conversion and formatting helpers for pricing and public reporting.'
    }),
    createItem({
      order: 8,
      file_path: 'worker/pricing-engine.ts',
      action: 'create',
      status: 'done',
      depends_on: ['worker/types.ts', 'worker/fx-rates.ts'],
      purpose:
        'Create dynamic report pricing from market-value, risk, urgency, monetization, and AI pricing signals.'
    }),
    createItem({
      order: 9,
      file_path: 'worker/payment-request.ts',
      action: 'create',
      status: 'done',
      depends_on: ['worker/types.ts', 'worker/fx-rates.ts', 'worker/pricing-engine.ts'],
      purpose:
        'Create machine-readable payment requests for priced reports without crediting treasury or ledger revenue.'
    }),
    createItem({
      order: 10,
      file_path: 'worker/crypto-treasury.ts',
      action: 'patch',
      status: 'done',
      depends_on: ['worker/types.ts', 'worker/payment-request.ts'],
      purpose:
        'Patch crypto treasury helpers so verified on-chain payments can create ledger, tax, unlock, and treasury objects only after receipt verification.'
    }),
    createItem({
      order: 11,
      file_path: 'worker/public-sanitizer.ts',
      action: 'create',
      status: 'done',
      depends_on: ['worker/types.ts', 'worker/payment-request.ts'],
      purpose:
        'Create safe public report sanitization that exposes prices, previews, payment info, and projected values without private state.'
    }),
    createItem({
      order: 12,
      file_path: 'worker/public-market-renderer.ts',
      action: 'create',
      status: 'done',
      depends_on: ['worker/public-sanitizer.ts'],
      purpose:
        'Create public HTML/JSON report-market renderer for humans, crawlers, and autonomous buyers.'
    }),
    createItem({
      order: 13,
      file_path: 'worker/public-feed-renderer.ts',
      action: 'create',
      status: 'done',
      depends_on: ['worker/public-sanitizer.ts'],
      purpose:
        'Create RSS, Atom, JSON Feed, sitemap, robots, and discovery renderers for public machine-readable indexing.'
    }),
    createItem({
      order: 14,
      file_path: 'worker/seo.ts',
      action: 'patch',
      status: 'done',
      depends_on: ['worker/types.ts'],
      purpose:
        'Patch SEO metadata and JSON-LD with locked report, payment, dataset, crawler, and projected-value-not-revenue policy.'
    }),
    createItem({
      order: 15,
      file_path: 'worker/report-builder.ts',
      action: 'patch',
      status: 'done',
      depends_on: ['worker/seo.ts', 'worker/payment-request.ts'],
      purpose:
        'Patch report payloads and HTML so full reports include machine-readable pricing, payment, crawler-consumable metadata, and accounting policy.'
    }),
    createItem({
      order: 16,
      file_path: 'worker/performance-scoring.ts',
      action: 'patch',
      status: 'done',
      purpose:
        'Patch niche/source reinforcement so projected value informs prioritization while only verified payment evidence counts as revenue.'
    }),
    createItem({
      order: 17,
      file_path: 'worker/market-stats.ts',
      action: 'patch',
      status: 'done',
      depends_on: ['worker/performance-scoring.ts'],
      purpose:
        'Patch public/internal market stats so projected inventory value, expected value, verified unlocks, and verified revenue remain separate.'
    }),
    createItem({
      order: 18,
      file_path: 'worker/acquisition-sources.ts',
      action: 'create',
      status: 'done',
      depends_on: ['worker/types.ts', 'worker/fx-rates.ts'],
      purpose:
        'Create zero-cash-cost acquisition source catalog and candidate builder with reality checks for login, captcha, KYC, wallet signature, credentials, paid APIs, and external approval.'
    }),
    createItem({
      order: 19,
      file_path: 'worker/crypto-acquisition-agent.ts',
      action: 'patch',
      status: 'done',
      depends_on: ['worker/acquisition-sources.ts', 'worker/types.ts'],
      purpose:
        'Patch acquisition planner into an executor-aware agent: auto_executable candidates can run, external_blocked candidates remain visible, and verified_revenue is only counted after real settlement verification.'
    }),
    createItem({
      order: 20,
      file_path: 'worker/agent-suggestions.ts',
      action: 'patch',
      status: 'done',
      depends_on: ['worker/market-stats.ts', 'worker/crypto-acquisition-agent.ts'],
      purpose:
        'Patch suggestions so approvals do not vanish: approved items receive execution metadata, auto-executable items queue for execution, and blocked/source-patch items are not fake-executed.'
    }),
    createItem({
      order: 21,
      file_path: 'worker/patch-planner.ts',
      action: 'patch',
      status: 'done',
      depends_on: ['worker/types.ts', 'worker/agent-suggestions.ts'],
      purpose:
        'Patch chronological plan registry with execution truth metadata, src/main.tsx routing awareness, dependency validation, and no-fake-execution semantics.'
    }),
    createItem({
      order: 22,
      file_path: 'worker/admin-auth.ts',
      action: 'create',
      status: 'in_progress',
      purpose:
        'Create reusable owner/admin authorization helpers for Cloudflare Access, admin token, local development bypass, and consistent protected route responses.'
    }),
    createItem({
      order: 23,
      file_path: 'worker/admin-routes.ts',
      action: 'patch',
      status: 'pending',
      depends_on: ['worker/admin-auth.ts', 'worker/agent-access.ts'],
      purpose:
        'Patch owner-only admin route module for system stats, treasury, ingestion, policy, suggestion actions, acquisition executor routes, patch-plan routes, and execution-ledger visibility.'
    }),
    createItem({
      order: 24,
      file_path: 'worker/public-routes.ts',
      action: 'patch',
      status: 'pending',
      depends_on: [
        'worker/public-market-renderer.ts',
        'worker/public-feed-renderer.ts',
        'worker/payment-request.ts',
        'worker/crypto-treasury.ts'
      ],
      purpose:
        'Patch public route module for reports, feeds, sitemap, robots, discovery, machine-readable payment requests, locked full payloads, and payment verification endpoints.'
    }),
    createItem({
      order: 25,
      file_path: 'worker/agent.ts',
      action: 'patch',
      status: 'pending',
      depends_on: [
        'worker/public-routes.ts',
        'worker/admin-routes.ts',
        'worker/report-builder.ts',
        'worker/market-stats.ts',
        'worker/crypto-acquisition-agent.ts',
        'worker/agent-suggestions.ts',
        'worker/patch-planner.ts'
      ],
      purpose:
        'Patch core agent with real execution ledgers, approval-to-execution routing, scheduled autonomous acquisition runs, suggestion execution logs, patch-plan execution state, verified-only payment settlement, and no fake treasury credit.'
    }),
    createItem({
      order: 26,
      file_path: 'src/lib/store.ts',
      action: 'patch',
      status: 'pending',
      depends_on: ['worker/agent.ts', 'worker/market-stats.ts', 'worker/agent-suggestions.ts'],
      purpose:
        'Patch frontend store types/state/actions for acquisition candidates, execution ledgers, suggestions, patch plan, verified revenue, projected value, expected value, and protected admin fetches.'
    }),
    createItem({
      order: 27,
      file_path: 'src/pages/AgentPage.tsx',
      action: 'patch',
      status: 'pending',
      depends_on: ['src/lib/store.ts'],
      purpose:
        'Patch Agent page to show autonomous ingestion, suggestion approvals, execution ledgers, candidate classifications, actual executed results, external blockers, and verified-only revenue labels.'
    }),
    createItem({
      order: 28,
      file_path: 'src/pages/VaultPage.tsx',
      action: 'patch',
      status: 'pending',
      depends_on: ['src/lib/store.ts'],
      purpose:
        'Patch Vault page so report inventory, dynamic price, unlock status, payment status, projected values, and verified revenue are displayed safely and consistently with public report pages.'
    }),
    createItem({
      order: 29,
      file_path: 'src/pages/TreasuryPage.tsx',
      action: 'patch',
      status: 'pending',
      depends_on: ['src/lib/store.ts'],
      purpose:
        'Patch Treasury page so only verified ledger/tax receipt data appears as real revenue or treasury balance; expected/projected values remain prioritization data only.'
    }),
    createItem({
      order: 30,
      file_path: 'src/main.tsx',
      action: 'patch',
      status: 'pending',
      depends_on: [
        'src/pages/AgentPage.tsx',
        'src/pages/VaultPage.tsx',
        'src/pages/TreasuryPage.tsx'
      ],
      purpose:
        'Patch frontend router entrypoint only if needed; this project uses src/main.tsx, not src/App.tsx.'
    }),
    createItem({
      order: 31,
      file_path: 'scripts/smoke-test.ps1',
      action: 'patch',
      status: 'pending',
      purpose:
        'Patch smoke tests for health, reports, feeds, sitemap, robots, admin boundary, acquisition status/run, suggestions action, patch-plan routes, locked payload boundary, and payment verification behavior.'
    }),
    createItem({
      order: 32,
      file_path: 'scripts/deploy-check.ps1',
      action: 'patch',
      status: 'pending',
      depends_on: ['scripts/smoke-test.ps1'],
      purpose:
        'Patch deployment verification script for TypeScript, build, Wrangler deploy, dist/client output, and post-deploy public/private/execution route checks.'
    }),
    createItem({
      order: 33,
      file_path: 'dist/**',
      action: 'regenerate',
      status: 'pending',
      depends_on: [
        'src/lib/store.ts',
        'src/pages/AgentPage.tsx',
        'src/pages/VaultPage.tsx',
        'src/TreasuryPage.tsx',
        'src/main.tsx'
      ],
      purpose:
        'Regenerate built frontend assets only after worker and source frontend patches are complete. Built files are output artifacts, not source patches.'
    })
  ];

  return {
    id: PLAN_ID,
    title: PLAN_TITLE,
    items: uniqueItems(items),
    created_at: now,
    updated_at: now
  };
}

export function getPatchPlanItem(
  plan: NexusPatchPlan,
  filePath: string
): NexusPatchPlanItem | null {
  return findItem(plan, filePath);
}

export function getNextPatchPlanItem(plan: NexusPatchPlan): NexusPatchPlanItem | null {
  const items = sortItems(Array.isArray(plan.items) ? plan.items : []);
  const normalizedPlan = {
    ...plan,
    items
  };

  const inProgress = items.find((item) => item.status === 'in_progress');

  if (inProgress) {
    return inProgress;
  }

  return (
    items.find(
      (item) =>
        item.status === 'pending' &&
        dependenciesSatisfied(normalizedPlan, item)
    ) ||
    items.find((item) => item.status === 'pending') ||
    null
  );
}

export function summarizePatchPlan(plan: NexusPatchPlan): PatchPlanStatusSummary {
  const items = Array.isArray(plan.items) ? plan.items : [];

  const pending = items.filter((item) => item.status === 'pending').length;
  const inProgress = items.filter((item) => item.status === 'in_progress').length;
  const done = items.filter((item) => item.status === 'done').length;
  const blocked = items.filter((item) => item.status === 'blocked').length;

  return {
    total: items.length,
    pending,
    in_progress: inProgress,
    done,
    blocked,
    next_item: getNextPatchPlanItem(plan)
  };
}

export function buildPatchPlanExecutionReadiness(
  plan: NexusPatchPlan
): PatchPlanExecutionReadiness {
  const metadata = (plan.items || []).map(getPathExecutionMetadata);

  return {
    source_patch_items: metadata.filter((item) => item.execution_classification === 'source_patch').length,
    runtime_verification_items: metadata.filter((item) => item.execution_classification === 'runtime_verification').length,
    build_regeneration_items: metadata.filter((item) => item.execution_classification === 'build_regeneration').length,
    deploy_verification_items: metadata.filter((item) => item.execution_classification === 'deploy_verification').length,
    external_blocked_items: metadata.filter((item) => item.execution_classification === 'external_blocked').length,
    self_modification_supported: false,
    no_fake_execution: true
  };
}

export function getPatchPlanExecutionMetadata(
  item: NexusPatchPlanItem
): PatchPlanExecutionMetadata {
  return getPathExecutionMetadata(item);
}

export function markPatchPlanItemStatus(
  plan: NexusPatchPlan,
  filePath: string,
  status: NexusPatchPlanItem['status'],
  now = Date.now()
): NexusPatchPlan {
  const normalized = normalizePath(filePath);
  const items = plan.items.map((item) =>
    normalizePath(item.file_path) === normalized
      ? {
          ...item,
          status
        }
      : item
  );

  return {
    ...plan,
    items: sortItems(items),
    updated_at: now
  };
}

export function markCurrentPatchPlanItemDone(
  plan: NexusPatchPlan,
  now = Date.now()
): NexusPatchPlan {
  const current = getNextPatchPlanItem(plan);

  if (!current) {
    return {
      ...plan,
      updated_at: now
    };
  }

  const donePlan = markPatchPlanItemStatus(plan, current.file_path, 'done', now);
  const next = getNextPatchPlanItem(donePlan);

  if (!next) {
    return donePlan;
  }

  return markPatchPlanItemStatus(donePlan, next.file_path, 'in_progress', now);
}

export function setPatchPlanCurrentItem(
  plan: NexusPatchPlan,
  filePath: string,
  now = Date.now()
): NexusPatchPlan {
  const normalized = normalizePath(filePath);

  const items = plan.items
    .map((item) => {
      if (item.status === 'in_progress') {
        return {
          ...item,
          status: 'pending' as const
        };
      }

      return item;
    })
    .map((item) =>
      normalizePath(item.file_path) === normalized
        ? {
            ...item,
            status: 'in_progress' as const
          }
        : item
    );

  return {
    ...plan,
    items: sortItems(items),
    updated_at: now
  };
}

export function blockPatchPlanItem(
  plan: NexusPatchPlan,
  filePath: string,
  now = Date.now()
): NexusPatchPlan {
  return markPatchPlanItemStatus(plan, filePath, 'blocked', now);
}

export function unblockPatchPlanItem(
  plan: NexusPatchPlan,
  filePath: string,
  now = Date.now()
): NexusPatchPlan {
  return markPatchPlanItemStatus(plan, filePath, 'pending', now);
}

export function mergePatchPlans(
  basePlan: NexusPatchPlan,
  incomingPlan: NexusPatchPlan,
  now = Date.now()
): NexusPatchPlan {
  return {
    ...basePlan,
    id: basePlan.id || incomingPlan.id || PLAN_ID,
    title: basePlan.title || incomingPlan.title || PLAN_TITLE,
    items: uniqueItems([
      ...(basePlan.items || []),
      ...(incomingPlan.items || [])
    ]),
    updated_at: now
  };
}

export function assertPatchPlanOrder(plan: NexusPatchPlan): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const items = sortItems(plan.items || []);

  const seen = new Set<string>();

  for (const item of items) {
    const path = normalizePath(item.file_path);

    if (seen.has(path)) {
      errors.push(`DUPLICATE_FILE:${path}`);
    }

    seen.add(path);

    if (path === 'src/App.tsx') {
      errors.push('INVALID_ROUTER_ENTRYPOINT:src/App.tsx:project_uses_src/main.tsx');
    }

    if (!cleanText(item.purpose)) {
      errors.push(`EMPTY_PURPOSE:${path}`);
    }

    for (const dep of item.depends_on || []) {
      const normalizedDep = normalizePath(dep);
      const depItem = items.find((candidate) => normalizePath(candidate.file_path) === normalizedDep);

      if (!depItem) {
        errors.push(`MISSING_DEPENDENCY:${path}->${normalizedDep}`);
        continue;
      }

      if (depItem.order >= item.order) {
        errors.push(`DEPENDENCY_ORDER_INVALID:${path}->${normalizedDep}`);
      }
    }
  }

  const activeItems = items.filter((item) => item.status === 'in_progress');

  if (activeItems.length > 1) {
    errors.push(`MULTIPLE_IN_PROGRESS:${activeItems.map((item) => item.file_path).join(',')}`);
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export function buildPatchPlanPublicSummary(
  plan: NexusPatchPlan = buildDefaultPatchPlan(),
  now = Date.now()
): PatchPlanPublicSummary {
  const normalizedPlan: NexusPatchPlan = {
    ...plan,
    items: sortItems(plan.items || []),
    updated_at: now
  };

  return {
    success: true,
    kind: 'nexus_patch_plan',
    plan: normalizedPlan,
    status_summary: summarizePatchPlan(normalizedPlan),
    execution_readiness: buildPatchPlanExecutionReadiness(normalizedPlan),
    invariant_check: assertPatchPlanOrder(normalizedPlan),
    accounting_policy: {
      projected_values_are_not_revenue: true,
      expected_values_are_not_revenue: true,
      verified_revenue_only: true,
      patch_planner_does_not_mutate_treasury: true,
      projected_value_label: 'projected_market_value_only_not_verified_revenue',
      expected_value_label: 'expected_value_only_not_verified_revenue'
    },
    execution_policy: {
      chronological_execution_required: true,
      approved_items_must_not_disappear: true,
      source_patches_require_local_repository_or_ci: true,
      runtime_items_may_execute_in_worker: true,
      no_fake_execution: true
    }
  };
}

export function buildPatchPlanTextSummary(plan: NexusPatchPlan): string {
  const summary = summarizePatchPlan(plan);
  const next = summary.next_item;
  const invariant = assertPatchPlanOrder(plan);
  const readiness = buildPatchPlanExecutionReadiness(plan);

  return [
    `plan=${plan.id}`,
    `total=${summary.total}`,
    `done=${summary.done}`,
    `in_progress=${summary.in_progress}`,
    `pending=${summary.pending}`,
    `blocked=${summary.blocked}`,
    `next=${next ? `${next.file_path}:${next.action}` : 'none'}`,
    `order_ok=${invariant.ok}`,
    `source_patch_items=${readiness.source_patch_items}`,
    `build_regeneration_items=${readiness.build_regeneration_items}`,
    'router_entrypoint=src/main.tsx',
    'worker_self_modification=false',
    'projected_values_are_not_revenue=true',
    'expected_values_are_not_revenue=true',
    'verified_revenue_only=true',
    'no_fake_execution=true'
  ].join(' ');
}
