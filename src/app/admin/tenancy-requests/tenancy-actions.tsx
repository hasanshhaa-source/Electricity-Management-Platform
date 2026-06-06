'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { TenancyWithDetails } from '@/types';

interface TenancyActionsProps {
  tenancy: TenancyWithDetails;
  adminId: string;
}

export function TenancyActions({ tenancy, adminId }: TenancyActionsProps) {
  const router = useRouter();
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [rejectNotes, setRejectNotes] = useState('');

  if (tenancy.status !== 'pending') {
    return <span className="text-xs text-gray-400">—</span>;
  }

  async function approve() {
    setLoading(true);
    setError('');
    const res = await fetch(`/api/tenancies/${tenancy.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenancy_id: tenancy.id, start_date: startDate }),
    });
    const json = await res.json();
    if (!res.ok || json.error) {
      setError(json.error ?? 'Failed to approve');
      setLoading(false);
      return;
    }
    setApproveOpen(false);
    setLoading(false);
    router.refresh();
  }

  async function reject() {
    if (!rejectNotes.trim()) {
      setError('Please provide a reason for rejection');
      return;
    }
    setLoading(true);
    setError('');
    const res = await fetch(`/api/tenancies/${tenancy.id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenancy_id: tenancy.id, notes: rejectNotes }),
    });
    const json = await res.json();
    if (!res.ok || json.error) {
      setError(json.error ?? 'Failed to reject');
      setLoading(false);
      return;
    }
    setRejectOpen(false);
    setLoading(false);
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="success" onClick={() => setApproveOpen(true)}>
          Approve
        </Button>
        <Button size="sm" variant="destructive" onClick={() => setRejectOpen(true)}>
          Reject
        </Button>
      </div>

      {/* Approve Dialog */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Tenancy</DialogTitle>
            <DialogDescription>
              Approve the request for {tenancy.user?.full_name} — Flat {tenancy.flat?.flat_number}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <FormField label="Start Date" htmlFor="start_date" required>
            <Input
              id="start_date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </FormField>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>
              Cancel
            </Button>
            <Button variant="success" onClick={approve} loading={loading}>
              Confirm Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Tenancy Request</DialogTitle>
            <DialogDescription>
              This will reject the request and keep the flat available.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <FormField label="Reason for rejection" htmlFor="reject_notes" required>
            <textarea
              id="reject_notes"
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              rows={3}
              placeholder="Please explain why this request is being rejected..."
              className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50"
            />
          </FormField>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={reject} loading={loading}>
              Reject Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
