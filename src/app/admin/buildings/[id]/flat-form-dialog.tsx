'use client';

import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FlatForm } from '@/components/admin/flat-form';
import type { Building, Flat } from '@/types';

interface FlatFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  building: Building;
  flat?: Flat;
}

export function FlatFormDialog({ open, onOpenChange, building, flat }: FlatFormDialogProps) {
  const router = useRouter();

  function handleSuccess() {
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{flat ? `Edit Flat ${flat.flat_number}` : `Add Flat — ${building.name}`}</DialogTitle>
        </DialogHeader>
        <FlatForm building={building} flat={flat} onSuccess={handleSuccess} />
      </DialogContent>
    </Dialog>
  );
}
