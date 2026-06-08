'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import Link from 'next/link';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { TicketStatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import type { ComplaintRow } from '@/services/complaints/complaintService';

const TYPE_LABELS: Record<string, string> = {
  complaint:           'Complaint',
  recommendation:      'Recommendation',
  query:               'Query',
  maintenance_request: 'Maintenance',
  other:               'Other',
};

const TYPE_COLORS: Record<string, string> = {
  complaint:           'destructive',
  recommendation:      'success',
  query:               'default',
  maintenance_request: 'warning',
  other:               'secondary',
};

interface Building { id: string; name: string }

interface Props {
  complaints:          ComplaintRow[];
  buildings:           Building[];
  selectedBuilding:    string;
  selectedType:        string;
  selectedStatus:      string;
  selectedSearch:      string;
}

const STATUSES = [
  { value: 'open',        label: 'Open' },
  { value: 'reviewed',    label: 'Reviewed' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved',    label: 'Resolved' },
  { value: 'closed',      label: 'Closed' },
];

const TYPES = [
  { value: 'complaint',           label: 'Complaint' },
  { value: 'recommendation',      label: 'Recommendation' },
  { value: 'query',               label: 'Query' },
  { value: 'maintenance_request', label: 'Maintenance' },
  { value: 'other',               label: 'Other' },
];

export function ComplaintsTable({
  complaints, buildings,
  selectedBuilding, selectedType, selectedStatus, selectedSearch,
}: Props) {
  const router      = useRouter();
  const pathname    = usePathname();
  const searchParams = useSearchParams();

  const update = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === 'all') params.delete(key);
    else params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={selectedBuilding || 'all'} onValueChange={v => update('building_id', v)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Buildings" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Buildings</SelectItem>
            {buildings.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={selectedType || 'all'} onValueChange={v => update('type', v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={selectedStatus || 'all'} onValueChange={v => update('status', v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Input
          placeholder="Search subject, tenant, flat…"
          defaultValue={selectedSearch}
          className="w-56"
          onChange={e => {
            const v = e.target.value;
            const params = new URLSearchParams(searchParams.toString());
            if (v) params.set('search', v); else params.delete('search');
            router.push(`${pathname}?${params.toString()}`);
          }}
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50">
            <tr>
              {['Date','Tenant','Building / Flat','Type','Subject','Status',''].map(h => (
                <th key={h} className="px-4 py-2.5 text-left font-medium text-gray-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {complaints.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-gray-400">No submissions found</td>
              </tr>
            ) : complaints.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                  {new Date(c.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{c.submitter?.full_name}</p>
                  <p className="text-xs text-gray-400">{c.submitter?.email}</p>
                </td>
                <td className="px-4 py-3 text-gray-700">
                  <p>{c.flat?.building?.name}</p>
                  <p className="text-xs text-gray-400">Flat {c.flat?.flat_number}</p>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={(TYPE_COLORS[c.type] ?? 'secondary') as any} className="text-xs">
                    {TYPE_LABELS[c.type] ?? c.type}
                  </Badge>
                </td>
                <td className="px-4 py-3 max-w-xs">
                  <p className="font-medium text-gray-900 truncate">{c.subject}</p>
                  <p className="text-xs text-gray-400 truncate">{c.description.slice(0, 80)}…</p>
                </td>
                <td className="px-4 py-3">
                  <TicketStatusBadge status={c.status} />
                </td>
                <td className="px-4 py-3">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/admin/complaints/${c.id}`}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
