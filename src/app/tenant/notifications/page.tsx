import { requireTenant } from '@/services/auth/authService';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bell } from 'lucide-react';

async function getMyNotifications(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('notifications')
    .select('id, type, title, body, read_at, created_at, channel')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  return data ?? [];
}

export default async function NotificationsPage() {
  const user = await requireTenant();
  const notifications = await getMyNotifications(user.id);

  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" description="Your recent notifications" />

      {notifications.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-8 w-8" />}
          title="No notifications"
          description="Notifications will appear here when bills are generated or actions are taken"
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {notifications.map((n: any) => (
                <div
                  key={n.id}
                  className={`flex gap-4 p-4 ${!n.read_at ? 'bg-blue-50/50' : ''}`}
                >
                  <div className={`mt-0.5 h-2 w-2 flex-shrink-0 rounded-full ${!n.read_at ? 'bg-blue-600' : 'bg-transparent'}`} />
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900">{n.title}</p>
                      <Badge variant="outline" className="text-xs">{n.channel}</Badge>
                    </div>
                    {n.body && <p className="mt-0.5 text-sm text-gray-600">{n.body}</p>}
                    <p className="mt-1 text-xs text-gray-400">
                      {new Date(n.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
