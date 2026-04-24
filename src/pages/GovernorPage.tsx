import React from 'react';
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
  AlertCircle,
  History,
  Activity as PulseIcon,
  HeartCrack
} from 'lucide-react';
import { toast } from 'sonner';
export function GovernorPage() {
  const emergency_stop = useEmergencyStop();
  const max_risk_score = useMaxRiskScore();
  const reserve_floor = useReserveFloor();
  const max_spend_per_day = useMaxSpendPerDay();
  const systemStatus = useSystemStatusLabel();
  const tradingEnabled = useTradingEnabled();
  const systemIssues = useSystemIssues();
  const auditLogs = usePolicyAuditLogs();
  const agents = useAgentsList();
  const persistPolicy = useStore(s => s.persistPolicy);
  const handleToggleEmergency = async (checked: boolean) => {
    try {
      await persistPolicy({ emergency_stop: checked });
      if (checked) {
        toast.error("EMERGENCY KILL-SWITCH ACTIVATED", {
          description: "All autonomous operations suspended immediately.",
          duration: 0
        });
      } else {
        toast.success("SYSTEM RESTORED", {
          description: "Autonomous cycle resuming under existing policy."
        });
      }
    } catch (err) {
      toast.error("POLICY_UPDATE_FAILED");
    }
  };
  const handleToggleTrading = async (checked: boolean) => {
    try {
      await persistPolicy({ trading_enabled: checked });
      toast.info(`Trading Agent ${checked ? 'Enabled' : 'Disabled'}`, {
        description: checked ? "Capital allocation for trading bots is authorized." : "All trading strategies halted."
      });
    } catch (err) {
      toast.error("TRADING_UPDATE_FAILED");
    }
  };
  const failingAgents = agents?.filter(a => a.status === 'error' || (a.health ?? 100) < 60) ?? [];
  return (
    <AppLayout container contentClassName="space-y-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 w-full border-b border-slate-800/50 pb-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-black flex items-center gap-4 tracking-tighter">
            <ShieldAlert className="h-10 w-10 text-amber-500" />
            GOVERNOR <span className="text-slate-500">POLICY ENGINE</span>
          </h1>
          <p className="text-slate-400 font-mono text-xs uppercase tracking-widest flex items-center gap-2">
            <ShieldCheck className="h-3 w-3 text-emerald-500" />
            Deterministic Protocol Compliance Node
          </p>
        </div>
        <div className={cn(
          "px-6 py-2.5 rounded-2xl border-2 flex items-center gap-4 shadow-lg transition-all",
          emergency_stop 
            ? "bg-red-500/10 border-red-500/50 text-red-500" 
            : "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
        )}>
          <div className={cn("w-3 h-3 rounded-full", emergency_stop ? "bg-red-500" : "bg-emerald-500 animate-pulse")} />
          <span className="text-sm font-black uppercase tracking-widest">{emergency_stop ? 'KERNEL_HALTED' : 'KERNEL_ACTIVE'}</span>
        </div>
      </header>
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 w-full">
        <div className="lg:col-span-8 space-y-10">
          <Card className="bg-slate-950/60 border-slate-800 shadow-2xl overflow-hidden border-t-2 border-t-sky-500/30">
            <CardHeader className="p-6 border-b border-slate-800/50 bg-slate-900/20">
              <CardTitle className="text-sm font-black uppercase tracking-[0.2em] text-slate-200 flex items-center gap-3">
                <Activity className="h-4 w-4 text-sky-400" />
                Risk & Reserve Sensitivity
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-10">
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <div className="space-y-0.5">
                    <label className="text-xs font-black text-slate-300 uppercase tracking-widest">Max Risk Threshold</label>
                    <p className="text-[10px] text-slate-500 font-mono">ROUTER_DISCARD_LIMIT</p>
                  </div>
                  <span className="text-xl font-mono text-sky-400 font-black">{Math.round((max_risk_score ?? 0) * 100)}%</span>
                </div>
                <Slider
                  value={[(max_risk_score ?? 0) * 100]}
                  max={100}
                  step={1}
                  onValueChange={([val]) => persistPolicy({ max_risk_score: val / 100 })}
                  className="py-4"
                />
              </div>
              <div className="space-y-6 border-t border-slate-800/50 pt-10">
                <div className="flex justify-between items-center">
                  <div className="space-y-0.5">
                    <label className="text-xs font-black text-slate-300 uppercase tracking-widest">Reserve Floor</label>
                    <p className="text-[10px] text-slate-500 font-mono">MIN_CAPITAL_QUORUM</p>
                  </div>
                  <span className="text-xl font-mono text-emerald-400 font-black">${(reserve_floor ?? 0).toLocaleString()}</span>
                </div>
                <Slider
                  value={[reserve_floor ?? 0]}
                  max={10000}
                  step={100}
                  onValueChange={([val]) => persistPolicy({ reserve_floor: val })}
                  className="py-4"
                />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-950/60 border-slate-800 shadow-2xl overflow-hidden border-t-2 border-t-amber-500/30">
            <CardHeader className="p-6 border-b border-slate-800/50 bg-slate-900/20 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-black uppercase tracking-[0.2em] text-slate-200 flex items-center gap-3">
                <Zap className="h-4 w-4 text-amber-500" />
                Execution constraints
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-10">
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <div className="space-y-0.5">
                    <label className="text-xs font-black text-slate-300 uppercase tracking-widest">Daily Spend Cap</label>
                    <p className="text-[10px] text-slate-500 font-mono">AUTONOMOUS_BURN_LIMIT</p>
                  </div>
                  <span className="text-xl font-mono text-amber-400 font-black">${(max_spend_per_day ?? 0).toLocaleString()}</span>
                </div>
                <Slider
                  value={[max_spend_per_day ?? 0]}
                  max={5000}
                  step={50}
                  onValueChange={([val]) => persistPolicy({ max_spend_per_day: val })}
                  className="py-4"
                />
              </div>
              <div className="pt-8 border-t border-slate-800/50 flex items-center justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-lg bg-amber-500/10">
                      <Coins className="h-4 w-4 text-amber-500" />
                    </div>
                    <span className="text-sm font-black text-slate-100 uppercase tracking-tight">Trading Agent Auth</span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono italic">Enable high-frequency informational arbitrage bots.</p>
                </div>
                <Switch
                  checked={tradingEnabled}
                  onCheckedChange={handleToggleTrading}
                  className="data-[state=checked]:bg-emerald-600"
                />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-950/40 border-slate-800 shadow-2xl overflow-hidden">
            <CardHeader className="p-6 border-b border-slate-800/50 bg-slate-900/20">
              <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-3">
                <History className="h-4 w-4 text-sky-400" />
                Policy Audit Trail
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[250px]">
                <div className="p-6 space-y-3">
                  {auditLogs.length > 0 ? auditLogs.map((log, idx) => {
                    const parts = log.split(': ');
                    return (
                      <div key={idx} className="font-mono text-[10px] text-slate-500 border-b border-slate-800/30 pb-2 flex justify-between">
                        <span className="text-sky-500/70">{parts[0]}</span>
                        <span className="text-slate-300 font-bold">{parts.slice(1).join(': ')}</span>
                      </div>
                    );
                  }) : (
                    <p className="text-[10px] font-mono text-slate-700 text-center py-10 uppercase tracking-widest">No policy mutations recorded.</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-4 space-y-10">
          <Card className="bg-slate-950/60 border-slate-800 shadow-2xl overflow-hidden border-t-2 border-t-red-500/30">
            <CardHeader className="p-6 border-b border-slate-800/50 bg-red-500/5">
              <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-red-500 flex items-center gap-3">
                <HeartCrack className="h-4 w-4" />
                Anomaly Monitor
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-4">
                {failingAgents.length > 0 ? failingAgents.map((agent) => (
                  <div key={agent.role} className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                    <div className="flex items-center gap-3">
                      <PulseIcon className="h-4 w-4 text-red-500 animate-pulse" />
                      <div>
                        <p className="text-[10px] font-black text-slate-200 uppercase tracking-tighter">{agent.role.replace('_', ' ')}</p>
                        <p className="text-[9px] font-mono text-red-400">STATUS: {(agent.status || 'unknown').toUpperCase()}</p>
                      </div>
                    </div>
                    <Badge variant="destructive" className="text-[9px] h-5 font-mono">{agent.health}%</Badge>
                  </div>
                )) : (
                  <div className="flex flex-col items-center justify-center py-8 opacity-20">
                    <ShieldCheck className="h-10 w-10 text-emerald-500 mb-3" />
                    <p className="text-[10px] font-mono uppercase tracking-widest">All Nodes Nominal</p>
                  </div>
                )}
              </div>
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
              <div className="flex items-center justify-between">
                <div className="space-y-1.5">
                  <span className="text-sm font-black text-slate-100 uppercase">Kernel Override</span>
                  <p className="text-[10px] text-slate-500 font-mono leading-tight">Instantly freeze all autonomous execution threads.</p>
                </div>
                <Switch
                  checked={!!emergency_stop}
                  onCheckedChange={handleToggleEmergency}
                  className="data-[state=checked]:bg-red-600"
                />
              </div>
              <div className="p-4 bg-red-500/10 rounded-xl border border-red-500/30">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="h-3 w-3 text-red-500" />
                  <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">Security Warning</span>
                </div>
                <p className="text-[10px] text-red-400/80 leading-relaxed font-mono italic">
                  Activation halts all scout, router, and monetization agents. This state is persistent until manual restoration.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
      <footer className="mt-12 pb-12 border-t border-slate-800/50 pt-10 text-center">
        <p className="text-[10px] font-mono text-slate-700 uppercase tracking-widest">
          Arbitrage Nexus Engine | Phase 20 Hardened Build
        </p>
      </footer>
    </AppLayout>
  );
}