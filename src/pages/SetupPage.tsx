import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import {
  Terminal,
  ShieldCheck,
  Cpu,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  Wallet,
  RadioTower,
  LockKeyhole,
  ReceiptText,
  Gauge,
  AlertTriangle,
  Coins
} from 'lucide-react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { ThemeToggle } from '@/components/ThemeToggle';
import { cn } from '@/lib/utils';

type SetupConfig = {
  system_name: string;
  owner_email: string;
  reserve_floor: number;
  daily_spend_cap: number;
  risk_sensitivity: number;
};

function formatNok(value: number): string {
  return `${Number(value || 0).toLocaleString('nb-NO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })} kr`;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function safePositiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function StepPill(props: {
  active: boolean;
  complete: boolean;
  icon: React.ElementType;
  title: string;
}) {
  const Icon = props.icon;

  return (
    <div className="flex flex-col items-center gap-2 relative z-10">
      <div
        className={cn(
          'w-11 h-11 rounded-2xl flex items-center justify-center border-2 transition-all duration-500 shadow-lg',
          props.complete
            ? 'bg-emerald-500 border-emerald-400 shadow-emerald-500/20'
            : props.active
              ? 'border-sky-500 text-sky-400 bg-sky-500/10 shadow-sky-500/10'
              : 'bg-slate-950 border-slate-800 text-slate-600'
        )}
      >
        {props.complete ? (
          <CheckCircle2 className="h-6 w-6 text-white" />
        ) : (
          <Icon className="h-5 w-5" />
        )}
      </div>

      <div className="absolute -bottom-8 whitespace-nowrap text-center">
        <p
          className={cn(
            'text-[10px] font-black uppercase tracking-tighter',
            props.active ? 'text-slate-100' : 'text-slate-500'
          )}
        >
          {props.title}
        </p>
      </div>
    </div>
  );
}

function SummaryRow(props: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone?: 'sky' | 'emerald' | 'amber' | 'violet';
}) {
  const tone = props.tone || 'sky';

  return (
    <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-slate-950/70 border border-slate-800">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={cn(
            'p-2 rounded-lg shrink-0',
            tone === 'emerald' && 'bg-emerald-500/10 text-emerald-400',
            tone === 'amber' && 'bg-amber-500/10 text-amber-400',
            tone === 'violet' && 'bg-violet-500/10 text-violet-400',
            tone === 'sky' && 'bg-sky-500/10 text-sky-400'
          )}
        >
          {props.icon}
        </div>

        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest truncate">
          {props.label}
        </p>
      </div>

      <div className="text-xs font-mono font-black text-slate-200 text-right">
        {props.value}
      </div>
    </div>
  );
}

export function SetupPage() {
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState<SetupConfig>({
    system_name: 'Arbitrage Nexus',
    owner_email: '',
    reserve_floor: 2500,
    daily_spend_cap: 1000,
    risk_sensitivity: 0.75
  });

  const completeSetup = useStore(s => s.completeSetup);
  const navigate = useNavigate();

  const steps = [
    {
      title: 'Identity',
      icon: Terminal,
      desc: 'Define owner and command identity'
    },
    {
      title: 'Guardrails',
      icon: ShieldCheck,
      desc: 'Set deterministic NOK policy limits'
    },
    {
      title: 'Deployment',
      icon: Cpu,
      desc: 'Boot verified-revenue agent cluster'
    }
  ];

  const riskLabel = useMemo(() => {
    if (config.risk_sensitivity <= 0.35) return 'Conservative';
    if (config.risk_sensitivity <= 0.7) return 'Balanced';
    return 'Aggressive';
  }, [config.risk_sensitivity]);

  const handleFinish = async () => {
    const ownerEmail = config.owner_email.trim();

    if (!ownerEmail) {
      toast.error('OWNER_EMAIL_REQUIRED', {
        description: 'Add the owner email before initialization.'
      });
      return;
    }

    if (!isValidEmail(ownerEmail)) {
      toast.error('OWNER_EMAIL_INVALID', {
        description: 'Use a valid email address.'
      });
      return;
    }

    const reserveFloor = safePositiveNumber(config.reserve_floor, 2500);
    const dailySpendCap = safePositiveNumber(config.daily_spend_cap, 1000);
    const riskSensitivity = Math.min(
      1,
      Math.max(0, safePositiveNumber(config.risk_sensitivity, 0.75))
    );

    const payload = {
      owner_email: ownerEmail,
      policy: {
        reserve_floor: reserveFloor,
        max_spend_per_day: dailySpendCap,
        max_risk_score: riskSensitivity
      }
    };

    try {
      const success = await completeSetup(payload);

      if (success) {
        toast.success('NEXUS_INITIALIZED', {
          description: 'Agent cluster booted. Revenue remains zero until verified external payment.'
        });

        navigate('/');
      } else {
        toast.error('SETUP_FAILED', {
          description: 'The system could not be initialized. Check worker logs and configuration.'
        });
      }
    } catch (error) {
      console.error('[SETUP_CRASH]', error);

      toast.error('SYSTEM_ERROR', {
        description:
          error instanceof Error
            ? error.message
            : 'Unexpected setup failure.'
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 overflow-hidden">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      <Toaster position="top-center" />

      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <div className="max-w-3xl w-full space-y-10 relative z-10">
        <header className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-500 to-emerald-500 flex items-center justify-center shadow-2xl shadow-sky-500/20">
            <Terminal className="h-8 w-8 text-white" />
          </div>

          <div>
            <h1 className="text-4xl font-black tracking-tighter text-slate-100">
              ARBITRAGE <span className="text-sky-400">NEXUS</span>
            </h1>

            <p className="text-[11px] text-slate-500 font-mono uppercase tracking-[0.25em] mt-2">
              Autonomous Intelligence Market Setup
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Badge
              variant="outline"
              className="bg-emerald-500/10 border-emerald-500/20 text-emerald-300 text-[9px] font-mono uppercase"
            >
              Verified revenue only
            </Badge>

            <Badge
              variant="outline"
              className="bg-sky-500/10 border-sky-500/20 text-sky-300 text-[9px] font-mono uppercase"
            >
              Live POL/NOK unlock
            </Badge>

            <Badge
              variant="outline"
              className="bg-amber-500/10 border-amber-500/20 text-amber-300 text-[9px] font-mono uppercase"
            >
              Zero fake treasury credit
            </Badge>
          </div>
        </header>

        <div className="relative flex justify-between items-center mb-12 px-8">
          <div className="absolute top-[21px] left-8 right-8 h-[2px] bg-slate-800 -z-0" />

          {steps.map((item, index) => (
            <StepPill
              key={item.title}
              active={step === index + 1}
              complete={step > index + 1}
              icon={item.icon}
              title={item.title}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24, filter: 'blur(4px)' }}
            animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, x: -24, filter: 'blur(4px)' }}
            transition={{ duration: 0.25 }}
          >
            <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-xl shadow-2xl overflow-hidden">
              <CardHeader className="text-center p-8 border-b border-slate-800/60 bg-slate-950/30">
                <CardTitle className="text-2xl font-black text-slate-100 uppercase tracking-tighter">
                  {steps[step - 1].title} Configuration
                </CardTitle>

                <CardDescription className="text-slate-400 uppercase text-[10px] tracking-widest font-bold">
                  {steps[step - 1].desc}
                </CardDescription>
              </CardHeader>

              <CardContent className="px-8 pb-8 pt-8 space-y-7">
                {step === 1 && (
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        System Designation
                      </label>

                      <Input
                        value={config.system_name}
                        onChange={event =>
                          setConfig({
                            ...config,
                            system_name: event.target.value
                          })
                        }
                        className="bg-slate-950 border-slate-800 h-12 font-mono"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Owner Admin / Payout Email
                      </label>

                      <Input
                        type="email"
                        placeholder="owner@example.com"
                        value={config.owner_email}
                        onChange={event =>
                          setConfig({
                            ...config,
                            owner_email: event.target.value
                          })
                        }
                        className="bg-slate-950 border-slate-800 h-12 font-mono"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                      <SummaryRow
                        tone="emerald"
                        icon={<ReceiptText className="h-4 w-4" />}
                        label="Revenue Policy"
                        value="verified only"
                      />

                      <SummaryRow
                        tone="sky"
                        icon={<RadioTower className="h-4 w-4" />}
                        label="Pricing Oracle"
                        value="POL/NOK"
                      />

                      <SummaryRow
                        tone="violet"
                        icon={<LockKeyhole className="h-4 w-4" />}
                        label="Unlock Mode"
                        value="on-chain tx"
                      />
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-7">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          Reserve Floor — NOK
                        </label>

                        <Input
                          type="number"
                          min={0}
                          value={config.reserve_floor}
                          onChange={event =>
                            setConfig({
                              ...config,
                              reserve_floor: Number(event.target.value)
                            })
                          }
                          className="bg-slate-950 border-slate-800 h-12 font-mono"
                        />

                        <p className="text-[10px] text-slate-600 font-mono">
                          Current: {formatNok(config.reserve_floor)}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          Daily Spend Cap — NOK
                        </label>

                        <Input
                          type="number"
                          min={0}
                          value={config.daily_spend_cap}
                          onChange={event =>
                            setConfig({
                              ...config,
                              daily_spend_cap: Number(event.target.value)
                            })
                          }
                          className="bg-slate-950 border-slate-800 h-12 font-mono"
                        />

                        <p className="text-[10px] text-slate-600 font-mono">
                          Current: {formatNok(config.daily_spend_cap)}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-5 rounded-2xl bg-slate-950/60 border border-slate-800 p-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <Gauge className="h-3.5 w-3.5 text-sky-400" />
                            Max Risk Threshold
                          </label>

                          <p className="text-[10px] text-slate-600 font-mono mt-1">
                            Router discard limit for opportunity execution.
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-lg font-mono font-black text-sky-400">
                            {Math.round(config.risk_sensitivity * 100)}%
                          </p>

                          <p className="text-[9px] text-slate-500 font-black uppercase">
                            {riskLabel}
                          </p>
                        </div>
                      </div>

                      <Slider
                        value={[config.risk_sensitivity * 100]}
                        min={0}
                        max={100}
                        step={1}
                        onValueChange={([value]) =>
                          setConfig({
                            ...config,
                            risk_sensitivity: value / 100
                          })
                        }
                      />
                    </div>

                    <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-200/80 flex gap-3">
                      <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />

                      <p className="leading-relaxed">
                        Deterministic policy prevents agents from exceeding owner-defined limits.
                        Projected profit never credits treasury. Treasury credit only occurs after verified external crypto payment.
                      </p>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-7">
                    <div className="text-center py-2">
                      <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
                        <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                      </div>

                      <div className="space-y-2">
                        <h4 className="text-sm font-black text-slate-200 uppercase tracking-widest">
                          Ready for Deployment
                        </h4>

                        <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                          The agent cluster will boot, scan public signals, produce locked intelligence reports,
                          quote live POL/NOK payment amounts, and wait for verified on-chain payment before unlock.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <SummaryRow
                        tone="sky"
                        icon={<Terminal className="h-4 w-4" />}
                        label="System"
                        value={config.system_name || 'Arbitrage Nexus'}
                      />

                      <SummaryRow
                        tone="emerald"
                        icon={<Wallet className="h-4 w-4" />}
                        label="Owner"
                        value={config.owner_email || 'missing'}
                      />

                      <SummaryRow
                        tone="amber"
                        icon={<Coins className="h-4 w-4" />}
                        label="Daily Cap"
                        value={formatNok(config.daily_spend_cap)}
                      />

                      <SummaryRow
                        tone="violet"
                        icon={<ShieldCheck className="h-4 w-4" />}
                        label="Risk Limit"
                        value={`${Math.round(config.risk_sensitivity * 100)}%`}
                      />
                    </div>

                    <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />

                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          Payment chain, treasury address, RPC endpoint, CoinGecko ID, and fallback oracle values are loaded from environment configuration. This setup screen only initializes owner identity and governance policy.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-8 flex justify-between gap-4 border-t border-slate-800/60">
                  <Button
                    variant="ghost"
                    onClick={() => setStep(current => Math.max(1, current - 1))}
                    disabled={step === 1}
                    className="text-slate-400 font-bold uppercase text-[10px]"
                  >
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    Back
                  </Button>

                  <Button
                    onClick={() =>
                      step < 3
                        ? setStep(current => current + 1)
                        : handleFinish()
                    }
                    className="bg-sky-600 hover:bg-sky-500 text-white font-bold uppercase text-[10px] tracking-widest px-8"
                  >
                    {step < 3 ? 'Next Step' : 'Initialize Engine'}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}