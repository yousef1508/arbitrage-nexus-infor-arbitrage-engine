import { create } from 'zustand';
import type {
  Opportunity,
  TreasuryBuckets,
  AgentPerformance,
  LedgerEntry,
  GovernorPolicy,
  AgentTask,
  ReinvestmentProposal,
  IngestRun,
  AgentRole
} from '../../worker/types';
import { toast } from 'sonner';
/**
 * Information Arbitrage Engine - Centralized State Store
 * Uses stable selectors to prevent React re-render loops and update depth exceptions.
 */
interface SystemState {
  treasury: TreasuryBuckets;
  opportunities: Opportunity[];
  agents: AgentPerformance[];
  tasks: AgentTask[];
  ledger: LedgerEntry[];
  policy: GovernorPolicy;
  isInitialLoad: boolean;
  isSetup: boolean | undefined;
  proposals: ReinvestmentProposal[];
  policy_audit_logs: string[];
  system_health: {
    status: 'healthy' | 'warning' | 'degraded' | 'down';
    last_check: number;
    last_scan: number;
    issues: string[];
    last_run?: IngestRun;
    kernel_logs: string[];
    failure_count: Record<string, number>;
  };
  daily_spend: number;
  last_withdrawal_at: number;
  owner_email?: string;
  rawDebugData: any;
  // Actions
  setTreasury: (buckets: TreasuryBuckets) => void;
  setInitialLoad: (loaded: boolean) => void;
  // Async Actions
  fetchSystemState: (isManualIngest?: boolean) => Promise<void>;
  persistPolicy: (policy: Partial<GovernorPolicy>) => Promise<void>;
  withdrawFunds: (amount: number, email: string) => Promise<{ success: boolean; error?: string }>;
  completeSetup: (config: { policy: Partial<GovernorPolicy>; owner_email: string }) => Promise<boolean>;
  handleProposal: (proposalId: string, action: 'approved' | 'rejected') => Promise<void>;
}
// Referential Stability Constants
const EMPTY_ARRAY: any[] = [];
const EMPTY_OBJECT: any = {};
const DEFAULT_TREASURY: TreasuryBuckets = Object.freeze({
  reserve: 0,
  operating: 0,
  reinvestment: 0,
  tax_buffer: 0,
  owner_withdrawable: 0,
  total: 0
});
const DEFAULT_POLICY: GovernorPolicy = Object.freeze({
  max_spend_per_day: 1000,
  max_risk_score: 0.75,
  reserve_floor: 2500,
  emergency_stop: false,
  cooldown_period_ms: 300000,
  trading_enabled: false,
  min_profit_margin: 0.15
});
export const useStore = create<SystemState>((set, get) => ({
  treasury: { ...DEFAULT_TREASURY },
  opportunities: [],
  tasks: [],
  agents: [],
  ledger: [],
  policy: { ...DEFAULT_POLICY },
  isInitialLoad: true,
  isSetup: undefined,
  proposals: [],
  policy_audit_logs: [],
  system_health: {
    status: 'degraded',
    last_check: 0,
    last_scan: 0,
    issues: [],
    kernel_logs: [],
    failure_count: {}
  },
  daily_spend: 0,
  last_withdrawal_at: 0,
  rawDebugData: null,
  setTreasury: (treasury) => set({ treasury }),
  setInitialLoad: (isInitialLoad) => set({ isInitialLoad }),
  fetchSystemState: async (isManualIngest = false) => {
    try {
      if (isManualIngest) {
        set((state) => ({
          system_health: {
            ...state.system_health,
            last_run: {
              triggeredAt: Date.now(),
              status: 'running',
              sources: state.system_health.last_run?.sources ?? ['manual_trigger'],
              signalsCreated: state.system_health.last_run?.signalsCreated ?? 0
            }
          }
        }));
      }
      const url = isManualIngest ? '/api/system/ingest' : '/api/system/stats';
      const method = isManualIngest ? 'POST' : 'GET';
      const resp = await fetch(url, {
        method,
        headers: { 'Accept': 'application/json' }
      });
      if (isManualIngest && resp.status === 409) {
        toast.info("Ingestion cycle locked", {
            description: "Kernel is currently processing a broadcast signal."
        });
        return;
      }
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.success && data.data) {
        set((state) => ({
          treasury: data.data.treasury || state.treasury,
          isSetup: typeof data.data.isSetup === 'boolean' ? data.data.isSetup : state.isSetup,
          proposals: data.data.proposals || state.proposals,
          opportunities: data.data.opportunities || state.opportunities,
          agents: data.data.agents || state.agents,
          tasks: data.data.tasks || state.tasks,
          ledger: data.data.ledger || state.ledger,
          policy: data.data.policy || state.policy,
          policy_audit_logs: data.data.policy_audit_logs || state.policy_audit_logs,
          system_health: data.data.system_health ? { ...state.system_health, ...data.data.system_health } : state.system_health,
          daily_spend: data.data.daily_spend ?? state.daily_spend,
          last_withdrawal_at: data.data.last_withdrawal_at ?? state.last_withdrawal_at,
          owner_email: data.data.owner_email || state.owner_email,
          rawDebugData: data.data
        }));
        if (data.data.system_health?.last_run?.error === "AI_CONFIG_MISSING") {
           toast.error("AI Configuration Missing", {
               description: "Please ensure CF_AI_BASE_URL and CF_AI_API_KEY are configured.",
               duration: 0
           });
        }
      }
    } catch (e) {
      console.warn('[STORE] State fetch rejected:', e);
    }
  },
  persistPolicy: async (policyUpdate) => {
    try {
      const currentPolicy = get().policy;
      const updated = { ...currentPolicy, ...policyUpdate };
      set({ policy: updated });
      await fetch('/api/system/policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
    } catch (e) {
      console.error('[STORE] Policy sync failed:', e);
    }
  },
  withdrawFunds: async (amount, email) => {
    try {
      const resp = await fetch('/api/treasury/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, email })
      });
      if (resp.status === 429) {
          return { success: false, error: 'Cooldown active. One withdrawal per 24h allowed.' };
      }
      const data = await resp.json();
      if (!resp.ok) {
          return { success: false, error: data.error || 'Withdrawal failed.' };
      }
      if (data.success && data.data) {
        set({ treasury: data.data, last_withdrawal_at: Date.now() });
        return { success: true };
      }
      return { success: false, error: 'Kernel returned invalid state.' };
    } catch (e) {
      return { success: false, error: 'Network failure during withdrawal.' };
    }
  },
  completeSetup: async (config) => {
    try {
      const resp = await fetch('/api/system/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (!resp.ok) return false;
      const data = await resp.json();
      if (data.success) {
        set({ isSetup: true });
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  },
  handleProposal: async (proposalId, action) => {
    try {
      const resp = await fetch('/api/system/proposals/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId, action })
      });
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.success && data.data) {
        set((state) => ({
          proposals: state.proposals.map(p => p.id === proposalId ? { ...p, status: action === 'approved' ? 'implemented' : 'rejected' } : p),
          treasury: data.data.treasury || state.treasury
        }));
      }
    } catch (e) {
      console.error('[STORE] Proposal resolution failed:', e);
    }
  }
}));
/**
 * STABLE SELECTORS - PRIMITIVES
 * These prevent re-renders when other parts of the state change.
 */
export const useReserve = () => useStore(s => s.treasury?.reserve ?? 0);
export const useOperating = () => useStore(s => s.treasury?.operating ?? 0);
export const useReinvestment = () => useStore(s => s.treasury?.reinvestment ?? 0);
export const useTaxBuffer = () => useStore(s => s.treasury?.tax_buffer ?? 0);
export const useWithdrawable = () => useStore(s => s.treasury?.owner_withdrawable ?? 0);
export const useTotalTreasury = () => useStore(s => s.treasury?.total ?? 0);
export const useIsSetup = () => useStore(s => s.isSetup);
export const useEmergencyStop = () => useStore(s => s.policy?.emergency_stop ?? false);
export const useMaxRiskScore = () => useStore(s => s.policy?.max_risk_score ?? 0);
export const useReserveFloor = () => useStore(s => s.policy?.reserve_floor ?? 0);
export const useMaxSpendPerDay = () => useStore(s => s.policy?.max_spend_per_day ?? 0);
export const useTradingEnabled = () => useStore(s => s.policy?.trading_enabled ?? false);
export const useSystemStatusLabel = () => useStore(s => s.system_health?.status ?? 'unknown');
export const useLastScanTime = () => useStore(s => s.system_health?.last_scan ?? 0);
export const useDailySpend = () => useStore(s => s.daily_spend ?? 0);
export const useLastWithdrawalAt = () => useStore(s => s.last_withdrawal_at ?? 0);
/**
 * STABLE SELECTORS - COLLECTIONS
 * Always return a frozen EMPTY_ARRAY to maintain referential identity when nullish.
 */
export const useOpportunitiesList = () => useStore(s => s.opportunities ?? EMPTY_ARRAY);
export const useAgentsList = () => useStore(s => s.agents ?? EMPTY_ARRAY);
export const useLedgerEntries = () => useStore(s => s.ledger ?? EMPTY_ARRAY);
export const useProposalsList = () => useStore(s => s.proposals ?? EMPTY_ARRAY);
export const usePolicyAuditLogs = () => useStore(s => s.policy_audit_logs ?? EMPTY_ARRAY);
export const useKernelLogs = () => useStore(s => s.system_health?.kernel_logs ?? EMPTY_ARRAY);
export const useSystemIssues = () => useStore(s => s.system_health?.issues ?? EMPTY_ARRAY);
export const useTasksList = () => useStore(s => s.tasks ?? EMPTY_ARRAY);
/**
 * STATUS SELECTORS
 */
export const useLastRunStatus = () => useStore(s => s.system_health?.last_run?.status ?? 'idle');
export const useLastRunSignals = () => useStore(s => s.system_health?.last_run?.signalsCreated ?? 0);
export const useLastRunSources = () => useStore(s => s.system_health?.last_run?.sources ?? EMPTY_ARRAY);
export const useLastRunTriggeredAt = () => useStore(s => s.system_health?.last_run?.triggeredAt ?? 0);
export const useLastRunError = () => useStore(s => s.system_health?.last_run?.error);
export const useAgentFailureCount = (role: AgentRole) => useStore(s => s.system_health?.failure_count?.[role] ?? 0);