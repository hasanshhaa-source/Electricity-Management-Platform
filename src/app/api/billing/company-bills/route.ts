import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import { getBillsForCycle, createCompanyBill } from '@/services/billing/companyBillService';
import { companyBillSchema } from '@/lib/validation/billing';
import { logAudit } from '@/services/audit/auditService';
import { successResponse, errorResponse } from '@/lib/utils/api';

export async function GET(req: NextRequest) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }

  const { searchParams } = req.nextUrl;
  const buildingId = searchParams.get('building_id');
  const year       = parseInt(searchParams.get('year') ?? '', 10);
  const month      = parseInt(searchParams.get('month') ?? '', 10);

  if (!buildingId || isNaN(year) || isNaN(month)) {
    return NextResponse.json(errorResponse('building_id, year, and month are required'), { status: 400 });
  }

  const result = await getBillsForCycle(buildingId, year, month);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });
  return NextResponse.json(successResponse(result.data));
}

export async function POST(req: NextRequest) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }

  const body   = await req.json();
  const parsed = companyBillSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json(errorResponse(parsed.error.issues[0].message), { status: 400 });

  const result = await createCompanyBill(parsed.data, admin.id);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });

  await logAudit({
    entity_type: 'electricity_company_bills',
    entity_id:   result.data!.id,
    action:      'COMPANY_BILL_CREATED',
    actor_id:    admin.id,
    actor_role:  'admin',
    new_data:    parsed.data as any,
  });

  return NextResponse.json(successResponse(result.data), { status: 201 });
}
