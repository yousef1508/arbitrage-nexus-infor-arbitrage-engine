import React, { useEffect, useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import {
  useReserve,
  useOperating,
  useReinvestment,
  useTaxBuffer,
  useWithdrawable,
  useTotalTreasury,
  useStore
} from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Wallet,
  ShieldCheck,
  Zap,
  TrendingUp,
  ReceiptText,
  DollarSign,
  Save,
  RotateCcw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type SplitKey =
  | 'reserve_percent'
  | 'operating_percent'
  | 'reinvest_percent'
  | 'tax_percent'
  | 'owner_percent';

type TreasurySplit = Record<SplitKey, number>;

const DEFAULT_SPLIT: TreasurySplit = {
  reserve_percent: 40,
  operating_percent: 20,
  reinvest_percent: 15,
  tax_percent: 15,
  owner_percent: 10
};

const SPLIT_KEYS: SplitKey[] = [
  'reserve_percent',
  'operating_percent',
  'reinvest_percent',
  'tax_percent',
  'owner_percent'
];

const BUCKET_META: Record<
  SplitKey,
  {
    name: string;
    description: string;
    icon: React.ElementType;
    tone: string;
    color: string;
  }
> = {
  reserve_percent: {
    name: 'Reserve',
    description: 'Safety buffer for verified revenue only.',
    icon: ShieldCheck,
    tone: 'emerald',
    color: '#10B981'
  },
  operating_percent: {
    name: 'Operating',
    description: 'Runtime and operating liquidity after verified deposits.',
    icon: Zap,
    tone: 'sky',
    color: '#38BDF8'
  },
  reinvest_percent: {
    name: 'Reinvestment',
    description: 'Growth budget controlled by governor approval.',
    icon: TrendingUp,
    tone: 'amber',
    color: '#F59E0B'
  },
  tax_percent: {
    name: 'Tax Buffer',
    description: 'Accounting buffer for verified NOK-valued receipts.',
    icon: ReceiptText,
    tone: 'indigo',
    color: '#6366F1'
  },
  owner_percent: {
    name: 'Owner Withdrawable',
    description: 'Owner-accessible verified balance.',
    icon: DollarSign,
    tone: 'pink',
    color: '#EC4899'
  }
};

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeSplit(raw: Partial<TreasurySplit> | undefined): TreasurySplit {
  const split: TreasurySplit = {
    reserve_percent: safeNumber(raw?.reserve_percent, DEFAULT_SPLIT.reserve_percent),
    operating_percent: safeNumber(raw?.operating_percent, DEFAULT_SPLIT.operating_percent),
    reinvest_percent: safeNumber(raw?.reinvest_percent, DEFAULT_SPLIT.reinvest_percent),
    tax_percent: safeNumber(raw?.tax_percent, DEFAULT_SPLIT.tax_percent),
    owner_percent: safeNumber(raw?.owner_percent, DEFAULT_SPLIT.owner_percent)
  };

  const total = SPLIT_KEYS.reduce((sum, key) => sum + split[key], 0);

  if (Math.abs(total - 100) < 0.001) {
    return split;
  }

  if (total <= 0) {
    return { ...DEFAULT_SPLIT };
  }

  const scaled = SPLIT_KEYS.reduce((acc, key) => {
    acc[key] = Math.floor((split[key] / total) * 100);
    return acc;
  }, {} as TreasurySplit);

  let remainder = 100 - SPLIT_KEYS.reduce((sum, key) => sum + scaled[key], 0);

  for (const key of SPLIT_KEYS) {
    if (remainder <= 0) break;
    scaled[key] += 1;
    remainder -= 1;
  }

  return scaled;
}

function rebalanceSplit(current: TreasurySplit, changedKey: SplitKey, nextValue: number): TreasurySplit {
  const changedValue = clamp(Math.round(nextValue), 0, 100);
  const remainder = 100 - changedValue;
  const otherKeys = SPLIT_KEYS.filter((key) => key !== changedKey);
  const otherTotal = otherKeys.reduce((sum, key) => sum + safeNumber(current[key]), 0);

  const next: TreasurySplit = {
    reserve_percent: 0,
    operating_percent: 0,
    reinvest_percent: 0,
    tax_percent: 0,
    owner_percent: 0
  };

  next[changedKey] = changedValue;

  if (remainder <= 0) {
    return next;
  }

  if (otherTotal <= 0) {
    const base = Math.floor(remainder / otherKeys.length);
    let extra = remainder - base * otherKeys.length;

    for (const key of otherKeys) {
      next[key] = base + (extra > 0 ? 1 : 0);
      extra -= 1;
    }

    return next;
  }

  const weighted = otherKeys.map((key) => {
    const raw = (current[key] / otherTotal) * remainder;

    return {
      key,
      value: Math.floor(raw),
      fraction: raw - Math.floor(raw)
    };
  });

  let assigned = weighted.reduce((sum, item) => sum + item.value, 0);
  let leftover = remainder - assigned;

  weighted
    .sort((a, b) => b.fraction - a.fraction)
    .forEach((item) => {
      if (leftover > 0) {
        item.value += 1;
        leftover -= 1;
      }
    });

  for (const item of weighted) {
    next[item.key] = item.value;
  }

  return next;
}

function formatNok(value: unknown): string {
  return `${safeNumber(value).toLocaleString('nb-NO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} kr`;
}

function getActualShare(value: number, total: number): number {
  if (!total || total <= 0) return 0;
  return clamp((value / total) * 100, 0, 100);
}

function toneClasses(tone: string) {
  const map: Record<string, string> = {
    emerald: 'border-l-emerald-500 text-emerald-400',
    sky: 'border-l-sky-500 text-sky-400',
    amber: 'border-l-amber-500 text-amber-400',
    indigo: 'border-l-indigo-500 text-indigo-400',
    pink: 'border-l-pink-500 text-pink-400'
  };

  return map[tone] || map.sky;
}

export const TreasuryOverview = () => {
  const reserve = useReserve();
  const operating = useOperating();
  const reinvestment = useReinvestment();
  const taxBuffer = useTaxBuffer();
  const withdrawable = useWithdrawable();
  const total = useTotalTreasury();

  const policySplit = useStore((state) => state.policy?.treasury_split);
  const persistPolicy = useStore((state) => state.persistPolicy);

  const [draftSplit, setDraftSplit] = useState<TreasurySplit>(() =>
    normalizeSplit(policySplit as Partial<TreasurySplit> | undefined)
  );

  const savedSplit = useMemo(
    () => normalizeSplit(policySplit as Partial<TreasurySplit> | undefined),
    [policySplit]
  );

  useEffect(() => {
    setDraftSplit(savedSplit);
  }, [savedSplit]);

  const dirty = useMemo(() => {
    return SPLIT_KEYS.some((key) => draftSplit[key] !== savedSplit[key]);
  }, [draftSplit, savedSplit]);

  const splitTotal = SPLIT_KEYS.reduce((sum, key) => sum + draftSplit[key], 0);

  const bucketValues: Record<SplitKey, number> = {
    reserve_percent: reserve,
    operating_percent: operating,
    reinvest_percent: reinvestment,
    tax_percent: taxBuffer,
    owner_percent: withdrawable
  };

  const chartData = useMemo(
    () =>
      SPLIT_KEYS.map((key) => ({
        name: BUCKET_META[key].name,
        value: bucketValues[key],
        color: BUCKET_META[key].color
      })),
    [reserve, operating, reinvestment, taxBuffer, withdrawable]
  );

  const handleSplitChange = (key: SplitKey, value: number) => {
    setDraftSplit((current) => rebalanceSplit(current, key, value));
  };

  const handleSave = async () => {
    const normalized = normalizeSplit(draftSplit);

    if (SPLIT_KEYS.reduce((sum, key) => sum + normalized[key], 0) !== 100) {
      toast.error('Treasury split must total 100%');
      return;
    }

    await persistPolicy({
      treasury_split: normalized
    });

    toast.success('Treasury split updated', {
      description: 'Future verified deposits will use the new target allocation.'
    });
  };

  const handleReset = () => {
    setDraftSplit(savedSplit);
  };

  return (
    <div className="space-y-5">
      <Card className="bg-slate-950/60 border-slate-800 shadow-xl overflow-hidden">
        <CardHeader className="p-5 border-b border-slate-800/50 bg-slate-900/20 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-slate-300 flex items-center gap-2">
              <Wallet className="h-4 w-4 text-emerald-400" />
              Treasury Allocation Control
            </CardTitle>

            <p className="text-[10px] text-slate-600 font-mono uppercase mt-1">
              Target split total: {splitTotal}% · verified revenue only
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!dirty}
              onClick={handleReset}
              className="border-slate-800 bg-slate-950 text-slate-300 font-mono text-[10px] uppercase"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-2" />
              Reset
            </Button>

            <Button
              type="button"
              size="sm"
              disabled={!dirty || splitTotal !== 100}
              onClick={handleSave}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-[10px] uppercase"
            >
              <Save className="h-3.5 w-3.5 mr-2" />
              Save Split
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {SPLIT_KEYS.map((key) => {
                const meta = BUCKET_META[key];
                const Icon = meta.icon;
                const value = bucketValues[key];
                const actualShare = getActualShare(value, total);

                return (
                  <Card
                    key={key}
                    className={cn(
                      'bg-slate-950/70 border-slate-800 border-l-4 overflow-hidden',
                      toneClasses(meta.tone)
                    )}
                  >
                    <CardHeader className="p-4 pb-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                            {meta.name}
                          </CardTitle>

                          <p className="text-[9px] text-slate-600 font-mono mt-1">
                            Target split {draftSplit[key]}%
                          </p>
                        </div>

                        <div className="p-2 rounded-xl border border-slate-800 bg-slate-900/70">
                          <Icon className="h-4 w-4" />
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="p-4 pt-2 space-y-4">
                      <div>
                        <p className="text-xl font-mono font-black text-slate-100">
                          {formatNok(value)}
                        </p>

                        <div className="flex items-center justify-between mt-3">
                          <p className="text-[8px] text-slate-600 font-black uppercase tracking-widest">
                            Actual treasury share
                          </p>

                          <p className="text-[9px] text-slate-500 font-mono">
                            {actualShare.toFixed(1)}%
                          </p>
                        </div>

                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1">
                          <div
                            className="h-full bg-current rounded-full"
                            style={{ width: `${actualShare}%` }}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[8px] text-slate-600 font-black uppercase tracking-widest">
                            Target allocation
                          </p>

                          <p className="text-[10px] font-mono font-black text-slate-300">
                            {draftSplit[key]}%
                          </p>
                        </div>

                        <Slider
                          value={[draftSplit[key]]}
                          min={0}
                          max={100}
                          step={1}
                          onValueChange={([value]) => handleSplitChange(key, value)}
                        />
                      </div>

                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        {meta.description}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Card className="lg:col-span-4 bg-slate-950/70 border-slate-800 overflow-hidden">
              <CardHeader className="p-4 border-b border-slate-800/50">
                <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                  Allocation Map
                </CardTitle>
              </CardHeader>

              <CardContent className="p-5">
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#020617',
                          border: '1px solid #1e293b',
                          borderRadius: '10px',
                          fontSize: '11px'
                        }}
                        formatter={(value) => formatNok(value)}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-4">
                  {SPLIT_KEYS.map((key) => (
                    <div key={key} className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: BUCKET_META[key].color }}
                      />

                      <span className="text-[10px] text-slate-400 truncate">
                        {BUCKET_META[key].name}
                      </span>

                      <span className="text-[10px] text-slate-600 font-mono ml-auto">
                        {draftSplit[key]}%
                      </span>
                    </div>
                  ))}
                </div>

                <div
                  className={cn(
                    'mt-5 p-3 rounded-xl border text-[10px] font-mono leading-relaxed',
                    splitTotal === 100
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                      : 'bg-red-500/10 border-red-500/20 text-red-300'
                  )}
                >
                  {splitTotal === 100
                    ? 'Split is valid. Future verified deposits will distribute using these targets after saving.'
                    : `Invalid split: total is ${splitTotal}%. It must equal 100%.`}
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TreasuryOverview;