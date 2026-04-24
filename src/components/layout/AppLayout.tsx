import React, { useEffect } from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useLocation, useNavigate } from "react-router-dom";
import { useStore, useIsSetup, useEmergencyStop } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { Skeleton } from "@/components/ui/skeleton";
type AppLayoutProps = {
  children: React.ReactNode;
  container?: boolean;
  className?: string;
  contentClassName?: string;
};
export function AppLayout({ children, container = false, className, contentClassName }: AppLayoutProps): JSX.Element {
  const isSetup = useIsSetup();
  const emergencyStop = useEmergencyStop();
  const location = useLocation();
  const navigate = useNavigate();
  const fetchSystemState = useStore(s => s.fetchSystemState);
  useEffect(() => {
    fetchSystemState();
    const interval = setInterval(() => {
      fetchSystemState();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchSystemState]);
  useEffect(() => {
    if (isSetup === false && location.pathname !== '/setup') {
      navigate('/setup');
    }
  }, [isSetup, location.pathname, navigate]);
  const isLoading = isSetup === undefined;
  if (isLoading && location.pathname !== '/setup') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 space-y-4">
        <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 animate-pulse" />
        <Skeleton className="h-4 w-48 bg-slate-900" />
        <p className="text-[10px] font-mono text-slate-700 uppercase tracking-widest">Initialising Autonomous Kernel...</p>
      </div>
    );
  }
  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider defaultOpen={true}>
        <AppSidebar />
        <SidebarInset className={cn("bg-slate-950 min-h-screen flex flex-col", className)}>
          <div className="flex flex-col flex-1">
            <header className="sticky top-0 z-50 p-2 pointer-events-none">
              <div className="pointer-events-auto flex items-center gap-2">
                <SidebarTrigger className="bg-slate-900/80 border border-slate-800 backdrop-blur-md hover:bg-slate-800 pointer-events-auto" />
                <ThemeToggle className="bg-slate-900/80 border border-slate-800 backdrop-blur-md hover:bg-slate-800 pointer-events-auto" />
              </div>
            </header>
            <main className={cn(
              "flex-1 w-full",
              container && "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8",
              !container && "px-4 sm:px-6 lg:px-8",
              "py-8 md:py-10 lg:py-12",
              contentClassName
            )}>
              {children}
            </main>
            <footer className="py-8 border-t border-slate-800/50 mt-auto">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex flex-col items-center md:items-start gap-1">
                  <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">
                    Arbitrage Nexus Engine | Production Node
                  </p>
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)]",
                      emergencyStop ? "bg-red-500" : "bg-emerald-500 animate-pulse"
                    )} />
                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-tighter">
                      Status: {emergencyStop ? "HALTED" : "NOMINAL"}
                    </span>
                  </div>
                  <p className="text-[10px] text-amber-500/80 font-bold uppercase tracking-tighter">Built with ❤️ by Aurelia | Your AI Co-founder</p>
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