-- ============================================================
-- Migration 002: Sprint 2 — Add national_id to users,
-- notes to flats, add inactive to flat_status,
-- enforce allocation constraint on flat_meter_assignments
-- ============================================================

-- Extend flat_status to include 'inactive'
ALTER TYPE flat_status ADD VALUE IF NOT EXISTS 'inactive';

-- Add national_id to users (optional identifier)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS national_id TEXT;

-- Add notes column to flats
ALTER TABLE flats
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- ─── CONSTRAINT: shared meter allocations must sum to 100 ───
-- This is enforced at the service layer (application-level) because
-- PostgreSQL cannot natively constraint a SUM across rows in a CHECK.
-- We create a function + trigger instead.

CREATE OR REPLACE FUNCTION validate_meter_allocation_sum()
RETURNS TRIGGER AS $$
DECLARE
  total NUMERIC;
BEGIN
  -- Only validate for shared meters
  IF NOT EXISTS (
    SELECT 1 FROM meters WHERE id = NEW.meter_id AND meter_type = 'shared'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(share_percent), 0)
  INTO total
  FROM flat_meter_assignments
  WHERE meter_id = NEW.meter_id
    AND effective_to IS NULL
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID);

  total := total + NEW.share_percent;

  IF total > 100.01 THEN  -- small epsilon for float rounding
    RAISE EXCEPTION 'Shared meter allocation total would be %.2f%% — must not exceed 100%%', total;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_meter_allocation ON flat_meter_assignments;
CREATE TRIGGER trg_validate_meter_allocation
  BEFORE INSERT OR UPDATE ON flat_meter_assignments
  FOR EACH ROW EXECUTE FUNCTION validate_meter_allocation_sum();

-- Index for faster meter allocation queries
CREATE INDEX IF NOT EXISTS idx_fma_meter_active
  ON flat_meter_assignments (meter_id)
  WHERE effective_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_fma_flat
  ON flat_meter_assignments (flat_id);

-- Index for tenant lookups
CREATE INDEX IF NOT EXISTS idx_tenancies_user
  ON tenancies (user_id, status);

CREATE INDEX IF NOT EXISTS idx_tenancies_flat
  ON tenancies (flat_id, status);

-- Index for meters by building
CREATE INDEX IF NOT EXISTS idx_meters_building
  ON meters (building_id)
  WHERE deleted_at IS NULL;
