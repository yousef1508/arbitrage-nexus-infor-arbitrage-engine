import React, { useEffect, useMemo, useState } from 'react';
import {
  Terminal,
  Search,
  Copy,
  Download,
  Pause,
  Play,
  ArrowDownUp,
  Filter,
  ShieldAlert,
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  TimerReset,
  Cpu,
  Database,
  ExternalLink,
  RotateCcw,
  ListFilter,
  Eye,
  EyeOff
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type KernelLogViewerProps = {
  logs: string[];
  height?: number;
};

type LogLevel = 'critical' | 'warning' | 'success' | 'deferred' | 'ai' | 'info' | 'default';

type ParsedLog = {
  id: string;
  raw: string;
  time: string;
  tag: string;
  message: string;
  level: LogLevel;
  searchable: string;
  jsonPayload?: string;
  assetSlug?: string;
  assetId?: string;
  reportUrl?: string;
};

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250] as const;

function cleanText(value: unknown): string {
  return String(value ?? '')
    .replace(/\uFFFD/g, '')
    .replace(/�/g, '')
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function compactText(value: unknown): string {
  return cleanText(value).replace(/\s+/g, ' ').trim();
}

function stableHash(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash >>> 0).toString(16);
}

function extractJsonPayload(message: string): string | undefined {
  const firstBrace = message.indexOf('{');
  const lastBrace = message.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return undefined;

  const candidate = message.slice(firstBrace, lastBrace + 1);

  try {
    return JSON.stringify(JSON.parse(candidate), null, 2);
  } catch {
    return undefined;
  }
}

function extractAssetSlug(line: string): string | undefined {
  const patterns = [
    /SLUG_([a-z0-9][a-z0-9-]{3,})/i,
    /\/reports\/([a-z0-9][a-z0-9-]{3,})/i,
    /report_slug["']?\s*[:=]\s*["']?([a-z0-9][a-z0-9-]{3,})/i
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match?.[1]) return match[1];
  }

  return undefined;
}

function extractAssetId(line: string): string | undefined {
  const match = line.match(/\b(asset-[a-z0-9-]+)\b/i);
  return match?.[1];
}

function parseLogLine(line: string, index: number): ParsedLog {
  const raw = cleanText(line);
  const match = raw.match(/^(\d{2}:\d{2}:\d{2})\s+\[([^\]]+)\]\s*(.*)$/);

  const time = match?.[1] ?? '--:--:--';
  const tag = compactText(match?.[2] ?? 'SYSTEM').toUpperCase();
  const message = compactText(match?.[3] ?? raw);
  const upper = raw.toUpperCase();

  let level: LogLevel = 'default';

  if (
    upper.includes('CRITICAL') ||
    upper.includes('KERNEL_HALT') ||
    upper.includes('FAILED') ||
    upper.includes('ERROR') ||
    upper.includes('INVALID') ||
    upper.includes('CRASH') ||
    upper.includes('PAYMENT_REQUIRED') ||
    upper.includes('AUTH_REQUIRED')
  ) {
    level = 'critical';
  } else if (
    upper.includes('RATE_LIMIT') ||
    upper.includes('AI_RATE_LIMITED') ||
    upper.includes('BACKOFF') ||
    upper.includes('QUOTA') ||
    upper.includes('429') ||
    upper.includes('RESOURCE_EXHAUSTED')
  ) {
    level = 'ai';
  } else if (
    upper.includes('DEFERRED') ||
    upper.includes('SKIP') ||
    upper.includes('PACING') ||
    upper.includes('LOCK_ACTIVE')
  ) {
    level = 'deferred';
  } else if (
    upper.includes('WARNING') ||
    upper.includes('FALLBACK') ||
    upper.includes('STALE') ||
    upper.includes('PENDING')
  ) {
    level = 'warning';
  } else if (
    upper.includes('SUCCESS') ||
    upper.includes('VERIFIED') ||
    upper.includes('CREATED') ||
    upper.includes('COMPLETE') ||
    upper.includes('CREDITED') ||
    upper.includes('UNLOCKED') ||
    upper.includes('MATCHED_OFFERS')
  ) {
    level = 'success';
  } else if (
    upper.includes('BOOT') ||
    upper.includes('INIT') ||
    upper.includes('EXECUTION') ||
    upper.includes('SELECTED') ||
    upper.includes('UPDATED') ||
    upper.includes('SOURCE_SELECTION') ||
    upper.includes('NICHE_SELECTION')
  ) {
    level = 'info';
  }

  const assetSlug = extractAssetSlug(raw);
  const assetId = extractAssetId(raw);

  return {
    id: `${time}-${index}-${stableHash(raw)}`,
    raw,
    time,
    tag,
    message,
    level,
    searchable: `${raw} ${tag} ${message}`.toLowerCase(),
    jsonPayload: extractJsonPayload(message),
    assetSlug,
    assetId,
    reportUrl: assetSlug ? `/reports/${assetSlug}` : undefined
  };
}

function levelClass(level: LogLevel) {
  if (level === 'critical') return 'border-l-red-500 bg-red-500/[0.06] text-red-100';
  if (level === 'warning') return 'border-l-amber-500 bg-amber-500/[0.055] text-amber-100';
  if (level === 'success') return 'border-l-emerald-500 bg-emerald-500/[0.055] text-emerald-100';
  if (level === 'deferred') return 'border-l-orange-500 bg-orange-500/[0.045] text-orange-100';
  if (level === 'ai') return 'border-l-fuchsia-500 bg-fuchsia-500/[0.045] text-fuchsia-100';
  if (level === 'info') return 'border-l-sky-500 bg-sky-500/[0.04] text-sky-100';
  return 'border-l-slate-700 bg-slate-950/20 text-slate-300';
}

function tagClass(tag: string) {
  const t = tag.toUpperCase();

  if (t.includes('SYSTEM')) return 'text-sky-300 border-sky-500/20 bg-sky-500/10';
  if (t.includes('KERNEL')) return 'text-indigo-300 border-indigo-500/20 bg-indigo-500/10';
  if (t.includes('SCHEDULER')) return 'text-teal-300 border-teal-500/20 bg-teal-500/10';
  if (t.includes('AI')) return 'text-fuchsia-300 border-fuchsia-500/20 bg-fuchsia-500/10';
  if (t.includes('SCOUT')) return 'text-cyan-300 border-cyan-500/20 bg-cyan-500/10';
  if (t.includes('ANALYST')) return 'text-violet-300 border-violet-500/20 bg-violet-500/10';
  if (t.includes('ROUTER')) return 'text-amber-300 border-amber-500/20 bg-amber-500/10';
  if (t.includes('AFFILIATE')) return 'text-lime-300 border-lime-500/20 bg-lime-500/10';
  if (t.includes('PRICE_ORACLE')) return 'text-pink-300 border-pink-500/20 bg-pink-500/10';
  if (t.includes('VERIFY_PAYMENT')) return 'text-emerald-300 border-emerald-500/20 bg-emerald-500/10';
  if (t.includes('TREASURY')) return 'text-yellow-300 border-yellow-500/20 bg-yellow-500/10';
  if (t.includes('PERFORMANCE')) return 'text-orange-300 border-orange-500/20 bg-orange-500/10';
  if (t.includes('GOVERNOR')) return 'text-red-300 border-red-500/20 bg-red-500/10';

  return 'text-slate-400 border-slate-700 bg-slate-900/80';
}

function levelLabel(level: LogLevel): string {
  if (level === 'critical') return 'Critical';
  if (level === 'warning') return 'Warning';
  if (level === 'success') return 'Success';
  if (level === 'deferred') return 'Deferred';
  if (level === 'ai') return 'AI quota';
  if (level === 'info') return 'Info';
  return 'Default';
}

function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

function getLevelIcon(level: LogLevel) {
  if (level === 'critical') return <AlertCircle className="h-3.5 w-3.5" />;
  if (level === 'warning') return <ShieldAlert className="h-3.5 w-3.5" />;
  if (level === 'success') return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (level === 'ai') return <Cpu className="h-3.5 w-3.5" />;
  if (level === 'deferred') return <TimerReset className="h-3.5 w-3.5" />;
  return <Activity className="h-3.5 w-3.5" />;
}

function getReportHref(url?: string): string {
  if (!url) return '';
  return url.startsWith('/api/') ? url : `/api${url}`;
}

function copyText(text: string, successMessage: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success(successMessage))
    .catch(() => toast.error('Could not copy to clipboard'));
}

function KernelLogViewer({ logs, height = 560 }: KernelLogViewerProps) {
  const [query, setQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('ALL');
  const [selectedLevel, setSelectedLevel] = useState<LogLevel | 'ALL'>('ALL');
  const [newestFirst, setNewestFirst] = useState(true);
  const [wrapLines, setWrapLines] = useState(true);
  const [compactRows, setCompactRows] = useState(false);
  const [paused, setPaused] = useState(false);
  const [frozenLogs, setFrozenLogs] = useState<string[] | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(50);
  const [page, setPage] = useState(1);

  const sourceLogs = paused ? frozenLogs ?? logs : logs;

  const parsedLogs = useMemo(() => {
    const cleaned = (sourceLogs || [])
      .map(cleanText)
      .filter(Boolean)
      .map(parseLogLine);

    return newestFirst ? cleaned : [...cleaned].reverse();
  }, [sourceLogs, newestFirst]);

  const tags = useMemo(() => {
    return ['ALL', ...Array.from(new Set(parsedLogs.map((line) => line.tag))).sort()];
  }, [parsedLogs]);

  const filteredLogs = useMemo(() => {
    const q = query.trim().toLowerCase();

    return parsedLogs.filter((entry) => {
      const tagMatch = selectedTag === 'ALL' || entry.tag === selectedTag;
      const levelMatch = selectedLevel === 'ALL' || entry.level === selectedLevel;
      const textMatch = !q || entry.searchable.includes(q);

      return tagMatch && levelMatch && textMatch;
    });
  }, [parsedLogs, query, selectedTag, selectedLevel]);

  const summary = useMemo(() => {
    return {
      total: filteredLogs.length,
      all: parsedLogs.length,
      critical: filteredLogs.filter((log) => log.level === 'critical').length,
      warning: filteredLogs.filter((log) => log.level === 'warning').length,
      ai: filteredLogs.filter((log) => log.level === 'ai').length,
      deferred: filteredLogs.filter((log) => log.level === 'deferred').length,
      success: filteredLogs.filter((log) => log.level === 'success').length
    };
  }, [filteredLogs, parsedLogs]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredLogs.length);
  const visibleLogs = filteredLogs.slice(startIndex, endIndex);

  const hasActiveFilters =
    query.trim().length > 0 || selectedTag !== 'ALL' || selectedLevel !== 'ALL';

  useEffect(() => {
    setPage(1);
  }, [query, selectedTag, selectedLevel, newestFirst, pageSize, sourceLogs.length]);

  const togglePaused = () => {
    setPaused((current) => {
      const next = !current;
      setFrozenLogs(next ? [...logs] : null);
      toast.info(next ? 'Log stream paused' : 'Log stream resumed');
      return next;
    });
  };

  const copyVisibleLogs = () => {
    copyText(visibleLogs.map((log) => log.raw).join('\n'), 'Current log page copied');
  };

  const copyAllFilteredLogs = () => {
    copyText(filteredLogs.map((log) => log.raw).join('\n'), 'Filtered logs copied');
  };

  const downloadVisibleLogs = () => {
    const body = filteredLogs.map((log) => log.raw).join('\n');
    const blob = new Blob([body], {
      type: 'text/plain;charset=utf-8'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = `kernel-logs-${new Date().toISOString().replace(/:/g, '-')}.txt`;
    a.click();

    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setQuery('');
    setSelectedTag('ALL');
    setSelectedLevel('ALL');
    setPage(1);
  };

  const toggleExpanded = (key: string) => {
    setExpanded((current) => ({
      ...current,
      [key]: !current[key]
    }));
  };

  const expandVisible = () => {
    const next = { ...expanded };

    for (const entry of visibleLogs) {
      next[entry.id] = true;
    }

    setExpanded(next);
  };

  const collapseVisible = () => {
    const next = { ...expanded };

    for (const entry of visibleLogs) {
      delete next[entry.id];
    }

    setExpanded(next);
  };

  return (
    <Card className="min-w-0 overflow-hidden border-slate-800 bg-slate-950/85 shadow-2xl border-t-2 border-t-sky-500/30">
      <CardHeader className="space-y-4 border-b border-slate-800/50 bg-slate-900/25 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-sky-400">
            <Terminal className="h-3.5 w-3.5" />
            Kernel Log Console
          </CardTitle>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-slate-800 bg-slate-900 text-[9px] font-mono text-slate-400">
              Showing: {formatCount(summary.total)}
            </Badge>
            <Badge variant="outline" className="border-slate-800 bg-slate-900 text-[9px] font-mono text-slate-500">
              Stored: {formatCount(summary.all)}
            </Badge>
            <Badge variant="outline" className="border-red-500/20 bg-red-500/10 text-[9px] font-mono text-red-400">
              <AlertCircle className="mr-1 h-3 w-3" />
              {summary.critical}
            </Badge>
            <Badge variant="outline" className="border-amber-500/20 bg-amber-500/10 text-[9px] font-mono text-amber-400">
              <ShieldAlert className="mr-1 h-3 w-3" />
              {summary.warning}
            </Badge>
            <Badge variant="outline" className="border-fuchsia-500/20 bg-fuchsia-500/10 text-[9px] font-mono text-fuchsia-300">
              <Cpu className="mr-1 h-3 w-3" />
              {summary.ai}
            </Badge>
            <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/10 text-[9px] font-mono text-emerald-400">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              {summary.success}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 2xl:grid-cols-[minmax(0,1fr)_170px_170px_120px]">
          <div className="relative min-w-0">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search logs, model, asset id, slug, tx hash, quota, oracle..."
              className="min-w-0 border-slate-800 bg-slate-950 pl-9 text-slate-200 placeholder:text-slate-600"
            />
          </div>

          <div className="flex min-w-0 items-center gap-2">
            <Filter className="h-4 w-4 shrink-0 text-slate-500" />
            <select
              value={selectedTag}
              onChange={(event) => setSelectedTag(event.target.value)}
              className="h-10 w-full min-w-0 rounded-md border border-slate-800 bg-slate-950 px-3 text-xs text-slate-300 outline-none"
            >
              {tags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>

          <div className="flex min-w-0 items-center gap-2">
            <ListFilter className="h-4 w-4 shrink-0 text-slate-500" />
            <select
              value={selectedLevel}
              onChange={(event) => setSelectedLevel(event.target.value as LogLevel | 'ALL')}
              className="h-10 w-full min-w-0 rounded-md border border-slate-800 bg-slate-950 px-3 text-xs text-slate-300 outline-none"
            >
              <option value="ALL">All severity</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="ai">AI quota</option>
              <option value="deferred">Deferred</option>
              <option value="success">Success</option>
              <option value="info">Info</option>
              <option value="default">Default</option>
            </select>
          </div>

          <select
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value) as (typeof PAGE_SIZE_OPTIONS)[number])}
            className="h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-xs text-slate-300 outline-none"
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} / page
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setNewestFirst((value) => !value)}
            className="border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-900"
          >
            <ArrowDownUp className="mr-2 h-4 w-4" />
            {newestFirst ? 'Newest first' : 'Oldest first'}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setWrapLines((value) => !value)}
            className="border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-900"
          >
            <Activity className="mr-2 h-4 w-4" />
            {wrapLines ? 'Wrap on' : 'Wrap off'}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCompactRows((value) => !value)}
            className="border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-900"
          >
            {compactRows ? <Eye className="mr-2 h-4 w-4" /> : <EyeOff className="mr-2 h-4 w-4" />}
            {compactRows ? 'Comfort rows' : 'Compact rows'}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={togglePaused}
            className={cn(
              'border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-900',
              paused && 'border-orange-500/30 bg-orange-500/10 text-orange-300'
            )}
          >
            {paused ? <Play className="mr-2 h-4 w-4" /> : <Pause className="mr-2 h-4 w-4" />}
            {paused ? 'Resume' : 'Pause'}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={expandVisible}
            className="border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-900"
          >
            <ChevronDown className="mr-2 h-4 w-4" />
            Expand page
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={collapseVisible}
            className="border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-900"
          >
            <ChevronRight className="mr-2 h-4 w-4" />
            Collapse page
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copyVisibleLogs}
            className="border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-900"
          >
            <Copy className="mr-2 h-4 w-4" />
            Copy page
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copyAllFilteredLogs}
            className="border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-900"
          >
            <Database className="mr-2 h-4 w-4" />
            Copy filtered
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={downloadVisibleLogs}
            className="border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-900"
          >
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>

          {hasActiveFilters && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetFilters}
              className="border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/15"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset filters
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-slate-500">
          <div>
            Page {safePage} / {totalPages} · Rows {filteredLogs.length === 0 ? 0 : startIndex + 1}-{endIndex} of{' '}
            {formatCount(filteredLogs.length)}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setPage(1)}
              className="h-7 border-slate-800 bg-slate-950 px-2 text-[10px] text-slate-300 disabled:opacity-30"
            >
              First
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              className="h-7 border-slate-800 bg-slate-950 px-2 text-[10px] text-slate-300 disabled:opacity-30"
            >
              Prev
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              className="h-7 border-slate-800 bg-slate-950 px-2 text-[10px] text-slate-300 disabled:opacity-30"
            >
              Next
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages}
              onClick={() => setPage(totalPages)}
              className="h-7 border-slate-800 bg-slate-950 px-2 text-[10px] text-slate-300 disabled:opacity-30"
            >
              Last
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="min-w-0 bg-black/30 p-0">
        <div className="grid grid-cols-[76px_120px_92px_minmax(0,1fr)_54px] border-b border-slate-800/50 bg-slate-950/95 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
          <div>Time</div>
          <div>Source</div>
          <div>Level</div>
          <div>Message</div>
          <div className="text-right">Links</div>
        </div>

        <ScrollArea className="w-full" style={{ height }}>
          {visibleLogs.length > 0 ? (
            <div className="divide-y divide-slate-800/40">
              {visibleLogs.map((entry) => {
                const isExpanded = !!expanded[entry.id];
                const reportHref = getReportHref(entry.reportUrl);

                return (
                  <div
                    key={entry.id}
                    className={cn(
                      'grid grid-cols-[76px_120px_92px_minmax(0,1fr)_54px] gap-3 border-l-2 px-4 text-[11px] font-mono transition-colors hover:bg-slate-900/50',
                      compactRows ? 'py-2' : 'py-3',
                      levelClass(entry.level)
                    )}
                  >
                    <div className="pt-1 tabular-nums text-slate-500">{entry.time}</div>

                    <div className="min-w-0 pt-0.5">
                      <Badge
                        variant="outline"
                        className={cn('h-6 max-w-full truncate text-[9px] font-mono uppercase', tagClass(entry.tag))}
                      >
                        {entry.tag}
                      </Badge>
                    </div>

                    <div className="pt-0.5">
                      <Badge
                        variant="outline"
                        className="h-6 border-slate-700 bg-slate-900/80 text-[9px] font-mono uppercase text-slate-300"
                      >
                        <span className="mr-1">{getLevelIcon(entry.level)}</span>
                        {levelLabel(entry.level)}
                      </Badge>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleExpanded(entry.id)}
                      className="flex min-w-0 items-start gap-2 text-left"
                    >
                      <span className="mt-1 shrink-0 text-slate-600">
                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            'block min-w-0 leading-relaxed',
                            wrapLines || isExpanded
                              ? 'whitespace-pre-wrap break-words'
                              : 'overflow-hidden text-ellipsis whitespace-nowrap'
                          )}
                        >
                          {isExpanded ? entry.raw : entry.message}
                        </span>

                        {isExpanded && entry.jsonPayload && (
                          <pre className="mt-3 max-h-96 overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-3 text-[10px] leading-relaxed text-slate-300">
                            {entry.jsonPayload}
                          </pre>
                        )}

                        {isExpanded && (entry.assetId || entry.assetSlug) && (
                          <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-slate-500">
                            {entry.assetId && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  copyText(entry.assetId || '', 'Asset ID copied');
                                }}
                                className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 hover:bg-slate-900"
                              >
                                Asset: {entry.assetId}
                              </button>
                            )}

                            {entry.assetSlug && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  copyText(entry.assetSlug || '', 'Report slug copied');
                                }}
                                className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 hover:bg-slate-900"
                              >
                                Slug: {entry.assetSlug}
                              </button>
                            )}
                          </div>
                        )}
                      </span>
                    </button>

                    <div className="flex items-start justify-end gap-1 pt-0.5">
                      {reportHref ? (
                        <a
                          href={reportHref}
                          target="_blank"
                          rel="noreferrer"
                          title="Open generated report"
                          className="rounded-md border border-slate-800 bg-slate-950 p-1.5 text-slate-400 hover:border-sky-500/40 hover:text-sky-300"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}

                      <button
                        type="button"
                        title="Copy raw log line"
                        onClick={(event) => {
                          event.stopPropagation();
                          copyText(entry.raw, 'Raw log copied');
                        }}
                        className="rounded-md border border-slate-800 bg-slate-950 p-1.5 text-slate-500 hover:border-slate-600 hover:text-slate-300"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3 py-24 text-center opacity-40">
              <Terminal className="mx-auto h-8 w-8 text-slate-500" />
              <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-slate-500">
                No matching logs
              </p>
              {hasActiveFilters && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={resetFilters}
                  className="border-slate-800 bg-slate-950 text-slate-300"
                >
                  Reset filters
                </Button>
              )}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export { KernelLogViewer };
export default KernelLogViewer;