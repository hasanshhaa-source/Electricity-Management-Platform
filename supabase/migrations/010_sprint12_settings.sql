-- Sprint 12: Unified system settings table

CREATE TABLE IF NOT EXISTS system_settings (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- System
  default_currency          TEXT NOT NULL DEFAULT 'SAR',
  timezone                  TEXT NOT NULL DEFAULT 'Asia/Riyadh',
  default_language          TEXT NOT NULL DEFAULT 'en',
  -- Billing
  default_diff_method       TEXT NOT NULL DEFAULT 'proportional'
                              CHECK (default_diff_method IN ('proportional','equal','manual')),
  default_due_date_days     INT  NOT NULL DEFAULT 14
                              CHECK (default_due_date_days BETWEEN 1 AND 60),
  decimal_places            INT  NOT NULL DEFAULT 2
                              CHECK (decimal_places IN (2,4)),
  allow_manual_override     BOOLEAN NOT NULL DEFAULT TRUE,
  -- Tenant registration
  allow_self_registration   BOOLEAN NOT NULL DEFAULT TRUE,
  require_admin_approval    BOOLEAN NOT NULL DEFAULT TRUE,
  -- Payment
  allowed_payment_methods   TEXT[]  NOT NULL DEFAULT '{cash,bank_transfer,stc_pay,online,other}',
  require_payment_reference BOOLEAN NOT NULL DEFAULT FALSE,
  allow_partial_payments    BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed exactly one row
INSERT INTO system_settings (id)
SELECT uuid_generate_v4()
WHERE NOT EXISTS (SELECT 1 FROM system_settings);
