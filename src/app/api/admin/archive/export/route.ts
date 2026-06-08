import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import { getArchiveBills, billsToCSV } from '@/services/archive/archiveService';

export async function GET(req: NextRequest) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }

  const p = req.nextUrl.searchParams;

  const rows = await getArchiveBills({
    buildingId:   p.get('building_id') ?? undefined,
    flatSearch:   p.get('flat')        ?? undefined,
    tenantSearch: p.get('tenant')      ?? undefined,
    year:         p.get('year')  ? Number(p.get('year'))  : undefined,
    month:        p.get('month') ? Number(p.get('month')) : undefined,
    status:       p.get('status') ?? undefined,
    allVersions:  p.get('all_versions') === '1',
  });

  const csv      = billsToCSV(rows);
  const filename = `bill-archive-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
