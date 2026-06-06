import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '@/services/auth/authService';
import { getBuildings } from '@/services/building/buildingService';
import { PageHeader } from '@/components/shared/page-header';
import { MeterForm } from '@/components/admin/meter-form';
import { ChevronLeft } from 'lucide-react';

type Props = { searchParams: Promise<{ building?: string }> };

export default async function NewMeterPage({ searchParams }: Props) {
  await requireAdmin();
  const { building: buildingId } = await searchParams;
  const { data: buildings } = await getBuildings();

  const building = buildingId
    ? buildings?.find((b) => b.id === buildingId)
    : buildings?.[0];

  if (!building) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/meters" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ChevronLeft className="h-4 w-4" />Meters
        </Link>
        <PageHeader title="Add Meter" description={`Creating meter for ${building.name}`} />
      </div>
      <MeterForm building={building} />
    </div>
  );
}
