'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type RegisterInput } from '@/lib/validation/auth';
import { createClient } from '@/lib/supabase/client';
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
import type { Building, Flat } from '@/types';

type Step = 'account' | 'flat-selection' | 'done';

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('account');
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [flats, setFlats] = useState<Flat[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState('');
  const [selectedFlat, setSelectedFlat] = useState('');
  const [userId, setUserId] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  useEffect(() => {
    if (step === 'flat-selection') {
      loadBuildings();
    }
  }, [step]);

  useEffect(() => {
    if (selectedBuilding) {
      loadAvailableFlats(selectedBuilding);
    } else {
      setFlats([]);
      setSelectedFlat('');
    }
  }, [selectedBuilding]);

  async function loadBuildings() {
    const supabase = createClient();
    const { data } = await supabase
      .from('buildings')
      .select('id, name, city')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('name');
    setBuildings(data as Building[] ?? []);
  }

  async function loadAvailableFlats(buildingId: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from('flats')
      .select('id, flat_number, floor, area_sqm')
      .eq('building_id', buildingId)
      .eq('status', 'available')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('floor')
      .order('flat_number');
    setFlats(data as Flat[] ?? []);
  }

  async function onRegister(data: RegisterInput) {
    setLoading(true);
    setServerError('');

    const supabase = createClient();

    // 1. Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
    });

    if (authError) {
      setServerError(`[Auth] ${authError.message}`);
      setLoading(false);
      return;
    }

    if (!authData.user) {
      setServerError('[Auth] signUp returned no user — email confirmation may be enabled in Supabase. Please disable it under Authentication → Providers → Email → Confirm email.');
      setLoading(false);
      return;
    }

    // 2. Create user profile via API route
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_id: authData.user.id,
        email: data.email,
        full_name: data.full_name,
        phone: data.phone ?? null,
      }),
    });

    const json = await res.json();
    if (!res.ok || json.error) {
      setServerError(`[API ${res.status}] ${json.error ?? 'Failed to create profile'}`);
      setLoading(false);
      return;
    }

    setUserId(json.data.id);
    setLoading(false);
    setStep('flat-selection');
  }

  async function onRequestFlat() {
    if (!selectedFlat) {
      setServerError('Please select a flat');
      return;
    }
    setLoading(true);
    setServerError('');

    const res = await fetch('/api/tenancies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flat_id: selectedFlat }),
    });

    const json = await res.json();
    if (!res.ok || json.error) {
      setServerError(json.error ?? 'Failed to submit request');
      setLoading(false);
      return;
    }

    setLoading(false);
    setStep('done');
  }

  function skipFlatSelection() {
    setStep('done');
  }

  if (step === 'done') {
    return (
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900">Account created!</h2>
        <p className="mt-2 text-sm text-gray-500">
          {selectedFlat
            ? 'Your flat request has been submitted. Admin will review and approve it shortly.'
            : 'Your account has been created. You can request a flat from your dashboard.'}
        </p>
        <Button
          className="mt-6 w-full"
          onClick={() => router.push('/tenant/dashboard')}
        >
          Go to Dashboard
        </Button>
      </div>
    );
  }

  if (step === 'flat-selection') {
    return (
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Select your flat</h1>
          <p className="mt-1 text-sm text-gray-500">
            Choose your building and flat. Admin will approve your request.
          </p>
        </div>

        {serverError && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <FormField label="Building" htmlFor="building" required>
            <Select value={selectedBuilding} onValueChange={setSelectedBuilding}>
              <SelectTrigger id="building">
                <SelectValue placeholder="Select a building" />
              </SelectTrigger>
              <SelectContent>
                {buildings.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name} — {b.city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {selectedBuilding && (
            <FormField label="Available Flat" htmlFor="flat" required>
              <Select
                value={selectedFlat}
                onValueChange={setSelectedFlat}
                disabled={flats.length === 0}
              >
                <SelectTrigger id="flat">
                  <SelectValue
                    placeholder={
                      flats.length === 0
                        ? 'No available flats in this building'
                        : 'Select a flat'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {flats.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      Flat {f.flat_number}
                      {f.floor != null ? ` — Floor ${f.floor}` : ''}
                      {f.area_sqm ? ` (${f.area_sqm} m²)` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}

          <Button
            className="w-full"
            onClick={onRequestFlat}
            disabled={!selectedFlat}
            loading={loading}
          >
            Submit Request
          </Button>

          <button
            type="button"
            onClick={skipFlatSelection}
            className="w-full text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Skip for now — I&apos;ll do this later
          </button>
        </div>
      </div>
    );
  }

  // Step: account
  return (
    <div className="w-full max-w-sm">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Create account</h1>
        <p className="mt-1 text-sm text-gray-500">Sign up as a tenant</p>
      </div>

      <form onSubmit={handleSubmit(onRegister)} className="space-y-4">
        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        <FormField label="Full name" htmlFor="full_name" error={errors.full_name?.message} required>
          <Input
            id="full_name"
            placeholder="Mohammed Al-Rashidi"
            error={errors.full_name?.message}
            {...register('full_name')}
          />
        </FormField>

        <FormField label="Email address" htmlFor="email" error={errors.email?.message} required>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />
        </FormField>

        <FormField
          label="Phone number"
          htmlFor="phone"
          error={errors.phone?.message}
          description="Optional — used for notifications"
        >
          <Input
            id="phone"
            type="tel"
            placeholder="+966 5x xxx xxxx"
            {...register('phone')}
          />
        </FormField>

        <FormField label="Password" htmlFor="password" error={errors.password?.message} required>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register('password')}
          />
        </FormField>

        <FormField
          label="Confirm password"
          htmlFor="confirmPassword"
          error={errors.confirmPassword?.message}
          required
        >
          <Input
            id="confirmPassword"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />
        </FormField>

        <Button type="submit" className="w-full" loading={loading}>
          {loading ? 'Creating account…' : 'Create Account'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">
          Sign in
        </Link>
      </p>
    </div>
  );
}
