import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import { getSheetIdForCycle, evaluateCycleSheet } from '@/services/billing/sheetService';
import { createClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ cycleId: string }> };

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    await requireAdmin();
    const { cycleId } = await params;
    const { cellName } = await req.json() as { cellName: string };
    if (!cellName) return NextResponse.json({ error: 'cellName is required' }, { status: 400 });

    const sheetIdResult = await getSheetIdForCycle(cycleId);
    if (sheetIdResult.error || !sheetIdResult.data) {
      return NextResponse.json({ error: 'Sheet not found' }, { status: 404 });
    }
    const sheetId = sheetIdResult.data;

    const supabase = await createClient();
    const { error } = await supabase
      .from('sheet_cells')
      .delete()
      .eq('sheet_id', sheetId)
      .eq('cell_name', cellName);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const evalResult = await evaluateCycleSheet(sheetId);

    const { data: cells } = await supabase
      .from('sheet_cells')
      .select('id, cell_name, formula_text, literal_value, computed_value, is_input, display_order')
      .eq('sheet_id', sheetId)
      .order('display_order', { ascending: true, nullsFirst: false });

    return NextResponse.json({
      data: {
        cells: cells ?? [],
        results: evalResult.data?.results ?? {},
        errors:  evalResult.data?.errors  ?? {},
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Unexpected error' }, { status: 500 });
  }
}
