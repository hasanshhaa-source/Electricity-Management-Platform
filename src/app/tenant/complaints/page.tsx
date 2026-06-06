import { requireTenant } from '@/services/auth/authService';
import { getTenancyByUser } from '@/services/tenant/tenancyService';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { TicketStatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { MessageSquare, AlertTriangle } from 'lucide-react';
import { NewComplaintForm } from './new-complaint-form';

async function getMyComplaints(submittedBy: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('complaints')
    .select('id, type, subject, description, status, created_at, resolution_note')
    .eq('submitted_by', submittedBy)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  return data ?? [];
}

const typeLabels: Record<string, string> = {
  complaint: 'Complaint',
  recommendation: 'Recommendation',
  query: 'Query',
};

export default async function ComplaintsPage() {
  const user = await requireTenant();
  const { data: tenancy } = await getTenancyByUser(user.id);
  const tickets = await getMyComplaints(user.id);

  const hasActiveFlat = tenancy?.status === 'active';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Complaints & Recommendations"
        description="Submit and track your requests"
      />

      {!hasActiveFlat && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No active flat</AlertTitle>
          <AlertDescription>
            You need an active flat assignment to submit complaints.
          </AlertDescription>
        </Alert>
      )}

      {hasActiveFlat && tenancy && (
        <NewComplaintForm flatId={tenancy.flat_id} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your Submissions</CardTitle>
        </CardHeader>
        <CardContent>
          {tickets.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="h-8 w-8" />}
              title="No submissions yet"
              description="Your complaints and recommendations will appear here"
            />
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket: any) => (
                <div
                  key={ticket.id}
                  className="rounded-lg border border-gray-100 p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{typeLabels[ticket.type] ?? ticket.type}</Badge>
                      <span className="font-medium text-gray-900">{ticket.subject}</span>
                    </div>
                    <TicketStatusBadge status={ticket.status} />
                  </div>
                  <p className="text-sm text-gray-600">{ticket.description}</p>
                  {ticket.resolution_note && (
                    <div className="rounded-md bg-green-50 p-3 text-sm text-green-800">
                      <span className="font-medium">Resolution: </span>
                      {ticket.resolution_note}
                    </div>
                  )}
                  <p className="text-xs text-gray-400">
                    {new Date(ticket.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
