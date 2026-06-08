/**
 * Access-control tests.
 * Verifies role-based access enforcement at the API handler level.
 * Calls Next.js route handlers directly with mock Request objects.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── All mocks at top level (required by vitest hoisting) ─────────────────────

vi.mock('@/services/auth/authService', () => ({
  requireAdmin:    vi.fn(),
  requireTenant:   vi.fn(),
  getCurrentUser:  vi.fn(),
}));

vi.mock('@/services/archive/archiveService', () => ({
  getArchiveBills: vi.fn(() => Promise.resolve([])),
  billsToCSV:      vi.fn(() => 'header\n'),
}));

vi.mock('@/services/tenant/tenancyService', () => ({
  getAllTenancies:  vi.fn(() => Promise.resolve({ data: [], error: null })),
  requestTenancy:  vi.fn(),
}));

vi.mock('@/services/settings/systemSettingsService', () => ({
  getSystemSettings: vi.fn(() => Promise.resolve({
    id: '550e8400-e29b-41d4-a716-446655440099',
    allow_self_registration: true,
    require_admin_approval:  true,
    allowed_payment_methods: ['cash', 'bank_transfer', 'stc_pay', 'online', 'other'],
    require_payment_reference: false,
    allow_partial_payments:  true,
    default_currency:        'SAR',
    timezone:                'Asia/Riyadh',
    default_language:        'en',
    default_diff_method:     'proportional',
    default_due_date_days:   14,
    decimal_places:          2,
    allow_manual_override:   true,
    updated_at:              '2025-01-01',
  })),
  updateSystemSettings: vi.fn(),
}));

vi.mock('@/services/billing/paymentService', () => ({
  recordPayment:      vi.fn(() => Promise.resolve({ data: { payment: { id: 'p1' }, bill: {} }, error: null })),
  getPaymentsForBill: vi.fn(() => Promise.resolve({ data: [], error: null })),
}));

vi.mock('@/services/notification/notificationSettings', () => ({
  getNotificationSettings: vi.fn(() => Promise.resolve({ payment_confirmed_enabled: false })),
}));

vi.mock('@/services/notification/notificationService', () => ({
  notifyPaymentConfirmed: vi.fn(),
}));

vi.mock('@/services/audit/auditService', () => ({
  logAudit: vi.fn(() => Promise.resolve()),
}));

// Full query-builder chain mock
function makeQueryBuilder(data: unknown = null) {
  const builder: Record<string, unknown> = {};
  const methods = ['select','eq','neq','in','is','gte','lte','order','limit','insert','update','delete','ilike','or','not','filter','range','single'];
  for (const m of methods) builder[m] = vi.fn(() => builder);
  builder['maybeSingle'] = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder['single']      = vi.fn(() => Promise.resolve({ data, error: null }));
  builder['then']        = vi.fn((resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: Array.isArray(data) ? data : data ? [data] : [], error: null }).then(resolve),
  );
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({
    from: vi.fn(() => makeQueryBuilder()),
    auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })) },
  })),
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => makeQueryBuilder({ allow_self_registration: true })),
  })),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => makeQueryBuilder()),
  })),
}));

// ─── Setup ────────────────────────────────────────────────────────────────────

import { requireAdmin, requireTenant, getCurrentUser } from '@/services/auth/authService';
import { getSystemSettings } from '@/services/settings/systemSettingsService';

const mockRequireAdmin   = vi.mocked(requireAdmin);
const mockRequireTenant  = vi.mocked(requireTenant);
const mockGetCurrentUser = vi.mocked(getCurrentUser);

const ADMIN_USER  = { id: 'admin-1',  role: 'admin'  as const, email: 'admin@test.com',  full_name: 'Admin' };
const TENANT_USER = { id: 'tenant-1', role: 'tenant' as const, email: 'tenant@test.com', full_name: 'Tenant' };

function makeReq(method = 'GET', body?: unknown, url = 'http://localhost/api/test') {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ─── Buildings route ──────────────────────────────────────────────────────────

describe('GET /api/buildings — admin only', async () => {
  const { GET } = await import('@/app/api/buildings/route');

  it('returns 403 when not authenticated', async () => {
    mockRequireAdmin.mockRejectedValueOnce(new Error('Unauthorized'));
    const res = await GET(makeReq() as any);
    expect(res.status).toBe(403);
  });

  it('returns 200 when admin is authenticated', async () => {
    mockRequireAdmin.mockResolvedValueOnce(ADMIN_USER);
    const res = await GET(makeReq() as any);
    expect(res.status).toBe(200);
  });
});

// ─── Tenants route ────────────────────────────────────────────────────────────

describe('GET /api/tenants — admin only', async () => {
  const { GET } = await import('@/app/api/tenants/route');

  it('returns 403 for unauthenticated request', async () => {
    mockRequireAdmin.mockRejectedValueOnce(new Error('Unauthorized'));
    const res = await GET(makeReq() as any);
    expect(res.status).toBe(403);
  });
});

// ─── Billing cycles ───────────────────────────────────────────────────────────

describe('GET /api/billing/cycles — admin only', async () => {
  const { GET } = await import('@/app/api/billing/cycles/route');

  it('blocks non-admin', async () => {
    mockRequireAdmin.mockRejectedValueOnce(new Error('Forbidden'));
    const res = await GET(makeReq() as any);
    expect(res.status).toBe(403);
  });
});

// ─── Archive export ───────────────────────────────────────────────────────────

describe('GET /api/admin/archive/export — admin only', async () => {
  const { GET } = await import('@/app/api/admin/archive/export/route');

  it('returns 403 for unauthenticated', async () => {
    mockRequireAdmin.mockRejectedValueOnce(new Error('Forbidden'));
    const res = await GET(makeReq() as any);
    expect(res.status).toBe(403);
  });
});

// ─── Complaints — tenant can only submit for their own flat ──────────────────

describe('POST /api/complaints — tenant isolation', async () => {
  const { POST } = await import('@/app/api/complaints/route');

  it('returns 401 if not logged in', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null);
    const res = await POST(makeReq('POST', {
      flat_id:     'some-flat',
      type:        'complaint',
      subject:     'Test',
      description: 'Description here that is long enough',
    }) as any);
    expect(res.status).toBe(401);
  });

  it('returns 403 if logged in as admin (not tenant)', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(ADMIN_USER);
    const res = await POST(makeReq('POST', {
      flat_id:     'some-flat',
      type:        'complaint',
      subject:     'Test',
      description: 'Description here that is long enough',
    }) as any);
    expect(res.status).toBe(403);
  });
});

// ─── Tenancies — tenant blocked from listing all ─────────────────────────────

describe('GET /api/tenancies — admin only', async () => {
  const { GET } = await import('@/app/api/tenancies/route');

  it('returns 403 when tenant tries to list all tenancies', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(TENANT_USER);
    const res = await GET(makeReq('GET', undefined, 'http://localhost/api/tenancies') as any);
    expect(res.status).toBe(403);
  });

  it('allows admin to list tenancies', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(ADMIN_USER);
    const res = await GET(makeReq('GET', undefined, 'http://localhost/api/tenancies') as any);
    expect(res.status).toBe(200);
  });
});

// ─── System settings — admin only ────────────────────────────────────────────

describe('GET /api/admin/system-settings — admin only', async () => {
  const { GET } = await import('@/app/api/admin/system-settings/route');

  it('returns 403 for non-admin', async () => {
    mockRequireAdmin.mockRejectedValueOnce(new Error('Forbidden'));
    const res = await GET(makeReq() as any);
    expect(res.status).toBe(403);
  });

  it('returns settings for admin', async () => {
    mockRequireAdmin.mockResolvedValueOnce(ADMIN_USER);
    const res = await GET(makeReq() as any);
    expect(res.status).toBe(200);
  });
});

// ─── Self-registration gate ───────────────────────────────────────────────────

describe('POST /api/auth/register — self-registration gate', async () => {
  it('returns 403 when self-registration is disabled', async () => {
    vi.mocked(getSystemSettings).mockResolvedValueOnce({
      id: '550e8400-e29b-41d4-a716-446655440099',
      allow_self_registration:   false,
      require_admin_approval:    true,
      allowed_payment_methods:   ['cash'],
      require_payment_reference: false,
      allow_partial_payments:    true,
      default_currency:          'SAR',
      timezone:                  'Asia/Riyadh',
      default_language:          'en',
      default_diff_method:       'proportional',
      default_due_date_days:     14,
      decimal_places:            2,
      allow_manual_override:     true,
      updated_at:                '2025-01-01',
    });

    const { POST } = await import('@/app/api/auth/register/route');
    const res = await POST(makeReq('POST', {
      auth_id:   '550e8400-e29b-41d4-a716-446655440000',
      email:     'new@test.com',
      full_name: 'New User',
    }) as any);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/disabled/i);
  });
});

// ─── Payment route — admin only ───────────────────────────────────────────────

describe('POST /api/billing/payments — admin only', async () => {
  it('returns 403 for non-admin', async () => {
    mockRequireAdmin.mockRejectedValueOnce(new Error('Forbidden'));
    const { POST } = await import('@/app/api/billing/payments/route');
    const res = await POST(makeReq('POST', {
      bill_id:        '550e8400-e29b-41d4-a716-446655440001',
      amount:         100,
      payment_date:   '2025-02-01',
      payment_method: 'cash',
    }) as any);
    expect(res.status).toBe(403);
  });
});
