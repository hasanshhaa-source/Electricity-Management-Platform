import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '@/services/auth/authService';
import { getBuildingById, getFlatsByBuilding } from '@/services/building/buildingService';
import { getMetersByBuilding } from '@/services/meter/meterService';
import { PageHeader } from '@/components/shared/page-header';
import { BuildingForm } from '@/components/admin/building-form';
import { FlatStatusBadge } from '@/components/shared/status-badge';
import { MeterTypeBadge } from '@/components/shared/meter-type-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BuildingTabs } from './building-tabs';
import { DoorOpen, Zap, Plus } from 'lucide-react';

type Props = { params: Promise<{ id: string }> };

export default async function BuildingDetailPage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;

  const [buildingResult, flatsResult, metersResult] = await Promise.all([
    getBuildingById(id),
    getFlatsByBuilding(id, true),
    getMetersByBuilding(id),
  ]);

  if (buildingResult.error || !buildingResult.data) notFound();

  const building = buildingResult.data;
  const flats = flatsResult.data ?? [];
  const meters = metersResult.data ?? [];

  const available = flats.filter((f) => f.status === 'available').length;
  const occupied = flats.filter((f) => f.status === 'occupied').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={building.name}
        description={`${building.city}, ${building.country} · Billing day ${building.billing_day} · ${building.currency}`}
        action={
          <Badge variant={building.is_active ? 'success' : 'secondary'} className="text-sm px-3 py-1">
            {building.is_active ? 'Active' : 'Inactive'}
          </Badge>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard title="Total Flats" value={flats.length} icon={<DoorOpen className="h-5 w-5" />} />
        <StatCard title="Available" value={available} icon={<DoorOpen className="h-5 w-5" />} />
        <StatCard title="Occupied" value={occupied} icon={<DoorOpen className="h-5 w-5" />} />
        <StatCard title="Meters" value={meters.length} icon={<Zap className="h-5 w-5" />} />
      </div>

      <BuildingTabs building={building} flats={flats} meters={meters} />
    </div>
  );
}
