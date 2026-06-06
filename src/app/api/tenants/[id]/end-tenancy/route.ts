import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import { endTenancy } from '@/services/tenant/tenancyService';
import { endTenancySchema } from '@/lib/validation/tenant';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/services/audit/auditService';
import { successResponse, errorResponse } from '@/lib/utils/api';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }

  const { id: userId } = await params;
  const body = await req.json();
  const parsed = endTenancySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json(errorResponse(parsed.error.issues[0].message), { status: 400 });

  // Find active tenancy for this user
  const supabase = await createClient();
  const { data: tenancy } = await supabase
    .from('tenancies').select('id').eq('user_id', userId).eq('status', 'active').single();

  if (!tenancy) return NextResponse.json(errorResponse('No active tenancy found for this user'), { status: 404 });

  const result = await endTenancy(tenancy.id, admin.id, parsed.data.end_date, parsed.data.notes);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });

  await logAudit({ entity_type: 'tenancies', entity_id: tenancy.id, action: 'TENANCY_END', actor_id: admin.id, actor_role: 'admin', new_data: parsed.data as any });
  return NextResponse.json(successResponse(result.data));
}
