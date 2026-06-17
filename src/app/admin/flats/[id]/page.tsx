import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '@/services/auth/authService';
import { getFlatById } from '@/services/building/buildingService';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { FlatStatusBadge, TenancyStatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FlatForm } from '@/components/admin/flat-form';
import { FlatStatusControl } from './flat-status-control';
import { ChevronLeft } from 'lucide-react';

type Props = { params: Promise<{ id: string }> };

async function getFlatWithHistory(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('tenancies')
    .select('id, status, start_date, end_date, notes, user:users!user_id(id, full_name, email, phone)')
    .eq('flat_id', id)
    .order('created_at', { ascending: false })
    .limit(10);
  return data ?? [];
}

export default async function FlatDetailPage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;
  const result = await getFlatById(id);
  if (result.error || !result.data) notFound();

  const flat = result.data as any;
  const building = flat.building;
  const tenancyHistory = await getFlatWithHistory(id);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/buildings/${flat.building_id}/flats`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ChevronLeft className="h-4 w-4" />{building?.name} — Flats
        </Link>
        <PageHeader
          title={`Flat ${flat.flat_number}`}
          description={`${building?.name} · ${building?.city}`}
          action={<FlatStatusBadge status={flat.status} />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Edit form */}
        <FlatForm building={{ id: flat.building_id, name: building?.name ?? '' }} flat={flat} />

        {/* Status control */}
        <FlatStatusControl flatId={id} currentStatus={flat.status} />
      </div>

      {/* Tenancy History */}
      <Card>
        <CardHeader><CardTitle>Tenancy History</CardTitle></CardHeader>
        <CardContent>
          {tenancyHistory.length === 0 ? (
            <p className="text-sm text-gray-500">No tenancy history for this flat.</p>
          ) : (
            <div className="space-y-3">
              {tenancyHistory.map((t: any) => (
                <div key={t.id} className="flex items-start justify-between rounded-lg border border-gray-100 p-3">
                  <div>
                    <p className="font-medium text-gray-900">{t.user?.full_name}</p>
                    <p className="text-xs text-gray-500">{t.user?.email}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {t.start_date ? new Date(t.start_date).toLocaleDateString() : 'N/A'}
                      {t.end_date ? ` → ${new Date(t.end_date).toLocaleDateString()}` : ' → Present'}
                    </p>
                    {t.notes && <p className="text-xs text-gray-500 mt-1">{t.notes}</p>}
                  </div>
                  <TenancyStatusBadge status={t.status} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
