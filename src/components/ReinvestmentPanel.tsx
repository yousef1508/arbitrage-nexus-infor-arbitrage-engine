import React, { useState } from 'react';
import { useProposalsList, useStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { TrendingUp, RefreshCw, Check, X, ShieldAlert, Zap, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
export const ReinvestmentPanel = () => {
  const proposals = useProposalsList();
  const handleProposal = useStore(s => s.handleProposal);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const pendingProposals = React.useMemo(() => 
    (proposals || []).filter(p => p.status === 'pending'),
    [proposals]
  );
  const onAction = async (id: string, action: 'approved' | 'rejected') => {
    setProcessingId(id);
    await handleProposal(id, action);
    setProcessingId(null);
  };
  return (
    <Card className="bg-slate-950/60 border-slate-800 shadow-xl overflow-hidden">
      <CardHeader className="p-4 border-b border-slate-800/50 bg-slate-900/20">
        <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-amber-500" />
          Growth Proposals
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {pendingProposals.length > 0 ? (
          <div className="divide-y divide-slate-800/50">
            {pendingProposals.map((proposal) => (
              <div key={proposal.id} className="p-5 space-y-4 hover:bg-slate-900/20 transition-colors">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100">{proposal.title}</h3>
                    <p className="text-xs text-slate-500 mt-1">{proposal.description}</p>
                  </div>
                  <Badge variant="outline" className="text-[9px] font-mono border-amber-500/20 text-amber-500 bg-amber-500/5">
                    ${proposal.cost}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-4 py-2">
                  <div className="space-y-1">
                    <span className="text-[9px] text-slate-600 uppercase font-bold flex items-center gap-1">
                      <Zap className="h-2.5 w-2.5" /> Expected Impact
                    </span>
                    <p className="text-[11px] font-mono text-emerald-400 font-bold">{proposal.expected_benefit}</p>
                  </div>
                  <div className="space-y-1 text-right">
                    <span className="text-[9px] text-slate-600 uppercase font-bold">Confidence</span>
                    <p className="text-[11px] font-mono text-sky-400 font-bold">
                      {Math.round((proposal.confidence || 0) * 100)}%
                    </p>
                  </div>
                </div>
                <Accordion type="single" collapsible>
                  <AccordionItem value="rollback" className="border-none">
                    <AccordionTrigger className="p-0 text-[10px] uppercase font-bold text-slate-600 hover:text-slate-400 hover:no-underline">
                      <div className="flex items-center gap-2">
                        <Info className="h-3 w-3" /> Rollback Strategy
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-2 text-[10px] text-slate-500 leading-relaxed italic border-l-2 border-slate-800 pl-3 mt-2">
                      {proposal.rollback_plan}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => onAction(proposal.id, 'approved')}
                    disabled={!!processingId}
                    className="flex-1 h-8 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest"
                  >
                    {processingId === proposal.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                    Deploy Capital
                  </Button>
                  <Button
                    onClick={() => onAction(proposal.id, 'rejected')}
                    disabled={!!processingId}
                    variant="outline"
                    className="h-8 border-slate-800 text-slate-500 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/10 hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-16 text-center space-y-4 opacity-30">
            <TrendingUp className="h-10 w-10 text-slate-700 mx-auto" />
            <p className="text-[10px] text-slate-600 uppercase font-black tracking-widest">No Active Proposals</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};