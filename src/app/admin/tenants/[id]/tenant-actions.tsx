'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { AssignFlatDialog } from '@/components/admin/assign-flat-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { UserPlus, UserMinus, RefreshCw } from 'lucide-react';

interface TenantActionsProps {
  userId: string;
  userName: string;
  activeTenancyId?: string;
}

export function TenantActions({ userId, userName, activeTenancyId }: TenantActionsProps) {
  const router = useRouter();
  const [assignOpen, setAssignOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [ending, setEnding] = useState(false);

  async function handleEndTenancy() {
    if (!activeTenancyId) return;
    setEnding(true);
    const today = new Date().toISOString().split('T')[0];
    await fetch(`/api/tenancies/${activeTenancyId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenancy_id: activeTenancyId, notes: 'Ended by admin' }),
    });
    // Actually use the end endpoint
    await fetch(`/api/tenants/${userId}/end-tenancy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ end_date: today }),
    });
    setEndOpen(false);
    setEnding(false);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => setAssignOpen(true)}
      >
        <UserPlus className="h-4 w-4" />
        {activeTenancyId ? 'Change Flat' : 'Assign Flat'}
      </Button>

      {activeTenancyId && (
        <Button
          variant="outline"
          size="sm"
          className="w-full text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
          onClick={() => setEndOpen(true)}
        >
          <UserMinus className="h-4 w-4" />
          End Tenancy
        </Button>
      )}

      <AssignFlatDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        userId={userId}
        userName={userName}
      />

      <ConfirmDialog
        open={endOpen}
        onOpenChange={setEndOpen}
        title="End Tenancy"
        description={`This will end the active tenancy for ${userName} and mark the flat as available.`}
        confirmLabel="End Tenancy"
        loading={ending}
        onConfirm={handleEndTenancy}
      />
    </div>
  );
}
