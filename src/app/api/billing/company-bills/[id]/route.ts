import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import { getCompanyBillById, updateCompanyBill, deleteCompanyBill } from '@/services/billing/companyBillService';
import { companyBillSchema } from '@/lib/validation/billing';
import { logAudit } from '@/services/audit/auditService';
import { successResponse, errorResponse } from '@/lib/utils/api';

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }

  const { id } = await params;
  const existing = await getCompanyBillById(id);
  if (existing.error || !existing.data) return NextResponse.json(errorResponse('Bill not found'), { status: 404 });

  const body   = await req.json();
  const parsed = companyBillSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json(errorResponse(parsed.error.issues[0].message), { status: 400 });

  const result = await updateCompanyBill(id, parsed.data, admin.id);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });

  await logAudit({
    entity_type: 'electricity_company_bills',
    entity_id:   id,
    action:      'COMPANY_BILL_UPDATED',
    actor_id:    admin.id,
    actor_role:  'admin',
    old_data:    existing.data as any,
    new_data:    parsed.data as any,
  });

  return NextResponse.json(successResponse(result.data));
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }

  const { id } = await params;
  const existing = await getCompanyBillById(id);
  if (existing.error || !existing.data) return NextResponse.json(errorResponse('Bill not found'), { status: 404 });

  const result = await deleteCompanyBill(id);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });

  await logAudit({
    entity_type: 'electricity_company_bills',
    entity_id:   id,
    action:      'COMPANY_BILL_DELETED',
    actor_id:    admin.id,
    actor_role:  'admin',
    old_data:    existing.data as any,
  });

  return NextResponse.json(successResponse(null));
}
