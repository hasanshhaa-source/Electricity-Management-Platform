import { requireAdmin } from '@/services/auth/authService';
import { getComplaint } from '@/services/complaints/complaintService';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TicketStatusBadge } from '@/components/shared/status-badge';
import { StatusUpdateForm, EmailReplyForm } from './complaint-actions';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft, Building2, User, Paperclip } from 'lucide-react';

const TYPE_LABELS: Record<string, string> = {
  complaint:           'Complaint',
  recommendation:      'Recommendation',
  query:               'Query',
  maintenance_request: 'Maintenance Request',
  other:               'Other',
};

type Params = { params: Promise<{ id: string }> };

export default async function AdminComplaintDetailPage({ params }: Params) {
  await requireAdmin();
  const { id } = await params;

  const complaint = await getComplaint(id);
  if (!complaint) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/complaints"><ArrowLeft className="h-4 w-4" />Back</Link>
        </Button>
        <PageHeader
          title={complaint.subject}
          description={`Submitted ${new Date(complaint.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: details */}
        <div className="lg:col-span-2 space-y-5">

          {/* Main submission */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{TYPE_LABELS[complaint.type] ?? complaint.type}</Badge>
                <TicketStatusBadge status={complaint.status} />
              </div>
              <span className="text-xs text-gray-400">#{complaint.id.slice(0, 8)}</span>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Message</p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{complaint.description}</p>
              </div>

              {complaint.attachment_url && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Attachment</p>
                  <a
                    href={complaint.attachment_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    View Attachment
                  </a>
                </div>
              )}

              {complaint.resolution_note && (
                <div className="rounded-md bg-green-50 border border-green-200 p-3">
                  <p className="text-xs font-medium text-green-700 mb-1">Resolution Note (visible to tenant)</p>
                  <p className="text-sm text-green-800 whitespace-pre-wrap">{complaint.resolution_note}</p>
                </div>
              )}

              {complaint.admin_notes && (
                <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
                  <p className="text-xs font-medium text-amber-700 mb-1">Internal Notes (admin only)</p>
                  <p className="text-sm text-amber-800 whitespace-pre-wrap">{complaint.admin_notes}</p>
                </div>
              )}

              {complaint.replied_at && (
                <p className="text-xs text-gray-400">
                  Replied {new Date(complaint.replied_at).toLocaleString()}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Email reply form */}
          <EmailReplyForm complaint={complaint} />
        </div>

        {/* Right: metadata + status update */}
        <div className="space-y-5">
          {/* Tenant & flat info */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><User className="h-4 w-4 text-gray-400" />Submitter</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Name</span>
                <span className="font-medium text-gray-900">{complaint.submitter?.full_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Email</span>
                <span className="text-gray-700 text-xs truncate max-w-[160px]" title={complaint.submitter?.email}>
                  {complaint.submitter?.email}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Building2 className="h-4 w-4 text-gray-400" />Location</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Building</span>
                <span className="font-medium text-gray-900">{complaint.flat?.building?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">City</span>
                <span className="text-gray-700">{complaint.flat?.building?.city}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Flat</span>
                <span className="font-medium text-gray-900">Flat {complaint.flat?.flat_number}</span>
              </div>
            </CardContent>
          </Card>

          {/* Status update */}
          <StatusUpdateForm complaint={complaint} />
        </div>
      </div>
    </div>
  );
}
