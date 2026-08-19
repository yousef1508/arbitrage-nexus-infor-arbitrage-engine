import React, { useEffect, useMemo, useState } from 'react';
import {
  Zap,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Coins,
  TrendingUp,
  ExternalLink,
  FileJson,
  X,
  Copy,
  ShieldAlert,
  Gauge,
  Clock,
  Link2,
  Eye,
  Activity,
  Target,
  Database
} from 'lucide-react';
import { useLastScanTime, useStore } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

type OpportunityFeedProps = {
  pageSize?: number;
  compactHeader?: boolean;
};

type ReportLink = {
  label: string;
  href: string;
  icon: React.ReactNode;
};

const PAGE_SIZE_OPTIONS = [3, 4, 6, 10] as const;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanText(value: unknown) {
  return String(value ?? '')
    .replace(/\uFFFD/g, '')
    .replace(/�/g, '')
    .replace(/\u0000/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function shortText(value: unknown, max = 150) {
  const text = cleanText(value);

  if (text.length <= max) return text;

  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function scorePercent(value: unknown) {
  const n = safeNumber(value, 0);
  return clamp(Math.round(n * 100), 0, 100);
}

function formatUsd(value: unknown) {
  return safeNumber(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  });
}

function formatNok(value: unknown) {
  const n = safeNumber(value);

  if (n <= 0) return 'Pending';

  return n.toLocaleString('nb-NO', {
    style: 'currency',
    currency: 'NOK',
    maximumFractionDigits: 0
  });
}

function formatTimestamp(value: unknown) {
  const timestamp = safeNumber(value, 0);

  if (timestamp <= 0) return 'unknown';

  try {
    return `${formatDistanceToNow(timestamp)} ago`;
  } catch {
    return 'unknown';
  }
}

function opportunityTime(opp: any) {
  return safeNumber(opp?.updated_at || opp?.created_at || opp?.timestamp || 0);
}

function pageNumbers(current: number, total: number) {
  const windowSize = 5;
  const half = Math.floor(windowSize / 2);

  let start = Math.max(1, current - half);
  let end = Math.min(total, start + windowSize - 1);

  start = Math.max(1, end - windowSize + 1);

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function normalizeLocalPublicHref(value?: string) {
  const url = cleanText(value);

  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/api/')) return url;
  if (url.startsWith('/reports/')) return `/api${url}`;
  if (url.startsWith('reports/')) return `/api/${url}`;
  if (url.startsWith('/')) return url;

  return `/api/reports/${url}`;
}

function getReportSlug(opp: any) {
  const direct = cleanText(opp?.report_slug);

  if (direct) return direct;

  const fromUrl = cleanText(opp?.report_url || opp?.public_url || opp?.published_url);
  const match = fromUrl.match(/\/reports\/([^/?#]+)/i);

  return match?.[1] || '';
}

function buildReportLinks(opp: any): ReportLink[] {
  const slug = getReportSlug(opp);
  const reportUrl = normalizeLocalPublicHref(opp?.report_url || opp?.public_url || opp?.published_url || (slug ? `/reports/${slug}` : ''));
  const metadataUrl = normalizeLocalPublicHref(opp?.metadata_url || (slug ? `/reports/${slug}/metadata.json` : ''));
  const previewUrl = normalizeLocalPublicHref(opp?.preview_url || (slug ? `/reports/${slug}/preview.json` : ''));
  const fullJsonUrl = normalizeLocalPublicHref(opp?.full_json_url || (slug ? `/reports/${slug}/full.json` : ''));

  return [
    reportUrl ? { label: 'Open report', href: reportUrl, icon: <ExternalLink className="h-3.5 w-3.5" /> } : null,
    metadataUrl ? { label: 'Metadata', href: metadataUrl, icon: <Database className="h-3.5 w-3.5" /> } : null,
    previewUrl ? { label: 'Preview JSON', href: previewUrl, icon: <Eye className="h-3.5 w-3.5" /> } : null,
    fullJsonUrl ? { label: 'Full JSON', href: fullJsonUrl, icon: <FileJson className="h-3.5 w-3.5" /> } : null
  ].filter(Boolean) as ReportLink[];
}

function getStatusClass(status: string) {
  const normalized = status.toLowerCase();

  if (normalized.includes('complete') || normalized.includes('paid') || normalized.includes('verified')) {
    return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300';
  }

  if (normalized.includes('valid') || normalized.includes('routing') || normalized.includes('executing')) {
    return 'bg-sky-500/10 border-sky-500/20 text-sky-300';
  }

  if (normalized.includes('fail') || normalized.includes('expired')) {
    return 'bg-red-500/10 border-red-500/20 text-red-300';
  }

  return 'bg-slate-800/80 border-slate-700 text-slate-200';
}

function getRiskClass(risk: number) {
  if (risk >= 65) return 'text-red-400';
  if (risk >= 40) return 'text-amber-400';
  return 'text-sky-400';
}

function copyText(value: unknown, label = 'Copied') {
  navigator.clipboard
    .writeText(cleanText(value))
    .then(() => toast.success(label))
    .catch(() => toast.error('Could not copy'));
}

function DetailMetric({
  label,
  value,
  icon
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 min-w-0">
      <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">
        {icon}
        {label}
      </p>
      <div className="mt-2 text-sm font-black text-slate-100 break-words">{value}</div>
    </div>
  );
}

function ScoreBar({
  label,
  value,
  tone = 'sky'
}: {
  label: string;
  value: unknown;
  tone?: 'sky' | 'emerald' | 'amber' | 'red' | 'violet';
}) {
  const percent = scorePercent(value);

  const fillClass = {
    sky: 'bg-sky-400',
    emerald: 'bg-emerald-400',
    amber: 'bg-amber-400',
    red: 'bg-red-400',
    violet: 'bg-violet-400'
  }[tone];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{label}</p>
        <p className="text-[10px] font-mono text-slate-300">{percent}%</p>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', fillClass)} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function OpportunityDetailModal({
  opportunity,
  onClose
}: {
  opportunity: any;
  onClose: () => void;
}) {
  const reportLinks = buildReportLinks(opportunity);
  const confidence = scorePercent(opportunity?.confidence_score);
  const risk = scorePercent(opportunity?.risk_score);
  const novelty = scorePercent(opportunity?.novelty_score);
  const urgency = scorePercent(opportunity?.urgency_score);
  const monetization = scorePercent(opportunity?.monetization_score);
  const marketValueScore = scorePercent(opportunity?.market_value_score);
  const sourceRefs = Array.isArray(opportunity?.source_refs) ? opportunity.source_refs : [];
  const offerLinks = Array.isArray(opportunity?.offer_links) ? opportunity.offer_links : [];
  const status = cleanText(opportunity?.status || 'tracked');
  const createdAt = opportunityTime(opportunity);
  const title = cleanText(opportunity?.title || 'Untitled Opportunity');
  const slug = getReportSlug(opportunity);
  const fullJson = JSON.stringify(opportunity, null, 2);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="mx-auto max-w-6xl">
        <Card className="overflow-hidden border-slate-800 bg-slate-950 shadow-2xl">
          <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 backdrop-blur p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-sky-500/20 bg-sky-500/10 text-sky-300 text-[10px] font-mono uppercase">
                    {cleanText(opportunity?.niche || 'General')}
                  </Badge>
                  <Badge variant="outline" className={cn('text-[10px] font-mono uppercase', getStatusClass(status))}>
                    {status}
                  </Badge>
                  {slug && (
                    <Badge variant="outline" className="border-slate-700 bg-slate-900 text-slate-300 text-[10px] font-mono">
                      {slug}
                    </Badge>
                  )}
                </div>

                <h2 className="text-xl lg:text-2xl font-black tracking-tight text-slate-50 break-words">
                  {title}
                </h2>

                <p className="text-sm text-slate-400 leading-relaxed max-w-4xl">
                  {cleanText(opportunity?.summary || opportunity?.evidence || 'No summary available.')}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {reportLinks.slice(0, 2).map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-sky-500/30 bg-sky-500/10 px-3 text-xs font-bold text-sky-300 hover:bg-sky-500/15"
                  >
                    {link.icon}
                    {link.label}
                  </a>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copyText(fullJson, 'Opportunity JSON copied')}
                  className="border-slate-800 bg-slate-950 text-slate-300"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy JSON
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                  className="border-slate-800 bg-slate-950 text-slate-300"
                >
                  <X className="h-4 w-4 mr-2" />
                  Close
                </Button>
              </div>
            </div>
          </div>

          <div className="p-5 lg:p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <DetailMetric
                label="Projected market value"
                value={<span className="text-emerald-300">{formatUsd(opportunity?.projected_market_value_usd ?? opportunity?.potential_profit)}</span>}
                icon={<TrendingUp className="h-3.5 w-3.5" />}
              />
              <DetailMetric
                label="Suggested price"
                value={<span className="text-amber-300">{formatNok(opportunity?.recommended_price_nok ?? opportunity?.price_nok)}</span>}
                icon={<Coins className="h-3.5 w-3.5" />}
              />
              <DetailMetric
                label="Created"
                value={formatTimestamp(createdAt)}
                icon={<Clock className="h-3.5 w-3.5" />}
              />
              <DetailMetric
                label="Buyer type"
                value={cleanText(opportunity?.buyer_type || 'agent_or_automated_intelligence_consumer')}
                icon={<Target className="h-3.5 w-3.5" />}
              />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
              <Card className="xl:col-span-7 border-slate-800 bg-slate-950/60 p-5 space-y-5">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-300 flex items-center gap-2">
                    <Activity className="h-4 w-4 text-sky-400" />
                    Signal brief
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-300 whitespace-pre-wrap break-words">
                    {cleanText(opportunity?.evidence || opportunity?.summary || 'No evidence available.')}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ScoreBar label="Confidence" value={confidence / 100} tone="emerald" />
                  <ScoreBar label="Risk vector" value={risk / 100} tone={risk >= 65 ? 'red' : risk >= 40 ? 'amber' : 'sky'} />
                  <ScoreBar label="Novelty" value={novelty / 100} tone="violet" />
                  <ScoreBar label="Urgency" value={urgency / 100} tone="amber" />
                  <ScoreBar label="Monetization" value={monetization / 100} tone="emerald" />
                  <ScoreBar label="Market value" value={marketValueScore / 100} tone="sky" />
                </div>
              </Card>

              <Card className="xl:col-span-5 border-slate-800 bg-slate-950/60 p-5 space-y-5">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-300 flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-sky-400" />
                  Report access
                </h3>

                {reportLinks.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2">
                    {reportLinks.map((link) => (
                      <a
                        key={link.label}
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 px-3 py-3 text-xs font-bold text-slate-300 hover:border-sky-500/40 hover:text-sky-300"
                      >
                        <span className="flex items-center gap-2">
                          {link.icon}
                          {link.label}
                        </span>
                        <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    No generated report link is attached yet. This usually means the opportunity was detected but has not been converted into an earning asset.
                  </p>
                )}

                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Pricing reasoning</p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-400">
                    {cleanText(opportunity?.pricing_reasoning || 'No pricing reasoning attached.')}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Payment estimate</p>
                  <p className="mt-2 text-xs font-mono text-amber-300">
                    {cleanText(opportunity?.price_crypto_estimate || opportunity?.payment_enforcement?.message || 'Pending report payment quote')}
                  </p>
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Card className="border-slate-800 bg-slate-950/60 p-5">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-300 mb-4">
                  Source references
                </h3>

                {sourceRefs.length > 0 ? (
                  <div className="space-y-2">
                    {sourceRefs.map((ref: unknown, index: number) => (
                      <div
                        key={`${String(ref)}-${index}`}
                        className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-[11px] font-mono text-slate-400 break-words"
                      >
                        {cleanText(ref)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No source references attached.</p>
                )}
              </Card>

              <Card className="border-slate-800 bg-slate-950/60 p-5">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-300 mb-4">
                  Related resources
                </h3>

                {offerLinks.filter((link: any) => link?.type !== 'payment' && cleanText(link?.url)).length > 0 ? (
                  <div className="space-y-2">
                    {offerLinks
                      .filter((link: any) => link?.type !== 'payment' && cleanText(link?.url))
                      .map((link: any, index: number) => (
                        <a
                          key={`${link.url}-${index}`}
                          href={cleanText(link.url)}
                          target="_blank"
                          rel="nofollow sponsored noreferrer"
                          className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-300 hover:border-lime-500/40 hover:text-lime-300"
                        >
                          <span>{cleanText(link.label || link.url)}</span>
                          <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                        </a>
                      ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    No affiliate or referral resources matched this opportunity yet.
                  </p>
                )}
              </Card>
            </div>

            <Card className="border-slate-800 bg-slate-950/60 p-5">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-300 mb-4">
                Raw opportunity payload
              </h3>
              <pre className="max-h-[420px] overflow-auto rounded-2xl border border-slate-800 bg-black/40 p-4 text-[11px] leading-relaxed text-slate-300">
                {fullJson}
              </pre>
            </Card>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function OpportunityFeed({ pageSize = 4, compactHeader = false }: OpportunityFeedProps) {
  const opportunities = useStore((state) => state.opportunities || []);
  const lastScan = useLastScanTime();

  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(
    clamp(Math.floor(Number(pageSize || 4)), 3, 10) as (typeof PAGE_SIZE_OPTIONS)[number]
  );
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedNiche, setSelectedNiche] = useState('ALL');
  const [selectedOpportunity, setSelectedOpportunity] = useState<any | null>(null);

  useEffect(() => {
    const next = clamp(Math.floor(Number(pageSize || 4)), 3, 10) as (typeof PAGE_SIZE_OPTIONS)[number];
    setRowsPerPage(next);
  }, [pageSize]);

  const sorted = useMemo(() => {
    return [...opportunities]
      .map((opp: any, index: number) => ({ opp, index }))
      .sort((a, b) => {
        const byTime = opportunityTime(b.opp) - opportunityTime(a.opp);
        return byTime || a.index - b.index;
      })
      .map((item) => item.opp);
  }, [opportunities]);

  const niches = useMemo(() => {
    return ['ALL', ...Array.from(new Set(sorted.map((opp: any) => cleanText(opp.niche || 'General')).filter(Boolean))).sort()];
  }, [sorted]);

  const statuses = useMemo(() => {
    return ['ALL', ...Array.from(new Set(sorted.map((opp: any) => cleanText(opp.status || 'tracked')).filter(Boolean))).sort()];
  }, [sorted]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return sorted.filter((opp: any) => {
      const niche = cleanText(opp.niche || 'General');
      const status = cleanText(opp.status || 'tracked');

      const queryMatch =
        !q ||
        [
          opp.id,
          opp.title,
          opp.summary,
          opp.niche,
          opp.evidence,
          opp.status,
          opp.buyer_type,
          opp.product_type,
          opp.price_tier,
          opp.report_slug,
          opp.report_url,
          opp.price_crypto_estimate,
          ...(Array.isArray(opp.source_refs) ? opp.source_refs : [])
        ]
          .join(' ')
          .toLowerCase()
          .includes(q);

      const statusMatch = selectedStatus === 'ALL' || status === selectedStatus;
      const nicheMatch = selectedNiche === 'ALL' || niche === selectedNiche;

      return queryMatch && statusMatch && nicheMatch;
    });
  }, [sorted, query, selectedStatus, selectedNiche]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const safePage = clamp(page, 1, totalPages);
  const startIndex = (safePage - 1) * rowsPerPage;
  const visible = filtered.slice(startIndex, startIndex + rowsPerPage);

  const showingFrom = filtered.length === 0 ? 0 : startIndex + 1;
  const showingTo = Math.min(startIndex + rowsPerPage, filtered.length);

  useEffect(() => {
    setPage(1);
  }, [query, rowsPerPage, selectedStatus, selectedNiche, opportunities.length]);

  return (
    <div className="space-y-5 min-w-0">
      <div className={cn('space-y-4 min-w-0', compactHeader && 'space-y-3')}>
        {!compactHeader && (
          <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4 min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-md bg-sky-500/10">
                  <Zap className="h-4 w-4 text-sky-400" />
                </div>

                <h2 className="text-xs font-bold text-slate-300 uppercase tracking-[0.2em]">
                  Live Opportunity Matrix
                </h2>
              </div>

              <p className="text-[10px] text-slate-600 font-mono uppercase mt-1">
                Showing {showingFrom}-{showingTo} of {filtered.length} signals • newest first
              </p>

              {lastScan > 0 && (
                <p className="text-[9px] text-slate-600 font-mono uppercase mt-1">
                  Matrix refreshed {formatDistanceToNow(lastScan)} ago
                </p>
              )}
            </div>

            <Badge
              variant="outline"
              className="shrink-0 bg-sky-500/10 border-sky-500/20 text-sky-400 font-mono text-[10px] uppercase"
            >
              {filtered.length} signals
            </Badge>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_180px_180px_130px] gap-3">
          <div className="relative min-w-0">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search signals, reports, source refs, buyer type..."
              className="pl-9 bg-slate-950/70 border-slate-800 text-slate-200 placeholder:text-slate-600"
            />
          </div>

          <select
            value={selectedNiche}
            onChange={(event) => setSelectedNiche(event.target.value)}
            className="h-10 min-w-0 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-xs text-slate-300 outline-none"
          >
            {niches.map((niche) => (
              <option key={niche} value={niche}>
                {niche === 'ALL' ? 'All niches' : niche}
              </option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(event) => setSelectedStatus(event.target.value)}
            className="h-10 min-w-0 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-xs text-slate-300 outline-none"
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status === 'ALL' ? 'All statuses' : status}
              </option>
            ))}
          </select>

          <select
            value={rowsPerPage}
            onChange={(event) => setRowsPerPage(Number(event.target.value) as (typeof PAGE_SIZE_OPTIONS)[number])}
            className="h-10 min-w-0 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-xs text-slate-300 outline-none"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-4">
        {visible.length > 0 ? (
          visible.map((opp: any) => {
            const confidence = scorePercent(opp.confidence_score);
            const risk = scorePercent(opp.risk_score);
            const title = cleanText(opp.title || 'Untitled Opportunity');
            const niche = cleanText(opp.niche || 'General');
            const priceNok = opp.price_nok ?? opp.recommended_price_nok ?? 0;
            const projectedValue = opp.projected_market_value_usd ?? opp.potential_profit ?? 0;
            const status = cleanText(opp.status || 'tracked');
            const reportLinks = buildReportLinks(opp);
            const primaryReport = reportLinks[0];
            const createdAt = opportunityTime(opp);

            return (
              <Card
                key={opp.id || title}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedOpportunity(opp)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedOpportunity(opp);
                  }
                }}
                className="group bg-slate-950/65 border-slate-800 hover:border-sky-500/40 transition-all shadow-xl overflow-hidden border-l-4 border-l-sky-500 min-w-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              >
                <div className="p-5 space-y-5 min-w-0">
                  <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4 min-w-0">
                    <div className="space-y-2 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-mono text-slate-600 shrink-0">
                          #{cleanText(opp.id || '').slice(-4) || '----'}
                        </span>

                        <h3 className="text-sm font-black text-slate-100 tracking-tight truncate group-hover:text-sky-200">
                          {title}
                        </h3>
                      </div>

                      <p className="text-xs text-slate-400 leading-relaxed">
                        {shortText(opp.summary || opp.evidence, 220)}
                      </p>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Badge
                          variant="outline"
                          className={cn('text-[9px] font-mono uppercase', getStatusClass(status))}
                        >
                          {status}
                        </Badge>

                        <Badge
                          variant="outline"
                          className="bg-slate-900 border-slate-800 text-slate-400 text-[9px] font-mono uppercase"
                        >
                          {formatTimestamp(createdAt)}
                        </Badge>

                        {primaryReport && (
                          <a
                            href={primaryReport.href}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex items-center gap-1 rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-[9px] font-bold uppercase text-sky-300 hover:bg-sky-500/15"
                          >
                            <ExternalLink className="h-3 w-3" />
                            report
                          </a>
                        )}
                      </div>
                    </div>

                    <Badge
                      variant="outline"
                      className="shrink-0 xl:max-w-[190px] justify-center text-center bg-slate-800/80 border-slate-700 text-slate-100 text-[9px] font-black uppercase leading-relaxed whitespace-normal"
                    >
                      {niche}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
                    <div className="space-y-2">
                      <p className="text-[9px] text-slate-500 font-black uppercase">Confidence</p>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-400" style={{ width: `${confidence}%` }} />
                      </div>
                      <p className="text-[10px] font-mono text-emerald-400">{confidence}%</p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[9px] text-slate-500 font-black uppercase">Risk Vector</p>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={cn('h-full', risk > 65 ? 'bg-red-400' : risk > 40 ? 'bg-amber-400' : 'bg-sky-400')}
                          style={{ width: `${risk}%` }}
                        />
                      </div>
                      <p className={cn('text-[10px] font-mono', getRiskClass(risk))}>{risk}%</p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[9px] text-slate-500 font-black uppercase">Projected Value</p>
                      <p className="text-xs font-mono font-black text-emerald-400 flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        {formatUsd(projectedValue)}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[9px] text-slate-500 font-black uppercase">Product Price</p>
                      <p className="text-xs font-mono font-black text-amber-400 flex items-center gap-1">
                        <Coins className="h-3 w-3" />
                        {formatNok(priceNok)}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[9px] text-slate-500 font-black uppercase">Context</p>
                      <p className="text-xs font-black text-slate-100 flex items-center gap-2">
                        <Eye className="h-3.5 w-3.5 text-sky-400" />
                        Click to inspect
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        ) : (
          <Card className="bg-slate-950/60 border-slate-800 p-12 text-center">
            <Search className="h-10 w-10 mx-auto text-slate-700 mb-4" />
            <p className="text-xs font-mono uppercase tracking-widest text-slate-500">
              No matching opportunity signals
            </p>
          </Card>
        )}
      </div>

      {filtered.length > rowsPerPage && (
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pt-2">
          <p className="text-[10px] font-mono text-slate-500 uppercase">
            Page {safePage} of {totalPages} • showing {showingFrom}-{showingTo} of {filtered.length}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePage === 1}
              onClick={() => setPage(1)}
              className="border-slate-800 bg-slate-950 text-slate-300"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePage === 1}
              onClick={() => setPage((current) => clamp(current - 1, 1, totalPages))}
              className="border-slate-800 bg-slate-950 text-slate-300"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Newer
            </Button>

            {pageNumbers(safePage, totalPages).map((pageNumber) => (
              <Button
                key={pageNumber}
                type="button"
                variant={pageNumber === safePage ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPage(pageNumber)}
                className={cn(
                  'font-mono text-xs',
                  pageNumber === safePage
                    ? 'bg-sky-600 text-white hover:bg-sky-500'
                    : 'border-slate-800 bg-slate-950 text-slate-300'
                )}
              >
                {pageNumber}
              </Button>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePage === totalPages}
              onClick={() => setPage((current) => clamp(current + 1, 1, totalPages))}
              className="border-slate-800 bg-slate-950 text-slate-300"
            >
              Older
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePage === totalPages}
              onClick={() => setPage(totalPages)}
              className="border-slate-800 bg-slate-950 text-slate-300"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {selectedOpportunity && (
        <OpportunityDetailModal
          opportunity={selectedOpportunity}
          onClose={() => setSelectedOpportunity(null)}
        />
      )}
    </div>
  );
}