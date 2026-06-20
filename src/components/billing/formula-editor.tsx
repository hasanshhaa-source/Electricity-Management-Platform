'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FunctionSquare, Loader2, CheckCircle2 } from 'lucide-react';

interface FormulaEditorProps {
  open:           boolean;
  onOpenChange:   (open: boolean) => void;
  flatId:         string;
  flatNumber:     string;
  cycleId:        string;
  initialFormula: string;
  initialScope:   'persistent' | 'one-off';
  onSaved:        () => void;
}

const VARIABLES = [
  'consumption', 'previous_reading', 'current_reading', 'rate_per_unit',
  'base_bill', 'previous_balance', 'total_building_cost', 'total_building_consumption',
];

export function FormulaEditor({
  open, onOpenChange, flatId, flatNumber, cycleId, initialFormula, initialScope, onSaved,
}: FormulaEditorProps) {
  const router = useRouter();
  const [text, setText]       = useState(initialFormula);
  const [scope, setScope]     = useState(initialScope);
  const [saving, setSaving]   = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError]     = useState('');
  const [checkResult, setCheckResult] = useState<{ valid: boolean; error: string | null } | null>(null);

  async function check() {
    setChecking(true);
    setCheckResult(null);
    try {
      const res = await fetch('/api/billing/formulas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formula_text: text }),
      });
      const json = await res.json();
      setCheckResult(json.data ?? { valid: false, error: json.error });
    } finally {
      setChecking(false);
    }
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/billing/formulas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flat_id:      flatId,
          cycle_id:     scope === 'one-off' ? cycleId : null,
          formula_text: text,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) { setError(json.error ?? 'Failed to save formula'); return; }
      onOpenChange(false);
      onSaved();
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FunctionSquare className="h-5 w-5" /> Custom Formula — Flat {flatNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Replaces this flat's base bill amount. Use variables, arithmetic, AVG/SUM/MIN/MAX(field) across
            other flats, IF(cond, a, b), and ALLOCATE(amount, 'flatNumber') to redirect part of the amount to another flat.
          </p>

          <div className="flex flex-wrap gap-1.5">
            {VARIABLES.map((v) => (
              <code key={v} className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{v}</code>
            ))}
          </div>

          <Textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setCheckResult(null); }}
            placeholder="e.g. AVG(consumption) * rate_per_unit"
            rows={4}
            className="font-mono text-sm"
          />

          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={scope === 'persistent'} onChange={() => setScope('persistent')} />
              Persistent (applies every future cycle)
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={scope === 'one-off'} onChange={() => setScope('one-off')} />
              This cycle only
            </label>
          </div>

          {checkResult && (
            checkResult.valid
              ? <Alert><CheckCircle2 className="h-4 w-4 text-green-500" /><AlertDescription>Formula is valid.</AlertDescription></Alert>
              : <Alert variant="destructive"><AlertDescription>{checkResult.error}</AlertDescription></Alert>
          )}
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" disabled={checking || !text.trim()} onClick={check}>
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Check Formula
            </Button>
            <Button size="sm" disabled={saving || !text.trim()} onClick={save}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
