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
import { FormField } from '@/components/ui/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Loader2 } from 'lucide-react';

const schema = z.object({
  type:           z.enum(['complaint', 'recommendation', 'maintenance_request', 'query', 'other']),
  subject:        z.string().min(3, 'Subject must be at least 3 characters').max(100),
  description:    z.string().min(10, 'Description must be at least 10 characters').max(1000),
  attachment_url: z.string().url('Must be a valid URL').optional().nullable(),
});

type FormInput = z.infer<typeof schema>;

const TYPE_OPTIONS = [
  { value: 'complaint',           label: 'Complaint' },
  { value: 'maintenance_request', label: 'Maintenance Request' },
  { value: 'recommendation',      label: 'Recommendation' },
  { value: 'query',               label: 'Query' },
  { value: 'other',               label: 'Other' },
];

const TYPE_PLACEHOLDER: Record<string, string> = {
  complaint:           'Describe the issue in detail…',
  maintenance_request: 'Describe what needs to be repaired or maintained…',
  recommendation:      'Share your suggestion or recommendation…',
  query:               'Ask your question or describe what you need clarification on…',
  other:               'Provide details…',
};

interface Props { flatId: string }

export function NewComplaintForm({ flatId }: Props) {
  const router = useRouter();
  const [expanded, setExpanded]     = useState(false);
  const [serverError, setServerError] = useState('');

  const {
    register, handleSubmit, setValue, watch, reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'complaint' },
  });

  const typeValue = watch('type');

  async function onSubmit(data: FormInput) {
    setServerError('');
    const res  = await fetch('/api/complaints', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...data, flat_id: flatId }),
    });
    const json = await res.json();
    if (!res.ok || json.error) { setServerError(json.error ?? 'Failed to submit'); return; }
    reset();
    setExpanded(false);
    router.refresh();
  }

  if (!expanded) {
    return (
      <Button variant="outline" onClick={() => setExpanded(true)}>
        <Plus className="h-4 w-4" />New Submission
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Submission</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-lg">
          {serverError && (
            <Alert variant="destructive"><AlertDescription>{serverError}</AlertDescription></Alert>
          )}

          <div className="space-y-1">
            <Label>Type <span className="text-red-500">*</span></Label>
            <Select
              value={typeValue}
              onValueChange={(v) => setValue('type', v as FormInput['type'])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <FormField label="Subject" htmlFor="subject" error={errors.subject?.message} required>
            <Input
              id="subject"
              placeholder="Brief summary of your submission"
              error={errors.subject?.message}
              {...register('subject')}
            />
          </FormField>

          <div className="space-y-1">
            <Label htmlFor="description">Description <span className="text-red-500">*</span></Label>
            <textarea
              id="description"
              rows={4}
              placeholder={TYPE_PLACEHOLDER[typeValue] ?? 'Provide details…'}
              className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              {...register('description')}
            />
            {errors.description && (
              <p className="text-xs text-red-600">{errors.description.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="attachment_url">
              Attachment URL <span className="text-gray-400 text-xs">(optional)</span>
            </Label>
            <Input
              id="attachment_url"
              type="url"
              placeholder="https://… link to photo or document"
              {...register('attachment_url')}
            />
            {errors.attachment_url && (
              <p className="text-xs text-red-500">{errors.attachment_url.message}</p>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</> : 'Submit'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setExpanded(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
