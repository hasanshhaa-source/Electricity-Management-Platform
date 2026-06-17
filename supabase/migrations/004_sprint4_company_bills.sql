-- Sprint 4: Electricity company bill input
-- The existing table has a unique constraint that only allows one bill per building/month.
-- Drop it — multiple bills per building/month are now allowed.
-- Add unique constraint on (building_id, bill_number) instead (no duplicate reference per building).
-- Add missing columns: electricity_account_number, bill_issue_date, cycle_id.

ALTER TABLE electricity_company_bills
  ADD COLUMN IF NOT EXISTS cycle_id                  UUID REFERENCES billing_cycles(id),
  ADD COLUMN IF NOT EXISTS electricity_account_number TEXT,
  ADD COLUMN IF NOT EXISTS bill_issue_date            DATE;

-- Drop the old per-period unique constraint (allows multiple bills per building/month)
-- NOTE: Postgres truncates auto-generated constraint names to 63 chars, and the
-- actual stored name is "...period_mo_key" (not "...period_month_key") — drop both
-- spellings so this works regardless of which truncation Postgres produced.
ALTER TABLE electricity_company_bills
  DROP CONSTRAINT IF EXISTS electricity_company_bills_building_id_period_year_period_month_key;
ALTER TABLE electricity_company_bills
  DROP CONSTRAINT IF EXISTS electricity_company_bills_building_id_period_year_period_mo_key;

-- Unique bill reference per building
ALTER TABLE electricity_company_bills
  DROP CONSTRAINT IF EXISTS ecb_unique_bill_number_per_building;

ALTER TABLE electricity_company_bills
  ADD CONSTRAINT ecb_unique_bill_number_per_building
  UNIQUE (building_id, bill_number);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_ecb_building_period
  ON electricity_company_bills(building_id, period_year, period_month);

CREATE INDEX IF NOT EXISTS idx_ecb_cycle
  ON electricity_company_bills(cycle_id);
