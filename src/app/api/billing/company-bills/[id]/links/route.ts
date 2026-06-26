import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/services/auth/authService';
import { getCompanyBillById, linkBillToMeters, setBillFlatTarget } from '@/services/billing/companyBillService';
import { logAudit } from '@/services/audit/auditService';
import { successResponse, errorResponse } from '@/lib/utils/api';

type Params = { params: Promise<{ id: string }> };

const linkSchema = z.object({
  meter_ids: z.array(z.string().uuid()).optional(),
  flat_id:   z.string().uuid().nullable().optional(),
});

export async function PUT(req: NextRequest, { params }: Params) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }

  const { id } = await params;
  const existing = await getCompanyBillById(id);
  if (existing.error || !existing.data) return NextResponse.json(errorResponse('Bill not found'), { status: 404 });

  const body   = await req.json();
  const parsed = linkSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json(errorResponse(parsed.error.issues[0].message), { status: 400 });

  if (parsed.data.flat_id !== undefined) {
    const result = await setBillFlatTarget(id, parsed.data.flat_id);
    if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });
  }

  if (parsed.data.meter_ids !== undefined) {
    const result = await linkBillToMeters(id, parsed.data.meter_ids);
    if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });
  }

  await logAudit({
    entity_type: 'electricity_company_bills',
    entity_id:   id,
    action:      'COMPANY_BILL_LINKS_UPDATED',
    actor_id:    admin.id,
    actor_role:  'admin',
    new_data:    parsed.data as any,
  });

  return NextResponse.json(successResponse(null));
}
