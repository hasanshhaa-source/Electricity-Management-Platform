-- Sprint 5: Billing calculation engine additions

-- Add difference_adjustment column to flat_bills for the difference distribution amount
ALTER TABLE flat_bills
  ADD COLUMN IF NOT EXISTS difference_adjustment NUMERIC(10,4) NOT NULL DEFAULT 0;

-- Extend bill_status enum with overdue and cancelled values
ALTER TYPE bill_status ADD VALUE IF NOT EXISTS 'overdue';
ALTER TYPE bill_status ADD VALUE IF NOT EXISTS 'cancelled';

-- Index for querying current bills by cycle efficiently
CREATE INDEX IF NOT EXISTS idx_flat_bills_cycle_current
  ON flat_bills(billing_cycle_id)
  WHERE is_current_version = TRUE;

-- Index for tenant bill lookup
CREATE INDEX IF NOT EXISTS idx_flat_bills_tenancy
  ON flat_bills(tenancy_id)
  WHERE is_current_version = TRUE;
