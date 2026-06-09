-- Sprint 13: Security hardening, validation constraints, and audit improvements

-- ─── 1. Add manual_adjustment columns to flat_bills ─────────────────────────
ALTER TABLE flat_bills
  ADD COLUMN IF NOT EXISTS manual_adjustment_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_adjustment_note    TEXT,
  ADD COLUMN IF NOT EXISTS manual_adjustment_by      UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS manual_adjustment_at      TIMESTAMPTZ;

-- ─── 2. DB-level check: billed_units must be non-negative ────────────────────
ALTER TABLE flat_bills
  DROP CONSTRAINT IF EXISTS chk_billed_units_non_negative;
ALTER TABLE flat_bills
  ADD CONSTRAINT chk_billed_units_non_negative
    CHECK (billed_units >= 0);

-- ─── 3. Unique index on meter readings (skipped if already exists) ───────────
-- Note: 001_initial_schema already defines UNIQUE(meter_id, billing_period_year,
-- billing_period_month) as a table constraint, so this index is redundant.
-- Kept here as a no-op via IF NOT EXISTS for forward safety.
CREATE UNIQUE INDEX IF NOT EXISTS uq_meter_reading_period
  ON meter_readings (meter_id, billing_period_year, billing_period_month);

-- ─── 4. Unique index on company bill number (skipped if already exists) ──────
-- Note: 004_sprint4_company_bills already defines ecb_unique_bill_number_per_building
-- on the same columns. IF NOT EXISTS prevents a duplicate error.
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_bill_number_per_building
  ON electricity_company_bills (building_id, bill_number);

-- ─── 5. RLS for new tables added after sprint 1 ──────────────────────────────

-- system_settings: only admins can read/write
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS system_settings_admin_all ON system_settings;
CREATE POLICY system_settings_admin_all ON system_settings
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin');

-- notification_settings: only admins
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notification_settings_admin_all ON notification_settings;
CREATE POLICY notification_settings_admin_all ON notification_settings
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin');

-- ─── 6. Tighten flats RLS: tenants can only see available flats + their own ──
DROP POLICY IF EXISTS flats_tenant_available ON flats;
DROP POLICY IF EXISTS flats_tenant_scoped ON flats;
CREATE POLICY flats_tenant_scoped ON flats
  FOR SELECT TO authenticated
  USING (
    current_user_role() = 'admin'
    OR (
      current_user_role() = 'tenant' AND (
        id IN (SELECT * FROM tenant_flat_ids())
        OR status = 'available'
      )
    )
  );

-- ─── 7. Ensure tenants cannot read other tenants' bills via payments join ─────
-- Existing payments_tenant_read policy already scopes to tenant_flat_ids() ✓
-- Existing complaints policy only shows own submissions ✓

-- ─── 8. Service-role bypass ──────────────────────────────────────────────────
-- The service role bypasses RLS automatically in Supabase.
-- No additional policies needed.
