import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { 
  useReserve, 
  useOperating, 
  useReinvestment, 
  useTaxBuffer, 
  useWithdrawable, 
  useTotalTreasury 
} from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, ShieldCheck, Zap, TrendingUp, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
export const TreasuryOverview = () => {
  const reserve = useReserve();
  const operating = useOperating();
  const reinvestment = useReinvestment();
  const taxBuffer = useTaxBuffer();
  const withdrawable = useWithdrawable();
  const total = useTotalTreasury();
  const chartData = useMemo(() => [
    { name: 'Reserve', value: reserve, color: '#10B981' },
    { name: 'Operating', value: operating, color: '#38BDF8' },
    { name: 'Reinvest', value: reinvestment, color: '#F59E0B' },
    { name: 'Tax', value: taxBuffer, color: '#6366F1' },
    { name: 'Owner', value: withdrawable, color: '#EC4899' },
  ], [reserve, operating, reinvestment, taxBuffer, withdrawable]);
  const stats = [
    { label: 'Total Treasury', value: total, icon: Wallet, color: 'text-white' },
    { label: 'Reserve (40%)', value: reserve, icon: ShieldCheck, color: 'text-emerald-500' },
    { label: 'Operating (20%)', value: operating, icon: Zap, color: 'text-sky-400' },
    { label: 'Reinvest (15%)', value: reinvestment, icon: TrendingUp, color: 'text-amber-500' },
    { label: 'Tax Buffer (15%)', value: taxBuffer, icon: ShieldCheck, color: 'text-indigo-400' },
    { label: 'Withdrawable', value: withdrawable, icon: DollarSign, color: 'text-pink-500' },
  ];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-8 grid grid-cols-2 md:grid-cols-3 gap-3">
        {stats.map((stat, idx) => (
          <Card key={idx} className="bg-slate-950/50 border-slate-800 backdrop-blur-sm">
            <CardHeader className="p-3 pb-0">
              <stat.icon className={cn("h-4 w-4 mb-1", stat.color)} />
              <CardTitle className="text-2xs font-medium text-slate-400 uppercase tracking-wider">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1">
              <div className="text-lg font-mono font-bold">
                ${stat.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="lg:col-span-4 bg-slate-950/50 border-slate-800 backdrop-blur-sm overflow-hidden">
        <div className="h-full flex items-center p-4">
          <div className="w-1/3 h-24">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={25}
                  outerRadius={35}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '4px', fontSize: '10px' }}
                  itemStyle={{ color: '#f8fafc' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="w-2/3 pl-4 grid grid-cols-2 gap-x-2 gap-y-1">
            {chartData.map((d, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="text-[10px] text-slate-400 truncate">{d.name}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
};