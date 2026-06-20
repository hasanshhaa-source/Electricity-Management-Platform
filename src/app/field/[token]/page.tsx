import { getCycleByFieldToken } from '@/services/billing/fieldLinkService';
import { FieldReadingsForm } from '@/components/field/field-readings-form';

type Props = { params: Promise<{ token: string }> };

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default async function FieldReadingsPage({ params }: Props) {
  const { token } = await params;
  const result = await getCycleByFieldToken(token);

  if (result.error || !result.data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-sm text-center space-y-2">
          <p className="text-lg font-semibold text-gray-900">Link unavailable</p>
          <p className="text-sm text-gray-500">{result.error ?? 'This link is invalid or has been disabled.'}</p>
        </div>
      </div>
    );
  }

  const cycle = result.data;
  const periodLabel = `${MONTH_NAMES[cycle.periodMonth - 1]} ${cycle.periodYear}`;

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{cycle.buildingName}</h1>
          <p className="text-sm text-gray-500">Meter Readings — {periodLabel}</p>
        </div>
        <FieldReadingsForm
          token={token}
          cycleId={cycle.cycleId}
          periodYear={cycle.periodYear}
          periodMonth={cycle.periodMonth}
          rows={cycle.rows}
        />
      </div>
    </div>
  );
}
