import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAgentsList, useOpportunitiesList, useLastScanTime } from '@/lib/store';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import {
  TrendingUp,
  Zap,
  Info,
  ShieldCheck,
  Clock,
  ExternalLink,
  Database,
  Search,
  Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
export function OpportunityFeed() {
  const opportunities = useOpportunitiesList();
  const lastScan = useLastScanTime();
  const agents = useAgentsList();
  const scoutStatus = useMemo(() =>
    agents?.find(a => a.role === 'scout')?.status ?? 'idle',
    [agents]
  );
  const formatCurrency = (val: number) => {
    return val.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-1">
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-slate-100 uppercase tracking-widest flex items-center gap-2.5">
            <Zap className="h-4 w-4 text-sky-400 fill-sky-400/20" />
            Live Opportunity Matrix
          </h2>
          {lastScan > 0 && (
            <p className="text-[9px] font-mono text-slate-500 uppercase tracking-tighter flex items-center gap-1.5 ml-6">
              <Clock className="h-2.5 w-2.5" />
              Matrix Refreshed {formatDistanceToNow(lastScan)} ago
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {scoutStatus === 'scanning' && (
            <div className="flex items-center gap-2 text-sky-400 animate-pulse">
              <Search className="h-3 w-3" />
              <span className="text-[10px] font-mono font-bold">POLLING_FEEDS...</span>
            </div>
          )}
          <Badge variant="outline" className="bg-sky-500/10 text-sky-400 border-sky-500/20 font-mono text-[10px] h-7">
            {(opportunities?.length || 0)} SIGNALS_DETECTED
          </Badge>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4">
        <AnimatePresence mode="popLayout">
          {opportunities?.length > 0 ? opportunities.map((opp) => (
            <motion.div
              key={opp.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              layout
            >
              <Dialog>
                <DialogTrigger asChild>
                  <Card className="bg-slate-900/40 border-slate-800 hover:border-sky-500/50 hover:bg-slate-900/60 transition-all group cursor-pointer overflow-hidden relative">
                    <div className={cn(
                      "absolute left-0 top-0 bottom-0 w-1 transition-colors",
                      opp.status === 'executing' ? "bg-emerald-500" : "bg-sky-500"
                    )} />
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-slate-500 font-bold">#{opp.id?.split('-').pop() || '000'}</span>
                            <h3 className="text-sm font-bold text-slate-100 group-hover:text-sky-400 transition-colors">
                              {opp.title}
                            </h3>
                          </div>
                          <p className="text-xs text-slate-400 line-clamp-1 pr-8">{opp.summary}</p>
                        </div>
                        <Badge variant="secondary" className="bg-slate-800 text-slate-300 border-slate-700 text-[10px] uppercase font-bold">
                          {opp.niche}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="space-y-1.5">
                          <span className="text-[9px] text-slate-500 block uppercase font-bold tracking-tight">Confidence</span>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${(opp.confidence_score ?? 0) * 100}%` }}
                                className="h-full bg-emerald-500" 
                              />
                            </div>
                            <span className="text-[10px] font-mono font-bold text-emerald-400">
                              {Math.round((opp.confidence_score ?? 0) * 100)}%
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-[9px] text-slate-500 block uppercase font-bold tracking-tight">Risk Vector</span>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${(opp.risk_score ?? 0) * 100}%` }}
                                className={cn("h-full", (opp.risk_score ?? 0) > 0.5 ? "bg-red-500" : "bg-sky-500")} 
                              />
                            </div>
                            <span className={cn("text-[10px] font-mono font-bold", (opp.risk_score ?? 0) > 0.5 ? "text-red-500" : "text-sky-400")}>
                              {Math.round((opp.risk_score ?? 0) * 100)}%
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-[9px] text-slate-500 block uppercase font-bold tracking-tight">Potential</span>
                          <div className="flex items-center gap-1.5 text-emerald-400">
                            <TrendingUp className="h-3.5 w-3.5" />
                            <span className="text-xs font-mono font-black">
                              +{formatCurrency(opp.potential_profit || (opp.monetization_score || 0) * 100)}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-[9px] text-slate-500 block uppercase font-bold tracking-tight">Status</span>
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "w-2 h-2 rounded-full",
                              opp.status === 'executing' ? "bg-emerald-500 animate-pulse" : "bg-sky-500"
                            )} />
                            <span className="text-[10px] font-black text-slate-200 capitalize tracking-wide">{opp.status}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                </DialogTrigger>
                <DialogContent className="bg-slate-950 border-slate-800 text-slate-100 max-w-2xl sm:rounded-2xl shadow-2xl">
                  <DialogHeader>
                    <div className="flex items-center gap-3 mb-2">
                      <Badge className="bg-sky-500 text-white border-none text-[10px] font-black">{opp.niche.toUpperCase()}</Badge>
                      <span className="text-[10px] font-mono text-slate-500 uppercase">IDENTIFIER: {opp.id}</span>
                    </div>
                    <DialogTitle className="text-xl font-black tracking-tight">{opp.title}</DialogTitle>
                    <DialogDescription className="text-slate-400 text-sm leading-relaxed">{opp.summary}</DialogDescription>
                  </DialogHeader>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                          <Info className="h-3.5 w-3.5 text-sky-400" /> Analyst Evidence
                        </h4>
                        <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800 text-[11px] leading-relaxed text-slate-300 font-mono">
                          {opp.evidence || 'No specific evidence string provided by analyzer.'}
                        </div>
                      </div>
                      <div>
                        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                          <Activity className="h-3.5 w-3.5 text-emerald-400" /> Strategic Alignment
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {opp.recommended_agents?.map((agent) => (
                            <Badge key={agent} variant="outline" className="text-[9px] border-slate-800 bg-slate-900/40 text-slate-400 font-bold">
                              {agent.toUpperCase()}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                          <Database className="h-3.5 w-3.5 text-amber-500" /> Kernel Sources
                        </h4>
                        <div className="flex flex-col gap-2">
                          {opp.source_refs?.map((src, i) => (
                            <a 
                              key={i} 
                              href="#" 
                              onClick={(e) => e.preventDefault()}
                              className="p-2 bg-slate-900/30 border border-slate-800 rounded-lg text-[10px] font-mono text-slate-500 flex items-center justify-between hover:text-sky-400 transition-colors"
                            >
                              <span>{src}</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ))}
                        </div>
                      </div>
                      <div className="p-4 rounded-xl bg-sky-500/5 border border-sky-500/10">
                        <p className="text-[10px] text-sky-500 font-bold uppercase mb-1">Autonomous Strategy</p>
                        <p className="text-[10px] text-slate-500 leading-tight">
                          Router agent has prioritized this signal for {opp.recommended_agents?.[0] || 'general'} execution pipeline based on {Math.round((opp.monetization_score || 0) * 100)}% profit probability.
                        </p>
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </motion.div>
          )) : (
            <div className="py-20 text-center space-y-4 opacity-30 border-2 border-dashed border-slate-800 rounded-2xl">
              <Search className="h-10 w-10 text-slate-700 mx-auto" />
              <p className="text-xs font-mono uppercase tracking-[0.2em]">Awaiting first valid signal cycle...</p>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}