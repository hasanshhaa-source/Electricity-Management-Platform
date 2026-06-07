'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { paymentSchema, type PaymentInputRaw } from '@/lib/validation/billing';
import type { AdminBillRow } from '@/services/billing/paymentService';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

interface Props {
  bill:    AdminBillRow;
  open:    boolean;
  onClose: () => void;
}

const METHOD_LABELS: Record<string, string> = {
  cash:          'Cash',
  bank_transfer: 'Bank Transfer',
  stc_pay:       'STC Pay',
  online:        'Online',
  other:         'Other',
};

function fmt(n: number) {
  return n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function RecordPaymentDialog({ bill, open, onClose }: Props) {
  const router  = useRouter();
  const [error, setError] = useState('');

  const today = new Date().toISOString().split('T')[0];

  const form = useForm<PaymentInputRaw>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      bill_id:        bill.id,
      amount:         bill.outstandingBalance.toString() as any,
      payment_date:   today,
      payment_method: 'cash',
      reference_no:   '',
      notes:          '',
    },
  });

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = form;

  async function onSubmit(data: any) {
    setError('');
    try {
      const res  = await fetch('/api/billing/payments', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok || json.error) { setError(json.error ?? 'Failed to record payment'); return; }
      router.refresh();
      onClose();
    } catch {
      setError('Network error — please try again');
    }
  }

  const period = `${MONTH_NAMES[bill.periodMonth - 1]} ${bill.periodYear}`;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>

        {/* Bill summary */}
        <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Tenant</span>
            <span className="font-medium">{bill.tenantName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Flat / Building</span>
            <span>Flat {bill.flatNumber} — {bill.buildingName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Period</span>
            <span>{period}</span>
          </div>
          <div className="flex justify-between border-t border-gray-200 pt-1 mt-1">
            <span className="text-gray-500">Total Due</span>
            <span className="font-semibold">{fmt(bill.totalDue)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Already Paid</span>
            <span className="text-green-600">{fmt(bill.amountPaid)}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium">Outstanding</span>
            <span className="font-bold text-red-600">{fmt(bill.outstandingBalance)}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <input type="hidden" {...register('bill_id')} />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                max={bill.outstandingBalance}
                {...register('amount')}
              />
              {errors.amount && <p className="text-xs text-red-500">{errors.amount.message}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="payment_date">Payment Date</Label>
              <Input id="payment_date" type="date" max={today} {...register('payment_date')} />
              {errors.payment_date && <p className="text-xs text-red-500">{errors.payment_date.message}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <Label>Payment Method</Label>
            <Select
              defaultValue="cash"
              onValueChange={(v) => setValue('payment_method', v as any)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(METHOD_LABELS).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="reference_no">Reference Number <span className="text-gray-400 text-xs">(optional)</span></Label>
            <Input id="reference_no" placeholder="e.g. CHQ-12345 or transaction ID" {...register('reference_no')} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="notes">Notes <span className="text-gray-400 text-xs">(optional)</span></Label>
            <Input id="notes" placeholder="Any additional notes" {...register('notes')} />
          </div>

          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : 'Record Payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
