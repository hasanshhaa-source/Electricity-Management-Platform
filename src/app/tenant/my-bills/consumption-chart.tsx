'use client';

import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { YearlyTrendPoint } from '@/services/insights/insightService';

interface Props { data: YearlyTrendPoint[]; currency: string }

export function TenantConsumptionChart({ data, currency }: Props) {
  const hasData = data.some(d => d.consumption > 0);
  if (!hasData) return null;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} />
        <YAxis yAxisId="cost" orientation="left" tick={{ fontSize: 10 }}
          tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
        <YAxis yAxisId="kwh" orientation="right" tick={{ fontSize: 10 }}
          tickFormatter={(v: number) => `${v.toFixed(0)}`} />
        <Tooltip
          formatter={(value, name) => {
            const v = Number(value);
            const n = String(name ?? '');
            if (n === 'kWh') return [`${v.toLocaleString('en')} kWh`, 'Consumption'];
            return [`${currency} ${v.toLocaleString('en', { minimumFractionDigits: 2 })}`, n];
          }}
        />
        <Legend formatter={(val: string) => val === 'kWh' ? 'Consumption (kWh)' : val} />
        <Bar yAxisId="cost" dataKey="cost" name="Total Due" fill="#dbeafe" radius={[2,2,0,0]} />
        <Bar yAxisId="cost" dataKey="collected" name="Paid" fill="#16a34a" radius={[2,2,0,0]} />
        <Line yAxisId="kwh" type="monotone" dataKey="consumption" name="kWh"
          stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
