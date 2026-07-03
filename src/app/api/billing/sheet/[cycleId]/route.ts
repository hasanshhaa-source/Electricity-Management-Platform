import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import {
  getOrCreateCycleSheet,
  autoPopulateSheet,
  evaluateCycleSheet,
  upsertCell,
} from '@/services/billing/sheetService';
import { getCycleById } from '@/services/billing/cycleService';

type Params = { params: Promise<{ cycleId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireAdmin();
    const { cycleId } = await params;

    // Resolve cycle → building/period info for auto-population
    const cycleResult = await getCycleById(cycleId);
    if (cycleResult.error || !cycleResult.data) {
      return NextResponse.json({ error: 'Cycle not found' }, { status: 404 });
    }
    const cycle = cycleResult.data;

    const sheetResult = await getOrCreateCycleSheet(cycleId);
    if (sheetResult.error || !sheetResult.data) {
      return NextResponse.json({ error: sheetResult.error ?? 'Failed to get sheet' }, { status: 500 });
    }

    // Auto-populate if empty (no-op if already populated)
    await autoPopulateSheet(cycleId, cycle.building_id, cycle.period_year, cycle.period_month);

    // Evaluate and return
    const evalResult = await evaluateCycleSheet(sheetResult.data.sheet.id);
    if (evalResult.error || !evalResult.data) {
      return NextResponse.json({ error: evalResult.error ?? 'Evaluation failed' }, { status: 500 });
    }

    // Re-fetch cells after evaluation so computed_value is up to date
    const refreshed = await getOrCreateCycleSheet(cycleId);

    return NextResponse.json({
      data: {
        sheet:   refreshed.data?.sheet,
        cells:   refreshed.data?.cells ?? [],
        results: evalResult.data.results,
        errors:  evalResult.data.errors,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Unexpected error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requireAdmin();
    const { cycleId } = await params;
    const body = await req.json();
    const { cellName, formulaText, literalValue, displayOrder } = body as {
      cellName:     string;
      formulaText?: string | null;
      literalValue?: number | null;
      displayOrder?: number;
    };

    if (!cellName) return NextResponse.json({ error: 'cellName is required' }, { status: 400 });

    const sheetResult = await getOrCreateCycleSheet(cycleId);
    if (sheetResult.error || !sheetResult.data) {
      return NextResponse.json({ error: sheetResult.error ?? 'Sheet not found' }, { status: 404 });
    }
    const sheetId = sheetResult.data.sheet.id;

    const upsertResult = await upsertCell(sheetId, cellName, { formulaText, literalValue, displayOrder });
    if (upsertResult.error) return NextResponse.json({ error: upsertResult.error }, { status: 400 });

    const evalResult = await evaluateCycleSheet(sheetId);
    if (evalResult.error || !evalResult.data) {
      return NextResponse.json({ error: evalResult.error ?? 'Evaluation failed' }, { status: 500 });
    }

    return NextResponse.json({ data: { results: evalResult.data.results, errors: evalResult.data.errors } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Unexpected error' }, { status: 500 });
  }
}
