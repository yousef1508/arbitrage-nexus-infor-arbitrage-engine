import React, { useMemo } from 'react';
import {
  Terminal,
  RefreshCw,
  Cpu,
  ShieldAlert,
  Activity,
  Globe,
  BarChart3,
  AlertCircle,
  RadioTower,
  Wallet,
  LockKeyhole,
  ReceiptText,
  Database,
  Gauge,
  ShieldCheck,
  TrendingUp,
  BrainCircuit,
  Clock,
  Wifi,
  WifiOff,
  ExternalLink,
  Bot,
  Zap,
  Coins,
  FileJson,
  TimerReset
} from 'lucide-react';
import { TreasuryOverview } from '@/components/TreasuryOverview';
import { OpportunityFeed } from '@/components/OpportunityFeed';
import { AgentStatus } from '@/components/AgentStatus';
import KernelLogViewer from '@/components/KernelLogViewer';
import { SystemPulse } from '@/components/SystemPulse';
import {
  useStore,
  useEmergencyStop,
  useMaxRiskScore,
  useReserveFloor,
  useLastRunStatus,
  useLastRunSignals,
  useLastRunTriggeredAt,
  useLastRunError,
  useDailySpend,
  useMaxSpendPerDay,
  useKernelLogs,
  useLastRunSources
} from '@/lib/store';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

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

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeStatus(value: unknown): string {
  return String(value || '').toLowerCase();
}

function cleanText(value: unknown): string {
  return String(value ?? '')
    .replace(/\uFFFD/g, '')
    .replace(/�/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatNok(value: unknown, digits = 2): string {
  return `${safeNumber(value).toLocaleString('nb-NO', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })} kr`;
}

function formatCompactNok(value: unknown): string {
  return `${safeNumber(value).toLocaleString('nb-NO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })} kr`;
}

function formatUsd(value: unknown): string {
  return safeNumber(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  });
}

function formatPercent(value: unknown, digits = 0): string {
  return `${safeNumber(value).toFixed(digits)}%`;
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

  const days = Math.floor(hours / 24);

  return `${days}d ago`;
}

function formatCountdown(targetMs?: number): string {
  const target = safeNumber(targetMs, 0);

  if (!target) return 'not scheduled';

  const remaining = Math.max(0, target - Date.now());

  if (remaining <= 0) return 'ready';

  const seconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;

  if (minutes <= 0) return `${restSeconds}s`;

  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;

  if (hours <= 0) return `${minutes}m ${restSeconds}s`;

  return `${hours}h ${restMinutes}m`;
}

function titleCase(value: unknown): string {
  return String(value || 'idle')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function shortText(value: unknown, max = 160): string {
  const text = cleanText(value);

  if (text.length <= max) return text;

  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function DashboardMetricCard(props: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  detail: React.ReactNode;
  tone: 'sky' | 'emerald' | 'amber' | 'red' | 'violet';
}) {
  const toneClass = {
    sky: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
    violet: 'bg-violet-500/10 text-violet-400 border-violet-500/20'
  }[props.tone];

  return (
    <Card className="bg-slate-950/65 border-slate-800 shadow-xl overflow-hidden relative group">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-500/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      <CardContent className="p-5 flex items-start gap-4">
        <div className={cn('p-3 rounded-xl border shrink-0', toneClass)}>
          {props.icon}
        </div>

        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
            {props.label}
          </p>

          <div className="text-xl font-mono font-black text-slate-100 mt-1 truncate">
            {props.value}
          </div>

          <p className="text-[10px] font-mono text-slate-500 mt-1 truncate">
            {props.detail}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function DataPill({
  label,
  value,
  tone = 'slate'
}: 

{
  label: string;
  value: React.ReactNode;
tone?: 'sky' | 'emerald' | 'amber' | 'red' | 'slate' | 'violet';
}) {
  const toneClass = {
    slate: 'border-slate-800 bg-slate-900/50 text-slate-300',
    sky: 'border-sky-500/25 bg-sky-500/10 text-sky-300',
    emerald: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
    amber: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
    red: 'border-red-500/25 bg-red-500/10 text-red-300'
  }[tone];

  return (
    <div className={cn('rounded-xl border px-3 py-2', toneClass)}>
      <p className="text-[8px] font-black uppercase tracking-[0.18em] opacity-70">
        {label}
      </p>
      <div className="mt-1 text-[11px] font-mono font-black">
        {value}
      </div>
    </div>
  );
}

export function HomePage() {
  const emergencyStop = useEmergencyStop();
  const maxRiskScore = useMaxRiskScore();
  const reserveFloor = useReserveFloor();
  const lastRunStatus = useLastRunStatus();
  const lastRunSignals = useLastRunSignals();
  const lastRunTriggeredAt = useLastRunTriggeredAt();
  const lastRunError = useLastRunError();
  const dailySpend = useDailySpend();
  const maxSpend = useMaxSpendPerDay();
  const kernelLogs = useKernelLogs();
  const lastRunSources = useLastRunSources();

  const fetchSystemState = useStore((state) => state.fetchSystemState);
  const agents = useStore((state) => ((state as any).agents || []));
  const tasks = useStore((state) => ((state as any).tasks || []));
  const earningAssets = useStore((state) => ((state as any).earning_assets || []));
  const opportunities = useStore((state) => ((state as any).opportunities || []));
  const ledger = useStore((state) => ((state as any).ledger || []));
  const treasury = useStore((state) => ((state as any).treasury || {}));
  const systemHealth = useStore((state) => ((state as any).system_health || {}));
  const policy = useStore((state) => ((state as any).policy || {}));

  const metrics = useMemo(() => {
    const agentList = Array.isArray(agents) ? agents : [];
    const taskList = Array.isArray(tasks) ? tasks : [];
    const assetList = Array.isArray(earningAssets) ? earningAssets : [];
    const opportunityList = Array.isArray(opportunities) ? opportunities : [];
    const ledgerList = Array.isArray(ledger) ? ledger : [];

    const activeAgents = agentList.filter((agent) =>
      ACTIVE_AGENT_STATUSES.has(normalizeStatus(agent.status))
    );

    const terminalTasks = taskList.filter((task) => {
      const status = normalizeStatus(task.status);
      return COMPLETED_TASK_STATUSES.has(status) || FAILED_TASK_STATUSES.has(status);
    });

    const completedTasks = terminalTasks.filter((task) =>
      COMPLETED_TASK_STATUSES.has(normalizeStatus(task.status))
    );

    const failedTasks = terminalTasks.filter((task) =>
      FAILED_TASK_STATUSES.has(normalizeStatus(task.status))
    );

    const taskSuccessRate =
      terminalTasks.length > 0
        ? (completedTasks.length / terminalTasks.length) * 100
        : 0;

    const lockedReports = assetList.filter((asset) =>
      normalizeStatus(asset.unlock_status || 'locked') !== 'unlocked'
    ).length;

    const unlockedReports = assetList.filter((asset) =>
      normalizeStatus(asset.unlock_status) === 'unlocked'
    ).length;

    const verifiedRevenueFromAssets = assetList.reduce(
      (sum, asset) => sum + safeNumber(asset.verified_revenue_nok),
      0
    );

    const verifiedRevenueFromLedger = ledgerList
      .filter((entry) => String(entry.type) === 'credit')
      .reduce((sum, entry) => sum + safeNumber(entry.amount), 0);

    const oneHourAgo = Date.now() - 3600000;

    const verifiedRevenueLastHour = ledgerList
      .filter((entry) => String(entry.type) === 'credit' && safeNumber(entry.timestamp) > oneHourAgo)
      .reduce((sum, entry) => sum + safeNumber(entry.amount), 0);

    const newestAsset = [...assetList].sort((a, b) =>
      safeNumber(b.created_at || b.updated_at) - safeNumber(a.created_at || a.updated_at)
    )[0];

    const newestOpportunity = [...opportunityList].sort((a, b) =>
      safeNumber(b.created_at || b.updated_at || b.timestamp) -
      safeNumber(a.created_at || a.updated_at || a.timestamp)
    )[0];

    const enforcement = newestAsset?.payment_enforcement || newestOpportunity?.payment_enforcement || {};
    const oracleEnabled = Boolean(enforcement.enabled);
    const oracleFallback = Boolean(enforcement.quote_fallback);
    const oracleStale = Boolean(enforcement.quote_stale);

    const oracleMode = !oracleEnabled
      ? 'Paused'
      : oracleFallback
        ? 'Fallback'
        : oracleStale
          ? 'Stale Live'
          : 'Live';

    const oracleTone: 'sky' | 'emerald' | 'amber' | 'red' =
      !oracleEnabled ? 'red' : oracleFallback ? 'amber' : oracleStale ? 'sky' : 'emerald';

    const oracleDetail = oracleEnabled
      ? `${safeNumber(enforcement.native_price_nok).toFixed(6)} NOK/POL · ${newestAsset?.price_crypto_estimate || newestOpportunity?.price_crypto_estimate || 'n/a'}`
      : String(enforcement.reason || 'quote unavailable');

    const avgReportPrice =
      assetList.length > 0
        ? assetList.reduce((sum, asset) => sum + safeNumber(asset.price_nok), 0) / assetList.length
        : 0;

    const avgMarketValueScore =
      assetList.length > 0
        ? assetList.reduce((sum, asset) => sum + safeNumber(asset.market_value_score), 0) / assetList.length
        : 0;

    const avgProjectedValue =
      opportunityList.length > 0
        ? opportunityList.reduce(
            (sum, opp) => sum + safeNumber(opp.projected_market_value_usd ?? opp.potential_profit),
            0
          ) / opportunityList.length
        : 0;

    return {
      activeAgentCount: activeAgents.length,
      totalAgentCount: agentList.length,
      taskSuccessRate,
      completedTaskCount: completedTasks.length,
      failedTaskCount: failedTasks.length,
      lockedReports,
      unlockedReports,
      reportCount: assetList.length,
      opportunityCount: opportunityList.length,
      verifiedRevenue: verifiedRevenueFromAssets || verifiedRevenueFromLedger || safeNumber(treasury.total),
      verifiedRevenueLastHour,
      operatingTreasury: safeNumber(treasury.operating),
      oracleMode,
      oracleTone,
      oracleDetail,
      oracleAge: formatAge(safeNumber(enforcement.quote_fetched_at)),
      oracleProvider: String(enforcement.quote_provider || 'n/a'),
      scannerHealth: String(systemHealth?.status || 'unknown'),
      avgReportPrice,
      avgMarketValueScore,
      avgProjectedValue,
      newestSignalTitle: newestOpportunity?.title || 'No signal yet',
      newestSignalSummary: newestOpportunity?.summary || newestOpportunity?.evidence || ''
    };
  }, [agents, tasks, earningAssets, opportunities, ledger, treasury, systemHealth]);

  const scheduler = useMemo(() => {
    const aiQuota = systemHealth?.ai_quota || {};
    const aiMode = String(systemHealth?.ai_quota_mode || aiQuota.mode || 'available');
    const nextSafeAttemptAt = safeNumber(
      systemHealth?.ai_next_safe_attempt_at || aiQuota.next_safe_attempt_at,
      0
    );
    const nextScheduledCycleAt = safeNumber(systemHealth?.next_scheduled_cycle_at, 0);
    const autonomousEnabled = policy?.autonomous_ingestion_enabled !== false;
    const backoffActive = nextSafeAttemptAt > Date.now();
    const lastRun = systemHealth?.last_run || {};
    const modelRouter =
      systemHealth?.ai_model_router ||
      systemHealth?.ai_model_router_summary ||
      systemHealth?.model_router ||
      {};

    const modelRows = Array.isArray(modelRouter.roles)
      ? modelRouter.roles.slice(0, 6)
      : [];

    return {
      aiMode,
      nextSafeAttemptAt,
      nextScheduledCycleAt,
      autonomousEnabled,
      backoffActive,
      backoffSource: String(
        systemHealth?.ai_rate_limit_backoff_source ||
          aiQuota.backoff_source ||
          'none'
      ),
      lastAiMessage: String(
        systemHealth?.ai_rate_limit_last_message ||
          aiQuota.last_message ||
          ''
      ),
      lastAiStatus: systemHealth?.ai_rate_limit_last_status || aiQuota.last_status,
      lastModel: String(aiQuota.last_model || modelRows[0]?.selected_model || 'dynamic'),
      lastContext: String(aiQuota.last_context || 'none'),
      requestsThisWindow: safeNumber(aiQuota.requests_this_window),
      tokensThisWindow: safeNumber(aiQuota.estimated_total_tokens_this_window),
      deferredReason: String(lastRun.deferred_reason || lastRun.skipped_reason || ''),
      modelRows
    };
  }, [systemHealth, policy]);

  const budgetUsagePercent = useMemo(() => {
    if (!maxSpend || maxSpend <= 0) return 0;
    return Math.min((safeNumber(dailySpend) / safeNumber(maxSpend)) * 100, 100);
  }, [dailySpend, maxSpend]);

  const handleManualScan = () => {
    fetchSystemState(true);

    toast('OWNER_INGEST_REQUEST_SENT', {
      description: scheduler.backoffActive
        ? 'AI backoff is active. The kernel will defer safely instead of burning requests.'
        : 'The autonomous scheduler remains active; this is only an owner override.',
      icon: <RefreshCw className="h-4 w-4 text-sky-400" />
    });
  };

  const lastCycleLabel =
    lastRunTriggeredAt > 0
      ? `${formatDistanceToNow(lastRunTriggeredAt)} ago`
      : 'never';

  const runTone =
    lastRunStatus === 'failed'
      ? 'red'
      : lastRunStatus === 'running'
        ? 'sky'
        : lastRunStatus === 'deferred' || lastRunStatus === 'skipped'
          ? 'amber'
          : 'emerald';

  return (
    <AppLayout container contentClassName="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
      <header className="relative flex flex-col md:flex-row md:items-center justify-between gap-6 w-full border border-slate-800/60 bg-slate-950/50 p-6 rounded-3xl overflow-hidden shadow-2xl">
        <SystemPulse />

        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.08),transparent_34%)]" />

        <div className="flex items-center gap-5 relative z-10 min-w-0">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500 to-emerald-500 flex items-center justify-center shadow-2xl shadow-sky-500/20 group shrink-0">
            <Terminal className="h-7 w-7 text-white" />
          </div>

          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-black tracking-tighter">
                ARBITRAGE <span className="text-sky-400">NEXUS</span>
              </h1>

              <Badge
                variant="outline"
                className="bg-slate-900/70 border-slate-800 text-[9px] font-mono text-slate-400 uppercase tracking-widest px-2 h-5"
              >
                authentic-signal-market
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Badge
                variant="outline"
                className={cn(
                  'px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors',
                  emergencyStop
                    ? 'bg-red-500/10 text-red-500 border-red-500/20'
                    : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                )}
              >
                <div
                  className={cn(
                    'w-1.5 h-1.5 rounded-full mr-1.5',
                    emergencyStop ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'
                  )}
                />

                {emergencyStop ? 'SYSTEM_HALTED' : 'KERNEL_ACTIVE'}
              </Badge>

              <span className="text-[10px] text-sky-400/70 font-mono flex items-center gap-1 uppercase tracking-tighter">
                <Activity className="h-3 w-3" />
                LAST_CYCLE: {lastCycleLabel}
              </span>

              <span className="text-[10px] text-emerald-400/70 font-mono flex items-center gap-1 uppercase tracking-tighter">
                <ReceiptText className="h-3 w-3" />
                VERIFIED_ONLY_REVENUE
              </span>

              <span className="text-[10px] text-violet-400/70 font-mono flex items-center gap-1 uppercase tracking-tighter">
                <BrainCircuit className="h-3 w-3" />
                MODEL_ROUTER: {scheduler.lastModel}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 relative z-10">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="bg-slate-900/80 border-slate-800 text-slate-300 font-bold text-[10px] uppercase tracking-widest h-9 hover:bg-slate-800"
          >
            <a href="/reports" target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-2" />
              Public Market
            </a>
          </Button>

          <Button
            onClick={handleManualScan}
            variant="outline"
            size="sm"
            className="bg-sky-500/10 border-sky-500/30 text-sky-400 font-bold text-[10px] uppercase tracking-widest h-9 hover:bg-sky-500/20"
            disabled={emergencyStop || lastRunStatus === 'running'}
          >
            <RefreshCw
              className={cn(
                'h-3.5 w-3.5 mr-2',
                lastRunStatus === 'running' && 'animate-spin'
              )}
            />

            {lastRunStatus === 'running' ? 'EXECUTING' : 'OWNER_INGEST'}
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <DashboardMetricCard
          tone={metrics.oracleTone}
          icon={<RadioTower className="h-5 w-5" />}
          label="POL/NOK Oracle"
          value={metrics.oracleMode}
          detail={`${metrics.oracleProvider} · ${metrics.oracleAge}`}
        />

        <DashboardMetricCard
          tone="emerald"
          icon={<Wallet className="h-5 w-5" />}
          label="Verified Revenue"
          value={formatNok(metrics.verifiedRevenue)}
          detail={`${formatNok(metrics.verifiedRevenueLastHour)} verified last hour`}
        />

        <DashboardMetricCard
          tone="violet"
          icon={<LockKeyhole className="h-5 w-5" />}
          label="Paid Reports"
          value={`${metrics.lockedReports} locked`}
          detail={`${metrics.unlockedReports} unlocked · ${metrics.reportCount} total`}
        />

        <DashboardMetricCard
          tone={runTone}
          icon={<Database className="h-5 w-5" />}
          label="Last Cycle"
          value={titleCase(lastRunStatus)}
          detail={`${lastRunSignals || 0} signals · ${metrics.opportunityCount} opportunities`}
        />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)] gap-6">
        <Card className="bg-slate-950/65 border-slate-800 shadow-xl overflow-hidden">
          <CardHeader className="p-5 border-b border-slate-800/50 bg-slate-900/10">
            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-sky-400" />
              Autonomous Signal Scheduler
            </CardTitle>
          </CardHeader>

          <CardContent className="p-5 space-y-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <DataPill
                label="Autonomous"
                value={scheduler.autonomousEnabled ? 'enabled' : 'disabled'}
                tone={scheduler.autonomousEnabled ? 'emerald' : 'red'}
              />

              <DataPill
                label="AI State"
                value={scheduler.backoffActive ? 'provider backoff' : scheduler.aiMode}
                tone={scheduler.backoffActive ? 'amber' : 'emerald'}
              />

              <DataPill
                label="Next Cycle"
                value={formatCountdown(scheduler.nextScheduledCycleAt)}
                tone="sky"
              />

              <DataPill
                label="Next AI Attempt"
                value={scheduler.backoffActive ? formatCountdown(scheduler.nextSafeAttemptAt) : 'ready'}
                tone={scheduler.backoffActive ? 'amber' : 'emerald'}
              />
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/35 p-4">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                <div className="space-y-2 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {scheduler.autonomousEnabled ? (
                      <Wifi className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <WifiOff className="h-4 w-4 text-red-400" />
                    )}

                    <p className="text-xs font-black uppercase tracking-widest text-slate-300">
                      Ingestion is automatic
                    </p>

                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[9px] font-mono uppercase',
                        scheduler.backoffActive
                          ? 'border-amber-500/25 bg-amber-500/10 text-amber-300'
                          : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                      )}
                    >
                      {scheduler.backoffActive ? scheduler.backoffSource : 'no active provider backoff'}
                    </Badge>
                  </div>

                  <p className="text-[11px] text-slate-500 font-mono leading-relaxed">
                    The owner button is only an override. Normal ingestion is handled by Cloudflare scheduled events and Durable Object alarms. During Gemini/Google provider backoff, the kernel defers AI work instead of repeatedly burning requests.
                  </p>

                  {scheduler.lastAiMessage && (
                    <p className="text-[10px] text-amber-300/80 font-mono leading-relaxed">
                      {shortText(scheduler.lastAiMessage, 240)}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 shrink-0 min-w-[240px]">
                  <DataPill label="Last AI Status" value={scheduler.lastAiStatus || 'none'} tone={scheduler.lastAiStatus ? 'amber' : 'slate'} />
                  <DataPill label="Last Context" value={scheduler.lastContext} tone="slate" />
                  <DataPill label="Window Requests" value={scheduler.requestsThisWindow} tone="sky" />
                  <DataPill label="Est. Tokens" value={scheduler.tokensThisWindow.toLocaleString('en-US')} tone="violet" />
                </div>
              </div>
            </div>

            {scheduler.modelRows.length > 0 && (
              <div className="space-y-3">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-600 flex items-center gap-2">
                  <Bot className="h-3.5 w-3.5" />
                  Dynamic model routing
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {scheduler.modelRows.map((row: any) => (
                    <div
                      key={`${row.role}-${row.selected_model}`}
                      className="rounded-xl border border-slate-800 bg-slate-900/35 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[10px] font-black uppercase text-slate-400">
                          {row.role}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[8px] font-mono border-slate-700 bg-slate-950 text-slate-400"
                        >
                          rank {safeNumber(row.fallback_rank)}
                        </Badge>
                      </div>

                      <p className="mt-1 text-[11px] font-mono font-black text-sky-300 truncate">
                        {row.selected_model}
                      </p>

                      <p className="mt-1 text-[9px] font-mono text-slate-600 truncate">
                        {row.reason}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-950/65 border-slate-800 shadow-xl overflow-hidden">
          <CardHeader className="p-5 border-b border-slate-800/50 bg-slate-900/10">
            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
              Latest Signal Brief
            </CardTitle>
          </CardHeader>

          <CardContent className="p-5 space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/35 p-4">
              <p className="text-xs font-black text-slate-100 leading-relaxed">
                {cleanText(metrics.newestSignalTitle)}
              </p>

              <p className="text-[11px] text-slate-500 font-mono leading-relaxed mt-3">
                {shortText(metrics.newestSignalSummary || 'Waiting for the next autonomous signal.', 320)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <DataPill
                label="Avg Report Price"
                value={formatCompactNok(metrics.avgReportPrice)}
                tone="amber"
              />

              <DataPill
                label="Avg Market Value"
                value={formatUsd(metrics.avgProjectedValue)}
                tone="emerald"
              />

              <DataPill
                label="Avg Score"
                value={metrics.avgMarketValueScore.toFixed(2)}
                tone="sky"
              />

              <DataPill
                label="Reports"
                value={metrics.reportCount}
                tone="violet"
              />
            </div>

            <Button
              asChild
              variant="outline"
              className="w-full border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800"
            >
              <Link to="/vault">
                <FileJson className="h-4 w-4 mr-2" />
                Open Opportunity Vault
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <div className="space-y-12">
        <section className="animate-in fade-in slide-in-from-top-4 duration-700">
          <TreasuryOverview />
        </section>

        <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_560px] gap-8 w-full">
          <div className="min-w-0 space-y-8">
            <section className="animate-in fade-in slide-in-from-left-4 duration-700">
              <OpportunityFeed pageSize={5} />
            </section>

            <section className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 rounded-md bg-emerald-500/10">
                    <Cpu className="h-4 w-4 text-emerald-400" />
                  </div>

                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">
                    FLEET_TELEMETRY
                  </h2>
                </div>

                <Link
                  to="/agents"
                  className="text-[10px] font-bold text-sky-400 hover:underline uppercase tracking-tighter"
                >
                  FULL_METRICS_LOG
                </Link>
              </div>

              <AgentStatus />
            </section>
          </div>

          <div className="min-w-0 space-y-8">
            <KernelLogViewer logs={kernelLogs} height={560} />

            <Card className="bg-slate-950/60 border-slate-800 shadow-xl overflow-hidden">
              <CardHeader className="p-4 border-b border-slate-800/50 bg-slate-900/10">
                <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 text-sky-400" />
                  OBSERVABILITY_PANEL
                </CardTitle>
              </CardHeader>

              <CardContent className="p-5 space-y-4">
                {(lastRunStatus === 'failed' || lastRunStatus === 'deferred') && (
                  <div
                    className={cn(
                      'mb-4 p-3 rounded-lg border',
                      lastRunStatus === 'failed'
                        ? 'bg-red-500/10 border-red-500/40'
                        : 'bg-amber-500/10 border-amber-500/40'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <AlertCircle
                        className={cn(
                          'h-3.5 w-3.5',
                          lastRunStatus === 'failed' ? 'text-red-500' : 'text-amber-500'
                        )}
                      />
                      <span
                        className={cn(
                          'text-[10px] font-black uppercase tracking-widest',
                          lastRunStatus === 'failed' ? 'text-red-500' : 'text-amber-500'
                        )}
                      >
                        {lastRunStatus === 'failed' ? 'EXCEPTION_THROWN' : 'EXECUTION_DEFERRED'}
                      </span>
                    </div>

                    <p
                      className={cn(
                        'text-[10px] font-mono leading-relaxed italic',
                        lastRunStatus === 'failed' ? 'text-red-400/80' : 'text-amber-300/80'
                      )}
                    >
                      {lastRunError || scheduler.deferredReason || 'No provider-safe execution slot is available yet.'}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[9px] text-slate-600 font-bold uppercase">Run State</p>

                    <p
                      className={cn(
                        'text-xs font-mono font-black uppercase',
                        lastRunStatus === 'running'
                          ? 'text-sky-400 animate-pulse'
                          : lastRunStatus === 'success'
                            ? 'text-emerald-500'
                            : lastRunStatus === 'failed'
                              ? 'text-red-500'
                              : lastRunStatus === 'deferred'
                                ? 'text-amber-400'
                                : 'text-slate-400'
                      )}
                    >
                      {lastRunStatus}
                    </p>
                  </div>

                  <div className="space-y-1 text-right">
                    <p className="text-[9px] text-slate-600 font-bold uppercase">
                      Signals Detected
                    </p>

                    <p className="text-xs font-mono font-black text-slate-200">
                      {lastRunSignals}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[9px] text-slate-600 font-bold uppercase">
                      Active Agents
                    </p>

                    <p className="text-xs font-mono font-black text-slate-200">
                      {metrics.activeAgentCount} / {metrics.totalAgentCount}
                    </p>
                  </div>

                  <div className="space-y-1 text-right">
                    <p className="text-[9px] text-slate-600 font-bold uppercase">
                      Task Success
                    </p>

                    <p className="text-xs font-mono font-black text-emerald-400">
                      {formatPercent(metrics.taskSuccessRate, 1)}
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5 border-t border-slate-800/50 pt-4">
                  <p className="text-[9px] text-slate-600 font-bold uppercase flex items-center gap-1.5">
                    <Globe className="h-2.5 w-2.5" /> ACTIVE_NODES
                  </p>

                  <div className="flex flex-wrap gap-1.5">
                    {lastRunSources && lastRunSources.length > 0 ? (
                      lastRunSources.map((source) => (
                        <Badge
                          key={source}
                          variant="outline"
                          className="text-[9px] bg-slate-900 border-slate-800 text-slate-500 font-mono py-0"
                        >
                          {source}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-[9px] text-slate-700 font-mono italic">
                        POLLING...
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-950/60 border-slate-800 shadow-xl overflow-hidden">
              <CardHeader className="p-4 border-b border-slate-800/50 bg-slate-900/10">
                <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                  <RadioTower className="h-3.5 w-3.5 text-emerald-400" />
                  PAYMENT_ORACLE
                </CardTitle>
              </CardHeader>

              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[9px] text-slate-600 font-bold uppercase">
                      Quote Mode
                    </p>

                    <p
                      className={cn(
                        'text-sm font-mono font-black uppercase mt-1',
                        metrics.oracleTone === 'emerald'
                          ? 'text-emerald-400'
                          : metrics.oracleTone === 'amber'
                            ? 'text-amber-400'
                            : metrics.oracleTone === 'red'
                              ? 'text-red-400'
                              : 'text-sky-400'
                      )}
                    >
                      {metrics.oracleMode}
                    </p>
                  </div>

                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[9px] font-mono uppercase',
                      metrics.oracleTone === 'emerald'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        : metrics.oracleTone === 'amber'
                          ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                          : metrics.oracleTone === 'red'
                            ? 'border-red-500/30 bg-red-500/10 text-red-300'
                            : 'border-sky-500/30 bg-sky-500/10 text-sky-300'
                    )}
                  >
                    {metrics.oracleProvider}
                  </Badge>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                  <p className="text-[10px] text-slate-400 font-mono leading-relaxed">
                    {metrics.oracleDetail}
                  </p>

                  <p className="text-[9px] text-slate-600 font-mono mt-2">
                    Updated {metrics.oracleAge}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="p-3 bg-slate-900/40 border border-slate-800 rounded-xl">
                    <p className="text-[9px] text-slate-600 font-bold uppercase">Avg Price</p>
                    <p className="text-xs font-mono font-black text-slate-200 mt-1">
                      {formatCompactNok(metrics.avgReportPrice)}
                    </p>
                  </div>

                  <div className="p-3 bg-slate-900/40 border border-slate-800 rounded-xl">
                    <p className="text-[9px] text-slate-600 font-bold uppercase">Avg Score</p>
                    <p className="text-xs font-mono font-black text-slate-200 mt-1">
                      {metrics.avgMarketValueScore.toFixed(2)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-950/60 border-slate-800 shadow-xl overflow-hidden">
              <CardHeader className="p-4 border-b border-slate-800/50 bg-slate-900/10">
                <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                  <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
                  GOVERNOR_POLICY
                </CardTitle>
              </CardHeader>

              <CardContent className="p-5 space-y-5">
                <div className="space-y-3">
                  <div className="flex justify-between items-end">
                    <span className="text-[9px] text-slate-600 uppercase font-bold tracking-wider flex items-center gap-1">
                      <Gauge className="h-2.5 w-2.5" /> Risk Sensitivity
                    </span>

                    <span className="text-xs font-mono font-bold text-slate-300">
                      {formatPercent((maxRiskScore ?? 0) * 100)}
                    </span>
                  </div>

                  <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                    <Progress value={(maxRiskScore ?? 0) * 100} className="h-full" />
                  </div>

                  <div className="pt-2 flex justify-between items-center text-[9px] font-bold text-slate-600 uppercase">
                    <span>Reserve Floor: {formatCompactNok(reserveFloor ?? 0)}</span>

                    <span className="text-emerald-500 flex items-center gap-1">
                      <ShieldCheck className="h-2.5 w-2.5" />
                      ZERO-CAPITAL SAFE
                    </span>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-800/50">
                  <div className="flex justify-between items-end gap-3">
                    <span className="text-[9px] text-slate-600 uppercase font-bold tracking-wider flex items-center gap-1">
                      <BarChart3 className="h-2.5 w-2.5" /> CAPITAL_SPEND
                    </span>

                    <span className="text-xs font-mono font-bold text-slate-300">
                      {formatCompactNok(dailySpend ?? 0)} / {formatCompactNok(maxSpend ?? 0)}
                    </span>
                  </div>

                  <Progress value={budgetUsagePercent} className="h-1 bg-slate-800" />

                  <p className="text-[10px] text-slate-600 font-mono">
                    Free ingestion is not blocked by treasury balance. Spend limits only apply to nonzero required capital.
                  </p>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-800/50">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] text-slate-600 uppercase font-bold tracking-wider flex items-center gap-1">
                      <Coins className="h-2.5 w-2.5" /> Treasury Split
                    </span>

                    <span className="text-[9px] font-mono font-black text-emerald-400 uppercase">
                      editable
                    </span>
                  </div>

                  <p className="text-[10px] text-slate-500 font-mono leading-relaxed">
                    Verified crypto deposits distribute by governor treasury percentages. Projected profit never credits treasury.
                  </p>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-800/50">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] text-slate-600 uppercase font-bold tracking-wider flex items-center gap-1">
                      <TimerReset className="h-2.5 w-2.5" /> Provider Backoff
                    </span>

                    <span
                      className={cn(
                        'text-[9px] font-mono font-black uppercase',
                        scheduler.backoffActive ? 'text-amber-400' : 'text-emerald-400'
                      )}
                    >
                      {scheduler.backoffActive ? formatCountdown(scheduler.nextSafeAttemptAt) : 'clear'}
                    </span>
                  </div>

                  <p className="text-[10px] text-slate-500 font-mono leading-relaxed">
                    Backoff is derived from provider error metadata or quota reset behavior, then exposed in kernel telemetry.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export default HomePage;