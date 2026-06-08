'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Building { id: string; name: string }

interface Props {
  buildings: Building[];
  selectedBuilding: string;
  selectedYear:     string;
  selectedMonth:    string;
  selectedStatus:   string;
}

const MONTHS = [
  { value: '1',  label: 'January'   },
  { value: '2',  label: 'February'  },
  { value: '3',  label: 'March'     },
  { value: '4',  label: 'April'     },
  { value: '5',  label: 'May'       },
  { value: '6',  label: 'June'      },
  { value: '7',  label: 'July'      },
  { value: '8',  label: 'August'    },
  { value: '9',  label: 'September' },
  { value: '10', label: 'October'   },
  { value: '11', label: 'November'  },
  { value: '12', label: 'December'  },
];

const BILL_STATUSES = [
  { value: 'unpaid',  label: 'Unpaid'   },
  { value: 'partial', label: 'Partial'  },
  { value: 'paid',    label: 'Paid'     },
  { value: 'overdue', label: 'Overdue'  },
  { value: 'waived',  label: 'Waived'   },
];

const currentYear = new Date().getFullYear();
const YEARS = [currentYear - 1, currentYear, currentYear + 1].map(y => ({ value: String(y), label: String(y) }));

export function DashboardFilters({ buildings, selectedBuilding, selectedYear, selectedMonth, selectedStatus }: Props) {
  const router     = useRouter();
  const pathname   = usePathname();
  const searchParams = useSearchParams();

  const update = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'all' || value === '') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={selectedBuilding || 'all'} onValueChange={v => update('building_id', v)}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="All Buildings" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Buildings</SelectItem>
          {buildings.map(b => (
            <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={selectedYear || 'all'} onValueChange={v => update('year', v)}>
        <SelectTrigger className="w-32">
          <SelectValue placeholder="Year" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Years</SelectItem>
          {YEARS.map(y => (
            <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={selectedMonth || 'all'} onValueChange={v => update('month', v)}>
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Month" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Months</SelectItem>
          {MONTHS.map(m => (
            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={selectedStatus || 'all'} onValueChange={v => update('status', v)}>
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Bill Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          {BILL_STATUSES.map(s => (
            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
