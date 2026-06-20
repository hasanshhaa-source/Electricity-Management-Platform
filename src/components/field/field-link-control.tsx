'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Link2, Copy, Check, Loader2, Ban } from 'lucide-react';

interface FieldLinkControlProps {
  cycleId:           string;
  initialEnabled:    boolean;
  initialToken:      string | null;
}

export function FieldLinkControl({ cycleId, initialEnabled, initialToken }: FieldLinkControlProps) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [token, setToken]     = useState(initialToken);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied]   = useState(false);
  const [error, setError]     = useState('');

  const link = token ? `${window.location.origin}/field/${token}` : '';

  async function generate() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/billing/cycles/${cycleId}/field-token`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error ?? 'Failed to generate link');
      } else {
        setToken(json.data.token);
        setEnabled(true);
        router.refresh();
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  async function revoke() {
    if (!window.confirm('This will disable the current field link. The field worker will no longer be able to submit readings with it. Continue?')) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/billing/cycles/${cycleId}/field-token`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error ?? 'Failed to revoke link');
      } else {
        setEnabled(false);
        router.refresh();
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  function copyLink() {
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-gray-500" />
        <p className="text-sm font-medium text-gray-900">Field Reading Link</p>
      </div>
      <p className="text-xs text-gray-500">
        Share this link with the person collecting meter readings on-site. No login required — anyone with the link can submit readings for this cycle.
      </p>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {enabled && token ? (
        <>
          <div className="flex items-center gap-2">
            <Input readOnly value={link} className="font-mono text-xs" />
            <Button size="sm" variant="outline" onClick={copyLink}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={loading} onClick={generate}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Rotate Link
            </Button>
            <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" disabled={loading} onClick={revoke}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              Revoke
            </Button>
          </div>
        </>
      ) : (
        <Button size="sm" disabled={loading} onClick={generate}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          Generate Field Link
        </Button>
      )}
    </div>
  );
}
