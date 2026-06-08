import { requireTenant } from '@/services/auth/authService';
import { getTenancyByUser } from '@/services/tenant/tenancyService';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { TicketStatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { MessageSquare, AlertTriangle, MessageCircle, Clock } from 'lucide-react';
import { NewComplaintForm } from './new-complaint-form';

async function getMyComplaints(submittedBy: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('complaints')
    .select('id, type, subject, description, status, created_at, updated_at, resolution_note, admin_reply, replied_at, attachment_url')
    .eq('submitted_by', submittedBy)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  return data ?? [];
}

const typeLabels: Record<string, string> = {
  complaint:           'Complaint',
  recommendation:      'Recommendation',
  query:               'Query',
  maintenance_request: 'Maintenance Request',
  other:               'Other',
};

const STATUS_HINTS: Record<string, string> = {
  open:        'Submitted — awaiting admin review.',
  reviewed:    'Reviewed by admin — being assessed.',
  in_progress: 'In progress — being worked on.',
  resolved:    'Resolved — see admin response below.',
  closed:      'Closed — no further action required.',
};

export default async function ComplaintsPage() {
  const user = await requireTenant();
  const { data: tenancy } = await getTenancyByUser(user.id);
  const tickets = await getMyComplaints(user.id);

  const hasActiveFlat = tenancy?.status === 'active';
  const openCount     = tickets.filter((t: any) => t.status === 'open').length;

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
          <AlertDescription>You need an active flat assignment to submit complaints.</AlertDescription>
        </Alert>
      )}

      {openCount > 0 && (
        <Alert variant="default">
          <Clock className="h-4 w-4" />
          <AlertTitle>{openCount} open submission{openCount > 1 ? 's' : ''}</AlertTitle>
          <AlertDescription>Awaiting admin review.</AlertDescription>
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
            <div className="space-y-4">
              {tickets.map((ticket: any) => (
                <div
                  key={ticket.id}
                  className="rounded-lg border border-gray-200 p-4 space-y-3"
                >
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-xs">{typeLabels[ticket.type] ?? ticket.type}</Badge>
                      <span className="font-medium text-gray-900">{ticket.subject}</span>
                    </div>
                    <TicketStatusBadge status={ticket.status} />
                  </div>

                  {/* Description */}
                  <p className="text-sm text-gray-600">{ticket.description}</p>

                  {/* Attachment */}
                  {ticket.attachment_url && (
                    <a
                      href={ticket.attachment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      📎 View Attachment
                    </a>
                  )}

                  {/* Status hint */}
                  <p className="text-xs text-gray-400 italic">{STATUS_HINTS[ticket.status]}</p>

                  {/* Admin reply */}
                  {(ticket.admin_reply || ticket.resolution_note) && (
                    <div className="rounded-md bg-green-50 border border-green-200 p-3 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <MessageCircle className="h-3.5 w-3.5 text-green-600" />
                        <span className="text-xs font-semibold text-green-700">Admin Response</span>
                        {ticket.replied_at && (
                          <span className="text-xs text-green-500 ml-1">
                            · {new Date(ticket.replied_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-green-800 whitespace-pre-wrap">
                        {ticket.admin_reply || ticket.resolution_note}
                      </p>
                    </div>
                  )}

                  <p className="text-xs text-gray-400">
                    Submitted {new Date(ticket.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
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
