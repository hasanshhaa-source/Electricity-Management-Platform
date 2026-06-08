'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Save, Send } from 'lucide-react';
import type { TicketStatus } from '@/types';
import type { ComplaintRow } from '@/services/complaints/complaintService';

// ── Status Update Form ─────────────────────────────────────────────────────────

const statusSchema = z.object({
  status:          z.enum(['open','reviewed','in_progress','resolved','closed']),
  resolution_note: z.string().max(2000).optional(),
  admin_notes:     z.string().max(2000).optional(),
});
type StatusInput = z.infer<typeof statusSchema>;

const STATUSES: { value: TicketStatus; label: string }[] = [
  { value: 'open',        label: 'Open' },
  { value: 'reviewed',    label: 'Reviewed' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved',    label: 'Resolved' },
  { value: 'closed',      label: 'Closed' },
];

interface StatusFormProps { complaint: ComplaintRow }

export function StatusUpdateForm({ complaint }: StatusFormProps) {
  const router = useRouter();
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState(false);

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<StatusInput>({
    resolver: zodResolver(statusSchema),
    defaultValues: {
      status:          complaint.status,
      resolution_note: complaint.resolution_note ?? '',
      admin_notes:     complaint.admin_notes      ?? '',
    },
  });

  const statusValue = watch('status');

  async function onSubmit(data: StatusInput) {
    setError(''); setSuccess(false);
    const res  = await fetch(`/api/complaints/${complaint.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok || json.error) { setError(json.error ?? 'Save failed'); return; }
    setSuccess(true);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Status & Notes</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {error   && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          {success && <Alert><AlertDescription className="text-green-700">Saved.</AlertDescription></Alert>}

          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={statusValue} onValueChange={v => setValue('status', v as TicketStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="resolution_note">
              Resolution Note <span className="text-xs text-gray-400">(visible to tenant)</span>
            </Label>
            <textarea
              id="resolution_note"
              rows={3}
              placeholder="Describe the resolution or response…"
              className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              {...register('resolution_note')}
            />
            {errors.resolution_note && <p className="text-xs text-red-600">{errors.resolution_note.message}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="admin_notes">
              Internal Notes <span className="text-xs text-gray-400">(admin only)</span>
            </Label>
            <textarea
              id="admin_notes"
              rows={3}
              placeholder="Internal comments not visible to tenant…"
              className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              {...register('admin_notes')}
            />
          </div>

          <Button type="submit" disabled={isSubmitting} size="sm">
            {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : <><Save className="h-4 w-4" />Save Changes</>}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Email Reply Form ───────────────────────────────────────────────────────────

const replySchema = z.object({
  reply:      z.string().min(1, 'Reply is required').max(2000),
  new_status: z.enum(['open','reviewed','in_progress','resolved','closed']),
});
type ReplyInput = z.infer<typeof replySchema>;

interface ReplyFormProps { complaint: ComplaintRow }

export function EmailReplyForm({ complaint }: ReplyFormProps) {
  const router = useRouter();
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState(false);

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<ReplyInput>({
    resolver: zodResolver(replySchema),
    defaultValues: {
      reply:      complaint.admin_reply ?? '',
      new_status: complaint.status,
    },
  });

  const statusValue = watch('new_status');

  async function onSubmit(data: ReplyInput) {
    setError(''); setSuccess(false);
    const res  = await fetch(`/api/complaints/${complaint.id}/reply`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok || json.error) { setError(json.error ?? 'Send failed'); return; }
    setSuccess(true);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Send Email Reply to Tenant</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {error   && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          {success && <Alert><AlertDescription className="text-green-700">Reply sent and status updated.</AlertDescription></Alert>}

          <div className="space-y-1">
            <Label>Update Status To</Label>
            <Select value={statusValue} onValueChange={v => setValue('new_status', v as TicketStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="reply">
              Reply Message <span className="text-xs text-gray-400">(sent to tenant's email)</span>
            </Label>
            <textarea
              id="reply"
              rows={5}
              placeholder="Write your reply to the tenant…"
              className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              {...register('reply')}
            />
            {errors.reply && <p className="text-xs text-red-600">{errors.reply.message}</p>}
          </div>

          <p className="text-xs text-gray-500">
            This will send an email to <strong>{complaint.submitter?.email}</strong> and update the status.
          </p>

          <Button type="submit" disabled={isSubmitting} size="sm">
            {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" />Sending…</> : <><Send className="h-4 w-4" />Send Reply</>}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
