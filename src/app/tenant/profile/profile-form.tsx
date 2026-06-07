'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, Loader2, Pencil } from 'lucide-react';

const schema = z.object({
  full_name:   z.string().min(2, 'Name must be at least 2 characters').max(100),
  phone:       z.string().max(20).optional().nullable(),
  national_id: z.string().max(50).optional().nullable(),
});

type FormInput = z.infer<typeof schema>;

interface Props {
  initialValues: { full_name: string; phone: string | null; national_id: string | null };
}

export function ProfileForm({ initialValues }: Props) {
  const router  = useRouter();
  const [editing, setEditing]   = useState(false);
  const [success, setSuccess]   = useState(false);
  const [error,   setError]     = useState('');

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name:   initialValues.full_name,
      phone:       initialValues.phone       ?? '',
      national_id: initialValues.national_id ?? '',
    },
  });

  async function onSubmit(data: FormInput) {
    setError('');
    setSuccess(false);
    const res  = await fetch('/api/profile', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok || json.error) { setError(json.error ?? 'Failed to save'); return; }
    setSuccess(true);
    setEditing(false);
    router.refresh();
  }

  function cancel() {
    reset();
    setEditing(false);
    setError('');
  }

  if (!editing) {
    return (
      <div className="space-y-3">
        <InfoRow label="Full Name"   value={initialValues.full_name} />
        <InfoRow label="Phone"       value={initialValues.phone ?? '—'} />
        <InfoRow label="National ID" value={initialValues.national_id ?? '—'} />

        {success && (
          <div className="flex items-center gap-2 text-sm text-green-600 pt-1">
            <CheckCircle2 className="h-4 w-4" /> Profile updated successfully.
          </div>
        )}

        <Button
          size="sm"
          variant="outline"
          onClick={() => { setSuccess(false); setEditing(true); }}
          className="mt-2"
        >
          <Pencil className="h-3.5 w-3.5" />Edit Profile
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="full_name">Full Name <span className="text-red-500">*</span></Label>
        <Input id="full_name" {...register('full_name')} />
        {errors.full_name && <p className="text-xs text-red-500">{errors.full_name.message}</p>}
      </div>

      <div className="space-y-1">
        <Label htmlFor="phone">Phone <span className="text-gray-400 text-xs">(optional)</span></Label>
        <Input id="phone" type="tel" placeholder="+966 5X XXX XXXX" {...register('phone')} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="national_id">National ID <span className="text-gray-400 text-xs">(optional)</span></Label>
        <Input id="national_id" placeholder="e.g. 1XXXXXXXXX" {...register('national_id')} />
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : 'Save Changes'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={cancel}>Cancel</Button>
      </div>
    </form>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}
