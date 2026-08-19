import React, { useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import {
  Activity,
  AlertTriangle,
  Coins,
  Cpu,
  Lightbulb,
  ListChecks,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Terminal,
  TrendingUp
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import {
  useStore,
  useAgentsList,
  useLedgerEntries,
  useTasksList,
  useEarningAssetsList,
  useAgentSuggestionsList,
  useApprovedCryptoAcquisitionCandidates,
  useCryptoAcquisitionExpectedValueNok,
  useCurrentPatchPlanItem,
  usePatchPlanSummary,
  useResolveSuggestion,
  useRunCryptoAcquisition,
  useVerifiedRevenueOnly
} from '@/lib/store';

const ACTIVE_AGENT_STATUSES = new Set([
  'scanning',
  'analyzing',
  'routing',
  'executing',
  'running',
  'processing'
]);

const COMPLETED_TASK_STATUSES = new Set(['completed']);
const FAILED_TASK_STATUSES = new Set(['failed', 'error', 'crashed']);
const EMPTY_EXECUTION_ARRAY: any[] = Object.freeze([]) as any[];

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatNok(value: number): string {
  return `${safeNumber(value).toLocaleString('nb-NO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} kr`;
}

function formatCompactNok(value: number): string {
  return `${Math.round(safeNumber(value)).toLocaleString('nb-NO')} kr`;
}

function formatPercent(value: number): string {
  return `${safeNumber(value).toFixed(1)}%`;
}

function formatAge(timestamp?: number): string {
  const ts = safeNumber(timestamp, 0);
  if (!ts) return 'never';

  const diffMs = Math.max(0, Date.now() - ts);
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
}

function normalizeStatus(status: unknown): string {
  return String(status || 'idle').toLowerCase();
}

function titleCase(value: unknown): string {
  return String(value || 'unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function shortText(value: unknown, max = 140): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function MetricCard(props: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sublabel?: React.ReactNode;
  tone: 'sky' | 'emerald' | 'amber' | 'violet';
}) {
  const toneClasses = {
    sky: { box: 'bg-sky-500/10 text-sky-400', sub: 'text-sky-300/70' },
    emerald: { box: 'bg-emerald-500/10 text-emerald-400', sub: 'text-emerald-300/70' },
    amber: { box: 'bg-amber-500/10 text-amber-400', sub: 'text-amber-300/70' },
    violet: { box: 'bg-violet-500/10 text-violet-400', sub: 'text-violet-300/70' }
  }[props.tone];

  return (
    <Card className="bg-slate-900/20 border-slate-800 shadow-lg group">
      <CardContent className="p-4 flex items-center gap-4">
        <div className={`p-3 rounded-xl group-hover:scale-110 transition-transform ${toneClasses.box}`}>
          {props.icon}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
            {props.label}
          </p>
          <div className="text-xl font-mono font-black text-slate-100 truncate">
            {props.value}
          </div>
          {props.sublabel ? (
            <p className={`text-[10px] font-mono mt-1 truncate ${toneClasses.sub}`}>
              {props.sublabel}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusPill(props: {
  children: React.ReactNode;
  tone?: 'emerald' | 'amber' | 'sky' | 'slate' | 'rose';
}) {
  const tone = props.tone || 'slate';
  const classes = {
    emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300',
    amber: 'bg-amber-500/10 border-amber-500/20 text-amber-300',
    sky: 'bg-sky-500/10 border-sky-500/20 text-sky-300',
    slate: 'bg-slate-800/60 border-slate-700 text-slate-300',
    rose: 'bg-rose-500/10 border-rose-500/20 text-rose-300'
  }[tone];

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-tight ${classes}`}>
      {props.children}
    </span>
  );
}

function statusTone(status: unknown): 'emerald' | 'amber' | 'sky' | 'slate' | 'rose' {
  const normalized = normalizeStatus(status);

  if (normalized === 'executed' || normalized === 'implemented' || normalized === 'verified_revenue') return 'emerald';
  if (normalized === 'external_blocked' || normalized === 'blocked' || normalized === 'skipped_recent') return 'amber';
  if (normalized === 'failed' || normalized === 'error' || normalized === 'crashed') return 'rose';
  if (normalized === 'approved' || normalized === 'queued' || normalized === 'running') return 'sky';

  return 'slate';
}

export function AgentPage() {
  const agents = useAgentsList();
  const ledger = useLedgerEntries();
  const tasks = useTasksList();
  const earningAssets = useEarningAssetsList();

  const systemHealth = useStore(state => state.system_health);
  const treasury = useStore(state => state.treasury);
  const marketStats = useStore(state => state.market_stats);
  const cryptoAcquisitionSnapshot = useStore(state => (state as any).crypto_acquisition_snapshot || null);
  const cryptoExecutionLedger = useStore(state => ((state as any).crypto_acquisition_execution_ledger || EMPTY_EXECUTION_ARRAY) as any[]);
  const suggestionExecutionLedger = useStore(state => ((state as any).agent_suggestion_execution_ledger || EMPTY_EXECUTION_ARRAY) as any[]);
  const patchPlanExecutionLedger = useStore(state => ((state as any).patch_plan_execution_ledger || EMPTY_EXECUTION_ARRAY) as any[]);
  const unifiedExecutionLedger = useStore(state => ((state as any).execution_ledger || EMPTY_EXECUTION_ARRAY) as any[]);

  const suggestions = useAgentSuggestionsList();
  const approvedAcquisitionCandidates = useApprovedCryptoAcquisitionCandidates();
  const expectedAcquisitionValueNok = useCryptoAcquisitionExpectedValueNok();
  const patchPlanSummary = usePatchPlanSummary();
  const currentPatchPlanItem = useCurrentPatchPlanItem();
  const verifiedRevenueOnly = useVerifiedRevenueOnly();
  const runCryptoAcquisition = useRunCryptoAcquisition();
  const resolveSuggestion = useResolveSuggestion();

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;

      void useStore.getState().fetchSystemState(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);
  const metrics = useMemo(() => {
    const agentList = Array.isArray(agents) ? agents : [];
    const taskList = Array.isArray(tasks) ? tasks : [];
    const ledgerEntries = Array.isArray(ledger) ? ledger : [];
    const assets = Array.isArray(earningAssets) ? earningAssets : [];

    const activeAgentCount = agentList.filter(agent =>
      ACTIVE_AGENT_STATUSES.has(normalizeStatus((agent as any).status))
    ).length;

    const activeTaskCount = taskList.filter(task =>
      ACTIVE_AGENT_STATUSES.has(normalizeStatus((task as any).status))
    ).length;

    const lastRunStatus = normalizeStatus(systemHealth?.last_run?.status);
    const runIsActive = lastRunStatus === 'running' ? 1 : 0;
    const totalActiveThreads = Math.max(activeAgentCount, activeTaskCount, runIsActive);
    const totalCapacity = Math.max(1, agentList.length * 10);

    const terminalTasks = taskList.filter(task => {
      const status = normalizeStatus((task as any).status);
      return COMPLETED_TASK_STATUSES.has(status) || FAILED_TASK_STATUSES.has(status);
    });

    const completedTasks = terminalTasks.filter(task =>
      COMPLETED_TASK_STATUSES.has(normalizeStatus((task as any).status))
    );

    const taskSuccessRate =
      terminalTasks.length > 0 ? (completedTasks.length / terminalTasks.length) * 100 : 0;

    const oneHourAgo = Date.now() - 3600000;

    const hourlyVerifiedRevenue = ledgerEntries
      .filter(entry =>
        String((entry as any).type) === 'credit' &&
        Boolean((entry as any).verified) &&
        safeNumber((entry as any).timestamp) > oneHourAgo
      )
      .reduce((sum, entry) => sum + safeNumber((entry as any).amount), 0);

    const totalVerifiedRevenueFromAssets = assets.reduce(
      (sum, asset) => sum + safeNumber((asset as any).verified_revenue_nok),
      0
    );

    const lockedReports = assets.filter(asset =>
      normalizeStatus((asset as any).unlock_status || 'locked') !== 'unlocked'
    ).length;

    const unlockedReports = assets.filter(asset =>
      normalizeStatus((asset as any).unlock_status) === 'unlocked'
    ).length;

    const totalProjectedMarketValueUsd = assets.reduce((sum, asset: any) => {
      return sum + safeNumber(
        asset?.projected_market_value_usd ??
          asset?.full_report_json?.projected_market_value_usd ??
          asset?.full_report_json?.pricing?.projected_market_value_usd
      );
    }, 0);

    const newestAsset = [...assets].sort((a, b) =>
      safeNumber((b as any).created_at || (b as any).updated_at) -
      safeNumber((a as any).created_at || (a as any).updated_at)
    )[0] as any;

    const enforcement = newestAsset?.payment_enforcement || {};
    const quoteEnabled = Boolean(enforcement.enabled);
    const quoteFallback = Boolean(enforcement.quote_fallback);
    const quoteStale = Boolean(enforcement.quote_stale);

    const quoteLabel = !quoteEnabled
      ? 'Quote offline'
      : quoteFallback
        ? 'Fallback POL/NOK'
        : quoteStale
          ? 'Stale CoinGecko'
          : 'Live CoinGecko';

    const quoteDetail = quoteEnabled
      ? `${newestAsset?.price_crypto_estimate || 'n/a'} · ${safeNumber(enforcement.native_price_nok).toFixed(6)} NOK/POL`
      : String(enforcement.reason || 'oracle unavailable');

    const lastRunTriggeredAt = safeNumber(systemHealth?.last_run?.triggeredAt, 0);
    const lastRunCompletedAt = safeNumber(systemHealth?.last_run?.completedAt, 0);

    return {
      totalActiveThreads,
      totalCapacity,
      activeAgentCount,
      activeTaskCount,
      lastRunStatus,
      lastRunAge: formatAge(lastRunCompletedAt || lastRunTriggeredAt),
      signalsCreated: safeNumber(systemHealth?.last_run?.signalsCreated),
      taskSuccessRate,
      terminalTaskCount: terminalTasks.length,
      completedTaskCount: completedTasks.length,
      hourlyVerifiedRevenue,
      totalVerifiedRevenue:
        marketStats?.totals?.verified_revenue_nok ?? totalVerifiedRevenueFromAssets,
      treasuryTotal: safeNumber(treasury?.total),
      lockedReports,
      unlockedReports,
      totalProjectedMarketValueUsd,
      quoteEnabled,
      quoteFallback,
      quoteStale,
      quoteLabel,
      quoteDetail,
      quoteAge: formatAge(safeNumber(enforcement.quote_fetched_at, 0))
    };
  }, [agents, tasks, ledger, earningAssets, systemHealth, treasury, marketStats]);

  const suggestionMetrics = useMemo(() => {
    const all = Array.isArray(suggestions) ? suggestions : [];

    const pending = all.filter((suggestion: any) => {
      const status = normalizeStatus(suggestion.status || 'suggested');
      return status === 'suggested' || status === 'pending';
    });

    const approved = all.filter((suggestion: any) => normalizeStatus(suggestion.status) === 'approved');
    const implemented = all.filter((suggestion: any) => normalizeStatus(suggestion.status) === 'implemented');
    const rejected = all.filter((suggestion: any) => normalizeStatus(suggestion.status) === 'rejected');

    const open = [...pending, ...approved].sort((a: any, b: any) => {
      const statusWeight = (value: any) => {
        const status = normalizeStatus(value?.status || 'suggested');
        if (status === 'approved') return 0;
        if (status === 'suggested' || status === 'pending') return 1;
        return 2;
      };

      const priorityWeight = (value: any) => {
        if (value?.priority === 'urgent') return 0;
        if (value?.priority === 'high') return 1;
        if (value?.priority === 'medium') return 2;
        return 3;
      };

      return statusWeight(a) - statusWeight(b) || priorityWeight(a) - priorityWeight(b);
    });

    return {
      all,
      pending,
      approved,
      implemented,
      rejected,
      open,
      urgent: open.filter((suggestion: any) => suggestion.priority === 'urgent'),
      high: open.filter((suggestion: any) => suggestion.priority === 'high'),
      visible: open.slice(0, 8)
    };
  }, [suggestions]);

  const executionMetrics = useMemo(() => {
    const cryptoLedger = Array.isArray(cryptoExecutionLedger) ? cryptoExecutionLedger : [];
    const suggestionLedger = Array.isArray(suggestionExecutionLedger) ? suggestionExecutionLedger : [];
    const patchLedger = Array.isArray(patchPlanExecutionLedger) ? patchPlanExecutionLedger : [];
    const unifiedLedger = Array.isArray(unifiedExecutionLedger) ? unifiedExecutionLedger : [];

    const cryptoSummary =
      (cryptoAcquisitionSnapshot as any)?.summary ||
      (cryptoAcquisitionSnapshot as any)?.last_run ||
      {};

    const snapshotCandidates = Array.isArray((cryptoAcquisitionSnapshot as any)?.candidates)
      ? (cryptoAcquisitionSnapshot as any).candidates
      : [];

    const candidateList =
      snapshotCandidates.length > 0
        ? snapshotCandidates
        : Array.isArray(approvedAcquisitionCandidates)
          ? approvedAcquisitionCandidates
          : [];

    const cryptoStatusCount = (status: string) =>
      cryptoLedger.filter((entry: any) => normalizeStatus(entry?.status) === status).length;

    const candidateClassificationCount = (classification: string) =>
      candidateList.filter((candidate: any) =>
        normalizeStatus(candidate?.execution_classification || candidate?.classification) === classification
      ).length;

    return {
      visibleCandidates: candidateList,
      cryptoLedger,
      suggestionLedger,
      patchLedger,
      unifiedLedger,
      autoExecutable: safeNumber(cryptoSummary.auto_executable, candidateClassificationCount('auto_executable')),
      externalBlocked: safeNumber(cryptoSummary.external_blocked ?? cryptoSummary.blocked, candidateClassificationCount('external_blocked')),
      executed: safeNumber(cryptoSummary.executed, cryptoStatusCount('executed')),
      failed: safeNumber(cryptoSummary.failed, cryptoStatusCount('failed')),
      verifiedRevenue: safeNumber(cryptoSummary.verified_revenue ?? cryptoSummary.verified_revenue_nok, cryptoStatusCount('verified_revenue'))
    };
  }, [
    cryptoAcquisitionSnapshot,
    approvedAcquisitionCandidates,
    cryptoExecutionLedger,
    suggestionExecutionLedger,
    patchPlanExecutionLedger,
    unifiedExecutionLedger
  ]);

  const systemHealthStatus = normalizeStatus(systemHealth?.status);
  const systemIsNominal = systemHealthStatus === 'healthy';

  return (
    <AppLayout container contentClassName="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3 tracking-tighter">
            <Cpu className="h-8 w-8 text-emerald-400" />
            AGENT FLEET OVERSIGHT
          </h1>

          <p className="text-slate-400 font-mono text-xs mt-1 uppercase tracking-widest">
            Autonomous Cluster Monitoring System • Verified Revenue Kernel • Live Payment Oracle
          </p>
        </div>

        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${
            systemIsNominal
              ? 'bg-emerald-500/10 border-emerald-500/20'
              : 'bg-amber-500/10 border-amber-500/20'
          }`}
        >
          <ShieldCheck
            className={`h-4 w-4 ${
              systemIsNominal ? 'text-emerald-500' : 'text-amber-500'
            }`}
          />

          <span
            className={`text-[10px] font-bold uppercase tracking-tight ${
              systemIsNominal ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            System Integrity: {systemIsNominal ? 'Nominal' : titleCase(systemHealthStatus)}
          </span>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <MetricCard
          tone="sky"
          icon={<Terminal className="h-5 w-5" />}
          label="Active Threads"
          value={
            <>
              {metrics.totalActiveThreads}{' '}
              <span className="text-slate-600 text-sm">/ {metrics.totalCapacity}</span>
            </>
          }
          sublabel={`${metrics.activeAgentCount} active agents · ${metrics.activeTaskCount} executing tasks`}
        />

        <MetricCard
          tone={metrics.lastRunStatus === 'failed' ? 'amber' : 'emerald'}
          icon={<Activity className="h-5 w-5" />}
          label="Cycle Status"
          value={titleCase(metrics.lastRunStatus)}
          sublabel={`${metrics.signalsCreated} signals · ${metrics.lastRunAge}`}
        />

        <MetricCard
          tone="amber"
          icon={<TrendingUp className="h-5 w-5" />}
          label="Verified Throughput/hr"
          value={`${formatNok(metrics.hourlyVerifiedRevenue)}/hr`}
          sublabel={`Total verified: ${formatNok(metrics.totalVerifiedRevenue)}`}
        />

        <MetricCard
          tone={metrics.quoteEnabled && !metrics.quoteFallback ? 'emerald' : 'violet'}
          icon={<ShieldCheck className="h-5 w-5" />}
          label="Payment Oracle"
          value={metrics.quoteLabel}
          sublabel={`${metrics.quoteDetail} · ${metrics.quoteAge}`}
        />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-slate-900/20 border-slate-800 shadow-lg">
          <CardContent className="p-4">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
              Task Success Rate
            </p>
            <p className="text-xl font-mono font-black text-slate-100 mt-1">
              {formatPercent(metrics.taskSuccessRate)}
            </p>
            <p className="text-[10px] font-mono text-slate-500 mt-1">
              {metrics.completedTaskCount} completed / {metrics.terminalTaskCount} terminal tasks
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/20 border-slate-800 shadow-lg">
          <CardContent className="p-4">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
              Locked Reports
            </p>
            <p className="text-xl font-mono font-black text-slate-100 mt-1">
              {metrics.lockedReports}
            </p>
            <p className="text-[10px] font-mono text-slate-500 mt-1">
              {metrics.unlockedReports} unlocked after verified payment
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/20 border-slate-800 shadow-lg">
          <CardContent className="p-4">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
              Revenue Policy
            </p>
            <p className="text-xl font-mono font-black text-emerald-400 mt-1">
              {verifiedRevenueOnly ? 'Verified Only' : 'Check Policy'}
            </p>
            <p className="text-[10px] font-mono text-slate-500 mt-1">
              Treasury total {formatNok(metrics.treasuryTotal)} · projected inventory value is not revenue
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="bg-slate-900/20 border-slate-800 shadow-lg xl:col-span-1">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                  Agent Suggestions
                </p>
                <h2 className="text-xl font-black text-slate-100 tracking-tight">
                  Autonomous improvement queue
                </h2>
              </div>
              <Lightbulb className="h-5 w-5 text-amber-400" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-slate-950/40 border border-slate-800 p-3">
                <p className="text-[10px] text-slate-500 font-bold uppercase">Open</p>
                <p className="text-lg font-mono font-black">{suggestionMetrics.open.length}</p>
              </div>

              <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-3">
                <p className="text-[10px] text-emerald-300 font-bold uppercase">Approved</p>
                <p className="text-lg font-mono font-black text-emerald-300">{suggestionMetrics.approved.length}</p>
              </div>

              <div className="rounded-xl bg-rose-500/5 border border-rose-500/20 p-3">
                <p className="text-[10px] text-rose-300 font-bold uppercase">Urgent</p>
                <p className="text-lg font-mono font-black text-rose-300">{suggestionMetrics.urgent.length}</p>
              </div>

              <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3">
                <p className="text-[10px] text-amber-300 font-bold uppercase">High</p>
                <p className="text-lg font-mono font-black text-amber-300">{suggestionMetrics.high.length}</p>
              </div>
            </div>

            <div className="space-y-3">
              {suggestionMetrics.visible.length > 0 ? (
                suggestionMetrics.visible.map((suggestion: any) => (
                  <div
                    key={suggestion.id}
                    className="rounded-xl border border-slate-800 bg-slate-950/30 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <StatusPill tone={suggestion.priority === 'urgent' ? 'rose' : suggestion.priority === 'high' ? 'amber' : 'slate'}>
                        {suggestion.priority}
                      </StatusPill>
                      <StatusPill tone="sky">{suggestion.category}</StatusPill>
                    </div>

                    <p className="text-sm font-bold text-slate-100">{suggestion.title}</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      {shortText(suggestion.why, 180)}
                    </p>

                    {suggestion.execution_status ? (
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-2 py-1">
                        <span className="text-[10px] font-mono text-slate-500">
                          Execution: {titleCase(suggestion.execution_status)}
                        </span>
                        <StatusPill tone={statusTone(suggestion.execution_status)}>
                          {suggestion.execution_id ? 'logged' : 'state'}
                        </StatusPill>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => void resolveSuggestion(suggestion.id, 'approve')}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[10px] font-black uppercase"
                      >
                        {suggestion.status === 'approved' ? 'Approved' : 'Approve'}
                      </button>

                      <button
                        type="button"
                        onClick={() => void resolveSuggestion(suggestion.id, 'implemented')}
                        className="px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-300 border border-sky-500/20 text-[10px] font-black uppercase"
                      >
                        Mark Done
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500">No pending suggestions loaded yet.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/20 border-slate-800 shadow-lg">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                  Zero-Cost Acquisition
                </p>
                <h2 className="text-xl font-black text-slate-100 tracking-tight">
                  Execution planner
                </h2>
              </div>
              <Coins className="h-5 w-5 text-emerald-400" />
            </div>

            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <p className="text-[10px] text-emerald-300 font-bold uppercase">
                Expected value only
              </p>
              <p className="text-2xl font-mono font-black text-emerald-300 mt-1">
                {formatCompactNok(expectedAcquisitionValueNok)}
              </p>
              <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                Candidate states: {executionMetrics.visibleCandidates.length} total · {executionMetrics.autoExecutable} auto-executable · {executionMetrics.externalBlocked} external-blocked. Last executor result: {executionMetrics.executed} executed · {executionMetrics.failed} failed. Treasury only changes after verified external payment.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void runCryptoAcquisition()}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 px-4 py-3 text-xs font-black uppercase tracking-tight hover:bg-emerald-500/15 transition"
            >
              <RefreshCw className="h-4 w-4" />
              Run zero-cost acquisition executor
            </button>

            <div className="space-y-2">
              {executionMetrics.visibleCandidates.slice(0, 4).map((candidate: any) => (
                <div
                  key={candidate.id}
                  className="rounded-xl bg-slate-950/30 border border-slate-800 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-100">{candidate.title}</p>
                    <StatusPill tone="emerald">
                      {formatCompactNok(candidate.expected_value_nok)}
                    </StatusPill>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {titleCase(candidate.method)} · cash cost {formatCompactNok(candidate.cash_cost_nok)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/20 border-slate-800 shadow-lg">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                  Patch Plan
                </p>
                <h2 className="text-xl font-black text-slate-100 tracking-tight">
                  Chronological execution
                </h2>
              </div>
              <ListChecks className="h-5 w-5 text-sky-400" />
            </div>

            <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4">
              <p className="text-[10px] text-sky-300 font-bold uppercase">
                Current / next item
              </p>
              <p className="text-sm font-mono font-black text-slate-100 mt-2 break-all">
                {currentPatchPlanItem?.file_path || 'No patch-plan item loaded'}
              </p>
              <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                {currentPatchPlanItem?.purpose || 'Fetch patch plan to continue top-to-bottom.'}
              </p>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-xl bg-slate-950/40 border border-slate-800 p-3">
                <p className="text-[10px] text-slate-500 font-bold uppercase">Done</p>
                <p className="text-lg font-mono font-black">{patchPlanSummary?.status_summary?.done ?? 0}</p>
              </div>

              <div className="rounded-xl bg-sky-500/5 border border-sky-500/20 p-3">
                <p className="text-[10px] text-sky-300 font-bold uppercase">Active</p>
                <p className="text-lg font-mono font-black text-sky-300">{patchPlanSummary?.status_summary?.in_progress ?? 0}</p>
              </div>

              <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3">
                <p className="text-[10px] text-amber-300 font-bold uppercase">Pending</p>
                <p className="text-lg font-mono font-black text-amber-300">{patchPlanSummary?.status_summary?.pending ?? 0}</p>
              </div>

              <div className="rounded-xl bg-rose-500/5 border border-rose-500/20 p-3">
                <p className="text-[10px] text-rose-300 font-bold uppercase">Blocked</p>
                <p className="text-lg font-mono font-black text-rose-300">{patchPlanSummary?.status_summary?.blocked ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="bg-slate-900/20 border-slate-800 shadow-lg xl:col-span-3">
          <CardContent className="p-5 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                  Execution Ledger Reality Check
                </p>
                <h2 className="text-xl font-black text-slate-100 tracking-tight">
                  What the autonomous executor actually did
                </h2>
              </div>
              <Terminal className="h-5 w-5 text-sky-400" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-3">
                <p className="text-[10px] text-emerald-300 font-bold uppercase">Executed</p>
                <p className="text-lg font-mono font-black text-emerald-300">{executionMetrics.executed}</p>
              </div>

              <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3">
                <p className="text-[10px] text-amber-300 font-bold uppercase">External Blocked</p>
                <p className="text-lg font-mono font-black text-amber-300">{executionMetrics.externalBlocked}</p>
              </div>

              <div className="rounded-xl bg-rose-500/5 border border-rose-500/20 p-3">
                <p className="text-[10px] text-rose-300 font-bold uppercase">Failed</p>
                <p className="text-lg font-mono font-black text-rose-300">{executionMetrics.failed}</p>
              </div>

              <div className="rounded-xl bg-sky-500/5 border border-sky-500/20 p-3">
                <p className="text-[10px] text-sky-300 font-bold uppercase">Verified Revenue</p>
                <p className="text-lg font-mono font-black text-sky-300">{executionMetrics.verifiedRevenue}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              {[
                ['Crypto acquisition ledger', executionMetrics.cryptoLedger],
                ['Suggestion execution ledger', executionMetrics.suggestionLedger],
                ['Patch-plan execution ledger', executionMetrics.patchLedger]
              ].map(([title, ledgerList]) => {
                const list = Array.isArray(ledgerList) ? ledgerList : [];

                return (
                  <div key={String(title)} className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-tight">
                        {String(title)}
                      </p>
                      <StatusPill tone="slate">{list.length}</StatusPill>
                    </div>

                    {list.length > 0 ? (
                      list.slice(0, 5).map((entry: any, index: number) => {
                        const entryTitle =
                          entry.title ||
                          entry.candidate_title ||
                          entry.candidate_id ||
                          entry.file_path ||
                          entry.suggestion_id ||
                          entry.method ||
                          entry.id ||
                          `entry-${index}`;

                        const log =
                          Array.isArray(entry.logs) && entry.logs.length > 0
                            ? entry.logs[0]
                            : entry.classification_reason || entry.error || entry.purpose || 'No executor log available.';

                        return (
                          <div
                            key={entry.id || `${entryTitle}-${index}`}
                            className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <StatusPill tone={statusTone(entry.status)}>
                                {titleCase(entry.status)}
                              </StatusPill>
                              <span className="text-[10px] font-mono text-slate-600">
                                {formatAge(entry.completed_at || entry.created_at)}
                              </span>
                            </div>

                            <p className="text-xs font-bold text-slate-200 break-all">
                              {shortText(entryTitle, 130)}
                            </p>

                            <p className="text-[11px] text-slate-500 leading-relaxed">
                              {shortText(log, 180)}
                            </p>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-xs text-slate-500">
                        No execution ledger entries loaded yet.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </section>

      {metrics.totalProjectedMarketValueUsd > 0 || expectedAcquisitionValueNok > 0 ? (
        <div className="p-5 bg-amber-500/5 border border-amber-500/20 rounded-2xl flex items-start gap-4">
          <div className="p-2 bg-amber-500/10 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
          </div>

          <div className="space-y-1">
            <p className="text-[10px] font-black text-amber-300 uppercase tracking-widest">
              Accounting Boundary
            </p>
            <p className="text-[11px] text-slate-400 leading-relaxed max-w-4xl">
              Projected report market value ({metrics.totalProjectedMarketValueUsd.toLocaleString('en-US')} USD)
              and expected acquisition value ({formatCompactNok(expectedAcquisitionValueNok)}) are prioritization signals only.
              They are not ledger revenue, treasury balance, verified revenue, or owner-withdrawable funds.
            </p>
          </div>
        </div>
      ) : null}

<section className="animate-in fade-in slide-in-from-bottom-4 duration-700">
  <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5 text-xs text-slate-500 font-mono">
    AgentOversight temporarily disabled while isolating React #185 render loop.
  </div>
</section>

      <div className="p-6 bg-slate-900/40 border border-slate-800 rounded-2xl flex items-center gap-4">
        <div className="p-2 bg-slate-800 rounded-lg">
          <Rocket className="h-5 w-5 text-slate-400" />
        </div>

        <div className="space-y-1">
          <p className="text-[10px] font-bold text-slate-200 uppercase tracking-widest">
            Autonomous Compliance Note
          </p>
          <p className="text-[11px] text-slate-500 leading-relaxed max-w-3xl">
            Agent execution is governed by Nexus policy controls. Revenue metrics only count verified
            ledger credits. Report unlocks require native POL payment verification against the live
            or fallback POL/NOK quote, and duplicate transaction hashes are rejected.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}

export default AgentPage;