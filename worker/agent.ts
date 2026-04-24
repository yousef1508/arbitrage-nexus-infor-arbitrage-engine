import { Agent } from 'agents';
import type { Env } from './core-utils';
import type {
  ChatState,
  Opportunity,
  LedgerEntry,
  AgentRole,
  AgentPerformance,
  AgentStatus,
  AgentTask,
  IngestRun
} from './types';
import { ContentEngine } from './content-engine';
import { ChatHandler } from './chat';
import { monetizationLogic } from './monetization-logic';
import { CONFIG } from './config';
import { createMessage, createStreamResponse, createEncoder } from './utils';
import { executeTool } from './tools';
type TreasuryBucket = 'reserve' | 'operating' | 'reinvestment' | 'tax_buffer' | 'owner_withdrawable';
export class ChatAgent extends Agent<Env, ChatState> {
  private chatHandler?: ChatHandler;
  private contentEngine?: ContentEngine;
  initialState: ChatState = {
    messages: [],
    sessionId: "nexus-core-singleton",
    isProcessing: false,
    model: 'google-ai-studio/gemini-2.0-flash-lite',
    setup_complete: false,
    proposals: [],
    opportunities: [],
    tasks: [],
    daily_spend: 0,
    last_spend_reset: Date.now(),
    current_niche_index: 0,
    last_withdrawal_at: 0,
    policy_audit_logs: [],
    treasury: {
      reserve: 0, operating: 0, reinvestment: 0, tax_buffer: 0, owner_withdrawable: 0, total: 0
    },
    ledger: [],
    policy: {
      max_spend_per_day: 1000,
      max_risk_score: 0.75,
      reserve_floor: 2500,
      emergency_stop: false,
      cooldown_period_ms: 300000,
      trading_enabled: false,
      min_profit_margin: 0.15
    },
    agents: [
      { role: 'scout', status: 'idle', health: 100, totalProfit: 0, activeTasks: 0, lastActive: 0, successRate: 0, hourlyRevenue: 0, capital_allocated: 0 },
      { role: 'analyst', status: 'idle', health: 100, totalProfit: 0, activeTasks: 0, lastActive: 0, successRate: 0, hourlyRevenue: 0, capital_allocated: 0 },
      { role: 'router', status: 'idle', health: 100, totalProfit: 0, activeTasks: 0, lastActive: 0, successRate: 0, hourlyRevenue: 0, capital_allocated: 0 },
      { role: 'content_arb', status: 'idle', health: 100, totalProfit: 0, activeTasks: 0, lastActive: 0, successRate: 0, hourlyRevenue: 0, capital_allocated: 0 },
      { role: 'affiliate', status: 'idle', health: 100, totalProfit: 0, activeTasks: 0, lastActive: 0, successRate: 0, hourlyRevenue: 0, capital_allocated: 0 },
      { role: 'lead_gen', status: 'idle', health: 100, totalProfit: 0, activeTasks: 0, lastActive: 0, successRate: 0, hourlyRevenue: 0, capital_allocated: 0 },
      { role: 'resale', status: 'idle', health: 100, totalProfit: 0, activeTasks: 0, lastActive: 0, successRate: 0, hourlyRevenue: 0, capital_allocated: 0 },
      { role: 'referral', status: 'idle', health: 100, totalProfit: 0, activeTasks: 0, lastActive: 0, successRate: 0, hourlyRevenue: 0, capital_allocated: 0 },
      { role: 'trading', status: 'idle', health: 100, totalProfit: 0, activeTasks: 0, lastActive: 0, successRate: 0, hourlyRevenue: 0, capital_allocated: 0 }
    ],
    system_health: {
      cpu_usage: 0,
      active_agents: 0,
      last_scan: Date.now(),
      status: 'healthy',
      last_check: Date.now(),
      issues: [],
      kernel_logs: [],
      last_run: { triggeredAt: 0, status: 'idle', sources: [], signalsCreated: 0 },
      failure_count: {
          scout: 0, analyst: 0, router: 0, content_arb: 0, affiliate: 0, lead_gen: 0, resale: 0, referral: 0, trading: 0
      }
    }
  };
  async onStart(): Promise<void> {
    const apiKey = this.env.CF_AI_API_KEY || CONFIG.DEFAULT_GEMINI_API_KEY;
    const baseUrl = this.env.CF_AI_BASE_URL || '';
    if (apiKey && baseUrl) {
      this.chatHandler = new ChatHandler(baseUrl, apiKey, this.state.model);
      this.contentEngine = new ContentEngine(baseUrl, apiKey, this.state.model);
    }
    await this.pushKernelLog(`[SYSTEM] BOOT: KERNEL_CONSOLIDATED_ON_GATEWAY`);
    const alarm = await this.ctx.storage.getAlarm();
    if (alarm === null) {
      await this.ctx.storage.setAlarm(Date.now() + 5000);
    }
  }
  async onAlarm(): Promise<void> {
    await this.performFullCycle();
    await this.ctx.storage.setAlarm(Date.now() + (this.state.policy.cooldown_period_ms || 300000));
  }
  private async performFullCycle(skipInitialStateUpdate = false) {
    const now = Date.now();
    await this.pushKernelLog(`[KERNEL] INITIATING_CYCLE_EXECUTION`);
    // AI Configuration Validation
    if (!this.env.CF_AI_API_KEY || !this.env.CF_AI_BASE_URL) {
      await this.pushKernelLog(`[CRITICAL] AI_CONFIG_MISSING: KERNEL_SUSPENDED`);
      await this.setState({
        ...this.state,
        system_health: {
          ...this.state.system_health,
          status: 'warning',
          last_run: {
            triggeredAt: now,
            status: 'failed',
            sources: [],
            signalsCreated: 0,
            error: "AI_CONFIG_MISSING"
          }
        }
      });
      return;
    }
    if (!this.chatHandler || !this.contentEngine) {
      const apiKey = this.env.CF_AI_API_KEY || CONFIG.DEFAULT_GEMINI_API_KEY;
      const baseUrl = this.env.CF_AI_BASE_URL || '';
      if (apiKey && baseUrl) {
        this.chatHandler = new ChatHandler(baseUrl, apiKey, this.state.model);
        this.contentEngine = new ContentEngine(baseUrl, apiKey, this.state.model);
      }
    }
    if (!this.state.setup_complete || this.state.policy.emergency_stop) {
      return;
    }
    if (!skipInitialStateUpdate) {
      const currentStatus = (this.state.system_health.last_run?.status as string);
      if (currentStatus === 'running') {
        await this.pushKernelLog(`[SYSTEM] SKIP_RUN: KERNEL_ALREADY_IN_PROGRESS`);
        return;
      }
    }
    // Anomaly Detection Routine
    await this.performAnomalyDetection();
    // Deterministic Daily Spend Reset
    const lastReset = this.state.last_spend_reset || 0;
    if (now - lastReset > 86400000) {
      await this.setState({
        ...this.state,
        daily_spend: 0,
        last_spend_reset: now
      });
      await this.pushKernelLog(`[GOVERNOR] DAILY_BUDGET_RESET_EXECUTED`);
    }
    const runStartTime = now;
    const niches = ['SaaS_Affiliate', 'B2B_LeadGen', 'Content_Arb', 'Market_Trading'];
    const currentNiche = niches[(this.state.current_niche_index || 0) % niches.length];
    if (!skipInitialStateUpdate) {
        await this.setState({
          ...this.state,
          system_health: {
            ...this.state.system_health,
            last_run: {
              triggeredAt: runStartTime,
              status: 'running',
              sources: ['managed_gateway', 'scout_scan'],
              signalsCreated: 0,
              niche: currentNiche
            }
          }
        });
    }
    try {
      await this.updateAgentStatus('scout', 'scanning');
      const signals = await this.performScoutScan(currentNiche);
      let signalsCreatedCount = 0;
      if (signals && signals.length > 0) {
        await this.updateAgentStatus('analyst', 'analyzing');
        for (const signal of signals) {
          const opp = await this.performAnalystReview(signal);
          if (opp) {
            signalsCreatedCount++;
            if (this.checkGovernor(opp)) {
              await this.updateAgentStatus('router', 'routing');
              await this.performRouterAssignment(opp);
            } else {
              await this.pushKernelLog(`[GOVERNOR] REJECTED: OPP_${opp.id.slice(-4)}_EXCEEDS_POLICY`);
            }
          }
        }
      }
      await this.setState({
        ...this.state,
        current_niche_index: (this.state.current_niche_index || 0) + 1,
        system_health: {
          ...this.state.system_health,
          last_scan: Date.now(),
          last_run: {
            ...(this.state.system_health.last_run || { triggeredAt: Date.now(), status: 'running', sources: [], signalsCreated: 0 }),
            completedAt: Date.now(),
            status: 'success',
            signalsCreated: signalsCreatedCount,
            error: undefined
          }
        }
      });
    } catch (error: any) {
      const errorMessage = error.message || 'KERNEL_EXCEPTION';
      await this.pushKernelLog(`[CRITICAL] KERNEL_HALT: ${errorMessage}`);
      await this.setState({
        ...this.state,
        system_health: {
          ...this.state.system_health,
          last_run: {
            ...(this.state.system_health.last_run || { triggeredAt: Date.now(), status: 'failed', sources: [], signalsCreated: 0 }),
            completedAt: Date.now(),
            status: 'failed',
            error: errorMessage
          }
        }
      });
    } finally {
      await this.resetAgentStatuses();
    }
  }
  private async performAnomalyDetection() {
    const health = this.state.system_health;
    const agents = [...this.state.agents];
    let healthUpdated = false;
    let issues = [...(health.issues || [])];
    for (const agent of agents) {
      const failures = health.failure_count[agent.role] || 0;
      if (failures >= 3 && agent.status !== 'error') {
        await this.pushKernelLog(`[ANOMALY] CRITICAL_FAILURE_DETECTED: ${agent.role.toUpperCase()} (Consecutive: ${failures})`);
        agent.status = 'error';
        agent.health = Math.max(0, agent.health - 20);
        issues.push(`Agent ${agent.role} flagged for anomaly: ${failures} consecutive failures.`);
        healthUpdated = true;
      }
    }
    if (healthUpdated) {
      await this.setState({
        ...this.state,
        agents,
        system_health: { ...health, issues: Array.from(new Set(issues)).slice(-10), status: 'warning' }
      });
    }
  }
  private async pushKernelLog(message: string) {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false });
    const formatted = `${timestamp} ${message}`;
    const health = this.state.system_health;
    const kernel_logs = [formatted, ...(health.kernel_logs || [])].slice(0, 50);
    await this.setState({
      ...this.state,
      system_health: { ...health, kernel_logs }
    });
  }
  private async updateAgentStatus(role: AgentRole, status: AgentStatus) {
    await this.setState({
      ...this.state,
      agents: this.state.agents.map(a => a.role === role ? { ...a, status, lastActive: Date.now() } : a)
    });
  }
  private async resetAgentStatuses() {
    await this.setState({
      ...this.state,
      agents: this.state.agents.map(a => 
        ['scout', 'analyst', 'router'].includes(a.role) ? { ...a, status: 'idle' } : a
      )
    });
  }
  private checkGovernor(opp: Opportunity): boolean {
    const maxRisk = this.state.policy.max_risk_score ?? 1;
    const maxSpend = this.state.policy.max_spend_per_day ?? 0;
    const withinRisk = (opp.risk_score || 0) <= maxRisk;
    const withinSpend = (this.state.daily_spend + (opp.required_capital || 0)) <= maxSpend;
    return withinRisk && withinSpend;
  }
  private async performScoutScan(niche: string): Promise<string[]> {
    const searchRes = await executeTool('web_search', { 
      query: `high profit arbitrage opportunities 2025 ${niche}`,
      num_results: 2
    });
    if (searchRes && 'content' in searchRes) return [searchRes.content];
    return [];
  }
  private async performAnalystReview(signal: string): Promise<Opportunity | null> {
    if (!this.chatHandler) return null;
    const prompt = `Extract structured arbitrage opportunity from data. Output ONLY JSON. Fields: title, summary, niche, confidence_score, risk_score, potential_profit, required_capital, recommended_agents[]. Data: "${signal.slice(0, 1500)}"`;
    try {
      const res = await this.chatHandler.processMessage(prompt, [], undefined, this.state.model);
      if (!res || !res.content) return null;
      const jsonMatch = res.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      let oppData;
      try {
        oppData = JSON.parse(jsonMatch[0]);
      } catch (e) {
        return null;
      }
      const opportunity: Opportunity = {
        ...oppData,
        id: `arb-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        source_refs: ['managed_gateway_inference'],
        status: 'validated',
        created_at: Date.now(),
        expiry_time: Date.now() + 86400000
      };
      await this.setState({
        ...this.state,
        opportunities: [opportunity, ...this.state.opportunities].slice(0, 100)
      });
      return opportunity;
    } catch (e) {
      return null;
    }
  }
  private async performRouterAssignment(opp: Opportunity) {
    const agentsToTrigger = Array.isArray(opp.recommended_agents) ? opp.recommended_agents : [];
    for (const role of agentsToTrigger) {
      if (role === 'trading' && !this.state.policy.trading_enabled) continue;
      await this.executeAgentTask(role as AgentRole, opp);
    }
  }
  private async executeAgentTask(role: AgentRole, opp: Opportunity) {
    const taskId = `task-${Date.now()}-${Math.floor(Math.random()*1000)}`;
    const newTask: AgentTask = {
        id: taskId,
        agent_role: role,
        opportunity_id: opp.id,
        opportunity_title: opp.title,
        status: 'executing',
        started_at: Date.now(),
        logs: [`[KERNEL] DISPATCHED_${role.toUpperCase()}`]
    };
    await this.setState({
        ...this.state,
        tasks: [newTask, ...(this.state.tasks || [])].slice(0, 100),
        daily_spend: Number((this.state.daily_spend + (opp.required_capital || 0)).toFixed(2))
    });
    await this.updateAgentStatus(role, 'executing');
    let result: { success: boolean; profit: number; logs: string[]; latency_ms?: number } = { success: false, profit: 0, logs: [] };
    const start = Date.now();
    try {
      if (role === 'content_arb' && this.contentEngine) {
        result = await this.contentEngine.executeFullLoop(opp.title, opp.niche);
      } else if (role === 'affiliate') {
        result = await monetizationLogic.executeAffiliate(opp);
      } else if (role === 'lead_gen') {
        result = await monetizationLogic.executeLeadGen(opp);
      } else if (role === 'trading' && this.state.policy.trading_enabled) {
        result = await monetizationLogic.executeTrading(opp);
      }
      const latency = Date.now() - start;
      const failCount = { ...this.state.system_health.failure_count };
      if (!result.success) {
          failCount[role] = (failCount[role] || 0) + 1;
      } else {
          failCount[role] = 0;
      }
      await this.setState({
        ...this.state,
        system_health: { ...this.state.system_health, failure_count: failCount },
        tasks: (this.state.tasks || []).map(t => t.id === taskId ? {
            ...t,
            status: result.success ? 'completed' : 'failed',
            completed_at: Date.now(),
            result_profit: result.profit,
            latency_ms: latency,
            logs: [...(t.logs || []), ...(result.logs || [])]
        } : t)
      });
      if (result.success && result.profit > 0) {
        await this.updateTreasuryFromProfit(result.profit, role, opp.id);
      }
    } catch (e: any) {
      await this.pushKernelLog(`[${role.toUpperCase()}] CRASH: ${e.message}`);
    } finally {
      await this.updateAgentStatus(role, 'idle');
    }
  }
  private async updateTreasuryFromProfit(profit: number, role: string, opportunityId: string) {
    const distributionMap: Record<TreasuryBucket, number> = {
      reserve: 0.40,
      operating: 0.20,
      reinvestment: 0.15,
      tax_buffer: 0.15,
      owner_withdrawable: 0.10
    };
    let newTreasury = { ...this.state.treasury };
    const newEntries: LedgerEntry[] = [];
    (Object.keys(distributionMap) as TreasuryBucket[]).forEach((bucket) => {
      const share = Number((profit * distributionMap[bucket]).toFixed(2));
      newTreasury[bucket] = Number(((newTreasury[bucket] || 0) + share).toFixed(2));
      newEntries.push({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        amount: share,
        type: 'credit',
        bucket,
        description: `PROFIT: ${role.toUpperCase()} [${opportunityId.slice(-4)}]`,
        agent_id: role,
        opportunity_id: opportunityId
      });
    });
    newTreasury.total = Number((newTreasury.total + profit).toFixed(2));
    await this.setState({
      ...this.state,
      treasury: newTreasury,
      ledger: [...newEntries, ...this.state.ledger].slice(0, 500)
    });
  }
  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/messages') return Response.json({ success: true, data: this.state });
    if (url.pathname === '/ingest' && request.method === 'POST') {
      const currentStatus = (this.state.system_health.last_run?.status as string);
      if (currentStatus === 'running') {
        return Response.json({ success: false, error: 'ALREADY_RUNNING' }, { status: 409 });
      }
      const runStartTime = Date.now();
      // CRITICAL: Await state persistence for UI feedback
      await this.setState({
        ...this.state,
        agents: this.state.agents.map(a => a.role === 'scout' ? { ...a, status: 'scanning', lastActive: runStartTime } : a),
        system_health: {
          ...this.state.system_health,
          last_run: {
            triggeredAt: runStartTime,
            status: 'running',
            sources: ['manual_trigger', 'managed_gateway'],
            signalsCreated: 0
          }
        }
      });
      this.ctx.waitUntil(this.performFullCycle(true));
      return Response.json({ success: true, message: 'INGESTION_CYCLE_TRIGGERED' });
    }
    if (url.pathname === '/proposals/action' && request.method === 'POST') {
      const { proposalId, action } = await request.json() as { proposalId: string, action: 'approved' | 'rejected' };
      const proposal = this.state.proposals.find(p => p.id === proposalId);
      if (!proposal || proposal.status !== 'pending') {
        return Response.json({ success: false, error: 'INVALID_PROPOSAL' }, { status: 400 });
      }
      let newTreasury = { ...this.state.treasury };
      if (action === 'approved') {
        if (newTreasury.reinvestment < proposal.cost) {
          return Response.json({ success: false, error: 'INSUFFICIENT_REINVESTMENT_FUNDS' }, { status: 400 });
        }
        newTreasury.reinvestment = Number((newTreasury.reinvestment - proposal.cost).toFixed(2));
        newTreasury.total = Number((newTreasury.total - proposal.cost).toFixed(2));
        await this.pushKernelLog(`[REINVESTMENT] APPROVED: ${proposal.title} (-${proposal.cost})`);
      }
      await this.setState({
        ...this.state,
        treasury: newTreasury,
        proposals: this.state.proposals.map(p => p.id === proposalId ? { ...p, status: action === 'approved' ? 'implemented' : 'rejected' } : p)
      });
      return Response.json({ success: true, data: { treasury: this.state.treasury, proposals: this.state.proposals } });
    }
    if (url.pathname === '/withdraw' && request.method === 'POST') {
      const { amount, email } = await request.json() as any;
      if (typeof amount !== 'number' || amount <= 0) {
          return Response.json({ success: false, error: 'INVALID_AMOUNT' }, { status: 400 });
      }
      const now = Date.now();
      const lastWithdrawal = this.state.last_withdrawal_at || 0;
      if (now - lastWithdrawal < 86400000) {
          return Response.json({ success: false, error: 'WITHDRAWAL_COOLDOWN_ACTIVE' }, { status: 429 });
      }
      if (amount > this.state.treasury.owner_withdrawable) {
          return Response.json({ success: false, error: 'INSUFFICIENT_FUNDS' }, { status: 400 });
      }
      const payoutRes = await this.executePayPalPayout(amount, email);
      if (!payoutRes.success) {
          return Response.json({ success: false, error: 'PAYPAL_API_REJECTION' }, { status: 502 });
      }
      const newTreasury = {
        ...this.state.treasury,
        owner_withdrawable: Number((this.state.treasury.owner_withdrawable - amount).toFixed(2)),
        total: Number((this.state.treasury.total - amount).toFixed(2))
      };
      const entry: LedgerEntry = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        amount,
        type: 'debit',
        bucket: 'owner_withdrawable',
        description: `PAYPAL_WITHDRAWAL: ${email} (REF: ${payoutRes.ref})`,
        agent_id: 'treasury'
      };
      await this.setState({
          ...this.state,
          treasury: newTreasury,
          ledger: [entry, ...this.state.ledger].slice(0, 500),
          last_withdrawal_at: now
      });
      return Response.json({ success: true, data: newTreasury });
    }
    if (url.pathname === '/policy' && request.method === 'POST') {
      const body = await request.json() as any;
      const timestamp = new Date().toISOString().split('T')[0];
      const audit = `[${timestamp}] POLICY_UPDATE: ${Object.keys(body).join(', ').toUpperCase()}`;
      await this.setState({
          ...this.state,
          policy: { ...this.state.policy, ...body },
          policy_audit_logs: [audit, ...(this.state.policy_audit_logs || [])].slice(0, 100)
      });
      return Response.json({ success: true });
    }
    if (url.pathname === '/setup' && request.method === 'POST') {
      const payload = await request.json() as any;
      await this.setState({ ...this.state, owner_email: payload.owner_email, policy: { ...this.state.policy, ...payload.policy }, setup_complete: true });
      return Response.json({ success: true });
    }
    if (url.pathname === '/chat') {
        const body = await request.json() as any;
        return this.handleChatMessage(body);
    }
    return Response.json({ success: false }, { status: 404 });
  }
  private async executePayPalPayout(amount: number, email: string) {
      // Mocking PayPal API response - In production, this calls @paypal/checkout-server-sdk
      await new Promise(r => setTimeout(r, 2000));
      return { success: true, ref: `PAY-${crypto.randomUUID().slice(0, 8).toUpperCase()}` };
  }
  private async handleChatMessage(body: any): Promise<Response> {
    if (!this.chatHandler) return Response.json({ success: false }, { status: 500 });
    const { message, stream } = body;
    const userMsg = createMessage('user', message);
    const updatedMessages = [...this.state.messages, userMsg].slice(-20);
    await this.setState({ ...this.state, messages: updatedMessages, isProcessing: true });
    try {
      if (stream) {
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const encoder = createEncoder();
        const streamTask = (async () => {
          try {
            const res = await this.chatHandler!.processMessage(message, updatedMessages, (chunk) => {
              writer.write(encoder.encode(chunk));
            });
            const assistantMsg = createMessage('assistant', res.content, res.toolCalls);
            await this.setState({ ...this.state, messages: [...updatedMessages, assistantMsg], isProcessing: false });
          } finally {
            await writer.close();
          }
        })();
        this.ctx.waitUntil?.(streamTask);
        return createStreamResponse(readable);
      }
      const res = await this.chatHandler.processMessage(message, updatedMessages);
      const assistantMsg = createMessage('assistant', res.content, res.toolCalls);
      await this.setState({ ...this.state, messages: [...updatedMessages, assistantMsg], isProcessing: false });
      return Response.json({ success: true, data: this.state });
    } catch (e) {
      await this.setState({ ...this.state, isProcessing: false });
      return Response.json({ success: false }, { status: 500 });
    }
  }
}