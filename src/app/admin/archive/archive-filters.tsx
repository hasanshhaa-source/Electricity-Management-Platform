'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

interface Building { id: string; name: string }

interface Props {
  buildings:       Building[];
  selectedBuilding: string;
  selectedYear:    string;
  selectedMonth:   string;
  selectedStatus:  string;
  selectedFlat:    string;
  selectedTenant:  string;
  totalRows:       number;
}

const MONTHS = [
  {v:'1',l:'January'},{v:'2',l:'February'},{v:'3',l:'March'},
  {v:'4',l:'April'},{v:'5',l:'May'},{v:'6',l:'June'},
  {v:'7',l:'July'},{v:'8',l:'August'},{v:'9',l:'September'},
  {v:'10',l:'October'},{v:'11',l:'November'},{v:'12',l:'December'},
];

const STATUSES = [
  {v:'unpaid',l:'Unpaid'},{v:'partial',l:'Partial'},{v:'paid',l:'Paid'},
  {v:'overdue',l:'Overdue'},{v:'waived',l:'Waived'},{v:'cancelled',l:'Cancelled'},
];

const now       = new Date();
const THIS_YEAR = now.getFullYear();
const YEARS     = [THIS_YEAR - 2, THIS_YEAR - 1, THIS_YEAR].map(y => ({ v: String(y), l: String(y) }));

export function ArchiveFilters(props: Props) {
  const router      = useRouter();
  const pathname    = usePathname();
  const searchParams = useSearchParams();

  const update = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === 'all') params.delete(key); else params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams]);

  // Build export URL with current filter params
  const exportParams = new URLSearchParams(searchParams.toString());
  exportParams.delete('all_versions'); // export always uses current filters
  const exportUrl = `/api/admin/archive/export?${exportParams.toString()}`;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={props.selectedBuilding || 'all'} onValueChange={v => update('building_id', v)}>
        <SelectTrigger className="w-44"><SelectValue placeholder="All Buildings" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Buildings</SelectItem>
          {props.buildings.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={props.selectedYear || 'all'} onValueChange={v => update('year', v)}>
        <SelectTrigger className="w-28"><SelectValue placeholder="Year" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Years</SelectItem>
          {YEARS.map(y => <SelectItem key={y.v} value={y.v}>{y.l}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={props.selectedMonth || 'all'} onValueChange={v => update('month', v)}>
        <SelectTrigger className="w-36"><SelectValue placeholder="Month" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Months</SelectItem>
          {MONTHS.map(m => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={props.selectedStatus || 'all'} onValueChange={v => update('status', v)}>
        <SelectTrigger className="w-32"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          {STATUSES.map(s => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}
        </SelectContent>
      </Select>

      <Input
        placeholder="Flat number"
        defaultValue={props.selectedFlat}
        className="w-32"
        onChange={e => { const v = e.target.value; const p = new URLSearchParams(searchParams.toString()); if (v) p.set('flat', v); else p.delete('flat'); router.push(`${pathname}?${p.toString()}`); }}
      />

      <Input
        placeholder="Tenant name"
        defaultValue={props.selectedTenant}
        className="w-40"
        onChange={e => { const v = e.target.value; const p = new URLSearchParams(searchParams.toString()); if (v) p.set('tenant', v); else p.delete('tenant'); router.push(`${pathname}?${p.toString()}`); }}
      />

      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-gray-400">{props.totalRows} rows</span>
        <Button asChild variant="outline" size="sm">
          <a href={exportUrl} download="bill-archive.csv">
            <Download className="h-4 w-4" />Export CSV
          </a>
        </Button>
      </div>
    </div>
  );
}
