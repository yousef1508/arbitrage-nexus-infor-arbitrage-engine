import type { KVNamespace, DurableObjectNamespace } from '@cloudflare/workers-types';
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
export type AgentRole =
  | 'scout'
  | 'analyst'
  | 'router'
  | 'content_arb'
  | 'affiliate'
  | 'lead_gen'
  | 'resale'
  | 'referral'
  | 'trading';
export type AgentStatus = 'idle' | 'scanning' | 'analyzing' | 'routing' | 'executing' | 'error' | 'in_development';
export interface AgentPerformance {
  role: AgentRole;
  status: AgentStatus;
  health: number; // 0-100
  totalProfit: number;
  activeTasks: number;
  lastActive: number;
  successRate: number; // 0-1
  hourlyRevenue: number;
  capital_allocated: number;
}
export interface AgentTask {
  id: string;
  agent_role: AgentRole;
  opportunity_id: string;
  opportunity_title?: string;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  started_at: number;
  completed_at?: number;
  result_profit?: number;
  logs: string[];
  latency_ms?: number;
}
export type OpportunityStatus = 'detected' | 'analyzing' | 'validated' | 'routing' | 'executing' | 'completed' | 'expired' | 'failed';
export interface Opportunity {
  id: string;
  title: string;
  summary: string;
  niche: string;
  signal_type: string;
  evidence: string;
  source_refs: string[];
  intelligence_source?: string;
  analyst_reasoning?: string;
  confidence_score: number;
  novelty_score: number;
  urgency_score: number;
  monetization_score: number;
  risk_score: number;
  required_capital: number;
  potential_profit: number;
  recommended_agents: AgentRole[];
  expiry_time: number;
  status: OpportunityStatus;
  created_at: number;
}
export interface ExecutionResult {
  success: boolean;
  profit: number;
  logs: string[];
  task_id?: string;
  agent_role?: AgentRole;
  details?: any;
  latency_ms?: number;
}
export interface TreasuryBuckets {
  reserve: number;
  operating: number;
  reinvestment: number;
  tax_buffer: number;
  owner_withdrawable: number;
  total: number;
}
export interface LedgerEntry {
  id: string;
  timestamp: number;
  amount: number;
  type: 'credit' | 'debit';
  bucket: keyof Omit<TreasuryBuckets, 'total'>;
  description: string;
  agent_id?: string;
  opportunity_id?: string;
}
export interface GovernorPolicy {
  max_spend_per_day: number;
  max_risk_score: number;
  reserve_floor: number;
  emergency_stop: boolean;
  cooldown_period_ms: number;
  trading_enabled: boolean;
  min_profit_margin: number;
}
export interface ReinvestmentProposal {
  id: string;
  title: string;
  description: string;
  cost: number;
  expected_benefit: string;
  confidence: number;
  risk_level: 'low' | 'medium' | 'high';
  rollback_plan: string;
  status: 'pending' | 'approved' | 'rejected' | 'implemented';
  created_at: number;
}
export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  timestamp: number;
  id: string;
  toolCalls?: ToolCall[];
  tool_call_id?: string;
}
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
}
export interface IngestRun {
  triggeredAt: number;
  completedAt?: number;
  sources: string[];
  signalsCreated: number;
  status: 'idle' | 'running' | 'success' | 'failed';
  niche?: string;
  error?: string;
}
export interface ChatState {
  messages: Message[];
  sessionId: string;
  isProcessing: boolean;
  model: string;
  treasury: TreasuryBuckets;
  ledger: LedgerEntry[];
  policy: GovernorPolicy;
  setup_complete: boolean;
  owner_email?: string;
  proposals: ReinvestmentProposal[];
  opportunities: Opportunity[];
  agents: AgentPerformance[];
  tasks: AgentTask[];
  system_health: SystemHealth;
  daily_spend: number;
  last_spend_reset: number;
  current_niche_index: number;
  last_withdrawal_at: number;
  policy_audit_logs: string[];
}
export interface SystemHealth {
  cpu_usage: number;
  active_agents: number;
  last_scan: number;
  status: 'healthy' | 'warning' | 'degraded' | 'down';
  last_check: number;
  issues: string[];
  last_run?: IngestRun;
  kernel_logs: string[];
  failure_count: Record<AgentRole, number>;
}
export interface SessionInfo {
  id: string;
  title: string;
  createdAt: number;
  lastActive: number;
}
export interface Env {
  CF_AI_BASE_URL: string;
  CF_AI_API_KEY: string;
  PAYPAL_CLIENT_ID: string;
  PAYPAL_CLIENT_SECRET: string;
  PAYPAL_MODE: 'sandbox' | 'live';
  ARB_STATE: KVNamespace;
  CF_AI: any;
  CHAT_AGENT: DurableObjectNamespace;
  APP_CONTROLLER: DurableObjectNamespace;
  SERPAPI_KEY: string;
  OPENROUTER_API_KEY: string;
}
// RESTORED TYPES FOR TOOL RESULTS
export interface WeatherResult {
  location: string;
  temperature: number;
  condition: string;
  humidity: number;
}
export interface MCPResult {
  content: string;
}
export interface ErrorResult {
  error: string;
}