-- Sprint 3: Billing cycle management and meter reading collection

-- ─── Extend cycle_status enum ───────────────────────────────────────────────
-- PostgreSQL requires ADD VALUE to run outside a transaction for immediate use,
-- but the values are added here; application code always passes status explicitly.
ALTER TYPE cycle_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE cycle_status ADD VALUE IF NOT EXISTS 'readings_collected';
ALTER TYPE cycle_status ADD VALUE IF NOT EXISTS 'bills_imported';
ALTER TYPE cycle_status ADD VALUE IF NOT EXISTS 'issued';

-- ─── Extend meter_readings table ────────────────────────────────────────────
ALTER TABLE meter_readings
  ADD COLUMN IF NOT EXISTS cycle_id       UUID REFERENCES billing_cycles(id),
  ADD COLUMN IF NOT EXISTS override_reason TEXT;

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_billing_cycles_building    ON billing_cycles(building_id);
CREATE INDEX IF NOT EXISTS idx_billing_cycles_status      ON billing_cycles(status);
CREATE INDEX IF NOT EXISTS idx_billing_cycles_period      ON billing_cycles(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_meter_readings_cycle       ON meter_readings(cycle_id);
CREATE INDEX IF NOT EXISTS idx_meter_readings_period      ON meter_readings(billing_period_year, billing_period_month);
CREATE INDEX IF NOT EXISTS idx_meter_readings_meter_period ON meter_readings(meter_id, billing_period_year, billing_period_month);
