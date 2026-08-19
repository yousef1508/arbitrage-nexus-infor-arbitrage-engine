import React, { useEffect, useMemo, useState } from 'react';
import {
  AppLayout } from '@/components/layout/AppLayout';
import { TreasuryOverview } from '@/components/TreasuryOverview';
import { PayPalWithdrawal } from '@/components/PayPalWithdrawal';
import {
  useLedgerEntries,
  useStore,
  useLastWithdrawalAt,
  useVerifiedRevenueNok,
  useVerifiedUnlocks,
  useTaxReceiptsList,
  useEarningAssetsList,
  useVerifiedRevenueOnly,
  useAgentSuggestionsList,
  useCryptoAcquisitionExpectedValueNok,
  usePatchPlanSummary,
  useCurrentPatchPlanItem
} from '@/lib/store';
import { Card,
  CardHeader,
  CardTitle,
  CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Wallet,
  History,
  ArrowUpRight,
  ArrowDownRight,
  Terminal,
  Clock,
  ShieldCheck,
  ReceiptText,
  RadioTower,
  LockKeyhole,
  Coins,
  AlertTriangle,
  Activity,
  Search,
  Filter,
  FileJson,
  ExternalLink,
  Shield,
  Banknote,
  Hash,
  CheckCircle2,
  TimerReset,
  Copy,
  Receipt,
  ServerCog,
  Lightbulb,
  ListChecks
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, addHours } from 'date-fns';
import { toast } from 'sonner';

type LedgerFilter = 'all' | 'credits' | 'debits' | 'verified' | 'pending';

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatNok(value: number | null | undefined) {
  return Number(value || 0).toLocaleString('nb-NO', {
    style: 'currency',
    currency: 'NOK',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatCompactNok(value: number | null | undefined) {
  return Number(value || 0).toLocaleString('nb-NO', {
    style: 'currency',
    currency: 'NOK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

function formatNumber(value: number | null | undefined, digits = 2) {
  return Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
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

function formatCountdown(timestamp?: number): string {
  const ts = safeNumber(timestamp, 0);

  if (!ts) return 'not scheduled';

  const diffMs = ts - Date.now();

  if (diffMs <= 0) {
    return formatAge(ts);
  }

  const minutes = Math.ceil(diffMs / 60000);

  if (minutes < 60) return `in ${minutes}m`;

  const hours = Math.ceil(minutes / 60);

  if (hours < 24) return `in ${hours}h`;

  const days = Math.ceil(hours / 24);

  return `in ${days}d`;
}

function isVerifiedLedgerEntry(entry: any) {
  const description = String(entry.description || '').toUpperCase();

  return (
    entry.verified === true ||
    description.includes('VERIFIED_CRYPTO_DEPOSIT') ||
    description.includes('VERIFIED_ONCHAIN_RECEIPT') ||
    description.includes('CRYPTO_DEPOSIT_VERIFIED')
  );
}

function isPendingValueLedgerEntry(entry: any) {
  const description = String(entry.description || '').toUpperCase();

  return description.includes('PENDING') || description.includes('VALUE_PENDING');
}

function getTxHashFromLedgerEntry(entry: any): string | null {
  const description = String(entry.description || '');
  const match = description.match(/TX:([0-9a-zA-Zx]+)/);

  return match?.[1] || entry.tx_hash || null;
}

function shortHash(value: string | null): string {
  if (!value) return 'n/a';
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function normalizeText(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function titleCase(value: unknown): string {
  return String(value || 'unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(label);
  } catch {
    toast.error('Clipboard copy failed');
  }
}

function MetricCard(props: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sublabel?: React.ReactNode;
  tone?: 'emerald' | 'sky' | 'amber' | 'pink' | 'violet' | 'red';
}) {
  const tone = props.tone || 'sky';

  return (
    <Card className="relative overflow-hidden bg-slate-950/60 border-slate-800 shadow-xl group">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-400/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      <CardContent className="p-5 flex items-center gap-4">
        <div
          className={cn(
            'p-3 rounded-xl shrink-0 border',
            tone === 'emerald' && 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
            tone === 'sky' && 'bg-sky-500/10 text-sky-400 border-sky-500/20',
            tone === 'amber' && 'bg-amber-500/10 text-amber-400 border-amber-500/20',
            tone === 'pink' && 'bg-pink-500/10 text-pink-400 border-pink-500/20',
            tone === 'violet' && 'bg-violet-500/10 text-violet-400 border-violet-500/20',
            tone === 'red' && 'bg-red-500/10 text-red-400 border-red-500/20'
          )}
        >
          {props.icon}
        </div>

        <div className="min-w-0">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
            {props.label}
          </p>

          <div className="text-xl font-mono font-black text-slate-100 truncate">
            {props.value}
          </div>

          {props.sublabel && (
            <p className="text-[10px] text-slate-600 font-mono mt-1 truncate">
              {props.sublabel}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function LedgerFilterButton(props: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={props.onClick}
      className={cn(
        'h-8 border-slate-800 bg-slate-950/60 font-mono text-[10px] uppercase tracking-widest',
        props.active
          ? 'border-pink-500/40 bg-pink-500/10 text-pink-300'
          : 'text-slate-500 hover:text-slate-200 hover:bg-slate-900'
      )}
    >
      {props.label}
      <Badge
        variant="outline"
        className="ml-2 h-4 px-1.5 text-[9px] border-slate-700 bg-slate-950 text-slate-400"
      >
        {props.count}
      </Badge>
    </Button>
  );
}

export function TreasuryPage() {
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>('all');
  const [query, setQuery] = useState('');

  const ledger = useLedgerEntries();
  const taxReceipts = useTaxReceiptsList();
  const lastWithdrawalAt = useLastWithdrawalAt();
  const verifiedRevenueNok = useVerifiedRevenueNok();
  const verifiedUnlocks = useVerifiedUnlocks();
  const verifiedRevenueOnly = useVerifiedRevenueOnly();

  const suggestions = useAgentSuggestionsList();
  const expectedAcquisitionValueNok = useCryptoAcquisitionExpectedValueNok();
  const patchPlanSummary = usePatchPlanSummary();
  const currentPatchPlanItem = useCurrentPatchPlanItem();
  const earningAssets = useEarningAssetsList() as any[];
  const treasury = useStore((state) => state.treasury);
  const systemHealth = useStore((state) => state.system_health);
  const marketStats = useStore((state) => state.market_stats);

  const cooldownActive = useMemo(() => {
    if (!lastWithdrawalAt) return false;
    return Date.now() - lastWithdrawalAt < 86400000;
  }, [lastWithdrawalAt]);

  const unlockTime = useMemo(() => {
    if (!lastWithdrawalAt) return null;
    return addHours(new Date(lastWithdrawalAt), 24);
  }, [lastWithdrawalAt]);

  const ledgerStats = useMemo(() => {
    const entries = ledger || [];
    const verifiedEntries = entries.filter(isVerifiedLedgerEntry);
    const pendingEntries = entries.filter(isPendingValueLedgerEntry);

    const credits = entries
      .filter((entry) => entry.type === 'credit')
      .reduce((sum, entry) => sum + safeNumber(entry.amount), 0);

    const debits = entries
      .filter((entry) => entry.type === 'debit')
      .reduce((sum, entry) => sum + safeNumber(entry.amount), 0);

    const verifiedCreditValue = entries
      .filter((entry) => entry.type === 'credit' && isVerifiedLedgerEntry(entry))
      .reduce((sum, entry) => sum + safeNumber(entry.amount), 0);

    const pendingCreditValue = entries
      .filter((entry) => entry.type === 'credit' && isPendingValueLedgerEntry(entry))
      .reduce((sum, entry) => sum + safeNumber(entry.amount), 0);

    return {
      total: entries.length,
      verified: verifiedEntries.length,
      pending: pendingEntries.length,
      credits,
      debits,
      net: credits - debits,
      verifiedCreditValue,
      pendingCreditValue,
      creditCount: entries.filter((entry) => entry.type === 'credit').length,
      debitCount: entries.filter((entry) => entry.type === 'debit').length
    };
  }, [ledger]);

  const assetStats = useMemo(() => {
    const assets = earningAssets || [];

    const locked = assets.filter((asset) => asset.unlock_status !== 'unlocked').length;
    const unlocked = assets.filter((asset) => asset.unlock_status === 'unlocked').length;
    const awaitingConversion = assets.filter((asset) => asset.payout_status === 'awaiting_conversion').length;
    const verifiedAssets = assets.filter((asset) => asset.payout_status === 'verified' || asset.unlock_status === 'unlocked');

    const totalListedValue = assets.reduce((sum, asset) => sum + safeNumber(asset.price_nok), 0);
    const totalVerifiedAssetRevenue = assets.reduce((sum, asset) => sum + safeNumber(asset.verified_revenue_nok), 0);
    const totalProjectedMarketValueUsd = assets.reduce((sum, asset) => {
      return sum + safeNumber(
        asset.projected_market_value_usd ??
          asset.full_report_json?.projected_market_value_usd ??
          asset.full_report_json?.pricing?.projected_market_value_usd
      );
    }, 0);

    const averagePrice = assets.length > 0 ? totalListedValue / assets.length : 0;

    const newestWithQuote = [...assets]
      .sort((a, b) => safeNumber(b.updated_at || b.created_at) - safeNumber(a.updated_at || a.created_at))
      .find((asset) => asset.payment_enforcement?.enabled);

    const quote = newestWithQuote?.payment_enforcement;

    return {
      total: assets.length,
      locked,
      unlocked,
      awaitingConversion,
      verifiedAssets: verifiedAssets.length,
      totalListedValue,
      totalVerifiedAssetRevenue,
      totalProjectedMarketValueUsd,
      averagePrice,
      quote,
      newestWithQuote
    };
  }, [earningAssets]);

  const taxStats = useMemo(() => {
    const receipts = taxReceipts || [];
    const verified = receipts.filter((receipt: any) => receipt.status === 'verified');
    const pending = receipts.filter((receipt: any) => receipt.status === 'pending_value');

    const fiatValue = verified.reduce(
      (sum: number, receipt: any) => sum + safeNumber(receipt.fiat_value_nok),
      0
    );

    return {
      total: receipts.length,
      verified: verified.length,
      pending: pending.length,
      fiatValue
    };
  }, [taxReceipts]);

  const controlStats = useMemo(() => {
    const suggestionList = Array.isArray(suggestions) ? suggestions : [];
    const openSuggestions = suggestionList.filter((item: any) =>
      !item.status || item.status === 'suggested' || item.status === 'approved'
    );

    return {
      openSuggestions: openSuggestions.length,
      highSuggestions: openSuggestions.filter((item: any) => item.priority === 'high').length,
      urgentSuggestions: openSuggestions.filter((item: any) => item.priority === 'urgent').length,
      expectedAcquisitionValueNok,
      patchDone: safeNumber(patchPlanSummary?.status_summary?.done),
      patchPending: safeNumber(patchPlanSummary?.status_summary?.pending),
      patchBlocked: safeNumber(patchPlanSummary?.status_summary?.blocked),
      patchTotal: safeNumber(patchPlanSummary?.status_summary?.total),
      nextPatchPath: currentPatchPlanItem?.file_path || 'none',
      nextPatchPurpose: currentPatchPlanItem?.purpose || 'No active patch-plan item.'
    };
  }, [suggestions, expectedAcquisitionValueNok, patchPlanSummary, currentPatchPlanItem]);

  const filteredLedger = useMemo(() => {
    const q = query.trim().toLowerCase();

    return [...(ledger || [])]
      .sort((a, b) => safeNumber(b.timestamp) - safeNumber(a.timestamp))
      .filter((entry) => {
        const verified = isVerifiedLedgerEntry(entry);
        const pending = isPendingValueLedgerEntry(entry);

        if (ledgerFilter === 'credits' && entry.type !== 'credit') return false;
        if (ledgerFilter === 'debits' && entry.type !== 'debit') return false;
        if (ledgerFilter === 'verified' && !verified) return false;
        if (ledgerFilter === 'pending' && !pending) return false;

        if (!q) return true;

        const haystack = [
          entry.id,
          entry.description,
          entry.type,
          entry.bucket,
          entry.agent_id,
          entry.opportunity_id,
          entry.asset_id,
          entry.tx_hash,
          getTxHashFromLedgerEntry(entry)
        ].join(' ').toLowerCase();

        return haystack.includes(q);
      });
  }, [ledger, ledgerFilter, query]);

  const filterCounts = useMemo(() => {
    const entries = ledger || [];

    return {
      all: entries.length,
      credits: entries.filter((entry) => entry.type === 'credit').length,
      debits: entries.filter((entry) => entry.type === 'debit').length,
      verified: entries.filter(isVerifiedLedgerEntry).length,
      pending: entries.filter(isPendingValueLedgerEntry).length
    };
  }, [ledger]);

  const aiQuotaMode = String((systemHealth as any)?.ai_quota_mode || (systemHealth as any)?.ai_quota?.mode || 'available');
  const nextScheduledCycle = safeNumber((systemHealth as any)?.next_scheduled_cycle_at);
  const lastRunStatus = String(systemHealth?.last_run?.status || 'idle');

  const copyTreasurySummary = async () => {
    const summary = [
      `Treasury total: ${formatNok(treasury?.total || 0)}`,
      `Verified revenue: ${formatNok(verifiedRevenueNok)}`,
      `Verified unlocks: ${verifiedUnlocks}`,
      `Ledger net: ${formatNok(ledgerStats.net)}`,
      `Tax receipts: ${taxStats.total}`,
      `Locked reports: ${assetStats.locked}`,
      `Unlocked reports: ${assetStats.unlocked}`,
      `Listed report value: ${formatNok(assetStats.totalListedValue)}`,
      `Expected acquisition value: ${formatNok(controlStats.expectedAcquisitionValueNok)}`,
      `Projected market value USD: ${formatNumber(assetStats.totalProjectedMarketValueUsd, 0)}`,
      `Revenue policy: verified-only`,
      `Oracle: ${assetStats.quote?.quote_provider || 'unavailable'}`
    ].join('\n');

    await copyText(summary, 'Treasury summary copied');
  };  useEffect(() => {
    void useStore.getState().fetchSystemState(false);
  }, []);

  return (
    <AppLayout container contentClassName="space-y-10 max-w-7xl mx-auto px-4 py-10">
      <header className="relative overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-950/65 p-6 shadow-2xl">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,rgba(236,72,153,0.16),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.12),transparent_35%)]" />

        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-pink-500 to-emerald-500 flex items-center justify-center shadow-2xl shadow-pink-500/20 shrink-0">
                <Wallet className="h-7 w-7 text-white" />
              </div>

              <div className="space-y-1">
                <h1 className="text-4xl font-black tracking-tighter">
                  TREASURY <span className="text-slate-500">&</span> LEDGER
                </h1>

                <p className="text-slate-500 font-mono text-xs uppercase tracking-widest flex items-center gap-2">
                  <ShieldCheck className="h-3 w-3 text-emerald-500" />
                  Verified revenue distribution - live POL/NOK unlock accounting
                </p>

                <p className="text-[10px] text-slate-600 font-mono uppercase tracking-widest max-w-3xl">
                  Projected value and expected acquisition value are excluded from treasury. Operating balance only moves after verified external payment or payout ledger activity.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="bg-emerald-500/10 border-emerald-500/20 text-emerald-400 font-mono text-[10px] uppercase"
              >
                Verified revenue: {formatNok(verifiedRevenueNok)}
              </Badge>

              <Badge
                variant="outline"
                className="bg-sky-500/10 border-sky-500/20 text-sky-400 font-mono text-[10px] uppercase"
              >
                Unlocks: {verifiedUnlocks}
              </Badge>

              <Badge
                variant="outline"
                className={cn(
                  'font-mono text-[10px] uppercase',
                  assetStats.quote?.quote_fallback
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                    : assetStats.quote
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : 'bg-red-500/10 border-red-500/20 text-red-400'
                )}
              >
                Oracle: {assetStats.quote?.quote_provider || 'unavailable'}
              </Badge>

              <Badge
                variant="outline"
                className="bg-violet-500/10 border-violet-500/20 text-violet-300 font-mono text-[10px] uppercase"
              >
                AI: {aiQuotaMode}
              </Badge>
            </div>
          </div>

          <div className="flex flex-col xl:items-end gap-3">
            <div className="flex flex-wrap gap-2 xl:justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={copyTreasurySummary}
                className="bg-slate-950/70 border-slate-800 text-slate-300 font-mono text-[10px] uppercase hover:bg-slate-900"
              >
                <Copy className="h-3.5 w-3.5 mr-2" />
                Copy summary
              </Button>

              <a href="/api/reports.json" target="_blank" rel="noreferrer">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="bg-slate-950/70 border-slate-800 text-slate-300 font-mono text-[10px] uppercase hover:bg-slate-900"
                >
                  <FileJson className="h-3.5 w-3.5 mr-2" />
                  reports.json
                  <ExternalLink className="h-3 w-3 ml-2" />
                </Button>
              </a>
            </div>

            <PayPalWithdrawal disabled={cooldownActive} />

            {cooldownActive && unlockTime && (
              <Badge
                variant="outline"
                className="bg-amber-500/10 border-amber-500/20 text-amber-500 font-mono text-[10px] uppercase w-fit"
              >
                <Clock className="h-3 w-3 mr-1.5" />
                Withdrawal unlocked in {formatDistanceToNow(unlockTime)}
              </Badge>
            )}
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <MetricCard
          tone="emerald"
          icon={<ReceiptText className="h-5 w-5" />}
          label="Verified revenue"
          value={formatNok(verifiedRevenueNok)}
          sublabel={`${verifiedUnlocks || 0} paid unlocks`}
        />

        <MetricCard
          tone="sky"
          icon={<LockKeyhole className="h-5 w-5" />}
          label="Locked reports"
          value={assetStats.locked}
          sublabel={`${assetStats.total} total intelligence assets`}
        />

        <MetricCard
          tone={assetStats.quote?.quote_fallback ? 'amber' : assetStats.quote ? 'emerald' : 'red'}
          icon={<RadioTower className="h-5 w-5" />}
          label="POL/NOK basis"
          value={
            assetStats.quote?.native_price_nok
              ? `${formatNumber(assetStats.quote.native_price_nok, 6)} NOK`
              : 'unavailable'
          }
          sublabel={
            assetStats.quote
              ? `${assetStats.quote.quote_provider}${assetStats.quote.quote_stale ? ' - stale' : ''}${assetStats.quote.quote_fallback ? ' - fallback' : ''}`
              : 'no quote loaded'
          }
        />

        <MetricCard
          tone="pink"
          icon={<Coins className="h-5 w-5" />}
          label="Ledger net"
          value={formatNok(ledgerStats.net)}
          sublabel={`${ledgerStats.total} committed ledger rows`}
        />
      </section>

      <section className="animate-in fade-in slide-up duration-700">
        <TreasuryOverview />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <MetricCard
          tone="violet"
          icon={<Receipt className="h-5 w-5" />}
          label="Tax receipts"
          value={taxStats.total}
          sublabel={`${taxStats.verified} verified - ${taxStats.pending} pending`}
        />

        <MetricCard
          tone="emerald"
          icon={<Banknote className="h-5 w-5" />}
          label="Verified ledger credits"
          value={formatNok(ledgerStats.verifiedCreditValue)}
          sublabel={`${ledgerStats.verified} verified entries`}
        />

        <MetricCard
          tone={ledgerStats.pending > 0 ? 'amber' : 'sky'}
          icon={<TimerReset className="h-5 w-5" />}
          label="Pending valuation"
          value={formatNok(ledgerStats.pendingCreditValue)}
          sublabel={`${ledgerStats.pending} pending rows`}
        />

        <MetricCard
          tone="sky"
          icon={<ServerCog className="h-5 w-5" />}
          label="Runtime state"
          value={titleCase(lastRunStatus)}
          sublabel={nextScheduledCycle ? `next cycle ${formatCountdown(nextScheduledCycle)}` : 'scheduler warming up'}
        />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Card className="bg-slate-950/60 border-slate-800 shadow-xl">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Accounting boundary
                </p>
                <p className="text-xl font-mono font-black text-emerald-300">
                  {verifiedRevenueOnly ? 'Verified only' : 'Policy warning'}
                </p>
              </div>
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed font-mono">
              Treasury balance, owner-withdrawable funds, tax receipts, and ledger revenue only move after verified external receipt evidence.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-950/60 border-slate-800 shadow-xl">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Expected acquisition value
                </p>
                <p className="text-xl font-mono font-black text-amber-300">
                  {formatCompactNok(controlStats.expectedAcquisitionValueNok)}
                </p>
              </div>
              <Lightbulb className="h-5 w-5 text-amber-400" />
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed font-mono">
              {controlStats.openSuggestions} open suggestions, {controlStats.highSuggestions} high priority. Expected value is not verified revenue.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-950/60 border-slate-800 shadow-xl">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Patch plan
                </p>
                <p className="text-sm font-mono font-black text-sky-300 break-all">
                  {controlStats.nextPatchPath}
                </p>
              </div>
              <ListChecks className="h-5 w-5 text-sky-400" />
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed font-mono">
              Done {controlStats.patchDone}/{controlStats.patchTotal || 0}. Pending {controlStats.patchPending}. Blocked {controlStats.patchBlocked}. {controlStats.nextPatchPurpose}
            </p>
          </CardContent>
        </Card>
      </section>

      {(assetStats.totalProjectedMarketValueUsd > 0 || controlStats.expectedAcquisitionValueNok > 0) && (
        <div className="p-5 bg-amber-500/5 border border-amber-500/20 rounded-2xl flex items-start gap-4">
          <div className="p-2 bg-amber-500/10 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
          </div>

          <div className="space-y-1">
            <p className="text-[10px] font-black text-amber-300 uppercase tracking-widest">
              Projected values are not revenue
            </p>

            <p className="text-[11px] text-slate-400 leading-relaxed max-w-4xl">
              Projected report market value ({formatNumber(assetStats.totalProjectedMarketValueUsd, 0)} USD)
              and expected acquisition value ({formatCompactNok(controlStats.expectedAcquisitionValueNok)})
              are prioritization signals only. They are not ledger revenue, treasury balance, verified revenue, tax receipts, or owner-withdrawable funds.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 pt-2">
        <Card className="xl:col-span-4 bg-slate-950/60 border-slate-800 shadow-2xl overflow-hidden border-t-2 border-t-sky-500/30">
          <CardHeader className="p-6 border-b border-slate-800/50 bg-slate-900/20">
            <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
              <RadioTower className="h-4 w-4 text-sky-400" />
              Payment Oracle State
            </CardTitle>
          </CardHeader>

          <CardContent className="p-6 space-y-5">
            {assetStats.quote ? (
              <>
                <div className="space-y-2">
                  <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">
                    Current payment basis
                  </p>

                  <p className="text-3xl font-mono font-black text-slate-100">
                    {formatNumber(assetStats.quote.native_price_nok, 6)}
                    <span className="text-sm text-slate-500 ml-2">NOK/POL</span>
                  </p>

                  <p className="text-[10px] text-slate-600 font-mono">
                    newest quoted asset: {assetStats.newestWithQuote?.id || 'n/a'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                    <p className="text-[9px] text-slate-600 font-black uppercase">Provider</p>
                    <p className="text-xs font-mono text-slate-200 mt-1 truncate">
                      {assetStats.quote.quote_provider || 'unknown'}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                    <p className="text-[9px] text-slate-600 font-black uppercase">Source ID</p>
                    <p className="text-xs font-mono text-slate-200 mt-1 truncate">
                      {assetStats.quote.quote_source_id || 'unknown'}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                    <p className="text-[9px] text-slate-600 font-black uppercase">Stale</p>
                    <p
                      className={cn(
                        'text-xs font-mono mt-1',
                        assetStats.quote.quote_stale ? 'text-amber-400' : 'text-emerald-400'
                      )}
                    >
                      {assetStats.quote.quote_stale ? 'YES' : 'NO'}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                    <p className="text-[9px] text-slate-600 font-black uppercase">Fallback</p>
                    <p
                      className={cn(
                        'text-xs font-mono mt-1',
                        assetStats.quote.quote_fallback ? 'text-amber-400' : 'text-emerald-400'
                      )}
                    >
                      {assetStats.quote.quote_fallback ? 'YES' : 'NO'}
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800">
                  <p className="text-[9px] text-slate-600 font-black uppercase tracking-widest mb-1">
                    Last quote fetch
                  </p>

                  <p className="text-[10px] font-mono text-slate-400">
                    {assetStats.quote.quote_fetched_at_iso || 'unknown'}
                  </p>
                </div>

                {assetStats.quote.quote_fallback && (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex gap-3">
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />

                    <p className="text-[11px] text-amber-200/80 leading-relaxed">
                      Configured fallback is active. This is acceptable for local resilience, but live production pricing should prefer a live quote provider when rate limits permit.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="py-16 text-center opacity-30 space-y-3">
                <RadioTower className="h-10 w-10 mx-auto" />
                <p className="text-[10px] font-mono uppercase tracking-widest">
                  No payment quote loaded
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-8 bg-slate-950/60 border-slate-800 shadow-2xl relative overflow-hidden border-t-2 border-t-pink-500/30">
          <CardHeader className="p-6 border-b border-slate-800/50 bg-slate-900/20 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                  <History className="h-4 w-4 text-pink-400" />
                  Verified Treasury Ledger
                </CardTitle>

                <p className="text-[10px] text-slate-600 font-mono uppercase">
                  External settlement, payment unlocks, and treasury integrity tracking
                </p>
              </div>

              <div className="hidden sm:flex items-center gap-2">
                <div className="text-[10px] font-mono text-slate-500 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
                  LOGS: {ledgerStats.total}
                </div>

                <div className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                  VERIFIED: {ledgerStats.verified}
                </div>

                {ledgerStats.pending > 0 && (
                  <div className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
                    PENDING: {ledgerStats.pending}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_170px] gap-3">
              <div className="relative min-w-0">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search ledger, tx hash, agent, asset, bucket..."
                  className="pl-9 bg-slate-950/80 border-slate-800 font-mono text-xs"
                />
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setQuery('');
                  setLedgerFilter('all');
                }}
                className="border-slate-800 bg-slate-950/80 text-slate-400 font-mono text-[10px] uppercase"
              >
                <Filter className="h-4 w-4 mr-2" />
                Reset filters
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <LedgerFilterButton
                active={ledgerFilter === 'all'}
                label="All"
                count={filterCounts.all}
                onClick={() => setLedgerFilter('all')}
              />
              <LedgerFilterButton
                active={ledgerFilter === 'credits'}
                label="Credits"
                count={filterCounts.credits}
                onClick={() => setLedgerFilter('credits')}
              />
              <LedgerFilterButton
                active={ledgerFilter === 'debits'}
                label="Debits"
                count={filterCounts.debits}
                onClick={() => setLedgerFilter('debits')}
              />
              <LedgerFilterButton
                active={ledgerFilter === 'verified'}
                label="Verified"
                count={filterCounts.verified}
                onClick={() => setLedgerFilter('verified')}
              />
              <LedgerFilterButton
                active={ledgerFilter === 'pending'}
                label="Pending"
                count={filterCounts.pending}
                onClick={() => setLedgerFilter('pending')}
              />
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <ScrollArea className="h-[650px] bg-black/20">
              {filteredLedger.length > 0 ? (
                <div className="divide-y divide-slate-800/40">
                  {filteredLedger.map((entry, index) => {
                    const verified = isVerifiedLedgerEntry(entry);
                    const pending = isPendingValueLedgerEntry(entry);
                    const txHash = getTxHashFromLedgerEntry(entry);

                    return (
                      <div
                        key={entry.id || `${entry.timestamp}-${index}`}
                        className="p-5 hover:bg-slate-900/40 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-5 group"
                      >
                        <div className="flex items-start gap-5 min-w-0">
                          <div
                            className={cn(
                              'p-2.5 rounded-xl transition-colors shadow-sm shrink-0 border',
                              entry.type === 'credit'
                                ? verified
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                  : pending
                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                    : 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                                : 'bg-red-500/10 text-red-400 border-red-500/20'
                            )}
                          >
                            {entry.type === 'credit' ? (
                              <ArrowUpRight className="h-5 w-5" />
                            ) : (
                              <ArrowDownRight className="h-5 w-5" />
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-bold text-slate-100 tracking-tight break-words">
                                {entry.description}
                              </span>

                              <Badge
                                variant="outline"
                                className="text-[9px] font-mono bg-slate-900 border-slate-800 text-slate-500 uppercase px-1.5 py-0 h-4"
                              >
                                {entry.bucket || 'operating'}
                              </Badge>

                              {verified && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] font-mono bg-emerald-500/10 border-emerald-500/20 text-emerald-400 uppercase px-1.5 py-0 h-4"
                                >
                                  VERIFIED
                                </Badge>
                              )}

                              {pending && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] font-mono bg-amber-500/10 border-amber-500/20 text-amber-400 uppercase px-1.5 py-0 h-4"
                                >
                                  VALUE_PENDING
                                </Badge>
                              )}
                            </div>

                            <div className="text-[10px] text-slate-500 mt-2 font-mono flex flex-wrap items-center gap-2">
                              <Clock className="h-3 w-3" />
                              {new Date(entry.timestamp).toLocaleString()}

                              <span className="text-slate-700">|</span>

                              <Activity className="h-3 w-3" />
                              Agent:{' '}
                              <span className="text-sky-500/70">
                                {entry.agent_id?.toUpperCase() || 'SYSTEM'}
                              </span>

                              {txHash && (
                                <>
                                  <span className="text-slate-700">|</span>
                                  <Hash className="h-3 w-3" />
                                  TX:{' '}
                                  <button
                                    type="button"
                                    onClick={() => void copyText(txHash, 'Transaction hash copied')}
                                    className="text-slate-300 hover:text-sky-300 transition-colors"
                                  >
                                    {shortHash(txHash)}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div
                          className={cn(
                            'font-mono font-black text-lg tabular-nums lg:text-right shrink-0',
                            entry.type === 'credit'
                              ? verified
                                ? 'text-emerald-400'
                                : pending
                                  ? 'text-amber-400'
                                  : 'text-sky-400'
                              : 'text-red-400'
                          )}
                        >
                          {entry.type === 'credit' ? '+' : '-'}
                          {formatNok(entry.amount || 0)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-48 text-center space-y-6 opacity-25">
                  <Terminal className="h-16 w-16 text-slate-600" />

                  <div className="space-y-1">
                    <p className="text-xs font-mono uppercase tracking-[0.3em]">
                      No matching ledger entries
                    </p>

                    <p className="text-[10px] font-mono">
                      Reports can be published and locked, but treasury remains zero until payment verification.
                    </p>
                  </div>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-950/60 border-slate-800 shadow-2xl overflow-hidden border-t-2 border-t-emerald-500/30">
        <CardHeader className="p-6 border-b border-slate-800/50 bg-slate-900/20 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
              <Receipt className="h-4 w-4 text-emerald-400" />
              Tax Receipt Trail
            </CardTitle>

            <p className="text-[10px] text-slate-600 font-mono uppercase">
              On-chain receipt valuation records for tax and reconciliation review
            </p>
          </div>

          <Badge
            variant="outline"
            className="bg-emerald-500/10 border-emerald-500/20 text-emerald-400 font-mono text-[10px] uppercase w-fit"
          >
            <CheckCircle2 className="h-3 w-3 mr-1.5" />
            {formatNok(taxStats.fiatValue)} verified valuation
          </Badge>
        </CardHeader>

        <CardContent className="p-0">
          <ScrollArea className="h-[320px] bg-black/20">
            {(taxReceipts?.length ?? 0) > 0 ? (
              <div className="divide-y divide-slate-800/40">
                {taxReceipts.map((receipt: any, index: number) => (
                  <div
                    key={receipt.id || `${receipt.tx_hash}-${index}`}
                    className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-900/40 transition-colors"
                  >
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[9px] font-mono uppercase',
                            receipt.status === 'verified'
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                              : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                          )}
                        >
                          {receipt.status || 'unknown'}
                        </Badge>

                        <Badge
                          variant="outline"
                          className="text-[9px] font-mono uppercase bg-slate-900 border-slate-800 text-slate-500"
                        >
                          {receipt.type || 'receipt'}
                        </Badge>

                        <span className="text-[10px] font-mono text-slate-600">
                          {receipt.id}
                        </span>
                      </div>

                      <p className="text-sm font-bold text-slate-200">
                        {receipt.asset_symbol || 'asset'} {receipt.amount_crypto || ''}
                      </p>

                      <p className="text-[10px] font-mono text-slate-500">
                        TX: {shortHash(receipt.tx_hash || null)} - Created {receipt.created_at ? new Date(receipt.created_at).toLocaleString() : 'n/a'}
                      </p>

                      <p className="text-[10px] text-slate-600 leading-relaxed">
                        {normalizeText(receipt.notes)}
                      </p>
                    </div>

                    <div className="lg:text-right shrink-0">
                      <p
                        className={cn(
                          'text-lg font-mono font-black',
                          receipt.status === 'verified' ? 'text-emerald-400' : 'text-amber-400'
                        )}
                      >
                        {receipt.fiat_value_nok === null || receipt.fiat_value_nok === undefined
                          ? 'PENDING'
                          : formatNok(receipt.fiat_value_nok)}
                      </p>

                      <p className="text-[10px] font-mono text-slate-600 uppercase">
                        {receipt.valuation_status || 'unknown valuation'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-24 text-center opacity-25 space-y-3">
                <Shield className="h-12 w-12 mx-auto text-slate-600" />
                <p className="text-[10px] font-mono uppercase tracking-[0.3em]">
                  No tax receipts recorded yet
                </p>
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <footer className="pt-10 flex justify-center opacity-40">
        <p className="text-[10px] font-mono text-slate-600 uppercase tracking-widest italic">
          Verified-only balance protocol enabled. Projected value never enters treasury.
        </p>
      </footer>
    </AppLayout>
  );
}

export default TreasuryPage;

