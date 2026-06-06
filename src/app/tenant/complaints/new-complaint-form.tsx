'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus } from 'lucide-react';

const schema = z.object({
  type: z.enum(['complaint', 'recommendation', 'query']),
  subject: z.string().min(3, 'Subject must be at least 3 characters').max(100),
  description: z.string().min(10, 'Description must be at least 10 characters').max(1000),
});

type FormInput = z.infer<typeof schema>;

interface NewComplaintFormProps {
  flatId: string;
}

export function NewComplaintForm({ flatId }: NewComplaintFormProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormInput>({ resolver: zodResolver(schema), defaultValues: { type: 'complaint' } });

  const typeValue = watch('type');

  async function onSubmit(data: FormInput) {
    setLoading(true);
    setServerError('');

    const res = await fetch('/api/complaints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, flat_id: flatId }),
    });
    const json = await res.json();

    if (!res.ok || json.error) {
      setServerError(json.error ?? 'Failed to submit');
      setLoading(false);
      return;
    }

    reset();
    setExpanded(false);
    setLoading(false);
    router.refresh();
  }

  if (!expanded) {
    return (
      <Button variant="outline" onClick={() => setExpanded(true)}>
        <Plus className="h-4 w-4" />
        New Submission
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
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <FormField label="Type" htmlFor="type" required>
            <Select
              value={typeValue}
              onValueChange={(v) => setValue('type', v as FormInput['type'])}
            >
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="complaint">Complaint</SelectItem>
                <SelectItem value="recommendation">Recommendation</SelectItem>
                <SelectItem value="query">Query</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Subject" htmlFor="subject" error={errors.subject?.message} required>
            <Input id="subject" placeholder="Brief summary" error={errors.subject?.message} {...register('subject')} />
          </FormField>

          <FormField label="Description" htmlFor="description" error={errors.description?.message} required>
            <textarea
              id="description"
              rows={4}
              placeholder="Describe your complaint, recommendation, or query in detail..."
              className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              {...register('description')}
            />
            {errors.description && (
              <p className="text-xs text-red-600">{errors.description.message}</p>
            )}
          </FormField>

          <div className="flex gap-2">
            <Button type="submit" loading={loading}>Submit</Button>
            <Button type="button" variant="outline" onClick={() => setExpanded(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
