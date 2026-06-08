-- ─── Sprint 14: Demo seed data for 2 buildings ──────────────────────────────
-- Covers all 14 test scenarios from Sprint 14.
-- Run after all migrations. Safe to re-run (uses DO $$ blocks with ON CONFLICT).
--
-- Building 1 (Al-Noor Residences): individual meters per flat
-- Building 2 (Riyadh Heights):     shared meter split 60/40
--
-- Passwords for all demo users: Demo@1234
-- Admin:      admin@demo.local
-- Tenants:    tenant101@demo.local, tenant102@demo.local,
--             tenant201@demo.local, tenant202@demo.local

-- ─── UUIDs (stable, deterministic) ──────────────────────────────────────────
-- admin user
-- b0-admin-user-000000000000000000001
-- buildings
-- b0-building-a-000000000000000000001  Al-Noor Residences
-- b0-building-b-000000000000000000002  Riyadh Heights
-- flats
-- f0-flat-101-0000000000000000000001
-- f0-flat-102-0000000000000000000002
-- f0-flat-201-0000000000000000000003
-- f0-flat-202-0000000000000000000004
-- meters
-- m0-meter-a1-0000000000000000000001   Building A, Flat 101 individual
-- m0-meter-a2-0000000000000000000002   Building A, Flat 102 individual
-- m0-meter-b1-0000000000000000000003   Building B, shared 60/40
-- tariff rates
-- tr-tariff-a-0000000000000000000001
-- tr-tariff-b-0000000000000000000002
-- tenant users
-- u0-tenant-101-000000000000000000001
-- u0-tenant-102-000000000000000000002
-- u0-tenant-201-000000000000000000003
-- u0-tenant-202-000000000000000000004
-- tenancies
-- tn-tenancy-101-0000000000000000001
-- tn-tenancy-102-0000000000000000002
-- tn-tenancy-201-0000000000000000003
-- tn-tenancy-202-0000000000000000004
-- billing cycles (January 2025)
-- bc-cycle-a-jan25-000000000000000001
-- bc-cycle-b-jan25-000000000000000002
-- company bills
-- cb-company-a-jan25-0000000000000001
-- cb-company-b-jan25-0000000000000002
-- flat_bill meter assignments
-- fma-101-a1-0000000000000000000001
-- fma-102-a2-0000000000000000000002
-- fma-201-b1-0000000000000000000003
-- fma-202-b1-0000000000000000000004

BEGIN;

-- ─── 1. Admin user ────────────────────────────────────────────────────────────
INSERT INTO users (id, auth_id, email, full_name, role, is_active)
VALUES (
  'b0ad1111-0000-0000-0000-000000000001',
  'b0ad1111-0000-0000-0000-000000000001',
  'admin@demo.local',
  'Demo Admin',
  'admin',
  true
)
ON CONFLICT (id) DO NOTHING;

-- ─── 2. Buildings ────────────────────────────────────────────────────────────
INSERT INTO buildings (id, name, address, city, country, currency, billing_day, is_active)
VALUES
  ('b0b11111-0000-0000-0000-000000000001',
   'Al-Noor Residences',
   '14 King Fahd Road',
   'Riyadh',
   'SA',
   'SAR',
   25,
   true),
  ('b0b22222-0000-0000-0000-000000000002',
   'Riyadh Heights',
   '7 Olaya Street',
   'Riyadh',
   'SA',
   'SAR',
   25,
   true)
ON CONFLICT (id) DO NOTHING;

-- ─── 3. Flats ────────────────────────────────────────────────────────────────
INSERT INTO flats (id, building_id, flat_number, floor, occupancy_status, is_active)
VALUES
  ('f0f11111-0000-0000-0000-000000000001', 'b0b11111-0000-0000-0000-000000000001', '101', 1, 'occupied', true),
  ('f0f22222-0000-0000-0000-000000000002', 'b0b11111-0000-0000-0000-000000000001', '102', 1, 'occupied', true),
  ('f0f33333-0000-0000-0000-000000000003', 'b0b22222-0000-0000-0000-000000000002', '201', 2, 'occupied', true),
  ('f0f44444-0000-0000-0000-000000000004', 'b0b22222-0000-0000-0000-000000000002', '202', 2, 'occupied', true)
ON CONFLICT (id) DO NOTHING;

-- ─── 4. Meters ───────────────────────────────────────────────────────────────
INSERT INTO meters (id, building_id, meter_number, meter_type, unit, is_active)
VALUES
  -- Building A: individual meters per flat
  ('m0m11111-0000-0000-0000-000000000001', 'b0b11111-0000-0000-0000-000000000001', 'M-A1', 'individual', 'kWh', true),
  ('m0m22222-0000-0000-0000-000000000002', 'b0b11111-0000-0000-0000-000000000001', 'M-A2', 'individual', 'kWh', true),
  -- Building B: one shared meter for both flats (60/40 split)
  ('m0m33333-0000-0000-0000-000000000003', 'b0b22222-0000-0000-0000-000000000002', 'M-B1', 'shared',     'kWh', true)
ON CONFLICT (id) DO NOTHING;

-- ─── 5. Flat-meter assignments ────────────────────────────────────────────────
INSERT INTO flat_meter_assignments (id, meter_id, flat_id, share_percent, effective_from)
VALUES
  -- Flat 101 owns 100% of M-A1
  ('a0a11111-0000-0000-0000-000000000001', 'm0m11111-0000-0000-0000-000000000001', 'f0f11111-0000-0000-0000-000000000001', 100.00, '2024-01-01'),
  -- Flat 102 owns 100% of M-A2
  ('a0a22222-0000-0000-0000-000000000002', 'm0m22222-0000-0000-0000-000000000002', 'f0f22222-0000-0000-0000-000000000002', 100.00, '2024-01-01'),
  -- Flat 201 takes 60% of shared M-B1 (Scenario 3: 60/40)
  ('a0a33333-0000-0000-0000-000000000003', 'm0m33333-0000-0000-0000-000000000003', 'f0f33333-0000-0000-0000-000000000003',  60.00, '2024-01-01'),
  -- Flat 202 takes 40% of shared M-B1
  ('a0a44444-0000-0000-0000-000000000004', 'm0m33333-0000-0000-0000-000000000003', 'f0f44444-0000-0000-0000-000000000004',  40.00, '2024-01-01')
ON CONFLICT (id) DO NOTHING;

-- ─── 6. Tariff rates ─────────────────────────────────────────────────────────
INSERT INTO tariff_rates (id, building_id, rate_per_unit, fixed_charge, effective_from, is_current)
VALUES
  ('t0t11111-0000-0000-0000-000000000001', 'b0b11111-0000-0000-0000-000000000001', 2.00, 0.00, '2024-01-01', true),
  ('t0t22222-0000-0000-0000-000000000002', 'b0b22222-0000-0000-0000-000000000002', 2.00, 0.00, '2024-01-01', true)
ON CONFLICT (id) DO NOTHING;

-- ─── 7. Tenant users ─────────────────────────────────────────────────────────
-- Note: auth_id should match Supabase Auth users; for demo purposes we use same UUIDs.
-- Create these in Supabase Auth first, or use the register endpoint.
INSERT INTO users (id, auth_id, email, full_name, phone, role, is_active)
VALUES
  ('u0u11111-0000-0000-0000-000000000001', 'u0u11111-0000-0000-0000-000000000001', 'tenant101@demo.local', 'Ahmed Al-Rashid',  '+966500000101', 'tenant', true),
  ('u0u22222-0000-0000-0000-000000000002', 'u0u22222-0000-0000-0000-000000000002', 'tenant102@demo.local', 'Sara Al-Dosari',   '+966500000102', 'tenant', true),
  ('u0u33333-0000-0000-0000-000000000003', 'u0u33333-0000-0000-0000-000000000003', 'tenant201@demo.local', 'Khalid Al-Otaibi', '+966500000201', 'tenant', true),
  ('u0u44444-0000-0000-0000-000000000004', 'u0u44444-0000-0000-0000-000000000004', 'tenant202@demo.local', 'Noura Al-Ghamdi',  '+966500000202', 'tenant', true)
ON CONFLICT (id) DO NOTHING;

-- ─── 8. Tenancies (active) ────────────────────────────────────────────────────
INSERT INTO tenancies (id, user_id, flat_id, status, started_at)
VALUES
  ('tn111111-0000-0000-0000-000000000001', 'u0u11111-0000-0000-0000-000000000001', 'f0f11111-0000-0000-0000-000000000001', 'active', '2024-01-01'),
  ('tn222222-0000-0000-0000-000000000002', 'u0u22222-0000-0000-0000-000000000002', 'f0f22222-0000-0000-0000-000000000002', 'active', '2024-01-01'),
  ('tn333333-0000-0000-0000-000000000003', 'u0u33333-0000-0000-0000-000000000003', 'f0f33333-0000-0000-0000-000000000003', 'active', '2024-01-01'),
  ('tn444444-0000-0000-0000-000000000004', 'u0u44444-0000-0000-0000-000000000004', 'f0f44444-0000-0000-0000-000000000004', 'active', '2024-01-01')
ON CONFLICT (id) DO NOTHING;

-- ─── 9. December 2024 meter readings (opening readings for Jan 2025) ─────────
-- Used as "previous readings" when calculating January 2025 bills
INSERT INTO meter_readings (id, meter_id, reading_value, reading_date, billing_period_year, billing_period_month, reading_type, recorded_by)
VALUES
  -- M-A1 (Flat 101): opening 1200 kWh
  ('r0r11111-0000-0000-0000-000000000001', 'm0m11111-0000-0000-0000-000000000001', 1200.000, '2024-12-31', 2024, 12, 'actual', 'b0ad1111-0000-0000-0000-000000000001'),
  -- M-A2 (Flat 102): opening 800 kWh
  ('r0r22222-0000-0000-0000-000000000002', 'm0m22222-0000-0000-0000-000000000002',  800.000, '2024-12-31', 2024, 12, 'actual', 'b0ad1111-0000-0000-0000-000000000001'),
  -- M-B1 (Building B shared): opening 500 kWh
  ('r0r33333-0000-0000-0000-000000000003', 'm0m33333-0000-0000-0000-000000000003',  500.000, '2024-12-31', 2024, 12, 'actual', 'b0ad1111-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ─── 10. January 2025 meter readings ─────────────────────────────────────────
-- M-A1: 250 kWh consumed (1200 → 1450)
-- M-A2: 300 kWh consumed (800 → 1100)
-- M-B1: 400 kWh total (500 → 900) → 240 for F201, 160 for F202
INSERT INTO meter_readings (id, meter_id, reading_value, reading_date, billing_period_year, billing_period_month, reading_type, recorded_by)
VALUES
  ('r0r44444-0000-0000-0000-000000000004', 'm0m11111-0000-0000-0000-000000000001', 1450.000, '2025-01-31', 2025, 1, 'actual', 'b0ad1111-0000-0000-0000-000000000001'),
  ('r0r55555-0000-0000-0000-000000000005', 'm0m22222-0000-0000-0000-000000000002', 1100.000, '2025-01-31', 2025, 1, 'actual', 'b0ad1111-0000-0000-0000-000000000001'),
  ('r0r66666-0000-0000-0000-000000000006', 'm0m33333-0000-0000-0000-000000000003',  900.000, '2025-01-31', 2025, 1, 'actual', 'b0ad1111-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ─── 11. Billing cycles (January 2025) ───────────────────────────────────────
INSERT INTO billing_cycles (id, building_id, period_year, period_month, status, created_by)
VALUES
  ('bc111111-0000-0000-0000-000000000001', 'b0b11111-0000-0000-0000-000000000001', 2025, 1, 'issued', 'b0ad1111-0000-0000-0000-000000000001'),
  ('bc222222-0000-0000-0000-000000000002', 'b0b22222-0000-0000-0000-000000000002', 2025, 1, 'issued', 'b0ad1111-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ─── 12. Company bills (electricity authority invoices) ───────────────────────
-- Building A: SAR 1100 for 550 kWh (rate = 2.0)
-- Building B: SAR 820  for 400 kWh (rate = 2.05 — slight difference triggers distribution)
INSERT INTO electricity_company_bills (id, building_id, cycle_id, bill_number, total_amount, total_units, bill_issue_date, due_date, period_year, period_month, created_by)
VALUES
  ('cb111111-0000-0000-0000-000000000001', 'b0b11111-0000-0000-0000-000000000001', 'bc111111-0000-0000-0000-000000000001',
   'SEC-A-2025-001', 1100.00, 550, '2025-02-01', '2025-02-25', 2025, 1, 'b0ad1111-0000-0000-0000-000000000001'),
  -- Building B: SAR 820 (>800) triggers a positive difference that distributes proportionally (Scenario 5)
  ('cb222222-0000-0000-0000-000000000002', 'b0b22222-0000-0000-0000-000000000002', 'bc222222-0000-0000-0000-000000000002',
   'SEC-B-2025-001',  820.00, 400, '2025-02-01', '2025-02-25', 2025, 1, 'b0ad1111-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ─── 13. Flat bills (January 2025, calculated and issued) ─────────────────────
--
-- Building A:
--   Flat 101: 250 kWh × (1100/550) = 250 × 2.0 = SAR 500   due_date 2025-02-25
--   Flat 102: 300 kWh × 2.0 = SAR 600                       due_date 2025-02-25
--
-- Building B (rate = 820/400 = 2.05):
--   Flat 201: 240 kWh × 2.05 = 492 base
--             difference = 820 - (492 + 328) = 0 (since rate absorbed it)
--             + SAR 120 previous unpaid (Scenario 4)  → total SAR 612
--   Flat 202: 160 kWh × 2.05 = 328 base → total SAR 328
--
-- Flat 102 kept as "unpaid" (Scenario 12/13 demo)
-- Flat 201 has previous_balance to demonstrate Scenario 4

INSERT INTO flat_bills (
  id, billing_cycle_id, flat_id, tenancy_id,
  version, is_current_version,
  meter_id, opening_reading, closing_reading,
  units_consumed, share_percent, billed_units,
  rate_per_unit, fixed_charge, tariff_rate_id,
  current_charges, previous_balance, total_due, amount_paid,
  status, due_date,
  calculation_log, calculated_by, calculated_at, notes
)
VALUES
  -- Flat 101: fully paid (demonstrates Scenario 13)
  ('fb111111-0000-0000-0000-000000000001',
   'bc111111-0000-0000-0000-000000000001',
   'f0f11111-0000-0000-0000-000000000001',
   'tn111111-0000-0000-0000-000000000001',
   1, true,
   'm0m11111-0000-0000-0000-000000000001', 1200.000, 1450.000,
   250.000, 100.00, 250.000,
   2.000000, 0.00, 't0t11111-0000-0000-0000-000000000001',
   500.00, 0.00, 500.00, 500.00,
   'paid', '2025-02-25',
   '{"totalBuildingCost":1100,"totalBuildingConsumption":550,"costPerUnit":2.0,"diffMethod":"proportional","explanation":"Flat 101 — 250 kWh × 2.00 = SAR 500"}',
   'b0ad1111-0000-0000-0000-000000000001', '2025-02-02 09:00:00+03', NULL),

  -- Flat 102: unpaid — demonstrates Scenario 12 (partial payment) and 13
  ('fb222222-0000-0000-0000-000000000002',
   'bc111111-0000-0000-0000-000000000001',
   'f0f22222-0000-0000-0000-000000000002',
   'tn222222-0000-0000-0000-000000000002',
   1, true,
   'm0m22222-0000-0000-0000-000000000002', 800.000, 1100.000,
   300.000, 100.00, 300.000,
   2.000000, 0.00, 't0t11111-0000-0000-0000-000000000001',
   600.00, 0.00, 600.00, 0.00,
   'unpaid', '2025-02-25',
   '{"totalBuildingCost":1100,"totalBuildingConsumption":550,"costPerUnit":2.0,"diffMethod":"proportional","explanation":"Flat 102 — 300 kWh × 2.00 = SAR 600"}',
   'b0ad1111-0000-0000-0000-000000000001', '2025-02-02 09:00:00+03', NULL),

  -- Flat 201: overdue with previous balance (Scenario 4 + overdue for Scenario 11)
  -- Building B rate = 2.05; 240 kWh base = 492; + SAR 120 previous = 612
  ('fb333333-0000-0000-0000-000000000003',
   'bc222222-0000-0000-0000-000000000002',
   'f0f33333-0000-0000-0000-000000000003',
   'tn333333-0000-0000-0000-000000000003',
   1, true,
   'm0m33333-0000-0000-0000-000000000003', 500.000, 900.000,
   400.000, 60.00, 240.000,
   2.050000, 0.00, 't0t22222-0000-0000-0000-000000000002',
   492.00, 120.00, 612.00, 0.00,
   'overdue', '2025-02-10',  -- already overdue (due date in the past) → Scenario 11
   '{"totalBuildingCost":820,"totalBuildingConsumption":400,"costPerUnit":2.05,"diffMethod":"proportional","explanation":"Flat 201 — 240 kWh × 2.05 = SAR 492; prev balance SAR 120"}',
   'b0ad1111-0000-0000-0000-000000000001', '2025-02-02 09:00:00+03', 'Includes unpaid Dec 2024 balance'),

  -- Flat 202: unpaid (40% of shared meter, Scenario 3)
  ('fb444444-0000-0000-0000-000000000004',
   'bc222222-0000-0000-0000-000000000002',
   'f0f44444-0000-0000-0000-000000000004',
   'tn444444-0000-0000-0000-000000000004',
   1, true,
   'm0m33333-0000-0000-0000-000000000003', 500.000, 900.000,
   400.000, 40.00, 160.000,
   2.050000, 0.00, 't0t22222-0000-0000-0000-000000000002',
   328.00, 0.00, 328.00, 0.00,
   'unpaid', '2025-02-25',
   '{"totalBuildingCost":820,"totalBuildingConsumption":400,"costPerUnit":2.05,"diffMethod":"proportional","explanation":"Flat 202 — 160 kWh × 2.05 = SAR 328"}',
   'b0ad1111-0000-0000-0000-000000000001', '2025-02-02 09:00:00+03', NULL)
ON CONFLICT (id) DO NOTHING;

-- ─── 14. Payments (Flat 101 fully paid, Flat 102 partial) ────────────────────
-- Scenario 13: full payment for Flat 101
INSERT INTO payments (id, bill_id, amount, payment_date, payment_method, reference_no, recorded_by)
VALUES
  ('py111111-0000-0000-0000-000000000001',
   'fb111111-0000-0000-0000-000000000001',
   500.00, '2025-02-10', 'bank_transfer', 'BT-2025-00101',
   'b0ad1111-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Scenario 12: partial payment for Flat 102 (SAR 200 of SAR 600)
INSERT INTO payments (id, bill_id, amount, payment_date, payment_method, reference_no, recorded_by)
VALUES
  ('py222222-0000-0000-0000-000000000002',
   'fb222222-0000-0000-0000-000000000002',
   200.00, '2025-02-12', 'cash', NULL,
   'b0ad1111-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Update amount_paid on Flat 102 bill to reflect partial payment
UPDATE flat_bills SET amount_paid = 200.00, status = 'partial' WHERE id = 'fb222222-0000-0000-0000-000000000002';

-- ─── 15. Demo complaint (Scenario 10) ────────────────────────────────────────
INSERT INTO complaints (id, flat_id, submitted_by, type, subject, description, status)
VALUES
  ('cp111111-0000-0000-0000-000000000001',
   'f0f22222-0000-0000-0000-000000000002',
   'u0u22222-0000-0000-0000-000000000002',
   'complaint',
   'Electricity meter reading seems too high',
   'My electricity bill for January 2025 seems unusually high compared to previous months. The meter reading of 1100 appears incorrect — I was travelling for 2 weeks and the flat was empty.',
   'open')
ON CONFLICT (id) DO NOTHING;

-- ─── 16. Notification settings ───────────────────────────────────────────────
INSERT INTO notification_settings (
  admin_email, sender_name, sender_email,
  overdue_reminders_enabled, reminder_frequency_days,
  bill_issued_enabled, payment_confirmed_enabled, complaint_notify_enabled
)
SELECT
  'admin@demo.local', 'ElectroManage Demo', 'noreply@demo.local',
  true, 7,
  true, true, true
WHERE NOT EXISTS (SELECT 1 FROM notification_settings);

COMMIT;
