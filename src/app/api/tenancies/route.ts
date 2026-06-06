import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { requestTenancy, getAllTenancies } from '@/services/tenant/tenancyService';
import { tenancyRequestSchema } from '@/lib/validation/tenancy';
import { successResponse, errorResponse } from '@/lib/utils/api';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json(errorResponse('Unauthorized'), { status: 401 });
  if (user.role !== 'admin') return NextResponse.json(errorResponse('Forbidden'), { status: 403 });

  const url = new URL(request.url);
  const status = url.searchParams.get('status') ?? undefined;

  const result = await getAllTenancies({ status });
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 500 });
  return NextResponse.json(successResponse(result.data));
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json(errorResponse('Unauthorized'), { status: 401 });
  if (user.role !== 'tenant') return NextResponse.json(errorResponse('Only tenants can request flats'), { status: 403 });

  const body = await request.json();
  const parsed = tenancyRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(errorResponse(parsed.error.issues[0].message), { status: 400 });
  }

  const result = await requestTenancy(parsed.data, user.id);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });
  return NextResponse.json(successResponse(result.data), { status: 201 });
}
