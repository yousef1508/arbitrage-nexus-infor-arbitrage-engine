import React, { useMemo } from 'react';
import { useAgentsList, useLedgerEntries, useTradingEnabled } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Zap,
  ShieldCheck,
  Activity,
  Cpu,
  Search,
  TrendingUp,
  Clock,
  ShoppingCart,
  Gift,
  Coins,
  Lock
} from 'lucide-react';
import { cn } from '@/lib/utils';

const getAgentIcon = (role: string) => {
  switch (role) {
    case 'scout':
      return Search;
    case 'analyst':
      return Activity;
    case 'router':
      return Cpu;
    case 'content_arb':
      return TrendingUp;
    case 'affiliate':
      return Zap;
    case 'resale':
      return ShoppingCart;
    case 'referral':
      return Gift;
    case 'trading':
      return Coins;
    default:
      return ShieldCheck;
  }
};

interface AgentCardProps {
  agent: any;
  ledger: any[];
  tradingEnabled: boolean;
}

function formatNok(value: number) {
  return value.toLocaleString('nb-NO', {
    style: 'currency',
    currency: 'NOK',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function getVerifiedRevenueForAgent(agentRole: string, ledger: any[]) {
  if (!agentRole) return 0;

  return (ledger || [])
    .filter((entry) => {
      const isCredit = entry.type === 'credit';
      const matchesAgent = entry.agent_id === agentRole;
      const isVerified =
        String(entry.description || '').includes('VERIFIED') ||
        String(entry.description || '').includes('CRYPTO_DEPOSIT') ||
        String(entry.description || '').includes('REVENUE');

      return isCredit && matchesAgent && isVerified;
    })
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
}

function getHourlyVerifiedRevenueForAgent(agentRole: string, ledger: any[]) {
  if (!agentRole) return 0;

  const oneHourAgo = Date.now() - 3600000;

  return (ledger || [])
    .filter((entry) => {
      const isCredit = entry.type === 'credit';
      const matchesAgent = entry.agent_id === agentRole;
      const isRecent = Number(entry.timestamp || 0) > oneHourAgo;
      const isVerified =
        String(entry.description || '').includes('VERIFIED') ||
        String(entry.description || '').includes('CRYPTO_DEPOSIT') ||
        String(entry.description || '').includes('REVENUE');

      return isCredit && matchesAgent && isRecent && isVerified;
    })
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
}

function AgentCard({ agent, ledger, tradingEnabled }: AgentCardProps) {
  const Icon = getAgentIcon(agent.role || '');

  const isTradingAgent = agent.role === 'trading';
  const isLocked = isTradingAgent && !tradingEnabled;
  const isDev = agent.status === 'in_development';

  const verifiedRevenue = useMemo(
    () => getVerifiedRevenueForAgent(agent.role, ledger),
    [agent.role, ledger]
  );

  const hourlyVerifiedRevenue = useMemo(
    () => getHourlyVerifiedRevenueForAgent(agent.role, ledger),
    [agent.role, ledger]
  );

  const isUninitialized =
    (agent.health ?? 0) === 0 &&
    verifiedRevenue === 0 &&
    (agent.capital_allocated ?? 0) === 0;

  const verifiedRoi = useMemo(() => {
    const capital = Number(agent.capital_allocated ?? 0);
    return capital > 0 ? ((verifiedRevenue - capital) / capital) * 100 : 0;
  }, [verifiedRevenue, agent.capital_allocated]);

  return (
    <Card
      className={cn(
        'bg-slate-950/50 border-slate-800 backdrop-blur-sm overflow-hidden group transition-all',
        isLocked && 'opacity-40 grayscale-[0.8]',
        isDev && 'opacity-60 grayscale-[0.5]',
        isUninitialized && !isDev && 'border-dashed'
      )}
    >
      <CardHeader className="p-4 pb-2 border-b border-slate-800/50 flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'p-2 rounded-lg bg-slate-800 transition-transform group-hover:scale-110',
              isLocked ? 'text-slate-600' : 'text-sky-400'
            )}
          >
            <Icon className="h-4 w-4" />
          </div>

          <div>
            <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-100 flex items-center gap-2">
              {(agent.role || '').replace(/_/g, ' ')}
              {isLocked && <Lock className="h-3 w-3 text-amber-500" />}
            </CardTitle>

            <div className="flex items-center gap-1.5 mt-0.5">
              <div
                className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  isLocked
                    ? 'bg-amber-500'
                    : isUninitialized
                      ? 'bg-slate-800'
                      : agent.status === 'idle'
                        ? 'bg-slate-600'
                        : 'bg-emerald-500 animate-pulse'
                )}
              />

              <span className="text-[10px] font-mono text-slate-500 uppercase">
                {isLocked
                  ? 'LOCKED_BY_GOVERNOR'
                  : isUninitialized
                    ? 'WAITING_VERIFIED_OUTPUT'
                    : agent.status || 'OFFLINE'}
              </span>
            </div>
          </div>
        </div>

        <Badge
          variant="outline"
          className={cn(
            'text-[10px] font-mono',
            (agent.health ?? 0) > 90
              ? 'text-emerald-400 border-emerald-400/20'
              : 'text-slate-600 border-slate-800'
          )}
        >
          {agent.health ?? 0}% HEALTH
        </Badge>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <span className="text-[9px] text-slate-500 uppercase font-bold tracking-tighter">
              Verified Revenue
            </span>

            <div className="text-sm font-mono font-bold text-emerald-400">
              {formatNok(verifiedRevenue)}
            </div>
          </div>

          <div className="space-y-1 text-right">
            <span className="text-[9px] text-slate-500 uppercase font-bold tracking-tighter">
              Capital Allocated
            </span>

            <div className="text-sm font-mono font-bold text-amber-500">
              {formatNok(agent.capital_allocated || 0)}
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-[9px] text-slate-500 uppercase font-bold tracking-tighter">
            <span>Verified ROI</span>

            <span className={cn(verifiedRoi > 0 ? 'text-emerald-400' : 'text-slate-500')}>
              {`${Math.round(verifiedRoi)}%`}
            </span>
          </div>

          <Progress
            value={Math.max(0, Math.min(verifiedRoi, 100))}
            className="h-1 bg-slate-800"
          />
        </div>

        <div className="pt-2 flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-800/50">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />

            <span className="truncate font-mono">
              {agent.lastActive
                ? new Date(agent.lastActive).toLocaleTimeString()
                : 'WAITING_FIRST_CYCLE'}
            </span>
          </div>

          <div className="text-emerald-500 font-bold whitespace-nowrap font-mono">
            {formatNok(hourlyVerifiedRevenue)}/hr
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function AgentOversight() {
  const agents = useAgentsList();
  const ledger = useLedgerEntries();
  const tradingEnabled = useTradingEnabled();

  if (!agents || agents.length === 0) {
    return (
      <div className="py-20 text-center opacity-40">
        <Cpu className="h-12 w-12 mx-auto mb-4 text-slate-700" />
        <p className="text-xs font-mono uppercase tracking-[0.2em]">
          AWAITING_FLEET_INITIALIZATION
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {agents.map((agent) => (
        <AgentCard
          key={agent.role}
          agent={agent}
          ledger={ledger}
          tradingEnabled={tradingEnabled}
        />
      ))}
    </div>
  );
}