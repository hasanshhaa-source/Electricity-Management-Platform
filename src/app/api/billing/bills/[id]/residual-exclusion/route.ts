import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/services/auth/authService';
import { setBillResidualExclusion } from '@/services/billing/billingCalculationService';
import { successResponse, errorResponse } from '@/lib/utils/api';

type Params = { params: Promise<{ id: string }> };

const schema = z.object({ excluded: z.boolean() });

export async function PATCH(req: NextRequest, { params }: Params) {
  try { await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }

  const { id } = await params;
  const body   = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json(errorResponse('Invalid input'), { status: 422 });

  const result = await setBillResidualExclusion(id, parsed.data.excluded);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });
  return NextResponse.json(successResponse(null));
}
