import React, { memo, useMemo } from 'react';
import { useStore, useTradingEnabled, useTasksList, useAgentsList } from '@/lib/store';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Activity,
  Cpu,
  Zap,
  ShieldCheck,
  Search,
  PieChart,
  Coins,
  Lock,
  Target
} from 'lucide-react';
import { cn } from '@/lib/utils';
const AgentCard = memo(({ role }: { role: string }) => {
  const agents = useAgentsList();
  const tasks = useTasksList();
  const tradingEnabled = useTradingEnabled();
  const agent = useMemo(() => agents?.find(a => a.role === role), [agents, role]);
  const health = agent?.health ?? 0;
  const status = agent?.status ?? 'idle';
  const totalProfit = agent?.totalProfit ?? 0;
  const currentTask = useMemo(() =>
    status === 'executing'
      ? (tasks || []).find(t => t.agent_role === role && t.status === 'executing')
      : null,
    [tasks, role, status]
  );
  const isUninitialized = health === 0 && totalProfit === 0;
  const isLocked = role === 'trading' && !tradingEnabled;
  const isExecuting = status === 'executing';
  const getAgentMeta = (role: string) => {
    switch (role) {
      case 'scout': return { icon: Search, color: 'text-sky-400', desc: 'DATA_INGRESS: High-velocity data scanning and signal harvesting.' };
      case 'analyst': return { icon: Activity, color: 'text-emerald-400', desc: 'SIGNAL_VALIDATION: Deterministic risk scoring and confidence matching.' };
      case 'router': return { icon: Cpu, color: 'text-indigo-400', desc: 'LOGIC_ROUTING: Autonomous orchestration of prioritized execution pipelines.' };
      case 'content_arb': return { icon: PieChart, color: 'text-pink-400', desc: 'CONTENT_GEN: Info-asymmetry monetization via high-throughput content synthesis.' };
      case 'affiliate': return { icon: Zap, color: 'text-amber-400', desc: 'CONVERSION_ROUTE: Automated referral mapping and affiliate conversion tracking.' };
      case 'trading': return { icon: Coins, color: 'text-amber-400', desc: 'MARKET_ARB: High-frequency trading based on informational skew (RESTRICTED).' };
      default: return { icon: ShieldCheck, color: 'text-slate-400', desc: 'CORE_PROTOCOL: System-level supporting micro-agent.' };
    }
  };
  const meta = getAgentMeta(role);
  const Icon = meta.icon;
  const displayStatus = isLocked ? 'LOCKED' : (isUninitialized ? 'UNINITIALIZED' : status.toUpperCase());
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn(
          "flex flex-col p-4 rounded-xl border transition-all cursor-help relative overflow-hidden group hover:scale-[1.02]",
          (isLocked) ? "bg-slate-900/20 border-slate-900 opacity-60" : "bg-slate-900/40 border-slate-800 hover:border-slate-700",
          isUninitialized && !isLocked && "border-dashed border-slate-800 opacity-80"
        )}>
          <div className="flex items-center justify-between mb-3">
            <div className={cn(
              "p-1.5 rounded-lg bg-slate-800/50 transition-all",
              isLocked ? "text-slate-600" : meta.color,
              isExecuting && "ring-2 ring-emerald-500/50"
            )}>
              <Icon className={cn("h-4 w-4", isExecuting && "animate-pulse")} />
            </div>
            {isLocked ? (
              <Lock className="h-3 w-3 text-amber-500/50" />
            ) : (
              <span className={cn(
                "text-[10px] font-mono font-bold",
                health === 0 ? "text-slate-600" : (health < 90 ? "text-amber-500" : "text-emerald-500")
              )}>
                {health}%
              </span>
            )}
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-black text-slate-200 uppercase tracking-tight group-hover:text-white transition-colors">
              {role.replace(/_/g, ' ')}
            </span>
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-1.5 h-1.5 rounded-full",
                isLocked ? "bg-amber-600" : (isUninitialized ? "bg-slate-800" : (status === 'idle' ? "bg-slate-700" : "bg-emerald-500 animate-pulse"))
              )} />
              <span className={cn(
                "text-[10px] font-bold uppercase tracking-tighter",
                isLocked ? "text-amber-600" : (isUninitialized ? "text-slate-700" : (status === 'idle' ? "text-slate-500" : "text-emerald-500")))
              }>
                {displayStatus}
              </span>
            </div>
          </div>
          {currentTask && (
            <div className="mt-3 pt-3 border-t border-slate-800/50 flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
              <Target className="h-2.5 w-2.5 text-sky-400" />
              <span className="text-[9px] font-mono text-slate-500 truncate uppercase">
                TARGET: {currentTask.opportunity_id?.slice(-4) || 'N/A'}
              </span>
            </div>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent className="bg-slate-900 border-slate-800 text-slate-200 text-xs p-3 max-w-xs shadow-2xl">
        <p className="font-bold mb-1 uppercase text-[10px] tracking-widest text-slate-400">Designation: {role.toUpperCase()}</p>
        <p className="leading-relaxed font-mono text-[10px] text-slate-300">{meta.desc}</p>
        {currentTask && (
          <div className="mt-2 text-[10px] text-sky-400 font-bold border-t border-slate-800 pt-2 flex items-center gap-1 uppercase tracking-tighter">
            <Activity className="h-3 w-3" /> PROCESSING: {currentTask.opportunity_title || 'UNKNOWN'}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
});
AgentCard.displayName = 'AgentCard';
export function AgentStatus() {
  const agents = useAgentsList();
  const roles = useMemo(() => (agents || []).map(a => a.role), [agents]);
  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {roles.map((role) => (
          <AgentCard key={role} role={role} />
        ))}
      </div>
    </TooltipProvider>
  );
}