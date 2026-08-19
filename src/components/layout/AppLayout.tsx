import React, { useEffect, useMemo } from 'react';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore, useIsSetup, useEmergencyStop } from '@/lib/store';
import { cn } from '@/lib/utils';
import { AdminLogoutButton } from '@/components/AdminLogoutButton';
import { Toaster } from '@/components/ui/sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Activity,
  AlertTriangle,
  Clock,
  DatabaseZap,
  ExternalLink,
  LockKeyhole,
  Radio,
  ShieldCheck,
  Wifi,
  WifiOff
} from 'lucide-react';

type AppLayoutProps = {
  children: React.ReactNode;
  container?: boolean;
  className?: string;
  contentClassName?: string;
};

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatCountdown(targetMs?: number): string {
  const target = safeNumber(targetMs, 0);

  if (!target) return 'none';

  const remaining = Math.max(0, target - Date.now());

  if (remaining <= 0) return 'ready';

  const seconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;

  if (minutes <= 0) return `${restSeconds}s`;

  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;

  if (hours <= 0) return `${minutes}m ${restSeconds}s`;

  return `${hours}h ${restMinutes}m`;
}

function statusTone(status: string, emergencyStop: boolean) {
  if (emergencyStop) {
    return {
      dot: 'bg-red-500 shadow-[0_0_18px_rgba(239,68,68,0.75)]',
      badge: 'border-red-500/25 bg-red-500/10 text-red-300',
      label: 'HALTED'
    };
  }

  if (status === 'healthy') {
    return {
      dot: 'bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.75)] animate-pulse',
      badge: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
      label: 'NOMINAL'
    };
  }

  if (status === 'warning') {
    return {
      dot: 'bg-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.7)] animate-pulse',
      badge: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
      label: 'WARNING'
    };
  }

  if (status === 'degraded') {
    return {
      dot: 'bg-orange-500 shadow-[0_0_18px_rgba(249,115,22,0.7)]',
      badge: 'border-orange-500/25 bg-orange-500/10 text-orange-300',
      label: 'DEGRADED'
    };
  }

  return {
    dot: 'bg-slate-500',
    badge: 'border-slate-700 bg-slate-900 text-slate-400',
    label: 'UNKNOWN'
  };
}

function lastRunTone(status?: string) {
  const normalized = String(status || 'idle').toLowerCase();

  if (normalized === 'running') return 'border-sky-500/25 bg-sky-500/10 text-sky-300';
  if (normalized === 'success') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300';
  if (normalized === 'deferred' || normalized === 'skipped') return 'border-amber-500/25 bg-amber-500/10 text-amber-300';
  if (normalized === 'failed') return 'border-red-500/25 bg-red-500/10 text-red-300';

  return 'border-slate-700 bg-slate-900 text-slate-400';
}

function HeaderMetric({
  icon: Icon,
  label,
  value,
  className
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('hidden xl:flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 backdrop-blur-md', className)}>
      <Icon className="h-3.5 w-3.5 text-slate-500" />
      <div className="leading-none">
        <p className="text-[8px] font-black uppercase tracking-[0.18em] text-slate-600">
          {label}
        </p>
        <div className="mt-1 text-[10px] font-mono font-bold text-slate-300">
          {value}
        </div>
      </div>
    </div>
  );
}

export function AppLayout({
  children,
  container = false,
  className,
  contentClassName
}: AppLayoutProps): JSX.Element {
  const isSetup = useIsSetup();
  const emergencyStop = useEmergencyStop();
  const location = useLocation();
  const navigate = useNavigate();

  const fetchSystemState = useStore((state) => state.fetchSystemState);
  const isInitialLoad = useStore((state) => state.isInitialLoad);
  const systemStatus = useStore((state) => state.system_health?.status ?? 'unknown');
  const lastRunStatus = useStore((state) => state.system_health?.last_run?.status ?? 'idle');
  const lastRunError = useStore((state) => state.system_health?.last_run?.error);
  const aiQuotaMode = useStore((state) => state.system_health?.ai_quota_mode ?? state.system_health?.ai_quota?.mode ?? 'available');
  const aiNextSafeAttemptAt = useStore((state) => state.system_health?.ai_next_safe_attempt_at ?? state.system_health?.ai_quota?.next_safe_attempt_at ?? 0);
  const nextScheduledCycleAt = useStore((state) => state.system_health?.next_scheduled_cycle_at ?? 0);
  const autonomousEnabled = useStore((state) => state.policy?.autonomous_ingestion_enabled !== false);
  const reportsCreated = useStore((state) => state.earning_assets?.length ?? 0);

  const tone = useMemo(
    () => statusTone(systemStatus, emergencyStop),
    [systemStatus, emergencyStop]
  );

  const aiBackoffActive = safeNumber(aiNextSafeAttemptAt, 0) > Date.now();

  useEffect(() => {
    fetchSystemState();

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchSystemState();
      }
    }, 30000);

    return () => window.clearInterval(interval);
  }, [fetchSystemState]);

  useEffect(() => {
    const publicAdminRoutes = ['/setup', '/admin-login'];

    if (isSetup === false && !publicAdminRoutes.includes(location.pathname)) {
      navigate('/setup');
    }
  }, [isSetup, location.pathname, navigate]);

  const isLoading = isSetup === undefined && isInitialLoad;

  if (isLoading && location.pathname !== '/setup' && location.pathname !== '/admin-login') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 space-y-5 overflow-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.12),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.08),transparent_32%)]" />

        <div className="relative w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center shadow-2xl">
          <DatabaseZap className="h-6 w-6 text-sky-400 animate-pulse" />
        </div>

        <Skeleton className="relative h-4 w-56 bg-slate-900" />

        <p className="relative text-[10px] font-mono text-slate-600 uppercase tracking-[0.22em]">
          Initialising autonomous kernel
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider defaultOpen={true}>
        <AppSidebar />

        <SidebarInset
          className={cn(
            'bg-slate-950 min-h-screen flex flex-col relative overflow-x-hidden',
            'before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.08),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.06),transparent_34%)]',
            'after:pointer-events-none after:absolute after:inset-0 after:bg-[linear-gradient(rgba(148,163,184,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.025)_1px,transparent_1px)] after:bg-[size:42px_42px]',
            className
          )}
        >
          <div className="relative z-10 flex flex-col flex-1">
            <header className="sticky top-0 z-50 px-3 pt-3 pointer-events-none">
              <div className="pointer-events-auto flex items-center justify-between gap-3 rounded-2xl border border-slate-800/80 bg-slate-950/70 px-3 py-2 shadow-2xl backdrop-blur-xl">
                <div className="flex items-center gap-2 min-w-0">
                  <SidebarTrigger className="bg-slate-900/80 border border-slate-800 hover:bg-slate-800" />

                  <div className="hidden md:flex items-center gap-2 min-w-0">
                    <div className={cn('h-2 w-2 rounded-full shrink-0', tone.dot)} />
                    <Badge
                      variant="outline"
                      className={cn('text-[9px] font-mono uppercase tracking-wider', tone.badge)}
                    >
                      {tone.label}
                    </Badge>

                    <Badge
                      variant="outline"
                      className={cn('text-[9px] font-mono uppercase tracking-wider', lastRunTone(lastRunStatus))}
                    >
                      Run: {String(lastRunStatus).toUpperCase()}
                    </Badge>

                    {lastRunError && (
                      <Badge
                        variant="outline"
                        className="max-w-[280px] truncate border-red-500/20 bg-red-500/10 text-red-300 text-[9px] font-mono uppercase tracking-wider"
                      >
                        <AlertTriangle className="h-3 w-3 mr-1 shrink-0" />
                        {String(lastRunError)}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 min-w-0">
                  <HeaderMetric
                    icon={autonomousEnabled ? Wifi : WifiOff}
                    label="Autonomous"
                    value={autonomousEnabled ? 'enabled' : 'disabled'}
                    className={autonomousEnabled ? 'border-emerald-500/15' : 'border-red-500/20'}
                  />

                  <HeaderMetric
                    icon={Radio}
                    label="AI quota"
                    value={aiBackoffActive ? `backoff ${formatCountdown(aiNextSafeAttemptAt)}` : String(aiQuotaMode)}
                    className={aiBackoffActive ? 'border-amber-500/20' : ''}
                  />

                  <HeaderMetric
                    icon={Clock}
                    label="Next cycle"
                    value={nextScheduledCycleAt ? formatCountdown(nextScheduledCycleAt) : 'pending'}
                  />

                  <HeaderMetric
                    icon={Activity}
                    label="Reports"
                    value={reportsCreated}
                  />

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => window.open('/reports', '_blank', 'noopener,noreferrer')}
                    className="hidden sm:inline-flex border-slate-800 bg-slate-900/80 text-slate-300 hover:bg-slate-800 hover:text-white"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Public market
                  </Button>

                  <ThemeToggle className="bg-slate-900/80 border border-slate-800 backdrop-blur-md hover:bg-slate-800" />
                  <AdminLogoutButton />
                </div>
              </div>
            </header>

            <main
              className={cn(
                'flex-1 w-full',
                container && 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8',
                !container && 'px-4 sm:px-6 lg:px-8',
                'py-8 md:py-10 lg:py-12',
                contentClassName
              )}
            >
              {children}
            </main>

            <footer className="py-8 border-t border-slate-800/50 mt-auto bg-slate-950/40 backdrop-blur-sm">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex flex-col items-center md:items-start gap-1">
                  <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.22em]">
                    Arbitrage Nexus Engine
                  </p>
                  <p className="text-[9px] text-slate-700 font-mono uppercase tracking-widest">
                    Single-owner autonomous intelligence node
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className={cn('w-1.5 h-1.5 rounded-full', tone.dot)} />
                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-tighter">
                      Status: {tone.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-3.5 w-3.5 text-slate-600" />
                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-tighter">
                      Admin plane protected
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <LockKeyhole className="h-3.5 w-3.5 text-slate-600" />
                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-tighter">
                      Verified revenue only
                    </span>
                  </div>
                </div>
              </div>
            </footer>
          </div>
        </SidebarInset>
      </SidebarProvider>

      <Toaster />
    </TooltipProvider>
  );
}

export default AppLayout;