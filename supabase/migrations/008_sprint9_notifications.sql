-- Sprint 9: Notification engine settings & schema additions
-- complaint_submitted was added in 007 at the DB level; add it to the TS type separately.

-- ── Notification settings (singleton row) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_settings (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_email               TEXT,
  sender_name               TEXT NOT NULL DEFAULT 'ElectroManage',
  sender_email              TEXT,
  overdue_reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  reminder_frequency_days   INT    NOT NULL DEFAULT 3,
  bill_issued_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  payment_confirmed_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  complaint_notify_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed one default row so settings page always has something to read
INSERT INTO notification_settings (id)
SELECT uuid_generate_v4()
WHERE NOT EXISTS (SELECT 1 FROM notification_settings);

-- ── Indexes for notification log queries ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notifications_type_status
  ON notifications (type, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_bill_type
  ON notifications (bill_id, type, sent_at)
  WHERE bill_id IS NOT NULL;
