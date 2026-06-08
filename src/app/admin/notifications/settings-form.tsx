'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Save } from 'lucide-react';
import type { NotificationSettings } from '@/services/notification/notificationSettings';

const schema = z.object({
  admin_email:               z.string().email('Invalid email').optional().or(z.literal('')),
  sender_name:               z.string().min(1, 'Required').max(100),
  sender_email:              z.string().email('Invalid email').optional().or(z.literal('')),
  overdue_reminders_enabled: z.boolean(),
  reminder_frequency_days:   z.coerce.number().int().min(1).max(30),
  bill_issued_enabled:       z.boolean(),
  payment_confirmed_enabled: z.boolean(),
  complaint_notify_enabled:  z.boolean(),
});

type FormInput    = z.input<typeof schema>;
type FormOutput   = z.infer<typeof schema>;

interface Props { settings: NotificationSettings }

export function NotificationSettingsForm({ settings }: Props) {
  const router = useRouter();
  const [serverError, setServerError] = useState('');
  const [success, setSuccess]         = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      admin_email:               settings.admin_email ?? '',
      sender_name:               settings.sender_name,
      sender_email:              settings.sender_email ?? '',
      overdue_reminders_enabled: settings.overdue_reminders_enabled,
      reminder_frequency_days:   settings.reminder_frequency_days,
      bill_issued_enabled:       settings.bill_issued_enabled,
      payment_confirmed_enabled: settings.payment_confirmed_enabled,
      complaint_notify_enabled:  settings.complaint_notify_enabled,
    },
  });

  async function onSubmit(data: FormOutput) {
    setServerError('');
    setSuccess(false);

    const body = {
      ...data,
      admin_email:  data.admin_email  || null,
      sender_email: data.sender_email || null,
    };

    const res  = await fetch('/api/admin/notification-settings', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || json.error) { setServerError(json.error ?? 'Save failed'); return; }
    setSuccess(true);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification Settings</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-lg">
          {serverError && <Alert variant="destructive"><AlertDescription>{serverError}</AlertDescription></Alert>}
          {success     && <Alert variant="default" className="border-green-200 bg-green-50 text-green-800"><AlertDescription>Settings saved.</AlertDescription></Alert>}

          {/* Email sender */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Email Sender</h3>
            <div className="space-y-1">
              <Label htmlFor="sender_name">Sender Name</Label>
              <Input id="sender_name" {...register('sender_name')} placeholder="ElectroManage" />
              {errors.sender_name && <p className="text-xs text-red-600">{errors.sender_name.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="sender_email">Sender Email <span className="text-gray-400 text-xs">(optional, defaults to SMTP_FROM_EMAIL)</span></Label>
              <Input id="sender_email" type="email" {...register('sender_email')} placeholder="noreply@example.com" />
              {errors.sender_email && <p className="text-xs text-red-600">{errors.sender_email.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="admin_email">Admin Notification Email <span className="text-gray-400 text-xs">(receives complaint alerts)</span></Label>
              <Input id="admin_email" type="email" {...register('admin_email')} placeholder="admin@example.com" />
              {errors.admin_email && <p className="text-xs text-red-600">{errors.admin_email.message}</p>}
            </div>
          </div>

          {/* Overdue reminders */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Overdue Reminders</h3>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="h-4 w-4 rounded" {...register('overdue_reminders_enabled')} />
              Enable daily overdue reminders
            </label>
            <div className="space-y-1">
              <Label htmlFor="reminder_frequency_days">Reminder Frequency (days between reminders)</Label>
              <Input id="reminder_frequency_days" type="number" min={1} max={30} className="w-24" {...register('reminder_frequency_days')} />
              {errors.reminder_frequency_days && <p className="text-xs text-red-600">{errors.reminder_frequency_days.message}</p>}
            </div>
          </div>

          {/* Per-event toggles */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Notification Events</h3>
            <div className="space-y-2">
              {[
                { field: 'bill_issued_enabled',       label: 'Send email when bill is issued to tenant' },
                { field: 'payment_confirmed_enabled', label: 'Send email when payment is recorded' },
                { field: 'complaint_notify_enabled',  label: 'Send email to admin when complaint is submitted' },
              ].map(({ field, label }) => (
                <label key={field} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" className="h-4 w-4 rounded"
                    {...register(field as keyof FormInput)} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : <><Save className="h-4 w-4" />Save Settings</>}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
