-- ============================================================
-- Migration 007: Sprint 7 — Tenant Portal Enhancements
-- ============================================================

-- Extend ticket_type for maintenance requests and general "other"
ALTER TYPE ticket_type ADD VALUE IF NOT EXISTS 'maintenance_request';
ALTER TYPE ticket_type ADD VALUE IF NOT EXISTS 'other';

-- Add notification type for complaint submissions (admin notification)
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'complaint_submitted';

-- Add attachment support to complaints
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS attachment_url TEXT;

-- Index to speed up notification queries for admin users
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, created_at DESC) WHERE read_at IS NULL;

-- Index for tenant-scoped complaint queries
CREATE INDEX IF NOT EXISTS idx_complaints_submitted_by
  ON complaints(submitted_by, created_at DESC) WHERE deleted_at IS NULL;
