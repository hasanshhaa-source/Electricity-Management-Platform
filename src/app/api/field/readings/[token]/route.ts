import { NextRequest, NextResponse } from 'next/server';
import { getCycleByFieldToken, submitFieldReading } from '@/services/billing/fieldLinkService';
import { meterReadingSchema } from '@/lib/validation/billing';
import { successResponse, errorResponse } from '@/lib/utils/api';

type Params = { params: Promise<{ token: string }> };

// Intentionally no requireAdmin/auth here — access is gated entirely by the
// random token plus the field_token_enabled flag checked in the service layer.

export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  const result = await getCycleByFieldToken(token);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 404 });
  return NextResponse.json(successResponse(result.data));
}

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const body = await req.json();
  const parsed = meterReadingSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json(errorResponse(parsed.error.issues[0].message), { status: 400 });

  const result = await submitFieldReading(token, parsed.data);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });
  return NextResponse.json(successResponse(result.data), { status: 201 });
}
