import { requireAdmin } from '@/services/auth/authService';
import { getComplaints } from '@/services/complaints/complaintService';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { ComplaintsTable } from './complaints-table';
import { MessageSquare, Clock, CheckCircle, AlertCircle } from 'lucide-react';

interface PageProps {
  searchParams: Promise<{
    building_id?: string;
    type?:        string;
    status?:      string;
    search?:      string;
  }>;
}

async function getBuildings() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('buildings')
    .select('id, name')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('name');
  return data ?? [];
}

export default async function AdminComplaintsPage({ searchParams }: PageProps) {
  await requireAdmin();
  const params = await searchParams;

  const [buildings, allComplaints] = await Promise.all([
    getBuildings(),
    getComplaints({
      buildingId: params.building_id,
      type:       params.type,
      status:     params.status,
      search:     params.search,
    }),
  ]);

  // Summary counts (unfiltered for stats, so fetch all)
  const [all] = await Promise.all([
    getComplaints({}),
  ]);

  const openCount        = all.filter(c => c.status === 'open').length;
  const inProgressCount  = all.filter(c => c.status === 'in_progress' || c.status === 'reviewed').length;
  const resolvedCount    = all.filter(c => c.status === 'resolved' || c.status === 'closed').length;
  const totalCount       = all.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Complaints & Recommendations"
        description="Manage tenant submissions, track status, and respond"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard title="Total"      value={totalCount}      icon={<MessageSquare className="h-5 w-5" />} description="All submissions" />
        <StatCard title="Open"       value={openCount}       icon={<AlertCircle   className="h-5 w-5" />} description="Awaiting review" />
        <StatCard title="In Progress" value={inProgressCount} icon={<Clock        className="h-5 w-5" />} description="Being handled" />
        <StatCard title="Resolved"   value={resolvedCount}   icon={<CheckCircle   className="h-5 w-5" />} description="Closed or resolved" />
      </div>

      <Card>
        <CardContent className="pt-5">
          <ComplaintsTable
            complaints={allComplaints}
            buildings={buildings}
            selectedBuilding={params.building_id ?? ''}
            selectedType={params.type ?? ''}
            selectedStatus={params.status ?? ''}
            selectedSearch={params.search ?? ''}
          />
        </CardContent>
      </Card>
    </div>
  );
}
