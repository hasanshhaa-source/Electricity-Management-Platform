import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import {
  getOrCreateCycleSheet,
  getSheetIdForCycle,
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

    const sheetId = sheetResult.data.sheet.id;

    // Evaluate (persists computed_value back to DB)
    const evalResult = await evaluateCycleSheet(sheetId);
    if (evalResult.error || !evalResult.data) {
      return NextResponse.json({ error: evalResult.error ?? 'Evaluation failed' }, { status: 500 });
    }

    // Re-fetch cells once (computed_value now up to date)
    const { data: cells, error: cellsErr } = await (await import('@/lib/supabase/server')).createClient()
      .then((sb) => sb.from('sheet_cells')
        .select('id, cell_name, formula_text, literal_value, computed_value, is_input, display_order')
        .eq('sheet_id', sheetId)
        .order('display_order', { ascending: true, nullsFirst: false }));
    if (cellsErr) return NextResponse.json({ error: cellsErr.message }, { status: 500 });

    return NextResponse.json({
      data: {
        sheet:   sheetResult.data.sheet,
        cells:   cells ?? [],
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

    const sheetIdResult = await getSheetIdForCycle(cycleId);
    if (sheetIdResult.error || !sheetIdResult.data) {
      return NextResponse.json({ error: sheetIdResult.error ?? 'Sheet not found' }, { status: 404 });
    }
    const sheetId = sheetIdResult.data;

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
