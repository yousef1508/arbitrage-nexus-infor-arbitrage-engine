import React, { useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { TreasuryOverview } from '@/components/TreasuryOverview';
import { PayPalWithdrawal } from '@/components/PayPalWithdrawal';
import { useLedgerEntries, useStore, useLastWithdrawalAt } from '@/lib/store';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Wallet, History, ArrowUpRight, ArrowDownRight, Terminal, Clock, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, addHours } from 'date-fns';
export function TreasuryPage() {
  const ledger = useLedgerEntries();
  const lastWithdrawalAt = useLastWithdrawalAt();
  const fetchSystemState = useStore(s => s.fetchSystemState);
  const cooldownActive = useMemo(() => {
    if (!lastWithdrawalAt) return false;
    return Date.now() - lastWithdrawalAt < 86400000;
  }, [lastWithdrawalAt]);
  const unlockTime = useMemo(() => {
    if (!lastWithdrawalAt) return null;
    return addHours(new Date(lastWithdrawalAt), 24);
  }, [lastWithdrawalAt]);
  useEffect(() => {
    fetchSystemState();
  }, [fetchSystemState]);
  const formatCurrency = (val: number) => {
    return val.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    });
  };
  return (
    <AppLayout container contentClassName="space-y-12 max-w-7xl mx-auto px-4 py-10">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-800/50">
        <div className="space-y-1">
          <h1 className="text-4xl font-black flex items-center gap-4 tracking-tighter">
            <Wallet className="h-10 w-10 text-pink-500" />
            TREASURY <span className="text-slate-500">&</span> LEDGER
          </h1>
          <p className="text-slate-500 font-mono text-xs uppercase tracking-widest flex items-center gap-2">
            <ShieldCheck className="h-3 w-3" />
            Autonomous Profit Distribution v1.0.4
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <PayPalWithdrawal disabled={cooldownActive} />
          {cooldownActive && unlockTime && (
            <Badge variant="outline" className="bg-amber-500/10 border-amber-500/20 text-amber-500 font-mono text-[10px] uppercase">
              <Clock className="h-3 w-3 mr-1.5" />
              Unlocked in {formatDistanceToNow(unlockTime)}
            </Badge>
          )}
        </div>
      </header>
      <section className="animate-in fade-in slide-up duration-700">
        <TreasuryOverview />
      </section>
      <div className="grid grid-cols-1 gap-8 pt-4">
        <Card className="bg-slate-950/60 border-slate-800 shadow-2xl relative overflow-hidden border-t-2 border-t-pink-500/30">
          <CardHeader className="p-6 border-b border-slate-800/50 flex flex-row items-center justify-between bg-slate-900/20">
            <div className="space-y-1">
              <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                <History className="h-4 w-4 text-pink-400" />
                Kernel Audit Ledger
              </CardTitle>
              <p className="text-[10px] text-slate-600 font-mono uppercase">Full Transaction Integrity Tracking</p>
            </div>
            <div className="text-[10px] font-mono text-slate-500 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
              LOGS_COMMITTED: {ledger?.length || 0}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[650px] bg-black/20">
              {(ledger?.length ?? 0) > 0 ? (
                <div className="divide-y divide-slate-800/40">
                  {ledger?.map((entry) => (
                    <div key={entry.id} className="p-5 hover:bg-slate-900/40 transition-all flex items-center justify-between group">
                      <div className="flex items-center gap-5">
                        <div className={cn(
                          "p-2.5 rounded-xl transition-colors shadow-sm",
                          entry.type === 'credit' 
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                            : "bg-red-500/10 text-red-400 border border-red-500/20"
                        )}>
                          {entry.type === 'credit' ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-slate-100 tracking-tight">{entry.description}</span>
                            <Badge variant="outline" className="text-[9px] font-mono bg-slate-900 border-slate-800 text-slate-500 uppercase px-1.5 py-0 h-4">
                              {entry.bucket}
                            </Badge>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-1 font-mono flex items-center gap-2">
                            <Clock className="h-3 w-3" />
                            {new Date(entry.timestamp).toLocaleString()}
                            <span className="text-slate-700">|</span>
                            Agent: <span className="text-sky-500/70">{entry.agent_id?.toUpperCase() || 'SYSTEM'}</span>
                          </div>
                        </div>
                      </div>
                      <div className={cn(
                        "font-mono font-black text-lg tabular-nums",
                        entry.type === 'credit' ? "text-emerald-400" : "text-red-400"
                      )}>
                        {entry.type === 'credit' ? '+' : '-'}{formatCurrency(entry.amount || 0)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-48 text-center space-y-6 opacity-20">
                  <Terminal className="h-16 w-16 text-slate-600" />
                  <div className="space-y-1">
                    <p className="text-xs font-mono uppercase tracking-[0.3em]">Ledger Awaiting Entry...</p>
                    <p className="text-[10px] font-mono">Kernel state is synchronized but zero-ingress detected.</p>
                  </div>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
      <footer className="pt-10 flex justify-center opacity-40">
        <p className="text-[10px] font-mono text-slate-600 uppercase tracking-widest italic">
          Zero-hidden balance protocol enabled. All treasury movements are immutable.
        </p>
      </footer>
    </AppLayout>
  );
}