'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { tenantProfileSchema, createTenantSchema, type TenantProfileInput, type CreateTenantInput } from '@/lib/validation/tenant';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { User } from '@/types';

interface TenantFormProps {
  tenant?: User;
  onSuccess?: (tenant: User) => void;
}

export function TenantForm({ tenant, onSuccess }: TenantFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);
  const isEdit = !!tenant;

  const schema = isEdit ? tenantProfileSchema : createTenantSchema;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateTenantInput>({
    resolver: zodResolver(schema as any),
    defaultValues: tenant
      ? {
          full_name: tenant.full_name,
          email: tenant.email,
          phone: tenant.phone ?? '',
          national_id: tenant.national_id ?? '',
          is_active: tenant.is_active,
        }
      : { is_active: true },
  });

  async function onSubmit(data: CreateTenantInput | TenantProfileInput) {
    setLoading(true);
    setServerError('');

    const url = isEdit ? `/api/tenants/${tenant.id}` : '/api/tenants';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();

    if (!res.ok || json.error) {
      setServerError(json.error ?? 'Failed to save tenant');
      setLoading(false);
      return;
    }

    if (onSuccess) {
      onSuccess(json.data);
    } else {
      router.push(`/admin/tenants/${json.data.id}`);
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>{isEdit ? `Edit — ${tenant.full_name}` : 'Add New Tenant'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-4">
          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <FormField label="Full Name" htmlFor="full_name" error={(errors as any).full_name?.message} required>
            <Input id="full_name" placeholder="Mohammed Al-Rashidi" error={(errors as any).full_name?.message} {...register('full_name')} />
          </FormField>

          <FormField label="Email" htmlFor="email" error={(errors as any).email?.message} required>
            <Input
              id="email"
              type="email"
              placeholder="tenant@example.com"
              error={(errors as any).email?.message}
              disabled={isEdit}
              {...register('email')}
            />
          </FormField>

          {!isEdit && (
            <FormField label="Initial Password" htmlFor="password" error={(errors as any).password?.message} required>
              <Input
                id="password"
                type="password"
                placeholder="Min. 8 characters"
                error={(errors as any).password?.message}
                {...register('password')}
              />
            </FormField>
          )}

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Mobile Number" htmlFor="phone" error={(errors as any).phone?.message}>
              <Input id="phone" type="tel" placeholder="+966 5x xxx xxxx" {...register('phone')} />
            </FormField>
            <FormField
              label="National ID"
              htmlFor="national_id"
              error={(errors as any).national_id?.message}
              description="Optional identifier"
            >
              <Input id="national_id" placeholder="1xxxxxxxxx" {...register('national_id')} />
            </FormField>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="is_active" {...register('is_active')} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
            <label htmlFor="is_active" className="text-sm font-medium text-gray-700">Account is active</label>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={loading}>
              {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Tenant'}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
