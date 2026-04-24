import React, { useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { AgentOversight } from '@/components/AgentOversight';
import { Cpu, Terminal, ShieldCheck, Activity, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useStore, useAgentsList, useLedgerEntries } from '@/lib/store';
/**
 * AgentPage
 * Provides high-level metrics and detailed oversight for the autonomous agent fleet.
 * Uses centralized store selectors for data integrity.
 */
export function AgentPage() {
  const agents = useAgentsList();
  const ledger = useLedgerEntries();
  const metrics = useMemo(() => {
    if (!agents || agents.length === 0) {
      return {
        totalActiveTasks: 0,
        totalCapacity: 0,
        avgSuccess: 0,
        hourlyRevenue: 0
      };
    }
    const totalActiveTasks = agents.reduce((sum, agent) => sum + (agent.activeTasks || 0), 0);
    const totalCapacity = agents.length * 10;
    const agentsWithSuccess = agents.filter(a => (a.successRate ?? 0) > 0);
    const avgSuccess = agentsWithSuccess.length > 0 
      ? (agents.reduce((sum, a) => sum + (a.successRate || 0), 0) / agents.length) * 100
      : 0;
    const oneHourAgo = Date.now() - 3600000;
    const hourlyRevenue = (ledger || [])
      .filter(e => e.type === 'credit' && e.timestamp > oneHourAgo)
      .reduce((sum, e) => sum + (e.amount || 0), 0);
    return {
      totalActiveTasks,
      totalCapacity,
      avgSuccess,
      hourlyRevenue
    };
  }, [agents, ledger]);
  const formatCurrency = (val: number) => {
    return val.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    });
  };
  const systemHealthStatus = useStore(s => s.system_health?.status);
  return (
    <AppLayout container contentClassName="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3 tracking-tighter">
            <Cpu className="h-8 w-8 text-emerald-400" />
            AGENT FLEET OVERSIGHT
          </h1>
          <p className="text-slate-400 font-mono text-xs mt-1 uppercase tracking-widest">
            Autonomous Cluster Monitoring System • Kernel Protocol v1.0
          </p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${
          systemHealthStatus === 'healthy' 
            ? 'bg-emerald-500/10 border-emerald-500/20' 
            : 'bg-amber-500/10 border-amber-500/20'
        }`}>
          <ShieldCheck className={`h-4 w-4 ${systemHealthStatus === 'healthy' ? 'text-emerald-500' : 'text-amber-500'}`} />
          <span className={`text-[10px] font-bold uppercase tracking-tight ${systemHealthStatus === 'healthy' ? 'text-emerald-400' : 'text-amber-400'}`}>
            System Integrity: {systemHealthStatus === 'healthy' ? 'Nominal' : 'Degraded'}
          </span>
        </div>
      </header>
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-slate-900/20 border-slate-800 shadow-lg group">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-sky-500/10 text-sky-400 group-hover:scale-110 transition-transform">
              <Terminal className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Active Threads</p>
              <p className="text-xl font-mono font-black text-slate-100">
                {metrics.totalActiveTasks} <span className="text-slate-600 text-sm">/ {metrics.totalCapacity}</span>
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/20 border-slate-800 shadow-lg group">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Avg success rate</p>
              <p className="text-xl font-mono font-black text-slate-100">
                {`${metrics.avgSuccess.toFixed(1)}%`}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/20 border-slate-800 shadow-lg group">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 group-hover:scale-110 transition-transform">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Cluster throughput/hr</p>
              <p className="text-xl font-mono font-black text-slate-100">
                {formatCurrency(metrics.hourlyRevenue)}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
      <section className="animate-in fade-in slide-in-from-bottom-4 duration-700">
        <AgentOversight />
      </section>
      <div className="p-6 bg-slate-900/40 border border-slate-800 rounded-2xl flex items-center gap-4">
        <div className="p-2 bg-slate-800 rounded-lg">
          <ShieldCheck className="h-5 w-5 text-slate-400" />
        </div>
        <div className="space-y-1">
          <p className="text-[10px] font-bold text-slate-200 uppercase tracking-widest">Autonomous Compliance Note</p>
          <p className="text-[11px] text-slate-500 leading-relaxed max-w-2xl">
            All agents shown above are operating under the deterministic governance of the Nexus Governor. 
            Execution cycles are retry-safe and follow strict idempotency protocols to prevent duplicate capital allocation.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}