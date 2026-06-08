-- Sprint 10: Complaints & Recommendations module enhancements

-- ── New status: 'reviewed' ──────────────────────────────────────────────────
ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'reviewed';

-- ── Complaint reply notification type ──────────────────────────────────────
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'complaint_reply';

-- ── Extra columns on complaints ─────────────────────────────────────────────
ALTER TABLE complaints
  ADD COLUMN IF NOT EXISTS admin_notes TEXT,
  ADD COLUMN IF NOT EXISTS admin_reply TEXT,
  ADD COLUMN IF NOT EXISTS replied_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS replied_by  UUID REFERENCES users(id);

-- ── Indexes for admin filtering ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_complaints_status
  ON complaints (status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_complaints_flat
  ON complaints (flat_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_complaints_submitted_by
  ON complaints (submitted_by, created_at DESC)
  WHERE deleted_at IS NULL;
