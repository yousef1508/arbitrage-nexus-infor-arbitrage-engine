import React, { useMemo } from 'react';
import {
  Terminal,
  RefreshCw,
  Cpu,
  ShieldAlert,
  Activity,
  Globe,
  Zap,
  BarChart3,
  AlertCircle
} from 'lucide-react';
import { TreasuryOverview } from '@/components/TreasuryOverview';
import { OpportunityFeed } from '@/components/OpportunityFeed';
import { AgentStatus } from '@/components/AgentStatus';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
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
  // Standardized primitive selectors for stability
  const fetchSystemState = useStore(s => s.fetchSystemState);
  const budgetUsagePercent = useMemo(() => {
    if (!maxSpend || maxSpend <= 0) return 0;
    return Math.min((dailySpend / maxSpend) * 100, 100);
  }, [dailySpend, maxSpend]);
  const handleManualScan = () => {
    fetchSystemState(true);
    toast("SIGNAL_BROADCAST_SENT", {
      description: "Triggering manual intelligence ingestion cycle via Gateway.",
      icon: <RefreshCw className="h-4 w-4 text-sky-400" />,
    });
  };
  const formatCurrency = (val: number) => {
    return val.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };
  return (
    <AppLayout container contentClassName="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
      <header className="relative flex flex-col md:flex-row md:items-center justify-between gap-6 w-full border-b border-slate-800/50 pb-8 rounded-2xl overflow-hidden">
        <SystemPulse />
        <div className="flex items-center gap-5 relative z-10 p-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500 to-emerald-500 flex items-center justify-center shadow-2xl shadow-sky-500/20 group shrink-0">
            <Terminal className="h-7 w-7 text-white" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-black tracking-tighter">
                ARBITRAGE <span className="text-sky-400">NEXUS</span>
              </h1>
              <Badge variant="outline" className="bg-slate-900/50 border-slate-800 text-[9px] font-mono text-slate-500 uppercase tracking-widest px-2 h-5">
                v1.0.5-FINAL
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="outline" className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors",
                emergencyStop 
                  ? "bg-red-500/10 text-red-500 border-red-500/20" 
                  : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
              )}>
                <div className={cn("w-1.5 h-1.5 rounded-full mr-1.5", emergencyStop ? "bg-red-500" : "bg-emerald-500 animate-pulse")} />
                {emergencyStop ? 'SYSTEM_HALTED' : 'KERNEL_ACTIVE'}
              </Badge>
              {lastRunTriggeredAt > 0 && (
                <span className="text-[10px] text-sky-400/70 font-mono flex items-center gap-1 uppercase tracking-tighter">
                  <Activity className="h-3 w-3" />
                  LAST_CYCLE: {formatDistanceToNow(lastRunTriggeredAt)} AGO
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 relative z-10 px-2">
          <Button 
            onClick={handleManualScan}
            variant="outline" 
            size="sm" 
            className="bg-sky-500/10 border-sky-500/30 text-sky-400 font-bold text-[10px] uppercase tracking-widest h-9 hover:bg-sky-500/20"
            disabled={emergencyStop || lastRunStatus === 'running'}
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-2", lastRunStatus === 'running' && "animate-spin")} />
            {lastRunStatus === 'running' ? 'EXECUTING...' : 'FORCE_INGEST'}
          </Button>
        </div>
      </header>
      <div className="space-y-12">
        <section className="animate-in fade-in slide-in-from-top-4 duration-700">
          <TreasuryOverview />
        </section>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full">
          <div className="lg:col-span-8 space-y-8">
            <section className="animate-in fade-in slide-in-from-left-4 duration-700">
              <OpportunityFeed />
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
                <Link to="/agents" className="text-[10px] font-bold text-sky-400 hover:underline uppercase tracking-tighter">FULL_METRICS_LOG</Link>
              </div>
              <AgentStatus />
            </section>
          </div>
          <div className="lg:col-span-4 space-y-8">
            <Card className="bg-slate-950/80 border-slate-800 flex flex-col h-[400px] shadow-2xl relative overflow-hidden border-t-2 border-t-sky-500/30">
              <CardHeader className="p-4 border-b border-slate-800/50 bg-slate-900/20">
                <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-400 flex items-center gap-2">
                  <Terminal className="h-3.5 w-3.5" />
                  KERNEL_STDOUT
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 flex-1 overflow-hidden bg-black/40">
                <ScrollArea className="h-full">
                  <div className="p-4 font-mono text-[10px] leading-relaxed space-y-1 text-slate-400">
                    {kernelLogs.length > 0 ? kernelLogs.map((log, idx) => (
                      <div key={idx} className="flex gap-2">
                        <span className={cn(
                          "shrink-0",
                          log.includes('[CRITICAL]') ? "text-red-500" : (log.includes('[GOVERNOR]') ? "text-amber-400" : (log.includes('[EXEC]') ? "text-emerald-400" : "text-sky-500/60"))
                        )}>
                          {log}
                        </span>
                      </div>
                    )) : (
                      <div className="py-20 text-center opacity-20 space-y-2">
                        <Terminal className="h-8 w-8 mx-auto" />
                        <p className="uppercase tracking-widest text-[9px]">Awaiting boot signal...</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
            <Card className="bg-slate-950/60 border-slate-800 shadow-xl overflow-hidden">
              <CardHeader className="p-4 border-b border-slate-800/50 bg-slate-900/10">
                <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 text-sky-400" />
                  OBSERVABILITY_PANEL
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                {lastRunStatus === 'failed' && (
                  <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/40">
                    <div className="flex items-center gap-2 mb-1.5">
                      <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-red-500">EXCEPTION_THROWN</span>
                    </div>
                    <p className="text-[10px] font-mono text-red-400/80 leading-relaxed italic">
                      {lastRunError || 'UNDETERMINED_SIGTERM_OVERRIDE'}
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[9px] text-slate-600 font-bold uppercase">Run State</p>
                    <p className={cn(
                      "text-xs font-mono font-black uppercase",
                      lastRunStatus === 'running' ? "text-sky-400 animate-pulse" : (lastRunStatus === 'success' ? "text-emerald-500" : (lastRunStatus === 'failed' ? "text-red-500" : "text-slate-400"))
                    )}>
                      {lastRunStatus}
                    </p>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-[9px] text-slate-600 font-bold uppercase">Signals Detected</p>
                    <p className="text-xs font-mono font-black text-slate-200">
                      {lastRunSignals}
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5 border-t border-slate-800/50 pt-4">
                  <p className="text-[9px] text-slate-600 font-bold uppercase flex items-center gap-1.5">
                    <Globe className="h-2.5 w-2.5" /> ACTIVE_NODES
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {lastRunSources && lastRunSources.length > 0 ? lastRunSources.map(s => (
                      <Badge key={s} variant="outline" className="text-[9px] bg-slate-900 border-slate-800 text-slate-500 font-mono py-0">
                        {s}
                      </Badge>
                    )) : (
                      <span className="text-[9px] text-slate-700 font-mono italic">POLLING...</span>
                    )}
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
                    <span className="text-[9px] text-slate-600 uppercase font-bold tracking-wider">Risk Sensitivity</span>
                    <span className="text-xs font-mono font-bold text-slate-300">{`${Math.round((maxRiskScore ?? 0) * 100)}%`}</span>
                  </div>
                  <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                    <Progress value={(maxRiskScore ?? 0) * 100} className="h-full bg-sky-500" />
                  </div>
                  <div className="pt-2 flex justify-between items-center text-[9px] font-bold text-slate-600 uppercase">
                    <span>Floor: {formatCurrency(reserveFloor ?? 0)}</span>
                    <span className="text-emerald-500 flex items-center gap-1">NOMINAL</span>
                  </div>
                </div>
                <div className="space-y-2 pt-2 border-t border-slate-800/50">
                  <div className="flex justify-between items-end">
                    <span className="text-[9px] text-slate-600 uppercase font-bold tracking-wider flex items-center gap-1">
                      <BarChart3 className="h-2.5 w-2.5" /> BUDGET_UTILIZATION
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-300">
                      {formatCurrency(dailySpend ?? 0)} / {formatCurrency(maxSpend ?? 0)}
                    </span>
                  </div>
                  <Progress value={budgetUsagePercent} className="h-1 bg-slate-800" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}