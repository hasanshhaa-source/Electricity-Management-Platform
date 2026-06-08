import { requireAdmin } from '@/services/auth/authService';
import { createClient } from '@/lib/supabase/server';
import { getNotificationSettings } from '@/services/notification/notificationSettings';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { NotificationSettingsForm } from './settings-form';
import { Bell, CheckCircle, XCircle, Clock } from 'lucide-react';

const PAGE_SIZE = 50;

const TYPE_LABELS: Record<string, string> = {
  bill_generated:     'Bill Issued',
  payment_reminder:   'Payment Reminder',
  overdue:            'Overdue Reminder',
  payment_confirmed:  'Payment Confirmed',
  tenancy_approved:   'Tenancy Approved',
  tenancy_rejected:   'Tenancy Rejected',
  complaint_submitted:'Complaint',
};

async function getNotificationLogs() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('notifications')
    .select(`
      id, type, channel, status, title, error_message, sent_at, created_at,
      user:users(full_name, email)
    `)
    .in('channel', ['email', 'whatsapp'])
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);
  return data ?? [];
}

async function getStats() {
  const supabase = await createClient();
  const [{ count: sent }, { count: failed }, { count: pending }] = await Promise.all([
    supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('status', 'sent').in('channel', ['email','whatsapp']),
    supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('status', 'failed').in('channel', ['email','whatsapp']),
    supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('status', 'pending').in('channel', ['email','whatsapp']),
  ]);
  return { sent: sent ?? 0, failed: failed ?? 0, pending: pending ?? 0 };
}

export default async function NotificationsPage() {
  await requireAdmin();

  const [settings, logs, stats] = await Promise.all([
    getNotificationSettings(),
    getNotificationLogs(),
    getStats(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Email notification engine, delivery logs, and settings"
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 flex items-center gap-3">
            <CheckCircle className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.sent.toLocaleString()}</p>
              <p className="text-xs text-gray-500">Sent</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center gap-3">
            <XCircle className="h-8 w-8 text-red-500" />
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.failed.toLocaleString()}</p>
              <p className="text-xs text-gray-500">Failed</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center gap-3">
            <Clock className="h-8 w-8 text-gray-400" />
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.pending.toLocaleString()}</p>
              <p className="text-xs text-gray-500">Pending</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Settings form */}
      <NotificationSettingsForm settings={settings} />

      {/* Delivery log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-gray-400" />
            Delivery Log <span className="text-sm font-normal text-gray-500">(last {PAGE_SIZE})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <EmptyState
              icon={<Bell className="h-8 w-8" />}
              title="No notifications sent yet"
              description="Email notifications will appear here once bills are issued or payments are recorded."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-gray-50">
                  <tr>
                    {['Type','Channel','Recipient','Status','Sent At','Error'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left font-medium text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {logs.map((n: any) => (
                    <tr key={n.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="text-gray-900">{TYPE_LABELS[n.type] ?? n.type}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs capitalize">{n.channel}</Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        <p className="font-medium text-gray-900">{n.user?.full_name ?? '—'}</p>
                        <p className="text-xs text-gray-400">{n.user?.email ?? '—'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            n.status === 'sent'    ? 'success'     :
                            n.status === 'failed'  ? 'destructive' :
                            n.status === 'skipped' ? 'secondary'   : 'outline'
                          }
                          className="text-xs capitalize"
                        >
                          {n.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {n.sent_at ? new Date(n.sent_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-red-600 max-w-xs truncate" title={n.error_message ?? ''}>
                        {n.error_message ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
