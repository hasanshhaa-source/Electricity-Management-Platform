-- Sprint 13: Security hardening, validation constraints, and audit improvements

-- ─── 1. Add manual_adjustment columns to flat_bills ─────────────────────────
ALTER TABLE flat_bills
  ADD COLUMN IF NOT EXISTS manual_adjustment_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_adjustment_note    TEXT,
  ADD COLUMN IF NOT EXISTS manual_adjustment_by      UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS manual_adjustment_at      TIMESTAMPTZ;

-- ─── 2. DB-level constraint: total_due may only be negative for adjustments ──
-- (negative manual_adjustment_amount is allowed; negative total_due requires a note)
-- We enforce this in app layer for flexibility, but add a check for billed_units.
ALTER TABLE flat_bills
  ADD CONSTRAINT chk_billed_units_non_negative
    CHECK (billed_units >= 0);

-- ─── 3. Unique constraint on meter readings ──────────────────────────────────
-- Prevent duplicate readings for the same meter in the same billing period.
-- Uses a partial unique index so editing (upsert) still works.
CREATE UNIQUE INDEX IF NOT EXISTS uq_meter_reading_period
  ON meter_readings (meter_id, billing_period_year, billing_period_month);

-- ─── 4. Unique constraint on company bill reference per building ──────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_bill_number_per_building
  ON electricity_company_bills (building_id, bill_number);

-- ─── 5. RLS for new tables added after sprint 1 ──────────────────────────────

-- system_settings: only admins can read/write
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY system_settings_admin_all ON system_settings
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin');

-- notification_settings: only admins
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_settings_admin_all ON notification_settings
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin');

-- ─── 6. Tighten flats RLS: tenants can only see available flats + their own ──
-- (drops the old overly-broad "available" policy and replaces with scoped one)
DROP POLICY IF EXISTS flats_tenant_available ON flats;
CREATE POLICY flats_tenant_scoped ON flats
  FOR SELECT TO authenticated
  USING (
    current_user_role() = 'admin'
    OR (
      current_user_role() = 'tenant' AND (
        -- own flat via active tenancy
        id IN (SELECT flat_id FROM tenant_flat_ids())
        -- OR flat is available (for registration purposes)
        OR occupancy_status = 'available'
      )
    )
  );

-- ─── 7. Ensure tenants cannot read other tenants' bills via payments join ─────
-- Existing payments_tenant_read policy already scopes to tenant_flat_ids() ✓
-- Confirm complaints tenant policy only shows own submissions ✓ (submitted_by = current_user_id())

-- ─── 8. Add service-role bypass policies for all RLS tables ──────────────────
-- The service role (used by admin client) bypasses RLS automatically in Supabase.
-- No additional policies needed for service_role.
