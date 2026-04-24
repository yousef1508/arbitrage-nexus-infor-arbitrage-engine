import React from 'react';
import { useStore } from '@/lib/store';
import { OpportunityFeed } from '@/components/OpportunityFeed';
import { AppLayout } from '@/components/layout/AppLayout';
import { Database, Search, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
/**
 * VaultPage
 * Dedicated interface for browsing historical and active signals.
 * Removed useShallow to prevent dispatcher null errors.
 */
export function VaultPage() {
  const opportunitiesCount = useStore(s => s.opportunities?.length ?? 0);
  return (
    <AppLayout container contentClassName="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3">
            <Database className="h-8 w-8 text-sky-400" />
            OPPORTUNITY VAULT
          </h1>
          <p className="text-slate-400 font-mono text-xs mt-1 uppercase tracking-widest">
            {opportunitiesCount} Archived Signals Found in Kernel Memory
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
            <Input
              placeholder="Filter by niche or ID..."
              className="pl-9 bg-slate-900/50 border-slate-800 focus-visible:ring-sky-500/50"
            />
          </div>
          <Button variant="outline" size="icon" className="border-slate-800 hover:bg-slate-900">
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="bg-slate-900/20 border border-slate-800/50 rounded-2xl p-6 shadow-2xl">
        <OpportunityFeed />
      </div>
    </AppLayout>
  );
}