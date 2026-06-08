import { Badge } from '@/components/ui/badge';
import type { TenancyStatus, FlatStatus, BillStatus, TicketStatus, CycleStatus } from '@/types';

export function TenancyStatusBadge({ status }: { status: TenancyStatus }) {
  const variants: Record<TenancyStatus, { label: string; variant: 'default' | 'secondary' | 'success' | 'destructive' | 'warning' }> = {
    pending:  { label: 'Pending',  variant: 'warning' },
    active:   { label: 'Active',   variant: 'success' },
    ended:    { label: 'Ended',    variant: 'secondary' },
    rejected: { label: 'Rejected', variant: 'destructive' },
  };
  const { label, variant } = variants[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function FlatStatusBadge({ status }: { status: FlatStatus }) {
  const variants: Record<FlatStatus, { label: string; variant: 'default' | 'secondary' | 'success' | 'destructive' | 'warning' }> = {
    available:   { label: 'Available',   variant: 'success' },
    occupied:    { label: 'Occupied',    variant: 'default' },
    maintenance: { label: 'Maintenance', variant: 'warning' },
    inactive:    { label: 'Inactive',    variant: 'secondary' },
  };
  const { label, variant } = variants[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function BillStatusBadge({ status }: { status: BillStatus }) {
  const variants: Record<BillStatus, { label: string; variant: 'default' | 'secondary' | 'success' | 'destructive' | 'warning' }> = {
    draft:     { label: 'Draft',     variant: 'secondary' },
    unpaid:    { label: 'Unpaid',    variant: 'destructive' },
    partial:   { label: 'Partial',   variant: 'warning' },
    paid:      { label: 'Paid',      variant: 'success' },
    waived:    { label: 'Waived',    variant: 'secondary' },
    overdue:   { label: 'Overdue',   variant: 'destructive' },
    cancelled: { label: 'Cancelled', variant: 'secondary' },
  };
  const { label, variant } = variants[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function CycleStatusBadge({ status }: { status: CycleStatus }) {
  const variants: Partial<Record<CycleStatus, { label: string; variant: 'default' | 'secondary' | 'success' | 'destructive' | 'warning' }>> = {
    draft:               { label: 'Draft',               variant: 'secondary' },
    readings_collected:  { label: 'Readings Collected',  variant: 'default' },
    bills_imported:      { label: 'Bills Imported',      variant: 'warning' },
    calculated:          { label: 'Calculated',          variant: 'warning' },
    issued:              { label: 'Issued',              variant: 'success' },
    closed:              { label: 'Closed',              variant: 'secondary' },
    open:                { label: 'Open',                variant: 'default' },
    finalized:           { label: 'Finalized',           variant: 'success' },
  };
  const { label, variant } = variants[status] ?? { label: status, variant: 'secondary' as const };
  return <Badge variant={variant}>{label}</Badge>;
}

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const variants: Record<TicketStatus, { label: string; variant: 'default' | 'secondary' | 'success' | 'destructive' | 'warning' }> = {
    open:        { label: 'Open',        variant: 'warning' },
    reviewed:    { label: 'Reviewed',    variant: 'default' },
    in_progress: { label: 'In Progress', variant: 'default' },
    resolved:    { label: 'Resolved',    variant: 'success' },
    closed:      { label: 'Closed',      variant: 'secondary' },
  };
  const { label, variant } = variants[status];
  return <Badge variant={variant}>{label}</Badge>;
}
