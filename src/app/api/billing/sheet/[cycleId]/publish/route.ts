import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import { getOrCreateCycleSheet, publishSheet } from '@/services/billing/sheetService';

type Params = { params: Promise<{ cycleId: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    await requireAdmin();
    const { cycleId } = await params;

    const sheetResult = await getOrCreateCycleSheet(cycleId);
    if (sheetResult.error || !sheetResult.data) {
      return NextResponse.json({ error: sheetResult.error ?? 'Sheet not found' }, { status: 404 });
    }

    const result = await publishSheet(sheetResult.data.sheet.id);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });

    return NextResponse.json({ data: null });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Unexpected error' }, { status: 500 });
  }
}
