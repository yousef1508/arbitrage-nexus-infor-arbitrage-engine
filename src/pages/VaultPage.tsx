import React, { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Activity,
  AlertTriangle,
  ArrowDownUp,
  Bot,
  Coins,
  Copy,
  Database,
  ExternalLink,
  Eye,
  FileJson,
  Filter,
  Gauge,
  Layers,
  LockKeyhole,
  RadioTower,
  ReceiptText,
  Search,
  ShieldCheck,
  Signal,
  TrendingUp,
  UnlockKeyhole,
  Zap
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useStore,
  useOpportunitiesList,
  useEarningAssetsList,
  useAgentSuggestionsList,
  useApprovedCryptoAcquisitionCandidates,
  useCryptoAcquisitionExpectedValueNok,
  useCurrentPatchPlanItem,
  usePatchPlanSummary,
  useRunCryptoAcquisition,
  useVerifiedRevenueOnly
} from '@/lib/store';

type VaultFilter = 'all' | 'active' | 'expired' | 'priced' | 'high_value' | 'reports';
type SortMode = 'newest' | 'value' | 'price' | 'risk';

const EMPTY_ARRAY: any[] = Object.freeze([]) as any[];

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function cleanText(value: unknown): string {
  return String(value ?? '')
    .replace(/\uFFFD/g, '')
    .replace(/ÃƒÂ¯Ã‚Â¿Ã‚Â½/g, '')
    .replace(/Ã‚Â·/g, '·')
    .replace(/Ã¢â‚¬Â¦/g, '…')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatNok(value: unknown): string {
  return safeNumber(value).toLocaleString('nb-NO', {
    style: 'currency',
    currency: 'NOK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

function formatUsd(value: unknown): string {
  return safeNumber(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

function safeDate(value: unknown): string {
  const timestamp = safeNumber(value, 0);
  return timestamp > 0 ? new Date(timestamp).toLocaleString() : 'n/a';
}

function shortText(value: unknown, max = 180): string {
  const text = cleanText(value);
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function getOpportunityPriceNok(opp: any): number {
  return safeNumber(opp?.price_nok ?? opp?.recommended_price_nok, 0);
}

function getOpportunityMarketValueUsd(opp: any): number {
  return safeNumber(opp?.projected_market_value_usd ?? opp?.potential_profit, 0);
}

function getResolvedPriceNok(opp: any, linkedAsset?: any): number {
  return safeNumber(
    linkedAsset?.price_nok ??
      linkedAsset?.full_report_json?.pricing?.price_nok ??
      opp?.price_nok ??
      opp?.recommended_price_nok,
    0
  );
}

function getResolvedMarketValueUsd(opp: any, linkedAsset?: any): number {
  return safeNumber(
    linkedAsset?.projected_market_value_usd ??
      linkedAsset?.full_report_json?.pricing?.projected_market_value_usd ??
      opp?.projected_market_value_usd ??
      opp?.potential_profit,
    0
  );
}

function getResolvedMarketValueScore(opp: any, linkedAsset?: any): number {
  return safeNumber(
    linkedAsset?.market_value_score ??
      linkedAsset?.full_report_json?.pricing?.market_value_score ??
      opp?.market_value_score,
    0
  );
}

function isExpired(opp: any): boolean {
  const expiry = safeNumber(opp?.expiry_time, 0);
  return expiry > 0 && expiry < Date.now();
}

function isHighValue(opp: any, linkedAsset?: any): boolean {
  return (
    getResolvedMarketValueScore(opp, linkedAsset) >= 0.78 ||
    getResolvedMarketValueUsd(opp, linkedAsset) >= 5000 ||
    getResolvedPriceNok(opp, linkedAsset) >= 199
  );
}

function sourceLabel(opp: any): string {
  const refs = asArray<unknown>(opp?.source_refs);
  const sourceId = refs
    .map(ref => cleanText(ref))
    .find(ref => ref.toLowerCase().startsWith('source id:'));

  return sourceId?.replace(/source id:/i, '').trim() || 'source_registry';
}

function assetForOpportunity(opp: any, assets: any[]): any | undefined {
  return assets.find(asset =>
    asset?.id === opp?.report_asset_id ||
    asset?.slug === opp?.report_slug ||
    asset?.opportunity_id === opp?.id
  );
}

function percent(value: unknown): number {
  return Math.max(0, Math.min(100, Math.round(safeNumber(value) * 100)));
}

function copyToClipboard(value: string, label = 'Copied'): void {
  navigator.clipboard
    .writeText(value)
    .then(() => toast.success(label))
    .catch(() => toast.error('Clipboard copy failed'));
}

function executionBadgeClass(status: unknown): string {
  const normalized = cleanText(status).toLowerCase();

  return cn(
    'font-mono text-[9px] uppercase tracking-widest px-2 py-0 h-5 border',
    ['executed', 'implemented', 'verified_revenue'].includes(normalized) &&
      'bg-emerald-500/10 border-emerald-500/20 text-emerald-300',
    ['external_blocked', 'blocked', 'skipped_recent'].includes(normalized) &&
      'bg-amber-500/10 border-amber-500/20 text-amber-300',
    ['failed', 'error', 'crashed'].includes(normalized) &&
      'bg-red-500/10 border-red-500/20 text-red-300',
    ['queued', 'approved', 'running'].includes(normalized) &&
      'bg-sky-500/10 border-sky-500/20 text-sky-300',
    !normalized && 'bg-slate-900/70 border-slate-800 text-slate-400',
    normalized === 'unknown' && 'bg-slate-900/70 border-slate-800 text-slate-400'
  );
}

function ScorePill(props: {
  label: string;
  value: number;
  tone?: 'sky' | 'emerald' | 'amber' | 'red' | 'slate' | 'violet';
}) {
  const tone = props.tone || 'slate';
  const score = percent(props.value);

  return (
    <div
      className={cn(
        'px-2.5 py-2 rounded-xl border bg-slate-950/70 shadow-inner',
        tone === 'sky' && 'border-sky-500/20 text-sky-400',
        tone === 'emerald' && 'border-emerald-500/20 text-emerald-400',
        tone === 'amber' && 'border-amber-500/20 text-amber-400',
        tone === 'red' && 'border-red-500/20 text-red-400',
        tone === 'violet' && 'border-violet-500/20 text-violet-400',
        tone === 'slate' && 'border-slate-800 text-slate-400'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[8px] uppercase font-black tracking-widest text-slate-600">
          {props.label}
        </p>
        <p className="text-[10px] font-mono font-black">{score}%</p>
      </div>

      <div className="mt-1.5 h-1 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full',
            tone === 'red' && 'bg-red-400',
            tone === 'amber' && 'bg-amber-400',
            tone === 'emerald' && 'bg-emerald-400',
            tone === 'violet' && 'bg-violet-400',
            tone === 'sky' && 'bg-sky-400',
            tone === 'slate' && 'bg-slate-500'
          )}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function MetricCard(props: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sublabel?: React.ReactNode;
  tone?: 'sky' | 'emerald' | 'amber' | 'violet' | 'red';
}) {
  const tone = props.tone || 'sky';

  return (
    <Card className="bg-slate-950/65 border-slate-800 shadow-xl overflow-hidden relative group">
      <CardContent className="p-5 flex items-center gap-4">
        <div
          className={cn(
            'p-3 rounded-xl shrink-0 border',
            tone === 'sky' && 'bg-sky-500/10 text-sky-400 border-sky-500/20',
            tone === 'emerald' && 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
            tone === 'amber' && 'bg-amber-500/10 text-amber-400 border-amber-500/20',
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
          {props.sublabel ? (
            <p className="text-[10px] text-slate-600 font-mono mt-1 truncate">
              {props.sublabel}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function EndpointButton(props: { href?: string; label: string }) {
  if (!props.href) return null;

  return (
    <a href={props.href} target="_blank" rel="noreferrer">
      <Button
        variant="outline"
        size="sm"
        className="h-8 border-slate-800 bg-slate-950/70 text-slate-400 hover:text-sky-300 font-mono text-[10px] uppercase"
      >
        {props.label}
        <ExternalLink className="h-3 w-3 ml-2" />
      </Button>
    </a>
  );
}

export function VaultPage() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<VaultFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');

  const opportunities = useOpportunitiesList() as any[];
  const earningAssets = useEarningAssetsList() as any[];
  const lastRunStatus = useStore(state => state.system_health?.last_run?.status || 'idle');
  const systemHealth = useStore(state => (state.system_health || {}) as any);
  const marketStats = useStore(state => state.market_stats);

  const cryptoAcquisitionCandidates = useStore(state => ((state as any).crypto_acquisition_candidates || EMPTY_ARRAY) as any[]);
  const cryptoAcquisitionSnapshot = useStore(state => ((state as any).crypto_acquisition_snapshot || null) as any);
  const cryptoExecutionLedger = useStore(state => ((state as any).crypto_acquisition_execution_ledger || EMPTY_ARRAY) as any[]);
  const suggestionExecutionLedger = useStore(state => ((state as any).agent_suggestion_execution_ledger || EMPTY_ARRAY) as any[]);
  const patchPlanExecutionLedger = useStore(state => ((state as any).patch_plan_execution_ledger || EMPTY_ARRAY) as any[]);
  const unifiedExecutionLedger = useStore(state => ((state as any).execution_ledger || EMPTY_ARRAY) as any[]);

  const suggestions = useAgentSuggestionsList();
  const approvedAcquisitionCandidates = useApprovedCryptoAcquisitionCandidates();
  const expectedAcquisitionValueNok = useCryptoAcquisitionExpectedValueNok();
  const patchPlanSummary = usePatchPlanSummary();
  const currentPatchPlanItem = useCurrentPatchPlanItem();
  const runCryptoAcquisition = useRunCryptoAcquisition();
  const verifiedRevenueOnly = useVerifiedRevenueOnly();

  useEffect(() => {
    const store = useStore.getState();

    void Promise.allSettled([
      store.fetchAgentSuggestions(),
      store.fetchCryptoAcquisition(),
      store.fetchPatchPlan()
    ]);
  }, []);

  const stats = useMemo(() => {
    const pricedSignals = opportunities.filter(opp => getOpportunityPriceNok(opp) > 0);
    const activeSignals = opportunities.filter(opp => !isExpired(opp));
    const expiredSignals = opportunities.filter(isExpired);

    const highValueSignals = opportunities.filter(opp =>
      isHighValue(opp, assetForOpportunity(opp, earningAssets))
    );

    const reportLinkedSignals = opportunities.filter(opp =>
      Boolean(
        opp.report_asset_id ||
          opp.report_slug ||
          opp.report_url ||
          assetForOpportunity(opp, earningAssets)
      )
    );

    const lockedReports = earningAssets.filter(asset => asset.unlock_status !== 'unlocked');
    const unlockedReports = earningAssets.filter(asset => asset.unlock_status === 'unlocked');

    const newestQuoteAsset = [...earningAssets]
      .sort((a, b) => safeNumber(b.updated_at || b.created_at) - safeNumber(a.updated_at || a.created_at))
      .find(asset => asset.payment_enforcement?.enabled);

    const totalProjectedValue = opportunities.reduce(
      (sum, opp) => sum + getOpportunityMarketValueUsd(opp),
      0
    );

    const averagePrice =
      pricedSignals.length > 0
        ? pricedSignals.reduce((sum, opp) => sum + getResolvedPriceNok(opp, assetForOpportunity(opp, earningAssets)), 0) /
          pricedSignals.length
        : 0;

    const verifiedRevenue = safeNumber(
      (marketStats as any)?.totals?.verified_revenue_nok,
      earningAssets.reduce((sum, asset) => sum + safeNumber(asset.verified_revenue_nok), 0)
    );

    return {
      totalSignals: opportunities.length,
      pricedSignals: pricedSignals.length,
      highValueSignals: highValueSignals.length,
      activeSignals: activeSignals.length,
      expiredSignals: expiredSignals.length,
      reportLinkedSignals: reportLinkedSignals.length,
      reportCount: earningAssets.length,
      lockedReports: lockedReports.length,
      unlockedReports: unlockedReports.length,
      newestQuote: newestQuoteAsset?.payment_enforcement,
      totalProjectedValue,
      averagePrice,
      verifiedRevenue
    };
  }, [opportunities, earningAssets, marketStats]);

  const controlStats = useMemo(() => {
    const suggestionList = asArray<any>(suggestions);
    const pendingSuggestions = suggestionList.filter(item => {
      const status = cleanText(item?.status || 'suggested').toLowerCase();
      return status === 'suggested' || status === 'pending';
    });

    const statusSummary = (patchPlanSummary as any)?.status_summary || {};
    const patchItems = asArray<any>((patchPlanSummary as any)?.plan?.items);

    return {
      pendingSuggestionCount: pendingSuggestions.length,
      urgentSuggestionCount: pendingSuggestions.filter(item => item.priority === 'urgent').length,
      highSuggestionCount: pendingSuggestions.filter(item => item.priority === 'high').length,
      approvedAcquisitionCount: approvedAcquisitionCandidates.length,
      expectedAcquisitionValueNok,
      patchDone: safeNumber(statusSummary.done),
      patchPending: safeNumber(statusSummary.pending),
      patchBlocked: safeNumber(statusSummary.blocked),
      patchTotal: safeNumber(statusSummary.total, patchItems.length),
      patchNextPath: cleanText((currentPatchPlanItem as any)?.file_path),
      patchNextPurpose: cleanText((currentPatchPlanItem as any)?.purpose)
    };
  }, [
    suggestions,
    approvedAcquisitionCandidates,
    expectedAcquisitionValueNok,
    patchPlanSummary,
    currentPatchPlanItem
  ]);

  const executionStats = useMemo(() => {
    const snapshot = cryptoAcquisitionSnapshot || {};
    const unifiedLedgerRaw = asArray<any>(unifiedExecutionLedger);

    const uniqueById = (items: any[]) => {
      const seen = new Set<string>();

      return items.filter((item, index) => {
        const key = cleanText(item?.id || `${item?.kind || 'entry'}-${index}`);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    const cryptoLedger = uniqueById([
      ...asArray<any>(cryptoExecutionLedger),
      ...asArray<any>(snapshot?.execution_ledger),
      ...unifiedLedgerRaw.filter(entry => entry?.kind === 'crypto_acquisition_candidate')
    ]).sort((a, b) => safeNumber(b.completed_at || b.created_at) - safeNumber(a.completed_at || a.created_at));

    const suggestionLedger = uniqueById([
      ...asArray<any>(suggestionExecutionLedger),
      ...unifiedLedgerRaw.filter(entry => entry?.kind === 'agent_suggestion')
    ]).sort((a, b) => safeNumber(b.completed_at || b.created_at) - safeNumber(a.completed_at || a.created_at));

    const patchLedger = uniqueById([
      ...asArray<any>(patchPlanExecutionLedger),
      ...unifiedLedgerRaw.filter(entry => entry?.kind === 'patch_plan_item')
    ]).sort((a, b) => safeNumber(b.completed_at || b.created_at) - safeNumber(a.completed_at || a.created_at));

    const candidateList =
      asArray<any>(snapshot?.candidates).length > 0
        ? asArray<any>(snapshot.candidates)
        : cryptoAcquisitionCandidates.length > 0
          ? cryptoAcquisitionCandidates
          : approvedAcquisitionCandidates;

    const summary = snapshot?.summary || snapshot?.last_run || {};

    const countCandidateClassification = (classification: string) =>
      candidateList.filter(candidate => {
        const actual = cleanText(
          candidate?.execution_classification ||
            candidate?.classification ||
            candidate?.status
        ).toLowerCase();

        return actual === classification;
      }).length;

    const countLedgerStatus = (status: string) =>
      cryptoLedger.filter(entry => cleanText(entry?.status).toLowerCase() === status).length;

    const expectedValue = safeNumber(
      summary.expected_value_nok,
      safeNumber(
        expectedAcquisitionValueNok,
        candidateList.reduce((sum, candidate) => sum + safeNumber(candidate?.expected_value_nok), 0)
      )
    );

    return {
      candidateList,
      cryptoLedger,
      suggestionLedger,
      patchLedger,
      autoExecutable: safeNumber(summary.auto_executable, countCandidateClassification('auto_executable')),
      externalBlocked: safeNumber(summary.external_blocked ?? summary.blocked, countCandidateClassification('external_blocked')),
      executed: safeNumber(summary.executed, countLedgerStatus('executed')),
      failed: safeNumber(summary.failed, countLedgerStatus('failed')),
      verifiedRevenueEvents: safeNumber(summary.verified_revenue ?? summary.verified_revenue_nok, countLedgerStatus('verified_revenue')),
      expectedValue
    };
  }, [
    cryptoAcquisitionSnapshot,
    cryptoExecutionLedger,
    suggestionExecutionLedger,
    patchPlanExecutionLedger,
    unifiedExecutionLedger,
    cryptoAcquisitionCandidates,
    approvedAcquisitionCandidates,
    expectedAcquisitionValueNok
  ]);

  const filteredOpportunities = useMemo(() => {
    const normalizedQuery = query.toLowerCase().trim();

    const filtered = opportunities.filter(opp => {
      const linkedAsset = assetForOpportunity(opp, earningAssets);

      if (filter === 'active' && isExpired(opp)) return false;
      if (filter === 'expired' && !isExpired(opp)) return false;
      if (filter === 'priced' && getOpportunityPriceNok(opp) <= 0) return false;
      if (filter === 'high_value' && !isHighValue(opp, linkedAsset)) return false;
      if (filter === 'reports' && !(opp.report_asset_id || opp.report_slug || opp.report_url || linkedAsset)) return false;

      if (!normalizedQuery) return true;

      const haystack = [
        opp.id,
        opp.title,
        opp.summary,
        opp.niche,
        opp.evidence,
        opp.buyer_type,
        opp.product_type,
        opp.price_tier,
        opp.status,
        sourceLabel(opp),
        linkedAsset?.id,
        linkedAsset?.slug,
        linkedAsset?.title,
        ...asArray(opp.source_refs)
      ].join(' ').toLowerCase();

      return haystack.includes(normalizedQuery);
    });

    return filtered.sort((a, b) => {
      if (sortMode === 'value') {
        return getResolvedMarketValueUsd(b, assetForOpportunity(b, earningAssets)) -
          getResolvedMarketValueUsd(a, assetForOpportunity(a, earningAssets));
      }

      if (sortMode === 'price') {
        return getResolvedPriceNok(b, assetForOpportunity(b, earningAssets)) -
          getResolvedPriceNok(a, assetForOpportunity(a, earningAssets));
      }

      if (sortMode === 'risk') return safeNumber(b.risk_score) - safeNumber(a.risk_score);

      return safeNumber(b.created_at || b.updated_at || b.timestamp) -
        safeNumber(a.created_at || a.updated_at || a.timestamp);
    });
  }, [opportunities, earningAssets, query, filter, sortMode]);

  const filterButtons: Array<{ id: VaultFilter; label: string; count: number }> = [
    { id: 'all', label: 'All', count: stats.totalSignals },
    { id: 'active', label: 'Active', count: stats.activeSignals },
    { id: 'expired', label: 'Expired', count: stats.expiredSignals },
    { id: 'priced', label: 'Priced', count: stats.pricedSignals },
    { id: 'high_value', label: 'High Value', count: stats.highValueSignals },
    { id: 'reports', label: 'Reports', count: stats.reportLinkedSignals }
  ];

  const aiMode = String(systemHealth?.ai_quota_mode || systemHealth?.ai_quota?.mode || 'available');
  const nextScheduled = safeNumber(systemHealth?.next_scheduled_cycle_at, 0);

  return (
    <AppLayout container contentClassName="space-y-8 max-w-7xl mx-auto px-4 py-10">
      <header className="relative overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-950/65 p-6 shadow-2xl">
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-3 min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-sky-500 to-violet-500 flex items-center justify-center">
                <Database className="h-6 w-6 text-white" />
              </div>

              <div className="min-w-0">
                <h1 className="text-4xl font-black tracking-tighter">
                  OPPORTUNITY <span className="text-slate-500">VAULT</span>
                </h1>

                <p className="text-slate-500 font-mono text-xs uppercase tracking-widest flex items-center gap-2 mt-1">
                  <ShieldCheck className="h-3 w-3 text-emerald-500" />
                  Signal Memory · Report Inventory · Payment Metadata Index
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="bg-sky-500/10 border-sky-500/20 text-sky-300 font-mono text-[9px] uppercase tracking-widest">
                {filteredOpportunities.length} visible
              </Badge>

              <Badge variant="outline" className="bg-slate-900/70 border-slate-800 text-slate-400 font-mono text-[9px] uppercase tracking-widest">
                {stats.totalSignals} archived signals
              </Badge>

              <Badge variant="outline" className="bg-emerald-500/10 border-emerald-500/20 text-emerald-300 font-mono text-[9px] uppercase tracking-widest">
                {stats.reportCount} report assets
              </Badge>

              <Badge
                variant="outline"
                className={cn(
                  'font-mono text-[9px] uppercase tracking-widest',
                  aiMode.includes('backoff') || aiMode.includes('quota')
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                    : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                )}
              >
                AI: {aiMode}
              </Badge>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 min-w-0">
            <div className="relative sm:w-96 min-w-0">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <Input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Filter by niche, source, buyer, title, report, or ID..."
                className="pl-10 bg-slate-950/80 border-slate-800 focus-visible:ring-sky-500/50 h-10 font-mono text-xs"
              />
            </div>

            <Button
              variant="outline"
              className="border-slate-800 bg-slate-950/60 hover:bg-slate-900 text-slate-400 font-mono text-[10px] uppercase"
              onClick={() => {
                setQuery('');
                setFilter('all');
                setSortMode('newest');
              }}
            >
              <Filter className="h-4 w-4 mr-2" />
              Reset
            </Button>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <MetricCard tone="sky" icon={<Activity className="h-5 w-5" />} label="Signals archived" value={stats.totalSignals} sublabel={`Run state: ${String(lastRunStatus).toUpperCase()}`} />
        <MetricCard tone="violet" icon={<FileJson className="h-5 w-5" />} label="Reports minted" value={stats.reportCount} sublabel={`${stats.lockedReports} locked · ${stats.unlockedReports} unlocked`} />
        <MetricCard tone="emerald" icon={<TrendingUp className="h-5 w-5" />} label="Projected market" value={formatUsd(stats.totalProjectedValue)} sublabel={`${stats.highValueSignals} high-value signals`} />
        <MetricCard
          tone={stats.newestQuote?.quote_fallback ? 'amber' : stats.newestQuote ? 'emerald' : 'red'}
          icon={<RadioTower className="h-5 w-5" />}
          label="POL/NOK oracle"
          value={stats.newestQuote?.native_price_nok ? safeNumber(stats.newestQuote.native_price_nok).toFixed(6) : 'n/a'}
          sublabel={
            stats.newestQuote
              ? `${stats.newestQuote.quote_provider || 'unknown'}${stats.newestQuote.quote_fallback ? ' · fallback' : ''}${stats.newestQuote.quote_stale ? ' · stale' : ''}`
              : 'no quote loaded'
          }
        />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Card className="bg-slate-950/60 border-slate-800 shadow-xl xl:col-span-2">
          <CardHeader className="p-5 border-b border-slate-800/50">
            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
              <Bot className="h-3.5 w-3.5 text-emerald-400" />
              Execution Control Plane
            </CardTitle>
          </CardHeader>

          <CardContent className="p-5 space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-3">
                <p className="text-[9px] text-emerald-300 font-black uppercase">Auto</p>
                <p className="text-lg font-mono font-black text-emerald-300">{executionStats.autoExecutable}</p>
              </div>

              <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3">
                <p className="text-[9px] text-amber-300 font-black uppercase">Blocked</p>
                <p className="text-lg font-mono font-black text-amber-300">{executionStats.externalBlocked}</p>
              </div>

              <div className="rounded-xl bg-sky-500/5 border border-sky-500/20 p-3">
                <p className="text-[9px] text-sky-300 font-black uppercase">Executed</p>
                <p className="text-lg font-mono font-black text-sky-300">{executionStats.executed}</p>
              </div>

              <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-3">
                <p className="text-[9px] text-red-300 font-black uppercase">Failed</p>
                <p className="text-lg font-mono font-black text-red-300">{executionStats.failed}</p>
              </div>

              <div className="rounded-xl bg-violet-500/5 border border-violet-500/20 p-3">
                <p className="text-[9px] text-violet-300 font-black uppercase">Expected</p>
                <p className="text-lg font-mono font-black text-violet-300">{formatNok(executionStats.expectedValue)}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">Candidate execution states</p>
                  <Badge variant="outline" className="bg-slate-900 border-slate-800 text-slate-400 font-mono text-[9px] uppercase">
                    {executionStats.candidateList.length}
                  </Badge>
                </div>

                {executionStats.candidateList.length > 0 ? (
                  executionStats.candidateList.slice(0, 5).map((candidate: any, index: number) => {
                    const status = candidate.execution_status || candidate.status || candidate.execution_classification || candidate.classification || 'candidate';

                    return (
                      <div key={candidate.id || `${candidate.title}-${index}`} className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold text-slate-200 truncate">{candidate.title || candidate.id}</p>
                          <Badge variant="outline" className={executionBadgeClass(status)}>{String(status)}</Badge>
                        </div>
                        <p className="text-[10px] text-slate-600 font-mono mt-1">
                          {candidate.method || 'unknown'} · expected {formatNok(candidate.expected_value_nok)}
                        </p>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-[11px] text-slate-600 font-mono">No candidate state loaded yet.</p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">Latest executor ledger</p>
                  <Badge variant="outline" className="bg-slate-900 border-slate-800 text-slate-400 font-mono text-[9px] uppercase">
                    {executionStats.cryptoLedger.length}
                  </Badge>
                </div>

                {executionStats.cryptoLedger.length > 0 ? (
                  executionStats.cryptoLedger.slice(0, 4).map((entry: any, index: number) => (
                    <div key={entry.id || index} className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className={executionBadgeClass(entry.status)}>
                          {String(entry.status || 'unknown')}
                        </Badge>
                        <span className="text-[9px] font-mono text-slate-600">
                          {safeDate(entry.completed_at || entry.created_at)}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-slate-200">
                        {shortText(entry.candidate_title || entry.title || entry.candidate_id || entry.id, 130)}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-slate-600 font-mono">No autonomous execution ledger entries loaded yet.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-950/60 border-slate-800 shadow-xl">
          <CardHeader className="p-5 border-b border-slate-800/50">
            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              Accounting Boundary
            </CardTitle>
          </CardHeader>

          <CardContent className="p-5 space-y-4">
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-300">Verified revenue</p>
              <p className="text-2xl font-mono font-black text-emerald-300 mt-1">{formatNok(stats.verifiedRevenue)}</p>
              <p className="text-[10px] text-slate-500 font-mono mt-2">
                Policy: {verifiedRevenueOnly ? 'verified receipt only' : 'policy check required'}
              </p>
            </div>

            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-amber-300">Expected acquisition value</p>
              <p className="text-xl font-mono font-black text-amber-300 mt-1">{formatNok(controlStats.expectedAcquisitionValueNok)}</p>
              <p className="text-[10px] text-slate-500 font-mono mt-2">Planning signal only. Not treasury, not ledger, not withdrawable.</p>
            </div>

            <Button
              type="button"
              onClick={() => void runCryptoAcquisition()}
              className="w-full bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20 text-emerald-300 font-mono text-[10px] uppercase"
              variant="outline"
            >
              <Zap className="h-4 w-4 mr-2" />
              Run acquisition executor
            </Button>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">Patch plan</p>
              <p className="text-xs font-mono font-black text-slate-200 mt-1 break-all">
                {controlStats.patchNextPath || 'no current item'}
              </p>
              <p className="text-[10px] text-slate-600 font-mono mt-2">
                {controlStats.patchDone}/{controlStats.patchTotal} done · {controlStats.patchPending} pending · {controlStats.patchBlocked} blocked
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5">
        <Card className="bg-slate-950/60 border-slate-800 shadow-xl">
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {filterButtons.map(item => (
                <Button
                  key={item.id}
                  variant="outline"
                  size="sm"
                  onClick={() => setFilter(item.id)}
                  className={cn(
                    'h-8 border-slate-800 bg-slate-950/50 font-mono text-[10px] uppercase tracking-widest',
                    filter === item.id
                      ? 'text-sky-300 border-sky-500/40 bg-sky-500/10'
                      : 'text-slate-500 hover:text-slate-200 hover:bg-slate-900'
                  )}
                >
                  {item.label}
                  <Badge variant="outline" className="ml-2 h-4 px-1.5 text-[9px] border-slate-700 bg-slate-950 text-slate-400">
                    {item.count}
                  </Badge>
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/50">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 flex items-center gap-1">
                <ArrowDownUp className="h-3 w-3" />
                Sort
              </span>

              {[
                ['newest', 'Newest'],
                ['value', 'Projected Value'],
                ['price', 'Price'],
                ['risk', 'Risk']
              ].map(([id, label]) => (
                <Button
                  key={id}
                  variant="outline"
                  size="sm"
                  onClick={() => setSortMode(id as SortMode)}
                  className={cn(
                    'h-7 border-slate-800 bg-slate-950/50 font-mono text-[9px] uppercase',
                    sortMode === id
                      ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
                      : 'text-slate-500 hover:text-slate-200'
                  )}
                >
                  {label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-950/60 border-slate-800 shadow-xl">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">Scheduler</p>
                <p className="text-xs font-mono font-black text-slate-200">
                  {nextScheduled > 0 ? safeDate(nextScheduled) : 'not scheduled'}
                </p>
              </div>

              <Badge variant="outline" className="bg-slate-900 border-slate-800 text-slate-400 font-mono text-[9px] uppercase">
                {sortMode}
              </Badge>
            </div>

            <p className="text-[10px] text-slate-600 font-mono leading-relaxed">
              Vault data is sourced from Durable Object state. Public endpoints expose only market/report feeds; owner routes remain protected.
            </p>
          </CardContent>
        </Card>
      </section>

      <Card className="bg-slate-950/60 border-slate-800 shadow-2xl overflow-hidden border-t-2 border-t-sky-500/30">
        <CardHeader className="p-6 border-b border-slate-800/50 bg-slate-900/20 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
              <Database className="h-4 w-4 text-sky-400" />
              Signal Archive
            </CardTitle>

            <p className="text-[10px] text-slate-600 font-mono uppercase">
              Analyst opportunities, source evidence, report links, dynamic price hints, and buyer metadata
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <EndpointButton href="/api/reports.json" label="reports.json" />
            <EndpointButton href="/api/opportunities.json" label="opportunities.json" />
            <EndpointButton href="/api/signals.json" label="signals.json" />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="h-[780px] overflow-y-auto bg-black/20">
            {filteredOpportunities.length > 0 ? (
              <div className="divide-y divide-slate-800/50">
                {filteredOpportunities.map((opp, index) => {
                  const linkedAsset = assetForOpportunity(opp, earningAssets);
                  const expired = isExpired(opp);
                  const priceNok = getOpportunityPriceNok(opp) || safeNumber(linkedAsset?.price_nok);
                  const projectedUsd = getOpportunityMarketValueUsd(opp) || safeNumber(linkedAsset?.projected_market_value_usd);
                  const highValue = isHighValue(opp, linkedAsset);
                  const reportUrl = opp.report_url || linkedAsset?.public_url || linkedAsset?.local_url;
                  const metadataUrl = opp.metadata_url || linkedAsset?.metadata_url || (linkedAsset?.slug ? `/reports/${linkedAsset.slug}/metadata.json` : '');
                  const previewUrl = opp.preview_url || linkedAsset?.preview_url || (linkedAsset?.slug ? `/reports/${linkedAsset.slug}/preview.json` : '');
                  const fullJsonUrl = opp.full_json_url || linkedAsset?.full_json_url || (linkedAsset?.slug ? `/reports/${linkedAsset.slug}/full.json` : '');
                  const verifyUrl = opp.verify_payment_url || linkedAsset?.verify_payment_url || (linkedAsset?.slug ? `/reports/${linkedAsset.slug}/verify-payment` : '');
                  const unlockStatus = linkedAsset?.unlock_status || 'not_minted';

                  return (
                    <article key={opp.id || `${opp.title}-${index}`} className="p-5 hover:bg-slate-900/40 transition-all">
                      <div className="flex flex-col 2xl:flex-row 2xl:items-start justify-between gap-5">
                        <div className="space-y-3 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                'font-mono text-[9px] uppercase border px-2 py-0 h-5',
                                expired
                                  ? 'bg-slate-800/40 border-slate-700 text-slate-500'
                                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                              )}
                            >
                              {expired ? 'expired' : 'active'}
                            </Badge>

                            {highValue ? (
                              <Badge variant="outline" className="font-mono text-[9px] uppercase bg-amber-500/10 border-amber-500/20 text-amber-400 px-2 py-0 h-5">
                                high_value
                              </Badge>
                            ) : null}

                            {linkedAsset ? (
                              <Badge
                                variant="outline"
                                className={cn(
                                  'font-mono text-[9px] uppercase px-2 py-0 h-5',
                                  linkedAsset.unlock_status === 'unlocked'
                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                    : 'bg-violet-500/10 border-violet-500/20 text-violet-400'
                                )}
                              >
                                {linkedAsset.unlock_status === 'unlocked' ? (
                                  <UnlockKeyhole className="h-3 w-3 mr-1" />
                                ) : (
                                  <LockKeyhole className="h-3 w-3 mr-1" />
                                )}
                                {linkedAsset.unlock_status || 'locked'}
                              </Badge>
                            ) : null}

                            <Badge variant="outline" className="font-mono text-[9px] uppercase bg-sky-500/10 border-sky-500/20 text-sky-400 px-2 py-0 h-5">
                              <Signal className="h-3 w-3 mr-1" />
                              {sourceLabel(opp)}
                            </Badge>

                            <button
                              type="button"
                              onClick={() => copyToClipboard(String(opp.id || ''), 'Signal ID copied')}
                              className="text-[10px] font-mono text-slate-600 hover:text-sky-300 transition-colors flex items-center gap-1"
                            >
                              {opp.id || 'unknown_id'}
                              <Copy className="h-3 w-3" />
                            </button>
                          </div>

                          <div>
                            <h2 className="text-lg font-black text-slate-100 tracking-tight leading-snug">
                              {cleanText(opp.title || 'Untitled Opportunity')}
                            </h2>
                            <p className="text-xs text-slate-400 leading-relaxed mt-2">
                              {shortText(opp.summary || opp.evidence, 300)}
                            </p>
                          </div>

                          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                            <p className="text-[9px] uppercase font-black tracking-widest text-slate-600 mb-1">
                              Evidence
                            </p>
                            <p className="text-[11px] text-slate-400 leading-relaxed">
                              {shortText(opp.evidence, 340)}
                            </p>
                          </div>

                          {(reportUrl || metadataUrl || previewUrl || fullJsonUrl) ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <EndpointButton href={reportUrl} label="report" />
                              <EndpointButton href={metadataUrl} label="metadata" />
                              <EndpointButton href={previewUrl} label="preview" />
                              <EndpointButton href={fullJsonUrl} label="full.json" />
                              <EndpointButton href={verifyUrl} label="verify" />
                            </div>
                          ) : null}
                        </div>

                        <div className="2xl:w-[380px] shrink-0 space-y-3">
                          <div className="grid grid-cols-2 gap-2">
                            <ScorePill label="Confidence" value={safeNumber(opp.confidence_score)} tone="sky" />
                            <ScorePill label="Novelty" value={safeNumber(opp.novelty_score)} tone="violet" />
                            <ScorePill label="Urgency" value={safeNumber(opp.urgency_score)} tone="amber" />
                            <ScorePill label="Risk" value={safeNumber(opp.risk_score)} tone={safeNumber(opp.risk_score) >= 0.65 ? 'red' : 'emerald'} />
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                              <p className="text-[9px] text-slate-600 font-black uppercase flex items-center gap-1">
                                <Coins className="h-3 w-3" />
                                Price
                              </p>
                              <p className="text-sm font-mono font-black text-emerald-400 mt-1">
                                {priceNok > 0 ? formatNok(priceNok) : 'n/a'}
                              </p>
                            </div>

                            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                              <p className="text-[9px] text-slate-600 font-black uppercase flex items-center gap-1">
                                <TrendingUp className="h-3 w-3" />
                                Market
                              </p>
                              <p className="text-sm font-mono font-black text-sky-400 mt-1">
                                {projectedUsd > 0 ? formatUsd(projectedUsd) : 'n/a'}
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                              <p className="text-[9px] text-slate-600 font-black uppercase flex items-center gap-1">
                                <Gauge className="h-3 w-3" />
                                Value Score
                              </p>
                              <p className="text-sm font-mono font-black text-violet-300 mt-1">
                                {percent(opp.market_value_score || linkedAsset?.market_value_score)}%
                              </p>
                            </div>

                            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                              <p className="text-[9px] text-slate-600 font-black uppercase flex items-center gap-1">
                                <Layers className="h-3 w-3" />
                                Report
                              </p>
                              <p className="text-sm font-mono font-black text-slate-200 mt-1">
                                {unlockStatus}
                              </p>
                            </div>
                          </div>

                          {linkedAsset?.payment_enforcement ? (
                            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                              <p className="text-[9px] text-slate-600 font-black uppercase flex items-center gap-1">
                                <ReceiptText className="h-3 w-3" />
                                Payment Enforcement
                              </p>
                              <p className="text-[10px] text-slate-400 font-mono leading-relaxed mt-1">
                                {linkedAsset.price_crypto_estimate || linkedAsset.payment_enforcement.message || 'Live quote required'}
                              </p>
                            </div>
                          ) : null}

                          {expired ? (
                            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex gap-2">
                              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                              <p className="text-[10px] text-amber-200/80 leading-relaxed">
                                Signal expiry time has passed. Treat as archived context unless refreshed by a new autonomous cycle.
                              </p>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-48 text-center space-y-5 opacity-30">
                <Database className="h-16 w-16 text-slate-600" />
                <div className="space-y-1">
                  <p className="text-xs font-mono uppercase tracking-[0.3em]">No matching signals found</p>
                  <p className="text-[10px] font-mono">Clear filters or trigger a fresh autonomous ingest cycle from Command Center.</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="bg-slate-950/60 border-slate-800 shadow-xl">
          <CardHeader className="p-5 border-b border-slate-800/50">
            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
              <Bot className="h-3.5 w-3.5 text-sky-400" />
              Agent Consumption
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 text-[11px] text-slate-500 font-mono leading-relaxed">
            Public machine-readable feeds are designed for agent discovery. Full payloads remain locked unless payment is verified or owner admin access is used. Projected market value remains separate from treasury revenue.
          </CardContent>
        </Card>

        <Card className="bg-slate-950/60 border-slate-800 shadow-xl">
          <CardHeader className="p-5 border-b border-slate-800/50">
            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-emerald-400" />
              Pricing Signal
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 text-[11px] text-slate-500 font-mono leading-relaxed">
            Average priced signal: <span className="text-emerald-300 font-black">{formatNok(stats.averagePrice)}</span>. Dynamic price is not revenue; treasury only credits verified external payment.
            Expected acquisition value: <span className="text-amber-300 font-black">{formatNok(controlStats.expectedAcquisitionValueNok)}</span>, also not revenue.
          </CardContent>
        </Card>

        <Card className="bg-slate-950/60 border-slate-800 shadow-xl">
          <CardHeader className="p-5 border-b border-slate-800/50">
            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
              <Eye className="h-3.5 w-3.5 text-violet-400" />
              Discovery Surface
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 text-[11px] text-slate-500 font-mono leading-relaxed">
            The vault mirrors report/public feed health while keeping owner-control routes private. Use public endpoints to test crawler visibility.
          </CardContent>
        </Card>
      </section>
    </AppLayout>
  );
}

export default VaultPage;