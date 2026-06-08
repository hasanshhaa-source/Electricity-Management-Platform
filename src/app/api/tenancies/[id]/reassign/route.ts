import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import { reassignTenancy } from '@/services/tenant/tenancyService';
import { logAudit } from '@/services/audit/auditService';
import { successResponse, errorResponse } from '@/lib/utils/api';
import { z } from 'zod';

const schema = z.object({ new_flat_id: z.string().uuid() });
type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }
  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json(errorResponse(parsed.error.issues[0].message), { status: 400 });

  const result = await reassignTenancy(id, parsed.data.new_flat_id, admin.id);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });

  await logAudit({
    entity_type: 'tenancies',
    entity_id: id,
    action: 'TENANCY_REASSIGN',
    actor_id: admin.id,
    actor_role: 'admin',
    new_data: { new_flat_id: parsed.data.new_flat_id },
  });
  return NextResponse.json(successResponse(result.data));
}
