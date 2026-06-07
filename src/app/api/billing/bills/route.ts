import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import { getBillsAdmin } from '@/services/billing/paymentService';
import { successResponse, errorResponse } from '@/lib/utils/api';

export async function GET(req: NextRequest) {
  try { await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }

  const p = req.nextUrl.searchParams;
  const buildingId  = p.get('building_id')   ?? undefined;
  const periodYear  = p.get('year')  ? parseInt(p.get('year')!)  : undefined;
  const periodMonth = p.get('month') ? parseInt(p.get('month')!) : undefined;
  const status      = p.get('status')  ?? undefined;
  const search      = p.get('search')  ?? undefined;

  const result = await getBillsAdmin({ buildingId, periodYear, periodMonth, status, search });
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });
  return NextResponse.json(successResponse(result.data));
}
