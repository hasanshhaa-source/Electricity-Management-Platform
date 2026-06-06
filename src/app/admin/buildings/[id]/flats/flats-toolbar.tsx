'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FlatForm } from '@/components/admin/flat-form';
import { Plus } from 'lucide-react';
import type { Flat } from '@/types';

interface FlatsToolbarProps {
  buildingId: string;
  buildingName: string;
}

export function FlatsToolbar({ buildingId, buildingName }: FlatsToolbarProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />Add Flat
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add Flat — {buildingName}</DialogTitle>
          </DialogHeader>
          <FlatForm
            building={{ id: buildingId, name: buildingName }}
            onSuccess={() => { setOpen(false); router.refresh(); }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
