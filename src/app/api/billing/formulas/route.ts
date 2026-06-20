import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/services/auth/authService';
import { flatBillFormulaSchema } from '@/lib/validation/billing';
import { upsertFlatBillFormula, deleteFlatBillFormula, getFormulasForBuilding, validateFormulaSyntax } from '@/services/billing/formulaService';
import { successResponse, errorResponse } from '@/lib/utils/api';

const querySchema = z.object({ building_id: z.string().uuid(), cycle_id: z.string().uuid() });
const validateSchema = z.object({ formula_text: z.string().min(1) });
const deleteSchema = z.object({ id: z.string().uuid() });

export async function GET(req: NextRequest) {
  try { await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    building_id: url.searchParams.get('building_id'),
    cycle_id:    url.searchParams.get('cycle_id'),
  });
  if (!parsed.success) return NextResponse.json(errorResponse('building_id and cycle_id are required'), { status: 422 });

  const result = await getFormulasForBuilding(parsed.data.building_id, parsed.data.cycle_id);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });
  return NextResponse.json(successResponse(result.data));
}

export async function POST(req: NextRequest) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }

  const body = await req.json().catch(() => ({}));

  // Dry-run-only validation request (used by the formula editor's "Preview" action)
  const dryRun = validateSchema.safeParse(body);
  if (dryRun.success && !('flat_id' in body)) {
    const check = validateFormulaSyntax(dryRun.data.formula_text);
    return NextResponse.json(successResponse(check));
  }

  const parsed = flatBillFormulaSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json(errorResponse(parsed.error.issues[0].message), { status: 422 });

  const result = await upsertFlatBillFormula(parsed.data, admin.id);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });
  return NextResponse.json(successResponse(result.data), { status: 201 });
}

export async function DELETE(req: NextRequest) {
  try { await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }

  const body   = await req.json().catch(() => ({}));
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json(errorResponse('Invalid formula id'), { status: 422 });

  const result = await deleteFlatBillFormula(parsed.data.id);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });
  return NextResponse.json(successResponse(null));
}
