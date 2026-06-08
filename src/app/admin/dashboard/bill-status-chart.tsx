'use client';

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { BillStatusPoint } from '@/services/analytics/analyticsService';

const STATUS_COLORS: Record<string, string> = {
  paid:    '#16a34a',
  partial: '#d97706',
  unpaid:  '#6b7280',
  overdue: '#dc2626',
  waived:  '#7c3aed',
};

interface Props { data: BillStatusPoint[]; currency: string }

export function BillStatusChart({ data, currency }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-gray-400">
        No bill data for this period
      </div>
    );
  }

  const chartData = data.map(d => ({
    name:   d.label,
    value:  d.count,
    amount: d.amount,
    status: d.status,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          dataKey="value"
        >
          {chartData.map((entry) => (
            <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? '#94a3b8'} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value, name, props) => [
            `${value} bills — ${currency} ${(props.payload as any).amount.toLocaleString('en', { minimumFractionDigits: 2 })}`,
            name,
          ]}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
