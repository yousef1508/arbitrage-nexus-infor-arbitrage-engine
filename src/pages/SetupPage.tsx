import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Terminal, ShieldCheck, Cpu, ArrowRight, CheckCircle2, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { ThemeToggle } from '@/components/ThemeToggle';
export function SetupPage() {
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState({
    system_name: 'Arbitrage Nexus',
    owner_email: '',
    reserve_floor: 2500,
    daily_spend_cap: 1000,
    risk_sensitivity: 0.75
  });
  const completeSetup = useStore(s => s.completeSetup);
  const navigate = useNavigate();
  const handleFinish = async () => {
    if (!config.owner_email) {
      toast.error("Owner email is required.");
      return;
    }
    const payload = {
      owner_email: config.owner_email,
      policy: {
        reserve_floor: config.reserve_floor,
        max_spend_per_day: config.daily_spend_cap,
        max_risk_score: config.risk_sensitivity
      }
    };
    try {
      const success = await completeSetup(payload);
      if (success) {
        toast.success("NEXUS INITIALIZED", {
          description: "Autonomous cycles started. Redirecting to Command Center."
        });
        navigate('/');
      } else {
        toast.error("SETUP FAILED", {
          description: "The system could not be initialized. Please check your configuration."
        });
      }
    } catch (error) {
      console.error("[SETUP_CRASH]", error);
      toast.error("SYSTEM ERROR", {
        description: error instanceof Error ? error.message : "An unexpected error occurred during initialization."
      });
    }
  };
  const steps = [
    { title: "Identity", icon: Terminal, desc: "Define your system core" },
    { title: "Guardrails", icon: ShieldCheck, desc: "Set financial deterministic policies" },
    { title: "Deployment", icon: Cpu, desc: "Finalize agent initialization" }
  ];
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <Toaster position="top-center" />
      <div className="max-w-2xl w-full space-y-8">
        <div className="relative flex justify-between items-center mb-12 px-4">
          <div className="absolute top-5 left-0 w-full h-[2px] bg-slate-800 -z-0" />
          {steps.map((s, i) => (
            <div key={i} className="flex flex-col items-center gap-2 relative z-10">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500 ${
                step > i + 1 ? "bg-emerald-500 border-emerald-500" :
                step === i + 1 ? "border-sky-500 text-sky-400 bg-sky-500/10" : "bg-slate-950 border-slate-800 text-slate-600"
              }`}>
                {step > i + 1 ? <CheckCircle2 className="h-6 w-6 text-white" /> : <s.icon className="h-5 w-5" />}
              </div>
              <div className="absolute -bottom-8 whitespace-nowrap text-center">
                <p className={`text-[10px] font-black uppercase tracking-tighter ${step === i+1 ? "text-slate-100" : "text-slate-500"}`}>{s.title}</p>
              </div>
            </div>
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="bg-slate-900/40 border-slate-800 backdrop-blur-xl shadow-2xl">
              <CardHeader className="text-center p-8">
                <CardTitle className="text-2xl font-black text-slate-100 uppercase tracking-tighter">
                  {steps[step-1].title} CONFIGURATION
                </CardTitle>
                <CardDescription className="text-slate-400 uppercase text-[10px] tracking-widest font-bold">
                  {steps[step-1].desc}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-8 pb-8 space-y-6">
                {step === 1 && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">System Designation</label>
                      <Input
                        value={config.system_name}
                        onChange={e => setConfig({...config, system_name: e.target.value})}
                        className="bg-slate-950 border-slate-800 h-12"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Owner Payout Email (PayPal)</label>
                      <Input
                        placeholder="owner@example.com"
                        value={config.owner_email}
                        onChange={e => setConfig({...config, owner_email: e.target.value})}
                        className="bg-slate-950 border-slate-800 h-12"
                      />
                    </div>
                  </div>
                )}
                {step === 2 && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Reserve Floor ($)</label>
                        <Input
                          type="number"
                          value={config.reserve_floor}
                          onChange={e => setConfig({...config, reserve_floor: Number(e.target.value)})}
                          className="bg-slate-950 border-slate-800 h-12 font-mono"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Daily Spend Cap ($)</label>
                        <Input
                          type="number"
                          value={config.daily_spend_cap}
                          onChange={e => setConfig({...config, daily_spend_cap: Number(e.target.value)})}
                          className="bg-slate-950 border-slate-800 h-12 font-mono"
                        />
                      </div>
                    </div>
                    <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[11px] text-amber-200/70 italic flex gap-3">
                      <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                      Deterministic policy prevents any agent from exceeding these limits without explicit owner override.
                    </div>
                  </div>
                )}
                {step === 3 && (
                  <div className="space-y-6 text-center py-4">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
                      <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-sm font-black text-slate-200 uppercase tracking-widest">Ready for Deployment</h4>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                        By clicking finish, the core intelligence cluster will boot and begin scanning public data sources.
                      </p>
                    </div>
                  </div>
                )}
                <div className="pt-8 flex justify-between gap-4">
                  <Button
                    variant="ghost"
                    onClick={() => setStep(s => Math.max(1, s - 1))}
                    disabled={step === 1}
                    className="text-slate-400 font-bold uppercase text-[10px]"
                  >
                    <ChevronLeft className="h-4 w-4 mr-2" /> Back
                  </Button>
                  <Button
                    onClick={() => step < 3 ? setStep(s => s + 1) : handleFinish()}
                    className="bg-sky-600 hover:bg-sky-500 text-white font-bold uppercase text-[10px] tracking-widest px-8"
                  >
                    {step < 3 ? "Next Step" : "Initialize Engine"} <ArrowRight className="h-4 w-4 ml-2" />
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