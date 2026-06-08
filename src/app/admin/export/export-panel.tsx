'use client';

import { useState } from 'react';
import { Download, FileText, CreditCard, Users, Zap } from 'lucide-react';

const EXPORTS = [
  {
    type:        'bills',
    label:       'Bills',
    description: 'All current flat bills with status, amounts, and tenant details',
    icon:        FileText,
    color:       'text-blue-600',
    bg:          'bg-blue-50',
  },
  {
    type:        'payments',
    label:       'Payments',
    description: 'Full payment history with method, reference, and linked bills',
    icon:        CreditCard,
    color:       'text-green-600',
    bg:          'bg-green-50',
  },
  {
    type:        'tenants',
    label:       'Tenants',
    description: 'All tenants with contact info, tenancy status, and flat assignments',
    icon:        Users,
    color:       'text-indigo-600',
    bg:          'bg-indigo-50',
  },
  {
    type:        'readings',
    label:       'Meter Readings',
    description: 'All meter readings with period, value, type, and building details',
    icon:        Zap,
    color:       'text-amber-600',
    bg:          'bg-amber-50',
  },
] as const;

type ExportType = typeof EXPORTS[number]['type'];

export function ExportPanel() {
  const [loading, setLoading] = useState<ExportType | null>(null);

  async function handleExport(type: ExportType) {
    setLoading(type);
    try {
      const res = await fetch(`/api/admin/export?type=${type}`);
      if (!res.ok) { alert('Export failed'); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${type}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {EXPORTS.map(({ type, label, description, icon: Icon, color, bg }) => (
        <div key={type} className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-start gap-4">
            <div className={`rounded-lg p-2.5 ${bg} shrink-0`}>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900">{label}</h3>
              <p className="mt-0.5 text-sm text-gray-500">{description}</p>
              <button
                onClick={() => handleExport(type)}
                disabled={loading === type}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                {loading === type ? 'Preparing…' : 'Download CSV'}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
