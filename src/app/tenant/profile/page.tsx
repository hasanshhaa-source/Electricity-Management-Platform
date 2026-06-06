import { requireTenant } from '@/services/auth/authService';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default async function ProfilePage() {
  const user = await requireTenant();

  const initials = user.full_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="space-y-6">
      <PageHeader title="My Profile" description="Your account information" />

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Account Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-xl font-bold text-green-700">
              {initials}
            </div>
            <div>
              <p className="font-semibold text-gray-900">{user.full_name}</p>
              <Badge variant="secondary" className="mt-0.5">Tenant</Badge>
            </div>
          </div>

          <div className="space-y-3 rounded-lg bg-gray-50 p-4">
            {[
              { label: 'Email',   value: user.email },
              { label: 'Role',    value: 'Tenant' },
              { label: 'Status',  value: user.is_active ? 'Active' : 'Inactive' },
            ].map((item) => (
              <div key={item.label} className="flex justify-between text-sm">
                <span className="text-gray-500">{item.label}</span>
                <span className="font-medium text-gray-900">{item.value}</span>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-400">
            To update your name, phone, or password, contact your building admin.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
