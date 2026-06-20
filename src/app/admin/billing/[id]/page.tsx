import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '@/services/auth/authService';
import { getCycleById, getCycleReadingStats } from '@/services/billing/cycleService';
import { getReadingRowsForCycle } from '@/services/billing/readingService';
import { getBillsForCycle } from '@/services/billing/companyBillService';
import { getBillsForCycle as getFlatBillsForCycle } from '@/services/billing/billingCalculationService';
import { PageHeader } from '@/components/shared/page-header';
import { CycleStatusBadge } from '@/components/shared/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, Building2, Calendar, CheckCircle2, Circle } from 'lucide-react';
import { ReadingsTable } from './readings-table';
import { CompanyBillsSection } from './company-bills-section';
import { CalculationPreview } from './calculation-preview';
import { FieldLinkControl } from '@/components/field/field-link-control';
import type { CycleStatus } from '@/types';

type Props = { params: Promise<{ id: string }> };

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const STATUS_STEPS: { status: CycleStatus; label: string }[] = [
  { status: 'draft',              label: 'Draft' },
  { status: 'readings_collected', label: 'Readings Collected' },
  { status: 'bills_imported',     label: 'Bills Imported' },
  { status: 'calculated',         label: 'Calculated' },
  { status: 'issued',             label: 'Issued' },
  { status: 'closed',             label: 'Closed' },
];

const STATUS_ORDER: Record<string, number> = {
  draft: 0, readings_collected: 1, bills_imported: 2,
  calculated: 3, issued: 4, closed: 5, open: 0, finalized: 4,
};

export default async function BillingCyclePage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;

  const [cycleResult, statsResult] = await Promise.all([
    getCycleById(id),
    getCycleReadingStats(id),
  ]);

  if (cycleResult.error || !cycleResult.data) notFound();
  const cycle    = cycleResult.data;
  const building = cycle.building as any;
  const { totalMeters, readingsEntered } = statsResult;

  const [rowsResult, billsResult, flatBillsResult] = await Promise.all([
    getReadingRowsForCycle(cycle.building_id, cycle.period_year, cycle.period_month, id),
    getBillsForCycle(cycle.building_id, cycle.period_year, cycle.period_month),
    getFlatBillsForCycle(id),
  ]);
  const rows      = rowsResult.data      ?? [];
  const bills     = billsResult.data     ?? [];
  const flatBills = flatBillsResult.data ?? [];

  const periodLabel = `${MONTH_NAMES[cycle.period_month - 1]} ${cycle.period_year}`;
  const currentStep = STATUS_ORDER[cycle.status] ?? 0;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div>
        <Link href="/admin/billing" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ChevronLeft className="h-4 w-4" />Billing Cycles
        </Link>
        <PageHeader
          title={`${periodLabel} — ${building?.name}`}
          description={`${building?.city} · Billing cycle`}
          action={<CycleStatusBadge status={cycle.status} />}
        />
      </div>

      {/* Status stepper */}
      <Card>
        <CardContent className="pt-6 pb-5">
          <div className="flex items-center gap-0 overflow-x-auto">
            {STATUS_STEPS.map((step, i) => {
              const stepOrder = STATUS_ORDER[step.status] ?? i;
              const isDone    = stepOrder < currentStep;
              const isCurrent = stepOrder === currentStep;

              return (
                <div key={step.status} className="flex items-center min-w-0">
                  <div className={[
                    'flex flex-col items-center gap-1 px-3 py-1 rounded-lg min-w-[80px]',
                    isCurrent ? 'text-blue-600' : isDone ? 'text-green-600' : 'text-gray-400',
                  ].join(' ')}>
                    {isDone
                      ? <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                      : <Circle className={`h-5 w-5 flex-shrink-0 ${isCurrent ? 'fill-blue-100 stroke-blue-600' : ''}`} />
                    }
                    <span className={`text-xs text-center leading-tight ${isCurrent ? 'font-semibold' : ''}`}>
                      {step.label}
                    </span>
                  </div>
                  {i < STATUS_STEPS.length - 1 && (
                    <div className={`h-px w-8 flex-shrink-0 ${STATUS_ORDER[STATUS_STEPS[i + 1].status] <= currentStep ? 'bg-green-400' : 'bg-gray-200'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-100 bg-white p-4">
          <p className="text-xs text-gray-500 mb-1">Building</p>
          <p className="font-semibold text-gray-900 flex items-center gap-1.5">
            <Building2 className="h-4 w-4 text-gray-400" />{building?.name}
          </p>
        </div>
        <div className="rounded-lg border border-gray-100 bg-white p-4">
          <p className="text-xs text-gray-500 mb-1">Period</p>
          <p className="font-semibold text-gray-900 flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-gray-400" />{periodLabel}
          </p>
        </div>
        <div className="rounded-lg border border-gray-100 bg-white p-4">
          <p className="text-xs text-gray-500 mb-1">Meter Readings</p>
          <p className="font-semibold text-gray-900">
            {readingsEntered} <span className="text-gray-400 font-normal">/ {totalMeters}</span>
          </p>
        </div>
        <div className="rounded-lg border border-gray-100 bg-white p-4">
          <p className="text-xs text-gray-500 mb-1">Currency</p>
          <p className="font-semibold text-gray-900">{building?.currency ?? '—'}</p>
        </div>
      </div>

      {/* Meter readings collection */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Meter Readings — {periodLabel}</CardTitle>
            {totalMeters > 0 && (
              <Badge variant={readingsEntered === totalMeters ? 'success' : 'warning'}>
                {readingsEntered === totalMeters ? 'Complete' : `${totalMeters - readingsEntered} missing`}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldLinkControl
            cycleId={id}
            initialEnabled={cycle.field_token_enabled}
            initialToken={cycle.field_token}
          />
          <ReadingsTable
            cycleId={id}
            buildingId={cycle.building_id}
            periodYear={cycle.period_year}
            periodMonth={cycle.period_month}
            cycleStatus={cycle.status}
            rows={rows}
          />
        </CardContent>
      </Card>

      {/* Company bills */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Electricity Company Bills — {periodLabel}</CardTitle>
            {bills.length > 0 && (
              <Badge variant="default">{bills.length} bill{bills.length !== 1 ? 's' : ''}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <CompanyBillsSection
            cycleId={id}
            buildingId={cycle.building_id}
            periodYear={cycle.period_year}
            periodMonth={cycle.period_month}
            currency={building?.currency ?? 'SAR'}
            cycleStatus={cycle.status}
            initialBills={bills}
          />
        </CardContent>
      </Card>

      {/* Billing calculation & issuance */}
      <Card>
        <CardHeader>
          <CardTitle>Bill Calculation — {periodLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          <CalculationPreview
            cycleId={id}
            currency={building?.currency ?? 'SAR'}
            cycleStatus={cycle.status}
            initialBills={flatBills}
          />
        </CardContent>
      </Card>

      {/* Cycle notes */}
      {cycle.notes && (
        <Card>
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{cycle.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
