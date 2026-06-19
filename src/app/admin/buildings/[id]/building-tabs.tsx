'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FlatStatusBadge } from '@/components/shared/status-badge';
import { MeterTypeBadge } from '@/components/shared/meter-type-badge';
import { BuildingForm } from '@/components/admin/building-form';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FlatFormDialog } from './flat-form-dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Zap } from 'lucide-react';
import type { Building, Flat, Meter } from '@/types';

interface BuildingTabsProps {
  building: Building;
  flats: Flat[];
  meters: Meter[];
}

export function BuildingTabs({ building, flats, meters }: BuildingTabsProps) {
  const router = useRouter();
  const [tab, setTab] = useState('flats');
  const [newFlatOpen, setNewFlatOpen] = useState(false);
  const [deleteFlat, setDeleteFlat] = useState<Flat | null>(null);
  const [deletingFlat, setDeletingFlat] = useState(false);
  const [toggleLoading, setToggleLoading] = useState(false);

  async function handleDeleteFlat() {
    if (!deleteFlat) return;
    setDeletingFlat(true);
    await fetch(`/api/flats/${deleteFlat.id}`, { method: 'DELETE' });
    setDeleteFlat(null);
    setDeletingFlat(false);
    router.refresh();
  }

  async function handleToggleBuilding() {
    setToggleLoading(true);
    await fetch(`/api/buildings/${building.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !building.is_active }),
    });
    setToggleLoading(false);
    router.refresh();
  }

  return (
    <>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="flats">Flats ({flats.length})</TabsTrigger>
          <TabsTrigger value="meters">Meters ({meters.length})</TabsTrigger>
          <TabsTrigger value="settings">Building Settings</TabsTrigger>
        </TabsList>

        {/* FLATS TAB */}
        <TabsContent value="flats">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Flats</CardTitle>
              <Button size="sm" onClick={() => setNewFlatOpen(true)}>
                <Plus className="h-4 w-4" />Add Flat
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {flats.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-500">
                  No flats yet.{' '}
                  <button onClick={() => setNewFlatOpen(true)} className="text-blue-600 hover:underline">
                    Add the first flat
                  </button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Flat No.</TableHead>
                      <TableHead>Floor</TableHead>
                      <TableHead>Area</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {flats.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="font-semibold">{f.flat_number}</TableCell>
                        <TableCell>{f.floor != null ? `Floor ${f.floor}` : '—'}</TableCell>
                        <TableCell>{f.area_sqm != null ? `${f.area_sqm} m²` : '—'}</TableCell>
                        <TableCell><FlatStatusBadge status={f.status} /></TableCell>
                        <TableCell className="text-xs text-gray-500 max-w-[150px] truncate">{f.notes ?? '—'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button asChild variant="ghost" size="icon">
                              <Link href={`/admin/flats/${f.id}`}><Pencil className="h-4 w-4" /></Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-400 hover:text-red-600"
                              onClick={() => setDeleteFlat(f)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* METERS TAB */}
        <TabsContent value="meters">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Electricity Meters</CardTitle>
              <Button asChild size="sm">
                <Link href={`/admin/meters/new?building=${building.id}`}>
                  <Plus className="h-4 w-4" />Add Meter
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {meters.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-500">
                  No meters yet.{' '}
                  <Link href={`/admin/meters/new?building=${building.id}`} className="text-blue-600 hover:underline">
                    Add the first meter
                  </Link>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Meter No.</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {meters.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-mono font-semibold">{m.meter_number}</TableCell>
                        <TableCell><MeterTypeBadge type={m.meter_type} /></TableCell>
                        <TableCell>{m.unit}</TableCell>
                        <TableCell className="text-sm text-gray-500 max-w-[150px] truncate">{m.description ?? '—'}</TableCell>
                        <TableCell><Badge variant={m.is_active ? 'success' : 'secondary'}>{m.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                        <TableCell className="text-right">
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/admin/meters/${m.id}`}>
                              {m.meter_type === 'shared' ? 'Allocations' : 'Link Flat'}
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SETTINGS TAB */}
        <TabsContent value="settings">
          <div className="space-y-4">
            <BuildingForm building={building} />
            <Card className="max-w-2xl border-amber-200 bg-amber-50">
              <CardContent className="p-6">
                <h3 className="font-semibold text-amber-800">Danger Zone</h3>
                <p className="mt-1 text-sm text-amber-700">
                  {building.is_active
                    ? 'Deactivating this building will hide it from tenant selection but preserve all data.'
                    : 'Reactivating will make this building visible again.'}
                </p>
                <Button
                  variant={building.is_active ? 'warning' : 'success'}
                  size="sm"
                  className="mt-3"
                  onClick={handleToggleBuilding}
                  loading={toggleLoading}
                >
                  {building.is_active ? 'Deactivate Building' : 'Reactivate Building'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <FlatFormDialog
        open={newFlatOpen}
        onOpenChange={setNewFlatOpen}
        building={building}
      />

      <ConfirmDialog
        open={!!deleteFlat}
        onOpenChange={(o) => !o && setDeleteFlat(null)}
        title="Delete Flat"
        description={`Delete Flat ${deleteFlat?.flat_number}? This cannot be undone if there is no active tenancy.`}
        confirmLabel="Delete"
        loading={deletingFlat}
        onConfirm={handleDeleteFlat}
      />
    </>
  );
}
