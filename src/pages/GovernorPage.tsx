import React, { useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ReinvestmentPanel } from '@/components/ReinvestmentPanel';
import {
  useEmergencyStop,
  useMaxRiskScore,
  useReserveFloor,
  useMaxSpendPerDay,
  useSystemStatusLabel,
  useLastScanTime,
  useTradingEnabled,
  useSystemIssues,
  usePolicyAuditLogs,
  useAgentsList,
  useStore
} from '@/lib/store';
import { cn } from '@/lib/utils';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ShieldAlert,
  AlertTriangle,
  Zap,
  Activity,
  ShieldCheck,
  Coins,
  Info,
  History,
  Activity as PulseIcon,
  HeartCrack,
  Lock,
  Wallet,
  RadioTower,
  Gauge,
  Database,
  ReceiptText,
  Ban,
  CheckCircle2,
  BrainCircuit,
  Bot,
  TimerReset,
  Route,
  ServerCog,
  Power,
  Cpu,
  Orbit,
  SlidersHorizontal
} from 'lucide-react';
import { toast } from 'sonner';

const ACTIVE_AGENT_STATUSES = new Set([
  'scanning',
  'analyzing',
  'routing',
  'executing',
  'running',
  'processing'
]);

const FAILED_TASK_STATUSES = new Set(['failed', 'error', 'crashed']);
const COMPLETED_TASK_STATUSES = new Set(['completed']);

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeStatus(value: unknown): string {
  return String(value || 'idle').toLowerCase();
}

function formatNok(value: unknown): string {
  return `${safeNumber(value).toLocaleString('nb-NO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} kr`;
}

function formatCompact(value: unknown): string {
  return safeNumber(value).toLocaleString('en-US', {
    maximumFractionDigits: 0
  });
}

function formatPercent(value: unknown): string {
  return `${safeNumber(value).toFixed(0)}%`;
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

function safeDate(value: unknown): string {
  const ts = safeNumber(value, 0);
  return ts > 0 ? new Date(ts).toLocaleString() : 'not scheduled';
}

function titleCase(value: unknown): string {
  return String(value || 'unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function getToneForAiMode(mode: string): 'emerald' | 'amber' | 'sky' | 'red' | 'violet' {
  const normalized = mode.toLowerCase();

  if (normalized.includes('daily') || normalized.includes('exhausted')) return 'red';
  if (normalized.includes('backoff') || normalized.includes('rate')) return 'amber';
  if (normalized.includes('pacing')) return 'sky';
  if (normalized.includes('disabled')) return 'red';
  return 'emerald';
}

function PolicyStatCard(props: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  detail: React.ReactNode;
  tone: 'emerald' | 'amber' | 'sky' | 'red' | 'violet';
}) {
  const toneClass = {
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    sky: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
    violet: 'bg-violet-500/10 text-violet-400 border-violet-500/20'
  }[props.tone];

  return (
    <Card className="bg-slate-950/60 border-slate-800 shadow-xl overflow-hidden relative group">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-400/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

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

function PolicySlider(props: {
  label: string;
  description: string;
  value: number;
  min?: number;
  max: number;
  step: number;
  display: React.ReactNode;
  tone?: 'sky' | 'emerald' | 'amber' | 'violet';
  onCommit: (value: number) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center gap-6">
        <div className="space-y-0.5">
          <label className="text-xs font-black text-slate-300 uppercase tracking-widest">
            {props.label}
          </label>
          <p className="text-[10px] text-slate-500 font-mono">{props.description}</p>
        </div>

        <span
          className={cn(
            'text-xl font-mono font-black',
            props.tone === 'emerald' && 'text-emerald-400',
            props.tone === 'amber' && 'text-amber-400',
            props.tone === 'violet' && 'text-violet-400',
            (!props.tone || props.tone === 'sky') && 'text-sky-400'
          )}
        >
          {props.display}
        </span>
      </div>

      <Slider
        value={[props.value]}
        min={props.min ?? 0}
        max={props.max}
        step={props.step}
        onValueCommit={([val]) => props.onCommit(val)}
        className="py-4"
      />
    </div>
  );
}

export function GovernorPage() {
  const emergency_stop = useEmergencyStop();
  const max_risk_score = useMaxRiskScore();
  const reserve_floor = useReserveFloor();
  const max_spend_per_day = useMaxSpendPerDay();
  const systemStatus = useSystemStatusLabel();
  const lastScanTime = useLastScanTime();
  const tradingEnabled = useTradingEnabled();
  const systemIssues = useSystemIssues();
  const auditLogs = usePolicyAuditLogs();
  const agents = useAgentsList();

  const persistPolicy = useStore(s => s.persistPolicy);
  const tasks = useStore(s => s.tasks || []);
  const ledger = useStore(s => s.ledger || []);
  const earningAssets = useStore(s => s.earning_assets || []);
  const treasury = useStore(s => s.treasury);
  const systemHealth = useStore(s => s.system_health);
  const dailySpend = useStore(s => s.daily_spend || 0);
  const policy = useStore(s => s.policy || {});

  const metrics = useMemo(() => {
    const agentList = Array.isArray(agents) ? agents : [];
    const taskList = Array.isArray(tasks) ? tasks : [];
    const assetList = Array.isArray(earningAssets) ? earningAssets : [];
    const ledgerEntries = Array.isArray(ledger) ? ledger : [];

    const activeAgents = agentList.filter(agent =>
      ACTIVE_AGENT_STATUSES.has(normalizeStatus((agent as any).status))
    );

    const terminalTasks = taskList.filter(task => {
      const status = normalizeStatus((task as any).status);
      return COMPLETED_TASK_STATUSES.has(status) || FAILED_TASK_STATUSES.has(status);
    });

    const completedTasks = terminalTasks.filter(task =>
      COMPLETED_TASK_STATUSES.has(normalizeStatus((task as any).status))
    );

    const failedTasks = terminalTasks.filter(task =>
      FAILED_TASK_STATUSES.has(normalizeStatus((task as any).status))
    );

    const successRate =
      terminalTasks.length > 0
        ? (completedTasks.length / terminalTasks.length) * 100
        : 0;

    const lockedReports = assetList.filter(asset =>
      normalizeStatus((asset as any).unlock_status || 'locked') !== 'unlocked'
    ).length;

    const unlockedReports = assetList.filter(asset =>
      normalizeStatus((asset as any).unlock_status) === 'unlocked'
    ).length;

    const verifiedRevenueFromLedger = ledgerEntries
      .filter(entry => String((entry as any).type) === 'credit')
      .reduce((sum, entry) => sum + safeNumber((entry as any).amount), 0);

    const verifiedRevenueFromAssets = assetList.reduce(
      (sum, asset) => sum + safeNumber((asset as any).verified_revenue_nok),
      0
    );

    const newestAsset = [...assetList].sort((a, b) =>
      safeNumber((b as any).created_at || (b as any).updated_at) -
      safeNumber((a as any).created_at || (a as any).updated_at)
    )[0] as any;

    const enforcement = newestAsset?.payment_enforcement || {};
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

    const oracleDetail = oracleEnabled
      ? `${safeNumber(enforcement.native_price_nok).toFixed(6)} NOK/POL · ${newestAsset?.price_crypto_estimate || 'n/a'}`
      : String(enforcement.reason || 'quote unavailable');

    const lastRunStatus = normalizeStatus(systemHealth?.last_run?.status);
    const lastRunAge = formatAge(
      safeNumber(systemHealth?.last_run?.completedAt) ||
      safeNumber(systemHealth?.last_run?.triggeredAt) ||
      safeNumber(lastScanTime)
    );

    const aiQuota = (systemHealth as any)?.ai_quota || {};
    const aiMode = String((systemHealth as any)?.ai_quota_mode || aiQuota.mode || 'available');
    const nextSafeAttempt =
      safeNumber((systemHealth as any)?.ai_next_safe_attempt_at) ||
      safeNumber(aiQuota.next_safe_attempt_at) ||
      safeNumber(aiQuota.rate_limited_until) ||
      safeNumber(aiQuota.daily_quota_exhausted_until);

    return {
      activeAgents,
      activeAgentCount: activeAgents.length,
      totalAgents: agentList.length,
      terminalTaskCount: terminalTasks.length,
      completedTaskCount: completedTasks.length,
      failedTaskCount: failedTasks.length,
      successRate,
      lockedReports,
      unlockedReports,
      verifiedRevenue: verifiedRevenueFromAssets || verifiedRevenueFromLedger || safeNumber(treasury?.total),
      operatingTreasury: safeNumber(treasury?.operating),
      ownerWithdrawable: safeNumber(treasury?.owner_withdrawable),
      oracleEnabled,
      oracleFallback,
      oracleStale,
      oracleMode,
      oracleDetail,
      oracleAge: formatAge(safeNumber(enforcement.quote_fetched_at)),
      lastRunStatus,
      lastRunAge,
      lastRunSignals: safeNumber(systemHealth?.last_run?.signalsCreated),
      lastRunError: String(systemHealth?.last_run?.error || ''),
      aiMode,
      aiTone: getToneForAiMode(aiMode),
      aiNextSafeAttempt: nextSafeAttempt,
      aiBackoffSource: String((systemHealth as any)?.ai_rate_limit_backoff_source || aiQuota.backoff_source || 'none'),
      aiLastModel: String(aiQuota.last_model || 'not recorded'),
      aiLastContext: String(aiQuota.last_context || 'not recorded'),
      aiRequestsThisWindow: safeNumber(aiQuota.requests_this_window),
      aiTokensThisWindow: safeNumber(aiQuota.estimated_total_tokens_this_window),
      nextScheduledCycle: safeNumber((systemHealth as any)?.next_scheduled_cycle_at),
      routerSummary: (systemHealth as any)?.ai_model_router_summary
    };
  }, [agents, tasks, earningAssets, ledger, treasury, systemHealth, lastScanTime]);

  const failingAgents =
    agents?.filter(a => normalizeStatus(a.status) === 'error' || safeNumber(a.health, 100) < 60) ?? [];

  const kernelActive = !emergency_stop;
  const policySpendRemaining = Math.max(0, safeNumber(max_spend_per_day) - safeNumber(dailySpend));
  const reserveCoverage = safeNumber(reserve_floor) > 0
    ? Math.min(100, (safeNumber(treasury?.reserve) / safeNumber(reserve_floor)) * 100)
    : 100;

  const productionMode = String((policy as any).production_mode || 'stability');
  const autonomousEnabled = (policy as any).autonomous_ingestion_enabled !== false;
  const maxAiRequests = safeNumber((policy as any).max_ai_requests_per_cycle, 1);
  const maxAiTokens = safeNumber((policy as any).max_ai_tokens_per_cycle, 12000);
  const minCycleMinutes = safeNumber((policy as any).min_minutes_between_ai_cycles, 10);
  const maxReportsPerDay = safeNumber((policy as any).max_reports_per_day, 24);
  const maxSourcesPerCycle = safeNumber((policy as any).max_sources_per_cycle, 3);
  const maxSignalsPerCycle = safeNumber((policy as any).max_signals_analyzed_per_cycle, 1);
  const maxExecPerCycle = safeNumber((policy as any).max_opportunities_executed_per_cycle, 1);

  const handleToggleEmergency = async (checked: boolean) => {
    try {
      await persistPolicy({ emergency_stop: checked });

      if (checked) {
        toast.error('EMERGENCY KILL-SWITCH ACTIVATED', {
          description: 'All autonomous operations suspended immediately.',
          duration: 0
        });
      } else {
        toast.success('SYSTEM RESTORED', {
          description: 'Autonomous cycle resuming under existing policy.'
        });
      }
    } catch {
      toast.error('POLICY_UPDATE_FAILED');
    }
  };

  const handleToggleTrading = async (checked: boolean) => {
    try {
      await persistPolicy({ trading_enabled: checked });

      toast.info(`Trading Agent ${checked ? 'Enabled' : 'Disabled'}`, {
        description: checked
          ? 'Trading route authorization enabled. Governor policy still applies.'
          : 'All trading strategies halted by policy.'
      });
    } catch {
      toast.error('TRADING_UPDATE_FAILED');
    }
  };

  const handleToggleAutonomous = async (checked: boolean) => {
    try {
      await persistPolicy({ autonomous_ingestion_enabled: checked });

      toast.info(`Autonomous ingestion ${checked ? 'enabled' : 'paused'}`, {
        description: checked
          ? 'Scheduled cycles can run when pacing and quota allow.'
          : 'Scheduled cycles are paused. Manual ingest can still be triggered by owner routes.'
      });
    } catch {
      toast.error('AUTONOMOUS_POLICY_UPDATE_FAILED');
    }
  };

  const handlePolicyUpdate = async (patch: Record<string, unknown>) => {
    try {
      await persistPolicy(patch);
      toast.success('Policy updated');
    } catch {
      toast.error('POLICY_UPDATE_FAILED');
    }
  };

  return (
    <AppLayout container contentClassName="space-y-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header className="relative overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-950/65 p-6 shadow-2xl">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.13),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.10),transparent_35%)]" />

        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-amber-500 to-red-500 flex items-center justify-center shadow-2xl shadow-amber-500/20">
                <ShieldAlert className="h-7 w-7 text-white" />
              </div>

              <div>
                <h1 className="text-4xl font-black tracking-tighter">
                  GOVERNOR <span className="text-slate-500">POLICY ENGINE</span>
                </h1>

                <p className="text-slate-400 font-mono text-xs uppercase tracking-widest flex items-center gap-2 mt-1">
                  <ShieldCheck className="h-3 w-3 text-emerald-500" />
                  Deterministic Controls · Verified Revenue Only · Dynamic Free-Model Routing
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  'font-mono text-[9px] uppercase tracking-widest',
                  emergency_stop
                    ? 'bg-red-500/10 border-red-500/20 text-red-300'
                    : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                )}
              >
                {emergency_stop ? 'kernel_halted' : 'kernel_active'}
              </Badge>

              <Badge
                variant="outline"
                className="bg-slate-900/80 border-slate-800 text-slate-400 font-mono text-[9px] uppercase tracking-widest"
              >
                mode: {productionMode}
              </Badge>

              <Badge
                variant="outline"
                className={cn(
                  'font-mono text-[9px] uppercase tracking-widest',
                  autonomousEnabled
                    ? 'bg-sky-500/10 border-sky-500/20 text-sky-300'
                    : 'bg-slate-800 border-slate-700 text-slate-500'
                )}
              >
                autonomous: {autonomousEnabled ? 'enabled' : 'paused'}
              </Badge>

              <Badge
                variant="outline"
                className={cn(
                  'font-mono text-[9px] uppercase tracking-widest',
                  metrics.aiTone === 'emerald' && 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300',
                  metrics.aiTone === 'amber' && 'bg-amber-500/10 border-amber-500/20 text-amber-300',
                  metrics.aiTone === 'sky' && 'bg-sky-500/10 border-sky-500/20 text-sky-300',
                  metrics.aiTone === 'red' && 'bg-red-500/10 border-red-500/20 text-red-300',
                  metrics.aiTone === 'violet' && 'bg-violet-500/10 border-violet-500/20 text-violet-300'
                )}
              >
                ai: {metrics.aiMode}
              </Badge>
            </div>
          </div>

          <div
            className={cn(
              'px-6 py-3 rounded-2xl border-2 flex items-center gap-4 shadow-lg transition-all',
              emergency_stop
                ? 'bg-red-500/10 border-red-500/50 text-red-500'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
            )}
          >
            <div
              className={cn(
                'w-3 h-3 rounded-full',
                emergency_stop ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'
              )}
            />

            <span className="text-sm font-black uppercase tracking-widest">
              {emergency_stop ? 'KERNEL_HALTED' : 'KERNEL_ACTIVE'}
            </span>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <PolicyStatCard
          tone={kernelActive ? 'emerald' : 'red'}
          icon={kernelActive ? <CheckCircle2 className="h-5 w-5" /> : <Ban className="h-5 w-5" />}
          label="Kernel State"
          value={kernelActive ? 'Active' : 'Halted'}
          detail={`System status: ${systemStatus || 'unknown'}`}
        />

        <PolicyStatCard
          tone={metrics.oracleEnabled && !metrics.oracleFallback ? 'sky' : metrics.oracleEnabled ? 'amber' : 'red'}
          icon={<RadioTower className="h-5 w-5" />}
          label="POL/NOK Oracle"
          value={metrics.oracleMode}
          detail={`${metrics.oracleDetail} · ${metrics.oracleAge}`}
        />

        <PolicyStatCard
          tone="emerald"
          icon={<Wallet className="h-5 w-5" />}
          label="Verified Treasury"
          value={formatNok(metrics.verifiedRevenue)}
          detail={`Operating ${formatNok(metrics.operatingTreasury)} · Withdrawable ${formatNok(metrics.ownerWithdrawable)}`}
        />

        <PolicyStatCard
          tone={metrics.aiTone}
          icon={<BrainCircuit className="h-5 w-5" />}
          label="AI Router State"
          value={titleCase(metrics.aiMode)}
          detail={`Last model: ${metrics.aiLastModel}`}
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full">
        <div className="lg:col-span-8 space-y-8">
          <Card className="bg-slate-950/60 border-slate-800 shadow-2xl overflow-hidden border-t-2 border-t-sky-500/30">
            <CardHeader className="p-6 border-b border-slate-800/50 bg-slate-900/20">
              <CardTitle className="text-sm font-black uppercase tracking-[0.2em] text-slate-200 flex items-center gap-3">
                <Activity className="h-4 w-4 text-sky-400" />
                Risk & Reserve Sensitivity
              </CardTitle>
            </CardHeader>

            <CardContent className="p-8 space-y-10">
              <PolicySlider
                label="Max Risk Threshold"
                description="ROUTER_DISCARD_LIMIT · rejects opportunities above this score"
                value={safeNumber(max_risk_score) * 100}
                max={100}
                step={1}
                display={formatPercent(safeNumber(max_risk_score) * 100)}
                tone="sky"
                onCommit={(val) => handlePolicyUpdate({ max_risk_score: val / 100 })}
              />

              <div className="border-t border-slate-800/50 pt-10">
                <PolicySlider
                  label="Reserve Floor"
                  description={`MIN_CAPITAL_QUORUM · current coverage ${formatPercent(reserveCoverage)}`}
                  value={safeNumber(reserve_floor)}
                  max={10000}
                  step={100}
                  display={formatNok(reserve_floor)}
                  tone="emerald"
                  onCommit={(val) => handlePolicyUpdate({ reserve_floor: val })}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-950/60 border-slate-800 shadow-2xl overflow-hidden border-t-2 border-t-amber-500/30">
            <CardHeader className="p-6 border-b border-slate-800/50 bg-slate-900/20 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-black uppercase tracking-[0.2em] text-slate-200 flex items-center gap-3">
                <Zap className="h-4 w-4 text-amber-500" />
                Execution Constraints
              </CardTitle>

              <Badge
                variant="outline"
                className="text-[10px] font-mono border-amber-500/30 text-amber-300 bg-amber-500/10"
              >
                {formatNok(policySpendRemaining)} remaining today
              </Badge>
            </CardHeader>

            <CardContent className="p-8 space-y-10">
              <PolicySlider
                label="Daily Spend Cap"
                description={`AUTONOMOUS_BURN_LIMIT · current spend ${formatNok(dailySpend)}`}
                value={safeNumber(max_spend_per_day)}
                max={5000}
                step={50}
                display={formatNok(max_spend_per_day)}
                tone="amber"
                onCommit={(val) => handlePolicyUpdate({ max_spend_per_day: val })}
              />

              <div className="pt-8 border-t border-slate-800/50 grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="flex items-center justify-between gap-6 p-4 rounded-2xl bg-slate-950/70 border border-slate-800">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-amber-500/10">
                        <Coins className="h-4 w-4 text-amber-500" />
                      </div>

                      <span className="text-sm font-black text-slate-100 uppercase tracking-tight">
                        Trading Agent
                      </span>
                    </div>

                    <p className="text-[10px] text-slate-500 font-mono italic">
                      Route authorization only. Risk and spend gates still apply.
                    </p>
                  </div>

                  <Switch
                    checked={Boolean(tradingEnabled)}
                    onCheckedChange={handleToggleTrading}
                    className="data-[state=checked]:bg-emerald-600"
                  />
                </div>

                <div className="flex items-center justify-between gap-6 p-4 rounded-2xl bg-slate-950/70 border border-slate-800">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-sky-500/10">
                        <Orbit className="h-4 w-4 text-sky-400" />
                      </div>

                      <span className="text-sm font-black text-slate-100 uppercase tracking-tight">
                        Autonomous Ingestion
                      </span>
                    </div>

                    <p className="text-[10px] text-slate-500 font-mono italic">
                      Allows scheduled cycles when AI pacing and quota permit.
                    </p>
                  </div>

                  <Switch
                    checked={Boolean(autonomousEnabled)}
                    onCheckedChange={handleToggleAutonomous}
                    className="data-[state=checked]:bg-sky-600"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-950/60 border-slate-800 shadow-2xl overflow-hidden border-t-2 border-t-violet-500/30">
            <CardHeader className="p-6 border-b border-slate-800/50 bg-slate-900/20">
              <CardTitle className="text-sm font-black uppercase tracking-[0.2em] text-slate-200 flex items-center gap-3">
                <BrainCircuit className="h-4 w-4 text-violet-400" />
                AI Model Router & Quota Pacing
              </CardTitle>
            </CardHeader>

            <CardContent className="p-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-600 flex items-center gap-1.5">
                    <Route className="h-3 w-3" />
                    Last Model
                  </p>
                  <p className="text-sm font-mono font-black text-violet-300 mt-1 truncate">
                    {metrics.aiLastModel}
                  </p>
                  <p className="text-[10px] text-slate-600 font-mono mt-1">
                    context: {metrics.aiLastContext}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-600 flex items-center gap-1.5">
                    <TimerReset className="h-3 w-3" />
                    Next Safe AI Attempt
                  </p>
                  <p className="text-sm font-mono font-black text-sky-300 mt-1">
                    {safeDate(metrics.aiNextSafeAttempt)}
                  </p>
                  <p className="text-[10px] text-slate-600 font-mono mt-1">
                    source: {metrics.aiBackoffSource}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-600 flex items-center gap-1.5">
                    <Cpu className="h-3 w-3" />
                    Window Usage
                  </p>
                  <p className="text-sm font-mono font-black text-emerald-300 mt-1">
                    {formatCompact(metrics.aiRequestsThisWindow)} req · {formatCompact(metrics.aiTokensThisWindow)} tok
                  </p>
                  <p className="text-[10px] text-slate-600 font-mono mt-1">
                    local telemetry estimate
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-slate-800/50 pt-8">
                <div className="space-y-8">
                  <PolicySlider
                    label="AI Requests Per Cycle"
                    description="Hard cap for AI-producing operations in each autonomous cycle"
                    value={maxAiRequests}
                    min={1}
                    max={10}
                    step={1}
                    display={formatCompact(maxAiRequests)}
                    tone="violet"
                    onCommit={(val) => handlePolicyUpdate({ max_ai_requests_per_cycle: Math.floor(val) })}
                  />

                  <PolicySlider
                    label="Minimum Minutes Between AI Cycles"
                    description="Pacing guard to avoid burning free-tier request-per-day limits"
                    value={minCycleMinutes}
                    min={1}
                    max={120}
                    step={1}
                    display={`${formatCompact(minCycleMinutes)}m`}
                    tone="sky"
                    onCommit={(val) => handlePolicyUpdate({ min_minutes_between_ai_cycles: Math.floor(val) })}
                  />
                </div>

                <div className="space-y-8">
                  <PolicySlider
                    label="AI Token Budget Per Cycle"
                    description="Local estimate cap used for pacing and observability"
                    value={maxAiTokens}
                    min={1000}
                    max={100000}
                    step={1000}
                    display={formatCompact(maxAiTokens)}
                    tone="violet"
                    onCommit={(val) => handlePolicyUpdate({ max_ai_tokens_per_cycle: Math.floor(val) })}
                  />

                  <PolicySlider
                    label="Max Reports Per Day"
                    description="Prevents runaway report generation when high-RPD fallback models are active"
                    value={maxReportsPerDay}
                    min={1}
                    max={100}
                    step={1}
                    display={formatCompact(maxReportsPerDay)}
                    tone="emerald"
                    onCommit={(val) => handlePolicyUpdate({ max_reports_per_day: Math.floor(val) })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-950/60 border-slate-800 shadow-2xl overflow-hidden border-t-2 border-t-emerald-500/30">
            <CardHeader className="p-6 border-b border-slate-800/50 bg-slate-900/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <CardTitle className="text-sm font-black uppercase tracking-[0.2em] text-slate-200 flex items-center gap-3">
                <SlidersHorizontal className="h-4 w-4 text-emerald-400" />
                Production Mode & Cycle Limits
              </CardTitle>

              <select
                value={productionMode}
                onChange={(event) => handlePolicyUpdate({ production_mode: event.target.value })}
                className="h-10 rounded-xl border border-slate-800 bg-slate-950 px-3 text-xs font-mono uppercase text-slate-300 outline-none"
              >
                <option value="stability">stability</option>
                <option value="balanced">balanced</option>
                <option value="growth">growth</option>
              </select>
            </CardHeader>

            <CardContent className="p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
              <PolicySlider
                label="Sources Per Cycle"
                description="Scout breadth before ranking"
                value={maxSourcesPerCycle}
                min={1}
                max={10}
                step={1}
                display={formatCompact(maxSourcesPerCycle)}
                tone="sky"
                onCommit={(val) => handlePolicyUpdate({ max_sources_per_cycle: Math.floor(val) })}
              />

              <PolicySlider
                label="Signals Analyzed"
                description="AI analyst reviews per cycle"
                value={maxSignalsPerCycle}
                min={1}
                max={10}
                step={1}
                display={formatCompact(maxSignalsPerCycle)}
                tone="violet"
                onCommit={(val) => handlePolicyUpdate({ max_signals_analyzed_per_cycle: Math.floor(val) })}
              />

              <PolicySlider
                label="Opportunities Executed"
                description="Router execution fan-out per cycle"
                value={maxExecPerCycle}
                min={1}
                max={10}
                step={1}
                display={formatCompact(maxExecPerCycle)}
                tone="emerald"
                onCommit={(val) => handlePolicyUpdate({ max_opportunities_executed_per_cycle: Math.floor(val) })}
              />
            </CardContent>
          </Card>

          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <PolicyStatCard
              tone={metrics.lastRunStatus === 'failed' ? 'red' : 'sky'}
              icon={<Database className="h-5 w-5" />}
              label="Last Cycle"
              value={titleCase(metrics.lastRunStatus)}
              detail={`${metrics.lastRunSignals} signals · ${metrics.lastRunAge}`}
            />

            <PolicyStatCard
              tone="emerald"
              icon={<Gauge className="h-5 w-5" />}
              label="Task Success"
              value={formatPercent(metrics.successRate)}
              detail={`${metrics.completedTaskCount} completed · ${metrics.failedTaskCount} failed`}
            />

            <PolicyStatCard
              tone="violet"
              icon={<ReceiptText className="h-5 w-5" />}
              label="Revenue Rule"
              value="Verified Only"
              detail="No treasury credit from projected profit"
            />
          </section>

          <Card className="bg-slate-950/40 border-slate-800 shadow-2xl overflow-hidden">
            <CardHeader className="p-6 border-b border-slate-800/50 bg-slate-900/20">
              <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-3">
                <History className="h-4 w-4 text-sky-400" />
                Policy Audit Trail
              </CardTitle>
            </CardHeader>

            <CardContent className="p-0">
              <ScrollArea className="h-[260px]">
                <div className="p-6 space-y-3">
                  {auditLogs.length > 0 ? (
                    auditLogs.map((log, idx) => {
                      const parts = String(log).split(': ');

                      return (
                        <div
                          key={`${log}-${idx}`}
                          className="font-mono text-[10px] text-slate-500 border-b border-slate-800/30 pb-2 flex justify-between gap-4"
                        >
                          <span className="text-sky-500/70 shrink-0">{parts[0]}</span>
                          <span className="text-slate-300 font-bold text-right">
                            {parts.slice(1).join(': ')}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-[10px] font-mono text-slate-700 text-center py-10 uppercase tracking-widest">
                      No policy mutations recorded.
                    </p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-4 space-y-8">
          <Card className="bg-slate-950/60 border-slate-800 shadow-2xl overflow-hidden border-t-2 border-t-red-500/30">
            <CardHeader className="p-6 border-b border-slate-800/50 bg-red-500/5">
              <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-red-500 flex items-center gap-3">
                <HeartCrack className="h-4 w-4" />
                Anomaly Monitor
              </CardTitle>
            </CardHeader>

            <CardContent className="p-6 space-y-6">
              <div className="space-y-4">
                {failingAgents.length > 0 ? (
                  failingAgents.map(agent => (
                    <div
                      key={agent.role}
                      className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/20 rounded-xl"
                    >
                      <div className="flex items-center gap-3">
                        <PulseIcon className="h-4 w-4 text-red-500 animate-pulse" />

                        <div>
                          <p className="text-[10px] font-black text-slate-200 uppercase tracking-tighter">
                            {String(agent.role).replace('_', ' ')}
                          </p>

                          <p className="text-[9px] font-mono text-red-400">
                            STATUS: {String(agent.status || 'unknown').toUpperCase()}
                          </p>
                        </div>
                      </div>

                      <Badge variant="destructive" className="text-[9px] h-5 font-mono">
                        {safeNumber(agent.health, 0)}%
                      </Badge>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 opacity-30">
                    <ShieldCheck className="h-10 w-10 text-emerald-500 mb-3" />
                    <p className="text-[10px] font-mono uppercase tracking-widest">
                      All Nodes Nominal
                    </p>
                  </div>
                )}
              </div>

              {systemIssues.length > 0 ? (
                <div className="pt-4 border-t border-slate-800/50 space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    System Issues
                  </p>

                  {systemIssues.slice(0, 5).map((issue, idx) => (
                    <div
                      key={`${issue}-${idx}`}
                      className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[10px] font-mono text-amber-300 leading-relaxed"
                    >
                      {String(issue)}
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="bg-slate-950/60 border-slate-800 shadow-2xl overflow-hidden border-t-2 border-t-violet-500/30">
            <CardHeader className="p-6 border-b border-slate-800/50 bg-slate-900/20">
              <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-3">
                <Bot className="h-4 w-4 text-violet-400" />
                Agent Model Routing
              </CardTitle>
            </CardHeader>

            <CardContent className="p-0">
              <ScrollArea className="h-[290px]">
                <div className="p-5 space-y-3">
                  {Array.isArray(metrics.routerSummary?.roles) && metrics.routerSummary.roles.length > 0 ? (
                    metrics.routerSummary.roles.map((item: any) => (
                      <div
                        key={item.role}
                        className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-4"
                      >
                        <div className="min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                            {String(item.role).replace('_', ' ')}
                          </p>
                          <p className="text-[9px] font-mono text-slate-600 truncate">
                            {item.reason || 'router_selection'}
                          </p>
                        </div>

                        <Badge
                          variant="outline"
                          className="shrink-0 max-w-[160px] truncate bg-violet-500/10 border-violet-500/20 text-violet-300 font-mono text-[9px]"
                        >
                          {item.selected_model}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <div className="space-y-3">
                      {agents.map((agent) => (
                        <div
                          key={agent.role}
                          className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-4"
                        >
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                              {String(agent.role).replace('_', ' ')}
                            </p>
                            <p className="text-[9px] font-mono text-slate-600 truncate">
                              runtime selection stored in agent.ts / ai-model-router.ts
                            </p>
                          </div>

                          <Badge
                            variant="outline"
                            className="shrink-0 bg-slate-900 border-slate-800 text-slate-400 font-mono text-[9px]"
                          >
                            dynamic
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <ReinvestmentPanel />

          <Card className="bg-red-500/5 border-2 border-red-500/20 shadow-2xl overflow-hidden">
            <CardHeader className="p-6 border-b border-red-500/10 bg-red-500/5">
              <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-red-500 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5" />
                Kill-Switch Protocol
              </CardTitle>
            </CardHeader>

            <CardContent className="p-8 space-y-8">
              <div className="flex items-center justify-between gap-6">
                <div className="space-y-1.5">
                  <span className="text-sm font-black text-slate-100 uppercase">
                    Kernel Override
                  </span>

                  <p className="text-[10px] text-slate-500 font-mono leading-tight">
                    Instantly freeze scout, router, report generation, and monetization execution.
                  </p>
                </div>

                <Switch
                  checked={Boolean(emergency_stop)}
                  onCheckedChange={handleToggleEmergency}
                  className="data-[state=checked]:bg-red-600"
                />
              </div>

              <div className="p-4 bg-red-500/10 rounded-xl border border-red-500/30">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="h-3 w-3 text-red-500" />
                  <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">
                    Security Warning
                  </span>
                </div>

                <p className="text-[10px] text-red-400/80 leading-relaxed font-mono italic">
                  Activation persists until manual restoration. Public reports remain readable, but
                  autonomous execution and future monetization cycles are suspended by policy.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <footer className="mt-12 pb-12 border-t border-slate-800/50 pt-10 text-center">
        <p className="text-[10px] font-mono text-slate-700 uppercase tracking-widest">
          Arbitrage Nexus Engine | Governor Hardened Build | Dynamic Model Fallback | Payment Unlocks Require Verified Native POL Deposits
        </p>
      </footer>
    </AppLayout>
  );
}

export default GovernorPage;