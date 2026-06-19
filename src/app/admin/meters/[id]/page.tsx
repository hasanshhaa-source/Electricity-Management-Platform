import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '@/services/auth/authService';
import { getMeterById } from '@/services/meter/meterService';
import { PageHeader } from '@/components/shared/page-header';
import { MeterTypeBadge } from '@/components/shared/meter-type-badge';
import { MeterForm } from '@/components/admin/meter-form';
import { AllocationEditor } from '@/components/admin/allocation-editor';
import { IndividualMeterLink } from '@/components/admin/individual-meter-link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronLeft } from 'lucide-react';

type Props = { params: Promise<{ id: string }> };

export default async function MeterDetailPage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;

  const result = await getMeterById(id);
  if (result.error || !result.data) notFound();
  const meter = result.data as any;
  const building = meter.building;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/meters" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ChevronLeft className="h-4 w-4" />Meters
        </Link>
        <PageHeader
          title={`Meter ${meter.meter_number}`}
          description={building?.name ?? ''}
          action={
            <div className="flex items-center gap-2">
              <MeterTypeBadge type={meter.meter_type} />
              <Badge variant={meter.is_active ? 'success' : 'secondary'}>
                {meter.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <MeterForm building={building} meter={meter} />

        {meter.meter_type === 'shared' && (
          <Card>
            <CardHeader><CardTitle>Flat Allocations</CardTitle></CardHeader>
            <CardContent>
              <AllocationEditor
                meterId={meter.id}
                buildingId={meter.building_id}
                meterNumber={meter.meter_number}
                initialAllocations={meter.allocations as any}
              />
            </CardContent>
          </Card>
        )}

        {meter.meter_type === 'individual' && (
          <IndividualMeterLink
            meterId={meter.id}
            buildingId={meter.building_id}
            meterNumber={meter.meter_number}
            currentFlatId={meter.allocations[0]?.flat_id ?? null}
          />
        )}
      </div>
    </div>
  );
}
