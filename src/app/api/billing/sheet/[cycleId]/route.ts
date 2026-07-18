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

    // Auto-populate if empty (no-op if already populated — bill sync handled below)
    await autoPopulateSheet(cycleId, cycle.building_id, cycle.period_year, cycle.period_month);

    const sheetId = sheetResult.data.sheet.id;

    // Always sync company bill cells so they appear in the reference panel.
    // Query by cycle_id first (most specific), fall back to building + period.
    {
      const { createAdminClient } = await import('@/lib/supabase/server');
      const sb = await createAdminClient();
      let { data: bills } = await sb
        .from('electricity_company_bills')
        .select('bill_number, total_amount, total_units')
        .eq('cycle_id', cycleId)
        .is('deleted_at', null);
      // Fallback: match by building + period (bills imported without a cycle link)
      if (!bills || bills.length === 0) {
        const { data: fallbackBills } = await sb
          .from('electricity_company_bills')
          .select('bill_number, total_amount, total_units')
          .eq('building_id', cycle.building_id)
          .eq('period_year', cycle.period_year)
          .eq('period_month', cycle.period_month)
          .is('deleted_at', null);
        bills = fallbackBills;
      }
      if (bills && bills.length > 0) {
        // Sync raw bill input cells (always update so edited bill values are reflected)
        const billCells = bills.flatMap((b: any) => [
          { sheet_id: sheetId, cell_name: `bill:${b.bill_number}:cost`,        literal_value: Number(b.total_amount), formula_text: null, computed_value: null, is_input: true },
          { sheet_id: sheetId, cell_name: `bill:${b.bill_number}:consumption`, literal_value: Number(b.total_units),  formula_text: null, computed_value: null, is_input: true },
        ]);
        const { error: billUpsertErr } = await sb.from('sheet_cells').upsert(billCells, { onConflict: 'sheet_id,cell_name', ignoreDuplicates: false });
        if (billUpsertErr) return NextResponse.json({ error: `Failed to sync bill cells: ${billUpsertErr.message}` }, { status: 500 });

        // Upsert pool summary formula cells (always keep formula in sync with actual bill list)
        const billNums = bills.map((b: any) => b.bill_number);
        const poolCells = [
          { sheet_id: sheetId, cell_name: 'pool:total_cost',        formula_text: billNums.map((n: string) => `bill:${n}:cost`).join(' + '),        literal_value: null, computed_value: null, is_input: false },
          { sheet_id: sheetId, cell_name: 'pool:total_consumption', formula_text: billNums.map((n: string) => `bill:${n}:consumption`).join(' + '), literal_value: null, computed_value: null, is_input: false },
        ];
        const { error: poolUpsertErr } = await sb.from('sheet_cells').upsert(poolCells, { onConflict: 'sheet_id,cell_name', ignoreDuplicates: false });
        if (poolUpsertErr) return NextResponse.json({ error: `Failed to sync pool cells: ${poolUpsertErr.message}` }, { status: 500 });
      }
    }

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

    // Return updated cells alongside results so the client can update state without a second GET
    const sb = await (await import('@/lib/supabase/server')).createClient();
    const { data: cells } = await sb
      .from('sheet_cells')
      .select('id, cell_name, formula_text, literal_value, computed_value, is_input, display_order')
      .eq('sheet_id', sheetId)
      .order('display_order', { ascending: true, nullsFirst: false });

    return NextResponse.json({ data: { cells: cells ?? [], results: evalResult.data.results, errors: evalResult.data.errors } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Unexpected error' }, { status: 500 });
  }
}
