'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { assignFlatSchema, type AssignFlatInput } from '@/lib/validation/tenant';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createClient } from '@/lib/supabase/client';
import type { Building, Flat } from '@/types';

interface AssignFlatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
}

export function AssignFlatDialog({ open, onOpenChange, userId, userName }: AssignFlatDialogProps) {
  const router = useRouter();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [flats, setFlats] = useState<Flat[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState('');
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<AssignFlatInput>({
    resolver: zodResolver(assignFlatSchema),
    defaultValues: { user_id: userId, start_date: new Date().toISOString().split('T')[0] },
  });
  const flatId = watch('flat_id');

  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    supabase.from('buildings').select('id, name, city').eq('is_active', true).is('deleted_at', null).order('name')
      .then(({ data }) => setBuildings(data as Building[] ?? []));
  }, [open]);

  useEffect(() => {
    if (!selectedBuilding) { setFlats([]); return; }
    const supabase = createClient();
    supabase.from('flats').select('id, flat_number, floor')
      .eq('building_id', selectedBuilding).eq('status', 'available').is('deleted_at', null).order('flat_number')
      .then(({ data }) => setFlats(data as Flat[] ?? []));
  }, [selectedBuilding]);

  async function onSubmit(data: AssignFlatInput) {
    setLoading(true);
    setServerError('');
    const res = await fetch('/api/tenants/assign-flat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok || json.error) { setServerError(json.error ?? 'Failed to assign flat'); setLoading(false); return; }
    onOpenChange(false);
    reset();
    setSelectedBuilding('');
    setLoading(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Flat</DialogTitle>
          <DialogDescription>Assign or change the flat for {userName}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {serverError && <Alert variant="destructive"><AlertDescription>{serverError}</AlertDescription></Alert>}
          <input type="hidden" {...register('user_id')} />

          <FormField label="Building" htmlFor="afd-building" required>
            <Select value={selectedBuilding} onValueChange={setSelectedBuilding}>
              <SelectTrigger id="afd-building"><SelectValue placeholder="Select building" /></SelectTrigger>
              <SelectContent>
                {buildings.map((b) => <SelectItem key={b.id} value={b.id}>{b.name} — {b.city}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Available Flat" htmlFor="afd-flat" required>
            <Select value={flatId ?? ''} onValueChange={(v) => setValue('flat_id', v)} disabled={!selectedBuilding || flats.length === 0}>
              <SelectTrigger id="afd-flat">
                <SelectValue placeholder={!selectedBuilding ? 'Select a building first' : flats.length === 0 ? 'No available flats' : 'Select flat'} />
              </SelectTrigger>
              <SelectContent>
                {flats.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    Flat {f.flat_number}{f.floor != null ? ` — Floor ${f.floor}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.flat_id && <p className="text-xs text-red-600">{errors.flat_id.message}</p>}
          </FormField>

          <FormField label="Move-in Date" htmlFor="afd-start" error={errors.start_date?.message} required>
            <Input id="afd-start" type="date" error={errors.start_date?.message} {...register('start_date')} />
          </FormField>

          <FormField label="Notes" htmlFor="afd-notes">
            <Textarea id="afd-notes" rows={2} placeholder="Optional admin notes" {...register('notes')} />
          </FormField>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!flatId} loading={loading}>Assign Flat</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
