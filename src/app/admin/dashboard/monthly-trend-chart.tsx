'use client';

import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { MonthlyTrendPoint } from '@/services/analytics/analyticsService';

interface Props { data: MonthlyTrendPoint[]; currency: string }

export function MonthlyTrendChart({ data, currency }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-gray-400">
        No trend data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis yAxisId="cost" orientation="left" tick={{ fontSize: 11 }}
          tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
        <YAxis yAxisId="kwh" orientation="right" tick={{ fontSize: 11 }}
          tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
        <Tooltip
          formatter={(value, name) => {
            const v = Number(value);
            if (name === 'Consumption (kWh)') return [`${v.toLocaleString('en')} kWh`, name as string];
            return [`${currency} ${v.toLocaleString('en', { minimumFractionDigits: 2 })}`, name as string];
          }}
        />
        <Legend />
        <Bar yAxisId="cost" dataKey="collected"   name="Collected"          stackId="a" fill="#16a34a" />
        <Bar yAxisId="cost" dataKey="outstanding"  name="Outstanding"        stackId="a" fill="#fca5a5" />
        <Line yAxisId="kwh" type="monotone" dataKey="consumption"
          name="Consumption (kWh)" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
