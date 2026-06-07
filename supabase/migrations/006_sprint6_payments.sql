-- ============================================================
-- Migration 006: Sprint 6 — Payments & Outstanding Balances
-- ============================================================

-- Add STC Pay to payment_method enum (Saudi mobile payment)
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'stc_pay';

-- Add attachment support to payments
ALTER TABLE payments ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_payments_bill_id
  ON payments(bill_id);

CREATE INDEX IF NOT EXISTS idx_payments_bill_active
  ON payments(bill_id) WHERE is_reversed = FALSE;

CREATE INDEX IF NOT EXISTS idx_flat_bills_status_due
  ON flat_bills(status, due_date) WHERE is_current_version = TRUE;

CREATE INDEX IF NOT EXISTS idx_flat_bills_flat_current
  ON flat_bills(flat_id) WHERE is_current_version = TRUE;
